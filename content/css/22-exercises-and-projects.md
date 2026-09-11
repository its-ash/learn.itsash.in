---
title: "22 — Exercises & Projects: Production CSS Systems"
description: "Seven production-grade projects: a layered reset + token system, responsive navbar with CSS-only mobile menu, grid dashboard, glassmorphism card, no-JS tooltip system, animated loaders, and a capstone landing page. Code-first reference applying chapters 1-21."
---

# 22 — Exercises & Projects: Production CSS Systems

Seven projects progressing from a reusable reset to a full capstone landing page. Each applies the code-first patterns from chapters 1–21: `@layer` architecture, BEM, fluid CSS, container queries, logical properties, `:focus-visible`, `prefers-reduced-motion`, and `transform`/`opacity` animations.

## Project 1 — Layered Reset + Token System

A reusable `@layer` reset + token + base system. Drop into any project.

::code-wrapper{language="css"}
```css
@layer reset, tokens, base, components, utilities;

@layer reset {
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  img, picture, video, canvas, svg { display: block; max-inline-size: 100%; }  /* responsive media */
  input, button, textarea, select { font: inherit; }  /* form elements inherit font */
  p, h1, h2, h3, h4, h5, h6 { overflow-wrap: break-word; }  /* prevent overflow from long words */
}

@layer tokens {
  :root {
    --c-bg: #fff; --c-fg: #333; --c-primary: oklch(0.62 0.18 245);
    --font-sans: system-ui, -apple-system, sans-serif;
    --space-1: .25rem; --space-2: .5rem; --space-3: 1rem; --space-4: 2rem;
    --radius: 8px;
  }
  @media (prefers-color-scheme: dark) { :root { --c-bg: #1a1a1a; --c-fg: #eee; --c-primary: oklch(0.7 0.16 245); } }
  [data-theme="dark"] { --c-bg: #1a1a1a; --c-fg: #eee; }  /* manual toggle */
}

@layer base {
  body {
    font-family: var(--font-sans);
    font-size: clamp(1rem, 0.9rem + 0.5vw, 1.125rem);  /* fluid, bounded */
    line-height: 1.5;  /* unitless — scales per-element */
    background: var(--c-bg); color: var(--c-fg);
  }
  h1 { font-size: clamp(2rem, 1.5rem + 2vw, 3rem); line-height: 1.2; }
  h2 { font-size: clamp(1.5rem, 1.2rem + 1.5vw, 2rem); line-height: 1.3; }
  a { color: var(--c-primary); }
  :focus-visible { outline: 2px solid var(--c-primary); outline-offset: 2px; }  /* keyboard-only focus */
}

@layer utilities {
  .u-stack > * + * { margin-block-start: var(--space-3); }  /* lobotomized owl */
}
```
::

## Project 2 — Responsive Navbar with CSS-Only Mobile Menu

::code-wrapper{language="html"}
```html
<nav class="nav">
  <div class="nav__logo">MySite</div>
  <input type="checkbox" id="nav-toggle" class="nav__toggle" hidden>
  <label for="nav-toggle" class="nav__hamburger" aria-label="Toggle menu"><span></span><span></span><span></span></label>
  <ul class="nav__menu">
    <li><a class="nav__link" href="#">Home</a></li>
    <li><a class="nav__link" href="#">About</a></li>
    <li><a class="nav__link" href="#">Contact</a></li>
  </ul>
</nav>
```
::

::code-wrapper{language="css"}
```css
.nav { display: flex; align-items: center; justify-content: space-between; padding: 1rem 2rem; }
.nav__menu { display: flex; gap: 2rem; list-style: none; }
.nav__link { text-decoration: none; color: var(--c-fg); position: relative; }
.nav__link::after {
  content: ""; position: absolute; inset-block-end: 0; inset-inline: 0; block-size: 2px;
  background: var(--c-primary); transform: scaleX(0); transform-origin: inline-start;
  transition: transform 0.3s ease;  /* GPU-friendly: transform, not width */
}
.nav__link:hover::after { transform: scaleX(1); }

@media (max-width: 768px) {
  .nav__hamburger { display: flex; flex-direction: column; gap: 5px; cursor: pointer; }
  .nav__hamburger span { inline-size: 25px; block-size: 3px; background: var(--c-fg); }
  .nav__menu {
    position: absolute; inset-block-start: 100%; inset-inline: 0; flex-direction: column; gap: 0;
    background: var(--c-bg); padding: 1rem 2rem;
    transform: scaleY(0); transform-origin: block-start;  /* GPU animation, not height */
    transition: transform 0.3s ease;
  }
  .nav__toggle:checked ~ .nav__menu { transform: scaleY(1); }  /* CSS-only toggle via :checked ~ */
}
```
::

## Project 3 — Grid Dashboard

::code-wrapper{language="css"}
```css
.dashboard {
  display: grid;
  grid-template-areas: "header header" "sidebar main" "footer footer";
  grid-template-columns: 250px 1fr;
  grid-template-rows: auto 1fr auto;
  min-block-size: 100dvh;
}
@media (max-width: 768px) {
  .dashboard { grid-template-columns: 1fr; grid-template-areas: "header" "main" "footer"; }
  .sidebar { display: none; }
}
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; }
.card { background: var(--c-bg); border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden; }
.card__header {
  padding: 1rem; color: white;
  background: linear-gradient(135deg, var(--c-primary), color-mix(in oklch, var(--c-primary) 70%, purple));
}
```
::

## Project 4 — Glassmorphism Login Card

::code-wrapper{language="css"}
```css
body { min-block-size: 100dvh; display: grid; place-items: center; background: linear-gradient(135deg, #667eea, #764ba2); }
.login {
  background: rgba(255, 255, 255, 0.2);  /* translucent so blur shows through */
  -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px);  /* Safari + standard */
  border: 1px solid rgba(255, 255, 255, 0.3); border-radius: 16px; padding: 2.5rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  inline-size: min(400px, 90vw); color: white;
  animation: fadeUp 0.6s ease both;  /* both = forwards + backwards (start + end state) */
}
.login__input {
  inline-size: 100%; padding: 0.75rem 1rem; margin-block-end: 1rem;
  background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px; color: white;
  transition: border-color 0.3s, box-shadow 0.3s;
}
.login__input:focus-visible { outline: none; border-color: rgba(255,255,255,0.6); box-shadow: 0 0 0 3px rgba(255,255,255,0.2); }
@keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .login { animation: none; } }  /* a11y */
```
::

## Project 5 — No-JS Tooltip System

::code-wrapper{language="css"}
```css
.tooltip { position: relative; display: inline-block; }
.tooltip__content {
  position: absolute; inset-block-end: 100%; inset-inline-start: 50%;
  transform: translateX(-50%) translateY(8px) scale(0.9);  /* start: offset + small */
  background: #333; color: white; padding: 0.5rem 0.75rem; border-radius: 6px;
  font-size: 0.875rem; white-space: nowrap; opacity: 0; visibility: hidden;
  transition: opacity 0.2s, transform 0.2s; pointer-events: none; margin-block-end: 8px;
}
.tooltip__content::after {  /* arrow via border trick */
  content: ""; position: absolute; inset-block-start: 100%; inset-inline-start: 50%;
  transform: translateX(-50%); border: 6px solid transparent; border-block-start-color: #333;
}
.tooltip:hover .tooltip__content { opacity: 1; visibility: visible; transform: translateX(-50%) translateY(0) scale(1); }
```
::

## Project 6 — Animated Loaders

::code-wrapper{language="css"}
```css
.loader-spin { inline-size: 40px; block-size: 40px; border: 4px solid #eee; border-block-start-color: var(--c-primary); border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.loader-dots { display: flex; gap: 0.5rem; }
.loader-dots span { inline-size: 12px; block-size: 12px; background: var(--c-primary); border-radius: 50%; animation: pulse 1.4s ease-in-out infinite both; }
.loader-dots span:nth-child(2) { animation-delay: 0.2s; }  /* staggered via negative delay */
.loader-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes pulse { 0%, 80%, 100% { transform: scale(0); opacity: 0.5; } 40% { transform: scale(1); opacity: 1; } }

@media (prefers-reduced-motion: reduce) { .loader-spin, .loader-dots span { animation: none; } }
```
::

## Project 7 — Capstone Landing Page

Combines all skills. Requirements: reset + base (Project 1) with `@layer`; hero (full viewport, gradient, animated entrance, CTA buttons with hover); features grid (`auto-fit` + `minmax`, `drop-shadow` for icon shadows, hover lift via `transform`); pricing table (3 tiers, featured elevated via `box-shadow` + `scale`); testimonials (scroll-snap carousel, CSS-only); footer (multi-column grid, collapses on mobile); navbar (Project 2); theming (`data-theme` + `prefers-color-scheme`, CSS variables, `color-mix()`); accessibility (`:focus-visible`, `prefers-reduced-motion`, semantic HTML, contrast); performance (`content-visibility: auto`, `font-display: swap`, `transform`/`opacity` only); i18n (logical properties throughout); architecture (BEM, `@layer`).

**Bonus**: container queries for component responsiveness; `:has()` for state-based styling (a pricing card with a "popular" badge); scroll-driven animation for a progress bar; view transition for theme toggle.

## Production Checklist

::code-wrapper{language="markdown"}
```markdown
- [ ] @layer architecture (reset, tokens, base, components, utilities)
- [ ] CSS variables for all design tokens (OKLCH colors)
- [ ] BEM naming (flat specificity, no nesting)
- [ ] Flexbox for 1D, Grid for 2D
- [ ] Responsive: auto-fit/minmax, clamp(), mobile-first media queries
- [ ] Container queries for component contexts
- [ ] Logical properties (i18n-ready, RTL)
- [ ] :focus-visible for keyboard focus
- [ ] prefers-reduced-motion respected
- [ ] prefers-color-scheme + data-theme for dark mode
- [ ] Animations use transform/opacity (not width/height)
- [ ] content-visibility: auto for long pages
- [ ] font-display: swap for web fonts
- [ ] Vendor prefixes via Autoprefixer
- [ ] @supports for progressive enhancement
- [ ] Semantic HTML, sufficient contrast
```
::

## Summary

You've applied the full CSS toolkit — from a layered reset and navbar to a grid dashboard, glassmorphism card, tooltips, loaders, and a capstone landing page. You can structure (`@layer`, BEM), layout (flex/grid, responsive, container queries), theme (variables, dark mode, OKLCH), animate (transform/opacity), optimize (`content-visibility`, fonts), and ensure accessibility and i18n. This is a production-quality CSS foundation.
