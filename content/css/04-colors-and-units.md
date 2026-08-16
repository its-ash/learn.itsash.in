# 04 — Colors & Units

## Color Notations

::code-wrapper{language="css"}
```css
/* Hex */
color: #ff0000;        /* red */
color: #f00;           /* abbreviated */
color: #ff0000ff;      /* 8-digit hex with alpha (ff = opaque) */

/* RGB / RGBA */
color: rgb(255, 0, 0);
color: rgba(255, 0, 0, 0.5);          /* 50% opacity */
color: rgb(255 0 0 / 50%);            /* modern syntax (space-separated, / for alpha) */

/* HSL / HSLA — hue (0-360), saturation%, lightness% */
color: hsl(0, 100%, 50%);             /* red */
color: hsl(120, 100%, 25%);           /* dark green */
color: hsl(0 100% 50% / 50%);         /* modern syntax with alpha */

/* Named colors */
color: red; color: transparent; color: currentColor; color: inherit;

/* LCH / OKLCH — perceptually uniform (modern, 2023+) */
color: oklch(0.6 0.2 25);             /* lightness, chroma, hue — perceptually uniform */
color: color(display-p3 1 0 0);       /* wide-gamut color space */
```

### Which to use?

- **Hex** — most common, concise. Use for opaque colors.
- **HSL/OKLCH** — best for generating color variations (lighten/darken by adjusting lightness). OKLCH is perceptually uniform (50% lightness looks the same across hues).
- **`currentColor`** — the element's current `color` value, useful for SVG/icons that should match text color.
- **`transparent`** — `rgba(0,0,0,0)` — fully transparent.

### Opacity vs `rgba`

- `opacity: 0.5` — makes the *entire element* (and children) 50% transparent.
- `rgba(..., 0.5)` — makes only the *color* 50% transparent (children are fully opaque).

Use `rgba`/HSL-alpha for semi-transparent backgrounds/borders; `opacity` only when you want the whole element (including text) transparent.

## Units

### Absolute

- `px` — pixels (CSS pixels, not device pixels; 1px ≈ 1/96 inch). The most common absolute unit.

### Relative to font size

- `em` — relative to the *parent's* font-size. `1.5em` = 1.5 × parent's font-size. Compounds in nested elements (a `1.2em` inside a `1.2em` is 1.44×).
- `rem` — relative to the *root* (`html`) font-size. `1.5rem` = 1.5 × root font-size. Doesn't compound — consistent across the page. **Prefer `rem` for font-sizes and spacing.**

### Relative to viewport

- `vw` — 1% of the viewport width. `100vw` = full viewport width (note: includes the scrollbar on some browsers, causing overflow — use `dvw` or `100%`).
- `vh` — 1% of the viewport height. `100vh` = full viewport height (on mobile, `100vh` includes the browser chrome — use `dvh` for the dynamic viewport).
- `dvw`/`dvh` — dynamic viewport units (adjust when the mobile browser chrome shows/hides). Modern replacement for `vw`/`vh` on mobile.
- `svw`/`svh` — small viewport (smallest possible, when all browser chrome is shown).
- `lvw`/`lvh` — large viewport (largest possible, when all chrome is hidden).

### Relative to parent

- `%` — relative to the parent's dimension (`width: 50%` is half the parent's width). For `height`, the parent needs a defined height.
- `ch` — the width of the "0" character in the current font. Useful for max-width of text (`max-width: 60ch` — about 60 characters per line).
- `ex` — the x-height of the font (rare).

### Viewport-percentage vs container queries

For container-relative sizing, use container query units (`cqw`, `cqh`) — see chapter 09.

## `calc()`

::code-wrapper{language="css"}
```css
width: calc(100% - 200px);          /* mix units */
font-size: calc(1rem + 0.5vw);      /* responsive font */
padding: calc(1rem * 2);
width: calc(min(100%, 600px));      /* nested (or use min() directly) */
```

`calc()` lets you combine units in arithmetic. Always spaces around `+`/`-` (required); `*`/`/` don't need spaces but can have them.

## `min()`, `max()`, `clamp()`

::code-wrapper{language="css"}
```css
/* min — the smaller of the values */
width: min(100%, 600px);            /* never wider than 600px or the container */

/* max — the larger */
font-size: max(1rem, 2vw);          /* never smaller than 1rem */

/* clamp(min, preferred, max) */
font-size: clamp(1rem, 2vw + 1rem, 3rem);  /* fluid between 1rem and 3rem */
```

`clamp()` is the modern responsive pattern — a fluid value with min/max bounds, no media queries needed.

## Recommended Defaults

- Font-sizes: `rem` (consistent, doesn't compound).
- Spacing (padding/margin): `rem` (scales with user's font-size preference) or `em` (relative to the element's font-size, for component-internal spacing).
- Widths: `%` (relative to parent), `ch` (for text containers), `px` (for fixed UI elements).
- Viewport-relative: `dvh` for mobile full-height (not `vh`), `clamp()` for fluid responsive values.
- Avoid `px` for font-sizes — `rem` respects the user's browser font-size setting (accessibility).

## 💡 Tips & Tricks

- **Idiom**: use `rem` for font-sizes and spacing — `rem` is relative to the root font-size, so it's consistent (doesn't compound like `em`) and respects the user's browser font-size setting (accessibility). Use `em` only for component-internal spacing where you want it to scale with the element's font-size.
- **Idiom**: use `clamp()` for fluid responsive values — `font-size: clamp(1rem, 0.5rem + 2vw, 3rem)` gives a font that scales with the viewport but never below 1rem or above 3rem, without media queries. The same pattern works for padding, widths, etc.
- **Idiom**: use `dvh`/`dvw` (dynamic viewport units) instead of `vh`/`vw` on mobile — `100vh` includes the browser chrome on mobile (causing overflow when the address bar shows), while `100dvh` adjusts dynamically. Use `100svh` for the smallest viewport (when all chrome is shown).
- **Idiom**: use `ch` for text container max-widths — `max-width: 60ch` gives about 60 characters per line, a comfortable reading width regardless of font. This is better than a fixed `px` max-width, which doesn't adapt to font size.
- **Idiom**: use `oklch()` for perceptually uniform color manipulation — `oklch(0.6 0.2 25)` (lightness, chroma, hue) makes 50% lightness look the same across hues, unlike HSL where 50% lightness varies in perceived brightness. Generate tints/shades by adjusting lightness consistently.

## ⚠️ Edge Cases & Gotchas

- **`em` compounds**: `1.2em` inside a `1.2em` is 1.44× the root. Use `rem` for font-sizes to avoid this.
- **`100vw` includes the scrollbar** (on desktop): causing horizontal overflow. Use `100%` (of a full-width parent) or `dvw`.
- **`100vh` on mobile includes browser chrome**: the address bar/toolbar overlaps. Use `100dvh` (dynamic) or `100svh` (smallest).
- **`%` height needs a parent with a defined height**: `height: 100%` of an `auto`-height parent is 0. Set the parent's height, or use `100vh`/flexbox.
- **`px` for font-sizes ignores user's browser font-size setting**: `16px` is always 16px regardless of the user's preference. `rem` (or `em`) respects the setting (accessibility).
- **`opacity` affects the whole element including children**: a `div` with `opacity: 0.5` makes its text 50% transparent too. Use `rgba`/HSL-alpha for semi-transparent backgrounds.
- **Hex alpha is the last 2 digits**: `#ff0000ff` is opaque red; `#ff000080` is 50% red. The `80` is hex for 128/255 ≈ 50%.
- **HSL lightness isn't perceptually uniform**: `hsl(60, 100%, 50%)` (yellow) looks brighter than `hsl(240, 100%, 50%)` (blue) at the same "lightness." Use `oklch` for perceptual uniformity.
- **`currentColor` is the computed `color`**: useful for SVG fill matching text, but it changes with the element's `color` — not a fixed reference.
- **`calc()` requires spaces around `+`/`-`**: `calc(100%-20px)` is invalid (parsed as a percentage with a negative number, not subtraction). `calc(100% - 20px)` works. `*`/`/` don't require spaces.

## 🧠 Spot the Bug

A developer sets a full-height hero section, but on mobile it's taller than the screen and the bottom is cut off:

::code-wrapper{language="css"}
```css
.hero { height: 100vh; }
```
::

What's wrong?

<details>
<summary>Answer</summary>

`100vh` on mobile browsers is the "large viewport" height — it includes the space the browser chrome (address bar, toolbar) *could* occupy. When the address bar is visible (the common case), `100vh` is taller than the visible area, so the hero's bottom is behind the address bar / cut off.

The fix — use `dvh` (dynamic viewport height) or `svh` (small viewport height):

```css
.hero { height: 100dvh; }   /* adjusts when the address bar shows/hides */
/* or */
.hero { min-height: 100svh; }  /* always fits the smallest viewport */
```

`dvh` adjusts dynamically as the browser chrome shows/hides (the hero resizes). `svh` is the smallest viewport (all chrome shown) — stable but leaves space when the chrome hides. `lvh` is the largest (all chrome hidden) — equivalent to the old `vh` behavior.

**The lesson**: `100vh` on mobile is the large viewport (includes potential chrome space), causing overflow when the address bar is visible. Use `100dvh` (dynamic) or `100svh` (smallest) for mobile full-height sections.

</details>

## Summary

You can now use hex/RGB/HSL/OKLCH colors (and `currentColor`/`transparent`), `opacity` vs `rgba`, absolute (`px`) and relative (`rem`/`em`/`vw`/`vh`/`dvh`/`%`/`ch`) units, `calc()`, and `min()`/`max()`/`clamp()` for fluid responsive values — while preferring `rem` for accessibility and `dvh` for mobile. Next: typography and text.