# 12 — Conditional Rendering Patterns

Chapter 2 introduced the basics — ternaries and `&&` — as JSX expression mechanics. This chapter goes deeper into *choosing the right pattern* for a given shape of conditional UI, since real components often have far more than two branches, and the naive approach scales badly.

## Ternary vs. `&&`: Choosing Deliberately

::code-wrapper{language="javascript"}
```javascript
// Two mutually exclusive branches -> ternary
function LoginButton({ isAuthenticated }) {
  return isAuthenticated ? <LogoutButton /> : <SignInButton />
}

// One branch, or nothing -> &&
function NewBadge({ isNew }) {
  return (
    <div>
      <span>Product Name</span>
      {isNew && <span className="badge">New</span>}
    </div>
  )
}
```
::

Reversed, both become harder to read for no benefit:

::code-wrapper{language="javascript"}
```javascript
// Awkward — using && to hide the "true" case and rendering null explicitly for false
function LoginButton({ isAuthenticated }) {
  return isAuthenticated && <LogoutButton /> || <SignInButton />
  // BUG-PRONE: if LogoutButton ever conditionally returns a falsy value like 0 or "",
  // the || fallback kicks in and renders SignInButton incorrectly. Avoid mixing && and ||
  // for branching logic — use a ternary for two real branches.
}
```
::

## Early Returns: The Cleanest Pattern for Whole-Component Branches

When an entire component's output differs based on a condition — not just a fragment of it — an early return keeps the "happy path" JSX unindented and easy to read, instead of wrapping the whole return value in nested ternaries.

::code-wrapper{language="javascript"}
```javascript
// Nested ternaries for a WHOLE-component decision — technically works, hard to scan
function UserProfile({ status, user, error }) {
  return status === 'loading' ? (
    <Spinner />
  ) : status === 'error' ? (
    <ErrorMessage error={error} />
  ) : status === 'success' ? (
    <ProfileCard user={user} />
  ) : null
}
```
::

::code-wrapper{language="javascript"}
```javascript
// Early returns — each condition is a standalone, readable guard clause
function UserProfile({ status, user, error }) {
  if (status === 'loading') return <Spinner />
  if (status === 'error') return <ErrorMessage error={error} />
  if (status === 'success') return <ProfileCard user={user} />
  return null
}
```
::

Early returns are unconditionally the right choice once you have three or more mutually exclusive, whole-component branches — the nested-ternary version's readability degrades rapidly with each added case, while the early-return version's readability stays flat.

### Rule: Hooks Must Come Before Any Early Return

Because of the Rules of Hooks (chapter 11), every hook call in a component must happen unconditionally, before any early `return`. This ordering constraint shapes how you structure components with guard clauses.

::code-wrapper{language="javascript"}
```javascript
// VIOLATION: a hook called AFTER an early return only runs conditionally
function Bad({ status }) {
  if (status === 'loading') return <Spinner />
  const [expanded, setExpanded] = useState(false)  // sometimes skipped entirely!
  return <Details expanded={expanded} onToggle={() => setExpanded(e => !e)} />
}
```
::

::code-wrapper{language="javascript"}
```javascript
// Fixed: all hooks first, unconditionally; early returns come after
function Good({ status }) {
  const [expanded, setExpanded] = useState(false)
  if (status === 'loading') return <Spinner />
  return <Details expanded={expanded} onToggle={() => setExpanded(e => !e)} />
}
```
::

## Object/Map Lookups for Many Branches

Once a condition has more than two or three possible values, mapping the condition to JSX (or a component reference) via a plain object avoids both nested ternaries and long `if`/`else if` chains.

::code-wrapper{language="javascript"}
```javascript
const STATUS_ICONS = {
  pending: <ClockIcon />,
  approved: <CheckIcon />,
  rejected: <XIcon />,
  cancelled: <BanIcon />,
}

function StatusIcon({ status }) {
  return STATUS_ICONS[status] ?? <QuestionMarkIcon />
}
```
::

For rendering entire *components*, not just icons, map to component references and render them dynamically — a pattern sometimes called a "component registry."

::code-wrapper{language="javascript"}
```javascript
const STEP_COMPONENTS = {
  account: AccountStep,
  billing: BillingStep,
  confirmation: ConfirmationStep,
}

function Wizard({ currentStep, ...stepProps }) {
  const StepComponent = STEP_COMPONENTS[currentStep]
  if (!StepComponent) throw new Error(`Unknown wizard step: ${currentStep}`)
  return <StepComponent {...stepProps} />
}
```
::

## Render Props: Passing Rendering Logic as a Prop

A **render prop** is a prop whose value is a function that returns JSX — it lets a component delegate *how* to render something while retaining control over *when* and *with what data*. This pattern predates hooks (it was the primary logic-reuse mechanism before hooks existed) but remains genuinely useful for a specific shape of problem: a parent that manages some behavior/state and needs the consumer to decide the visual output.

::code-wrapper{language="javascript"}
```javascript
function MouseTracker({ render }) {
  const [position, setPosition] = useState({ x: 0, y: 0 })

  function handleMouseMove(event) {
    setPosition({ x: event.clientX, y: event.clientY })
  }

  return <div onMouseMove={handleMouseMove}>{render(position)}</div>
}

function App() {
  return (
    <MouseTracker render={({ x, y }) => (
      <p>The mouse is at ({x}, {y})</p>
    )} />
  )
}
```
::

A common variant uses `children` itself as the render function, which reads slightly more naturally at the call site.

::code-wrapper{language="javascript"}
```javascript
function MouseTracker({ children }) {
  const [position, setPosition] = useState({ x: 0, y: 0 })
  return (
    <div onMouseMove={e => setPosition({ x: e.clientX, y: e.clientY })}>
      {children(position)}
    </div>
  )
}

// Usage — children is a function, not JSX directly
<MouseTracker>
  {({ x, y }) => <p>Mouse at ({x}, {y})</p>}
</MouseTracker>
```
::

### Render Props vs. Custom Hooks

In modern React, most render-prop use cases (sharing stateful *logic*, as opposed to sharing rendered *markup* with injected data) are better served by a custom hook (chapter 11) — a hook avoids the extra component nesting a render prop introduces into the tree, and its data flows through normal variable assignment rather than a callback-shaped prop.

::code-wrapper{language="javascript"}
```javascript
// Equivalent logic, as a hook — no extra wrapper component, no nesting in the tree
function useMousePosition() {
  const [position, setPosition] = useState({ x: 0, y: 0 })
  useEffect(() => {
    function handleMove(e) { setPosition({ x: e.clientX, y: e.clientY }) }
    window.addEventListener('mousemove', handleMove)
    return () => window.removeEventListener('mousemove', handleMove)
  }, [])
  return position
}

function App() {
  const { x, y } = useMousePosition()
  return <p>Mouse at ({x}, {y})</p>
}
```
::

Render props remain the right tool specifically when a component needs to control *rendering itself* (not just expose data) — for example, a `<List>` component that manages virtualization/scrolling internally but needs the caller to define how each row looks, given the row's data and index.

## Guard Clauses for Loading/Error/Empty States (a Complete Real Pattern)

Production components almost always have more than two states worth distinguishing: loading, error, empty (successfully loaded, zero results), and populated. Collapsing "empty" into "success" is a common oversight that leaves users staring at a blank area with no explanation.

::code-wrapper{language="javascript"}
```javascript
function SearchResults({ status, results, error }) {
  if (status === 'loading') return <Spinner />
  if (status === 'error') return <ErrorMessage error={error} />
  if (status === 'success' && results.length === 0) {
    return <EmptyState message="No results found. Try a different search." />
  }
  if (status === 'success') {
    return (
      <ul>
        {results.map(r => <li key={r.id}>{r.title}</li>)}
      </ul>
    )
  }
  return null  // status === 'idle', e.g. before the user has searched at all
}
```
::

## 💡 Tips & Tricks

- **Idiom** — Switch from ternaries to early returns the moment a component has three or more mutually exclusive, whole-output branches — the readability of nested ternaries degrades far faster than early returns as branches accumulate.
- **Idiom** — Reach for an object/map lookup instead of a long `if`/`else if` chain or switch once a condition has more than two or three possible values tied to specific JSX or components — it turns branching logic into flat, scannable data.
- **Debug** — If a component throws "Rendered fewer hooks than expected," check for an early `return` positioned before a hook call — this exact error message is React detecting the hook-call-order violation described in this chapter, not a generic crash.
- **Idiom** — Default to a custom hook over a render prop for sharing *logic*; reserve render props for the narrower case where a component must also control the render output's structure, not just supply data to it.
- **Idiom** — Always give "successfully loaded, but zero results" its own explicit branch distinct from "loading" and generic "success" — a common, easy-to-miss real-world gap that leaves users looking at a blank screen with no feedback.

## ⚠️ Edge Cases & Gotchas

- **Mixing `&&` and `||` for branching (`cond && <A /> || <B />`) breaks when `<A />`'s render result is itself falsy** — if the "true" branch component ever conditionally returns `null`, `0`, or `false`, the `||` silently falls through to the "false" branch even though the original condition was true — a genuinely confusing bug to trace. Use a real ternary for two-branch logic instead.
- **A hook called after an early `return` doesn't just warn — it corrupts hook state for every hook after it** — this is the same call-order mechanism from chapter 11, applied specifically to the early-return pattern; React does throw a development warning ("Rendered more/fewer hooks than during the previous render"), but only after the corruption has already happened for that render.
- **An object lookup with no fallback (`STATUS_ICONS[status]`) silently renders `undefined` (nothing) for an unrecognized key** — no error, no warning, just an empty spot in the UI — always provide a `?? <Fallback />` or a `default` case so unexpected/new values fail visibly instead of vanishing.
- **A component registry (`STEP_COMPONENTS[key]`) with a typo'd key throws when you try to render `undefined` as a JSX tag** — `<StepComponent />` where `StepComponent` is `undefined` throws "Element type is invalid," a notoriously unhelpful error message whose root cause (a key typo or missing registry entry) is one level removed from the actual thrown error.
- **Render props re-create their function on every parent render, same as any inline callback prop** — a render-prop pattern combined with `React.memo` on the receiving component gains nothing unless the render function itself is memoized (`useCallback`), for exactly the referential-equality reasons covered in chapter 9.

## 🧠 Spot the Bug

A discount banner is supposed to show a `<Banner />` for eligible carts and nothing otherwise, but it crashes with "Rendered fewer hooks than during the previous render" as soon as a cart becomes eligible after already being ineligible once.

::code-wrapper{language="javascript"}
```javascript
function DiscountBanner({ cartTotal }) {
  if (cartTotal < 50) return null

  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  return (
    <div className="banner">
      Free shipping unlocked! <button onClick={() => setDismissed(true)}>Dismiss</button>
    </div>
  )
}
```
::

<details>
<summary>Answer</summary>

The `useState` call sits after an early `return null` that fires whenever `cartTotal < 50`. On renders where the cart is under $50, React never reaches the `useState` call at all — this component's hook list is empty for that render. On a later render where the cart crosses $50, React suddenly sees a `useState` call where there wasn't one before, and its position-based hook bookkeeping detects the mismatch, throwing the "Rendered fewer hooks" error to protect against invisible state corruption.

**The lesson**: every hook call must execute unconditionally on every render — move `useState` (and any other hook) above all early returns, so the number and order of hook calls never depends on a branch's outcome.

</details>

## Key Takeaways

- Use a ternary for exactly two mutually exclusive branches; use `&&` only when the false case should render nothing, and only with a strict boolean condition.
- Prefer early returns over nested ternaries once a component has three or more whole-output branches — readability degrades much faster with nested ternaries.
- All hooks must be called unconditionally, before any early return — violating this corrupts hook state silently or throws a hook-count mismatch error.
- Object/map lookups replace long conditional chains once a value has more than a couple of branches — always provide an explicit fallback for unmatched keys.
- Render props remain useful specifically when a component must control rendering structure itself, not merely expose data — for pure logic reuse, prefer a custom hook (chapter 11).
- Always give "loaded but empty" its own explicit UI state, distinct from loading and populated success — it's the most commonly missed real-world branch.
