# 09 — Structs

Structs are Go's way of grouping data — the closest thing to a class, but without inheritance. Go favors **composition over inheritance**.

## Declaration and Use

::code-wrapper{language="go"}
```go
type Point struct {
	X, Y int
}

p := Point{1, 2}           // positional (fragile — order matters)
p := Point{X: 1, Y: 2}     // named (clear, order-independent)
p := Point{}               // zero value: {0 0}
p.X = 5                    // field access

// Nested struct (anonymous field type)
type Circle struct {
	Point          // embedded — promotes Point's fields
	Radius int
}

c := Circle{Point: Point{1, 2}, Radius: 5}
c.X            // 1 (promoted from embedded Point)
c.Point.X      // 1 (explicit)
``
::

## Struct Literals

::code-wrapper{language="go"}
```go
// Named fields (preferred — order-independent, clear)
p := Point{X: 1, Y: 2}

// Positional (fragile — adding a field breaks all literals)
p := Point{1, 2}

// Partial (omitted fields are zero)
p := Point{X: 1}   // Y = 0

// Empty (all zero)
p := Point{}
``
::

Prefer named-field literals — they're robust to field additions/reorderings. Positional literals break when the struct changes.

## Embedding (Composition)

Go has no inheritance. Instead, a struct can **embed** another type, promoting its fields and methods:

::code-wrapper{language="go"}
```go
type Animal struct {
	Name string
}

func (a Animal) Speak() string {
	return a.Name + " makes a sound"
}

type Dog struct {
	Animal   // embedded — Dog "is-an" Animal (composition)
	Breed string
}

d := Dog{Animal: Animal{Name: "Rex"}, Breed: "Lab"}
d.Name       // "Rex" (promoted from Animal)
d.Speak()    // "Rex makes a sound" (promoted method)
d.Animal.Speak()  // explicit access
``
::

Embedding promotes the embedded type's fields and methods to the outer struct — `d.Name` is shorthand for `d.Animal.Name`. The outer struct can override:

::code-wrapper{language="go"}
```go
func (d Dog) Speak() string {
	return d.Name + " barks"
}
d.Speak()    // "Rex barks" (Dog's method overrides the promoted one)
d.Animal.Speak()  // "Rex makes a sound" (explicit access to the embedded method)
``
::

### Embedding vs Inheritance

Embedding is **composition**, not inheritance:
- There's no "is-a" relationship (no subtype polymorphism via embedding — use interfaces for that).
- The outer struct *has-a* inner struct; the inner's methods are *delegated*.
- No virtual dispatch: `d.Speak()` calls `Dog.Speak` if defined, else `Animal.Speak` — resolved at compile time by the method set.

## Struct Tags

Tags are metadata on struct fields, read by reflection — used by `encoding/json`, `database/sql`, validation, etc.:

::code-wrapper{language="go"}
```go
type User struct {
	ID       int    `json:"id"`
	Username string `json:"username" db:"user_name" validate:"required"`
	Email    string `json:"email,omitempty"`
	Password string `json:"-"`           // never serialized
}
```
::

- `json:"name"` — serializes the field as `"name"` in JSON.
- `json:"name,omitempty"` — omits the field if it's the zero value.
- `json:"-"` — never serializes the field.
- Tags are raw strings; the format is `key:"value"` repeated, space-separated.

## Anonymous Structs

::code-wrapper{language="go"}
```go
// Inline, for one-off use
p := struct{ X, Y int }{1, 2}

// As a field type
type Config struct {
	Limits struct {
		Max int
		Min int
	}
}
``
::

Useful for ad-hoc grouping (test data, local organization). Don't overuse — named types are clearer for anything reused.

## Struct Comparison

Structs are comparable if **all fields are comparable**:

::code-wrapper{language="go"}
```go
type Point struct{ X, Y int }
p1 := Point{1, 2}
p2 := Point{1, 2}
fmt.Println(p1 == p2)   // true

type Bad struct{ S []int }
// b1 == b2 is illegal — []int is not comparable
``
::

Comparable structs can be map keys; non-comparable (with slices/maps/funcs) can't.

## 💡 Tips & Tricks

- **Idiom**: use named-field literals (`Point{X: 1, Y: 2}`) over positional (`Point{1, 2}`) — named literals are robust to field additions/reorderings and self-documenting. Positional literals break silently when a field is inserted.
- **Idiom**: use embedding for composition and method promotion — `type Service struct { Logger; DB }` gives `Service` the `Logger`'s and `DB`'s methods without boilerplate delegation. This is Go's alternative to inheritance: *has-a* with delegation, not *is-a* with virtual dispatch.
- **Idiom**: use struct tags for serialization metadata — `json:"name,omitempty"` and `db:"column"` are read by reflection in `encoding/json` and `database/sql`. Keep tags consistent and use `go vet` (it checks tag syntax).
- **Idiom**: prefer embedding an **interface** (not a struct) when you want to delegate a capability without forcing a concrete type — `type Service struct { Logger interface{ Log(string) } }` lets `Service` accept any logger, and the embedded interface promotes the method.
- **Idiom**: use `omitempty` in JSON tags for optional fields — `json:"email,omitempty"` omits the field from JSON when it's the zero value (empty string, 0, false, nil), keeping the output clean. Without it, every field appears (often as `""`/`0`), cluttering the response.

## ⚠️ Edge Cases & Gotchas

- **Embedding promotes fields *and* methods**: `d.X` and `d.Speak()` both work via promotion. If the outer struct defines a method with the same name, it shadows (not overrides) the promoted one — no virtual dispatch.
- **Embedding two types with the same field/method name**: ambiguous — `d.X` is a compile error if both embedded types have `X`. Disambiguate with `d.Type1.X`.
- **Embedding a pointer**: `type S struct { *T }` — the pointer must be initialized before use (`S{T: &T{}}`); a nil embedded pointer causes nil-pointer panics on promoted method calls.
- **Embedding is not inheritance**: there's no subtype polymorphism — a `Dog` is not an `Animal` for interface purposes (unless `Animal` is an interface). You can't pass a `Dog` where an `Animal` is expected without an interface.
- **Struct tags are raw strings**: the `json:"x" db:"y"` syntax is a convention, not enforced by the language. `go vet` checks the `json` tag syntax; other packages have their own parsers.
- **Positional literals are fragile**: `Point{1, 2}` — if you add a `Z int` field, the literal still compiles (Z gets 0) but the intent is lost, or it breaks if Z is inserted in the middle. Named literals survive.
- **Struct comparison requires all-comparable fields**: a struct with a slice/map/func field isn't comparable (`==` is a compile error). Use `reflect.DeepEqual` for deep comparison, or compare a key field.
- **Empty struct `struct{}`**: takes 0 bytes — useful as a set value: `map[string]struct{}`. `struct{}{}` is the empty struct value.
- **Field alignment**: Go pads structs for alignment — `struct{ a bool; b int64 }` is 16 bytes (bool + 7 padding + int64), while `struct{ b int64; a bool }` is also 16 but orders fields for cache efficiency. `go vet`'s `fieldalignment` linter suggests reorderings to save memory.

## 🧠 Spot the Bug

A developer embeds a pointer type and gets a nil pointer panic:

::code-wrapper{language="go"}
```go
type Logger struct{}

func (l *Logger) Log(msg string) { fmt.Println(msg) }

type Service struct {
	*Logger
}

func main() {
	s := Service{}
	s.Log("hello")   // panic: nil pointer dereference
}
```
::

What's wrong?

<details>
<summary>Answer</summary>

`Service` embeds `*Logger` (a pointer). `s := Service{}` leaves the embedded `*Logger` as `nil` (the zero value of a pointer). Calling `s.Log("hello")` invokes the promoted `(*Logger).Log` method on a nil receiver — a nil pointer dereference panic.

The fix — initialize the embedded pointer:

```go
func main() {
	s := Service{Logger: &Logger{}}
	s.Log("hello")   // OK
}
```
::
Or provide a constructor:

```go
func NewService() *Service {
	return &Service{Logger: &Logger{}}
}
```
::
Or embed the value (not the pointer) if `Logger` doesn't need pointer receivers:

```go
type Service struct {
	Logger   // value, not pointer — zero value is a usable Logger
}
s := Service{}
s.Log("hello")   // OK — Logger is a zero-value Logger, not nil
```
::
But value embedding requires the type to be usable with a zero value (and copies the value into `Service`). Pointer embedding is common for shared dependencies (a logger, a database) that should be injected.

**The lesson**: embedding a pointer (`*T`) leaves the embedded field as `nil` unless initialized — promoted method calls on a nil embedded pointer panic. Initialize embedded pointers in the literal or via a constructor.

</details>

## Summary

You can now declare structs, use named/positional/partial literals, embed types for composition and method promotion, use struct tags for serialization, and understand embedding vs. inheritance (composition, no virtual dispatch). Next: pointers — when and why.