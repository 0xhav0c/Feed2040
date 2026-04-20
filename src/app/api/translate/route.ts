import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { translate } from "@vitalets/google-translate-api";

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

    const chunks = splitHTML(html);
    const translatedChunks: string[] = [];

    for (const chunk of chunks) {
      const result = await translate(chunk, { to: targetLang });
      translatedChunks.push(result.text);
    }

    return NextResponse.json({
      data: { translatedHtml: translatedChunks.join("") },
    });
  } catch (error) {
    console.error("Translation error:", error);
    return NextResponse.json(
      { error: "Translation failed" },
      { status: 500 }
    );
  }
}
