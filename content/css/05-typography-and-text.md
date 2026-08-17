# 05 — Typography & Text

Typography is most of web design. This chapter covers fonts, sizes, spacing, and text properties.

## Font Properties

::code-wrapper{language="css"}
```css
p {
	font-family: "Helvetica Neue", Arial, sans-serif;
	font-size: 1rem;
	font-weight: 400;          /* 100-900, or normal/bold */
	font-style: normal;        /* normal/italic/oblique */
	line-height: 1.5;          /* unitless — relative to font-size */
	letter-spacing: 0.02em;    /* tracking */
	word-spacing: 0.1em;
	font-variant: small-caps;
	font-stretch: condensed;   /* if the font supports it */
}
```
::
### `font-family` and fallbacks

::code-wrapper{language="css"}
```css
font-family: "Helvetica Neue", Arial, sans-serif;
```
::
The browser tries each font in order, falling back to the next if unavailable. The last should be a generic family (`serif`, `sans-serif`, `monospace`, `cursive`, `fantasy`, `system-ui`) — guaranteed to work. Quote multi-word names (`"Helvetica Neue"`).

### System font stack

::code-wrapper{language="css"}
```css
font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
```
::
Uses the OS's native UI font — no download, native feel. Good default for most sites.

### `@font-face` (custom fonts)

::code-wrapper{language="css"}
```css
@font-face {
	font-family: "MyFont";
	src: url("myfont.woff2") format("woff2"),
	     url("myfont.woff") format("woff");
	font-weight: 400;
	font-style: normal;
	font-display: swap;   /* show fallback while loading, swap when ready */
}

body { font-family: "MyFont", sans-serif; }
```
::
`font-display: swap` shows the fallback font immediately and swaps when the web font loads (avoiding invisible text). Use `woff2` (best compression); `woff` as fallback. Avoid `ttf`/`otf` (larger).

### Font weights and variable fonts

Standard weights: 100 (thin), 300 (light), 400 (regular), 500 (medium), 600 (semibold), 700 (bold), 900 (black). A font may only have a few — `font-weight: 600` with a font that only has 400 and 700 will round to 700.

**Variable fonts** have a continuous weight range:

::code-wrapper{language="css"}
```css
@font-face {
	font-family: "Inter";
	src: url("inter.woff2") format("woff2-variations");
	font-weight: 100 900;   /* range */
}

p { font-weight: 450; }   /* any value in the range */
```
::
## Font Size

::code-wrapper{language="css"}
```css
font-size: 1rem;       /* relative to root — preferred */
font-size: 16px;       /* absolute — doesn't respect user's setting */
font-size: 1.2em;      /* relative to parent — compounds */
font-size: clamp(1rem, 2vw + 0.5rem, 1.5rem);  /* fluid */
```
::
Default root size is 16px in most browsers. `1rem` = 16px (unless the user changed their setting, which `rem` respects).

## Line Height

::code-wrapper{language="css"}
```css
line-height: 1.5;       /* unitless — 1.5× the font-size (preferred) */
line-height: 24px;      /* fixed — doesn't scale with font-size */
line-height: 1.5em;     /* relative to the element's font-size */
```
::
**Use unitless** — `1.5` (not `1.5em` or `24px`). Unitless scales with each element's font-size; `em`/`px` don't adapt to child font-sizes. 1.5 is a good default for body text; 1.2-1.3 for headings.

## Text Properties

::code-wrapper{language="css"}
```css
p {
	text-align: left;          /* left/right/center/justify */
	text-decoration: underline; /* underline/overline/line-through/none */
	text-transform: uppercase;  /* uppercase/lowercase/capitalize/none */
	text-indent: 2em;           /* indent the first line */
	text-shadow: 1px 1px 2px gray;
	white-space: normal;        /* nowrap/pre/pre-wrap/pre-line */
	text-overflow: ellipsis;    /* with overflow: hidden + white-space: nowrap */
	overflow-wrap: break-word;  /* break long words */
	word-break: break-word;     /* break anywhere (CJK) */
	hyphens: auto;              /* hyphenate (needs lang attribute) */
}
```
::
### Truncating text (ellipsis)

::code-wrapper{language="css"}
```css
.truncate {
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
```
::
Three properties together — no wrap, clip overflow, show `…`. Works on single-line text.

### Multi-line truncation

::code-wrapper{language="css"}
```css
.clamp {
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 3;
	overflow: hidden;
}
```
::
`line-clamp: 3` shows 3 lines then `…`. Modern browsers support `line-clamp` without the `-webkit-` prefix in most cases, but keep it for compatibility.

## `white-space`

| Value | Spaces/tabs | Newlines | Wrapping |
|---|---|---|---|
| `normal` | collapse | collapse | wrap |
| `nowrap` | collapse | collapse | no wrap |
| `pre` | preserve | preserve | no wrap |
| `pre-wrap` | preserve | preserve | wrap |
| `pre-line` | collapse | preserve | wrap |

`pre` is like `<pre>` — preserves all whitespace. `pre-wrap` preserves but wraps. `nowrap` prevents wrapping (use for horizontal scrollers or truncation).

## Text Alignment and Justify

::code-wrapper{language="css"}
```css
text-align: justify;   /* stretch lines to full width */
```
::
`justify` can create "rivers" of whitespace, especially with short words. Use `text-align: left` for body text (better readability); `justify` only for print-like layouts. `text-align-last: center` controls the last line of justified text.

## Vertical Alignment

::code-wrapper{language="css"}
```css
vertical-align: middle;   /* in table cells or inline elements */
vertical-align: top;
vertical-align: baseline; /* default */
```
::
`vertical-align` only applies to inline elements (and table cells) — it doesn't vertically center block elements. For block centering, use flexbox (`align-items: center`) or grid.

## 💡 Tips & Tricks

- **Idiom**: use `line-height: 1.5` (unitless) for body text — unitless scales with each element's font-size (a heading with `line-height: 1.5` gets 1.5× its own font-size, not the body's). `1.5em` or `24px` don't adapt to child font-sizes. 1.5 is a good default; 1.2-1.3 for headings.
- **Idiom**: use `font-display: swap` in `@font-face` — it shows the fallback font immediately and swaps when the web font loads, avoiding invisible text (FOIT) and the "content jump" when the font arrives. Use `woff2` (best compression).
- **Idiom**: use `system-ui, -apple-system, sans-serif` as a default font stack — it uses the OS's native UI font (no download, native feel, instant). Add a web font via `@font-face` only when you need a specific brand font.
- **Idiom**: for single-line truncation, the trio is `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;` — all three are needed (no wrap, clip, show `…`). For multi-line, `display: -webkit-box; -webkit-line-clamp: N; -webkit-box-orient: vertical; overflow: hidden;`.
- **Idiom**: use `rem` for font-sizes — `rem` respects the user's browser font-size setting (accessibility), while `px` doesn't. `1rem` = the root font-size (16px by default). Use `clamp(1rem, ..., 1.25rem)` for fluid responsive text.

## ⚠️ Edge Cases & Gotchas

- **`em` for font-size compounds**: `1.2em` inside a `1.2em` is 1.44× root. Use `rem`.
- **`line-height` with a unit doesn't adapt**: `line-height: 24px` on a heading with `font-size: 2rem` (32px) gives 24px line-height (smaller than the text — overlap). Use unitless `1.5`.
- **`text-align: justify` creates whitespace rivers**: especially with short words or narrow columns. Prefer `left` for screen readability; `justify` for print.
- **`vertical-align` doesn't center block elements**: it's for inline/table-cell. Use flexbox (`align-items: center`) for block centering.
- **Web fonts can cause layout shift (FOUT/FOIT)**: the text is invisible or shifts when the font loads. `font-display: swap` shows fallback immediately; `size-adjust`/`ascent-override` in `@font-face` can reduce the shift.
- **`@font-face` `src` order matters**: list `woff2` first (best compression), then `woff`. The browser picks the first it supports.
- **`white-space: nowrap` can overflow**: text doesn't wrap, so long text overflows the container. Combine with `overflow: hidden` + `text-overflow: ellipsis` for truncation.
- **`hyphens: auto` needs `lang` attribute**: `<html lang="en">` — without it, the browser doesn't know how to hyphenate. Safari needs `-webkit-hyphens: auto`.
- **`word-break: break-all` vs `overflow-wrap: break-word`**: `break-all` breaks anywhere (even mid-word, aggressive); `break-word` breaks only when a word would overflow (gentler, preferred).
- **Variable fonts need `font-weight` range in `@font-face`**: `font-weight: 100 900;` declares the range. Without it, `font-weight: 450` may not work (the browser doesn't know the font supports it).

## 🧠 Spot the Bug

A developer sets `line-height: 20px` on body text, but headings overlap:

::code-wrapper{language="css"}
```css
body { line-height: 20px; font-size: 16px; }
h1 { font-size: 3rem; }   /* inherits line-height: 20px */
```
::

What's wrong?

<details>
<summary>Answer</summary>

`line-height: 20px` is inherited by `h1`, but `h1`'s font-size is `3rem` (48px). A 20px line-height on 48px text is smaller than the text itself — the lines overlap (the text is taller than the line box).

The fix — use a unitless `line-height`, which scales with each element's font-size:

```css
body { line-height: 1.5; font-size: 1rem; }
h1 { font-size: 3rem; }   /* line-height is 1.5 × 48px = 72px — no overlap */
```
::
Unitless `line-height` is computed per-element (1.5 × the element's font-size), so `h1` gets 72px and body text gets 24px — both proportional. A fixed `20px` or `1.5em` (computed on the parent) would both cause the overlap.

**The lesson**: `line-height` with a unit (`px`/`em`) is a fixed value that's inherited as-is — it doesn't scale with the child's font-size. Unitless `line-height` scales per-element. Always use unitless for `line-height`.

</details>

## Summary

You can now set font-family (with fallbacks and `@font-face`/`font-display: swap`), font-size (`rem` preferred), font-weight, line-height (unitless), letter/word-spacing, text alignment/decoration/transform, truncation (single and multi-line), `white-space`, and word-breaking — while avoiding the `line-height`-with-unit and `em`-compounding traps. Next: display and positioning.