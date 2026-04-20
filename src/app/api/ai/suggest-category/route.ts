import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { suggestCategories } from "@/lib/ai/summarizer";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { feedTitle, feedDescription } = body;

    if (!feedTitle || typeof feedTitle !== "string") {
      return NextResponse.json(
        { error: "feedTitle is required" },
        { status: 400 }
      );
    }

    const categories = await prisma.category.findMany({
      where: { userId: session.user.id },
      select: { name: true },
    });
    const existingCategories = categories.map((c: { name: string }) => c.name);

    const suggestions = await suggestCategories(
      feedTitle,
      typeof feedDescription === "string" ? feedDescription : "",
      existingCategories,
      session.user.id
    );

    return NextResponse.json({ data: { suggestions } });
  } catch (error) {
    console.error("Suggest category error:", error);
    return NextResponse.json(
      { error: "Failed to suggest categories" },
      { status: 500 }
    );
  }
}
