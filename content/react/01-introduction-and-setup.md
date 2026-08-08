# 01 — Introduction & Setup

## What Is React?

React is a **declarative, component-based JavaScript library** for building user interfaces, created and maintained by Meta. It is not a framework — it has no built-in router, no built-in data-fetching layer, no built-in state-management solution. React's entire job is one thing: **keep the UI in sync with your data**.

Key characteristics:

- **Declarative** — you describe *what* the UI should look like for a given state; React figures out *how* to update the DOM to match.
- **Component-based** — UIs are composed of small, reusable, self-contained pieces (components) that each manage their own markup, logic, and (optionally) styling.
- **Virtual DOM diffing** — React keeps an in-memory representation of the UI and computes the minimal set of real DOM mutations needed on every update.
- **Unidirectional data flow** — data flows down through props; events flow up through callbacks. This makes state changes traceable.
- **Just JavaScript** — components are functions. Logic reuse happens through normal JS composition (functions, hooks) rather than framework-specific templating DSLs.

### Why Declarative Matters

Compare imperative DOM manipulation to React's declarative model:

::code-wrapper{language="javascript"}
```javascript
// Imperative — you manage every mutation by hand
const list = document.getElementById('list')
function addItem(text) {
  const li = document.createElement('li')
  li.textContent = text
  list.appendChild(li)
}
function removeItem(index) {
  list.removeChild(list.children[index])
}
// Every state change requires you to remember which DOM calls to make,
// in which order, and to keep them in sync with your actual data.
```
::

::code-wrapper{language="javascript"}
```javascript
// Declarative — describe the result, React computes the mutations
function ItemList({ items }) {
  return (
    <ul>
      {items.map(item => <li key={item.id}>{item.text}</li>)}
    </ul>
  )
}
// You never touch the DOM. You just return what the UI should look like
// for the current `items` array. React diffs old vs new and patches the DOM.
```
::

## A Brief History

| Year | Event |
|---|---|
| 2011 | React originates internally at Facebook (Jordan Walke), first used on Facebook's news feed. |
| 2013 | Open-sourced at JSConf US. Widely mocked at first for mixing markup into JS. |
| 2015 | React Native ships, bringing the component model to mobile. |
| 2016 | React 15 — stable, widespread adoption begins. |
| 2017 | React 16 ("Fiber") — a full rewrite of the reconciler enabling async rendering, error boundaries, fragments, portals. |
| 2019 | React 16.8 — **Hooks** ship. This is the single biggest API shift in React's history; function components become first-class. |
| 2020 | React 17 — no new features, focused on making upgrades easier ("stepping stone" release), changed event delegation target. |
| 2022 | React 18 — automatic batching everywhere, concurrent rendering APIs (`startTransition`, `useDeferredValue`), the new `createRoot` API, Suspense improvements. |
| 2024+ | React Server Components mature via frameworks (Next.js App Router), the `use` hook, React Compiler (automatic memoization) enters early adoption. |

This curriculum teaches **modern React**: function components and Hooks are the primary and near-exclusive way you'll write React day to day. Class components get one dedicated mention later (error boundaries, chapter 16) because that is the one API surface Hooks have not replaced — and a brief legacy note here, because you *will* encounter class components in older codebases.

## Virtual DOM: The Core Concept

The **virtual DOM (VDOM)** is a plain JavaScript object tree that mirrors the shape of the real DOM. When state changes:

1. React re-runs your component function(s), producing a new tree of React elements (a lightweight description — `{ type: 'li', props: { children: 'Milk' } }` — not real DOM nodes).
2. React **diffs** the new tree against the previous tree ("reconciliation," covered in depth in chapter 13).
3. React computes the minimal set of real DOM operations needed and applies them in a single batch.

This matters because direct DOM manipulation is slow relative to JS object comparisons, and because it lets you *think* in terms of "what should this look like" rather than "what sequence of mutations gets me there." The VDOM is an implementation detail — you rarely interact with it directly — but understanding that **render (calling your function) is not the same as commit (touching the real DOM)** is essential for reasoning about performance and effects later in this course.

::code-wrapper{language="javascript"}
```javascript
// A JSX element compiles down to a call like this (simplified):
const element = <h1 className="title">Hello</h1>

// becomes:
const element = React.createElement('h1', { className: 'title' }, 'Hello')

// which produces a plain object (a "React element"), NOT a DOM node:
// {
//   type: 'h1',
//   props: { className: 'title', children: 'Hello' }
// }
```
::

## Scaffolding a Project: Vite (Recommended)

[Vite](https://vitejs.dev) is the modern standard for starting React projects — it uses native ES modules in development (near-instant startup, instant hot module replacement) and Rollup for optimized production builds. Create React App (CRA) is **deprecated** as of 2023 and should not be used for new projects; it is mentioned here only because you will see it in older tutorials and codebases.

::code-wrapper{language="bash"}
```bash
# Scaffold a new React + JavaScript project
npm create vite@latest my-app -- --template react

# Or with TypeScript (recommended for anything beyond a toy project — see chapter 23)
npm create vite@latest my-app -- --template react-ts

cd my-app
npm install
npm run dev
```
::

::code-wrapper{language="bash"}
```bash
my-app/
├── index.html          # entry HTML — Vite injects the bundled script here
├── package.json
├── vite.config.js
├── src/
│   ├── main.jsx         # entry point — mounts <App /> into the DOM
│   ├── App.jsx          # root component
│   ├── App.css
│   └── index.css
└── public/              # static assets served as-is
```
::

### The Entry Point

::code-wrapper{language="javascript" filename="src/main.jsx"}
```javascript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```
::

`createRoot` is the React 18 API for mounting an app (it replaced `ReactDOM.render` from React 17 and earlier — the old API still works but does not enable concurrent features). `<StrictMode>` is a development-only wrapper that intentionally double-invokes component bodies, effects, and some lifecycle methods to help you find impure rendering and missing effect cleanup — it does nothing in production builds.

### Framework Alternative: Next.js

For production applications that need routing, server rendering, or React Server Components out of the box, most teams reach for a framework rather than bare Vite + React Router. Next.js is covered conceptually in chapter 22; for this curriculum, Vite keeps the focus on React itself without a framework's opinions layered on top.

::code-wrapper{language="bash"}
```bash
npx create-next-app@latest my-next-app
```
::

## JSX: A First Look

JSX ("JavaScript XML") is a syntax extension that lets you write markup-like syntax directly in JavaScript. It is **not** a template language — it compiles to nested `React.createElement()` calls (or, with the modern JSX transform, calls to `jsx`/`jsxs` from `react/jsx-runtime`) via Babel or the TypeScript compiler. It is not valid JavaScript on its own and always requires a build step.

::code-wrapper{language="javascript"}
```javascript
function Greeting({ name }) {
  const hour = new Date().getHours()
  const isMorning = hour < 12

  return (
    <div className="greeting">
      <h1>{isMorning ? 'Good morning' : 'Good afternoon'}, {name}!</h1>
      <p>You have {isMorning ? 3 : 7} unread messages.</p>
    </div>
  )
}
```
::

Chapter 2 covers JSX rules in full depth (expressions vs. statements, conditional rendering, lists, fragments). For now, the essential mental model: **JSX is sugar for function calls that build a tree of plain objects.**

## React DevTools

The [React Developer Tools](https://react.dev/learn/react-developer-tools) browser extension (Chrome, Firefox, Edge) adds two panels to your browser's DevTools:

| Panel | Purpose |
|---|---|
| **Components** | Inspect the component tree, view/edit props and state live, see which component owns a given piece of state, jump to source. |
| **Profiler** | Record a render session, see which components rendered, how long each took, and *why* each rendered (props changed, state changed, parent re-rendered, context changed). |

::code-wrapper{language="bash"}
```bash
# The extension augments window.__REACT_DEVTOOLS_GLOBAL_HOOK__,
# which React itself checks for and reports render data to.
# No install step in your app code is required for a standard web app —
# just install the browser extension and open DevTools on a page running React.
```
::

### Best Practice: Name Your Components

React DevTools displays function names in the component tree. Anonymous or poorly named components make debugging painful in a large tree.

::code-wrapper{language="javascript"}
```javascript
// Bad — DevTools shows "Anonymous" or a generic name
export default function ({ items }) {
  return <ul>{items.map(i => <li key={i.id}>{i.text}</li>)}</ul>
}

// Good — DevTools shows "ItemList", trivially searchable in a tree of 200 components
export default function ItemList({ items }) {
  return <ul>{items.map(i => <li key={i.id}>{i.text}</li>)}</ul>
}
```
::

## Setting Up a Real Project Layout

A production-shaped starting structure (grows into this over the course of the curriculum):

::code-wrapper{language="bash"}
```bash
src/
├── main.jsx
├── App.jsx
├── components/       # shared, reusable, "dumb" UI components
│   ├── Button.jsx
│   └── Spinner.jsx
├── features/         # feature-scoped components + logic, one folder per domain
│   └── user-profile/
│       ├── UserProfile.jsx
│       └── useUserProfile.js
├── hooks/            # cross-cutting custom hooks
│   └── useDebounce.js
├── lib/              # API clients, utilities, constants
│   └── apiClient.js
└── routes/           # route-level components (see chapter 19)
```
::

## 💡 Tips & Tricks

- **Debug** — Install React DevTools *before* you need it. Debugging a re-render storm without the Profiler's "why did this render" flame graph means guessing; with it, you get a direct answer per component per commit.
- **Performance** — `npm create vite@latest` is dramatically faster than CRA's webpack-based dev server on large apps because Vite serves unbundled ES modules in dev and only bundles for production — hot reload stays near-instant no matter how large `node_modules` grows.
- **Idiom** — Name every component you export, even quick ones. `export default function() {}` is legal JSX but sabotages your future self in the DevTools component tree and in stack traces.
- **Debug** — `<StrictMode>` double-invoking your component body and effects in development is not a bug in your app — it's React deliberately surfacing impure renders and un-cleaned-up effects before they become production bugs. If double-logging in the console surprises you, that's the point.
- **Portability** — `create-react-app` is deprecated; do not start new projects with it. If you inherit a CRA codebase, migrating to Vite is usually a same-day task since both use standard ES modules and JSX.

## ⚠️ Edge Cases & Gotchas

- **`<StrictMode>` runs effects twice in development only** — mount → effect → cleanup → effect, all synchronously, before you see anything on screen. This is invisible in production builds. If your `useEffect` cleanup isn't idempotent (e.g., it doesn't properly cancel a subscription), StrictMode will expose the bug loudly in dev while production silently ships it.
- **JSX requires a build step, always** — there is no way to run JSX directly in a browser or Node.js without transpilation (Babel, SWC, TypeScript, or esbuild). Pasting a `.jsx` file into a plain `<script>` tag throws a syntax error.
- **`createRoot` vs `ReactDOM.render`** — mixing the React 17 `ReactDOM.render(<App />, el)` API with React 18's concurrent features silently opts you *out* of automatic batching and concurrent rendering; React logs a warning, but the app keeps running in legacy mode with no other visible symptom.
- **Vite's `import.meta.env`, not `process.env`** — code copied from a CRA project referencing `process.env.REACT_APP_*` will be `undefined` in Vite; Vite exposes env vars as `import.meta.env.VITE_*` (note the different prefix requirement, too).
- **The virtual DOM is not "faster than the DOM" in isolation** — direct, hand-tuned imperative DOM code can always be faster than diffing. The VDOM's actual value is developer ergonomics at scale (declarative code that's easy to reason about) plus batched, minimal-diff updates — not raw single-operation speed.

## 🧠 Spot the Bug

A teammate scaffolded a new feature and is confused why their console shows each `console.log` twice in development, but only once when they deploy.

::code-wrapper{language="javascript"}
```javascript
function AnalyticsPing({ eventName }) {
  console.log('Firing analytics event:', eventName)
  return null
}
```
::

<details>
<summary>Answer</summary>

This isn't a bug in the code — it's `<StrictMode>` intentionally invoking the component function body twice per render in development to help surface side effects that don't belong during rendering (calling `console.log`, mutating external state, or firing network requests directly in the function body, rather than inside `useEffect`). In production builds, StrictMode's extra invocation is stripped out, so it only logs once.

**The lesson**: rendering (calling your component function) must be a pure calculation of JSX from props/state — side effects like logging or network calls belong in event handlers or `useEffect`, not in the component body itself.

</details>

## Key Takeaways

- React is a UI library, not a framework — it renders views declaratively and leaves routing, data fetching, and state architecture to you or add-on libraries.
- JSX compiles to function calls that build plain-object element trees; it always requires a build step.
- The virtual DOM lets React diff old vs. new UI trees and apply minimal real DOM patches — its value is ergonomics and batching, not raw speed.
- Use Vite (`npm create vite@latest -- --template react` or `react-ts`) to scaffold new projects; CRA is deprecated.
- `createRoot` (React 18) is the modern mount API; install React DevTools immediately for component inspection and render profiling.
- Hooks and function components are the modern default; class components survive only as a legacy-literacy topic (error boundaries excepted).
