import { prisma } from "@/lib/prisma";
import { sendMessage } from "@/lib/telegram/bot";
import { format } from "date-fns";
import type { StructuredDigestResult } from "@/lib/ai/summarizer";

interface DigestUserContext {
  userId: string;
  chatId: string;
  language: string;
}

function todayKey(): string {
  return format(new Date(), "yyyy-MM-dd");
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

function formatSingleBriefItem(
  item: StructuredDigestResult["items"][number],
  categoryName: string,
  index: number,
  total: number
): string {
  const emoji = IMPACT_EMOJI[item.impact] || "⚪";
  const catIcon = categoryName.toLowerCase().includes("vuln") ? "🛡️" : "📌";

  const lines: string[] = [];
  lines.push(`${emoji} <b>${esc(item.headline)}</b>`);
  lines.push("");
  lines.push(esc(item.summary));
  lines.push("");

  const parts: string[] = [];
  parts.push(`${catIcon} ${esc(categoryName)}`);
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
  lines.push(parts.join(" | "));
  lines.push(`\n<i>[${index}/${total}]</i>`);

  return lines.join("\n");
}

export async function buildAndSendDigest(
  ctx: DigestUserContext
): Promise<boolean> {
  const { userId, chatId } = ctx;
  const date = todayKey();

  const latestDigest = await prisma.digest.findFirst({
    where: {
      userId,
      date,
      source: { in: ["web", "scheduled"] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!latestDigest?.structured) {
    console.log("[TelegramDigest] No digest found for today to send");
    return false;
  }

  const results = latestDigest.structured as unknown as StructuredDigestResult[];
  if (!Array.isArray(results) || results.length === 0) return false;

  const allItems: { item: StructuredDigestResult["items"][number]; categoryName: string }[] = [];
  for (const section of results) {
    for (const item of section.items) {
      allItems.push({ item, categoryName: section.categoryName });
    }
  }

  if (allItems.length === 0) return false;

  try {
    const dateStr = new Date().toLocaleDateString("en-US", {
      day: "numeric", month: "long", year: "numeric",
    });
    const headerMsg = `📋 <b>DAILY BRIEFING</b> — ${esc(dateStr)}\n━━━━━━━━━━━━━━━━━━━━━━\n\n📨 Sending <b>${allItems.length}</b> briefing items...`;
    await sendMessage(chatId, headerMsg, "HTML", userId);

    let sent = 0;
    for (let i = 0; i < allItems.length; i++) {
      const { item, categoryName } = allItems[i];
      const msg = formatSingleBriefItem(item, categoryName, i + 1, allItems.length);
      const ok = await sendMessage(chatId, msg, "HTML", userId);
      if (ok) sent++;
      if (i < allItems.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    const footerMsg = `━━━━━━━━━━━━━━━━━━━━━━\n✅ <b>${sent}/${allItems.length}</b> briefing items delivered.`;
    await sendMessage(chatId, footerMsg, "HTML", userId);

    return sent > 0;
  } catch (error) {
    console.error("Digest send error:", error);
    return false;
  }
}
