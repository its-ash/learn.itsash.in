---
title: "01 — Introduction & Setup"
description: "React's declarative rendering model, virtual DOM diffing, project scaffolding with Vite, Strict Mode behavior, and the JSX-to-JS compilation pipeline. Code-first reference for mid-to-senior React engineers."
---

# 01 — Introduction & Setup

## What React Actually Is

::code-wrapper{language="javascript" filename="react_core_model.js"}
```javascript
// React = a declarative, component-based UI library. Not a framework.
// No router, no data layer, no state manager. ONE job: keep the UI in sync
// with your data via virtual DOM diffing and unidirectional data flow.

// THE MENTAL MODEL:
//   state → render → virtual DOM → diff → commit to real DOM
//
// You describe WHAT the UI should look like for a given state.
// React figures out HOW to transition the real DOM to match.
// You NEVER write: document.createElement, element.appendChild, etc.

// Components are plain functions. Props are arguments. JSX is syntax sugar.
// Logic reuse is JS composition (hooks, custom hooks), not template DSLs.

// DECLARATIVE vs IMPERATIVE:
// Imperative (jQuery): find element → update text → add class → attach listener
// Declarative (React): set state → React re-renders → DOM is updated automatically
```
::

## Mounting: createRoot and Concurrent Rendering

::code-wrapper{language="javascript" filename="mounting.js"}
```javascript
import { createRoot } from 'react-dom/client'
import App from './App'

// React 18+: createRoot enables concurrent features (automatic batching,
// transitions, Suspense for data fetching). The legacy ReactDOM.render is deprecated.
const root = createRoot(document.getElementById('root'))
root.render(<App />)

// createRoot returns a root object with:
//   root.render(jsx)     — re-render (usually called once; React handles the rest)
//   root.unmount()       — tear down the entire tree, clean up all effects

// If you're hydrating SSR markup:
// import { hydrateRoot } from 'react-dom/client'
// const root = hydrateRoot(document.getElementById('root'), <App />)
// — must match the server-rendered HTML exactly or React warns.
```
::

## Project Scaffolding: Vite

::code-wrapper{language="bash" filename="scaffold.sh"}
```bash
# Vite is the standard for new React projects (CRA is deprecated).
# Fast dev server (esbuild), optimized build (Rollup), HMR out of the box.

npm create vite@latest my-app -- --template react
cd my-app && npm install && npm run dev

# For TypeScript:
npm create vite@latest my-app -- --template react-ts
```
::

::code-wrapper{language="json" filename="package.json"}
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^6.0.0"
  }
}
```
::

::code-wrapper{language="javascript" filename="vite.config.js"}
```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,  // auto-open browser on dev start
  },
  build: {
    outDir: 'dist',
    sourcemap: true,  // production sourcemaps for debugging
  },
})
```
::

## Production Project Structure

::code-wrapper{language="text" filename="project_structure.txt"}
```
src/
├── main.jsx               # entry — createRoot().render(<App/>)
├── App.jsx                # root component, router setup
├── components/
│   ├── ui/                # generic reusable: Button, Input, Modal
│   └── features/          # domain-specific: ProductCard, UserMenu
├── hooks/                 # custom hooks: useDebounce, useFetch, useAuth
├── context/               # context providers: AuthContext, ThemeContext
├── lib/                   # third-party config: api client, analytics
├── utils/                 # pure helpers: formatDate, parseQuery
├── assets/                # images, fonts, icons (if not in public/)
└── styles/                # global CSS, theme variables
```
::

## Strict Mode: What It Catches

::code-wrapper{language="javascript" filename="strict_mode.js"}
```javascript
import { StrictMode } from 'react'

// StrictMode renders components TWICE in development (not production).
// It also re-runs effects (mount → unmount → mount) to surface bugs.
// This is intentional — it catches:
//   1. Impure renders (side effects in render body)
//   2. Missing effect cleanups
//   3. Stale state from mutations
// The double-invoke is DEV ONLY — production renders once.

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
)

// EXAMPLE of what StrictMode catches:
function BuggyComponent() {
  const [count, setCount] = useState(0)
  // ANTI-PATTERN: side effect in render body
  console.log('rendering')  // runs TWICE per state change in StrictMode
  document.title = `Count: ${count}`  // mutation during render — SHOULD be in useEffect
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>
}
// StrictMode makes the double-render visible so you catch the impurity in dev,
// not in production where it causes subtle state desync.
```
::

## JSX → JavaScript Compilation

::code-wrapper{language="javascript" filename="jsx_compilation.js"}
```javascript
// JSX is NOT HTML — it's syntax sugar for React.createElement calls.
// Babel/SWC transforms it at build time.

// WHAT YOU WRITE:
const element = <h1 className="title">Hello, {name}</h1>

// WHAT THE COMPILER PRODUCES:
const element = React.createElement('h1', { className: 'title' }, 'Hello, ', name)

// WHICH IS A PLAIN OBJECT:
// {
//   type: 'h1',
//   props: { className: 'title', children: ['Hello, ', name] },
//   key: null,
//   ref: null,
//   $$typeof: Symbol.for('react.element')  // security: prevents XSS via injection
// }

// THE $$typeof SYMBOL is React's XSS defense — if a malicious script injects
// a JSON object that looks like a React element, it won't have the valid Symbol
// and React will refuse to render it. Symbols can't be serialized in JSON.
```
::

## Anti-Pattern: Direct DOM Manipulation

::code-wrapper{language="javascript" filename="anti_pattern_dom.js"}
```javascript
// ANTI-PATTERN: mixing imperative DOM manipulation with React
function BadInput() {
  const ref = useRef()
  useEffect(() => {
    // DON'T do this — React already manages this DOM node
    ref.current.style.color = 'red'
    ref.current.setAttribute('data-custom', 'true')
  }, [])
  return <input ref={ref} />
  // If React re-renders and replaces this node, your manual attributes are lost.
  // The DOM is React's output — don't fight it from the outside.
}

// PRODUCTION: let React manage the DOM, use state for dynamic values
function GoodInput({ isValid }) {
  return <input style={{ color: isValid ? 'inherit' : 'red' }} data-custom={isValid} />
}
// React reconciles style and attributes — no manual DOM touches needed.
// Use refs ONLY for: focus management, scroll position, measuring layout,
// integrating with non-React libraries (Chapter 8).
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript" filename="tips.js"}
```javascript
// [Idiom] Always use createRoot (React 18+), never ReactDOM.render — it's
// deprecated and doesn't support concurrent features, automatic batching,
// or transitions.

// [Debug] If your app renders twice on every state update in dev, check
// StrictMode first — it's intentional, not a bug. It disappears in production.

// [Performance] Vite's dev server uses esbuild (Go-based) — orders of magnitude
// faster than Babel for JSX transformation. Only the production build uses
// Rollup for tree-shaking and code-splitting.

// [Idiom] Keep main.jsx minimal — just createRoot + render + global providers.
// All routing, layout, and logic belongs in App.jsx or child components.

// [Safety] The $$typeof Symbol.for('react.element') check is React's built-in
// XSS defense. Never bypass it by manually constructing element objects —
// always use JSX or React.createElement.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript" filename="edge_cases.js"}
```javascript
// [Gotcha] StrictMode double-invokes effects (mount → unmount → mount) in dev.
// If your effect creates a WebSocket connection without cleanup, you'll get
// TWO connections in dev. Always implement cleanup in useEffect.

// [Gotcha] createRoot can only be called ONCE per DOM element. Calling
// root.render() multiple times is fine (it updates), but creating two roots
// on the same element throws. To update, reuse the root object.

// [Gotcha] ReactDOM.render (legacy) and createRoot have different batching
// behavior — legacy doesn't batch outside React event handlers; createRoot
// (React 18+) batches EVERYTHING (timeouts, promises, native events).

// [Gotcha] If you see "Target container is not a DOM element" — your script
// is running before the DOM is ready. Ensure the script tag has defer, or
// your entry point runs after the #root element exists in the document.

// [Gotcha] Hydration mismatch warnings occur when server-rendered HTML differs
// from what React expects on the client. Common causes: timestamps, Math.random(),
// browser-only APIs in the initial render, or different data between server and client.
```
::

## 🧠 Spot the Bug

A developer's component shows a value in the DOM that doesn't update when state changes:

::code-wrapper{language="javascript" filename="spot_the_bug.js"}
```javascript
function Counter() {
  const [count, setCount] = useState(0)
  document.title = `Count: ${count}`  // ← side effect in render body
  return <button onClick={() => setCount(c => c + 1)}>Count: {count}</button>
}
```
::

The button text updates, but `document.title` sometimes lags or shows the wrong value. Why?

<details>
<summary>Answer</summary>

`document.title = ...` runs in the render body, not in a `useEffect`. React may render a component multiple times before committing to the DOM (especially in StrictMode, which double-invokes render). The render phase must be **pure** — no side effects, no mutations. Side effects belong in `useEffect`, which runs *after* the DOM commit:

```javascript
function Counter() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    document.title = `Count: ${count}`
  }, [count])  // runs after commit, only when count changes
  return <button onClick={() => setCount(c => c + 1)}>Count: {count}</button>
}
```

In StrictMode (dev), the render body runs twice per update — the `document.title` gets set twice with potentially stale values from an abandoned render. In production it usually works by accident, but the render phase is not guaranteed to be a 1:1 mapping to commits. Move side effects to `useEffect`.

</details>

## Key Takeaways

::code-wrapper{language="javascript" filename="key_takeaways.js"}
```javascript
// 1. React = declarative UI library. You describe WHAT the UI looks like for
//    a given state; React diffs the virtual DOM and commits minimal real-DOM changes.
//    Never imperatively manipulate DOM that React manages.

// 2. createRoot (React 18+) enables concurrent features, automatic batching,
//    and transitions. Legacy ReactDOM.render is deprecated — don't use it.

// 3. Vite is the standard scaffold (CRA is deprecated). esbuild for dev speed,
//    Rollup for production builds. npm create vite@latest my-app -- --template react

// 4. StrictMode renders twice and re-runs effects in DEV to catch impure renders
//    and missing cleanups. This is intentional — it vanishes in production.

// 5. JSX compiles to React.createElement() calls → plain objects with
//    $$typeof: Symbol.for('react.element') as XSS defense. Never construct
//    element objects manually — always use JSX or createElement.
```
::
