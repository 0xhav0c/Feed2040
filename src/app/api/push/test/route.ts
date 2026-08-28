import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendPushToUser } from "@/lib/push";

export async function POST(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await sendPushToUser(session.user.id, {
      title: "Feed2040",
      body: "Push notifications are working 🎉",
      url: "/feeds",
    });
    return NextResponse.json({ data: { sent: true } });
  } catch (error) {
    console.error("Failed to send test push:", error);
    return NextResponse.json({ error: "Failed to send test notification" }, { status: 500 });
  }
}
