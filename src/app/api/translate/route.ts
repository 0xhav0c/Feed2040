import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { translate } from "@vitalets/google-translate-api";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { translateHtmlWithAI } from "@/lib/ai/summarizer";

const MAX_CHUNK_LENGTH = 4500;

const VALID_LANGS = new Set([
  "en", "tr", "de", "fr", "es", "ru", "zh", "ja", "ko", "pt", "ar", "it",
  "nl", "pl", "sv", "da", "fi", "no", "cs", "hu", "ro", "bg", "el", "hr",
  "sk", "sl", "uk", "vi", "th", "id", "ms", "hi", "bn", "ta", "te", "mr",
]);

function splitHTML(html: string): string[] {
  if (html.length <= MAX_CHUNK_LENGTH) return [html];

  const chunks: string[] = [];
  let remaining = html;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_CHUNK_LENGTH) {
      chunks.push(remaining);
      break;
    }

    let splitAt = remaining.lastIndexOf("</p>", MAX_CHUNK_LENGTH);
    if (splitAt < MAX_CHUNK_LENGTH * 0.3) {
      splitAt = remaining.lastIndexOf("<br", MAX_CHUNK_LENGTH);
    }
    if (splitAt < MAX_CHUNK_LENGTH * 0.3) {
      splitAt = remaining.lastIndexOf(". ", MAX_CHUNK_LENGTH);
    }
    if (splitAt < MAX_CHUNK_LENGTH * 0.3) {
      splitAt = MAX_CHUNK_LENGTH;
    }

    const closeTag = remaining.indexOf(">", splitAt);
    if (closeTag !== -1 && closeTag - splitAt < 20) {
      splitAt = closeTag + 1;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }

  return chunks;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(`translate:${session.user.id}`, 30, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429, headers: rateLimitHeaders(rl, 30) }
    );
  }

  try {
    const body = await req.json();
    const { html, targetLang } = body as { html?: string; targetLang?: string };

    if (!html || !targetLang) {
      return NextResponse.json(
        { error: "Missing html or targetLang" },
        { status: 400 }
      );
    }

    if (!VALID_LANGS.has(targetLang)) {
      return NextResponse.json(
        { error: "Invalid target language" },
        { status: 400 }
      );
    }

    if (html.length > 100000) {
      return NextResponse.json(
        { error: "Content too large to translate" },
        { status: 413 }
      );
    }

    const userId = session.user.id;
    const chunks = splitHTML(html);
    const out: (string | null)[] = chunks.map(() => null);

    // 1) Google's HTML endpoint, then 2) the translate-api library (a
    //    different endpoint with its own limits). Both rate-limit per server
    //    IP (HTTP 429); once one does, stop calling it for this request.
    let htmlBlocked = false;
    let libBlocked = false;
    for (let i = 0; i < chunks.length; i++) {
      if (!htmlBlocked) {
        try {
          out[i] = await googleHtml(chunks[i], targetLang);
          continue;
        } catch (err) {
          if (isRateLimited(err)) htmlBlocked = true;
        }
      }
      if (!libBlocked) {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            out[i] = (await translate(chunks[i], { to: targetLang })).text;
            break;
          } catch (err) {
            if (isRateLimited(err)) {
              libBlocked = true;
              break;
            }
            if (attempt === 0) await new Promise((r) => setTimeout(r, 300));
          }
        }
      }
    }
    const googleBlocked = htmlBlocked && libBlocked;

    // 3) Whatever Google couldn't do goes to the user's AI model, if any.
    const missing = out.flatMap((v, i) => (v === null ? [i] : []));
    let usedAI = false;
    if (missing.length > 0) {
      const queue = [...missing];
      const worker = async () => {
        for (let i = queue.shift(); i !== undefined; i = queue.shift()) {
          try {
            const t = await translateHtmlWithAI(chunks[i], targetLang, userId);
            if (t) {
              out[i] = t;
              usedAI = true;
            }
          } catch (err) {
            console.error("[Translate] AI fallback failed:", err instanceof Error ? err.message : err);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, missing.length) }, worker));
    }

    const failed = out.filter((v) => v === null).length;
    if (failed === chunks.length) {
      return NextResponse.json(
        {
          error: googleBlocked
            ? "Google Translate is rate-limiting this server and no AI provider could translate it. Try again later or set up AI in Settings."
            : "Translation failed. Try again later.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      data: {
        // Untranslated chunks keep their original text.
        translatedHtml: out.map((v, i) => v ?? chunks[i]).join(""),
        engine: usedAI ? (out.length - missing.length > 0 ? "mixed" : "ai") : "google",
        partial: failed > 0,
      },
    });
  } catch (error) {
    console.error("Translation error:", error);
    return NextResponse.json(
      { error: "Translation failed" },
      { status: 500 }
    );
  }
}

function isRateLimited(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; statusCode?: number };
  return e.name === "TooManyRequestsError" || e.statusCode === 429;
}

/** Google's web-translation endpoint; translates text and keeps the HTML markup. */
async function googleHtml(html: string, to: string): Promise<string> {
  const res = await fetch(
    `https://translate.googleapis.com/translate_a/t?client=gtx&sl=auto&tl=${encodeURIComponent(to)}&format=html`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({ q: html }),
      signal: AbortSignal.timeout(20_000),
    }
  );
  if (!res.ok) throw Object.assign(new Error(`Google HTTP ${res.status}`), { statusCode: res.status });
  const data: unknown = await res.json();
  // Shape: [[translated, detectedLang]] (or [translated] when sl is fixed)
  const first = Array.isArray(data) ? data[0] : null;
  const text = Array.isArray(first) ? first[0] : first;
  if (typeof text !== "string" || !text) throw new Error("Unexpected Google response");
  return text;
}
