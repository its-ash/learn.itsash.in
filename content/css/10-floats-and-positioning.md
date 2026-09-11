---
title: "10 — Floats, z-index & the Stacking Context Model"
description: "Stacking-context creation rules, the ancestor-z-index trap, isolation:isolate, clip-path vs overflow, and the transform-creates-a-context surprise. Code-first reference with z-index token scales."
---

# 10 — Floats, z-index & the Stacking Context Model

`z-index` doesn't work the way most developers think. It's not a global number — it's local to a *stacking context*. A `z-index: 9999` inside a `z-index: 1` parent loses to a `z-index: 2` sibling of that parent. The stacking context is the cage. This chapter engineers the model so z-index becomes predictable.

## Floats — legacy, but `flow-root` is the modern clear

::code-wrapper{language="css"}
```css
/* Floats were the layout tool before flex/grid. Now: only for text wrapping around an image. */
img { float: inline-start; margin-inline-end: 1rem; margin-block-end: 1rem; }

/* Floated children don't contribute to parent height (out of flow) → parent collapses. */
/* Modern clear: display: flow-root (establishes BFC, contains floats, no overflow clipping). */
.parent { display: flow-root; }  /* replaces the clearfix hack */
```
::

## `z-index` — only on positioned elements

::code-wrapper{language="css"}
```css
/* z-index applies ONLY to positioned (relative/absolute/fixed/sticky) elements. */
/* z-index: 10 on position: static does NOTHING. Set position: relative first. */
.modal { position: fixed; z-index: 100; }   /* positioned + z-index → works */
```
::

## Stacking Contexts — the cage model

A stacking context is a group of elements stacked together. A child's `z-index` is **relative to its stacking context** — it can't escape the parent's z-order.

::code-wrapper{language="text"}
```text
Properties that CREATE a stacking context:
  - position: absolute/relative + z-index ≠ auto
  - position: fixed/sticky (ALWAYS, regardless of z-index)
  - opacity < 1
  - transform, filter, perspective, clip-path, mask
  - will-change (with one of the above values)
  - isolation: isolate
  - mix-blend-mode ≠ normal
  - contain: layout/paint/strict/content
```
::

### The #1 z-index bug: ancestor context traps children

::code-wrapper{language="text"}
```text
  root stacking context
  ├── .app (transform → creates context, z-index: auto → treated as 0)
  │     └── .modal (z-index: 9999 → trapped inside .app's context)
  └── .dropdown (z-index: 100 → at root level)

  .dropdown (100) beats .app (0) → .dropdown renders ABOVE .modal, despite .modal's 9999.
  The child's 9999 only competes with siblings INSIDE .app's context, not outside.
```
::

### Anti-pattern: transform ancestor traps a high z-index child

::code-wrapper{language="css"}
```css
/* ❌ .app has transform → creates a stacking context. .modal's z-index:9999 is trapped inside.
   .dropdown (outside .app, z-index:100 at root) renders above .modal. */
.app { transform: translateZ(0); }  /* "GPU acceleration" → creates context */
.modal { position: fixed; z-index: 9999; }    /* inside .app in DOM → trapped */
.dropdown { position: fixed; z-index: 100; }  /* outside .app → at root level → wins */
```
::

::code-wrapper{language="css"}
```css
/* ✓ Raise .app's z-index above .dropdown, OR move .modal outside .app in the DOM. */
.app { transform: translateZ(0); position: relative; z-index: 1000; }  /* .app (1000) > .dropdown (100) */
```
::

## `isolation: isolate` — create a context without positioning

::code-wrapper{language="css"}
```css
/* Creates a stacking context WITHOUT position/z-index/transform.
   Traps a component's z-index within itself — children's z-index don't leak out. */
.widget { isolation: isolate; }
/* Use for components that shouldn't interact with the page's stacking order. */
```
::

## z-index Token Scale — avoid the 9999 arms race

::code-wrapper{language="css"}
```css
:root {
  /* Documented, spaced scale. Never ad-hoc 9999. */
  --z-base: 0;
  --z-dropdown: 100;
  --z-sticky: 200;
  --z-overlay: 300;
  --z-modal: 400;
  --z-toast: 500;
}
.modal { z-index: var(--z-modal); }
.toast { z-index: var(--z-toast); }  /* toast above modal — one source of truth */
```
::

## Clipping — `overflow` vs `clip-path` vs `mask`

::code-wrapper{language="css"}
```css
.box { overflow: hidden; }                    /* rectangular clip + creates BFC (clears floats, clips shadows) */
.box { overflow: clip; }                      /* rectangular clip, NO BFC, NO scroll container (modern) */
.img { clip-path: circle(50%); }              /* non-rectangular: circles, polygons, SVG paths. Animatable. */
.img { clip-path: polygon(0 0, 100% 0, 100% 100%); }  /* triangle */

/* overflow:hidden clips child shadows. Use overflow:clip (no BFC side effects) or restructure. */
```
::

## 💡 Tips & Tricks

- **Idiom**: `isolation: isolate` to trap a component's z-index — no positioning side effects, just a context boundary. Prevents z-index leaks from widgets into the page.
- **Idiom**: a z-index token scale (`--z-modal: 400`) is the only sustainable z-index strategy. Documented, spaced, one source of truth. No `9999` arms race.
- **Idiom**: `display: flow-root` is the modern clearfix — contains floats and child margins without `overflow: hidden`'s clipping. Use when you must use floats (text-wrap).
- **Idiom**: `clip-path` for non-rectangular clipping (circles, polygons) — animatable, unlike `overflow: hidden`. Use `mask` for soft/alpha-based fades.
- **Debug**: when `z-index: 9999` isn't on top, walk the ancestor chain for stacking-context creators (`transform`, `opacity<1`, `filter`, `position: fixed`). The ancestor's z-index (or auto=0) is the ceiling.

## ⚠️ Edge Cases & Gotchas

- **`position: fixed` always creates a stacking context**: regardless of z-index. Fixed elements trap their children's z-index.
- **`opacity < 1` creates a stacking context**: `opacity: 0.99` on a parent traps children — a surprise when fading in a parent changes z-order.
- **`transform` creates a stacking context** AND a containing block for fixed descendants — double surprise.
- **Negative `z-index`**: `z-index: -1` puts the element behind its parent's background (if the parent doesn't create a context). Useful for decorative layers.
- **`clip-path` doesn't affect layout**: the element's box is unchanged; only the visible area is clipped. It still takes its normal space.
- **`overflow: hidden` clips child shadows and transforms**: a child's `box-shadow` extending outside is cut. Use `overflow: clip` (no scroll container) or restructure.

## 🧠 Spot the Bug

::code-wrapper{language="css"}
```css
.app { transform: translateZ(0); }
.modal { position: fixed; z-index: 9999; }
.dropdown { position: fixed; z-index: 100; }
```
::

<details>
<summary>Answer</summary>

`.app` has `transform: translateZ(0)` → creates a stacking context. `.modal` is inside `.app` (DOM) → its `z-index: 9999` is trapped within `.app`'s context. `.dropdown` is outside `.app`, at the root level with `z-index: 100`. The root context compares `.app` (z-index: auto → 0) vs `.dropdown` (100) → `.dropdown` wins, rendering above `.app` and all its descendants including `.modal`. Fix: give `.app` a z-index higher than `.dropdown` (`z-index: 1000`), or move `.modal` outside `.app` in the DOM. The lesson: a stacking-context-creating ancestor traps descendants' z-index within the ancestor's context.

</details>
