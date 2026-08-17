# 13 — Animations & Transitions

CSS animations and transitions create motion — state changes (transitions) and keyframe sequences (animations).

## Transitions

A transition smoothly interpolates a property change:

::code-wrapper{language="css"}
```css
.button {
	background: blue;
	transition: background 0.3s ease, transform 0.2s ease;
}
.button:hover {
	background: darkblue;
	transform: scale(1.05);
}
```
::
### `transition` shorthand

::code-wrapper{language="css"}
```css
transition: property duration timing-function delay;
transition: background 0.3s ease 0s;
transition: all 0.3s ease;          /* ⚠️ avoid: animates unexpected properties */
transition: background 0.3s, transform 0.2s;  /* multiple */
```
::
### Timing functions

- `ease` (default) — fast start, slow end.
- `linear` — constant speed.
- `ease-in` — slow start.
- `ease-out` — slow end.
- `ease-in-out` — slow start and end.
- `cubic-bezier(x1, y1, x2, y2)` — custom curve.
- `steps(n, start|end)` — stepped (n discrete steps).

::code-wrapper{language="css"}
```css
transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);  /* overshoot (bounce) */
transition: opacity 0.5s steps(5, end);  /* 5 discrete steps */
```
::
### What can be animated?

Not all properties transition smoothly. Properties that can be interpolated:
- `transform`, `opacity`, `color`, `background-color`, `border-color`, `box-shadow`, `text-shadow`, `clip-path`.
- `width`, `height`, `margin`, `padding`, `top`/`left`/`right`/`bottom` (but these cause layout — expensive).

**Avoid** animating `width`/`height`/`top`/`left` (trigger layout on every frame). **Prefer** `transform` (translate/scale) and `opacity` — they're compositor-only (GPU-accelerated, cheap).

::code-wrapper{language="css"}
```css
/* ❌ triggers layout */
.menu { transition: height 0.3s; }
.menu.open { height: 200px; }

/* ✓ compositor-only */
.menu { transition: transform 0.3s; transform: scaleY(0); transform-origin: top; }
.menu.open { transform: scaleY(1); }
```
::
## `@keyframes` Animations

::code-wrapper{language="css"}
```css
@keyframes spin {
	from { transform: rotate(0deg); }
	to { transform: rotate(360deg); }
}

@keyframes pulse {
	0%   { opacity: 1; }
	50%  { opacity: 0.5; }
	100% { opacity: 1; }
}

.spinner {
	animation: spin 1s linear infinite;
}
.pulse {
	animation: pulse 2s ease-in-out infinite;
}
```
::
### `animation` shorthand

::code-wrapper{language="css"}
```css
animation: name duration timing-function delay iteration-count direction fill-mode play-state;
animation: spin 1s linear infinite;
animation: pulse 2s ease-in-out 0s infinite alternate;
```
::
### Properties

- `animation-name` — the `@keyframes` name.
- `animation-duration` — `1s`, `500ms`.
- `animation-timing-function` — same as transitions.
- `animation-delay` — `0s`, `-1s` (negative = start mid-animation).
- `animation-iteration-count` — a number or `infinite`.
- `animation-direction` — `normal`, `reverse`, `alternate`, `alternate-reverse`.
- `animation-fill-mode` — `none`, `forwards`, `backwards`, `both`.
- `animation-play-state` — `running`, `paused`.

### `animation-fill-mode`

- `none` (default) — after the animation, the element returns to its pre-animation state.
- `forwards` — retains the styles from the last keyframe (after the animation ends).
- `backwards` — applies the styles from the first keyframe during the delay (before the animation starts).
- `both` — both `forwards` and `backwards`.

`forwards` is common — you want the element to stay at the end state after the animation.

## Performance: Which Properties to Animate

| Property | Cost | Animate? |
|---|---|---|
| `transform` | Compositor (GPU) | ✅ Yes |
| `opacity` | Compositor (GPU) | ✅ Yes |
| `filter` | Compositor (mostly) | ✅ Yes |
| `color`, `background-color` | Paint | ⚠️ OK |
| `box-shadow` | Paint | ⚠️ OK (or use pseudo-element) |
| `width`, `height` | Layout | ❌ Avoid |
| `top`, `left`, `margin` | Layout | ❌ Avoid |

Animate `transform` and `opacity` for 60fps. If you must animate layout properties, consider FLIP (First-Last-Invert-Play) technique with transforms.

## `will-change`

::code-wrapper{language="css"}
```css
.modal { will-change: transform, opacity; }   /* hint to the browser */
```
::
`will-change` hints that a property will animate, letting the browser optimize. Use sparingly — adding it to too many elements wastes memory. Add it just before the animation, remove it after.

## `prefers-reduced-motion`

::code-wrapper{language="css"}
```css
@media (prefers-reduced-motion: reduce) {
	* {
		animation-duration: 0.01ms !important;
		animation-iteration-count: 1 !important;
		transition-duration: 0.01ms !important;
	}
}
```
::
Respect the user's OS preference for reduced motion. Disable or shorten animations.

## 💡 Tips & Tricks

- **Idiom**: animate `transform` and `opacity` for 60fps — they're compositor-only (GPU), no layout/paint. Avoid `width`/`height`/`top`/`left` (trigger layout). Use `transform: scaleY()` instead of `height`, `transform: translateX()` instead of `left`.
- **Idiom**: use `cubic-bezier(0.34, 1.56, 0.64, 1)` for an overshoot/bounce — the y-value >1 causes the animation to go past the target and settle. This gives a playful, spring-like feel.
- **Idiom**: use `animation-fill-mode: forwards` (or `both`) to retain the end state — without it, the element snaps back to its pre-animation state after the animation ends. `both` also applies the start state during the delay.
- **Idiom**: use `prefers-reduced-motion` to disable animations for sensitive users — `@media (prefers-reduced-motion: reduce) { * { animation: none; transition: none; } }` respects the OS preference. Accessibility for vestibular disorders.
- **Idiom**: use `will-change` sparingly as a hint before animating — `will-change: transform` tells the browser to GPU-optimize. But don't leave it on permanently (wastes memory) or add it to many elements. Add it before the animation, remove after.

## ⚠️ Edge Cases & Gotchas

- **`transition: all` is a footgun**: it animates *every* property change, including unexpected ones (like `background-image` on hover, which doesn't transition smoothly). List specific properties.
- **`transition` doesn't work on `display`**: `display: none` → `block` can't transition (it's not interpolable). Use `opacity` + `visibility`, or animate a transform.
- **`transition` doesn't work on `height: auto`**: `height: 0` → `auto` can't interpolate (auto isn't a length). Use `max-height` (a large value), `transform: scaleY()`, or measure with JS and set a fixed height.
- **Animating `width`/`height` triggers layout**: every frame, the browser recomputes the layout of the element and its descendants — expensive, can drop frames. Use `transform: scale()` instead.
- **`animation-fill-mode: none` (default) snaps back**: after the animation, the element returns to its pre-animation state. Use `forwards` to keep the end state.
- **Negative `animation-delay` starts mid-animation**: `animation-delay: -1s` with a 2s animation starts it at the 1-second mark (already halfway). Useful for staggered animations that should appear already in progress.
- **`will-change` on too many elements wastes memory**: each `will-change` element gets a GPU layer. Use it only for elements about to animate, and remove it after.
- **`@keyframes` with no `from`/`0%` uses the element's current state**: if you only specify `to { ... }`, the animation starts from the element's computed style. Useful for "animate to this state" without duplicating the start.
- **`steps()` for sprite animation**: `steps(8)` with a sprite sheet background animates frame-by-frame — the classic CSS sprite animation technique.
- **`transition` only animates the next change**: if a property changes and then changes back before the transition completes, the transition reverses from the current (mid-transition) state. This is usually desired.

## 🧠 Spot the Bug

A developer makes a dropdown that expands on click, but the animation is janky (stuttering):

::code-wrapper{language="css"}
```css
.menu { height: 0; overflow: hidden; transition: height 0.3s ease; }
.menu.open { height: 200px; }
```
::

What's wrong and how to fix it?

<details>
<summary>Answer</summary>

Two issues:

1. **`height` triggers layout on every frame** — the browser recomputes the layout of `.menu` and its descendants each frame, which is expensive and can drop frames (janky).

2. **`height: 0` → `200px` works, but `height: auto` (content-based) doesn't transition** — if the developer later changes to `height: auto` (to fit content), the transition breaks (`auto` isn't interpolable).

The fix — use `transform: scaleY()` (compositor-only, GPU-accelerated, no layout):

```css
.menu {
	transform: scaleY(0);
	transform-origin: top;
	transition: transform 0.3s ease;
}
.menu.open { transform: scaleY(1); }
```
::
Or use `grid-template-rows: 0fr` → `1fr` (a modern trick that transitions and fits content):

```css
.menu-wrap {
	display: grid;
	grid-template-rows: 0fr;
	transition: grid-template-rows 0.3s ease;
}
.menu-wrap.open { grid-template-rows: 1fr; }
.menu { overflow: hidden; }
```
::
The `grid-template-rows: 0fr` → `1fr` trick animates the height to fit content, no fixed height needed, and `1fr` is interpolable (Chrome 107+, Safari 16+, Firefox 66+).

**The lesson**: avoid animating `height` (triggers layout, and `auto` isn't interpolable). Use `transform: scaleY()` (GPU) or `grid-template-rows: 0fr → 1fr` (animates to content height).

</details>

## Summary

You can now use transitions (`transition`, timing functions, `cubic-bezier`, `steps`), `@keyframes` animations (shorthand, `iteration-count`, `direction`, `fill-mode`, `play-state`), animate performant properties (`transform`/`opacity`, not `width`/`height`), use `will-change`, and respect `prefers-reduced-motion` — with the `height: auto` trap avoided via `scaleY()` or `grid-template-rows`. Next: filters, blend modes, and masking.