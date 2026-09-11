---
title: "21 — Preprocessors & Build Tools: Sass, PostCSS, Vite & CSS Modules"
description: "Sass @use vs deprecated @import, compile-time Sass variables vs runtime CSS variables, PostCSS plugin chains, CSS Modules scoping, and the Sass-variable-in-@media trap. Code-first reference for the modern build pipeline."
---

# 21 — Preprocessors & Build Tools: Sass, PostCSS, Vite & CSS Modules

Sass extends CSS with compile-time variables, nesting, mixins, and loops. PostCSS transforms standard CSS with plugins. CSS Modules scope class names per file. The modern pipeline: CSS variables (runtime) + a build tool (Vite) + PostCSS (prefixes/minify). Add Sass only if you need mixins/loops.

## Sass (SCSS) — variables, nesting, mixins, loops

::code-wrapper{language="scss"}
```scss
$primary: #3498db;   // compile-time constant → becomes #3498db in the output. Not runtime.
$spacing: 1rem;

.card {
  padding: $spacing;
  &__title { font-size: 1.5rem; color: $primary; }   // BEM with nesting
  &--featured { border-color: $primary; }
}

@mixin flex-center { display: flex; align-items: center; justify-content: center; }
.hero { @include flex-center; min-height: 100vh; }

@function rem($px) { @return $px / 16px * 1rem; }   // build-time function
.title { font-size: rem(24px); }                   // → 1.5rem

@for $i from 1 through 12 { .col-#{$i} { width: ($i / 12) * 100%; } }  // loop → 12 classes
```
::

## `@use` (modern) vs `@import` (deprecated)

::code-wrapper{language="scss"}
```scss
// _variables.scss
$primary: #3498db;

// main.scss
@use 'variables' as *;   // imports $primary into scope. Scoped, loads once.
// or
@use 'variables';        // access as variables.$primary (namespaced)

// _index.scss (barrel)
@forward 'variables';
@forward 'mixins';
```
::

## The Sass-vs-CSS-Variables Trap — compile-time ≠ runtime

### Anti-pattern: Sass variable in @media can't change

::code-wrapper{language="scss"}
```scss
// ❌ Sass variables are COMPILE-TIME. $primary: red inside @media changes it only within that
// block's scope. By the time .button is compiled, $primary is blue (the main-scope value).
$primary: blue;
@media (max-width: 768px) { $primary: red; }  // scoped to the @media block, doesn't persist
.button { background: $primary; }  // → background: blue; (no media query, no change)
```
::

::code-wrapper{language="scss"}
```scss
// ✓ CSS variables are RUNTIME — they respond to @media at runtime.
:root { --primary: blue; }
@media (max-width: 768px) { :root { --primary: red; } }
.button { background: var(--primary); }  // blue desktop, red mobile — at runtime
```
::

## PostCSS — the plugin pipeline

::code-wrapper{language="javascript"}
```javascript
// postcss.config.js
module.exports = {
  plugins: [
    require('autoprefixer'),                      // vendor prefixes (browserslist-driven)
    require('postcss-preset-env')({ stage: 2 }),  // future CSS → today's CSS
    require('cssnano')({ preset: 'default' }),     // minify
  ],
};
```
::

## Vite — the modern build tool

::code-wrapper{language="javascript"}
```javascript
// vite.config.js — handles CSS/SCSS/PostCSS out of the box.
export default {
  css: {
    preprocessorOptions: {
      scss: { additionalData: `@use "variables" as *;` },  // auto-import for every SCSS file
    },
  },
};
```
::

## CSS Modules — scoped class names

::code-wrapper{language="css"}
```css
/* Button.module.css — class names are scoped to this file (compiled to unique names). */
.btn { padding: 0.5rem 1rem; }
.primary { background: blue; }
```
::

::code-wrapper{language="javascript"}
```javascript
import styles from './Button.module.css';
<button className={`${styles.btn} ${styles.primary}`}>Click</button>
// Compiled: class="Button_btn__3a2f1 Button_primary__9b1c4" — no collisions, no BEM needed.
```
::

## When to Use What

::code-wrapper{language="text"}
```text
Tool             Use for
CSS variables     Runtime theming, JS-accessible, @media-responsive
Sass variables    Build-time math, loops, mixins (compiled away)
PostCSS           Prefixes, future CSS, minification, Tailwind
CSS Modules       Scoped component styles (React)
Tailwind          Utility-first design system
Vite              Dev server + bundling (modern default)
```
::

## 💡 Tips & Tricks

- **Idiom**: CSS variables for theming (runtime, JS-accessible, @media-responsive) + Sass variables for build-time math/mixins — they're complementary. `--primary` changes at runtime; `$breakpoint` is a compile-time constant for loops.
- **Idiom**: `@use` (not `@import`) in modern Sass — `@import` is deprecated (pollutes global scope, loads multiple times). `@use` is scoped and loads once. `@forward` re-exports from a barrel.
- **Idiom**: PostCSS for prefixes + minification (Autoprefixer + cssnano) — configure once, forget. Vite/webpack integrate it.
- **Idiom**: CSS Modules for scoped component styles in React — `import styles from './X.module.css'` gives locally-scoped names (no collisions, no BEM). For Vue, use `<style scoped>`.
- **Idiom**: Vite for new projects — handles CSS/SCSS/PostCSS out of the box, native ES modules in dev (instant startup), Rollup for production. Faster and simpler than webpack.

## ⚠️ Edge Cases & Gotchas

- **Sass `@import` is deprecated**: use `@use`/`@forward`. `@import` pollutes the global namespace and loads files multiple times.
- **Sass variables are compile-time**: `$primary: blue` becomes `blue` in the compiled CSS — can't change at runtime or per media query. Use CSS variables (`--primary`) for runtime theming.
- **`@use` namespaces by default**: `@use 'variables'` → `variables.$primary`. Use `@use 'variables' as *` for no namespace, or `as v` for a short one.
- **CSS Modules need a framework**: they work via the bundler (React/Vue/Next.js). A plain `.html` file can't use them (no scoping mechanism).
- **`@apply` in Tailwind couples CSS to Tailwind**: `@apply mt-4;` makes your CSS dependent on Tailwind's utilities. Use sparingly; prefer composing in JSX/HTML.
- **webpack loaders execute right-to-left**: `['style-loader', 'css-loader', 'postcss-loader', 'sass-loader']` → sass-loader first (SCSS→CSS), then postcss-loader, then css-loader, then style-loader (inject).
- **Minification can break dynamic class names**: aggressive minification that removes "unused" CSS can misidentify JS-generated classes. Configure PurgeCSS/Tailwind safelist carefully.

## 🧠 Spot the Bug

::code-wrapper{language="scss"}
```scss
$primary: blue;
@media (max-width: 768px) { $primary: red; }
.button { background: $primary; }
```
::

<details>
<summary>Answer</summary>

Sass variables are **compile-time**. `$primary: red` inside the `@media` block changes the variable only within that block's scope. By the time `.button { background: $primary; }` is compiled, `$primary` is `blue` (the main-scope value). The compiled CSS is `background: blue;` with no media query — the red never applies. Sass variables can't change at runtime or per viewport. Fix: use CSS variables — `:root { --primary: blue; }` + `@media (max-width: 768px) { :root { --primary: red; } }` + `background: var(--primary)`. CSS variables are runtime and @media-responsive.

</details>
