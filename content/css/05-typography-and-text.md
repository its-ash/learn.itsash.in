---
title: "05 — Typography Engine: Font Loading, Variable Fonts & Text Overflow"
description: "Font-display strategies, variable font axes, line-height unitless math, single and multi-line truncation, and white-space/word-break edge cases. Code-first reference for production typography systems."
---

# 05 — Typography Engine: Font Loading, Variable Fonts & Text Overflow

Typography is 80% of web UI. The engine handles it through: font matching (fallback stack), font loading (FOIT/FOUT), text layout (line boxes, wrapping, truncation), and OpenType features (variable font axes). Every "my text overlaps" or "my font flashes" bug is in one of these stages.

## Font Stack — the fallback chain

::code-wrapper{language="css"}
```css
:root {
  /* System stack: 0KB download, native OS UI font. The production default. */
  --font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  /* The engine tries each in order. The LAST must be a generic family (guaranteed to exist).
     Quote multi-word names. Generic: serif | sans-serif | monospace | cursive | fantasy | system-ui. */
}
```
::

## `@font-face` — loading strategy with `font-display`

::code-wrapper{language="css"}
```css
@font-face {
  font-family: "Inter";
  src: url("inter.woff2") format("woff2-variations"),  /* variable font: best compression + all weights in one file */
       url("inter-static.woff2") format("woff2");        /* fallback: static weight */
  font-weight: 100 900;       /* RANGE — declares this face covers all weights (variable font) */
  font-style: normal;
  font-display: swap;         /* show fallback IMMEDIATELY, swap when loaded → no invisible text (FOIT) */
  /* font-display values:
     auto    = browser decides (usually swap)
     block   = invisible up to 3s, then swap (FOIT for 3s — bad)
     swap    = fallback immediately, swap when ready (FOUT — recommended for body text)
     fallback = 100ms invisible, 3s swap window, may not load at all (good for decorative)
     optional = 100ms invisible, no swap — if it doesn't load fast, never shows (zero layout shift) */
  unicode-range: U+0000-00FF;  /* only load Latin glyphs → smaller download for CJK pages */
}
```
::

### Anti-pattern: blocking font load with invisible text

::code-wrapper{language="css"}
```css
/* ❌ font-display: block (or no font-display on some browsers) → invisible text for up to 3s
   while the font loads. Users see a blank page. Bounce. */
@font-face { font-family: "BrandFont"; src: url("brand.woff2"); }
```
::

::code-wrapper{language="css"}
```css
/* ✓ font-display: swap → fallback text shows instantly, font swaps when ready.
   Pair with <link rel="preload"> for the critical font to minimize the swap window. */
@font-face { font-family: "BrandFont"; src: url("brand.woff2") format("woff2"); font-display: swap; }
```
::

::code-wrapper{language="html"}
```html
<!-- Preload the critical font → starts downloading before CSS parses -->
<link rel="preload" href="/fonts/brand.woff2" as="font" type="font/woff2" crossorigin>
```
::

## Variable Fonts — continuous weight axes

::code-wrapper{language="css"}
```css
@font-face {
  font-family: "Inter";
  src: url("inter.woff2") format("woff2-variations");
  font-weight: 100 900;  /* declares the weight RANGE. Without this, font-weight:450 won't work. */
  font-stretch: 75% 125%; /* width axis (condensed ↔ expanded) */
}
.heading { font-weight: 580; }  /* any value in the range — no separate font file per weight */
.body { font-weight: 430; font-stretch: 100%; }
/* One file = all weights. Saves KB vs loading 400/500/600/700 separately. */
```
::

## `line-height` — why unitless is the only correct choice

::code-wrapper{language="css"}
```css
body { line-height: 1.5; }  /* unitless: 1.5 × EACH element's font-size, computed per-element */
/* h1 with font-size: 3rem (48px) → line-height: 72px (1.5 × 48). Correct. */
```
::

### Anti-pattern: line-height with a unit causes overlap

::code-wrapper{language="css"}
```css
/* ❌ px/em line-height is a FIXED value inherited as-is → doesn't scale with child font-size */
body { line-height: 24px; font-size: 16px; }
h1 { font-size: 3rem; }  /* inherits 24px line-height on 48px text → lines OVERLAP (24 < 48) */
```
::

::code-wrapper{language="css"}
```css
/* ✓ unitless line-height is computed per-element → scales with each child's font-size */
body { line-height: 1.5; }
h1 { font-size: 3rem; }  /* line-height: 72px (1.5 × 48). No overlap. */
```
::

## Text Truncation — single and multi-line

::code-wrapper{language="css"}
```css
/* Single-line ellipsis: the trio. All three required. */
.truncate {
  white-space: nowrap;        /* prevent wrapping */
  overflow: hidden;           /* clip what doesn't fit */
  text-overflow: ellipsis;    /* show … at the clip point */
}

/* Multi-line clamp: -webkit-box is still the standard (line-clamp property is landing but partial) */
.clamp-3 {
  display: -webkit-box;            /* deprecated but the only way line-clamp works */
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;           /* show 3 lines, then … */
  overflow: hidden;
}
```
::

## `white-space` — the wrapping control matrix

::code-wrapper{language="text"}
```text
Value      Spaces    Newlines   Wrapping    Use case
normal     collapse  collapse   wrap        default body text
nowrap     collapse  collapse   NO wrap     horizontal scroller items, truncation
pre        preserve  preserve   NO wrap     <pre>-like code display
pre-wrap   preserve  preserve   wrap        code with long lines that should wrap
pre-line   collapse  preserve   wrap        user input with explicit line breaks
```
::

## Word breaking — `overflow-wrap` vs `word-break`

::code-wrapper{language="css"}
```css
/* overflow-wrap: break-word → breaks ONLY when a word would overflow. Gentle, preferred. */
.url { overflow-wrap: break-word; }  /* long URL breaks only if it can't fit */

/* word-break: break-all → breaks ANYWHERE, even mid-word. Aggressive, hurts CJK readability. */
.cjk { word-break: break-all; }  /* don't use for Latin text — splits words mid-character */

/* hyphens: auto → browser hyphenates using dictionary. Needs lang attribute. */
[lang="en"] p { hyphens: auto; -webkit-hyphens: auto; }  /* requires <html lang="en"> */
```
::

## 💡 Tips & Tricks

- **Idiom**: `font-display: optional` for non-critical fonts → zero layout shift (if it doesn't load in ~100ms, the browser never swaps). Use for decorative/brand fonts where FOUT is worse than never loading.
- **Idiom**: `unicode-range` to subset `@font-face` → a CJK page only loads the Latin face for Latin text, not the full CJK font. Dramatic KB savings.
- **Idiom**: variable fonts (one file, all weights) replace 4–6 static font files. Declare `font-weight: 100 900` in `@font-face` or arbitrary weights won't work.
- **Idiom**: `text-wrap: balance` for headings (evens line lengths, no manual `<br>`) and `text-wrap: pretty` for paragraphs (avoids single-word last line). Free typography polish, no JS.
- **Idiom**: `font-size: clamp(1rem, 0.9rem + 0.5vw, 1.25rem)` — fluid body type bounded by rem → respects user font-size setting, no media queries.

## ⚠️ Edge Cases & Gotchas

- **`@font-face` `src` order matters**: list `woff2` first (best compression), then `woff`. The browser picks the first format it supports.
- **`line-height` with `em`/`px` inherits as a computed value**: `line-height: 1.5em` on body computes to `24px` (at 16px font) and inherits as `24px` — same trap as `px`. Unitless is the only safe choice.
- **`vertical-align` only works on inline/table-cell elements**: it does NOT vertically center block elements. Use flexbox `align-items: center` for block centering.
- **`text-align: justify` creates whitespace "rivers"**: especially with short words or narrow columns. Prefer `left` for screen readability; `justify` for print.
- **Variable fonts need the axis range declared**: `font-weight: 100 900;` in `@font-face`. Without it, `font-weight: 450` may not work (the browser doesn't know the font supports that weight).
- **`hyphens: auto` requires the `lang` attribute**: `<html lang="en">` — without it, the browser can't look up hyphenation rules. Safari needs `-webkit-hyphens`.

## 🧠 Spot the Bug

::code-wrapper{language="css"}
```css
body { line-height: 20px; font-size: 16px; }
h1 { font-size: 3rem; }
```
::

<details>
<summary>Answer</summary>

`line-height: 20px` is inherited by `h1` as a fixed 20px value. `h1`'s font-size is `3rem` (48px). A 20px line-height on 48px text is smaller than the text → lines overlap (the text is taller than the line box). Fix: `line-height: 1.5` (unitless) — computed per-element: `h1` gets 72px (1.5 × 48), body gets 24px (1.5 × 16). Both proportional. A unit (`px` or `em`) is a fixed inherited value that doesn't scale with the child's font-size.

</details>
