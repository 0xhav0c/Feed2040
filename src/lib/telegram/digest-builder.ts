import { prisma } from "@/lib/prisma";
import { sendMessage } from "@/lib/telegram/bot";
import type { StructuredDigestResult } from "@/lib/ai/summarizer";
import { generateAndStoreDigest, userTodayKey } from "@/lib/ai/digest-service";

interface DigestUserContext {
  userId: string;
  chatId: string;
  language: string;
  /** Only reuse a digest created at/after this instant; otherwise generate. */
  notBefore?: Date;
}

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Build a Telegram HTML anchor only for http(s) URLs, escaping the href for
// attribute context. item.url comes from LLM output and is untrusted: an
// unescaped quote breaks entity parsing (Telegram 400s the whole message) and
// a non-http scheme must never be emitted.
function safeAnchor(rawUrl: string, label: string): string | null {
  if (!/^https?:\/\//i.test(rawUrl)) return null;
  const href = rawUrl
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<a href="${href}">${label}</a>`;
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
    const anchor = safeAnchor(item.url, "Source");
    if (anchor) parts.push(anchor);
  }
  lines.push(parts.join(" | "));
  lines.push(`\n<i>[${index}/${total}]</i>`);

  return lines.join("\n");
}

export type SendDigestResult = "sent" | "no-articles" | "ai-failed" | "send-failed";

export async function buildAndSendDigest(
  ctx: DigestUserContext
): Promise<SendDigestResult> {
  const { userId, chatId, language, notBefore } = ctx;
  const date = await userTodayKey(userId);

  const latestDigest = await prisma.digest.findFirst({
    where: {
      userId,
      date,
      source: { in: ["web", "scheduled", "telegram"] },
      ...(notBefore ? { createdAt: { gte: notBefore } } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  let results = latestDigest?.structured as unknown as StructuredDigestResult[] | undefined;
  if (!Array.isArray(results) || results.length === 0) {
    // Nothing generated today yet — build one now instead of failing.
    const generated = await generateAndStoreDigest({ userId, hours: 24, source: "telegram", language });
    if (!generated.ok) {
      console.log(`[TelegramDigest] No digest for ${userId}: ${generated.reason}`);
      return generated.reason;
    }
    results = generated.structured;
  }

  const allItems: { item: StructuredDigestResult["items"][number]; categoryName: string }[] = [];
  for (const section of results) {
    for (const item of section.items) {
      allItems.push({ item, categoryName: section.categoryName });
    }
  }

  if (allItems.length === 0) return "no-articles";

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

    return sent > 0 ? "sent" : "send-failed";
  } catch (error) {
    console.error("Digest send error:", error);
    return "send-failed";
  }
}
