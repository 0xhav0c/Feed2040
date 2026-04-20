import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "node:crypto";

const TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const token = randomBytes(24).toString("hex");
    const key = `telegram:connect:${token}`;
    const value = JSON.stringify({
      userId: session.user.id,
      expiresAt: Date.now() + TOKEN_EXPIRY_MS,
    });

    await prisma.appSettings.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });

    return NextResponse.json({
      data: { token, expiresIn: TOKEN_EXPIRY_MS / 1000 },
    });
  } catch (error) {
    console.error("Create connect token error:", error);
    return NextResponse.json(
      { error: "Failed to create connect token" },
      { status: 500 }
    );
  }
}
