# 11 — Methods & Receivers

Methods are functions with a **receiver** — a special parameter that binds the function to a type. They're Go's closest analog to object methods, without classes.

## Declaration

::code-wrapper{language="go"}
```go
type Circle struct{ Radius float64 }

// Value receiver
func (c Circle) Area() float64 {
	return math.Pi * c.Radius * c.Radius
}

c := Circle{Radius: 5}
c.Area()   // 78.54
``
::

The receiver `(c Circle)` is the first parameter, written before the method name. `c` is the receiver — the instance the method is called on.

## Value vs Pointer Receivers

::code-wrapper{language="go"}
```go
// Value receiver — operates on a copy; can't mutate the original
func (c Circle) Scale(f float64) {
	c.Radius *= f   // modifies the copy, not the original
}
c := Circle{Radius: 5}
c.Scale(2)
fmt.Println(c.Radius)   // 5 (unchanged — Scale got a copy)

// Pointer receiver — operates on the original; can mutate
func (c *Circle) Scale(f float64) {
	c.Radius *= f   // modifies the original
}
c := &Circle{Radius: 5}
c.Scale(2)
fmt.Println(c.Radius)   // 10
```
::

### Choosing value vs pointer

| Use value receiver when | Use pointer receiver when |
|---|---|
| The method doesn't mutate the receiver | The method mutates the receiver |
| The receiver is small (a few words) | The receiver is large (avoid copy) |
| You want value semantics (immutability) | You want shared/mutable semantics |

### Consistency rule

**All methods on a type should have the same receiver kind** (all value or all pointer). Mixing causes method-set confusion and is flagged by linters. If any method needs a pointer receiver (it mutates), make *all* methods pointer receivers.

## Method Sets and Interfaces

A type's **method set** determines which interfaces it satisfies:

- `T` (value type) — method set is its **value-receiver methods** only.
- `*T` (pointer type) — method set is **all methods** (value + pointer receivers).

::code-wrapper{language="go"}
```go
type Shape interface{ Area() float64 }

type Circle struct{ Radius float64 }
func (c Circle) Area() float64 { return math.Pi * c.Radius * c.Radius }   // value receiver

var s Shape
s = Circle{Radius: 5}    // OK — Circle's method set includes Area
s = &Circle{Radius: 5}   // OK — *Circle has all of Circle's methods

// If Area had a pointer receiver:
// func (c *Circle) Area() float64 { ... }
// s = Circle{Radius: 5}    // ERROR — Circle's method set doesn't include *Circle's Area
// s = &Circle{Radius: 5}   // OK
``
::

This is the crux: a value can't satisfy an interface requiring a pointer-receiver method. Store/use a pointer if any method is pointer-receiver.

## Method Promotion (Embedding)

Methods of an embedded type are promoted to the outer type:

::code-wrapper{language="go"}
```go
type Animal struct{ Name string }
func (a Animal) Speak() string { return a.Name + " speaks" }

type Dog struct{ Animal }
func (d Dog) Bark() string { return d.Name + " barks" }

d := Dog{Animal: Animal{Name: "Rex"}}
d.Speak()   // "Rex speaks" (promoted from Animal)
d.Bark()    // "Rex barks" (Dog's own)
``
::

The outer type can "override" by defining a method with the same name — but it shadows (no virtual dispatch).

## Pointer-Receiver Method Calls on Values

::code-wrapper{language="go"}
```go
c := Circle{Radius: 5}   // value
c.Scale(2)               // OK — Go auto-takes &c for the pointer receiver
(&c).Scale(2)            // explicit, equivalent
``
::

Go automatically takes the address of an addressable value when calling a pointer-receiver method. But this doesn't work for map values (not addressable) or temporary values in some cases.

## 💡 Tips & Tricks

- **Idiom**: use pointer receivers consistently within a type — if any method mutates (needs a pointer receiver), make *all* methods pointer receivers. Mixing value and pointer receivers causes method-set confusion (a value doesn't satisfy interfaces requiring pointer-receiver methods) and is flagged by `go vet`/`golangci-lint`.
- **Idiom**: use value receivers for small, immutable types (a `Point`, a `Time`) — copies are cheap and the immutability is a feature. Use pointer receivers for large structs or when the method mutates. The default is value; reach for pointer deliberately.
- **Idiom**: use embedding for method promotion — `type Service struct { Logger }` gives `Service` the `Logger`'s methods without writing delegation wrappers. The outer type can shadow a promoted method by defining its own (no virtual dispatch — resolved at compile time).
- **Idiom**: receiver name should be short (1-2 letters, often the first letter of the type) — `func (c Circle) Area()`, `func (u *User) Save()`. Consistent receiver names across a type's methods improve readability; `gofmt` aligns them.
- **Debug**: `var i Interface = T{}` failing with "does not implement Interface (method X has pointer receiver)" means a method is on `*T` but you're using a value — use `&T{}` or change the receiver to value.

## ⚠️ Edge Cases & Gotchas

- **Value receiver can't mutate**: `func (c Circle) Scale()` modifies a copy — the original is unchanged. If you need mutation, use `*Circle`.
- **Pointer receiver on an unaddressable value**: `Circle{5}.Scale(2)` (pointer receiver) fails — the literal isn't addressable. Use a variable: `c := Circle{5}; c.Scale(2)`.
- **Method set and interfaces**: a value type doesn't satisfy interfaces requiring pointer-receiver methods. This is the most common "doesn't implement interface" confusion.
- **Mixing receiver kinds is allowed but discouraged**: Go permits it, but `go vet`/`golangci-lint` warn. The method-set asymmetry causes subtle interface bugs.
- **Pointer-receiver method on a map value**: `m[key].Method()` fails if `Method` is pointer-receiver (map values aren't addressable). Copy out: `v := m[key]; v.Method()` — but this calls the value-receiver method on a copy. Use `map[K]*V` if you need pointer methods on map values.
- **Receiver name consistency**: `func (c Circle) A()` and `func (circle Circle) B()` — inconsistent receiver names. Use the same name (`c`) across all methods of `Circle`.
- **Methods on non-struct types**: `type MyInt int; func (m MyInt) IsEven() bool { return m%2 == 0 }` — methods can be on any named type (not on imported types or unnamed types like `[]int`).
- **Method on a pointer type**: `func (p *Point) Reset()` — the receiver is `*Point`. Calling `p.Reset()` on a nil `*Point` panics (unless the method handles nil — possible: `func (p *Point) Safe() { if p == nil { return }; ... }`).

## 🧠 Spot the Bug

A developer implements `String()` on a value receiver and gets unexpected output from `fmt.Println`:

::code-wrapper{language="go"}
```go
type User struct{ Name string }
func (u User) String() string { return "User: " + u.Name }

users := map[int]User{1: {"Alice"}}
for _, u := range users {
	fmt.Println(u)   // "User: Alice" — OK
}
fmt.Println(users)   // "map[1:{Alice}]" — not "User: Alice"!
```
::

Why doesn't `fmt.Println(users)` use the `String()` method?

<details>
<summary>Answer</summary>

`fmt` calls `String()` (if defined) on the *top-level* value passed to `Println`. For `fmt.Println(users)`, the top-level value is a `map[int]User` — maps don't have a `String()` method, so `fmt` prints the default map representation (`map[1:{Alice}]`). It does *not* recursively call `String()` on each `User` value inside the map.

For `fmt.Println(u)` (a single `User`), the top-level value is a `User`, which has `String()`, so `fmt` calls it.

This isn't a bug — it's how `fmt` works: it formats the value it's given, using that value's methods. A container (map/slice) prints its elements with their default formatting, not each element's `String()`.

To print a map of users with each user's `String()`, iterate and print each:

```go
for _, u := range users {
	fmt.Println(u)   // "User: Alice"
}
```

Or implement `String()` on a custom map type (rare) or use a custom formatter.

**The lesson**: `fmt` calls `String()` on the value you pass, not on nested values inside containers. A `map[K]V` prints its values with default formatting, not `V.String()`.

</details>

## Summary

You can now declare methods with value/pointer receivers, choose between them (consistency rule, mutation, size, method set), understand interface satisfaction via method sets, use method promotion via embedding, and avoid the value-can't-satisfy-pointer-interface and map-value-not-addressable traps. Next: interfaces — Go's abstraction mechanism.