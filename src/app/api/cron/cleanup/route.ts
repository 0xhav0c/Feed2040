import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getAppSetting } from "@/lib/settings";

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const retentionDaysValue = await getAppSetting("retentionDays");
    const retentionDays = retentionDaysValue ? parseInt(retentionDaysValue, 10) : 0;

    if (!retentionDays || retentionDays <= 0) {
      return NextResponse.json({
        data: { deleted: 0, message: "Retention policy disabled (set to never)" },
      });
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // Delete articles older than cutoff, excluding bookmarked ones
    const result = await prisma.article.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
        id: {
          notIn: (
            await prisma.bookmark.findMany({
              select: { articleId: true },
            })
          ).map((b) => b.articleId),
        },
      },
    });

    console.log(
      `[Cleanup] Deleted ${result.count} articles older than ${retentionDays} days (cutoff: ${cutoffDate.toISOString()})`
    );

    return NextResponse.json({
      data: { deleted: result.count },
    });
  } catch (error) {
    console.error("[Cleanup] Error:", error);
    return NextResponse.json(
      { error: "Cleanup failed" },
      { status: 500 }
    );
  }
}
