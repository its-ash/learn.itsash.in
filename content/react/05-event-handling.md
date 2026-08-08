# 05 — Event Handling

## Synthetic Events

React wraps native DOM events in a cross-browser wrapper called a **`SyntheticEvent`**. It normalizes inconsistencies between browsers (historically significant; less so today, but the abstraction remains) and integrates with React's batching and rendering pipeline. The API is deliberately similar to native events — `preventDefault()`, `stopPropagation()`, `target`, `currentTarget` all work as expected.

::code-wrapper{language="javascript"}
```javascript
function SearchForm() {
  function handleSubmit(event) {
    event.preventDefault()  // SyntheticEvent — same method name as native events
    const query = new FormData(event.currentTarget).get('query')
    console.log('Searching for:', query)
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="query" type="text" />
      <button type="submit">Search</button>
    </form>
  )
}
```
::

### `target` vs. `currentTarget`

`event.target` is the actual DOM element that triggered the event (could be a deeply nested child, e.g. an icon inside a button). `event.currentTarget` is always the element the handler is attached to. This distinction matters as soon as event delegation or nested clickable elements are involved.

::code-wrapper{language="javascript"}
```javascript
function IconButton({ onActivate }) {
  return (
    <button onClick={(e) => {
      console.log(e.target)        // could be the <svg> or <span> the user actually clicked
      console.log(e.currentTarget) // always the <button> itself
      onActivate()
    }}>
      <svg /> <span>Delete</span>
    </button>
  )
}
```
::

## React 17+ Event Delegation Model

Historically (React ≤16), React attached a single listener for each event type to `document`, and dispatched synthetic events from there — a technique called event delegation, done for performance (one listener instead of thousands) and consistency. **React 17 changed the attachment point from `document` to the root DOM container** (the element passed to `createRoot`/`ReactDOM.render`), which matters specifically for apps embedding multiple React versions or non-React widgets on the same page — with the old model, a React 16 app's global listener on `document` could intercept events meant for an unrelated React 17 tree (or vice versa) before it reached its target; rooting each tree's listeners at its own container isolates them properly.

For everyday component code this change is invisible — you still just write `onClick`, `onChange`, etc. — but it's a well-known "why did this event stop working when I mixed two React versions" root cause worth knowing.

::code-wrapper{language="javascript"}
```javascript
// You never manually attach these listeners — React delegates internally.
// Conceptually (React 17+):
// rootContainerElement.addEventListener('click', dispatchToSyntheticSystem)
// rootContainerElement.addEventListener('change', dispatchToSyntheticSystem)
// ...and so on for every supported event type, attached ONCE at the root.
```
::

## Passing Arguments to Handlers

The handler prop expects a *function reference*, not a function call. Calling the function directly in JSX (`onClick={doSomething()}`) invokes it immediately during render, not on click.

::code-wrapper{language="javascript"}
```javascript
// BUG: doSomething() is CALLED during render, not on click.
// Whatever it returns (probably undefined) becomes the onClick handler.
<button onClick={doSomething()}>Click</button>
```
::

::code-wrapper{language="javascript"}
```javascript
// Correct: pass a reference (no parens) when the function takes no arguments
<button onClick={doSomething}>Click</button>

// Correct: wrap in an arrow function when you need to pass arguments
<button onClick={() => deleteItem(item.id)}>Delete</button>

// Also correct: a handler factory returning a bound function
function makeDeleteHandler(id) {
  return () => deleteItem(id)
}
<button onClick={makeDeleteHandler(item.id)}>Delete</button>
```
::

### Real-World Pattern: List Item Handlers

::code-wrapper{language="javascript"}
```javascript
function TodoList({ todos, onToggle, onDelete }) {
  return (
    <ul>
      {todos.map(todo => (
        <li key={todo.id}>
          <input
            type="checkbox"
            checked={todo.done}
            onChange={() => onToggle(todo.id)}
          />
          <span>{todo.text}</span>
          <button onClick={() => onDelete(todo.id)}>Remove</button>
        </li>
      ))}
    </ul>
  )
}
```
::

Every row creates two new inline arrow functions per render. This is fine for the vast majority of apps — premature optimization here is a common mistake. Chapter 9 (`useCallback`) covers exactly when this actually matters (large lists combined with `React.memo`'d children) and when it's noise.

## `preventDefault` Patterns

### Forms

::code-wrapper{language="javascript"}
```javascript
function LoginForm({ onSubmit }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  function handleSubmit(event) {
    event.preventDefault()  // stops the browser's default full-page navigation/reload
    onSubmit({ email, password })
  }

  return (
    <form onSubmit={handleSubmit}>
      <input value={email} onChange={e => setEmail(e.target.value)} type="email" />
      <input value={password} onChange={e => setPassword(e.target.value)} type="password" />
      <button type="submit">Log In</button>
    </form>
  )
}
```
::

Forgetting `event.preventDefault()` on a form submission causes a full browser navigation/reload to the form's `action` URL (or the current page, by default) — wiping out all React state instantly. This is one of the most common beginner bugs and looks like "my app randomly resets."

### Links Intercepted for Client-Side Routing

::code-wrapper{language="javascript"}
```javascript
function CustomLink({ href, onNavigate, children }) {
  function handleClick(event) {
    event.preventDefault()  // stop the browser's real navigation
    onNavigate(href)         // let a router (chapter 19) handle it instead, without a full reload
  }
  return <a href={href} onClick={handleClick}>{children}</a>
}
```
::

### Drag-and-Drop, Context Menus, and Other Browser Defaults

::code-wrapper{language="javascript"}
```javascript
function DropZone({ onDrop }) {
  function handleDragOver(event) {
    event.preventDefault()  // required — without it, onDrop never fires at all
  }
  function handleDrop(event) {
    event.preventDefault()
    const files = Array.from(event.dataTransfer.files)
    onDrop(files)
  }
  return <div onDragOver={handleDragOver} onDrop={handleDrop}>Drop files here</div>
}
```
::

## `stopPropagation` and Bubbling

React's synthetic events bubble just like native DOM events, following the same tree order. `stopPropagation()` prevents ancestor handlers from firing.

::code-wrapper{language="javascript"}
```javascript
function Modal({ onClose, children }) {
  return (
    <div className="overlay" onClick={onClose}>
      {/* Without stopPropagation, clicking inside the modal body
          bubbles up to the overlay's onClick and closes the modal immediately. */}
      <div className="modal-body" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
```
::

## Common Event Types in Practice

| Event | Fires When | Typical Use |
|---|---|---|
| `onClick` | Element clicked (mouse or keyboard-activated for buttons/links) | Buttons, links, toggles |
| `onChange` | Input's value commits (fires on every keystroke for text inputs — see chapter 14) | Controlled form inputs |
| `onInput` | Similar to `onChange` for text-like inputs; rarely needed over `onChange` in React | Low-level input tracking |
| `onSubmit` | Form submitted (Enter key or submit button) | Form handling |
| `onFocus` / `onBlur` | Element gains/loses focus | Validation timing, accessibility |
| `onKeyDown` / `onKeyUp` | Key pressed/released | Keyboard shortcuts, Enter-to-submit patterns |
| `onMouseEnter` / `onMouseLeave` | Pointer enters/exits (does not bubble, unlike `onMouseOver`/`onMouseOut`) | Tooltips, hover states |
| `onScroll` | Element scrolled | Infinite scroll, sticky headers |

## Debouncing and Throttling Handlers

High-frequency events (`onScroll`, `onMouseMove`, `onChange` on a search box hitting an API) need debouncing/throttling to avoid overwhelming the app or network.

::code-wrapper{language="javascript"}
```javascript
function SearchBox({ onSearch }) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (query === '') return
    const timeoutId = setTimeout(() => onSearch(query), 300)
    return () => clearTimeout(timeoutId)  // cancels the previous timer on every keystroke
  }, [query, onSearch])

  return <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search…" />
}
```
::

This pattern — debounce via `useEffect` + `setTimeout` + cleanup — is covered in full in chapter 6; it's included here because it's the standard fix for "an event handler fires too often."

## 💡 Tips & Tricks

- **Idiom** — Prefer `event.currentTarget` over `event.target` when you need "the element this handler is attached to," especially for delegated click handlers on elements with nested icons/spans — `target` can be any descendant the user actually clicked.
- **Debug** — If a form mysteriously reloads the page or an app's whole state resets on submit, check for a missing `event.preventDefault()` in the `onSubmit` handler first — it's the single most common cause of "my app just refreshed for no reason."
- **Performance** — Inline arrow functions in `onClick={() => doThing(id)}` inside list items are not a performance problem for the vast majority of apps; don't reach for `useCallback` here until you've actually measured a re-render problem (see chapter 9 for when it does matter).
- **Idiom** — Use `onMouseEnter`/`onMouseLeave` instead of `onMouseOver`/`onMouseOut` for hover UI — the Enter/Leave pair doesn't bubble through child elements, avoiding flicker when the pointer crosses internal element boundaries within the hovered area.
- **Debug** — When `onKeyDown` handlers seem to "miss" certain keys, check whether the element is focusable — click handlers on a non-interactive `<div>` fire fine on click, but keyboard events require the element to be in the tab order (`tabIndex={0}`) or be a naturally focusable element.

## ⚠️ Edge Cases & Gotchas

- **Forgetting `event.preventDefault()` in `onSubmit` reloads the page and wipes all state** — the browser's default form behavior is a full navigation; React state doesn't survive it, and the bug often looks unrelated to the form itself since the whole app remounts from scratch.
- **`onClick={fn()}` calls the function during render, not on click** — a very easy typo (`onClick={handleDelete(id)}` instead of `onClick={() => handleDelete(id)}`) that runs the handler immediately on every render, and — because `handleDelete` probably returns `undefined` — silently makes the button inert with no error.
- **`onChange` in React fires on every keystroke, not on blur/commit like plain HTML** — code ported from a non-React mental model that expects `change` to fire only when focus leaves the field will see far more invocations than expected; this is a deliberate React normalization, not a bug (see chapter 14 for the controlled-input model this supports).
- **`stopPropagation()` inside a child can silently break unrelated ancestor logic** — a modal's inner click handler calling `stopPropagation()` to avoid triggering the overlay's close handler also prevents *any other* ancestor listener (e.g., an analytics "track all clicks" listener higher in the tree) from ever seeing that click.
- **Synthetic event objects are pooled in React ≤16 and reused across events** — accessing `event.type` asynchronously (e.g., inside a `setTimeout` after the handler returns) throws or reads `null` in React 16 and earlier, because the pooled event object gets recycled. React 17+ removed event pooling, so this specific gotcha is legacy-only — but it still explains a class of "works in a new project, breaks in this old codebase" bugs.

## 🧠 Spot the Bug

A "select all" checkbox is supposed to toggle every row, but clicking it does nothing and the console shows no errors.

::code-wrapper{language="javascript"}
```javascript
function SelectAllCheckbox({ onSelectAll }) {
  return <input type="checkbox" onClick={onSelectAll(true)} />
}
```
::

<details>
<summary>Answer</summary>

`onSelectAll(true)` is *called immediately* during render, because it's an invocation, not a reference. Whatever `onSelectAll(true)` returns (likely `undefined`, if it's a void function that just runs some side effect once at render time) is what actually gets assigned to `onClick`. The checkbox's real click handler ends up being `undefined`, so clicking it does nothing — while the "select all" logic already ran once, immediately, during the initial render, without user interaction.

**The lesson**: JSX event props need a function *reference*, not a function *call* — wrap any handler that needs arguments in an arrow function (`onClick={() => onSelectAll(true)}`) so it only executes when the event actually fires.

</details>

## Key Takeaways

- React wraps native events in `SyntheticEvent`; the API mirrors native events (`preventDefault`, `stopPropagation`, `target`, `currentTarget`).
- Since React 17, event listeners are delegated to the root container element (not `document`), which matters mainly when multiple React versions coexist on one page.
- Event handler props need a function reference — wrap calls that need arguments in an arrow function; never call the handler directly in JSX.
- Missing `event.preventDefault()` on a form's `onSubmit` triggers a full page reload, which is the most common cause of "my React state randomly reset."
- `onChange` in React fires per keystroke on text inputs (not on blur, unlike plain HTML `change`) — this underpins the controlled-input model in chapter 14.
- `stopPropagation()` blocks bubbling for *all* ancestor listeners, not just the one you're trying to avoid — use it deliberately, not reflexively.
