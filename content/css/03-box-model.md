# 03 — The Box Model

Every HTML element is a rectangular box with four layers: content, padding, border, margin. Understanding the box model is essential — it's the foundation of layout.

## The Layers

::code-wrapper{language="text"}
```text
┌─────────────────────────────────┐
│           margin                │
│  ┌───────────────────────────┐  │
│  │         border            │  │
│  │  ┌─────────────────────┐  │  │
│  │  │      padding        │  │  │
│  │  │  ┌───────────────┐  │  │  │
│  │  │  │    content    │  │  │  │
│  │  │  └───────────────┘  │  │  │
│  │  └─────────────────────┘  │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

- **Content** — the element's content (text, image, child elements). `width`/`height` set this (by default).
- **Padding** — space inside the border. `padding` adds to the element's size.
- **Border** — the border line. `border` adds to the element's size.
- **Margin** — space outside the border, between this element and others. `margin` doesn't add to the element's size but affects layout.

## `box-sizing`

The default is `box-sizing: content-box` — `width`/`height` set only the content area. Padding and border are *added* on top, making the actual element larger than `width`:

::code-wrapper{language="text"}
```text
content-box: width: 100px + padding: 10px + border: 2px = 124px actual width
```

This is counterintuitive and a common source of layout bugs. **Use `border-box`**:

::code-wrapper{language="css"}
```css
* { box-sizing: border-box; }
```

With `border-box`, `width` includes padding and border — the element is exactly `width` wide:

::code-wrapper{language="text"}
```text
border-box: width: 100px (includes padding + border) = 100px actual width
```

`border-box` is the modern default — include this reset at the top of every stylesheet.

## Margin and Padding Shorthands

::code-wrapper{language="css"}
```css
margin: 10px;                     /* all four sides */
margin: 10px 20px;                /* top/bottom  left/right */
margin: 10px 20px 30px;           /* top  left/right  bottom */
margin: 10px 20px 30px 40px;     /* top  right  bottom  left (clockwise from top) */

margin-top: 10px;                 /* individual sides */
margin-right: 20px;
margin-bottom: 30px;
margin-left: 40px;

/* Logical properties (writing-mode aware) */
margin-block: 10px;               /* top/bottom in horizontal writing mode */
margin-inline: 20px;              /* left/right in horizontal writing mode */
```

The same pattern applies to `padding`. The 4-value order is **TRBL** (Top, Right, Bottom, Left) — clockwise from top. Mnemonic: "T-RouBLe."

## Margin Collapsing

Vertical margins between block elements **collapse** — the larger margin wins, they don't add:

::code-wrapper{language="text"}
```text
<p style="margin-bottom: 30px">A</p>
<p style="margin-top: 20px">B</p>
/* Gap between A and B: 30px (the larger), NOT 50px */
```

Margin collapsing rules:
- Adjacent siblings' vertical margins collapse.
- Parent and first/last child margins collapse (if no padding/border separates them).
- Empty blocks' top and bottom margins collapse (if no padding/border/height).

Margins don't collapse:
- Horizontally (left/right margins don't collapse).
- In flex/grid containers (flex/grid items don't collapse).
- With padding/border between them (a parent with `padding-top: 1px` prevents parent-child collapse).
- Floating or absolutely positioned elements.

Margin collapsing is a frequent source of "why is the gap smaller than I expected?" Debug with DevTools' box model visualization.

## Negative Margins

`margin: -10px` pulls the element (or neighbors) closer — it can overlap:

::code-wrapper{language="css"}
```css
.pull-up { margin-top: -20px; }   /* moves the element up, overlapping the previous */
```

Negative margins are a hack for specific effects (overlapping, stretching). Use carefully — they can cause overlap and layout confusion.

## `width`, `height`, `min-`, `max-`

::code-wrapper{language="css"}
```css
.box {
	width: 300px;          /* content width (border-box: total width) */
	height: 200px;
	min-width: 200px;      /* won't shrink below this */
	max-width: 500px;      /* won't grow above this */
	/* min/max are useful for responsive: width: 100%; max-width: 600px */
}
```

`max-width` with `width: 100%` is the responsive pattern — fill the container, but cap at a max:

::code-wrapper{language="css"}
```css
.container { width: 100%; max-width: 1200px; margin: 0 auto; }
```

## `overflow`

What happens when content exceeds the element's size:

::code-wrapper{language="css"}
```css
.box {
	overflow: hidden;     /* clip the overflow */
	overflow: auto;       /* scroll if needed */
	overflow: scroll;     /* always show scrollbars */
	overflow: visible;    /* let it overflow (default) */
	overflow-x: hidden;   /* horizontal */
	overflow-y: auto;     /* vertical (can differ) */
}
```

`overflow: hidden` also clips shadows, transforms, and child elements outside the box — and it establishes a new formatting context (clears floats, contains margins).

## 💡 Tips & Tricks

- **Idiom**: always `* { box-sizing: border-box; }` at the top of your stylesheet — `border-box` makes `width` include padding and border (the element is exactly `width` wide), which is intuitive. The default `content-box` adds padding/border on top, making elements larger than declared — a source of layout bugs.
- **Idiom**: use `max-width` with `width: 100%` for responsive containers — `width: 100%; max-width: 1200px; margin: 0 auto;` fills the viewport on small screens but caps at 1200px on large screens, centered. This is the universal "centered, max-width container" pattern.
- **Idiom**: remember margin collapsing — vertical margins between adjacent block elements collapse (the larger wins, they don't add). This causes "the gap is smaller than I expected." Flex/grid containers don't collapse margins; add padding/border to prevent parent-child collapse.
- **Idiom**: use logical properties (`margin-inline`, `margin-block`, `padding-inline`) for writing-mode-aware layouts — they adapt to vertical writing modes (CJK) automatically. `margin-inline: auto` centers in the inline direction regardless of writing mode.
- **Idiom**: use `overflow: hidden` to clip overflowing content and to establish a "block formatting context" — this clears floats (a parent with `overflow: hidden` contains floated children) and contains child margins (prevents parent-child margin collapse). Modern alternatives: `display: flow-root` (clears floats without clipping).

## ⚠️ Edge Cases & Gotchas

- **`content-box` (default) adds padding/border on top of `width`**: `width: 100px; padding: 10px;` = 120px actual. Use `border-box` to make `width` the total.
- **Margin collapsing**: vertical margins between siblings/parent-child collapse (larger wins, don't add). Doesn't happen horizontally, in flex/grid, or with padding/border between them.
- **`height` with percentages needs a parent with a defined height**: `height: 100%` on a child of a `height: auto` parent is 0 (or auto). Set the parent's height (or use `min-height`, flex, or `100vh`).
- **`width: 100%` + padding/border overflows the parent** (with `content-box`): `width: 100%; padding: 10px;` = 100% + 20px > parent. `border-box` fixes this (the standard reason to use it).
- **Negative margins overlap**: `margin-top: -20px` pulls the element up, potentially overlapping the previous. Useful for specific effects but can cause confusion.
- **`overflow: hidden` clips shadows and transforms**: a child with `box-shadow` extending outside a `overflow: hidden` parent is clipped. Use `overflow: clip` (doesn't establish a scroll container) or restructure.
- **`overflow: auto` shows scrollbars only when needed**: but the scrollbar takes space, causing layout shift. Use `scrollbar-gutter: stable` to reserve space.
- **`min-width`/`max-width` interact**: `min-width: 200px; max-width: 500px; width: 100%` — the element is between 200 and 500px, depending on the container. `min` beats `max` if the container is smaller than `min` (overflow).
- **Padding percentages are relative to the *width***: `padding-top: 50%` is 50% of the parent's *width*, not height. This is the classic "intrinsic aspect ratio" hack (`padding-top: 56.25%` for 16:9) before `aspect-ratio`.
- **Margins don't affect the element's size, but affect layout**: `margin` is outside the border; `padding` is inside. `width` (border-box) includes padding but not margin.

## 🧠 Spot the Bug

A developer sets up a 100%-width input with padding, and it overflows the container:

::code-wrapper{language="css"}
```css
input {
	width: 100%;
	padding: 10px;
	border: 1px solid gray;
}
```
::

The input is wider than its container. Why?

<details>
<summary>Answer</summary>

With the default `box-sizing: content-box`, `width: 100%` sets the *content* width to 100% of the parent. Then `padding: 10px` (20px total left+right) and `border: 1px` (2px total) are *added* on top, making the input `100% + 22px` wide — overflowing the container.

The fix — `box-sizing: border-box`:

```css
* { box-sizing: border-box; }

input {
	width: 100%;
	padding: 10px;
	border: 1px solid gray;
}
```

With `border-box`, `width: 100%` includes padding and border — the input is exactly 100% wide, fitting the container. This is why `* { box-sizing: border-box; }` is a universal reset.

**The lesson**: `content-box` (default) adds padding/border on top of `width`, causing `width: 100%` + padding to overflow. `border-box` includes padding/border in `width`, preventing overflow. Always use `border-box`.

</details>

## Summary

You understand the box model (content/padding/border/margin), `box-sizing: border-box` (always use it), margin collapsing (vertical, not horizontal/flex/grid), `min/max-width`, `overflow`, and logical properties. Next: colors and units.