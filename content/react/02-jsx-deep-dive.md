# 02 — JSX Deep Dive

## JSX Is an Expression-Oriented Syntax

Every JSX tag evaluates to a value (a React element object). Because of this, JSX can appear anywhere a JavaScript expression can appear — assigned to a variable, returned from a function, passed as an argument, stored in an array.

::code-wrapper{language="javascript"}
```javascript
const heading = <h1>Hello</h1>          // JSX assigned to a variable
const elements = [<li key="a">A</li>, <li key="b">B</li>]  // JSX in an array

function getGreeting(user) {
  return user ? <h1>Hello, {user.name}</h1> : <h1>Hello, Stranger</h1>  // JSX returned conditionally
}
```
::

## The Core Rules of JSX

### 1. A Single Root Element (or Fragment)

Every JSX expression must resolve to exactly one root node.

::code-wrapper{language="javascript"}
```javascript
// Invalid — two adjacent root elements, no wrapper
function Bad() {
  return (
    <h1>Title</h1>
    <p>Body</p>
  )
}
// SyntaxError: Adjacent JSX elements must be wrapped in an enclosing tag
```
::

::code-wrapper{language="javascript"}
```javascript
// Valid — wrapped in a Fragment (renders no extra DOM node)
function Good() {
  return (
    <>
      <h1>Title</h1>
      <p>Body</p>
    </>
  )
}
```
::

### 2. Tags Must Always Close

Unlike HTML, self-closing tags cannot omit the slash, and every opening tag needs a matching close.

::code-wrapper{language="javascript"}
```javascript
// Invalid in JSX (valid in loose HTML)
<img src="cat.png">
<br>

// Valid
<img src="cat.png" />
<br />
```
::

### 3. `className`, Not `class`; `htmlFor`, Not `for`

JSX attributes map to DOM properties, and `class`/`for` are reserved words in JavaScript, so React uses the camelCase DOM property names instead.

::code-wrapper{language="javascript"}
```javascript
// Wrong — `class` is a JS reserved word; React also won't apply the style
<div class="card"><label for="email">Email</label></div>

// Right
<div className="card"><label htmlFor="email">Email</label></div>
```
::

### 4. Attributes Are camelCase

Most DOM attributes become camelCase in JSX: `onclick` → `onClick`, `tabindex` → `tabIndex`, `readonly` → `readOnly`. Exceptions exist for `aria-*` and `data-*` attributes, which stay hyphenated because they are not "properties" in the DOM sense.

::code-wrapper{language="javascript"}
```javascript
<button
  onClick={handleClick}
  tabIndex={0}
  aria-label="Close dialog"
  data-testid="close-btn"
  disabled={isLoading}
>
  Close
</button>
```
::

## Expressions in JSX: `{}`

Curly braces embed a JavaScript **expression** (something that evaluates to a value) — never a **statement** (`if`, `for`, variable declarations).

::code-wrapper{language="javascript"}
```javascript
function Price({ amount, currency }) {
  return (
    <span>
      {/* Expressions: ternaries, function calls, template literals, arithmetic — all fine */}
      {currency}{amount.toFixed(2)}
      {amount > 100 && <strong> (Bulk discount applied)</strong>}
    </span>
  )
}
```
::

::code-wrapper{language="javascript"}
```javascript
// Invalid — `if` is a statement, not an expression; cannot go inside {}
function Bad({ status }) {
  return (
    <div>
      {if (status === 'ok') { return <span>OK</span> }}  // SyntaxError
    </div>
  )
}
```
::

The fix is to move the branching *outside* the JSX (into a variable, a helper function, or an early return — see chapter 12), or use an expression-form construct like the ternary or `&&`.

## Conditional Rendering Patterns

### Ternary — when you need an else branch

::code-wrapper{language="javascript"}
```javascript
function StatusBadge({ isOnline }) {
  return (
    <span className={isOnline ? 'badge badge--green' : 'badge badge--gray'}>
      {isOnline ? 'Online' : 'Offline'}
    </span>
  )
}
```
::

### Logical AND (`&&`) — when there's no else branch

::code-wrapper{language="javascript"}
```javascript
function Inbox({ unreadCount }) {
  return (
    <div>
      <h2>Inbox</h2>
      {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
    </div>
  )
}
```
::

### The classic `&&` gotcha: falsy-but-not-boolean values render

`&&` returns its left operand if it's falsy. `0` is falsy — but React *renders* `0` as text, because it's a valid, meaningful child (unlike `false`, `null`, and `undefined`, which React treats as "render nothing").

::code-wrapper{language="javascript"}
```javascript
// Bug: when unreadCount is 0, this renders a literal "0" on the page
function Inbox({ unreadCount }) {
  return <div>{unreadCount && <span className="badge">{unreadCount}</span>}</div>
}
// unreadCount = 0  →  0 && <span>...</span>  evaluates to 0  →  React renders "0"
```
::

::code-wrapper{language="javascript"}
```javascript
// Fix: force a real boolean, or compare explicitly
function Inbox({ unreadCount }) {
  return <div>{unreadCount > 0 && <span className="badge">{unreadCount}</span>}</div>
}
// unreadCount = 0  →  false && ...  →  false  →  React renders nothing
```
::

This is one of the most common real-world React bugs and worth internalizing: **`&&` is safe only when the left side is guaranteed to be a strict boolean, or when you explicitly coerce it (`!!count`, `count > 0`).**

### `switch`-like rendering with an object lookup or IIFE

For more than two branches, a ternary chain becomes unreadable. Prefer an object map or an early return (chapter 12) over nested ternaries.

::code-wrapper{language="javascript"}
```javascript
// Avoid — nested ternaries are hard to read and easy to get wrong
function Status({ state }) {
  return (
    <span>
      {state === 'loading' ? 'Loading…' : state === 'error' ? 'Error!' : state === 'empty' ? 'No data' : 'Ready'}
    </span>
  )
}
```
::

::code-wrapper{language="javascript"}
```javascript
// Better — a lookup map reads top-to-bottom and is trivially extendable
const STATUS_LABELS = {
  loading: 'Loading…',
  error: 'Error!',
  empty: 'No data',
  ready: 'Ready',
}

function Status({ state }) {
  return <span>{STATUS_LABELS[state] ?? 'Unknown'}</span>
}
```
::

## Rendering Lists

Arrays of JSX render directly. `.map()` is the standard pattern — each generated element requires a unique `key` prop (deep dive in chapter 13).

::code-wrapper{language="javascript"}
```javascript
function TodoList({ todos }) {
  return (
    <ul>
      {todos.map(todo => (
        <li key={todo.id} className={todo.done ? 'done' : ''}>
          {todo.text}
        </li>
      ))}
    </ul>
  )
}
```
::

### Missing keys: the console warning that's easy to ignore (and shouldn't be)

::code-wrapper{language="javascript"}
```javascript
// No key — React warns: "Each child in a list should have a unique 'key' prop"
{todos.map(todo => <li>{todo.text}</li>)}
```
::

Without a stable `key`, React falls back to positional matching during reconciliation, which can cause state to attach to the wrong list item when the list is reordered, filtered, or spliced — a subtle bug that often doesn't manifest until the list has interactive children (inputs, checkboxes). See chapter 13 for the full mechanism.

## Fragments

A `Fragment` groups children without adding an extra DOM node. Use the shorthand `<>...</>` when you don't need a `key`; use the explicit `<Fragment key={...}>` form when you do (shorthand doesn't accept props).

::code-wrapper{language="javascript"}
```javascript
import { Fragment } from 'react'

function DefinitionList({ terms }) {
  return (
    <dl>
      {terms.map(({ id, term, definition }) => (
        // Shorthand <>...</> cannot take a `key`, so the explicit form is required in a .map()
        <Fragment key={id}>
          <dt>{term}</dt>
          <dd>{definition}</dd>
        </Fragment>
      ))}
    </dl>
  )
}
```
::

Fragments matter for real layout correctness: wrapping `<tr>` children in a `<div>` inside a `<table>` produces invalid, browser-mangled HTML because `<div>` isn't a legal child of `<table>`/`<tbody>`. A `Fragment` avoids introducing that invalid wrapper.

::code-wrapper{language="javascript"}
```javascript
// Bug: browsers hoist the <div> out of the table, breaking the DOM structure and CSS
function Row({ user }) {
  return (
    <div>
      <td>{user.name}</td>
      <td>{user.email}</td>
    </div>
  )
}
```
::

::code-wrapper{language="javascript"}
```javascript
// Fix: Fragment groups the <td>s with no invalid wrapper element
function Row({ user }) {
  return (
    <>
      <td>{user.name}</td>
      <td>{user.email}</td>
    </>
  )
}
```
::

## Comments in JSX

Comments inside the JSX tree must be expressions, so they're wrapped in `{}` and use `/* */`, not `//`.

::code-wrapper{language="javascript"}
```javascript
function Card() {
  return (
    <div className="card">
      {/* This is a valid JSX comment */}
      <h2>Title</h2>
      {
        // A single-line comment also works, but only inside {} on its own line
      }
    </div>
  )
}
```
::

## Spreading Props

The spread operator forwards an entire object as individual props — useful for pass-through components, but it obscures exactly which props a component receives.

::code-wrapper{language="javascript"}
```javascript
function Input(props) {
  return <input {...props} className="styled-input" />
}

// Usage: type, value, onChange, placeholder all forwarded transparently
<Input type="email" value={email} onChange={handleChange} placeholder="you@example.com" />
```
::

::code-wrapper{language="javascript"}
```javascript
// Gotcha: prop order matters — later spreads/props win
function Input(props) {
  // className is fixed regardless of what's passed in, because it comes AFTER the spread
  return <input {...props} className="styled-input" />
}
// If you need callers to be able to override className, spread AFTER instead:
function Input({ className, ...rest }) {
  return <input {...rest} className={className ?? 'styled-input'} />
}
```
::

## 💡 Tips & Tricks

- **Idiom** — Reach for an object lookup map (`STATUS_LABELS[state]`) instead of chained ternaries once you have more than two conditional branches in JSX; it reads top-to-bottom and survives future branches without nesting.
- **Debug** — When React logs "Each child in a list should have a unique key prop," it's not being pedantic — attach a debugger or `console.log` to confirm your key source (usually an id) is actually unique and stable before silencing the warning with `index` as a shortcut.
- **Performance** — Fragments (`<>...</>`) don't add DOM nodes, which keeps deeply nested layouts (tables, grids, flex/grid children) free of unnecessary wrapper `<div>`s that can break CSS selectors like `:nth-child` or `display: contents` assumptions.
- **Idiom** — Prefer `{condition && <X />}` for "render or nothing," but coerce numeric conditions to booleans explicitly (`count > 0 &&`, not `count &&`) to avoid the stray-`0` rendering bug.
- **Debug** — `{/* comment */}` is the only valid comment syntax directly inside JSX children; a bare `// comment` on its own line without surrounding `{}` will be rendered as literal text.

## ⚠️ Edge Cases & Gotchas

- **`0 && <Component />` renders the text "0"** — because `0` is a valid, non-nullish React child, not because of any special-casing. Only `false`, `null`, `undefined`, and `true` render as nothing; every other falsy-ish value (`0`, `NaN`, `''` is fine — empty string renders nothing) has its own rendering rule and `0` is the one that bites people.
- **JSX attribute values must be expressions, not raw strings when dynamic** — `<div id="user-{id}">` does not interpolate; it produces the literal string `"user-{id}"`. Use `` <div id={`user-${id}`}> `` or `<div id={'user-' + id}>`.
- **`style` takes an object with camelCase keys, not a CSS string** — `<div style="color: red">` throws a React warning and is silently ignored; the correct form is `<div style={{ color: 'red', fontSize: '14px' }}>` — note the double braces (one for the JS expression, one for the object literal).
- **Boolean HTML attributes need explicit `={true}`/`={false}` or omission, not string `"false"`** — `<input disabled="false" />` is still disabled, because any non-empty string is truthy in HTML's eyes for boolean attributes. Write `<input disabled={false} />` or omit the prop entirely.
- **Whitespace and newlines inside JSX collapse like HTML** — a value split across lines for readability (`<p>{firstName}\n{lastName}</p>`) does not insert a space between them the way you might expect from the literal source formatting; JSX trims leading/trailing whitespace per line and joins lines with a single space, which can silently glue two adjacent words together if you're not using an explicit `{' '}` separator.

## 🧠 Spot the Bug

A cart badge is supposed to hide when the cart is empty. Users report a stray `0` flashing on the page on every fresh visit.

::code-wrapper{language="javascript"}
```javascript
function CartBadge({ itemCount }) {
  return (
    <header>
      <CartIcon />
      {itemCount && <span className="badge">{itemCount}</span>}
    </header>
  )
}
```
::

<details>
<summary>Answer</summary>

On a fresh visit `itemCount` is `0`. `0 && <span>...</span>` short-circuits and evaluates to `0` (not `false`), and React renders numbers as text — so the literal digit `0` appears in the header instead of nothing.

**The lesson**: guard numeric conditions in `&&` expressions with an explicit comparison (`itemCount > 0 && ...`) so the left operand is always a real boolean, since React only treats `false`/`null`/`undefined` as "render nothing."

</details>

## Key Takeaways

- JSX compiles to expressions (element objects), so it can only contain expressions in `{}`, never statements like `if`/`for`.
- Every JSX tree needs exactly one root — use a `Fragment` (`<>...</>`) to group siblings without adding a DOM node.
- Attributes are camelCase DOM property names (`className`, `htmlFor`, `onClick`), with `aria-*`/`data-*` as hyphenated exceptions.
- `&&` is the standard "render or nothing" pattern, but only safe with a strict boolean left operand — numeric falsy values like `0` render as text.
- `.map()` over an array of JSX requires a stable, unique `key` per item — missing or unstable keys cause reconciliation bugs, not just console warnings.
- `style` takes a JS object with camelCase properties, never a CSS string.
