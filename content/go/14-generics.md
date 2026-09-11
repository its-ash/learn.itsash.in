---
title: "14 — Generics"
description: "Type parameters, type-set constraints, `~T` underlying-type matching, `cmp.Ordered`, the `slices`/`maps` packages, and generic type design patterns."
---

# 14 — Generics

Go 1.18 introduced generics — type parameters on functions and types. They enable type-safe, reusable code without `interface{}` and type assertions.

## Generic Functions

::code-wrapper{language="go"}
```go
// [T, U any] declares type parameters. `any` is the constraint (no restrictions).
// Type arguments are inferred from the call in most cases.

func Map[T, U any](s []T, fn func(T) U) []U {
	result := make([]U, len(s))
	for i, v := range s {
		result[i] = fn(v)
	}
	return result
}

// Usage — type args inferred:
doubled := Map([]int{1, 2, 3}, func(x int) int { return x * 2 })  // [2 4 6]
upper := Map([]string{"a", "b"}, strings.ToUpper)                  // ["A" "B"]

// Explicit type args (when inference is ambiguous):
_ = Map[int, string]([]int{1, 2}, func(x int) string { return fmt.Sprintf("%d", x) })
```

## Type Constraints — Type Sets and `~T`

::code-wrapper{language="go"}
```go
// Constraints are interfaces with TYPE SETS — a union of types.
// `~T` includes T AND any named type whose UNDERLYING type is T.

type Number interface {
	int | int64 | float64
}

// Without `~`, a named type like `type MyInt int` does NOT satisfy `int`:
type StrictInt interface{ int }
type TildeInt interface{ ~int }

type MyInt int

func strict[T StrictInt](v T) T { return v }
func tilde[T TildeInt](v T) T { return v }

func constraintDemo() {
	var x MyInt = 42
	// strict(x)   // ❌ compile error: MyInt doesn't satisfy `int` (no ~)
	_ = tilde(x)   // ✅ MyInt satisfies `~int` (underlying type is int)
	_ = x
}

// ─── cmp.Ordered (Go 1.21+ standard constraint) ───
import "cmp"

func Max[T cmp.Ordered](a, b T) T {
	if a > b { return a }
	return b
}
// cmp.Ordered = all types supporting <, <=, >, >=:
//   ~int | ~int8 | ... | ~uint | ... | ~float32 | ~float64 | ~string
```

## Custom Constraints with Methods

::code-wrapper{language="go"}
```go
// Constraints can require METHODS in addition to type sets.
// This combines "has these methods" with "is one of these types."

// ─── Constraint requiring a String() method ───
type Stringer interface {
	String() string
}

func Join[T Stringer](items []T, sep string) string {
	var b strings.Builder
	for i, item := range items {
		if i > 0 { b.WriteString(sep) }
		b.WriteString(item.String())  // calls String() — type-safe, no assertion
	}
	return b.String()
}

// ─── Constraint combining type set + method ───
type NumberWithStr interface {
	~int | ~float64
	String() string
}

// ─── The `comparable` constraint ───
// `comparable` allows types that support == and !=.
// Required for map keys and equality checks in generics.

func Contains[T comparable](s []T, v T) bool {
	for _, x := range s {
		if x == v { return true }
	}
	return false
}

// ⚠️ `comparable` does NOT include slices, maps, or functions
// (they're not comparable with ==). A struct containing a slice
// is also not comparable, even if all other fields are.
```

## Generic Types

::code-wrapper{language="go"}
```go
// Generic types have type parameters on the type declaration.
// Methods repeat the type parameter in the receiver.

type Stack[T any] struct {
	items []T
}

func NewStack[T any]() *Stack[T] {
	return &Stack[T]{}
}

func (s *Stack[T]) Push(v T) {
	s.items = append(s.items, v)
}

func (s *Stack[T]) Pop() (T, bool) {
	var zero T  // zero value of T — works for any T
	if len(s.items) == 0 {
		return zero, false
	}
	v := s.items[len(s.items)-1]
	s.items = s.items[:len(s.items)-1]
	return v, true
}

func (s *Stack[T]) Len() int { return len(s.items) }

// Usage — type-safe, no assertions:
intStack := NewStack[int]()
intStack.Push(1)
intStack.Push(2)
v, _ := intStack.Pop()  // v is int (not any)
// intStack.Push("hello")  // compile error: string ≠ int

strStack := NewStack[string]()
strStack.Push("hello")
```

## Generic Type with Multiple Type Parameters

::code-wrapper{language="go"}
```go
// A generic map with default values:

type Map[K comparable, V any] struct {
	data map[K]V
}

func NewMap[K comparable, V any]() *Map[K, V] {
	return &Map[K, V]{data: make(map[K]V)}
}

func (m *Map[K, V]) Get(key K, defaultVal V) V {
	if v, ok := m.data[key]; ok {
		return v
	}
	return defaultVal
}

func (m *Map[K, V]) Set(key K, val V) {
	m.data[key] = val
}

func (m *Map[K, V]) GetOrInit(key K, init func() V) V {
	if v, ok := m.data[key]; ok {
		return v
	}
	v := init()
	m.data[key] = v
	return v
}

// Usage:
m := NewMap[string, int]()
m.Set("count", 42)
fmt.Println(m.Get("count", 0))      // 42
fmt.Println(m.Get("missing", -1))   // -1 (default)
fmt.Println(m.GetOrInit("lazy", func() int { return 100 }))  // 100
```

## The `slices` and `maps` Packages (Go 1.21+)

::code-wrapper{language="go"}
```go
import (
	"slices"
	"maps"
)

func stdlibGenerics() {
	// ─── slices package ───
	s := []int{3, 1, 4, 1, 5, 9, 2, 6}
	slices.Sort(s)                              // [1 1 2 3 4 5 6 9]
	slices.SortStableFunc(s, func(a, b int) int { return a - b })
	slices.Reverse(s)
	clone := slices.Clone(s)                   // independent copy
	slices.Contains(s, 5)                      // true
	idx, found := slices.BinarySearch(s, 4)    // idx=3, found=true
	s = slices.Delete(s, 0, 2)                 // remove indices 0,1
	s = slices.Insert(s, 0, 0)                 // insert 0 at front
	slices.Compact(s)                          // remove consecutive duplicates
	slices.DeleteFunc(s, func(v int) bool { return v < 3 })

	// ─── maps package ───
	m := map[string]int{"a": 1, "b": 2, "c": 3}
	keys := maps.Keys(m)        // []string (unordered, Go 1.23+: iter.Seq)
	vals := maps.Values(m)      // []int
	maps.Copy(dst, src)         // copy all entries from src to dst
	maps.Equal(m1, m2)          // compare two maps
	maps.DeleteFunc(m, func(k string, v int) bool { return v < 2 })
	maps.Clone(m)               // independent copy
}

// Prefer slices/maps over hand-rolled helpers — tested, idiomatic, fast.
```

## Type Inference — When You Need Explicit Args

::code-wrapper{language="go"}
```go
// Go infers type args in most cases. You need explicit args when:
//   1. Inference is ambiguous
//   2. You want a different type than what would be inferred
//   3. The function has no parameters to infer from

// Case 1: empty slice — can't infer T from []T{}:
// Map([]int{}, func(x int) int { return x * 2 })  // ok (function literal hints T)
// But sometimes the compiler can't infer:
//   func Foo[T any]() T { var zero T; return zero }
//   x := Foo()  // ❌ can't infer T
//   x := Foo[int]()  // ✅ explicit

// Case 2: different result type than input:
func Transform[T any, U any](v T, fn func(T) U) U { return fn(v) }
// Transform(42, func(x int) string { return fmt.Sprintf("%d", x) })
// — T=int, U=string — inferred from the function literal. Usually works.

// Case 3: no args to infer from:
func Zero[T any]() T { var zero T; return zero }
_ = Zero[int]()  // must specify T — no value to infer from
```

## When to Use Generics — and When Not

::code-wrapper{language="go"}
```go
// ┌──────────────────────────┬──────────────────────────────────────────┐
// │ Use generics for          │ Avoid generics for                       │
// │ ──────────────────────────│ ───────────────────────────────────────── │
// │ Container types (Stack[T])│ Single-use code (write it concretely)    │
// │ Utility funcs (Map, Filter)│ When an interface is clearer             │
// │ Algorithms over types     │ Over-abstraction (a generic framework)   │
// │ Replacing interface{} +   │ When the type constraint is so specific   │
// │   type assertions          │   that only one type ever satisfies it    │
// └──────────────────────────┴──────────────────────────────────────────┘

// ❌ ANTI-PATTERN: over-genericizing single-use code
//   func process[T any](items []T, fn func(T) T) []T { ... }
//   If you only call this with []User once, just write:
//   func processUsers(items []User, fn func(User) User) []User { ... }

// ✅ CORRECT: generics for reusable containers:
//   Stack[T], Set[T], Queue[T], Map[K, V] — used across many types

// ❌ ANTI-PATTERN: generic with a single-type constraint
//   func OnlyInt[T int](v T) T { return v }
//   If only int works, just use int — generics add no value.
```

## 💡 Tips & Tricks

- **Idiom**: prefer `slices`/`maps` (Go 1.21+) over hand-rolled generic helpers — they cover `Sort`, `Contains`, `Clone`, `BinarySearch`, `Keys`, `Values`, `Equal`. Reach for your own generics only when the stdlib doesn't cover the case.
- **Idiom**: use `~T` in constraints to include named types — `~int` matches `int` AND `type MyInt int`. Without `~`, named types based on `int` don't match, which is rarely what you want for numeric constraints.
- **Idiom**: use `cmp.Ordered` (Go 1.21+) for "any orderable type" — covers integers, floats, and strings. Pre-1.21, define the constraint yourself or use `golang.org/x/exp/constraints`.
- **Idiom**: don't over-genericize — if a function is used with one type, write it concretely. Generics shine for reusable containers and algorithms; over-abstracting single-use code adds complexity.
- **Idiom**: use generics to replace `interface{}` + type assertions where the type is known at the call site — a `Stack[T]` is type-safe (no `any`, no assertion), and the compiler catches type mismatches at compile time.
- **Performance**: generic functions are monomorphized in most cases — the compiler generates a version per type argument, so there's no runtime overhead (no virtual dispatch like interfaces). But this increases binary size.

## ⚠️ Edge Cases & Gotchas

- **Generics don't work with methods**: Go doesn't support generic methods (methods with their own type parameters distinct from the receiver's). Methods can use the receiver's type parameters, but can't add new ones. This is a known limitation.
- **`comparable` doesn't include slices/maps/functions**: a struct containing a slice isn't `comparable`, even if all other fields are. Can't use it as a map key or in `==` within a generic function.
- **`~T` requires the underlying type**: `~int` matches `type MyInt int` but NOT `type MyStruct struct{ x int }`. The `~` matches underlying type, not struct fields.
- **Type inference can fail on nil**: `Map(nil, fn)` — can't infer T from a nil slice. Specify explicitly: `Map[int, int](nil, fn)`.
- **Generic types can't have generic methods**: `type Stack[T any] struct{}; func (s *Stack[T]) Map[U any](fn func(T) U) []U` — compile error. This is the #1 generics limitation.
- **Constraint interfaces with methods can't be used as regular interfaces**: `type Stringer interface { String() string }` works as both a constraint and a regular interface. But `type Num interface { ~int | ~float64; String() string }` can only be a constraint (type sets can't be in regular interfaces).
- **Binary size**: generics are monomorphized — each type argument generates a separate copy. For a generic function used with 10 types, the binary includes 10 copies. Usually negligible, but can matter for embedded/binary-size-constrained builds.
- **Zero value of a type parameter**: `var zero T` gives the zero value of T — works for any T. Can't do `T{}` (struct literal) unless T is constrained to structs.

## 🧠 Quick Quiz

::code-wrapper{language="go"}
```go
type MyInt int

func Add[T ~int](a, b T) T { return a + b }

func main() {
	var x MyInt = 10
	var y MyInt = 20
	fmt.Println(Add(x, y))
}
```

Does this compile, and what's printed?
::
<details>
<summary>Answer</summary>

Compiles and prints:

```
30
```

The constraint `~int` matches `MyInt` because `MyInt`'s underlying type is `int`. The `~` tilde prefix means "this type or any named type with this underlying type."

If the constraint were `int` (without `~`), `Add(x, y)` would fail with: "MyInt does not satisfy int" — because `int` (without tilde) only matches the predeclared `int`, not named types based on it.

This is why `~` is critical in constraints for numeric types — users often have `type UserID int64`, `type Celsius float64`, etc., and they expect generic numeric functions to work with them.

</details>

## 📚 What's Next

→ [15 — Error Handling](/go/15-error-handling) — error wrapping, `errors.Is`/`As`, sentinel errors, typed errors, and the panic-vs-error decision.