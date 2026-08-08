# 14 — Forms: Controlled and Uncontrolled

Forms are where a surprising fraction of real-world React bugs live — not because forms are conceptually hard, but because HTML form elements already have their own internal state (an `<input>` tracks its own value in the DOM whether or not React is involved), and React's model requires deciding, per field, whether React or the DOM owns that state.

## Controlled Inputs: React Owns the Value

A **controlled** input's `value` is driven entirely by React state, and every keystroke flows through an `onChange` handler that updates that state, which then flows back down as the new `value` — a one-way loop that keeps the DOM node's displayed value and React's state permanently in sync.

::code-wrapper{language="javascript"}
```javascript
function LoginForm() {
  const [email, setEmail] = useState('')

  return (
    <input
      type="email"
      value={email}
      onChange={e => setEmail(e.target.value)}
    />
  )
}
```
::

Because React state is the single source of truth, the current value is always readable from `email` without touching the DOM — trivial to validate on every keystroke, transform (uppercase, strip non-digits), sync to another field, or reset with a simple `setEmail('')`.

::code-wrapper{language="javascript"}
```javascript
function PhoneInput() {
  const [digits, setDigits] = useState('')

  function handleChange(e) {
    const onlyDigits = e.target.value.replace(/\D/g, '').slice(0, 10)
    setDigits(onlyDigits)
  }

  const formatted = digits.replace(/(\d{3})(\d{0,3})(\d{0,4})/, (_, a, b, c) =>
    [a, b, c].filter(Boolean).join('-')
  )

  return <input type="tel" value={formatted} onChange={handleChange} placeholder="555-123-4567" />
}
```
::

## Uncontrolled Inputs: The DOM Owns the Value

An **uncontrolled** input lets the browser's native DOM node track its own value, and React reaches in only when it actually needs the value — typically via a `ref` (chapter 8) at submit time, rather than on every keystroke.

::code-wrapper{language="javascript"}
```javascript
function FeedbackForm() {
  const messageRef = useRef(null)

  function handleSubmit(e) {
    e.preventDefault()
    submitFeedback(messageRef.current.value)
  }

  return (
    <form onSubmit={handleSubmit}>
      <textarea ref={messageRef} defaultValue="" />
      <button type="submit">Send</button>
    </form>
  )
}
```
::

Note `defaultValue`, not `value` — this is the tell for "uncontrolled." `defaultValue`/`defaultChecked` set the *initial* DOM value once, on mount, and then React stops touching it; the browser takes over from there. Passing `value` (without an `onChange` handler firing state updates back) instead produces React's classic **"a component is changing an uncontrolled input to be controlled, or vice versa"** warning, or worse, a genuinely read-only-looking input that rejects all typing.

::code-wrapper{language="javascript"}
```javascript
// BROKEN: value is set from state that never updates, with no onChange to update it
function BrokenInput() {
  const [name] = useState('')
  return <input value={name} />
  // Every keystroke is immediately overwritten back to the empty string on the next render —
  // the input visually appears to reject all typed characters.
}
```
::

## Why Choose One Over the Other

Controlled inputs are the default recommendation for most application forms because validation, conditional disabling, formatting-as-you-type, and multi-field dependencies (a "confirm password" field checked against "password") all need the current value available in JavaScript on every keystroke — which is exactly what controlled state provides for free.

Uncontrolled inputs earn their place in narrower situations: a single free-text field read only at submit time with no live validation, a file input (`<input type="file">`, whose `value` cannot be set programmatically by React or anything else, for browser security reasons — it is *always* uncontrolled), or a form embedded inside a performance-sensitive list where re-rendering on every keystroke is measurably too expensive.

::code-wrapper{language="javascript"}
```javascript
function AvatarUpload() {
  const fileRef = useRef(null)

  function handleSubmit(e) {
    e.preventDefault()
    const file = fileRef.current.files[0]
    if (file) uploadAvatar(file)
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* File inputs are uncontrolled by necessity — browsers refuse to let JS set .value */}
      <input type="file" ref={fileRef} accept="image/*" />
      <button type="submit">Upload</button>
    </form>
  )
}
```
::

## Handling an Entire Form's State

For forms with many fields, one `useState` per field becomes repetitive. A single object in state, updated via computed property names, scales better while remaining plain React with no library.

::code-wrapper{language="javascript"}
```javascript
function SignupForm() {
  const [form, setForm] = useState({ name: '', email: '', password: '' })

  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    submitSignup(form)
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="name" value={form.name} onChange={handleChange} />
      <input name="email" value={form.email} onChange={handleChange} />
      <input name="password" type="password" value={form.password} onChange={handleChange} />
      <button type="submit">Sign Up</button>
    </form>
  )
}
```
::

Matching each `<input>`'s `name` attribute to a key in the state object lets one `handleChange` function serve every field — a pattern that scales to dozens of fields without dozens of handler functions, at the cost of losing per-field type safety unless reinforced with TypeScript (chapter 23).

## Validation: Inline vs. On Submit

Real forms typically validate at two different times for different reasons: on every keystroke/blur for immediate feedback on obviously-wrong input, and again on submit as a final gate, since a user can submit before ever triggering a field's `onBlur`.

::code-wrapper{language="javascript"}
```javascript
function SignupForm() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  function validate(values) {
    const next = {}
    if (!values.email.includes('@')) next.email = 'Enter a valid email address'
    if (values.password.length < 8) next.password = 'Password must be at least 8 characters'
    return next
  }

  function handleBlur(e) {
    const fieldErrors = validate(form)
    setErrors(prev => ({ ...prev, [e.target.name]: fieldErrors[e.target.name] }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const fieldErrors = validate(form)
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) return

    setSubmitting(true)
    try {
      await submitSignup(form)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <input
        name="email"
        value={form.email}
        onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
        onBlur={handleBlur}
      />
      {errors.email && <p className="error">{errors.email}</p>}

      <input
        name="password"
        type="password"
        value={form.password}
        onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
        onBlur={handleBlur}
      />
      {errors.password && <p className="error">{errors.password}</p>}

      <button type="submit" disabled={submitting}>
        {submitting ? 'Signing up…' : 'Sign Up'}
      </button>
    </form>
  )
}
```
::

`noValidate` on the `<form>` disables the browser's own built-in validation UI (which varies in appearance across browsers and is hard to style consistently), delegating entirely to the custom JavaScript validation shown here — a common production choice when a form needs a consistent, brand-matched validation experience.

## Why Hand-Rolled Forms Get Painful at Scale

The pattern above is entirely correct, but notice how much of it is boilerplate that has nothing to do with *this specific form*: tracking touched/blurred state per field, re-running validation, tracking submission state, mapping error messages to fields. A form with fifteen fields, conditional fields, array fields (a dynamic list of "add another phone number" rows), and cross-field validation multiplies this boilerplate substantially — which is the gap form libraries fill.

**react-hook-form** is the most widely used solution in current React codebases; its core idea is registering *uncontrolled* inputs via a `register` function, so most fields never trigger a React re-render on keystroke, and validation/error state is managed internally and exposed through a hook.

::code-wrapper{language="javascript"}
```javascript
import { useForm } from 'react-hook-form'

function SignupForm() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm()

  async function onSubmit(data) {
    await submitSignup(data)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('email', { required: 'Email is required', pattern: { value: /@/, message: 'Invalid email' } })} />
      {errors.email && <p className="error">{errors.email.message}</p>}

      <input type="password" {...register('password', { minLength: { value: 8, message: 'Too short' } })} />
      {errors.password && <p className="error">{errors.password.message}</p>}

      <button type="submit" disabled={isSubmitting}>Sign Up</button>
    </form>
  )
}
```
::

The tradeoff is real, not one-directional: react-hook-form's uncontrolled-by-default approach means the current value of a field isn't automatically available for things like live character counters or cross-field-dependent UI without opting into `watch()`, which reintroduces re-renders for the watched fields specifically. **Formik** takes the opposite default (fully controlled, values always in state) at the cost of more re-renders on large forms. Choosing between them, or hand-rolling per this chapter's earlier examples, is a tradeoff between control/bundle-size and boilerplate reduction — not a question with one universally correct answer.

## 💡 Tips & Tricks

- **Idiom** — Default to controlled inputs for anything with validation, formatting, or cross-field logic; reach for uncontrolled only for simple submit-time-only fields or elements (like file inputs) that are uncontrolled by browser design regardless of what React wants.
- **Debug** — The "component is changing an uncontrolled input to controlled" warning almost always traces back to an initial state value of `undefined` (e.g. `useState()` with no argument) — `value={undefined}` renders as uncontrolled on the first render, then becomes controlled once state is set to a real string, tripping the warning. Always initialize form state to `''`, not `undefined`.
- **Performance** — For very large forms (50+ fields) or forms embedded in frequently-re-rendering lists, react-hook-form's uncontrolled-by-default registration avoids the per-keystroke re-render cost that a naive one-`useState`-per-field controlled approach incurs across the whole form.
- **Idiom** — Use the `name` attribute plus a single object-shaped state and one shared `handleChange` (the computed-property-name pattern) once a form exceeds roughly five fields — one `useState` call per field stops scaling readably well before that.
- **Debug** — `noValidate` on `<form>` only disables the *browser's* built-in validation popups — it does not disable HTML constraint attributes like `required`/`pattern` for CSS `:invalid` styling purposes, nor does it replace the need to actually call `e.preventDefault()` in your submit handler.

## ⚠️ Edge Cases & Gotchas

- **A controlled `<input>` with `value` set but no `onChange` handler silently rejects all keyboard input** — React overwrites the DOM value back to the unchanging state value on every render, which looks to the user like a broken, read-only-seeming field with no error thrown.
- **File inputs can never be controlled** — `<input type="file" value={...}>` throws a runtime error/warning because browsers refuse to let JavaScript set a file input's value programmatically, for security reasons (preventing pages from pre-filling a fake file path). Use `ref` and read `.files` instead, always.
- **Switching a field between controlled and uncontrolled mid-lifecycle (state starting as `undefined`, later becoming a string) triggers a development warning and can cause the DOM value to briefly desync from state** — always seed initial state with the correctly-typed empty value (`''`, `0`, `false`), never `undefined` or `null`, for any field that will eventually be controlled.
- **`defaultValue` only applies once, at mount** — changing the `defaultValue` prop on a re-render does *not* update an already-mounted uncontrolled input's current value; only remounting it (e.g. via a changed `key`, chapter 13) would reset it, which is rarely what's intended.
- **Checkbox and radio inputs use `checked`/`defaultChecked`, not `value`/`defaultValue`, to control their toggled state** — passing `value` alone to a checkbox sets the value submitted with the form but has no effect on whether it visually appears checked, a mismatch that's easy to write by habit from text-input patterns.

## 🧠 Spot the Bug

A "quantity" stepper input in a shopping cart is supposed to let users type any number, but every time they try to clear the field to type a new value, it immediately snaps back to `0`.

::code-wrapper{language="javascript"}
```javascript
function QuantityInput({ onChange }) {
  const [quantity, setQuantity] = useState(1)

  function handleChange(e) {
    const parsed = parseInt(e.target.value, 10)
    setQuantity(parsed)
    onChange(parsed)
  }

  return <input type="number" value={quantity || 0} onChange={handleChange} />
}
```
::

<details>
<summary>Answer</summary>

Clearing the input produces an empty string, and `parseInt('', 10)` returns `NaN`. `setQuantity(NaN)` sets state to `NaN`, and on the next render, `quantity || 0` evaluates: `NaN` is falsy in JavaScript, so the `||` falls through to `0` — the input is forced back to displaying `0` on every keystroke that produces an intermediate invalid/empty value, making it impossible to ever type a fresh multi-digit number by clearing the field first.

**The lesson**: when deriving a controlled input's displayed `value` from state with a fallback like `|| 0`, remember that `NaN`, `0`, and `''` are all falsy — a fallback meant to handle only the "never been set" case ends up incorrectly overriding legitimate in-progress states like a temporarily empty or unparseable field; store and display the raw string, then parse only when the value is actually needed (e.g. on submit or blur).

</details>

## Key Takeaways

- Controlled inputs keep React state as the single source of truth via `value` + `onChange`; uncontrolled inputs let the DOM track its own value, read on demand via `ref`.
- File inputs are always uncontrolled by browser design — `value` cannot be set on them programmatically under any circumstances.
- Mixing `value` without `onChange`, or letting initial state start as `undefined`, are the two most common causes of the controlled/uncontrolled warning and of inputs that silently reject typing.
- A single object in state with a shared `name`-keyed `handleChange` scales better than one `useState` per field once a form has more than a handful of fields.
- Validate on blur for immediate feedback and again on submit as a final gate — a user can reach submit without ever triggering an individual field's blur event.
- Form libraries like react-hook-form (uncontrolled-first, fewer re-renders) and Formik (controlled-first, simpler mental model) exist to remove the boilerplate of touched/error/submission tracking once hand-rolled forms get large — neither is a strictly superior default.
