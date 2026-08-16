---
title: Learn CSS — From Zero to Pro
description: A comprehensive, edge-case-covering, idiomatic CSS curriculum. 22 chapters covering selectors, the cascade, box model, positioning, flexbox, grid, responsive design, animations, transitions, variables, and modern CSS features. Go from beginner to pro CSS developer.
---

# 🎨 Learn CSS — From Zero to Pro

A comprehensive, edge-case-covering, idiomatic CSS curriculum. Each document is self-contained and covers its concept deeply enough that a careful reader can go from beginner to pro CSS developer.

## How to Use This Course

1. **Read sequentially** for a structured path (01 → 22).
2. **Jump to a chapter** as a reference when you hit a concept in the wild.
3. **Practice in a browser** — DevTools is your REPL.
4. **Read the MDN docs** alongside each chapter.

## Prerequisites

- A modern browser (Chrome, Firefox, Safari, Edge).
- A code editor (VS Code recommended).
- Basic HTML knowledge.

## Curriculum

### Part I — Foundations

| # | Topic | Why It Matters |
|---|---|---|
| 01 | [Introduction & Setup](/css/01-introduction-and-setup) | History, adding CSS to HTML, DevTools, box model preview. |
| 02 | [Selectors & Specificity](/css/02-selectors-and-specificity) | Element/class/id, combinators, specificity, the cascade. |
| 03 | [The Box Model](/css/03-box-model) | content/padding/border/margin, box-sizing, margins collapse. |
| 04 | [Colors & Units](/css/04-colors-and-units) | RGB/HSL/LCH, px/em/rem/vw/vh, %, calc(). |
| 05 | [Typography & Text](/css/05-typography-and-text) | font-family, size, weight, line-height, text-align, letter-spacing. |

### Part II — Layout

| # | Topic | Why It Matters |
|---|---|---|
| 06 | [Display & Positioning](/css/06-display-and-positioning) | block/inline/flex/grid, static/relative/absolute/fixed/sticky. |
| 07 | [Flexbox](/css/07-flexbox) | One-dimensional layout, alignment, wrapping, flex-grow/shrink. |
| 08 | [CSS Grid](/css/08-css-grid) | Two-dimensional layout, tracks, areas, alignment, subgrid. |
| 09 | [Responsive Design & Media Queries](/css/09-responsive-design) | Viewport, breakpoints, mobile-first, container queries. |
| 10 | [Floats & Positioning Deep Dive](/css/10-floats-and-positioning) | Floats (legacy), z-index, stacking contexts, clipping. |

### Part III — Visual Design

| # | Topic | Why It Matters |
|---|---|---|
| 11 | [Backgrounds & Gradients](/css/11-backgrounds-and-gradients) | background-image, gradients, background-size/position/clip. |
| 12 | [Borders, Shadows & Outlines](/css/12-borders-shadows-and-outlines) | border, border-radius, box-shadow, outline, :focus-visible. |
| 13 | [Animations & Transitions](/css/13-animations-and-transitions) | transition, @keyframes, animation, easing, will-change. |
| 14 | [Filters, Blend Modes & Masking](/css/14-filters-blend-modes-and-masking) | filter, backdrop-filter, mix-blend-mode, mask, clip-path. |

### Part IV — Modern CSS

| # | Topic | Why It Matters |
|---|---|---|
| 15 | [CSS Variables (Custom Properties)](/css/15-css-variables) | --var, var(), cascading, theming, runtime values. |
| 16 | [Logical Properties & Writing Modes](/css/16-logical-properties-and-writing-modes) | inline/block, start/end, RTL, vertical writing, i18n. |
| 17 | [Modern CSS Features (2023+)](/css/17-modern-css-features) | nesting, :has(), @layer, container style queries, color-mix. |
| 18 | [Architecture & Methodology](/css/18-architecture-and-methodology) | BEM, OOCSS, SMACSS, ITCSS, Atomic/Tailwind, @layer. |

### Part V — Production Engineering

| # | Topic | Why It Matters |
|---|---|---|
| 19 | [CSS Performance](/css/19-performance) | Critical CSS, repaints, containment, will-change, content-visibility. |
| 20 | [Browser Compatibility & Prefixes](/css/20-browser-compatibility) | Vendor prefixes, @supports, progressive enhancement, caniuse. |
| 21 | [Preprocessors & Build Tools](/css/21-preprocessors-and-build-tools) | Sass, PostCSS, Vite, webpack, CSS Modules, Tailwind. |
| 22 | [Exercises & Projects](/css/22-exercises-and-projects) | 7 projects from reset to a full capstone landing page. |

## Learning Path Suggestions

### If you're new to web development

1. Read 01–05 in order (foundations).
2. Build simple layouts with Flexbox (07) and Grid (08).
3. Make them responsive (09).
4. Do exercises 1–5 in chapter 22.

### If you're coming from a design background

Read 02 (selectors), 03 (box model), 07–08 (Flexbox/Grid — the modern layout tools), 13–14 (animations/transforms). Skip the units/colors chapter (you know them).

### If you're a developer who "knows some CSS"

Read 07–08 (Flexbox/Grid — you may be using floats or outdated patterns), 15 (variables), 16 (calc/clamp — modern responsive), 18 (`:has()`, `aspect-ratio`, container queries — recent additions), 20 (performance).

### If you're a senior frontend engineer

Skim 01–10. Read 09 (container queries), 13–14 (animations/transforms), 15–16 (variables/functions), 18 (`:has()`, subgrid, scroll-snap), 19 (progressive enhancement), 20 (containment, `will-change`), 21 (pitfalls) closely.

## Companion Resources

- [MDN CSS Docs](https://developer.mozilla.org/en-US/docs/Web/CSS) — the definitive reference.
- [CSS Tricks](https://css-tricks.com) — practical guides and almanac.
- [Can I Use](https://caniuse.com) — browser compatibility tables.
- [web.dev](https://web.dev/learn/css) — Google's CSS learning material.
- [Josh W. Comeau's CSS Tutorials](https://www.joshwcomeau.com/css/) — intuitive explanations.
- [CSS Gradient Generator](https://cssgradient.io) — visual gradient tool.

## Tooling

::code-wrapper{language="bash"}
```bash
# VS Code with the following extensions:
# - "Live Server" (ritwickdey.LiveServer) — hot reload on save
# - "CSS Peek" (pranaygp.vscode-css-peek) — jump to definition
# - "Tailwind CSS IntelliSense" (bradlc.vscode-tailwindcss) — if using Tailwind

# Browser DevTools (built-in):
# - Chrome: Cmd+Opt+I → Elements tab
# - Firefox: Cmd+Opt+I → Inspector tab
# - Safari: Cmd+Opt+I (enable Develop menu first)
```
::

## License

These notes are yours to use, share, and modify.

🎨