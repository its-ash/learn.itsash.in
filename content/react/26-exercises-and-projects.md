# 26 — Exercises & Project Ideas

Reading twenty-five chapters builds vocabulary; building things builds judgment. This capstone chapter is a set of exercises and projects calibrated to force you to actually use what the earlier chapters covered — hooks, composition, performance, TypeScript, testing, SSR, and security — rather than just recognize it when you see it again.

## How to Use This Chapter

Each project lists:
- **Requirements**: the functionality that defines "done." Build these first.
- **Stretch Goals**: extensions that push into territory from later chapters (performance, TypeScript, testing, accessibility, SSR).

Don't start from a tutorial for these. Start from the requirements list, hit a wall, and *then* go back to the relevant chapter. The wall is where the learning happens.

## Beginner Projects

### 1. Todo List

The classic for a reason — small enough to finish in an afternoon, rich enough to touch state, lists, and forms all at once.

**Requirements**
- Add, complete, delete, and edit todos.
- Persist todos to `localStorage` so a refresh doesn't lose them.
- Filter by All / Active / Completed.
- Show a count of remaining active todos.

**Stretch Goals**
- Extract the persistence logic into a `useLocalStorage` custom hook (Chapter 11) reusable by other projects on this list.
- Add drag-to-reorder using pointer events and a ref-based drag state (Chapter 8).
- Migrate list state from multiple `useState` calls to a single `useReducer` (Chapter 10) once actions like "toggle," "edit," and "clear completed" start colliding.

### 2. Recipe Box

A CRUD app over a small local dataset — good practice for controlled forms and derived state.

**Requirements**
- List recipes with title, ingredients, and steps.
- A form to add a new recipe with client-side validation (no empty title, at least one ingredient).
- Search/filter recipes by title or ingredient.
- Click a recipe to see a detail view.

**Stretch Goals**
- Add routing (Chapter 19) so each recipe has its own URL (`/recipes/:id`) instead of view-state toggling.
- Memoize the filtered list with `useMemo` (Chapter 9) and verify with the Profiler that typing in the search box doesn't re-render every recipe card.
- Convert the project to TypeScript (Chapter 23), starting with a `Recipe` interface and typed form state.

### 3. Weather Dashboard

The first project that talks to a real network, making it the natural home for `useEffect` and loading/error states.

**Requirements**
- Fetch current weather for a city from a public weather API.
- Show loading and error states distinctly — not just a blank screen while waiting.
- Let the user search a different city without a full page reload.
- Cancel a stale request if the user searches again before the first one resolves (Chapter 6 and 17's abort-controller pattern).

**Stretch Goals**
- Wrap the fetch logic in a `useFetch` custom hook and reuse it for a five-day forecast panel.
- Add an error boundary (Chapter 16) around the dashboard so a malformed API response doesn't blank the whole page.
- Cache results per city in memory so re-searching a previously searched city is instant.

### 4. Quiz App

Exercises conditional rendering, derived state, and a bit of timing logic.

**Requirements**
- Present one multiple-choice question at a time from a fixed question bank.
- Track score across the quiz and show a summary screen at the end.
- Disable the "Next" button until an answer is selected.
- Show which answer was correct/incorrect after submission, not just a running score.

**Stretch Goals**
- Add a per-question countdown timer using `setInterval` inside `useEffect`, cleaned up correctly on unmount and on question change (a classic Chapter 6 cleanup-timing trap).
- Randomize question and answer order per attempt without ever mutating the original question bank array in place.
- Write component tests (Chapter 24) for "selecting the correct answer increments the score" and "the timer running out auto-advances."

## Intermediate Projects

### 5. Kanban Board

A meaningfully harder state-management problem: nested, structured data (columns containing cards) instead of a flat list.

**Requirements**
- Multiple columns (e.g., To Do / In Progress / Done), each holding an ordered list of cards.
- Drag a card between columns and reorder within a column.
- Add/edit/delete both columns and cards.
- Persist board state (`localStorage` or a backend of your choice).

**Stretch Goals**
- Model board state with `useReducer` and a discriminated-union action type in TypeScript (`{ type: 'MOVE_CARD'; ... } | { type: 'ADD_COLUMN'; ... }`) so invalid actions are caught at compile time.
- Share board state across deeply nested card/column components via Context (Chapter 7/18) instead of prop-drilling the dispatch function.
- Profile a drag operation with React DevTools and eliminate unnecessary re-renders of columns that weren't touched by the drag.

### 6. E-Commerce Product Catalog

Combines routing, data fetching, and non-trivial shared state (a cart) that lives above where it's consumed.

**Requirements**
- Product list and product detail pages via React Router (Chapter 19), including a dynamic `:productId` route.
- A cart that persists across route navigation and a page refresh.
- Category and price filtering on the list page, reflected in the URL as query params (so a filtered view is shareable/bookmarkable).
- Pagination or infinite scroll for the product list.

**Stretch Goals**
- Move cart state to a state-management library (Chapter 18) — Zustand or Redux Toolkit — and justify in a comment why Context alone would cause avoidable re-renders here.
- Add optimistic UI for "add to cart" (Chapter 17): update the visible cart immediately, roll back if the (simulated) request fails.
- Lazy-load the product detail route with `React.lazy` and a `Suspense` boundary (Chapter 21) and confirm via the network tab that its bundle is genuinely code-split.

### 7. Real-Time Chat Interface

The first project where "real time" forces you to think carefully about effect cleanup and stale closures.

**Requirements**
- Connect to a WebSocket (or a mocked equivalent) and render incoming messages as they arrive.
- A message input that sends on Enter and clears itself after sending.
- Auto-scroll to the newest message, except when the user has scrolled up to read history (don't yank them back down).
- Show a "connecting…" / "reconnecting…" state distinct from "connected."

**Stretch Goals**
- Reproduce and then fix a stale-closure bug on purpose: read `messages` inside a WebSocket `onmessage` callback registered in an effect with an empty dependency array, observe it never seeing new state, then fix it with a functional state update or a ref (Chapter 6/8's core gotcha).
- Virtualize the message list (Chapter 20) once it holds thousands of messages, and measure the frame-rate difference with and without virtualization.
- Add typing indicators using debounced state updates.

### 8. Markdown Note-Taking App

A split-pane editor/preview app — good practice for synchronizing two views off one source of truth without letting them drift.

**Requirements**
- A textarea for Markdown input and a live-rendered preview pane side by side.
- Support multiple notes with a sidebar list, create/rename/delete.
- Debounce the preview render so every keystroke doesn't re-parse the full document.
- Persist notes to `localStorage`.

**Stretch Goals**
- Render the Markdown-to-HTML output through `dangerouslySetInnerHTML` deliberately, then sanitize it with DOMPurify (Chapter 25) — this project is a good forcing function for that exact lesson rather than a hypothetical.
- Add keyboard shortcuts (bold/italic/link) that manipulate `textarea` selection via a ref (Chapter 8), including correct behavior when nothing is selected.
- Write a custom `useDebouncedValue` hook and unit test it (Chapter 24) with fake timers.

## Advanced Projects

### 9. Server-Rendered Blog with Streaming

Forces engagement with the boundary between server and client rendering rather than treating the whole app as one client bundle.

**Requirements**
- A Next.js (or equivalent RSC-capable framework) app with a post list and post detail pages, data fetched on the server (Chapter 22).
- At least one interactive island (comments, a like button) as an explicit Client Component, with the rest of the page as Server Components.
- Streaming with `Suspense` boundaries so slow data (e.g., comments) doesn't block the rest of the page from rendering.
- SEO-correct metadata (title, description, Open Graph tags) generated per post on the server.

**Stretch Goals**
- Add ISR (incremental static regeneration) or an equivalent revalidation strategy, and explain in your own words why a Server Component re-fetching on every request vs. a cached, revalidated one is a real architectural choice, not a default to accept blindly.
- Measure and report Core Web Vitals (LCP, CLS) before and after moving non-interactive sections from Client to Server Components.
- Add a Content Security Policy header (Chapter 25) and verify a deliberately injected inline `<script>` in a comment fails to execute.

### 10. Collaborative Whiteboard

A genuinely hard concurrency and performance problem: many rapid, high-frequency updates from multiple sources rendered smoothly.

**Requirements**
- Freehand drawing on a canvas, with strokes synced in real time across two or more browser tabs/clients (WebSocket or a service like Firebase/Supabase realtime).
- Undo/redo that works correctly with remote updates arriving concurrently with local ones.
- Multiple simultaneous cursors showing where other connected users are pointing.
- Reasonable performance at 60fps while drawing, even with several remote cursors updating concurrently.

**Stretch Goals**
- Use `useTransition` or `useDeferredValue` (Chapter 21) to keep the local stroke rendering responsive while remote cursor updates are marked as lower-priority.
- Batch outgoing stroke-point updates instead of sending one message per pointer-move event, and measure the network and render-cost difference.
- Model the shared document with a CRDT (Yjs is a reasonable choice) so concurrent edits from multiple clients merge deterministically without a central lock.

### 11. Component Library with Full TypeScript and Test Coverage

Less "an app," more "the kind of internal tool a real team maintains for years" — the project that best exercises Chapters 23 and 24 together.

**Requirements**
- At least eight components (Button, Modal, Tooltip, Tabs, Select, Toast, Accordion, DataTable) with a consistent prop API and theming approach.
- Full TypeScript coverage: exported prop types, generics where appropriate (a `Select<T>` that's type-safe in the value it emits), and no `any` anywhere in the public API.
- Unit and interaction tests (Chapter 24) for every component covering keyboard navigation, not just click handlers.
- Storybook (or equivalent) documenting every component's variants and states.

**Stretch Goals**
- Audit every interactive component for accessibility: focus trapping in the Modal, correct ARIA roles on Tabs and Accordion, and full keyboard operability with no mouse at all.
- Publish the library to a private or scratch npm registry and consume it from a separate throwaway app to catch bundling/peer-dependency issues that don't show up inside a monorepo.
- Add visual regression tests and a CI step that fails the build on an uncovered public prop.

### 12. Framework-Adjacent Capstone: Build a Tiny "React"

The deepest possible exercise — not a user-facing app at all, but implementing a minimal subset of React's own core to make the concepts from Chapters 2, 6, 13, and 21 stop being magic.

**Requirements**
- A `createElement`/JSX-compatible function that produces a plain object tree (a virtual DOM).
- A `render` function that turns that tree into real DOM nodes.
- A minimal `useState` (module-level fiber/hook-index tracking is fine) that triggers a re-render on update.
- Keyed reconciliation (Chapter 13) that reuses existing DOM nodes for unchanged keys instead of tearing down and rebuilding the whole list on every update.

**Stretch Goals**
- Add a minimal `useEffect` with dependency-array comparison and cleanup-function support.
- Implement a naive Fiber-style unit of work loop that yields to the browser between chunks of work, and observe why this matters for a large tree compared to a fully synchronous recursive render.
- Once it works, go re-read Chapter 21 (Concurrent Features) — the parts about interruptible rendering and priority will read completely differently having built even a toy version of the mechanism yourself.

## Suggested Order

If you're working through this chapter after finishing the curriculum in sequence, doing all twelve projects in order is a reasonable default — the beginner set exercises Chapters 3–10, the intermediate set leans on 11–20, and the advanced set specifically forces engagement with 21–25. If you're short on time, pick one project per tier rather than skipping the advanced tier entirely — the hardest lessons (stale closures, reconciliation cost, server/client boundaries) mostly live there.

## Reading Code to Mastery

Once these projects stop being hard, the next step is reading real production React rather than writing more toy apps:

- **React's own source** (`packages/react-reconciler`) — the actual Fiber implementation behind Project 12's toy version.
- **TanStack Query** — the de facto reference for data-fetching, caching, and request-deduplication patterns beyond what Chapter 17 covers.
- **Radix UI / Headless UI** — accessible component internals worth studying before building Project 11's component library.
- **Zustand** — a small enough state-management library to read start-to-finish in an afternoon.
- **Next.js App Router source** — how Server Components, streaming, and route segments actually connect under Chapter 22's abstractions.

## Practice Sites

- **Frontend Mentor** — real design-to-code challenges at every difficulty level.
- **React's own documentation "Thinking in React" tutorial** — worth redoing after this chapter, not just at the start.
- **Advent of Code** — not React-specific, but a good source of the small, self-contained logic problems that back Beginner Exercises-style practice.
- **Exercism's JavaScript track** — for the underlying language fundamentals a shaky React app usually traces back to.

## Final Words

Chapters 1 through 25 gave you the vocabulary — hooks, composition, context, concurrency, TypeScript, testing, security. None of it fully sticks until it's been forced through the specific, annoying constraints of a real project: a stale closure that only shows up under a real WebSocket, a re-render that only matters once a list has real thousands of rows, a security gap that only matters once user input actually reaches `dangerouslySetInnerHTML`.

Build the beginner projects fast and move on. Sit with the advanced ones. Read real source when you're stuck for more than thirty minutes. Profile before you optimize. Sanitize before you render.

Welcome to being a React developer.
