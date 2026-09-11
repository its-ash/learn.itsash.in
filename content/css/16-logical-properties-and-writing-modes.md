---
title: "16 — Logical Properties & Writing Modes: i18n-Ready CSS"
description: "Inline/block and start/end logical axes, logical equivalents for every physical property, writing-mode (vertical-rl for CJK), text-align:start, and the logical/physical mixing trap. Code-first reference for RTL-ready production CSS."
---

# 16 — Logical Properties & Writing Modes: i18n-Ready CSS

Physical properties (`left`, `right`, `top`, `bottom`, `width`) don't flip in RTL or vertical writing modes. Logical properties (`inline-start`, `block-start`, `inline-size`) are *flow-relative* — they adapt to the writing direction automatically. Writing logical CSS from day one makes your code i18n-ready at zero cost.

## The Logical Axes — inline and block

::code-wrapper{language="text"}
```text
inline  = the writing direction (horizontal in LTR/RTL, vertical in vertical-rl)
block   = the direction lines stack (top→bottom in horizontal, right→left in vertical-rl)
start   = beginning of the inline/block axis
end     = end of the inline/block axis

In horizontal LTR:  inline = horizontal (→), block = vertical (↓)
                      inline-start = left, inline-end = right, block-start = top, block-end = bottom
In horizontal RTL:  inline = horizontal (←), block = vertical (↓)
                      inline-start = right, inline-end = left (FLIPPED)
In vertical-rl:     inline = vertical (↓), block = horizontal (←)
                      inline-size = height, block-size = width (SWAPPED)
```
::

## The Mapping (horizontal LTR)

::code-wrapper{language="css"}
```css
/* Physical → Logical (horizontal LTR) */
.card {
  margin-inline-start: 1rem;    /* = margin-left in LTR, margin-right in RTL (auto-flip) */
  padding-inline-end: 2rem;     /* = padding-right in LTR, padding-left in RTL */
  inset-inline-start: 0;        /* = left: 0 in LTR, right: 0 in RTL (for positioning) */
  inline-size: 300px;           /* = width in horizontal, height in vertical */
  block-size: 200px;            /* = height in horizontal, width in vertical */
  border-inline-start: 2px solid red;  /* left border in LTR, right border in RTL */
}

/* Shorthands */
.box { margin-inline: 1rem; }       /* both inline-start and inline-end */
.box { margin-block: 2rem; }        /* both block-start and block-end */
.box { inset-inline: 0; }           /* both inline insets */

/* Logical text-align */
.text { text-align: start; }        /* left in LTR, right in RTL */
.text { text-align: end; }          /* right in LTR, left in RTL */
```
::

## Writing Modes

::code-wrapper{language="css"}
```css
.vertical { writing-mode: vertical-rl; }   /* vertical, right-to-left (Japanese/Chinese) */
.vertical-lr { writing-mode: vertical-lr; } /* vertical, left-to-right (Mongolian) */
/* horizontal-tb (default): horizontal, top-to-bottom. */
/* With vertical-rl: inline = vertical, block = horizontal. Logical properties adapt automatically;
   physical properties (width, margin-left) DON'T — they're always physical. */
```
::

## `direction` and `unicode-bidi`

::code-wrapper{language="css"}
```css
[dir="rtl"] { direction: rtl; }   /* sets the base direction (flips inline flow) */
bdi { unicode-bidi: isolate; }    /* isolate bidirectional text — LTR numbers in RTL flow */
/* unicode-bidi: isolate prevents embedded user content (names, numbers) from corrupting RTL flow. */
```
::

## The Mixing Trap — logical + physical breaks i18n

### Anti-pattern: logical padding with physical positioning

::code-wrapper{language="css"}
```css
/* ❌ padding flips (logical) but the icon doesn't (physical left) → in RTL, padding is on the right
   but the icon is on the left. They get out of sync. */
.card { padding-inline-start: 2.5rem; }
.card .icon { position: absolute; left: 0.5rem; }  /* physical — doesn't flip */
```
::

::code-wrapper{language="css"}
```css
/* ✓ Both logical → both flip together in RTL. */
.card { padding-inline-start: 2.5rem; }
.card .icon { position: absolute; inset-inline-start: 0.5rem; }  /* logical — flips */
```
::

## When to Use Physical (the exception)

::code-wrapper{language="css"}
```css
/* Physical properties are correct for effects that SHOULD'T flip: */
.logo { inset-block-start: 1rem; inset-inline-start: 1rem; }  /* always top-left, even in RTL */
.shadow { box-shadow: 2px 2px 4px gray; }  /* light direction is physical, not flow-relative */
.gradient { background: linear-gradient(to right, red, blue); }  /* visual direction, not reading direction */
```
::

## 💡 Tips & Tricks

- **Idiom**: use logical properties (`margin-inline-start`, `inset-inline-start`, `inline-size`) for *all* flow-relative layout — they flip automatically in RTL and vertical writing modes. The same CSS works for every language.
- **Idiom**: `text-align: start`/`end` (not `left`/`right`) — `start` is left in LTR, right in RTL. The logical equivalent for text alignment.
- **Idiom**: `unicode-bidi: isolate` on embedded user content (names, numbers) in bidirectional text — prevents LTR content from corrupting the RTL flow. Essential for user-generated content in international apps.
- **Idiom**: keep physical properties for effects that *shouldn't* flip — a logo pinned top-left, a shadow's light direction, a decorative gradient direction. Logical = flow-relative; physical = absolute visual.

## ⚠️ Edge Cases & Gotchas

- **Mixing logical and physical breaks i18n**: one flips, the other doesn't → they get out of sync. Use logical *consistently* for flow-relative layout.
- **`width`/`height` vs `inline-size`/`block-size`**: in horizontal mode, `inline-size` = `width`, `block-size` = `height`. In vertical mode, they swap. Mixing both in one rule is confusing.
- **`direction: rtl` doesn't flip physical properties**: `left`/`right`/`margin-left` are always physical. Use logical properties or `dir`-specific overrides.
- **`writing-mode` affects `inline`/`block`**: with `vertical-rl`, `inline` is vertical, `block` is horizontal. Logical properties adapt; physical ones don't.
- **Logical `border-radius`**: `border-start-start-radius`, `border-start-end-radius`, etc. — corners named by (block, inline). `border-top-left-radius` = `border-start-start-radius` in horizontal LTR.
- **`inset` shorthand is physical**: `inset: 0` = all four physical sides. `inset-inline: 0` = both inline sides (logical). They're different shorthands.

## 🧠 Spot the Bug

::code-wrapper{language="css"}
```css
.card { padding-inline-start: 2.5rem; }
.card .icon { position: absolute; left: 0.5rem; }
```
::

<details>
<summary>Answer</summary>

`padding-inline-start` is logical → flips to the right in RTL (correct, space for the icon). But `.icon { left: 0.5rem; }` is physical → `left` is always the left side, even in RTL. In RTL, the padding is on the right (correct), but the icon is on the left (wrong — it should be on the right, where the padding is). They get out of sync. Fix: `inset-inline-start: 0.5rem` (logical) → flips with the padding. The lesson: mixing logical and physical properties breaks i18n — one flips, the other doesn't. Use logical *consistently* for flow-relative layout.

</details>
