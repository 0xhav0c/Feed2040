import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin";

export async function GET(): Promise<NextResponse> {
  const { error, status } = await requireAdmin();
  if (error) return NextResponse.json({ error }, { status });

  try {
    const reg = await prisma.appSettings.findUnique({
      where: { key: "registrationEnabled" },
    });

    return NextResponse.json({
      data: {
        registrationEnabled: reg?.value !== "false",
      },
    });
  } catch (err) {
    console.error("Admin get settings error:", err);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const { error, status } = await requireAdmin();
  if (error) return NextResponse.json({ error }, { status });

  try {
    const body = await req.json();

    if (typeof body.registrationEnabled === "boolean") {
      await prisma.appSettings.upsert({
        where: { key: "registrationEnabled" },
        create: { key: "registrationEnabled", value: String(body.registrationEnabled) },
        update: { value: String(body.registrationEnabled) },
      });
    }

    return NextResponse.json({ data: { success: true } });
  } catch (err) {
    console.error("Admin update settings error:", err);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
