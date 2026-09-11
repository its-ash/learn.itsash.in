---
title: "07 — Flexbox: One-Dimensional Layout & the flex Algorithm"
description: "Flex-grow/shrink/basis resolution, the min-width:auto trap, gap, alignment axes, and the flex shorthand production patterns. Code-first reference with app-layout and centering systems."
---

# 07 — Flexbox: One-Dimensional Layout & the flex Algorithm

Flexbox arranges items along a single axis (row or column) with a grow/shrink/basis algorithm. The engine distributes free space according to `flex-grow`, shrinks according to `flex-shrink`, and sizes from `flex-basis`. The one bug every flexbox developer hits: `min-width: auto` preventing shrink. Master that, and flexbox is predictable.

## The Flex Container

::code-wrapper{language="css"}
```css
.container {
  display: flex;              /* children become flex items. Default: row, nowrap. */
  flex-direction: row;        /* row | row-reverse | column | column-reverse */
  flex-wrap: wrap;             /* nowrap (default: shrink to fit) | wrap | wrap-reverse */
  gap: 1rem;                   /* modern spacing: no margin hacks, correct on wrap (no trailing gap) */
  justify-content: space-between; /* main-axis distribution: flex-start|end|center|space-between|around|evenly */
  align-items: center;         /* cross-axis alignment: stretch(default)|flex-start|end|center|baseline */
  align-content: flex-start;   /* multi-LINE cross-axis alignment (only when items wrap). Single-line: no-op. */
}
```
::

## The `flex` Algorithm — grow, shrink, basis

::code-wrapper{language="css"}
```css
/* flex: <grow> <shrink> <basis>. The engine: (1) sizes each item to its basis,
   (2) if leftover space → distributes by grow ratio, (3) if overflow → shrinks by shrink ratio. */
.item { flex: 1; }       /* = 1 1 0%   → grow equally, basis 0 → EQUAL widths regardless of content */
.item { flex: auto; }    /* = 1 1 auto  → grow from content-sized basis → proportional to content */
.item { flex: none; }    /* = 0 0 auto  → no grow, no shrink → uses width/height as-is */
.item { flex: 0 0 250px; } /* fixed 250px, no grow, no shrink */
.item { flex: 1 1 min-content; } /* grow, but never below min-content width */
```
::

### `flex: 1` vs `flex: 1 1 auto` — the basis distinction

::code-wrapper{language="css"}
```css
/* flex: 1 = basis 0% → all items share space EQUALLY (content doesn't affect size). */
/* flex: 1 1 auto = basis auto → items grow from their CONTENT size → larger content = larger item. */
/* For equal-width columns: flex: 1. For "fill remaining but respect content": flex: 1 1 auto. */
```
::

## `min-width: auto` — the flexbox layout killer

### Anti-pattern: flex items with long content overflow

::code-wrapper{language="css"}
```css
/* ❌ min-width: auto (default) = the item's intrinsic content minimum. Long text/URLs can't shrink → overflow. */
.row { display: flex; }
.item { flex: 1; }  /* grow:1 shrink:1, BUT min-width:auto blocks shrinking below content */
```
::

::code-wrapper{language="css"}
```css
/* ✓ min-width:0 releases the content floor → flex-shrink can actually shrink the item */
.row { display: flex; gap: 1rem; }
.item { flex: 1; min-width: 0; overflow-wrap: break-word; }  /* now shrinks as flex intends */
```
::

**Why:** the default `min-width: auto` computes to the content's intrinsic minimum (longest unbreakable word). `min-width: 0` overrides this floor, letting `flex-shrink` work. This is the single most common flexbox bug.

## Production Patterns

### Centering (horizontal + vertical)

::code-wrapper{language="css"}
```css
.center {
  display: flex;
  justify-content: center;  /* main axis (horizontal in a row) */
  align-items: center;       /* cross axis (vertical in a row) */
  min-block-size: 100dvh;    /* needs height for vertical centering to have space */
}
```
::

### App layout — fixed sidebar + fluid content

::code-wrapper{language="css"}
```css
.app { display: flex; min-block-size: 100dvh; }
.sidebar { flex: 0 0 250px; }  /* fixed 250px, no grow/shrink */
.content { flex: 1; min-width: 0; }  /* fill remaining, allow shrinking below content */
```
::

### Navbar — logo left, links right

::code-wrapper{language="css"}
```css
.nav { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
```
::

### Responsive card grid (wrapping)

::code-wrapper{language="css"}
```css
.cards { display: flex; flex-wrap: wrap; gap: 1rem; }
.card { flex: 1 1 300px; min-width: 0; }  /* grow/shrink, base 300px, wraps when no room */
```
::

## `order` — visual reordering (accessibility caveat)

::code-wrapper{language="css"}
```css
.item { order: -1; }  /* moves FIRST visually. ⚠️ DOM order (tab order, screen readers) is UNCHANGED. */
/* Never use `order` for meaningful reordering — it decouples visual from a11y order. Use the DOM. */
```
::

## 💡 Tips & Tricks

- **Idiom**: `gap` replaces every flex spacing hack — no `margin` + `:not(:last-child)`, no trailing-gap-on-wrap bug. `gap: 1rem` is correct on every line after wrapping.
- **Idiom**: use the `flex` shorthand (`flex: 1`, `flex: 0 0 250px`, `flex: none`) — never individual `flex-grow`/`flex-shrink`/`flex-basis`. The shorthand is clearer and avoids the `flex-basis: auto` default surprise.
- **Idiom**: `flex: 0 0 <size>` for fixed-width items + `flex: 1` for fluid content — the app-layout pattern. Fixed sidebar, fluid main area.
- **Idiom**: `align-items: baseline` for aligning items by text baseline — buttons with different font sizes align by text, not by box edge. Better than `center` for mixed-content rows.

## ⚠️ Edge Cases & Gotchas

- **`flex-basis: auto` uses `width`/`height`**: if you set `width: 200px` and `flex-basis: auto`, the basis is 200px. If `flex-basis: 0%`, the width is ignored (basis is 0).
- **`align-items: stretch` (default) distorts images**: images stretch to fill the cross axis. Set `align-items: flex-start` or `align-self: start` on the image.
- **`justify-content` is a no-op when items fill the container**: if `flex: 1` items fill the space, there's no free space to distribute. `justify-content` only matters when items are smaller than the container.
- **`flex-wrap: nowrap` (default) overflows**: items shrink to fit, but `min-width: auto` or unbreakable content causes overflow. Use `flex-wrap: wrap` or `min-width: 0`.
- **`gap` in flexbox needs Safari 14.1+** (2021). Modern projects can assume support; for legacy, use margins.
- **Nested flex containers compose**: a flex item can be `display: flex` itself — flex row of flex columns is the building block for complex layouts.

## 🧠 Spot the Bug

::code-wrapper{language="css"}
```css
.row { display: flex; }
.item { flex: 1; }
```
::

<details>
<summary>Answer</summary>

Flex items have `min-width: auto` by default — they won't shrink below their content's intrinsic minimum (a long word, URL, or unbreakable string). An item with long content overflows the row even with `flex: 1`. Fix: `min-width: 0` (override the content floor) + `overflow-wrap: break-word` (let text break). This is the #1 flexbox bug — "my flex items won't shrink" is almost always `min-width: auto`.

</details>
