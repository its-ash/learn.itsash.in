---
title: Vue 3 Engineering Reference — Build Tooling & Vite
description: Vite dev server HMR internals, plugin pipeline, production build optimization, environment variables, CSS code splitting, and alias configuration.
---

# 21 — Build Tooling & Vite

## Vite Dev Server — HMR (Hot Module Replacement)

::code-wrapper{language="typescript" filename="hmr-internals.ts"}
```typescript
// ── Vite dev server architecture: ──────────────────────
// 1. Native ES modules: browser loads modules via <script type="module">
//    No bundling in dev — each .vue/.ts/.css file is served as a separate module.
// 2. On file change: Vite notifies the browser via WebSocket.
// 3. Browser re-fetches ONLY the changed module + its dependencies.
// 4. Vue SFC HMR: if only <template> changes → re-render only (preserve state).
//    If <script> changes → full component reload (state lost).
//    If <style> changes → CSS hot-swap (no JS reload at all).

// ── HMR API for composables: accept module replacement ──
import { defineComponent, ref } from 'vue'

if (import.meta.hot) {
  // ── import.meta.hot.accept: handle this module's own replacement ──
  import.meta.hot.accept((newModule) => {
    // This callback runs when THIS module is hot-updated.
    // newModule is the new version of this module's exports.
    // Use to: re-run initialization, migrate state to new module.
  })

  // ── import.meta.hot.dispose: cleanup before replacement ──
  import.meta.hot.dispose((data) => {
    // `data` is an object passed to the new module's accept callback.
    // Use to: save state, clear timers, remove event listeners.
    clearInterval(myTimer)
    data.savedState = myRef.value  // pass to new module
  })
}
```
::

## Vite Plugin Pipeline — Vue SFC Compilation

::code-wrapper{language="typescript" filename="vite.config.ts"}
```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    // ── @vitejs/plugin-vue: compiles .vue files to JS ──
    // Handles: <template> → render function, <script setup> → setup(),
    // <style scoped> → CSS with data-v attributes.
    vue(),

    // ── @vitejs/plugin-vue-jsx: enables JSX in .tsx files ──
    // Uses @vue/babel-plugin-jsx under the hood.
    vueJsx(),

    // ── vite-plugin-vue-devtools: in-browser DevTools ──
    vueDevTools(),

    // ── unplugin-auto-import: auto-import Vue APIs ──
    // No need for: import { ref, computed } from 'vue'
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia'],
      dts: 'src/types/auto-imports.d.ts',  // TS declaration for intellisense
    }),

    // ── unplugin-vue-components: auto-import components ──
    // No need for: import MyComponent from './MyComponent.vue'
    Components({
      dirs: ['src/components'],
      extensions: ['vue'],
      dts: 'src/types/components.d.ts',
      // ── resolvers: auto-import from UI libraries ──
      // resolvers: [ElementPlusResolver()],
    }),
  ],

  resolve: {
    alias: {
      // ── @ → /src: enables import Foo from '@/components/Foo.vue' ──
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  // ── Environment variables: prefixed with VITE_ ──
  // Access via: import.meta.env.VITE_API_BASE
  // Only VITE_-prefixed vars are exposed to the client (security: other vars stay server-side).
  // Defined in .env, .env.development, .env.production (loaded based on mode).
})
```
::

## Environment Variables — .env Files

::code-wrapper{language="bash" filename=".env"}
```bash
# ── .env: loaded in all modes ──────────────────────────
VITE_API_BASE=http://localhost:3000/api
VITE_APP_TITLE=My Vue App

# ── .env.development: dev mode only (npm run dev) ───────
# .env.development
VITE_API_BASE=http://localhost:3000/api
VITE_DEBUG=true

# ── .env.production: production build only ──────────────
# .env.production
VITE_API_BASE=https://api.myapp.com
VITE_DEBUG=false

# ── .env.local: local overrides, gitignored ─────────────
# .env.local — loaded in ALL modes, highest priority
VITE_API_KEY=my-secret-key  # never committed to git

# ── Access in code: ────────────────────────────────────
# import.meta.env.VITE_API_BASE  → string (always string, even if "true")
# import.meta.env.DEV           → boolean (true in dev mode)
# import.meta.env.PROD          → boolean (true in production)
# import.meta.env.MODE          → string ('development' | 'production' | 'test')
# import.meta.env.BASE_URL      → string (from vite.config base option)
# import.meta.env.SSR           → boolean (true during SSR build)
```
::

## Production Build — Optimization Configuration

::code-wrapper{language="typescript" filename="build-optimization.ts"}
```typescript
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    // ── target: browser feature level for output JS ──
    // 'esnext': modern browsers only (smaller, no polyfills)
    // 'es2015': broader support (larger, includes polyfills)
    target: 'esnext',

    // ── outDir: output directory (default: 'dist') ──
    outDir: 'dist',

    // ── sourcemap: production source maps ──
    // true: full sourcemaps (large, for error tracking)
    // 'hidden': sourcemaps generated but not linked (upload to Sentry, etc.)
    // false: no sourcemaps (smallest, hardest to debug)
    sourcemap: 'hidden',

    // ── minify: minification tool ──
    // 'esbuild': fast, good default (Vite's default)
    // 'terser': slower, slightly smaller output
    // false: no minification (debug builds)
    minify: 'esbuild',

    // ── cssCodeSplit: split CSS per-chunk ──
    // true (default): each async chunk gets its own CSS file (lazy-loaded)
    // false: all CSS in one file (fewer requests, larger initial load)
    cssCodeSplit: true,

    // ── rollupOptions: advanced build customization ──
    rollupOptions: {
      output: {
        // ── manualChunks: split vendor code for caching ──
        manualChunks: {
          'vendor-vue': ['vue', 'vue-router', 'pinia'],
          'vendor-ui': ['@vueuse/core'],
        },
        // ── Asset naming: deterministic for cache stability ──
        chunkFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
      },
      // ── external: don't bundle these (load via CDN or other means) ──
      // external: ['vue', 'vue-router'],
    },

    // ── chunkSizeWarningLimit: raise if vendor chunks are large ──
    chunkSizeWarningLimit: 600,
  },

  // ── esbuild: esbuild-specific options ──
  esbuild: {
    // ── drop: strip console.log and debugger in production ──
    drop: ['console', 'debugger'],  // only in production builds
  },
})
```
::

## CSS Processing — Scoped, Modules, and Preprocessors

::code-wrapper{language="vue" filename="CssPatterns.vue"}
```vue
<!-- ── 1. Scoped CSS: component-scoped via data-v-<hash> ── -->
<!-- Compiler rewrites .btn → .btn[data-v-abc123] at build time. -->
<!-- No runtime cost — pure build-time transformation. -->
<style scoped>
.btn { color: red; }
/* Deep selector: ::v-deep (or :deep()) pierces scoped boundary */
:deep(.child-class) { font-weight: bold; }
/* ⚠️ :deep() is an escape hatch — breaks encapsulation. Use sparingly. */
</style>

<!-- ── 2. CSS Modules: class names become camelCase JS properties ── -->
<style module>
.btn { color: red; }
.container { max-width: 1200px; }
</style>
<!-- Access: $style.btn, $style.container in template -->
<!-- <div :class="$style.btn"> — hashed class names, no conflicts -->

<!-- ── 3. v-bind in CSS: reactive CSS values ── -->
<style scoped>
.header {
  color: v-bind('themeColor');  /* reads themeColor from <script setup> */
  font-size: v-bind('fontSize + "px"');  /* arbitrary JS expression */
}
</style>
```

::code-wrapper{language="scss" filename="preprocessor.scss"}
```scss
/* ── Sass/SCSS: use lang="scss" on <style> ── */
/* vite.config: no extra config needed — Vite auto-detects .scss */
<style lang="scss" scoped>
$primary: #42b883;

.btn {
  color: $primary;
  &:hover { color: darken($primary, 10%); }
}

/* ── CSS variables with SCSS: use :root for global, scoped for local ── */
:root {
  --primary: #{$primary};  /* SCSS variable → CSS custom property */
}
</style>
```
::

## 💡 Tips & Tricks

::code-wrapper{language="typescript" filename="tips.ts"}
```typescript
// ── 1. import.meta.glob: lazy-load all files matching a pattern ──
const modules = import.meta.glob('./views/*.vue')
// Returns: { './views/Home.vue': () => import('./views/Home.vue'), ... }
// Useful for: dynamic route generation, auto-registering all components.

// ── 2. import.meta.glob with eager option ──
const modules = import.meta.glob('./utils/*.ts', { eager: true })
// All modules loaded synchronously (no lazy import), default exports available.

// ── 3. Vite define: compile-time constants ──
define: { __APP_VERSION__: JSON.stringify(pkg.version) }
// Access: __APP_VERSION__ in code — replaced at build time, no runtime cost.

// ── 4. resolve.dedupe: deduplicate shared deps ──
resolve: { dedupe: ['vue'] }
// If multiple versions of 'vue' are in node_modules (monorepo), dedupe to one.

// ── 5. server.proxy: proxy API requests in dev ──
server: {
  proxy: {
    '/api': 'http://localhost:3000',  // forward /api to backend
  },
}
// Avoids CORS in dev — requests go through Vite dev server to backend.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="typescript" filename="edge-cases.ts"}
```typescript
// ── 1. Only VITE_-prefixed env vars are exposed to client ──
// DB_PASSWORD=secret in .env → import.meta.env.DB_PASSWORD is undefined.
// Vite strips non-VITE_ vars for security. Rename: VITE_DB_PASSWORD.

// ── 2. import.meta.env values are ALWAYS strings ──
// VITE_DEBUG=true → "true" (string), not boolean.
// Must parse: const debug = import.meta.env.VITE_DEBUG === 'true'

// ── 3. :deep() breaks scoping — use only when necessary ──
// Parent styling child internals couples components. Prefer props/emit.
// If needed, scope tightly: :deep(.specific-class) not :deep(*).

// ── 4. v-bind() in CSS creates a reactive dependency ──
// Changing the bound value re-generates the CSS (inline style on element).
// Not free — don't use for frequently-changing values (perf cost).

// ── 5. manualChunks with shared deps can cause circular chunks ──
// If chunk A and B both depend on C, C becomes its own chunk.
// Plan chunks carefully — misaligned splits cause extra requests.

// ── 6. Vite dev (unbundled) vs prod (bundled) can mask issues ──
// Code that works in dev (native ESM, no tree-shaking) may break in prod
// (aggressive tree-shaking, minification). Test both modes regularly.
```
::

## 🧠 Spot the Bug

A component reads an environment variable but gets `undefined` in the browser.

::code-wrapper{language="typescript" filename="EnvBug.ts"}
```typescript
// .env
// API_KEY=my-secret-key

// Component
const apiKey = import.meta.env.API_KEY  // undefined in browser
fetch(`${apiBase}/data`, { headers: { Authorization: `Bearer ${apiKey}` } })
```
::

<details>
<summary>Answer</summary>

The env variable is named `API_KEY`, but Vite only exposes variables prefixed with `VITE_` to client-side code. `API_KEY` is stripped for security — it could be a server secret that shouldn't be in the browser bundle.

**Fix** — rename to `VITE_API_KEY`:

::code-wrapper{language="bash" filename=".env"}
```bash
# .env
VITE_API_KEY=my-secret-key  # VITE_ prefix → exposed to client
```

::code-wrapper{language="typescript" filename="EnvFixed.ts"}
```typescript
const apiKey = import.meta.env.VITE_API_KEY  // "my-secret-key"
```
::

**The lesson**: only `VITE_`-prefixed environment variables are injected into client-side code via `import.meta.env`. Non-prefixed variables are intentionally excluded to prevent accidentally leaking server secrets to the browser.

</details>