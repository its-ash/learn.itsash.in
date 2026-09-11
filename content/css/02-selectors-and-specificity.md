---
title: "02 — Selectors, Specificity & the Cascade Algorithm"
description: "Selector matching is right-to-left, specificity is a 4-tuple compared column-wise, and the cascade is origin→layer→specificity→order→inheritance. Code-first reference with cascade-layer architecture and the specificity arms-race anti-pattern."
---

# 02 — Selectors, Specificity & the Cascade Algorithm

The cascade is an algorithm, not a vibe. When N rules match an element, the engine computes a winner in this order: **origin/importance → cascade layer → specificity → source order → inheritance → initial value**. Misunderstanding any tier produces "why isn't my style applying?" Every selector you write is a specificity budget — spend it flat.

## Selector Inventory — with specificity cost

::code-wrapper{language="css"}
```css
/* specificity (a,b,c,d): a=style attr, b=ID count, c=class/attr/pseudo-class, d=type/pseudo-element */
*                  { } /* (0,0,0,0) — universal: matches all, zero specificity. Safe for resets. */
p                  { } /* (0,0,0,1) — type */
.highlight         { } /* (0,0,1,0) — class (the production workhorse) */
[type="text"]      { } /* (0,0,1,0) — attribute selector */
a[href^="https"]   { } /* (0,0,1,1) — attr + type; ^= starts-with, $= ends-with, *= contains */
#header            { } /* (0,1,0,0) — ID: avoid for styling (unoverridable by classes) */
p::before          { } /* (0,0,0,2) — pseudo-element counts as a type */
p:hover            { } /* (0,0,1,0) — pseudo-class counts as a class */
:is(.a, #b, p)     { } /* takes the HIGHEST specificity in the list → (0,1,0,1) */
:where(.a, #b)     { } /* always (0,0,0,0) — zero-specificity grouping, the override-friendly :is */
:not(.error)       { } /* specificity of the ARGUMENT → (0,0,1,0), not of :not itself */
```
::

## Combinators — and what they cost the engine

::code-wrapper{language="css"}
```css
/* The engine matches RIGHT-TO-LEFT. The rightmost selector is the "key" —
   the engine finds all key matches, then walks UP the DOM checking ancestors.
   Deep descendant chains = O(depth) per key match. BEM's flat single-class
   selectors are O(1) by comparison. */
article p            { } /* descendant: any <p> at any depth under <article> */
ul > li              { } /* child: direct children only — tighter, faster */
h1 + p               { } /* adjacent sibling: the <p> immediately after <h1> */
h1 ~ p               { } /* general sibling: any <p> after <h1>, not nested */
```
::

## The Specificity Trap — and the production escape

### Anti-pattern: ID selectors start an arms race

::code-wrapper{language="css"}
```css
/* ❌ Once you use #id, classes can NEVER override it. You're forced into !important or more IDs. */
#sidebar .btn { background: blue; }   /* (0,1,1,0) */
.btn { background: green; }           /* (0,0,1,0) — loses forever, even with source order */
.btn.green { background: green; }     /* (0,0,2,0) — still loses: 1 ID > any number of classes */
```
::

::code-wrapper{language="css"}
```css
/* ✓ PRODUCTION — flat class selectors + cascade layers. No IDs for styling. */
@layer components, overrides;
@layer components {
  .sidebar__btn { background: blue; }   /* (0,0,1,0) in `components` layer */
}
@layer overrides {
  .sidebar__btn--green { background: green; }  /* later layer wins regardless of specificity */
}
```
::

**Why:** `@layer` makes precedence a *declared order*, not a specificity shootout. A utility in the last layer beats a component in an earlier layer at (0,0,1,0) vs (0,0,10,0) — specificity is irrelevant *across* layers.

## Cascade Layers in Practice — taming third-party CSS

::code-wrapper{language="css"}
```css
@layer reset, third-party, base, components, utilities;
/* third-party (framework, design system) is an EARLY layer → your base/components override it
   for FREE, no matter how specific their selectors are. The end of !important wars. */
@layer third-party {
  @import url("bootstrap.css") layer(framework);  /* if you must @import, scope it to a layer */
}
```
::

## Inheritance vs Non-Inherited Properties

::code-wrapper{language="css"}
```css
body { color: #333; border: 1px solid black; }
/* `color` INHERITS → every descendant text node gets #333 unless overridden.
   `border` does NOT inherit → only <body> gets a border. */
.card { border: inherit; }    /* explicitly inherit a non-inherited property */
.badge { all: revert; }       /* reset EVERYTHING to UA defaults (nuclear) */
/* unset  = inherit if the property is inheritable, else initial.
   revert = UA default (not the spec initial — e.g. `display: revert` → inline for <span>).
   initial = the spec's initial value (display: initial → inline for everything). */
```
::

## 💡 Tips & Tricks

- **Idiom**: use `:where()` for zero-specificity grouping — `.card :where(h1, h2, h3) { }` styles headings inside `.card` at specificity (0,0,1,0), so a single `.prose-h2` class can override it. `:is()` would hoist `h2`'s type specificity into the group.
- **Idiom**: use BEM (`.block__element--modifier`) to keep every selector at (0,0,1,0) — flat specificity means source order and layers are the only precedence levers, exactly as intended.
- **Idiom**: reserve IDs for JS hooks (`#submit-btn`) and fragment links, never styling. If you must target an ID, wrap it: `.app #header` is still (0,1,1,0) — better to refactor to a class.
- **Idiom**: `@layer` is the modern specificity strategy — declare order once, put utilities last, and you never need `!important` or chained selectors for overrides.

## ⚠️ Edge Cases & Gotchas

- **Specificity is NOT decimal**: (0,0,10,0) does not "roll over" to (0,1,0,0). Ten classes still lose to one ID. Compare each column independently, left-to-right.
- **`!important` reverses origin but keeps specificity**: two `!important` rules compete by specificity. `#x { color: red !important }` beats `.a.b.c { color: blue !important }`. It's a trap that forces *more* `!important`.
- **`:not()` takes its argument's specificity**: `:not(.x)` is (0,0,1,0), `:not(#x)` is (0,1,0,0). A `:not()` with an ID inside is an ID-strength selector.
- **Unlayered rules beat ALL layered rules**: a bare `.btn { }` outside `@layer` beats `.btn { }` in `@layer utilities`. This is the escape hatch — and the reason to layer *everything* or nothing.
- **Pseudo-elements (`::before`) count as a type** (0,0,0,1); pseudo-classes (`:hover`) count as a class (0,0,1,0). `p::first-line:hover` is (0,0,1,2).
- **`inherit`/`initial`/`unset`/`revert` are values, not properties**: `color: revert` resets to UA default; `all: unset` nukes everything. `revert` ≠ `initial` for UA-styled elements (`<button>`).

## 🧠 Spot the Bug

::code-wrapper{language="css"}
```css
#sidebar .btn { background: blue; }
.btn { background: green; }
```
::

<details>
<summary>Answer</summary>

`#sidebar .btn` is (0,1,1,0); `.btn` is (0,0,1,0). Specificity beats source order, so the button stays blue. Ten `.btn`-class rules stacked later still lose. Fix: remove the ID (`--sidebar` as a class → (0,0,2,0), overridable by adding a class) or use `@layer` to declare precedence by layer, not specificity. The root cause: an ID in a selector makes it unoverridable by the class-based architecture the rest of the codebase uses.

</details>
