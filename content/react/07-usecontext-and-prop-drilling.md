# 07 — `useContext` & Prop Drilling

## Revisiting the Prop Drilling Problem

Chapter 3 introduced prop drilling: a value needed deep in the tree gets threaded through every intermediate component, even ones that don't use it themselves. Context is React's built-in answer to that specific problem — a way for a component to "publish" a value that any descendant can "subscribe" to directly, skipping the layers in between.

## Creating and Providing Context

Three pieces: `createContext` (define it), a `Provider` (supply a value from some point in the tree down), and `useContext` (read it from any descendant).

::code-wrapper{language="javascript"}
```javascript
import { createContext, useContext, useState } from 'react'

const ThemeContext = createContext(null)  // default value, used only if no Provider is an ancestor

function App() {
  const [theme, setTheme] = useState('light')

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <Page />
    </ThemeContext.Provider>
  )
}

function Page() {
  return <Sidebar />  // Page never touches theme — no drilling needed
}

function Sidebar() {
  return <ThemedButton />  // Sidebar never touches theme either
}

function ThemedButton() {
  const { theme, setTheme } = useContext(ThemeContext)  // reads directly, skipping Page/Sidebar
  return (
    <button
      className={`btn btn--${theme}`}
      onClick={() => setTheme(t => (t === 'light' ? 'dark' : 'light'))}
    >
      Toggle Theme
    </button>
  )
}
```
::

## The Default Value Is a Fallback, Not a Config

The value passed to `createContext(defaultValue)` is only used when a component calls `useContext` **without** any matching `Provider` above it in the tree — it is not a "default config" that merges with what a Provider supplies.

::code-wrapper{language="javascript"}
```javascript
const UserContext = createContext(null)

function ProfileBadge() {
  const user = useContext(UserContext)
  // If ProfileBadge is rendered outside any <UserContext.Provider>, `user` is null here —
  // NOT some default user object, even if you intended `null` to just mean "not logged in
  // yet." Consumers must handle the no-Provider case explicitly.
  if (!user) return <GuestBadge />
  return <span>{user.name}</span>
}
```
::

## A Production-Realistic Pattern: Context + Custom Hook

Exporting the raw context object invites consumers to forget the null-check, misuse `useContext` outside a provider, or import from the wrong module path. The standard production pattern wraps both the provider and the consumption in a dedicated module, throwing a clear error if used incorrectly.

::code-wrapper{language="javascript" filename="AuthContext.jsx"}
```javascript
import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(undefined)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    fetchCurrentUser()
      .then(u => { setUser(u); setStatus('ready') })
      .catch(() => { setUser(null); setStatus('ready') })
  }, [])

  const value = { user, status, login: (u) => setUser(u), logout: () => setUser(null) }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (ctx === undefined) {
    // Fails loudly and immediately at the call site, instead of a confusing
    // "cannot read property 'user' of undefined" three components later.
    throw new Error('useAuth must be used within an <AuthProvider>')
  }
  return ctx
}
```
::

::code-wrapper{language="javascript"}
```javascript
function App() {
  return (
    <AuthProvider>
      <Dashboard />
    </AuthProvider>
  )
}

function Dashboard() {
  const { user, status, logout } = useAuth()
  if (status === 'loading') return <Spinner />
  return (
    <div>
      <p>Welcome, {user?.name ?? 'Guest'}</p>
      <button onClick={logout}>Log Out</button>
    </div>
  )
}
```
::

## Composing Multiple Contexts

Real apps typically have several independent contexts (auth, theme, locale, feature flags). Nest providers explicitly, or build a single `AppProviders` composition component to avoid a deeply indented "provider pyramid" at the app root.

::code-wrapper{language="javascript"}
```javascript
// Provider pyramid — works, but grows unreadable past 3-4 contexts
function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <LocaleProvider>
          <FeatureFlagsProvider>
            <Dashboard />
          </FeatureFlagsProvider>
        </LocaleProvider>
      </ThemeProvider>
    </AuthProvider>
  )
}
```
::

::code-wrapper{language="javascript"}
```javascript
// Flattened composition — same behavior, easier to scan and reorder
function AppProviders({ children }) {
  return (
    <AuthProvider>
      <ThemeProvider>
        <LocaleProvider>
          <FeatureFlagsProvider>{children}</FeatureFlagsProvider>
        </LocaleProvider>
      </ThemeProvider>
    </AuthProvider>
  )
}

function App() {
  return (
    <AppProviders>
      <Dashboard />
    </AppProviders>
  )
}
```
::

## When to Use Context vs. When to Just Pass Props

Context is not a general-purpose state management replacement — it's specifically for values that are genuinely **global to a subtree**: the current authenticated user, the active theme, the current locale, feature flags. For state that's local to a feature or a couple of sibling components, plain props (or lifting state up to the nearest common ancestor) is simpler, more explicit, and easier to trace.

| Situation | Prefer |
|---|---|
| Value needed by one child, one level down | Direct prop |
| Value needed by 2-3 nested levels, one clear path | Props (drilling this shallow is fine) |
| Value needed by many components scattered across the tree, at unpredictable depths | Context |
| Frequently changing value needed by performance-sensitive, high-frequency-rendering trees | A dedicated state library (chapter 18) — Context causes broad re-renders on every value change |

## Performance Implications: Context Re-Renders Everything That Consumes It

Every component that calls `useContext(SomeContext)` re-renders whenever that context's `value` changes — **regardless of whether the specific field that component reads actually changed**. This is because the `Provider`'s `value` is compared as a whole by reference, not field-by-field.

::code-wrapper{language="javascript"}
```javascript
// BUG: a new object literal is created every render of AppShell,
// so EVERY consumer of AppStateContext re-renders on every AppShell render,
// even if neither `user` nor `notifications` actually changed.
function AppShell() {
  const [user, setUser] = useState(initialUser)
  const [notifications, setNotifications] = useState([])

  return (
    <AppStateContext.Provider value={{ user, notifications }}>
      <Dashboard />
    </AppStateContext.Provider>
  )
}
```
::

::code-wrapper{language="javascript"}
```javascript
// Fixed: memoize the value object so its reference is stable
// across renders where user/notifications didn't change.
function AppShell() {
  const [user, setUser] = useState(initialUser)
  const [notifications, setNotifications] = useState([])

  const value = useMemo(() => ({ user, notifications }), [user, notifications])

  return (
    <AppStateContext.Provider value={value}>
      <Dashboard />
    </AppStateContext.Provider>
  )
}
```
::

Even with memoization, every consumer still re-renders whenever *any* field in the value object changes — Context has no built-in field-level selector mechanism (unlike Redux's `useSelector` or Zustand's selector hooks, chapter 18). For state that changes frequently and is read by many components, splitting into multiple, narrower contexts (e.g., separate `UserContext` and `NotificationsContext` instead of one combined `AppStateContext`) limits the blast radius of each update.

::code-wrapper{language="javascript"}
```javascript
// Split contexts: updating notifications no longer re-renders
// components that only read UserContext.
<UserContext.Provider value={user}>
  <NotificationsContext.Provider value={notifications}>
    <Dashboard />
  </NotificationsContext.Provider>
</UserContext.Provider>
```
::

## 💡 Tips & Tricks

- **Idiom** — Always pair a context with a custom `useX` hook (`useAuth`, `useTheme`) that throws a clear error when called outside its provider, instead of exporting the raw context object — this turns a silent `undefined` bug three components away into an immediate, actionable error at the exact call site.
- **Performance** — Memoize the object passed to a `Provider`'s `value` prop with `useMemo` whenever it's constructed from multiple pieces of state — otherwise every render of the provider component creates a new reference and re-renders every consumer, memoized or not.
- **Idiom** — Split large, multi-field contexts into several narrower ones (auth vs. theme vs. notifications) rather than one mega-context — it limits how many unrelated components re-render when only one slice of state changes.
- **Debug** — If a component seems to re-render far more than its own props/state would explain, check the React DevTools Profiler's "why did this render" panel for a context value change — context re-renders are a common invisible cause that doesn't show up just by reading the component's own code.
- **Idiom** — Reach for Context only for values that are genuinely tree-wide (auth, theme, locale, feature flags) — for anything narrower, plain props or lifting state to the nearest shared ancestor stays easier to trace than adding another context.

## ⚠️ Edge Cases & Gotchas

- **A `Provider` with no ancestor falls back to `createContext`'s default value silently** — no error is thrown; components just quietly receive the default, which can mask a genuine bug like a `Provider` accidentally placed below the component that needs it, or omitted entirely in a test render.
- **Every consumer re-renders on any `value` change, not just the fields it reads** — a component that only destructures `{ user }` from a context still re-renders when `notifications` changes, if both live in the same context value — this is invisible from reading that one component in isolation.
- **A new inline object literal as `value` defeats all downstream memoization** — `<Context.Provider value={{ a, b }}>` without `useMemo` creates a new reference every render of the provider, which cascades a re-render to every consumer regardless of whether `React.memo` wraps them.
- **Context does not work across separate React roots (e.g., micro-frontends)** — a `Provider` rendered in one `createRoot` tree is invisible to a `useContext` call in a different, independently-mounted root, even if they're on the same page; each root has its own React tree and context resolution only walks within it.
- **Updating context state inside a deeply nested consumer is still just calling `useState`'s setter from wherever it's defined** — Context does not provide any special two-way binding; the actual state and its updater function still live in whichever component called `useState`, and `value` merely exposes both to descendants.

## 🧠 Spot the Bug

A settings page wraps its content in a context provider, but toggling a single, unrelated "sidebar collapsed" state causes the entire user profile section (which reads from the same context) to visibly flash/re-render on every toggle, hurting perceived performance.

::code-wrapper{language="javascript"}
```javascript
function SettingsPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [user, setUser] = useState(currentUser)

  return (
    <AppContext.Provider value={{ sidebarCollapsed, setSidebarCollapsed, user, setUser }}>
      <Sidebar />
      <UserProfileSection />
    </AppContext.Provider>
  )
}
```
::

<details>
<summary>Answer</summary>

`sidebarCollapsed` and `user` are combined into a single context value object, created fresh on every render of `SettingsPage`. Toggling the sidebar updates `sidebarCollapsed`, which re-renders `SettingsPage`, which creates a brand-new `value` object (even though `user` itself hasn't changed) — and since `UserProfileSection` consumes the same context, it re-renders too, because context comparison is by object reference, not by field.

**The lesson**: split unrelated pieces of state into separate contexts (`SidebarContext` and `UserContext`) so a change to one doesn't ripple into consumers of the other — or, if they must stay combined, memoize the value with `useMemo` keyed on the fields that actually changed (though splitting the contexts is the more complete fix here, since even a memoized combined value still re-renders every consumer when *either* field changes).

</details>

## Key Takeaways

- Context lets a value be published once and read by any descendant, avoiding the pass-through props chapter 3 named as "prop drilling."
- The default value passed to `createContext` only applies with no `Provider` ancestor — it is not merged with a `Provider`'s value.
- Pair every context with a custom hook (`useAuth`, `useTheme`) that throws when used outside its provider, rather than exporting the raw context.
- Every consumer of a context re-renders on any change to its `value`, regardless of which specific field that consumer reads — memoize the value and/or split into narrower contexts to limit the blast radius.
- Context is for genuinely tree-wide values (auth, theme, locale); it is not a general state-management replacement for frequently-changing, performance-sensitive state — see chapter 18 for dedicated libraries.
