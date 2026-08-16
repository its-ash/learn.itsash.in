# 15 — CSS Variables (Custom Properties)

CSS custom properties ("CSS variables") store reusable values, enabling theming, dynamic styling, and DRY code.

## Defining and Using

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
	color: var(--text-color, #333);   /* fallback if --text-color is unset */
}
```

- Define with `--name: value;`.
- Use with `var(--name)` or `var(--name, fallback)`.
- By convention, define on `:root` (the highest level) for global scope.

## Cascade and Inheritance

CSS variables **inherit** — a variable defined on `:root` is available to all elements. A variable defined on a specific element is available to that element and its descendants:

::code-wrapper{language="css"}
```css
:root { --color: blue; }
.card { --color: red; }        /* .card and descendants see red */
.card .title { color: var(--color); }   /* red */
.other { color: var(--color); }         /* blue (from :root) */
```

Variables follow the normal cascade — later/more-specific rules override. They're *not* static text substitution; they're real properties that inherit and cascade.

## Validity and Fallbacks

::code-wrapper{language="css"}
```css
color: var(--undefined, #333);              /* fallback used */
color: var(--primary, var(--default, blue)); /* nested fallback */
color: var(--primary, blue, green);         /* 'blue, green' is the fallback (commas allowed) */
```

If a variable is invalid (e.g., `--gap: 10` without a unit), `var(--gap)` makes the *whole property* invalid (`color: var(--bad)` → `color: unset` to inherited/initial, not the fallback). The fallback only applies if the variable is *unset*, not if it's *invalid*.

## Theming with CSS Variables

### Light/dark theme

::code-wrapper{language="css"}
```css
:root {
	--bg: #fff;
	--text: #333;
	--primary: #3498db;
}
@media (prefers-color-scheme: dark) {
	:root {
		--bg: #222;
		--text: #eee;
		--primary: #5dade2;
	}
}
body { background: var(--bg); color: var(--text); }
```

### Manual toggle (data attribute)

::code-wrapper{language="css"}
```css
:root { --bg: #fff; --text: #333; }
[data-theme="dark"] { --bg: #222; --text: #eee; }

body { background: var(--bg); color: var(--text); }
```

::code-wrapper{language="javascript"}
```javascript
document.documentElement.setAttribute('data-theme', 'dark');
```

The `data-theme` attribute on `<html>` switches the variables — instant theme change, no reload. Persist in `localStorage` and respect `prefers-color-scheme` on load.

## Dynamic Values (JS)

CSS variables are accessible from JS — read and set them at runtime:

::code-wrapper{language="javascript"}
```javascript
// Read
const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary');

// Set
document.documentElement.style.setProperty('--primary', '#ff0000');

// For a specific element
el.style.setProperty('--spacing', '2rem');
```

This is powerful — JS can drive CSS values (e.g., a slider updating `--hue`, a drag updating `--x`/`--y`) without recomputing styles. CSS variables are the bridge for JS↔CSS dynamic styling.

## Variables in Media Queries (for responsive values)

::code-wrapper{language="css"}
```css
:root { --spacing: 1rem; }
@media (min-width: 768px) {
	:root { --spacing: 2rem; }
}
.container { padding: var(--spacing); }   /* 1rem mobile, 2rem tablet+ */
```

You *can't* define variables *inside* `@media` conditions (variables are properties, not at-rule conditions), but you can redefine them *within* media query blocks, as above — a clean way to make responsive tokens.

## CSS Variables vs Preprocessor Variables

| Feature | CSS Variables | Sass/Less Variables |
|---|---|---|
| Runtime | ✅ Browser | ❌ Compile-time |
| Inheritance | ✅ Cascades | ❌ Static |
| Media query redefinition | ✅ | ❌ (compile-time) |
| JS access | ✅ | ❌ |
| Conditional value | ✅ | ❌ |
| Browser support | ✅ (all modern) | ✅ (compiled to CSS) |

CSS variables are runtime, cascading, and JS-accessible — use them for theming and dynamic values. Preprocessor variables are compile-time constants — use for build-time math and mixins.

## 💡 Tips & Tricks

- **Idiom**: use CSS variables for design tokens (`--color-primary`, `--spacing-md`, `--radius`) — define on `:root`, use everywhere. Change one value, the whole UI updates. This is the modern theming foundation.
- **Idiom**: use `data-theme` attribute + CSS variables for manual theme toggles — `[data-theme="dark"] { --bg: #222; }` and `document.documentElement.setAttribute('data-theme', 'dark')` switches themes instantly, no reload. Persist in `localStorage`, respect `prefers-color-scheme` on first load.
- **Idiom**: use CSS variables for JS↔CSS bridges — JS sets `el.style.setProperty('--x', '100px')`, CSS uses `transform: translateX(var(--x))`. This drives dynamic styling (drag, slider, scroll) without recomputing styles or inline transforms.
- **Idiom**: redefine variables in `@media` blocks for responsive tokens — `@media (min-width: 768px) { :root { --spacing: 2rem; } }` makes the token responsive without touching each use site.
- **Idiom**: use `var(--name, fallback)` for robustness — the fallback applies if the variable is *unset*. Useful for components that should work even if the consumer didn't define the variable.

## ⚠️ Edge Cases & Gotchas

- **Invalid variable values make the *property* invalid, not the fallback**: `--gap: 10` (no unit) and `padding: var(--gap)` → `padding` is invalid → set to `initial` (0), not the fallback. The fallback only applies if the variable is *unset* (`var(--undefined, 10px)`).
- **Variables can't be used in property names or selectors**: `var(--prop): red` and `.var(--cls)` don't work. Variables are for *values* only.
- **Variables can't be used in media query conditions**: `@media (min-width: var(--break))` is invalid. You can redefine variables *inside* media queries, but not use them in the condition.
- **Variables inherit**: a variable on `:root` is global, but a variable on `.card` only affects `.card` and descendants. Unexpected inheritance can surprise — check the element's computed variables in DevTools.
- **`var()` in shorthand can be tricky**: `margin: var(--gap)` works, but `margin: var(--gap) var(--gap2)` — if either is invalid, the whole `margin` is invalid.
- **URLs in variables need quoting carefully**: `--img: url("x.png")` then `background: var(--img)` works. But `--url: "x.png"` then `background: url(var(--url))` doesn't (can't use `var()` inside `url()`).
- **Variables and `calc()`**: `calc(var(--gap) * 2)` works if `--gap` has a unit (`10px`). `calc(var(--n) * 2)` with `--n: 10` (unitless) gives `20` (unitless, usable in `calc`).
- **`!important` on variables**: `--primary: blue !important` makes the *variable* important (harder to override). Rarely needed; avoid.
- **Initial value is `unset` (guaranteed-invalid)**: a variable not defined anywhere is `unset`, so `var(--undefined)` makes the property invalid (or uses the fallback if provided).
- **CSS variables are case-sensitive**: `--Color` and `--color` are different. Stick to a convention (kebab-case: `--primary-color`).

## 🧠 Spot the Bug

A developer sets a spacing variable without a unit, then uses it in `padding` — the padding doesn't apply:

::code-wrapper{language="css"}
```css
:root { --gap: 10; }
.box { padding: var(--gap); }
```
::

What's wrong?

<details>
<summary>Answer</summary>

`--gap: 10` is a unitless value. `padding: var(--gap)` becomes `padding: 10`, which is an *invalid* value for `padding` (lengths need a unit: `10px`, `10rem`, etc.). When `var()` resolves to an invalid value, the *whole property* is invalid, and `padding` is set to its `initial` value (0) — not a fallback (no fallback was provided, and even if one was, it only applies if the variable is *unset*, not if its value is invalid).

The fix — give `--gap` a unit:

```css
:root { --gap: 10px; }
.box { padding: var(--gap); }   /* 10px */
```

Or use `calc()` to add the unit (less clean):

```css
:root { --gap: 10; }
.box { padding: calc(var(--gap) * 1px); }   /* 10px */
```

**The lesson**: CSS variables are substituted as raw values — `--gap: 10` puts `10` in `padding: 10`, which is invalid (no unit). The property becomes invalid (→ initial), not a fallback. Always include units in variable values, or multiply by `1px` in `calc()`.

</details>

## Summary

You can now define and use CSS variables (`--name`, `var(--name, fallback)`), leverage inheritance/cascade, build light/dark themes (`prefers-color-scheme` + `data-theme`), drive dynamic styling from JS (`setProperty`), redefine tokens in `@media`, and choose CSS variables over preprocessor variables for runtime/cascading needs — while avoiding the invalid-value trap. Next: writing modes and logical properties.