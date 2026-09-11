---
title: "17 — Modern CSS (2023+): Nesting, :has(), Layers, Style Queries & color-mix"
description: "Native nesting with &, :has() the parent selector, cascade layer precedence, container style queries, color-mix() for derived palettes, text-wrap balance/pretty, scroll-driven animations, and view transitions. Code-first reference for post-2023 CSS."
---

# 17 — Modern CSS (2023+): Nesting, :has(), Layers, Style Queries & color-mix

CSS post-2023 replaced JavaScript and preprocessor workarounds with native features. Nesting, `:has()` (the parent selector), cascade layers, container style queries, `color-mix()`, and scroll-driven animations are now shipping in all major browsers. This chapter covers the features that change how you architect CSS.

## Native Nesting — `&` is the parent selector

::code-wrapper{language="css"}
```css
.card {
  padding: 1rem;
  & .title { font-size: 1.5rem; }      /* = .card .title (descendant) */
  & p { line-height: 1.6; }            /* = .card p */
  &:hover { background: #f0f0f0; }     /* = .card:hover (compound — needs &) */
  &.active { border-color: red; }      /* = .card.active */
  @media (min-width: 768px) { & { padding: 2rem; } }  /* nesting @media inside rules */
}
/* Without &, a nested selector is a DESCENDANT: .title inside .card = .card .title.
   Use & for compound selectors (&:hover, &.active, & + .sibling). */
```
::

## `:has()` — the relational pseudo-class (parent selector)

::code-wrapper{language="css"}
```css
/* Style a card based on its DESCENDANTS — the long-requested "parent selector". */
.card:has(img) { padding-block-start: 0; }           /* card with an image */
.form-section:has(.error) { border-color: red; }      /* section containing an error */
li:has(ul) { font-weight: bold; }                    /* list item that has a nested list */
.card:not(:has(img)) { padding: 2rem; }               /* card WITHOUT an image */
h2:has(+ p) { margin-block-end: 0; }                 /* heading directly followed by a paragraph */

/* Specificity: :has() adds its ARGUMENT's specificity. .card:has(.error) = .card + .error = (0,2,0). */
```
::

### Anti-pattern: :has() rule ordering

::code-wrapper{language="css"}
```css
/* If the :has() rule comes BEFORE the base rule and specificity is equal, source order may bite.
   Put the :has() override AFTER the base for clarity. */
.form-section { border: 2px solid #ccc; }              /* base FIRST */
.form-section:has(.error) { border-color: red; }      /* override AFTER — clear intent */
```
::

## Cascade Layers — `@layer` for precedence control

::code-wrapper{language="css"}
```css
@layer reset, base, components, utilities;  /* order declared FIRST → fixes precedence */

@layer reset { * { box-sizing: border-box; margin: 0; } }
@layer base { body { font-size: 16px; } }
@layer components { .btn { padding: 0.5rem 1rem; } }
@layer utilities { .text-center { text-align: center; } }

/* Layer order sets precedence: utilities (last) beats components beats base, REGARDLESS of specificity.
   A .text-center utility (0,0,1,0) beats .btn .text-center (0,0,2,0) because utilities is a later layer. */
/* Unlayered rules beat ALL layered rules — the escape hatch. */
```
::

## Container Style Queries (2023+)

::code-wrapper{language="css"}
```css
/* Query a container's custom PROPERTIES (not just size). A card adapts to its container's --theme. */
@container style(--theme: dark) {
  .card { background: #222; color: #eee; }
}
/* You can query custom properties, not standard properties (like color). Support: Chrome 111+, Safari 17.4+. */
```
::

## `color-mix()` — derive shades at runtime

::code-wrapper{language="css"}
```css
:root {
  --primary: oklch(0.62 0.18 245);
  --primary-hover: color-mix(in oklch, var(--primary) 85%, white);   /* lighter shade */
  --primary-press: color-mix(in oklch, var(--primary) 75%, black);   /* darker shade */
  /* No preprocessor needed — derive tints/shades from one token, at runtime, cascading. */
}
```
::

## `text-wrap: balance` / `pretty`

::code-wrapper{language="css"}
```css
h1, h2 { text-wrap: balance; }  /* even line lengths for headings — no manual <br> */
p { text-wrap: pretty; }        /* avoid a single word on the last line (orphans) */
/* Free typography polish. The browser optimizes wrapping. */
```
::

## Scroll-Driven Animations (2023+)

::code-wrapper{language="css"}
```css
@keyframes progress { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.progress-bar {
  animation: progress linear;
  animation-timeline: scroll(root block);  /* driven by scroll position, no JS */
  transform-origin: inline-start;
}
/* A progress bar that fills as you scroll — pure CSS. Support: Chrome 115+, Safari 17.4+. */
```
::

## View Transitions API

::code-wrapper{language="css"}
```css
::view-transition-old(root), ::view-transition-new(root) { animation-duration: 0.3s; }
```
::

::code-wrapper{language="javascript"}
```javascript
document.startViewTransition(() => { /* DOM update — API captures old/new, animates between them */ });
```
::

## `accent-color` — theme native form controls

::code-wrapper{language="css"}
```css
input[type="checkbox"], input[type="radio"], input[type="range"] {
  accent-color: var(--primary);  /* colors the native control — no custom widget needed */
}
```
::

## 💡 Tips & Tricks

- **Idiom**: `:has()` for state-based styling without JS — `.card:has(.error) { border-color: red; }` styles a card based on its contents, no JS class toggling. The "parent selector" finally exists.
- **Idiom**: `@layer` to control precedence in large codebases — `@layer reset, base, components, utilities;` makes utilities reliably beat components regardless of specificity. The end of `!important` wars.
- **Idiom**: native nesting (`&`) for component-scoped styles — reduces repetition, keeps related styles together. Use `&` for compound selectors (`&:hover`, `&.active`); without `&` it's a descendant.
- **Idiom**: `color-mix(in oklch, var(--c) 80%, white)` to derive tints/shades from one token — no preprocessor, cascades, runtime.
- **Idiom**: `text-wrap: balance` for headings, `pretty` for paragraphs — free typography polish, no JS or manual `<br>`.

## ⚠️ Edge Cases & Gotchas

- **`:has()` specificity = its argument's specificity**: `.card:has(.error)` = (0,2,0), `.card:has(#x)` = (0,1,1,0). A `:has()` with an ID inside is ID-strength.
- **`:has()` can't be nested in itself in all engines**: `:has(:has(...))` has limited support. Avoid deep nesting.
- **Cascade layer order is set by the FIRST declaration**: `@layer reset, base;` fixes the order. Later `@layer base { }` appends to the existing `base` in its position.
- **Unlayered rules beat layered rules**: a rule outside any `@layer` wins over all layered rules regardless of specificity. Layer everything or nothing for predictable precedence.
- **Nesting `&` specificity is the combined selector's**: `& .title` = `.card .title` (0,2,0). `&.active` = `.card.active` (0,2,0).
- **Container style queries query custom properties only**: `@container style(--theme: dark)` works; `@container style(color: red)` doesn't.
- **`text-wrap: balance` is for short text** (headings): on long paragraphs, it can look worse. Use `pretty` for paragraphs.
- **Scroll-driven animations and view transitions are newer** (2023+): provide a JS fallback or accept no animation on older browsers.

## 🧠 Spot the Bug

::code-wrapper{language="css"}
```css
.form-section:has(.error) { border-color: red; }
.form-section { border: 2px solid #ccc; }
```
::

<details>
<summary>Answer</summary>

The `:has()` rule comes *before* the base rule. `.form-section:has(.error)` has specificity (0,2,0) — it beats `.form-section` (0,1,0) by specificity, so it *should* win regardless of order. But the base rule uses the `border` *shorthand*, which resets `border-color` to `#ccc`. If the `:has()` rule only sets `border-color` (not the full shorthand), and the base comes after, the shorthand's `border-color: #ccc` could interfere at equal or higher specificity. The clearer fix: put the base rule first, the `:has()` override after — source order expresses intent even when specificity would win:

```css
.form-section { border: 2px solid #ccc; }           /* base first */
.form-section:has(.error) { border-color: red; }   /* override after */
```

Also verify `:has()` browser support (Chrome 105+, Safari 15.4+, Firefox 121+) and that `.error` is actually a descendant of `.form-section`.

</details>
