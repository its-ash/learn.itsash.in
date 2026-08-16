# 02 — Selectors & Specificity

Selectors target HTML elements for styling. Specificity and the cascade determine which rule wins when multiple apply.

## Selector Types

::code-wrapper{language="css"}
```css
/* Type (element) */
p { color: black; }

/* Class */
.highlight { background: yellow; }

/* ID */
#header { background: white; }

/* Universal */
* { box-sizing: border-box; }

/* Attribute */
[type="text"] { border: 1px solid gray; }
a[href^="https"] { color: green; }   /* starts with https */
a[href$=".pdf"] { color: red; }       /* ends with .pdf */
a[href*="example"] { font-weight: bold; }  /* contains */

/* Grouping */
h1, h2, h3 { font-family: sans-serif; }
```
::

## Combinators

::code-wrapper{language="css"}
```css
/* Descendant (any depth) */
article p { margin: 1em 0; }

/* Child (direct only) */
ul > li { list-style: none; }

/* Adjacent sibling (immediately after) */
h1 + p { font-size: 1.2em; }

/* General sibling (any following sibling) */
h1 ~ p { color: gray; }
```
::

## Specificity

Specificity is a 4-part value `(a, b, c, d)`:
- `a` — `style` attribute (inline) — 1 if present, else 0.
- `b` — number of ID selectors.
- `c` — number of class selectors, attribute selectors, and pseudo-classes.
- `d` — number of type selectors and pseudo-elements.

::code-wrapper{language="text"}
```text
*                 → (0,0,0,0)
p                 → (0,0,0,1)
.highlight        → (0,0,1,0)
p.highlight       → (0,0,1,1)
#header           → (0,1,0,0)
#header .title    → (0,1,1,0)
div#header .title → (0,1,1,1)
style="..."       → (1,0,0,0)
!important        → overrides specificity (but two !important compete by specificity)
```
::

Compare left-to-right: `(0,1,0,0)` beats `(0,0,99,99)` — one ID beats any number of classes.

### The specificity trap

High-specificity selectors are hard to override. If you style with `#header .title`, overriding it requires `#header .title.highlight` or `!important` — a spiral. **Prefer class-based selectors** for most styling; reserve IDs for rare, truly-unique elements.

## The Cascade

When multiple rules apply to an element with equal specificity, **source order** wins — later rules override earlier. The full cascade order:

1. **Origin & importance** — `!important` > normal; author (your CSS) > user > user-agent (browser default).
2. **Specificity** — higher specificity wins.
3. **Source order** — later wins (at equal specificity).
4. **Inheritance** — if no rule applies, the property inherits from the parent (for inheritable properties like `color`, `font`).

## Inheritance

Some properties inherit (`color`, `font-*`, `line-height`, `text-align`, `list-style`); others don't (`border`, `margin`, `padding`, `width`, `height`). Set on a parent, inheritable properties apply to all descendants unless overridden.

::code-wrapper{language="css"}
```css
body { font-family: sans-serif; color: #333; }   /* inherits to all text */
div { border: 1px solid black; }                  /* doesn't inherit */
```

- `inherit` — explicitly inherit (`border: inherit;`).
- `initial` — reset to the property's initial value.
- `unset` — inherit if inheritable, else initial.
- `revert` — reset to the browser default (not the spec initial).

## Cascade Layers (modern)

`@layer` controls specificity between groups of rules — useful for taming third-party CSS:

::code-wrapper{language="css"}
```css
@layer reset, base, components, utilities;

@layer reset {
	* { margin: 0; padding: 0; }
}
@layer components {
	.card { /* ... */ }
}
```
::

Rules in later layers win over earlier layers (regardless of specificity within a layer). Unlayered rules have higher priority than layered rules. This is a modern way to manage specificity at scale (2023+ browser support).

## 💡 Tips & Tricks

- **Idiom**: prefer class selectors (`.card`, `.title`) over ID selectors (`#header`) — classes are reusable, lower-specificity (easier to override), and not constrained to one element. Reserve IDs for genuinely unique elements (and JavaScript hooks).
- **Idiom**: keep specificity low and flat — prefer single-class selectors (`.btn`) over chained (`.card .btn`, `#header .btn`). Low specificity is easy to override; high specificity starts an arms race toward `!important`.
- **Idiom**: use BEM (`.block__element--modifier`) or similar naming to keep specificity flat — `.card__title--large` is a single class (specificity 0,0,1,0), not `.card .title.large` (0,0,2,1). Flat specificity avoids override battles.
- **Idiom**: use `@layer` to manage third-party CSS — `@layer reset, base, third-party, components, utilities;` puts third-party styles in a layer that your component layer overrides, regardless of their specificity. No more `!important` wars with frameworks.
- **Debug**: when a style isn't applying, check the Styles pane in DevTools — it shows all matching rules (struck-through if overridden) and the computed value. The specificity of each rule is visible; the winner is at the top. This reveals whether the issue is specificity, a typo, or a missing rule.

## ⚠️ Edge Cases & Gotchas

- **IDs beat any number of classes**: `#x` (0,1,0,0) beats `.a.b.c.d.e` (0,0,5,0). Don't try to override an ID selector with classes — use an ID or `!important` (or restructure).
- **`!important` is a trap**: once you use it, overriding it requires higher specificity + `!important`. It cascades into more `!important`. Reserve for genuine overrides (third-party styles you can't edit).
- **Specificity isn't decimal**: (0,0,10,0) doesn't "roll over" to (0,1,0,0) — 10 classes still lose to 1 ID. Compare each column independently.
- **Inline styles beat stylesheet rules**: `style="color: red"` (1,0,0,0) beats `#id` (0,1,0,0). Only `!important` in a stylesheet overrides inline.
- **Inherited properties vs non-inherited**: `color` inherits; `border` doesn't. Setting `border` on `body` doesn't give all elements a border. Use `inherit`/`unset` explicitly if needed.
- **Universal selector `*` has zero specificity**: `* { box-sizing: border-box; }` is (0,0,0,0) — it doesn't override anything but also isn't overridden by anything specific. Safe for resets.
- **`:not()` has the specificity of its argument**: `:not(.x)` has specificity (0,0,1,0) (the class inside), not (0,0,1,0) for the `:not` itself plus the argument. Modern `:not()` (with a selector list) takes the highest.
- **Pseudo-elements (`::before`, `::after`) add specificity like a type**: `p::before` is (0,0,0,2). Pseudo-classes (`:hover`) add like a class: (0,0,1,0).
- **Cascade layers change the specificity comparison**: a rule in a later layer wins over an earlier layer regardless of specificity. Unlayered rules beat layered rules. This is a deliberate escape hatch from the specificity hierarchy.

## 🧠 Spot the Bug

A developer styles a button, then a later rule doesn't override it:

::code-wrapper{language="css"}
```css
#sidebar .btn { background: blue; }       /* (0,1,1,0) */
.btn { background: green; }               /* (0,0,1,0) — loses */
```
::

The button stays blue. Why?

<details>
<summary>Answer</summary>

`#sidebar .btn` has specificity (0,1,1,0) — one ID (`#sidebar`) plus one class (`.btn`). `.btn` has specificity (0,0,1,0) — one class. The ID-based selector wins, so the button stays blue, even though `.btn { background: green }` comes later in the source.

Specificity beats source order. To override, the green rule needs specificity ≥ (0,1,1,0):

```css
#sidebar .btn { background: blue; }
#sidebar .btn.green { background: green; }  /* (0,1,2,0) — wins */
/* or */
#sidebar .btn { background: green; }         /* same specificity, later in source — wins */
```

The deeper fix: avoid ID selectors for styling. If `#sidebar` were `.sidebar` (a class), the specificity would be (0,0,2,0) vs (0,0,1,0), and adding a class (`.btn.green`) would override cleanly. IDs in selectors create override battles.

**The lesson**: an ID in a selector gives it specificity that classes can't override. Use class-based selectors for styling to keep specificity flat and overridable.

</details>

## Summary

You can now use type/class/ID/attribute selectors, combinators (descendant/child/sibling), understand specificity (the 4-part value) and the cascade (importance → specificity → source order → inheritance), use `inherit`/`initial`/`unset`/`revert`, and manage specificity with `@layer` — while preferring low-specificity class selectors over IDs. Next: the box model.