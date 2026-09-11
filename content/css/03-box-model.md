---
title: "03 — The Box Model: Formatting Contexts & Margin Collapse"
description: "Box-sizing, the formatting context model, margin collapsing rules, and the min-width:auto trap that breaks flex/grid layouts. Code-first reference with production reset and negative-margin patterns."
---

# 03 — The Box Model: Formatting Contexts & Margin Collapse

Every element is a box: content → padding → border → margin. The engine computes these per element, then lays them out according to a *formatting context* (block, flex, grid, table). The two bugs that waste the most engineering hours — "my width:100% overflows" and "my margins collapsed" — are both box-model mechanics, not mysteries.

## `box-sizing` — the one reset that matters

::code-wrapper{language="css"}
```css
/* content-box (default): width = content area only. padding + border ADDED on top.
   width:100px + padding:10px + border:2px → 124px rendered. Intuitive? No. */
* { box-sizing: border-box; }  /* border-box: width INCLUDES padding+border → 100px is 100px. */
/* This reset goes in @layer reset, first line of the sheet. It is non-negotiable. */
```
::

### Anti-pattern: width:100% + padding overflows the parent

::code-wrapper{language="css"}
```css
/* ❌ content-box: 100% content + 20px padding + 2px border = 100% + 22px → horizontal scroll */
input { width: 100%; padding: 10px; border: 1px solid gray; }
```
::

::code-wrapper{language="css"}
```css
/* ✓ border-box: 100% includes padding+border → fits exactly */
*, *::before, *::after { box-sizing: border-box; }
input { width: 100%; padding: 10px; border: 1px solid gray; }
```
::

## Margin Collapsing — the exact rules

Adjacent **vertical** margins between block-level boxes collapse to the **larger** value (they don't add). This is the #1 "why is my gap smaller than I coded?" cause.

::code-wrapper{language="text"}
```text
RULES — when margins DO collapse (vertical/block direction only):
  1. Adjacent siblings: <p mb=30> + <p mt=20> → 30px gap (not 50).
  2. Parent ↔ first/last child: if NO border/padding/inline-content separates them.
  3. Empty block: top and bottom margins of an element with no content/height collapse.

RULES — when they DO NOT collapse:
  - Horizontal (inline-axis) margins — never.
  - Flex/grid items — never (flex/grid establish new formatting contexts).
  - Elements with `overflow` other than visible (creates a BFC).
  - Floats / absolutely positioned elements.
  - Parent has padding-top/border-top blocking parent↔child.
```
::

### Anti-pattern: parent-child margin collapse breaks spacing

::code-wrapper{language="css"}
```css
/* ❌ The child's margin-top "escapes" through the parent (no border/padding to separate) */
.parent { background: gray; }
.child { margin-top: 2rem; }  /* the 2rem pushes the PARENT down, not the child inside it */
```
::

::code-wrapper{language="css"}
```css
/* ✓ Establish a block formatting context (BFC) on the parent → child margins stay inside */
.parent { display: flow-root; }  /* modern: creates BFC, contains floats AND margins, no overflow clipping */
/* Alternatives: overflow:hidden (also clips — avoid if shadows need to escape),
   padding-top:1px / border-top:1px (visual side effects), display:flow-root (cleanest). */
```
::

## Negative Margins — the only legitimate hack

::code-wrapper{language="css"}
```css
/* Negative margins pull elements closer than normal flow allows. Real use cases: */
.card { margin-block-end: -1px; }  /* overlap adjacent card borders → single 1px line between them */
.full-bleed { margin-inline: calc(50% - 50vw); }  /* break out of a max-width container to full viewport */
/* ⚠️ Negative margins change layout geometry — siblings reflow. Test with DevTools box diagram. */
```
::

## `min-width: auto` — the flex/grid layout killer

This is the most common flexbox/grid bug in production. Flex and grid items have `min-width: auto` by default, meaning they **refuse to shrink below their content's intrinsic minimum size**.

### Anti-pattern: flex items overflow with long content

::code-wrapper{language="css"}
```css
/* ❌ Long unbreakable content (URL, long word) can't shrink below its intrinsic width → row overflows */
.row { display: flex; }
.item { flex: 1; }  /* flex:1 = grow:1 shrink:1 basis:0%, BUT min-width:auto blocks shrinking */
```
::

::code-wrapper{language="css"}
```css
/* ✓ min-width:0 releases the content-size floor; overflow-wrap handles the text */
.row { display: flex; gap: 1rem; }
.item { flex: 1; min-width: 0; overflow-wrap: break-word; }  /* now it shrinks as flex intends */
```
::

**Why:** `min-width: auto` computes to the content's intrinsic size (the longest unbreakable word/URL). `min-width: 0` overrides this floor, letting `flex-shrink` do its job. The same fix applies to grid items with `1fr` tracks that won't shrink (use `minmax(0, 1fr)` on the track, or `min-width: 0` on the item).

## Responsive Container — the universal pattern

::code-wrapper{language="css"}
```css
.container {
  width: 100%;
  max-width: 1200px;       /* cap growth on large screens */
  margin-inline: auto;     /* center when viewport > 1200px (auto margins = equal leftover space) */
  padding-inline: clamp(1rem, 5vw, 3rem);  /* fluid gutter, bounded */
}
```
::

## 💡 Tips & Tricks

- **Idiom**: `display: flow-root` is the modern clearfix/BFC — it contains floated children and child margins without `overflow: hidden`'s clipping side effects. Use it wherever a parent "loses" its children's height or margins.
- **Idiom**: `padding-top: 56.25%` is the legacy 16:9 aspect-ratio hack (percentage padding is relative to the parent's *width*, not height). Modern: `aspect-ratio: 16/9` — no padding gymnastics.
- **Idiom**: use logical properties (`margin-block`, `margin-inline`, `padding-inline`) — they're writing-mode-aware and flip automatically in RTL. `margin-inline: auto` centers in the inline direction regardless of writing mode.
- **Idiom**: `overflow: hidden` clips shadows and transforms of children. Use `overflow: clip` (same clipping, no scroll container, no BFC side effects) when you only need visual clipping.

## ⚠️ Edge Cases & Gotchas

- **`height: 100%` needs a parent with a defined height**: if the parent is `height: auto`, `100%` resolves to 0. Use `100dvh`, flex/grid stretching, or set the parent's height explicitly.
- **Percentage padding is relative to the parent's WIDTH**: `padding-top: 50%` is 50% of the parent's *width*. This is the basis of the aspect-ratio hack and a source of confusion.
- **`overflow: auto` causes scrollbar layout shift**: the scrollbar takes space when it appears. Use `scrollbar-gutter: stable` to reserve the gutter.
- **`min-width` beats `max-width` when the container is smaller than `min-width`**: `min-width: 200px; max-width: 500px; width: 100%` overflows below 200px container — `min` wins.
- **Margin doesn't affect the element's size**: `margin` is outside the border; `width` (border-box) includes padding+border but NOT margin. The box model diagram in DevTools is ground truth.

## 🧠 Spot the Bug

::code-wrapper{language="css"}
```css
input {
	width: 100%;
	padding: 10px;
	border: 1px solid gray;
}
```
::

<details>
<summary>Answer</summary>

Default `box-sizing: content-box` → `width: 100%` sets the *content* to 100% of the parent, then `padding: 10px` (20px total) and `border: 1px` (2px total) are added → `100% + 22px` → horizontal overflow. Fix: `box-sizing: border-box` (via the universal reset) so `width: 100%` includes padding and border. This is why `*, *::before, *::after { box-sizing: border-box; }` is line one of every production stylesheet.

</details>
