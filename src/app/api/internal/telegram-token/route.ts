import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getSecretKey, SETTING_KEYS } from "@/lib/settings";

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = await getSecretKey(
    SETTING_KEYS.TELEGRAM_BOT_TOKEN,
    "TELEGRAM_BOT_TOKEN"
  );

  if (!token) {
    return NextResponse.json({ configured: false });
  }

  return NextResponse.json({ configured: true, token });
}
