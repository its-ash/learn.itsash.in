---
title: Learn JavaScript — From Scratch to Advanced
description: A comprehensive, edge-case-covering, idiomatic JavaScript curriculum. 30 chapters covering fundamentals, objects, closures, async, DOM, modules, functional programming, testing, and modern tooling. Go from beginner to advanced JavaScript developer.
---

# 📖 Learn JavaScript — From Scratch to Advanced

A comprehensive, edge-case-covering, idiomatic JavaScript curriculum. Each document is self-contained and covers its concept deeply enough that a careful reader can go from beginner to advanced JavaScript developer.

## How to Use This Course

1. **Read sequentially** for a structured path (01 → 30).
2. **Jump to a chapter** as a reference when you hit a concept in the wild.
3. **Run the exercises** in chapter 30 after every few chapters.
4. **Read the MDN docs** alongside each chapter.

## Prerequisites

- A modern browser (Chrome, Firefox, Safari, Edge).
- A code editor (VS Code recommended).
- Node.js installed for running JS outside the browser.

## Curriculum

### Part I — Foundations

| # | Topic | Why It Matters |
|---|---|---|
| 01 | [Introduction & Setup](/js/01-introduction-and-setup) | History, runtime, Node.js, dev tools. |
| 02 | [Variables & Data Types](/js/02-variables-and-data-types) | `let`/`const`/`var`, primitives, `typeof`. |
| 03 | [Operators & Expressions](/js/03-operators-and-expressions) | Coercion, equality, truthiness, short-circuiting. |
| 04 | [Control Flow](/js/04-control-flow) | `if`/`switch`/`for`/`while`/`break`/`continue`. |
| 05 | [Functions & Scope](/js/05-functions-and-scope) | Declarations, arrows, params, hoisting, scope. |
| 06 | [Strings & Template Literals](/js/06-strings-and-template-literals) | Methods, Unicode, regex, interpolation. |

### Part II — Objects & Arrays

| # | Topic | Why It Matters |
|---|---|---|
| 07 | [Objects & Properties](/js/07-objects-and-properties) | Keys, getters/setters, descriptors, spread. |
| 08 | [Arrays & Array Methods](/js/08-arrays-and-array-methods) | `map`/`filter`/`reduce`, mutators, iteration. |
| 09 | [Destructuring & Spread](/js/09-destructuring-and-spread) | Object/array patterns, rest, shallow copy. |
| 10 | [Classes & Prototypes](/js/10-classes-and-prototypes) | `class`, `extends`, prototype chain, `super`. |

### Part III — Functions Deep Dive

| # | Topic | Why It Matters |
|---|---|---|
| 11 | [The `this` Keyword](/js/11-this-keyword) | Binding rules, arrow vs normal, `bind`/`call`/`apply`. |
| 12 | [Closures & Lexical Scope](/js/12-closures-and-lexical-scope) | Captured variables, IIFEs, memory, privacy. |
| 13 | [Higher-Order Functions](/js/13-higher-order-functions) | Callbacks, composition, currying, partial application. |
| 14 | [Modules](/js/14-modules) | ES modules, `import`/`export`, dynamic import, bundlers. |

### Part IV — Async JavaScript

| # | Topic | Why It Matters |
|---|---|---|
| 15 | [Callbacks & the Event Loop](/js/15-callbacks-and-the-event-loop) | Call stack, task queue, microtasks, `setTimeout`. |
| 16 | [Promises](/js/16-promises) | States, chaining, `Promise.all`/`race`/`allSettled`. |
| 17 | [Async / Await](/js/17-async-await) | Syntax, error handling, sequential vs concurrent. |
| 18 | [Error Handling](/js/18-error-handling) | `try/catch`, custom errors, `Error` subclasses. |

### Part V — Browser & DOM

| # | Topic | Why It Matters |
|---|---|---|
| 19 | [The DOM](/js/19-the-dom) | Selection, traversal, manipulation, templates. |
| 20 | [Events](/js/20-events) | Bubbling, capturing, delegation, custom events. |
| 21 | [Web Storage & APIs](/js/21-web-storage-and-apis) | `localStorage`, `sessionStorage`, IndexedDB, Fetch. |
| 22 | [Timers & Scheduling](/js/22-timers-and-scheduling) | `setTimeout`, `setInterval`, `requestAnimationFrame`. |

### Part VI — Advanced Topics

| # | Topic | Why It Matters |
|---|---|---|
| 23 | [Functional Programming](/js/23-functional-programming) | Purity, immutability, composition, pipelines. |
| 24 | [Design Patterns](/js/24-design-patterns) | Module, factory, observer, singleton, decorator. |
| 25 | [Testing](/js/25-testing) | Unit/integration/E2E, Jest/Vitest, mocking, TDD. |
| 26 | [Performance & Optimization](/js/26-performance-and-optimization) | Debounce, throttle, lazy loading, memory, V8. |

### Part VII — Production

| # | Topic | Why It Matters |
|---|---|---|
| 27 | [Tooling & Build Systems](/js/27-tooling-and-build-systems) | npm/pnpm, Vite, ESLint, Prettier, Babel. |
| 28 | [TypeScript Essentials](/js/28-typescript-essentials) | Types, interfaces, generics, narrowing, `tsconfig`. |
| 29 | [Security](/js/29-security) | XSS, CSRF, CSP, input validation, safe eval. |
| 30 | [Exercises & Project Ideas](/js/30-exercises-and-projects) | From beginner to advanced. |

## Learning Path Suggestions

### If you're new to programming

1. Read 01–06 in order.
2. Skip to 08 (Arrays) and practice with real data.
3. Read 15–17 (Async) carefully — it's the hardest part.
4. Do exercises 1–5 in chapter 30.

### If you're coming from Python/Ruby

Read 02–05 (types and functions differ subtly). Don't skip 11 (`this`) — it's uniquely JavaScript. Read 15–17 (async model is different).

### If you're coming from Java/C#

Read 10 (Classes) to see how JS classes differ. Read 11 (`this`) and 12 (Closures) — these are the core differentiators. Skim 05 (Functions) for arrow function semantics.

### If you're a senior engineer

Skim 01–10. Read 12 (Closures), 15 (Event Loop), 17 (Async/Await), 25 (Testing), 28 (TypeScript) closely. Use 24 (Patterns) and 30 (Projects) as references.

## Companion Resources

- [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/JavaScript) — the definitive reference.
- [JavaScript.info](https://javascript.info) — modern, comprehensive tutorial.
- [You Don't Know JS](https://github.com/getify/You-Dont-Know-JS) — deep dive series.
- [Node.js Docs](https://nodejs.org/docs/latest/api/) — server-side JS.
- [ECMAScript Spec](https://tc39.es/ecma262/) — the language specification.
- [Can I Use](https://caniuse.com) — browser compatibility tables.

## Tooling to Install

::code-wrapper{language="bash"}
```bash
# Node.js (via nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
nvm install --lts
nvm use --lts

# Global tools
npm install -g eslint prettier ts-node vitest
```
::

## License

These notes are yours to use, share, and modify.

📖