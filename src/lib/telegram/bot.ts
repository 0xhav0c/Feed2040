import { Telegraf } from "telegraf";
import { getSecretKey, resolveSecretKey, SETTING_KEYS } from "@/lib/settings";
import type { StructuredDigestResult } from "@/lib/ai/summarizer";

const botCache = new Map<string, Telegraf>();
const MAX_BOT_CACHE = 50;

export async function getBot(userId?: string): Promise<Telegraf | null> {
  let token: string | null;

  if (userId) {
    token = await resolveSecretKey(userId, "telegramBotToken", "TELEGRAM_BOT_TOKEN");
  } else {
    token = await getSecretKey(SETTING_KEYS.TELEGRAM_BOT_TOKEN, "TELEGRAM_BOT_TOKEN");
  }

  if (!token) return null;

  const cached = botCache.get(token);
  if (cached) return cached;

  if (botCache.size >= MAX_BOT_CACHE) {
    const firstKey = botCache.keys().next().value;
    if (firstKey) botCache.delete(firstKey);
  }

  const bot = new Telegraf(token);
  botCache.set(token, bot);
  return bot;
}

export async function isBotConfigured(userId?: string): Promise<boolean> {
  let token: string | null;
  if (userId) {
    token = await resolveSecretKey(userId, "telegramBotToken", "TELEGRAM_BOT_TOKEN");
  } else {
    token = await getSecretKey(SETTING_KEYS.TELEGRAM_BOT_TOKEN, "TELEGRAM_BOT_TOKEN");
  }
  return !!token;
}

const MAX_MESSAGE_LENGTH = 4000;

export async function sendMessage(
  chatId: string,
  text: string,
  parseMode?: "Markdown" | "MarkdownV2" | "HTML",
  userId?: string
): Promise<boolean> {
  const bot = await getBot(userId);
  if (!bot) return false;

  try {
    const chunks = splitMessage(text, MAX_MESSAGE_LENGTH);
    for (const chunk of chunks) {
      await bot.telegram.sendMessage(chatId, chunk, {
        ...(parseMode && { parse_mode: parseMode }),
        link_preview_options: { is_disabled: true },
      });
    }
    return true;
  } catch (error) {
    console.error("Telegram sendMessage error:", error);
    return false;
  }
}

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf("\n\n", maxLen);
    if (splitAt < maxLen * 0.2) splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt < maxLen * 0.2) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const IMPACT_EMOJI: Record<string, string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🔵",
  info: "⚪",
};

export function formatStructuredDigest(
  results: StructuredDigestResult[],
  lang: string
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  let totalItems = 0;
  let totalArticles = 0;
  let totalFiltered = 0;

  for (const r of results) {
    totalItems += r.items.length;
    totalArticles += r.totalArticles;
    totalFiltered += r.filteredArticles || 0;
  }

  const lines: string[] = [];

  lines.push(`📋 <b>DAILY BRIEFING</b> — ${esc(dateStr)}`);
  lines.push("━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("");

  for (const section of results) {
    const icon = section.isVuln ? "🛡️" : "📌";
    lines.push(`${icon} <b>${esc(section.categoryName.toUpperCase())}</b>`);
    const sectionStats = section.filteredArticles
      ? `${section.totalArticles} scanned → ${section.filteredArticles} important`
      : `${section.totalArticles} articles analyzed`;
    lines.push(`<i>${sectionStats}</i>`);
    lines.push("");

    for (let idx = 0; idx < section.items.length; idx++) {
      const item = section.items[idx];
      const emoji = IMPACT_EMOJI[item.impact] || "⚪";

      lines.push(`${emoji} <b>${esc(item.headline)}</b>`);
      lines.push(`${esc(item.summary)}`);

      const parts: string[] = [];
      if (item.tags.length > 0) {
        const tagsStr = item.tags
          .slice(0, 4)
          .map((t) => `#${t.replace(/[^a-zA-Z0-9_\u00C0-\u024F\u0400-\u04FFçğıöşüÇĞİÖŞÜ]/g, "")}`)
          .filter((t) => t.length > 1)
          .join(" ");
        if (tagsStr) parts.push(tagsStr);
      }
      if (item.url) {
        parts.push(`<a href="${item.url}">Source</a>`);
      }
      if (parts.length > 0) {
        lines.push(parts.join(" | "));
      }

      if (idx < section.items.length - 1) {
        lines.push("");
      }
    }

    lines.push("");
  }

  lines.push("━━━━━━━━━━━━━━━━━━━━━━");
  const footerStats = totalFiltered > 0
    ? `📊 <b>${totalArticles}</b> scanned → <b>${totalFiltered}</b> found important → <b>${totalItems}</b> items summarized`
    : `📊 <b>${totalArticles}</b> analyzed → <b>${totalItems}</b> items summarized`;
  lines.push(footerStats);

  return lines.join("\n");
}

export function formatDigestMessage(digest: string): string {
  return esc(digest);
}
