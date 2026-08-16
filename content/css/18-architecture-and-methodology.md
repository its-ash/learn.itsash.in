# 18 — Architecture & Methodology

CSS architecture methodologies (BEM, OOCSS, SMACSS, ITCSS, Atomic) bring order to large stylesheets — consistent naming, separation of concerns, and maintainability.

## The Problem

Without structure, CSS devolves into:
- Specificity wars (`!important` everywhere).
- Dead code (afraid to delete — might break something).
- Non-reusable components.
- Inconsistent naming (`.btn`, `.button`, `.Button`, `.btn-primary`).

Methodologies solve this with naming conventions and organizational rules.

## BEM (Block, Element, Modifier)

BEM is the most popular naming convention:

::code-wrapper{language="html"}
```html
<div class="card card--featured">
	<img class="card__image" src="...">
	<h3 class="card__title">Title</h3>
	<p class="card__body">Body text</p>
	<button class="card__button card__button--disabled">Click</button>
</div>
```

::code-wrapper{language="css"}
```css
.card { ... }
.card--featured { ... }
.card__image { ... }
.card__title { ... }
.card__body { ... }
.card__button { ... }
.card__button--disabled { ... }
```

- **Block** (`.card`) — a standalone component.
- **Element** (`.card__title`) — a part of the block (double underscore).
- **Modifier** (`.card--featured`) — a variation or state (double hyphen).

### Rules
- Elements (`__`) are always prefixed with their block.
- Modifiers (`--`) are always used with the block/element they modify (`class="card card--featured"`, not just `card--featured`).
- No nesting of elements in the class name (`.card__title__text` ❌ — use `.card__text` or a sub-block).

### Benefits
- Flat specificity (all single-class selectors, 0,1,0).
- Clear ownership (every class knows its block).
- No specificity wars.

## OOCSS (Object-Oriented CSS)

Two principles:
1. **Separate structure from skin** — layout (structure) separate from visual (skin).
2. **Separate container from content** — components shouldn't be location-specific.

::code-wrapper{language="css"}
```css
/* Structure */
.media { display: flex; }
.media__img { margin-inline-end: 1rem; }
.media__body { flex: 1; }

/* Skin */
.skin-card { background: white; border-radius: 8px; padding: 1rem; box-shadow: ...; }
.skin-dark { background: #333; color: #eee; }
```

::code-wrapper{language="html"}
```html
<div class="media skin-card">
	<img class="media__img" src="...">
	<div class="media__body">...</div>
</div>
```

Combine a structure class (`media`) with a skin class (`skin-card`) — the media layout works regardless of the visual skin.

## SMACSS (Scalable and Modular Architecture)

Categorizes CSS into five types:
1. **Base** — element selectors (`body`, `a`, `h1`).
2. **Layout** — structural (`#header`, `.l-grid`, `.container`).
3. **Module** — components (`.card`, `.nav`).
4. **State** — states (`.is-active`, `.is-hidden`, `.is-collapsed`).
5. **Theme** — theme overrides (`.theme-dark`).

Organizes files by category (`base.css`, `layout.css`, `modules/`, `states.css`, `theme.css`). The naming convention prefixes classes by category (`.l-` for layout, `.is-` for state, `.has-` for state).

## ITCSS (Inverted Triangle)

Organizes CSS by specificity, from broad to narrow:
1. **Settings** — variables (`--color`, `--font`).
2. **Tools** — mixins, functions.
3. **Generic** — resets, `box-sizing`.
4. **Elements** — bare element selectors (`body`, `a`).
5. **Objects** — layout patterns (`.media`, `.container`).
6. **Components** — UI components (`.card`, `.nav`).
7. **Utilities** — single-purpose (`.text-center`, `.mt-4`).

Each layer is more specific and explicit than the one above. Import in order — later layers can override earlier. Maps well to cascade layers (`@layer`).

## Atomic / Utility-First CSS

Atomic CSS uses single-purpose utility classes (`.mt-4`, `.text-center`, `.flex`). Tailwind CSS is the popular implementation:

::code-wrapper{language="html"}
```html
<button class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
	Button
</button>
```

### Pros
- No naming — compose utilities directly in HTML.
- Small file size (with purging) — only used utilities ship.
- Consistent spacing/colors (design system enforced).
- No context switching (HTML to CSS).

### Cons
- HTML is verbose (long class lists).
- Learning the utility names.
- Hard to extract components without `@apply` or a component framework.

### When to use
- Projects with a design system and component framework (React/Vue) — utilities compose well in JSX.
- Teams that prefer in-HTML styling.
- Avoid for simple sites or if the verbose HTML bothers you.

## Cascade Layers for Architecture

Modern CSS `@layer` formalizes the ITCSS-like ordering:

::code-wrapper{language="css"}
```css
@layer reset, base, layout, components, utilities;

@layer reset { * { box-sizing: border-box; margin: 0; } }
@layer base { body { font-family: sans-serif; } }
@layer layout { .container { max-width: 1200px; margin: 0 auto; } }
@layer components { .card { ... } .btn { ... } }
@layer utilities { .text-center { text-align: center; } .mt-4 { margin-top: 1rem; } }
```

The layer order sets precedence — `utilities` beats `components` beats `layout`, regardless of specificity. This makes the architecture explicit and reliable.

## Choosing a Methodology

| Methodology | Best for |
|---|---|
| BEM | Most projects — clear, simple, no tooling |
| OOCSS | Reusable structure/skin separation |
| SMACSS | Categorization guidance |
| ITCSS | Large-scale, enterprise |
| Atomic/Tailwind | Component-heavy apps (React/Vue) |

For most projects, **BEM + a layer structure (ITCSS-style or `@layer`)** is a solid default. Use Tailwind if the team prefers utility-first.

## 💡 Tips & Tricks

- **Idiom**: use BEM (`.block`, `.block__element`, `.block--modifier`) for most projects — flat specificity (all 0,1,0), clear ownership, no specificity wars. The double underscore (element) and double hyphen (modifier) are instantly recognizable.
- **Idiom**: use `@layer` to formalize architecture — `@layer reset, base, layout, components, utilities;` makes the precedence explicit: utilities beat components regardless of specificity. This is the modern ITCSS, native and reliable.
- **Idiom**: separate structure from skin (OOCSS) — a `.media` layout class combined with a `.skin-card` visual class lets the same layout work with any skin, and the same skin apply to any layout. Compose, don't couple.
- **Idiom**: use state classes (`.is-active`, `.is-hidden`, `.is-loading`) for JS-driven state — a clear contract: JS toggles state classes, CSS styles them. Don't use visual classes (`active`, `hidden`) for state — reserve `.is-`/`.has-` for state.
- **Idiom**: use utility classes sparingly with BEM — a few utilities (`.mt-4`, `.text-center`) for one-off tweaks, but components in BEM. Pure utility-first (Tailwind) is a valid choice for component-heavy apps, but mixing BEM components with a few utilities is a pragmatic middle ground.

## ⚠️ Edge Cases & Gotchas

- **BEM element names shouldn't nest**: `.card__title__text` is wrong — it creates a chain. Use `.card__text` (flat) or split into a sub-block (`.card .text-block__text`).
- **BEM modifiers are used *with* the base**: `class="card card--featured"`, not `class="card--featured"` alone (the modifier only sets the differences).
- **Specificity still matters in BEM**: `.card .card__title` (0,2,0) beats `.card__title` (0,1,0). BEM's rule is *don't nest* — use `.card__title` alone, not `.card .card__title`.
- **`@layer` changes the cascade**: unlayered styles beat layered styles. If your utilities are in `@layer utilities` and your override is unlayered, the override wins. This is usually desired (overrides), but can surprise.
- **State classes (`is-active`) shouldn't have visual styles directly**: separate state from presentation — `.is-active` is a state, the component styles it (`.tab.is-active { ... }`). Don't make `.is-active { display: block; }` a global visual rule.
- **Atomic CSS file size without purging**: Tailwind generates thousands of utilities. Without purging unused ones (via `content` config), the CSS file is huge. Always configure purging.
- **Mixing methodologies is confusing**: pick one (BEM, or Tailwind, or OOCSS) and be consistent. Mixing BEM with Tailwind in the same project leads to inconsistency.
- **Deeply nested selectors are a smell**: `.card .body .title .text` — in BEM, this should be `.card__text` (flat). Nesting indicates you're not using the methodology correctly.
- **`@apply` in Tailwind**: `@apply mt-4;` in a CSS file mixes utility-first with traditional CSS. Use sparingly — it couples your CSS to Tailwind's specific utilities, reducing portability.
- **IE doesn't support `@layer`**: for legacy browser support, use ITCSS file ordering (import order sets precedence) instead of `@layer`. `@layer` is modern browsers only.

## 🧠 Spot the Bug

A developer uses BEM but finds their modifier doesn't apply:

::code-wrapper{language="html"}
```html
<button class="btn--disabled">Click</button>
```
:: 

::code-wrapper{language="css"}
```css
.btn { padding: 0.5rem 1rem; background: blue; color: white; }
.btn--disabled { background: gray; }
```
::

What's wrong?

<details>
<summary>Answer</summary>

The button only has `class="btn--disabled"` — it's missing the base `btn` class. In BEM, a modifier is used *with* the base: `class="btn btn--disabled"`. The modifier only sets the *differences* (here, `background: gray`); it doesn't include the base styles (padding, color, the original background).

With only `btn--disabled`, the button gets `background: gray` but no padding, no `color: white`, no base styling — it looks broken.

The fix — include both classes:

```html
<button class="btn btn--disabled">Click</button>
```

Now `.btn` provides the base (padding, blue background, white text), and `.btn--disabled` overrides the background to gray.

**The lesson**: BEM modifiers are always used with their base block/element. A modifier alone doesn't carry the base styles — it only sets the differences. Always include the base class: `class="btn btn--disabled"`.

</details>

## Summary

You know BEM (`.block`, `.block__element`, `.block--modifier`), OOCSS (structure/skin separation), SMACSS (base/layout/module/state/theme), ITCSS (inverted triangle by specificity), Atomic/Tailwind (utility-first), and how `@layer` formalizes architecture — with the modifier-needs-base trap avoided. Next: CSS performance.