import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const digest = await prisma.digest.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!digest) {
    return NextResponse.json({ error: "Digest not found" }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      id: digest.id,
      date: digest.date,
      hours: digest.hours,
      source: digest.source,
      structured: digest.structured,
      createdAt: digest.createdAt,
    },
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const digest = await prisma.digest.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!digest) {
    return NextResponse.json({ error: "Digest not found" }, { status: 404 });
  }

  await prisma.digest.delete({ where: { id } });

  return NextResponse.json({ data: { deleted: true } });
}
