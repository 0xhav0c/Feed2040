# Design System Master File

## ✅ Approved decisions (2026-10-31) — these override the generated sections below

The user chose mockup **B · AI-Native** (`reference-b-ai-native.html` in this folder). The generated
values further down are the raw ui-ux-pro-max output (light, generic, landing-page oriented).
**Where they conflict, this section wins.** The landing "Page Pattern" does not apply: this is an app.

**Mode:** dark-first (default theme = dark); light theme kept as an option and derived from
the generated light palette. Every text/background pair below meets WCAG AA (≥ 4.5:1).

| Token (shadcn var) | Dark | Light | Use |
|---|---|---|---|
| `--background` | `#09090F` | `#F7F7FB` | app canvas, reader |
| `--card` / `--popover` | `#111119` / `#15151F` | `#FFFFFF` | list pane, cards, menus |
| `--foreground` | `#EDEDF5` | `#1E1B4B` | primary text |
| `--muted` / `--secondary` | `#181824` | `#ECEEF9` | chips, hover rows, segmented bg |
| `--muted-foreground` | `#A1A1B5` (7.4:1) | `#475569` | secondary text |
| `--accent` | `#1C1C2A` | `#EEEAFB` | shadcn hover surface (NOT a brand colour) |
| `--border` / `--input` | `#262637` / `#2A2A3C` | `#E5E1F5` / `#DDD8EE` | hairlines |
| `--primary` | `#A78BFA` (7.3:1) | `#6D28D9` (7.1:1) | text links, icons, focus ring, active state |
| `--primary-foreground` | `#0B0B12` | `#FFFFFF` | text on `bg-primary` |
| `--brand` | `#7C3AED` | `#7C3AED` | **filled** CTAs (default Button), logo gradient start |
| `--brand-foreground` | `#FFFFFF` (5.7:1) | `#FFFFFF` | text on `bg-brand` |
| `--signal` | `#22D3EE` | `#0E7490` | unread dot, AI gradient end, live states |
| `--destructive` | `#F87171` | `#DC2626` | errors, delete |

Why two violets: no single violet reaches 4.5:1 both as text on `#09090F` and under white
button text (`#7C3AED`: 3.5 / 5.7; `#A78BFA`: 7.3 / 2.7). Text uses `primary`, fills use `brand`.

**Typography:** Inter (latin + latin-ext for Turkish), `font-feature-settings: "cv11","ss01"`.
UI 13–14px; list titles 14.5px/600 unread, 500 read; reader title 30px/700 tracking -0.02em;
reader body 16.5px / 1.75. Numbers `tabular-nums`.

**Signature components**
- *AI surfaces* (summary, briefing, ask): 1px gradient border `brand → signal`, `--card` fill,
  radius 14px, label "Summary by AI" with Sparkles icon in `primary`.
- *Ask box*: pinned to the bottom of the reader, blurred `--muted` glass, brand send button.
- *Selected list row*: left 2px `primary` bar + violet wash gradient. Unread: `signal` dot with soft glow.
- *Segmented filters* (All / Unread / Today) instead of separate pills.
- *⌘K* search/jump button at the top of the sidebar.
- *Navigation*: Overview, All Feeds, Daily Briefing, Library (= bookmarks + saved links), Settings.
  Mobile: bottom tab bar (Feeds / Briefing / Library / Settings), 44px targets.
- Icons: Lucide only, stroke 1.75; no emoji in UI chrome.
- Motion: 150–200ms colour/opacity transitions; respect `prefers-reduced-motion`.

---


> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Feed2040
**Generated:** 2026-10-31 01:37:01
**Category:** AI/Chatbot Platform
**Design Dials:** Variance 6/10 (Balanced / Modern) | Density 8/10 (Dense / Dashboard)

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#7C3AED` | `--color-primary` |
| On Primary | `#FFFFFF` | `--color-on-primary` |
| Secondary | `#A78BFA` | `--color-secondary` |
| On Secondary | `#0F172A` | `--color-on-secondary` |
| Accent/CTA | `#0891B2` | `--color-accent` |
| On Accent/CTA | `#000000` | `--color-on-accent` |
| Background | `#FAF5FF` | `--color-background` |
| Foreground | `#1E1B4B` | `--color-foreground` |
| Card | `#FFFFFF` | `--color-card` |
| Card Foreground | `#1E1B4B` | `--color-card-foreground` |
| Muted | `#ECEEF9` | `--color-muted` |
| Muted Foreground | `#475569` | `--color-muted-foreground` |
| Border | `#DDD6FE` | `--color-border` |
| Destructive | `#DC2626` | `--color-destructive` |
| On Destructive | `#FFFFFF` | `--color-on-destructive` |
| Ring | `#7C3AED` | `--color-ring` |

**Color Notes:** AI purple + cyan interactions [Accent adjusted from #06B6D4]

### Typography

- **Heading Font:** Inter
- **Body Font:** Inter
- **Mood:** dark, cinematic, technical, precision, clean, premium, developer, professional, high-end utility
- **Google Fonts:** [Inter + Inter](https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap)

**CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
```

### Spacing Variables

*Density: 8/10 — Dense / Dashboard*

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `2px` / `0.125rem` | Tight gaps |
| `--space-sm` | `4px` / `0.25rem` | Icon gaps, inline spacing |
| `--space-md` | `8px` / `0.5rem` | Standard padding |
| `--space-lg` | `12px` / `0.75rem` | Section padding |
| `--space-xl` | `16px` / `1rem` | Large gaps |
| `--space-2xl` | `24px` / `1.5rem` | Section margins |
| `--space-3xl` | `32px` / `2rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: #0891B2;
  color: #000000;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #7C3AED;
  border: 2px solid #7C3AED;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #FAF5FF;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #7C3AED;
  outline: none;
  box-shadow: 0 0 0 3px #7C3AED20;
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** AI-Native UI

**Keywords:** Chatbot, conversational, voice, assistant, agentic, ambient, minimal chrome, streaming text, AI interactions

**Best For:** AI products, chatbots, voice assistants, copilots, AI-powered tools, conversational interfaces

**Key Effects:** Typing indicators (3-dot pulse), streaming text animations, pulse animations, context cards, smooth reveals

### Page Pattern

**Pattern Name:** Product Demo + Features

- **Conversion Strategy:** Use an interactive demo only when it explains value better than static media. Provide captions, transcript, visible play/pause controls, and a non-video fallback; do not autoplay under reduced motion. Pause media when offscreen or hidden and keep the final product state available as static content.
- **CTA Placement:** Video center + CTA right/bottom
- **Section Order:** Hero > Product video/mockup (center) > Feature breakdown per section > Comparison (optional) > CTA

---

## Anti-Patterns (Do NOT Use)

- ❌ Heavy chrome
- ❌ Slow response feedback

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
