"use client";

import { useEffect, useCallback, useState, useMemo, memo, useRef } from "react";
import DOMPurify from "isomorphic-dompurify";
import { cn } from "@/lib/utils";
import {
  ExternalLink,
  Clock,
  Bookmark,
  BookmarkCheck,
  User,
  Rss,
  Loader2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sparkles,
  BookOpen,
  Plus,
  Minus,
  X,
  Languages,
  ChevronDown,
  Undo2,
  Share2,
  Copy,
  FileText,
  ClipboardCheck,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { ArticleWithFeed } from "@/types";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { isSafeUrl } from "@/lib/utils/url-validator";
import { toast } from "sonner";

const TRANSLATE_LANGUAGES = [
  { value: "en", label: "English" },
  { value: "tr", label: "Türkçe" },
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
  { value: "ru", label: "Русский" },
  { value: "zh", label: "中文" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
  { value: "pt", label: "Português" },
  { value: "ar", label: "العربية" },
  { value: "it", label: "Italiano" },
] as const;

type Props = {
  article: ArticleWithFeed | null;
  onClose: () => void;
  onBookmarkToggle: (id: string) => void;
  bookmarked: boolean;
};

function ImageZoomModal({
  src,
  onClose,
}: {
  src: string;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") setScale((s) => Math.min(s + 0.25, 4));
      if (e.key === "-") setScale((s) => Math.max(s - 0.25, 0.25));
      if (e.key === "0") setScale(1);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="absolute top-4 right-4 flex items-center gap-1 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setScale((s) => Math.max(s - 0.25, 0.25))}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
        >
          <ZoomOut size={16} />
        </button>
        <span className="px-2 text-xs font-mono text-white/80">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => setScale((s) => Math.min(s + 0.25, 4))}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={() => setScale(1)}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors ml-1"
        >
          <Maximize2 size={14} />
        </button>
        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors ml-1"
        >
          <X size={16} />
        </button>
      </div>
      <div
        className="overflow-auto max-h-[90vh] max-w-[90vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt=""
          className="transition-transform duration-200"
          style={{ transform: `scale(${scale})`, transformOrigin: "center center" }}
        />
      </div>
    </div>
  );
}

export const ArticlePanel = memo(function ArticlePanel({
  article,
  onClose,
  onBookmarkToggle,
  bookmarked,
}: Props) {
  const [fullContent, setFullContent] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [readerMode, setReaderMode] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loadingAiSummary, setLoadingAiSummary] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translatedContent, setTranslatedContent] = useState<string | null>(null);
  const [translateLang, setTranslateLang] = useState("tr");
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const langPickerRef = useRef<HTMLDivElement>(null);
  const shareMenuRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem("translateLanguage");
    if (stored) setTranslateLang(stored);
  }, []);

  useEffect(() => {
    if (article?.aiSummary) setAiSummary(article.aiSummary);
    else setAiSummary(null);
  }, [article?.id, article?.aiSummary]);

  useEffect(() => {
    if (!article) {
      setFullContent(null);
      setTranslatedContent(null);
      return;
    }

    setTranslatedContent(null);
    scrollRef.current?.scrollTo(0, 0);

    fetch("/api/articles/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId: article.id }),
    }).catch(() => {});

    if (article.content) setFullContent(article.content);
    else setLoadingContent(true);

    fetch(`/api/articles/${article.id}`)
      .then((res) => res.json())
      .then((data) => {
        const fetched = data.data?.content;
        if (fetched && fetched.length > (article.content?.length || 0)) {
          setFullContent(fetched);
        } else if (!article.content) {
          setFullContent(fetched || null);
        }
      })
      .catch(() => {
        if (!article.content) setFullContent(null);
      })
      .finally(() => setLoadingContent(false));
  }, [article]);

  useEffect(() => {
    if (!contentRef.current) return;
    const images = contentRef.current.querySelectorAll("img");
    const handlers: Array<[HTMLImageElement, () => void]> = [];

    images.forEach((img) => {
      const handler = () => setZoomImage(img.src);
      img.style.cursor = "zoom-in";
      img.addEventListener("click", handler);
      handlers.push([img, handler]);
    });

    return () => {
      handlers.forEach(([img, handler]) => {
        img.removeEventListener("click", handler);
      });
    };
  }, [fullContent, article]);

  const handleBookmark = useCallback(() => {
    if (article) onBookmarkToggle(article.id);
  }, [article, onBookmarkToggle]);

  const handleAiSummarize = useCallback(async () => {
    if (!article) return;
    setLoadingAiSummary(true);
    try {
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId: article.id }),
      });
      const data = await res.json();
      if (res.ok && data.data?.summary) {
        setAiSummary(data.data.summary);
      }
    } catch {
      /* silent */
    } finally {
      setLoadingAiSummary(false);
    }
  }, [article]);

  const handleTranslate = useCallback(async () => {
    const content = fullContent || article?.content || article?.summary;
    if (!content || !article) return;
    setTranslating(true);
    setShowLangPicker(false);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: content, targetLang: translateLang }),
      });
      const data = await res.json();
      if (res.ok && data.data?.translatedHtml) {
        setTranslatedContent(data.data.translatedHtml);
        toast.success("Article translated");
      } else {
        toast.error(data.error || "Translation failed");
      }
    } catch {
      toast.error("Translation failed");
    } finally {
      setTranslating(false);
    }
  }, [fullContent, article, translateLang]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (langPickerRef.current && !langPickerRef.current.contains(e.target as Node)) {
        setShowLangPicker(false);
      }
      if (shareMenuRef.current && !shareMenuRef.current.contains(e.target as Node)) {
        setShowShareMenu(false);
      }
    }
    if (showLangPicker || showShareMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showLangPicker, showShareMenu]);

  const rawContent = translatedContent || fullContent || article?.content;
  const displayAiSummary = aiSummary ?? article?.aiSummary ?? null;

  const htmlToMarkdown = useCallback((html: string): string => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    function walk(node: Node): string {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
      if (node.nodeType !== Node.ELEMENT_NODE) return "";
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const children = Array.from(el.childNodes).map(walk).join("");
      switch (tag) {
        case "h1": return `# ${children}\n\n`;
        case "h2": return `## ${children}\n\n`;
        case "h3": return `### ${children}\n\n`;
        case "h4": return `#### ${children}\n\n`;
        case "h5": return `##### ${children}\n\n`;
        case "h6": return `###### ${children}\n\n`;
        case "p": return `${children}\n\n`;
        case "br": return "\n";
        case "strong": case "b": return `**${children}**`;
        case "em": case "i": return `*${children}*`;
        case "a": return `[${children}](${el.getAttribute("href") || ""})`;
        case "img": return `![${el.getAttribute("alt") || ""}](${el.getAttribute("src") || ""})\n\n`;
        case "ul": return `${children}\n`;
        case "ol": return `${children}\n`;
        case "li": {
          const parent = el.parentElement?.tagName.toLowerCase();
          const idx = Array.from(el.parentElement?.children || []).indexOf(el);
          const prefix = parent === "ol" ? `${idx + 1}. ` : "- ";
          return `${prefix}${children.trim()}\n`;
        }
        case "blockquote": return children.split("\n").filter(Boolean).map((l) => `> ${l}`).join("\n") + "\n\n";
        case "pre": case "code": {
          if (tag === "pre") return `\`\`\`\n${el.textContent}\n\`\`\`\n\n`;
          return `\`${children}\``;
        }
        case "hr": return "---\n\n";
        default: return children;
      }
    }
    return walk(doc.body).replace(/\n{3,}/g, "\n\n").trim();
  }, []);

  const getArticleMarkdown = useCallback(() => {
    if (!article) return "";
    const parts: string[] = [];
    parts.push(`# ${article.title}\n`);
    const metaParts: string[] = [];
    if (article.author) metaParts.push(`**Author:** ${article.author}`);
    if (article.publishedAt) metaParts.push(`**Date:** ${new Date(article.publishedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`);
    if (article.feed?.title) metaParts.push(`**Source:** ${article.feed.title}`);
    if (article.url) metaParts.push(`**URL:** ${article.url}`);
    if (metaParts.length) parts.push(metaParts.join("  \n") + "\n");
    parts.push("---\n");
    if (displayAiSummary) parts.push(`> **AI Summary:** ${displayAiSummary}\n`);
    const content = rawContent;
    if (content) parts.push(htmlToMarkdown(content));
    return parts.join("\n");
  }, [article, displayAiSummary, rawContent, htmlToMarkdown]);

  const copyToClipboard = useCallback(async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch { /* fallback below */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }, []);

  const handleCopyMarkdown = useCallback(async () => {
    const md = getArticleMarkdown();
    const ok = await copyToClipboard(md);
    if (ok) {
      setCopied(true);
      toast.success("Copied as Markdown");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Failed to copy");
    }
    setShowShareMenu(false);
  }, [getArticleMarkdown, copyToClipboard]);

  const handleCopyLink = useCallback(async () => {
    if (!article?.url) return;
    const ok = await copyToClipboard(article.url);
    if (ok) toast.success("Link copied");
    else toast.error("Failed to copy");
    setShowShareMenu(false);
  }, [article?.url, copyToClipboard]);

  const handleDownloadMarkdown = useCallback(() => {
    const md = getArticleMarkdown();
    const slug = (article?.title || "article").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowShareMenu(false);
    toast.success("Downloaded as Markdown");
  }, [getArticleMarkdown, article?.title]);

  const handleCopyPlainText = useCallback(async () => {
    if (!article) return;
    const content = rawContent ? new DOMParser().parseFromString(rawContent, "text/html").body.textContent || "" : "";
    const text = `${article.title}\n\n${article.url}\n\n${content}`;
    const ok = await copyToClipboard(text);
    if (ok) toast.success("Copied as plain text");
    else toast.error("Failed to copy");
    setShowShareMenu(false);
  }, [article, rawContent, copyToClipboard]);

  const displayContent = useMemo(() => {
    if (!rawContent) return null;
    return DOMPurify.sanitize(rawContent, {
      ALLOWED_TAGS: ["p", "br", "b", "i", "em", "strong", "a", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code", "img", "figure", "figcaption", "div", "span"],
      ALLOWED_ATTR: ["href", "src", "alt", "title", "class", "target", "rel"],
      ADD_ATTR: ["target"],
    });
  }, [rawContent]);

  if (!article) return null;

  return (
    <>
      {zoomImage && (
        <ImageZoomModal src={zoomImage} onClose={() => setZoomImage(null)} />
      )}

      <div className="flex h-full flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-border bg-background/95 backdrop-blur-sm px-5 py-2 flex-shrink-0">
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground min-w-0 overflow-hidden">
            <Rss size={14} className="text-primary flex-shrink-0" />
            <span className="font-medium truncate">{article.feed.title}</span>
            {article.publishedAt && (
              <>
                <span className="text-border flex-shrink-0">·</span>
                <span className="flex items-center gap-1 flex-shrink-0 text-xs">
                  <Clock size={11} />
                  {formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleAiSummarize}
              disabled={loadingAiSummary}
              title="AI Summarize"
            >
              {loadingAiSummary ? (
                <Loader2 size={15} className="animate-spin text-primary" />
              ) : (
                <Sparkles size={15} className="text-muted-foreground" />
              )}
            </Button>

            {/* Translate */}
            <div className="relative" ref={langPickerRef}>
              <div className="flex items-center">
                {translatedContent ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setTranslatedContent(null)}
                    title="Show original"
                    className="bg-primary/10 text-primary"
                  >
                    <Undo2 size={15} />
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={handleTranslate}
                    disabled={translating}
                    title="Translate article"
                  >
                    {translating ? (
                      <Loader2 size={15} className="animate-spin text-primary" />
                    ) : (
                      <Languages size={15} className="text-muted-foreground" />
                    )}
                  </Button>
                )}
                <button
                  onClick={() => setShowLangPicker((v) => !v)}
                  className="flex h-7 w-4 items-center justify-center text-muted-foreground hover:text-foreground transition-colors -ml-1"
                  title="Select language"
                >
                  <ChevronDown size={10} />
                </button>
              </div>

              {showLangPicker && (
                <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-xl border border-border bg-popover p-1 shadow-lg">
                  {TRANSLATE_LANGUAGES.map((lang) => (
                    <button
                      key={lang.value}
                      onClick={() => {
                        setTranslateLang(lang.value);
                        localStorage.setItem("translateLanguage", lang.value);
                        setShowLangPicker(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-muted",
                        translateLang === lang.value && "bg-primary/10 text-primary font-medium"
                      )}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setReaderMode((r) => !r)}
              className={cn(readerMode && "bg-primary/10 text-primary")}
              title="Reader mode"
            >
              <BookOpen size={15} />
            </Button>

            <div className="flex items-center gap-0 rounded-md border border-border mx-1">
              <button
                onClick={() => setFontSize((f) => Math.max(13, f - 1))}
                className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                title="Smaller"
              >
                <Minus size={12} />
              </button>
              <span className="text-[10px] font-mono text-muted-foreground min-w-[28px] text-center">
                {fontSize}
              </span>
              <button
                onClick={() => setFontSize((f) => Math.min(24, f + 1))}
                className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                title="Larger"
              >
                <Plus size={12} />
              </button>
            </div>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleBookmark}
              title={bookmarked ? "Saved" : "Read later"}
            >
              {bookmarked ? (
                <BookmarkCheck size={15} className="text-primary" />
              ) : (
                <Bookmark size={15} className="text-muted-foreground" />
              )}
            </Button>

            {/* Share / Export */}
            <div className="relative" ref={shareMenuRef}>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setShowShareMenu((s) => !s)}
                title="Share / Export"
                className={cn(showShareMenu && "bg-primary/10 text-primary")}
              >
                <Share2 size={15} />
              </Button>
              {showShareMenu && (
                <div
                  className="absolute right-0 top-full mt-1 z-50 w-56 rounded-xl border border-border bg-popover p-1.5 shadow-xl animate-in fade-in slide-in-from-top-1"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={handleCopyMarkdown}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-popover-foreground hover:bg-accent transition-colors"
                  >
                    {copied ? <ClipboardCheck size={14} className="text-green-500" /> : <FileText size={14} />}
                    Copy as Markdown
                  </button>
                  <button
                    onClick={handleDownloadMarkdown}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-popover-foreground hover:bg-accent transition-colors"
                  >
                    <FileText size={14} />
                    Download .md file
                  </button>
                  <button
                    onClick={handleCopyPlainText}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-popover-foreground hover:bg-accent transition-colors"
                  >
                    <Copy size={14} />
                    Copy as plain text
                  </button>
                  <div className="my-1 border-t border-border" />
                  <button
                    onClick={handleCopyLink}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-popover-foreground hover:bg-accent transition-colors"
                  >
                    <ExternalLink size={14} />
                    Copy link
                  </button>
                </div>
              )}
            </div>

            <a
              href={isSafeUrl(article.url) ? article.url : "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ml-1"
              title="Open original"
            >
              <ExternalLink size={12} />
              <span className="hidden lg:inline">Original</span>
            </a>
          </div>
        </div>

        {/* Scrollable article content */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <article className="px-6 py-6 lg:px-10">

            {/* Title */}
            <h1 className="text-2xl font-bold leading-tight text-foreground lg:text-3xl">
              {article.title}
            </h1>

            {/* Meta */}
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {article.author && (
                <span className="flex items-center gap-1.5">
                  <User size={14} />
                  {article.author}
                </span>
              )}
              {article.publishedAt && (
                <span className="flex items-center gap-1.5">
                  <Clock size={14} />
                  {new Date(article.publishedAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              )}
            </div>

            <Separator className="my-6" />

            {/* AI Summary */}
            {displayAiSummary && (
              <div className="mb-6 rounded-xl border-2 border-primary/30 bg-primary/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={16} className="text-primary" />
                  <span className="text-sm font-bold text-primary">AI Summary</span>
                </div>
                <p className="text-sm leading-relaxed text-foreground">
                  {displayAiSummary}
                </p>
              </div>
            )}

            {/* Media player (podcast/video) */}
            {article.enclosureUrl && article.enclosureType && isSafeUrl(article.enclosureUrl) && (
              <div className="mb-5 rounded-xl border border-border bg-muted/50 p-3">
                {article.enclosureType.startsWith("audio/") ? (
                  <audio controls preload="metadata" className="w-full">
                    <source src={article.enclosureUrl} type={article.enclosureType} />
                  </audio>
                ) : article.enclosureType.startsWith("video/") ? (
                  <video controls preload="metadata" className="w-full rounded-lg max-h-96">
                    <source src={article.enclosureUrl} type={article.enclosureType} />
                  </video>
                ) : null}
              </div>
            )}

            {/* Article body */}
            <div
              ref={contentRef}
              className={cn(
                "article-content max-w-none text-foreground transition-all",
                readerMode && "font-serif leading-[1.9]"
              )}
              style={{ fontSize: `${fontSize}px`, lineHeight: readerMode ? "1.9" : "1.75" }}
            >
              {loadingContent ? (
                <div className="flex flex-col gap-3 py-8">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              ) : displayContent ? (
                <div
                  dangerouslySetInnerHTML={{ __html: displayContent }}
                  className="
                    [&_img]:rounded-xl [&_img]:my-5 [&_img]:max-w-full [&_img]:cursor-zoom-in [&_img]:hover:shadow-lg [&_img]:transition-shadow
                    [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2
                    [&_p]:mb-4 [&_p]:leading-[1.75]
                    [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-8 [&_h1]:mb-4
                    [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-7 [&_h2]:mb-3
                    [&_h3]:text-base [&_h3]:font-bold [&_h3]:mt-6 [&_h3]:mb-3
                    [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4
                    [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4
                    [&_li]:mb-2 [&_li]:leading-[1.75]
                    [&_blockquote]:border-l-4 [&_blockquote]:border-primary/30 [&_blockquote]:pl-5 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:my-5
                    [&_pre]:bg-muted [&_pre]:rounded-xl [&_pre]:p-4 [&_pre]:overflow-x-auto [&_pre]:text-sm [&_pre]:my-5
                    [&_code]:bg-muted [&_code]:rounded-md [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm
                    [&_table]:w-full [&_table]:border-collapse [&_table]:my-5
                    [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-sm [&_th]:font-semibold [&_th]:bg-muted
                    [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:text-sm
                    [&_hr]:my-6 [&_hr]:border-border
                    [&_figure]:my-5 [&_figcaption]:text-xs [&_figcaption]:text-muted-foreground [&_figcaption]:mt-2 [&_figcaption]:text-center
                  "
                />
              ) : article.summary ? (
                <div className="leading-[1.75] text-foreground">
                  {article.summary}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    No content available for this article.
                  </p>
                  <a
                    href={isSafeUrl(article.url) ? article.url : "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-all"
                  >
                    <ExternalLink size={14} />
                    Read on original site
                  </a>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="mt-8 flex items-center justify-between border-t border-border pt-5 pb-6">
              <a
                href={isSafeUrl(article.url) ? article.url : "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                <ExternalLink size={14} />
                {(() => { try { return isSafeUrl(article.url) ? `Read on ${new URL(article.url).hostname}` : "Original link"; } catch { return "Original link"; } })()}
              </a>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBookmark}
                className="inline-flex items-center gap-2"
              >
                {bookmarked ? (
                  <BookmarkCheck size={14} className="text-primary" />
                ) : (
                  <Bookmark size={14} />
                )}
                {bookmarked ? "Saved" : "Read Later"}
              </Button>
            </div>
          </article>
        </div>
      </div>
    </>
  );
});
