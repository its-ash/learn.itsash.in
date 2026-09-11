---
title: "26 — Exercises & Projects"
description: "Capstone exercises and project ideas spanning beginner, intermediate, and advanced levels. 15 exercises (5 per tier) with Requirements + Stretch, 5 full project ideas, and mastery self-check questions. References earlier chapters for deeper exploration."
---

# 26 — Exercises & Projects

Reading twenty-five chapters builds vocabulary; building things builds judgment. Each exercise and project references the chapters where the relevant concepts are covered — hit a wall, then go back to that chapter. The wall is where the learning happens.

## Beginner Exercises

### 1. Toggle Button
**Requirements**: A button that toggles between "ON" and "OFF" states using `useState` (Ch 3).
**Stretch**: Add a second button that resets to OFF and disables itself when already OFF (Ch 4 conditional rendering).

### 2. Name Form
**Requirements**: A controlled input that displays a greeting (`Hello, {name}!`) below it as the user types (Ch 5 controlled components).
**Stretch**: Disable the greeting when the input is empty; show a character count (Ch 9 derived state).

### 3. Color Picker
**Requirements**: Three range inputs (R, G, B) that update a div's background color in real-time (Ch 3 + inline styles).
**Stretch**: Display the hex color code using `useMemo` so it only recalculates when RGB values change (Ch 9).

### 4. Item List
**Requirements**: Add items to a list via an input + button; delete items with an "×" button per item (Ch 6 list rendering + keys).
**Stretch**: Persist the list to `localStorage` with a `useEffect` cleanup (Ch 6 + Ch 11 `useLocalStorage` hook).

### 5. Digital Clock
**Requirements**: Display the current time, updating every second with `setInterval` inside `useEffect` (Ch 6 cleanup).
**Stretch**: Add a 12/24-hour format toggle and stop the interval when a "Pause" button is pressed (Ch 6 + Ch 8 refs for interval ID).

## Intermediate Exercises

### 6. Searchable List with Debounce
**Requirements**: Filter a list of 100+ items by a search query, debounced 300ms using a `useDebounce` custom hook (Ch 11).
**Stretch**: Memoize the filtered list with `useMemo` and verify via React DevTools Profiler that non-matching items don't re-render (Ch 9 + Ch 15).

### 7. Accordion Component
**Requirements**: A collapsible accordion with multiple sections; only one section open at a time (Ch 4 conditional rendering + Ch 7 state lifting).
**Stretch**: Make it accessible — keyboard navigable (arrow keys, Enter/Space), correct ARIA roles (`aria-expanded`, `aria-controls`), and animate with CSS transitions (Ch 14).

### 8. Fetch + Display with Abort
**Requirements**: Fetch data from a public API; cancel the in-flight request if the user clicks "Refresh" before the first resolves (Ch 6 + Ch 17 AbortController).
**Stretch**: Extract the fetch logic into a `useFetch` hook with loading/error/success states and use it for a second data source (Ch 11 + Ch 17).

### 9. Theme Toggle with Context
**Requirements**: A light/dark theme toggle that applies a CSS class to the app root via Context (Ch 7); persists the choice to `localStorage`.
**Stretch**: Add a `useTheme` hook that throws if used outside the provider, and consume it in three sibling components (Ch 7 + Ch 11).

### 10. useReducer Cart
**Requirements**: A shopping cart with add/remove/adjust-quantity actions using `useReducer` (Ch 10); display total price and item count.
**Stretch**: Convert to TypeScript with a discriminated-union action type and exhaustiveness check in the reducer's `default` case (Ch 23).

## Advanced Exercises

### 11. Virtualized List
**Requirements**: Render 10,000 rows but only mount the visible ones in the viewport using windowing (Ch 20 performance); scroll position drives which rows render.
**Stretch**: Add dynamic row heights (measure with a ref) and compare frame rate with/without virtualization using the Profiler (Ch 15 + Ch 20).

### 12. Optimistic Updates
**Requirements**: A "Like" button that updates the count immediately and rolls back if the simulated server request fails (Ch 17 optimistic UI).
**Stretch**: Add a 2-second artificial delay and show a "Saving…" indicator while the request is in-flight using `useTransition` (Ch 21).

### 13. Polymorphic Component
**Requirements**: A `<Box as="button" | "a" | "div">` component in TypeScript that types its props correctly based on the `as` prop (Ch 23 polymorphic components).
**Stretch**: Add `forwardRef` support and verify that `ref` is correctly typed for each `as` variant (Ch 8 + Ch 23).

### 14. Test a Component Suite
**Requirements**: Write 5+ tests for a `TodoItem` component using RTL + `userEvent`: render, toggle, delete, edit mode, and accessibility (Ch 24).
**Stretch**: Mock a `useTodos` hook with `vi.mock` and test the component in isolation from the hook's implementation (Ch 24 mocking).

### 15. Sanitize Rich Text
**Requirements**: A component that renders user-submitted Markdown as HTML via `dangerouslySetInnerHTML`, sanitized with DOMPurify (Ch 25).
**Stretch**: Add URL validation in the sanitizer's `afterSanitizeAttributes` hook — strip any `href` that isn't `http:` or `https:` (Ch 25).

## Project Ideas

### Project 1 — Todo App with Sync (Beginner → Intermediate)
A full-featured todo app with local persistence, filtering, and a simulated sync to a backend.
**Beginner tier**: Add/complete/delete/filter todos, persist to `localStorage` (Ch 3, 6, 11).
**Intermediate tier**: Add a `useReducer` for state management, optimistic sync with rollback on failure, and a `useSyncExternalStore` adapter for cross-tab sync (Ch 10, 17, 18).

### Project 2 — E-Commerce Product Catalog (Intermediate)
A product catalog with routing, cart, filtering, and pagination.
**Core**: Product list + detail pages via React Router, cart state via Context, URL query params for filters (Ch 7, 19).
**Advanced**: Lazy-load the detail route with `React.lazy` + `Suspense`, move cart to Zustand/Redux Toolkit, add optimistic "add to cart" (Ch 18, 21).

### Project 3 — Real-Time Chat (Intermediate → Advanced)
A WebSocket-based chat with message history, typing indicators, and auto-scroll.
**Core**: WebSocket connection, message list, send on Enter, auto-scroll to newest (Ch 6, 8).
**Advanced**: Virtualize the message list at 1000+ messages, debounce typing indicators, reproduce and fix a stale-closure bug in the `onmessage` handler (Ch 8, 20, 21).

### Project 4 — Component Library with TypeScript + Tests (Advanced)
A reusable component library (Button, Modal, Select, Tabs, DataTable) with full type safety and test coverage.
**Core**: 8+ components with TypeScript generics, prop types exported, Storybook documentation (Ch 23).
**Advanced**: Full RTL test suite covering keyboard navigation, visual regression tests, accessibility audit (focus trap in Modal, ARIA on Tabs), publish to a private npm registry (Ch 14, 24).

### Project 5 — Server-Rendered Blog with Streaming (Advanced)
A Next.js (or RSC framework) blog with Server Components, streaming, and SEO.
**Core**: Post list + detail pages with server-side data fetching, one interactive island (comments) as a Client Component, `Suspense` streaming for slow data (Ch 22).
**Advanced**: ISR with revalidation, Core Web Vitals measurement (LCP/CLS) before and after moving sections to Server Components, CSP header that blocks injected inline scripts (Ch 22, 25).

## Mastery Self-Check Questions

::code-wrapper{language="markdown" filename="self-check.md"}
```markdown
# Answer these without looking up the answer. If you can't, revisit the chapter.

## Hooks (Ch 3-11)
1. Why does `useEffect` with `[]` deps not see the latest state? What are the two fixes? (Ch 6, 8)
2. When does `useMemo` HURT performance instead of helping? (Ch 9)
3. `useState` vs `useReducer`: when is each the right choice? (Ch 10)
4. What's the difference between a custom hook returning a tuple vs an object? (Ch 11)

## Performance (Ch 13, 15, 20, 21)
5. Why do `keys` matter in reconciliation? What happens with index keys on a reordered list? (Ch 13)
6. Name three causes of unnecessary re-renders and their fixes. (Ch 15)
7. When is virtualization the wrong solution? (Ch 20)
8. `useTransition` vs `useDeferredValue`: when do you use each? (Ch 21)

## Architecture (Ch 7, 18, 19, 22)
9. When does Context cause performance problems, and what's the alternative? (Ch 7, 18)
10. Server Component vs Client Component: what determines the choice? (Ch 22)
11. Code splitting: when does `React.lazy` not help? (Ch 21)

## TypeScript (Ch 23)
12. Why does `<T,>` need a trailing comma in `.tsx`? (Ch 23)
13. `ReactNode` vs `JSX.Element` for `children` — which and why? (Ch 23)
14. What does the exhaustiveness check (`const _: never = action`) prevent? (Ch 23)

## Testing (Ch 24)
15. `getByText` vs `findByText`: when does each cause a flaky test? (Ch 24)
16. Why is `userEvent` preferred over `fireEvent`? (Ch 24)
17. When are snapshot tests harmful? (Ch 24)

## Security (Ch 25)
18. Name four places where JSX's auto-escaping does NOT protect you. (Ch 25)
19. Why is `localStorage` a risky default for auth tokens? What's the alternative? (Ch 25)
20. Why doesn't `url.startsWith('javascript:')` safely sanitize a URL? (Ch 25)
```
::

## Suggested Approach

- **Beginner exercises (1-5)**: Build all five in one session — they exercise Ch 3-6 fundamentals.
- **Intermediate exercises (6-10)**: Pick three that touch your weakest chapters.
- **Advanced exercises (11-15)**: These force engagement with Ch 20-25 — don't skip them.
- **Projects**: Pick one per tier (beginner, intermediate, advanced). The advanced project is where the hardest lessons (stale closures, reconciliation, server/client boundaries, security gaps) actually stick.

## Key Takeaways

::code-wrapper{language="javascript" filename="takeaways.js"}
```javascript
// 1. Exercises 1-5 → Ch 3-6: useState, controlled inputs, list rendering, useEffect cleanup.
//    If these are hard, re-read Ch 3-6 before moving on.

// 2. Exercises 6-10 → Ch 7-11: Context, useReducer, custom hooks, debounce, memoization.
//    These bridge from "components work" to "components are well-architected."

// 3. Exercises 11-15 → Ch 20-25: Virtualization, optimistic UI, TS generics, testing, security.
//    These are the topics that separate mid-level from senior React engineers.

// 4. Projects 1-5: Full applications that force you to combine multiple chapters.
//    Project 5 (SSR blog) is the capstone — it exercises Ch 22 + 25 together.

// 5. Self-check questions: if you can answer all 20 without looking up, you've mastered
//    the curriculum. If not, the chapter reference tells you exactly where to go back.
```
::
