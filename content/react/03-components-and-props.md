---
title: "03 — Components & Props"
description: "Function component anatomy, props as read-only referential-equality contract, PropTypes vs TypeScript, children render-prop and cloneElement patterns, compound components, discriminated-union props, anti-patterns. Code-first reference for mid-to-senior React engineers."
---

# 03 — Components & Props

## Function Component Anatomy

::code-wrapper{language="javascript" filename="function_component_anatomy.js"}
```javascript
// A function component is a pure function: props in, JSX (or null) out.
// PascalCase is MANDATORY — JSX treats lowercase-first tags as host DOM elements.
// `<usercard />` → React renders an unknown HTML <usercard>, NOT your component.

function UserCard({ name, title, avatarUrl }) {
  // No lifecycle, no instance, no `this`.
  // React calls this function whenever props OR state in the subtree change.
  return (
    <div className="user-card">
      <img src={avatarUrl} alt={`${name}'s avatar`} />
      <h3>{name}</h3>
      <p>{title}</p>
    </div>
  )
}

export default UserCard
```
::

### Arrow Function Form — Equivalent, Not Identical

::code-wrapper{language="javascript" filename="arrow_vs_declaration.js"}
```javascript
// Declaration form — hoisted; can be referenced before its definition in the module.
function Button({ label }) { return <button>{label}</button> }

// Arrow form — not hoisted; assigned to a const. Identical behavior to React.
const Button = ({ label }) => <button>{label}</button>

// DIFFERENCE THAT MATTERS: arrow functions have no own `arguments`, `this`, or
// `new.target`. Neither matters for function components today, but tooling like
// some older HOCs and certain decorators rely on `this`-binding — declaration
// form is safer if you're unsure. Most teams pick one via lint rule and move on.
```
::

### Return Value Rules

::code-wrapper{language="javascript" filename="return_value_rules.js"}
```javascript
// Valid return values:
//   1. A single JSX element (most common)
//   2. null (render nothing — no DOM node produced)
//   3. An array of elements (each MUST have a stable `key` prop)
//   4. A string or number (rendered as a text node)
//   5. A Fragment (<></> or <React.Fragment>) — groups without a wrapper DOM node
//   6. A Portal (ReactDOM.createPortal — renders into a different DOM subtree, Ch 18)

function Conditional({ show }) {
  if (!show) return null  // produces zero DOM nodes — not even an empty <div>
  return <p>Visible</p>
}

// INVALID: returning multiple sibling elements without a wrapping Fragment.
// function Broken() { return <h1>A</h1> <p>B</p> }  // SyntaxError / undefined return
// CORRECT: Fragment groups them without polluting the DOM with a wrapper <div>.
function Fixed() {
  return (
    <>
      <h1>A</h1>
      <p>B</p>
    </>
  )
}
```
::

## Props Destructuring — The Signature IS the Documentation

::code-wrapper{language="javascript" filename="destructuring.js"}
```javascript
// ANTI-PATTERN: props object dotting — you must read the whole body to know the API.
function OrderSummary(props) {
  return <p>{props.itemCount} items · ${props.total.toFixed(2)}</p>
}

// IDIOMATIC: destructure in the signature. The parameter list IS the public API.
function OrderSummary({ itemCount, total }) {
  return <p>{itemCount} items · ${total.toFixed(2)}</p>
}

// Rename during destructuring — useful when the internal name differs from the prop name.
function Badge({ count: unreadCount = 0 }) {
  return <span>{unreadCount}</span>  // prop is `count`, internal name is `unreadCount`
}

// Rest props — collect everything you don't explicitly consume, forward downstream.
function Input({ label, ...rest }) {
  return (
    <label>
      {label}
      <input {...rest} />  // forwards type, value, onChange, placeholder, etc.
    </label>
  )
}
```
::

### Destructuring Defaults — The Modern Replacement for `defaultProps`

::code-wrapper{language="javascript" filename="default_values.js"}
```javascript
// ES2015 destructuring defaults — the supported, forward-compatible pattern.
// `defaultProps` on function components was deprecated in React 18.3 and logs
// a warning; default parameters are identical at runtime and have no deprecation path.

function Button({ label, variant = 'primary', disabled = false, onClick }) {
  return (
    <button className={`btn btn--${variant}`} disabled={disabled} onClick={onClick}>
      {label}
    </button>
  )
}

<Button label="Save" onClick={handleSave} />              // variant='primary'
<Button label="Delete" variant="danger" onClick={fn} />   // variant='danger'
```
::

### Gotcha: Defaults Apply Only to `undefined`, Never to `null`

::code-wrapper{language="javascript" filename="default_vs_null.js"}
```javascript
// Default parameters trigger when the value is `undefined` (omitted OR explicit undefined).
// Passing `null` is a REAL value — the default is skipped entirely.
// This bites when an API returns `null` for "empty" and you expected the default.

function Avatar({ size = 40 }) {
  return <div style={{ width: size, height: size }} />
}

<Avatar />                    // size = 40  (undefined → default applies)
<Avatar size={undefined} />   // size = 40  (explicit undefined → default applies)
<Avatar size={null} />        // size = null (null is a real value → NO default)
// → style={{ width: null, height: null }} → renders with no width/height, silently

// FIX if null should fall back to default: coalesce explicitly in the body.
function AvatarSafe({ size }) {
  const resolved = size ?? 40  // null OR undefined → 40
  return <div style={{ width: resolved, height: resolved }} />
}
```
::

## Props Are Read-Only — The Referential Equality Contract

::code-wrapper{language="javascript" filename="props_readonly_contract.js"}
```javascript
// React's reconciliation compares previous props to next props by REFERENCE.
// If the object identity is unchanged, React may skip re-rendering the subtree.
// Mutating a prop object in place leaves the reference unchanged → React thinks
// nothing changed → no re-render → your UI is stale AND the parent's data is
// corrupted because objects are passed by reference, not copied.

// BROKEN: mutates the parent's object, React never knows, siblings see corruption.
function BadName({ user }) {
  user.name = user.name.toUpperCase()  // ← mutates parent's `user` object
  return <p>{user.name}</p>
}

// CORRECT: derive a new value in render; never touch the input object.
function GoodName({ user }) {
  return <p>{user.name.toUpperCase()}</p>
}
```
::

### Why Mutation Breaks Reconciliation

::code-wrapper{language="javascript" filename="reconciliation_equality.js"}
```javascript
// React's bailout optimization (simplified):
//   if (prevProps === nextProps || shallowEqual(prevProps, nextProps)) skip render
//
// shallowEqual checks each prop key with Object.is — a referential comparison.
// Mutating the contents of an object prop doesn't change its identity, so
// Object.is(prevProps.user, nextProps.user) → true even though contents differ.
//
// Result: React skips the re-render, the child shows stale data, AND the parent
// now holds a mutated object it didn't expect — two bugs for the price of one.

// SAFE PATTERN: if the child needs to "change" a prop, call a callback so the
// OWNER of the state produces a new immutable object and re-renders correctly.
function EditableName({ user, onUpdate }) {
  return (
    <input
      value={user.name}
      onChange={(e) => onUpdate({ ...user, name: e.target.value })}  // new object
    />
  )
}
```
::

## Prop Types and Validation

### PropTypes — Runtime Validation (Legacy-Literacy)

::code-wrapper{language="javascript" filename="proptypes.js"}
```javascript
import PropTypes from 'prop-types'

// PropTypes runs ONLY in development, logs console warnings on mismatch.
// Zero compile-time safety, zero editor autocomplete. Seen in legacy codebases.
// For any new project, use TypeScript instead (next section).

function UserCard({ name, age, friends, onUpdate }) {
  return <p>{name} is {age} with {friends.length} friends</p>
}

UserCard.propTypes = {
  name: PropTypes.string.isRequired,
  age: PropTypes.number,
  friends: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.number.isRequired,
      name: PropTypes.string,
    })
  ),
  onUpdate: PropTypes.func,
}
```
::

### TypeScript Interfaces — Compile-Time Safety (Modern Default)

::code-wrapper{language="typescript" filename="typescript_props.ts"}
```typescript
// Interfaces give you compile-time errors BEFORE the code runs, editor
// autocomplete on every prop, and refactor-safe renaming. This is the default
// for any project past a prototype.

interface UserCardProps {
  name: string          // required — no `?`
  age?: number          // optional — `?` means `| undefined`
  friends?: Friend[]    // array of typed objects
  onUpdate?: (next: User) => void
}

interface Friend {
  id: number
  name: string
}

interface User {
  name: string
  age?: number
}

function UserCard({ name, age, friends = [], onUpdate }: UserCardProps) {
  return <p>{name} is {age} with {friends.length} friends</p>
}

// WRONG: <UserCard name={123} />         // TS error: number not assignable to string
// WRONG: <UserCard name="A" age="old" /> // TS error: string not assignable to number
// RIGHT: <UserCard name="Alice" age={30} />
```
::

### `type` Alias vs `interface` for Props

::code-wrapper{language="typescript" filename="type_vs_interface.ts"}
```typescript
// Both work identically for props. The practical differences:

// interface — extendable via declaration merging; open for future augmentation.
interface ButtonProps { variant?: 'primary' | 'danger' }
// A library or your own file can later add:
// declare module './Button' { interface ButtonProps { size?: 'sm' | 'lg' } }

// type alias — supports unions and computed/mapped types; cannot be merged.
type ButtonProps = { variant?: 'primary' | 'danger' } & { size?: 'sm' | 'lg' }

// RULE OF THUMB: use `interface` for simple object props (lets consumers augment),
// use `type` when you need unions, intersections, or mapped utility types.
```
::

## The `children` Prop

::code-wrapper{language="javascript" filename="children_prop.js"}
```javascript
// Anything between opening and closing tags arrives as `children` automatically.
// children can be: string, number, element, array of elements, or null.
// It is THE foundation of composition (fully explored in Ch 15).

function Card({ title, children }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      <div className="card__body">{children}</div>
    </div>
  )
}

<Card title="Settings">
  <p>Manage your profile.</p>
  <button>Edit</button>
</Card>
// children = [<p>…</p>, <button>…</button>]  (array when >1 child)
```
::

### `children` Is Not Always an Array

::code-wrapper{language="javascript" filename="children_count_gotcha.js"}
```javascript
// A component with EXACTLY ONE child receives that child directly — not an array.
// Code that unconditionally calls children.map(...) throws on the single-child case.

function Broken({ children }) {
  return <div>{children.map(child => <span key={child.key}>{child}</span>)}</div>
  // TypeError: children.map is not a function  (when single child is a string/element)
}

// FIX 1: React.Children.map — handles single, multiple, and null uniformly.
function Safe({ children }) {
  return <div>{React.Children.map(children, c => <span>{c}</span>)}</div>
}

// FIX 2: React.Children.count — reliable count regardless of structure.
function Badge({ children, count }) {
  const childCount = React.Children.count(children)
  return <div data-count={childCount}>{children}</div>
}

// FIX 3: normalize to array yourself if you need an actual array.
const arr = React.Children.toArray(children)  // flattens, assigns keys, handles null
```
::

## Children Patterns — Beyond Static JSX

### Render Props — Pass a Function That Returns JSX

::code-wrapper{language="javascript" filename="render_prop.js"}
```javascript
// A render prop is a function the child calls to decide what to render.
// It inverts control: the parent owns the data, the child owns the mechanism.
// Useful for sharing stateful logic WITHOUT hooks (pre-hooks era pattern, still valid).

function MouseTracker({ render }) {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  return (
    <div onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}>
      {render(pos)}  {/* parent decides how to display the position */}
    </div>
  )
}

<MouseTracker render={({ x, y }) => <p>Cursor: {x}, {y}</p>} />
<MouseTracker render={({ x, y }) => <Circle x={x} y={y} />} />
```
::

### Function-as-Child (FaCC) — `children` Itself Is the Render Prop

::code-wrapper{language="javascript" filename="function_as_child.js"}
```javascript
// Instead of a named `render` prop, use `children` AS the function.
// This is the most idiomatic render-prop variant — the API reads as JSX nesting.

function Toggle({ children }) {
  const [on, setOn] = useState(false)
  const toggle = () => setOn(v => !v)
  return children({ on, toggle })  // children is a FUNCTION, not JSX
}

// Usage — looks like normal JSX nesting, but children is a callback.
<Toggle>
  {({ on, toggle }) => (
    <button onClick={toggle}>{on ? 'On' : 'Off'}</button>
  )}
</Toggle>

// NOTE: In modern React, custom hooks (useToggle) are usually preferred over
// render props for reusable stateful logic. Render props remain valuable when
// the logic is tightly coupled to a DOM element the component renders.
```
::

### `cloneElement` — Inject Props Into an Existing Element

::code-wrapper{language="javascript" filename="clone_element.js"}
```javascript
import { Children, cloneElement, isValidElement } from 'react'

// cloneElement lets a parent inject props into the elements it received as children.
// Common in compound components (next section) where the parent owns shared state
// and pushes it down into each child without the consumer wiring it manually.

function RadioGroup({ name, value, onChange, children }) {
  return (
    <div role="radiogroup">
      {Children.map(children, (child) => {
        if (!isValidElement(child)) return child  // skip non-elements (strings, null)
        return cloneElement(child, {
          name,                                   // inject shared name
          checked: child.props.value === value,    // inject checked state
          onChange,                                // inject shared handler
        })
      })}
    </div>
  )
}

// Usage — consumer writes declarative JSX; RadioGroup wires the plumbing.
<RadioGroup name="plan" value={selected} onChange={setSelected}>
  <Radio value="free" label="Free" />
  <Radio value="pro" label="Pro" />
  <Radio value="team" label="Team" />
</RadioGroup>
```
::

## Component Composition — Compound Components

::code-wrapper{language="javascript" filename="compound_components.js"}
```javascript
// Compound components: a set of parts that share implicit state via Context,
// exposing a declarative API without prop drilling. The consumer assembles the
// parts; the parent provides the coordination. This is how <select>/<option>,
// <Tabs>/<Tab>, and most design-system APIs work.

import { createContext, useContext, useState } from 'react'

const TabsContext = createContext(null)

function Tabs({ defaultValue, children }) {
  const [active, setActive] = useState(defaultValue)
  return (
    <TabsContext.Provider value={{ active, setActive }}>
      <div className="tabs">{children}</div>
    </TabsContext.Provider>
  )
}

function TabList({ children }) {
  return <div className="tab-list" role="tablist">{children}</div>
}

function Tab({ value, children }) {
  const { active, setActive } = useContext(TabsContext)
  return (
    <button
      role="tab"
      aria-selected={active === value}
      onClick={() => setActive(value)}
    >
      {children}
    </button>
  )
}

function TabPanels({ children }) {
  return <div className="tab-panels">{children}</div>
}

function TabPanel({ value, children }) {
  const { active } = useContext(TabsContext)
  if (active !== value) return null
  return <div role="tabpanel">{children}</div>
}

// Attach sub-components as static properties — the public API reads as a namespace.
Tabs.List = TabList
Tabs.Tab = Tab
Tabs.Panels = TabPanels
Tabs.Panel = TabPanel

// Usage — fully declarative, no prop drilling, consumer controls layout order.
<Tabs defaultValue="overview">
  <Tabs.List>
    <Tabs.Tab value="overview">Overview</Tabs.Tab>
    <Tabs.Tab value="activity">Activity</Tabs.Tab>
  </Tabs.List>
  <Tabs.Panels>
    <Tabs.Panel value="overview"><Overview /></Tabs.Panel>
    <Tabs.Panel value="activity"><Activity /></Tabs.Panel>
  </Tabs.Panels>
</Tabs>
```
::

## Anti-Patterns

### Prop Drilling — Forwarding Through Layers That Don't Use It

::code-wrapper{language="javascript" filename="prop_drilling.js"}
```javascript
// `theme` is only consumed by ThemedButton, but every intermediate component
// must accept and forward it. Each layer gains an irrelevant prop, and the
// coupling grows with every hop. Fine for 1-2 levels; a liability past 3-4.

function App() {
  const [theme] = useState('dark')
  return <Page theme={theme} />
}
function Page({ theme }) {
  return <Sidebar theme={theme} />  // Page doesn't use theme, just forwards
}
function Sidebar({ theme }) {
  return <UserPanel theme={theme} />  // Sidebar doesn't use theme either
}
function UserPanel({ theme }) {
  return <ThemedButton theme={theme} />  // only ThemedButton actually needs it
}
function ThemedButton({ theme }) {
  return <button className={`btn btn--${theme}`}>Click</button>
}

// FIXES (covered in depth later):
//   Context (Ch 7)      — broadcast a value to any descendant without forwarding.
//   Composition (Ch 15) — pass the already-built <ThemedButton /> element down,
//                         so intermediates never see `theme` at all.
```
::

### Prop Mutation — Silently Corrupts the Owner

::code-wrapper{language="javascript" filename="prop_mutation.js"}
```javascript
// ANTI-PATTERN: mutating an object/array prop in place.
// The parent owns the state; the child has no right to mutate it.
// Objects are references — your mutation leaks to every component holding that ref.

function TodoList({ todos }) {
  todos.push({ id: Date.now(), text: 'New' })  // ← mutates parent's array
  return todos.map(t => <li key={t.id}>{t.text}</li>)
  // Parent's array is now longer, but React didn't see a new reference →
  // parent may not re-render, and other consumers of `todos` see ghost items.
}
```
::

### Boolean Prop Explosion — Unmanageable Combinatorics

::code-wrapper{language="javascript" filename="boolean_prop_explosion.js"}
```javascript
// ANTI-PATTERN: a forest of boolean flags that combine into invalid states.
// `isLoading && isError` is nonsensical but the API allows it.
// Every new flag doubles the number of possible combinations to reason about.

function Banner({ isLoading, isError, isEmpty, isSuccess, children }) {
  if (isLoading) return <Spinner />
  if (isError) return <ErrorView />
  if (isEmpty) return <EmptyView />
  return <div>{children}</div>  // what if isLoading AND isError are both true?
}

// FIX: a single discriminated union prop (see next section) — mutually exclusive
// states are structurally impossible, not just conventionally avoided.
```
::

## Production Pattern: Typed Component with Discriminated Union Props

::code-wrapper{language="typescript" filename="discriminated_union.ts"}
```typescript
import { useState } from 'react'

// A discriminated union makes invalid states unrepresentable at compile time.
// The `status` field is the discriminant; each variant has its own payload shape.

type AsyncResultProps<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: Error; onRetry: () => void }
  | { status: 'success'; data: T; onRefresh: () => void }

function AsyncResult<T>({ status, ...rest }: AsyncResultProps<T>) {
  switch (status) {
    case 'idle':
      return <p className="muted">Nothing loaded yet.</p>
    case 'loading':
      return <Spinner />
    case 'error': {
      // TS narrows `rest` to { error, onRetry } here — accessing rest.data
      // would be a compile error. Invalid combinations are impossible.
      const { error, onRetry } = rest
      return (
        <div className="error">
          <p>{error.message}</p>
          <button onClick={onRetry}>Retry</button>
        </div>
      )
    }
    case 'success': {
      const { data, onRefresh } = rest
      return (
        <div>
          <pre>{JSON.stringify(data, null, 2)}</pre>
          <button onClick={onRefresh}>Refresh</button>
        </div>
      )
    }
  }
}

// USAGE — TS enforces the correct payload for each variant.
<AsyncResult status="idle" />
<AsyncResult status="loading" />
<AsyncResult
  status="error"
  error={new Error('Network failed')}
  onRetry={refetch}
/>
<AsyncResult status="success" data={result} onRefresh={refetch} />

// WRONG (compile error): <AsyncResult status="error" />      // missing error, onRetry
// WRONG (compile error): <AsyncResult status="success" data={x} />  // missing onRefresh
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript" filename="tips.js"}
```javascript
// [Idiom] Destructure props in the signature, not inside the body. The parameter
// list IS the public API — it's the first thing a reader sees, and diffs stay
// minimal when you add or remove a prop.

// [Idiom] Forward unknown props with rest: `function Input({ label, ...rest })`.
// This builds flexible wrapper components without manually re-declaring every
// standard DOM attribute. Filter non-DOM props before spreading onto host elements
// to avoid React "unknown prop" warnings.

// [Performance] Inline objects/arrays/functions as props create a NEW reference
// every render: <Widget style={{ color: 'red' }} /> defeats React.memo on Widget
// even though the value never changes — memo compares by reference. Lift stable
// objects outside the component or memoize with useMemo/useCallback (Ch 9, 20).

// [Debug] If a prop's default isn't applying, check whether the caller passes
// `null` instead of omitting it — default parameters only trigger on `undefined`.
// API responses often use `null` for "empty," which silently bypasses defaults.

// [Idiom] Use `interface` for simple prop objects (lets consumers augment via
// declaration merging); use `type` when you need unions, intersections, or
// mapped utility types. Both are identical at runtime.

// [Debug] `children.map is not a function` means the component received a single
// child (an element or string), not an array. Use `React.Children.map` or
// `React.Children.toArray` for uniform handling regardless of child count.

// [Idiom] Prefer onMouseEnter/onMouseLeave over onMouseOver/onMouseOut for hover
// UI — Enter/Leave doesn't bubble through children, avoiding flicker when the
// pointer crosses internal element boundaries within the hovered area.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript" filename="edge_cases.js"}
```javascript
// [Gotcha] Mutating an object/array prop mutates the PARENT's data — objects are
// references, not copies. props.items.push(x) corrupts the parent's array, and
// because the reference is unchanged, React may skip re-rendering → stale UI
// AND corrupted shared state. Always produce a new object/array.

// [Gotcha] `Component.defaultProps` on function components is deprecated (React
// 18.3+). It still runs today but logs a warning; a future major removes it.
// Use destructuring defaults ({ variant = 'primary' }) — identical runtime behavior.

// [Gotcha] Lowercase component names are silently treated as HTML tags. <userCard />
// does NOT error — JSX renders an unknown DOM element <usercard>, and your props
// become (warned, ignored) raw DOM attributes. Always PascalCase custom components.

// [Gotcha] Passing a new inline object/array/function as a prop creates a new
// reference every render, defeating React.memo even when values are unchanged.
// <Widget style={{ color: 'red' }} /> → new object each render → memo never bails out.

// [Gotcha] `children` with exactly one child is NOT an array — it's the child
// itself. children.map(...) throws "is not a function" in the single-child case.
// Use React.Children.map / React.Children.toArray for count-agnostic handling.

// [Gotcha] Default parameters don't apply to `null` — only `undefined`. If an
// API returns null for "empty," your default is silently skipped and the child
// receives null. Use `size ?? 40` (nullish coalescing) if null should fall back.

// [Gotcha] Boolean prop explosion creates invalid states. isLoading && isError
// is nonsensical but the API allows it. Use a discriminated union status prop
// to make invalid combinations structurally impossible, not just discouraged.

// [Gotcha] Returning multiple sibling elements without a Fragment is a syntax
// error or returns undefined. Wrap them in <></> or <React.Fragment> — Fragments
// group without adding a wrapper <div> to the DOM, preserving CSS grid/flex layout.
```
::

## 🧠 Spot the Bug

A settings panel mutates a preference checkbox, but the change "leaks" into another user's cached card elsewhere on the page.

::code-wrapper{language="javascript" filename="spot_the_bug.js"}
```javascript
function NotificationSettings({ preferences }) {
  function toggleEmail() {
    preferences.email = !preferences.email  // mutate in place
    forceRerender()
  }

  return (
    <label>
      <input type="checkbox" checked={preferences.email} onChange={toggleEmail} />
      Email notifications
    </label>
  )
}
```
::

<details>
<summary>Answer</summary>

`preferences` is an object reference shared with a cache or context. Mutating `preferences.email` in place changes the *same object* other components hold — they see the change without ever receiving a prop update. Because the reference is unchanged, React's reconciliation may skip re-rendering the owner, so the mutation is invisible to the data flow but visible as corrupted UI in siblings.

**Fix**: never mutate a prop. Derive a new object and pass it up via a callback so the state owner updates immutably:

```javascript
function NotificationSettings({ preferences, onUpdate }) {
  return (
    <label>
      <input
        type="checkbox"
        checked={preferences.email}
        onChange={() => onUpdate({ ...preferences, email: !preferences.email })}
      />
      Email notifications
    </label>
  )
}
```

**The lesson**: props are read-only by contract. Objects are references — in-place mutation corrupts the parent and any sibling sharing that reference, while React's referential-equality bailout may hide the change from the render cycle entirely.

</details>

## Key Takeaways

::code-wrapper{language="javascript" filename="key_takeaways.js"}
```javascript
// 1. Function components are pure functions: props in, JSX (or null) out.
//    PascalCase is mandatory — lowercase tags are treated as host DOM elements.
//    Valid returns: single element, null, keyed array, string/number, Fragment, Portal.

// 2. Props are READ-ONLY — never mutate. React reconciles by referential equality:
//    mutating an object prop leaves the reference unchanged → React skips re-render
//    → stale UI AND corrupted parent/sibling state (objects are references, not copies).

// 3. Destructure in the signature — the parameter list IS the public API.
//    Defaults via destructuring ({ variant = 'primary' }) replaced defaultProps
//    (deprecated React 18.3+). Defaults apply ONLY to undefined, never to null.

// 4. `children` is the special composition prop. It is NOT always an array —
//    a single child arrives as the child itself. Use React.Children.map/toArray
//    for count-agnostic handling.

// 5. Children patterns: render props (function decides JSX), function-as-child
//    (children IS the render prop), cloneElement (inject props into received
//    elements). Modern React often replaces render props with custom hooks.

// 6. Compound components share implicit state via Context — declarative assembly
//    without prop drilling. Attach sub-components as static properties (Tabs.Tab).

// 7. Anti-patterns: prop drilling (fix: Context Ch 7 / composition Ch 15),
//    prop mutation (fix: immutable update + callback), boolean prop explosion
//    (fix: discriminated union — make invalid states unrepresentable).

// 8. TypeScript interfaces give compile-time prop safety; PropTypes is legacy-
//    literacy (runtime warnings only, zero editor support). Prefer `interface`
//    for plain object props (augmentable), `type` for unions/intersections.

// 9. Inline object/array/function props create new references every render,
//    defeating React.memo. Lift stable values or memoize (Ch 9, 20).
```
::