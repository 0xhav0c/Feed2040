import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";

export async function GET() {
  let dbOk = false;
  let redisOk = false;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    /* db unreachable */
  }

  try {
    const redis = getRedis();
    if (redis) {
      await redis.ping();
      redisOk = true;
    } else {
      // Redis is not configured; treat as healthy (optional dependency)
      redisOk = true;
    }
  } catch {
    /* redis unreachable */
  }

  const healthy = dbOk && redisOk;

  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", db: dbOk, redis: redisOk },
    { status: healthy ? 200 : 503 },
  );
}
