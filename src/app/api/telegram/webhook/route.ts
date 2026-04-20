import { NextRequest, NextResponse } from "next/server";
import { getBot } from "@/lib/telegram/bot";
import { prisma } from "@/lib/prisma";
import { buildAndSendDigest } from "@/lib/telegram/digest-builder";
import { verifyCronAuth } from "@/lib/cron-auth";

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    const message = body?.message;
    const chatId = message?.chat?.id;
    const text = message?.text?.trim() || "";
    const from = message?.from;
    const telegramUserId = from?.id?.toString();

    if (!chatId || !telegramUserId) {
      return NextResponse.json({ ok: true });
    }

    const resolveUserBot = async (userId: string) => {
      const bot = await getBot(userId);
      if (!bot) throw new Error("Bot not configured for user");
      return bot;
    };

    const handleStart = async () => {
      const parts = text.split(/\s+/);
      const token = parts[1];

      if (!token) {
        const settings = await prisma.telegramSettings.findFirst({
          where: { telegramUserId },
        });
        const bot = settings ? await getBot(settings.userId) : await getBot();
        if (bot) {
          await bot.telegram.sendMessage(
            chatId,
            "To connect your Feed2040 account, go to Settings → Telegram in the app and generate a connection token. Then send:\n/start YOUR_TOKEN"
          );
        }
        return;
      }

      const key = `telegram:connect:${token}`;
      const appSetting = await prisma.appSettings.findUnique({
        where: { key },
      });

      if (!appSetting) {
        const bot = await getBot();
        if (bot) {
          await bot.telegram.sendMessage(
            chatId,
            "Invalid or expired token. Please generate a new one in Settings → Telegram."
          );
        }
        return;
      }

      let payload: { userId: string; expiresAt: number };
      try {
        payload = JSON.parse(appSetting.value);
      } catch {
        const bot = await getBot();
        if (bot) {
          await bot.telegram.sendMessage(chatId, "Invalid token. Please try again.");
        }
        return;
      }

      if (Date.now() > payload.expiresAt) {
        await prisma.appSettings.delete({ where: { key } }).catch(() => {});
        const bot = await getBot(payload.userId);
        if (bot) {
          await bot.telegram.sendMessage(
            chatId,
            "Token expired. Please generate a new one in Settings → Telegram."
          );
        }
        return;
      }

      await prisma.telegramSettings.upsert({
        where: { userId: payload.userId },
        create: {
          userId: payload.userId,
          telegramUserId,
          chatId: chatId.toString(),
          isActive: true,
        },
        update: {
          telegramUserId,
          chatId: chatId.toString(),
          isActive: true,
        },
      });

      await prisma.appSettings.delete({ where: { key } }).catch(() => {});

      const bot = await resolveUserBot(payload.userId);
      await bot.telegram.sendMessage(
        chatId,
        "✓ Connected to Feed2040! You can now receive daily digests. Use /digest for an immediate digest, /stop to disconnect."
      );
    };

    const handleStop = async () => {
      const settings = await prisma.telegramSettings.findFirst({
        where: { telegramUserId },
      });

      if (!settings) {
        const bot = await getBot();
        if (bot) {
          await bot.telegram.sendMessage(
            chatId,
            "You are not connected. Use /start with a token from the app to connect."
          );
        }
        return;
      }

      await prisma.telegramSettings.update({
        where: { id: settings.id },
        data: { isActive: false },
      });

      const bot = await resolveUserBot(settings.userId);
      await bot.telegram.sendMessage(
        chatId,
        "You have been disconnected from Feed2040. Use /start with a new token to reconnect."
      );
    };

    const handleDigest = async () => {
      const settings = await prisma.telegramSettings.findFirst({
        where: { telegramUserId, isActive: true },
        include: { user: { include: { aiSettings: true } } },
      });

      if (!settings) {
        const bot = await getBot();
        if (bot) {
          await bot.telegram.sendMessage(
            chatId,
            "You are not connected. Use /start with a token from the app to connect."
          );
        }
        return;
      }

      const bot = await resolveUserBot(settings.userId);
      await bot.telegram.sendMessage(chatId, "⏳ Preparing daily briefing...");

      const language = settings.user.aiSettings?.language || "tr";
      const ok = await buildAndSendDigest({
        userId: settings.userId,
        chatId: chatId.toString(),
        language,
      });

      if (!ok) {
        await bot.telegram.sendMessage(
          chatId,
          "Briefing generation failed. Check your AI API key settings."
        );
      }
    };

    const handleHelp = async () => {
      const settings = await prisma.telegramSettings.findFirst({
        where: { telegramUserId },
      });
      const bot = settings ? await getBot(settings.userId) : await getBot();
      if (bot) {
        await bot.telegram.sendMessage(
          chatId,
          "Feed2040 Bot Commands:\n\n/start [token] - Connect your account (get token in app)\n/stop - Disconnect\n/digest - Get immediate daily digest\n/status - Check connection status\n/help - Show this message"
        );
      }
    };

    const handleStatus = async () => {
      const settings = await prisma.telegramSettings.findFirst({
        where: { telegramUserId },
      });

      if (!settings) {
        const bot = await getBot();
        if (bot) {
          await bot.telegram.sendMessage(
            chatId,
            "Status: Not connected. Use /start with a token from the app."
          );
        }
        return;
      }

      const bot = await resolveUserBot(settings.userId);
      const status = settings.isActive ? "Connected" : "Paused";
      const schedule =
        settings.scheduleTimes?.length > 0
          ? settings.scheduleTimes.join(", ")
          : "Not set";
      await bot.telegram.sendMessage(
        chatId,
        `Status: ${status}\nSchedule: ${schedule}\nTimezone: ${settings.timezone}`
      );
    };

    if (text.startsWith("/start")) {
      await handleStart();
    } else if (text === "/stop") {
      await handleStop();
    } else if (text === "/digest") {
      await handleDigest();
    } else if (text === "/help") {
      await handleHelp();
    } else if (text === "/status") {
      await handleStatus();
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
