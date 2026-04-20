import * as cheerio from "cheerio";
import { validateFeedUrl } from "@/lib/utils/url-validator";

const CONTENT_SELECTORS = [
  "article",
  '[role="main"]',
  ".post-content",
  ".entry-content",
  ".article-content",
  ".article-body",
  ".post-body",
  ".story-body",
  ".content-body",
  ".blog-content",
  ".blog-body",
  ".blog-detail",
  ".blog__body",
  ".page-content",
  ".single-content",
  ".td-post-content",
  ".c-content",
  ".cmp-text",
  ".field--name-body",
  ".node__content",
  ".prose",
  ".rich-text",
  ".markdown-body",
  "main",
  "#content",
  "#article-body",
  "#post-content",
  ".content",
  "[itemprop='articleBody']",
  "[class*='article-body']",
  "[class*='post-content']",
  "[class*='entry-content']",
  "[class*='blog-content']",
  "[class*='BlogPost']",
];

const REMOVE_SELECTORS = [
  "script", "style", "noscript", "iframe", "svg",
  "nav", "footer", "header",
  ".sidebar", ".comments", ".social-share", ".share-buttons",
  ".related-posts", ".advertisement", ".ad", ".ads",
  ".newsletter-signup", ".cookie-banner", ".popup", ".modal",
  ".breadcrumb", ".breadcrumbs", ".pagination",
  ".author-bio", ".author-box",
  ".wp-block-latest-posts", ".wp-block-categories",
  '[role="navigation"]', '[role="complementary"]',
];

const MAX_BODY_SIZE = 2_000_000;
const MAX_CONTENT_SIZE = 200_000;
const FETCH_TIMEOUT = 15_000;
const MIN_CONTENT_TEXT_LENGTH = 100;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cleanHtml($: cheerio.CheerioAPI, el: cheerio.Cheerio<any>): string | null {
  const clone = el.clone();
  for (const sel of REMOVE_SELECTORS) {
    clone.find(sel).remove();
  }
  const html = clone.html();
  if (!html) return null;

  const text = clone.text().replace(/\s+/g, " ").trim();
  if (text.length < MIN_CONTENT_TEXT_LENGTH) return null;

  return html.length > MAX_CONTENT_SIZE ? html.slice(0, MAX_CONTENT_SIZE) : html;
}

function findBestContentBlock($: cheerio.CheerioAPI): string | null {
  for (const selector of CONTENT_SELECTORS) {
    const el = $(selector).first();
    if (el.length > 0) {
      const cleaned = cleanHtml($, el);
      if (cleaned) return cleaned;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let bestEl: cheerio.Cheerio<any> | null = null;
  let bestScore = 0;

  $("div, section").each((_, elem) => {
    const el = $(elem);
    const text = el.text().replace(/\s+/g, " ").trim();
    const paragraphs = el.find("p").length;
    const links = el.find("a").length;

    if (text.length < 300 || paragraphs < 2) return;

    const linkDensity = links > 0 ? text.length / links : text.length;
    const score = text.length * 0.5 + paragraphs * 100 + linkDensity * 0.1;

    if (score > bestScore) {
      bestScore = score;
      bestEl = el;
    }
  });

  if (bestEl) {
    const cleaned = cleanHtml($, bestEl);
    if (cleaned) return cleaned;
  }

  return null;
}

export async function scrapeFullText(url: string): Promise<string | null> {
  const validation = validateFeedUrl(url);
  if (!validation.valid) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Feed2040/1.0; +https://github.com/feed2040)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      redirect: "follow",
    });

    clearTimeout(timeoutId);

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("xhtml")) {
      return null;
    }

    const contentLength = parseInt(res.headers.get("content-length") || "0", 10);
    if (contentLength > MAX_BODY_SIZE) return null;

    const html = await res.text();
    if (html.length > MAX_BODY_SIZE) return null;

    const $ = cheerio.load(html);

    for (const sel of REMOVE_SELECTORS) {
      $(sel).remove();
    }

    const content = findBestContentBlock($);

    return content;
  } catch {
    return null;
  }
}
