# 09 — Responsive Design & Media Queries

Responsive design makes layouts adapt to different screen sizes. Media queries are the core tool, with container queries as a modern addition.

## The Viewport Meta Tag

::code-wrapper{language="html"}
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```

This is required for responsive design on mobile — without it, mobile browsers render at a desktop width (980px) and zoom out, making the page tiny. Always include this in `<head>`.

## Media Queries

::code-wrapper{language="css"}
```css
/* Apply styles when the viewport is at least 768px wide */
@media (min-width: 768px) {
	.container { max-width: 720px; }
}

/* Multiple conditions */
@media (min-width: 768px) and (max-width: 1024px) { /* ... */ }

/* Dark mode */
@media (prefers-color-scheme: dark) {
	body { background: #333; color: #eee; }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
	* { animation: none; transition: none; }
}

/* Hover capability */
@media (hover: hover) {
	.card:hover { transform: scale(1.05); }
}

/* Print */
@media print {
	.no-print { display: none; }
}
```

### Common breakpoints

There's no fixed standard, but common breakpoints:

::code-wrapper{language="text"}
```text
Mobile:  < 640px (or 768px)
Tablet:  640px–1024px
Desktop: > 1024px
Wide:    > 1280px
```

Choose breakpoints based on *your content*, not device sizes — if the layout breaks at 720px, that's your breakpoint, not 768px.

## Mobile-First

Write the mobile styles as the base, then add media queries for larger screens:

::code-wrapper{language="css"}
```css
/* Base: mobile */
.container { padding: 1rem; }

/* Tablet+ */
@media (min-width: 768px) {
	.container { padding: 2rem; }
}

/* Desktop+ */
@media (min-width: 1024px) {
	.container { padding: 3rem; max-width: 1200px; }
}
```

Mobile-first uses `min-width` (progressive enhancement) — styles accumulate for larger screens. Desktop-first (`max-width`, graceful degradation) is the older pattern; mobile-first is preferred (mobile is the default, larger screens get more).

## Fluid Layouts (no media queries)

Modern CSS can be responsive without media queries:

::code-wrapper{language="css"}
```css
/* Fluid font size */
font-size: clamp(1rem, 0.5rem + 2vw, 1.5rem);

/* Fluid padding */
padding: clamp(1rem, 2vw + 1rem, 3rem);

/* Responsive grid */
grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));

/* Responsive flex wrapping */
flex-wrap: wrap;
```

`clamp()`, `auto-fit`/`minmax`, and `flex-wrap` handle many responsive cases without breakpoints — use them first, reach for media queries when the layout fundamentally changes.

## Container Queries

Container queries style an element based on its *container's* size, not the viewport — essential for components that appear in different contexts (a sidebar card vs a full-width card):

::code-wrapper{language="css"}
```css
.sidebar { container-type: inline-size; }

.card { /* default styles */ }

@container (min-width: 400px) {
	.card { display: grid; grid-template-columns: 1fr 2fr; }
}
```

`container-type: inline-size` makes `.sidebar` a query container; `@container (min-width: 400px)` applies when the container is at least 400px wide. The card adapts to its container, not the viewport — reusable across layouts.

### Container query units

::code-wrapper{language="css"}
```css
.card { font-size: clamp(1rem, 3cqi, 2rem); }   /* 3% of container inline size */
```

`cqw`/`cqh`/`cqi`/`cqb`/`cqmin`/`cqmax` — container query units (percentage of the container's size). Like `vw`/`vh` but relative to the container.

## Responsive Images

::code-wrapper{language="html"}
```html
<!-- Serve different sizes based on viewport -->
<img src="small.jpg"
     srcset="small.jpg 480w, medium.jpg 800w, large.jpg 1200w"
     sizes="(max-width: 600px) 480px, 800px"
     alt="...">
```

`srcset` + `sizes` let the browser pick the right image size — no CSS needed. `picture` for art direction (different images at different sizes):

::code-wrapper{language="html"}
```html
<picture>
	<source media="(min-width: 800px)" srcset="wide.jpg">
	<img src="narrow.jpg" alt="...">
</picture>
```

### `object-fit` and `aspect-ratio`

::code-wrapper{language="css"}
```css
img {
	width: 100%;
	aspect-ratio: 16/9;     /* maintain aspect ratio */
	object-fit: cover;      /* fill, cropping if needed */
	object-position: center;
}
```

`object-fit: cover` fills the box, cropping overflow (like `background-size: cover` for `<img>`). `contain` fits entirely (letterboxing). `aspect-ratio` maintains a ratio without padding hacks.

## 💡 Tips & Tricks

- **Idiom**: use mobile-first (`min-width` media queries) — write mobile styles as the base, then add styles for larger screens. Mobile is the default; larger screens get more. This is progressive enhancement and is preferred over desktop-first (`max-width`).
- **Idiom**: use fluid CSS (`clamp()`, `auto-fit`/`minmax`, `flex-wrap`) before media queries — many responsive needs are handled without breakpoints. Reach for media queries when the layout *fundamentally changes* (sidebar appears/disappears, columns reflow), not for minor adjustments.
- **Idiom**: use container queries for component-level responsiveness — a card that appears in a sidebar and a main area should adapt to its container, not the viewport. `container-type: inline-size` + `@container (min-width: ...)` makes components reusable across contexts.
- **Idiom**: use `prefers-reduced-motion` to respect user preferences — `@media (prefers-reduced-motion: reduce) { * { animation: none; transition: none; } }` disables animations for users who set the OS preference. Accessibility for motion sensitivity.
- **Idiom**: use `srcset`/`sizes` for responsive images — the browser picks the right image size based on the viewport and device pixel ratio, no CSS needed. Use `<picture>` for art direction (different images at different sizes), `object-fit: cover` for cropping within a fixed aspect ratio.

## ⚠️ Edge Cases & Gotchas

- **`100vw` includes the scrollbar** (on desktop): causing horizontal overflow. Use `100%` or `dvw`.
- **Mobile-first vs desktop-first**: `min-width` (mobile-first) accumulates styles for larger screens; `max-width` (desktop-first) overrides for smaller. Mixing them is confusing — pick one (mobile-first preferred).
- **`@media` doesn't add specificity**: a media query doesn't increase the specificity of the rules inside it. A `.btn` inside and outside `@media` have the same specificity — source order (the media query must come after the base) decides.
- **Container queries need `container-type`**: `@container` queries only work on descendants of an element with `container-type: inline-size` (or `size`). Forgetting it means the query never matches.
- **`container-type: size` disables the element's own sizing**: `inline-size` (horizontal queries) is usually what you want; `size` (both dimensions) makes the element's size independent of its content (needs an explicit height).
- **Breakpoints should be content-based, not device-based**: "if the layout breaks at 720px, use 720px" — not "use 768px because that's the iPad width." Device sizes change; content breakpoints are stable.
- **`aspect-ratio` with `height: auto`**: `img { width: 100%; aspect-ratio: 16/9; }` sets the height from the ratio. But if the image has intrinsic dimensions, the browser may use them — `object-fit: cover` clips to the ratio.
- **`srcset` widths (`w` units) must match the actual image dimensions**: `srcset="img.jpg 800w"` means the image is 800px wide. Mismatch causes the browser to pick the wrong size.
- **`prefers-color-scheme` applies system-wide**: the user's OS dark mode setting. For a manual toggle, use a `data-theme` attribute and CSS variables (chapter 15).
- **`@media (hover: hover)` for hover styles on touch devices**: touch devices don't have hover; `:hover` styles can "stick" after a tap. Wrap hover effects in `@media (hover: hover)` to avoid this.

## 🧠 Spot the Bug

A developer adds a media query for tablets, but the tablet styles don't apply:

::code-wrapper{language="css"}
```css
.container { padding: 2rem; max-width: 1200px; }

@media (max-width: 768px) {
	.container { padding: 1rem; }
}
```
::

The tablet (768px wide) shows desktop padding. Why?

<details>
<summary>Answer</summary>

Two possible issues:

1. **`max-width: 768px` doesn't include exactly 768px on some engines** — but actually, `max-width: 768px` *does* include 768px (it's `<=`). So this isn't the bug.

2. **The real issue: viewport width vs CSS pixels** — the tablet's viewport might be reported as a different width due to device pixel ratio or the viewport meta tag. But more likely, the developer is testing on a device/browser where the viewport isn't exactly 768px.

Actually, the most likely bug is that the **base rule and the media query have the same specificity**, and the base rule comes *after* the media query in some build, or the media query's rule isn't being applied because... no, the media query is after the base, so it should win at 768px.

The actual classic bug: **the developer is desktop-first (`max-width`) but testing on a viewport wider than 768px**. At 769px+, `max-width: 768px` doesn't match, so the base (desktop) padding applies. The tablet needs to be ≤768px for the media query to apply. If the tablet reports a viewport of 800px (CSS pixels), the media query doesn't fire.

The deeper fix — use mobile-first (`min-width`), so the base is mobile and larger screens override:

```css
/* Base: mobile */
.container { padding: 1rem; }

/* Desktop+ */
@media (min-width: 769px) {
	.container { padding: 2rem; max-width: 1200px; }
}
```

This avoids the "does 768px match `max-width: 768px`?" confusion and is the preferred pattern.

**The lesson**: check the actual viewport width in DevTools (device toolbar), and prefer mobile-first (`min-width`) to avoid boundary confusion. A tablet reporting 800px CSS width won't match `max-width: 768px`.

</details>

## Summary

You can now use the viewport meta tag, media queries (width, `prefers-color-scheme`, `prefers-reduced-motion`, `hover`, print), mobile-first (`min-width`), fluid CSS (`clamp`/`auto-fit`/`flex-wrap`), container queries (`container-type` + `@container`), and responsive images (`srcset`/`sizes`/`picture`/`object-fit`/`aspect-ratio`). Next: floats and positioning deep dive.