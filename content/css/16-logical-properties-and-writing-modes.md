# 16 — Logical Properties & Writing Modes

CSS has traditionally been *physical* (`left`, `right`, `top`, `bottom`, `width`, `margin-left`). **Logical properties** are *flow-relative* — they adapt to the writing direction (LTR, RTL, vertical). This is essential for internationalized (i18n) code.

## The Problem with Physical Properties

::code-wrapper{language="css"}
```css
.card {
	margin-left: 1rem;    /* in RTL, this is the *end*, not the start */
	padding-right: 2rem;   /* in RTL, this is the *start* */
}
```
::
In a left-to-right (LTR) language, `left` is the start. In right-to-left (RTL) languages (Arabic, Hebrew), the start is the *right*. Physical properties don't flip automatically — you'd need `[dir="rtl"]` overrides. Logical properties solve this.

## Logical Properties

Logical properties use `inline`/`block` and `start`/`end`:

- **inline** — the writing direction (horizontal in LTR/RTL, vertical in vertical writing).
- **block** — the direction lines stack (top-to-bottom in horizontal writing, right-to-left in some vertical writing).
- **start**/**end** — the beginning/end of the inline or block direction.

### Mapping (horizontal LTR)

| Physical | Logical |
|---|---|
| `left` | `inline-start` |
| `right` | `inline-end` |
| `top` | `block-start` |
| `bottom` | `block-end` |
| `width` | `inline-size` |
| `height` | `block-size` |
| `margin-left` | `margin-inline-start` |
| `margin-right` | `margin-inline-end` |
| `margin-top` | `margin-block-start` |
| `margin-bottom` | `margin-block-end` |
| `padding-left` | `padding-inline-start` |
| `border-left` | `border-inline-start` |
| `top`/`left` (positioning) | `inset-block-start`/`inset-inline-start` |

### Example

::code-wrapper{language="css"}
```css
.card {
	margin-inline-start: 1rem;    /* left in LTR, right in RTL */
	padding-inline-end: 2rem;      /* right in LTR, left in RTL */
	inline-size: 300px;            /* width in horizontal, height in vertical */
	block-size: 200px;             /* height in horizontal, width in vertical */
	border-inline-start: 2px solid red;
	inset-inline-start: 0;         /* left: 0 in LTR, right: 0 in RTL */
}
```
::
In RTL, these all flip automatically — no `[dir="rtl"]` overrides needed.

## Shorthands

::code-wrapper{language="css"}
```css
margin-inline: 1rem;          /* both inline-start and inline-end */
margin-block: 2rem;           /* both block-start and block-end */
padding-inline: 1rem 2rem;    /* start end */
inset-inline: 0;              /* both inset-inline-start and -end */
border-inline: 1px solid red; /* both inline-start and -end */
```
::
## `text-align` and Logical Values

::code-wrapper{language="css"}
```css
text-align: start;   /* left in LTR, right in RTL */
text-align: end;     /* right in LTR, left in RTL */
```
::
`start`/`end` are the logical equivalents of `left`/`right` for text alignment.

## Writing Modes

`writing-mode` changes the inline/block direction:

::code-wrapper{language="css"}
```css
.vertical { writing-mode: vertical-rl; }   /* vertical, right-to-left (Japanese) */
.vertical-lr { writing-mode: vertical-lr; } /* vertical, left-to-right (Mongolian) }
```
::
- `horizontal-tb` (default) — horizontal, top-to-bottom.
- `vertical-rl` — vertical, right-to-left (traditional Japanese/Chinese).
- `vertical-lr` — vertical, left-to-right (Mongolian).

With `vertical-rl`, `inline` is vertical (top-to-bottom), `block` is horizontal (right-to-left). Logical properties (`inline-size`, `margin-inline-start`) automatically adapt.

## `direction` and `unicode-bidi`

::code-wrapper{language="css"}
```css
[dir="rtl"] { direction: rtl; }
bdi { unicode-bidi: isolate; }   /* isolate bidirectional text */
```
::
`direction: rtl` sets the base direction. `unicode-bidi` controls how bidirectional text is handled — `isolate` is useful for embedded user content (names, numbers) that might be LTR within RTL.

## When to Use Logical Properties

- **Always**, for new code — they make the code i18n-ready with zero extra effort.
- **Especially** for components that might be used in RTL contexts.
- For layout that should flip with direction (padding, margin, positioning).

Physical properties are still needed for visual effects that *shouldn't* flip (a logo always in the top-left, a decorative border).

## 💡 Tips & Tricks

- **Idiom**: use logical properties (`margin-inline-start`, `padding-inline-end`, `inset-inline-start`) for i18n-ready code — they flip automatically in RTL (Arabic, Hebrew) and vertical writing modes, with no `[dir="rtl"]` overrides. The same CSS works for all languages.
- **Idiom**: use `text-align: start`/`end` (not `left`/`right`) — `start` is left in LTR, right in RTL. This is the logical equivalent for text alignment, and it flips with direction.
- **Idiom**: use `inline-size`/`block-size` (not `width`/`height`) for size that should adapt to writing mode — in vertical writing, `inline-size` is the height, `block-size` is the width. The same CSS works in horizontal and vertical layouts.
- **Idiom**: use `unicode-bidi: isolate` on embedded user content (names, numbers) in bidirectional text — it prevents LTR numbers/names from corrupting the RTL flow. Useful for user-generated content in international apps.
- **Idiom**: keep physical properties for things that *shouldn't* flip — a logo pinned to the top-left, a decorative gradient direction, a shadow offset. Logical is for flow-relative; physical is for absolute visual effects.

## ⚠️ Edge Cases & Gotchas

- **Browser support**: logical properties are supported in all modern browsers, but very old browsers (IE) don't support them. For IE support, use physical + `[dir]` overrides (or accept IE doesn't get RTL).
- **`inset` shorthand**: `inset: 0` (physical, all four sides) vs `inset-inline: 0` (logical, both inline sides). `inset` is the physical shorthand; `inset-inline`/`inset-block` are the logical shorthands.
- **`width`/`height` vs `inline-size`/`block-size`**: in horizontal writing mode, `inline-size` = `width`, `block-size` = `height`. In vertical writing mode, they swap. Mixing physical and logical sizing in the same rule is confusing.
- **`min-inline-size`/`max-inline-size`**: the logical equivalents of `min-width`/`max-width` (in horizontal mode). They exist for all logical properties.
- **`border-inline-start` doesn't flip the *color***: the border is on the inline-start edge (which flips), but if you want a different color per side, set them separately.
- **`writing-mode` affects `inline`/`block`**: with `vertical-rl`, `inline` is vertical, `block` is horizontal. Logical properties adapt, but physical properties (`width`, `margin-left`) don't — they're always physical.
- **`direction: rtl` doesn't flip everything**: it flips the inline direction (text, inline elements), but `left`/`right`/`margin-left` are still physical. Use logical properties or `dir`-specific overrides.
- **`unicode-bidi: plaintext`**: infers direction from the content (first strong character). Useful for user input where you don't know the language. `isolate` is for embedded content with a known direction.
- **Logical `border-radius`**: `border-start-start-radius`, `border-start-end-radius`, etc. — the corners are named by (block, inline). `border-top-left-radius` = `border-start-start-radius` in horizontal LTR.

## 🧠 Spot the Bug

A developer makes an RTL-ready card with logical padding, but in RTL the icon is on the wrong side:

::code-wrapper{language="css"}
```css
.card { padding-inline-start: 2.5rem; }   /* space for the icon */
.card .icon { position: absolute; left: 0.5rem; }  /* icon position */
```
::

What's wrong?

<details>
<summary>Answer</summary>

The `padding-inline-start: 2.5rem` is logical — it flips correctly (padding on the right in RTL, leaving space for the icon on the right). But `.icon { left: 0.5rem; }` is *physical* — `left` is always the left side, even in RTL. So in RTL, the padding is on the right (correct), but the icon is on the left (wrong — it should be on the right, where the padding is).

The fix — use a logical inset for the icon:

```css
.card { padding-inline-start: 2.5rem; }
.card .icon { position: absolute; inset-inline-start: 0.5rem; }  /* logical */
```
::
Now `inset-inline-start: 0.5rem` is `left: 0.5rem` in LTR and `right: 0.5rem` in RTL — the icon is on the same side as the padding, in both directions.

**The lesson**: mixing logical (padding) and physical (`left`) properties breaks i18n — one flips, the other doesn't, and they get out of sync. Use logical properties *consistently* for flow-relative layout (padding, margin, positioning insets). Reserve physical for effects that shouldn't flip (a logo, a fixed shadow).

</details>

## Summary

You can now use logical properties (`inline-start`/`inline-end`/`block-start`/`block-end`, `inline-size`/`block-size`, `margin-inline-*`, `inset-inline-*`), shorthands (`margin-inline`, `inset-inline`), logical text alignment (`start`/`end`), writing modes (`horizontal-tb`/`vertical-rl`/`vertical-lr`), and `unicode-bidi: isolate` for bidirectional text — making CSS i18n-ready for RTL and vertical writing. Next: modern CSS features.