import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getUserApiKey,
  setUserApiKey,
  deleteUserApiKey,
  getAppSetting,
  settingKeyToColumn,
  SETTING_KEYS,
} from "@/lib/settings";

function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "..." + key.slice(-4);
}

function resolveKeyInfo(
  userKey: string | null,
  globalKey: string | null,
  envKey: string | undefined
): { configured: boolean; source: string | null; masked: string | null } {
  if (userKey) return { configured: true, source: "user", masked: maskKey(userKey) };
  if (globalKey) return { configured: true, source: "instance", masked: maskKey(globalKey) };
  if (envKey) return { configured: true, source: "env", masked: maskKey(envKey) };
  return { configured: false, source: null, masked: null };
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userId = session.user.id;

    const [userOpenai, userAnthropic, userTelegram] = await Promise.all([
      getUserApiKey(userId, "openaiApiKey"),
      getUserApiKey(userId, "anthropicApiKey"),
      getUserApiKey(userId, "telegramBotToken"),
    ]);

    const [globalOpenai, globalAnthropic, globalTelegram] = await Promise.all([
      getAppSetting(SETTING_KEYS.OPENAI_API_KEY),
      getAppSetting(SETTING_KEYS.ANTHROPIC_API_KEY),
      getAppSetting(SETTING_KEYS.TELEGRAM_BOT_TOKEN),
    ]);

    return NextResponse.json({
      data: {
        openai: resolveKeyInfo(userOpenai, globalOpenai, process.env.OPENAI_API_KEY),
        anthropic: resolveKeyInfo(userAnthropic, globalAnthropic, process.env.ANTHROPIC_API_KEY),
        telegram: resolveKeyInfo(userTelegram, globalTelegram, process.env.TELEGRAM_BOT_TOKEN),
      },
    });
  } catch (error) {
    console.error("Get keys error:", error);
    return NextResponse.json({ error: "Failed to fetch keys" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let key: string;
    let value: string;
    try {
      const body = await req.json();
      key = body.key;
      value = body.value;
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const column = settingKeyToColumn(key);
    if (!column) {
      return NextResponse.json({ error: "Invalid key" }, { status: 400 });
    }

    if (!value || typeof value !== "string" || value.trim().length === 0) {
      return NextResponse.json({ error: "Value is required" }, { status: 400 });
    }
    if (value.trim().length > 500) {
      return NextResponse.json({ error: "Key value too long" }, { status: 400 });
    }

    await setUserApiKey(session.user.id, column, value.trim());

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("Save key error:", error);
    return NextResponse.json({ error: "Failed to save key" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let key: string;
    try {
      const body = await req.json();
      key = body.key;
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const column = settingKeyToColumn(key);
    if (!column) {
      return NextResponse.json({ error: "Invalid key" }, { status: 400 });
    }

    await deleteUserApiKey(session.user.id, column);

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error("Delete key error:", error);
    return NextResponse.json({ error: "Failed to delete key" }, { status: 500 });
  }
}
