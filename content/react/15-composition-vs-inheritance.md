---
title: "15 — Composition vs. Inheritance"
description: "Why React has no component inheritance, children prop patterns, named slots, compound components with Context, render props, HOCs vs hooks as the modern composition mechanism, and specialization via configuration. Code-first reference for mid-to-senior React engineers."
---

# 15 — Composition vs. Inheritance

## Why React Has No Component Inheritance

::code-wrapper{language="javascript" filename="no_inheritance.js"}
```javascript
// React deliberately omits class-style component inheritance. There is no
// `class SpecialButton extends Button` equivalent, and the React team has
// consistently stated they have never found a use case where `extends` produces
// a better result than composition.

// STRUCTURAL REASON: inheritance couples a subclass to its parent's INTERNAL
// implementation — which methods are overridable, what super.render() returns,
// which internal state is shared. Composition couples components only through
// EXPLICIT, VISIBLE props — a much shallower, inspectable form of coupling.

// What OO would write as inheritance, React expresses as:
//   1. Passing JSX through `children` (single slot) or named props (multi-slot)
//   2. Specialization via configuration props + thin wrapper functions
//   3. Shared implicit state via Context (compound components)
//   4. Shared logic via custom hooks (chapter 11)

// This is NOT a missing feature — it's a design decision: the component tree
// is composed, not inherited. Every reuse case OO solves with inheritance,
// React solves with one of the composition patterns below.
```
::

## The `children` Prop: Single-Slot Composition

::code-wrapper{language="javascript" filename="children_prop.js"}
```javascript
// `children` is the simplest composition primitive: a wrapper component receives
// arbitrary JSX through its `children` prop and controls layout/behavior while
// remaining agnostic about what's inside.

function Card({ children }) {
  return <div className="card">{children}</div>
}

// Card never needs to know it's rendering a heading and a paragraph — it could
// wrap a chart, a form, or another Card. This replaces what `SpecialButton
// extends Button` would attempt: reusing Card's behavior across arbitrarily
// different content, without a class hierarchy.

function Dashboard() {
  return (
    <Card>
      <h2>Revenue</h2>
      <p>$42,000 this month</p>
    </Card>
  )
}
```
::

## Named Slots: Multiple Independent Content Regions

::code-wrapper{language="javascript" filename="named_slots.js"}
```javascript
// `children` handles ONE insertion point. When a component needs multiple
// independent regions (a sidebar layout with header, nav, and main content),
// pass JSX through multiple named props — the "slots" pattern.

function SplitLayout({ sidebar, main }) {
  return (
    <div className="split-layout">
      <aside className="sidebar">{sidebar}</aside>
      <main className="main">{main}</main>
    </div>
  )
}

// SplitLayout controls ARRANGEMENT (which slot goes where, wrapped in which
// semantic elements) while delegating CONTENT to the caller. Inheritance would
// conflate "controls layout" and "controls behavior" into one `extends` chain;
// slots keep them cleanly separated.

function App() {
  return (
    <SplitLayout
      sidebar={<NavMenu />}
      main={<Dashboard />}
    />
  )
}
```
::

### Anti-Pattern: Over-Slotting

::code-wrapper{language="javascript" filename="over_slotting.js"}
```javascript
// ANTI-PATTERN: when a component accumulates so many slots that the call site
// becomes unreadable, you've outgrown the slot pattern — refactor to compound
// components (below) or split into smaller components.

function UserCard({ avatarSlot, nameSlot, bioSlot, statsSlot, actionsSlot, footerSlot }) {
  // 6 slots = the caller's JSX becomes a wall of prop assignments, each holding JSX.
  // This is a signal that these pieces are RELATED and should share implicit state.
  return (
    <div className="user-card">
      <div className="header">{avatarSlot}{nameSlot}</div>
      <div className="body">{bioSlot}{statsSlot}</div>
      <div className="actions">{actionsSlot}</div>
      <div className="footer">{footerSlot}</div>
    </div>
  )
}

// BAD: 6-slot usage — hard to read, no shared state, just prop wiring
;<UserCard
  avatarSlot={<Avatar user={user} />}
  nameSlot={<h3>{user.name}</h3>}
  bioSlot={<p>{user.bio}</p>}
  statsSlot={<UserStats user={user} />}
  actionsSlot={<FollowButton user={user} />}
  footerSlot={<UserFooter user={user} />}
/>
```
::

## Specialization Through Configuration, Not Subclassing

::code-wrapper{language="javascript" filename="specialization.js"}
```javascript
// OO would create `PrimaryButton extends Button` and `DangerButton extends Button`.
// React expresses "specialized variant of a general thing" by having the general
// component accept configuration props, and optionally wrapping it in a thin
// named component that supplies defaults.

function Button({ variant = 'default', size = 'md', children, ...props }) {
  const className = `btn btn-${variant} btn-${size}`
  return <button className={className} {...props}>{children}</button>
}

// "Specialization" = composition + default props, NOT a subclass.
// DangerButton forwards ALL props and overrides only `variant`. Any future prop
// Button gains (e.g. `loading`) is automatically available on DangerButton too,
// with zero changes to DangerButton — the "free inheritance of new capability"
// OO promises, obtained through prop forwarding instead.

function DangerButton(props) {
  return <Button variant="danger" {...props} />
}

function App() {
  return (
    <>
      <Button>Save</Button>
      <DangerButton size="lg" onClick={handleDelete}>Delete Account</DangerButton>
    </>
  )
}
```
::

## Compound Components: Implicit Shared State via Context

::code-wrapper{language="javascript" filename="compound_components.js"}
```javascript
// A compound component is a GROUP of components designed to be used together,
// where a parent implicitly shares state with its children via Context — the
// children don't need props threaded explicitly, because the relationship is
// baked into how they're composed. Think <select> + <option> in native HTML.

import { createContext, useContext, useState } from 'react'

const TabsContext = createContext(null)

function Tabs({ defaultTab, children }) {
  const [activeTab, setActiveTab] = useState(defaultTab)
  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className="tabs">{children}</div>
    </TabsContext.Provider>
  )
}

function TabList({ children }) {
  return <div className="tab-list" role="tablist">{children}</div>
}

function Tab({ id, children }) {
  const { activeTab, setActiveTab } = useContext(TabsContext)
  if (!activeTab) throw new Error('<Tabs.Tab> must be rendered inside <Tabs>')
  return (
    <button
      role="tab"
      aria-selected={activeTab === id}
      className={activeTab === id ? 'tab active' : 'tab'}
      onClick={() => setActiveTab(id)}
    >
      {children}
    </button>
  )
}

function TabPanel({ id, children }) {
  const { activeTab } = useContext(TabsContext)
  if (!activeTab) throw new Error('<Tabs.Panel> must be rendered inside <Tabs>')
  return activeTab === id ? <div role="tabpanel">{children}</div> : null
}

// Attach sub-components as static properties — purely NAMING/ergonomics.
// The actual coupling is the shared Context, NOT the property assignment.
Tabs.List = TabList
Tabs.Tab = Tab
Tabs.Panel = TabPanel

// Consumer controls ARRANGEMENT — reordering, wrapping in conditionals,
// inserting markup between tabs and panels — all without Tabs needing an
// `items` prop shaped as a rigid array.
function SettingsPage() {
  return (
    <Tabs defaultTab="profile">
      <Tabs.List>
        <Tabs.Tab id="profile">Profile</Tabs.Tab>
        <Tabs.Tab id="billing">Billing</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel id="profile"><ProfileSettings /></Tabs.Panel>
      <Tabs.Panel id="billing"><BillingSettings /></Tabs.Panel>
    </Tabs>
  )
}
```
::

### The Rigid Alternative (and When It's Fine)

::code-wrapper{language="javascript" filename="rigid_tabs.js"}
```javascript
// The rigid, data-driven alternative — works, but the caller loses ALL control
// over arrangement and interleaved markup. Choose this when flexibility does NOT
// matter (fixed structure, no rearranging needed); choose compound when it does.

function RigidTabs({ items, defaultTab }) {
  const [activeTab, setActiveTab] = useState(defaultTab)
  return (
    <div>
      <div className="tab-list">
        {items.map(item => (
          <button key={item.id} onClick={() => setActiveTab(item.id)}>{item.label}</button>
        ))}
      </div>
      {items.find(item => item.id === activeTab)?.content}
    </div>
  )
}

// Usage — simple, but you can't insert arbitrary markup between tabs, wrap one
// panel in a conditional, or reorder without changing the items array.
;<RigidTabs
  items={[
    { id: 'profile', label: 'Profile', content: <ProfileSettings /> },
    { id: 'billing', label: 'Billing', content: <BillingSettings /> },
  ]}
  defaultTab="profile"
/>
```
::

### Compound Component with Dynamic Children via `React.Children`

::code-wrapper{language="javascript" filename="compound_dynamic_children.js"}
```javascript
// Advanced: the parent can inspect and clone its children to inject implicit
// props (like the active tab id) without the child explicitly reading Context.
// This is how libraries like Reach UI and Radix UI build compound components.

import { Children, cloneElement, isValidElement } from 'react'

function Select({ value, onChange, children }) {
  return (
    <div className="select">
      {Children.map(children, child => {
        // Inject `isActive` and `onSelect` into each <Option> without the caller
        // threading those props manually. cloneElement merges the injected props.
        if (isValidElement(child)) {
          return cloneElement(child, {
            isActive: child.props.value === value,
            onSelect: () => onChange(child.props.value),
          })
        }
        return child
      })}
    </div>
  )
}

function Option({ value, isActive, onSelect, children }) {
  return (
    <button className={isActive ? 'option active' : 'option'} onClick={onSelect}>
      {children}
    </button>
  )
}

Select.Option = Option

// Consumer doesn't pass isActive/onSelect — the parent injects them:
;<Select value="apple" onChange={setFruit}>
  <Select.Option value="apple">Apple</Select.Option>
  <Select.Option value="banana">Banana</Select.Option>
</Select>
```
::

## Render Props: Inverting Control via a Function Prop

::code-wrapper{language="javascript" filename="render_props.js"}
```javascript
// A render prop is a function prop a component calls to determine what to render,
// giving the CALLER control over the rendered output while the COMPONENT owns
// the state. Before hooks (chapter 11), this was the primary pattern for sharing
// stateful rendering logic; it's still useful when the shared logic is inherently
// about WHAT to render, not just state management.

function MouseTracker({ render }) {
  const [position, setPosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const handleMove = (e) => setPosition({ x: e.clientX, y: e.clientY })
    window.addEventListener('mousemove', handleMove)
    return () => window.removeEventListener('mousemove', handleMove)
  }, [])

  // The component owns the mouse position state; the CALLER decides what to do
  // with it by passing a render function that receives the position.
  return render(position)
}

// Caller has full control over the rendered output:
function App() {
  return (
    <MouseTracker render={({ x, y }) => (
      <p>The mouse is at {x}, {y}</p>
    )} />
  )
}

// A more practical use: reusable data-fetching render prop (pre-React Query era)
function DataFetcher({ url, render }) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null })

  useEffect(() => {
    let cancelled = false
    fetch(url)
      .then(res => res.json())
      .then(data => { if (!cancelled) setState({ status: 'success', data, error: null }) })
      .catch(error => { if (!cancelled) setState({ status: 'error', data: null, error }) })
    return () => { cancelled = true }
  }, [url])

  return render(state)
}

// Usage — caller controls rendering for each state, component owns the fetch logic
function UserList() {
  return (
    <DataFetcher
      url="/api/users"
      render={({ status, data, error }) => {
        if (status === 'loading') return <Spinner />
        if (status === 'error') return <ErrorMessage error={error} />
        return <ul>{data.map(u => <li key={u.id}>{u.name}</li>)}</ul>
      }}
    />
  )
}
```
::

### Render Prop via `children` (the idiomatic form)

::code-wrapper{language="javascript" filename="render_prop_children.js"}
```javascript
// React community convention: pass the render function as `children` rather
// than a prop named `render`. This reads more naturally in JSX and is the form
// used by libraries like react-motion and downshift.

function MouseTracker({ children }) {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  useEffect(() => {
    const handler = (e) => setPos({ x: e.clientX, y: e.clientY })
    window.addEventListener('mousemove', handler)
    return () => window.removeEventListener('mousemove', handler)
  }, [])
  return children(pos)  // children is a FUNCTION here, not JSX
}

// Usage — `children` is a function receiving the mouse position:
function App() {
  return (
    <MouseTracker>
      {({ x, y }) => <p>Mouse at {x}, {y}</p>}
    </MouseTracker>
  )
}
```
::

## Higher-Order Components (HOCs): Legacy Enhancement

::code-wrapper{language="javascript" filename="hocs.js"}
```javascript
// HOCs are functions that take a component and return a new, enhanced one —
// the pre-hooks mechanism for adding cross-cutting behavior (auth-gating,
// logging, analytics) to many components. Still seen in older/enterprise
// codebases and some libraries, but largely superseded by hooks for new code.

function withAuthGuard(Component) {
  return function AuthGuarded(props) {
    const { user } = useAuth()
    if (!user) return <LoginPrompt />
    return <Component {...props} user={user} />
  }
}

const ProtectedDashboard = withAuthGuard(Dashboard)

// PROBLEM: stacking HOCs obscures the component tree and prop flow:
//   withAuth(withLogging(withTheme(withAnalytics(Dashboard))))
// Each layer adds a wrapper component with a generic name, making React
// DevTools' tree much harder to read, and props injected by inner HOCs are
// invisible at the call site.
```
::

### HOC Anti-Patterns

::code-wrapper{language="javascript" filename="hoc_antipatterns.js"}
```javascript
// ANTI-PATTERN 1: Not forwarding refs — a plain HOC wrapper has no way to
// receive a `ref` passed to the enhanced component.
function withThemeBad(Component) {
  return function Themed(props) {
    const theme = useContext(ThemeContext)
    return <Component {...props} theme={theme} />
    // A ref passed to <Themed ref={myRef}> goes NOWHERE — ref isn't a normal prop.
  }
}

// FIX: wrap with React.forwardRef
function withThemeGood(Component) {
  const Themed = React.forwardRef((props, ref) => {
    const theme = useContext(ThemeContext)
    return <Component {...props} ref={ref} theme={theme} />
  })
  Themed.displayName = `withTheme(${Component.displayName || Component.name})`
  return Themed
}

// ANTI-PATTERN 2: HOCs inside render — creating the enhanced component during
// render produces a NEW component type every render, causing full unmount/remount
// of the subtree (losing all state, triggering all effects).
function BadUsage() {
  // This runs on EVERY render — a new component type each time → React unmounts
  // and remounts the entire subtree, destroying state and re-running effects.
  const ProtectedDashboard = withAuthGuard(Dashboard)
  return <ProtectedDashboard />
}

// FIX: apply HOCs at module scope, not inside render
const ProtectedDashboard = withAuthGuard(Dashboard)  // created ONCE
function GoodUsage() {
  return <ProtectedDashboard />
}

// ANTI-PATTERN 3: Copying static methods — HOCs return a new component that
// doesn't have the original's static properties. Must hoist them explicitly.
import hoistNonReactStatics from 'hoist-non-react-statics'
function withAnalytics(Component) {
  const WithAnalytics = (props) => {
    useEffect(() => { trackPageView() }, [])
    return <Component {...props} />
  }
  hoistNonReactStatics(WithAnalytics, Component)  // copies statics like .defaultProps
  return WithAnalytics
}
```
::

## Hooks as the Modern Composition Mechanism

::code-wrapper{language="javascript" filename="hooks_composition.js"}
```javascript
// The hook equivalent of an HOC for cross-cutting LOGIC (not rendering): a hook
// + an explicit early return. No extra wrapper component in the tree, no ref
// forwarding issues, no static method hoisting, full visibility in DevTools.

// HOC approach (legacy):
function withAuth(Component) {
  return function AuthGuarded(props) {
    const { user } = useAuth()
    if (!user) return <LoginPrompt />
    return <Component {...props} user={user} />
  }
}
const ProtectedDashboard = withAuth(Dashboard)

// Hook approach (modern) — same behavior, no wrapper layer:
function Dashboard() {
  const { user } = useAuth()
  if (!user) return <LoginPrompt />
  return <DashboardContent user={user} />
}

// WHY HOOKS REPLACE HOCs FOR LOGIC SHARING:
// - No extra component in the tree → cleaner DevTools, fewer re-renders
// - No ref forwarding or static method hoisting needed
// - Hook return values are explicit at the call site (not injected props)
// - Composable: useAuth() + useTheme() + useAnalytics() stacked naturally
//
// WHEN HOCs ARE STILL RELEVANT:
// - Injecting props into a component you DON'T control (third-party)
// - Code that predates hooks and hasn't been migrated
// - Some prop-injection library patterns (e.g. relay's fragment containers)
```
::

## Slots Pattern: Formalizing Named Composition

::code-wrapper{language="javascript" filename="slots_pattern.js"}
```javascript
// The "slots" pattern generalizes `children` to multiple named insertion points.
// Two idioms in practice:

// IDIOM 1: JSX-as-prop (simplest, no extra abstraction)
function PageLayout({ header, sidebar, main, footer }) {
  return (
    <div className="page">
      <header>{header}</header>
      <div className="body">
        <aside>{sidebar}</aside>
        <main>{main}</main>
      </div>
      <footer>{footer}</footer>
    </div>
  )
}

function App() {
  return (
    <PageLayout
      header={<TopNav />}
      sidebar={<SideMenu />}
      main={<Dashboard />}
      footer={<CopyrightNotice />}
    />
  )
}

// IDIOM 2: Component-as-prop (render functions for lazy evaluation)
// Pass a COMPONENT type (not JSX) so the layout decides WHEN to render it —
// avoids rendering the slot content if it's not shown (e.g. collapsed sidebar).
function LazyLayout({ header: Header, sidebar: Sidebar, main: Main }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  return (
    <div className="page">
      {Header && <Header />}
      <div className="body">
        {sidebarOpen && Sidebar && <Sidebar />}
        <main>{Main && <Main />}</main>
      </div>
    </div>
  )
}

// Usage — pass component types, not JSX elements:
;<LazyLayout
  header={() => <TopNav />}
  sidebar={SideMenu}
  main={Dashboard}
/>
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript" filename="tips.js"}
```javascript
// [Idiom] Reach for `children` as the DEFAULT composition mechanism for "wrapper
// with arbitrary content inside" (cards, modals, layout containers). Reach for
// named slot props only once a component genuinely needs MORE than one content region.

// [Idiom] Build "specialized" variants as thin wrapper functions that forward
// `...props` and override only the differing prop — this gives the specialized
// variant every future capability the base component gains, with zero maintenance.

// [Idiom] Reach for compound components specifically when several components
// need to share implicit state AND the caller should retain control over
// arrangement. For a fixed, non-rearrangeable structure, a single component with
// a data prop (the rigid alternative) is simpler and often better.

// [Debug] If a compound component's sub-components throw when used outside their
// parent, it's because useContext returned the default (null). Add an explicit
// check that throws a clear "must be used inside <Tabs>" error rather than
// letting a cryptic "cannot read property of null" surface.

// [Performance] Render props create a new function every render — wrap the
// passed function in useCallback if it's passed to a memoized child, or the
// child re-renders every time even if its inputs haven't changed.

// [Idiom] Prefer custom hooks over HOCs for sharing cross-cutting LOGIC in new
// code. HOCs remain relevant mainly in older codebases and prop-injection
// library patterns that predate hooks.

// [Idiom] When using `children` as a render prop, name the prop explicitly
// (`render` or `children`) and document that it receives a function — a caller
// passing JSX instead of a function will see "children is not a function" with
// no obvious explanation.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript" filename="edge_cases.js"}
```javascript
// [Gotcha] Compound components silently break if their shared Context has no
// default value and a sub-component is rendered outside the parent — useContext
// returns null/undefined rather than throwing, so the failure surfaces later as
// a confusing "cannot read properties of null" deep inside the sub-component.

// [Gotcha] Static property assignment (Tabs.Tab = Tab) is purely cosmetic and
// easy to over-trust — nothing prevents importing and using Tab directly without
// the Tabs. prefix, and nothing about the assignment enforces that Tab is ever
// rendered inside a <Tabs> provider. The actual coupling is the shared Context.

// [Gotcha] HOCs that don't forward ref break any consumer trying to get a DOM
// ref through the wrapper — a plain `function Enhanced(props) { return <Wrapped
// {...props} /> }` silently drops the ref. Must use React.forwardRef explicitly.

// [Gotcha] Creating an HOC inside render (const Enhanced = withAuth(Comp)) produces
// a NEW component type every render → React unmounts and remounts the entire
// subtree → state is destroyed, effects re-run. Always apply HOCs at module scope.

// [Gotcha] Stacking multiple HOCs (withAuth(withLogging(withTheme(Comp)))) obscures
// the actual prop flow and makes DevTools' tree hard to read — each HOC adds a
// wrapper with a generic name. This readability cost is part of why hooks are
// now generally preferred for new code.

// [Gotcha] Render props passed as inline functions ({({ x }) => ...}) create a
// new function reference every render. If the component receiving the render prop
// is memoized, it will still re-render every time because the function prop changed.

// [Gotcha] A "rigid" data-driven component (items array + internal render) loses
// the ability to interleave arbitrary non-item markup between its rendered pieces
// — a compound component doesn't have this limitation, since the caller writes
// the actual JSX structure. Choosing the rigid form is a real trade against
// flexibility, not merely a stylistic preference.

// [Gotcha] cloneElement-based compound components (the React.Children pattern)
// don't work across abstraction boundaries — if a consumer wraps a child in a
// custom component, cloneElement injects props into the WRAPPER, not the actual
// target component, and the injected props never reach the intended receiver.
```
::

## 🧠 Spot the Bug

A design system's `Modal` compound component works everywhere — except on one page, where `Modal.CloseButton` throws `Cannot read properties of undefined (reading 'close')` as soon as the modal opens:

::code-wrapper{language="javascript" filename="spot_the_bug.js"}
```javascript
const ModalContext = createContext()

function Modal({ children, onClose }) {
  return (
    <ModalContext.Provider value={{ close: onClose }}>
      <div className="modal-overlay">
        <div className="modal">{children}</div>
      </div>
    </ModalContext.Provider>
  )
}

function CloseButton() {
  const { close } = useContext(ModalContext)
  return <button onClick={close}>×</button>
}

Modal.CloseButton = CloseButton

function ReportModal() {
  return (
    <>
      <Modal.CloseButton />
      <Modal onClose={() => setOpen(false)}>
        <ReportForm />
      </Modal>
    </>
  )
}
```
::

<details>
<summary>Answer</summary>

`Modal.CloseButton` is rendered as a **sibling before** `<Modal>` in `ReportModal`, entirely outside the `ModalContext.Provider` that `Modal` creates internally. `useContext(ModalContext)` at that position returns the context's default value — `undefined`, since `createContext()` was called with no argument — so destructuring `{ close }` from `undefined` throws immediately.

**Fix**: place `CloseButton` *inside* `<Modal>`, and give `createContext` a meaningful default (or add a null-check that throws a clear error):

```javascript
function ReportModal() {
  return (
    <Modal onClose={() => setOpen(false)}>
      <Modal.CloseButton />
      <ReportForm />
    </Modal>
  )
}
```

The lesson: a compound component's sub-components only receive shared state from an ancestor `Provider` actually rendered **above** them — placing `Modal.CloseButton` as a sibling rather than a child of `Modal` breaks the implicit contract compound components rely on.

</details>

## Key Takeaways

::code-wrapper{language="javascript" filename="key_takeaways.js"}
```javascript
// 1. React deliberately has NO component-level inheritance — composition (children,
//    slot props, prop forwarding) covers every case a class hierarchy would, with
//    shallower, more explicit coupling.

// 2. `children` is the default for single-slot wrappers; named props generalize
//    it into multiple independent slots when a layout needs more than one region.

// 3. "Specialized" variants = thin wrapper functions forwarding `...props` and
//    overriding only the differing prop. This automatically inherits any future
//    capability the base component gains, mirroring OO inheritance without coupling.

// 4. Compound components share implicit state among related sub-components via
//    Context, letting the caller control arrangement and interleaved markup.
//    Choose this over a rigid data-prop component when that flexibility matters.

// 5. Render props invert control: the component owns state, the caller owns
//    rendering. Still useful when the shared logic is about WHAT to render, but
//    largely superseded by hooks for pure stateful logic sharing.

// 6. HOCs are the legacy enhancement mechanism — still in older codebases and
//    some libraries, but hooks + early returns replace them for new code: no
//    wrapper layer, no ref forwarding issues, no static method hoisting.

// 7. Static property assignment (Tabs.Tab = Tab) is naming convenience only —
//    the real coupling is the shared Context. Sub-components rendered outside
//    their parent's Provider read null/undefined unless explicitly guarded.
```
::