import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  keywords: z.array(z.string().min(1).max(100)).min(1).max(20),
  notifyTelegram: z.boolean().optional(),
});

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rules = await prisma.notificationRule.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ data: rules });
  } catch (error) {
    console.error("Failed to fetch notification rules:", error);
    return NextResponse.json({ error: "Failed to fetch rules" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = createSchema.parse(body);

    const count = await prisma.notificationRule.count({ where: { userId: session.user.id } });
    if (count >= 50) {
      return NextResponse.json({ error: "Maximum 50 rules allowed" }, { status: 400 });
    }

    const rule = await prisma.notificationRule.create({
      data: {
        userId: session.user.id,
        name: parsed.name,
        keywords: parsed.keywords,
        notifyTelegram: parsed.notifyTelegram ?? true,
      },
    });

    return NextResponse.json({ data: rule }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error("Failed to create notification rule:", error);
    return NextResponse.json({ error: "Failed to create rule" }, { status: 500 });
  }
}
