import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveSecretKey } from "@/lib/settings";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { validateApiBaseUrl } from "@/lib/utils/url-validator";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(`ai:models:${session.user.id}`, 10, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded." },
      { status: 429, headers: rateLimitHeaders(rl, 10) }
    );
  }

  try {
    const { baseUrl } = await req.json();
    if (!baseUrl || typeof baseUrl !== "string") {
      return NextResponse.json({ error: "baseUrl is required" }, { status: 400 });
    }

    const validation = validateApiBaseUrl(baseUrl);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const apiKey = await resolveSecretKey(session.user.id, "openaiApiKey", "OPENAI_API_KEY");

    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const modelsUrl = `${baseUrl.replace(/\/+$/, "")}/models`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(modelsUrl, { headers, signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        return NextResponse.json(
          { error: `API returned HTTP ${res.status}` },
          { status: 502 }
        );
      }

      const data = await res.json();
      const models = extractModelIds(data);

      return NextResponse.json({ data: { models } });
    } catch (err) {
      clearTimeout(timeout);
      const msg = err instanceof Error ? err.message : "Connection failed";
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

function extractModelIds(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj = data as any;

  if (Array.isArray(obj.data)) {
    return obj.data
      .map((m: { id?: string }) => m.id)
      .filter((id: unknown): id is string => typeof id === "string")
      .sort();
  }

  if (Array.isArray(obj.models)) {
    return obj.models
      .map((m: unknown) => typeof m === "string" ? m : (m as { id?: string })?.id)
      .filter((id: unknown): id is string => typeof id === "string")
      .sort();
  }

  return [];
}
