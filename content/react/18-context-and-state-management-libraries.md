# 18 — Context and State Management Libraries

Chapter 7 introduced Context as the answer to prop drilling. In real applications, Context alone eventually strains under its own weight in specific, predictable ways — this chapter covers exactly where that ceiling is, and the landscape of libraries (Redux Toolkit, Zustand, Jotai) that exist beyond it.

## Where Context Alone Starts to Hurt

Context has two structural properties that are fine at small scale and genuinely limiting at large scale: **every consumer of a Context re-renders whenever that Context's value changes**, with no built-in way to subscribe to just part of it, and **there's no built-in mechanism for reading Context outside of React components** (in a utility function, an analytics call, outside the render tree).

::code-wrapper{language="javascript"}
```javascript
const AppContext = createContext(null)

function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [theme, setTheme] = useState('light')
  const [notifications, setNotifications] = useState([])

  const value = { user, setUser, theme, setTheme, notifications, setNotifications }
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

function ThemeToggle() {
  const { theme, setTheme } = useContext(AppContext)
  // This component only cares about `theme` — but it re-renders every time
  // `user` OR `notifications` changes too, since they all live in one Provider value.
  return <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>{theme}</button>
}
```
::

Every field bundled into one Context value means a change to *any* field re-renders *every* consumer of that Context, regardless of which fields they actually read — `ThemeToggle` re-renders on every new notification arriving, even though it never reads `notifications`. Splitting into multiple, narrowly-scoped Contexts (a `ThemeContext`, a `UserContext`, a `NotificationsContext`) mitigates this directly, and is often sufficient — the real ceiling appears when an app has dozens of pieces of shared state and splitting them all into individual Contexts becomes its own maintenance burden, or when render performance genuinely matters at a scale Context's coarse-grained re-rendering can't provide.

## When Context Is Still the Right Tool

It's worth being explicit that most applications never actually hit this ceiling — Context remains the right default for state that changes infrequently (theme, locale, authenticated user) or is read by relatively few components. Reaching for a state library preemptively, before Context has caused an actual, measured problem, adds a dependency and a learning curve for no real benefit.

## Redux Toolkit: Centralized, Predictable State

Redux's core idea — one global store, state changes only via dispatched actions processed by pure reducer functions — predates hooks and Context by years, and older Redux required substantial boilerplate (action type constants, action creators, switch-based reducers, manual store wiring). **Redux Toolkit** (RTK) is the modern, officially-recommended way to use Redux, and eliminates nearly all of that boilerplate.

::code-wrapper{language="javascript"}
```javascript
import { createSlice, configureStore } from '@reduxjs/toolkit'

const cartSlice = createSlice({
  name: 'cart',
  initialState: { items: [] },
  reducers: {
    addItem(state, action) {
      // RTK uses Immer internally — this LOOKS like direct mutation but produces
      // an immutable update behind the scenes. Never rely on this outside RTK's reducers.
      state.items.push(action.payload)
    },
    removeItem(state, action) {
      state.items = state.items.filter(item => item.id !== action.payload)
    },
  },
})

export const { addItem, removeItem } = cartSlice.actions

const store = configureStore({
  reducer: { cart: cartSlice.reducer },
})
```
::

::code-wrapper{language="javascript"}
```javascript
import { useSelector, useDispatch } from 'react-redux'

function CartSummary() {
  // useSelector subscribes ONLY to the slice of state this component reads —
  // a change to unrelated state elsewhere in the store does not re-render this component.
  const itemCount = useSelector(state => state.cart.items.length)
  const dispatch = useDispatch()

  return (
    <div>
      <span>{itemCount} items</span>
      <button onClick={() => dispatch(addItem({ id: 3, name: 'Widget' }))}>Add Widget</button>
    </div>
  )
}
```
::

`useSelector`'s selector-function subscription model is precisely the fine-grained re-render control Context lacks — `CartSummary` only re-renders when the specific derived value (`state.cart.items.length`) actually changes, not on every store update. Redux's other major strengths are predictability (every state change traces to a specific dispatched action, inspectable in Redux DevTools with full time-travel debugging) and a mature middleware ecosystem for side effects (RTK Query, built into Redux Toolkit, provides the same caching/refetching benefits as React Query from chapter 17, integrated directly into the store).

Redux's tradeoff is genuine, not merely historical: even with RTK's reduced boilerplate, it's still the most structurally opinionated of the three libraries covered here — actions, reducers, and a single store are non-negotiable parts of the mental model, which is a worthwhile investment for large teams needing enforced consistency and time-travel debugging, and often more ceremony than smaller apps need.

## Zustand: Minimal, Hook-Based Global State

**Zustand** takes nearly the opposite approach: a store is just a function returning state and the functions that update it, no actions, no reducers, no `Provider` wrapping the app.

::code-wrapper{language="javascript"}
```javascript
import { create } from 'zustand'

const useCartStore = create((set) => ({
  items: [],
  addItem: (item) => set(state => ({ items: [...state.items, item] })),
  removeItem: (id) => set(state => ({ items: state.items.filter(item => item.id !== id) })),
}))
```
::

::code-wrapper{language="javascript"}
```javascript
function CartSummary() {
  // Selector function here provides the same fine-grained subscription as Redux's useSelector —
  // this component re-renders ONLY when items.length specifically changes.
  const itemCount = useCartStore(state => state.items.length)
  const addItem = useCartStore(state => state.addItem)

  return (
    <div>
      <span>{itemCount} items</span>
      <button onClick={() => addItem({ id: 3, name: 'Widget' })}>Add Widget</button>
    </div>
  )
}
```
::

No `<Provider>` is needed anywhere in the tree — `useCartStore` can be imported and called directly from any component, and critically, the store's state can also be read and updated from *outside* React entirely (`useCartStore.getState().addItem(...)` works in a plain utility function, an analytics handler, or a WebSocket message listener), directly solving Context's "can't read outside components" limitation. Zustand's tradeoff is less structure: with no enforced action/reducer pattern, larger codebases need self-imposed discipline (naming conventions, splitting stores by domain) to avoid the same kind of sprawl Redux's structure prevents by construction.

## Jotai: Atomic, Bottom-Up State

**Jotai** inverts the usual "one big store" shape entirely — state is composed from many small, independent **atoms**, each an isolated unit of state that components subscribe to individually, closer in spirit to `useState` than to a global store.

::code-wrapper{language="javascript"}
```javascript
import { atom, useAtom } from 'jotai'

const cartItemsAtom = atom([])

const cartCountAtom = atom((get) => get(cartItemsAtom).length)
// A derived/computed atom — automatically recalculates and notifies subscribers
// only when cartItemsAtom actually changes, similar to useMemo but at the state layer.
```
::

::code-wrapper{language="javascript"}
```javascript
function CartSummary() {
  // Subscribing to cartCountAtom specifically means this component never re-renders
  // due to changes elsewhere that don't affect the derived item count.
  const [count] = useAtom(cartCountAtom)
  return <span>{count} items</span>
}

function AddToCartButton({ item }) {
  const [, setItems] = useAtom(cartItemsAtom)
  return <button onClick={() => setItems(prev => [...prev, item])}>Add</button>
}
```
::

Because each atom is independently subscribable, re-renders are granular by construction, without needing selector functions the way Redux/Zustand do — a component using `cartCountAtom` simply never hears about changes to unrelated atoms elsewhere in the app. Jotai's derived-atom composition (atoms computed from other atoms) also elegantly handles cross-cutting computed state that would otherwise require careful `useMemo` placement or Redux "selectors of selectors." The tradeoff is a different, less familiar mental model for teams used to a single-store view of "all the state" — reasoning about an app's total state means mentally assembling many small atoms rather than reading one shape.

## Choosing Among Context, Redux Toolkit, Zustand, and Jotai

| Situation | Reach for |
|---|---|
| Infrequently-changing, narrowly-read state (theme, locale, auth) | Context |
| Large team, need enforced structure + time-travel debugging | Redux Toolkit |
| Want global state with minimal ceremony, no Provider needed | Zustand |
| State is naturally many small independent/derived pieces | Jotai |
| Server data (API responses) regardless of the above | React Query/SWR (chapter 17) — none of these four are a substitute for a real data-fetching cache |

That last row is a genuinely common point of confusion: none of Context, Redux, Zustand, or Jotai are data-fetching solutions — they manage **client state** (UI state, form drafts, user preferences), while React Query/SWR manage **server state** (data that originates from and can go stale relative to a backend, needing caching/refetching/invalidation). Many production apps use both simultaneously: React Query for anything fetched from an API, and Zustand or Context for genuinely client-only state like "is the mobile nav open."

## A Concrete Migration: Context Ceiling to Zustand

::code-wrapper{language="javascript"}
```javascript
// Before: one big Context value, every consumer re-renders on any field change
const AppContext = createContext(null)
function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [cart, setCart] = useState([])
  const [notifications, setNotifications] = useState([])
  return (
    <AppContext.Provider value={{ user, setUser, cart, setCart, notifications, setNotifications }}>
      {children}
    </AppContext.Provider>
  )
}
```
::

::code-wrapper{language="javascript"}
```javascript
// After: three independent Zustand stores, each with its own fine-grained subscribers
const useUserStore = create((set) => ({ user: null, setUser: (user) => set({ user }) }))
const useCartStore = create((set) => ({ cart: [], setCart: (cart) => set({ cart }) }))
const useNotificationStore = create((set) => ({
  notifications: [],
  add: (n) => set(state => ({ notifications: [...state.notifications, n] })),
}))

// No <Provider> needed anywhere — components import and call these hooks directly.
function ThemeToggle() {
  // Reads NOTHING from cart or notifications — genuinely never re-renders on their changes.
  const user = useUserStore(state => state.user)
  return <span>{user?.name}</span>
}
```
::

The migration's real payoff isn't merely swapping syntax — it's that each store is now independently subscribable, removing both of Context's structural limitations (coarse re-renders, no non-component access) in one step, without introducing Redux's action/reducer ceremony.

## 💡 Tips & Tricks

- **Idiom** — Split one large Context into several narrowly-scoped ones before reaching for an external library — this alone fixes the "every consumer re-renders on any change" problem for many apps, at zero added dependencies.
- **Idiom** — Keep server data (anything from an API) in React Query/SWR and genuinely client-only state (modal open/closed, form drafts, theme) in Context/Zustand/Jotai — mixing the two into one system tends to reinvent a worse version of whichever data-fetching library you're avoiding.
- **Debug** — In Zustand, always pass a selector function (`useCartStore(state => state.items.length)`) rather than destructuring the whole store (`const { items } = useCartStore()`) — the latter subscribes the component to every field, quietly reintroducing Context's coarse-re-render problem inside a library designed to avoid it.
- **Idiom** — Reach for Redux Toolkit specifically when a team needs enforced action/reducer structure and time-travel debugging across a large codebase with many contributors — its ceremony is a feature (consistency at scale), not merely legacy weight, in that specific context.
- **Idiom** — Jotai's derived atoms are usually a cleaner solution than a `useMemo` reading from multiple Context values for cross-cutting computed state — consider it specifically when an app's shared state is naturally composed of many small, independently-updated pieces rather than one large shape.

## ⚠️ Edge Cases & Gotchas

- **A single Context bundling many unrelated fields re-renders every consumer on any field's change, even ones a component never reads** — this is the single most common real-world Context performance complaint, and splitting into multiple Contexts (not necessarily abandoning Context altogether) is usually the correct first fix.
- **Redux Toolkit's `state.items.push(...)`-looking reducer code is not actually a mutation** — it works only because RTK wraps reducers in Immer, which intercepts the apparent mutation and produces an immutable update behind the scenes; writing the same "mutating" code in a plain `useState` updater function or outside an RTK reducer would be a real, broken mutation (chapter 4).
- **Zustand's `create()` returning a hook means the store is a true singleton across the whole app by default** — unlike `useState`, which gives each component instance independent state, all components calling `useCartStore()` share the exact same store; this is usually desired for global state but is a common point of confusion for developers expecting per-component isolation.
- **Context has no way to read or update its value outside of a React component's render** — Redux, Zustand, and Jotai all provide non-hook APIs (`store.getState()`, `useCartStore.getState()`) precisely to close this gap, useful for reading state from a WebSocket handler, analytics call, or plain utility function.
- **None of Context, Redux, Zustand, or Jotai include caching, refetching, or staleness logic for server data** — using any of them to store API responses directly reproduces the race conditions and stale-data problems from chapter 17 that data-fetching libraries specifically solve; keep server state and client state in separate systems.

## 🧠 Spot the Bug

A settings page's `ThemeToggle` button is reported as "laggy" — clicking it takes a visibly long moment to respond, even though toggling a theme should be instantaneous.

::code-wrapper{language="javascript"}
```javascript
const AppContext = createContext(null)

function AppProvider({ children }) {
  const [theme, setTheme] = useState('light')
  const [searchResults, setSearchResults] = useState([])

  useEffect(() => {
    const id = setInterval(() => {
      fetchLiveSearchResults().then(setSearchResults)
    }, 200)
    return () => clearInterval(id)
  }, [])

  return (
    <AppContext.Provider value={{ theme, setTheme, searchResults }}>
      {children}
    </AppContext.Provider>
  )
}

function ThemeToggle() {
  const { theme, setTheme } = useContext(AppContext)
  return (
    <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  )
}
```
::

<details>
<summary>Answer</summary>

`searchResults` updates every 200ms from a polling effect, and it lives in the *same* Context value object as `theme`. Every 200ms, the Provider re-renders with a new `value` object (a new object reference every time, even if `theme` itself hasn't changed), and because Context has no field-level subscription granularity, `ThemeToggle` — which reads only `theme` — re-renders every single time too, 5 times a second, regardless of whether the user ever touches it. The perceived "lag" on click is really the button competing with a constant background re-render churn, and any actual work in `ThemeToggle`'s render or nearby components compounds visibly.

**The lesson**: state that changes at very different frequencies (a slow-changing `theme` and a fast-polling `searchResults`) should never share one Context value — splitting them into separate Contexts (or moving the fast-changing one to Zustand/Jotai with field-level subscriptions) stops components that only care about the slow-changing field from re-rendering on every fast-changing update.

</details>

## Key Takeaways

- Context's two structural limits are coarse-grained re-rendering (every consumer re-renders on any value change) and no built-in way to read/update state outside React components — both are fine at small scale and genuinely limiting at large scale.
- Splitting one large Context into several narrowly-scoped ones is often sufficient and should be tried before adopting an external library.
- Redux Toolkit offers enforced structure (actions/reducers), fine-grained `useSelector` subscriptions, and mature DevTools/middleware, at the cost of more ceremony than smaller apps typically need.
- Zustand offers global state with minimal ceremony, no Provider requirement, and access from outside React entirely — but requires self-imposed discipline without Redux's enforced structure.
- Jotai composes state from small, independent (and derivable) atoms, giving fine-grained subscriptions by construction, at the cost of a less familiar "many small pieces" mental model versus one big store.
- None of these four solutions replace a data-fetching library — server state (API data, needing caching/invalidation/refetch) belongs in React Query/SWR; these four manage client-only state.
