import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveSecretKey, getUserBaseUrl, setUserBaseUrl } from "@/lib/settings";
import { z } from "zod";

const aiSettingsSchema = z.object({
  model: z.string().min(1).optional(),
  digestModel: z.string().min(1).optional(),
  embeddingModel: z.string().min(1).max(100).optional(),
  autoSummarize: z.boolean().optional(),
  language: z.string().min(2).optional(),
  baseUrl: z.string().url().optional().nullable(),
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
    const userId = session.user.id;
    const aiSettings = await prisma.aISettings.findUnique({
      where: { userId },
    });

    const apiKey = await resolveSecretKey(userId, "openaiApiKey", "OPENAI_API_KEY");
    const baseUrl = await getUserBaseUrl(userId, "openaiBaseUrl");

    const defaults = {
      model: "gpt-4o-mini",
      digestModel: "gpt-4o",
      embeddingModel: "text-embedding-3-small",
      autoSummarize: false,
      language: "en",
      baseUrl: baseUrl || "",
      keyConfigured: !!apiKey,
      briefingEnabled: false,
      briefingTimes: [],
      briefingTimezone: "Europe/Istanbul",
      briefingHours: 24,
      briefingCategories: [],
    };

    if (!aiSettings) {
      return NextResponse.json({ data: defaults });
    }

    return NextResponse.json({
      data: {
        model: aiSettings.model || defaults.model,
        digestModel: aiSettings.digestModel || defaults.digestModel,
        embeddingModel: aiSettings.embeddingModel || defaults.embeddingModel,
        autoSummarize: aiSettings.autoSummarize,
        language: aiSettings.language || defaults.language,
        baseUrl: baseUrl || "",
        keyConfigured: !!apiKey,
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

    if (data.baseUrl !== undefined) {
      await setUserBaseUrl(session.user.id, "openaiBaseUrl", data.baseUrl || null);
    }

    await prisma.aISettings.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        provider: "openai",
        model: data.model ?? "gpt-4o-mini",
        digestModel: data.digestModel ?? "gpt-4o",
        embeddingModel: data.embeddingModel ?? "text-embedding-3-small",
        autoSummarize: data.autoSummarize ?? false,
        language: data.language ?? "en",
        briefingEnabled: data.briefingEnabled ?? false,
        briefingTimes: data.briefingTimes ?? [],
        briefingTimezone: data.briefingTimezone ?? "Europe/Istanbul",
        briefingHours: data.briefingHours ?? 24,
        briefingCategories: data.briefingCategories ?? [],
      },
      update: {
        ...(data.model !== undefined && { model: data.model }),
        ...(data.digestModel !== undefined && { digestModel: data.digestModel }),
        ...(data.embeddingModel !== undefined && { embeddingModel: data.embeddingModel }),
        ...(data.autoSummarize !== undefined && { autoSummarize: data.autoSummarize }),
        ...(data.language !== undefined && { language: data.language }),
        ...(data.briefingEnabled !== undefined && { briefingEnabled: data.briefingEnabled }),
        ...(data.briefingTimes !== undefined && { briefingTimes: data.briefingTimes }),
        ...(data.briefingTimezone !== undefined && { briefingTimezone: data.briefingTimezone }),
        ...(data.briefingHours !== undefined && { briefingHours: data.briefingHours }),
        ...(data.briefingCategories !== undefined && { briefingCategories: data.briefingCategories }),
      },
    });

    return NextResponse.json({ data: { success: true } });
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
