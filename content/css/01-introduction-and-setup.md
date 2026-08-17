# 01 — Introduction & Setup

## What Is CSS?

CSS (Cascading Style Sheets) is the language for styling web pages — it controls how HTML elements look (colors, layout, fonts, animations). Key characteristics:

- **Declarative** — you describe how elements should look, the browser figures out how to render it.
- **Cascading** — multiple rules can apply to the same element; the cascade resolves conflicts (specificity, source order, importance).
- **Progressive** — CSS degrades gracefully; unsupported properties are ignored, not errors.
- **Style-free markup** — HTML describes structure, CSS describes presentation (separation of concerns).
- **Huge and evolving** — CSS has hundreds of properties and is actively extended (container queries, `:has()`, subgrid, cascade layers).

## A Brief History

| Year | Milestone |
|---|---|
| 1996 | CSS1 — basic styling (fonts, colors, margins). |
| 1998 | CSS2 — positioning, media types, z-index. |
| 2001–2011 | CSS3 — modular spec (selectors, backgrounds, transforms, transitions, animations, media queries, flexbox). |
| 2017 | CSS Grid ships in all major browsers. |
| 2017–2024 | CSS4-ish era — custom properties, `gap`, `aspect-ratio`, `:has()`, container queries, cascade layers, nesting, view transitions. |

CSS is no longer versioned (CSS3+); it's a collection of independent modules, each at its own maturity level. "CSS4" isn't a real spec — it's shorthand for "modern CSS."

## Adding CSS to HTML

Three ways, in order of preference:

### External stylesheet (recommended)

::code-wrapper{language="html"}
```html
<!-- index.html -->
<link rel="stylesheet" href="styles.css">
```
::
::code-wrapper{language="css"}
```css
/* styles.css */
body {
	font-family: system-ui, sans-serif;
	margin: 0;
}
```
::
External stylesheets are cached, reusable across pages, and keep HTML clean. This is the production approach.

### `<style>` element (per-page)

::code-wrapper{language="html"}
```html
<style>
	body { font-family: sans-serif; }
</style>
```
::
Use for page-specific styles or critical CSS inlined in `<head>` for performance (avoiding a render-blocking request).

### Inline `style` attribute (avoid)

::code-wrapper{language="html"}
```html
<p style="color: red; font-weight: bold;">Warning</p>
```
::
Inline styles have the highest specificity (hard to override), can't be cached, and mix structure with presentation. Avoid except for genuinely one-off, dynamic styles (set via JavaScript).

## Syntax

::code-wrapper{language="css"}
```css
/* A rule */
selector {
	property: value;      /* a declaration */
	property: value;
}

/* Comments are /* like this */ and can span lines */

/* At-rules */
@media (min-width: 768px) { /* ... */ }
@keyframes fade { /* ... */ }
@supports (display: grid) { /* ... */ }
```
::
- A **rule** = selector + declaration block.
- A **declaration** = property: value.
- **At-rules** (`@media`, `@keyframes`, `@supports`, `@import`) are special directives.

## DevTools — Your CSS REPL

Browser DevTools are the primary tool for CSS work. Open with `Cmd+Opt+I` (Mac) or `Ctrl+Shift+I` (Windows/Linux).

### Elements/Inspector panel

| Feature | How |
|---|---|
| Inspect an element | Click the element in the page (or in the DOM tree). |
| Edit CSS live | Click a property/value in the Styles pane and type. |
| Add a property | Click the empty space in a rule and type. |
| Toggle a declaration | Click the checkbox next to a property. |
| See computed values | "Computed" tab — the final value of every property. |
| See box model | The colored box diagram at the bottom of Styles — drag to adjust. |
| Find unused CSS | "Coverage" tab (Cmd+Shift+P → "Coverage"). |
| Force element state | `:hov` button — force `:hover`, `:focus`, `:active`. |

### Tips

- **Edit live, then copy to your file** — DevTools is a real-time REPL. Iterate in the browser, then save the final values.
- **The Computed tab shows the resolved value** — if `font-size: 1em` resolves to `16px`, the Computed tab shows `16px`. Useful for debugging unit calculations.
- **Box model visualization** — the colored diagram (content, padding, border, margin) shows the actual pixel values; click a number to edit.

## A First Stylesheet

::code-wrapper{language="html"}
```html
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>My First CSS</title>
	<link rel="stylesheet" href="styles.css">
</head>
<body>
	<h1>Hello, CSS!</h1>
	<p>This is my first styled page.</p>
</body>
</html>
```
::
::code-wrapper{language="css"}
```css
/* styles.css */
body {
	font-family: system-ui, -apple-system, sans-serif;
	max-width: 600px;
	margin: 2rem auto;
	padding: 0 1rem;
	color: #333;
}

h1 {
	color: #0066cc;
	border-bottom: 2px solid #0066cc;
	padding-bottom: 0.5rem;
}
```
::
## The Cascade (preview)

When multiple rules apply to the same element, the browser resolves conflicts by:

1. **Importance** — `!important` wins (avoid).
2. **Specificity** — more specific selectors win (e.g., `#id` > `.class` > `element`).
3. **Source order** — later rules win (at equal specificity).

Chapter 02 covers this in depth. For now, know that CSS "cascades" — the name is literal.

## 💡 Tips & Tricks

- **Idiom**: use external stylesheets (`<link rel="stylesheet" href="styles.css">`) for production — they're cached across pages, keep HTML clean, and separate structure from presentation. Reserve inline `<style>` for critical CSS inlined in `<head>` (performance), and inline `style="..."` for genuinely one-off dynamic styles (set via JS).
- **Idiom**: use DevTools as your CSS REPL — edit properties live in the Styles pane, see the result instantly, then copy the final values to your file. Iterating in the browser is far faster than save-and-reload cycles.
- **Idiom**: use the Computed tab to debug unit calculations — if `font-size: 1em` resolves to `16px`, the Computed tab shows `16px`, revealing the actual computed value. Essential for debugging `em`/`rem`/`%` chains.
- **Idiom**: use `system-ui, -apple-system, sans-serif` as a font stack — it uses the OS's native UI font (San Francisco on macOS, Segoe on Windows, Roboto on Android), giving a native feel without web font downloads. Add a web font (via `@font-face`) only when you need a specific brand font.
- **Idiom**: avoid `!important` — it overrides the cascade in a way that's hard to debug and override further. Instead, increase specificity (a more specific selector) or reorder your rules. Reserve `!important` for overriding third-party styles you can't otherwise control.

## ⚠️ Edge Cases & Gotchas

- **Inline styles have the highest specificity (besides `!important`)** — `style="color: red"` overrides any stylesheet rule (without `!important`). This makes inline styles hard to override and is why they're discouraged except for dynamic JS-set styles.
- **Whitespace in CSS is mostly insignificant** — `a{color:red}` and `a { color: red; }` are equivalent. But format for readability (use a formatter: Prettier).
- **Missing semicolons**: `a { color: red font-size: 14px }` — the `font-size: 14px` is treated as part of the `color` value (invalid), and both are dropped. Always use semicolons (the last one is optional but recommended).
- **Vendor prefixes**: `-webkit-`, `-moz-`, `-ms-` prefixes were needed for experimental features. Modern CSS needs few prefixes (use Autoprefixer if supporting old browsers). Don't hand-prefix — use a build tool.
- **CSS is case-insensitive for selectors and properties** (in HTML): `DIV` and `div` match the same elements, `Color` and `color` are the same property. But class names are case-sensitive in HTML (`.Foo` ≠ `.foo`). Be consistent (lowercase).
- **Comments can't nest**: `/* /* */ */` — the first `*/` closes the comment; the rest is invalid. There's no nested comment syntax.
- **`@import` must come first**: `@import url('x.css');` must precede all other rules (except `@charset`). Putting it later silently fails (it's ignored). Avoid `@import` in production (it's render-blocking and serial) — use `<link>` tags or bundle.
- **Unsupported properties are ignored**: `aspect-ratio: 16/9;` in an old browser is ignored (not an error) — the element falls back to its default. Use `@supports` for feature detection.

## 🧠 Spot the Bug

A developer's CSS isn't applying, and they can't figure out why:

::code-wrapper{language="css"}
```css
p {
	color: blue
	font-size: 18px;
}
```
::

What's wrong?

<details>
<summary>Answer</summary>

The `color: blue` declaration is missing a semicolon. CSS parses `color: blue font-size: 18px;` as a single declaration with the value `blue font-size: 18px` — which is invalid for `color`. The whole declaration is dropped, so `color` isn't set (and `font-size` is lost too, since it was absorbed into the invalid `color` value).

The fix — add the semicolon:

```css
p {
	color: blue;
	font-size: 18px;
}
```
::
The last declaration's semicolon is technically optional (the `}` closes it), but every other declaration must end with `;`. Always use semicolons (a formatter like Prettier enforces this).

**The lesson**: a missing semicolon causes the next declaration to be absorbed into the current value, often invalidating both. Use a formatter to catch this.

</details>

## Recommended Environment

- **VS Code + Live Server** for hot reload.
- **Chrome or Firefox DevTools** for inspection and live editing.
- **Prettier** for formatting (consistent, no arguments).
- **Autoprefixer** (via PostCSS or a bundler) if supporting older browsers.

## Summary

You now have CSS set up, understand how to add it to HTML (external preferred), the basic syntax (rules, declarations, at-rules), and how to use DevTools as a live CSS REPL. Next: selectors and specificity — how the cascade resolves conflicts.