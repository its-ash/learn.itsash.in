---
title: "11 — Backgrounds & Gradients: Layering, Sizing & the Shorthand Reset Trap"
description: "Multiple background layers, background-size in the shorthand (the / syntax), background-clip:text for gradient text, and gradient color-stop math. Code-first reference with conic-gradient pie charts and hard-stop stripes."
---

# 11 — Backgrounds & Gradients: Layering, Sizing & the Shorthand Reset Trap

The `background` shorthand is a footgun: it resets *every* background sub-property to its default. `background: url(x)` wipes `background-size`, `background-repeat`, and everything else. The fix: set longhands, or include size in the shorthand via the `/` syntax.

## Background Layering — first listed is on top

::code-wrapper{language="css"}
```css
.box {
  /* Comma-separated layers. FIRST listed is on TOP (counter-intuitive — z-order is reversed). */
  background: url("overlay.png") no-repeat center, linear-gradient(to right, red, blue);
  background-color: #f0f0f0;  /* only ONE background-color — it's the bottom layer, set separately */
}
```
::

## `background-size` and the shorthand `/` syntax

::code-wrapper{language="css"}
```css
.box {
  background: url("bg.png") no-repeat center / cover;  /* / separates position from size */
  /* cover: scale to cover the box (crops). contain: fit entirely (letterboxes). */
  /* Without /, "cover" would be parsed as a second position value → invalid. */
}
```
::

### Anti-pattern: shorthand resets background-size

::code-wrapper{language="css"}
```css
/* ❌ The shorthand resets background-size to auto (overriding the earlier cover), then
   background-repeat to repeat (default) → image is tiny and tiled. */
.box {
  background-size: cover;       /* set first */
  background: url("bg.png");    /* ❌ shorthand resets size to auto! */
}
```
::

::code-wrapper{language="css"}
```css
/* ✓ Set background-size AFTER the shorthand, or include it in the shorthand with /. */
.box { background: url("bg.png") no-repeat center; background-size: cover; }
/* or */
.box { background: url("bg.png") no-repeat center / cover; }
```
::

## `background-clip: text` — gradient text

::code-wrapper{language="css"}
```css
.gradient-text {
  background: linear-gradient(to right, red, blue);
  -webkit-background-clip: text;   /* Safari needs -webkit- */
  background-clip: text;
  color: transparent;             /* MUST be transparent or the text color covers the gradient */
}
```
::

## Gradients — linear, radial, conic, repeating

::code-wrapper{language="css"}
```css
/* linear-gradient: angle (0deg = UP, 90deg = RIGHT, 180deg = DOWN) + color stops */
background: linear-gradient(45deg, red, blue);
background: linear-gradient(to right, red 0%, red 50%, blue 50%, blue 100%);  /* hard stop = stripe */

/* radial-gradient */
background: radial-gradient(circle at top left, red, blue);

/* conic-gradient: sweeps around a center → pie charts */
background: conic-gradient(red 0 30%, blue 30% 70%, green 70% 100%);  /* 3-segment pie */

/* repeating gradients: for stripes, patterns */
background: repeating-linear-gradient(45deg, red, red 10px, blue 10px, blue 20px);
```
::

## 💡 Tips & Tricks

- **Idiom**: hard stops (`red 50%, blue 50%`) create instant stripes — the abrupt transition is a stripe pattern. Use for progress bars, warning patterns, decorative stripes.
- **Idiom**: `conic-gradient(red 0 30%, blue 30% 70%, green 70% 100%)` makes a pie chart in pure CSS — no SVG.
- **Idiom**: multiple backgrounds (comma-separated) for layered effects — a noise texture over a gradient over a color. First listed is on top.
- **Idiom**: `background-position: right 10px bottom 20px` for offset-from-edges — clearer than computing percentages, pins to a corner with an offset.

## ⚠️ Edge Cases & Gotchas

- **`background-color` is the bottom layer**: only one `background-color`. Set it separately or as the last fallback in the shorthand.
- **Gradient angle: 0deg is UP** (not right), increasing clockwise. `90deg` = right, `180deg` = down.
- **`background-clip: border-box` (default) shows background under a transparent/dashed border**: use `padding-box` to clip at the padding edge.
- **`background-origin` vs `background-clip`**: `origin` is where the background *starts* (for positioning/sizing); `clip` is where it's *clipped`. They can differ.
- **`background-attachment: fixed` is janky on mobile**: causes repaints on scroll. Use sparingly.
- **Gradients are resolution-independent**: they scale without pixelation, unlike raster images. Use for UI effects (buttons, stripes) instead of images.

## 🧠 Spot the Bug

::code-wrapper{language="css"}
```css
.box {
	background-size: cover;
	background: url("bg.png");
}
```
::

<details>
<summary>Answer</summary>

The `background` shorthand resets *all* background sub-properties to defaults — including `background-size` (to `auto`). Since the shorthand comes *after* `background-size: cover`, it overrides `cover` with `auto`. The image renders at its natural size (tiny) and tiles (default `repeat`). Fix: put `background-size` *after* the shorthand, or include it in the shorthand (`background: url("bg.png") no-repeat center / cover`).

</details>
