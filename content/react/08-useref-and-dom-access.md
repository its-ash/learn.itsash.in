# 08 — `useRef` & DOM Access

## What `useRef` Actually Is

`useRef(initialValue)` returns a plain mutable object of the shape `{ current: initialValue }`. That object is the *same object* across every render of the component — React never replaces it, and mutating `.current` does **not** trigger a re-render. This makes refs the tool for exactly two things: holding a reference to a DOM node, and holding any mutable value you need to persist across renders without causing (or reacting to) a re-render.

::code-wrapper{language="javascript"}
```javascript
import { useRef } from 'react'

function Example() {
  const renderCount = useRef(0)
  renderCount.current += 1  // mutating a ref does NOT cause a re-render

  console.log('This component has rendered', renderCount.current, 'times')
  return <div>Check the console</div>
}
```
::

## `useRef` vs. `useState`: The Core Distinction

| | `useState` | `useRef` |
|---|---|---|
| Triggers a re-render on change? | Yes | No |
| Value available immediately after update? | No — updated on next render | Yes — `.current` updates synchronously |
| Use for | Anything the UI displays or reacts to | DOM node handles, timers, previous values, mutable flags |

::code-wrapper{language="javascript"}
```javascript
function Stopwatch() {
  const [elapsed, setElapsed] = useState(0)
  const intervalRef = useRef(null)  // holds the interval ID — not rendered, just bookkeeping

  function start() {
    intervalRef.current = setInterval(() => {
      setElapsed(e => e + 1)
    }, 1000)
  }

  function stop() {
    clearInterval(intervalRef.current)  // reading .current synchronously — always current
  }

  return (
    <div>
      <p>{elapsed}s</p>
      <button onClick={start}>Start</button>
      <button onClick={stop}>Stop</button>
    </div>
  )
}
```
::

If `intervalRef` were `useState` instead, updating it would trigger an unnecessary re-render for a value the UI never displays, and — worse — `stop()` would close over whatever `intervalId` value existed at the time `stop` itself was defined, which could be stale by the time it's clicked.

## Accessing DOM Nodes

Passing a ref object to a host element's `ref` attribute makes React populate `.current` with the actual DOM node after it mounts.

::code-wrapper{language="javascript"}
```javascript
function AutoFocusInput() {
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current.focus()  // imperative DOM call — this is exactly what refs are for
  }, [])

  return <input ref={inputRef} type="text" />
}
```
::

### Real-World Pattern: Measuring an Element

::code-wrapper{language="javascript"}
```javascript
function ResizableCard() {
  const cardRef = useRef(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const observer = new ResizeObserver(entries => {
      setWidth(entries[0].contentRect.width)
    })
    observer.observe(cardRef.current)
    return () => observer.disconnect()
  }, [])

  return <div ref={cardRef} className="card">Width: {width}px</div>
}
```
::

## `.current` Starts as `null` — Guard Accordingly

Before the component mounts (and after it unmounts), a DOM ref's `.current` is `null`. Accessing DOM properties on it during render (rather than in an effect or event handler) throws, because the DOM node doesn't exist yet at render time.

::code-wrapper{language="javascript"}
```javascript
// BUG: refs aren't attached until AFTER the DOM commits.
// Reading inputRef.current during render is always null on the first render.
function Bad() {
  const inputRef = useRef(null)
  console.log(inputRef.current.value)  // TypeError: Cannot read properties of null
  return <input ref={inputRef} />
}
```
::

::code-wrapper{language="javascript"}
```javascript
// Fixed: read the ref inside an effect (after mount) or an event handler,
// never directly in the render body.
function Good() {
  const inputRef = useRef(null)

  useEffect(() => {
    console.log(inputRef.current.value)  // safe — DOM node exists by now
  }, [])

  return <input ref={inputRef} />
}
```
::

## `forwardRef`: Passing a Ref Through a Custom Component

Refs don't automatically pass through custom components the way props do — `<MyInput ref={someRef} />` does nothing on its own, because `ref` is a special, non-prop attribute React intercepts. `forwardRef` opts a component in to receiving a ref and deciding what to attach it to.

::code-wrapper{language="javascript"}
```javascript
import { forwardRef } from 'react'

// Without forwardRef: `ref` passed to <FancyInput> is silently ignored,
// and React logs a warning: "Function components cannot be given refs."
const FancyInput = forwardRef(function FancyInput(props, ref) {
  return <input ref={ref} className="fancy-input" {...props} />
})

function Form() {
  const inputRef = useRef(null)
  return (
    <div>
      <FancyInput ref={inputRef} placeholder="Name" />
      <button onClick={() => inputRef.current.focus()}>Focus the input</button>
    </div>
  )
}
```
::

As of React 19, `ref` can be accepted as a plain prop on function components directly, and `forwardRef` is on a path to eventual deprecation — but a huge amount of real-world code (and every library published before 19) still uses `forwardRef`, so recognizing it is essential.

::code-wrapper{language="javascript"}
```javascript
// React 19+: ref as a normal prop, no forwardRef needed
function FancyInput({ ref, ...props }) {
  return <input ref={ref} className="fancy-input" {...props} />
}
```
::

## `useImperativeHandle`: Exposing a Custom Handle

Sometimes a parent needs to trigger imperative behavior on a child (focus, scroll into view, play/pause a video) without exposing the *entire* underlying DOM node. `useImperativeHandle` customizes exactly what a ref exposes.

::code-wrapper{language="javascript"}
```javascript
import { forwardRef, useImperativeHandle, useRef } from 'react'

const VideoPlayer = forwardRef(function VideoPlayer({ src }, ref) {
  const videoRef = useRef(null)

  useImperativeHandle(ref, () => ({
    play: () => videoRef.current.play(),
    pause: () => videoRef.current.pause(),
    seekTo: (seconds) => { videoRef.current.currentTime = seconds },
    // Deliberately does NOT expose videoRef.current itself —
    // the parent gets a curated API, not the raw <video> element.
  }))

  return <video ref={videoRef} src={src} />
})

function PlayerControls() {
  const playerRef = useRef(null)
  return (
    <div>
      <VideoPlayer ref={playerRef} src="/demo.mp4" />
      <button onClick={() => playerRef.current.play()}>Play</button>
      <button onClick={() => playerRef.current.seekTo(30)}>Skip to 0:30</button>
    </div>
  )
}
```
::

This is deliberately rare in application code — reach for it only when building a reusable component library primitive (video players, modals, form field libraries) where callers genuinely need imperative control that can't be expressed declaratively through props.

## Storing Previous Values (a Common Ref Idiom)

Refs are the standard way to remember "what was this value last render," since state itself can't easily look backward.

::code-wrapper{language="javascript"}
```javascript
function usePrevious(value) {
  const ref = useRef(undefined)
  useEffect(() => {
    ref.current = value  // runs AFTER render, so during render ref.current is still the OLD value
  })
  return ref.current
}

function PriceTicker({ price }) {
  const previousPrice = usePrevious(price)
  const direction = previousPrice === undefined
    ? 'flat'
    : price > previousPrice ? 'up' : price < previousPrice ? 'down' : 'flat'

  return <span className={`ticker ticker--${direction}`}>${price.toFixed(2)}</span>
}
```
::

The ordering here is the entire trick: because the effect (which writes the new value into the ref) runs *after* render, the render itself always sees last render's value still sitting in `ref.current` — timing, not magic.

## Mutable Instance Variables (Class Component Analogy)

For developers coming from classes, a ref that holds a non-DOM mutable value is the function-component equivalent of an instance property (`this.someValue = ...`) that isn't meant to trigger a re-render.

::code-wrapper{language="javascript"}
```javascript
function ClickTracker() {
  const clickTimestamps = useRef([])  // analogous to `this.clickTimestamps` in a class

  function handleClick() {
    clickTimestamps.current.push(Date.now())
    if (clickTimestamps.current.length > 5) {
      console.warn('Possible bot activity: 5+ clicks recorded')
    }
  }

  return <button onClick={handleClick}>Click me</button>
}
```
::

## 💡 Tips & Tricks

- **Idiom** — Reach for `useRef` (not `useState`) for any value the component needs to remember across renders but never displays or branches its JSX on — timer IDs, previous values, mutable counters, imperative DOM handles all qualify.
- **Debug** — If a ref's `.current` is unexpectedly `null` when you try to use it, check *when* you're reading it: render-time reads are always too early for DOM refs (nothing has mounted yet) — move the read into `useEffect` or an event handler.
- **Idiom** — Use `useImperativeHandle` sparingly and only at true component-library boundaries; if you find yourself reaching for it inside ordinary feature/application code, it's usually a sign the interaction should be modeled declaratively through props and state instead.
- **Portability** — `forwardRef` remains necessary for any component that must work across React versions before 19; React 19+ allows `ref` as a plain prop, but published libraries widely still use `forwardRef` for backward compatibility, so recognize both forms.
- **Performance** — Mutating `ref.current` in a tight loop (e.g., tracking mouse position on every `mousemove`) is one of the few really good reasons to bypass `useState` — updating state on every mouse-move event would trigger a re-render per pixel of movement, while a ref absorbs the writes with zero rendering cost until you actually need to surface a value.

## ⚠️ Edge Cases & Gotchas

- **Mutating `ref.current` doesn't re-render — so don't use it for anything the UI needs to reflect** — a value stored purely in a ref can go stale on screen indefinitely; if the JSX needs to change in response to it, that value belongs in `useState` (or `useReducer`), not a ref.
- **A DOM ref's `.current` is `null` before mount, during unmount, and if the element is conditionally not rendered** — `{show && <input ref={inputRef} />}` means `inputRef.current` is `null` whenever `show` is `false`, so code that reaches for it unconditionally in an effect can throw depending on render order/timing.
- **`ref` passed to a custom function component is silently dropped without `forwardRef`** — no error, no warning in some React versions, no visual symptom — the ref object simply never gets its `.current` populated, and code depending on it fails with a `null` read somewhere downstream, far from the actual cause.
- **Refs don't participate in the props/state diffing that triggers effects** — putting a ref object itself in a `useEffect` dependency array is pointless, because the ref object's identity never changes across renders (it's the same object every time), so the effect will never re-run due to the ref "changing," even as `.current`'s contents change freely underneath it.
- **In `<StrictMode>`, callback refs may fire more than once during development** — React 18's Strict Mode intentionally mounts, unmounts, and remounts components once to test resilience, calling ref callbacks (`ref={el => ...}`) with `null` and then the element again — code that assumes a ref callback fires exactly once should instead be written to tolerate re-attachment.

## 🧠 Spot the Bug

A component tries to show how many times the user has clicked a button, live, in the UI.

::code-wrapper{language="javascript"}
```javascript
function ClickCounter() {
  const countRef = useRef(0)

  function handleClick() {
    countRef.current += 1
  }

  return (
    <div>
      <p>Clicked {countRef.current} times</p>
      <button onClick={handleClick}>Click me</button>
    </div>
  )
}
```
::

<details>
<summary>Answer</summary>

`countRef.current` does update on every click — but mutating a ref never schedules a re-render, so React never re-runs this component to reflect the new value. The paragraph stays frozen at whatever `countRef.current` was during the last render triggered by *something else*, even though the underlying number is silently climbing in memory.

**The lesson**: use `useRef` only for values the UI doesn't need to visually react to; anything displayed in JSX that must update on screen needs `useState` (or `useReducer`), because only those hooks' setters actually schedule a re-render.

</details>

## Key Takeaways

- `useRef` returns a stable `{ current }` object across renders; mutating `.current` never triggers a re-render — use it for DOM handles and non-visual mutable bookkeeping.
- A DOM ref's `.current` is `null` until after mount — read it in effects or event handlers, never directly during render.
- `forwardRef` lets a custom component receive and attach a parent's ref (React 19+ also allows `ref` as a plain prop).
- `useImperativeHandle` customizes exactly what a ref exposes to a parent — a rare, library-boundary tool, not an everyday pattern.
- Refs are the standard mechanism for remembering "the previous render's value" (via an effect that writes after render) since state alone can't look backward.
- Never use a ref for anything the JSX needs to reflect on screen — that always requires state.
