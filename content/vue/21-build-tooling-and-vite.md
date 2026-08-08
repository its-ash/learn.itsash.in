# 21 — Build Tooling & Vite

## Why Vite, and What It's Actually Doing

Vite runs two entirely different strategies depending on whether you're developing or shipping. In development, it serves your source files over native ES modules — the browser itself resolves `import` statements, and Vite only transforms the specific file being requested, on demand. There is no bundling step at all during `npm run dev`, which is why Vite's dev server starts in milliseconds regardless of project size — a webpack-style bundler has to walk and bundle the whole dependency graph before it can serve anything, while Vite only ever does work for files the browser actually asks for. For production, Vite switches to Rollup under the hood to produce a fully bundled, tree-shaken, minified build — the on-demand dev-time model would be far too many HTTP requests for a real production page load.

::code-wrapper{language="bash"}
```bash
npm create vue@latest my-app
cd my-app
npm install

npm run dev      # unbundled, native-ESM dev server
npm run build     # Rollup-based production bundle in dist/
npm run preview   # serves the dist/ build locally, to sanity-check it before deploying
```
::

## Anatomy of `vite.config.js`

::code-wrapper{language="javascript" filename="vite.config.js"}
```javascript
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      // '@/components/Foo.vue' resolves the same way from any file,
      // regardless of how deeply nested that file is
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    proxy: {
      // requests to /api/* during dev are forwarded to the real backend —
      // avoids CORS entirely in local development, since the browser only
      // ever sees same-origin requests to the Vite dev server itself
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  },
  build: {
    sourcemap: true,
    outDir: 'dist',
    chunkSizeWarningLimit: 600
  }
})
```
::

`@vitejs/plugin-vue` is what teaches Vite to understand `.vue` Single File Components at all — without it, Vite has no idea what to do with a `<template>`/`<script>`/`<style>` file; the plugin compiles the template to a render function and wires up `<script setup>` compiler macros (`defineProps`, `defineEmits`, and the rest from earlier chapters) at build time.

## Environment Variables

Vite exposes environment variables through `import.meta.env`, loaded from `.env` files at the project root — but only variables prefixed `VITE_` are actually exposed to client-side code, by design:

::code-wrapper{language="ini" filename=".env"}
```ini
VITE_API_BASE_URL=https://api.example.com
VITE_FEATURE_NEW_CHECKOUT=true

DATABASE_PASSWORD=super-secret-value
```
::

::code-wrapper{language="javascript"}
```javascript
console.log(import.meta.env.VITE_API_BASE_URL)      // 'https://api.example.com'
console.log(import.meta.env.DATABASE_PASSWORD)       // undefined — not exposed, by design
console.log(import.meta.env.MODE)                    // 'development' or 'production'
console.log(import.meta.env.PROD)                    // boolean
console.log(import.meta.env.DEV)                     // boolean
```
::

Unprefixed variables are deliberately excluded from the client bundle — this is the load-bearing security boundary that prevents an accidental `DATABASE_PASSWORD` or API secret key from silently ending up shipped in publicly-readable JavaScript. Chapter 22 covers why that matters concretely; the mechanism to internalize here is simply that the `VITE_` prefix is not a naming convention you can skip, it's an allowlist.

::code-wrapper{language="bash"}
```bash
# mode-specific files, loaded based on --mode or the build command
.env                # loaded in all modes
.env.local          # loaded in all modes, git-ignored — for local secrets/overrides
.env.production      # loaded only for `vite build` (mode=production)
.env.development     # loaded only for `vite dev` (mode=development)
```
::

A `.env.local` (and `.env.*.local`) file should always be in `.gitignore` — it exists specifically as the place for values that differ per developer or must never be committed, distinct from `.env`/`.env.production`, which typically *are* committed since they contain no secrets by construction (only `VITE_`-prefixed values a browser will see anyway).

## Code Splitting

Vite code-splits automatically at two levels: dynamic `import()` boundaries (which chapter 11's lazy routes and chapter 14's `defineAsyncComponent` both rely on) and shared-dependency extraction across those boundaries:

::code-wrapper{language="javascript" filename="router/index.js"}
```javascript
const routes = [
  // each of these becomes its own chunk, fetched only when the user
  // actually navigates to that route — not part of the initial bundle
  { path: '/', component: () => import('@/views/HomeView.vue') },
  { path: '/reports', component: () => import('@/views/ReportsView.vue') },
  { path: '/admin', component: () => import('@/views/AdminView.vue') }
]
```
::

For finer control over how vendor code is grouped, `build.rollupOptions.output.manualChunks` lets you separate large, stable third-party dependencies (that rarely change) from your own application code (that changes on every deploy) — this improves long-term caching, since users who already have the vendor chunk cached don't need to re-download it just because your app code changed:

::code-wrapper{language="javascript" filename="vite.config.js"}
```javascript
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-vue': ['vue', 'vue-router', 'pinia'],
          'vendor-charts': ['chart.js', 'vue-chartjs']
        }
      }
    }
  }
})
```
::

Overusing manual chunking is a real trap — splitting too finely creates many small chunks, each with its own HTTP request/round-trip overhead, which can be *slower* overall than a moderately-sized single vendor chunk under HTTP/1.1, and even under HTTP/2's multiplexing still adds parsing/evaluation overhead per chunk; the default heuristic Rollup applies is a reasonable starting point, and manual overrides are worth reaching for only after measuring an actual problem in a production build.

## Analyzing Bundle Size

::code-wrapper{language="bash"}
```bash
npm install -D rollup-plugin-visualizer
```
::

::code-wrapper{language="javascript" filename="vite.config.js"}
```javascript
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    vue(),
    visualizer({ open: true, gzipSize: true, brotliSize: true })
  ]
})
```
::

Running `npm run build` with this plugin active produces an interactive treemap of exactly what's in the final bundle and how large each piece is — the single most useful first step when a build's size grows unexpectedly, since it turns "the bundle got bigger" into "this specific dependency got bigger," which is an actionable, fixable statement.

## Tree-Shaking and Its Limits

Rollup removes exports that are never imported anywhere (tree-shaking) — but this only works reliably for genuine ES modules with static, analyzable `import`/`export` statements:

::code-wrapper{language="javascript"}
```javascript
// WRONG for tree-shaking — imports the entire library's default export as one
// opaque object; Rollup cannot statically prove which properties are unused
import _ from 'lodash'
const result = _.debounce(fn, 300)

// RIGHT — named ES module import; unused exports from the package are
// excluded from the final bundle entirely
import { debounce } from 'lodash-es'
const result = debounce(fn, 300)
```
::

A library shipped only as CommonJS (`module.exports = ...`), or one with side effects at module scope that Rollup can't prove are safe to skip, defeats tree-shaking regardless of how you import from it — checking a dependency's bundle-size impact (via the visualizer above, or a tool like Bundlephobia) before adopting it is a cheap habit that avoids discovering a 200KB dependency for a function you use once.

## Multi-Page Apps and Library Mode

Vite isn't limited to single-page apps — a multi-page build point at several HTML entry files, and library mode produces a distributable package instead of an app:

::code-wrapper{language="javascript" filename="vite.config.js"}
```javascript
import { resolve } from 'node:path'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin/index.html')
      }
    }
  }
})
```
::

::code-wrapper{language="javascript" filename="vite.config.js"}
```javascript
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: 'MyComponentLibrary',
      fileName: (format) => `my-lib.${format}.js`
    },
    rollupOptions: {
      // don't bundle Vue itself into the library — consumers provide it
      external: ['vue'],
      output: { globals: { vue: 'Vue' } }
    }
  }
})
```
::

The `external`/`globals` pairing above is the detail most often missed when publishing a component library: bundling Vue *into* the library means a consuming app ends up with two separate Vue instances (its own, plus the one baked into your library), which breaks reactivity and component identity across the boundary in confusing, hard-to-diagnose ways — marking `vue` external is what makes the library correctly share the host app's single Vue instance instead.

## Build Optimization Checklist

- **Compression** — serve pre-compressed Brotli/gzip assets (`vite-plugin-compression`) rather than relying solely on server-side on-the-fly compression, which costs CPU on every request.
- **Legacy browser support** — `@vitejs/plugin-legacy` generates a second, transpiled-and-polyfilled bundle for older browsers, served conditionally via `<script type="module">`/`nomodule`, so modern browsers pay none of that cost.
- **CSS code splitting** — enabled by default; CSS for a lazy-loaded route ships in that route's own chunk rather than the global stylesheet, mirroring the JS splitting behavior.
- **Preload directives** — Vite automatically injects `<link rel="modulepreload">` for a chunk's known dependencies, so the browser can start fetching them before the parent chunk finishes executing.

## 💡 Tips & Tricks

- **Performance** — Run `rollup-plugin-visualizer` after any dependency addition, not just when investigating a known problem — catching a large, unexpectedly-heavy dependency at the moment it's added is far cheaper than discovering it during a later performance audit.
- **Idiom** — Default to named ES module imports (`import { debounce } from 'lodash-es'`) over a library's CommonJS or default-object export whenever an ES module build exists — this is frequently the single biggest, lowest-effort bundle-size win available in a real project.
- **Debug** — `import.meta.env.MODE` is readable at runtime and is a reliable way to confirm which `.env` file actually got loaded, when a variable "isn't showing up" as expected — cheaper than guessing about `.env` file precedence rules.
- **Portability** — Keep `.env.local` (and any `.env.*.local` variant) in `.gitignore` from the very first commit of a project, before any secret is ever added to it — retroactively scrubbing a committed secret out of git history is a much bigger job than never committing it.
- **Performance** — `manualChunks` is a measure-first tool, not a default — Rollup's built-in chunking heuristic is already reasonable, and hand-splitting too aggressively can add more round-trip overhead than it saves.

## ⚠️ Edge Cases & Gotchas

- **A variable without the `VITE_` prefix is silently `undefined` in client code — not an error, not a warning** — A typo like `VITEE_API_KEY` or simply forgetting the prefix produces no build failure at all; the app just behaves as though the variable was never set, which can look like an unrelated bug (a feature flag that "never turns on") far from the actual cause.
- **`.env` values are inlined into the bundle as plain-text string replacements at build time, not read at runtime** — Changing a `VITE_`-prefixed variable on a production server *after* the build was already run has no effect at all until the app is rebuilt — this differs from typical server-side environment variables, and assuming "restart the server" is enough is a common, confusing mistake.
- **A CommonJS-only dependency defeats tree-shaking even when you only import one named function from it** — `import { pick } from 'some-cjs-lib'` still typically pulls in the entire library at runtime, because Rollup can't statically analyze `module.exports` the way it can real ES module syntax — check a library's module format before assuming a named import saves bundle size.
- **Bundling `vue` into a published component library instead of marking it `external` produces two separate Vue runtime instances at once inside a consuming app** — Components render, but reactivity, `provide`/`inject`, and component identity checks across the library/app boundary break in ways that look like unrelated bugs and are genuinely confusing to trace back to "duplicate Vue instance" without knowing to suspect it.
- **`server.proxy` only affects the Vite dev server — it does not exist in the production build at all** — Code that silently relies on the dev proxy rewriting `/api/*` will hit a real CORS failure or 404 in production unless the actual deployed backend is reachable at that same path, which is a dev-only convenience easy to forget is dev-only.

## 🧠 Spot the Bug

A team ships a component library. It works fine in their own demo app, but every consuming app reports that `provide`/`inject` between the library's components and the host app's components silently doesn't work, and Pinia stores created in the host app appear "empty" inside the library's components.

::code-wrapper{language="javascript" filename="vite.config.js"}
```javascript
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: 'UiKit',
      fileName: (format) => `ui-kit.${format}.js`
    }
  }
})
```
::

<details>
<summary>Answer</summary>

There's no `rollupOptions.external` entry for `vue`. Without it, Rollup bundles a full copy of the Vue runtime directly into the library's output file — so a consuming app ends up running *two independent Vue instances* side by side: its own (from its own `node_modules`), and the one baked into the library bundle. Each instance has its own separate reactivity system and its own separate `provide`/`inject` registry, so a value provided by the host app is invisible to the library's bundled-in Vue instance, and vice versa — they're not the same runtime, just two copies that happen to both be named "Vue."

::code-wrapper{language="javascript" filename="vite.config.js"}
```javascript
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: 'UiKit',
      fileName: (format) => `ui-kit.${format}.js`
    },
    rollupOptions: {
      external: ['vue'],
      output: {
        globals: { vue: 'Vue' }
      }
    }
  }
})
```
::

With `vue` marked `external`, the library's build assumes the consuming app provides its own Vue instance (as a peer dependency) instead of bundling one — both the host app and the library components now genuinely share a single Vue runtime, so `provide`/`inject` and Pinia state resolve correctly across the boundary.

**The lesson**: any library meant to be consumed by a separate Vue app must mark `vue` (and typically `vue-router`/`pinia`, if it uses them internally) as an external peer dependency — bundling the framework itself into a library is invisible in the library's own demo/test app (which only ever has one Vue instance) and only surfaces once a real, separate consuming app is involved.

</details>

## Key Takeaways

- Vite serves unbundled native ES modules in development for near-instant startup, and switches to a Rollup-based bundled build for production — these are two genuinely different strategies, not the same pipeline running faster.
- Only environment variables prefixed `VITE_` are exposed to client code via `import.meta.env` — this is a deliberate allowlist boundary, not a naming convention, and prevents accidental secret leakage into the bundle.
- `.env` values are inlined at build time, not read at runtime — changing one on a server requires a rebuild, unlike typical server-side environment variables.
- Dynamic `import()` at route and component boundaries drives automatic code splitting; `manualChunks` offers finer control but is a measure-first tool, not a default optimization.
- Tree-shaking requires genuine, statically-analyzable ES module syntax — CommonJS dependencies and default-object imports (`import _ from 'lodash'`) defeat it even when only one function is actually used.
- When building a component library, mark the framework (`vue`, and any framework-adjacent libraries it uses) as `external` — bundling it in creates duplicate runtime instances that break `provide`/`inject` and shared state across the library/host-app boundary.
