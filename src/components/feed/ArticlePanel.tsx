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
  MessageSquare,
  Send,
  Tag as TagIcon,
  Volume2,
  Pause,
  Play,
  Square,
  Highlighter,
  Trash2,
  StickyNote,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { ArticleWithFeed, ArticleTag } from "@/types";
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

type HighlightItem = {
  id: string;
  text: string;
  note: string | null;
  color: string | null;
  createdAt: string;
};

// Best-effort: wrap the first unmarked occurrence of `text` (within a single
// text node) in a <mark>. Highlights spanning multiple elements aren't marked
// inline, but they still appear in the Highlights list.
function markFirstOccurrence(root: HTMLElement, text: string) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const value = node.nodeValue || "";
    const idx = value.indexOf(text);
    if (idx === -1) continue;
    const parent = (node as Text).parentElement;
    if (parent?.closest("mark.f2040-hl")) continue;
    try {
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + text.length);
      const mark = document.createElement("mark");
      mark.className = "f2040-hl";
      mark.style.cssText =
        "background: rgba(250,204,21,0.35); color: inherit; border-radius: 2px; padding: 0 1px;";
      range.surroundContents(mark);
    } catch {
      /* selection crossed element boundaries — skip inline mark */
    }
    return;
  }
}

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
          aria-label="Zoom out"
        >
          <ZoomOut size={16} />
        </button>
        <span className="px-2 text-xs font-mono text-white/80">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => setScale((s) => Math.min(s + 0.25, 4))}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
          aria-label="Zoom in"
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={() => setScale(1)}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors ml-1"
          aria-label="Reset zoom"
        >
          <Maximize2 size={14} />
        </button>
        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors ml-1"
          aria-label="Close"
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
  const [askThread, setAskThread] = useState<{ q: string; a: string }[]>([]);
  const [askInput, setAskInput] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [tags, setTags] = useState<ArticleTag[]>(article?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [suggestingTags, setSuggestingTags] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [ttsPaused, setTtsPaused] = useState(false);
  const [ttsRate, setTtsRate] = useState(1);
  const [highlights, setHighlights] = useState<HighlightItem[]>([]);
  const [selectionBox, setSelectionBox] = useState<{ text: string; top: number; left: number } | null>(null);
  const [savingHighlight, setSavingHighlight] = useState(false);
  const [noteEditId, setNoteEditId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [translating, setTranslating] = useState(false);
  const [translatedContent, setTranslatedContent] = useState<string | null>(null);
  const [translateLang, setTranslateLang] = useState("tr");
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [relatedArticles, setRelatedArticles] = useState<
    { id: string; title: string; url: string; feedTitle: string; publishedAt: string | null }[]
  >([]);
  const ttsRateRef = useRef(1);
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

  // Reset the Ask-AI conversation when switching articles.
  useEffect(() => {
    setAskThread([]);
    setAskInput("");
    setAskOpen(false);
  }, [article?.id]);

  // Sync tags when switching articles.
  useEffect(() => {
    setTags(article?.tags ?? []);
    setTagInput("");
  }, [article?.id, article?.tags]);

  useEffect(() => {
    if (!article) {
      setFullContent(null);
      setTranslatedContent(null);
      return;
    }

    // Guard against out-of-order responses: rapidly switching articles (j/k)
    // could otherwise let a slow response for a previous article overwrite the
    // current one's body.
    let cancelled = false;
    const currentId = article.id;
    const ownContent = article.content;

    setTranslatedContent(null);
    scrollRef.current?.scrollTo(0, 0);

    fetch("/api/articles/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId: currentId }),
    }).catch(() => {});

    if (ownContent) setFullContent(ownContent);
    else setLoadingContent(true);

    fetch(`/api/articles/${currentId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const fetched = data.data?.content;
        if (fetched && fetched.length > (ownContent?.length || 0)) {
          setFullContent(fetched);
        } else if (!ownContent) {
          setFullContent(fetched || null);
        }
      })
      .catch(() => {
        if (!cancelled && !ownContent) setFullContent(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingContent(false);
      });

    return () => {
      cancelled = true;
    };
    // Only re-run when the opened article changes, not on every field update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article?.id]);

  // Fetch related articles when article changes
  useEffect(() => {
    if (!article) {
      setRelatedArticles([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/articles/related?articleId=${encodeURIComponent(article.id)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.data) {
          setRelatedArticles(data.data);
        }
      })
      .catch(() => {
        if (!cancelled) setRelatedArticles([]);
      });
    return () => { cancelled = true; };
  }, [article?.id]);

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
  }, [fullContent, article?.id]);

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

  const addTag = useCallback(
    async (name: string) => {
      if (!article) return;
      const n = name.trim();
      if (!n) return;
      setTagInput("");
      try {
        const res = await fetch("/api/articles/tag", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ articleId: article.id, action: "add", tagName: n }),
        });
        const data = await res.json();
        if (res.ok) setTags(data.data.tags);
        else toast.error(data.error || "Failed to add tag");
      } catch {
        toast.error("Connection error");
      }
    },
    [article]
  );

  const removeTag = useCallback(
    async (tagId: string) => {
      if (!article) return;
      try {
        const res = await fetch("/api/articles/tag", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ articleId: article.id, action: "remove", tagId }),
        });
        const data = await res.json();
        if (res.ok) setTags(data.data.tags);
      } catch {
        /* silent */
      }
    },
    [article]
  );

  const handleSuggestTags = useCallback(async () => {
    if (!article || suggestingTags) return;
    setSuggestingTags(true);
    try {
      const res = await fetch("/api/ai/suggest-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId: article.id }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.data?.tags)) {
        for (const t of data.data.tags) await addTag(t);
      } else if (!res.ok) {
        toast.error(data.error || "Failed to suggest tags");
      }
    } finally {
      setSuggestingTags(false);
    }
  }, [article, suggestingTags, addTag]);

  const handleAsk = useCallback(
    async (question: string) => {
      if (!article || askLoading) return;
      const q = question.trim();
      if (!q) return;
      setAskInput("");
      setAskLoading(true);
      try {
        const res = await fetch("/api/ai/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ articleId: article.id, question: q }),
        });
        const data = await res.json();
        if (res.ok && data.data?.answer) {
          setAskThread((prev) => [...prev, { q, a: data.data.answer }]);
        } else {
          toast.error(data.error || "AI request failed");
        }
      } catch {
        toast.error("Connection error");
      } finally {
        setAskLoading(false);
      }
    },
    [article, askLoading]
  );

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

  // ─── Text-to-speech (Web Speech API, client-only, zero backend) ───
  useEffect(() => {
    setTtsSupported(typeof window !== "undefined" && "speechSynthesis" in window);
  }, []);

  const stopSpeech = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
    setTtsPaused(false);
  }, []);

  const handleSpeak = useCallback(() => {
    if (!ttsSupported) return;
    const synth = window.speechSynthesis;
    if (speaking) { stopSpeech(); return; }

    const bodyText = rawContent
      ? new DOMParser().parseFromString(rawContent, "text/html").body.textContent || ""
      : article?.summary || "";
    const text = `${article?.title || ""}. ${bodyText}`.replace(/\s+/g, " ").trim();
    if (!text) return;

    synth.cancel();
    // Chunk into sentence-sized pieces: some engines cut off very long utterances.
    const chunks = text.match(/[^.!?]+[.!?]*\s*/g)?.filter((c) => c.trim()) || [text];
    const lang = translatedContent ? translateLang : article?.feed?.language || undefined;
    let idx = 0;
    const speakNext = () => {
      if (idx >= chunks.length) { setSpeaking(false); setTtsPaused(false); return; }
      const u = new SpeechSynthesisUtterance(chunks[idx]);
      if (lang) u.lang = lang;
      u.rate = ttsRateRef.current;
      u.onend = () => { idx++; speakNext(); };
      u.onerror = () => { setSpeaking(false); setTtsPaused(false); };
      synth.speak(u);
    };
    setSpeaking(true);
    setTtsPaused(false);
    speakNext();
  }, [ttsSupported, speaking, stopSpeech, rawContent, article?.summary, article?.title, article?.feed?.language, translatedContent, translateLang]);

  const handlePauseResume = useCallback(() => {
    if (!ttsSupported) return;
    const synth = window.speechSynthesis;
    if (ttsPaused) { synth.resume(); setTtsPaused(false); }
    else { synth.pause(); setTtsPaused(true); }
  }, [ttsSupported, ttsPaused]);

  // Stop narration when switching articles or unmounting.
  useEffect(() => {
    return () => { stopSpeech(); };
  }, [article?.id, stopSpeech]);

  // ─── Highlights & annotations ───
  useEffect(() => {
    if (!article) { setHighlights([]); return; }
    let cancelled = false;
    setSelectionBox(null);
    setNoteEditId(null);
    fetch(`/api/highlights?articleId=${encodeURIComponent(article.id)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled && Array.isArray(d.data)) setHighlights(d.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [article?.id]);

  // Hide the floating highlight button while scrolling (its fixed position
  // would otherwise drift away from the now-moved selection).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setSelectionBox(null);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const handleTextSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { setSelectionBox(null); return; }
    const text = sel.toString().replace(/\s+/g, " ").trim();
    if (text.length < 3) { setSelectionBox(null); return; }
    const anchor = sel.anchorNode;
    if (!anchor || !contentRef.current?.contains(anchor)) { setSelectionBox(null); return; }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    setSelectionBox({
      text: text.slice(0, 5000),
      top: rect.top - 44,
      left: rect.left + rect.width / 2,
    });
  }, []);

  const createHighlight = useCallback(async () => {
    if (!article || !selectionBox || savingHighlight) return;
    setSavingHighlight(true);
    try {
      const res = await fetch("/api/highlights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId: article.id, text: selectionBox.text }),
      });
      const data = await res.json();
      if (res.ok) {
        setHighlights((prev) => [...prev, data.data]);
        toast.success("Highlighted");
      } else {
        toast.error(data.error || "Failed to highlight");
      }
    } catch {
      toast.error("Connection error");
    } finally {
      setSavingHighlight(false);
      setSelectionBox(null);
      window.getSelection()?.removeAllRanges();
    }
  }, [article, selectionBox, savingHighlight]);

  const deleteHighlight = useCallback(async (id: string) => {
    setHighlights((prev) => prev.filter((h) => h.id !== id));
    try {
      await fetch(`/api/highlights/${id}`, { method: "DELETE" });
    } catch {
      /* silent; list already updated optimistically */
    }
  }, []);

  const saveNote = useCallback(async (id: string) => {
    const note = noteDraft.trim();
    setNoteEditId(null);
    setHighlights((prev) => prev.map((h) => (h.id === id ? { ...h, note: note || null } : h)));
    try {
      await fetch(`/api/highlights/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note || null }),
      });
    } catch {
      toast.error("Failed to save note");
    }
  }, [noteDraft]);

  const copyHighlights = useCallback(async () => {
    if (!article || highlights.length === 0) return;
    const lines = [`# ${article.title}`, ""];
    for (const h of highlights) {
      for (const ln of h.text.split("\n")) lines.push(`> ${ln}`);
      if (h.note) lines.push("", `**Note:** ${h.note}`);
      lines.push("");
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success("Highlights copied as Markdown");
    } catch {
      toast.error("Failed to copy");
    }
  }, [article, highlights]);

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

    const siteUrl = article?.feed?.siteUrl || article?.feed?.url || "";
    let baseOrigin = "";
    try { baseOrigin = new URL(siteUrl).origin; } catch { /* ignore */ }

    let html = rawContent;

    // Fix lazy-loaded images: promote data-src/data-original to src
    html = html.replace(/<img([^>]*?)>/gi, (match, attrs: string) => {
      const hasSrc = /\bsrc\s*=\s*["'](?!data:image\/gif|about:blank|data:image\/svg)/i.test(attrs);
      if (hasSrc) return match;
      const dataSrc = attrs.match(/data-(?:src|original|lazy-src)\s*=\s*["']([^"']+)["']/i);
      if (dataSrc) {
        return `<img src="${dataSrc[1]}"${attrs}>`;
      }
      const dataOrig = attrs.match(/data-orig-file\s*=\s*["']([^"']+)["']/i);
      if (dataOrig) {
        return `<img src="${dataOrig[1]}"${attrs}>`;
      }
      return match;
    });

    // Fix protocol-relative URLs (//example.com/img.png → https://example.com/img.png)
    html = html.replace(/(src|href)\s*=\s*(["'])(\/\/[^"']*?)\2/gi, (_match, attr: string, quote: string, path: string) => {
      return `${attr}=${quote}https:${path}${quote}`;
    });

    // Fix relative URLs (/path/img.png and ./path/img.png)
    if (baseOrigin) {
      html = html.replace(/(src|href)\s*=\s*(["'])(\.?\/[^"']*?)\2/gi, (_match, attr: string, quote: string, path: string) => {
        const cleanPath = path.startsWith("./") ? path.slice(1) : path;
        return `${attr}=${quote}${baseOrigin}${cleanPath}${quote}`;
      });
    }

    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        "p", "br", "b", "i", "em", "strong", "a", "ul", "ol", "li",
        "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code",
        "img", "figure", "figcaption", "div", "span",
        "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
        "hr", "sub", "sup", "mark", "del", "ins", "abbr", "details", "summary",
        "audio", "video", "source",
      ],
      ALLOWED_ATTR: ["href", "src", "srcset", "alt", "title", "class", "target", "rel", "colspan", "rowspan", "controls", "preload", "type", "width", "height", "loading"],
      ADD_ATTR: ["target"],
      ALLOW_DATA_ATTR: false,
    });
  }, [rawContent, article?.feed?.siteUrl, article?.feed?.url]);

  // Re-apply inline highlight marks after the body renders or highlights change.
  // dangerouslySetInnerHTML replaces the DOM on content change, wiping marks, so
  // this effect keys on both displayContent and highlights.
  useEffect(() => {
    const root = contentRef.current;
    if (!root || highlights.length === 0) return;
    for (const h of highlights) markFirstOccurrence(root, h.text);
  }, [displayContent, highlights]);

  const isRtl = useMemo(() => {
    // Check feed language for known RTL languages
    const rtlLanguages = ["ar", "he", "fa", "ur"];
    const feedLang = article?.feed?.language?.toLowerCase().split(/[-_]/)[0];
    if (feedLang && rtlLanguages.includes(feedLang)) return true;

    // Fallback: check if content starts with RTL characters (Arabic, Hebrew, Persian, etc.)
    const textContent = rawContent
      ? new DOMParser().parseFromString(rawContent, "text/html").body.textContent?.trim()
      : null;
    if (textContent && /^[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.test(textContent)) {
      return true;
    }

    return false;
  }, [article?.feed?.language, rawContent]);

  if (!article) return null;

  return (
    <>
      {zoomImage && (
        <ImageZoomModal src={zoomImage} onClose={() => setZoomImage(null)} />
      )}

      {selectionBox && (
        <button
          onMouseDown={(e) => { e.preventDefault(); createHighlight(); }}
          disabled={savingHighlight}
          style={{ position: "fixed", top: selectionBox.top, left: selectionBox.left, transform: "translateX(-50%)", zIndex: 70 }}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-lg hover:opacity-90 disabled:opacity-60"
        >
          {savingHighlight ? <Loader2 size={13} className="animate-spin" /> : <Highlighter size={13} />}
          Highlight
        </button>
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
              aria-label="Summarize with AI"
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
                    aria-label="Show original"
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
                    aria-label="Translate article"
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
                  aria-label="Select translation language"
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
              aria-label="Toggle reader mode"
            >
              <BookOpen size={15} />
            </Button>

            {/* Text-to-speech */}
            {ttsSupported && (
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleSpeak}
                  className={cn(speaking && "bg-primary/10 text-primary")}
                  title={speaking ? "Stop reading" : "Read aloud"}
                  aria-label={speaking ? "Stop reading aloud" : "Read article aloud"}
                >
                  {speaking ? <Square size={14} /> : <Volume2 size={15} />}
                </Button>
                {speaking && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={handlePauseResume}
                      title={ttsPaused ? "Resume" : "Pause"}
                      aria-label={ttsPaused ? "Resume reading" : "Pause reading"}
                    >
                      {ttsPaused ? <Play size={14} /> : <Pause size={14} />}
                    </Button>
                    <button
                      onClick={() => setTtsRate((r) => {
                        const next = r >= 2 ? 0.75 : Math.round((r + 0.25) * 100) / 100;
                        ttsRateRef.current = next;
                        return next;
                      })}
                      className="flex h-7 items-center justify-center rounded-md px-1.5 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
                      title="Playback speed"
                      aria-label="Change playback speed"
                    >
                      {ttsRate}x
                    </button>
                  </>
                )}
              </div>
            )}

            <div className="flex items-center gap-0 rounded-md border border-border mx-1">
              <button
                onClick={() => setFontSize((f) => Math.max(13, f - 1))}
                className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                title="Smaller"
                aria-label="Decrease font size"
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
                aria-label="Increase font size"
              >
                <Plus size={12} />
              </button>
            </div>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleBookmark}
              title={bookmarked ? "Saved" : "Read later"}
              aria-label={bookmarked ? "Remove bookmark" : "Bookmark article"}
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
                aria-label="Share or export article"
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
              aria-label="Open original article"
            >
              <ExternalLink size={12} />
              <span className="hidden lg:inline">Original</span>
            </a>

            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ml-1"
              title="Close"
              aria-label="Close article"
            >
              <X size={15} />
            </button>
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

            {/* Tags */}
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <TagIcon size={15} className="text-muted-foreground" />
              {tags.map((t) => (
                <span
                  key={t.id}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs text-foreground"
                >
                  {t.name}
                  <button
                    onClick={() => removeTag(t.id)}
                    aria-label={`Remove tag ${t.name}`}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag(tagInput);
                  }
                }}
                placeholder="Add tag…"
                className="w-24 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs text-foreground outline-none focus:border-primary/50 focus:w-32 transition-all"
              />
              <button
                onClick={handleSuggestTags}
                disabled={suggestingTags}
                title="Suggest tags with AI"
                aria-label="Suggest tags with AI"
                className="inline-flex items-center gap-1 rounded-full border border-primary/40 px-2.5 py-0.5 text-xs text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
              >
                {suggestingTags ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Sparkles size={12} />
                )}
                AI
              </button>
            </div>

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

            {/* Ask AI */}
            <div className="mb-6 rounded-xl border border-border bg-muted/30 p-4">
              <button
                onClick={() => setAskOpen((v) => !v)}
                className="flex w-full items-center gap-2 text-left"
                aria-expanded={askOpen}
              >
                <MessageSquare size={16} className="text-primary" />
                <span className="text-sm font-bold text-foreground">Ask AI</span>
                <ChevronDown
                  size={15}
                  className={cn(
                    "ml-auto text-muted-foreground transition-transform",
                    askOpen && "rotate-180"
                  )}
                />
              </button>

              {askOpen && (
                <div className="mt-3 space-y-3">
                  {askThread.length === 0 && !askLoading && (
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: "Key points", q: "What are the key points of this article?" },
                        { label: "Simplify", q: "Explain this article in simple terms." },
                        { label: "Why it matters", q: "Why does this matter and who is affected?" },
                      ].map((preset) => (
                        <button
                          key={preset.label}
                          onClick={() => handleAsk(preset.q)}
                          className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {askThread.map((turn, i) => (
                    <div key={i} className="space-y-1.5">
                      <p className="text-sm font-medium text-foreground">{turn.q}</p>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                        {turn.a}
                      </p>
                    </div>
                  ))}

                  {askLoading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 size={14} className="animate-spin" />
                      Thinking…
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <input
                      value={askInput}
                      onChange={(e) => setAskInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleAsk(askInput);
                        }
                      }}
                      placeholder="Ask a question about this article…"
                      disabled={askLoading}
                      className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 disabled:opacity-60"
                    />
                    <button
                      onClick={() => handleAsk(askInput)}
                      disabled={askLoading || !askInput.trim()}
                      aria-label="Send question"
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      <Send size={15} />
                    </button>
                  </div>
                </div>
              )}
            </div>

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
              onMouseUp={handleTextSelection}
              onTouchEnd={handleTextSelection}
              dir={isRtl ? "rtl" : undefined}
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
                    className="inline-flex items-center gap-2 rounded-xl border border-primary bg-transparent px-5 py-2.5 text-sm font-semibold text-primary hover:bg-primary/10 transition-all"
                  >
                    <ExternalLink size={14} />
                    Read on original site
                  </a>
                </div>
              )}
            </div>

            {/* Highlights */}
            {highlights.length > 0 && (
              <div className="mt-8 border-t border-border pt-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <Highlighter size={14} className="text-amber-500" />
                    Highlights
                    <span className="font-normal text-muted-foreground">({highlights.length})</span>
                  </h3>
                  <button
                    onClick={copyHighlights}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <FileText size={12} />
                    Copy as Markdown
                  </button>
                </div>
                <ul className="space-y-3">
                  {highlights.map((h) => (
                    <li key={h.id} className="rounded-xl border border-border bg-muted/30 p-3">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="border-l-2 border-amber-400/60 pl-3 text-sm italic text-foreground">
                            {h.text}
                          </p>
                          {noteEditId === h.id ? (
                            <div className="mt-2 flex items-center gap-2">
                              <input
                                autoFocus
                                value={noteDraft}
                                onChange={(e) => setNoteDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") { e.preventDefault(); saveNote(h.id); }
                                  if (e.key === "Escape") setNoteEditId(null);
                                }}
                                placeholder="Add a note…"
                                maxLength={2000}
                                className="flex-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary/50"
                              />
                              <button
                                onClick={() => saveNote(h.id)}
                                className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
                              >
                                Save
                              </button>
                            </div>
                          ) : h.note ? (
                            <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                              <StickyNote size={12} className="mt-0.5 shrink-0" />
                              {h.note}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <button
                            onClick={() => { setNoteEditId(h.id); setNoteDraft(h.note || ""); }}
                            title="Add / edit note"
                            aria-label="Add or edit note"
                            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          >
                            <StickyNote size={13} />
                          </button>
                          <button
                            onClick={() => deleteHighlight(h.id)}
                            title="Delete highlight"
                            aria-label="Delete highlight"
                            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

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

            {/* Related Articles */}
            {relatedArticles.length > 0 && (
              <div className="border-t border-border pt-5 pb-6">
                <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                  <Rss size={14} className="text-muted-foreground" />
                  Related Articles
                </h3>
                <ul className="space-y-2.5">
                  {relatedArticles.map((ra) => (
                    <li key={ra.id}>
                      <a
                        href={isSafeUrl(ra.url) ? ra.url : "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-start gap-2 rounded-lg px-2.5 py-2 -mx-2.5 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground group-hover:text-primary leading-snug line-clamp-2">
                            {ra.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-muted-foreground">{ra.feedTitle}</span>
                            {ra.publishedAt && (
                              <>
                                <span className="text-[10px] text-muted-foreground">·</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {formatDistanceToNow(new Date(ra.publishedAt), { addSuffix: true })}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <ExternalLink size={12} className="text-muted-foreground shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        </div>
      </div>
    </>
  );
});
