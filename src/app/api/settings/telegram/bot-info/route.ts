import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getBot } from "@/lib/telegram/bot";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const bot = await getBot(session.user.id);
    if (!bot) {
      return NextResponse.json({
        data: { botUsername: null, configured: false },
      });
    }

    const me = await bot.telegram.getMe();
    return NextResponse.json({
      data: {
        botUsername: me.username,
        configured: true,
        connectLink: me.username
          ? `https://t.me/${me.username}`
          : null,
      },
    });
  } catch {
    return NextResponse.json({
      data: { botUsername: null, configured: false },
    });
  }
}
