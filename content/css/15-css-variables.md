---
title: "15 — CSS Variables: Custom Properties as the Theming Engine"
description: "Custom property cascade and inheritance, var() fallback vs invalid-value semantics, runtime theming via data-theme + prefers-color-scheme, JS setProperty bridge, and redefinition in @media. Code-first reference for production design-token systems."
---

# 15 — CSS Variables: Custom Properties as the Theming Engine

CSS custom properties (`--name`) are real properties that cascade, inherit, and are readable/writable from JS at runtime. They are *not* preprocessor text substitution. This is what makes them the theming engine: change a variable on `:root`, and every consumer re-paints in one frame.

## Defining and Using — with fallback semantics

::code-wrapper{language="css"}
```css
:root {
  --primary: #3498db;
  --spacing: 1rem;
  --radius: 8px;
}
.button {
  background: var(--primary);
  padding: var(--spacing);
  border-radius: var(--radius);
  color: var(--text-color, #333);  /* fallback: used ONLY if --text-color is UNSET, not if it's invalid */
}
```
::

## The Cascade — variables inherit and cascade

::code-wrapper{language="css"}
```css
:root { --color: blue; }              /* global — every descendant inherits */
.card { --color: red; }               /* .card and descendants see red; others still blue */
.card .title { color: var(--color); } /* red (inherits from .card) */
.other { color: var(--color); }       /* blue (inherits from :root) */
/* Variables follow the normal cascade: later/more-specific rules override. They are
   NOT static text substitution — they're real properties that inherit and cascade. */
```
::

## The Invalid-Value Trap — fallback ≠ invalid

::code-wrapper{language="css"}
```css
:root { --gap: 10; }  /* unitless — invalid when used in padding */
.box { padding: var(--gap); }  /* var(--gap) → "10" → padding: 10 → INVALID → property set to INITIAL (0) */
/* ⚠️ The fallback in var(--gap, 10px) applies ONLY if --gap is UNSET, NOT if its value is invalid.
   An invalid variable value makes the WHOLE property invalid → it goes to initial/inherited, not the fallback. */
```
::

### Anti-pattern: missing unit in a variable value

::code-wrapper{language="css"}
```css
/* ❌ --gap: 10 (no unit) → padding: 10 is invalid → padding becomes 0 (initial), not the fallback */
:root { --gap: 10; }
.box { padding: var(--gap); }
```
::

::code-wrapper{language="css"}
```css
/* ✓ Give the variable a unit, or multiply by 1px in calc(). */
:root { --gap: 10px; }
.box { padding: var(--gap); }  /* 10px */
/* or */
:root { --gap: 10; }
.box { padding: calc(var(--gap) * 1px); }  /* 10px — adds the unit at use-site */
```
::

## Theming — light/dark with `prefers-color-scheme` + `data-theme`

::code-wrapper{language="css"}
```css
:root {
  --bg: #fff; --fg: #333; --primary: #3498db;
}
@media (prefers-color-scheme: dark) {  /* system preference */
  :root { --bg: #1a1a1a; --fg: #eee; --primary: #5dade2; }
}
[data-theme="dark"] {  /* manual toggle override (wins via attribute specificity) */
  --bg: #1a1a1a; --fg: #eee; --primary: #5dade2;
}
body { background: var(--bg); color: var(--fg); }  /* one rule, themed by variables */
```
::

::code-wrapper{language="javascript"}
```javascript
// Toggle theme at runtime — set the attribute, CSS variables update, page re-paints. No reload.
document.documentElement.setAttribute('data-theme', 'dark');
// Persist + respect system preference on load:
const saved = localStorage.getItem('theme');
if (saved) document.documentElement.setAttribute('data-theme', saved);
```
::

## JS ↔ CSS Bridge — `setProperty` / `getPropertyValue`

::code-wrapper{language="javascript"}
```javascript
// Read
const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
// Set globally
document.documentElement.style.setProperty('--primary', '#ff0000');
// Set per-element (scoped to that element + descendants)
el.style.setProperty('--x', `${pointerX}px');
// CSS: transform: translateX(var(--x)) — JS drives the value, CSS owns the logic.
```
::

## Responsive Tokens — redefining in `@media`

::code-wrapper{language="css"}
```css
:root { --spacing: 1rem; }
@media (min-width: 768px) { :root { --spacing: 2rem; } }  /* token becomes responsive */
.container { padding: var(--spacing); }  /* 1rem mobile, 2rem tablet+ — no per-use-site media queries */
/* You CANNOT use var() inside @media conditions: @media (min-width: var(--break)) is invalid.
   But you CAN redefine variables INSIDE @media blocks (as above). */
```
::

## 💡 Tips & Tricks

- **Idiom**: design tokens on `:root` (`--color-primary`, `--space-md`, `--radius`) — change one value, the whole UI updates in one paint. This is the modern theming foundation.
- **Idiom**: `data-theme` attribute + CSS variables for manual theme toggles — instant, no reload. Persist in `localStorage`, respect `prefers-color-scheme` on first load.
- **Idiom**: JS↔CSS bridge via custom properties — JS sets `el.style.setProperty('--x', '100px')`, CSS uses `transform: translateX(var(--x))`. JS drives values, CSS owns the presentation logic (overridable by classes).
- **Idiom**: redefine variables in `@media` for responsive tokens — the token adapts, every use-site updates. No per-component media queries.
- **Idiom**: `var(--name, fallback)` for robustness — the fallback applies if the variable is *unset*. Useful for components that should work even if the consumer didn't define the token.

## ⚠️ Edge Cases & Gotchas

- **Invalid variable values make the *property* invalid, not the fallback**: `--gap: 10` (no unit) + `padding: var(--gap)` → `padding` invalid → `initial` (0). The fallback only applies if the variable is *unset*.
- **Variables are for VALUES only**: `var(--prop): red` (property name) and `.var(--cls)` (selector) don't work. No variable in media query conditions either.
- **`var()` in shorthand can invalidate the whole shorthand**: `margin: var(--gap) var(--gap2)` — if either is invalid, the whole `margin` is invalid.
- **URLs in variables**: `--img: url("x.png")` then `background: var(--img)` works. But `--url: "x.png"` then `background: url(var(--url))` doesn't (can't use `var()` inside `url()`).
- **`!important` on variables**: `--primary: blue !important` makes the *variable* important (harder to override). Rarely needed; avoid.
- **CSS variables are case-sensitive**: `--Color` ≠ `--color`. Stick to kebab-case (`--primary-color`).
- **Initial value is guaranteed-invalid (unset)**: `var(--undefined)` with no fallback makes the property invalid → initial/inherited.

## 🧠 Spot the Bug

::code-wrapper{language="css"}
```css
:root { --gap: 10; }
.box { padding: var(--gap); }
```
::

<details>
<summary>Answer</summary>

`--gap: 10` is unitless. `padding: var(--gap)` resolves to `padding: 10` — invalid (lengths need a unit: `10px`, `10rem`). When `var()` resolves to an invalid value, the *whole property* is invalid → `padding` is set to its `initial` value (0), not a fallback. The fallback only applies if the variable is *unset* (`var(--undefined, 10px)`), not if its value is invalid. Fix: give `--gap` a unit (`--gap: 10px`), or multiply by `1px` in calc (`calc(var(--gap) * 1px)`). Always include units in variable values used as lengths.

</details>
