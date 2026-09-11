---
title: "02 — JSX Deep Dive"
description: "JSX compilation to createElement, expression embedding rules, conditional rendering patterns, fragments, spread pitfalls, and the key prop's role in reconciliation. Code-first reference for mid-to-senior React engineers."
---

# 02 — JSX Deep Dive

## JSX → React.createElement

::code-wrapper{language="javascript" filename="jsx_to_createelement.js"}
```javascript
// JSX is syntactic sugar for React.createElement. The compiler (Babel/SWC)
// transforms it at build time — JSX never reaches the browser.

// WHAT YOU WRITE:
const greeting = <h1 className="title" id="main">Hello, {name}!</h1>

// WHAT THE COMPILER PRODUCES:
const greeting = React.createElement(
  'h1',                          // type: string (DOM) | function (component) | symbol (fragment)
  { className: 'title', id: 'main' },  // props object
  'Hello, ',                     // children...
  name,
  '!'
)

// WHICH BECOMES THIS OBJECT:
// {
//   type: 'h1',
//   props: { className: 'title', id: 'main', children: ['Hello, ', name, '!'] },
//   key: null,
//   ref: null,
//   $$typeof: Symbol.for('react.element')
// }

// Knowing this explains WHY:
// - You can store JSX in variables: const el = <div/>  (it's just an object)
// - You can pass JSX as props: <Card header={<h1>Title</h1>} />
// - You can return JSX from functions: getIcon(name) → <svg/>
// - You can't use if/for/switch INSIDE JSX — they're statements, not expressions
```
::

## Expression Embedding Rules

::code-wrapper{language="javascript" filename="expression_embedding.js"}
```javascript
// {} in JSX evaluates a SINGLE EXPRESSION — anything that returns a value.
// You CANNOT put STATEMENTS (if, for, switch, const) inside {}.

// VALID — expressions:
<div>{2 + 2}</div>                    // arithmetic
<div>{condition ? 'yes' : 'no'}</div>  // ternary
<div>{user?.name || 'Anonymous'}</div> // optional chaining + fallback
<div>{items.map(i => <li key={i.id}>{i.name}</li>)}</div>  // .map() returns array
<div>{<Child />}</div>                 // JSX is an expression (it's just an object)

// INVALID — statements (these throw syntax errors):
// <div>{ if (x) { return 'yes' } }</div>          // if is a statement
// <div>{ for (let i of items) { ... } }</div>     // for is a statement
// <div>{ const val = compute(); val }</div>       // const is a statement

// WORKAROUND for conditionals inside JSX: ternary or &&
<div>{show && <Modal/>}</div>
// WORKAROUND for loops: .map() (it returns an array of elements)
<div>{items.map(item => <Row key={item.id} {...item} />)}</div>
// WORKAROUND for complex logic: IIFE or extract to a variable/function
const content = (() => {
  if (loading) return <Spinner/>
  if (error) return <ErrorMessage error={error}/>
  return <DataView data={data}/>
})()
return <div>{content}</div>
```
::

## Conditional Rendering: Patterns and Gotchas

::code-wrapper{language="javascript" filename="conditional_gotchas.js"}
```javascript
// ANTI-PATTERN: && with numeric values renders 0
function Cart({ count }) {
  return <div>{count && <Badge count={count} />}</div>
  // When count === 0: renders "0" on screen! 0 is falsy but React renders it.
  // && returns the LEFT operand if it's falsy — so 0 && <Badge/> → 0
  // React renders numbers (including 0) as text. Only null, undefined, false,
  // and true are ignored by React's renderer.
}

// FIX: use a boolean check or ternary
function Cart({ count }) {
  return <div>{count > 0 && <Badge count={count} />}</div>  // count > 0 → true/false
  // OR: {count > 0 ? <Badge count={count} /> : null}
}

// GOTCHA: empty string "" is rendered by React (it's a valid child)
// null, undefined, false, true → NOT rendered (ignored)
// 0, "" → rendered as text
```
::

::code-wrapper{language="javascript" filename="conditional_patterns.js"}
```javascript
// PRODUCTION PATTERN: extract complex conditionals for readability

function UserMenu({ user, isLoading, isError }) {
  // Each branch is a clean expression — no nested ternaries that are hard to read
  if (isLoading) return <Spinner />
  if (isError) return <ErrorMessage />
  if (!user) return <LoginButton />

  return <ProfileDropdown user={user} />

  // Early returns OUTSIDE JSX are cleaner than nested ternaries INSIDE JSX.
  // Use ternaries for simple 2-way choices within JSX, early returns for
  // multi-branch or guard-clause logic.
}
```
::

## Fragments: Grouping Without Extra DOM

::code-wrapper{language="javascript" filename="fragments.js"}
```javascript
import { Fragment } from 'react'

// PROBLEM: a component must return a single root element, but you don't want
// to add an extra <div> that breaks CSS (flexbox/grid) or semantics.

// SHORT SYNTAX (no key support):
function Columns() {
  return (
    <>
      <td>Hello</td>
      <td>World</td>
    </>
  )
}
// Compiles to React.createElement(React.Fragment, null, ...)

// EXPLICIT SYNTAX (supports key — needed in lists):
function DefinitionList({ terms }) {
  return terms.map(([term, def]) => (
    <Fragment key={term}>
      <dt>{term}</dt>
      <dd>{def}</dd>
    </Fragment>
  ))
}
// The short <> syntax CANNOT take a key prop — use <Fragment key={...}> in lists.
// React won't warn about missing keys if you use <> — but it won't be able to
// reconcile items correctly either. Always use explicit Fragment with key in lists.
```
::

## Spread Attributes: Powerful, Dangerous

::code-wrapper{language="javascript" filename="spread_pitfalls.js"}
```javascript
// CONVENIENT: forward all props to a child
function Button({ variant, ...rest }) {
  return <button className={`btn btn-${variant}`} {...rest} />
  // rest = all props except variant — className, onClick, disabled, type, etc.
}

// ANTI-PATTERN: spreading unknown props breaks explicit contracts
function UserCard({ name, email, ...unknownProps }) {
  // unknownProps could contain ANYTHING — including props UserCard shouldn't receive
  return <div {...unknownProps}>  // ← div now has arbitrary attributes
    <h3>{name}</h3>
    <p>{email}</p>
  </div>
}
// If someone passes <UserCard onClick={...} />, the div gets an onClick —
// probably not intended. Explicit is safer:
function UserCard({ name, email, onClick }) {
  return <div onClick={onClick}>...</div>  // only what you intend
}

// GOTCHA: spread overrides earlier props — order matters
<input type="text" {...props} />  // props.type overrides "text" if present
<input {...props} type="text" />  // type="text" always wins (last wins)
```
::

## Inline Object Literals and Re-render Traps

::code-wrapper{language="javascript" filename="inline_object_renders.js"}
```javascript
// ANTI-PATTERN: inline object/array literals create NEW references every render
function Parent({ data }) {
  return <Child
    config={{ theme: 'dark', size: 'lg' }}  // ← new object every render
    items={[1, 2, 3]}                        // ← new array every render
    style={{ color: 'red' }}                 // ← new object every render
  />
}
// If Child is React.memo'd, the memo BREAKS — new object/array reference every
// render means shallow comparison fails, Child re-renders every time.
// These literals also break useEffect/useCallback dependency arrays (Ch 6, 9).

// FIX: hoist stable references outside the component or use useMemo
const STATIC_CONFIG = { theme: 'dark', size: 'lg' }  // module-level constant
const STATIC_ITEMS = [1, 2, 3]

function Parent({ data }) {
  return <Child config={STATIC_CONFIG} items={STATIC_ITEMS} />
}
// Now the references are stable — React.memo on Child works correctly.
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript" filename="tips.js"}
```javascript
// [Idiom] JSX is just an object — you can store it, pass it, return it from
// functions. Use this to build render helpers without creating components:
// const icon = isLoading ? <Spinner/> : <CheckIcon/>

// [Idiom] Use early returns for guard clauses instead of deep nesting.
// if (!data) return null is cleaner than {data && <div>...</div>} for multi-line.

// [Performance] Hoist stable object/array literals to module scope to avoid
// breaking React.memo on children. Every inline {{...}} creates a new reference.

// [Debug] If a number "0" appears unexpectedly in your UI, check for
// {count && <Component/>} — use {count > 0 && <Component/>} instead.

// [Idiom] <Fragment key={...}> is required when mapping to multiple sibling
// elements per item. The short <> syntax can't take a key.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript" filename="edge_cases.js"}
```javascript
// [Gotcha] && with 0 renders "0" on screen. 0 is falsy but React renders numbers.
// Fix: {count > 0 && <Badge/>} or {count ? <Badge/> : null}

// [Gotcha] Empty string "" is rendered by React. null, undefined, false, true
// are NOT rendered. If you conditionally render an empty string for "hide",
// it still takes up space in some layouts. Use null instead.

// [Gotcha] Spread {...props} overrides earlier explicit props if it comes AFTER
// them. Put spread FIRST if you want explicit props to win, LAST if spread wins.

// [Gotcha] You can't use if/for/while/switch inside {} — they're statements.
// Use ternary, &&, .map(), or extract to a variable/function.

// [Gotcha] JSX comments ({/* */}) are NOT regular HTML comments (<!-- -->).
// HTML comments inside JSX are treated as text and rendered to the DOM.
// Always use {/* comment */} for JSX comments.
```
::

## 🧠 Spot the Bug

A developer renders a list of products but sees a React warning: "Each child in a list should have a unique key prop." The code looks correct:

::code-wrapper{language="javascript" filename="spot_the_bug.js"}
```javascript
function ProductList({ products }) {
  return (
    <div>
      {products.map(product => (
        <>
          <h3>{product.name}</h3>
          <p>{product.price}</p>
        </>
      ))}
    </div>
  )
}
```
::

<details>
<summary>Answer</summary>

The fragment uses the short `<>` syntax, which **cannot accept a `key` prop**. When mapping to fragments, you must use the explicit `<Fragment key={...}>` form:

```javascript
import { Fragment } from 'react'

function ProductList({ products }) {
  return (
    <div>
      {products.map(product => (
        <Fragment key={product.id}>
          <h3>{product.name}</h3>
          <p>{product.price}</p>
        </Fragment>
      ))}
    </div>
  )
}
```

Without a key on the fragment, React can't track which `<h3>+<p>` pair corresponds to which product during reconciliation — adding/removing/reordering products will cause incorrect DOM updates.

</details>

## Key Takeaways

::code-wrapper{language="javascript" filename="key_takeaways.js"}
```javascript
// 1. JSX compiles to React.createElement() → plain element objects. It's an
//    expression, so you can store it, pass it, return it from functions.

// 2. {} evaluates ONE expression — no statements (if/for/switch). Use ternary,
//    &&, .map(), or extract to a variable/function for complex logic.

// 3. {count && <X/>} renders "0" when count is 0 — use {count > 0 && <X/>}.
//    React renders 0 and "" as text; ignores null, undefined, false, true.

// 4. Fragments group siblings without extra DOM. Use <Fragment key={...}> in
//    lists — the short <> syntax can't take a key prop.

// 5. Inline object/array literals ({{...}} and {[...]}) create new references
//    every render → breaks React.memo, useEffect deps, useCallback deps.
//    Hoist stable values to module scope or use useMemo.
```
::
