---
title: "JavaScript — Zero to Hero"
description: "A comprehensive JavaScript curriculum covering engine internals, language fundamentals, async patterns, browser APIs, functional programming, design patterns, testing, performance, TypeScript, security, and production projects."
---

# JavaScript — Zero to Hero

A comprehensive, code-first JavaScript curriculum for mid-level developers advancing to senior roles. Every chapter is packed with production-grade examples, anti-patterns, edge cases, and gotchas that experienced engineers encounter in real codebases.

## How to Use This Course

1. **Read sequentially** if you're new to a topic — chapters build on each other
2. **Jump to any chapter** if you're reviewing — each is self-contained
3. **Run the examples** in a browser console, Node.js REPL, or an editor
4. **Check the Quick Quiz** at the end of each chapter — if you can answer it, you understand the core concept
5. **Watch for ⚠️ Edge Cases** — these are the gotchas that bite in production

### Prerequisites

- Basic programming familiarity (any language)
- A modern browser or Node.js 20+
- An editor with syntax highlighting (VS Code recommended)

## Curriculum

| # | Topic | Why It Matters |
|---|-------|---------------|
| 01 | [Introduction & Setup](./01-introduction-and-setup) | Engine architecture, JIT compilation, event loop, memory model — the foundation for understanding all JS behavior |
| 02 | [Variables & Data Types](./02-variables-and-data-types) | TDZ, type coercion, IEEE 754 floats, BigInt — avoid silent bugs from coercion and floating-point |
| 03 | [Operators & Expressions](./03-operators-and-expressions) | Coercion algorithm, bitwise 32-bit, short-circuit evaluation — master the rules that govern every expression |
| 04 | [Control Flow](./04-control-flow) | Truthiness, switch fall-through, finally trap, retry backoff — write correct conditionals and loops |
| 05 | [Functions & Scope](./05-functions-and-scope) | Hoisting, arrow `this`, arguments, IIFE, default param TDZ — the building blocks of all JS code |
| 06 | [Strings & Template Literals](./06-strings-and-template-literals) | UTF-16, surrogate pairs, tagged templates, normalization — handle text correctly across all Unicode |
| 07 | [Objects & Properties](./07-objects-and-properties) | Descriptors, prototype chain, freeze, Proxy immutability — master the object model |
| 08 | [Arrays & Array Methods](./08-arrays-and-array-methods) | Holes vs undefined, mutation methods, reduce, typed arrays — avoid array pitfalls |
| 09 | [Destructuring & Spread](./09-destructuring-and-spread) | Pattern matching, null trap, safe defaults — write concise and safe data extraction |
| 10 | [Classes & Prototypes](./10-classes-and-prototypes) | Prototypal inheritance, `#private`, static blocks, mixins — OOP in JS done right |
| 11 | [The `this` Keyword](./11-this-keyword) | Four binding rules, arrow lexical, call/apply/bind internals — the most misunderstood keyword |
| 12 | [Closures & Lexical Scope](./12-closures-and-lexical-scope) | Lexical environment, loop bug, memory leaks, debounce — master closures for functional patterns |
| 13 | [Higher-Order Functions](./13-higher-order-functions) | map/filter/reduce, compose/pipe, curry, point-free, validators — the foundation of functional JS |
| 14 | [Modules](./14-modules) | ESM 3 phases, live bindings, CommonJS, dynamic import, circular deps — organize code at scale |
| 15 | [Callbacks & Event Loop](./15-callbacks-and-the-event-loop) | Microtask/macrotask, queueMicrotask, blocking, starvation — understand execution order |
| 16 | [Promises](./16-promises) | State machine, chaining, all/race/allSettled/any, error propagation — modern async foundation |
| 17 | [Async/Await](./17-async-await) | Desugaring to Promises, sequential vs concurrent, top-level await — write clean async code |
| 18 | [Error Handling](./18-error-handling) | Error internals, custom hierarchy, async errors, global handlers — robust error strategies |
| 19 | [The DOM](./19-the-dom) | Selection, live collections, DocumentFragment, MutationObserver, Shadow DOM — manipulate the page efficiently |
| 20 | [Events](./20-events) | Capture/bubble, delegation, stopPropagation, CustomEvent, passive listeners — master browser events |
| 21 | [Web Storage & APIs](./21-web-storage-and-apis) | localStorage, IndexedDB, Fetch streaming, Cache API — persist data and communicate with servers |
| 22 | [Timers & Scheduling](./22-timers-and-scheduling) | setTimeout drift, rAF, debounce/throttle implementations — control when code runs |
| 23 | [Functional Programming](./23-functional-programming) | Pure functions, immutability, Either monad, Redux reducer — write predictable, testable code |
| 24 | [Design Patterns](./24-design-patterns) | Module, Observer/Pub-Sub, Strategy, State Machine, Builder — proven solutions to common problems |
| 25 | [Testing](./25-testing) | Vitest, vi.mock/vi.fn, DI for testability, TDD, snapshot testing — ensure correctness and prevent regressions |
| 26 | [Performance & Optimization](./26-performance-and-optimization) | V8 hidden classes, closure leaks, benchmarking, lazy evaluation — make JS fast and memory-efficient |
| 27 | [Tooling & Build Systems](./27-tooling-and-build-systems) | npm/pnpm, ESLint, Vite, tree-shaking, source maps — configure the modern JS toolchain |
| 28 | [TypeScript Essentials](./28-typescript-essentials) | Structural typing, generics, conditional types, utility types, declaration files — add type safety to JS |
| 29 | [Security](./29-security) | XSS, CSRF, CSP, prototype pollution, input validation — protect against common web vulnerabilities |
| 30 | [Exercises & Projects](./30-exercises-and-projects) | State store, API client, virtual DOM, WebSocket chat, utilities — build production systems from scratch |

## Track Overview

### Part I: Foundations (01–10)
Language fundamentals — types, scope, objects, arrays, classes. Master these before moving to async or browser topics.

### Part II: Async & Control (11–18)
Closures, higher-order functions, modules, the event loop, Promises, async/await, and error handling. The core of modern JavaScript.

### Part III: Browser & APIs (19–22)
DOM manipulation, events, storage, network requests, and timers. Everything you need to build client-side applications.

### Part IV: Architecture (23–25)
Functional programming, design patterns, and testing. Write maintainable, testable code at scale.

### Part V: Production (26–30)
Performance, tooling, TypeScript, security, and capstone projects. The skills that distinguish senior engineers.