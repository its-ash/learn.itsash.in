---
title: "12 — Borders, Shadows, Outlines & Focus States"
description: "Border-radius elliptical math, layered box-shadow elevation (Material Design), outline vs border for focus, :focus-visible, and the overflow-clips-shadow trap. Code-first reference with accessible focus-ring systems."
---

# 12 — Borders, Shadows, Outlines & Focus States

Borders and shadows are visual styling; outlines are for focus states. The key distinction: `border` affects layout (takes space); `outline` and `box-shadow` don't. That's why focus rings use `outline` — no layout shift when focus appears.

## Borders

::code-wrapper{language="css"}
```css
.box {
  border: 2px solid #333;           /* shorthand: width style color. style is REQUIRED (default none = no border) */
  border-radius: 8px;               /* all corners */
  border-radius: 10px 20px 30px 40px; /* TL TR BR BL (clockwise from top) */
  border-radius: 50%;              /* circle on a square; ellipse on a rectangle */
  border-radius: 10px / 20px;     /* elliptical: horizontal / vertical radii */
}
/* border-style: none (default) → border-width alone does NOTHING. Always set a style. */
```
::

## Box Shadows — layered elevation

::code-wrapper{language="css"}
```css
/* box-shadow: offset-x offset-y blur spread color [inset]. Doesn't affect layout (painted outside). */
.card { box-shadow: 0 4px 6px rgba(0,0,0,0.1); }

/* Material Design elevation: ambient (tight, close) + key (diffuse, far) = realistic depth. */
.elevation-1 { box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24); }
.elevation-2 { box-shadow: 0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23); }
.elevation-3 { box-shadow: 0 10px 20px rgba(0,0,0,0.19), 0 6px 6px rgba(0,0,0,0.23); }
```
::

### Anti-pattern: animating box-shadow directly (janky)

::code-wrapper{language="css"}
```css
/* ❌ Animating box-shadow repaints the shadow EVERY frame → expensive, drops frames. */
.card { transition: box-shadow 0.3s; }
.card:hover { box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
```
::

::code-wrapper{language="css"}
```css
/* ✓ Animate a pseudo-element's opacity (the hover shadow is always painted, just transparent).
   opacity is compositor-only (GPU) → 60fps. */
.card { position: relative; }
.card::after {
  content: ""; position: absolute; inset: 0; border-radius: inherit;
  box-shadow: 0 10px 30px rgba(0,0,0,0.2);
  opacity: 0; transition: opacity 0.3s;
  z-index: -1;
}
.card:hover::after { opacity: 1; }
```
::

## Outlines & `:focus-visible` — the accessible focus ring

::code-wrapper{language="css"}
```css
/* outline: like border but DOESN'T affect layout (no shift). Always on all 4 sides (no per-side). */
/* :focus-visible = keyboard focus only (not mouse click). The correct focus-ring pseudo-class. */
button:focus-visible {
  outline: 2px solid var(--c-primary);
  outline-offset: 2px;   /* gap between the element and the outline */
}
/* ⚠️ outline is NOT clipped by overflow:hidden the same way box-shadow is → safer for focus rings. */
```
::

### Anti-pattern: removing outline without a replacement

::code-wrapper{language="css"}
```css
/* ❌ Removing outline without a replacement = accessibility violation. Keyboard users lose focus indicator. */
button { outline: none; }
button:focus { box-shadow: 0 0 0 2px blue; }  /* :focus shows on mouse click too + clipped by overflow:hidden */
```
::

::code-wrapper{language="css"}
```css
/* ✓ Use :focus-visible (keyboard only) + outline (not clipped by overflow ancestors). */
button { outline: none; }  /* remove default */
button:focus-visible { outline: 2px solid var(--c-primary); outline-offset: 2px; }  /* keyboard only */
```
::

## 💡 Tips & Tricks

- **Idiom**: `:focus-visible` (not `:focus`) for focus rings — shows only for keyboard navigation, not mouse click. Pair with `outline-offset` for a gap. Never remove `outline` without a visible replacement.
- **Idiom**: layered box-shadows (ambient + key) for realistic elevation — a single flat shadow looks amateurish. Material Design's two-shadow pattern is the standard.
- **Idiom**: `border-radius: 50%` on a square = circle (avatars, badges) — no SVG needed. On a rectangle, it's an ellipse; use `aspect-ratio: 1` for a guaranteed square.
- **Idiom**: animate a pseudo-element's opacity for shadow transitions — `box-shadow` animation repaints each frame; opacity is compositor-only (GPU, 60fps).

## ⚠️ Edge Cases & Gotchas

- **`border-style: none` (default) means no border**: `border-width: 2px` alone does nothing. Always set a style (`solid` etc.).
- **`box-shadow` is clipped by `overflow: hidden` ancestors**: a child's shadow extending outside is cut. Use `overflow: clip` (no scroll container) or restructure.
- **`outline` doesn't follow `border-radius`** in most browsers: the outline is rectangular even on a rounded box. Use `box-shadow` as a focus indicator if you need rounded focus rings.
- **`text-shadow` has no `inset` or `spread`**: only `offset-x offset-y blur color`. Multiple shadows (comma) create 3D/glow effects.
- **`border-radius: 50%` on a non-square = ellipse**: for a circle, the element must be square (`width === height` or `aspect-ratio: 1`).

## 🧠 Spot the Bug

::code-wrapper{language="css"}
```css
button { outline: none; }
button:focus { box-shadow: 0 0 0 2px blue; }
```
::

<details>
<summary>Answer</summary>

Two issues: (1) `:focus` matches both keyboard and mouse click → the ring appears after clicking with a mouse (unwanted). Use `:focus-visible` for keyboard-only. (2) `box-shadow` is clipped by `overflow: hidden` ancestors — if the button is inside a clipping container, the 2px ring is invisible to keyboard users. `outline` (+ `outline-offset`) isn't clipped the same way. Fix: `button:focus-visible { outline: 2px solid blue; outline-offset: 2px; }`. Never remove `outline` without a visible replacement — it's an a11y violation.

</details>
