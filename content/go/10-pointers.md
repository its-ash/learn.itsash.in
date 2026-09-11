---
title: "10 — Pointers"
description: "Escape analysis, stack vs heap allocation, value vs pointer receiver method sets, nil safety patterns, and when pointers help vs hurt performance."
---

# 10 — Pointers

## Pointer Basics and Auto-Dereferencing

::code-wrapper{language="go"}
```go
// ┌──────────────────────────────────────────────────────────────────────┐
// │ &x    │ address of x (creates a *T)                                 │
// │ *p    │ value at p (dereference)                                    │
// │ *T    │ pointer-to-T type                                           │
// │ nil   │ zero value of any pointer type                              │
// └──────────────────────────────────────────────────────────────────────┘
//
// Go pointers are SAFE:
//   - No pointer arithmetic (except unsafe.Pointer)
//   - No dangling pointers (GC keeps data alive while referenced)
//   - The compiler decides stack vs heap (escape analysis)

func basics() {
	x := 5
	p := &x          // p is *int, points to x (on the stack)
	fmt.Println(*p)  // 5 (dereference)
	*p = 10          // modify x through the pointer
	fmt.Println(x)   // 10

	var pp *int      // nil pointer (zero value of *int)
	// *pp = 5        // panic: nil pointer dereference (runtime, not compile)
	if pp != nil {   // ✅ always check before dereferencing nullable pointers
		_ = *pp
	}
}

// Struct auto-dereferencing — no -> operator (unlike C):
type User struct{ Name string }

func autoDeref() {
	u := &User{Name: "Alice"}  // *User
	u.Name = "Bob"              // ✅ auto-dereference: equivalent to (*u).Name
	fmt.Println(u.Name)         // Bob

	// This works for fields AND methods:
	// u.Method() == (*u).Method() (if value receiver)
	// u.Method() == u.Method()    (if pointer receiver — already a pointer)
}
```

## Escape Analysis — Stack vs Heap

::code-wrapper{language="go"}
```go
// The Go compiler performs ESCAPE ANALYSIS to decide stack vs heap:
//   - If a variable's address doesn't escape the function → stack (free)
//   - If a variable's address escapes (returned, stored in a global,
//     passed to a function that stores it) → heap (GC-managed)
//
// You DON'T control this — the compiler does. But you can see its decisions:

// Stack-allocated (no escape):
func stackAlloc() int {
	x := 42      // stays on the stack — &x doesn't escape
	return x
}

// Heap-allocated (escapes — address returned):
func heapAlloc() *int {
	x := 42
	return &x    // x escapes to the heap (its address leaves the function)
}

// The difference matters:
//   stack: zero GC pressure, instant allocation/deallocation
//   heap:  GC tracks it, adds pause pressure, allocation overhead

// View escape decisions:
//   go build -gcflags='-m' ./...
//   go build -gcflags='-m -m' ./...  (verbose — explains WHY)
//
// Output:
//   ./main.go:5:2: moved to heap: x    (x escaped because &x was returned)
//   ./main.go:10:2: x does not escape   (x stays on stack)
```

### Escape analysis — the interface escape

::code-wrapper{language="go"}
```go
// ⚠️ Assigning a value to an interface often causes an escape —
// the interface needs to hold a pointer to the value, so the value
// moves to the heap.

func interfaceEscape() {
	x := 42
	var i any = x  // x escapes to heap — interface stores (type, *x)
	_ = i
}
// go build -gcflags='-m': "x escapes to heap"

// ✅ Avoid the escape for known types:
func noEscape() {
	x := 42
	processInt(x)  // x stays on stack — no interface, no escape
}

func processInt(n int) { _ = n }

// This is why `fmt.Println(x)` causes x to escape — fmt.Println takes
// ...any, so every argument is boxed into an interface → heap allocation.
// In hot paths, avoid fmt; use strconv or direct writes.
```

## When to Use Pointers — Decision Guide

::code-wrapper{language="go"}
```go
// ┌─────────────────────────────────────┬──────────────────────────┐
// │ Situation                           │ Use                      │
// │ ────────────────────────────────────│ ───────────────────────── │
// │ Function modifies caller's data     │ Pointer                  │
// │ Large struct (>64 bytes)           │ Pointer (avoid copy)     │
// │ Small struct (≤64 bytes, ≤8 words)  │ Value (copy is cheap)    │
// │ Need nil as a meaningful value      │ Pointer                  │
// │ Method mutates the receiver         │ Pointer receiver         │
// │ Storing in an interface             │ Value (or pointer — see │
// │                                     │   method set rules)      │
// │ Map/slice/chan (already reference)  │ Value (pass directly)    │
// └─────────────────────────────────────┴──────────────────────────┘

// ─── Value: small, read-only ───
type Point struct{ X, Y float64 }  // 16 bytes — copy is cheap

func distance(p1, p2 Point) float64 {  // values — no aliasing, no GC
	dx := p1.X - p2.X
	dy := p1.Y - p2.Y
	return math.Sqrt(dx*dx + dy*dy)
}

// ─── Pointer: large struct, mutation ───
type BigConfig struct {
	DSN       string
	Timeouts  map[string]time.Duration
	Pools     map[string]int
	Features  []string
	Middleware []func(http.Handler) http.Handler
	// ~200+ bytes — copy is expensive
}

func updateConfig(cfg *BigConfig, key string, val time.Duration) {  // pointer
	cfg.Timeouts[key] = val  // modifies the caller's config
}

// ─── Pointer: nil is meaningful ───
type OptionalUser struct {
	User *User  // nil = no user, non-nil = user present
}

func findUser(id int64) *User {  // nil = not found
	if id <= 0 {
		return nil
	}
	return &User{ID: id}
}
```

## Returning Pointers — Safe in Go

::code-wrapper{language="go"}
```go
// In C, returning &local is a dangling pointer (local is destroyed on return).
// In Go, escape analysis moves the local to the heap if its address escapes.
// The GC keeps it alive as long as the pointer exists. No dangling pointers.

func newUser() *User {
	u := User{Name: "Alice"}  // local — would be stack in C
	return &u                  // u escapes to heap — GC manages its lifetime
	// Safe: the compiler sees &u leaves the function, moves u to the heap.
}

// This is idiomatic Go — constructors return *T:
func NewServer(addr string) *Server {
	return &Server{
		addr:    addr,
		timeout: 30 * time.Second,
	}
}

// ⚠️ Don't over-optimize by returning values to "avoid heap allocation":
func badNewUser() User {  // returns a value — but if the caller takes &result,
	return User{Name: "Alice"}  // it escapes anyway. Let the compiler decide.
}
```

## Pointers and Interface Method Sets

::code-wrapper{language="go"}
```go
// The METHOD SET of a type determines which interfaces it satisfies:
//   - Value type T:    methods with VALUE receivers only
//   - Pointer type *T: methods with VALUE AND pointer receivers

type Speaker interface{ Speak() string }
type Barker interface{ Bark() string }

type Dog struct{ Name string }

func (d Dog) Speak() string  { return d.Name + " speaks" }  // value receiver
func (d *Dog) Bark() string  { return d.Name + " barks" }   // pointer receiver

func methodSetDemo() {
	var s Speaker
	s = Dog{Name: "Rex"}   // ✅ Dog has Speak (value receiver)
	s = &Dog{Name: "Rex"}  // ✅ *Dog has Speak (promoted from value receiver)

	var b Barker
	// b = Dog{Name: "Rex"}  // ❌ compile error: Dog's method set lacks Bark (pointer receiver)
	b = &Dog{Name: "Rex"}  // ✅ *Dog has Bark

	// RULE: if ANY method has a pointer receiver, you MUST use *T to
	// satisfy an interface that includes that method.
}

// ─── Consistency rule ───
// If any method of a type has a pointer receiver, make ALL methods
// pointer receivers. Mixing causes confusion and is flagged by linters.
//
// ❌ ANTI-PATTERN: mixing receivers
//   func (d Dog) Name() string { ... }      // value receiver
//   func (d *Dog) SetName(s string) { ... }  // pointer receiver
//   // Dog{} satisfies Name but not SetName; &Dog{} satisfies both.
//   // This asymmetry is a common source of interface satisfaction bugs.
```

## Nil Pointer Safety Patterns

::code-wrapper{language="go"}
```go
// ─── Nil-safe methods (pointer receiver can handle nil) ───
type Logger struct{ prefix string }

func (l *Logger) Log(msg string) {
	if l == nil {  // ✅ check for nil receiver — pointer receivers CAN be nil
		fmt.Println("[null-logger]", msg)
		return
	}
	fmt.Printf("[%s] %s\n", l.prefix, msg)
}

func nilSafeDemo() {
	var l *Logger  // nil
	l.Log("hello")  // ✅ prints "[null-logger] hello" — no panic
	// This works because the method checks for nil receiver.
}

// ─── The nil receiver trap (value receiver) ───
type BadLogger struct{ prefix string }
func (b BadLogger) Log(msg string) {  // VALUE receiver
	// b is a copy — if the receiver is nil, Go tries to dereference
	// to copy the value → panic
	fmt.Printf("[%s] %s\n", b.prefix, msg)
}

func badNilDemo() {
	var b *BadLogger  // nil
	// b.Log("hello")  // panic: nil pointer dereference
	// Go tries to dereference b (nil) to copy BadLogger → panic.
	_ = b
}

// ─── Production pattern: nil as "no value" sentinel ───
type Config struct {
	Timeout *time.Duration  // nil = no timeout (use default), non-nil = set
}

func (c *Config) GetTimeout() time.Duration {
	if c.Timeout == nil {
		return 30 * time.Second  // default
	}
	return *c.Timeout  // explicit value
}

// This pattern (pointer to a value type) lets you distinguish
// "not set" (nil) from "set to zero value" (e.g., *Duration = 0).
```

## `new` vs `&T{}`

::code-wrapper{language="go"}
```go
// new(T) — allocates a zero-valued T, returns *T. Rarely used.
p := new(int)   // *int, *p = 0
*p = 5

// &T{} — idiomatic for structs (can initialize fields):
u := &User{Name: "Alice"}  // *User, fields initialized

// `&T{}` is almost always clearer than `new(T)` — you can set fields
// in the same expression. Use new only when you need a *T for a
// non-struct type and don't want a named variable:
//   p := new(int)  vs  var x int; p := &x  — new is slightly cleaner here.
```

## 💡 Tips & Tricks

- **Performance**: run `go build -gcflags='-m' ./...` to see escape analysis — it tells you which variables escape to the heap. In hot paths, eliminating escapes (keeping values on the stack) is the #1 allocation-reduction technique.
- **Idiom**: use pointer receivers consistently — if ANY method has a pointer receiver, make ALL methods pointer receivers. Mixing value and pointer receivers causes method-set confusion and is flagged by linters.
- **Performance**: don't return `*T` to "avoid a copy" for small structs — escape analysis may heap-allocate the pointer, adding GC pressure worse than a value copy. For structs ≤ 64 bytes, value returns are often faster (no allocation, no GC).
- **Idiom**: use `*T` (pointer to a value type) for optional fields where "not set" (nil) differs from "set to zero" — `*time.Duration` where nil = default, `0` = no timeout. This is the "nullability" pattern for value types.
- **Safety**: nil pointer dereference is a runtime panic, not a compile error. Always check `if p != nil` before dereferencing nullable pointers. For exported APIs, document nil behavior ("returns nil if not found").
- **Debug**: `go build -gcflags='-m -m'` shows WHY a variable escapes — "p does not escape because ..." or "leaking param: p". This helps understand which code patterns cause heap allocations.

## ⚠️ Edge Cases & Gotchas

- **No pointer arithmetic**: `p++` (to move to the next element) is illegal (except `unsafe.Pointer`). Go pointers are references, not computable addresses.
- **`nil` pointer dereference panics at runtime**: `*p` where `p == nil` is a runtime panic (not a compile error). Check before dereferencing.
- **Returning `&local` is safe**: escape analysis moves the local to the heap if its address escapes. The GC manages its lifetime. No dangling pointers in Go.
- **`&T{}` vs `new(T)`**: `&User{Name: "Alice"}` is idiomatic (initializes fields); `new(User)` returns a zero-value `*User` (no initialization). Prefer `&T{}`.
- **Pointer to map/slice/chan is usually wrong**: these are already reference types (internally pointers). `*map[K]V` is a pointer to a map pointer — double indirection. Pass the map directly.
- **Copy of a struct with pointer/slice fields is shallow**: `a := S{Items: []int{1,2}}; b := a` — `b.Items` shares the same underlying array. `b.Items[0] = 99` affects `a.Items[0]`. Use `slices.Clone` or `copy` for deep copies.
- **`*p++` is `(*p)++`**: Go parses `*p++` as dereference-then-increment the value. No C-style ambiguity.
- **Passing a large struct by value copies it**: `func f(u User)` copies the whole User on every call. For large structs, use `func f(u *User)`. For small structs (≤ 64 bytes), the value copy is cheaper than the pointer indirection.
- **Pointers to loop variables (pre-1.22)**: `for _, v := range items { save(&v) }` — pre-1.22, all `&v` point to the same `v` (final value). 1.22+ fixes this. Portable fix: `v := v; save(&v)`.
- **Interface boxing causes escape**: `var i any = x` moves `x` to the heap (the interface needs a pointer to the value). In hot paths, avoid passing values through `any` — use concrete types.
- **`unsafe.Pointer` bypasses all safety**: `unsafe.Pointer` can convert between pointer types, do arithmetic, and read/write arbitrary memory. Only for CGO, low-level optimization, or `reflect`. Misuse causes crashes, data corruption, and security holes.

## 🧠 Quick Quiz

::code-wrapper{language="go"}
```go
func f() *int {
	x := 42
	return &x
}

func g() int {
	x := 42
	return x
}
```

Which function's `x` escapes to the heap, and why?
::
<details>
<summary>Answer</summary>

**`f()`'s `x` escapes to the heap.** `&x` is returned, so `x`'s address leaves the function. Escape analysis detects this and moves `x` to the heap so the GC can manage its lifetime after `f` returns.

**`g()`'s `x` stays on the stack.** `x` is returned by value (copied to the caller), and its address never escapes. No heap allocation.

You can verify:
```bash
go build -gcflags='-m' main.go
# ./main.go:2:2: moved to heap: x    ← f's x escapes
# (g's x doesn't appear — it stays on the stack, no message)
```

The lesson: returning `&x` forces a heap allocation. For small types, returning the value (not the pointer) keeps it on the stack — zero allocation, zero GC pressure. Only return pointers when you need to (large structs, nil-sentinel, mutation).

</details>

## 📚 What's Next

→ [11 — Methods & Receivers](/go/11-methods-and-receivers) — value vs pointer receivers, method-set rules, nil receiver methods, and embedding promotion.