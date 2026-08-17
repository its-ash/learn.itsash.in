# 07 — Flexbox

Flexbox is a one-dimensional layout model — it arranges items in a row or column, with powerful alignment, sizing, and wrapping. It's the go-to for component-level layout.

## The Flex Container

::code-wrapper{language="css"}
```css
.container {
	display: flex;            /* row (default) */
	flex-direction: column;   /* or row | row-reverse | column-reverse */
}
```
::
`display: flex` makes the container a flex container; its direct children become flex items.

### `flex-direction`

| Value | Direction |
|---|---|
| `row` (default) | Left to right |
| `row-reverse` | Right to left |
| `column` | Top to bottom |
| `column-reverse` | Bottom to top |

## Alignment

### `justify-content` — alignment along the main axis

::code-wrapper{language="css"}
```css
.container {
	justify-content: flex-start;    /* pack to start */
	justify-content: flex-end;      /* pack to end */
	justify-content: center;        /* center */
	justify-content: space-between; /* first/last at edges, equal space between */
	justify-content: space-around;  /* equal space around each (halves at edges) */
	justify-content: space-evenly;  /* equal space between and at edges */
}
```
::
### `align-items` — alignment along the cross axis

::code-wrapper{language="css"}
```css
.container {
	align-items: stretch;     /* fill the cross axis (default) */
	align-items: flex-start;  /* start of cross axis */
	align-items: flex-end;    /* end of cross axis */
	align-items: center;      /* center of cross axis */
	align-items: baseline;    /* align by text baseline */
}
```
::
### `align-self` (per-item)

::code-wrapper{language="css"}
```css
.item { align-self: center; }   /* overrides align-items for this item */
```
::
### `align-content` (multi-line alignment)

When items wrap to multiple lines, `align-content` aligns the *lines* on the cross axis:

::code-wrapper{language="css"}
```css
.container { align-content: space-between; }
```
::
## Wrapping

::code-wrapper{language="css"}
```css
.container {
	flex-wrap: nowrap;     /* one line, shrink items to fit (default) */
	flex-wrap: wrap;       /* wrap to new lines */
	flex-wrap: wrap-reverse;
}
```
::
`nowrap` (default) forces all items onto one line, shrinking them as needed. `wrap` lets them wrap to new lines when they don't fit.

## `gap`

::code-wrapper{language="css"}
```css
.container {
	display: flex;
	gap: 1rem;            /* space between items */
	gap: 1rem 2rem;       /* row-gap column-gap */
	row-gap: 1rem;
	column-gap: 2rem;
}
```
::
`gap` is the modern way to space flex items — no more margin hacks or `:not(:last-child)` selectors.

## Flex Item Sizing

::code-wrapper{language="css"}
```css
.item {
	flex-grow: 1;      /* grow to fill available space (0 = don't grow) */
	flex-shrink: 1;    /* shrink when overflowing (0 = don't shrink) */
	flex-basis: auto;  /* base size before grow/shrink (auto = use width/height) */
	flex: 1;           /* shorthand: flex-grow: 1; flex-shrink: 1; flex-basis: 0% */
	flex: 1 0 200px;   /* grow: 1, shrink: 0, basis: 200px */
	flex: none;        /* flex: 0 0 auto — don't grow/shrink, use width/height */
}
```
::
### The `flex` shorthand

`flex: <grow> <shrink> <basis>`:
- `flex: 1` = `1 1 0%` — grow equally, basis 0 (all items share space equally).
- `flex: auto` = `1 1 auto` — grow, basis is the item's content size.
- `flex: none` = `0 0 auto` — no grow/shrink, use content size.
- `flex: 0 0 200px` — fixed 200px, no grow/shrink.

**Prefer the `flex` shorthand** over individual properties — it's clearer and covers the common cases.

### `flex-grow` and equal sizing

::code-wrapper{language="css"}
```css
.container { display: flex; }
.item { flex: 1; }   /* all items share space equally */
```
::
`flex: 1` on all items makes them equal-width (in a row). Different `flex-grow` values proportion: `flex: 2` gets twice the space of `flex: 1`.

## Order

::code-wrapper{language="css"}
```css
.item { order: 2; }   /* visual order (default 0; lower comes first) */
```
::
`order` reorders items visually without changing the DOM. ⚠️ The DOM order (for accessibility/tab order) doesn't change — `order` is visual only. Don't use it for meaningful reordering (use the DOM).

## Common Patterns

### Centering (horizontal + vertical)

::code-wrapper{language="css"}
```css
.container {
	display: flex;
	justify-content: center;   /* horizontal center (main axis) */
	align-items: center;       /* vertical center (cross axis) */
	height: 100vh;
}
```
::
The classic "center a thing" — flexbox makes it one line each way.

### Navbar (logo left, links right)

::code-wrapper{language="css"}
```css
.nav { display: flex; justify-content: space-between; align-items: center; }
```
::
### Sidebar + content

::code-wrapper{language="css"}
```css
.layout { display: flex; }
.sidebar { flex: 0 0 250px; }   /* fixed 250px */
.content { flex: 1; }           /* fill remaining */
```
::
### Card grid (wrapping)

::code-wrapper{language="css"}
```css
.grid { display: flex; flex-wrap: wrap; gap: 1rem; }
.card { flex: 1 1 300px; }   /* grow/shrink, base 300px */
```
::
## 💡 Tips & Tricks

- **Idiom**: use `display: flex; justify-content: center; align-items: center;` for centering — it's the one-line-each-way centering solution (horizontal + vertical), replacing the old `margin: auto`/`position: absolute`/`transform` hacks. Set a height on the container for vertical centering to have space.
- **Idiom**: use `gap` for spacing flex/grid items — `gap: 1rem` is cleaner than `margin` on each item + `:not(:last-child)` to avoid trailing margin. `gap` handles wrapping correctly (no trailing gap on wrapped lines) and works in flex, grid, and multi-column.
- **Idiom**: use the `flex` shorthand (`flex: 1`, `flex: 0 0 200px`, `flex: none`) over individual `flex-grow`/`flex-shrink`/`flex-basis` — it's clearer, covers the common cases, and avoids the `flex-basis: auto` default surprise. `flex: 1` (grow equally, basis 0) is the standard for equal-width items.
- **Idiom**: use `flex: 0 0 <size>` for fixed-width items and `flex: 1` for the fluid content — `sidebar { flex: 0 0 250px } content { flex: 1 }` gives a fixed sidebar and a fluid content area, the classic app layout.
- **Idiom**: use Flexbox for one-dimensional layouts (a row or a column) and Grid for two-dimensional (rows and columns) — flexbox is for "a row of items" or "a column of items"; grid is for "a 2D grid of items." Many layouts combine both (a grid of cards, each card a flexbox).

## ⚠️ Edge Cases & Gotchas

- **`flex: 1` vs `flex: 1 1 auto`**: `flex: 1` is `1 1 0%` (basis 0 — items share space equally regardless of content); `flex: 1 1 auto` (or `flex: auto`) uses content size as the basis (items grow from their content size). For equal-width, use `flex: 1`.
- **`flex-basis: auto` uses `width`/`height`**: if you set `width: 200px` and `flex-basis: auto`, the basis is 200px. If `flex-basis: 0%`, the width is ignored (basis is 0).
- **`min-width: auto` (default) prevents shrinking below content size**: flex items won't shrink below their content's minimum width by default, which can cause overflow. Set `min-width: 0` (or `overflow: hidden`) to allow shrinking.
- **`order` is visual only — DOM order unchanged**: `order: -1` moves an item first visually, but tab order and screen reader order follow the DOM. Don't use `order` for meaningful reordering.
- **`align-items: stretch` (default) can distort items**: items stretch to fill the cross axis. For images, this can distort them — set `align-items: flex-start` or `align-self: start` on the image.
- **Flexbox and `min-height`/`height`**: a flex container with `align-items: stretch` (default) stretches items to the container's cross-axis size. If the container has no explicit height, it's the content's height — items may not stretch as expected.
- **Nested flex containers**: a flex item can itself be a flex container — `display: flex` on an item makes its children flex items. This is how you build complex layouts (a flex row of flex columns).
- **`gap` and older Safari**: `gap` in flexbox shipped in Safari 14.1 (2021). For older browsers, use margins. Modern projects can assume `gap` support.
- **`flex-wrap: nowrap` (default) can overflow**: items shrink to fit, but if they have `min-width` or content that can't shrink, they overflow. Use `flex-wrap: wrap` or `min-width: 0`.
- **`justify-content` has no effect if items fill the container**: if `flex-grow: 1` items fill the space, there's no free space for `justify-content` to distribute. `justify-content` only matters when items are smaller than the container.

## 🧠 Spot the Bug

A developer has a flex row of three items, each `flex: 1`, but one item has long content and doesn't shrink — the row overflows:

::code-wrapper{language="css"}
```css
.row { display: flex; }
.item { flex: 1; }
```
::

What's wrong, and how do you fix it?

<details>
<summary>Answer</summary>

Flex items have `min-width: auto` by default, which means they won't shrink below their content's minimum size. An item with long, unbreakable content (a long word, a URL) can't shrink below that content's width, so it overflows the container even with `flex: 1`.

The fix — set `min-width: 0` (or `overflow: hidden`) on the flex items to allow shrinking below content size:

```css
.row { display: flex; }
.item { flex: 1; min-width: 0; }   /* allow shrinking below content */
```
::
Or, for text content, allow word-breaking:

```css
.item { flex: 1; min-width: 0; overflow-wrap: break-word; }
```
::
`min-width: 0` overrides the default `auto`, letting the item shrink as flex intends. This is one of the most common flexbox bugs — "my flex items won't shrink" is almost always `min-width: auto`.

**The lesson**: flex items have `min-width: auto` by default (won't shrink below content). Set `min-width: 0` to allow shrinking, especially for items with long text content.

</details>

## Summary

You can now build flex layouts (direction, justify/align, wrap, gap), size items with `flex: 1`/`flex: 0 0 200px`/`flex: none`, reorder with `order` (visual only), and build common patterns (centering, navbars, sidebar+content, card grids) — while avoiding the `min-width: auto` and `flex: 1` vs `flex: auto` traps. Next: CSS Grid — two-dimensional layout.