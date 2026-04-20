import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { validateOllamaUrl } from "@/lib/utils/url-validator";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(`ollama:test:${session.user.id}`, 10, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429, headers: rateLimitHeaders(rl, 10) }
    );
  }

  try {
    const { baseUrl } = await req.json();
    if (!baseUrl || typeof baseUrl !== "string") {
      return NextResponse.json({ error: "baseUrl required" }, { status: 400 });
    }

    const validation = validateOllamaUrl(baseUrl);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const ollamaRoot = baseUrl.replace(/\/v1\/?$/, "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(`${ollamaRoot}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return NextResponse.json(
          { error: `Ollama returned HTTP ${res.status}` },
          { status: 502 }
        );
      }

      const data = await res.json();
      const models = (data.models || []).map(
        (m: { name: string }) => m.name
      );

      return NextResponse.json({ data: { models } });
    } catch (fetchErr: unknown) {
      clearTimeout(timeout);
      const msg =
        fetchErr instanceof Error ? fetchErr.message : "Connection failed";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
