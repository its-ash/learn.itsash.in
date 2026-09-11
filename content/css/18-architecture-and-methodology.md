---
title: "18 — Architecture: BEM, OOCSS, ITCSS, Atomic & Cascade Layers"
description: "BEM flat-specificity naming, OOCSS structure/skin separation, ITCSS inverted-triangle ordering, Atomic/Tailwind utility-first, and @layer as the native architecture primitive. Code-first reference with the modifier-needs-base trap."
---

# 18 — Architecture: BEM, OOCSS, ITCSS, Atomic & Cascade Layers

Without architecture, CSS rots: specificity wars, dead code, inconsistent naming. Methodologies bring order through naming conventions and organizational rules. The modern approach: BEM for flat specificity + `@layer` for explicit precedence. This is the architecture that scales.

## BEM — Block, Element, Modifier

::code-wrapper{language="html"}
```html
<!-- Block: standalone component. Element: part of the block (__). Modifier: variation (--). -->
<div class="card card--featured">
  <img class="card__image" src="...">
  <h3 class="card__title">Title</h3>
  <button class="card__button card__button--disabled">Click</button>
</div>
```
::

::code-wrapper{language="css"}
```css
.card { /* ... */ }                    /* (0,0,1,0) — block */
.card--featured { /* ... */ }          /* (0,0,1,0) — modifier (used WITH the block) */
.card__image { /* ... */ }            /* (0,0,1,0) — element */
.card__button { /* ... */ }           /* (0,0,1,0) — element */
.card__button--disabled { /* ... */ } /* (0,0,1,0) — element modifier */
/* Every selector is a SINGLE class → flat specificity (0,0,1,0). No specificity wars.
   No nesting: .card .card__title is WRONG (creates (0,0,2,0)). Use .card__title alone. */
```
::

### Anti-pattern: modifier without the base

::code-wrapper{language="html"}
```html
<!-- ❌ Only btn--disabled — missing the base btn. Modifier only sets DIFFERENCES. -->
<button class="btn--disabled">Click</button>
```
::

::code-wrapper{language="css"}
```css
/* The modifier only overrides; it doesn't carry base styles. Button is unstyled (no padding, no color). */
.btn { padding: 0.5rem 1rem; background: blue; color: white; }
.btn--disabled { background: gray; }  /* only the difference */
```
::

::code-wrapper{language="html"}
```html
<!-- ✓ Both classes: base provides the foundation, modifier overrides. -->
<button class="btn btn--disabled">Click</button>
```
::

## OOCSS — separate structure from skin

::code-wrapper{language="css"}
```css
/* Structure (layout) and skin (visual) are separate classes → compose, don't couple. */
.media { display: flex; }              /* structure */
.media__img { margin-inline-end: 1rem; }
.media__body { flex: 1; }
.skin-card { background: white; border-radius: 8px; box-shadow: ...; }  /* skin */
.skin-dark { background: #333; color: #eee; }                            /* skin */
```
::

::code-wrapper{language="html"}
```html
<!-- Combine a structure class with a skin class — same layout, any visual. -->
<div class="media skin-card"><img class="media__img"><div class="media__body">...</div></div>
```
::

## ITCSS — the inverted triangle by specificity

::code-wrapper{language="text"}
```text
Settings    → variables (--color, --font)           least specific
Tools       → mixins, functions
Generic     → resets, box-sizing
Elements    → bare element selectors (body, a)
Objects     → layout patterns (.media, .container)
Components  → UI components (.card, .nav)
Utilities   → single-purpose (.text-center, .mt-4)   most specific
```
::

Each layer is more specific/explicit than the one above. Import in order → later layers override earlier. Maps directly to `@layer`.

## Atomic / Utility-First (Tailwind)

::code-wrapper{language="html"}
```html
<button class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">Button</button>
```
::

No naming — compose utilities in HTML. Small file size with purging. Verbose HTML. Best for component-heavy apps (React/Vue) with a design system.

## `@layer` — the native architecture primitive

::code-wrapper{language="css"}
```css
@layer reset, base, layout, components, utilities;

@layer reset { * { box-sizing: border-box; margin: 0; } }
@layer base { body { font-family: sans-serif; } }
@layer layout { .container { max-width: 1200px; margin-inline: auto; } }
@layer components { .card { /* ... */ } .btn { /* ... */ } }
@layer utilities { .text-center { text-align: center; } .mt-4 { margin-block-start: 1rem; } }
/* Layer order = precedence. utilities (last) beats components regardless of specificity.
   This is the modern ITCSS, native and reliable. */
```
::

## 💡 Tips & Tricks

- **Idiom**: BEM (`.block`, `.block__element`, `.block--modifier`) for most projects — flat specificity (all 0,0,1,0), clear ownership, no specificity wars. Double underscore (element), double hyphen (modifier).
- **Idiom**: `@layer` to formalize architecture — `@layer reset, base, components, utilities;` makes precedence explicit: utilities beat components regardless of specificity. The end of `!important`.
- **Idiom**: separate structure from skin (OOCSS) — a `.media` layout class + a `.skin-card` visual class → same layout, any skin; same skin, any layout. Compose, don't couple.
- **Idiom**: state classes (`.is-active`, `.is-loading`) for JS-driven state — a clear contract: JS toggles state classes, CSS styles them. Reserve `.is-`/`.has-` for state, not presentation.
- **Idiom**: pick ONE methodology and be consistent. BEM + `@layer` is the solid default for most projects. Tailwind is valid for component-heavy apps. Mixing methodologies creates inconsistency.

## ⚠️ Edge Cases & Gotchas

- **BEM element names shouldn't nest**: `.card__title__text` is wrong (a chain). Use `.card__text` (flat) or split into a sub-block.
- **BEM modifiers are used WITH the base**: `class="btn btn--disabled"`, not `class="btn--disabled"` alone. The modifier only sets differences.
- **Specificity still matters in BEM**: `.card .card__title` (0,0,2,0) beats `.card__title` (0,0,1,0). BEM's rule: don't nest — use `.card__title` alone.
- **Unlayered rules beat layered rules**: if your utilities are in `@layer utilities` and your override is unlayered, the override wins. Layer everything or nothing.
- **State classes shouldn't have global visual styles**: `.is-active { display: block; }` as a global rule is wrong — the component should style it (`.tab.is-active { }`).
- **Atomic CSS needs purging**: Tailwind generates thousands of utilities. Without purging (via `content` config), the CSS file is huge. Always configure purging.
- **`@apply` in Tailwind couples CSS to Tailwind**: `@apply mt-4;` makes your CSS dependent on Tailwind's utilities. Use sparingly; prefer composing in JSX/HTML.

## 🧠 Spot the Bug

::code-wrapper{language="html"}
```html
<button class="btn--disabled">Click</button>
```
::

<details>
<summary>Answer</summary>

The button only has `btn--disabled` — it's missing the base `btn` class. In BEM, a modifier is used *with* the base: `class="btn btn--disabled"`. The modifier only sets the *differences* (`background: gray`); it doesn't include the base styles (padding, color, the original background). With only `btn--disabled`, the button gets `background: gray` but no padding, no `color: white`, no base styling → broken. Fix: `class="btn btn--disabled"`. The base provides the foundation; the modifier overrides. Always include the base class with a modifier.

</details>
