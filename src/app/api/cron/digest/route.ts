import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildAndSendDigest } from "@/lib/telegram/digest-builder";
import { verifyCronAuth } from "@/lib/cron-auth";
import { latestDueSlot, recordFailedAttempt, shouldAttempt } from "@/lib/schedule";
import { resolveTimezone } from "@/lib/timezone";

const inProgressUsers = new Set<string>();

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
      if (inProgressUsers.has(ts.userId)) continue;

      const tz = resolveTimezone(ts.timezone);
      const due = latestDueSlot(ts.scheduleTimes, tz, now);
      // lastDigestSentDate holds the last delivered slot ("YYYY-MM-DD HH:MM"),
      // so every configured time fires once per day, late runs catch up once,
      // and the 60s cron ticks never double-send.
      if (!due || ts.lastDigestSentDate === due.key) continue;

      const attemptKey = `tg:${ts.userId}:${due.key}`;
      if (!shouldAttempt(attemptKey)) continue;

      inProgressUsers.add(ts.userId);
      try {
        // Claim the slot before the (slow, multi-message) send so an
        // overlapping tick can't start a second delivery.
        await prisma.telegramSettings.update({
          where: { id: ts.id },
          data: { lastDigestSentDate: due.key },
        });

        const result = await buildAndSendDigest({
          userId: ts.userId,
          chatId: ts.chatId,
          language: ts.user.aiSettings?.language || "en",
        });

        if (result === "sent") {
          sent++;
        } else {
          failed++;
          recordFailedAttempt(attemptKey, result === "no-articles");
          // Release the claim so the spaced retry can deliver it.
          if (result !== "no-articles") {
            await prisma.telegramSettings.update({
              where: { id: ts.id },
              data: { lastDigestSentDate: ts.lastDigestSentDate },
            });
          }
        }
      } catch (err) {
        failed++;
        recordFailedAttempt(attemptKey);
        console.error(`[Cron] Telegram digest failed for user ${ts.userId}:`, err);
      } finally {
        inProgressUsers.delete(ts.userId);
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
