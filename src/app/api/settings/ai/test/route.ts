import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveSecretKey } from "@/lib/settings";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { validateApiBaseUrl } from "@/lib/utils/url-validator";
import OpenAI from "openai";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(`ai:test:${session.user.id}`, 10, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429, headers: rateLimitHeaders(rl, 10) }
    );
  }

  try {
    const { model, baseUrl } = await req.json();
    if (!model) {
      return NextResponse.json({ error: "model is required" }, { status: 400 });
    }

    if (baseUrl) {
      const validation = validateApiBaseUrl(baseUrl);
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
    }

    const apiKey = await resolveSecretKey(session.user.id, "openaiApiKey", "OPENAI_API_KEY");
    const effectiveKey = apiKey || "ollama";

    if (!apiKey && !baseUrl) {
      return NextResponse.json(
        { error: "No API key configured. Please add your API key first." },
        { status: 400 }
      );
    }

    const client = new OpenAI({
      apiKey: effectiveKey,
      timeout: 30_000,
      ...(baseUrl && { baseURL: baseUrl }),
    });

    const startTime = Date.now();
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "You are a helpful assistant. Respond briefly." },
        { role: "user", content: "Say hello in one sentence and confirm you are working." },
      ],
      max_tokens: 50,
    });
    const responseTime = Date.now() - startTime;
    const result = response.choices[0]?.message?.content?.trim();

    if (!result) {
      return NextResponse.json(
        { error: "Model returned empty response. Check your API key and model name." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      data: {
        success: true,
        model,
        responseTime,
        responsePreview: result.slice(0, 200),
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Test failed: ${msg}` }, { status: 502 });
  }
}
