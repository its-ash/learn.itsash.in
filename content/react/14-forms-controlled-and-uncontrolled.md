---
title: "14 — Forms: Controlled & Uncontrolled"
description: "Controlled vs uncontrolled inputs, the controlled input loop, file inputs, defaultValues, FormData submission, validation patterns, multi-field forms with useReducer, uncontrolled with useRef. Code-first reference for mid-to-senior React engineers."
---

# 14 — Forms: Controlled & Uncontrolled

## The Core Distinction

::code-wrapper{language="javascript" filename="core_distinction.js"}
```javascript
import { useState, useRef, useReducer, useCallback } from 'react'

// Every HTML form element has its own internal DOM state (the browser tracks the
// value). In React, you must decide PER FIELD whether React or the DOM owns that state.

// ── CONTROLLED: React owns the value ──
// value={state} + onChange={update state} → React state is the single source of truth.
// Every keystroke: DOM → onChange → setState → re-render → value prop → DOM.
// The displayed value can never diverge from React state.

function ControlledInput() {
  const [email, setEmail] = useState('')
  return (
    <input
      type="email"
      value={email}
      onChange={e => setEmail(e.target.value)}
    />
  )
}

// ── UNCONTROLLED: the DOM owns the value ──
// defaultValue={initial} (set once on mount) + ref to read the value when needed.
// React does NOT control the value — the browser manages it as users type.

function UncontrolledInput() {
  const inputRef = useRef(null)

  function handleSubmit(e) {
    e.preventDefault()
    console.log(inputRef.current.value)
  }

  return (
    <form onSubmit={handleSubmit}>
      <input type="text" defaultValue="" ref={inputRef} />
      <button type="submit">Submit</button>
    </form>
  )
}
```
::

## The Controlled Input Loop

::code-wrapper{language="javascript" filename="controlled_loop.js"}
```javascript
import { useState } from 'react'

// The one-way data flow of a controlled input:
//   User types 'h' → DOM input event → onChange: setEmail('h') → state = 'h'
//   → component re-renders → <input value="h" /> → React updates DOM → DOM displays 'h'
// This loop ensures the DOM value and React state can NEVER diverge.
// The cost: a re-render on every keystroke. For most forms, negligible.

// ANTI-PATTERN: value without onChange — silently rejects all typing
function BrokenReadOnlyInput() {
  const [name] = useState('')
  return <input value={name} />
  // Every keystroke: React re-renders, value is still '' → DOM reset to ''.
  // The user's typed character is immediately overwritten. Looks read-only.
}

// ANTI-PATTERN: value={undefined} on first render → controlled/uncontrolled warning
function FlakyInput({ initialValue }) {
  const [value, setValue] = useState(initialValue)  // undefined if not passed
  return <input value={value} onChange={e => setValue(e.target.value)} />
  // First render: value={undefined} → uncontrolled. After keystroke: controlled.
  // React warns: "changing an uncontrolled input to be controlled."
}

// CORRECT: always initialize to a properly-typed empty value
function SafeInput({ initialValue }) {
  const [value, setValue] = useState(initialValue ?? '')
  return <input value={value} onChange={e => setValue(e.target.value)} />
}
```
::

## Controlled Input with Live Transformation

::code-wrapper{language="javascript" filename="live_transformation.js"}
```javascript
import { useState } from 'react'

// The power of controlled inputs: transform/filter/format on every keystroke
// because the value flows through your state on every change.

function PhoneInput() {
  const [digits, setDigits] = useState('')

  function handleChange(e) {
    const onlyDigits = e.target.value.replace(/\D/g, '').slice(0, 10)
    setDigits(onlyDigits)
  }

  const formatted = digits.replace(/(\d{3})(\d{0,3})(\d{0,4})/, (_, a, b, c) =>
    [a, b, c].filter(Boolean).join('-')
  )

  return (
    <input
      type="tel"
      value={formatted}
      onChange={handleChange}
      placeholder="555-123-4567"
    />
  )
  // User types "5551234567" → sees "555-123-4567" → state stores "5551234567"
}

function UpperCaseInput() {
  const [value, setValue] = useState('')
  return (
    <input
      value={value}
      onChange={e => setValue(e.target.value.toUpperCase())}
      placeholder="AUTO-UPPERCASE"
    />
  )
}

function AgeInput() {
  const [age, setAge] = useState('')
  function handleChange(e) {
    const raw = e.target.value.replace(/\D/g, '')
    const num = raw === '' ? '' : Math.min(150, Math.max(0, parseInt(raw, 10)))
    setAge(num)
  }
  return <input type="number" value={age} onChange={handleChange} min={0} max={150} />
}
```
::

## Uncontrolled Inputs with useRef

::code-wrapper{language="javascript" filename="uncontrolled_useRef.js"}
```javascript
import { useRef } from 'react'

// Uncontrolled inputs are simpler for forms that only need the value at submit time.
// No re-render on every keystroke — the DOM manages its own value.

function SimpleContactForm() {
  const nameRef = useRef(null)
  const emailRef = useRef(null)
  const messageRef = useRef(null)

  function handleSubmit(e) {
    e.preventDefault()
    const data = {
      name: nameRef.current.value,
      email: emailRef.current.value,
      message: messageRef.current.value,
    }
    submitContactForm(data)
  }

  return (
    <form onSubmit={handleSubmit}>
      <input type="text" name="name" defaultValue="" ref={nameRef} required />
      <input type="email" name="email" defaultValue="" ref={emailRef} required />
      <textarea name="message" defaultValue="" ref={messageRef} required />
      <button type="submit">Send</button>
    </form>
  )
  // Pros: no per-keystroke re-renders, less code for simple forms.
  // Cons: can't validate/format/react to the value live.
}

function ResettableForm() {
  const formRef = useRef(null)

  function handleSubmit(e) {
    e.preventDefault()
    const formData = new FormData(e.target)
    submitData(Object.fromEntries(formData))
    e.target.reset()
  }

  return (
    <form onSubmit={handleSubmit} ref={formRef}>
      <input name="username" defaultValue="" />
      <input name="bio" defaultValue="" />
      <button type="submit">Submit</button>
      <button type="button" onClick={() => formRef.current.reset()}>Reset</button>
    </form>
  )
}
```
::

## File Inputs (Always Uncontrolled)

::code-wrapper{language="javascript" filename="file_inputs.js"}
```javascript
import { useRef, useState } from 'react'

// File inputs are ALWAYS uncontrolled — browsers refuse to let JavaScript set
// the .value of a file input programmatically (security: prevents pre-filling
// a fake file path).

function AvatarUpload() {
  const fileRef = useRef(null)
  const [preview, setPreview] = useState(null)

  function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      e.target.value = ''
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('File too large (max 5MB)')
      e.target.value = ''
      return
    }

    setPreview(URL.createObjectURL(file))
  }

  function handleSubmit(e) {
    e.preventDefault()
    const file = fileRef.current.files[0]
    if (file) uploadAvatar(file)
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="file"
        ref={fileRef}
        accept="image/*"
        onChange={handleFileChange}
      />
      {preview && <img src={preview} alt="Preview" style={{ maxWidth: 200 }} />}
      <button type="submit">Upload</button>
    </form>
  )
}

function MultiFileUpload() {
  const filesRef = useRef(null)

  function handleSubmit(e) {
    e.preventDefault()
    const files = Array.from(filesRef.current.files)
    const validFiles = files.filter(f => f.size < 10 * 1024 * 1024)
    uploadFiles(validFiles)
  }

  return (
    <form onSubmit={handleSubmit}>
      <input type="file" ref={filesRef} multiple accept=".pdf,.doc,.docx" />
      <button type="submit">Upload</button>
    </form>
  )
}

// ANTI-PATTERN: trying to make a file input controlled
function BrokenFileInput() {
  const [file, setFile] = useState(null)
  return (
    <input
      type="file"
      value={file}
      onChange={e => setFile(e.target.value)}
    />
  )
  // React warning: "File inputs are always uncontrolled."
  // e.target.value gives a fake path string — useless. Use e.target.files + ref.
}
```
::

## defaultValues and defaultValue Gotchas

::code-wrapper{language="javascript" filename="defaultvalues.js"}
```javascript
import { useRef, useState, useEffect } from 'react'

// defaultValue/defaultChecked set the INITIAL DOM value on mount, then React
// stops touching the input. Changing defaultValue on re-render does NOT update
// the input's current value.

function PrefilledForm({ user }) {
  return (
    <form>
      <input name="name" defaultValue={user.name} />
      <input name="email" defaultValue={user.email} />
      {/* Set ONCE on mount. If user prop changes after mount, inputs do NOT update. */}
    </form>
  )
}

// FIX 1: Force remount with key when the data source changes
function EditProfileKeyRemount({ user }) {
  return <input key={user.id} defaultValue={user.name} />
  // Changing user.id → key changes → remount → defaultValue re-applies.
}

// FIX 2: Use controlled input — value always reflects current prop/state
function EditProfileControlled({ user }) {
  const [name, setName] = useState(user.name)
  useEffect(() => setName(user.name), [user.name])
  return <input value={name} onChange={e => setName(e.target.value)} />
}

// defaultChecked for checkboxes and radios
function CheckboxUncontrolled() {
  return (
    <label>
      <input type="checkbox" defaultChecked={true} />
      Subscribe to newsletter
    </label>
  )
}

// ANTI-PATTERN: using value/defaultValue on a checkbox
function BrokenCheckbox() {
  return <input type="checkbox" value={true} />
  // `value` on a checkbox sets the FORM SUBMISSION value, NOT whether it's checked.
  // Use `checked` (controlled) or `defaultChecked` (uncontrolled).
}
```
::

## Form Submission with FormData

::code-wrapper{language="javascript" filename="formdata_submission.js"}
```javascript
import { useRef, useState } from 'react'

// FormData reads all named fields from a <form> in one call — works with both
// controlled and uncontrolled inputs. The `name` attribute on each field is required.

function SignupFormFormData() {
  const formRef = useRef(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    const formData = new FormData(e.target)

    const data = Object.fromEntries(formData.entries())
    // { name: "Alice", email: "alice@example.com", password: "secret" }

    // For multi-value fields (checkboxes with same name), use getAll:
    // const interests = formData.getAll('interests')  → ["sports", "music"]

    setSubmitting(true)
    try {
      await api.signup(data)
      formRef.current.reset()
    } catch (err) {
      console.error('Signup failed:', err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} ref={formRef}>
      <input name="name" type="text" required />
      <input name="email" type="email" required />
      <input name="password" type="password" required />

      <label><input type="checkbox" name="interests" value="sports" /> Sports</label>
      <label><input type="checkbox" name="interests" value="music" /> Music</label>
      <label><input type="checkbox" name="interests" value="reading" /> Reading</label>

      <button type="submit" disabled={submitting}>
        {submitting ? 'Creating account…' : 'Sign Up'}
      </button>
    </form>
  )
}

// Sending FormData directly as multipart/form-data (for file uploads)
function UploadWithFormData() {
  async function handleSubmit(e) {
    e.preventDefault()
    const formData = new FormData(e.target)
    // Don't set Content-Type — the browser sets it automatically with the
    // correct multipart boundary when you pass FormData to fetch.
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    })
    return res.json()
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="title" type="text" required />
      <input name="file" type="file" required />
      <button type="submit">Upload</button>
    </form>
  )
}
```
::

## Multi-Field Form with useState (Object State)

::code-wrapper{language="javascript" filename="multifield_usestate.js"}
```javascript
import { useState } from 'react'

// One useState per field works for 2-3 fields. Beyond that, a single state object
// with a shared change handler scales better. The `name` attribute maps to state keys.

function SignupForm() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  })

  function handleChange(e) {
    const { name, value, type, checked } = e.target
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (form.password !== form.confirmPassword) {
      alert('Passwords do not match')
      return
    }
    submitSignup(form)
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="name"      value={form.name}      onChange={handleChange} required />
      <input name="email"     value={form.email}     onChange={handleChange} type="email" required />
      <input name="password"  value={form.password}  onChange={handleChange} type="password" required />
      <input name="confirmPassword" value={form.confirmPassword} onChange={handleChange} type="password" required />
      <button type="submit">Sign Up</button>
    </form>
  )
  // The computed property name [name]: value makes one handler work for every field.
  // Trade-off: setForm replaces the entire object on every keystroke, re-rendering
  // all fields. For 5-15 fields, fine. For 50+ fields, consider uncontrolled.
}
```
::

## Multi-Field Form with useReducer (Complex State)

::code-wrapper{language="javascript" filename="multifield_usereducer.js"}
```javascript
import { useReducer, useCallback } from 'react'

// For forms with complex state transitions (validation, multi-step, dependent fields,
// async submit state), useReducer is more maintainable than multiple useState calls.
// See Ch 10 (useReducer) for the reducer fundamentals.

const initialState = {
  values: { name: '', email: '', password: '', role: 'member' },
  errors: {},
  touched: {},
  status: 'idle',  // 'idle' | 'validating' | 'submitting' | 'success' | 'error'
  submitError: null,
}

function formReducer(state, action) {
  switch (action.type) {
    case 'FIELD_CHANGE': {
      const { name, value } = action
      return {
        ...state,
        values: { ...state.values, [name]: value },
        errors: { ...state.errors, [name]: undefined },
      }
    }
    case 'FIELD_BLUR': {
      const { name } = action
      return {
        ...state,
        touched: { ...state.touched, [name]: true },
        errors: { ...state.errors, [name]: action.error },
      }
    }
    case 'VALIDATE':
      return { ...state, errors: action.errors, status: 'idle' }
    case 'SUBMIT_START':
      return { ...state, status: 'submitting', submitError: null }
    case 'SUBMIT_SUCCESS':
      return { ...state, status: 'success' }
    case 'SUBMIT_ERROR':
      return { ...state, status: 'error', submitError: action.error }
    case 'RESET':
      return { ...initialState, values: { ...initialState.values } }
    default:
      return state
  }
}

const validators = {
  name: (val) => val.length < 2 ? 'Name must be at least 2 characters' : undefined,
  email: (val) => !val.includes('@') ? 'Enter a valid email' : undefined,
  password: (val) => val.length < 8 ? 'Password must be at least 8 characters' : undefined,
}

function validateAll(values) {
  const errors = {}
  for (const [field, validate] of Object.entries(validators)) {
    const error = validate(values[field])
    if (error) errors[field] = error
  }
  return errors
}

function ComplexSignupForm({ onSubmit }) {
  const [state, dispatch] = useReducer(formReducer, initialState)
  const { values, errors, touched, status, submitError } = state

  const handleChange = useCallback((e) => {
    const { name, value } = e.target
    dispatch({ type: 'FIELD_CHANGE', name, value })
  }, [])

  const handleBlur = useCallback((e) => {
    const { name } = e.target
    const error = validators[name]?.(values[name])
    dispatch({ type: 'FIELD_BLUR', name, error })
  }, [values])

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault()
    const allErrors = validateAll(values)
    dispatch({ type: 'VALIDATE', errors: allErrors })
    if (Object.keys(allErrors).length > 0) return

    dispatch({ type: 'SUBMIT_START' })
    try {
      await onSubmit(values)
      dispatch({ type: 'SUBMIT_SUCCESS' })
    } catch (err) {
      dispatch({ type: 'SUBMIT_ERROR', error: err.message })
    }
  }, [values, onSubmit])

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div>
        <input
          name="name"
          value={values.name}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder="Name"
        />
        {touched.name && errors.name && <p className="error">{errors.name}</p>}
      </div>

      <div>
        <input
          name="email"
          type="email"
          value={values.email}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder="Email"
        />
        {touched.email && errors.email && <p className="error">{errors.email}</p>}
      </div>

      <div>
        <input
          name="password"
          type="password"
          value={values.password}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder="Password"
        />
        {touched.password && errors.password && <p className="error">{errors.password}</p>}
      </div>

      <div>
        <select name="role" value={values.role} onChange={handleChange}>
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      <button type="submit" disabled={status === 'submitting'}>
        {status === 'submitting' ? 'Creating…' : 'Sign Up'}
      </button>

      {status === 'error' && <p className="error">Signup failed: {submitError}</p>}
      {status === 'success' && <p className="success">Account created!</p>}
    </form>
  )
  // useReducer keeps all form state transitions in one testable reducer function.
  // The component stays declarative — dispatch actions, read state, render.
}
```
::

## Validation Patterns

::code-wrapper{language="javascript" filename="validation_patterns.js"}
```javascript
import { useState, useCallback } from 'react'

// Validate on blur (immediate feedback) + validate on submit (final gate)
function ValidatedForm() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})

  function validate(values) {
    const next = {}
    if (!values.email) next.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) next.email = 'Invalid email format'
    if (!values.password) next.password = 'Password is required'
    else if (values.password.length < 8) next.password = 'Password must be 8+ characters'
    return next
  }

  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
    if (touched[name]) {
      setErrors(validate({ ...form, [name]: value }))
    }
  }

  function handleBlur(e) {
    const { name } = e.target
    setTouched(prev => ({ ...prev, [name]: true }))
    const fieldErrors = validate(form)
    setErrors(prev => ({ ...prev, [name]: fieldErrors[name] }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const fieldErrors = validate(form)
    setErrors(fieldErrors)
    setTouched({ email: true, password: true })
    if (Object.keys(fieldErrors).length > 0) return
    await submitForm(form)
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <input
        name="email"
        value={form.email}
        onChange={handleChange}
        onBlur={handleBlur}
      />
      {touched.email && errors.email && <span className="error">{errors.email}</span>}

      <input
        name="password"
        type="password"
        value={form.password}
        onChange={handleChange}
        onBlur={handleBlur}
      />
      {touched.password && errors.password && <span className="error">{errors.password}</span>}

      <button type="submit">Submit</button>
    </form>
  )
  // noValidate disables browser validation popups — we use custom JS validation.
  // HTML constraint attributes (required, pattern) still work for CSS :invalid.
}

// Cross-field validation
function PasswordMatchForm() {
  const [form, setForm] = useState({ password: '', confirmPassword: '' })
  const [errors, setErrors] = useState({})

  function validate(values) {
    const next = {}
    if (values.password !== values.confirmPassword) {
      next.confirmPassword = 'Passwords do not match'
    }
    return next
  }

  function handleSubmit(e) {
    e.preventDefault()
    const fieldErrors = validate(form)
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length === 0) submit(form)
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <input
        name="password"
        type="password"
        value={form.password}
        onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
      />
      <input
        name="confirmPassword"
        type="password"
        value={form.confirmPassword}
        onChange={e => {
          const next = { ...form, confirmPassword: e.target.value }
          setForm(next)
          setErrors(validate(next))
        }}
      />
      {errors.confirmPassword && <span className="error">{errors.confirmPassword}</span>}
      <button type="submit">Submit</button>
    </form>
  )
}
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript" filename="tips.js"}
```javascript
// [Idiom] Default to controlled for anything with validation, formatting, or cross-field
// logic. Reach for uncontrolled only for simple submit-time-only fields or file inputs.

// [Debug] "Component is changing an uncontrolled input to controlled" → initial state
// is undefined. useState() with no arg → undefined → value={undefined} = uncontrolled.
// Always initialize: useState('') for text, useState(false) for checkboxes.

// [Performance] For 50+ field forms or forms in frequently-re-rendering lists,
// react-hook-form's uncontrolled-by-default registration avoids per-keystroke re-renders.

// [Idiom] Use a single state object + name-attribute-keyed handleChange once a form
// exceeds ~5 fields. One useState per field stops scaling readably before that.

// [Debug] noValidate on <form> disables browser validation POPUPS only.
// HTML constraint attributes (required, pattern) still work for CSS :invalid styling.
// You still need e.preventDefault() in your submit handler regardless.

// [Idiom] For complex forms (multi-step, dependent validation, async submit state),
// useReducer centralizes all state transitions in one testable function. See Ch 10.

// [Safety] Always clean up object URLs: URL.revokeObjectURL(previewUrl) in a useEffect
// cleanup. Failing to revoke leaks memory (the blob stays until page unloads).
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript" filename="edge_cases.js"}
```javascript
// [Gotcha] Controlled input with value but NO onChange → silently rejects all keyboard
// input. React overwrites the DOM value back to the unchanging state on every render.
// No error thrown — the input just looks broken/read-only.

// [Gotcha] File inputs can NEVER be controlled. Browsers refuse to let JS set a file
// input's value (security). Always use ref + .files[0].

// [Gotcha] Switching between controlled and uncontrolled mid-lifecycle (state starts
// as undefined, becomes a string) triggers the controlled/uncontrolled warning.
// Always seed initial state with a typed empty value: '', 0, false — never undefined/null.

// [Gotcha] defaultValue only applies ONCE at mount. Changing defaultValue on re-render
// does NOT update an already-mounted uncontrolled input. Remount via key or go controlled.

// [Gotcha] Checkboxes and radios use checked/defaultChecked, NOT value/defaultValue.
// Passing value to a checkbox sets the form submission value but does NOT control
// whether it's checked.

// [Gotcha] <select multiple> with value={state} expects an ARRAY of selected option
// values, not a single string. value={['apple', 'banana']} not value="apple".

// [Gotcha] <input type="number"> with value={NaN}: parseInt('') returns NaN,
// NaN || 0 evaluates to 0 (NaN is falsy). The input snaps to 0 when the user
// tries to clear it. Store the raw string and parse only on submit/blur.

// [Gotcha] FormData.entries() returns only the LAST value for fields with duplicate
// names (multiple checkboxes with name="interests"). Use formData.getAll('interests')
// to get all values as an array.
```
::

## 🧠 Spot the Bug

A "quantity" stepper input is supposed to let users type any number, but every time they try to clear the field to type a new value, it immediately snaps back to `0`:

::code-wrapper{language="javascript" filename="spot_the_bug.js"}
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

Clearing the input produces an empty string, and `parseInt('', 10)` returns `NaN`. `setQuantity(NaN)` sets state to `NaN`, and on the next render, `quantity || 0` evaluates: `NaN` is falsy in JavaScript, so the `||` falls through to `0` — the input is forced back to displaying `0` on every keystroke that produces an intermediate empty/invalid value. The user can never clear the field to type a fresh multi-digit number.

**Fix**: store the raw string, display it directly, and parse only when the value is actually needed:

```javascript
function QuantityInput({ onChange }) {
  const [rawValue, setRawValue] = useState('1')

  function handleChange(e) {
    const str = e.target.value
    setRawValue(str)
    const parsed = parseInt(str, 10)
    if (!isNaN(parsed)) onChange(parsed)
  }

  return <input type="number" value={rawValue} onChange={handleChange} />
}
```

By storing the raw string, the input can display `''` (empty) while the user types — no `|| 0` fallback fighting the user. The numeric parse happens only for the `onChange` callback, guarded by `isNaN`.

</details>

## Key Takeaways

::code-wrapper{language="javascript" filename="key_takeaways.js"}
```javascript
// 1. Controlled: value={state} + onChange → React owns the value, re-renders per keystroke.
//    Uncontrolled: defaultValue + ref → DOM owns the value, read on demand at submit.

// 2. Always initialize controlled state to a typed empty value ('', 0, false) —
//    never undefined/null. undefined → uncontrolled first render → warning.

// 3. File inputs are ALWAYS uncontrolled by browser design. Use ref + .files[0].

// 4. defaultValue/defaultChecked apply ONCE at mount — do NOT update on re-render.
//    To sync with changing props: remount via key, or switch to controlled.

// 5. FormData reads all named fields in one call. Use getAll() for multi-value fields.
//    Pass FormData directly to fetch body for multipart/form-data file uploads.

// 6. 2-3 fields: one useState per field. 5-15: single state object + name-keyed handler.
//    Complex (multi-step, dependent validation, async submit): useReducer. See Ch 10.

// 7. Validate on blur for immediate feedback + validate on submit as a final gate.
//    noValidate disables browser popups but NOT CSS :invalid — HTML constraints still apply.

// 8. Checkboxes/radios use checked/defaultChecked, NOT value/defaultValue.
//    <select multiple> expects an array of values, not a string.
```
::