# 14 — Filters, Blend Modes & Masking

CSS filters, blend modes, and masking provide image-editing-like effects — blur, color shifting, compositing, and alpha cutting.

## `filter`

`filter` applies graphical filters (like Photoshop filters):

::code-wrapper{language="css"}
```css
.img { filter: blur(5px); }
.img { filter: brightness(1.5); }     /* 0=black, 1=normal, 2=twice as bright */
.img { filter: contrast(2); }
.img { filter: grayscale(1); }        /* 0=color, 1=fully gray */
.img { filter: hue-rotate(90deg); }
.img { filter: invert(1); }           /* invert colors */
.img { filter: opacity(0.5); }
.img { filter: saturate(2); }
.img { filter: sepia(1); }
.img { filter: drop-shadow(4px 4px 10px rgba(0,0,0,0.5)); }
/* Multiple */
.img { filter: grayscale(1) blur(2px) brightness(1.2); }
```
::
### `drop-shadow` vs `box-shadow`

`drop-shadow` follows the *shape* of the element (including transparent parts of an image/PNG), while `box-shadow` follows the *box*:

::code-wrapper{language="css"}
```css
/* For a PNG with transparency: */
.icon { filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.5)); }  /* shadow follows the icon shape */
.icon { box-shadow: 2px 2px 4px rgba(0,0,0,0.5); }          /* shadow on the rectangular box */
```
::
Use `drop-shadow` for non-rectangular elements (icons, PNGs with alpha, clipped elements).

### `backdrop-filter`

`backdrop-filter` applies a filter to the area *behind* the element (the content showing through):

::code-wrapper{language="css"}
```css
.glass {
	background: rgba(255,255,255,0.2);
	backdrop-filter: blur(10px);
}
```
::
This is the "frosted glass" / glassmorphism effect — a translucent background with a blurred backdrop. Needs a semi-transparent background to see through.

### Performance

Filters are GPU-accelerated (mostly), but `backdrop-filter` is expensive (it samples and filters the backdrop each frame). Use sparingly, especially on large areas or animated elements.

## Blend Modes

### `mix-blend-mode`

`mix-blend-mode` blends an element with the content *behind* it (the backdrop):

::code-wrapper{language="css"}
```css
.overlay { mix-blend-mode: multiply; }   /* blends with what's behind */
```
::
Common modes: `multiply`, `screen`, `overlay`, `darken`, `lighten`, `color-dodge`, `color-burn`, `hard-light`, `soft-light`, `difference`, `exclusion`, `hue`, `saturation`, `color`, `luminosity`.

- `multiply` — darkens (white is transparent, black stays).
- `screen` — lightens (opposite of multiply).
- `overlay` — contrast (multiply on dark, screen on light).
- `difference` — inverts based on backdrop.

`mix-blend-mode` also creates a stacking context (like `opacity < 1`).

### `background-blend-mode`

`background-blend-mode` blends an element's *own* background layers:

::code-wrapper{language="css"}
```css
.box {
	background: url("texture.png"), linear-gradient(to right, red, blue);
	background-blend-mode: overlay;   /* blends the texture with the gradient */
}
```
::
## Masking

### `mask` (and `-webkit-mask`)

`mask` uses an image's alpha (or luminance) to control an element's visibility — like `clip-path` but with alpha gradients (soft edges):

::code-wrapper{language="css"}
```css
.img {
	-webkit-mask: linear-gradient(to bottom, black, transparent);
	mask: linear-gradient(to bottom, black, transparent);
}
```
::
This fades the bottom of the image to transparent — a soft fade-out. `clip-path` can only hard-clip; `mask` can soft-fade.

### Mask modes

- `mask-mode: alpha` (default) — uses the mask image's alpha channel.
- `mask-mode: luminance` — uses brightness (white = visible, black = hidden).
- `mask-mode: match-source` — alpha for images/SVGs, luminance otherwise.

### `-webkit-mask` for compatibility

WebKit/Safari historically used `-webkit-mask` (with differences). For cross-browser, include both:

::code-wrapper{language="css"}
```css
.img {
	-webkit-mask: url("mask.svg") center / contain no-repeat;
	mask: url("mask.svg") center / contain no-repeat;
}
```
::
## `clip-path` recap

`clip-path` (from chapter 10) hard-clips to a shape. `mask` is for soft/alpha-based cutting. Use `clip-path` for sharp shapes, `mask` for gradients and soft edges.

## 💡 Tips & Tricks

- **Idiom**: use `drop-shadow` (not `box-shadow`) for non-rectangular elements — `drop-shadow` follows the alpha shape (PNG icons, SVGs, `clip-path`-ed elements), while `box-shadow` is always rectangular. For a circular avatar, `drop-shadow` gives a circular shadow.
- **Idiom**: use `backdrop-filter: blur()` with a translucent background for glassmorphism — `background: rgba(255,255,255,0.2); backdrop-filter: blur(10px);` creates frosted glass. Keep the background translucent (to see the blur) and use `backdrop-filter` sparingly (it's expensive).
- **Idiom**: use `mask` with a `linear-gradient` for soft fade-outs — `mask: linear-gradient(to bottom, black, transparent)` fades an element to transparent, something `clip-path` can't do (it hard-clips). Useful for scroll fade effects.
- **Idiom**: use `mix-blend-mode: difference` for guaranteed-contrast text — text with `mix-blend-mode: difference` against white becomes black, against black becomes white, adapting to any backdrop. Useful for overlays on variable backgrounds.
- **Idiom**: use `filter: hue-rotate()` for theming without re-exporting assets — a colored icon can be hue-shifted to match a theme. Combine with `saturate()`/`brightness()` for fuller control.

## ⚠️ Edge Cases & Gotchas

- **`filter` creates a stacking context**: like `opacity < 1` and `transform`, `filter` traps children's `z-index`. A filtered parent's children can't escape its stacking context.
- **`backdrop-filter` is expensive**: it samples and filters the backdrop each frame. On large areas or animated elements, it can drop frames. Use on small areas, avoid animating.
- **`backdrop-filter` needs a translucent background**: with an opaque background, there's nothing to see through, so the blur is invisible. Use `rgba(...,0.x)` or `transparent`.
- **`mix-blend-mode` blends with the backdrop, not siblings**: it blends with the content *behind* the element (ancestors, earlier siblings), not the element's own children. And it creates a stacking context.
- **`mix-blend-mode: difference` with mid-gray**: `difference` against `rgb(128,128,128)` inverts to the same gray — text disappears on mid-gray backdrops. Use a different mode or background.
- **`-webkit-mask` vs `mask`**: older Safari only supports `-webkit-mask` with a limited syntax (no `mask-mode`, different defaults). Include both for cross-browser; test in Safari.
- **`mask` with `mask-mode: luminance`**: white = visible, black = hidden (opposite of alpha in some contexts). Explicit `mask-mode` avoids confusion.
- **`drop-shadow` has no `spread`**: unlike `box-shadow`, `filter: drop-shadow()` takes only `offset-x offset-y blur color` — no spread.
- **Filters are GPU-accelerated but have limits**: stacking many filters or applying to large elements can still be expensive. `filter: blur(50px)` on a full-screen element is costly.
- **`backdrop-filter` Safari support**: needs `-webkit-backdrop-filter` in older Safari. Include both: `backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);`.

## 🧠 Spot the Bug

A developer creates a glassmorphism card, but the blur isn't showing — the card is just translucent white:

::code-wrapper{language="css"}
```css
.glass {
	background: rgba(255, 255, 255, 0.8);   /* mostly opaque */
	backdrop-filter: blur(10px);
}
```
::

What's wrong?

<details>
<summary>Answer</summary>

The background is `rgba(255, 255, 255, 0.8)` — 80% opaque. Only 20% of the backdrop shows through, so the blur is barely visible. The card looks like a solid white panel, not frosted glass.

The fix — use a more translucent background so the blurred backdrop is visible:

```css
.glass {
	background: rgba(255, 255, 255, 0.2);   /* 20% opaque, 80% backdrop shows */
	backdrop-filter: blur(10px);
	-webkit-backdrop-filter: blur(10px);   /* Safari */
}
```
::
Also, ensure there's content *behind* the card to blur — if the card is over a solid background, the blur has nothing to show. Glassmorphism needs a colorful or textured backdrop to be visible.

**The lesson**: `backdrop-filter` blurs what shows *through* the background. A mostly-opaque background (0.8) hides the blur. Use a translucent background (0.1–0.3) so the blurred backdrop is visible, and ensure there's content behind to blur.

</details>

## Summary

You can now use `filter` (blur/brightness/contrast/grayscale/etc., `drop-shadow` for non-rectangular shadows), `backdrop-filter` for glassmorphism (with a translucent background), `mix-blend-mode`/`background-blend-mode` for compositing, and `mask` for soft alpha-based cutting (vs `clip-path`'s hard clip) — while avoiding the stacking-context and translucency traps. Next: CSS variables and theming.