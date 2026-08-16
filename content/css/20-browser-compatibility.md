# 20 — Browser Compatibility & Prefixes

Browser compatibility is about handling differences in CSS support across browsers — vendor prefixes, feature detection, and fallbacks.

## Vendor Prefixes

Vendor prefixes were the mechanism for experimental CSS features:

| Prefix | Browser |
|---|---|
| `-webkit-` | Chrome, Safari, Edge, Opera (Blink/WebKit) |
| `-moz-` | Firefox |
| `-ms-` | Internet Explorer / old Edge |
| `-o-` | Old Opera (Presto) |

::code-wrapper{language="css"}
```css
.box {
	-webkit-transition: all 0.3s ease;
	-moz-transition: all 0.3s ease;
	-ms-transition: all 0.3s ease;
	-o-transition: all 0.3s ease;
	transition: all 0.3s ease;
}
```

### The prefix problem

Prefixes were meant for experimentation, but developers used them in production. Browsers then had to support prefixed properties long after the standard stabilized. Modern CSS uses **prefix-free** features — browser support is now good enough that most CSS needs no prefix.

### When prefixes are still needed (2024)

A few properties still benefit from prefixes for Safari/older browsers:
- `-webkit-background-clip: text` (for gradient text)
- `-webkit-backdrop-filter` (for Safari)
- `-webkit-mask` / `-webkit-text-fill-color` (Safari)

For almost everything else, the unprefixed property works in all modern browsers.

### Autoprefixer

Don't hand-write prefixes — use **Autoprefixer** (PostCSS plugin) or a build tool. It adds necessary prefixes based on a browser support target (`browserslist`), and removes obsolete ones:

::code-wrapper{language="json"}
```json
// package.json — browserslist
{
	"browserslist": [
		"last 2 versions",
		"> 1%",
		"not dead"
	]
}
```

Autoprefixer reads this and adds only the prefixes needed for those browsers. This is the standard approach — let tooling handle prefixes.

## Feature Detection (`@supports`)

`@supports` conditionally applies CSS based on feature support — progressive enhancement:

::code-wrapper{language="css"}
```css
/* Fallback for all */
.card {
	background: url("fallback.jpg") center/cover;
}

/* Enhancement if grid is supported */
@supports (display: grid) {
	.card {
		display: grid;
		grid-template-columns: 1fr 2fr;
	}
}

/* If not supported */
@supports not (display: grid) {
	.card {
		display: flex;
	}
}
```

### `@supports` syntax

::code-wrapper{language="css"}
```css
@supports (property: value) { ... }
@supports (display: grid) and (gap: 1rem) { ... }
@supports (display: grid) or (display: -ms-grid) { ... }
@supports not (display: grid) { ... }
@supports selector(:has(> *)) { ... }   /* selector support */
@supports font-format(opentype) { ... } /* font format support */
```

Use `@supports` for progressive enhancement — provide a fallback, enhance if the feature is supported. Better than user-agent sniffing (which is fragile).

## Fallbacks and Progressive Enhancement

### Property fallbacks

Put the fallback *before* the new property — if the new one is unsupported, the fallback applies:

::code-wrapper{language="css"}
```css
.box {
	/* Fallbacks */
	width: 300px;
	display: block;

	/* Enhanced */
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
}
```

If `display: grid` is unsupported, the browser ignores it and uses `display: block` (the earlier value). The cascade handles it — the last *supported* value wins.

### `@layer` for fallbacks

::code-wrapper{language="css"}
```css
@layer fallback {
	.layout { display: flex; flex-direction: column; }
}

@layer base {
	.layout { display: grid; grid-template-rows: auto 1fr auto; }
}
```

If `grid` is unsupported, the `fallback` layer's `flex` applies (the `base` layer's `grid` is ignored). Layer order ensures the enhanced version wins when supported.

## Internet Explorer and Old Browsers

IE 11 is mostly dead (Microsoft dropped support 2022), but some legacy contexts still need it. Strategies:
- **Don't support IE** — most modern sites drop it. Use modern CSS freely.
- **Provide a functional fallback** — basic layout with floats/flexbox, no grid/custom properties.
- **Use `@supports`** — detect grid/custom-properties support; IE doesn't support `@supports` either, so IE gets the fallback (outside `@supports`).

## Polyfills and Shirks

Some CSS features can be polyfilled in JS:
- **CSS variables** — `ie11-custom-properties` polyfill.
- **`:has()`** — `qawolf`/`css-has-polyfill`.
- **Container queries** — `cqfill`.

But JS polyfills have overhead. Prefer `@supports` + fallbacks over polyfills when possible.

## Can I Use

[caniuse.com](https://caniuse.com) is the reference for CSS feature support across browsers. Check it before using a newer feature. Filter by your target browsers.

## Browser Testing

- **BrowserStack / LambdaTest** — test across browsers/OSs (paid).
- **Chrome DevTools → Emulate** — emulate mobile devices, `prefers-color-scheme`, `prefers-reduced-motion`.
- **Firefox Developer Edition** — different rendering engine (Gecko), good for cross-engine testing.
- **Safari** — WebKit (different from Chrome's Blink). Test Safari for WebKit-specific behavior (it's often the laggard).

## 💡 Tips & Tricks

- **Idiom**: use Autoprefixer (not hand-written prefixes) — configure `browserslist` (e.g., `last 2 versions, > 1%, not dead`) and let Autoprefixer add/remove prefixes based on your target. Hand-writing prefixes is error-prone and leaves obsolete ones.
- **Idiom**: use `@supports` for progressive enhancement — provide a fallback for all browsers, then `@supports (display: grid) { /* enhanced */ }`. This is better than UA sniffing (fragile) and works even when `@supports` itself is unsupported (IE gets the fallback outside `@supports`).
- **Idiom**: put fallbacks *before* new properties — `width: 300px; display: grid;`. If `display: grid` is unsupported, the browser ignores it and uses the earlier value. The cascade's "last supported value wins" handles fallbacks naturally.
- **Idiom**: check [caniuse.com](https://caniuse.com) before using a newer feature — it shows support across browsers with version numbers and known issues. Filter by your target browsers.
- **Idiom**: test in Safari (WebKit) for cross-engine correctness — Chrome (Blink) and Safari (WebKit) differ. Safari is often the laggard for newer CSS (container queries, `:has()` came later). Test both.

## ⚠️ Edge Cases & Gotchas

- **Prefixes are mostly obsolete**: most CSS properties work unprefixed in all modern browsers. Don't add `-webkit-`/`-moz-` to everything — it clutters and some prefixed versions have bugs. Use Autoprefixer with a current `browserslist`.
- **`@supports` itself isn't supported in IE**: IE 11 doesn't support `@supports`. So IE gets the CSS *outside* `@supports` (the fallback), and the `@supports (display: grid)` block is ignored — which is usually what you want.
- **Prefixed and unprefixed can differ**: `-webkit-background-clip: text` and `background-clip: text` can have slightly different behavior in older WebKit. Test both.
- **`-webkit-` for Safari only**: some features (backdrop-filter, background-clip: text, mask) need `-webkit-` in Safari even today. Autoprefixer handles these; if hand-writing, include both.
- **Safari is often the laggard**: `:has()` shipped in Safari 15.4 (Chrome 105), container queries in Safari 16 (Chrome 105), subgrid in Safari 16 (Chrome 117). Check Safari support specifically.
- **`@supports not (...)`**: the `not` keyword negates. `@supports not (display: grid)` matches browsers *without* grid support (IE). Useful for IE-only fallbacks.
- **Feature detection isn't bug detection**: `@supports (property: value)` checks if the browser *claims* to support it, not if it works correctly. Some browsers have partial/buggy support (e.g., gap in flexbox was in Chrome but buggy for a while).
- **Forking by `@supports` can bloat CSS**: too many `@supports` branches make the CSS large. Use for major enhancements (grid vs flex), not for every property.
- **`browserslist` affects Autoprefixer**: `last 2 versions` adds few prefixes (modern browsers); `> 1%` adds more for popular older browsers. Choose your target realistically.
- **`@import` for fallbacks is slow**: `@import` is render-blocking. Don't use `@import` for browser-specific CSS — use `@supports` or conditional classes.

## 🧠 Spot the Bug

A developer uses `backdrop-filter` for a glassmorphism effect, but it doesn't work in Safari:

::code-wrapper{language="css"}
```css
.glass {
	background: rgba(255, 255, 255, 0.2);
	backdrop-filter: blur(10px);
}
```
::

What's missing?

<details>
<summary>Answer</summary>

Safari (older versions, and some current contexts) requires the `-webkit-` prefix for `backdrop-filter`:

```css
.glass {
	background: rgba(255, 255, 255, 0.2);
	-webkit-backdrop-filter: blur(10px);  /* Safari */
	backdrop-filter: blur(10px);          /* standard */
}
```

Without `-webkit-backdrop-filter`, Safari ignores the unprefixed `backdrop-filter` (in versions that need the prefix), and the glass effect doesn't appear — the card is just a translucent panel with no blur.

The fix — include the `-webkit-` prefix (before the unprefixed, so the standard wins when supported). Or use Autoprefixer with a `browserslist` that includes Safari, which adds the prefix automatically.

**The lesson**: some CSS features (backdrop-filter, background-clip: text, mask) still need `-webkit-` in Safari. Include both prefixed and unprefixed (prefixed first), or use Autoprefixer to add them automatically based on your browser targets.

</details>

## Summary

You can now handle vendor prefixes (Autoprefixer with `browserslist`, not hand-written), use `@supports` for progressive enhancement (fallback + enhanced), provide property fallbacks (fallback before new property), test cross-browser (Safari/WebKit especially), and consult caniuse.com — with the Safari `-webkit-backdrop-filter` trap avoided. Next: CSS preprocessors and build tools.