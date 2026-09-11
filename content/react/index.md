---
title: "Learn React — Engineering Reference"
description: "A code-first, production-grade React curriculum for mid-to-senior engineers. 26 chapters covering JSX, hooks, state management, performance, concurrency, server components, TypeScript, testing, and security — through annotated code, anti-patterns, and edge cases."
---

# ⚛️ Learn React — Engineering Reference

A code-first, production-grade React curriculum for mid-to-senior developers. Each chapter is structured around **annotated code blocks** — complex implementations, anti-patterns with fixes, performance tricks, and edge-case failure modes — rather than prose-heavy tutorials. Every concept is shown as it's used in real production systems, with dense inline comments explaining the underlying React mechanics.

## How to Use This Reference

1. **Read sequentially** (01 → 26) for a structured path from JSX to production security.
2. **Jump to a chapter** as a reference when you hit a specific React problem — each is self-contained.
3. **Build the projects** in chapter 26 after every few chapters.
4. **Read the React source and popular library internals** (TanStack Query, Zustand) alongside.

## Prerequisites

- Modern JavaScript (ES2015+): arrow functions, destructuring, modules, promises/async-await.
- Node.js and a package manager (`npm`, `pnpm`, or `yarn`).
- A code editor (VS Code recommended).
- Familiarity with at least one other UI framework or sufficient general web development experience — this reference moves fast on fundamentals.

## Curriculum

### Part I — Foundations

| # | Topic | Why It Matters |
|---|---|---|
| 01 | [Introduction & Setup](/react/01-introduction-and-setup) | Toolchain, project scaffolding, mental model. |
| 02 | [JSX Deep Dive](/react/02-jsx-deep-dive) | Syntax, expressions, escaping, compilation to `createElement`. |
| 03 | [Components & Props](/react/03-components-and-props) | Composition unit, prop patterns, children. |
| 04 | [State & `useState`](/react/04-state-and-usestate) | Local state, batching, functional updates. |
| 05 | [Event Handling](/react/05-event-handling) | Synthetic events, delegation, handler patterns. |

### Part II — Hooks & Side Effects

| # | Topic | Why It Matters |
|---|---|---|
| 06 | [`useEffect` & Lifecycle](/react/06-useeffect-and-lifecycle) | Synchronization, cleanup, dependency arrays. |
| 07 | [`useContext` & Prop Drilling](/react/07-usecontext-and-prop-drilling) | Sharing state without threading props. |
| 08 | [`useRef` & DOM Access](/react/08-useref-and-dom-access) | Mutable values, imperative DOM access. |
| 09 | [`useMemo` & `useCallback`](/react/09-usememo-and-usecallback) | Memoization, referential equality. |
| 10 | [`useReducer` & Complex State](/react/10-usereducer-and-complex-state) | Action-based state transitions. |
| 11 | [Custom Hooks](/react/11-custom-hooks) | Extracting and reusing stateful logic. |

### Part III — Rendering Patterns

| # | Topic | Why It Matters |
|---|---|---|
| 12 | [Conditional Rendering Patterns](/react/12-conditional-rendering-patterns) | `&&`, ternaries, early returns, pitfalls. |
| 13 | [Lists, Keys & Reconciliation](/react/13-lists-keys-and-reconciliation) | Diffing algorithm, key stability. |
| 14 | [Forms: Controlled and Uncontrolled](/react/14-forms-controlled-and-uncontrolled) | Input state, validation, refs vs. state. |
| 15 | [Composition vs. Inheritance](/react/15-composition-vs-inheritance) | Slots, render props, compound components. |
| 16 | [Error Boundaries](/react/16-error-boundaries) | Catching render errors, fallback UI. |

### Part IV — Data & State at Scale

| # | Topic | Why It Matters |
|---|---|---|
| 17 | [Fetching Data](/react/17-fetching-data) | Effects, loading/error states, aborting requests. |
| 18 | [Context and State Management Libraries](/react/18-context-and-state-management-libraries) | Redux, Zustand, when Context isn't enough. |
| 19 | [Routing with React Router](/react/19-routing-react-router) | Client-side navigation, dynamic routes. |

### Part V — Performance & Modern React

| # | Topic | Why It Matters |
|---|---|---|
| 20 | [Performance Optimization](/react/20-performance-optimization) | Profiling, `memo`, virtualization. |
| 21 | [Concurrent Features](/react/21-concurrent-features) | `useTransition`, `useDeferredValue`, Suspense. |
| 22 | [Server Components and SSR](/react/22-server-components-and-ssr) | RSC, streaming, hydration. |

### Part VI — Production Engineering

| # | Topic | Why It Matters |
|---|---|---|
| 23 | [TypeScript with React](/react/23-typescript-with-react) | Typed props, hooks, generics, event types. |
| 24 | [Testing](/react/24-testing) | React Testing Library, mocking, interaction tests. |
| 25 | [Security](/react/25-security) | XSS boundaries, dependency risk, secrets, CSP. |
| 26 | [Exercises & Project Ideas](/react/26-exercises-and-projects) | From beginner to pro. |

## Learning Path Suggestions

### If you're new to frontend development

1. Read 01–11 in order, slowly — hooks are the foundation everything else builds on.
2. Skim 12–16, then build Project 1 (Todo List) from chapter 26.
3. Read 17–19, then build Projects 2–4.
4. Come back for 20–25 once you have a few working apps under your belt.

### If you're coming from another framework (Vue, Angular, Svelte)

Read 02–05 quickly — concepts translate, only syntax and mental model differ. Slow down for 06 (`useEffect`) and 09 (`useMemo`/`useCallback`) — dependency arrays and referential equality are React-specific traps. Read 18 to compare React's state-management story with what you already know.

### If you're coming from jQuery or vanilla JS

Ownership of the DOM shifts entirely to React — read 02, 03, and 13 carefully before anything else. Resist the urge to reach for `useRef`-driven manual DOM manipulation as a first instinct; read 04 and 14 until declarative state feels natural.

### If you're a senior engineer learning React for production

Skim 01–11. Read 17, 18, 20, 21, 22 closely. Use 23 and 25 as ongoing references. Then read 26 and build the intermediate and advanced projects.

## Companion Resources

- [React Documentation](https://react.dev/) — official, free, and the best starting point.
- [React Testing Library Docs](https://testing-library.com/docs/react-testing-library/intro/) — testing philosophy and API.
- [TanStack Query Docs](https://tanstack.com/query/latest) — production-grade data fetching beyond chapter 17.
- [Next.js Documentation](https://nextjs.org/docs) — Server Components and SSR in practice.
- [Kent C. Dodds' Epic React](https://epicreact.dev/) — deep, exercise-driven React training.
- [r/reactjs](https://reddit.com/r/reactjs) — community.

## Tooling to Install

::code-wrapper{language="bash"}
```bash
npm create vite@latest my-app -- --template react-ts
npm install -D eslint eslint-plugin-react-hooks prettier
npm install -D vitest @testing-library/react @testing-library/user-event jsdom
```
::

## License

These notes are yours to use, share, and modify.

⚛️
