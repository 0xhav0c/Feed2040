import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

const registerSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
  name: z.string().min(2, "Name must be at least 2 characters").optional(),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Force the initial-setup flow: the very first account must be created via
  // /setup (which makes it an admin). Otherwise a stranger could grab the first
  // non-admin account before the owner runs setup, permanently locking out
  // admin creation.
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    return NextResponse.json(
      { error: "Initial admin setup has not been completed yet." },
      { status: 403 }
    );
  }

  const regSetting = await prisma.appSettings.findUnique({
    where: { key: "registrationEnabled" },
  });
  if (regSetting?.value === "false") {
    return NextResponse.json(
      { error: "Registration is currently disabled by the administrator." },
      { status: 403 }
    );
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const rl = await checkRateLimit(`register:${ip}`, 5, 3600);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many registration attempts. Try again later." },
      { status: 429, headers: rateLimitHeaders(rl, 5) }
    );
  }

  try {
    const body = await req.json();
    const { username, name, password } = registerSchema.parse(body);

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return NextResponse.json(
        { error: "Username is already taken" },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        username,
        name: name || username,
        password: hashedPassword,
      },
      select: { id: true, username: true, name: true },
    });

    return NextResponse.json({ data: user }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      );
    }
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Registration failed" },
      { status: 500 }
    );
  }
}
