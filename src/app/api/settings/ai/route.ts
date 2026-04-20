import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveSecretKey, getUserOllamaUrl, setUserOllamaUrl, getAppSetting } from "@/lib/settings";
import { z } from "zod";

const aiSettingsSchema = z.object({
  provider: z.enum(["openai", "anthropic", "ollama"]).optional(),
  model: z.string().min(1).optional(),
  digestModel: z.string().min(1).optional(),
  autoSummarize: z.boolean().optional(),
  language: z.string().min(2).optional(),
  ollamaBaseUrl: z.string().url().optional(),
  briefingEnabled: z.boolean().optional(),
  briefingTimes: z.array(z.string()).optional(),
  briefingTimezone: z.string().optional(),
  briefingHours: z.number().min(1).max(168).optional(),
  briefingCategories: z.array(z.string()).optional(),
});

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const aiSettings = await prisma.aISettings.findUnique({
      where: { userId: session.user.id },
    });

    const userId = session.user.id;
    const openaiKey = await resolveSecretKey(userId, "openaiApiKey", "OPENAI_API_KEY");
    const anthropicKey = await resolveSecretKey(userId, "anthropicApiKey", "ANTHROPIC_API_KEY");
    const ollamaBaseUrl = await getUserOllamaUrl(userId) || await getAppSetting("ollama_base_url");

    if (!aiSettings) {
      return NextResponse.json({
        data: {
          provider: "openai",
          model: "gpt-4o-mini",
          digestModel: "gpt-4o",
          autoSummarize: false,
          language: "en",
          openaiKeyConfigured: !!openaiKey,
          anthropicKeyConfigured: !!anthropicKey,
          ollamaBaseUrl: ollamaBaseUrl || "http://localhost:11434/v1",
          briefingEnabled: false,
          briefingTimes: [],
          briefingTimezone: "Europe/Istanbul",
          briefingHours: 24,
          briefingCategories: [],
        },
      });
    }

    return NextResponse.json({
      data: {
        provider: aiSettings.provider,
        model: aiSettings.model,
        digestModel: aiSettings.digestModel,
        autoSummarize: aiSettings.autoSummarize,
        language: aiSettings.language,
        openaiKeyConfigured: !!openaiKey,
        anthropicKeyConfigured: !!anthropicKey,
        ollamaBaseUrl: ollamaBaseUrl || "http://localhost:11434/v1",
        briefingEnabled: aiSettings.briefingEnabled,
        briefingTimes: aiSettings.briefingTimes,
        briefingTimezone: aiSettings.briefingTimezone,
        briefingHours: aiSettings.briefingHours,
        briefingCategories: aiSettings.briefingCategories,
      },
    });
  } catch (error) {
    console.error("Get AI settings error:", error);
    return NextResponse.json(
      { error: "Failed to fetch AI settings" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const data = aiSettingsSchema.parse(body);

    if (data.ollamaBaseUrl) {
      await setUserOllamaUrl(session.user.id, data.ollamaBaseUrl);
    }

    const aiSettings = await prisma.aISettings.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        provider: data.provider ?? "openai",
        model: data.model ?? "gpt-4o-mini",
        digestModel: data.digestModel ?? "gpt-4o",
        autoSummarize: data.autoSummarize ?? false,
        language: data.language ?? "en",
        briefingEnabled: data.briefingEnabled ?? false,
        briefingTimes: data.briefingTimes ?? [],
        briefingTimezone: data.briefingTimezone ?? "Europe/Istanbul",
        briefingHours: data.briefingHours ?? 24,
        briefingCategories: data.briefingCategories ?? [],
      },
      update: {
        ...(data.provider !== undefined && { provider: data.provider }),
        ...(data.model !== undefined && { model: data.model }),
        ...(data.digestModel !== undefined && { digestModel: data.digestModel }),
        ...(data.autoSummarize !== undefined && {
          autoSummarize: data.autoSummarize,
        }),
        ...(data.language !== undefined && { language: data.language }),
        ...(data.briefingEnabled !== undefined && { briefingEnabled: data.briefingEnabled }),
        ...(data.briefingTimes !== undefined && { briefingTimes: data.briefingTimes }),
        ...(data.briefingTimezone !== undefined && { briefingTimezone: data.briefingTimezone }),
        ...(data.briefingHours !== undefined && { briefingHours: data.briefingHours }),
        ...(data.briefingCategories !== undefined && { briefingCategories: data.briefingCategories }),
      },
      select: {
        provider: true,
        model: true,
        digestModel: true,
        autoSummarize: true,
        language: true,
        briefingEnabled: true,
        briefingTimes: true,
        briefingTimezone: true,
        briefingHours: true,
        briefingCategories: true,
      },
    });

    return NextResponse.json({ data: aiSettings });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      );
    }
    console.error("Update AI settings error:", error);
    return NextResponse.json(
      { error: "Failed to update AI settings" },
      { status: 500 }
    );
  }
}
