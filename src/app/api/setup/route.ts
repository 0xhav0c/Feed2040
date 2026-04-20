import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const setupSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
  name: z.string().min(2, "Name must be at least 2 characters").optional(),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export async function GET(): Promise<NextResponse> {
  try {
    const userCount = await prisma.user.count();
    return NextResponse.json({
      data: { needsSetup: userCount === 0, dbError: false },
    });
  } catch (error) {
    console.error("Setup check error:", error);
    // DB error does NOT mean setup is needed - it means DB is down
    return NextResponse.json({
      data: { needsSetup: false, dbError: true },
    });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const userCount = await prisma.user.count();

    if (userCount > 0) {
      return NextResponse.json(
        { error: "Setup already completed. An admin account already exists." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { username, name, password } = setupSchema.parse(body);

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        username,
        name: name || username,
        password: hashedPassword,
        role: "admin",
      },
      select: { id: true, username: true, name: true },
    });

    const defaultCategories = [
      { name: "Technology", slug: "technology", icon: "💻", color: "#3b82f6" },
      { name: "Science", slug: "science", icon: "🔬", color: "#10b981" },
      { name: "Business", slug: "business", icon: "📈", color: "#f59e0b" },
      { name: "Entertainment", slug: "entertainment", icon: "🎮", color: "#8b5cf6" },
      { name: "Health", slug: "health", icon: "🏥", color: "#ef4444" },
    ];

    for (const cat of defaultCategories) {
      await prisma.category.create({
        data: { ...cat, userId: user.id },
      });
    }

    return NextResponse.json(
      { data: { user, message: "Admin account created successfully" } },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0].message },
        { status: 400 }
      );
    }
    console.error("Setup error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { error: "Setup failed. Please check server logs." },
      { status: 500 }
    );
  }
}
