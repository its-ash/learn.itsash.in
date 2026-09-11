---
title: "08 — CSS Grid: Two-Dimensional Layout & Track Resolution"
description: "fr distribution, minmax(0,1fr) for content overflow, auto-fit vs auto-fill, grid-template-areas, subgrid, and the intrinsic-minimum trap. Code-first reference with Holy Grail and responsive card-grid systems."
---

# 08 — CSS Grid: Two-Dimensional Layout & Track Resolution

Grid lays items in rows *and* columns simultaneously. The engine resolves track sizes from `grid-template-columns`/`rows`, distributes free space by `fr`, and places items into tracks. The one bug: `1fr` has an implicit `minmax(auto, 1fr)` minimum — content with a large intrinsic width won't shrink, squeezing other tracks. `minmax(0, 1fr)` is the fix.

## Track Sizing — `fr` and `minmax()`

::code-wrapper{language="css"}
```css
.grid {
  display: grid;
  /* fr distributes FREE space (after fixed tracks and content-min). Like flex-grow for tracks. */
  grid-template-columns: 200px 1fr;        /* fixed 200px + fluid remainder */
  grid-template-columns: 1fr 2fr;          /* 1:2 ratio */
  grid-template-columns: repeat(3, 1fr);   /* three equal columns */
  /* ⚠️ 1fr = minmax(auto, 1fr). The "auto" minimum = content's intrinsic size.
     A column with long content won't shrink below it → squeezes other columns. */
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);  /* ✓ allow shrinking below content */
}
```
::

## `auto-fit` vs `auto-fill` — the responsive grid

::code-wrapper{language="css"}
```css
/* auto-fill: creates as many tracks as fit. EMPTY tracks REMAIN (space goes to them). */
/* auto-fit: creates as many tracks as fit. EMPTY tracks COLLAPSE → existing items STRETCH to fill. */
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));  /* responsive, no media queries */
  gap: 1rem;
}
/* Result: as many 250px+ columns as fit; cards stretch to fill the row when fewer. */
```
::

### Anti-pattern: `1fr` with long content squeezes columns

::code-wrapper{language="css"}
```css
/* ❌ 1fr has min=auto (content size). Long text in col1 won't shrink → col2 squeezed. */
.grid { display: grid; grid-template-columns: 1fr 1fr; }
.col1 { /* long text */ }
```
::

::code-wrapper{language="css"}
```css
/* ✓ minmax(0, 1fr): min=0, so the track CAN shrink below content → equal columns. */
.grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
/* Or: min-width:0 on items + overflow-wrap: break-word. */
```
::

## `grid-template-areas` — visual layout in CSS

::code-wrapper{language="css"}
```css
.layout {
  display: grid;
  grid-template-areas:
    "header header"
    "sidebar content"
    "footer  footer";
  grid-template-columns: 200px 1fr;
  grid-template-rows: auto 1fr auto;
  min-block-size: 100dvh;
}
.header  { grid-area: header; }
.sidebar { grid-area: sidebar; }
.content { grid-area: content; }
.footer  { grid-area: footer; }
/* Rules: each area must be a CONTIGUOUS RECTANGLE (no L-shapes). "." = empty cell.
   All rows must have the same number of cells. Self-documenting layout. */
```
::

## Item Placement — by line, span, name

::code-wrapper{language="css"}
```css
.item {
  grid-column: 1 / 3;        /* from line 1 to line 3 (spans 2 tracks). Lines are 1-indexed. */
  grid-column: 1 / span 2;    /* same: span 2 tracks from line 1 */
  grid-column: -1;            /* -1 = the LAST line (counts from the end) */
  grid-row: 1 / 2;
}
/* Named lines via [name] in grid-template-columns: */
/* grid-template-columns: [side-start] 200px [side-end content-start] 1fr [content-end]; */
/* .item { grid-column: side-start / side-end; } */
```
::

## Implicit Tracks & `grid-auto-flow`

::code-wrapper{language="css"}
```css
.grid {
  grid-template-columns: repeat(3, 1fr);  /* 3 explicit columns */
  grid-auto-rows: minmax(100px, auto);     /* implicit rows (overflow items) get this size */
  grid-auto-flow: dense;                   /* fill GAPS with later items (may reorder visually) */
  /* dense: later items fill earlier empty cells → compact, but can confuse reading order. */
}
```
::

## Subgrid (2023+)

::code-wrapper{language="css"}
```css
.parent { grid-template-columns: 1fr 2fr 1fr; }
.child {
  display: grid;
  grid-template-columns: subgrid;  /* inherits parent's 3 column tracks → aligned nested grid */
  grid-column: span 3;
}
/* Subgrid lets nested grids align with the parent's tracks — forms, data tables, aligned components. */
```
::

## Alignment — items, content, self

::code-wrapper{language="css"}
```css
.grid {
  justify-items: stretch;    /* per-item WITHIN its cell (inline axis). start|end|center|stretch */
  align-items: stretch;      /* per-item within cell (block axis) */
  justify-content: center;   /* the GRID within the container (if grid < container). space-* values. */
  align-content: space-between;
}
.item { justify-self: center; align-self: start; }  /* per-item override */
```
::

## 💡 Tips & Tricks

- **Idiom**: `repeat(auto-fit, minmax(250px, 1fr))` is the responsive card grid — no media queries, cards fill the row and stretch when fewer. The single most useful grid pattern.
- **Idiom**: `grid-template-areas` for page-level layout — it's a visual ASCII map of the layout, self-documenting and refactor-safe. Each area must be a rectangle.
- **Idiom**: `fr` for proportional tracks (`1fr 2fr` = 1:2), `minmax(0, 1fr)` when content might overflow, `minmax(250px, 1fr)` for responsive minimums.
- **Idiom**: Grid for 2D layout (page, dashboard), Flexbox for 1D (navbar, button row). Many layouts combine: a grid of flex-card components.
- **Idiom**: subgrid when a nested grid should align with parent tracks — eliminates manual track-size duplication in forms and data tables.

## ⚠️ Edge Cases & Gotchas

- **`auto-fill` keeps empty tracks; `auto-fit` collapses them**: for "cards stretch to fill the row," use `auto-fit`. `auto-fill` leaves empty space when there are fewer items than tracks.
- **`fr` distributes only FREE space**: `1fr 1fr` with a 200px-min-content first column doesn't give equal columns — the first gets its min, then free space splits. `minmax(0, 1fr)` fixes this.
- **`gap` is between tracks, not around**: there's no edge gap. Use `padding` on the container for edge spacing.
- **`grid-template-areas` must be rectangles**: a named area can't be L-shaped. Each row must have the same cell count.
- **Grid lines are 1-indexed**: `1 / 3` spans 2 tracks (lines 1→3). `-1` is the last line. `span N` spans N tracks from the start.
- **`grid-auto-flow: dense` can reorder items visually**: later items fill earlier gaps, possibly placing a later item before an earlier one. Confuses reading order.
- **Grid items have `min-width: auto`** (like flex): `min-width: 0` on items with long content, or `minmax(0, 1fr)` on the track.

## 🧠 Spot the Bug

::code-wrapper{language="css"}
```css
.grid { display: grid; grid-template-columns: 1fr 1fr; }
.col1 { /* long text */ }
```
::

<details>
<summary>Answer</summary>

`1fr` = `minmax(auto, 1fr)` — the minimum is `auto` (the content's intrinsic size). Col1's long text has a large minimum width, so col1 won't shrink below it. The `1fr` distributes only the *free* space remaining after col1's content-min is satisfied → col2 is squeezed. Fix: `grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)` — min=0 allows the track to shrink below content, so `1fr` distributes space evenly. Or `min-width: 0` + `overflow-wrap: break-word` on col1.

</details>
