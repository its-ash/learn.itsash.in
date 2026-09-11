---
title: "18 — Context & State Management Libraries"
description: "When Context is enough and when it strains, comparison of Zustand/Redux Toolkit/Jotai, server state vs client state, concrete migration from Context to Zustand, Redux Toolkit basic example, Jotai atomic state, and choosing the right tool. Code-first reference for mid-to-senior React engineers."
---

# 18 — Context & State Management Libraries

## Where Context Alone Starts to Hurt

::code-wrapper{language="javascript" filename="context_ceiling.js"}
```javascript
// Context has two structural properties fine at small scale and genuinely
// limiting at large scale:
//   1. Every consumer re-renders whenever the Context's value changes — no
//      built-in way to subscribe to just PART of it.
//   2. No mechanism for reading/updating Context outside React components
//      (in a utility function, an analytics call, a WebSocket handler).

const AppContext = createContext(null)

function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [theme, setTheme] = useState('light')
  const [notifications, setNotifications] = useState([])

  // Every time ANY of these changes, the Provider re-renders with a new value
  // object → EVERY consumer re-renders, even ones that only read `theme`.
  const value = { user, setUser, theme, setTheme, notifications, setNotifications }
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

function ThemeToggle() {
  const { theme, setTheme } = useContext(AppContext)
  // This component ONLY cares about `theme` — but it re-renders every time
  // `user` OR `notifications` changes too, since they all live in one Provider
  // value. A new notification arriving triggers a ThemeToggle re-render.
  return <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>{theme}</button>
}
```
::

### Fix 1: Split Into Multiple Contexts

::code-wrapper{language="javascript" filename="split_contexts.js"}
```javascript
// The FIRST fix before reaching for a library: split one large Context into
// several narrowly-scoped ones. This alone fixes the "every consumer re-renders
// on any change" problem for many apps, at zero added dependencies.

const ThemeContext = createContext(null)
const UserContext = createContext(null)
const NotificationContext = createContext(null)

function AppProvider({ children }) {
  return (
    <ThemeContext.Provider value={useState('light')}>
      <UserContext.Provider value={useState(null)}>
        <NotificationContext.Provider value={useState([])}>
          {children}
        </NotificationContext.Provider>
      </UserContext.Provider>
    </ThemeContext.Provider>
  )
}

function ThemeToggle() {
  const [theme, setTheme] = useContext(ThemeContext)
  // Now ONLY re-renders when theme changes — user and notification changes
  // don't affect this component at all.
  return <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>{theme}</button>
}
```
::

### Fix 2: Split Value + Setter Contexts

::code-wrapper{language="javascript" filename="value_setter_split.js"}
```javascript
// Even within a single domain, the VALUE changes frequently but the SETTER
// never changes (it's a stable function). Splitting them means components that
// only use the setter don't re-render when the value changes.

const ThemeValueContext = createContext('light')
const ThemeSetterContext = createContext(() => {})

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light')
  // setTheme from useState is stable — it never changes between renders.
  // So ThemeSetterContext consumers never re-render.
  return (
    <ThemeValueContext.Provider value={theme}>
      <ThemeSetterContext.Provider value={setTheme}>
        {children}
      </ThemeSetterContext.Provider>
    </ThemeValueContext.Provider>
  )
}

// A component that only SETS the theme (never reads it) won't re-render on
// theme changes:
function DarkModeToggle() {
  const setTheme = useContext(ThemeSetterContext)
  return <button onClick={() => setTheme('dark')}>Go Dark</button>
}

// A component that READS the theme re-renders only when theme changes:
function ThemedCard() {
  const theme = useContext(ThemeValueContext)
  return <div className={`card card-${theme}`}>Content</div>
}
```
::

### Fix 3: Context + External Store (useSyncExternalStore)

::code-wrapper{language="javascript" filename="context_external_store.js"}
```javascript
// For fine-grained subscriptions without a library, use useSyncExternalStore
// (React 18+) to let consumers subscribe to only the slice they need.

import { useSyncExternalStore, createContext, useContext } from 'react'

// An external store with subscribe + getSnapshot:
function createStore(initialState) {
  let state = initialState
  const listeners = new Set()
  return {
    getState: () => state,
    setState: (updater) => {
      state = typeof updater === 'function' ? updater(state) : updater
      listeners.forEach(l => l())
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

const store = createStore({ user: null, theme: 'light', notifications: [] })
const StoreContext = createContext(null)

function StoreProvider({ children }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

// Consumer subscribes to a SLICE — re-renders only when that slice changes:
function ThemeToggle() {
  const store = useContext(StoreContext)
  // useSyncExternalStore subscribes to the store, but only re-renders this
  // component when the return value of getSnapshot changes (by reference).
  const theme = useSyncExternalStore(
    store.subscribe,
    () => store.getState().theme,  // selector — only re-renders when theme changes
  )
  return <button onClick={() => store.setState(s => ({ ...s, theme: s.theme === 'light' ? 'dark' : 'light' }))}>{theme}</button>
}
```
::

## When Context Is Still the Right Tool

::code-wrapper{language="javascript" filename="context_enough.js"}
```javascript
// Most applications NEVER hit the Context ceiling. Context remains the right
// default for:
// - Infrequently-changing state (theme, locale, authenticated user)
// - State read by relatively few components
// - App-wide configuration that rarely updates
// - Dependency injection (providing a service/client to deep children)

// Reaching for a state library PREEMPTIVELY, before Context has caused an
// actual, measured problem, adds a dependency and a learning curve for no
// real benefit. Context + splitting is often enough.

// GOOD Context use cases:
const ThemeContext = createContext('light')           // changes rarely
const LocaleContext = createContext('en-US')           // changes rarely
const AuthUserContext = createContext(null)            // changes on login/logout only
const ApiClientContext = createContext(null)           // never changes (DI)
const RouterContext = createContext(null)              // framework-provided

// BAD Context use cases (use a state library instead):
// - A notification system that fires updates every few seconds
// - A shopping cart that changes on every user interaction
// - Search results that update on every keystroke
// - Form state with many fields updating rapidly
// - Any state that needs to be read/updated outside React components
```
::

## Zustand: Minimal, Hook-Based Global State

::code-wrapper{language="javascript" filename="zustand_basic.js"}
```javascript
// Zustand takes nearly the opposite approach from Redux: a store is just a
// function returning state and the functions that update it — no actions, no
// reducers, no Provider wrapping the app.

import { create } from 'zustand'

const useCartStore = create((set, get) => ({
  items: [],
  addItem: (item) => set(state => ({ items: [...state.items, item] })),
  removeItem: (id) => set(state => ({ items: state.items.filter(item => item.id !== id) })),
  clearCart: () => set({ items: [] }),
  // `get` lets you read current state without subscribing to it:
  getTotalPrice: () => get().items.reduce((sum, item) => sum + item.price, 0),
}))

// No <Provider> needed anywhere — useCartStore can be imported and called
// directly from any component. The store is a singleton across the whole app.

function CartSummary() {
  // Selector function provides fine-grained subscription — this component
  // re-renders ONLY when items.length specifically changes, not on other changes.
  const itemCount = useCartStore(state => state.items.length)
  const addItem = useCartStore(state => state.addItem)

  return (
    <div>
      <span>{itemCount} items</span>
      <button onClick={() => addItem({ id: 3, name: 'Widget', price: 9.99 })}>Add Widget</button>
    </div>
  )
}

// CRITICAL: Zustand state can be read and updated from OUTSIDE React entirely:
function handleWebSocketMessage(message) {
  if (message.type === 'cart_update') {
    useCartStore.getState().addItem(message.item)  // no hook, no component
  }
}

// This directly solves Context's "can't read outside components" limitation.
```
::

### Zustand Anti-Pattern: Destructuring Without a Selector

::code-wrapper{language="javascript" filename="zustand_antipattern.js"}
```javascript
// ANTI-PATTERN: destructuring the whole store subscribes the component to
// EVERY field — quietly reintroducing Context's coarse-re-render problem
// inside a library designed to avoid it.

function BadCartSummary() {
  const { items, addItem, removeItem, clearCart } = useCartStore()
  // This component re-renders when ANY field in the store changes, even ones
  // it never uses. Exactly the problem you switched from Context to avoid.
  return <div>{items.length} items</div>
}

// CORRECT: use a selector for each piece of state you need:
function GoodCartSummary() {
  const items = useCartStore(state => state.items)
  const addItem = useCartStore(state => state.addItem)
  return <div>{items.length} items</div>
}

// Or use useShallow (Zustand 4.4+) to subscribe to multiple fields with
// shallow equality comparison:
import { useShallow } from 'zustand/react/shallow'

function CartSummary() {
  const { items, addItem } = useCartStore(useShallow(state => ({
    items: state.items,
    addItem: state.addItem,
  })))
  // Only re-renders when the shallow comparison of { items, addItem } changes
  // — addItem is stable (never changes), so this re-renders only when items changes.
  return <div>{items.length} items</div>
}
```
::

### Zustand with Middleware (Persistence)

::code-wrapper{language="javascript" filename="zustand_persistence.js"}
```javascript
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      token: null,
      login: (user, token) => set({ user, token }),
      logout: () => set({ user: null, token: null }),
    }),
    {
      name: 'auth-storage',  // localStorage key
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ token: state.token }),  // only persist token, not user
    }
  )
)

// The store automatically hydrates from localStorage on app load and persists
// on every change. No manual useEffect + localStorage boilerplate.
```
::

## Redux Toolkit: Centralized, Predictable State

::code-wrapper{language="javascript" filename="redux_toolkit.js"}
```javascript
// Redux's core idea: one global store, state changes only via dispatched actions
// processed by pure reducer functions. Redux Toolkit (RTK) is the modern,
// officially-recommended way — eliminates nearly all legacy Redux boilerplate.

import { createSlice, configureStore, useSelector, useDispatch } from '@reduxjs/toolkit'

const cartSlice = createSlice({
  name: 'cart',
  initialState: { items: [] },
  reducers: {
    addItem(state, action) {
      // RTK uses Immer internally — this LOOKS like direct mutation but produces
      // an immutable update behind the scenes. NEVER rely on this outside RTK's
      // reducers — in a plain useState updater, this would be a real broken mutation.
      state.items.push(action.payload)
    },
    removeItem(state, action) {
      state.items = state.items.filter(item => item.id !== action.payload)
    },
    clearCart(state) {
      state.items = []
    },
  },
})

export const { addItem, removeItem, clearCart } = cartSlice.actions

const store = configureStore({
  reducer: { cart: cartSlice.reducer },
})

// Provider wraps the app (unlike Zustand, Redux requires a Provider):
// <Provider store={store}><App /></Provider>

function CartSummary() {
  // useSelector subscribes ONLY to the slice of state this component reads —
  // a change to unrelated state elsewhere in the store does NOT re-render this.
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

### Redux Toolkit: Async Thunks

::code-wrapper{language="javascript" filename="rtk_thunks.js"}
```javascript
import { createAsyncThunk } from '@reduxjs/toolkit'

// createAsyncThunk handles the pending/fulfilled/rejected lifecycle automatically:
export const fetchProducts = createAsyncThunk('products/fetch', async () => {
  const res = await fetch('/api/products')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
})

const productsSlice = createSlice({
  name: 'products',
  initialState: { items: [], status: 'idle', error: null },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchProducts.pending, (state) => {
        state.status = 'loading'
      })
      .addCase(fetchProducts.fulfilled, (state, action) => {
        state.status = 'success'
        state.items = action.payload
      })
      .addCase(fetchProducts.rejected, (state, action) => {
        state.status = 'error'
        state.error = action.error.message
      })
  },
})

// Dispatch the thunk from a component:
function ProductList() {
  const { items, status, error } = useSelector(state => state.products)
  const dispatch = useDispatch()

  useEffect(() => {
    if (status === 'idle') dispatch(fetchProducts())
  }, [status, dispatch])

  if (status === 'loading') return <Spinner />
  if (status === 'error') return <ErrorMessage error={error} />
  return <ul>{items.map(p => <li key={p.id}>{p.name}</li>)}</ul>
}
```
::

### Redux Toolkit Query (RTK Query)

::code-wrapper{language="javascript" filename="rtk_query.js"}
```javascript
// RTK Query is built into Redux Toolkit and provides the same caching/refetching
// benefits as React Query, integrated directly into the Redux store.

import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

const productsApi = createApi({
  reducerPath: 'productsApi',
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  endpoints: (builder) => ({
    getProducts: builder.query({ query: () => 'products' }),
    getProduct: builder.query({ query: (id) => `products/${id}` }),
    addProduct: builder.mutation({
      query: (body) => ({ url: 'products', method: 'POST', body }),
    }),
  }),
})

export const { useGetProductsQuery, useGetProductQuery, useAddProductMutation } = productsApi

const store = configureStore({
  reducer: {
    [productsApi.reducerPath]: productsApi.reducer,
    // ...other slices
  },
  middleware: (getDefault) => getDefault().concat(productsApi.middleware),
})

function ProductList() {
  const { data, isLoading, error } = useGetProductsQuery()
  if (isLoading) return <Spinner />
  if (error) return <ErrorMessage error={error} />
  return <ul>{data.map(p => <li key={p.id}>{p.name}</li>)}</ul>
}
```
::

## Jotai: Atomic, Bottom-Up State

::code-wrapper{language="javascript" filename="jotai_basic.js"}
```javascript
// Jotai inverts the "one big store" shape: state is composed from many small,
// independent ATOMS, each an isolated unit of state that components subscribe
// to individually — closer in spirit to useState than to a global store.

import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai'

const cartItemsAtom = atom([])

// A derived/computed atom — automatically recalculates and notifies subscribers
// only when cartItemsAtom actually changes. Like useMemo but at the state layer.
const cartCountAtom = atom((get) => get(cartItemsAtom).length)
const cartTotalAtom = atom((get) =>
  get(cartItemsAtom).reduce((sum, item) => sum + item.price, 0)
)

function CartSummary() {
  // Subscribing to cartCountAtom means this component never re-renders due to
  // changes elsewhere that don't affect the derived item count.
  const [count] = useAtom(cartCountAtom)
  return <span>{count} items</span>
}

function CartTotal() {
  const total = useAtomValue(cartTotalAtom)  // read-only subscription
  return <span>${total.toFixed(2)}</span>
}

function AddToCartButton({ item }) {
  const setItems = useSetAtom(cartItemsAtom)  // write-only, no subscription to value
  return <button onClick={() => setItems(prev => [...prev, item])}>Add</button>
}
```
::

### Jotai: Derived Atoms and Async

::code-wrapper{language="javascript" filename="jotai_advanced.js"}
```javascript
import { atom, useAtom } from 'jotai'

// Async derived atom — Jotai handles the suspense automatically:
const userAtom = atom(null)
const userPostsAtom = atom(async (get) => {
  const user = get(userAtom)
  if (!user) return []
  const res = await fetch(`/api/users/${user.id}/posts`)
  return res.json()
})

function UserPosts() {
  const [posts] = useAtom(userPostsAtom)
  // The component suspends while the async atom resolves — wrap in <Suspense>.
  return <ul>{posts.map(p => <li key={p.id}>{p.title}</li>)}</ul>
}

// Atom with write-only side effects:
const addToCartAtom = atom(null, (get, set, item) => {
  const items = get(cartItemsAtom)
  set(cartItemsAtom, [...items, item])
  // Can update MULTIPLE atoms in one write — atomic update across atoms:
  set(lastAddedItemAtom, item)
  set(cartModifiedAtAtom, Date.now())
})
```
::

## Comparison Table: Context vs Zustand vs Redux Toolkit vs Jotai

::code-wrapper{language="javascript" filename="comparison.js"}
```javascript
// | Feature                | Context           | Zustand          | Redux Toolkit       | Jotai              |
// |------------------------|-------------------|------------------|---------------------|--------------------|
// | Provider required?     | Yes               | No               | Yes                 | Optional           |
// | Bundle size            | 0 (built-in)      | ~1KB             | ~12KB               | ~3KB               |
// | Boilerplate            | Low               | Very low         | Medium (RTK reduces)| Low                |
// | Fine-grained subs      | No (all-or-noth)  | Yes (selectors)  | Yes (useSelector)   | Yes (per-atom)     |
// | Read outside React     | No                | Yes (getState)   | Yes (store.getState)| Yes (store.get)    |
// | DevTools/time-travel   | No                | Yes (middleware) | Yes (excellent)     | Yes (limited)      |
// | Mental model           | DI + prop avoid   | Hook + singleton | Actions + reducers  | Atoms (bottom-up)  |
// | Derived state          | Manual useMemo    | Manual selectors | Reselect (selectors)| Built-in (atoms)   |
// | Async/side effects     | Manual (useEffect)| Manual           | createAsyncThunk    | Async atoms        |
// | Middleware ecosystem   | N/A               | persist/immer    | RTK Query, listener | Limited            |
// | Best for               | Infreq-changing   | Minimal ceremony | Large teams/struct  | Many small pieces  |
// | Learning curve         | Lowest            | Low              | Medium              | Low-medium         |
// | State outside React    | Impossible        | Trivial          | Trivial             | Trivial            |
// | Testing                | renderWithProvider| Direct store     | Direct store        | Direct store       |
```
::

## Server State vs Client State

::code-wrapper{language="javascript" filename="server_vs_client.js"}
```javascript
// THE most common conceptual mistake: conflating server state with client state.
// They have fundamentally different characteristics and need different tools.

// SERVER STATE (API responses, database queries):
// - Owned by the server, not the client
// - Can be stale (the server data may have changed since you fetched it)
// - Needs caching, refetching, invalidation, optimistic updates
// - Multiple components may need the same data (deduplication)
// - Race conditions, pagination, background updates
// → Use React Query, SWR, or RTK Query

// CLIENT STATE (UI state, form drafts, preferences):
// - Owned by the client
// - Not stale (it IS the source of truth while the app runs)
// - No refetching/invalidation needed
// - Usually component-local or shared via Context/store
// → Use useState, Context, Zustand, Redux, or Jotai

// CORRECT separation:
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Server state: React Query */}
      <UserDashboard />

      {/* Client state: Zustand for UI-only state */}
      <UIProvider>
        <Sidebar />
        <Modals />
      </UIProvider>
    </QueryClientProvider>
  )
}

// ANTI-PATTERN: storing API responses in Redux/Zustand and manually keeping
// them in sync — you're reinventing a worse version of React Query inside your
// state library, complete with hand-rolled caching, invalidation, and race conditions.

// ANTI-PATTERN: using React Query for genuinely client-only state like
// "is the sidebar open" — it's not server data, doesn't need caching, and
// you're adding network-fetching semantics to local UI state.
```
::

## A Concrete Migration: Context Ceiling → Zustand

::code-wrapper{language="javascript" filename="migration.js"}
```javascript
// BEFORE: one big Context value, every consumer re-renders on any field change
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

function ThemeToggle() {
  const { user } = useContext(AppContext)
  // Re-renders when cart OR notifications change, even though it only reads user.
  return <span>{user?.name}</span>
}

// AFTER: three independent Zustand stores, each with its own fine-grained subscribers
import { create } from 'zustand'

const useUserStore = create((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}))

const useCartStore = create((set) => ({
  cart: [],
  addToCart: (item) => set(state => ({ cart: [...state.cart, item] })),
  removeFromCart: (id) => set(state => ({ cart: state.cart.filter(i => i.id !== id) })),
}))

const useNotificationStore = create((set) => ({
  notifications: [],
  add: (n) => set(state => ({ notifications: [...state.notifications, n] })),
  clear: () => set({ notifications: [] }),
}))

// No <Provider> needed anywhere — components import and call these hooks directly.
function UserBadge() {
  // Reads NOTHING from cart or notifications — genuinely never re-renders on
  // their changes. Only re-renders when `user` changes.
  const user = useUserStore(state => state.user)
  return <span>{user?.name}</span>
}

// The migration's real payoff: each store is independently subscribable,
// removing BOTH of Context's structural limitations (coarse re-renders, no
// non-component access) in one step, without Redux's action/reducer ceremony.
```
::

## Choosing the Right Tool: Decision Guide

::code-wrapper{language="javascript" filename="decision_guide.js"}
```javascript
// DECISION TREE:

// 1. Is the state SERVER data (fetched from an API, can go stale)?
//    → YES: React Query, SWR, or RTK Query. NOT Context/Redux/Zustand/Jotai.

// 2. Is the state local to a single component?
//    → YES: useState or useReducer. No need for anything else.

// 3. Is the state shared between a few parent/child components?
//    → YES: Lift state up to the common parent. Prop drilling is fine for 1-2 levels.

// 4. Is the state shared across many components at different tree depths?
//    → Does it change INFREQUENTLY (theme, locale, auth user)?
//      → YES: Context. Split into multiple Contexts if needed.
//    → Does it change FREQUENTLY (cart, notifications, form state)?
//      → Need structure + DevTools for a large team?
//        → YES: Redux Toolkit
//      → Want minimal ceremony, no Provider?
//        → YES: Zustand
//      → State is naturally many small independent/derived pieces?
//        → YES: Jotai

// 5. Do you need to read/update state OUTSIDE React components?
//    (WebSocket handlers, analytics, utility functions)
//    → Context can't do this → Zustand, Redux, or Jotai.

// 6. Do you need time-travel debugging and enforced action/reducer structure?
//    → Redux Toolkit (the only one with first-class DevTools time-travel).

// SUMMARY TABLE:
// | Situation                                      | Use                    |
// |------------------------------------------------|------------------------|
// | Server data (API responses)                    | React Query / SWR      |
// | Component-local state                          | useState / useReducer  |
// | Lifted state (parent + 1-2 children)           | Props (no library)     |
// | Infrequently-changing app-wide state           | Context (split if needed) |
// | Frequently-changing global state, minimal fuss | Zustand                |
// | Large team, enforced structure, DevTools       | Redux Toolkit          |
// | Many small independent/derived pieces          | Jotai                  |
// | State needed outside React components          | Zustand / Redux / Jotai |
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript" filename="tips.js"}
```javascript
// [Idiom] Split one large Context into several narrowly-scoped ones BEFORE
// reaching for an external library — this alone fixes the "every consumer
// re-renders on any change" problem for many apps, at zero added dependencies.

// [Idiom] Keep server data (anything from an API) in React Query/SWR and
// genuinely client-only state (modal open/closed, form drafts, theme) in
// Context/Zustand/Jotai — mixing the two into one system reinvents a worse
// version of whichever data-fetching library you're avoiding.

// [Debug] In Zustand, ALWAYS pass a selector function
// (useCartStore(state => state.items.length)) rather than destructuring the
// whole store (const { items } = useCartStore()) — the latter subscribes the
// component to every field, reintroducing Context's coarse-re-render problem.

// [Idiom] Reach for Redux Toolkit specifically when a team needs enforced
// action/reducer structure and time-travel debugging across a large codebase
// with many contributors — its ceremony is a FEATURE (consistency at scale),
// not merely legacy weight.

// [Idiom] Jotai's derived atoms are usually a cleaner solution than a useMemo
// reading from multiple Context values for cross-cutting computed state —
// consider it when an app's shared state is naturally composed of many small,
// independently-updated pieces rather than one large shape.

// [Performance] Split Context into a Value Context and a Setter Context when
// the value changes frequently but the setter never does — components that only
// dispatch (never read the current value) won't re-render on value changes.

// [Idiom] Use useSyncExternalStore (React 18+) for fine-grained Context
// subscriptions without a library — it's the same primitive Zustand/Jotai use
// internally, and lets consumers subscribe to only the slice they need.

// [Debug] Zustand's create() returning a hook means the store is a singleton
// across the whole app — unlike useState, all components calling useCartStore()
// share the exact same state. This is desired for global state but confusing if
// you expect per-component isolation.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript" filename="edge_cases.js"}
```javascript
// [Gotcha] A single Context bundling many unrelated fields re-renders EVERY
// consumer on ANY field's change, even ones a component never reads — the #1
// real-world Context performance complaint. Splitting into multiple Contexts
// (not necessarily abandoning Context) is usually the correct first fix.

// [Gotcha] Redux Toolkit's state.items.push(...)-looking reducer code is NOT
// actually a mutation — it works only because RTK wraps reducers in Immer, which
// intercepts the apparent mutation and produces an immutable update. Writing the
// same "mutating" code in a plain useState updater or outside an RTK reducer
// would be a real, broken mutation.

// [Gotcha] Zustand's create() returning a hook means the store is a true
// singleton across the whole app by default — all components calling
// useCartStore() share the exact same store. This is usually desired for global
// state but is a common point of confusion for developers expecting per-component
// isolation (like useState provides).

// [Gotcha] Context has NO way to read or update its value outside of a React
// component's render — Redux, Zustand, and Jotai all provide non-hook APIs
// (store.getState(), useCartStore.getState()) to close this gap. This matters
// for WebSocket handlers, analytics calls, or plain utility functions.

// [Gotcha] NONE of Context, Redux, Zustand, or Jotai include caching, refetching,
// or staleness logic for server data — using any of them to store API responses
// directly reproduces the race conditions and stale-data problems from chapter 17
// that data-fetching libraries specifically solve. Keep server state and client
// state in SEPARATE systems.

// [Gotcha] Context value object identity: if you pass a new object literal as
// the Provider value every render (value={{ a, b, c }}), EVERY consumer
// re-renders on EVERY Provider render, even if a, b, c haven't changed. Wrap
// the value in useMemo to prevent unnecessary re-renders.

// [Gotcha] Zustand selectors that return new object/array references every call
// (state => ({ items: state.items, count: state.items.length })) cause infinite
// re-render loops because the selector result is referentially new each time.
// Use useShallow (Zustand 4.4+) or return primitives, not new objects.

// [Gotcha] Jotai atoms are identified by their object reference, not by a string
// key — creating an atom inside a component body (const myAtom = atom(0)) makes
// a NEW atom every render, losing all state. Always create atoms at module scope
// or use atomFamily/atomWithStorage for dynamic atoms.
```
::

## 🧠 Spot the Bug

A settings page's `ThemeToggle` button is reported as "laggy" — clicking it takes a visibly long moment to respond, even though toggling a theme should be instantaneous:

::code-wrapper{language="javascript" filename="spot_the_bug.js"}
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

`searchResults` updates every 200ms from a polling effect, and it lives in the **same Context value object** as `theme`. Every 200ms, the Provider re-renders with a new `value` object (a new object reference every time, even if `theme` itself hasn't changed), and because Context has no field-level subscription granularity, `ThemeToggle` — which reads only `theme` — re-renders every single time too, **5 times a second**. The perceived "lag" on click is really the button competing with constant background re-render churn.

**Fix**: split the fast-changing `searchResults` into a separate Context (or move it to Zustand/React Query), and `useMemo` the `theme` Context's value:

```javascript
const ThemeContext = createContext(null)
const SearchContext = createContext(null)

function AppProvider({ children }) {
  const [theme, setTheme] = useState('light')
  const [searchResults, setSearchResults] = useState([])

  useEffect(() => {
    const id = setInterval(() => {
      fetchLiveSearchResults().then(setSearchResults)
    }, 200)
    return () => clearInterval(id)
  }, [])

  const themeValue = useMemo(() => ({ theme, setTheme }), [theme, setTheme])

  return (
    <ThemeContext.Provider value={themeValue}>
      <SearchContext.Provider value={searchResults}>
        {children}
      </SearchContext.Provider>
    </ThemeContext.Provider>
  )
}

function ThemeToggle() {
  const { theme, setTheme } = useContext(ThemeContext)
  // Now only re-renders when theme changes — not on every searchResults update.
  return (
    <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  )
}
```

The lesson: state that changes at very different frequencies (a slow-changing `theme` and a fast-polling `searchResults`) should never share one Context value — split them so components that only care about the slow-changing field don't re-render on every fast-changing update.

</details>

## Key Takeaways

::code-wrapper{language="javascript" filename="key_takeaways.js"}
```javascript
// 1. Context's two structural limits: coarse-grained re-rendering (every consumer
//    re-renders on any value change) and no built-in way to read/update state
//    outside React components. Both are fine at small scale, limiting at large.

// 2. Splitting one large Context into several narrowly-scoped ones (or splitting
//    value+setter into separate Contexts) is often sufficient — try it BEFORE
//    adopting an external library.

// 3. useSyncExternalStore (React 18+) provides fine-grained subscriptions without
//    a library — the same primitive Zustand/Jotai use internally.

// 4. Zustand: global state with minimal ceremony, no Provider, access from outside
//    React. Always use selector functions — destructuring the whole store
//    reintroduces Context's coarse-re-render problem.

// 5. Redux Toolkit: enforced structure (actions/reducers), fine-grained useSelector
//    subscriptions, mature DevTools with time-travel, and RTK Query for server
//    state. More ceremony than smaller apps need, but valuable for large teams.

// 6. Jotai: composes state from small, independent (and derivable) atoms —
//    fine-grained subscriptions by construction. Derived atoms replace useMemo
//    for cross-cutting computed state. Create atoms at module scope, never in
//    component body.

// 7. SERVER STATE ≠ CLIENT STATE. Server data (API responses, can go stale, needs
//    caching/refetching/invalidation) belongs in React Query/SWR/RTK Query.
//    Client state (UI, forms, preferences) belongs in Context/Zustand/Redux/Jotai.
//    Never mix the two — storing API responses in a state library reinvents a
//    worse version of a data-fetching library.

// 8. Decision tree: server data → React Query/SWR; local → useState; lifted →
//    props; infreq-changing shared → Context; freq-changing shared + minimal →
//    Zustand; large team + structure → Redux Toolkit; many small pieces → Jotai;
//    state outside React → Zustand/Redux/Jotai (not Context).
```
::