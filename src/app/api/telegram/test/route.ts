import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendMessage } from "@/lib/telegram/bot";

export async function POST(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const telegramSettings = await prisma.telegramSettings.findUnique({
      where: { userId: session.user.id },
    });

    if (!telegramSettings) {
      return NextResponse.json(
        { error: "Telegram not connected. Use /start in the bot first." },
        { status: 400 }
      );
    }

    const ok = await sendMessage(
      telegramSettings.chatId,
      "✅ Feed2040 test message — your Telegram bot is connected!",
      undefined,
      session.user.id
    );

    if (!ok) {
      return NextResponse.json(
        { error: "Failed to send test message. Check bot configuration." },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: { sent: true } });
  } catch (error) {
    console.error("Telegram test error:", error);
    return NextResponse.json(
      { error: "Failed to send test message" },
      { status: 500 }
    );
  }
}
