# 21 — Preprocessors & Build Tools

CSS preprocessors (Sass, Less, Stylus) and build tools (PostCSS, Vite, webpack) extend CSS with variables, nesting, mixins, and functions — then compile to standard CSS.

## Sass (SCSS)

Sass is the most popular preprocessor. SCSS is its CSS-compatible syntax (`.scss`):

::code-wrapper{language="scss"}
```scss
// Variables
$primary: #3498db;
$spacing: 1rem;

// Nesting
.card {
	padding: $spacing;
	background: white;

	&__title {
		font-size: 1.5rem;
		color: $primary;
	}

	&--featured {
		border-color: $primary;
	}
}

// Mixins
@mixin flex-center {
	display: flex;
	align-items: center;
	justify-content: center;
}

.hero {
	@include flex-center;
	min-height: 100vh;
}

// Functions and operations
@function rem($px) {
	@return $px / 16px * 1rem;
}

.title { font-size: rem(24px); }   /* 1.5rem */

// Loops
@for $i from 1 through 12 {
	.col-#{$i} { width: ($i / 12) * 100%; }
}

// Conditionals
@mixin theme($mode) {
	@if $mode == dark {
		background: #222;
		color: #eee;
	} @else {
		background: #fff;
		color: #333;
	}
}
```

### Sass vs CSS variables

Sass variables (`$var`) are compile-time constants — they can't change at runtime or respond to media queries (the compiled CSS has the final value). CSS variables (`--var`) are runtime and cascading.

Use **CSS variables** for theming (runtime, JS-accessible, media-query-responsive). Use **Sass variables** for build-time math, loops, and mixins (compiled away).

### `@use` and `@forward` (modern Sass)

::code-wrapper{language="scss"}
```scss
// _variables.scss
$primary: #3498db;

// main.scss
@use 'variables' as *;   // imports $primary
// or
@use 'variables';        // access as variables.$primary

// _index.scss (barrel)
@forward 'variables';
@forward 'mixins';
```

`@use` replaces `@import` (which is deprecated in Sass) — it's scoped (no global pollution) and loads once. `@forward` re-exports from a barrel file.

## Less

Less is similar to Sass, with a JS-like syntax:

::code-wrapper{language="less"}
```less
@primary: #3498db;
@spacing: 1rem;

.card {
	padding: @spacing;
	.title { font-size: 1.5rem; }
}

.mixin() { display: flex; }
.hero { .mixin(); }
```

Less compiles in the browser (via less.js) or via build tools. Less popular than Sass now.

## Stylus

Stylus has the most flexible syntax (brackets/colons/semicolons optional):

::code-wrapper{language="stylus"}
```stylus
primary = #3498db
spacing = 1rem

.card
	padding spacing
	.title
		font-size 1.5rem
```

Niche but has its fans for the terse syntax.

## PostCSS

PostCSS is a CSS transformer — it runs plugins on your CSS. Unlike Sass (a language), PostCSS works on standard CSS:

### Common PostCSS plugins
- **Autoprefixer** — adds vendor prefixes (chapter 20).
- **postcss-preset-env** — lets you use future CSS today (compiles `@custom-media`, custom selectors, etc. to today's CSS).
- **cssnano** — minifies CSS.
- **postcss-nested** — adds nesting (like Sass, but for standard CSS).
- **Tailwind CSS** — a PostCSS plugin that generates utility classes.

::code-wrapper{language="javascript"}
```javascript
// postcss.config.js
module.exports = {
	plugins: [
		require('autoprefixer'),
		require('postcss-preset-env')({ stage: 2 }),
		require('cssnano')({ preset: 'default' }),
	],
};
```

PostCSS is composable — pick the plugins for your needs. Many tools (Vite, Tailwind) use PostCSS under the hood.

## Build Tools

### Vite

Vite is the modern build tool — it uses native ES modules in dev (instant startup) and bundles for production (Rollup):

::code-wrapper{language="javascript"}
```javascript
// vite.config.js
export default {
	css: {
		preprocessorOptions: {
			scss: { additionalData: `@use "variables" as *;` },  // auto-import
		},
	},
};
```

Vite supports CSS, SCSS, Less, PostCSS out of the box — just install the preprocessor and import the file.

### webpack

::code-wrapper{language="javascript"}
```javascript
// webpack.config.js
module.exports = {
	module: {
		rules: [
			{
				test: /\.scss$/,
				use: ['style-loader', 'css-loader', 'postcss-loader', 'sass-loader'],
			},
		],
	},
};
```

webpack uses loaders to chain CSS processing — `sass-loader` (SCSS → CSS), `postcss-loader` (PostCSS), `css-loader` (resolve imports), `style-loader` (inject into DOM).

### Lightning CSS

Lightning CSS (formerly Parcel CSS) is a fast CSS parser/transformer/minifier written in Rust — an alternative to PostCSS for some tasks (nesting, prefixes, minification). Used by Tailwind 4.

## CSS Modules

CSS Modules scope class names locally (by file), avoiding collisions:

::code-wrapper{language="css"}
```css
/* Button.module.css */
.btn { padding: 0.5rem 1rem; }
.primary { background: blue; }
```

::code-wrapper{language="javascript"}
```javascript
import styles from './Button.module.css';

<button className={`${styles.btn} ${styles.primary}`}>Click</button>
```

The compiled class names are unique (`Button_btn__3a2f1`), scoping styles to the component. Popular with React.

## When to Use What

| Tool | Use for |
|---|---|
| Sass | Variables, nesting, mixins, loops (build-time) |
| PostCSS | Prefixes, future CSS, minification, Tailwind |
| CSS Modules | Scoped component styles (React) |
| Tailwind | Utility-first design system |
| Vite/webpack | Bundling and dev server |

**Modern recommendation**: use CSS variables (runtime theming) + a build tool (Vite) + PostCSS (prefixes/minification). Add Sass if you need mixins/loops. Add Tailwind if you prefer utility-first.

## 💡 Tips & Tricks

- **Idiom**: use CSS variables for theming (runtime, JS-accessible, media-query-responsive) and Sass variables for build-time math/mixins — they're complementary. `--primary` changes at runtime; `$breakpoint` is a compile-time constant for loops.
- **Idiom**: use `@use` (not `@import`) in modern Sass — `@import` is deprecated. `@use` is scoped (no global pollution) and loads once. `@forward` re-exports from a barrel file.
- **Idiom**: use PostCSS for prefixes and minification (Autoprefixer + cssnano) — it works on standard CSS, composable with other plugins. Vite/webpack integrate it; configure once and forget.
- **Idiom**: use CSS Modules for scoped component styles in React — `import styles from './Button.module.css'` gives locally-scoped class names (no collisions, no BEM needed). Popular with React; for Vue, use `<style scoped>`.
- **Idiom**: use Vite for new projects — it handles CSS/SCSS/PostCSS out of the box (install the preprocessor, import the file). Dev uses native ES modules (instant startup); production bundles with Rollup. Faster and simpler than webpack for most apps.

## ⚠️ Edge Cases & Gotchas

- **Sass `@import` is deprecated**: use `@use`/`@forward`. `@import` pollutes the global namespace and loads the file multiple times. `@use` is scoped and loads once.
- **Sass variables are compile-time**: `$primary: blue` becomes `blue` in the compiled CSS — it can't change at runtime or in media queries. Use CSS variables (`--primary`) for runtime theming.
- **`@use` namespaces by default**: `@use 'variables'` accesses as `variables.$primary`. Use `@use 'variables' as *` for no namespace, or `@use 'variables' as v` for a shorter one.
- **CSS Modules need a framework**: CSS Modules work with React/Vue/Next.js via the bundler. A plain `.html` file can't use them (no scoping mechanism).
- **`@apply` in Tailwind couples to Tailwind**: `@apply mt-4;` in a CSS file makes your CSS dependent on Tailwind's utilities. Use sparingly; prefer composing utilities in JSX/HTML.
- **PostCSS plugins have config**: `postcss-preset-env` has stages (0-4); stage 2 is a common default. Autoprefixer needs `browserslist`. Misconfigured plugins can produce unexpected output.
- **Order matters in webpack loaders**: `use: ['style-loader', 'css-loader', 'postcss-loader', 'sass-loader']` — loaders execute right-to-left. `sass-loader` first (SCSS→CSS), then `postcss-loader`, then `css-loader`, then `style-loader` (inject).
- **Vite preprocessor auto-import**: `css.preprocessorOptions.scss.additionalData` prepends to every SCSS file (useful for `@use 'variables'`). But it can cause "already imported" errors if a file also imports — use `@use` (idempotent) not `@import`.
- **Lightning CSS vs PostCSS**: Lightning CSS is faster (Rust) but has fewer plugins. PostCSS has a richer ecosystem. Tailwind 4 uses Lightning CSS; many setups still use PostCSS.
- **Minification can change behavior**: aggressive minification (shortening class names, removing "unused" CSS) can break things if it misidentifies used classes (dynamic class names in JS). Configure carefully.

## 🧠 Spot the Bug

A developer uses a Sass variable for the primary color and a media query to change it, but the color doesn't change on smaller screens:

::code-wrapper{language="scss"}
```scss
$primary: blue;

@media (max-width: 768px) {
	$primary: red;
}

.button { background: $primary; }
```
::

What's wrong?

<details>
<summary>Answer</summary>

Sass variables are **compile-time** — the `@media` block's `$primary: red` changes the variable's value *during compilation*, but only within that block's scope. By the time `.button { background: $primary; }` is compiled, `$primary` is `blue` (the last assignment in the main scope, outside the `@media` block).

The compiled CSS is:

```css
.button { background: blue; }
```

There's no media query — the `$primary: red` inside `@media` didn't persist outside it (Sass `@media` blocks have their own scope for variables), and even if it did, it's compile-time, so you can't have a different value at a different viewport.

The fix — use CSS variables (runtime, media-query-responsive):

```scss
:root {
	--primary: blue;
}
@media (max-width: 768px) {
	:root {
		--primary: red;
	}
}
.button { background: var(--primary); }
```

Now `--primary` is `blue` on desktop and `red` on mobile (≤768px), at runtime. The browser applies the right value based on the viewport.

**The lesson**: Sass variables are compile-time constants — they can't change at runtime or per media query. Use CSS variables (`--var`) for runtime theming and media-query-responsive values. Use Sass variables only for build-time math, loops, and mixins.

</details>

## Summary

You know Sass (variables, nesting, mixins, functions, loops, `@use`/`@forward`), Less, Stylus, PostCSS (Autoprefixer, preset-env, cssnano), build tools (Vite, webpack, Lightning CSS), and CSS Modules — and when to use CSS variables (runtime) vs Sass variables (compile-time), with the `@media`-can't-change-Sass-variable trap avoided. Next: exercises and projects.