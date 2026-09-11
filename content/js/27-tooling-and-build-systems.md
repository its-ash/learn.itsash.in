---
title: "JavaScript 27 — Tooling & Build Systems: npm, ESLint, Vite & Bundler Internals"
description: "Deep-dive into JavaScript tooling: npm/pnpm package management, ESLint configuration and custom rules, Vite build internals (esbuild dev + Rollup prod), tree-shaking, and source maps. Code-first reference for senior engineers."
---

# 27 — Tooling & Build Systems: npm, ESLint, Vite & Bundler Internals

## npm/pnpm: Dependency Management

::code-wrapper{language="bash"}
```bash
# ── npm vs pnpm vs yarn ──
# npm: default, flat node_modules (duplicates shared deps)
# pnpm: symlinked node_modules (saves disk, strict — no undeclared access)
# yarn: alternate (Plug'n'Play in v2+ — no node_modules)

# ── Install (saves to dependencies) ──
npm install express           # install + add to package.json dependencies
npm install -D vitest         # install as devDependency (-D)
npm install -g typescript     # install globally (-g)

# ── Install from git ──
npm install github:user/repo           # from GitHub
npm install github:user/repo#branch    # specific branch
npm install git+https://github.com/user/repo.git

# ── Install exact version (no ^ or ~) ──
npm install express@4.18.2    # exact version
npm install express@^4.18.0   # caret: >=4.18.0 <5.0.0 (minor + patch)
npm install express@~4.18.0   # tilde: >=4.18.0 <4.19.0 (patch only)

# ── package.json scripts ──
# "scripts": {
#   "dev": "vite",
#   "build": "vite build",
#   "test": "vitest",
#   "lint": "eslint .",
#   "format": "prettier --write ."
# }
npm run dev        # runs the "dev" script
npm test           # shortcut for npm run test
npx vite           # run a local binary without installing globally

# ── lock files (npm-shrinkwrap.json, package-lock.json, pnpm-lock.yaml) ──
# Always commit the lock file — ensures reproducible installs across machines.
# npm ci: clean install (uses lock file, removes node_modules, faster than npm install)
```
::

## ESLint: Configuration and Rules

::code-wrapper{language="javascript"}
```javascript
// ── eslint.config.js (flat config — ESLint 9+) ──
import js from "@eslint/js";
import globals from "globals";

export default [
    js.configs.recommended,  // base recommended rules
    {
        files: ["**/*.js"],
        languageOptions: {
            globals: { ...globals.browser, ...globals.node },  // browser + Node globals
            ecmaVersion: 2024,
            sourceType: "module",  // ESM
        },
        rules: {
            "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],  // warn, ignore _-prefixed
            "no-console": ["warn", { allow: ["warn", "error"] }],  // warn on console.log
            "eqeqeq": ["error", "always", { null: "ignore" }],  // === only (except == null)
            "no-undef": "error",  // error on undeclared variables
            "prefer-const": "error",  // error if let can be const
            "no-var": "error",  // error on var (use let/const)
            "arrow-spacing": "error",  // enforce spaces in arrow functions
            "no-duplicate-imports": "error",  // combine imports
            "no-return-await": "off",  // allow return await (for finally blocks)
        },
    },
    {
        files: ["**/*.test.js"],  // relaxed rules for test files
        rules: {
            "no-console": "off",  // allow console.log in tests
        },
    },
    {
        ignores: ["dist/**", "node_modules/**", "coverage/**"],  // exclude
    },
];

// ── Key ESLint rules for production ──
// eqeqeq: enforce === (prevent == coercion bugs)
// no-unused-vars: catch unused variables (dead code)
// prefer-const: catch let that should be const
// no-var: prevent var (use let/const for block scoping)
// no-throw-literal: must throw Error objects (not strings)
// no-return-await: return await vs return Promise (minor perf, but better stack traces)
```
::

## Vite: Dev Server and Build Internals

::code-wrapper{language="javascript"}
```javascript
// ── Vite architecture: esbuild for dev, Rollup for production ──
//
// DEV MODE (vite dev):
//   - Native ESM: serves modules directly to the browser (no bundling)
//   - esbuild: transpiles TypeScript/JSX on the fly (very fast — Go-based)
//   - HMR (Hot Module Replacement): updates changed modules without full reload
//   - Dependencies are pre-bundled with esbuild (node_modules → single optimized chunk)
//
// PRODUCTION MODE (vite build):
//   - Rollup: bundles the app into optimized chunks (tree-shaking, code splitting)
//   - Minification: esbuild or terser (esbuild is faster, terser is smaller)
//   - CSS: extracted and minified
//   - Assets: images, fonts inlined or emitted as files

// ── vite.config.js ──
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],  // React support (JSX, Fast Refresh)
    resolve: {
        alias: {
            "@": "/src",  // import from "@/components/..." → /src/components/...
        },
    },
    build: {
        target: "es2022",  // output target (browsers that support ES2022)
        outDir: "dist",
        minify: "esbuild",  // "esbuild" (fast) or "terser" (smaller) or false
        sourcemap: true,     // emit source maps
        rollupOptions: {
            output: {
                manualChunks: {  // manual code splitting
                    "react-vendor": ["react", "react-dom"],
                    "utils": ["lodash", "dayjs"],
                },
            },
        },
    },
    server: {
        port: 3000,
        proxy: {  // dev proxy (avoid CORS during development)
            "/api": { target: "http://localhost:8080", changeOrigin: true },
        },
    },
});
```
::

## Tree-Shaking and Code Splitting

::code-wrapper{language="javascript"}
```javascript
// ── Tree-shaking: bundler removes unused exports (dead code elimination) ──
// Only works with ESM (static import/export — analyzable at build time).
// CommonJS (require) can't be tree-shaken (require is dynamic — can't analyze statically).

// ── ESM (tree-shakeable) ──
// math.js:
export const add = (a, b) => a + b;
export const subtract = (a, b) => a - b;  // unused by app → tree-shaken (removed)
// app.js:
import { add } from "./math.js";  // only `add` is bundled (subtract is removed)

// ── Side effects in modules can prevent tree-shaking ──
// If a module has side effects (top-level code that modifies global state),
// the bundler can't safely remove it even if its exports are unused.
// package.json: "sideEffects": false  → tell the bundler this package has no side effects
// "sideEffects": ["./polyfill.js"]  → except this file (has side effects)

// ── Code splitting: load code on demand (reduce initial bundle) ──
// Static import: loaded immediately (part of the initial bundle)
import { critical } from "./critical.js";

// Dynamic import: loaded on demand (separate chunk — lazy loaded)
const lazyModule = await import("./heavy-feature.js");
// Vite/Rollup creates a separate chunk for heavy-feature.js (loaded when import() runs)

// ── Manual chunks (vendor splitting) ──
// vite.config.js: rollupOptions.output.manualChunks
// Splits large vendor libs (react, lodash) into separate chunks (cached independently)

// ── Prefetch and preload hints ──
// <link rel="modulepreload" href="/chunk.js">  → load early (high priority, for critical chunks)
// <link rel="prefetch" href="/lazy.js">        → load when idle (low priority, for future navigation)
```
::

## Source Maps

::code-wrapper{language="javascript"}
```javascript
// ── Source maps: map minified code back to the original source ──
// Essential for debugging production code (stack traces, breakpoints).

// ── Source map types ──
// inline: embedded in the JS file (//# sourceMappingURL=data:...)
// external: separate .js.map file (//# sourceMappingURL=app.js.map)
// hidden: generated but no sourceMappingURL comment (for error reporting tools)

// ── Vite source map config ──
// vite.config.js:
// build: { sourcemap: true }       → external .map files
// build: { sourcemap: "inline" }   → inline in the JS
// build: { sourcemap: "hidden" }   → no comment (for Sentry/etc.)

// ── Source map structure (simplified) ──
// {
//   "version": 3,
//   "sources": ["src/app.js", "src/utils.js"],  // original source files
//   "names": ["add", "subtract", "result"],     // original variable names
//   "mappings": "AAAA,CAAC...",                  // VLQ-encoded position mappings
//   "file": "app.min.js",                        // generated file
//   "sourcesContent": ["const add = ..."]        // original source content (optional)
// }
// Mappings encode: generated position → original position (file, line, column, name)

// ── Stack trace with source maps ──
// Without source maps: "Error at a.min.js:1:234" (minified — useless)
// With source maps: "Error at add (src/math.js:3:12)" (original — debuggable)
```
::

## 💡 Tips & Tricks

::code-wrapper{language="bash"}
```bash
# ── npm audit: check for known vulnerabilities ──
npm audit              # list vulnerabilities
npm audit fix          # auto-fix (updates vulnerable deps)
npm audit fix --force  # breaking fixes (major version bumps)

# ── nvm/fnm: manage Node versions ──
nvm install 20         # install Node 20
nvm use 20             # switch to Node 20
nvm alias default 20   # set default
# .nvmrc file: "20" → nvm use automatically reads it

# ── npx: run a package's binary without installing globally ──
npx create-vite my-app  # run create-vite without global install
npx prettier --write .  # run the local prettier (from node_modules/.bin)

# ── npm scripts with cross-env (cross-platform env vars) ──
# "scripts": { "dev": "cross-env NODE_ENV=development vite" }
# Without cross-env: NODE_ENV=dev vite (Unix only — doesn't work on Windows)
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript"}
```javascript
// ── CommonJS can't be tree-shaken (require is dynamic) ──
// require("./module") → bundler can't know which exports are used at build time.
// Use ESM (import/export) for tree-shaking.

// ── `import * as namespace` prevents tree-shaking ──
// import * as utils from "./utils.js";  → bundler must include ALL exports (can't shake)
// import { used } from "./utils.js";   → only `used` is bundled (shakeable)

// ── Side effects prevent tree-shaking ──
// If a module modifies global state (polyfills, prototypes), it can't be removed.
// Declare side effects in package.json: "sideEffects": ["./polyfill.js"]

// ── `npm install` updates the lock file; `npm ci` uses it strictly ──
// npm install: may change versions (resolves to latest within range)
// npm ci: strictly uses the lock file (reproducible — use in CI)

// ── Dev dependencies are not installed in production ──
// npm install --production → only dependencies (no devDependencies)
// Don't import devDependencies in production code (eslint, vitest, etc.)

// ── `^` and `~` in package.json ──
// ^1.2.3: >=1.2.3 <2.0.0 (caret — allows minor and patch updates)
// ~1.2.3: >=1.2.3 <1.3.0 (tilde — allows patch updates only)
// 1.2.3: exact version (no updates)
// Use ^ for libraries (flexible), pin exact versions for critical deps.
```
::

## 🧠 Quick Quiz

Why might tree-shaking fail to remove an unused export?

::code-wrapper{language="javascript"}
```javascript
// utils.js
export const used = () => "hello";
export const unused = () => {
    console.log("side effect on import");
    return "unused";
};
```
::

<details>
<summary>Answer</summary>

If `unused` has **side effects** (like `console.log` at the top level, or modifying global state), the bundler can't safely remove it — the side effect might be needed for correctness.

In this case, `unused` is a function — the `console.log` is inside the function body, so it only runs when `unused` is called. If `unused` is never called, it CAN be tree-shaken (the side effect never executes).

**But** if the module has top-level side effects:

```javascript
// utils.js
console.log("module loaded");  // top-level side effect → runs on import
export const used = () => "hello";
export const unused = () => "unused";
```

The bundler can't remove `console.log` (it runs on import) — so the entire module must be included, even if only `used` is imported.

**Fix**: declare `"sideEffects": false` in `package.json` (if truly no side effects), or list specific files with side effects:

```json
{ "sideEffects": false }  // bundler can freely tree-shake all exports
{ "sideEffects": ["./polyfill.js"] }  // except this file
```

**The lesson**: tree-shaking requires (1) ESM (static imports), (2) no side effects (or declared side effects), and (3) no namespace imports (`import * as`). Side effects at the module top level prevent the bundler from removing unused exports.

</details>