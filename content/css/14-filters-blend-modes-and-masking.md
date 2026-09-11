---
title: "14 — Filters, Blend Modes & Masking: Compositing Pipeline"
description: "filter vs drop-shadow vs box-shadow, backdrop-filter glassmorphism (translucency requirement), mix-blend-mode stacking-context creation, mask for soft alpha fades. Code-first reference with compositing gotchas."
---

# 14 — Filters, Blend Modes & Masking: Compositing Pipeline

`filter` applies Photoshop-like effects to an element. `backdrop-filter` filters the content *behind* an element (glassmorphism). `mix-blend-mode` blends an element with its backdrop. All three create stacking contexts — that's the trap.

## `filter` — graphical effects

::code-wrapper{language="css"}
```css
.img { filter: blur(5px); }
.img { filter: brightness(1.5); }    /* 0=black, 1=normal, 2=2x bright */
.img { filter: contrast(2); }
.img { filter: grayscale(1); }       /* 0=color, 1=gray */
.img { filter: hue-rotate(90deg); }  /* theming without re-exporting assets */
.img { filter: invert(1); }
.img { filter: saturate(2); }
.img { filter: sepia(1); }
.img { filter: drop-shadow(4px 4px 10px rgba(0,0,0,0.5));  /* follows the ALPHA SHAPE, not the box */
.img { filter: grayscale(1) blur(2px) brightness(1.2); }  /* chained: left to right */
```
::

## `drop-shadow` vs `box-shadow` — shape vs box

::code-wrapper{language="css"}
```css
/* drop-shadow follows the element's alpha shape (PNG transparency, clip-path, SVG). */
/* box-shadow is always the rectangular box. */
.icon-png { filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.5)); }  /* shadow follows the icon shape */
.icon-png { box-shadow: 2px 2px 4px rgba(0,0,0,0.5); }          /* shadow on the rectangular box */
/* drop-shadow has NO spread (unlike box-shadow): only offset-x offset-y blur color. */
```
::

## `backdrop-filter` — glassmorphism

::code-wrapper{language="css"}
```css
.glass {
  background: rgba(255, 255, 255, 0.2);   /* MUST be translucent — the blur shows THROUGH the background */
  -webkit-backdrop-filter: blur(10px);    /* Safari needs -webkit- */
  backdrop-filter: blur(10px);           /* standard */
  border: 1px solid rgba(255, 255, 255, 0.3);
}
/* ⚠️ Needs content BEHIND the element to blur — a solid background shows no effect. */
/* ⚠️ Expensive: samples + filters the backdrop each frame. Use on small areas, don't animate. */
```
::

### Anti-pattern: opaque background hides the blur

::code-wrapper{language="css"}
```css
/* ❌ 80% opaque → only 20% of backdrop shows → blur barely visible. Looks like a solid panel. */
.glass { background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(10px); }
```
::

::code-wrapper{language="css"}
```css
/* ✓ 20% opaque → 80% of backdrop shows → blur visible. Plus content behind to blur. */
.glass { background: rgba(255, 255, 255, 0.2); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
```
::

## Blend Modes

::code-wrapper{language="css"}
```css
/* mix-blend-mode: blends element with the BACKDROP (content behind it, not siblings/children). */
.overlay { mix-blend-mode: multiply; }   /* multiply darkens; screen lightens; overlay = contrast */
/* ⚠️ mix-blend-mode creates a stacking context (like opacity<1). */
/* difference: inverts based on backdrop → text against white becomes black, against black becomes white */
.adaptive-text { mix-blend-mode: difference; color: white; }  /* guaranteed contrast on any backdrop */

/* background-blend-mode: blends an element's OWN background layers (not the backdrop). */
.box { background: url("texture.png"), linear-gradient(to right, red, blue); background-blend-mode: overlay; }
```
::

## Masking — `mask` for soft alpha fades

::code-wrapper{language="css"}
```css
/* mask uses an image's alpha (or luminance) to control visibility — soft edges, gradients. */
/* clip-path can only HARD-clip; mask can SOFT-fade. */
.fade-bottom {
  -webkit-mask: linear-gradient(to bottom, black, transparent);  /* Safari */
  mask: linear-gradient(to bottom, black, transparent);          /* standard */
}
/* mask-mode: alpha (default) uses alpha channel; luminance uses brightness (white=visible, black=hidden). */
```
::

## 💡 Tips & Tricks

- **Idiom**: `drop-shadow` (not `box-shadow`) for non-rectangular elements — PNG icons, SVGs, `clip-path`-ed shapes. The shadow follows the alpha shape. `box-shadow` is always rectangular.
- **Idiom**: `mask` with `linear-gradient` for soft fade-outs — `mask: linear-gradient(to bottom, black, transparent)` fades to transparent. `clip-path` can only hard-clip.
- **Idiom**: `mix-blend-mode: difference` for guaranteed-contrast text on variable backgrounds — text against white → black, against black → white.
- **Idiom**: `filter: hue-rotate()` for theming assets without re-exporting — shift a colored icon's hue to match a theme. Combine with `saturate()`/`brightness()` for fuller control.
- **Idiom**: `backdrop-filter` sparingly (expensive) and only on small translucent surfaces with content behind to blur.

## ⚠️ Edge Cases & Gotchas

- **`filter` creates a stacking context**: like `opacity < 1` and `transform`, `filter` traps children's z-index. A filtered parent's children can't escape its context.
- **`backdrop-filter` needs a translucent background**: opaque (0.8) hides the blur. Use 0.1–0.3. And needs content *behind* to blur.
- **`backdrop-filter` is expensive**: samples + filters the backdrop each frame. Don't animate it, don't use on large areas.
- **`mix-blend-mode` blends with the backdrop, not siblings/children**: it blends with content *behind* the element (ancestors, earlier siblings in the same context).
- **`mix-blend-mode: difference` against mid-gray (128,128,128)**: inverts to the same gray → text disappears on mid-gray backdrops.
- **`-webkit-mask` vs `mask`**: older Safari only supports `-webkit-mask` with limited syntax. Include both for cross-browser; test in Safari.
- **`drop-shadow` has no spread**: only `offset-x offset-y blur color`. `box-shadow` has spread; `drop-shadow` doesn't.

## 🧠 Spot the Bug

::code-wrapper{language="css"}
```css
.glass {
	background: rgba(255, 255, 255, 0.8);
	backdrop-filter: blur(10px);
}
```
::

<details>
<summary>Answer</summary>

The background is 80% opaque → only 20% of the backdrop shows through → the blur is barely visible. The card looks like a solid white panel, not frosted glass. Fix: `background: rgba(255, 255, 255, 0.2)` (translucent) so the blurred backdrop is visible. Also ensure there's colorful/textured content *behind* the card to blur — `backdrop-filter` blurs what shows *through* the background, and a solid backdrop shows no effect. Include `-webkit-backdrop-filter` for Safari.

</details>
