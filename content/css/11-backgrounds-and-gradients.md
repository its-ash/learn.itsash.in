# 11 — Backgrounds & Gradients

CSS backgrounds are powerful — images, gradients, positioning, and layering.

## Background Properties

::code-wrapper{language="css"}
```css
.box {
	background-color: #f0f0f0;
	background-image: url("bg.png"), linear-gradient(to right, red, blue);
	background-repeat: no-repeat, repeat;
	background-position: center, top left;
	background-size: cover, contain;
	background-attachment: scroll, fixed;
	background-clip: border-box, padding-box, content-box;
	background-origin: padding-box;
	background-blend-mode: multiply;
	/* Shorthand */
	background: #f0f0f0 url("bg.png") no-repeat center / cover;
}
```

### Multiple backgrounds

Comma-separate for multiple layers — first is on top:

::code-wrapper{language="css"}
```css
.box {
	background: url("overlay.png") no-repeat center, linear-gradient(to right, red, blue);
}
```

Each layer can have its own `image`/`repeat`/`position`/`size`/etc. `background-color` is the bottom layer (one only).

### `background-size`

- `cover` — scale to cover the box (crops if aspect ratios differ).
- `contain` — scale to fit entirely (letterboxes if aspect ratios differ).
- `100px 200px` — explicit size.
- `50% 50%` — relative to the box.

### `background-position`

::code-wrapper{language="css"}
```css
background-position: center;        /* one value, applies to both */
background-position: top left;      /* two values */
background-position: 50% 50%;       /* percentages */
background-position: 10px 20px;     /* lengths */
background-position: right 10px bottom 20px;  /* offset from edges */
```

### `background-attachment`

- `scroll` (default) — scrolls with the page.
- `fixed` — fixed relative to the viewport (parallax effect).
- `local` — scrolls with the element's content (for scrollable boxes).

`fixed` can be janky on mobile (performance). Use sparingly.

### `background-clip`

- `border-box` (default) — background extends to the border edge.
- `padding-box` — to the padding edge (under the border).
- `content-box` — only the content area.
- `text` — clips to the text (for gradient text effects):

::code-wrapper{language="css"}
```css
.gradient-text {
	background: linear-gradient(to right, red, blue);
	-webkit-background-clip: text;
	background-clip: text;
	color: transparent;
}
```

## Gradients

### `linear-gradient`

::code-wrapper{language="css"}
```css
background: linear-gradient(to right, red, blue);
background: linear-gradient(45deg, red, blue);
background: linear-gradient(red 0%, green 50%, blue 100%);  /* with stops */
background: linear-gradient(red, blue 20%, green);          /* stop positions */
background: linear-gradient(to right, red 0%, red 50%, blue 50%, blue 100%);  /* hard stop */
```

### `radial-gradient`

::code-wrapper{language="css"}
```css
background: radial-gradient(circle, red, blue);
background: radial-gradient(circle at top left, red, blue);
background: radial-gradient(50% 50%, red, blue);
```

### `conic-gradient`

::code-wrapper{language="css"}
```css
background: conic-gradient(red, yellow, green, blue, red);
background: conic-gradient(from 45deg, red, blue);
```

Conic gradients sweep around a center point — useful for pie charts and color wheels.

### Repeating gradients

::code-wrapper{language="css"}
```css
background: repeating-linear-gradient(45deg, red, red 10px, blue 10px, blue 20px);
background: repeating-conic-gradient(red 0 30deg, blue 30deg 60deg);
```

## Gradient Tips

- Gradients are images (`background-image`), so they layer with other backgrounds and respect `background-size`/`position`.
- Use hard stops for stripes: `linear-gradient(red 0%, red 50%, blue 50%, blue 100%)`.
- Gradient angles: `0deg` = to top, `90deg` = to right, `180deg` = to bottom.

## 💡 Tips & Tricks

- **Idiom**: use `background-size: cover` for full-bleed images (hero sections, card thumbnails) — it scales to cover the box, cropping overflow, maintaining aspect ratio. Use `contain` when the whole image must be visible (logos).
- **Idiom**: use `background-clip: text` + `color: transparent` for gradient text — the gradient shows through the text shape. Keep the `-webkit-` prefix for Safari compatibility.
- **Idiom**: use multiple backgrounds (comma-separated) for layered effects — a gradient over an image, a noise texture over a color. First listed is on top.
- **Idiom**: use `background-position: right 10px bottom 20px` for offset-from-edges positioning — clearer than computing percentages, and it pins to a specific corner with an offset.
- **Idiom**: use hard stops (`red 50%, blue 50%`) for striped gradients — the abrupt transition creates a stripe pattern, useful for progress bars, warning patterns, or decorative stripes.

## ⚠️ Edge Cases & Gotchas

- **`background-color` is the bottom layer**: in multiple backgrounds, only one `background-color` (the last fallback). Set it on the shorthand's first layer or as a separate property.
- **`background-size` in the shorthand**: `background: url(x) center / cover;` — the `/` separates position from size. Forgetting the `/` makes `cover` a second position value (invalid).
- **`background-attachment: fixed` is janky on mobile**: it causes repaints on scroll, and some mobile browsers don't support it well. Use sparingly or avoid.
- **Gradient text needs `color: transparent`**: without it, the text color covers the gradient. And `-webkit-background-clip: text` for Safari.
- **`background-clip: border-box` (default) shows the background under a transparent/dashed border**: use `padding-box` to clip at the padding edge if you don't want the background under the border.
- **`background-origin` vs `background-clip`**: `origin` is where the background *starts* (for positioning/sizing); `clip` is where it's *clipped*. They can differ.
- **Gradients are resolution-independent**: they scale without pixelation, unlike raster images. Use gradients for UI effects (buttons, stripes) instead of images.
- **`linear-gradient` angle: 0deg is to top**: not to right. `90deg` is to right, `180deg` to bottom. Mnemonic: 0deg points up, increasing clockwise.
- **`conic-gradient` for pie charts**: `conic-gradient(red 0 30%, blue 30% 70%, green 70% 100%)` — segments by percentage. Useful for simple pie/donut charts without SVG.

## 🧠 Spot the Bug

A developer sets a background image with `background-size: cover`, but the image isn't covering the box — it's tiny and tiled:

::code-wrapper{language="css"}
```css
.box {
	background: url("bg.png");
	background-size: cover;
}
```
::

What's wrong?

<details>
<summary>Answer</summary>

The shorthand `background: url("bg.png")` resets *all* background properties to their defaults — including `background-size` (to `auto`). Then `background-size: cover` is set *after* the shorthand, so it should work... actually, it does work (the later `background-size: cover` applies).

The real bug: the shorthand `background: url("bg.png")` also sets `background-repeat: repeat` (the default). The image tiles. And `background-size: cover` scales it to cover, so it shouldn't tile... unless the image fails to load (404), in which case there's no image to cover, and nothing shows.

Actually, the most likely real bug: **the shorthand comes first, then `background-size: cover` — but the shorthand already reset everything, and `cover` applies.** If it's "tiny and tiled," the issue is that `background-size` is being overridden or the shorthand is *after* `background-size`:

```css
.box {
	background-size: cover;        /* set first */
	background: url("bg.png");     /* ❌ shorthand resets size to auto! */
}
```

Here the shorthand *resets* `background-size` to `auto` (overriding the earlier `cover`), so the image is at its natural size (tiny) and tiles (default `repeat`).

The fix — put `background-size` *after* the shorthand, or include it in the shorthand:

```css
/* Option 1: size after shorthand */
.box { background: url("bg.png") no-repeat center; background-size: cover; }

/* Option 2: in the shorthand (with /) */
.box { background: url("bg.png") no-repeat center / cover; }
```

**The lesson**: the `background` shorthand resets *all* background properties to defaults. Setting `background-size` before the shorthand is overridden. Set it after, or include it in the shorthand (`position / size`).

</details>

## Summary

You can now use background-color/image/repeat/position/size/attachment/clip, multiple backgrounds, gradients (linear/radial/conic/repeating), and `background-clip: text` for gradient text — while avoiding the shorthand-resets-everything trap. Next: borders, shadows, and outlines.