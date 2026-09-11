---
title: "13 — Animations & Transitions: The Compositor Pipeline"
description: "Which properties animate on the GPU (transform/opacity) vs which trigger layout, cubic-bezier overshoot curves, the height:auto trap, grid-template-rows 0fr to 1fr, will-change memory cost, and prefers-reduced-motion. Code-first reference for 60fps animation."
---

# 13 — Animations & Transitions: The Compositor Pipeline

The render pipeline is: style → layout → paint → composite. Animating `transform` and `opacity` skips layout and paint — they're compositor-only (GPU). Animating `width`/`height`/`top`/`left` triggers layout *every frame* → janky. This is the single most important performance rule in CSS.

## Transitions — smooth property interpolation

::code-wrapper{language="css"}
```css
.button {
  background: blue;
  transition: background 0.3s ease, transform 0.2s ease;  /* list SPECIFIC properties */
}
.button:hover { background: darkblue; transform: scale(1.05); }
/* ⚠️ transition: all is a footgun — animates unexpected properties (background-image, etc.) */
```
::

## Timing Functions — `cubic-bezier` for overshoot

::code-wrapper{language="css"}
```css
:root {
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);  /* y>1 → overshoots target, settles (bounce) */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);         /* fast start, slow settle */
}
.modal { transition: transform 0.3s var(--ease-spring); }
/* steps(n, start|end): discrete steps — sprite animation, loading bars */
.sprite { transition: background-position 0.5s steps(8, end); }
```
::

## The Performance Rule — compositor-only properties

::code-wrapper{language="text"}
```text
Property          Cost              Animate?
transform         Compositor (GPU)  ✅ 60fps
opacity           Compositor (GPU)  ✅ 60fps
filter            Compositor (mostly) ✅
color/bg-color    Paint             ⚠️ OK
box-shadow        Paint             ⚠️ (use pseudo-element opacity instead)
width/height      Layout            ❌ expensive
top/left/margin   Layout            ❌ expensive
```
::

### Anti-pattern: animating height triggers layout

::code-wrapper{language="css"}
```css
/* ❌ height triggers layout every frame → janky. And height:auto can't interpolate (auto isn't a length). */
.menu { height: 0; overflow: hidden; transition: height 0.3s ease; }
.menu.open { height: 200px; }  /* fixed value — breaks if content changes */
```
::

::code-wrapper{language="css"}
```css
/* ✓ transform: scaleY (compositor-only, GPU, no layout). transform-origin: top anchors it. */
.menu { transform: scaleY(0); transform-origin: block-start; transition: transform 0.3s ease; }
.menu.open { transform: scaleY(1); }

/* ✓ grid-template-rows: 0fr → 1fr (animates to content height, interpolable, fits any content) */
.menu-wrap { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.3s ease; }
.menu-wrap.open { grid-template-rows: 1fr; }
.menu { overflow: hidden; }  /* clip the collapsing content */
/* Browser support: grid-template-rows 0fr↔1fr transition: Chrome 107+, Safari 16+, Firefox 66+. */
```
::

## `@keyframes` Animations

::code-wrapper{language="css"}
```css
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

.spinner { animation: spin 1s linear infinite; }
.pulse { animation: pulse 2s ease-in-out infinite; }

/* animation: name duration timing-function delay iteration-count direction fill-mode play-state */
/* animation-fill-mode: forwards → retains the END state after the animation (default: none → snaps back) */
/* negative animation-delay: -1s on a 2s animation starts it at the 1s mark (already halfway) → staggered */
```
::

## `will-change` — the GPU hint (use sparingly)

::code-wrapper{language="css"}
```css
.modal { will-change: transform, opacity; }  /* hint: promote to a GPU layer NOW */
.modal.closed { will-change: auto; }          /* remove after → frees GPU memory */
/* ⚠️ Each will-change element gets a GPU layer (RAM). * { will-change: transform; } = OOM on mobile. */
/* Add will-change just before the animation, remove after. Never leave it permanently. */
```
::

## `prefers-reduced-motion` — mandatory accessibility

::code-wrapper{language="css"}
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```
::

## 💡 Tips & Tricks

- **Idiom**: `cubic-bezier(0.34, 1.56, 0.64, 1)` for overshoot/bounce — the y-value >1 makes the animation go past the target and settle. Playful, spring-like.
- **Idiom**: `animation-fill-mode: forwards` (or `both`) to retain the end state — without it, the element snaps back to pre-animation state. `both` also applies the start state during the delay.
- **Idiom**: negative `animation-delay` for staggered animations that appear already in progress — `animation-delay: -1s` on a 2s animation starts it halfway through.
- **Idiom**: `steps(8)` for sprite-sheet animation — 8 discrete steps cycle through a sprite sheet, the classic CSS sprite technique.
- **Idiom**: animate `transform`/`opacity` (GPU), never `width`/`height`/`top`/`left` (layout). `transform: translateX()` for position, `scale()` for size.

## ⚠️ Edge Cases & Gotchas

- **`transition: all` is a footgun**: animates every property change, including non-interpolable ones (`background-image`). List specific properties.
- **`transition` doesn't work on `display`**: `display: none → block` can't transition. Use `opacity` + `visibility`, or a transform.
- **`height: auto` can't transition**: `auto` isn't a length → not interpolable. Use `transform: scaleY()` or `grid-template-rows: 0fr → 1fr`.
- **`animation-fill-mode: none` (default) snaps back**: after the animation, the element returns to its pre-animation state. Use `forwards` to keep the end state.
- **`will-change` on too many elements wastes memory**: each gets a GPU layer. Use only for elements about to animate, remove after.
- **`@keyframes` without `from`/`0%` uses the element's current state**: if you only specify `to { }`, the animation starts from the computed style. Useful for "animate to this state."
- **`transition` reverses from the current point**: if a property changes and changes back mid-transition, the transition reverses from the current (mid-animation) state, not the start.

## 🧠 Spot the Bug

::code-wrapper{language="css"}
```css
.menu { height: 0; overflow: hidden; transition: height 0.3s ease; }
.menu.open { height: 200px; }
```
::

<details>
<summary>Answer</summary>

Animating `height` triggers **layout** every frame — the browser recomputes the layout of `.menu` and all descendants. On mobile (slower CPUs), this drops frames → janky. Also, `height: 200px` is a fixed value — if the content changes, it breaks, and `height: auto` can't transition (auto isn't interpolable). Fix: `transform: scaleY(0)` → `scaleY(1)` (compositor-only, GPU, 60fps) or `grid-template-rows: 0fr → 1fr` (animates to content height, interpolable). The lesson: never animate `width`/`height`/`top`/`left` — use `transform` or `grid-template`.

</details>
