---
title: "11 — Methods & Receivers"
description: "Value vs pointer receiver semantics, method-set rules for interface satisfaction, nil receiver methods, embedding promotion, and the consistency rule."
---

# 11 — Methods & Receivers

Methods are functions with a receiver bound to a type. Go has no classes — methods on named types provide the closest analog.

## Value vs Pointer Receivers — The Core Distinction

::code-wrapper{language="go"}
```go
type Counter struct {
	count int
}

// VALUE receiver — operates on a COPY; mutations don't persist:
func (c Counter) IncBad() {
	c.count++  // modifies the copy — caller's counter unchanged
}

// POINTER receiver — operates on the original; mutations persist:
func (c *Counter) Inc() {
	c.count++  // modifies the original — caller sees the change
}

func demo() {
	var c Counter
	c.IncBad()
	fmt.Println(c.count)  // 0 — IncBad got a copy

	c.Inc()
	fmt.Println(c.count)  // 1 — Inc modified the original via pointer
}

// ┌──────────────────────────────────────────────────────────────────────┐
// │ Value receiver                     │ Pointer receiver               │
// │ ───────────────────────────────────│ ────────────────────────────── │
// │ Copy of receiver (immutability)    │ Original (can mutate)          │
// │ Safe for concurrency (no shared    │ Must synchronize if shared    │
// │   mutation)                        │                                │
// │ Small structs only (copy cost)    │ Large structs (avoid copy)     │
// │ Method set: T                      │ Method set: T and *T (all)     │
// └──────────────────────────────────────────────────────────────────────┘
```

## The Consistency Rule

::code-wrapper{language="go"}
```go
// RULE: if ANY method has a pointer receiver, make ALL methods pointer receivers.
// Mixing causes method-set asymmetry and interface satisfaction bugs.

// ❌ ANTI-PATTERN: mixed receivers
type BadAccount struct {
	balance float64
}
func (a BadAccount) Balance() float64 { return a.balance }       // value receiver
func (a *BadAccount) Deposit(amt float64) { a.balance += amt }  // pointer receiver

// BadAccount{} satisfies nothing with pointer-receiver methods.
// &BadAccount{} satisfies both, but the asymmetry is a bug magnet.
// go vet / golangci-lint warn: "receiver name inconsistent"

// ✅ CORRECT: consistent pointer receivers (because Deposit mutates):
type Account struct {
	balance float64
}
func (a *Account) Balance() float64 { return a.balance }        // pointer
func (a *Account) Deposit(amt float64) { a.balance += amt }     // pointer
func (a *Account) Withdraw(amt float64) error {                  // pointer
	if amt > a.balance {
		return errors.New("insufficient funds")
	}
	a.balance -= amt
	return nil
}
// *Account satisfies any interface using these methods.
// Account{} satisfies only value-receiver methods (none here) —
// users must use &Account{} or a constructor.
```

## Method Sets and Interface Satisfaction

::code-wrapper{language="go"}
```go
// ┌──────────────────────────────────────────────────────────────────────┐
// │ Method set of T (value type):  value-receiver methods only          │
// │ Method set of *T (pointer type): ALL methods (value + pointer)      │
// │                                                                      │
// │ Interface satisfaction requires the type's method set to include    │
// │ ALL the interface's methods.                                         │
// │                                                                      │
// │ Consequence: if an interface requires a pointer-receiver method,     │
// │   you MUST use *T (not T) to satisfy it.                             │
// └──────────────────────────────────────────────────────────────────────┘

type Saver interface{ Save() error }
type Loader interface{ Load() error }

type Doc struct{ ID int64 }
func (d Doc) Load() error { return nil }     // value receiver
func (d *Doc) Save() error { return nil }    // pointer receiver

func methodSetExample() {
	var l Loader
	l = Doc{}    // ✅ Doc has Load (value receiver)
	l = &Doc{}   // ✅ *Doc has Load (promoted)

	var s Saver
	// s = Doc{}   // ❌ compile error: Doc's method set lacks Save (pointer receiver)
	s = &Doc{}   // ✅ *Doc has Save

	// This is the #1 interface gotcha: using a value where a pointer is needed.
}

// ─── The compile-time check idiom ───
var _ Saver = (*Doc)(nil)  // compile error if *Doc doesn't satisfy Saver
var _ Loader = Doc{}       // compile error if Doc doesn't satisfy Loader
```

## Nil Receiver Methods — Safe Patterns

::code-wrapper{language="go"}
```go
// Pointer receivers CAN be nil. A method can handle a nil receiver
// gracefully — this enables the "null object" pattern.

type Tree struct {
	value       int
	left, right *Tree
}

// Find works on a nil receiver — returns false, no panic:
func (t *Tree) Find(target int) bool {
	if t == nil {  // ✅ nil check — safe to call on a nil *Tree
		return false
	}
	if target == t.value {
		return true
	}
	if target < t.value {
		return t.left.Find(target)   // t.left may be nil — handled by the check
	}
	return t.right.Find(target)
}

// This lets you traverse a tree without nil-checking at every node:
//   tree.Find(42)  — works even if tree is nil (returns false)

// ─── Value receivers PANIC on nil ───
type BadTree struct{ value int }
func (t BadTree) Value() int { return t.value }  // value receiver

func nilValuePanic() {
	var t *BadTree  // nil
	// t.Value()  // panic: nil pointer dereference
	// Go tries to copy *t (nil) → dereference → panic
	_ = t
}
```

## Method Promotion via Embedding

::code-wrapper{language="go"}
```go
// Embedded type's methods are PROMOTED to the outer type.
// The outer type can SHADOW (not override — no virtual dispatch).

type Base struct{}
func (b Base) Hello() string  { return "hello from Base" }
func (b *Base) Goodbye() string { return "bye from Base" }

type Derived struct {
	Base  // embedded — Hello and Goodbye are promoted
}

func (d Derived) Hello() string { return "hello from Derived" }  // shadows Base.Hello

func embeddingDemo() {
	d := Derived{}
	fmt.Println(d.Hello())      // "hello from Derived" (shadowed)
	fmt.Println(d.Base.Hello())  // "hello from Base" (explicit access)
	fmt.Println(d.Goodbye())     // "bye from Base" (promoted, not shadowed)

	// ⚠️ No virtual dispatch — the method called is determined at
	// COMPILE TIME by the static type, not the runtime type.
	// This differs from Java/C++ virtual methods.
}

// ─── Method promotion and pointer receivers ───
type Service struct{ name string }
func (s *Service) Name() string { return s.name }

type APIService struct {
	*Service  // embedded pointer — must be initialized
}

func ptrEmbeddingDemo() {
	// ❌ APIService{} leaves *Service as nil → Name() panics
	// a := APIService{}; a.Name()  // panic: nil pointer dereference

	// ✅ Initialize the embedded pointer:
	a := APIService{Service: &Service{name: "api"}}
	fmt.Println(a.Name())  // "api" (promoted from *Service)
}
```

## Pointer-Receiver Methods on Unaddressable Values

::code-wrapper{language="go"}
```go
// Go auto-takes the address of ADDRESSABLE values when calling pointer methods:
func autoAddr() {
	c := Counter{}   // addressable (a variable)
	c.Inc()          // ✅ Go auto-takes &c → (&c).Inc()
	(&c).Inc()       // explicit, equivalent
}

// ❌ Unaddressable values — can't auto-take address:
func unaddressable() {
	// Counter{}.Inc()  // ❌ compile error: cannot take address of literal
	// (literals are temporaries — not addressable)

	c := Counter{}
	c.Inc()  // ✅ c is a variable (addressable)

	// Map values are NOT addressable (entries can move during rehashing):
	m := map[string]Counter{"a": {}}
	// m["a"].Inc()  // ❌ compile error: cannot call pointer method on m["a"]
	// Fix: copy out, modify, assign back, or store *Counter:
	v := m["a"]
	v.Inc()
	m["a"] = v

	// Or use map[string]*Counter:
	m2 := map[string]*Counter{"a": {}}
	m2["a"].Inc()  // ✅ *Counter is addressable (the pointer, not the map entry)
}
```

## Methods on Non-Struct Types

::code-wrapper{language="go"}
```go
// Methods can be on any NAMED type (not on imported types or unnamed types).

type Celsius float64

func (c Celsius) String() string { return fmt.Sprintf("%.1f°C", c) }
func (c Celsius) ToF() Fahrenheit { return Fahrenheit(c*9/5 + 32) }

// ✅ Named type — methods allowed:
type MyInt int
func (m MyInt) IsEven() bool { return m%2 == 0 }

// ❌ Can't add methods to int (not your type — it's a predeclared type):
// func (n int) IsEven() bool { ... }  // compile error

// ❌ Can't add methods to []int (unnamed type):
// func (s []int) Sum() int { ... }  // compile error
// Fix: name the type first: type IntSlice []int; func (s IntSlice) Sum() int
```

## Production Pattern — Builder with Fluent API

::code-wrapper{language="go"}
```go
type Request struct {
	method  string
	url     string
	headers map[string]string
	body    []byte
	timeout time.Duration
}

type RequestBuilder struct {
	req Request
}

// Pointer receiver — mutates the builder, returns the builder for chaining:
func (b *RequestBuilder) Method(m string) *RequestBuilder {
	b.req.method = m
	return b  // return the builder for fluent chaining
}

func (b *RequestBuilder) URL(u string) *RequestBuilder {
	b.req.url = u
	return b
}

func (b *RequestBuilder) Header(k, v string) *RequestBuilder {
	if b.req.headers == nil {
		b.req.headers = make(map[string]string)
	}
	b.req.headers[k] = v
	return b
}

func (b *RequestBuilder) Timeout(d time.Duration) *RequestBuilder {
	b.req.timeout = d
	return b
}

func (b *RequestBuilder) Build() Request {
	return b.req
}

// Usage — fluent, readable, type-safe:
req := (&RequestBuilder{}).
	Method("POST").
	URL("https://api.example.com/users").
	Header("Content-Type", "application/json").
	Header("Authorization", "Bearer "+token).
	Timeout(30 * time.Second).
	Build()
```

## 💡 Tips & Tricks

- **Idiom**: consistent receivers — if ANY method has a pointer receiver, ALL methods should. Mixing causes method-set confusion (a value doesn't satisfy interfaces requiring pointer-receiver methods) and is flagged by linters.
- **Idiom**: use value receivers for small, immutable types (`Point`, `Time`, `Celsius`) — copies are cheap and immutability is a feature. Use pointer receivers for large structs or when mutation is needed.
- **Idiom**: nil receiver methods enable the null-object pattern — `func (t *Tree) Find(x int) bool { if t == nil { return false }; ... }`. This eliminates nil-checking at every call site, making tree traversal code clean.
- **Idiom**: receiver names should be short and consistent — `func (c Circle) Area()`, `func (c *Circle) Scale()`. Use the same receiver name across all methods of a type. `gofmt` aligns them.
- **Debug**: `var i Interface = T{}` failing with "does not implement Interface (method X has pointer receiver)" means a method is on `*T` but you're using a value — use `&T{}` or change the receiver to value.
- **Performance**: value receivers copy the receiver — for large structs, this is expensive. For small structs (≤ 64 bytes), the copy is cheaper than the pointer indirection (cache locality, no escape).

## ⚠️ Edge Cases & Gotchas

- **Value receiver can't mutate**: `func (c Circle) Scale()` modifies a copy — the original is unchanged. Use `*Circle` for mutation.
- **Pointer receiver on unaddressable value**: `Counter{}.Inc()` (pointer receiver) fails — the literal isn't addressable. Use a variable: `c := Counter{}; c.Inc()`.
- **Method set and interfaces**: a value type doesn't satisfy interfaces requiring pointer-receiver methods. This is the most common "doesn't implement interface" confusion.
- **Pointer-receiver method on map value**: `m[key].Method()` fails if `Method` is pointer-receiver (map values aren't addressable). Use `map[K]*V` or copy-out-modify-assign-back.
- **No virtual dispatch**: shadowing a promoted method is resolved at compile time by the static type, not at runtime. This differs from Java/C++ virtual methods.
- **Methods on non-struct named types**: `type MyInt int; func (m MyInt) IsEven() bool` — works. But not on predeclared types (`int`, `string`) or unnamed types (`[]int`).
- **Nil receiver panic on value receiver**: a value-receiver method called on a nil `*T` panics (Go tries to dereference nil to copy the value). Only pointer-receiver methods can handle nil.
- **`fmt` doesn't call `String()` on nested values**: `fmt.Println(map[int]User{})` prints `map[1:{Alice}]`, not `User: Alice` — `fmt` calls `String()` on the top-level value, not on elements inside containers.

## 🧠 Quick Quiz

::code-wrapper{language="go"}
```go
type Counter struct{ n int }
func (c Counter) Value() int { return c.n }
func (c *Counter) Inc() { c.n++ }

func main() {
	c := Counter{}
	c.Inc()
	c.Inc()
	fmt.Println(c.Value())
}
```

What's printed?
::
<details>
<summary>Answer</summary>

```
2
```

Even though `Value()` has a value receiver and `Inc()` has a pointer receiver, `c.Inc()` works because `c` is an addressable variable — Go auto-takes `&c` for the pointer-receiver method call. Both `Inc()` calls modify the original `c` via the pointer.

`c.Value()` copies `c` (value receiver) and returns `c.n` = 2.

This compiles and works, but **mixing receivers is an anti-pattern** — it causes confusion with interface satisfaction and is flagged by linters. The consistent fix: make `Value()` a pointer receiver too (`func (c *Counter) Value() int`), since `Inc()` already requires a pointer receiver.

</details>

## 📚 What's Next

→ [12 — Interfaces](/go/12-interfaces) — implicit satisfaction, the nil interface trap, interface internals, and the "accept interfaces, return structs" idiom.