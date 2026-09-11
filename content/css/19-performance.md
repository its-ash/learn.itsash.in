---
title: "19 — CSS Performance: Render Path, Containment & GPU Layers"
description: "Render-blocking CSS and critical-CSS inlining, right-to-left selector matching, layout thrashing, content-visibility:auto, contain, will-change memory cost, and the width-animation trap. Code-first reference for 60fps and fast FCP."
---

# 19 — CSS Performance: Render Path, Containment & GPU Layers

CSS performance has two domains: **load** (parse, render-blocking → FCP/LCP) and **runtime** (layout, paint, composite → scroll/input smoothness). The render pipeline is: style → layout → paint → composite. Animating `transform`/`opacity` skips layout and paint (compositor-only). Everything else triggers layout or paint — the source of jank.

## Render-Blocking CSS — inline critical, async the rest

::code-wrapper{language="html"}
```html
<head>
  <style>
    /* Critical above-the-fold CSS inlined → removes a render-blocking round trip. */
    body { font-family: system-ui, sans-serif; }
    .hero { /* above-the-fold only */ }
  </style>
  <!-- Non-critical CSS: preload without blocking, swap to stylesheet on load. -->
  <link rel="preload" href="/assets/app.[hash].css" as="style" onload="this.rel='stylesheet'">
  <noscript><link rel="stylesheet" href="/assets/app.[hash].css"></noscript>
</head>
```
::

## Selector Matching — right-to-left

::code-wrapper{language="css"}
```css
/* The engine matches the RIGHTMOST selector (the "key") first, then walks UP the DOM.
   Deep descendant chains are O(depth) per key match. BEM's flat single-class is O(1). */
.nav a { }              /* find every <a>, check if ancestor is .nav */
.card:hover .title { } /* find every .title, check if ancestor is .card AND .card:hover */
/* Tips: avoid universal keys (*, [class]); prefer classes over tags; keep chains shallow. */
/* In practice, selector perf rarely matters on modern browsers — focus on layout/paint costs. */
```
::

## Layout Thrashing — batch reads and writes

::code-wrapper{language="javascript"}
```javascript
// ❌ Alternating read (forces sync reflow) and write (schedules layout) in a loop → reflow EACH iteration.
items.forEach(item => {
  item.style.width = item.offsetWidth + 10 + 'px';  // read (reflow), write (schedule) — reflow per item
});

// ✓ Batch all reads first, then all writes → ONE reflow.
const widths = items.map(item => item.offsetWidth);  // all reads (one reflow)
items.forEach((item, i) => { item.style.width = widths[i] + 10 + 'px'; });  // all writes (one layout)
```
::

## The Performance Rule — what triggers what

::code-wrapper{language="text"}
```text
Change              Cost              Animate?
transform           Compositor (GPU)  ✅ 60fps
opacity             Compositor (GPU)  ✅ 60fps
filter              Compositor (mostly) ✅
color/bg-color      Paint             ⚠️ OK
box-shadow          Paint             ⚠️ (use pseudo-element opacity instead)
width/height        Layout            ❌ expensive (re-flows descendants)
top/left/margin     Layout            ❌ expensive
font-family/size    Layout            ❌ re-renders text
display/position    Layout            ❌ significant
```
::

### Anti-pattern: animating width triggers layout every frame

::code-wrapper{language="css"}
```css
/* ❌ width triggers layout every frame → janky, especially on mobile. */
.sidebar { width: 250px; transition: width 0.3s ease; }
.sidebar.collapsed { width: 0; }
```
::

::code-wrapper{language="css"}
```css
/* ✓ transform (compositor-only, GPU, no layout). */
.sidebar { width: 250px; transition: transform 0.3s ease; transform: translateX(0); }
.sidebar.collapsed { transform: translateX(-100%); }

/* ✓ grid-template-columns: Xfr → Yfr (interpolable, resizes both sidebar and content smoothly). */
.layout { display: grid; grid-template-columns: 250px 1fr; transition: grid-template-columns 0.3s ease; }
.layout.collapsed { grid-template-columns: 0fr 1fr; }
.sidebar { overflow: hidden; }
```
::

## `content-visibility: auto` — skip off-screen rendering

::code-wrapper{language="css"}
```css
/* Skips layout + paint for off-screen elements → massive win for long lists/feeds.
   contain-intrinsic-size gives a placeholder so the scrollbar is accurate (no jumps). */
.long-list-item {
  content-visibility: auto;
  contain-intrinsic-size: 0 50px;  /* (width height) placeholder estimate */
}
/* Support: Chrome 85+, Safari 18+, Firefox 125+. */
```
::

## `contain` — isolate a subtree

::code-wrapper{language="css"}
```css
/* Tells the browser the element's internals don't affect the rest of the page → optimization. */
.card { contain: layout paint style; }  /* layout + paint + style isolation */
/* Values: layout, paint, style, size, strict (all), content (all except size).
   Use on isolated components (cards, widgets, third-party embeds). */
```
::

## GPU Layers & `will-change` — memory cost

::code-wrapper{language="css"}
```css
/* transform/opacity/filter/will-change promote to GPU layers. Good for animation, costs RAM. */
.modal { will-change: transform, opacity; }  /* hint: promote before animating */
.modal.closed { will-change: auto; }          /* remove after → frees GPU memory */
/* ❌ * { will-change: transform; } → every element gets a GPU layer → OOM on mobile.
   Add will-change just before the animation, remove after. Never leave it permanently. */
```
::

## Font Performance

::code-wrapper{language="css"}
```css
@font-face {
  font-family: "Inter";
  src: url("inter.woff2") format("woff2");  /* woff2 = best compression */
  font-display: swap;  /* show fallback immediately, swap when loaded → no FOIT */
  unicode-range: U+0000-00FF;  /* subset to Latin only → smaller download */
}
```
::

::code-wrapper{language="html"}
```html
<link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>
```
::

## Measuring

::code-wrapper{language="bash"}
```bash
# Chrome DevTools → Performance: record → see layout/paint/composite times per frame.
# Rendering tab: Paint flashing (repaint regions), Layout Shift Regions (CLS), FPS meter.
# Coverage tab: % unused CSS per file → purge targets.
# Lighthouse: audits render-blocking CSS, unused CSS, FCP/LCP.
```
::

## 💡 Tips & Tricks

- **Idiom**: animate `transform`/`opacity` (compositor-only, GPU) — never `width`/`height`/`top`/`left` (layout). `transform: translateX()` for position, `scale()` for size, `grid-template-columns: Xfr → Yfr` for collapsible panels.
- **Idiom**: `content-visibility: auto` + `contain-intrinsic-size` for long lists — skips rendering off-screen items. Massive perf win for feeds/tables. The browser only layouts/paints visible items.
- **Idiom**: `contain: layout paint` on isolated components — tells the browser the subtree doesn't affect the page → optimization. Use on cards, widgets, third-party embeds.
- **Idiom**: inline critical CSS, preload the rest — `<style>` for above-the-fold, `<link rel="preload" as="style" onload="this.rel='stylesheet'">` for the rest. Removes the render-blocking CSS for first paint.
- **Idiom**: `font-display: swap` + `<link rel="preload">` for critical fonts — fallback text shows instantly, font swaps when loaded, preload minimizes the swap window. Use `woff2` + `unicode-range` subsetting.

## ⚠️ Edge Cases & Gotchas

- **Layout thrashing**: alternating `offsetWidth` reads and `style.width` writes in a loop forces reflow each iteration. Batch reads (all first), then writes.
- **`will-change` on too many elements wastes memory**: each gets a GPU layer (RAM). Use only for elements about to animate, remove after.
- **`content-visibility: auto` needs `contain-intrinsic-size`**: without it, off-screen elements have 0 height → scrollbar jumps as you scroll.
- **Render-blocking CSS is intentional**: CSS in `<head>` blocks rendering to avoid FOUC. Don't make all CSS async — only non-critical. Inline the critical.
- **`@import` is serial + render-blocking**: CSS importing CSS importing CSS. Use `<link>` (parallel) or bundle. Never `@import` in production.
- **`font-display: swap` causes FOUT**: fallback shows, then swaps — a flash. Acceptable for body text; `optional` avoids the swap (may not load).
- **Unused CSS**: large frameworks ship CSS you don't use. Purge (PurgeCSS, Tailwind purge) or check the Coverage tab.

## 🧠 Spot the Bug

::code-wrapper{language="css"}
```css
.sidebar { width: 250px; transition: width 0.3s ease; }
.sidebar.collapsed { width: 0; }
```
::

<details>
<summary>Answer</summary>

Animating `width` triggers **layout** every frame — the browser recomputes the width of `.sidebar` and the layout of everything depending on it (the main content, descendants). On mobile (slower CPUs), this drops frames → janky. Fix: `transform: translateX(-100%)` (compositor-only, GPU, no layout) or `grid-template-columns: 250px 1fr → 0fr 1fr` (interpolable, resizes sidebar + content smoothly). The lesson: never animate `width`/`height`/`top`/`left` — use `transform` or `grid-template`.

</details>
