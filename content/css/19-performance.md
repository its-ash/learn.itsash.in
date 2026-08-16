# 19 — CSS Performance

CSS performance affects load (parse, render-blocking) and runtime (paint, layout, compositing). Optimizing CSS improves First Contentful Paint (FCP), interaction speed, and scroll smoothness.

## Render-Blocking CSS

CSS in `<head>` (via `<link>`) is render-blocking — the browser waits for the CSS to load and parse before rendering. This is *good* (avoids FOUC — flash of unstyled content), but it means CSS blocks the first paint.

### Optimization

- **Inline critical CSS** — put the above-the-fold CSS in a `<style>` tag in `<head>`, load the rest asynchronously.
- **Preload key CSS** — `<link rel="preload" href="styles.css" as="style" onload="this.rel='stylesheet'">` loads without blocking, then applies when ready.
- **Minify CSS** — remove whitespace/comments for smaller files.
- **HTTP/2 multiplexing** — split CSS into a few files (by page/section) for better caching; HTTP/2 handles parallel downloads. (HTTP/1.1: fewer files to avoid connection limits.)

### Critical CSS inlining

::code-wrapper{language="html"}
```html
<head>
	<style>
		/* Critical above-the-fold CSS */
		body { font-family: sans-serif; }
		.header { ... }
		.hero { ... }
	</style>
	<link rel="preload" href="full.css" as="style" onload="this.rel='stylesheet'">
	<noscript><link rel="stylesheet" href="full.css"></noscript>
</head>
```

Tools like `critical` (npm) extract above-the-fold CSS automatically.

## Selectors and Performance

Modern browsers match selectors **right-to-left** (from the key selector). The rightmost selector (the "key") is matched first, then ancestors are checked.

::code-wrapper{language="css"}
```css
/* Right-to-left: find every <a>, check if it's in .nav */
.nav a { ... }

/* Right-to-left: find every .title, check if it's in .card and .card:hover */
.card:hover .title { ... }
```

### Selector performance tips
- **Avoid universal selectors as keys**: `* { ... }` and `[class] { ... }` match every element.
- **Avoid deep descendant combinators**: `.a .b .c .d .e` checks 4 ancestors for every `.e`.
- **Prefer classes over tag selectors**: `.btn` is faster than `button` (fewer matches).
- **BEM's flat selectors are optimal**: `.card__title` (0,1,0) is a single class — no ancestor checking.

In practice, selector performance rarely matters (modern browsers are fast). Focus on reducing layout/paint/compositing costs instead.

## Layout Thrashing

Reading layout properties (`offsetWidth`, `getBoundingClientRect`, `getComputedStyle`) forces the browser to flush pending style changes (synchronous reflow). Writing layout properties (setting `style.width`) schedules a layout. Alternating reads and writes in a loop ("layout thrashing") forces a reflow *each iteration*:

::code-wrapper{language="javascript"}
```javascript
// ❌ layout thrashing
items.forEach(item => {
	item.style.width = item.offsetWidth + 10 + 'px';   // read (reflow), write (schedule)
});

// ✓ batch reads and writes
const widths = items.map(item => item.offsetWidth);   // all reads first
items.forEach((item, i) => {
	item.style.width = widths[i] + 10 + 'px';          // all writes
});
```

This is mostly a JS concern, but CSS properties that trigger layout (`width`, `height`, `margin`, `padding`, `top`/`left`) contribute.

## What Triggers What

| Change | Cost |
|---|---|
| `color`, `background-color` | Paint |
| `box-shadow`, `text-shadow` | Paint |
| `transform`, `opacity` | Compositing (GPU, cheap) |
| `width`, `height`, `margin`, `padding` | Layout (expensive) |
| `top`, `left`, `right`, `bottom` (positioned) | Layout |
| `font-family`, `font-size` | Layout (re-renders text) |
| `display`, `position`, `float` | Layout (significant) |

Animate `transform` and `opacity` (compositor-only). Avoid animating layout properties.

## Compositing and GPU Layers

`transform`, `opacity`, `filter`, and `will-change` promote elements to their own GPU layers. This is good for animation (60fps) but costs memory — each layer uses RAM. Don't over-promote:

::code-wrapper{language="css"}
```css
/* ❌ too many GPU layers */
* { will-change: transform; }

/* ✓ only elements about to animate */
.modal { will-change: transform, opacity; }   /* before opening */
.modal { will-change: auto; }                 /* after, remove it */
```

## `content-visibility: auto`

::code-wrapper{language="css"}
```css
.long-list-item {
	content-visibility: auto;       /* skip rendering off-screen */
	contain-intrinsic-size: 0 50px;  /* placeholder size */
}
```

`content-visibility: auto` skips rendering (layout, paint) for off-screen elements — huge performance win for long lists/feeds. `contain-intrinsic-size` gives a placeholder size so the scrollbar is accurate. Browser support: Chrome 85+, Safari 18+, Firefox 125+.

## `contain`

::code-wrapper{language="css"}
```css
.card {
	contain: layout paint style;   /* isolate this subtree */
}
```

`contain` tells the browser the element's internals don't affect the rest of the page — optimization. Values: `layout`, `paint`, `style`, `size`, `strict` (all), `content` (all except `size`). Use on isolated components (cards, widgets).

## Font Performance

- **`font-display: swap`** — show fallback text immediately, swap when the font loads (avoids invisible text):
::code-wrapper{language="css"}
```css
@font-face {
	font-family: "MyFont";
	src: url("myfont.woff2") format("woff2");
	font-display: swap;
}
```
- **Preload critical fonts** — `<link rel="preload" href="font.woff2" as="font" type="font/woff2" crossorigin>`.
- **Use `woff2`** — best compression.
- **Subset fonts** — include only the characters you need (especially for icon fonts).

## `will-change` (recap)

Use `will-change` as a hint *before* an animation, remove it after. Don't leave it on permanently (wastes memory).

## Measuring

- **Chrome DevTools → Performance** — record and see layout/paint/composite times.
- **Chrome DevTools → Rendering** — "Paint flashing" highlights repainted areas; "Layout Shift Regions" shows CLS.
- **Lighthouse** — audits CSS performance (unused CSS, render-blocking).
- **Coverage tab** — shows what % of each CSS file is used on the current page.

## 💡 Tips & Tricks

- **Idiom**: animate `transform` and `opacity` (not `width`/`height`/`top`/`left`) — they're compositor-only (GPU), no layout/paint, 60fps. `transform: translateX()` instead of `left`, `transform: scale()` instead of `width`/`height`.
- **Idiom**: use `content-visibility: auto` + `contain-intrinsic-size` for long lists — it skips rendering off-screen items, a massive performance win for feeds/tables. The browser only layouts/paints visible items.
- **Idiom**: use `contain: layout paint` on isolated components — it tells the browser the component's internals don't affect the rest of the page, enabling optimizations. Use on cards, widgets, third-party embeds.
- **Idiom**: use `font-display: swap` on web fonts — it shows fallback text immediately and swaps when the font loads, avoiding invisible text (FOIT). Pair with `<link rel="preload">` for the critical font.
- **Idiom**: inline critical CSS and preload the rest — put above-the-fold CSS in a `<style>` tag, load the full stylesheet via `<link rel="preload" as="style" onload="this.rel='stylesheet'">`. This removes the render-blocking CSS for the first paint.

## ⚠️ Edge Cases & Gotchas

- **Layout thrashing**: alternating `offsetWidth` reads and `style.width` writes in a loop forces a reflow each iteration. Batch reads (all first) then writes.
- **`will-change` on too many elements wastes memory**: each `will-change` element gets a GPU layer (RAM). Use only for elements about to animate, remove after.
- **`content-visibility: auto` needs `contain-intrinsic-size`**: without it, off-screen elements have 0 height, making the scrollbar inaccurate (jumps as you scroll). The intrinsic size is a placeholder estimate.
- **Render-blocking CSS is intentional**: CSS in `<head>` blocks rendering to avoid FOUC. Don't make all CSS async — only non-critical CSS. Inline the critical CSS.
- **Universal selectors (`*`) are slow**: `* { ... }` and `* + * { ... }` (lobotomized owl) match every element. Use sparingly; modern browsers handle them OK, but they're not free.
- **Deep descendant selectors**: `.a .b .c .d .e` checks 4 ancestors for every `.e`. BEM's flat `.block__element` avoids this.
- **`@import` is render-blocking and serial**: `@import url("other.css")` blocks rendering and loads serially (CSS importing CSS importing CSS). Use `<link>` (parallel) or bundle. Avoid `@import` in production.
- **GPU layers cost memory**: each `will-change`/`transform`/`filter` element gets a layer. 1000 layers = significant RAM. Use on animating elements only.
- **`font-display: swap` causes FOUT**: the fallback font shows, then swaps — a flash of unstyled (fallback) text. Acceptable for most sites; `optional` avoids the swap but might not load the font.
- **Unused CSS**: large frameworks (Bootstrap) ship CSS you don't use. Purge (PurgeCSS, Tailwind's purge) or tree-shake to reduce file size. Check the Coverage tab in DevTools.

## 🧠 Spot the Bug

A developer animates a sidebar's width on toggle, but the animation is janky (stuttering) on mobile:

::code-wrapper{language="css"}
```css
.sidebar {
	width: 250px;
	transition: width 0.3s ease;
}
.sidebar.collapsed {
	width: 0;
}
```
::

What's wrong and how to fix it?

<details>
<summary>Answer</summary>

Animating `width` triggers **layout** on every frame — the browser recomputes the width of `.sidebar` and the layout of everything that depends on it (the main content next to it, descendants). On mobile (slower CPUs), this drops frames — janky.

The fix — use `transform` (compositor-only, GPU, no layout):

```css
.sidebar {
	width: 250px;
	transition: transform 0.3s ease;
	transform: translateX(0);
}
.sidebar.collapsed {
	transform: translateX(-100%);   /* slide out, no layout */
}
```

`transform: translateX(-100%)` moves the sidebar visually without changing its layout size — no layout, no paint (compositor-only), 60fps. The main content's layout is unchanged (you may need to also animate the main content's `transform` or use `margin` carefully).

Or for a collapsible width that affects the main content, use the `grid-template-columns` trick (animate `1fr` → `0fr`), which is smoother than `width`:

```css
.layout {
	display: grid;
	grid-template-columns: 250px 1fr;
	transition: grid-template-columns 0.3s ease;
}
.layout.collapsed {
	grid-template-columns: 0fr 1fr;
}
.sidebar { overflow: hidden; }
```

`grid-template-columns: 250px 1fr` → `0fr 1fr` is interpolable and transitions, resizing the sidebar and main content smoothly. Browser support: Chrome 107+, Safari 16+, Firefox 66+.

**The lesson**: animating `width` (or `height`, `margin`, `top`) triggers layout each frame — expensive, janky. Use `transform` (compositor-only) or `grid-template-columns: Xfr → Yfr` (interpolable, smooth) for collapsible panels.

</details>

## Summary

You can now optimize CSS load (inline critical CSS, preload, minify, avoid `@import`), understand selector matching (right-to-left, prefer flat BEM selectors), avoid layout thrashing, animate performant properties (`transform`/`opacity`), use `content-visibility: auto` + `contain` for rendering optimization, manage GPU layers (`will-change`), and optimize fonts (`font-display: swap`, preload, `woff2`) — with the width-animation trap avoided via `transform`. Next: browser compatibility and prefixes.