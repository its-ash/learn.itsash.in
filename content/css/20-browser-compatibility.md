---
title: "20 — Browser Compatibility: Prefixes, @supports & Progressive Enhancement"
description: "Autoprefixer with browserslist, @supports feature detection, property fallback ordering, the Safari -webkit- laggard trap, and caniuse as the reference. Code-first reference for cross-engine production CSS."
---

# 20 — Browser Compatibility: Prefixes, @supports & Progressive Enhancement

Vendor prefixes are mostly obsolete. The production approach: Autoprefixer (driven by `browserslist`) adds the few remaining prefixes; `@supports` for feature detection; fallbacks before new properties. Safari (WebKit) is the laggard — test it specifically.

## Vendor Prefixes — let tooling handle them

::code-wrapper{language="json"}
```json
{
  "browserslist": ["last 2 versions", "> 1%", "not dead"]
}
```
::

::code-wrapper{language="css"}
```css
/* Don't hand-write prefixes. Autoprefixer reads browserslist and adds only what's needed. */
/* The few properties still needing -webkit- for Safari (2024): */
.glass {
  -webkit-backdrop-filter: blur(10px);  /* Safari */
  backdrop-filter: blur(10px);          /* standard */
}
.gradient-text {
  -webkit-background-clip: text;        /* Safari */
  background-clip: text;
  -webkit-text-fill-color: transparent; /* Safari */
  color: transparent;
}
```
::

## `@supports` — feature detection (not UA sniffing)

::code-wrapper{language="css"}
```css
/* Fallback for ALL browsers (including those without @support) */
.card { display: flex; flex-direction: column; }

/* Enhanced if grid is supported. IE doesn't support @supports → gets the fallback. */
@supports (display: grid) {
  .card { display: grid; grid-template-columns: 1fr 2fr; }
}

/* Negation: browsers WITHOUT the feature */
@supports not (display: grid) { .card { display: block; } }

/* Selector support detection */
@supports selector(:has(> *)) { .card:has(img) { padding-block-start: 0; } }

/* Combine with and/or */
@supports (display: grid) and (gap: 1rem) { .grid { display: grid; gap: 1rem; } }
```
::

## Property Fallbacks — fallback BEFORE the new property

::code-wrapper{language="css"}
```css
.box {
  width: 300px;          /* fallback — applies if the next line is unsupported */
  display: block;         /* fallback */
  display: grid;          /* enhanced — if unsupported, ignored, fallback stays */
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
}
/* The cascade: the last SUPPORTED value wins. Unsupported values are ignored, not errors. */
```
::

## The Safari Laggard Trap

### Anti-pattern: missing -webkit- prefix breaks Safari

::code-wrapper{language="css"}
```css
/* ❌ backdrop-filter without -webkit- → Safari (versions needing the prefix) shows no blur. */
.glass { background: rgba(255,255,255,0.2); backdrop-filter: blur(10px); }
```
::

::code-wrapper{language="css"}
```css
/* ✓ Include -webkit- (before standard, so the standard wins when supported). Or use Autoprefixer. */
.glass { background: rgba(255,255,255,0.2); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); }
```
::

::code-wrapper{language="text"}
```text
Safari is often the laggard for newer CSS:
  :has()          → Safari 15.4 (Chrome 105)
  container queries → Safari 16 (Chrome 105)
  subgrid         → Safari 16 (Chrome 117)
  backdrop-filter → needs -webkit- in older Safari
  background-clip:text → needs -webkit- in Safari
Always check Safari support specifically on caniuse.com.
```
::

## 💡 Tips & Tricks

- **Idiom**: Autoprefixer with `browserslist` (not hand-written prefixes) — configure your target (`last 2 versions, > 1%, not dead`) and let it add/remove prefixes. Hand-writing is error-prone and leaves obsolete ones.
- **Idiom**: `@supports` for progressive enhancement — fallback for all, enhanced if supported. Better than UA sniffing (fragile). IE doesn't support `@supports` → gets the fallback (outside `@supports`).
- **Idiom**: fallbacks *before* new properties — `width: 300px; display: grid;`. If `grid` is unsupported, the browser ignores it and uses the earlier value. The cascade's "last supported value wins" handles fallbacks.
- **Idiom**: check [caniuse.com](https://caniuse.com) before using a newer feature — shows support across browsers with version numbers and known issues.
- **Idiom**: test in Safari (WebKit) — Chrome (Blink) and Safari (WebKit) differ. Safari is the laggard for newer CSS. Test both for cross-engine correctness.

## ⚠️ Edge Cases & Gotchas

- **Prefixes are mostly obsolete**: don't add `-webkit-`/`-moz-` to everything — it clutters and some prefixed versions have bugs. Use Autoprefixer with a current `browserslist`.
- **`@supports` isn't supported in IE**: IE gets the CSS *outside* `@supports` (the fallback), and the `@supports (display: grid)` block is ignored — usually what you want.
- **Prefixed and unprefixed can differ**: `-webkit-background-clip: text` and `background-clip: text` can have slightly different behavior in older WebKit. Test both.
- **Feature detection isn't bug detection**: `@supports (gap: 1rem)` checks if the browser *claims* support, not if it works correctly. Some features have partial/buggy support (gap in flexbox was buggy in early Chrome).
- **Forking by `@supports` can bloat CSS**: too many `@supports` branches make the CSS large. Use for major enhancements (grid vs flex), not every property.
- **`browserslist` affects Autoprefixer output**: `last 2 versions` adds few prefixes; `> 1%` adds more for popular older browsers. Choose your target realistically.

## 🧠 Spot the Bug

::code-wrapper{language="css"}
```css
.glass {
	background: rgba(255, 255, 255, 0.2);
	backdrop-filter: blur(10px);
}
```
::

<details>
<summary>Answer</summary>

Safari (older versions, and some current contexts) requires `-webkit-backdrop-filter`. Without it, Safari ignores the unprefixed `backdrop-filter` → no blur, just a translucent panel. Fix: include the `-webkit-` prefix before the standard (so the standard wins when supported), or use Autoprefixer with a `browserslist` that includes Safari. Some features (backdrop-filter, background-clip: text, mask) still need `-webkit-` in Safari even today.

</details>
