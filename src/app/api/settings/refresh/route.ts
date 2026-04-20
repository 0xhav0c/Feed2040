import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyCronAuth } from "@/lib/cron-auth";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const isCron = verifyCronAuth(req);

  if (!isCron) {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const [intervalSetting, concurrencySetting] = await Promise.all([
      prisma.appSettings.findUnique({ where: { key: "refreshIntervalMinutes" } }),
      prisma.appSettings.findUnique({ where: { key: "importConcurrency" } }),
    ]);

    return NextResponse.json({
      data: {
        intervalMinutes: intervalSetting ? parseInt(intervalSetting.value, 10) : 15,
        importConcurrency: concurrencySetting ? parseInt(concurrencySetting.value, 10) : 5,
      },
    });
  } catch {
    return NextResponse.json({
      data: { intervalMinutes: 15, importConcurrency: 5 },
    });
  }
}

// PUT /api/settings/refresh - Update refresh interval + import concurrency
export async function PUT(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { intervalMinutes, importConcurrency } = await req.json();

    if (intervalMinutes !== undefined) {
      const val = parseInt(intervalMinutes, 10);
      if (isNaN(val) || val < 5 || val > 1440) {
        return NextResponse.json(
          { error: "Interval must be between 5 and 1440 minutes" },
          { status: 400 }
        );
      }
      await prisma.appSettings.upsert({
        where: { key: "refreshIntervalMinutes" },
        update: { value: String(val) },
        create: { key: "refreshIntervalMinutes", value: String(val) },
      });
    }

    if (importConcurrency !== undefined) {
      const val = parseInt(importConcurrency, 10);
      if (isNaN(val) || val < 1 || val > 20) {
        return NextResponse.json(
          { error: "Concurrency must be between 1 and 20" },
          { status: 400 }
        );
      }
      await prisma.appSettings.upsert({
        where: { key: "importConcurrency" },
        update: { value: String(val) },
        create: { key: "importConcurrency", value: String(val) },
      });
    }

    // Return updated values
    const [intervalSetting, concurrencySetting] = await Promise.all([
      prisma.appSettings.findUnique({ where: { key: "refreshIntervalMinutes" } }),
      prisma.appSettings.findUnique({ where: { key: "importConcurrency" } }),
    ]);

    return NextResponse.json({
      data: {
        intervalMinutes: intervalSetting ? parseInt(intervalSetting.value, 10) : 15,
        importConcurrency: concurrencySetting ? parseInt(concurrencySetting.value, 10) : 5,
      },
    });
  } catch (error) {
    console.error("Failed to update settings:", error);
    return NextResponse.json(
      { error: "Failed to update setting" },
      { status: 500 }
    );
  }
}
