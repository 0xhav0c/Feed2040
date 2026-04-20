import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const telegramSettingsSchema = z.object({
  isActive: z.boolean().optional(),
  scheduleTimes: z.array(z.string()).optional(),
  timezone: z.string().optional(),
  summaryCategories: z.array(z.string()).optional(),
});

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const telegramSettings = await prisma.telegramSettings.findUnique({
      where: { userId: session.user.id },
    });

    if (!telegramSettings) {
      return NextResponse.json({
        data: null,
      });
    }

    return NextResponse.json({
      data: {
        isActive: telegramSettings.isActive,
        scheduleTimes: telegramSettings.scheduleTimes,
        timezone: telegramSettings.timezone,
        summaryCategories: telegramSettings.summaryCategories,
      },
    });
  } catch (error) {
    console.error("Get Telegram settings error:", error);
    return NextResponse.json(
      { error: "Failed to fetch Telegram settings" },
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
    const data = telegramSettingsSchema.parse(body);

    const existing = await prisma.telegramSettings.findUnique({
      where: { userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Telegram not connected. Use /start in the bot first." },
        { status: 400 }
      );
    }

    const telegramSettings = await prisma.telegramSettings.update({
      where: { userId: session.user.id },
      data: {
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.scheduleTimes !== undefined && {
          scheduleTimes: data.scheduleTimes,
        }),
        ...(data.timezone !== undefined && { timezone: data.timezone }),
        ...(data.summaryCategories !== undefined && {
          summaryCategories: data.summaryCategories,
        }),
      },
      select: {
        isActive: true,
        scheduleTimes: true,
        timezone: true,
        summaryCategories: true,
      },
    });

    return NextResponse.json({ data: telegramSettings });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      );
    }
    console.error("Update Telegram settings error:", error);
    return NextResponse.json(
      { error: "Failed to update Telegram settings" },
      { status: 500 }
    );
  }
}
