---
title: "07 — useContext & Prop Drilling"
description: "Context API, provider/consumer patterns, re-render mechanics, context splitting for stable vs dynamic values, and custom hook idioms. Code-first reference for mid-to-senior React engineers."
---

# 07 — `useContext` & Prop Drilling

## The Problem: Prop Drilling

::code-wrapper{language="javascript" filename="prop_drilling.js"}
```javascript
// ANTI-PATTERN: passing props through components that don't use them
function App() {
  const [user, setUser] = useState(null)
  return <Layout user={user} setUser={setUser} />  // Layout doesn't use user
}
function Layout({ user, setUser }) {
  return <Sidebar user={user} setUser={setUser} />  // Sidebar doesn't use user
}
function Sidebar({ user, setUser }) {
  return <UserMenu user={user} setUser={setUser} />  // UserMenu is the actual consumer
}
// 3 levels of drilling for a value only UserMenu needs.
// Adding a new prop to user → update every intermediate component's interface.
// Refactoring any intermediate component → risk breaking the prop chain.
```
::

## createContext + useContext

::code-wrapper{language="javascript" filename="context_basics.js"}
```javascript
import { createContext, useContext, useState } from 'react'

// 1. Create a context with a default value (used only when NO provider is found)
const AuthContext = createContext(null)  // null default = "no auth context"

// 2. Provide a value at the top of the tree
function App() {
  const [user, setUser] = useState(null)
  return (
    <AuthContext.Provider value={{ user, setUser }}>
      <Layout />
    </AuthContext.Provider>
  )
}

// 3. Consume in any descendant — no drilling through intermediate components
function UserMenu() {
  const { user, setUser } = useContext(AuthContext)  // directly, no props
  if (!user) return <LoginButton onClick={() => setUser(loginUser())} />
  return <div>{user.name}</div>
}
// Layout and Sidebar no longer need to know about user at all.
```
::

## Context Re-render Mechanics

::code-wrapper{language="javascript" filename="context_renders.js"}
```javascript
// CRITICAL: when the Provider's value changes, ALL consumers re-render.
// EVERY component that calls useContext(AuthContext) re-renders, regardless of
// whether it uses the part that changed.

// ANTI-PATTERN: new value object every render → all consumers re-render every time
function App() {
  const [user, setUser] = useState(null)
  const [theme, setTheme] = useState('dark')  // unrelated state
  return (
    <AuthContext.Provider value={{ user, setUser }}>
      {/* Every time setTheme fires, App re-renders → { user, setUser } is a NEW
          object → AuthContext value changes → ALL consumers re-render,
          even though user didn't change. */}
      <Layout />
    </AuthContext.Provider>
  )
}

// FIX: memoize the value object
function App() {
  const [user, setUser] = useState(null)
  const [theme, setTheme] = useState('dark')

  const authValue = useMemo(() => ({ user, setUser }), [user])
  // setUser is stable (useState guarantees this), so deps only include user.
  // Now the value object only changes when user changes → consumers only
  // re-render when auth actually changes, not when theme toggles.

  return (
    <AuthContext.Provider value={authValue}>
      <Layout />
    </AuthContext.Provider>
  )
}
```
::

## Context Splitting: Stable vs Dynamic

::code-wrapper{language="javascript" filename="context_splitting.js"}
```javascript
// PRODUCTION PATTERN: split contexts by change frequency
// Stable values (setUser, theme config) in one context.
// Dynamic values (user object, loading state) in another.

const AuthActionsContext = createContext(null)  // stable: setters, callbacks
const AuthStateContext = createContext(null)     // dynamic: user, loading

function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(false)

  // Actions are stable — setUser and setLoading are guaranteed stable by useState
  const actions = useMemo(() => ({
    login: async (credentials) => {
      setLoading(true)
      const user = await api.login(credentials)
      setUser(user)
      setLoading(false)
    },
    logout: () => setUser(null),
  }), [])  // no deps → stable forever

  // State changes on login/logout
  const state = useMemo(() => ({ user, loading }), [user, loading])

  return (
    <AuthActionsContext.Provider value={actions}>
      <AuthStateContext.Provider value={state}>
        {children}
      </AuthStateContext.Provider>
    </AuthActionsContext.Provider>
  )
}

// A component that only needs login() doesn't re-render when user changes:
function LoginButton() {
  const { login } = useContext(AuthActionsContext)  // stable → no re-renders from state
  return <button onClick={() => login(creds)}>Log In</button>
}
// A component that shows user info re-renders only when user changes:
function Profile() {
  const { user, loading } = useContext(AuthStateContext)  // re-renders on user change
  if (loading) return <Spinner />
  return <div>{user?.name}</div>
}
```
::

## Custom Hooks for Context Consumption

::code-wrapper{language="javascript" filename="custom_context_hooks.js"}
```javascript
// PRODUCTION PATTERN: wrap useContext in a custom hook for type safety + error checking
function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
    // This error fires if someone uses useAuth outside <AuthProvider> —
    // catches the mistake at runtime with a clear message instead of a
    // confusing null reference error deep in a consumer.
  }
  return context
}

// Usage:
function UserMenu() {
  const { user, logout } = useAuth()  // clean, self-documenting, type-safe
  // ...
}

// The default value should be undefined (not null) to enable the error check:
const AuthContext = createContext(undefined)
// createContext(null) → context === null → the undefined check won't catch it
// createContext(undefined) → context === undefined → the check fires correctly
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript" filename="tips.js"}
```javascript
// [Idiom] Always wrap useContext in a custom hook (useAuth, useTheme, useCart).
// Benefits: type safety, clear error if used outside provider, self-documenting.

// [Performance] Memoize context values with useMemo. A new object literal
// { a, b } every render causes ALL consumers to re-render even if a and b
// haven't changed — Object.is fails on new object references.

// [Idiom] Split contexts by change frequency. Put stable values (setters,
// callbacks) in a separate context from dynamic values (data, loading state).
// Consumers of stable values won't re-render when dynamic values change.

// [Debug] If a consumer isn't getting the provider's value, check:
// 1. Is the consumer INSIDE the provider in the tree?
// 2. Is the default value undefined (to enable the "outside provider" error)?
// 3. Are you nesting providers correctly (outer wraps inner)?

// [Idiom] For context values that are just functions (dispatch, callbacks),
// useCallback each function and wrap in useMemo for the value object.
// useState setters are already stable — no need to useCallback them.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript" filename="edge_cases.js"}
```javascript
// [Gotcha] The default value is used ONLY when no provider is found above the
// consumer. If a provider exists but passes value={undefined}, the consumer
// gets undefined — NOT the default. The default is a fallback for missing
// providers, not for undefined values.

// [Gotcha] useContext inside a component that's ABOVE the provider returns the
// default value (or throws if your custom hook checks for it). The provider
// must wrap the consumer in the component tree.

// [Gotcha] Context value changes cause ALL consumers to re-render — there's no
// way to opt out per-consumer. If only one field changes, every consumer that
// uses the context (even for other fields) re-renders. This is why context
// splitting (stable vs dynamic) matters for performance.

// [Gotcha] Nested providers of the same context: the INNERMOST provider wins.
// <ThemeContext.Provider value="dark">
//   <ThemeContext.Provider value="light">  ← consumers here get "light"
//     <Component />
//   </ThemeContext.Provider>
// </ThemeContext.Provider>
// This can be used intentionally for overrides (e.g., a dark section in a light app).

// [Gotcha] Context does NOT participate in bailout optimizations. Even if a
// consumer's props haven't changed and it's wrapped in React.memo, a context
// value change will still trigger a re-render. React.memo only checks props,
// not context. To prevent this, split the context so the consumer subscribes
// only to the slice it needs.
```
::

## 🧠 Spot the Bug

Every keystroke in a search input causes the entire app to re-render, even though the search state is local to one component:

::code-wrapper{language="javascript" filename="spot_the_bug.js"}
```javascript
function App() {
  const [user, setUser] = useState(null)
  return (
    <AuthContext.Provider value={{ user, setUser }}>
      <SearchPage />
    </AuthContext.Provider>
  )
}
function SearchPage() {
  const [query, setQuery] = useState('')
  // Every keystroke → setQuery → App re-renders → { user, setUser } is a NEW
  // object → AuthContext value changes → ALL AuthContext consumers re-render.
  return <input value={query} onChange={e => setQuery(e.target.value)} />
}
```
::

<details>
<summary>Answer</summary>

The `AuthContext.Provider` value is `{ user, setUser }` — a new object literal created on every render of `App`. When `SearchPage`'s local state (`query`) changes, it causes `App` to re-render (because `SearchPage` is a child of `App`). On `App`'s re-render, `{ user, setUser }` creates a new object reference → the context value changes → **all** `AuthContext` consumers re-render, even though `user` didn't change.

**Fix**: memoize the value object so it only changes when `user` changes:

```javascript
const authValue = useMemo(() => ({ user, setUser }), [user])
// setUser is stable (useState guarantee), so deps only needs user.
// Now the context value is referentially stable across unrelated re-renders.
```

</details>

## Key Takeaways

::code-wrapper{language="javascript" filename="key_takeaways.js"}
```javascript
// 1. Context solves prop drilling — provide at the top, consume anywhere below.
//    createContext(default) + Provider value={...} + useContext(context).

// 2. When the Provider value changes, ALL consumers re-render — no opt-out.
//    Memoize the value with useMemo to prevent unnecessary re-renders.

// 3. Split contexts by change frequency: stable values (setters, callbacks) in
//    one context, dynamic values (data, loading) in another. Consumers of
//    stable values don't re-render when dynamic values change.

// 4. Wrap useContext in a custom hook (useAuth) with an "outside provider" error
//    check. Use createContext(undefined) so the check can distinguish "no provider"
//    from "provider with undefined value."

// 5. React.memo does NOT prevent context-triggered re-renders — memo only checks
//    props. To prevent context re-renders, split the context so the consumer
//    subscribes only to the slice it needs.
```
::
