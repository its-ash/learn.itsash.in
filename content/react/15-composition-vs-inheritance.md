# 15 — Composition vs. Inheritance

Developers arriving from object-oriented languages often look for React's equivalent of class inheritance — a way to build a `SpecialButton` that "extends" `Button`. React deliberately has no such mechanism for components, and this chapter explains why composition covers every case inheritance would, usually more flexibly.

## Why React Has No Component Inheritance

The React team's own guidance, unchanged for years, is direct: they have not encountered a use case where a component hierarchy built with `extends` produces a better result than the same behavior built with composition. The underlying reason is structural — inheritance couples a subclass tightly to its parent's implementation details (calling `super.render()`, knowing which internal methods are overridable), while composition couples components only through explicit, visible props — a much shallower, more inspectable form of coupling.

::code-wrapper{language="javascript"}
```javascript
// There is no React equivalent of this — components are never subclassed for behavior reuse
class SpecialButton extends Button {
  render() {
    return super.render() // not a pattern React supports or encourages
  }
}
```
::

## Composition via `children`: The Basic Case

The simplest form of composition passes arbitrary JSX through a component via `children`, letting a wrapper control layout/behavior while remaining agnostic about what's actually inside it.

::code-wrapper{language="javascript"}
```javascript
function Card({ children }) {
  return <div className="card">{children}</div>
}

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

`Card` never needs to know it's rendering a heading and a paragraph — it could just as easily wrap a chart, a form, or another `Card`. This is the composition equivalent of what a `SpecialButton extends Button` pattern would attempt: reusing `Card`'s styling/behavior across arbitrarily different content, without a class hierarchy.

## Multiple Composition Slots

`children` handles a single insertion point, but many real components need several independent slots — a sidebar layout with a header, a nav area, and a main content area, none of which relates hierarchically to the others. Passing multiple named props, each holding its own JSX, generalizes `children` into a "slots" pattern.

::code-wrapper{language="javascript"}
```javascript
function SplitLayout({ sidebar, main }) {
  return (
    <div className="split-layout">
      <aside className="sidebar">{sidebar}</aside>
      <main className="main">{main}</main>
    </div>
  )
}

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

`SplitLayout` fully controls the *arrangement* (which slot goes where, wrapped in which semantic elements, styled how) while delegating full control of *content* to the caller — a clean split of responsibility that a class hierarchy would struggle to express as cleanly, since inheritance conflates "controls layout" and "controls behavior" into a single `extends` relationship.

## Specialization Through Configuration, Not Subclassing

Where an OO codebase might create `PrimaryButton extends Button` and `DangerButton extends Button`, React expresses the same "specialized variants of a general thing" idea by having the general component accept configuration props, and optionally wrapping it in a more specific, named component that merely supplies defaults.

::code-wrapper{language="javascript"}
```javascript
function Button({ variant = 'default', children, ...props }) {
  const className = `btn btn-${variant}`
  return <button className={className} {...props}>{children}</button>
}

// "Specialization" is composition + default props, not a subclass
function DangerButton(props) {
  return <Button variant="danger" {...props} />
}

function App() {
  return (
    <>
      <Button>Save</Button>
      <DangerButton onClick={handleDelete}>Delete Account</DangerButton>
    </>
  )
}
```
::

`DangerButton` is a thin wrapper function, not a subclass — it composes `Button`, forwarding all props through and overriding only `variant`. Any future prop `Button` gains (say, `size`) is automatically available on `DangerButton` too, with zero changes to `DangerButton`'s own code — the same "free inheritance of new capability" benefit OO inheritance promises, obtained here through prop forwarding instead of a class hierarchy.

## Compound Components: Sharing Implicit State Among Related Children

A **compound component** is a group of components designed to be used together, where a parent implicitly shares state with its children via Context (chapter 7) — the children don't need props threaded to them explicitly, because the relationship between parent and children is baked into how they're meant to be composed, similar in spirit to how `<select>` and `<option>` work together natively in HTML.

::code-wrapper{language="javascript"}
```javascript
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
  return activeTab === id ? <div role="tabpanel">{children}</div> : null
}

Tabs.List = TabList
Tabs.Tab = Tab
Tabs.Panel = TabPanel
```
::

::code-wrapper{language="javascript"}
```javascript
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

The `Tabs.List = TabList` assignments attach the sub-components as static properties on `Tabs`, giving the call site's JSX (`<Tabs.Tab>`) a visual cue that these pieces belong together, purely a naming/ergonomics convenience — `Tab`, `TabList`, and `TabPanel` could just as well be imported and used standalone as `<Tab>`, without the `Tabs.` prefix, and would behave identically. What actually wires them together is the shared `TabsContext`, not the property assignment.

This pattern's real payoff is flexibility: the consumer controls the *arrangement* of tabs and panels — reordering them, wrapping one in a conditional, inserting arbitrary other markup between them — all without `Tabs` itself needing an `items` prop shaped as a rigid array of `{id, label, content}` objects. Compare the rigid, non-compound alternative:

::code-wrapper{language="javascript"}
```javascript
// Rigid alternative — works, but the caller loses all control over arrangement/markup
function Tabs({ items, defaultTab }) {
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
```
::

## Composition Over Inheritance for "Enhancing" a Component

Where OO reaches for a subclass to add cross-cutting behavior (logging, auth-gating, analytics) to many components, React historically used higher-order components (HOCs) — functions that take a component and return a new, enhanced one — and increasingly uses custom hooks (chapter 11) for the same purpose, since a hook avoids the extra wrapper layer an HOC introduces into the component tree.

::code-wrapper{language="javascript"}
```javascript
// HOC approach — still seen in older/enterprise codebases and some libraries
function withAuthGuard(Component) {
  return function AuthGuarded(props) {
    const { user } = useAuth()
    if (!user) return <LoginPrompt />
    return <Component {...props} user={user} />
  }
}

const ProtectedDashboard = withAuthGuard(Dashboard)
```
::

::code-wrapper{language="javascript"}
```javascript
// Modern equivalent — a hook plus an explicit early return, no wrapper component in the tree
function Dashboard() {
  const { user } = useAuth()
  if (!user) return <LoginPrompt />
  return <DashboardContent user={user} />
}
```
::

Both achieve "enhance a component with cross-cutting behavior" without a class hierarchy — the HOC composes at the function level (wrapping one component in another), the hook composes at the logic level (sharing stateful behavior directly inside a component) — chapter 11 covers the hook side of this in full depth; this chapter's point is narrower: neither reaches for `extends`.

## 💡 Tips & Tricks

- **Idiom** — Reach for `children` as the default composition mechanism for "wrapper with arbitrary content inside" components (cards, modals, layout containers); reach for named slot props only once a component genuinely needs more than one independent content region.
- **Idiom** — Build "specialized" variants of a general component as thin wrapper functions that forward `...props` and override only the props that differ — this gives the specialized variant every future capability the general component gains, with zero maintenance, mirroring the best part of inheritance without the coupling.
- **Idiom** — Reach for the compound-component pattern specifically when several components need to share implicit state *and* the caller should retain control over their arrangement and the markup between them — for a fixed, non-rearrangeable structure, a single component with a data prop (the "rigid alternative" above) is simpler and often the better choice.
- **Debug** — If a compound component's sub-components (`<Tabs.Tab>`) throw when used outside their parent (`<Tabs>`), it's because `useContext(TabsContext)` returned the context's default value (often `null`) — add an explicit check in each sub-component that throws a clear "must be used inside `<Tabs>`" error rather than letting a cryptic "cannot read property of null" surface instead.
- **Idiom** — Prefer a custom hook over a higher-order component for new code sharing cross-cutting *logic* — HOCs remain relevant mainly in older codebases and a handful of libraries with prop-injection patterns predating widespread hooks adoption.

## ⚠️ Edge Cases & Gotchas

- **Compound components silently break if their shared Context has no default value and a sub-component is rendered outside the parent** — `useContext` returns `null`/`undefined` rather than throwing, so the failure surfaces later as a confusing "cannot read properties of null" deep inside the sub-component, not at the actual usage mistake.
- **Static property assignment (`Tabs.Tab = Tab`) is purely cosmetic and easy to over-trust** — nothing prevents a caller from importing and using `Tab` directly without the `Tabs.` prefix, and nothing about the assignment itself enforces that `Tab` is ever rendered inside a `<Tabs>` provider; the actual coupling is the shared Context, not the property.
- **HOCs that don't forward `ref` break any consumer trying to get a DOM/instance ref through the wrapper** — a plain `function Enhanced(props) { return <Wrapped {...props} /> }` has no way to receive a `ref` passed to `Enhanced` itself; forwarding it requires `React.forwardRef` explicitly wrapping the HOC's returned component.
- **Stacking multiple HOCs (`withAuth(withLogging(withTheme(Component)))`) obscures the actual prop flow and makes React DevTools' component tree much harder to read** — each HOC adds an extra layer of wrapper components with generic names, a readability cost that's part of why hooks are now generally preferred for new code.
- **A "rigid" data-driven component (items array + render internally) loses the ability to interleave arbitrary non-item markup between its rendered pieces** — a compound component doesn't have this limitation, since the caller writes the actual JSX structure; choosing the rigid form is a real trade against flexibility, not merely a stylistic preference.

## 🧠 Spot the Bug

A design system's `Modal` compound component works everywhere it's used — except in one page, where `Modal.CloseButton` throws `Cannot read properties of undefined (reading 'close')` as soon as the modal opens.

::code-wrapper{language="javascript"}
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

`Modal.CloseButton` is rendered as a sibling *before* `<Modal>` in `ReportModal`, entirely outside the `ModalContext.Provider` that `Modal` itself creates internally. `useContext(ModalContext)` at that position returns the context's default value — `undefined`, since `createContext()` was called with no argument — so destructuring `{ close }` from `undefined` throws immediately, well before `close` is ever invoked.

**The lesson**: a compound component's sub-components only receive shared state from an ancestor `Provider` that is actually rendered above them in the tree — placing `Modal.CloseButton` as a sibling rather than a *child* of `Modal` breaks the implicit contract compound components rely on, and giving `createContext(defaultValue)` a real default (or adding an explicit null-check that throws a clear error) turns this class of mistake into an obvious message instead of a cryptic crash.

</details>

## Key Takeaways

- React deliberately has no component-level inheritance — composition (children, slot props, prop forwarding) covers every case a class hierarchy would, with shallower, more explicit coupling.
- `children` is the default composition mechanism for single-slot wrapper components; named props generalize it into multiple independent slots when a layout needs more than one content region.
- "Specialized" component variants are best expressed as thin wrapper functions forwarding `...props`, not subclasses — this automatically inherits any future capability the base component gains.
- Compound components share implicit state among related sub-components via Context, letting the caller control arrangement and interleaved markup — choose this over a rigid data-prop component specifically when that flexibility matters.
- Static property assignment (`Tabs.Tab = Tab`) is a naming convenience only — the real coupling between compound sub-components is the shared Context, and sub-components rendered outside their parent's Provider will read a `null`/`undefined` default unless explicitly guarded.
- Prefer custom hooks over higher-order components for sharing cross-cutting logic in new code — HOCs still appear in older codebases and some libraries but add extra wrapper layers hooks avoid entirely.
