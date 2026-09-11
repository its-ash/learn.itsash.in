---
title: "06 — Display, Position & the Containing Block"
description: "Block/inline/flex/grid formatting contexts, the five position schemes, containing-block resolution (including the transform-ancestor trap that breaks position:fixed), and stacking context basics. Code-first reference."
---

# 06 — Display, Position & the Containing Block

`display` determines which *formatting context* an element participates in. `position` determines how its box is placed relative to its *containing block*. The containing block is not always the parent — `absolute` uses the nearest *positioned* ancestor; `fixed` uses the viewport *unless* a transform/filter ancestor intercepts. These two facts explain 90% of positioning bugs.

## `display` — the formatting context

::code-wrapper{language="css"}
```css
/* Each display value creates a formatting context that governs the element and its children. */
.block { display: block; }       /* full width, new line, width/height/margin all work */
.inline { display: inline; }    /* content width, flows in line, width/height/vertical-margin IGNORED */
.inline-block { display: inline-block; } /* inline flow + block sizing — buttons, badges */
.flex { display: flex; }        /* block-level flex container → children become flex items */
.grid { display: grid; }        /* block-level grid container → children become grid items */
.none { display: none; }        /* removed from layout AND accessibility tree. No space. */
.contents { display: contents; } /* the box vanishes; children participate in grandparent's layout */
.flow-root { display: flow-root; } /* establishes BFC — contains floats/margins, no overflow clipping */
```
::

### `display: none` vs `visibility: hidden` vs `opacity: 0`

::code-wrapper{language="css"}
```css
/* Three different "hide" semantics — pick by what you need: */
[hidden] { display: none; }       /* GONE: no space, not in a11y tree, not tabbable, transitions DON'T work */
.sr-hidden { visibility: hidden; }/* SPACE reserved, in a11y tree (screen readers MAY read), children can override */
.fading { opacity: 0; }           /* SPACE reserved, still interactive (clickable), transitions WORK */
/* opacity:0 for animating; display:none for removal; visibility:hidden for "hidden but space reserved".
   visibility is animatable between hidden↔visible but jumps (not interpolable except at 0/1). */
```
::

## `position` — the five schemes

::code-wrapper{language="css"}
```css
.static { position: static; }    /* default: in-flow. top/left/right/bottom have NO effect. */
.relative { position: relative; } /* in-flow, then OFFSET by top/left etc. Space preserved at original spot. */
.absolute { position: absolute; } /* removed from flow. Containing block = nearest positioned ancestor (or viewport). */
.fixed { position: fixed; }       /* removed from flow. Containing block = viewport (⚠️ unless a transform ancestor). */
.sticky { position: sticky; }    /* relative until scroll passes top:0 → then fixed at that offset within parent. */
```
::

### `position: sticky` — the production header pattern

::code-wrapper{language="css"}
```css
.header {
  position: sticky;
  inset-block-start: 0;  /* stick to the top (logical: start = top in horizontal-tb) */
  z-index: 10;           /* keep above scrolling content */
  background: var(--c-bg); /* opaque — content scrolls UNDER it */
}
/* ⚠️ sticky needs: (1) a parent TALLER than the header (room to scroll), (2) NO ancestor with
   overflow: hidden/auto/scroll — that ancestor becomes the scroll container, and sticky sticks
   to IT, not the viewport. If your sticky isn't sticking, check ancestor overflow. */
```
::

## The Containing Block Trap — `position: fixed` + transform ancestor

This is the most common positioning bug in production. `position: fixed` is relative to the viewport — *unless* an ancestor has `transform`, `filter`, `perspective`, `will-change`, `backdrop-filter`, or `contain: paint`. That ancestor becomes the containing block, and the "fixed" element scrolls with it.

### Anti-pattern: transform on a wrapper breaks fixed children

::code-wrapper{language="css"}
```css
/* ❌ The wrapper has transform (for an animation) → it becomes the containing block for .navbar.
   .navbar is no longer fixed to the viewport — it scrolls with .wrapper. */
.wrapper { transform: translateZ(0); }  /* "GPU acceleration" hack — creates containing block + stacking context */
.navbar { position: fixed; inset-block-start: 0; }  /* fixed to .wrapper, NOT the viewport */
```
::

::code-wrapper{language="css"}
```css
/* ✓ Move the fixed element OUTSIDE the transformed ancestor, or remove the transform. */
```
::

::code-wrapper{language="html"}
```html
<body>
  <nav class="navbar">...</nav>  <!-- outside .wrapper → fixed to viewport -->
  <div class="wrapper">...</div>
</body>
```
::

## `inset` — the logical shorthand

::code-wrapper{language="css"}
```css
.cover {
  position: absolute;
  inset: 0;              /* shorthand: top:0; right:0; bottom:0; left:0 → fills the containing block */
  inset-inline: 0;       /* logical: left/right in LTR → flips in RTL */
  inset-block-start: 0;  /* logical: top in horizontal-tb */
}
/* When all four insets are set and width/height are auto, the box stretches to fill the containing block. */
```
::

## Stacking Context — preview (full detail in chapter 10)

::code-wrapper{language="css"}
```css
/* z-index only works on POSITIONED elements (not static). But many properties create a stacking
   context WITHOUT position: transform, opacity<1, filter, will-change, position:fixed/sticky. */
.modal { position: fixed; z-index: 1000; }  /* positioned + z-index → new stacking context */
.elevated { transform: translateZ(0); }    /* transform alone → new stacking context (z-index: auto) */
```
::

## 💡 Tips & Tricks

- **Idiom**: `display: flex`/`grid` for layouts, `inline-block` only for inline elements needing width/height (buttons, badges). Floats are legacy — `flow-root` to clear them if you must use floats for text-wrap.
- **Idiom**: `position: sticky` for sticky headers/section titles — pure CSS, no JS scroll listeners. Verify no ancestor has `overflow: hidden/auto` (breaks sticking) and the parent is taller than the sticky element.
- **Idiom**: `position: relative` on a parent to establish a containing block for `position: absolute` children — the absolute child positions relative to the nearest positioned ancestor. Without it, the child escapes to the viewport.
- **Idiom**: `display: contents` for semantic wrappers that shouldn't affect layout — the box disappears, children join the grandparent's layout. Useful in grids/flexbox where a wrapper would break the layout.

## ⚠️ Edge Cases & Gotchas

- **Inline elements ignore `width`/`height`/vertical margin**: `span { width: 100px; }` does nothing. Use `inline-block` or `block`.
- **`position: absolute` without a positioned ancestor escapes to the viewport** (initial containing block). Forgetting `position: relative` on the parent is the #1 absolute-positioning bug.
- **`position: fixed` + transform/filter/perspective/will-change ancestor** → the ancestor becomes the containing block, "fixed" scrolls. This is the #1 fixed-positioning bug.
- **`position: sticky` needs a tall parent and no `overflow` ancestor** — if the parent equals the sticky's height, there's no scroll room; if an ancestor scrolls, sticky sticks to it.
- **`z-index` is ignored on `position: static`**: `z-index: 10` on a static element does nothing. Set `position: relative` (or other) for z-index to apply.
- **`display: contents` has accessibility quirks** in older browsers (role may be lost). Test with screen readers if used on semantic elements.

## 🧠 Spot the Bug

::code-wrapper{language="css"}
```css
.page { transform: scale(1); }
.navbar { position: fixed; top: 0; }
```
::

<details>
<summary>Answer</summary>

`.page` wraps everything (including `.navbar`) and has `transform: scale(1)`. Even `scale(1)` (a no-op visually) creates a containing block for `position: fixed` descendants. So `.navbar` is fixed relative to `.page`, not the viewport — it scrolls with the page. Fix: remove the transform from the wrapper, or move `.navbar` outside `.page` in the DOM. Any of `transform`/`filter`/`perspective`/`will-change`/`backdrop-filter`/`contain:paint` on an ancestor does this.

</details>
