# 23 — TypeScript with React

Every example so far has been plain JavaScript. TypeScript adds a compile-time type layer on top of everything covered in chapters 1-22 — props, state, hooks, event handlers, context, and refs all become type-checked, catching an entire category of bugs (`undefined` where an object was expected, a typo'd prop name, a mismatched event handler signature) before the code ever runs. This chapter covers typing React specifically, not TypeScript generally — familiarity with basic TypeScript syntax (interfaces, generics, union types) is assumed.

## Typing Props

The most common starting point: an interface (or type alias — largely interchangeable for props, though `interface` is the more common convention) describing a component's props.

::code-wrapper{language="typescript"}
```typescript
interface ProductCardProps {
  product: {
    id: string
    name: string
    price: number
  }
  onAddToCart: (productId: string) => void
  isFeatured?: boolean // optional — the ? matters, see below
}

function ProductCard({ product, onAddToCart, isFeatured = false }: ProductCardProps) {
  return (
    <div className={isFeatured ? 'featured' : ''}>
      <h3>{product.name}</h3>
      <p>${product.price}</p>
      <button onClick={() => onAddToCart(product.id)}>Add to Cart</button>
    </div>
  )
}
```
::

`isFeatured?: boolean` and `isFeatured: boolean | undefined` look similar but mean different things to callers: the `?` form makes the prop **optional to pass at all** (omitting it entirely is valid), while the non-optional union form requires the prop to be explicitly passed, even if the value passed is `undefined`. For typical optional-with-a-default props, `?` combined with a default value in destructuring (as above) is the standard pattern.

## Typing `children`

`children` has a dedicated type, `React.ReactNode`, that covers everything React can actually render — strings, numbers, elements, arrays of elements, `null`, `undefined`, booleans (which render as nothing).

::code-wrapper{language="typescript"}
```typescript
interface CardProps {
  title: string
  children: React.ReactNode
}

function Card({ title, children }: CardProps) {
  return (
    <div className="card">
      <h2>{title}</h2>
      {children}
    </div>
  )
}
```
::

A common mistake is reaching for `JSX.Element` instead — `JSX.Element` is narrower (it excludes strings, numbers, arrays, `null`, and booleans), and using it for `children` rejects perfectly valid usages like `<Card title="Stats">{count}</Card>` where `count` is a plain number, producing a confusing type error for code that works correctly at runtime.

## Typing `useState`

For primitives and simple literals, TypeScript infers the state type automatically from the initial value — no annotation needed.

::code-wrapper{language="typescript"}
```typescript
const [count, setCount] = useState(0) // inferred as number
const [name, setName] = useState('') // inferred as string
```
::

The annotation becomes necessary the moment the initial value doesn't fully describe the type the state will eventually hold — the classic case being state that starts as `null` but will later hold an object.

::code-wrapper{language="typescript"}
```typescript
interface User {
  id: string
  name: string
  email: string
}

// Without the <User | null> annotation, TypeScript infers the type as `null`
// itself — and setUser(someRealUser) later becomes a type error, since a real
// User doesn't match a state type of exactly `null`.
const [user, setUser] = useState<User | null>(null)

// Later, TypeScript now correctly requires a null check before accessing user.name —
// this is TypeScript catching the exact bug chapter 17's loading-state examples
// guard against manually at runtime.
return user ? <p>{user.name}</p> : <Spinner />
```
::

## Typing `useReducer`

`useReducer` (chapter 10) benefits significantly from TypeScript, since a discriminated union for actions gives exhaustiveness checking — TypeScript can verify every action type is handled, and narrows `action.payload`'s type correctly per case.

::code-wrapper{language="typescript"}
```typescript
interface CartState {
  items: { id: string; quantity: number }[]
  status: 'idle' | 'checking-out' | 'error'
}

type CartAction =
  | { type: 'add-item'; payload: { id: string } }
  | { type: 'remove-item'; payload: { id: string } }
  | { type: 'set-status'; payload: { status: CartState['status'] } }

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'add-item':
      // Inside this case, TypeScript knows action.payload is { id: string } —
      // narrowed automatically from the discriminated union based on action.type
      return { ...state, items: [...state.items, { id: action.payload.id, quantity: 1 }] }
    case 'remove-item':
      return { ...state, items: state.items.filter(i => i.id !== action.payload.id) }
    case 'set-status':
      return { ...state, status: action.payload.status }
    default:
      // If a new action type is added to CartAction but a case is forgotten here,
      // this line fails to compile — `action` can't be `never` if a case was missed.
      const _exhaustive: never = action
      return state
  }
}
```
::

This exhaustiveness pattern (assigning the unhandled remainder to a variable typed `never`) turns "I added a new action type and forgot to handle it in the reducer" from a silent runtime bug into a compile error — a meaningfully stronger guarantee than the equivalent plain-JavaScript reducer offers.

## Typing Event Handlers

React re-exports its own event types (`React.ChangeEvent`, `React.MouseEvent`, `React.FormEvent`, etc.), parameterized by the DOM element type the handler is attached to — using the wrong element type produces a type error on `event.target`'s properties.

::code-wrapper{language="typescript"}
```typescript
function SearchInput() {
  const [query, setQuery] = useState('')

  // ChangeEvent<HTMLInputElement> — the generic parameter must match the actual
  // element the handler is attached to, or event.target's type is wrong
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    console.log('searching for', query)
  }

  return (
    <form onSubmit={handleSubmit}>
      <input value={query} onChange={handleChange} />
    </form>
  )
}
```
::

::code-wrapper{language="typescript"}
```typescript
// Inline handlers usually don't need an explicit annotation at all — TypeScript
// infers the event type from context (the JSX attribute the function is assigned to)
function ProductRow({ onSelect }: { onSelect: (id: string) => void }) {
  return <tr onClick={(e) => onSelect('42')} />
  // `e` here is inferred as React.MouseEvent<HTMLTableRowElement> automatically
}
```
::

Explicit event-type annotations are mainly needed for handler functions defined *outside* the JSX they're attached to (as in the `SearchInput` example) or extracted into a custom hook — inline arrow functions get their event type inferred for free from the surrounding JSX attribute.

## Typing `useRef`

`useRef` has two meaningfully different typing shapes depending on what it's used for, and mixing them up is a common source of confusion (chapter 8 covered the underlying behavior; this section covers typing it correctly).

::code-wrapper{language="typescript"}
```typescript
function TextInput() {
  // DOM ref: initialize with `null`, and the type is read-only from React's
  // perspective (you don't reassign inputRef.current yourself — React does, via the ref callback)
  const inputRef = useRef<HTMLInputElement>(null)

  function focus() {
    // Non-null assertion or an explicit check is required here — inputRef.current
    // is HTMLInputElement | null, since it's null until the DOM node actually mounts
    inputRef.current?.focus()
  }

  return <input ref={inputRef} />
}
```
::

::code-wrapper{language="typescript"}
```typescript
function Timer() {
  // Mutable value ref (chapter 8's "instance variable" use case): initialize
  // with a real value, and .current is freely mutable, non-null, by your own code
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function start() {
    intervalRef.current = setInterval(() => console.log('tick'), 1000)
  }

  function stop() {
    if (intervalRef.current !== null) clearInterval(intervalRef.current)
  }

  return <button onClick={start}>Start</button>
}
```
::

## Generic Components

A component whose prop shape should adapt to whatever data type it's given — a generic `<List>` that works for products, users, or orders alike without losing type safety — is written with a type parameter on the function itself.

::code-wrapper{language="typescript"}
```typescript
interface ListProps<T> {
  items: T[]
  renderItem: (item: T) => React.ReactNode
  keyExtractor: (item: T) => string
}

// The <T,> syntax (trailing comma) is required specifically in .tsx files —
// without it, the parser can't distinguish a generic type parameter from a JSX tag
function List<T,>({ items, renderItem, keyExtractor }: ListProps<T>) {
  return (
    <ul>
      {items.map(item => <li key={keyExtractor(item)}>{renderItem(item)}</li>)}
    </ul>
  )
}
```
::

::code-wrapper{language="typescript"}
```typescript
interface Product { id: string; name: string }

function ProductList({ products }: { products: Product[] }) {
  return (
    <List
      items={products}
      renderItem={(p) => p.name} // p is correctly inferred as Product here, no cast needed
      keyExtractor={(p) => p.id}
    />
  )
}
```
::

TypeScript infers `T` as `Product` from the `items` prop at the call site, which then correctly types `renderItem`'s and `keyExtractor`'s parameters without any explicit type argument — the same generic-inference behavior that makes `Array.prototype.map` type-safe without manually specifying its type parameter every time.

## Typing Custom Hooks

A custom hook's return type is usually worth being explicit about, especially when returning a tuple (array) — TypeScript doesn't automatically infer tuple positions from a plain array return the way it does from `useState`'s built-in tuple typing.

::code-wrapper{language="typescript"}
```typescript
function useToggle(initial = false): [boolean, () => void] {
  const [value, setValue] = useState(initial)
  const toggle = useCallback(() => setValue(v => !v), [])
  return [value, toggle] // without the explicit return type, this infers as (boolean | (() => void))[],
                          // losing the fixed positional typing a tuple provides
}
```
::

::code-wrapper{language="typescript"}
```typescript
interface UseFetchResult<T> {
  data: T | null
  status: 'loading' | 'error' | 'success'
  error: Error | null
}

function useFetch<T>(url: string): UseFetchResult<T> {
  const [state, setState] = useState<UseFetchResult<T>>({ data: null, status: 'loading', error: null })

  useEffect(() => {
    let cancelled = false
    fetch(url)
      .then(res => res.json())
      .then((data: T) => { if (!cancelled) setState({ data, status: 'success', error: null }) })
      .catch((error: Error) => { if (!cancelled) setState({ data: null, status: 'error', error }) })
    return () => { cancelled = true }
  }, [url])

  return state
}

// Usage supplies the type argument explicitly, since it can't be inferred from a URL string alone
const { data, status } = useFetch<Product[]>('/api/products')
```
::

## Common Pitfalls

**Overusing `any`** defeats the entire purpose of adopting TypeScript in the first place — it silences the type checker for that value everywhere it flows, rather than fixing the underlying typing gap. `unknown` is the safer escape hatch when a type genuinely can't be known upfront (e.g., a caught error, or `JSON.parse`'s return value) — it forces a type check or assertion before the value can be used, unlike `any`.

::code-wrapper{language="typescript"}
```typescript
// WRONG: `any` here means TypeScript won't catch it if `err` doesn't actually
// have a `.message` property — err could be a string, a number, anything at all
function handleError(err: any) {
  setErrorMessage(err.message)
}
```
::

::code-wrapper{language="typescript"}
```typescript
// RIGHT: caught errors are `unknown` in strict TypeScript configs — narrowing
// with `instanceof` is required before accessing any property, which correctly
// reflects that a thrown value in JavaScript can genuinely be anything
function handleError(err: unknown) {
  setErrorMessage(err instanceof Error ? err.message : 'An unknown error occurred')
}
```
::

**Prop drilling `React.FC`** (once a near-universal convention) is now generally discouraged by the community — it implicitly types `children` as always present even when a component never uses it, and offers no real benefit over a plain typed function. Typing props directly as a function parameter, as every example in this chapter does, is the current recommended default.

::code-wrapper{language="typescript"}
```typescript
// Discouraged: React.FC implicitly adds children to props whether the component
// uses it or not, and has awkward interactions with generics
const ProductCard: React.FC<ProductCardProps> = ({ product }) => { /* ... */ }
```
::

::code-wrapper{language="typescript"}
```typescript
// Preferred: props typed directly, children only present if explicitly declared
function ProductCard({ product }: ProductCardProps) { /* ... */ }
```
::

## 💡 Tips & Tricks

- **Idiom** — Reach for `unknown` instead of `any` whenever a type genuinely can't be known upfront (caught errors, parsed JSON, third-party data) — `unknown` forces an explicit narrowing check before use, while `any` silently disables type checking for that value everywhere it subsequently flows.
- **Idiom** — Type function components as plain functions with typed parameters rather than `React.FC<Props>` — `React.FC` implicitly adds `children` to every component's props regardless of whether it's used, and complicates generic components unnecessarily.
- **Debug** — When a generic component in a `.tsx` file throws a confusing parse error, check for a missing trailing comma in the type parameter (`<T,>` not `<T>`) — without it, the parser can't tell a generic type parameter from the start of a JSX tag.
- **Idiom** — Give `useReducer`'s action type a discriminated union and add an exhaustiveness check (`const _exhaustive: never = action` in the `default` case) — this turns "forgot to handle a newly added action type" into a compile-time error instead of a silent runtime no-op.
- **Debug** — Use `ReturnType<typeof someFunction>` for values whose type is awkward to name directly (like `setInterval`'s return value, which differs between browser and Node.js typings) rather than guessing or hardcoding `number`/`NodeJS.Timeout`.

## ⚠️ Edge Cases & Gotchas

- **`isFeatured?: boolean` and `isFeatured: boolean | undefined` are not equivalent** — the former makes the prop optional to omit entirely at the call site, while the latter requires it to be passed (even as literally `undefined`); mixing these up produces confusing "missing required prop" errors for props that were intended to be fully optional.
- **`useRef<T>(null)` for a DOM ref makes `.current` type as `T | null` forever, requiring a null check or `?.` on every access** — this isn't a typing inconvenience to work around, it's an accurate reflection that the ref genuinely is `null` until the DOM node mounts and again after it unmounts.
- **A custom hook returning a plain array literal without an explicit tuple return type infers as a union array, not a tuple** — `return [value, setValue]` without an annotation can widen to `(T | (() => void))[]`, silently losing the fixed positional typing that makes array destructuring (`const [value, setValue] = useToggle()`) actually type-safe.
- **`children: React.ReactNode` and `children: JSX.Element` are not interchangeable** — `JSX.Element` rejects valid children like plain strings, numbers, arrays of elements, or `null`, producing type errors for component usage that works correctly at runtime; `React.ReactNode` is almost always the right choice for a general-purpose `children` prop.
- **TypeScript's structural typing means two differently-named interfaces with identical shapes are considered the same type** — a `Product` and a `CartItem` interface that happen to share the exact same fields are freely interchangeable to the type checker even though they represent conceptually different things, which can mask a real bug (passing a `CartItem` where a `Product` was intended) that a nominally-typed language would catch.

## 🧠 Spot the Bug

A reducer's `default` case is meant to catch any unhandled action type at compile time, but a newly added action slips through without any error, and its intended state update silently never happens at runtime.

::code-wrapper{language="typescript"}
```typescript
type CartAction =
  | { type: 'add-item'; payload: { id: string } }
  | { type: 'remove-item'; payload: { id: string } }
  | { type: 'clear-cart' }

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'add-item':
      return { ...state, items: [...state.items, action.payload] }
    case 'remove-item':
      return { ...state, items: state.items.filter(i => i.id !== action.payload.id) }
    default:
      return state
  }
}
```
::

<details>
<summary>Answer</summary>

The `default` case just does `return state` with no exhaustiveness check at all — `action` is never assigned to a `never`-typed variable there, so TypeScript has no way to flag that `'clear-cart'` is a valid `CartAction` variant that isn't handled by any `case`. The code compiles cleanly, and at runtime, dispatching `{ type: 'clear-cart' }` silently falls through to `default` and returns the state unchanged, with no error or warning anywhere.

**The lesson**: a `default` case that merely returns the existing state provides no compile-time safety net at all — the exhaustiveness check requires assigning the narrowed-to-nothing `action` to a variable explicitly typed `never` inside `default`; if a new union member is ever added without a corresponding `case`, that assignment itself fails to compile, converting a silent runtime gap into an immediate, precise build error.

</details>

## Key Takeaways

- Props are typed with an interface or type alias; `?` on a prop makes it optional to omit, which is different from typing it as `T | undefined` (still required to pass, just possibly undefined).
- `useState`'s type is inferred from its initial value when that value fully represents the eventual type; an explicit type argument (`useState<User | null>(null)`) is needed whenever the initial value is narrower than the type state will later hold.
- Event handlers use React's generic event types (`React.ChangeEvent<HTMLInputElement>`, etc.) parameterized by the actual DOM element the handler is attached to; inline handlers usually get their event type inferred automatically from the surrounding JSX.
- `useReducer` benefits from a discriminated union action type plus an exhaustiveness check in the `default` case, turning unhandled action types into compile errors instead of silent runtime no-ops.
- Generic components (`function List<T,>(...)`) let a component's prop types adapt to whatever data it's given, with the trailing comma required specifically in `.tsx` files to disambiguate from JSX syntax.
- Prefer `unknown` over `any` for values that genuinely can't be typed upfront, and prefer plain typed function parameters over `React.FC` for component prop typing.
