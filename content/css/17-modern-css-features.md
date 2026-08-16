# 17 — Modern CSS Features (2023+)

Modern CSS (2023+) added features that replace JavaScript and preprocessor workarounds — nesting, `:has()`, cascade layers, container style queries, and more.

## Native Nesting

::code-wrapper{language="css"}
```css
.card {
	padding: 1rem;

	& .title { font-size: 1.5rem; }
	& p { line-height: 1.6; }

	&:hover { background: #f0f0f0; }

	@media (min-width: 768px) {
		& { padding: 2rem; }
	}
}
```

Native nesting (like Sass) — `&` refers to the parent selector. Browser support: 2023 in all major browsers.

### Rules

- `&` is the parent selector. Without `&`, the nested selector is a descendant (`.title` = `& .title`).
- Use `&` for compound selectors: `&:hover`, `&.active`, `& + .sibling`.
- Nesting `@media` inside a rule is allowed.
- Specificity: `& .title` has the specificity of `.card .title`.

::code-wrapper{language="css"}
```css
.card {
	&.active { ... }     /* .card.active */
	& > .title { ... }   /* .card > .title */
	&:not(.open) { ... } /* .card:not(.open) */
}
```

## `:has()` (the "parent selector")

`:has()` selects an element based on its *descendants* — the long-requested "parent selector":

::code-wrapper{language="css"}
```css
/* Style a card differently if it has an image */
.card:has(img) { padding-top: 0; }

/* A form section with an error */
.form-section:has(.error) { border-color: red; }

/* A list item that has a nested list (a parent) */
li:has(ul) { font-weight: bold; }

/* A card that *doesn't* have an image */
.card:not(:has(img)) { padding: 2rem; }

/* A paragraph directly followed by a heading (no margin) */
h2:has(+ p) { margin-bottom: 0; }
```

`:has()` is a relational pseudo-class — it checks if the element has matching descendants/siblings. Powerful for state-based styling without JS classes.

### `:has()` specificity

`:has()` adds its argument's specificity, not `:has()`'s. `.card:has(.error)` has the specificity of `.card` + `.error` (0,2,0).

## Cascade Layers (`@layer`)

`@layer` creates explicit layers, controlling which styles win regardless of specificity:

::code-wrapper{language="css"}
```css
@layer reset, base, components, utilities;

@layer reset {
	* { margin: 0; padding: 0; box-sizing: border-box; }
}

@layer base {
	body { font-size: 16px; line-height: 1.6; }
}

@layer components {
	.btn { padding: 0.5rem 1rem; }
}

@layer utilities {
	.text-center { text-align: center; }
}
```

The layer order (declared first) sets priority — later layers win. `utilities` (last) beats `components` beats `base` beats `reset`, *regardless of specificity*. A `.text-center` utility (0,1,0) beats a `.btn .text-center` component (0,2,0) because `utilities` is a later layer.

### Unlayered styles

Unlayered styles (outside any `@layer`) win over layered styles. This lets you add overrides without a layer:

::code-wrapper{language="css"}
```css
@layer base, components;
@layer base { p { color: black; } }
@layer components { .card p { color: #333; } }
p { color: darkgray; }  /* unlayered, wins over both layers */
```

### When to use layers

- Large codebases with multiple sources (framework, components, utilities).
- When you want utilities to always beat components (Tailwind-style).
- To manage third-party CSS (put it in an early layer, your code in a later layer).

## Container Style Queries (2023+)

::code-wrapper{language="css"}
```css
@container style(--theme: dark) {
	.card { background: #222; color: #eee; }
}
```

Style queries check a container's *custom properties* (not just size). A card can adapt its style based on its container's `--theme` variable — without the card itself reading the variable.

Support: Chrome 111+, Safari 17.4+. Still newer than size queries — check support.

## `accent-color`

::code-wrapper{language="css"}
```css
input[type="checkbox"], input[type="radio"] {
	accent-color: #3498db;   /* colors the native control */
}
```

A simple way to theme native form controls (checkboxes, radios, range sliders, progress bars) without custom widgets.

## `color-mix()`

::code-wrapper{language="css"}
```css
--button-bg: color-mix(in srgb, var(--primary) 80%, white);
--hover-bg: color-mix(in srgb, var(--primary) 60%, black);
```

`color-mix()` mixes two colors — useful for deriving shades/tints from a base color. No preprocessor needed.

## `text-wrap: balance` / `pretty`

::code-wrapper{language="css"}
```css
h1, h2 { text-wrap: balance; }   /* balance line lengths */
p { text-wrap: pretty; }         /* avoid orphans (single word on last line) }
```

- `balance` — evens out line lengths (for headings).
- `pretty` — avoids a single word on the last line (for paragraphs).

No `max-width` tuning needed — the browser optimizes the wrapping.

## `aspect-ratio` (recap)

::code-wrapper{language="css"}
```css
.img { aspect-ratio: 16/9; width: 100%; object-fit: cover; }
```

## Scroll-Driven Animations (2023+)

::code-wrapper{language="css"}
```css
@keyframes progress {
	from { transform: scaleX(0); }
	to { transform: scaleX(1); }
}
.progress-bar {
	animation: progress linear;
	animation-timeline: scroll(root block);
}
```

`animation-timeline: scroll(...)` drives an animation by scroll position — a progress bar that fills as you scroll, parallax, scroll-reveal — all without JS. Support: Chrome 115+, Safari 17.4+ (partial).

## View Transitions API

::code-wrapper{language="css"}
```css
::view-transition-old(root),
::view-transition-new(root) {
	animation-duration: 0.3s;
}
```

::code-wrapper{language="javascript"}
```javascript
document.startViewTransition(() => { /* DOM update */ });
```

View transitions smoothly animate between two DOM states — cross-fade, or named transitions for shared elements. Support: Chrome 111+, Safari 17.4+ (partial). For SPAs, this replaces many animation libraries.

## 💡 Tips & Tricks

- **Idiom**: use `:has()` for state-based styling without JS — `.card:has(.error) { border-color: red; }` styles a card based on its contents, no JS class toggling. The "parent selector" finally exists; use it for forms, lists, conditional layouts.
- **Idiom**: use cascade layers (`@layer`) to control precedence in large codebases — declare the layer order upfront (`@layer reset, base, components, utilities`), then later layers win regardless of specificity. This makes utilities reliably beat components, and manages third-party CSS.
- **Idiom**: use native nesting (`&`) for component-scoped styles — `.card { & .title { ... } &:hover { ... } }` is Sass-like nesting, native in 2023+. Reduces repetition and keeps related styles together. Use `&` for compound selectors (`&:hover`, `&.active`).
- **Idiom**: use `color-mix()` to derive shades/tints from a base color — `color-mix(in srgb, var(--primary) 80%, white)` gives a lighter shade, no preprocessor. Useful for hover/active states from a single token.
- **Idiom**: use `text-wrap: balance` for headings and `pretty` for paragraphs — `balance` evens heading line lengths (no manual `<br>`), `pretty` avoids a single word on the last paragraph line. Free typography polish, no JS.

## ⚠️ Edge Cases & Gotchas

- **`:has()` is not a performance problem anymore**: early concerns about `:has()` performance have been addressed in modern browsers. But very deep `:has()` (checking many descendants) can still be slower than a simple class — use judiciously.
- **`:has()` can't be nested inside itself in all engines**: `:has(:has(...))` has limited support. Avoid deep nesting.
- **Cascade layer order is set by the *first* declaration**: `@layer reset, base;` sets the order. Later `@layer base { ... }` adds to the existing `base` layer, in its position. If you `@layer` without a prior order declaration, the order is by first appearance.
- **Unlayered styles beat layered styles**: a rule outside any `@layer` wins over all layered rules (regardless of specificity). This is why you might put utilities in a layer (to be beatable by unlayered overrides) or keep your custom CSS unlayered.
- **Nesting `&` specificity**: `& .title` = `.card .title` (0,2,0). `&.active` = `.card.active` (0,2,0). The `&` is substituted, so the specificity is the combined selector's.
- **Nesting without `&` is a descendant**: `.title` inside `.card` (no `&`) = `.card .title`. Use `&` for compound (`&:hover`, `&.active`) and when you need the parent at a non-start position (`& + .sibling`).
- **Container style queries check *custom properties***: `@container style(--theme: dark)` checks the container's `--theme` variable. You can't query standard properties (like `color`) in a style query — only custom properties.
- **`text-wrap: balance` on long text**: it's for short text (headings). On long paragraphs, `balance` can look worse (uneven). Use `pretty` for paragraphs.
- **View transitions need a DOM update**: `document.startViewTransition(() => { /* update DOM */ })` — the callback updates the DOM, and the API animates between the old and new states. The old state is captured before the callback.
- **Scroll-driven animations are newer**: `animation-timeline: scroll()` is Chrome 115+/Safari 17.4+. Provide a JS fallback for older browsers (or accept no animation).

## 🧠 Spot the Bug

A developer uses `:has()` to style a form section with an error, but it's not working:

::code-wrapper{language="css"}
```css
.form-section:has(.error) {
	border-color: red;
}
.form-section {
	border: 2px solid #ccc;
}
```
::

What's wrong?

<details>
<summary>Answer</summary>

Specificity and source order. `.form-section:has(.error)` has specificity (0,2,0) — `.form-section` (0,1,0) + `.error` (0,1,0) inside `:has()`. `.form-section` alone is (0,1,0). So the `:has()` rule has *higher* specificity and should win...

The actual bug is **source order**: `.form-section:has(.error)` comes *before* `.form-section`. Both set `border-color` (well, the second sets `border`, which is a shorthand that includes `border-color`). `.form-section { border: 2px solid #ccc; }` sets `border-color: #ccc` (via the shorthand). Since `.form-section:has(.error)` is (0,2,0) and `.form-section` is (0,1,0), the `:has()` rule wins — so `border-color: red` should apply...

Hmm, actually the `:has()` rule *should* work. Let me reconsider. The issue might be that `.error` is not a *direct* child but a deeper descendant — `:has()` checks all descendants, so that's fine.

The real bug: **the second rule `.form-section { border: 2px solid #ccc; }` comes *after* the `:has()` rule, and the `border` shorthand *resets* `border-color`**. Even though `.form-section:has(.error)` has higher specificity (0,2,0 > 0,1,0), the shorthand `border` in the second rule sets `border-color: #ccc` with specificity (0,1,0). Specificity wins over source order, so the `:has()` rule (0,2,0) should still win...

Actually, the `:has()` rule *does* win by specificity. So if it's "not working," the likely cause is **`:has()` browser support** (older browsers) or **the `.error` element isn't a descendant of `.form-section`** (maybe a sibling or in a different container).

The most pragmatic fix — ensure source order and specificity are clear:

```css
.form-section { border: 2px solid #ccc; }  /* base, first */
.form-section:has(.error) { border-color: red; }  /* override, after */
```

And verify in a `:has()`-supporting browser (Chrome 105+, Safari 15.4+, Firefox 121+) that `.error` is a descendant.

**The lesson**: when `:has()` "doesn't work," check (1) browser support, (2) that the matched element is actually a descendant, (3) source order — put the `:has()` rule *after* the base rule. Specificity (0,2,0 > 0,1,0) should win, but source order is a clearer intent.

</details>

## Summary

You can now use native nesting (`&`), `:has()` (the parent selector), cascade layers (`@layer`), container style queries (`@container style(--var: ...)`), `accent-color`, `color-mix()`, `text-wrap: balance`/`pretty`, scroll-driven animations, and view transitions — the modern CSS features that replace JS and preprocessor workarounds. Next: architecture and methodology.