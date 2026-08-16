# 06 — Display & Positioning

The `display` property determines how an element flows in the document; `position` determines how it's placed. These are the foundations of layout.

## `display`

| Value | Behavior |
|---|---|
| `block` | Full width, starts on a new line, respects `width`/`height`. (`div`, `p`, `h1`, `section`) |
| `inline` | Content width, flows in line, ignores `width`/`height`/vertical margin. (`span`, `a`, `strong`) |
| `inline-block` | Inline flow, but respects `width`/`height`/margin. |
| `flex` | Block-level flex container (children become flex items). |
| `inline-flex` | Inline-level flex container. |
| `grid` | Block-level grid container. |
| `inline-grid` | Inline-level grid container. |
| `none` | Removed from the layout (not rendered, no space). |
| `contents` | The element's box disappears; children behave as if they're children of the grandparent. |
| `table`/`table-row`/`table-cell` | CSS table layout (legacy, but still useful for some grid-like needs). |
| `list-item` | Like block, with a list marker. |

### Block vs inline

::code-wrapper{language="css"}
```css
div { display: block; }      /* full width, new line */
span { display: inline; }    /* content width, in line */
button { display: inline-block; }  /* in line, but width/height work */
```

- **Block** elements stack vertically; `width`/`height`/all margins work.
- **Inline** elements flow horizontally; `width`/`height`/vertical margin/padding don't work (they're ignored or don't affect layout).
- **`inline-block`** combines inline flow with block sizing — useful for buttons, badges, and inline UI elements that need `width`/`height`.

### `display: none` vs `visibility: hidden` vs `opacity: 0`

- `display: none` — removed from layout; no space; not accessible; transitions don't work.
- `visibility: hidden` — invisible but takes space; still in the accessibility tree (screen readers may read it); children can override with `visibility: visible`.
- `opacity: 0` — invisible but takes space; still interactive (clickable); in the accessibility tree; transitions work.

For animations, use `opacity` (transitionable); for removal, `display: none`; for "hidden but space reserved," `visibility: hidden`.

## `position`

| Value | Behavior |
|---|---|
| `static` (default) | Normal flow; `top`/`left`/etc. don't apply. |
| `relative` | Normal flow, then offset by `top`/`left`/etc. The offset doesn't affect siblings (the element's original space is preserved). |
| `absolute` | Removed from flow; positioned relative to the nearest positioned ancestor (or the viewport). Doesn't reserve space. |
| `fixed` | Removed from flow; positioned relative to the viewport (or a transform ancestor). Stays in place on scroll. |
| `sticky` | Normal flow, then "sticks" to a position when scrolled past. Hybrid of relative + fixed. |

### `position: relative`

::code-wrapper{language="css"}
```css
.box {
	position: relative;
	top: 10px;   /* moves down 10px from its normal position */
	left: 20px;  /* moves right 20px */
}
```

The element stays in normal flow (its space is reserved), but it's visually offset. `relative` is also used to establish a containing block for `absolute` children.

### `position: absolute`

::code-wrapper{language="css"}
```css
.parent { position: relative; }   /* containing block */
.child {
	position: absolute;
	top: 0; right: 0;   /* top-right corner of .parent */
}
```

`absolute` is positioned relative to the nearest ancestor with `position: relative/absolute/fixed/sticky` (or the initial containing block — the viewport — if none). It's removed from flow (no space reserved).

### `position: fixed`

::code-wrapper{language="css"}
```css
.navbar {
	position: fixed;
	top: 0; left: 0; right: 0;   /* full-width, fixed at the top */
}
```

`fixed` is positioned relative to the viewport — it stays in place during scroll. ⚠️ An ancestor with a `transform`, `filter`, `perspective`, or `will-change` becomes the containing block instead of the viewport (a common surprise).

### `position: sticky`

::code-wrapper{language="css"}
```css
.header {
	position: sticky;
	top: 0;   /* sticks to the top when scrolled past */
}
```

`sticky` is `relative` until the element reaches the specified offset during scroll, then it becomes `fixed` at that offset. It "sticks" within its parent's bounds (unsticks when the parent scrolls out). Useful for sticky headers, section headers, and sidebars.

⚠️ `sticky` requires the parent to have a height greater than the sticky element, and no ancestor with `overflow: hidden`/`auto`/`scroll` (or the sticky is relative to the scroll container, which may not be what you want).

## `top`/`right`/`bottom`/`left`/`inset`

::code-wrapper{language="css"}
```css
.box { top: 10px; right: 20px; bottom: 10px; left: 20px; }

/* Shorthand (like margin) */
.box { inset: 10px 20px; }

/* Logical */
.box { inset-block: 10px; inset-inline: 20px; }
```

`inset` is the shorthand for all four. `inset-block`/`inset-inline` are the logical (writing-mode-aware) versions. For `position: absolute/fixed` with all four set, `width`/`height` are derived from the insets (if not set).

## `z-index` and Stacking Contexts (preview)

::code-wrapper{language="css"}
```css
.modal { position: fixed; z-index: 1000; }
```

`z-index` controls the stacking order of positioned elements (higher = in front). It only applies to positioned elements (not `static`). Chapter 10 covers stacking contexts in depth — the main gotcha is that a new stacking context (from `transform`, `opacity < 1`, `position: fixed`, etc.) traps children's `z-index` within the parent's context.

## Normal Flow

By default, block elements stack vertically; inline elements flow horizontally, wrapping as needed. Flexbox and Grid override this for their children. Understanding normal flow is essential — most layout bugs come from misunderstanding how elements flow by default.

## 💡 Tips & Tricks

- **Idiom**: use `display: flex`/`grid` for layouts (chapters 07/08) — they're the modern layout tools, far more capable than floats/inline-block. Reserve `inline-block` for inline UI elements (buttons, badges) that need `width`/`height` but flow inline.
- **Idiom**: use `position: sticky` for sticky headers/section headers — it's `relative` until scrolled past, then `fixed` at the offset, all in CSS (no JavaScript scroll listeners). Ensure no ancestor has `overflow: hidden/auto` (which would make the sticky relative to the scroll container, not the viewport).
- **Idiom**: use `position: relative` on a parent to establish a containing block for `position: absolute` children — the absolute child is positioned relative to the nearest positioned ancestor. Without a `relative` parent, the absolute child is positioned relative to the viewport (or the initial containing block).
- **Idiom**: use `display: none` to remove from layout (no space, not accessible), `visibility: hidden` to hide but keep space, and `opacity: 0` to hide with transitions — each has a different use. `opacity` is transitionable (good for animations); `display: none` is for genuine removal; `visibility: hidden` is for "hidden but space reserved."
- **Debug**: when `position: fixed` isn't staying fixed (it scrolls with the page), an ancestor has a `transform`/`filter`/`perspective`/`will-change` — that ancestor becomes the containing block instead of the viewport. Remove the transform from the ancestor, or use a different positioning strategy.

## ⚠️ Edge Cases & Gotchas

- **`display: none` removes from accessibility tree and layout**: the element is gone (no space, screen readers skip it). `visibility: hidden` keeps it in the accessibility tree (screen readers may read it); `opacity: 0` keeps it interactive.
- **Inline elements ignore `width`/`height`/vertical margin**: `span { width: 100px; }` does nothing. Use `inline-block` or `block`.
- **`position: absolute` is relative to the nearest *positioned* ancestor**: if no ancestor is `relative`/`absolute`/`fixed`/`sticky`, it's relative to the viewport (the initial containing block). Forgetting `position: relative` on the parent is a common bug.
- **`position: fixed` and `transform` ancestors**: an ancestor with `transform`/`filter`/`perspective`/`will-change` becomes the containing block for `fixed`, so the "fixed" element scrolls with that ancestor. Surprise when you add a `transform` for an animation and the fixed header starts scrolling.
- **`position: sticky` needs a tall enough parent and no `overflow` ancestors**: if the parent is the same height as the sticky element, it can't stick (no room to scroll). An ancestor with `overflow: hidden`/`auto`/`scroll` makes the sticky relative to that scroll container.
- **`z-index` only works on positioned elements**: `z-index: 10` on a `static` element does nothing. Set `position: relative` (or `absolute`/`fixed`/`sticky`) for `z-index` to apply.
- **Stacking contexts trap `z-index`**: a child's `z-index` is relative to its parent's stacking context. A `z-index: 9999` inside a `z-index: 1` parent can't appear above a `z-index: 2` sibling of the parent. See chapter 10.
- **`display: contents` removes the box but keeps children**: the element's box disappears (no margin/padding/border), and children behave as if they're children of the grandparent. Useful for semantic wrappers that shouldn't affect layout. Some accessibility issues (older browsers).
- **`inset` shorthand (2021+)**: `inset: 0` is shorthand for `top: 0; right: 0; bottom: 0; left: 0;` — useful for full-coverage absolute positioning. Older browsers need the longhand.

## 🧠 Spot the Bug

A developer adds a `transform: scale(1.05)` to a header for a hover effect, and suddenly the fixed navigation bar below it starts scrolling with the page:

::code-wrapper{language="css"}
```css
.page { transform: scale(1); }   /* applied to a wrapper around everything */
.navbar { position: fixed; top: 0; }
```
::

What's happening?

<details>
<summary>Answer</summary>

An ancestor (`.page`, which wraps everything including `.navbar`) has a `transform`, which makes it the **containing block** for `position: fixed` descendants. So `.navbar` is no longer fixed relative to the viewport — it's fixed relative to `.page`, which scrolls with the content. The "fixed" navbar scrolls.

The fix — remove the `transform` from the ancestor that wraps the fixed element, or move the fixed element outside the transformed ancestor:

```css
/* Option 1: don't transform the wrapper */
.page { /* no transform */ }

/* Option 2: move the navbar outside .page in the HTML */
<body>
	<nav class="navbar">...</nav>   <!-- outside .page -->
	<div class="page">...</div>
</body>
```

Any of `transform`, `filter`, `perspective`, `will-change` (with one of these values), `contain: paint`, or `backdrop-filter` on an ancestor creates a containing block for `fixed` descendants. This is a common surprise when adding an animation to a wrapper.

**The lesson**: `position: fixed` is relative to the viewport *unless* an ancestor has a `transform`/`filter`/`perspective` — then it's relative to that ancestor. If a fixed element starts scrolling, check ancestors for transforms.

</details>

## Summary

You understand `display` (block/inline/inline-block/flex/grid/none), `position` (static/relative/absolute/fixed/sticky), `top/right/bottom/left`/`inset`, `z-index` basics, and the `transform`-ancestor-affects-`fixed` trap. Next: Flexbox — one-dimensional layout.