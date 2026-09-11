---
title: "23 — TypeScript with React"
description: "Typing props, state, hooks, events, refs, and context in React. Discriminated unions for component variants, utility types, generics, and common type pitfalls. Code-first reference for mid-to-senior React engineers."
---

# 23 — TypeScript with React

## Typing Component Props

::code-wrapper{language="typescript" filename="typing_props.tsx"}
```tsx
import { type ReactNode, type PropsWithChildren } from 'react'

// BASIC: interface for props
interface ButtonProps {
  label: string
  variant?: 'primary' | 'secondary' | 'danger'  // union = autocomplete + exhaustiveness
  size?: 'sm' | 'md' | 'lg'
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
  disabled?: boolean
  children?: ReactNode  // anything renderable: string, element, array of elements
}

function Button({ label, variant = 'primary', size = 'md', onClick, disabled, children }: ButtonProps) {
  return (
    <button
      className={`btn btn-${variant} btn-${size}`}
      onClick={onClick}
      disabled={disabled}
    >
      {label || children}
    </button>
  )
}

// type vs interface: use `type` for unions and computed types, `interface` for
// object shapes that might be extended. For props, `interface` is conventional
// but `type` works identically. Prefer `type` if you don't need declaration merging.
```
::

## Discriminated Unions for Variant Props

::code-wrapper{language="typescript" filename="discriminated_unions.tsx"}
```tsx
// DISCRIMINATED UNION: different prop shapes for different variants.
// The `variant` field is the discriminant — TypeScript narrows based on it.

type InputProps =
  | { variant: 'text'; value: string; onChange: (v: string) => void; placeholder?: string }
  | { variant: 'number'; value: number; onChange: (v: number) => void; min?: number; max?: number }
  | { variant: 'checkbox'; checked: boolean; onChange: (v: boolean) => void; label: string }

function Input(props: InputProps) {
  switch (props.variant) {
    case 'text':
      // TS knows: props is { variant: 'text'; value: string; ... }
      // props.min would be a TYPE ERROR here — text variant doesn't have min
      return <input type="text" value={props.value} placeholder={props.placeholder}
        onChange={e => props.onChange(e.target.value)} />

    case 'number':
      // TS knows: props is { variant: 'number'; value: number; min?: number; ... }
      return <input type="number" value={props.value} min={props.min} max={props.max}
        onChange={e => props.onChange(Number(e.target.value))} />

    case 'checkbox':
      // TS knows: props is { variant: 'checkbox'; checked: boolean; label: string }
      return <label><input type="checkbox" checked={props.checked}
        onChange={e => props.onChange(e.target.checked)} /> {props.label}</label>
  }
}

// Usage: <Input variant="text" value="hello" onChange={setStr} />
// TS enforces the correct prop shape per variant — wrong props are type errors.
```
::

## Typing Event Handlers

::code-wrapper{language="typescript" filename="typing_events.tsx"}
```tsx
// React provides typed event interfaces. The generic is the DOM element type.

function Form() {
  const [email, setEmail] = useState('')

  // React.ChangeEvent<HTMLInputElement> — fires on input/textarea/select change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value)  // TS knows e.target is HTMLInputElement → .value is string
  }

  // React.MouseEvent<HTMLButtonElement> — fires on click
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    // TS knows e.currentTarget is HTMLButtonElement → .disabled, .form, etc.
  }

  // React.KeyboardEvent<HTMLDivElement> — fires on keydown/keyup
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') submit()
    // e.key is string; e.keyCode is deprecated; e.code gives physical key
  }

  // React.FormEvent<HTMLFormElement> — fires on form submit
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)  // e.currentTarget = <form>
  }

  return (
    <form onSubmit={handleSubmit}>
      <input value={email} onChange={handleChange} onKeyDown={handleKeyDown} />
      <button onClick={handleClick}>Submit</button>
    </form>
  )
}
```
::

## Typing Hooks

::code-wrapper{language="typescript" filename="typing_hooks.tsx"}
```tsx
// useState: inferred from initial value, or explicit generic
const [count, setCount] = useState(0)           // infers number
const [user, setUser] = useState<User | null>(null)  // explicit: User or null
const [items, setItems] = useState<string[]>([])     // explicit: string array

// useRef: the generic is the type of .current
const inputRef = useRef<HTMLInputElement>(null)  // .current: HTMLInputElement | null
const timerRef = useRef<number | null>(null)     // for setInterval/setTimeout IDs
// NOTE: useRef(null) → .current is null initially. Always null-check: inputRef.current?.focus()

// createContext: the generic is the context value type
interface ThemeContextValue { theme: 'light' | 'dark'; toggle: () => void }
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)
// undefined default → enables the "outside provider" check in useTheme():
function useTheme() {
  const ctx = useContext(ThemeContext)
  if (ctx === undefined) throw new Error('useTheme must be used within ThemeProvider')
  return ctx  // TS knows ctx is ThemeContextValue (not undefined) after the throw
}

// useReducer: type the state and action
type Action = { type: 'increment' } | { type: 'setStep'; step: number }
const [state, dispatch] = useReducer(reducer, initialState)
// dispatch is typed: dispatch({ type: 'increment' }) ✓
// dispatch({ type: 'setStep' }) ✗ — missing required `step` field
// dispatch({ type: 'decrement' }) ✗ — 'decrement' not in the Action union
```
::

## Typing Refs and forwardRef

::code-wrapper{language="typescript" filename="typing_forwardref.tsx"}
```tsx
import { forwardRef, useRef, useImperativeHandle } from 'react'

// forwardRef: the first generic is the ref type (the DOM element), second is props
const FancyInput = forwardRef<HTMLInputElement, FancyInputProps>(
  function FancyInput(props, ref) {
    return <input ref={ref} {...props} />
  }
)

// useImperativeHandle: define a custom ref API type
interface InputHandle {
  focus: () => void
  clear: () => void
  getValue: () => string
}

const ControlledInput = forwardRef<InputHandle, ControlledInputProps>(
  function ControlledInput(props, ref) {
    const inputRef = useRef<HTMLInputElement>(null)
    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      clear: () => { if (inputRef.current) inputRef.current.value = '' },
      getValue: () => inputRef.current?.value ?? '',
    }), [])
    return <input ref={inputRef} {...props} />
  }
)
// Parent: const ref = useRef<InputHandle>(null) → ref.current?.focus() is typed
```
::

## Utility Types for Props

::code-wrapper{language="typescript" filename="utility_types.tsx"}
```tsx
import { type ComponentProps, type PropsWithChildren, type HTMLAttributes } from 'react'

// ComponentProps<typeof Button> — extract the prop types of an existing component
type ButtonProps = ComponentProps<typeof Button>
// Useful for wrapping: function MyButton(props: ButtonProps) { return <Button {...props} /> }

// PropsWithChildren — adds `children?: ReactNode` to any props type
type CardProps = PropsWithChildren<{ title: string }>
function Card({ title, children }: CardProps) {
  return <div><h3>{title}</h3>{children}</div>
}

// HTMLAttributes<HTMLDivElement> — all standard HTML attributes for a div
type DivProps = HTMLAttributes<HTMLDivElement>
// Includes onClick, className, style, role, aria-*, data-*, etc.

// Omit to remove props you're overriding
type CustomButtonProps = Omit<ComponentProps<'button'>, 'onClick'> & {
  onSelect: (id: string) => void  // replace onClick with a different handler
}

// Pick to select only specific props
type OnlyClickProps = Pick<ComponentProps<'button'>, 'onClick' | 'disabled'>
```
::

## 💡 Tips & Tricks

::code-wrapper{language="typescript" filename="tips.tsx"}
```tsx
// [Idiom] Use `type` for props (not `interface`) when you need unions, intersections,
// or utility types. Use `interface` when you need declaration merging (rare for props).

// [Idiom] For event handlers passed as props, type them explicitly:
//   onChange: (value: string) => void  — not (e: any) => void
// This makes the component's API self-documenting and catches type mismatches.

// [Idiom] Prefer discriminated unions over optional props for variant components.
// `variant: 'text' | 'number'` with per-variant props catches more bugs than
// `type?: string; min?: number; checked?: boolean` with everything optional.

// [Debug] If TS complains about a ref being null, add the null check:
//   inputRef.current?.focus() — not inputRef.current.focus()
// useRef<T>(null) → T | null, not T. The null check is required by the type.

// [Idiom] Type the return of custom hooks explicitly for complex returns:
//   function useFetch(url: string): { data: T | null; loading: boolean; error: string | null }
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="typescript" filename="edge_cases.tsx"}
```tsx
// [Gotcha] useRef<T>(null) creates a ref of type RefObject<T | null>. You can't
// pass it to a DOM element that expects Ref<T> without the null check.
// Use useRef<T>(null!) to assert non-null ONLY if you're certain it's set
// before access — but prefer the safe null-check pattern.

// [Gotcha] Children type: ReactNode includes null, undefined, string, number,
// boolean, element, array. JSX.Element is narrower (only rendered elements).
// Use ReactNode for children props — JSX.Element is too restrictive.

// [Gotcha] Event handler generics must match the DOM element. React.ChangeEvent
// <HTMLTextAreaElement> on an <input> → e.target is textarea, not input →
// wrong property access compiles but is semantically wrong.

// [Gotcha] The `exactOptionalPropertyTypes` TS config changes optional prop
// behavior: { x?: string } no longer accepts { x: undefined }. This affects
// React props — check your tsconfig before assuming optional = allows undefined.

// [Gotcha] forwardRef components need explicit generic types — TS can't infer
// the ref type from the JSX. Always: forwardRef<RefType, PropsType>(...)
```
::

## 🧠 Spot the Bug

A component receives a `ref` prop but TypeScript says it's not a valid prop:

::code-wrapper{language="typescript" filename="spot_the_bug.tsx"}
```tsx
function MyInput(props: { value: string; onChange: (v: string) => void; ref?: React.Ref<HTMLInputElement> }) {
  return <input ref={props.ref} value={props.value} onChange={e => props.onChange(e.target.value)} />
}
// Parent: <MyInput ref={inputRef} ... /> → TS error: ref is not a valid prop
```
::

<details>
<summary>Answer</summary>

`ref` is not a regular prop in React — it's special. React intercepts `ref` and doesn't pass it through to `props`. You can't type it as a regular prop and expect it to work. You must use `forwardRef`:

```tsx
const MyInput = forwardRef<HTMLInputElement, Omit<MyInputProps, 'ref'>>(
  function MyInput(props, ref) {
    return <input ref={ref} value={props.value} onChange={e => props.onChange(e.target.value)} />
  }
)
```

The same applies to `key` — React also intercepts it and doesn't pass it as a prop.

</details>

## Key Takeaways

::code-wrapper{language="typescript" filename="key_takeaways.tsx"}
```tsx
// 1. Type props with interface or type. Use discriminated unions for variant
//    components — the discriminant gives exhaustive switch checking + autocomplete.

// 2. Event types: React.ChangeEvent<T>, React.MouseEvent<T>, React.KeyboardEvent<T>,
//    React.FormEvent<T>. The generic is the DOM element type → e.target is typed.

// 3. Hooks: useState<T>(initial), useRef<T>(null), createContext<T | undefined>(undefined),
//    useReducer<State, Action>. Always type the Action as a discriminated union.

// 4. forwardRef needs explicit generics: forwardRef<RefType, PropsType>(...).
//    useImperativeHandle exposes a typed handle: forwardRef<Handle, Props>.

// 5. Utility types: ComponentProps<typeof X> (extract props), PropsWithChildren<P>
//    (add children), Omit<P, 'x'> (remove), Pick<P, 'x' | 'y'> (select).
//    Use ReactNode (not JSX.Element) for children — it's the broader, correct type.
```
::
