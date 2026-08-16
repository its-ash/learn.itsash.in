# 10 — Floats & Positioning Deep Dive

This chapter covers floats (legacy but still encountered), `z-index`/stacking contexts, and clipping — the details that catch developers.

## Floats (legacy)

Floats were the layout tool before flexbox/grid. They're still used for text wrapping around images:

::code-wrapper{language="css"}
```css
img { float: left; margin: 0 1rem 1rem 0; }
```

`float: left`/`right` takes the element out of flow and wraps text around it. `float: none` (default).

### Clearing floats

Floated elements don't contribute to their parent's height (they're out of flow), so the parent collapses:

::code-wrapper{language="css"}
```css
/* The clearfix hack (legacy) */
.clearfix::after {
	content: "";
	display: table;
	clear: both;
}

/* Modern: flow-root */
.parent { display: flow-root; }   /* contains floats, no hack needed */
```

`display: flow-root` establishes a block formatting context, containing floats — the modern replacement for the clearfix hack. Use it when you must use floats.

### When to still use floats

Rarely — for text wrapping around an image (their original purpose). For layout, use flexbox/grid. Don't use floats for column layout (the old pattern) — it's fragile and superseded.

## `z-index` and Stacking Contexts

`z-index` controls the stacking order of positioned elements:

::code-wrapper{language="css"}
```css
.modal { position: fixed; z-index: 1000; }
.backdrop { position: fixed; z-index: 999; }
```

Higher `z-index` = in front. `z-index` only applies to positioned elements (`relative`/`absolute`/`fixed`/`sticky`) — not `static`.

### Stacking contexts

A **stacking context** is a group of elements that are stacked together. Within a stacking context, `z-index` is relative. A new stacking context is created by:
- `position: absolute`/`relative` with `z-index` ≠ `auto`.
- `position: fixed`/`sticky` (always, regardless of `z-index`).
- `opacity < 1`.
- `transform`, `filter`, `perspective`, `clip-path`, `mask`.
- `will-change` with one of the above.
- `isolation: isolate`.
- `mix-blend-mode` ≠ `normal`.
- `contain: layout`/`paint`/`strict`/`content`.

### The trap

A child's `z-index` is relative to its parent's stacking context. `z-index: 9999` inside a `z-index: 1` parent can't appear above a `z-index: 2` sibling of the parent — the parent's `1` is below the sibling's `2`, and all the parent's descendants are below the sibling regardless of their own `z-index`.

::code-wrapper{language="text"}
```text
parent1 (z-index: 1)
  child (z-index: 9999)  — still below parent2 (z-index: 2)
parent2 (z-index: 2)
```

This is the #1 z-index confusion: "I set `z-index: 9999` but it's still behind." The fix — raise the ancestor's `z-index`, or remove the stacking-context-creating property from the ancestor.

### Debugging stacking

In DevTools, the "Layers" panel (Chrome) shows the stacking contexts. Or inspect: an element's stacking context is the nearest ancestor that creates one.

## Clipping: `overflow`, `clip-path`, `clip`

### `overflow` (recap)

`overflow: hidden` clips content outside the box. Also establishes a block formatting context (clears floats, contains margins).

### `clip-path`

::code-wrapper{language="css"}
```css
.img { clip-path: circle(50%); }                       /* circular */
.img { clip-path: polygon(0 0, 100% 0, 100% 100%); }  /* triangle */
.img { clip-path: inset(10px round 5px); }             /* inset with rounded corners */
```

`clip-path` clips to any shape — circles, polygons, SVG paths. Unlike `overflow: hidden`, it can clip to non-rectangular shapes. Animatable for effects.

### `clip` (deprecated)

`clip: rect(0, 100px, 100px, 0)` — the old clipping property, only rectangular, deprecated. Use `clip-path` instead.

## `isolation`

::code-wrapper{language="css"}
```css
.modal { isolation: isolate; }   /* creates a stacking context without positioning */
```

`isolation: isolate` creates a stacking context without needing `position`/`z-index`/`transform` — useful for isolating a component's stacking (its children's `z-index` don't leak out).

## 💡 Tips & Tricks

- **Idiom**: use `display: flow-root` to contain floats (the modern clearfix) — it establishes a block formatting context, so the parent's height includes floated children, no hack needed. Reserve floats for their original purpose: wrapping text around an image.
- **Idiom**: avoid `z-index` wars — use low, documented values (`10`, `20`, `30`) or a design-token scale (`--z-modal`, `--z-dropdown`), and understand stacking contexts. A `z-index: 9999` inside a `z-index: 1` parent can't beat a `z-index: 2` sibling of the parent.
- **Idiom**: use `isolation: isolate` to create a stacking context without positioning — it traps a component's `z-index` within itself, preventing leaks. Useful for components that shouldn't interact with the page's stacking order.
- **Idiom**: use `clip-path` for non-rectangular clipping (circles, polygons, SVG paths) — it's animatable and far more flexible than `overflow: hidden`. `overflow: hidden` is for rectangular clipping; `clip-path` is for shapes.
- **Debug**: when `z-index: 9999` isn't appearing above something, check the ancestor chain for stacking-context creators (`transform`, `opacity < 1`, `position: fixed`, `filter`) — the ancestor's stacking context traps the child's `z-index`. The fix is the ancestor's `z-index` or removing the creator.

## ⚠️ Edge Cases & Gotchas

- **Floats don't contribute to parent height**: a parent of floated children collapses (height 0). Use `display: flow-root` or the clearfix hack.
- **`clear: both`** is the old way to push an element below floats — `display: flow-root` on the parent is the modern way.
- **Stacking context traps `z-index`**: a child's `z-index` is relative to its stacking context. `z-index: 9999` inside a `z-index: 1` parent is below a `z-index: 2` sibling of the parent.
- **`position: fixed` always creates a stacking context**: regardless of `z-index`. So fixed elements trap their children's `z-index`.
- **`opacity < 1` creates a stacking context**: `opacity: 0.99` on a parent traps children's `z-index` — a surprise when you fade in a parent and the children's z-order changes.
- **`transform` creates a stacking context**: the same surprise. Adding `transform: translateZ(0)` (a common "GPU acceleration" hack) changes the stacking order.
- **`clip-path` doesn't affect layout**: the element's box is unchanged; only the visible area is clipped. The element still takes its normal space.
- **`overflow: hidden` clips shadows and transforms**: a child's `box-shadow` extending outside an `overflow: hidden` parent is clipped. Use `overflow: clip` (no scroll container) or restructure.
- **`z-index` only works on positioned elements**: `z-index: 10` on a `static` element does nothing. Set `position: relative` (or others).
- **Negative `z-index`**: `z-index: -1` puts the element behind its parent's background (if the parent doesn't create a stacking context). Useful for decorative elements behind content.

## 🧠 Spot the Bug

A modal with `z-index: 9999` is appearing behind a dropdown with `z-index: 100`:

::code-wrapper{language="css"}
```css
.app { transform: translateZ(0); }   /* "GPU acceleration" */
.modal { position: fixed; z-index: 9999; }   /* inside .app in the DOM */
.dropdown { position: fixed; z-index: 100; } /* outside .app */
```
::

What's happening?

<details>
<summary>Answer</summary>

`.app` has `transform: translateZ(0)`, which creates a stacking context. The modal is inside `.app` in the DOM, so its `z-index: 9999` is *relative to `.app`'s stacking context*. The dropdown is outside `.app`, at the root level.

The root-level stacking context compares: `.app` (with its transform-created context, no explicit `z-index` → `z-index: auto`, treated as 0 for comparison) vs `.dropdown` (`z-index: 100`). The dropdown (100) beats `.app` (0), so the dropdown is in front of `.app` and all its descendants — including the modal, regardless of the modal's `z-index: 9999`.

The fix — give `.app` a `z-index` higher than the dropdown, or move the modal outside `.app`:

```css
/* Option 1: raise .app's z-index above the dropdown */
.app { transform: translateZ(0); position: relative; z-index: 1000; }
/* Now .app (1000) > .dropdown (100), and the modal (9999 within .app) is in front. */

/* Option 2: move the modal outside .app in the DOM */
<body>
	<div class="app">...</div>
	<div class="modal">...</div>   <!-- outside .app, at root level -->
</body>
```

**The lesson**: a stacking-context-creating ancestor (`transform`, `opacity`, `position: fixed`, etc.) traps descendants' `z-index` within the ancestor's context. A high `z-index` inside a low-`z-index` (or auto) context can't beat a lower `z-index` at a higher level. Fix the ancestor's `z-index` or move the element outside the context.

</details>

## Summary

You understand floats (legacy, use `display: flow-root` to clear), `z-index` (only on positioned elements), stacking contexts (created by `transform`/`opacity`/`fixed`/etc., trapping children's `z-index`), `isolation: isolate`, and `clip-path` for non-rectangular clipping — with the ancestor-stacking-context trap demystified. Next: backgrounds and gradients.