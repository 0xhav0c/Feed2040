import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronAuth } from "@/lib/cron-auth";
import { generateAndStoreDigest } from "@/lib/ai/digest-service";
import { latestDueSlot, recordFailedAttempt, shouldAttempt } from "@/lib/schedule";
import { resolveTimezone } from "@/lib/timezone";

const inProgressUsers = new Set<string>();

// Older builds fired up to two minutes before the slot; treat a digest created
// that close to the slot as belonging to it.
const SLOT_EARLY_MARGIN_MS = 10 * 60_000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const users = await prisma.aISettings.findMany({
      where: { briefingEnabled: true },
    });

    const now = new Date();
    let generated = 0;
    let skipped = 0;

    for (const settings of users) {
      if (!settings.briefingTimes?.length) continue;
      if (inProgressUsers.has(settings.userId)) {
        skipped++;
        continue;
      }

      const tz = resolveTimezone(settings.briefingTimezone);
      const due = latestDueSlot(settings.briefingTimes, tz, now);
      if (!due) continue;

      const attemptKey = `${settings.userId}:${due.key}`;
      if (!shouldAttempt(attemptKey)) continue;

      inProgressUsers.add(settings.userId);
      try {
        // Each slot produces one scheduled digest; anything created since the
        // slot came due means this slot is already done.
        const existing = await prisma.digest.count({
          where: {
            userId: settings.userId,
            source: "scheduled",
            createdAt: { gte: new Date(due.at.getTime() - SLOT_EARLY_MARGIN_MS) },
          },
        });
        if (existing > 0) {
          skipped++;
          continue;
        }

        const catchUp = now.getTime() - due.at.getTime() > 5 * 60_000;
        console.log(
          `[WebDigest] Generating for user ${settings.userId} (slot ${due.slot} ${tz}${catchUp ? ", catch-up" : ""})`
        );

        const result = await generateAndStoreDigest({
          userId: settings.userId,
          hours: settings.briefingHours || 24,
          source: "scheduled",
          categoryIds: settings.briefingCategories?.length ? settings.briefingCategories : undefined,
          language: settings.language || "en",
        });

        if (!result.ok) {
          // Nothing to summarise won't change by retrying; AI failures get a
          // few spaced retries instead of one per minute all day.
          recordFailedAttempt(attemptKey, result.reason === "no-articles");
          console.warn(`[WebDigest] Slot ${due.key} for user ${settings.userId} skipped: ${result.reason}`);
          skipped++;
          continue;
        }

        console.log(
          `[WebDigest] Generated for user ${settings.userId}: ${result.structured[0]?.items?.length || 0} items`
        );
        generated++;
      } catch (err) {
        recordFailedAttempt(attemptKey);
        console.error(`[WebDigest] Failed for user ${settings.userId}:`, err);
      } finally {
        inProgressUsers.delete(settings.userId);
      }
    }

    return NextResponse.json({
      data: { generated, skipped, total: users.length },
    });
  } catch (error) {
    console.error("Cron web-digest error:", error);
    return NextResponse.json(
      { error: "Failed to run web-digest cron" },
      { status: 500 }
    );
  }
}
