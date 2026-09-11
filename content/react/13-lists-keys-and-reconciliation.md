---
title: "13 — Lists, Keys & Reconciliation"
description: "Reconciliation algorithm internals, key prop mechanics, why index keys corrupt state on reorder, virtual DOM diffing strategy, production patterns for dynamic lists. Code-first reference for mid-to-senior React engineers."
---

# 13 — Lists, Keys & Reconciliation

## The Reconciliation Algorithm

::code-wrapper{language="javascript" filename="reconciliation_overview.js"}
```javascript
// When a component re-renders, React does NOT diff real DOM nodes.
// It diffs the NEW React element tree against the PREVIOUS render's element tree,
// then computes the minimal set of real DOM mutations to apply.

// This process is called RECONCILIATION. It uses a heuristic algorithm, NOT
// a general tree-diff (a general tree-diff is O(n³) — far too slow for UIs).

// React's heuristic runs in O(n) via TWO assumptions:
//
// 1. DIFFERENT element types → different trees
//    <div> → <span> : React tears down the entire old subtree, builds a new one.
//    No reuse, no diffing of children. Full unmount + remount.
//
// 2. SAME element type + SAME position → same underlying thing
//    <div className="a"> → <div className="b"> : React keeps the DOM node,
//    just updates changed attributes (className, style, etc.) in place.
//    Children are then diffed recursively.

// The "position" assumption is where lists get dangerous:
// In an array of siblings, "position" is ambiguous without keys.
// That ambiguity is what the `key` prop exists to resolve.

// ── Annotated diffing pseudocode (what React does internally) ──

function reconcileChildren(prevChildren, nextChildren) {
  // prevChildren: [elementA, elementB, elementC]  (from last render)
  // nextChildren: [elementB, elementC, elementD]  (from this render, A removed, D added)

  // STEP 1: If nextChildren has keys, match by key first
  const prevByKey = new Map(prevChildren.map(c => [c.key, c]))
  const matched = []
  const toCreate = []

  for (const nextChild of nextChildren) {
    if (nextChild.key !== null && prevByKey.has(nextChild.key)) {
      // Key match: reuse the previous element's DOM node + state
      matched.push(reuseAndUpdate(prevByKey.get(nextChild.key), nextChild))
      prevByKey.delete(nextChild.key)
    } else {
      // No key match: this is a new element → create from scratch
      toCreate.push(nextChild)
    }
  }

  // STEP 2: Any prev elements not matched by key → unmount (destroy DOM + state)
  for (const [, unmatched] of prevByKey) {
    unmount(unmatched)  // cleanup effects, remove DOM nodes, destroy state
  }

  // STEP 3: Create DOM for new elements
  for (const newChild of toCreate) {
    mount(newChild)
  }

  // STEP 4: Reorder matched DOM nodes into the correct positions
  reorder(matched, nextChildren)
}
```
::

## Why Keys Exist: The Identity Problem

::code-wrapper{language="javascript" filename="identity_problem.js"}
```javascript
import { useState } from 'react'

// Without keys, React's default matching strategy for array children is POSITIONAL:
// new index-0 matches old index-0, new index-1 matches old index-1, etc.
// regardless of what the items actually represent.

// ANTI-PATTERN: no key prop (React warns in dev, falls back to positional matching)
function TodoListNoKey({ todos }) {
  return (
    <ul>
      {todos.map(todo => <li>{todo.text}</li>)}
      {/* React console warning: "Each child in a list should have a unique key prop" */}
    </ul>
  )
}

// THE BUG this causes:
// todos = [{ id: 1, text: 'Buy milk' }, { id: 2, text: 'Walk dog' }]
// User deletes "Buy milk" → todos = [{ id: 2, text: 'Walk dog' }]
//
// Positional matching:
//   old index-0 = "Buy milk"  →  new index-0 = "Walk dog"
//   React sees: same type (li), same position (0) → "same thing, update in place"
//   React reuses the old <li> DOM node and just updates its text content.
//   It does NOT realize "Buy milk" was removed and "Walk dog" shifted up.
//
// Any per-item state (uncontrolled inputs, local useState, CSS transitions) attached
// to that <li>'s subtree stays attached to the POSITION, not the ITEM.
// Result: state ends up displaying against the wrong data.

// CORRECT: stable unique key from the data
function TodoListKeyed({ todos }) {
  return (
    <ul>
      {todos.map(todo => (
        <li key={todo.id}>{todo.text}</li>
      ))}
    </ul>
  )
}
// Now deleting id:1 is unambiguous:
//   React sees key "1" is gone → removes exactly that <li> DOM node.
//   Key "2" is still present → its <li> is left completely untouched.
//   No update, no re-render, any state inside survives intact.
```
::

## The Index-as-Key Trap

::code-wrapper{language="javascript" filename="index_key_trap.js"}
```javascript
import { useState } from 'react'

// ANTI-PATTERN: using array index as key for a mutable list
function EditableTodoListBad({ todos, onRemove }) {
  return (
    <ul>
      {todos.map((todo, index) => (
        <li key={index}>
          {/* Uncontrolled checkbox — its checked state lives in the DOM, not React */}
          <input type="checkbox" defaultChecked={todo.done} />
          <span>{todo.text}</span>
          <button onClick={() => onRemove(todo.id)}>Delete</button>
        </li>
      ))}
    </ul>
  )
}
// THE BUG:
// todos = [
//   { id: 1, text: 'Task A', done: true },   ← index 0, checkbox CHECKED
//   { id: 2, text: 'Task B', done: false },  ← index 1, checkbox UNCHECKED
// ]
// User deletes Task A → todos = [{ id: 2, text: 'Task B', done: false }]
//
// React matches by key=index:
//   old key=0 (Task A, checkbox checked) → new key=0 (Task B, done: false)
//   React: "same key, same type → reuse DOM node, update props"
//   The <li> DOM node is reused. The checkbox DOM node is reused.
//   defaultChecked={todo.done} = false is set, BUT defaultChecked only applies
//   on initial mount — it does NOT re-apply on reuse. The checkbox stays CHECKED
//   (from Task A) even though Task B's done is false.
//
// The checkbox visually shows the WRONG state for Task B.

// CORRECT: key by stable identity
function EditableTodoListGood({ todos, onRemove }) {
  return (
    <ul>
      {todos.map(todo => (
        <li key={todo.id}>
          <input type="checkbox" defaultChecked={todo.done} />
          <span>{todo.text}</span>
          <button onClick={() => onRemove(todo.id)}>Delete</button>
        </li>
      ))}
    </ul>
  )
}
// Deleting Task A (id:1):
//   React sees key "1" is gone → removes that <li> entirely (including its checkbox).
//   Key "2" is still present → its <li> + checkbox are untouched.
//   Checkbox state stays correctly paired with its todo. ✓
```
::

## When Index-as-Key Is Actually Safe

::code-wrapper{language="javascript" filename="index_key_safe.js"}
```javascript
// Index-as-key is safe when ALL of these hold:
// 1. The list is never reordered (no sort, no drag-and-drop)
// 2. Items are never inserted/removed except at the END
// 3. List items have NO per-item state (no uncontrolled inputs, no local useState,
//    no CSS transitions keyed to identity)

// SAFE: static navigation — never changes, no per-item state
const NAV_ITEMS = ['Home', 'About', 'Products', 'Contact']

function NavBar() {
  return (
    <nav>
      {NAV_ITEMS.map((label, index) => (
        <a key={index} href={`/${label.toLowerCase()}`}>{label}</a>
      ))}
    </nav>
  )
}

// SAFE: rendering a fixed set of columns from a static schema
function DataTable({ row, columns }) {
  return (
    <tr>
      {columns.map((col, index) => (
        <td key={index}>{row[col.field]}</td>
      ))}
    </tr>
  )
  // columns is a fixed schema that never reorders — index is stable.
}

// NEVER SAFE: any list that can be filtered, sorted, prepended, or
// have items removed from anywhere but the end.
```
::

## Key Requirements: Stable, Unique Among Siblings

::code-wrapper{language="javascript" filename="key_requirements.js"}
```javascript
import { Fragment } from 'react'

// Keys must be:
// 1. STABLE across renders — the same item must get the same key every render
// 2. UNIQUE among siblings in the same array — NOT globally unique
// 3. From the data itself (database id, UUID) — not derived at render time

// ── Sibling uniqueness, not global ──
function Dashboard({ recentOrders, recentUsers }) {
  return (
    <>
      <ul>
        {recentOrders.map(o => <li key={o.id}>Order #{o.id}</li>)}
      </ul>
      <ul>
        {recentUsers.map(u => <li key={u.id}>User #{u.id}</li>)}
      </ul>
      {/* order.id === 7 and user.id === 7 can coexist — different lists,
          independently keyed. No conflict. */}
    </>
  )
}

// ── ANTI-PATTERN: Math.random() or Date.now() as key ──
function BrokenList({ items }) {
  return (
    <ul>
      {items.map(item => (
        <li key={Math.random()}>{item.text}</li>
      ))}
    </ul>
  )
  // Every render generates entirely new keys.
  // React thinks EVERY item is brand new on EVERY render.
  // → Full unmount + remount of the entire list every single render.
  // → All per-item state destroyed (focus, scroll position, form input, transitions).
  // → Actively WORSE than no key at all.
}

// ── ANTI-PATTERN: index in the key string with sortable data ──
function UnstableKeyList({ items }) {
  return (
    <ul>
      {items.map((item, index) => (
        <li key={`${item.name}-${index}`}>{item.name}</li>
      ))}
    </ul>
  )
  // The index component makes this key unstable on reorder — same as bare index.
  // If two items share a name, the key isn't even unique. Use item.id only.
}

// ── CORRECT: key on the outermost element produced by .map() ──
function UserTable({ users }) {
  return (
    <table><tbody>
      {users.map(user => (
        <UserRow key={user.id} user={user} />
        // key goes on the element directly produced by .map() — UserRow.
      ))}
    </tbody></table>
  )
}

// ANTI-PATTERN: key on a nested element — does nothing for the list
function UserRowBad({ user }) {
  return (
    <tr>
      <td key={user.id}>{user.name}</td>
      {/* WRONG: key here does nothing for reconciliation — this <tr> is unkeyed. */}
    </tr>
  )
}

// ── Fragments with keys: multiple sibling elements per list item ──
function DefinitionList({ terms }) {
  return (
    <dl>
      {terms.map(term => (
        // The shorthand <>...</> CANNOT accept a key prop — syntax error.
        // Must use the explicit <Fragment key={...}> form.
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

## Reordering Bugs: A Deep Dive

::code-wrapper{language="javascript" filename="reordering_bugs.js"}
```javascript
import { useState } from 'react'

// A list where each item has local state (an expanding/collapsing detail panel).
// The bug: index keys cause state to "jump" to the wrong row after a sort.

function SortableListBad({ items }) {
  const [sortAsc, setSortAsc] = useState(true)
  const sorted = [...items].sort((a, b) => sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name))

  return (
    <div>
      <button onClick={() => setSortAsc(s => !s)}>Toggle Sort</button>
      <ul>
        {sorted.map((item, index) => (
          <ExpandableRow key={index} item={item} />
        ))}
      </ul>
    </div>
  )
  // After sorting, React matches by index:
  //   old index-0 (was "Alice", expanded) → new index-0 (now "Bob")
  //   React reuses Alice's ExpandableRow instance — including its expanded state.
  //   Bob now appears expanded even though the user never expanded Bob.
  //   Alice's expanded state has "jumped" to Bob's row.
}

function SortableListGood({ items }) {
  const [sortAsc, setSortAsc] = useState(true)
  const sorted = [...items].sort((a, b) => sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name))

  return (
    <div>
      <button onClick={() => setSortAsc(s => !s)}>Toggle Sort</button>
      <ul>
        {sorted.map(item => (
          <ExpandableRow key={item.id} item={item} />
        ))}
      </ul>
    </div>
  )
  // After sorting, React matches by item.id:
  //   key "alice-1" still exists → Alice's ExpandableRow (with its expanded state)
  //   is preserved and moved to its new position in the DOM.
  //   key "bob-2" still exists → Bob's ExpandableRow (collapsed) moves to its position.
  //   No state jumps. Each item's state follows the item, not the position. ✓
}

function ExpandableRow({ item }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <li>
      <button onClick={() => setExpanded(e => !e)}>
        {item.name} {expanded ? '▼' : '▶'}
      </button>
      {expanded && <div className="details">{item.details}</div>}
    </li>
  )
}
```
::

## Forcing a Remount with `key`

::code-wrapper{language="javascript" filename="force_remount.js"}
```javascript
import { useState, useEffect } from 'react'

// Deliberately CHANGING a key forces React to unmount the old instance
// and mount a brand-new one — discarding all internal state, refs, and effects.
// This is a legitimate technique when a prop change should reset component state.

// USE CASE: a profile editor that should reset its form when switching users
function ProfileManager({ userId }) {
  return (
    <ProfileForm key={userId} userId={userId} />
    // Without key: switching userId updates the SAME instance's props.
    //   → Any local draft-form state from the PREVIOUS user lingers.
    //   → useEffect dependencies fire, but useState values don't reset.
    // With key: switching userId changes the key → React unmounts the old
    //   ProfileForm entirely and mounts a fresh one → all state reset. ✓
  )
}

// USE CASE: resetting a form without clearing field-by-field
function FormResetter() {
  const [formKey, setFormKey] = useState(0)
  return (
    <div>
      <ComplexForm key={formKey} />
      <button onClick={() => setFormKey(k => k + 1)}>Reset Form</button>
      {/* Incrementing formKey remounts ComplexForm → all fields, errors,
          touched states, etc. are reset to initial values in one line. */}
    </div>
  )
}

// ANTI-PATTERN: using key change as a general-purpose "force update"
function BadForceUpdate({ data }) {
  const [renderKey, setRenderKey] = useState(0)
  // Don't do this to force a re-render when data prop changes —
  // it discards the ENTIRE subtree (DOM, state, effects) unnecessarily.
  // If a component isn't updating when props change, the real fix is usually
  // a missing/incorrect dependency array or a stale closure, not a remount.
}
```
::

## Production Patterns for Dynamic Lists

::code-wrapper{language="javascript" filename="production_patterns.js"}
```javascript
import { useState, useMemo, useCallback, useRef } from 'react'

// ── 1. Stable key generation when data lacks a natural id ──
function useStableKeys(items) {
  const keyMapRef = useRef(new Map())

  return useMemo(() => {
    const keyMap = keyMapRef.current
    const keys = items.map(item => {
      // Reuse existing key if we've seen this item reference before
      if (keyMap.has(item)) return keyMap.get(item)
      // Generate a new stable key for new items
      const key = crypto.randomUUID ? crypto.randomUUID() : `key-${keyMap.size}`
      keyMap.set(item, key)
      return key
    })
    // Clean up keys for items no longer present
    const currentSet = new Set(items)
    for (const [item] of keyMap) {
      if (!currentSet.has(item)) keyMap.delete(item)
    }
    return keys
  }, [items])
}
// Use case: items come from an external source without ids (e.g., parsed CSV rows).
// The ref-based map ensures each item reference gets a stable key across renders.

// ── 2. Virtualized list for large datasets (conceptual) ──
// Rendering 10,000 <li> elements simultaneously will freeze the browser.
// Virtualization renders only the visible window + a small overscan buffer.
// Libraries: react-window, react-virtual, @tanstack/react-virtual.

function useVirtualizedList({ itemCount, itemHeight, viewportHeight, scrollTop }) {
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - 5)  // 5 items overscan
  const visibleCount = Math.ceil(viewportHeight / itemHeight) + 10         // 10 items overscan
  const endIndex = Math.min(itemCount, startIndex + visibleCount)

  return useMemo(() => ({
    startIndex,
    endIndex,
    visibleItems: Array.from({ length: endIndex - startIndex }, (_, i) => ({
      index: startIndex + i,
      offsetTop: (startIndex + i) * itemHeight,
    })),
    totalHeight: itemCount * itemHeight,
  }), [startIndex, endIndex, itemCount, itemHeight])
}
// Keys remain critical in virtualized lists — the visible window changes as the user
// scrolls, and stable keys ensure React reuses (not remounts) items that scroll
// back into view after scrolling out and back.

// ── 3. Optimistic list updates (add/remove before server confirms) ──
function useOptimisticList(fetchItems, createItem, deleteItem) {
  const [items, setItems] = useState([])
  const [pendingOps, setPendingOps] = useState(new Set())

  const refresh = useCallback(async () => {
    setItems(await fetchItems())
  }, [fetchItems])

  const optimisticAdd = useCallback(async (newItemData) => {
    const tempId = `temp-${Date.now()}`
    const optimisticItem = { ...newItemData, id: tempId, _pending: true }
    setItems(prev => [...prev, optimisticItem])
    setPendingOps(prev => new Set([...prev, tempId]))
    try {
      const realItem = await createItem(newItemData)
      setItems(prev => prev.map(item => item.id === tempId ? realItem : item))
    } catch (err) {
      setItems(prev => prev.filter(item => item.id !== tempId))  // rollback
      throw err
    } finally {
      setPendingOps(prev => { const next = new Set(prev); next.delete(tempId); return next })
    }
  }, [createItem])

  const optimisticRemove = useCallback(async (id) => {
    const snapshot = items.find(item => item.id === id)
    setItems(prev => prev.filter(item => item.id !== id))
    try {
      await deleteItem(id)
    } catch (err) {
      if (snapshot) setItems(prev => { const next = [...prev, snapshot]; next.sort((a,b) => a.id - b.id); return next })
      throw err
    }
  }, [deleteItem, items])

  return { items, pendingOps, refresh, optimisticAdd, optimisticRemove }
}
// The tempId key ensures the optimistic item is uniquely keyed. When the server
// responds with a real id, the key changes → React unmounts the temp item and
// mounts the real one. This is the one case where a key change on the same logical
// item is intentional and correct.
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript" filename="tips.js"}
```javascript
// [Debug] "Each child in a list should have a unique key prop" warning = fix it NOW.
// It fires precisely in the scenario most likely to cause positional-identity bugs.

// [Idiom] Prefer a stable field from the data (database id, UUID) over anything
// derived at render time. `${item.name}-${index}` reintroduces instability the
// moment two items share a name or the list reorders.

// [Performance] Changing a key to force remount is cheap for small components but
// discards the ENTIRE subtree (DOM, state, effects). Use it for genuine resets,
// not as a "force update" hammer.

// [Debug] If a list item's local state "jumps" to the wrong row after delete/sort,
// suspect index-as-key before anything else. This symptom is the signature of
// positional identity mismatched against reordered data.

// [Idiom] Use <Fragment key={id}> for multiple sibling elements per list item —
// keeps DOM flat while giving reconciliation the identity it needs. The shorthand
// <>...</> cannot take a key prop.

// [Performance] For lists > 100 items, use virtualization (react-window, @tanstack/react-virtual).
// Keys remain critical — stable keys ensure scrolled-out items reuse, not remount,
// when they scroll back into view.

// [Idiom] When data lacks natural ids, use a ref-based Map to assign stable keys
// per item reference — never Math.random() or Date.now() per render.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript" filename="edge_cases.js"}
```javascript
// [Gotcha] Index-as-key silently corrupts per-item state on reorder, insert-at-start,
// or delete-from-middle. No error, no warning — uncontrolled inputs, local useState,
// and CSS transitions end up attached to the wrong data row. The hardest bug to trace
// because nothing throws — the UI just looks wrong.

// [Gotcha] key={Math.random()} is worse than no key at all. It guarantees every item
// looks brand-new on every render → full unmount/remount → loses focus, scroll position,
// all per-item state, every CSS transition restarts. A performance and UX disaster.

// [Gotcha] The shorthand <>...</> Fragment syntax CANNOT take a key prop.
// <key={id}>...</> is a syntax error. Must use <Fragment key={id}> (imported from 'react').

// [Gotcha] A key placed on an element NESTED inside a list item's returned JSX has
// NO effect on reconciliation. React only reads key off elements that are direct
// children of the array/iterable being rendered.
//   <li><span key={id}>...</span></li>  ← key on <span> is useless if <li> is the mapped element.

// [Gotcha] Keys are NOT required to be globally unique across the app — only among
// siblings in the same array. Two independent lists reusing the same key values is safe.
// Reusing the same key WITHIN one list is a bug (duplicate keys → React warns + keeps only one).

// [Gotcha] Changing a key on an item that should be preserved (e.g., keying by a value
// that changes on every update) causes unnecessary remounts. Keys should be stable for
// the lifetime of the item in the list — only change when the item's identity truly changes.

// [Gotcha] defaultChecked/defaultValue on uncontrolled inputs inside list items with
// index keys: these props only apply on MOUNT, not on reuse. After a reorder, React
// reuses the DOM node but does NOT re-apply defaultChecked → stale checkbox state.
```
::

## 🧠 Spot the Bug

A "recently viewed products" carousel lets users remove an item. After removing the first product, the wrong product's "Remove" button ends up disabled mid-animation:

::code-wrapper{language="javascript" filename="spot_the_bug.js"}
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
    setTimeout(() => onRemove(), 300)  // 300ms fade-out animation before removal
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

`ProductCard` holds local `removing` state, and the list is keyed by array `index` instead of `product.id`. Clicking "Remove" on the first product sets that instance's `removing` to `true` and starts the 300ms fade. The parent's `products` array only updates after the timeout fires. On a second quick removal before the first timeout completes: removing an earlier item shifts every subsequent item's index down by one. React matches the new index-0 element against the old index-0 `ProductCard` instance — which has `removing: true` mid-animation — and hands it the next product's data while keeping its old `removing` state. The fade-out and disabled button end up on the wrong product.

**Fix**: key by `product.id` so each `ProductCard` instance's state follows the product, not the position:

```javascript
<ProductCard key={product.id} product={product} onRemove={() => onRemove(product.id)} />
```

With stable keys, React matches by product identity — the instance with `removing: true` is correctly removed when its timeout fires, and no other product's state is affected.

</details>

## Key Takeaways

::code-wrapper{language="javascript" filename="key_takeaways.js"}
```javascript
// 1. Reconciliation diffs React element trees (not real DOM) using an O(n) heuristic:
//    different types → full teardown; same type + same position → update in place.
//    Keys correct the "same position" assumption for lists.

// 2. Without keys, React matches array children POSITIONALLY — index-0 to index-0.
//    This silently misattributes per-item DOM/state on reorder, filter, or delete-from-middle.

// 3. Index-as-key is safe ONLY for: never-reordered, only-appended/removed-from-end,
//    no-per-item-state lists (e.g., static nav). Everything else needs stable data keys.

// 4. Keys must be STABLE (same item → same key every render) and UNIQUE among siblings
//    (not globally). Source: database id, UUID. NEVER Math.random() or Date.now() per render.

// 5. Key goes on the OUTERMOST element from .map(). For multiple siblings per item,
//    use <Fragment key={id}> (not the <> shorthand, which can't take a key).

// 6. Deliberately changing a key forces a full remount + state reset — useful for
//    resetting forms on prop change, actively harmful as a "force update" hammer.

// 7. For large lists (>100 items), use virtualization. Keys remain critical —
//    stable keys ensure scrolled-out items reuse (not remount) when they return to view.
```
::