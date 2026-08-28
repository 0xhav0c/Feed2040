import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getVapidPublicKey } from "@/lib/push";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const publicKey = await getVapidPublicKey();
    return NextResponse.json({ data: { publicKey } });
  } catch (error) {
    console.error("Failed to get VAPID public key:", error);
    return NextResponse.json({ error: "Failed to get public key" }, { status: 500 });
  }
}
