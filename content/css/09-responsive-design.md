---
title: "09 — Responsive Design: Media Queries, Container Queries & Fluid CSS"
description: "Mobile-first media queries, container queries for component-level responsiveness, clamp/auto-fit fluid patterns, and responsive images with srcset. Code-first reference with viewport-meta and prefers-* media features."
---

# 09 — Responsive Design: Media Queries, Container Queries & Fluid CSS

Responsive design has three layers: **fluid CSS** (no breakpoints — `clamp`, `auto-fit`, `flex-wrap`), **viewport media queries** (`@media (min-width: …)` — page-level changes), and **container queries** (`@container` — component-level changes). Use them in that order of preference: reach for a media query only when the layout *fundamentally* changes.

## The Viewport Meta Tag — required

::code-wrapper{language="html"}
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<!-- Without this, mobile browsers render at 980px and zoom out. ALWAYS include. -->
```
::

## Media Queries — mobile-first

::code-wrapper{language="css"}
```css
/* Mobile-first: base = mobile, min-width adds for larger screens (progressive enhancement). */
.container { padding: 1rem; }

@media (min-width: 768px) { .container { padding: 2rem; } }
@media (min-width: 1024px) { .container { padding: 3rem; max-width: 1200px; margin-inline: auto; } }

/* Media features (not just width): */
@media (prefers-color-scheme: dark) { :root { --c-bg: #1a1a1a; --c-fg: #eee; } }
@media (prefers-reduced-motion: reduce) { * { animation: none; transition: none; } }
@media (hover: hover) { .card:hover { transform: scale(1.05); } }
@media print { .no-print { display: none; } }
```
::

### Anti-pattern: desktop-first max-width confusion

::code-wrapper{language="css"}
```css
/* ❌ max-width = desktop-first. Boundary confusion + tablet at 800px misses the breakpoint. */
.container { padding: 2rem; max-width: 1200px; }
@media (max-width: 768px) { .container { padding: 1rem; } }
```
::

::code-wrapper{language="css"}
```css
/* ✓ mobile-first (min-width): base = mobile, accumulate for larger. Clear, preferred. */
.container { padding: 1rem; }
@media (min-width: 769px) { .container { padding: 2rem; max-width: 1200px; margin-inline: auto; } }
```
::

## Fluid CSS — responsive without breakpoints

::code-wrapper{language="css"}
```css
:root {
  --font-body: clamp(1rem, 0.9rem + 0.5vw, 1.25rem);   /* fluid, bounded, no media query */
  --space: clamp(1rem, 2vw + 1rem, 3rem);
}
.cards { grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); }  /* responsive grid */
.row { flex-wrap: wrap; }  /* wrap when no room */
```
::

## Container Queries — component-level responsiveness

A card in a 200px sidebar and an 800px main area should adapt to its *container*, not the viewport. Container queries make the same component reusable across contexts.

::code-wrapper{language="css"}
```css
.sidebar { container-type: inline-size; }  /* query container (inline = horizontal) */

.card { /* default: compact */ }
@container (min-width: 400px) {
  .card { display: grid; grid-template-columns: 1fr 2fr; }  /* wider → horizontal */
}
/* Container query units: cqi = 1% of container inline size. Like vw but for the container. */
.card__title { font-size: clamp(1rem, 3cqi, 2rem); }

/* Container style queries (2023+): query a container's custom properties. */
@container style(--theme: dark) {
  .card { background: #222; color: #eee; }
}
```
::

## Responsive Images — let the browser choose

::code-wrapper{language="html"}
```html
<!-- srcset + sizes: browser picks the right image by viewport + device pixel ratio. No CSS. -->
<img src="small.jpg"
     srcset="small.jpg 480w, medium.jpg 800w, large.jpg 1200w"
     sizes="(max-width: 600px) 480px, 800px"
     alt="...">
```
::

::code-wrapper{language="css"}
```css
img {
  inline-size: 100%;
  aspect-ratio: 16 / 9;   /* maintain ratio without padding hacks */
  object-fit: cover;      /* fill the box, crop overflow */
  object-position: center;
}
```
::

## 💡 Tips & Tricks

- **Idiom**: use fluid CSS (`clamp`, `auto-fit`, `flex-wrap`) before media queries — most responsive needs need no breakpoints. Reach for `@media` only when the layout *fundamentally changes*.
- **Idiom**: container queries for components in different contexts — `container-type: inline-size` + `@container (min-width: …)` makes a card adapt to its container, not the viewport.
- **Idiom**: `prefers-reduced-motion` is mandatory for accessibility — disable motion for vestibular-sensitive users.
- **Idiom**: `@media (hover: hover)` to avoid sticky hover on touch — touch devices don't hover; `:hover` sticks after tap.
- **Idiom**: `srcset` + `sizes` for responsive images — the browser picks the right file. Use `<picture>` for art direction.

## ⚠️ Edge Cases & Gotchas

- **`@media` doesn't add specificity**: a rule inside `@media` has the same specificity as outside. Source order decides — put media queries *after* the base.
- **Container queries need `container-type`**: `@container` only works on descendants of an element with `container-type: inline-size`. Forgetting it → the query never matches.
- **`container-type: size` disables content-based sizing**: `inline-size` (horizontal) is usually what you want; `size` (both axes) needs explicit height.
- **Breakpoints should be content-based, not device-based**: "if the layout breaks at 720px, use 720px" — not "use 768px because iPad."
- **`100vw` includes the scrollbar on desktop** → horizontal overflow. Use `100%` or `dvw`.
- **`prefers-color-scheme` is system-wide**: for a manual toggle, use `data-theme` + CSS variables.

## 🧠 Spot the Bug

::code-wrapper{language="css"}
```css
.container { padding: 2rem; max-width: 1200px; }
@media (max-width: 768px) { .container { padding: 1rem; } }
```
::

<details>
<summary>Answer</summary>

Desktop-first (`max-width`). A tablet reporting 800px CSS width misses `max-width: 768px` → gets desktop padding. Fix: mobile-first (`min-width`) — base is mobile, larger screens override. Mobile-first avoids the "does exactly 768px match?" boundary confusion and is the preferred pattern (progressive enhancement).

</details>
