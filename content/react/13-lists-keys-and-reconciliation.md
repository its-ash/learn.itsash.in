# 13 — Lists, Keys & Reconciliation

Every earlier chapter has used `key` on list items with a one-line justification ("React needs it"). This chapter explains *why*, in enough mechanical detail that the many `key`-related footguns stop feeling arbitrary and start feeling inevitable.

## What Reconciliation Actually Does

When a component re-renders, React doesn't diff real DOM nodes against each other — it diffs the new React element tree (the lightweight objects JSX compiles to) against the previous render's tree, and computes the minimal set of real DOM mutations needed to make the DOM match. This process is called **reconciliation**, and its algorithm is a heuristic, not a general tree-diff — a truly general tree-diffing algorithm is O(n³) for n nodes, which is far too slow to run on every render. React's heuristic runs in O(n) by making two simplifying assumptions:

1. Two elements of different types produce different trees — React tears down the old subtree entirely and builds a new one, rather than trying to find similarities.
2. Elements of the same type in the same position are assumed to represent the *same conceptual thing* across renders, and get updated in place rather than rebuilt.

Assumption 2 is where lists get interesting: within an array of sibling elements, "position" is ambiguous by default — that's exactly the ambiguity `key` exists to resolve.

::code-wrapper{language="javascript"}
```javascript
function Toggle({ showFirst }) {
  return showFirst ? <input type="text" /> : <input type="checkbox" />
}
```
::

Same element type (`input`), same position — React updates the existing DOM node's attributes rather than removing and recreating it. But an `<input>` with `type="text"` holding typed text, switched to `type="checkbox"`, keeps the *same DOM node* with its internal state (like whatever the browser was tracking for that input) partially carried over in edge cases — this is exactly why type changes on the same element position can look buggy without an explicit `key` to force a fresh node.

## Why Lists Need Keys: The Identity Problem

Without keys, React's default matching strategy for array children is **positional** — index 0 in the new array is matched against index 0 in the old array, index 1 against index 1, and so on, regardless of what the items actually *represent*.

::code-wrapper{language="javascript"}
```javascript
function TodoList({ todos }) {
  return (
    <ul>
      {todos.map(todo => <li>{todo.text}</li>)}
      {/* No key prop — React warns in development and falls back to positional matching */}
    </ul>
  )
}
```
::

If `todos` is `[{id: 1, text: 'Buy milk'}, {id: 2, text: 'Walk dog'}]` and the user deletes the first item, the new array is `[{id: 2, text: 'Walk dog'}]`. Positionally, React compares the new index-0 (`Walk dog`) against the old index-0 (`Buy milk`) — same element type (`li`), so React reuses that DOM node and merely **updates its text content** — it does not realize the "Buy milk" item was removed and "Walk dog" shifted up. Any per-item state living in that `<li>`'s subtree (an uncontrolled input's value, a CSS transition mid-flight, a child component's internal `useState`) stays attached to the *position*, not the *item*, and ends up displaying against the wrong data.

## Keys Restore Identity

A stable, unique `key` tells React which old element each new element actually corresponds to, independent of array position — React matches by key first, then only falls back to creating/destroying elements for keys that didn't previously exist or no longer exist.

::code-wrapper{language="javascript"}
```javascript
function TodoList({ todos }) {
  return (
    <ul>
      {todos.map(todo => <li key={todo.id}>{todo.text}</li>)}
    </ul>
  )
}
```
::

Now deleting the "Buy milk" item (id `1`) is unambiguous: React sees that key `1` is gone, removes exactly that `<li>` DOM node, and leaves the `<li>` for key `2` completely untouched — no update, no re-render of its subtree beyond what its own props dictate, and any state living inside it survives intact because it's still attached to the same key, hence the same underlying "identity."

## The Index-as-Key Trap

Using the array index as a key is common, and works fine for lists that are **never reordered, filtered, or have items inserted/removed from anywhere but the end** — but those are precisely the operations most real lists eventually need.

::code-wrapper{language="javascript"}
```javascript
function EditableTodoList({ todos, onRemove }) {
  return (
    <ul>
      {todos.map((todo, index) => (
        <li key={index}>
          <input type="checkbox" defaultChecked={todo.done} />
          {todo.text}
          <button onClick={() => onRemove(todo.id)}>Delete</button>
        </li>
      ))}
    </ul>
  )
}
```
::

Each `<li>` holds an *uncontrolled* checkbox (chapter 14) whose checked state lives entirely in the DOM, not in React state — React has no record of it and relies on the DOM node persisting to preserve it. Delete the first todo: the array shrinks, and every remaining item shifts down one index. React, matching by `key={index}`, believes item at index 0 is unchanged (same key, `0`), item at index 1 is unchanged (same key, `1`), and so on — it never sees the removal at all from a keying perspective, it just sees the *last* key disappear. So React reuses every existing `<li>` DOM node in place and only removes the final one — but the checkbox DOM nodes, having been reused, still hold whichever `defaultChecked` values they had *before* the shift. The checked states end up visually shifted by one relative to the todos they now render next to.

::code-wrapper{language="javascript"}
```javascript
function EditableTodoList({ todos, onRemove }) {
  return (
    <ul>
      {todos.map(todo => (
        <li key={todo.id}>
          <input type="checkbox" defaultChecked={todo.done} />
          {todo.text}
          <button onClick={() => onRemove(todo.id)}>Delete</button>
        </li>
      ))}
    </ul>
  )
}
```
::

With `key={todo.id}`, deleting an item removes precisely that item's `<li>` (and its checkbox DOM node) — every other `<li>` is left completely alone, so its checkbox state stays correctly paired with its todo.

## When Index-as-Key Is Actually Fine

The blanket "never use index as key" advice overstates the rule. Index-as-key is safe specifically when **all** of the following hold: the list is never reordered, items are never inserted or removed except at the end, and the list has no per-item state (no uncontrolled inputs, no local `useState` inside list items, no CSS transitions keyed to identity). A static list of navigation labels rendered once from a hardcoded array satisfies all three.

::code-wrapper{language="javascript"}
```javascript
const NAV_ITEMS = ['Home', 'About', 'Contact']

function NavBar() {
  return (
    <nav>
      {NAV_ITEMS.map((label, index) => (
        <a key={index} href={`/${label.toLowerCase()}`}>{label}</a>
        // Safe: NAV_ITEMS is a fixed constant — never reordered, filtered, or mutated
      ))}
    </nav>
  )
}
```
::

## Keys Must Be Stable, Unique Among Siblings — Not Globally

A key only needs to be unique among its *immediate siblings* in that render, not globally unique across the whole app — the same key value can appear in two different lists (or the same list rendered in two different parent components) with no conflict, because reconciliation compares each list independently.

::code-wrapper{language="javascript"}
```javascript
function Dashboard({ recentOrders, recentUsers }) {
  return (
    <>
      <ul>{recentOrders.map(o => <li key={o.id}>{o.id}</li>)}</ul>
      <ul>{recentUsers.map(u => <li key={u.id}>{u.id}</li>)}</ul>
      {/* order.id === 7 and user.id === 7 can coexist fine — different lists, independently keyed */}
    </>
  )
}
```
::

What breaks is **non-uniqueness within the same array** — generating keys with `Math.random()` or `Date.now()` on every render is a common anti-pattern that looks like it satisfies "give it a key" while actually being worse than no key at all, since a fresh random key every render tells React *every single item is brand new on every render*, forcing full unmount/remount of the entire list every time, destroying all per-item state and DOM (including focus, scroll position, and CSS transitions) on every re-render.

::code-wrapper{language="javascript"}
```javascript
function BrokenList({ items }) {
  return (
    <ul>
      {items.map(item => <li key={Math.random()}>{item.text}</li>)}
      {/* Every render generates entirely new keys — React treats every <li> as new, every time */}
    </ul>
  )
}
```
::

## Keys on Fragments and Component Boundaries

`key` must be placed on the outermost element returned for each list item — not on some element nested inside it — because reconciliation reads `key` off the top-level element in the array, not off whatever JSX that element happens to render internally.

::code-wrapper{language="javascript"}
```javascript
function UserRow({ user }) {
  return (
    <tr>
      <td key={user.id}>{user.name}</td>
      {/* WRONG POSITION: key here does nothing for the list — this <tr> itself is unkeyed */}
    </tr>
  )
}

function UserTable({ users }) {
  return <table><tbody>{users.map(u => <UserRow key={u.id} user={u} />)}</tbody></table>
  {/* Correct: key belongs on the array-produced element (UserRow), not inside its render output */}
}
```
::

When a list item needs to render multiple sibling elements without an extra wrapping `<div>`, use the explicit `<Fragment key={...}>` form — the shorthand `<>...</>` syntax cannot accept a `key` prop, which is precisely why it exists as a shorthand for the *unkeyed* case only.

::code-wrapper{language="javascript"}
```javascript
import { Fragment } from 'react'

function DefinitionList({ terms }) {
  return (
    <dl>
      {terms.map(term => (
        <Fragment key={term.id}>
          <dt>{term.word}</dt>
          <dd>{term.definition}</dd>
        </Fragment>
      ))}
    </dl>
  )
}
```
::

## Forcing a Remount on Purpose with `key`

Because `key` controls identity, deliberately *changing* a key is a legitimate technique to force React to fully discard a component instance and its state, then mount a brand-new one — useful when a component's internal state should reset completely in response to some prop, rather than update in place.

::code-wrapper{language="javascript"}
```javascript
function ProfileEditor({ userId }) {
  // Without a key change, switching userId would update the SAME instance's props,
  // leaving any local draft-form state from the PREVIOUS user's edits lingering.
  return <ProfileForm key={userId} userId={userId} />
}
```
::

Changing `userId` causes React to see a different key at that position, so it unmounts the old `ProfileForm` instance (discarding all of its internal `useState`, refs, and effects) and mounts a fresh one — a deliberate application of the same identity mechanism that normally protects list items from unwanted resets, now used in reverse to *guarantee* one.

## 💡 Tips & Tricks

- **Debug** — React's development-mode console warning "Each child in a list should have a unique 'key' prop" is worth fixing immediately, not suppressing — it fires precisely in the scenario (an unkeyed array of elements) most likely to produce the positional-identity bugs this chapter describes.
- **Idiom** — Prefer a stable field from the data itself (a database id, a UUID) over anything derived at render time — derived values like `${item.name}-${index}` reintroduce index-based instability the moment two items share a name or the list reorders.
- **Performance** — Deliberately changing a `key` to force a remount (the `ProfileEditor` pattern above) is cheap for small components but discards and rebuilds the *entire* subtree, including any expensive child DOM/state — reach for it when a genuine reset is wanted, not as a general-purpose "force update" hammer.
- **Debug** — If a list item's local state (an open/closed accordion, a hover highlight, an in-progress edit) seems to "jump" to the wrong row after a delete or sort, suspect index-as-key before anything else — this exact symptom is the signature of positional identity mismatched against reordered data.
- **Idiom** — When rendering a list of composite JSX per item (multiple sibling tags), reach for `<Fragment key={id}>` rather than an unnecessary wrapping `<div>` purely to hold the key — the fragment keeps the DOM output flat while still giving reconciliation the identity it needs.

## ⚠️ Edge Cases & Gotchas

- **Index-as-key silently corrupts per-item state on reorder, insert-at-start, or delete-from-middle** — no error, no warning; uncontrolled inputs, local component state, and CSS transitions inside list items end up visually attached to the wrong data row after the operation.
- **`key={Math.random()}` or `key={Date.now()}` is worse than no key at all** — it guarantees every item looks brand-new on every single render, forcing full unmount/remount (losing focus, scroll position, and all per-item state) far more aggressively than the positional fallback ever would.
- **The shorthand `<>...</>` Fragment syntax cannot take a `key` prop at all** — attempting `<key={id}>...</>`  is a syntax error; the explicit `<Fragment key={id}>` form is required the moment a keyed fragment is needed inside a `.map()`.
- **A `key` placed on an element nested inside a list item's returned JSX, rather than on the top-level mapped element itself, has no effect on reconciliation** — React only reads `key` off elements that are direct children of the array/iterable being rendered.
- **Sibling uniqueness is the only requirement — keys are not required to be globally unique across the whole app** — two independent lists (or the same list re-rendered in a different parent) reusing the same key values is completely safe, since reconciliation scopes key comparison to one array of siblings at a time.

## 🧠 Spot the Bug

A "recently viewed products" carousel lets users remove an item early. After removing the first product, the *wrong* product's "Remove" button ends up temporarily disabled (mid-animation) instead of the one that was actually just removed.

::code-wrapper{language="javascript"}
```javascript
function RecentlyViewed({ products, onRemove }) {
  return (
    <div className="carousel">
      {products.map((product, index) => (
        <ProductCard
          key={index}
          product={product}
          onRemove={() => onRemove(product.id)}
        />
      ))}
    </div>
  )
}

function ProductCard({ product, onRemove }) {
  const [removing, setRemoving] = useState(false)

  function handleClick() {
    setRemoving(true)
    setTimeout(() => onRemove(), 300)
  }

  return (
    <div className={removing ? 'fading-out' : ''}>
      <span>{product.name}</span>
      <button disabled={removing} onClick={handleClick}>Remove</button>
    </div>
  )
}
```
::

<details>
<summary>Answer</summary>

`ProductCard` holds its own local `removing` state, and the list is keyed by array `index` rather than `product.id`. Clicking "Remove" on the first product sets *that instance's* `removing` to `true`, starting the 300ms fade — but the parent's `products` array only updates (via `onRemove`) after the timeout fires. In the meantime, nothing else changes, so no reconciliation happens yet. The real problem shows up on a *second* quick removal before the first timeout completes: because every `ProductCard` is keyed by position, removing an earlier item shifts every subsequent item's index down by one. React matches the new index-0 element against the old index-0 `ProductCard` instance — which is the instance that currently has `removing: true` mid-animation — and hands it the *next* product's data while keeping its old `removing` state, so the fade-out and disabled button end up visually attached to whichever product now happens to occupy that position, not the one the user actually clicked.

**The lesson**: any list item holding per-instance local state (here, an in-progress removal animation) must be keyed by a stable identity field like `product.id`, never by array index — index-based keys tie state to a *position* that shifts under insert/remove, not to the *item* the user actually interacted with.

</details>

## Key Takeaways

- Reconciliation diffs React element trees, not real DOM, using an O(n) heuristic that assumes same-type-same-position elements represent the same underlying thing — `key` is how you correct that assumption for lists.
- Without keys, React matches array children positionally, which silently misattributes per-item DOM and state (uncontrolled input values, local `useState`, CSS transitions) whenever a list is reordered, filtered, or has items removed from anywhere but the end.
- Index-as-key is safe only for lists that are never reordered, never have items inserted/removed except at the end, and hold no per-item state — a fixed, hardcoded list of labels is the canonical safe case.
- Keys must be stable and unique among *siblings*, not globally — a database id or UUID from the data itself is the right source; `Math.random()` or `Date.now()` per render is actively worse than no key.
- `key` belongs on the outermost element produced per list item, and the explicit `<Fragment key={id}>` form is required (not the `<>` shorthand) when a list item needs multiple sibling elements without a wrapper `<div>`.
- Deliberately changing a `key` is a legitimate way to force a full remount and state reset — the same identity mechanism that protects list items from unwanted resets, applied in reverse on purpose.
