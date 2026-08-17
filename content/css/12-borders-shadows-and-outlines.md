# 12 — Borders, Shadows & Outlines

Borders, shadows, and outlines are the core of visual styling — edges, depth, and focus states.

## Borders

::code-wrapper{language="css"}
```css
.box {
	border: 2px solid #333;                    /* shorthand */
	border-width: 2px;
	border-style: solid;
	border-color: #333;
	border-radius: 8px;
	/* Per-side */
	border-top: 1px solid red;
	border-right: none;
	border-bottom: 2px dashed blue;
	border-left: 1px solid green;
}
```
::
### `border-style`

- `solid`, `dashed`, `dotted`, `double`, `groove`, `ridge`, `inset`, `outset`, `none`, `hidden`.

`none` and `hidden` both remove the border, but `hidden` has higher priority in border-collapse tables.

### `border-radius`

::code-wrapper{language="css"}
```css
border-radius: 10px;                         /* all corners */
border-radius: 10px 20px 30px 40px;          /* TL TR BR BL */
border-radius: 50%;                          /* circle (on a square) */
border-radius: 10px / 20px;                  /* elliptical (h/v) */
border-top-left-radius: 10px;                /* single corner */
```
::
`50%` on a square makes a circle; on a rectangle, an ellipse. The `/` separates horizontal and vertical radii for elliptical corners.

## Box Shadows

::code-wrapper{language="css"}
```css
box-shadow: 0 4px 6px rgba(0,0,0,0.1);       /* offset-x offset-y blur color */
box-shadow: 0 4px 6px 2px rgba(0,0,0,0.1);   /* + spread */
box-shadow: 0 4px 6px 2px rgba(0,0,0,0.1) inset;  /* inset */
box-shadow: 0 1px 2px rgba(0,0,0,0.1), 0 8px 24px rgba(0,0,0,0.1);  /* multiple, layered */
box-shadow: none;                            /* remove */
```
::
### Parameters

- `offset-x` `offset-y` — shadow direction (required).
- `blur-radius` — how blurry (0 = sharp edge).
- `spread-radius` — grows/shrinks the shadow.
- `color` — the shadow color.
- `inset` — shadow inside the box (instead of outside).

### Material design elevation

Layer shadows for depth (elevation):

::code-wrapper{language="css"}
```css
.elevation-1 { box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24); }
.elevation-2 { box-shadow: 0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23); }
.elevation-3 { box-shadow: 0 10px 20px rgba(0,0,0,0.19), 0 6px 6px rgba(0,0,0,0.23); }
```
::
A tight ambient shadow + a diffuse key shadow = realistic depth. This is the Material Design pattern.

### Shadow performance

Shadows are relatively expensive to paint. For animated shadows (hover transitions), use `will-change: box-shadow` or animate a pseudo-element's opacity instead of animating `box-shadow` directly (which repaints each frame).

## Text Shadows

::code-wrapper{language="css"}
```css
text-shadow: 2px 2px 4px rgba(0,0,0,0.5);    /* offset-x offset-y blur color */
text-shadow: 0 0 10px #fff;                  /* glow */
text-shadow: 1px 1px 0 #000, 2px 2px 0 #000; /* multiple, layered (3D text) */
```
::
No `inset` or `spread` for text-shadow. Multiple shadows create effects (3D text, neon glow).

## Outlines

::code-wrapper{language="css"}
```css
button:focus-visible {
	outline: 2px solid blue;
	outline-offset: 2px;
}
```
::
Outlines are *like* borders but:
- Don't take up space (don't affect layout).
- Can be non-rectangular (in some browsers).
- Always on all four sides (no per-side).
- Not affected by `border-radius` (mostly).

`outline` is for focus states — it doesn't shift the layout when it appears (unlike a border). `outline-offset` adds a gap between the element and the outline.

### `:focus-visible`

Use `:focus-visible` (not `:focus`) for focus rings — it shows the outline only for keyboard users (not mouse clicks):

::code-wrapper{language="css"}
```css
button:focus { outline: none; }              /* ❌ removes keyboard focus too */
button:focus-visible { outline: 2px solid blue; }  /* ✓ keyboard only */
```
::
Never remove `outline` without providing an alternative focus indicator — it's an accessibility violation.

## 💡 Tips & Tricks

- **Idiom**: use `:focus-visible` for focus rings — it shows the outline only for keyboard navigation, not mouse clicks, avoiding the "click and a ring appears" annoyance while keeping keyboard accessibility. Pair with `outline-offset` for a gap.
- **Idiom**: layer box-shadows for realistic elevation — a tight ambient shadow (small blur, close) + a diffuse key shadow (large blur, far) creates depth. This is the Material Design elevation pattern; single flat shadows look amateurish.
- **Idiom**: use `border-radius: 50%` on a square for a circle — it's the modern way to make circular avatars/badges without SVG. On a rectangle, it makes an ellipse.
- **Idiom**: animate a pseudo-element's opacity for shadow transitions — animating `box-shadow` directly repaints each frame (janky). Instead, a `::after` with the hover shadow, opacity 0 → 1, is cheaper and smoother.
- **Idiom**: use `outline` (not `border`) for focus indicators — outlines don't affect layout (no shift when focus appears), and `outline-offset` adds a gap. Never remove `outline` without a replacement; it's an a11y violation.

## ⚠️ Edge Cases & Gotchas

- **`border-style: none` (default) means no border**: `border-width: 2px` alone does nothing — the style is `none`. Always set a style (`solid`, etc.) for the border to appear.
- **`box-shadow` doesn't affect layout**: it's painted outside the box and doesn't take space. A large shadow can overlap neighboring elements without pushing them.
- **`box-shadow` is clipped by `overflow: hidden` ancestors**: a child's shadow extending outside an `overflow: hidden` parent is cut off. Use `overflow: clip` (no scroll container) or restructure.
- **`outline` doesn't follow `border-radius`** (in most browsers): the outline is rectangular even on a rounded box. Modern browsers are fixing this, but for rounded focus rings, use `box-shadow` as the focus indicator or `border` (which shifts layout).
- **`:focus` vs `:focus-visible`**: `:focus` matches both keyboard and mouse focus; `:focus-visible` matches keyboard only (and programmatic focus in some browsers). Use `:focus-visible` to avoid showing focus rings on mouse click.
- **Removing `outline` without a replacement is an a11y violation**: keyboard users lose the focus indicator. Always provide an alternative (a `box-shadow` ring, a background change, etc.).
- **`text-shadow` has no `inset` or `spread`**: unlike `box-shadow`. Only `offset-x offset-y blur color`.
- **`border-radius: 50%` on a non-square makes an ellipse, not a circle**: for a circle, the element must be square (equal width and height), or use `aspect-ratio: 1`.
- **Shadows are expensive to animate**: animating `box-shadow` repaints the shadow each frame. For hover effects, animate a pseudo-element's opacity instead.
- **`border` on a table cell with `border-collapse: collapse`**: borders are merged; the higher-priority style wins (`hidden` > `none` > others by width).

## 🧠 Spot the Bug

A developer removes the default focus outline and adds a custom one, but keyboard users can't see where focus is on buttons:

::code-wrapper{language="css"}
```css
button { outline: none; }
button:focus { box-shadow: 0 0 0 2px blue; }
```
::

What's the issue?

<details>
<summary>Answer</summary>

Two problems:

1. **`:focus` shows the shadow on mouse clicks too** — the developer probably intended keyboard-only, but `:focus` matches mouse clicks. After clicking a button, the shadow ring appears, which is usually unwanted. Use `:focus-visible` for keyboard-only.

2. **`box-shadow` is clipped by `overflow: hidden` ancestors** — if the button is inside an `overflow: hidden` container, the 2px shadow ring is clipped, and keyboard users can't see it. `outline` (and `outline-offset`) isn't clipped the same way.

The fix — use `:focus-visible` and `outline` (or ensure the shadow isn't clipped):

```css
button { outline: none; }  /* remove default, but provide a replacement */
button:focus-visible {
	outline: 2px solid blue;
	outline-offset: 2px;
}
```
::
Or if using `box-shadow`, ensure no `overflow: hidden` ancestor clips it, or use `outline` which isn't clipped.

**The lesson**: use `:focus-visible` (not `:focus`) for keyboard-only focus rings, and prefer `outline`/`outline-offset` (not clipped by `overflow: hidden`) for the focus indicator. Never remove `outline` without a visible replacement — keyboard users depend on it.

</details>

## Summary

You can now style borders (style/width/color/radius, per-side, elliptical), box-shadows (offset/blur/spread/inset, layered elevation), text-shadows, and outlines (focus states with `:focus-visible` and `outline-offset`) — while avoiding the layout-shift and clipping traps. Next: animations and transitions.