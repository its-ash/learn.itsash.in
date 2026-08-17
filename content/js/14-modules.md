# 14 — Modules

## ES Modules (ESM)

::code-wrapper{language="javascript" filename="math.js"}
```javascript
// Named exports
export const PI = 3.14159
export function square(x) { return x * x }
export function cube(x) { return x * x * x }

// Default export — one per module
export default class Calculator {
  add(a, b) { return a + b }
}
```
::
::

::code-wrapper{language="javascript" filename="main.js"}
```javascript
// Named imports — must match export names
import { PI, square } from './math.js'

// Default import — any name
import Calc from './math.js'

// Both
import Calc, { PI, square, cube } from './math.js'

// Namespace import — all exports as object
import * as math from './math.js'
math.PI       // 3.14159
math.square(5) // 25

// Rename imports
import { square as sq } from './math.js'

// Import for side effects only (no bindings)
import './polyfill.js'
```
::
::

## Dynamic Import

::code-wrapper{language="javascript"}
```javascript
// Returns a promise — lazy load modules
const module = await import('./heavy-module.js')
module.doSomething()

// Conditional loading
if (featureFlags.charts) {
  const { renderChart } = await import('./chart.js')
  renderChart(data)
}

// Error handling
try {
  const mod = await import('./optional.js')
} catch (e) {
  console.warn('Optional module failed to load')
}
```
::
::

## Re-exports

::code-wrapper{language="javascript" filename="index.js"}
```javascript
// Re-export everything
export * from './math.js'

// Re-export specific
export { square, cube } from './math.js'

// Re-export default as named
export { default as Calculator } from './math.js'

// Rename during re-export
export { square as sq } from './math.js'
```
::
::

## `package.json` Configuration

::code-wrapper{language="json" filename="package.json"}
```json
{
  "type": "module",
  "exports": {
    ".": "./src/index.js",
    "./utils": "./src/utils.js",
    "./package.json": "./package.json"
  },
  "imports": {
    "#internal": "./src/internal.js"
  }
}
```
::
::

## Best Practices

::code-wrapper{language="javascript"}
```javascript
// ✅ Prefer named exports — better refactor support, tree-shaking
export function add(a, b) { return a + b }

// ✅ Group related exports in one module
// ✅ Use default export only for the "main" thing
export default class App {}
export const version = '1.0.0'

// ✅ Avoid circular dependencies — A imports B, B imports A
// ✅ Use dynamic import for code splitting and lazy loading
```
::
::

## 💡 Tips & Tricks

**Prefer named exports for tree-shaking** — Bundlers can eliminate unused named exports. Default exports can't be tree-shaken (bundler doesn't know what's unused).

**Aggregate exports with index.js** — `export * from './module'` in `index.js` gives consumers a single import path. Cleaner than `import from './module/file.js'`.

**Dynamic import for route splitting** — In SPA frameworks, lazy-load route modules: `const module = await import('./pages/About.js')`. Reduces initial bundle size.

**Use "imports" in package.json** — `"#internal": "./src/internal.js"` lets consumers do `import { x } from '#internal'`. Better than relative paths like `../../../src`.

**Check module.meta.url** — In ESM, `import.meta.url` is the current module's URL. Useful for dynamic paths: `const dir = new URL('.', import.meta.url).pathname`.

## ⚠️ Edge Cases & Gotchas

**Circular dependencies partially work** — If A imports B and B imports A, one gets undefined values temporarily. It "works" but is fragile. Refactor to avoid.

**Default and named exports can't be mixed cleanly** — `export default x` and `export { y }` from same module is confusing. Pick one style per file.

**Module-level side effects** — Top-level code in modules runs when imported. If module runs expensive setup or mutates globals, every import triggers it. Be careful with side effects.

**import.meta is not available in CommonJS** — If you need to detect module type, `typeof import.meta` is "undefined" in CJS. Use `typeof require !== 'undefined'` instead.

**Dynamic import strings can't be bundled** — `await import(userInput)` can't be pre-analyzed by bundlers. Use dynamic import sparingly or with explicit strings.

**Re-exports don't re-execute** — `export * from './module'` doesn't run `./module`'s side effects twice. But `import './module'; export * from './module'` does run it once (implicitly imported).

## 🧠 Spot the Bug

What happens?

::code-wrapper{language="javascript"}
```javascript
// moduleA.js
import { func } from './moduleB.js'
console.log('A loaded')
export const a = func()

// moduleB.js
import { a } from './moduleA.js'
console.log('B loaded')
export const func = () => 'result'

// main.js
import { a } from './moduleA.js'
console.log(a)
```
::

<details>
<summary>Answer</summary>

Logs: "B loaded", "A loaded", undefined

Here's why:
- A imports B, which imports A
- B loads first (cyclic dependency)
- When B tries to import `a` from A, A isn't finished yet, so `a` is undefined
- B finishes, A finishes, but `a` was already set to `func()` when func wasn't defined

**The lesson**: Circular dependencies cause partial initialization. Refactor to avoid them.

</details>

## Key Takeaways

- ES modules use `import`/`export` — static, hoisted, supports tree-shaking.
- Named exports are preferred over default — better IDE support and refactoring.
- Dynamic `import()` returns a promise — use for lazy loading and code splitting.
- Set `"type": "module"` in `package.json` to use ESM in Node.js.
- Circular dependencies work but are fragile — avoid them.