import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { embedTexts, articleEmbedInput, toVectorLiteral } from "@/lib/ai/embeddings";

const BATCH = 100;

// GET → { total, embedded, remaining } for the current user.
export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const rows = await prisma.$queryRawUnsafe<{ total: bigint; embedded: bigint }[]>(
      `SELECT count(*) AS total,
              count(*) FILTER (WHERE a."embedding" IS NOT NULL) AS embedded
       FROM "Article" a JOIN "Feed" f ON f."id" = a."feedId"
       WHERE f."userId" = $1`,
      session.user.id
    );
    const total = Number(rows[0]?.total ?? 0);
    const embedded = Number(rows[0]?.embedded ?? 0);
    return NextResponse.json({ data: { total, embedded, remaining: total - embedded } });
  } catch (error) {
    console.error("Embed status error:", error);
    return NextResponse.json({ error: "Failed to get status" }, { status: 500 });
  }
}

// POST → embed one batch of the user's articles that lack embeddings.
export async function POST(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const rl = await checkRateLimit(`embed-backfill:${userId}`, 20, 60);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429, headers: rateLimitHeaders(rl, 20) }
    );
  }

  try {
    const batch = await prisma.$queryRawUnsafe<
      { id: string; title: string; summary: string | null; content: string | null }[]
    >(
      `SELECT a."id", a."title", a."summary", a."content"
       FROM "Article" a JOIN "Feed" f ON f."id" = a."feedId"
       WHERE f."userId" = $1 AND a."embedding" IS NULL
       ORDER BY a."createdAt" DESC
       LIMIT ${BATCH}`,
      userId
    );

    if (batch.length === 0) {
      return NextResponse.json({ data: { embedded: 0, remaining: 0, done: true } });
    }

    const inputs = batch.map((a) => articleEmbedInput(a.title, a.summary || a.content));
    const vectors = await embedTexts(userId, inputs);

    if (!vectors) {
      return NextResponse.json(
        { error: "Embeddings are not available with your current AI provider.", available: false },
        { status: 422 }
      );
    }

    for (let i = 0; i < batch.length; i++) {
      await prisma.$executeRawUnsafe(
        `UPDATE "Article" SET "embedding" = $1::vector WHERE "id" = $2`,
        toVectorLiteral(vectors[i]),
        batch[i].id
      );
    }

    const rows = await prisma.$queryRawUnsafe<{ remaining: bigint }[]>(
      `SELECT count(*) AS remaining
       FROM "Article" a JOIN "Feed" f ON f."id" = a."feedId"
       WHERE f."userId" = $1 AND a."embedding" IS NULL`,
      userId
    );
    const remaining = Number(rows[0]?.remaining ?? 0);

    return NextResponse.json({ data: { embedded: batch.length, remaining, done: remaining === 0 } });
  } catch (error) {
    console.error("Embed backfill error:", error);
    return NextResponse.json({ error: "Backfill failed" }, { status: 500 });
  }
}
