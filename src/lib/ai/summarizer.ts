import { createProvider, getAIConfig, type AIConfig, type AIProvider } from "./provider";

const LANGUAGE_NAMES: Record<string, string> = {
  tr: "Türkçe",
  en: "English",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
  ar: "العربية",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
  ru: "Русский",
  pt: "Português",
  it: "Italiano",
};

function langName(code: string): string {
  return LANGUAGE_NAMES[code] || code;
}

function isLocal(config: AIConfig): boolean {
  return config.provider === "ollama";
}

// ── Single Article Summarization ────────────────────────────────────

export async function summarizeArticle(
  content: string,
  language?: string,
  userId?: string
): Promise<string | null> {
  const config = await getAIConfig(userId);
  const provider = await createProvider(config.provider, userId);
  if (!provider) return null;

  const lang = language || config.language;
  const text = content?.trim() || "";
  if (!text) return null;

  const local = isLocal(config);
  const result = await provider.chat({
    model: config.model,
    systemPrompt: local
      ? `Summarize articles in ${langName(lang)}. Keep technical terms in English. 2-4 sentences.`
      : `You are a helpful assistant that summarizes articles concisely. You MUST respond entirely in ${langName(lang)}.`,
    userPrompt: local
      ? `Summarize in ${langName(lang)}:\n\n${text.slice(0, 6000)}`
      : `Summarize the following article in 2-4 sentences. Respond in ${langName(lang)}:\n\n${text.slice(0, 12000)}`,
    maxTokens: local ? 400 : 300,
  });

  return result;
}

// ── Structured Digest Types ─────────────────────────────────────────

export interface DigestArticle {
  title: string;
  summary: string | null;
  feedTitle: string;
  url: string;
}

export interface CategoryDigestInput {
  categoryName: string;
  articles: DigestArticle[];
}

export interface DigestItem {
  emoji: string;
  headline: string;
  summary: string;
  impact: "critical" | "high" | "medium" | "low" | "info";
  url: string;
  tags: string[];
}

export interface StructuredDigestResult {
  categoryName: string;
  isVuln: boolean;
  items: DigestItem[];
  totalArticles: number;
  filteredArticles?: number;
}

// ── Vulnerability Detection ─────────────────────────────────────────

const VULN_KEYWORDS = [
  "vulnerability", "vulnerabilities", "cve", "exploit", "zafiyet",
  "güvenlik açığı", "güvenlik açıkları", "saldırı", "malware",
  "threat", "advisory", "patch", "sploitus", "security advisory",
  "security", "güvenlik", "siber", "cybersecurity",
];

function isVulnCategory(categoryName: string): boolean {
  const lower = categoryName.toLowerCase();
  return VULN_KEYWORDS.some((kw) => lower.includes(kw));
}

// ── Robust JSON Extraction ──────────────────────────────────────────

function extractJSON(raw: string): string | null {
  const trimmed = raw.trim();

  try { JSON.parse(trimmed); return trimmed; } catch { /* continue */ }

  for (const pattern of [/```json\s*([\s\S]*?)```/, /```\s*([\s\S]*?)```/]) {
    const match = trimmed.match(pattern);
    if (match) {
      try { JSON.parse(match[1].trim()); return match[1].trim(); } catch { /* continue */ }
    }
  }

  const firstBrace = trimmed.indexOf("{");
  const firstBracket = trimmed.indexOf("[");
  let start = -1;
  if (firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket)) start = firstBrace;
  else if (firstBracket >= 0) start = firstBracket;

  if (start >= 0) {
    let depth = 0, inString = false, escape = false;
    for (let i = start; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{" || ch === "[") depth++;
      if (ch === "}" || ch === "]") depth--;
      if (depth === 0) {
        const candidate = trimmed.slice(start, i + 1);
        try { JSON.parse(candidate); return candidate; } catch { depth = 1; }
      }
    }
  }

  return null;
}

function repairJSON(raw: string): string | null {
  let fixed = raw
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/(['"])?(\w+)(['"])?\s*:/g, '"$2":')
    .replace(/:\s*'([^']*)'/g, ':"$1"')
    .replace(/\n/g, " ");

  const firstBrace = fixed.indexOf("{");
  const firstBracket = fixed.indexOf("[");
  let start = -1;
  if (firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket)) start = firstBrace;
  else if (firstBracket >= 0) start = firstBracket;
  if (start < 0) return null;
  fixed = fixed.slice(start);

  fixed += "}".repeat(Math.max(0, (fixed.match(/\{/g) || []).length - (fixed.match(/\}/g) || []).length));
  fixed += "]".repeat(Math.max(0, (fixed.match(/\[/g) || []).length - (fixed.match(/\]/g) || []).length));

  try { JSON.parse(fixed); return fixed; } catch { return null; }
}

function safeParseJSON(raw: string | null): unknown {
  if (!raw) return null;
  const jsonStr = extractJSON(raw) || repairJSON(raw);
  if (!jsonStr) return null;
  try { return JSON.parse(jsonStr); } catch { return null; }
}

// ── Impact Helpers ──────────────────────────────────────────────────

const IMPACT_EMOJI_MAP: Record<string, string> = {
  critical: "🔴", high: "🟠", medium: "🟡", low: "🔵", info: "⚪",
};

const IMPACT_ORDER: Record<string, number> = {
  critical: 0, high: 1, medium: 2, low: 3, info: 4,
};

function validateImpact(val: unknown): "critical" | "high" | "medium" | "low" | "info" {
  const s = String(val || "").toLowerCase();
  for (const v of ["critical", "high", "medium", "low", "info"] as const) {
    if (s.includes(v)) return v;
  }
  return "info";
}

// ── Parse Digest Response ───────────────────────────────────────────

function parseDigestResponse(raw: string | null): DigestItem[] {
  if (!raw) return [];

  const parsed = safeParseJSON(raw);
  if (parsed && typeof parsed === "object") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj = parsed as any;
    const arr = obj.items || obj.results || obj.articles || obj.data || (Array.isArray(parsed) ? parsed : null);
    if (arr && Array.isArray(arr)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items: DigestItem[] = arr.map((item: any) => ({
        emoji: IMPACT_EMOJI_MAP[validateImpact(item.impact || item.severity)] || "⚪",
        headline: String(item.headline || item.title || item.name || "").trim(),
        summary: String(item.summary || item.description || item.content || item.detail || "").trim(),
        impact: validateImpact(item.impact || item.severity || item.level),
        url: String(item.url || item.link || item.source || "").trim(),
        tags: Array.isArray(item.tags) ? item.tags.map(String) : typeof item.tags === "string" ? item.tags.split(",").map((t: string) => t.trim()) : [],
      }));
      const valid = items.filter((i) => i.headline && i.summary);
      if (valid.length > 0) return valid;
    }
  }

  return fallbackParse(raw);
}

function fallbackParse(text: string): DigestItem[] {
  const lines = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[{}\[\]"]/g, "")
    .split("\n").map((l) => l.trim())
    .filter((l) => l.length > 15 && !/^(items|emoji|impact|tags|url|headline|summary)\b/.test(l));

  const items: DigestItem[] = [];
  for (const line of lines) {
    const urlMatch = line.match(/(https?:\/\/[^\s,)]+)/);
    const url = urlMatch ? urlMatch[1] : "";
    const content = line.replace(/https?:\/\/[^\s,)]+/g, "").replace(/[,;]+$/, "").trim();
    if (!content || content.length < 10) continue;
    items.push({
      emoji: "📰",
      headline: content.length > 80 ? content.slice(0, 77) + "..." : content,
      summary: content, impact: "info", url, tags: [],
    });
  }
  return items.slice(0, 30);
}

// ═════════════════════════════════════════════════════════════════════
// MULTI-STAGE PIPELINE
// Stage 1: Score articles for global importance (1-10)
// Stage 2: Deduplicate similar articles
// Stage 3: Generate digest from top-scored, deduplicated articles
// ═════════════════════════════════════════════════════════════════════

interface ScoredArticle extends DigestArticle {
  score: number;
  originalIndex: number;
}

// ── Stage 1: Importance Scoring ─────────────────────────────────────

async function scoreArticles(
  provider: AIProvider,
  config: AIConfig,
  articles: DigestArticle[],
): Promise<ScoredArticle[]> {
  const local = isLocal(config);
  const model = config.model;
  const BATCH = local ? 20 : 50;

  const scored: ScoredArticle[] = articles.map((a, i) => ({
    ...a, score: 5, originalIndex: i,
  }));

  for (let i = 0; i < articles.length; i += BATCH) {
    const batch = articles.slice(i, i + BATCH);
    const batchNum = Math.floor(i / BATCH) + 1;
    const totalBatches = Math.ceil(articles.length / BATCH);

    const compact = batch.map((a, idx) => ({
      i: i + idx,
      t: a.title.slice(0, local ? 100 : 150),
      s: (a.summary || "").slice(0, local ? 60 : 100),
      f: a.feedTitle.slice(0, 30),
    }));

    console.log(`[Score] Batch ${batchNum}/${totalBatches}: scoring ${batch.length} articles`);

    const result = await provider.chat({
      model,
      systemPrompt: local
        ? `Rate each article's global importance for cybersecurity professionals (1-10).
10: active 0-day exploit, major breach, critical CVE
8-9: significant vulnerability, APT campaign, widespread attack
6-7: notable research, important tool release, industry event
4-5: minor vulnerability, routine update, niche topic
1-3: irrelevant, spam, personal blog, generic advice

Return ONLY JSON: {"scores":{"0":8,"1":3,"2":7,...}}`
        : `You are a cybersecurity threat intelligence analyst. Rate each article's importance on a 1-10 scale based on global impact, urgency, and relevance to cybersecurity professionals.

10: Active 0-day exploitation, critical infrastructure breach, major RCE affecting millions
8-9: High-severity CVE, active APT campaign, significant data breach, critical patch release
6-7: Notable security research, important tool/framework release, medium-severity vulnerability
4-5: Minor vulnerability, routine software update, niche research topic
1-3: Not cybersecurity related, spam, generic advice, personal blog post

Return ONLY JSON: {"scores":{"0":8,"1":3,"2":7,...}} where keys are article indices and values are scores.`,
      userPrompt: `Rate these articles:\n${JSON.stringify(compact)}`,
      maxTokens: local ? 500 : 800,
    });

    const parsed = safeParseJSON(result);
    if (parsed && typeof parsed === "object") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scores = (parsed as any).scores || parsed;
      if (typeof scores === "object" && !Array.isArray(scores)) {
        for (const [key, val] of Object.entries(scores)) {
          const idx = parseInt(key, 10);
          const score = typeof val === "number" ? val : parseInt(String(val), 10);
          if (!isNaN(idx) && !isNaN(score) && idx >= 0 && idx < articles.length) {
            scored[idx].score = Math.max(1, Math.min(10, score));
          }
        }
      }
    } else {
      console.warn(`[Score] Batch ${batchNum} parse failed, keeping default scores`);
    }
  }

  return scored;
}

// ── Stage 2: Deduplication ──────────────────────────────────────────

function textSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) if (wordsB.has(w)) intersection++;
  return intersection / Math.min(wordsA.size, wordsB.size);
}

function deduplicateArticles(articles: ScoredArticle[]): ScoredArticle[] {
  const kept: ScoredArticle[] = [];
  const used = new Set<number>();

  const sorted = [...articles].sort((a, b) => b.score - a.score);

  for (const article of sorted) {
    if (used.has(article.originalIndex)) continue;

    let isDuplicate = false;
    for (const existing of kept) {
      const titleSim = textSimilarity(article.title, existing.title);
      const summSim = article.summary && existing.summary
        ? textSimilarity(article.summary, existing.summary)
        : 0;
      if (titleSim > 0.6 || (titleSim > 0.3 && summSim > 0.5)) {
        isDuplicate = true;
        if (article.score > existing.score) {
          existing.score = article.score;
          if (article.url && !existing.url) existing.url = article.url;
        }
        break;
      }
    }

    if (!isDuplicate) {
      kept.push(article);
      used.add(article.originalIndex);
    }
  }

  return kept;
}

// ── Stage 3: Digest Generation ──────────────────────────────────────

async function generateDigestFromArticles(
  provider: AIProvider,
  config: AIConfig,
  articles: ScoredArticle[],
  lang: string,
  isVuln: boolean,
): Promise<DigestItem[]> {
  const local = isLocal(config);
  const BATCH = local ? 15 : 40;
  const allItems: DigestItem[] = [];

  const systemPrompt = buildDigestPrompt(lang, isVuln, local);

  for (let i = 0; i < articles.length; i += BATCH) {
    const batch = articles.slice(i, i + BATCH);
    const batchNum = Math.floor(i / BATCH) + 1;
    const totalBatches = Math.ceil(articles.length / BATCH);

    console.log(`[Digest] Batch ${batchNum}/${totalBatches}: generating for ${batch.length} articles`);

    const userContent = batch.map((a, idx) => {
      const scoreLabel = a.score >= 8 ? "CRITICAL" : a.score >= 6 ? "IMPORTANT" : "NORMAL";
      if (local) {
        return `${idx + 1}. [${scoreLabel}][${a.feedTitle}] ${a.title} — ${(a.summary || "").slice(0, 100)} (${a.url})`;
      }
      return { idx: idx + 1, importance: scoreLabel, score: a.score, title: a.title, summary: (a.summary || "").slice(0, 200), feed: a.feedTitle, url: a.url };
    });

    const userPrompt = local
      ? `Create briefing for these articles. Items marked CRITICAL are most important. Return ONLY JSON:\n\n${(userContent as string[]).join("\n")}`
      : `Create briefing from these pre-scored articles. Focus on CRITICAL and IMPORTANT items. Return only JSON:\n\n${JSON.stringify(userContent)}`;

    const result = await provider.chat({
      model: config.digestModel,
      systemPrompt,
      userPrompt,
      maxTokens: local ? 4000 : 6000,
    });

    const parsed = parseDigestResponse(result);
    allItems.push(...parsed);
  }

  return allItems;
}

function buildDigestPrompt(lang: string, _isVuln: boolean, local: boolean): string {
  const langInstruction = lang === "en"
    ? "Write everything in English."
    : `CRITICAL LANGUAGE RULE: You MUST write ALL headlines and summaries in ${langName(lang)}. Keep only technical terms (CVE IDs, product names, protocol names, APT group names) in English. Everything else MUST be in ${langName(lang)}.`;

  if (local) {
    return `You are a security and technology analyst. Create a briefing from pre-scored articles.

LANGUAGE: ${langInstruction}

Return ONLY valid JSON:
{"items":[{"headline":"title in ${langName(lang)}","summary":"1-2 sentences in ${langName(lang)}","impact":"critical|high|medium|low|info","url":"source url","tags":["tag1","tag2"]}]}

Articles marked CRITICAL (score 8-10) should be impact "critical" or "high".
Articles marked IMPORTANT (score 6-7) should be impact "medium" or "high".
Articles marked NORMAL (score <6) should be impact "low" or "info".

Rules:
- ${langInstruction}
- Include CVE numbers in headlines when available
- Create one item per article, do NOT skip any
- Tags: include vendor, product, CVE, attack type`;
  }

  return `You are an experienced analyst creating a technology and security briefing.

TASK: Create a briefing from pre-scored articles.

${langInstruction}

OUTPUT: Return only JSON:
{"items":[{"headline":"short title in ${langName(lang)}","summary":"1-2 sentence detail in ${langName(lang)}","impact":"critical/high/medium/low/info","url":"source url","tags":["tag1","tag2"]}]}

SCORING GUIDE:
- CRITICAL (8-10): Map to impact "critical" or "high"
- IMPORTANT (6-7): Map to impact "medium" or "high"  
- NORMAL (<6): Map to impact "low" or "info"

RULES:
- ${langInstruction}
- Include CVE in headline when available
- Technical detail in summary
- Tags: CVE, vendor, product, vulnerability type, group name
- One item per article, do not skip articles
- Maximum 30 items`;
}

// ═════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═════════════════════════════════════════════════════════════════════

export async function generateDailyDigest(
  articles: DigestArticle[],
  language?: string,
  userId?: string
): Promise<StructuredDigestResult[] | null> {
  const config = await getAIConfig(userId);
  const provider = await createProvider(config.provider, userId);
  if (!provider) {
    console.error("[Digest] Provider creation failed — API key not configured?");
    return null;
  }

  const local = isLocal(config);
  const lang = language || config.language;
  if (articles.length === 0) {
    console.warn("[Digest] No articles to process");
    return null;
  }

  console.log(`[Pipeline] Starting: ${articles.length} articles, provider=${config.provider}, model=${config.digestModel}`);

  // ── Stage 1: Score ────────────────────────────────────────────────
  console.log(`[Pipeline] Stage 1: Importance scoring`);
  const scored = await scoreArticles(provider, config, articles);
  const scoreDistribution = scored.reduce((acc, a) => {
    const bucket = a.score >= 8 ? "critical" : a.score >= 6 ? "important" : a.score >= 4 ? "normal" : "low";
    acc[bucket] = (acc[bucket] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log(`[Pipeline] Scores: ${JSON.stringify(scoreDistribution)}`);

  // ── Stage 2: Deduplicate ──────────────────────────────────────────
  console.log(`[Pipeline] Stage 2: Deduplication`);
  const deduped = deduplicateArticles(scored);
  console.log(`[Pipeline] Dedup: ${scored.length} → ${deduped.length} unique`);

  // ── Stage 3: Filter by score ──────────────────────────────────────
  const minScore = local ? 3 : 4;
  const maxItems = local ? 60 : 80;
  const filtered = deduped
    .filter(a => a.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxItems);

  console.log(`[Pipeline] After filter (score>=${minScore}): ${filtered.length} articles`);

  if (filtered.length === 0) {
    console.warn("[Pipeline] No articles passed scoring threshold");
    return null;
  }

  // ── Stage 4: Generate digest ──────────────────────────────────────
  console.log(`[Pipeline] Stage 3: Digest generation`);
  const items = await generateDigestFromArticles(provider, config, filtered, lang, true);

  if (items.length === 0) {
    console.error("[Pipeline] No items produced");
    return null;
  }

  items.sort((a, b) => (IMPACT_ORDER[a.impact] ?? 4) - (IMPACT_ORDER[b.impact] ?? 4));
  console.log(`[Pipeline] Complete: ${items.length} items generated`);

  return [{
    categoryName: "Daily Briefing",
    isVuln: true,
    items,
    totalArticles: articles.length,
    filteredArticles: filtered.length,
  }];
}

export async function generateCategorizedDigest(
  categorizedArticles: CategoryDigestInput[],
  language?: string,
  userId?: string
): Promise<StructuredDigestResult[] | null> {
  const config = await getAIConfig(userId);
  const provider = await createProvider(config.provider, userId);
  if (!provider) return null;

  const lang = language || config.language;
  const nonEmpty = categorizedArticles.filter((c) => c.articles.length > 0);
  if (nonEmpty.length === 0) return null;

  const results: StructuredDigestResult[] = [];

  for (const cat of nonEmpty) {
    const catArticles = cat.articles;
    if (catArticles.length === 0) continue;

    console.log(`[CatDigest] Processing "${cat.categoryName}": ${catArticles.length} articles`);

    const scored = await scoreArticles(provider, config, catArticles);
    const deduped = deduplicateArticles(scored);
    const minScore = isLocal(config) ? 3 : 4;
    const filtered = deduped.filter(a => a.score >= minScore).sort((a, b) => b.score - a.score).slice(0, 40);

    if (filtered.length === 0) continue;

    const isVuln = isVulnCategory(cat.categoryName);
    const items = await generateDigestFromArticles(provider, config, filtered, lang, isVuln);

    if (items.length > 0) {
      items.sort((a, b) => (IMPACT_ORDER[a.impact] ?? 4) - (IMPACT_ORDER[b.impact] ?? 4));
      results.push({
        categoryName: cat.categoryName,
        isVuln,
        items,
        totalArticles: cat.articles.length,
      });
    }
  }

  return results.length > 0 ? results : null;
}

// ── Category Suggestion ─────────────────────────────────────────────

export async function suggestCategories(
  feedTitle: string,
  feedDescription: string,
  existingCategories: string[],
  userId?: string
): Promise<string[]> {
  const config = await getAIConfig(userId);
  const provider = await createProvider(config.provider, userId);
  if (!provider) return [];

  const result = await provider.chat({
    model: config.model,
    systemPrompt: `You suggest category names for RSS feeds. Return only category names, one per line. Prefer reusing existing categories when they fit. Existing categories: ${existingCategories.join(", ") || "(none)"}`,
    userPrompt: `Suggest 1-3 categories for this feed:\nTitle: ${feedTitle}\nDescription: ${feedDescription || "(none)"}`,
    maxTokens: 100,
  });

  if (!result) return [];

  return result.split("\n").map((s) => s.replace(/^[-*\d.)\s]+/, "").trim()).filter((s) => s.length > 0).slice(0, 5);
}
