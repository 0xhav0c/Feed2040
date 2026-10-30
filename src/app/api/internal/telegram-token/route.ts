import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { getSecretKey, getUserApiKey, SETTING_KEYS } from "@/lib/settings";

// Every bot token the poller must listen on: the instance-wide one plus each
// user's own (Settings → Telegram saves per user). A bot that nobody polls
// never receives /start, so its users could never link their account.
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tokens = new Set<string>();

  const globalToken = await getSecretKey(SETTING_KEYS.TELEGRAM_BOT_TOKEN, "TELEGRAM_BOT_TOKEN");
  if (globalToken) tokens.add(globalToken);

  const rows = await prisma.userApiKeys.findMany({
    where: { telegramBotToken: { not: null } },
    select: { userId: true },
  });
  for (const { userId } of rows) {
    const token = await getUserApiKey(userId, "telegramBotToken");
    if (token) tokens.add(token);
  }

  const list = [...tokens];
  return NextResponse.json({
    configured: list.length > 0,
    tokens: list,
    // Kept for older pollers that read a single token.
    token: list[0] ?? null,
  });
}
