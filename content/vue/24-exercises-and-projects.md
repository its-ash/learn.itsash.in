# 24 — Exercises & Projects

Reading twenty-three chapters builds vocabulary; building projects is what turns that vocabulary into a skill. This chapter is a capstone set of project ideas, calibrated from your first component to a production-shaped application, each with concrete requirements and stretch goals rather than an open-ended "build a todo app" prompt.

## How to Use This Chapter

- Build projects roughly in order — each tier assumes comfort with everything the previous tier required.
- Don't skip straight to "Advanced" even if it looks more interesting — the beginner/intermediate projects are deliberately scoped to force practice with specific chapters' concepts (the destructuring trap, `v-model` on components, route guards) that are easy to *read about* but only really click once you've been bitten by them yourself.
- Revisit an earlier project after finishing a later chapter — adding TypeScript (ch. 17) to a project you built before reading that chapter, or adding tests (ch. 18) retroactively, is itself a valuable exercise.
- Treat "Requirements" as the definition of done for a minimal, working version; "Stretch Goals" as where the real learning happens once the basics work.

## Beginner Projects

### 1. Multi-List Todo App

**Requirements:**
- Multiple named lists (Work, Personal, ...), not just one flat list.
- Add, edit, complete, and delete items; completed items visually distinct, not just removed.
- Persist to `localStorage` so a page refresh doesn't lose data.
- Use `ref`/`reactive` correctly for the list data — this is the project to deliberately hit the destructuring trap from chapter 03 once, on purpose, so you recognize it instantly later.

**Stretch Goals:**
- Drag-and-drop reordering within a list.
- Extract list-persistence logic into a `useLocalStorage` composable, reusable across all lists.
- Add due dates with a "overdue" visual state computed reactively from the current date.

### 2. Custom Form Controls with `v-model`

**Requirements:**
- Build a `<StarRating>` component supporting `v-model` (chapter 09's custom-input pattern), emitting `update:modelValue`.
- Build a `<TagInput>` component (type a tag, press Enter, see it as a removable chip) also wired via `v-model`, backed by an array.
- Combine both into a single "product review" form using multiple `v-model`s (chapter 09) on one parent component.

**Stretch Goals:**
- Add validation states (required, min/max) to both controls with visible error messaging.
- Make `<StarRating>` keyboard-accessible (arrow keys adjust the value, not just mouse clicks).
- Extract shared validation logic into a `useFieldValidation` composable used by both controls.

### 3. Weather Dashboard with Async States

**Requirements:**
- Fetch current weather for a city from a public weather API, showing distinct loading/error/success states (chapter 12).
- A search box lets the user change cities; guard against the chapter-12 race condition where a slow earlier request resolves after a faster later one and overwrites it with stale data.
- Cache the last 5 searched cities' results in memory so re-searching a recent city doesn't re-fetch.

**Stretch Goals:**
- Add a 5-day forecast view using nested/dynamic routes (chapter 11) — `/weather/:city/forecast`.
- Debounce the search input (chapter 15's custom directive territory, or a `useDebouncedValue` composable) instead of fetching on every keystroke.
- Handle the API rate-limit error case distinctly from a generic network failure, with a specific user-facing message for each.

## Intermediate Projects

### 4. E-Commerce Cart with Pinia

**Requirements:**
- A product listing page, a cart (Pinia store, chapter 10), and a checkout summary — cart state must survive navigation between routes.
- Cart actions: add, remove, change quantity, apply a discount code (an action that validates against a small hardcoded rule set and updates state accordingly).
- Persist the cart across a page refresh (Pinia persistence plugin, or a hand-rolled `localStorage` sync).
- Getters (not components computing totals ad hoc) for cart subtotal, discount amount, and final total.

**Stretch Goals:**
- Add a second store (e.g., a wishlist) and compose the two stores together (chapter 10's store composition) — moving an item from wishlist to cart should update both stores consistently.
- Add route guards (chapter 11) preventing checkout access with an empty cart.
- Write Vitest unit tests (chapter 18) for the cart store's actions and getters in isolation, without mounting any component.

### 5. Kanban Board with Drag-and-Drop

**Requirements:**
- Columns (To Do / In Progress / Done) with cards draggable between them.
- Card creation/editing via a modal, implemented with Teleport (chapter 16) so it isn't visually clipped by a scrolling/overflow-hidden column.
- State management via Pinia; moving a card between columns is a store action, not a component-local mutation.

**Stretch Goals:**
- Add a `<Suspense>` boundary (chapter 16) around an async "load board from API" step, with a real fallback state, not just a loading spinner slapped on top of broken layout.
- Implement undo for the last move/delete action (a small history stack in the store).
- Add keyboard-only card movement as an accessibility fallback to drag-and-drop.

### 6. Admin Panel with Route Guards and Nested Routes

**Requirements:**
- Nested routes (chapter 11): `/admin` as a layout shell with `/admin/users`, `/admin/settings`, `/admin/reports` as children rendering into a shared sidebar layout.
- A route guard redirecting unauthenticated users to `/login`, implemented as real middleware, not an `if` check duplicated in every page component.
- Lazy-loaded route components (chapter 11/21) for every `/admin/*` page — verify in the Network tab that each is its own chunk, not part of the initial bundle.

**Stretch Goals:**
- Role-based guards: a `/admin/reports` route accessible only to a specific role, with a distinct "forbidden" page (not a silent redirect) for an authenticated user lacking that role.
- Add a global loading bar tied to route navigation start/end events.
- Convert the whole project to TypeScript (chapter 17), typing route params and guard signatures.

## Advanced Projects

### 7. Real-Time Collaborative Notes App

**Requirements:**
- Multiple users editing shared notes, synced via WebSocket — reflect remote changes reactively without a manual page refresh.
- Custom composables (chapter 07/23) encapsulating the WebSocket connection lifecycle (`useWebSocket`), with correct `onUnmounted` cleanup (chapter 23's leaked-listener gotcha, made real).
- Optimistic local updates: a user's own edit appears instantly, then reconciles with the server's authoritative state when it arrives.

**Stretch Goals:**
- Conflict resolution when two users edit the same note near-simultaneously (last-write-wins is acceptable; document the tradeoff versus an operational-transform/CRDT approach).
- Presence indicators (show which other users currently have a given note open).
- Add SSR (chapter 20) for the initial note list for faster first paint, falling back to the WebSocket connection only after hydration.

### 8. Component Library with Renderless/Compound Components

**Requirements:**
- Build and publish (at least locally, via Vite library mode — chapter 21) a small component library: a compound `<Tabs>`/`<Tab>` set (chapter 23), a renderless `<DataFetcher>` (chapter 13/23), and at least one custom directive (chapter 15).
- Correctly mark `vue` as an external peer dependency (chapter 21) and verify, in a separate throwaway consuming app, that `provide`/`inject` works correctly across the library boundary.
- Full TypeScript types (chapter 17) for every exported component's props, emits, and slots.

**Stretch Goals:**
- Add a documentation/demo site for the library, itself built with Nuxt Content (chapter 20) — dogfooding the same system this curriculum is written in.
- Write component tests (chapter 18) covering the renderless component's scoped-slot contract specifically (that it exposes the right shape of data to its slot, independent of any particular consumer's markup).
- Add a visual regression or accessibility audit step to a CI pipeline for the library.

### 9. SSR E-Commerce Storefront with Nuxt

**Requirements:**
- A Nuxt-based storefront (chapter 20) with SSR-rendered product listing and detail pages for real SEO benefit — verify with "view page source" that product content is present without JavaScript execution.
- `useFetch`/`useAsyncData` for all product data, with correctly-keyed fetches per route param (chapter 20's stale-cache gotcha, avoided deliberately).
- A cart that works correctly across the server/client boundary — cart state itself should be client-only (`<ClientOnly>` or deferred to `onMounted`, chapter 20) since it's inherently per-session, while product content remains server-rendered.
- CSP headers (chapter 22) configured for the deployed site, verified via response headers, not just assumed.

**Stretch Goals:**
- Add a server route (`server/api/*`) acting as a backend-for-frontend, proxying and shaping a third-party product API rather than calling it directly from the client.
- Sanitize any user-generated content (product reviews) with DOMPurify (chapter 22) before rendering, and add a `Spot the Bug`-style deliberate near-miss (an allowlist covering tags but not URL schemes) to your own PR description as a self-review exercise.
- Run a Lighthouse audit before and after adding route-level code splitting and image optimization, and record the concrete before/after metrics.

### 10. Performance-Instrumented Data Grid

**Requirements:**
- A large (10,000+ row) sortable, filterable data grid using virtual scrolling (chapter 19).
- Use `v-memo` (chapter 19) on row rendering, with a correctly-scoped dependency array (not an object/array reference, per chapter 19's gotcha) — verify with Vue DevTools' render-flash overlay that unaffected rows genuinely skip re-render on a filter change.
- Ship it with route-level and component-level code splitting (chapter 21), and use `rollup-plugin-visualizer` to confirm the grid's own (likely non-trivial) dependency weight is isolated to its own lazy-loaded chunk.

**Stretch Goals:**
- Add column-level virtualization in addition to row virtualization, for a grid wide enough that horizontal scroll performance also matters.
- Benchmark and document, with real before/after numbers, the difference `v-memo` and `shallowRef` (chapter 19) make on this specific dataset size — don't take the chapter's claims on faith, measure your own.
- Add full keyboard navigation and screen-reader-appropriate ARIA roles, addressing chapter 19's virtual-scrolling-breaks-accessibility gotcha directly rather than leaving it as a known limitation.

## Capstone: Combine Three Projects Into One

Once at least one beginner, one intermediate, and one advanced project are built, combine pieces of them into a single larger application — e.g., the E-Commerce Cart (4) plus the SSR Storefront (9) plus the Component Library (8), using your own published library's `<Tabs>` for a product page's description/reviews/specs sections, your own cart store, server-rendered for SEO, deployed with a real CSP. This is deliberately open-ended: the goal is integrating separately-learned pieces into one coherent codebase, which surfaces integration problems (a composable that assumed client-only execution, now running under SSR; a component library's peer-dependency assumption, now tested for real) that no single isolated project exercises on its own.

## Reading Code to Mastery

Reading production Vue source is as valuable as building — study:

- **Vue core** (`runtime-core`, `reactivity` packages) — the actual Proxy-based reactivity implementation behind every `ref`/`reactive` used across this whole curriculum.
- **Pinia** — a relatively small, readable codebase; a good first "real library" to read end to end after chapter 10.
- **VueUse** — dozens of composables demonstrating chapter 23's conventions (`MaybeRef` parameters, ref-object returns, careful cleanup) applied consistently at scale.
- **Vue Router** — navigation guards and route matching, underpinning chapter 11.
- **Nuxt** (`nuxt/nuxt`) — how file-based routing, auto-imports, and `useFetch` are actually implemented on top of Vite and Vue.
- **Headless UI (Vue) / Radix Vue** — production-grade compound and renderless component patterns, directly extending chapter 23.

## Practice Sites

- **Vue SFC Playground** (the official online playground) — fastest way to test a small reactivity or template question in isolation, no project setup needed.
- **Frontend Mentor** — real-world UI-design challenges, good for practicing component composition against a fixed visual spec.
- **Codewars / LeetCode** — general JavaScript algorithm practice; not Vue-specific, but the underlying language fluency directly supports faster Vue development.

## Open Source Contribution

- `vuejs/core` — the framework itself; look for `good first issue` labels, though core reactivity/compiler issues are genuinely advanced.
- `vuejs/pinia` — smaller surface area, approachable for a first real-world PR.
- `vueuse/vueuse` — an excellent place to both read idiomatic composables and contribute a new one.
- `nuxt/nuxt` — larger and more complex, but directly relevant if you're building on Nuxt day to day.

## Mastery Self-Check

Can you confidently:

- Explain the destructuring trap without looking it up? (Destructuring a `reactive` object copies out plain values, disconnected from reactivity — access via `.value` on individual `ref`s, or use `toRefs`, to preserve it.)
- Explain why `v-memo="[product]"` is usually useless on a `.map()`-derived list? (A new object reference every render means the shallow comparison never sees "unchanged," so nothing is ever skipped.)
- State the one thing `shallowRef` does and does not track? (Tracks `.value` reassignment; does not track in-place mutation of what `.value` points to.)
- Explain why `onMounted` never fires during SSR? (There's no real DOM being mounted on the server — the hook is specifically the client-only/DOM-mounted boundary.)
- Explain why `import.meta.env.SOME_SECRET` (unprefixed) is `undefined` in client code, and why that's a security boundary, not a bug? (Only `VITE_`-prefixed variables are exposed to the client bundle by design, preventing accidental secret leakage.)
- Explain why a tag allowlist alone doesn't make `v-html` safe? (Attribute *values* — like a `javascript:` URL in `href` — need their own allowlist; permitting a tag says nothing about what's safe inside its attributes.)
- Explain the actual failure mode of `return { ...reactiveObj, someMethod }` from a composable? (Spread copies current values out as a one-time plain-object snapshot — not live refs — so the caller never sees future updates.)
- Choose, without hesitating, between a composable and a renderless component for a given piece of shared logic? (Consumer needs to control markup → renderless component; consumer just needs reactive values → composable.)
- Explain why bundling `vue` into a published component library breaks `provide`/`inject` for its consumers? (Produces two separate Vue runtime instances — each with its own separate `provide`/`inject` registry — instead of one shared instance.)
- Read a component and correctly identify whether it's genuinely presentational, or a container mislabeled as one? (No fetching/store/router access, purely a function of props and emitted events, with no exceptions.)

If you can answer all ten without opening another chapter, you've internalized this curriculum, not just read it.

## Final Words

Vue rewards exactly the kind of careful attention this curriculum tried to model throughout: reactivity is forgiving until the one time it silently isn't (the destructuring trap, `shallowRef` mutation, a `reactive` spread), and every "gotcha" section in the previous twenty-three chapters exists because real developers hit that exact thing in real production code, not because it's a clever trick question.

Build the projects. Read the source of the libraries you depend on daily. Hit the destructuring trap once, on purpose, so you recognize its shape instantly the next time it shows up disguised as a completely different-looking bug. Open Vue DevTools and actually watch reactivity happen rather than only reasoning about it abstractly.

Welcome to being a Vue developer.

💚
