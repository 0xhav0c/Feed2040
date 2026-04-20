import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { feverApiKey: true, username: true },
    });

    const key = user?.feverApiKey || null;
    return NextResponse.json({
      data: {
        enabled: !!key,
        apiKeyMasked: key ? `${key.slice(0, 4)}${"•".repeat(28)}` : null,
        username: user?.username || "",
      },
    });
  } catch (error) {
    console.error("Failed to get Fever settings:", error);
    return NextResponse.json({ error: "Failed to get settings" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action, password } = body as { action?: string; password?: string };

    if (action === "generate") {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { username: true },
      });
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      if (!password) {
        return NextResponse.json({ error: "Password required" }, { status: 400 });
      }

      const apiKey = crypto
        .createHash("md5")
        .update(`${user.username}:${password}`)
        .digest("hex");

      await prisma.user.update({
        where: { id: session.user.id },
        data: { feverApiKey: apiKey },
      });

      return NextResponse.json({ data: { apiKey, enabled: true } });
    }

    if (action === "disable") {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { feverApiKey: null },
      });

      return NextResponse.json({ data: { enabled: false, apiKey: null } });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Failed to update Fever settings:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
