# 08 — CSS Grid

CSS Grid is a two-dimensional layout model — it arranges items in rows *and* columns simultaneously. It's the tool for page-level and complex layouts.

## The Grid Container

::code-wrapper{language="css"}
```css
.container {
	display: grid;
	grid-template-columns: 200px 1fr;   /* two columns: fixed + fluid */
	grid-template-rows: auto 1fr auto;  /* three rows */
	gap: 1rem;
}
```

## Track Sizing

### `fr` units

`fr` (fraction) distributes available space:

::code-wrapper{language="css"}
```css
grid-template-columns: 1fr 1fr 1fr;   /* three equal columns */
grid-template-columns: 1fr 2fr;       /* 1:2 ratio */
grid-template-columns: 200px 1fr;     /* fixed + fluid */
```

`fr` is for distributing *free* space (after fixed tracks and content-min sizes). `1fr 1fr` = equal columns.

### `repeat()`

::code-wrapper{language="css"}
```css
grid-template-columns: repeat(3, 1fr);          /* three equal columns */
grid-template-columns: repeat(3, 200px);        /* three 200px columns */
grid-template-columns: repeat(auto-fill, 250px);    /* as many 250px columns as fit */
grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));  /* responsive */
```

### `auto-fill` vs `auto-fit`

- `auto-fill` — creates as many tracks as fit; empty tracks remain (space is distributed to them).
- `auto-fit` — creates as many tracks as fit; **empty tracks collapse** (their space goes to existing items, stretching them).

`auto-fit` is the responsive card grid pattern — cards fill the row, stretching when there are fewer:

::code-wrapper{language="css"}
```css
.cards {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
	gap: 1rem;
}
```

This gives a responsive grid: 250px+ cards, as many per row as fit, stretching to fill. No media queries.

### `minmax()`

::code-wrapper{language="css"}
```css
grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
```

`minmax(min, max)` — each column is at least 250px and at most 1fr (grows to fill). Prevents columns from getting too small or too large.

## Placing Items

### By line number

::code-wrapper{language="css"}
```css
.item {
	grid-column: 1 / 3;   /* from line 1 to line 3 (spans 2 columns) */
	grid-row: 1 / 2;      /* row 1 */
}
```

Grid lines are 1-indexed. `1 / 3` means "start at line 1, end at line 3" (spanning 2 tracks). `span 2` means "span 2 tracks from the start":

::code-wrapper{language="css"}
```css
.item { grid-column: 1 / span 2; }   /* same as 1 / 3 */
```

### By name

::code-wrapper{language="css"}
```css
.container {
	grid-template-columns: [sidebar-start] 200px [sidebar-end content-start] 1fr [content-end];
}
.item { grid-column: sidebar-start / sidebar-end; }
```

### Grid areas

::code-wrapper{language="css"}
```css
.container {
	grid-template-areas:
		"header header"
		"sidebar content"
		"footer  footer";
	grid-template-columns: 200px 1fr;
}
.header  { grid-area: header; }
.sidebar { grid-area: sidebar; }
.content { grid-area: content; }
.footer  { grid-area: footer; }
```

`grid-template-areas` names cells — a visual layout in CSS. `.` for empty cells. Each named area must form a rectangle.

## Alignment

### `justify-items` / `align-items` (per-item within its cell)

::code-wrapper{language="css"}
```css
.container {
	justify-items: stretch;   /* fill the cell (default) */
	justify-items: start;     /* align to start */
	justify-items: center;
	justify-items: end;
	align-items: stretch;     /* same values, cross-axis */
}
```

### `justify-content` / `align-content` (the grid within the container)

::code-wrapper{language="css"}
```css
.container {
	justify-content: center;    /* center the grid horizontally */
	align-content: space-between;
}
```

These apply when the grid is smaller than the container (e.g., fixed-size tracks with leftover space).

### Per-item: `justify-self` / `align-self`

::code-wrapper{language="css"}
```css
.item { justify-self: center; }   /* override justify-items for this item */
```

## `gap`

Same as flexbox — `gap`, `row-gap`, `column-gap` space the tracks.

## Implicit Tracks

If items are placed outside the defined tracks, implicit tracks are created:

::code-wrapper{language="css"}
```css
.container {
	grid-template-columns: 1fr 1fr;   /* 2 columns defined */
	grid-auto-rows: 100px;            /* implicit rows are 100px */
	grid-auto-flow: row;              /* fill row by row (default) */
}
```

`grid-auto-flow: dense` fills gaps (later items can go in earlier gaps, potentially out of order).

## Subgrid (2023+)

A grid item can use the parent's tracks:

::code-wrapper{language="css"}
```css
.container { grid-template-columns: 1fr 2fr 1fr; }
.item { display: grid; grid-template-columns: subgrid; }   /* uses parent's 3 columns */
```

Subgrid lets nested grids align with the parent's tracks — useful for complex aligned layouts (forms, tables of data). Browser support: 2023+ in all major browsers.

## Common Patterns

### Holy Grail layout

::code-wrapper{language="css"}
```css
.layout {
	display: grid;
	grid-template-areas:
		"header header header"
		"nav    main   aside"
		"footer footer footer";
	grid-template-columns: 200px 1fr 200px;
	grid-template-rows: auto 1fr auto;
	min-height: 100vh;
}
```

### Responsive card grid (no media queries)

::code-wrapper{language="css"}
```css
.cards {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
	gap: 1rem;
}
```

### 12-column grid

::code-wrapper{language="css"}
```css
.container {
	display: grid;
	grid-template-columns: repeat(12, 1fr);
	gap: 1rem;
}
.col-6 { grid-column: span 6; }
.col-4 { grid-column: span 4; }
```

## 💡 Tips & Tricks

- **Idiom**: use `repeat(auto-fit, minmax(250px, 1fr))` for responsive card grids — it gives a grid that's as many 250px+ columns as fit, stretching to fill, with no media queries. This is the modern responsive grid pattern, replacing float/flexbox hacks.
- **Idiom**: use `grid-template-areas` for page-level layouts — it's a visual ASCII representation of the layout in CSS, self-documenting and easy to modify. Each named area must form a rectangle; use `.` for empty cells.
- **Idiom**: use `fr` for proportional track sizing — `1fr 2fr` gives a 1:2 ratio; `200px 1fr` gives a fixed sidebar + fluid content. `fr` distributes *free* space (after fixed tracks), so it's the grid equivalent of flexbox's `flex-grow`.
- **Idiom**: use Grid for two-dimensional layouts (rows + columns) and Flexbox for one-dimensional (a row or a column) — Grid is for "a 2D grid of items" (page layout, dashboards); Flexbox is for "a row of items" (navbars, button groups). Many layouts combine both (a grid of flex-card components).
- **Idiom**: use subgrid (2023+) when a nested grid should align with the parent's tracks — `grid-template-columns: subgrid` makes the item's grid use the parent's columns, so nested content aligns. Useful for forms, data tables, and aligned components.

## ⚠️ Edge Cases & Gotchas

- **`auto-fill` vs `auto-fit`**: `auto-fill` keeps empty tracks (space goes to them); `auto-fit` collapses empty tracks (space goes to existing items, stretching them). For "cards that stretch to fill the row," use `auto-fit`.
- **`fr` distributes *free* space**: `1fr 1fr` with a 200px item in the first column doesn't give equal columns — the first column gets at least 200px (its content min), then free space is split. Use `minmax(0, 1fr)` to allow shrinking below content.
- **`minmax(0, 1fr)` vs `1fr`**: `1fr` has a minimum of `auto` (content size); `minmax(0, 1fr)` has a minimum of 0, allowing the track to shrink below content. Use `minmax(0, 1fr)` when content might overflow.
- **`grid-template-areas` must form rectangles**: a named area can't be L-shaped. Each area must be a contiguous rectangle. The rows must have the same number of cells.
- **Grid lines are 1-indexed**: `grid-column: 1 / 3` spans from line 1 to line 3 (2 tracks). Negative numbers count from the end: `-1` is the last line.
- **`gap` in grid is between tracks, not around**: there's no padding-like gap at the edges. Use `padding` on the container for edge spacing.
- **Implicit tracks have default sizing**: items placed outside the defined tracks create implicit tracks with `grid-auto-rows`/`grid-auto-columns` sizing (default `auto`).
- **`grid-auto-flow: dense` can reorder items visually**: later items fill earlier gaps, potentially placing a later item before an earlier one visually. Good for filling gaps, but can confuse reading order.
- **Subgrid browser support**: shipped in all major browsers in 2023. For older browsers, nested grids don't align with the parent's tracks — use explicit sizing or accept the misalignment.
- **Grid and `min-width: auto`**: like flex items, grid items have `min-width: auto` by default and won't shrink below content. Set `min-width: 0` on items with long content.

## 🧠 Spot the Bug

A developer makes a 2-column grid, but the first column (with long text) is wider than expected, and the second column is squeezed:

::code-wrapper{language="css"}
```css
.grid { display: grid; grid-template-columns: 1fr 1fr; }
.col1 { /* long text */ }
```
::

What's wrong?

<details>
<summary>Answer</summary>

`1fr` has an implicit minimum of `auto` (the content's minimum size). The first column's content (long text) has a large minimum width, so the column won't shrink below it — the `1fr` distributes only the *free* space, which is little after the first column's content min is satisfied. The second column gets squeezed.

The fix — use `minmax(0, 1fr)` to allow the columns to shrink below content size:

```css
.grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
```

Or set `min-width: 0` on the items and add `overflow-wrap: break-word` for the text. `minmax(0, 1fr)` tells the grid the column can shrink to 0 (below content), so the `1fr` distributes space evenly.

**The lesson**: `1fr` has a minimum of `auto` (content size), so a column with long content won't shrink, squeezing others. Use `minmax(0, 1fr)` for columns that should share space evenly regardless of content.

</details>

## Summary

You can now build grid layouts (template-columns/rows, `fr`, `repeat`, `minmax`, `auto-fit`/`auto-fill`), place items (by line, name, area), align (justify/align items/content/self), use `gap`, implicit tracks, and subgrid — with the responsive `auto-fit` + `minmax` pattern and the `minmax(0, 1fr)` fix for content overflow. Next: responsive design and media queries.