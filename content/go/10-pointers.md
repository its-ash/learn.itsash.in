# 10 — Pointers

Go has pointers, but no pointer arithmetic (except `unsafe`) and no manual memory management. Pointers are for sharing (so a function can modify the caller's variable) and avoiding copies.

## Basics

::code-wrapper{language="go"}
```go
x := 5
p := &x          // p is *int, points to x
fmt.Println(*p)  // 5 (dereference)
*p = 10          // modify x through the pointer
fmt.Println(x)   // 10

var pp *int      // nil pointer (zero value of *int)
// *pp = 5       // panic: nil pointer dereference
``
::

- `&x` — address of `x`.
- `*p` — value at `p` (dereference).
- `*int` — pointer to `int`.
- `nil` — the zero value of a pointer.

## Pointers to Structs

::code-wrapper{language="go"}
```go
type User struct{ Name string }

u := &User{Name: "Alice"}   // *User
u.Name = "Bob"              // shorthand for (*u).Name — Go auto-dereferences
fmt.Println(u.Name)         // Bob

// Go auto-dereferences field/method access on pointers:
// u.Name == (*u).Name
// u.Method() == (*u).Method() (if value receiver) or u.Method() (if pointer receiver)
``
::

No `->` operator (unlike C) — Go auto-dereferences `.` on pointers.

## Passing Pointers to Functions

A function that receives a pointer can modify the caller's variable:

::code-wrapper{language="go"}
```go
func increment(n *int) {
	*n++
}

x := 5
increment(&x)
fmt.Println(x)   // 6
``
::

Without the pointer, `x` would be copied (value semantics) and the caller's `x` unchanged. Use pointers when the function should modify the caller's data, or to avoid copying large structs.

## Returning Pointers

Go is safe to return pointers to local variables — the compiler performs **escape analysis** and allocates the variable on the heap if its address escapes:

::code-wrapper{language="go"}
```go
func newUser() *User {
	u := User{Name: "Alice"}   // local variable
	return &u                   // safe — u escapes to the heap
}
``
::

In C, this would be a dangling pointer (the local is destroyed on return). In Go, the GC keeps `u` alive as long as the pointer exists. You don't decide stack vs. heap — the compiler does.

## When to Use Pointers

| Situation | Use |
|---|---|
| Function should modify the caller's variable | Pointer |
| Large struct (avoid copy overhead) | Pointer |
| Small struct (a few words) | Value (copy is cheap) |
| Need to share/mutate state | Pointer |
| Method that mutates the receiver | Pointer receiver (chapter 11) |
| `nil` is a meaningful value | Pointer (value types can't be nil) |

**Don't over-pointer** — copying small structs (a few words) is cheap and avoids GC pressure (heap allocations). Use pointers deliberately, not reflexively.

## Pointers and Interfaces

A value satisfies an interface whether it's a `T` or a `*T` — but the **method set** differs:

::code-wrapper{language="go"}
```go
type Speaker interface{ Speak() }

type Dog struct{}
func (d Dog) Speak() {}         // value receiver — method set of Dog
func (d *Dog) Bark() {}         // pointer receiver — method set of *Dog

var s Speaker
s = Dog{}      // OK — Dog has Speak (value receiver)
s = &Dog{}     // OK — *Dog has all methods of Dog (and more)

var b interface{ Bark() }
b = Dog{}      // ERROR — Dog's method set doesn't include Bark (pointer receiver)
b = &Dog{}     // OK — *Dog has Bark
``
::

A value type's method set is only its value-receiver methods; a pointer type's method set is *all* methods (value and pointer receivers). This is why you can't put a `Dog{}` (value) into an interface requiring a pointer-receiver method.

## `new`

::code-wrapper{language="go"}
```go
p := new(int)   // *int, pointing to a zero-valued int
*p = 5
``
::

`new(T)` allocates a zero-valued `T` and returns `*T`. Rarely used — `&T{}` (struct) or `&x` (variable) are more common and clearer.

## 💡 Tips & Tricks

- **Idiom**: use pointer receivers consistently within a type — if any method has a pointer receiver (e.g., it mutates), make *all* methods pointer receivers. Mixing value and pointer receivers causes confusion (the method set differs) and is flagged by `go vet`/`golangci-lint`.
- **Idiom**: use pointers for large structs (avoid copy overhead) and for mutation; use values for small structs and read-only data. The default is value — Go is value-semantics-first; reach for a pointer when you have a reason (mutation, size, nil-meaning, interface method set).
- **Idiom**: don't return pointers to small types to "avoid allocation" — escape analysis already keeps small, non-escaping values on the stack. Premature `&` to "optimize" can force an escape (heap allocation) where a value return would've been stack-allocated and free.
- **Idiom**: use `nil` as a meaningful zero value for pointers — `*User` can be `nil` (no user); `User` (value) can't. When "no value" is a meaningful state (optional fields, absent results), a pointer expresses it; a value type can't.
- **Performance**: run `go build -gcflags="-m"` to see escape analysis decisions — it prints "moved to heap: x" for escaping variables and "x does not escape" for stack-allocated ones. This tells you whether your "optimization" actually avoided an allocation or forced one.

## ⚠️ Edge Cases & Gotchas

- **No pointer arithmetic**: `p++` (to move to the next int) is illegal (except in `unsafe`). Go pointers are references, not addresses to compute with.
- **`nil` pointer dereference panics**: `*p` where `p == nil` is a runtime panic (not a compile error). Always check for nil if the pointer might be nil.
- **Returning a pointer to a local is safe**: escape analysis moves the local to the heap if its address escapes; the GC keeps it alive. No dangling pointers in Go.
- **`&T{}` vs `new(T)`**: `&User{}` is idiomatic (clear, can initialize fields); `new(User)` is rare (returns `*User` zero value, no initialization). Prefer `&T{}`.
- **Pointers and interfaces (method set)**: a value type doesn't satisfy an interface that requires pointer-receiver methods. `var i I = T{}` fails if `I` requires a `*T` method. Use `&T{}`.
- **Pointer to map/slice/chan is usually wrong**: these are already reference types (a slice header, a map pointer). `*map[K]V` is a pointer to a map pointer — almost never what you want. Pass the map directly.
- **Copy of a struct with a pointer field is a shallow copy**: `a := MyStruct{Items: []int{1,2}}; b := a` — `b.Items` is the same slice header (shared underlying array). Modifying `b.Items[0]` affects `a.Items[0]`. Use `copy`/`slices.Clone` for deep copies.
- **`*p++` is `(*p)++`**: Go parses `*p++` as `(*p)++` (dereference, then increment the value). No ambiguity like in C.
- **Passing a large struct by value copies it**: `func f(u User)` copies the whole `User` on every call. For large structs, `func f(u *User)` avoids the copy. For small structs, the copy is cheaper than the indirection.
- **Pointers to loop variables (pre-1.22)**: `for _, v := range items { save(&v) }` — pre-1.22, all `&v` point to the same `v` (the final value). 1.22+ fixes this. On older Go, copy: `v := v; save(&v)`.

## 🧠 Spot the Bug

A developer collects pointers to slice elements and is surprised they all point to the same value:

::code-wrapper{language="go"}
```go
items := []int{1, 2, 3}
var ptrs []*int
for _, v := range items {
	ptrs = append(ptrs, &v)   // ❌ all point to the same v
}
for _, p := range ptrs {
	fmt.Println(*p)   // 3 3 3 (on pre-1.22)
}
``
::

What's happening?

<details>
<summary>Answer</summary>

Pre-Go 1.22, `range` uses a **single `v` variable** reused across iterations (not a fresh `v` per iteration). `&v` is the address of that single variable — all three pointers point to the same location, which holds the final value (3) after the loop.

Go 1.22+ fixes this: each iteration gets a distinct `v`, so the pointers are different and print 1, 2, 3.

The fix (portable across versions) — create a local copy per iteration:

```go
for _, v := range items {
	v := v            // fresh copy per iteration
	ptrs = append(ptrs, &v)
}
```
::
Or iterate by index and take the address of the slice element (which *is* distinct per element):

```go
for i := range items {
	ptrs = append(ptrs, &items[i])
}
```
::
`&items[i]` points into the slice's backing array — each is a distinct address. But beware: if the slice is reallocated (append exceeds capacity), the pointers dangle (point to the old array). The `v := v` copy is safer.

**The lesson**: pre-1.22, `range` reuses the loop variable; `&v` captures the address of the single variable (all pointers see the final value). Copy `v := v` per iteration, or use `&items[i]` (with care about slice reallocation). Go 1.22+ fixes this.

</details>

## Summary

You can now use `&`/`*`, understand auto-dereferencing, pass pointers for mutation/large structs, return pointers safely (escape analysis), choose between value and pointer receivers (and their method sets), and avoid the loop-variable-pointer and nil-dereference traps. Next: methods and receivers.