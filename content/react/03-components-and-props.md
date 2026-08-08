# 03 — Components & Props

## Function Components

A React component is just a JavaScript function that returns JSX (or `null`). By convention, component names are **PascalCase** — React (and JSX) uses the capitalization to distinguish a custom component (`<UserCard />`) from a plain HTML tag (`<usercard />` would be treated as an unknown DOM element).

::code-wrapper{language="javascript"}
```javascript
function UserCard({ name, title, avatarUrl }) {
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

Components can also be written as arrow functions — both are equivalent for function components; teams typically standardize on one via a lint rule.

::code-wrapper{language="javascript"}
```javascript
const UserCard = ({ name, title, avatarUrl }) => (
  <div className="user-card">
    <img src={avatarUrl} alt={`${name}'s avatar`} />
    <h3>{name}</h3>
    <p>{title}</p>
  </div>
)
```
::

## Props: The Read-Only Input

Props ("properties") are how a parent passes data into a child. They arrive as a single object argument, and — critically — **props are read-only from the child's perspective**. A component must never mutate its own props.

::code-wrapper{language="javascript"}
```javascript
function Bad({ user }) {
  user.name = user.name.toUpperCase()  // Mutates the parent's object — never do this
  return <p>{user.name}</p>
}
```
::

::code-wrapper{language="javascript"}
```javascript
function Good({ user }) {
  return <p>{user.name.toUpperCase()}</p>  // Derives a new value, doesn't mutate the input
}
```
::

Mutating props is dangerous because the same object reference may be shared with siblings, cached, or reused across renders — mutating it produces bugs that appear in unrelated parts of the tree, often far from the mutation site, and violates the assumption React's diffing relies on: that a given props/state snapshot represents one point in time and won't be silently altered later.

## Destructuring Props

Destructuring in the function signature is the idiomatic style — it documents exactly which props a component uses at a glance, without reading the whole body.

::code-wrapper{language="javascript"}
```javascript
// Works, but requires reading the whole function to know what `props` contains
function OrderSummary(props) {
  return (
    <div>
      <p>{props.itemCount} items</p>
      <p>Total: ${props.total.toFixed(2)}</p>
    </div>
  )
}

// Idiomatic — the signature IS the documentation
function OrderSummary({ itemCount, total }) {
  return (
    <div>
      <p>{itemCount} items</p>
      <p>Total: ${total.toFixed(2)}</p>
    </div>
  )
}
```
::

## Default Values for Props

Use default parameter syntax (ES2015 destructuring defaults) — this replaced the legacy `Component.defaultProps` static property, which still works on function components but is deprecated as of React 18.3 and will be removed in a future major version.

::code-wrapper{language="javascript"}
```javascript
function Button({ label, variant = 'primary', disabled = false, onClick }) {
  return (
    <button className={`btn btn--${variant}`} disabled={disabled} onClick={onClick}>
      {label}
    </button>
  )
}

// variant defaults to 'primary' if the caller omits it
<Button label="Save" onClick={handleSave} />
<Button label="Delete" variant="danger" onClick={handleDelete} />
```
::

::code-wrapper{language="javascript"}
```javascript
// Legacy pattern — still functions, but deprecated; migrate to default parameters
function Button({ label, variant, disabled, onClick }) { /* ... */ }
Button.defaultProps = { variant: 'primary', disabled: false }
```
::

### Gotcha: Default Values Don't Apply to `undefined` vs. Explicit `null`

Default parameters only kick in when the prop is `undefined` (i.e., omitted, or explicitly passed as `undefined`). Passing `null` explicitly bypasses the default — a subtle difference from many developers' intuition.

::code-wrapper{language="javascript"}
```javascript
function Avatar({ size = 40 }) {
  return <div style={{ width: size, height: size }} />
}

<Avatar />              // size = 40 (default applies — prop is undefined)
<Avatar size={undefined} /> // size = 40 (default applies)
<Avatar size={null} />  // size = null (default does NOT apply — null is a real value)
// -> style={{ width: null, height: null }} silently renders as if no size was set
```
::

## The `children` Prop

Anything nested between a component's opening and closing tags is passed automatically as the special `children` prop. This is the foundation of composition (fully explored in chapter 15).

::code-wrapper{language="javascript"}
```javascript
function Card({ children, title }) {
  return (
    <div className="card">
      <h3 className="card__title">{title}</h3>
      <div className="card__body">{children}</div>
    </div>
  )
}

// Usage — everything between the tags becomes `children`
<Card title="Account Settings">
  <p>Manage your profile and preferences.</p>
  <button>Edit Profile</button>
</Card>
```
::

`children` can be any valid React node: a string, a number, an element, an array of elements, or `null`. A component that expects a single child but receives an array (e.g., multiple sibling elements passed as children) should use `React.Children` utilities or simply render `{children}` directly, which handles arrays transparently.

## Props Are Just an Object — Spread, Rename, Combine Freely

Because props are ordinary JavaScript objects, every object technique applies: spreading, renaming during destructuring, computing derived props.

::code-wrapper{language="javascript"}
```javascript
function ProfileLink({ user: { id, name }, className }) {
  return <a href={`/users/${id}`} className={className}>{name}</a>
}

const commonProps = { className: 'link--underline', target: '_blank', rel: 'noreferrer' }
<ProfileLink user={currentUser} {...commonProps} />
```
::

## The Prop Drilling Problem

When data needs to travel through several layers of components that don't themselves use it — only pass it further down — you get **prop drilling**. It's not wrong for one or two levels; it becomes a maintenance burden past three or four.

::code-wrapper{language="javascript"}
```javascript
// `theme` is only used by ThemedButton, but every intermediate component
// must accept and forward it just to get it there.
function App() {
  const theme = 'dark'
  return <Page theme={theme} />
}
function Page({ theme }) {
  return <Sidebar theme={theme} />
}
function Sidebar({ theme }) {
  return <UserPanel theme={theme} />
}
function UserPanel({ theme }) {
  return <ThemedButton theme={theme} />
}
function ThemedButton({ theme }) {
  return <button className={`btn btn--${theme}`}>Click</button>
}
```
::

Every intermediate component (`Page`, `Sidebar`, `UserPanel`) now has an irrelevant prop in its signature purely as a pass-through, and adding a second cross-cutting value means touching every layer again. Two real solutions exist: **composition** (pass the already-built element down instead of raw data — see chapter 15) or **Context** (chapter 7), which lets any descendant read a value without every layer forwarding it. This chapter only names the problem; the next chapters build the tools that solve it.

## Component Naming and File Organization

::code-wrapper{language="bash"}
```bash
# Convention: one component per file, filename matches the component name
src/components/
├── UserCard.jsx
├── Button.jsx
└── Card.jsx
```
::

## PropTypes (Runtime Validation, Pre-TypeScript Era)

Before TypeScript was the default recommendation (chapter 23), teams used the `prop-types` package for runtime prop validation in plain JavaScript projects. It's still seen in legacy and TS-free codebases.

::code-wrapper{language="javascript"}
```javascript
import PropTypes from 'prop-types'

function UserCard({ name, age }) {
  return <p>{name} is {age}</p>
}

UserCard.propTypes = {
  name: PropTypes.string.isRequired,
  age: PropTypes.number,
}
// Logs a console warning in development if `name` is missing or the wrong type.
// No effect in production, and no compile-time safety — TypeScript (ch. 23) is strictly better
// for new projects, but you will encounter PropTypes in real, older codebases.
```
::

## 💡 Tips & Tricks

- **Idiom** — Destructure props directly in the function signature rather than accepting a single `props` object and dotting into it repeatedly; the signature becomes self-documenting and diffs stay small when a prop is added or removed.
- **Debug** — If a prop silently isn't applying its default, check whether the caller is passing `null` rather than omitting the prop or passing `undefined` — default parameters only trigger on `undefined`, not `null`, and this is a very easy detail to miss when a prop's value comes from an API response that uses `null` for "empty."
- **Idiom** — Pass whole objects (`<ProfileLink user={user} />`) instead of enumerating every field individually (`name={user.name} email={user.email} ...`) when the child genuinely needs most of the object — but do enumerate individual primitive fields when only one or two are used, since that keeps the component's dependency on the parent's shape explicit and easier to memoize (chapter 9).
- **Performance** — Spreading unknown extra props onto a DOM element (`<input {...rest} />`) is a common and valid pattern for building wrapper components, but be aware every unrecognized prop that reaches a real DOM element (not a custom component) triggers a React warning and is dropped — filter out non-DOM props before spreading onto host elements.
- **Portability** — `prop-types` still works in modern React but provides zero compile-time safety and no editor autocomplete; for any project expected to grow past a prototype, TypeScript's prop typing (chapter 23) is the modern default and this curriculum treats PropTypes purely as legacy-literacy.

## ⚠️ Edge Cases & Gotchas

- **Mutating a prop object mutates the parent's data too** — objects and arrays passed as props are references, not copies; `props.items.push(x)` inside a child silently corrupts the parent's array without React ever knowing a "change" happened, since the reference itself didn't change — this can suppress re-renders entirely while also corrupting shared state.
- **`Component.defaultProps` is deprecated on function components** — it still executes today, but React 19+ logs a deprecation warning, and a future major version removes support entirely; default parameter destructuring (`({ x = 1 })`) is the forward-compatible replacement and has identical runtime behavior today.
- **Lowercase component names are silently treated as HTML tags** — `<userCard />` (lowercase first letter) does not error; JSX treats any lowercase-first tag name as a host element (like `<div>`), so React tries to render an unknown DOM element `<usercard>` instead of your component, and your props end up as (ignored, with warnings) raw DOM attributes.
- **Passing a new inline object/array/function as a prop creates a new reference every render** — `<Widget style={{ color: 'red' }} />` allocates a brand-new object on every parent render, which defeats `React.memo` on `Widget` (chapter 20) even though the *values* never actually change — the object's identity changes, and memo comparisons are reference-based by default.
- **`children` is not always an array** — a component with exactly one child receives that child directly (an object or string), not a one-element array; code that assumes `children.map(...)` works unconditionally throws `children.map is not a function` when there's only a single child. Use `React.Children.map` if you must operate on `children` generically regardless of count.

## 🧠 Spot the Bug

A settings panel toggles a preference, but sometimes the change appears to "leak" into another user's cached card elsewhere on the page.

::code-wrapper{language="javascript"}
```javascript
function NotificationSettings({ preferences }) {
  function toggleEmail() {
    preferences.email = !preferences.email  // mutate directly, then force a local re-render
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

`preferences` is an object reference passed down from a parent (likely from some shared cache or context). Mutating `preferences.email` directly changes the *same object* that other components — or a cache keyed by that object — are also holding a reference to. Because the mutation doesn't create a new object, any sibling relying on the same reference sees the changed value too, even though it never "received" an update through props.

**The lesson**: never mutate a prop (or any object passed by reference); always derive a new object (`{ ...preferences, email: !preferences.email }`) and pass it up through a callback so the actual owner of the state updates it immutably and re-renders everyone correctly.

</details>

## Key Takeaways

- Components are functions returning JSX; PascalCase names distinguish custom components from host DOM tags in JSX.
- Props are a read-only, single object argument — never mutate them; derive new values instead.
- Default parameter destructuring (`{ x = 1 }`) is the modern way to set prop defaults; `defaultProps` is deprecated.
- `children` is a special prop for nested content and is the foundation of the composition patterns in chapter 15.
- Prop drilling — forwarding a value through layers that don't use it — is a naming of a problem, not a pattern to embrace; Context (chapter 7) and composition (chapter 15) are the fixes.
- Inline object/array/function props create a new reference on every render, which matters once `React.memo` enters the picture (chapter 20).
