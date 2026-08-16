# 22 — Exercises & Projects

Apply everything from chapters 1–21 in real-world projects. These exercises progress from focused drills to a full capstone.

## Project 1 — CSS Reset + Base Stylesheet

Create a reusable reset + base stylesheet (chapter 1, 18).

**Requirements**:
- Modern reset (margin/padding 0, `box-sizing: border-box`, `line-height`, media `max-width: 100%`).
- Base typography (`h1`–`h6` sizes via `clamp()`, `body` font, `line-height`).
- Logical properties for padding/margin (RTL-ready).
- CSS variables for spacing/color tokens.
- `:focus-visible` styles.

::code-wrapper{language="css"}
```css
@layer reset, base, components, utilities;

@layer reset {
	*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
	img, picture, video, canvas, svg { display: block; max-inline-size: 100%; }
	input, button, textarea, select { font: inherit; }
	p, h1, h2, h3, h4, h5, h6 { overflow-wrap: break-word; }
	:root { --space: 1rem; line-height: 1.6; }
}

@layer base {
	:root {
		--color-bg: #fff;
		--color-text: #333;
		--color-primary: #3498db;
		--font-sans: system-ui, -apple-system, sans-serif;
	}
	body {
		background: var(--color-bg);
		color: var(--color-text);
		font-family: var(--font-sans);
		font-size: clamp(1rem, 0.9rem + 0.5vw, 1.125rem);
	}
	h1 { font-size: clamp(2rem, 1.5rem + 2vw, 3rem); line-height: 1.2; }
	h2 { font-size: clamp(1.5rem, 1.2rem + 1.5vw, 2rem); line-height: 1.3; }
	a { color: var(--color-primary); }
	:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}
}
```

**Goal**: a `reset.css` + `base.css` you can drop into any project.

## Project 2 — Responsive Navbar

Build a responsive navbar (chapters 2, 7, 9, 13).

**Requirements**:
- Desktop: horizontal flex row, logo left, links right.
- Mobile (< 768px): hamburger toggles a vertical menu (use a checkbox hack or `:has()`).
- Hover underline animation (transform scaleX, 0.3s).
- Smooth menu expand/collapse (animate transform, not height).
- `:focus-visible` for keyboard nav.

::code-wrapper{language="html"}
```html
<nav class="nav">
	<div class="nav__logo">MySite</div>
	<input type="checkbox" id="nav-toggle" class="nav__toggle" hidden>
	<label for="nav-toggle" class="nav__hamburger" aria-label="Toggle menu">
		<span></span><span></span><span></span>
	</label>
	<ul class="nav__menu">
		<li><a class="nav__link" href="#">Home</a></li>
		<li><a class="nav__link" href="#">About</a></li>
		<li><a class="nav__link" href="#">Contact</a></li>
	</ul>
</nav>
```

::code-wrapper{language="css"}
```css
.nav {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 1rem 2rem;
	background: var(--color-bg);
	border-block-end: 1px solid #eee;
}
.nav__logo { font-weight: bold; font-size: 1.25rem; }
.nav__hamburger { display: none; cursor: pointer; }
.nav__menu {
	display: flex;
	gap: 2rem;
	list-style: none;
}
.nav__link {
	text-decoration: none;
	color: var(--color-text);
	position: relative;
	padding-block-end: 0.25rem;
}
.nav__link::after {
	content: "";
	position: absolute;
	inset-block-end: 0;
	inset-inline: 0;
	block-size: 2px;
	background: var(--color-primary);
	transform: scaleX(0);
	transform-origin: inline-start;
	transition: transform 0.3s ease;
}
.nav__link:hover::after { transform: scaleX(1); }

@media (max-width: 768px) {
	.nav__hamburger { display: flex; flex-direction: column; gap: 5px; }
	.nav__hamburger span { inline-size: 25px; block-size: 3px; background: var(--color-text); }
	.nav__menu {
		position: absolute;
		inset-block-start: 100%;
		inset-inline: 0;
		flex-direction: column;
		gap: 0;
		background: var(--color-bg);
		padding: 1rem 2rem;
		transform: scaleY(0);
		transform-origin: block-start;
		transition: transform 0.3s ease;
	}
	.nav__toggle:checked ~ .nav__menu { transform: scaleY(1); }
}
```

**Goal**: a navbar that's responsive with a CSS-only mobile menu and animated underlines.

## Project 3 — CSS Grid Dashboard

Build a dashboard layout (chapters 8, 9, 11).

**Requirements**:
- Holy Grail layout (header, sidebar, main, footer) with grid-template-areas.
- Sidebar collapses below 768px (grid-template-columns changes).
- Main area: a responsive card grid (`auto-fit` + `minmax`).
- Stat cards with gradient headers, box-shadow elevation.
- Dark mode via `data-theme` + CSS variables.

::code-wrapper{language="css"}
```css
.dashboard {
	display: grid;
	grid-template-areas:
		"header header"
		"sidebar main"
		"footer footer";
	grid-template-columns: 250px 1fr;
	grid-template-rows: auto 1fr auto;
	min-block-size: 100vh;
}
@media (max-width: 768px) {
	.dashboard { grid-template-columns: 1fr; grid-template-areas: "header" "main" "footer"; }
	.sidebar { display: none; }
}
.dashboard__header { grid-area: header; }
.sidebar { grid-area: sidebar; }
.main { grid-area: main; padding: 2rem; }
.dashboard__footer { grid-area: footer; }

.cards {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
	gap: 1.5rem;
}
.card {
	background: var(--color-card);
	border-radius: 12px;
	box-shadow: 0 4px 6px rgba(0,0,0,0.1);
	overflow: hidden;
}
.card__header {
	padding: 1rem;
	background: linear-gradient(135deg, var(--color-primary), color-mix(in srgb, var(--color-primary) 70%, purple));
	color: white;
}
.card__body { padding: 1rem; }
```

**Goal**: a grid dashboard with responsive areas, auto-fit cards, and theming.

## Project 4 — Glassmorphism Login Card

Build a glassmorphism login card (chapters 11, 14, 15).

**Requirements**:
- `backdrop-filter: blur()` + translucent background (include `-webkit-`).
- Gradient background behind the card (visible through the blur).
- Smooth focus transitions on inputs (`:focus-visible` border + box-shadow).
- Animated entrance (fade + translateY, `prefers-reduced-motion` respected).
- Theme via CSS variables.

::code-wrapper{language="css"}
```css
body {
	min-block-size: 100vh;
	display: grid;
	place-items: center;
	background: linear-gradient(135deg, #667eea, #764ba2);
}
.login {
	background: rgba(255, 255, 255, 0.2);
	-webkit-backdrop-filter: blur(20px);
	backdrop-filter: blur(20px);
	border: 1px solid rgba(255, 255, 255, 0.3);
	border-radius: 16px;
	padding: 2.5rem;
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
	inline-size: min(400px, 90vw);
	color: white;
	animation: fadeUp 0.6s ease both;
}
.login__input {
	inline-size: 100%;
	padding: 0.75rem 1rem;
	margin-block-end: 1rem;
	background: rgba(255, 255, 255, 0.1);
	border: 1px solid rgba(255, 255, 255, 0.2);
	border-radius: 8px;
	color: white;
	transition: border-color 0.3s, box-shadow 0.3s;
}
.login__input:focus-visible {
	outline: none;
	border-color: rgba(255, 255, 255, 0.6);
	box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.2);
}
@keyframes fadeUp {
	from { opacity: 0; transform: translateY(20px); }
	to   { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
	.login { animation: none; }
}
```

**Goal**: a glassmorphism card with blur, animated entrance, and accessible focus states.

## Project 5 — Pure CSS Tooltip System

Build a reusable tooltip system (chapters 6, 13, 15).

**Requirements**:
- Tooltips appear on hover (`:hover` on the trigger, tooltip is a child).
- Fade + scale animation.
- Position variants (top, bottom, left, right) via modifier classes.
- Arrow using `::after` with border tricks.
- No JS.

::code-wrapper{language="css"}
```css
.tooltip {
	position: relative;
	display: inline-block;
}
.tooltip__content {
	position: absolute;
	bottom: 100%;
	left: 50%;
	transform: translateX(-50%) translateY(8px) scale(0.9);
	background: #333;
	color: white;
	padding: 0.5rem 0.75rem;
	border-radius: 6px;
	font-size: 0.875rem;
	white-space: nowrap;
	opacity: 0;
	visibility: hidden;
	transition: opacity 0.2s, transform 0.2s;
	pointer-events: none;
	margin-block-end: 8px;
}
.tooltip__content::after {
	content: "";
	position: absolute;
	top: 100%;
	left: 50%;
	transform: translateX(-50%);
	border: 6px solid transparent;
	border-block-start-color: #333;
}
.tooltip:hover .tooltip__content {
	opacity: 1;
	visibility: visible;
	transform: translateX(-50%) translateY(0) scale(1);
}
```

**Goal**: a no-JS tooltip with animation and variants.

## Project 6 — Animated CSS Loader Collection

Build 4+ CSS-only loaders (chapter 13).

**Requirements**:
- Spinner (rotate), dots (staggered pulse), bars (staggered scale), ring (conic-gradient rotate).
- Each with `@keyframes`, `infinite` iteration.
- Respects `prefers-reduced-motion`.
- Themed via CSS variables.

::code-wrapper{language="css"}
```css
.loader-spin {
	inline-size: 40px;
	block-size: 40px;
	border: 4px solid #eee;
	border-block-start-color: var(--color-primary);
	border-radius: 50%;
	animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.loader-dots { display: flex; gap: 0.5rem; }
.loader-dots span {
	inline-size: 12px;
	block-size: 12px;
	background: var(--color-primary);
	border-radius: 50%;
	animation: pulse 1.4s ease-in-out infinite both;
}
.loader-dots span:nth-child(2) { animation-delay: 0.2s; }
.loader-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes pulse {
	0%, 80%, 100% { transform: scale(0); opacity: 0.5; }
	40% { transform: scale(1); opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
	.loader-spin, .loader-dots span { animation: none; }
}
```

**Goal**: a set of loaders using different animation techniques.

## Project 7 — Full Landing Page (Capstone)

Build a complete landing page combining all skills (chapters 1–21).

**Requirements**:
- **Reset + base** (Project 1) with `@layer`.
- **Hero section**: full viewport, gradient background, animated text entrance, CTA buttons with hover effects.
- **Features grid**: `auto-fit` + `minmax` responsive cards with icons (`drop-shadow` for non-rectangular shadows), hover lift (transform).
- **Pricing table**: 3 tiers, grid layout, featured tier elevated (box-shadow, scale).
- **Testimonials**: horizontal scroll-snap carousel (CSS-only).
- **Footer**: multi-column grid, collapses to stacked on mobile.
- **Navbar** (Project 2): responsive with mobile menu.
- **Theming**: light/dark via `data-theme` + `prefers-color-scheme`, CSS variables, `color-mix()` for derived shades.
- **Accessibility**: `:focus-visible`, `prefers-reduced-motion`, semantic HTML, sufficient contrast.
- **Performance**: `content-visibility: auto` for off-screen sections, `font-display: swap`, `transform`/`opacity` animations only.
- **i18n**: logical properties throughout (RTL-ready).
- **Architecture**: BEM naming, `@layer` (reset/base/components/utilities), CSS variables for tokens.

**Bonus**:
- Container queries for component-level responsiveness.
- `:has()` for state-based styling (e.g., a pricing card with a "popular" badge).
- Scroll-driven animation for a progress bar (progressive enhancement).
- View transition for theme toggle (progressive enhancement).

**Goal**: a production-quality landing page demonstrating all CSS skills — architecture, layout, theming, animation, accessibility, performance, and i18n.

## Checklist

Use this checklist to review your CSS:

::code-wrapper{language="markdown"}
```markdown
- [ ] Reset and base styles applied
- [ ] CSS variables for all design tokens
- [ ] `@layer` for architecture (reset, base, components, utilities)
- [ ] BEM naming (no specificity wars)
- [ ] Flexbox for 1D layouts, Grid for 2D
- [ ] Responsive: `auto-fit`/`minmax`, `clamp()`, mobile-first media queries
- [ ] Container queries for component contexts
- [ ] Logical properties (i18n-ready, RTL)
- [ ] `:focus-visible` for keyboard focus
- [ ] `prefers-reduced-motion` respected
- [ ] `prefers-color-scheme` + `data-theme` for dark mode
- [ ] Animations use `transform`/`opacity` (not width/height)
- [ ] `content-visibility: auto` for long pages
- [ ] `font-display: swap` for web fonts
- [ ] Vendor prefixes via Autoprefixer
- [ ] `@supports` for progressive enhancement
- [ ] Semantic HTML, sufficient contrast
```

## Summary

You've applied the full CSS toolkit — from a reset and navbar to a grid dashboard, glassmorphism card, tooltips, loaders, and a capstone landing page. You can structure (`@layer`, BEM), layout (flex/grid, responsive, container queries), theme (variables, dark mode), animate (transform/opacity), optimize (`content-visibility`, fonts), and ensure accessibility and i18n. You now have a production-quality CSS foundation.