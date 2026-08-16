# 12 — Interfaces

Interfaces are Go's abstraction mechanism — a set of method signatures. Unlike Java/C#, Go interfaces are **satisfied implicitly** (no `implements` keyword). This is Go's most distinctive design choice.

## Declaration

::code-wrapper{language="go"}
```go
type Speaker interface {
	Speak() string
}

type Dog struct{}
func (d Dog) Speak() string { return "Woof" }

type Cat struct{}
func (c Cat) Speak() string { return "Meow" }

var s Speaker
s = Dog{}
fmt.Println(s.Speak())   // Woof
s = Cat{}
fmt.Println(s.Speak())   // Meow
``
::

`Dog` and `Cat` satisfy `Speaker` automatically — they have a `Speak() string` method. No declaration of intent is needed.

## Implicit Satisfaction

The type doesn't declare "I implement Speaker" — the compiler checks that all the interface's methods are present on the type. This has profound implications:

- **Decoupling**: a type can satisfy an interface defined in a different package, without knowing the interface exists.
- **Retroactive**: you can define an interface after the types exist — "I need anything with a `Write([]byte) (int, error)` method" defines `io.Writer`, satisfied by `os.File`, `bytes.Buffer`, etc.
- **No inheritance hierarchy**: no base/derived, no virtual dispatch tables to maintain.

### Compile-time interface check

To assert that a type satisfies an interface (catching breakage when the type or interface changes):

::code-wrapper{language="go"}
```go
var _ Speaker = Dog{}        // compile error if Dog doesn't satisfy Speaker
var _ Speaker = (*Dog)(nil)  // for pointer-receiver methods
``
::

This is a common idiom in library code — a compile-time assertion that the interface is satisfied.

## The Empty Interface `interface{}` / `any`

`interface{}` (Go 1.18+ alias: `any`) has no methods — **every type satisfies it**:

::code-wrapper{language="go"}
```go
var x any
x = 5
x = "hello"
x = []int{1, 2, 3}
fmt.Println(x)   // works for any value
``
::

`any` is the escape hatch for "I don't know the type" (like `Object` in Java or `void*` in C). But it loses type safety — you must type-assert (chapter 13) to use the value. Prefer specific interfaces over `any` wherever possible.

## Interface Internals

An interface value is a **(type, value) pair** (a "tuple"):

::code-wrapper{language="go"}
```go
var s Speaker = Dog{}
// s holds (Dog, Dog{})
``
::

- The **type** is the concrete type (`Dog`).
- The **value** is a copy of the concrete value (`Dog{}`).

This pair is why interfaces work — the runtime knows the concrete type and can dispatch to the right method. It's also why the nil-interface trap (below) exists.

## The Nil Interface Trap

::code-wrapper{language="go"}
```go
var p *Dog = nil
var s Speaker = p      // s holds (*Dog, nil)
fmt.Println(s == nil)  // FALSE — s is not a nil interface
s.Speak()              // may panic (nil pointer dereference inside Speak)
``
::

An interface is `nil` only when **both** its type and value are `nil`. `var s Speaker = p` (where `p` is a nil `*Dog`) gives `s` a type (`*Dog`) and a nil value — `s` is **not** a nil interface, even though the concrete value is nil. Calling a method on it dispatches to `*Dog`'s method with a nil receiver — often a panic.

This is the #1 interface gotcha. To return a nil interface, return `nil` directly (not a nil pointer of a concrete type):

::code-wrapper{language="go"}
```go
func getSpeaker() Speaker {
	var p *Dog = nil
	return p            // ❌ returns a non-nil interface wrapping a nil pointer
}

func getSpeakerGood() Speaker {
	return nil          // ✅ returns a nil interface
}
``
::

## Interface Composition

Interfaces can embed other interfaces (combining method sets):

::code-wrapper{language="go"}
```go
type ReadWriter interface {
	io.Reader
	io.Writer
}

// Equivalent to:
type ReadWriter interface {
	Read(p []byte) (n int, err error)
	Write(p []byte) (n int, err error)
}
``
::

The standard library uses this heavily: `io.ReadWriter` = `Reader` + `Writer`, `io.ReadWriteCloser` = `Reader` + `Writer` + `Closer`.

## Small Interfaces (the Go idiom)

Go favors **small, focused interfaces** — often a single method:

- `io.Reader` — `Read(p []byte) (int, error)`
- `io.Writer` — `Write(p []byte) (int, error)`
- `fmt.Stringer` — `String() string`
- `error` — `Error() string`
- `sort.Interface` — `Len()`, `Less(i, j int) bool`, `Swap(i, j int)`

Small interfaces are easy to satisfy, compose, and mock. The Go proverb: **"The bigger the interface, the weaker the abstraction."** Define interfaces where they're *used* (consumer-side), not where types are defined (producer-side).

## Accept Interfaces, Return Concrete Types

A Go idiom: functions accept interface types (for flexibility) but return concrete types (for clarity):

::code-wrapper{language="go"}
```go
func process(r io.Reader) *Result {   // accept the smallest interface that works
	// ...
	return &Result{}                   // return a concrete type
}
``
::

This keeps the function flexible (accepts any `Reader`) while giving callers a concrete, inspectable result.

## Type Assertion (preview, chapter 13)

::code-wrapper{language="go"}
```go
var s Speaker = Dog{}
d := s.(Dog)          // type assertion — panics if s isn't a Dog
d, ok := s.(Dog)      // comma-ok — ok is false if s isn't a Dog
``
::

## 💡 Tips & Tricks

- **Idiom**: define interfaces where they're *used* (consumer-side), not where types are defined (producer-side) — a function that needs `io.Reader` should declare the interface locally (or use the stdlib's), not require types to implement a "Readable" interface in their package. This keeps interfaces small and decoupled.
- **Idiom**: keep interfaces small (1-3 methods) — "the bigger the interface, the weaker the abstraction." `io.Reader` (one method) is satisfied by hundreds of types; a 20-method interface is satisfied by one. Compose small interfaces (`io.ReadWriter = Reader + Writer`) rather than defining large ones.
- **Idiom**: "accept interfaces, return concrete types" — functions take interface parameters (flexible, mockable) but return concrete types (clear, inspectable). Returning an interface forces callers into type assertions; a concrete type is directly usable.
- **Idiom**: use `var _ I = T{}` as a compile-time assertion that `T` satisfies `I` — catches breakage when a method is removed from `T` or added to `I`, at compile time rather than at a distant call site.
- **Debug**: the nil-interface trap — `var s Speaker = (*Dog)(nil); s == nil` is `false` (the interface has a type, `*Dog`, so it's non-nil). To return a nil interface, return `nil` directly, not a nil pointer of a concrete type. This is the #1 interface bug.

## ⚠️ Edge Cases & Gotchas

- **The nil interface trap**: `var s Speaker = (*Dog)(nil); s == nil` is `false` — the interface wraps a (*Dog, nil) pair, so it's non-nil. Calling a method panics (nil receiver). Return `nil` directly for a nil interface.
- **Interfaces are satisfied by method set**: a value type satisfies only value-receiver methods; a pointer type satisfies all methods. `var s Speaker = T{}` fails if `Speaker` requires a pointer-receiver method — use `&T{}`.
- **Interfaces can't be fields of themselves directly** (infinite size) — but `any` can hold anything, so `any` works.
- **`interface{}` / `any` loses type safety**: you must type-assert to use the value. Prefer specific interfaces; reserve `any` for genuine "any value" cases (`fmt.Println`, `json.Marshal`).
- **No method on `interface{}`**: `any` has no methods — calling anything on an `any` value requires a type assertion first.
- **Interface comparison**: interfaces are comparable with `==` if their dynamic types are comparable. Comparing interfaces holding slices/maps/functions panics at runtime.
- **Embedding an interface in a struct**: `type S struct { io.Reader }` — `S` has a `Reader` field (an interface); `S` satisfies `io.Reader` via promotion. Useful for decorating/delegating (e.g., wrapping a `Reader` to add logging).
- **Nil pointer receiver method call**: `var p *Dog; p.Speak()` — if `Speak` has a value receiver, Go can't dereference `p` (nil) → panic. If `Speak` has a pointer receiver, it *can* be called on a nil `*Dog` (the method can check `p == nil`) — a pattern for nil-safe methods.
- **Interface values are immutable in a sense**: the interface holds a (type, value) pair; you can reassign the interface variable, but you can't mutate the held value through the interface (unless the interface's method mutates it via a pointer).
- **Empty interface and `fmt`**: `fmt.Println(x)` where `x` is `any` — `fmt` introspects the dynamic type and prints accordingly. This is why `fmt.Println` "just works" on any value.

## 🧠 Spot the Bug

A function returns an interface, and the caller checks for nil but the check fails:

::code-wrapper{language="go"}
```go
type Logger interface{ Log(string) }

type nullLogger struct{}
func (n *nullLogger) Log(string) {}

func getLogger(verbose bool) Logger {
	if !verbose {
		var n *nullLogger = nil
		return n   // "return a nil logger"
	}
	return &nullLogger{}
}

func main() {
	l := getLogger(false)
	if l == nil {
		fmt.Println("no logger")   // NEVER printed
	}
	l.Log("hello")   // works? or panics?
}
```
::

What's wrong?

<details>
<summary>Answer</summary>

`getLogger(false)` returns `n` where `n` is a nil `*nullLogger`. The return type is `Logger` (an interface), so the nil pointer gets *wrapped* into an interface: the result is a `(type: *nullLogger, value: nil)` interface — which is **not a nil interface**. `l == nil` is `false` (the interface has a type, `*nullLogger`), so the `if l == nil` check never triggers.

`l.Log("hello")` calls `(*nullLogger).Log` with a nil receiver. In this case, `Log` doesn't dereference the receiver (it's `func (n *nullLogger) Log(string) {}` — no field access), so it *doesn't panic* — it's a nil-safe method. But if `Log` accessed `n.someField`, it would panic.

The fix — return `nil` directly (a nil interface), not a nil concrete pointer:

```go
func getLogger(verbose bool) Logger {
	if !verbose {
		return nil   // ✅ a nil interface, not a (*nullLogger, nil)
	}
	return &nullLogger{}
}
```

Now `l == nil` is `true`, and the caller's nil check works.

**The lesson**: returning a nil concrete pointer wraps it in a non-nil interface. To return a "nil" interface, return `nil` directly. This is the #1 interface gotcha — and it's invisible because the method may work (if nil-safe) until someone adds a field access.

</details>

## Summary

You can now declare and use interfaces, understand implicit satisfaction (no `implements`), compose small interfaces, follow "accept interfaces, return concrete types," use `any`/`interface{}` deliberately, and avoid the nil-interface trap (return `nil`, not a nil concrete pointer). Next: type assertions and type switches.