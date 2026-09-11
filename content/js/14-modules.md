---
title: "JavaScript 14 — Module Systems: ESM Internals, CommonJS & Dynamic Import"
description: "Deep-dive into JavaScript module systems: ES Module loading phases (construction, instantiation, evaluation), live bindings vs CommonJS copies, dynamic import and code splitting, circular dependency handling, and package.json exports. Code-first reference for senior engineers."
---

# 14 — Module Systems: ESM Internals, CommonJS & Dynamic Import

## ES Modules: Loading Phases and Live Bindings

::code-wrapper{language="javascript"}
```javascript
// ── ESM loading has 3 phases (per module, depth-first) ──
// 1. CONSTRUCTION: download/parse all modules in the dependency graph
//    - Traverse imports recursively, build the module graph
//    - No code executes yet — just parsing
// 2. INSTANTIATION: create module environment records and live bindings
//    - Allocate memory for exported/imported bindings
//    - Wire up import ↔ export references (live bindings)
// 3. EVALUATION: execute module top-level code in dependency order
//    - Run the module body (top-level code, not functions)
//    - Side effects happen here (console.log, assignments, etc.)

// ── ESM exports (named and default) ──
// math.js:
export const PI = 3.14159;          // named export (live binding)
export function add(a, b) { return a + b; }  // named export (function)
export default function multiply(a, b) { return a * b; }  // default export (one per module)

// ── ESM imports ──
// app.js:
import multiply, { PI, add } from "./math.js";  // default + named imports
import * as math from "./math.js";              // namespace import (all exports as an object)
import { add as plus } from "./math.js";        // rename import

console.log(multiply(2, 3));  // 6 (default export)
console.log(PI);              // 3.14159 (named export)
console.log(add(1, 2));       // 3 (named export)
console.log(math.PI);         // 3.14159 (namespace)

// ── Live bindings: imports reflect the exporter's current value ──
// counter.js:
export let count = 0;       // mutable export binding
export function increment() { count++; }  // modifies the export

// app.js:
import { count, increment } from "./counter.js";
console.log(count);  // 0
increment();
console.log(count);  // 1 — live binding! The import reflects the updated value.
// In CommonJS, this would be a stale copy (0), because CJS copies the value at import time.
```
::

## ESM vs CommonJS: The Fundamental Differences

::code-wrapper{language="javascript"}
```javascript
// ── CommonJS (Node.js, require/module.exports) ──
// cjs/counter.js:
let count = 0;
function increment() { count++; }
module.exports = { count, increment };  // COPIES current values at export time

// cjs/app.js:
const { count, increment } = require("./counter.js");
console.log(count);  // 0
increment();          // increments the module's internal count, NOT the imported copy
console.log(count);  // 0 — STALE! CJS copies the value at require() time.

// ── Key differences ──
// | Feature        | ESM                           | CommonJS                      |
// |---------------|-------------------------------|-------------------------------|
// | Loading       | Async (phases)                 | Sync (require blocks)          |
// | Bindings      | Live (references)              | Copies (values at import time) |
// | Hoisting      | Imports hoisted (TDZ)          | require() runs at call point   |
// | `this`        | undefined (module scope)       | module.exports (empty object)  |
// | Top-level     | No `this`, `arguments`, `require` | Has all three                 |
// | Strict mode   | Always strict                  | Sloppy (unless "use strict")   |
// | File ext      | .mjs or package.json type:module | .cjs or .js (default)        |
// | Cycles        | Live (can work, complex)       | Copies (partial module object) |

// ── ESM `this` is undefined (not module.exports) ──
// ESM module:
console.log(this);  // undefined (ESM top-level `this` is always undefined)
// CommonJS module:
// console.log(this);  // {} (module.exports — empty object, not the real exports)

// ── ESM doesn't have `require` or `arguments` at top level ──
// ESM:
// require("./foo");        // ReferenceError: require is not defined
// console.log(arguments);  // ReferenceError: arguments is not defined
// To use require in ESM: import { createRequire } from "module";
// const require = createRequire(import.meta.url);
```
::

## Dynamic Import and Code Splitting

::code-wrapper{language="javascript"}
```javascript
// ── Dynamic import: returns a Promise (loads module on demand) ──
// Useful for code splitting (lazy loading), conditional loading, and SSR.

// Static import (loads immediately, part of the module graph):
// import heavyLib from "./heavy-lib.js";

// Dynamic import (loads on demand — code splitting):
const button = document.getElementById("load-chart");
button.addEventListener("click", async () => {
    // Only loads the chart library when the button is clicked:
    const { default: Chart } = await import("./chart-lib.js");
    new Chart(canvas, { type: "line", data: chartData });
});

// ── Conditional loading based on environment ──
async function getStorage() {
    if (typeof window !== "undefined") {
        return await import("./browser-storage.js");  // browser (localStorage)
    } else {
        return await import("./node-storage.js");       // Node (fs)
    }
}

// ── Loading multiple modules in parallel ──
const [users, posts] = await Promise.all([
    import("./api/users.js"),
    import("./api/posts.js"),
]);

// ── import() returns a namespace object (like import * as) ──
const module = await import("./math.js");
console.log(module.default);  // default export
console.log(module.add);     // named export
```
::

## Circular Dependencies

::code-wrapper{language="javascript"}
```javascript
// ── Circular dependency: A imports B, B imports A ──
// ESM handles cycles with live bindings (but can be tricky):
// a.js:
import { b } from "./b.js";
export const a = 1;
export function useB() { return b; }  // function delays access to b (b is available at call time)

// b.js:
import { a } from "./a.js";
export const b = 2;
export function useA() { return a; }  // function delays access to a (available at call time)

// app.js:
import { a, useB } from "./a.js";
console.log(a);    // 1 (a is fully evaluated)
console.log(useB());  // 2 (b is available — the function runs after both modules are evaluated)
// ⚠️ If b.js tried to use `a` at the top level (not in a function), it might get undefined
// during the cycle (a isn't evaluated yet when b.js runs).

// ── CommonJS circular dependency: partial exports ──
// cjs/a.js:
const { b } = require("./b.js");  // at this point, b.js hasn't finished executing
module.exports.a = 1;             // a is set after require returns

// cjs/b.js:
const { a } = require("./a.js");  // a is undefined! (a.js hasn't set module.exports.a yet)
module.exports.b = a + 1;         // NaN (undefined + 1)
// CJS: require() returns the PARTIAL module.exports object (what's been set so far).
// To avoid: defer access to functions (not top-level).

// ── Best practice: avoid circular dependencies (refactor shared code to a third module) ──
// If A and B both need each other, extract the shared logic to C:
// a.js → imports from c.js
// b.js → imports from c.js
// No cycle.
```
::

## Re-exports and Barrel Files

::code-wrapper{language="javascript"}
```javascript
// ── Re-export: forward exports from another module ──

// utils/index.js (barrel file — re-exports from multiple files):
export { add, subtract } from "./math.js";      // named re-export
export * as math from "./math.js";               // namespace re-export
export { default as MathUtils } from "./math.js"; // rename default to named
export { default } from "./default-thing.js";    // re-export default as default

// ── Import from the barrel (single import point) ──
// app.js:
import { add, math, MathUtils } from "./utils/index.js";

// ┚ Barrel files simplify imports but can prevent tree-shaking (bundler loads all re-exports)
// For tree-shaking: import directly from the source module, not the barrel.

// ── package.json exports (modern package entry points) ──
// package.json:
// {
//   "exports": {
//     ".": "./dist/index.js",              // main entry: import pkg from "pkg"
//     "./utils": "./dist/utils.js",        // subpath: import { x } from "pkg/utils"
//     "./package.json": "./package.json"   // allow importing package.json
//   }
// }
// `exports` restricts what can be imported — only listed paths are public.
// Older `main` field is the fallback if `exports` isn't set.
```
::

## Production Pattern: Feature-Flagged Module Loading

::code-wrapper{language="javascript"}
```javascript
// ── Load modules conditionally based on feature flags ──
const featureFlags = {
    newDashboard: true,
    legacyCharts: false,
};

async function loadDashboard() {
    if (featureFlags.newDashboard) {
        // Dynamic import: only loads the new dashboard if the flag is on
        const { renderDashboard } = await import("./new-dashboard.js");
        return renderDashboard;
    } else {
        const { renderDashboard } = await import("./old-dashboard.js");
        return renderDashboard;
    }
}

// ── Progressive loading: load critical path first, then lazy-load ──
async function bootstrap() {
    // Critical path: load immediately (static imports at top of file)
    // import { render } from "./core.js";

    // Non-critical: load after first paint
    await import("./analytics.js").then(({ init }) => init());
    await import("./error-reporting.js").then(({ init }) => init());

    // User-triggered: load on demand (button click, route change)
    // await import("./heavy-feature.js") when user clicks the feature
}
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript"}
```javascript
// ── `import.meta` for module metadata (ESM only) ──
console.log(import.meta.url);  // full URL of the current module
// Node: file:///path/to/module.js
// Browser: https://example.com/module.js

// ── Top-level await (ES2022, ESM only) ──
// In ESM, you can use await at the top level (no async wrapper needed):
// const config = await fetch("/config.json").then(r => r.json());
// export default config;
// ⚠️ Top-level await blocks all modules that depend on this one (they wait for it to resolve).

// ── `createRequire` for using CJS modules in ESM (Node) ──
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const cjsModule = require("./cjs-module.cjs");  // load a CommonJS module from ESM

// ── Tree-shaking: named exports enable static analysis ──
// Bundlers (Vite, esbuild, Rollup) can remove unused exports (tree-shaking):
import { used } from "./module.js";  // ✓ only `used` is bundled
import unused from "./module.js";   // default import — bundler can't tree-shake (whole module loaded)
// Named imports + ESM = tree-shakeable. CommonJS = not tree-shakeable (require is dynamic).

// ── `import type` for TypeScript (compile-time only, erased at runtime) ──
// import type { User, Config } from "./types.js";  // types only — erased by the bundler
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript"}
```javascript
// ── ESM imports are hoisted (and in TDZ until the module fully loads) ──
// You can use imports before the import statement (they're hoisted):
// console.log(add(1, 2));  // ✓ works (import is hoisted)
// import { add } from "./math.js";

// ── Default import name is arbitrary (named import must match) ──
// import foo from "./math.js";  // `foo` is whatever the default export is (name is arbitrary)
// import { add } from "./math.js";  // `add` must match the exported name (or use `as`)

// ── ESM file extension is required in the browser (not auto-resolved) ──
// Browser: import "./foo.js"  ✓ (extension required)
// Node: import "./foo" works (resolves .js, .mjs, /index.js) if package.json has type:module
// Bundlers (Vite, webpack): extension optional (they resolve at build time)

// ── Circular dependencies can cause undefined access ──
// If B runs before A (due to a cycle), B's import of A may be undefined at top level.
// Fix: defer access to functions (the cycle resolves by evaluation time).

// ── `module.exports` vs `export default` in CJS/ESM interop ──
// CJS: module.exports = function() {}  → ESM import: import foo from "cjs-module"
// CJS: module.exports = { fn: ... }     → ESM import: import { fn } from "cjs-module" (interop may vary)
// ESM in CJS: requires dynamic import (require() can't load ESM synchronously)

// ── Top-level await blocks dependent modules ──
// If module A uses top-level await, all modules that import A wait for it to resolve.
// This can slow down the entire module graph — use sparingly.

// ── `import()` can't be used with variables in the specifier (for security) ──
// const path = "./module.js";
// import(path);  // ✓ dynamic import allows variables (but it's a dynamic spec)
// import `${path}`;  // ✗ static import can't use variables (must be a string literal)
```
::

## 🧠 Quick Quiz

Why does this CommonJS code print `0` instead of `1`?

::code-wrapper{language="javascript"}
```javascript
// counter.cjs:
let count = 0;
function increment() { count++; }
module.exports = { count, increment };

// app.cjs:
const { count, increment } = require("./counter.cjs");
increment();
console.log(count);
```
::

<details>
<summary>Answer</summary>

`0`

CommonJS copies the exported **values** at `require()` time, not references. When `module.exports = { count, increment }` executes, `count` is `0` — the export captures a **copy** of the value `0`. When `increment()` runs, it increments the module's internal `count` (now 1), but the imported `count` in `app.cjs` is still `0` (it was copied at import time and doesn't reflect the change).

With ES Modules, `count` would be a **live binding** — the import would reflect the updated value (`1`).

**Fix (CommonJS)**: export a getter or an object:

```javascript
// counter.cjs:
module.exports = {
    get count() { return count; },  // getter reads the current value
    increment,
};
```

**The lesson**: CommonJS exports are copies (values at import time). ESM exports are live bindings (references that reflect the exporter's current value). This is the fundamental difference between the two module systems.

</details>