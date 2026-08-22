import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildAndSendDigest } from "@/lib/telegram/digest-builder";
import { verifyCronAuth } from "@/lib/cron-auth";

function getLocalTimeString(date: Date, timezone: string): string {
  try {
    const str = date.toLocaleString("en-CA", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return str;
  } catch {
    const h = date.getUTCHours().toString().padStart(2, "0");
    const m = date.getUTCMinutes().toString().padStart(2, "0");
    return `${h}:${m}`;
  }
}

function isWithinMinute(a: string, b: string): boolean {
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  const diff = Math.abs((ah * 60 + am) - (bh * 60 + bm));
  // Handle midnight wraparound (e.g. 23:59 vs 00:00 is 1 minute apart, not 1439)
  return diff <= 1 || diff >= 1440 - 1;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const users = await prisma.telegramSettings.findMany({
      where: { isActive: true },
      include: {
        user: { include: { aiSettings: true } },
      },
    });

    const now = new Date();
    let sent = 0;
    let failed = 0;

    for (const ts of users) {
      if (!ts.scheduleTimes?.length) continue;

      const currentTimeStr = getLocalTimeString(
        now,
        ts.timezone || "Europe/Istanbul"
      );
      const matches = ts.scheduleTimes.some((t: string) =>
        isWithinMinute(currentTimeStr, t)
      );

      if (!matches) continue;

      // Idempotency: the cron worker calls this every 60s and the match window
      // spans ~2 minutes, so a slot would otherwise fire 2-3 times. Skip if a
      // Telegram digest was already sent today for this user.
      const date = todayKey();
      if (ts.lastDigestSentDate === date) continue;

      const language = ts.user.aiSettings?.language || "en";
      const ok = await buildAndSendDigest({
        userId: ts.userId,
        chatId: ts.chatId,
        language,
      });

      if (ok) {
        sent++;
        await prisma.telegramSettings.update({
          where: { id: ts.id },
          data: { lastDigestSentDate: date },
        });
      } else {
        failed++;
      }
    }

    return NextResponse.json({
      data: { sent, failed, total: users.length },
    });
  } catch (error) {
    console.error("Cron digest error:", error);
    return NextResponse.json(
      { error: "Failed to run digest cron" },
      { status: 500 }
    );
  }
}
