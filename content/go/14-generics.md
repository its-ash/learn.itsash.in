# 14 — Generics

Go 1.18 (2022) introduced generics — type parameters on functions and types. They enable type-safe, reusable code without `interface{}` and type assertions.

## Generic Functions

::code-wrapper{language="go"}
```go
func Map[T, U any](s []T, fn func(T) U) []U {
	result := make([]U, len(s))
	for i, v := range s {
		result[i] = fn(v)
	}
	return result
}

doubled := Map([]int{1, 2, 3}, func(x int) int { return x * 2 })   // [2 4 6]
upper := Map([]string{"a", "b"}, strings.ToUpper)                  // ["A" "B"]
``
::

`[T, U any]` declares type parameters. `any` is the constraint (no restrictions). The function works on any `[]T` and produces `[]U`. Type arguments are usually inferred (`Map` infers `T=int, U=int` from the arguments).

## Type Constraints

Constraints limit which types a type parameter can accept. The `comparable` constraint allows types that support `==`/`!=`:

::code-wrapper{language="go"}
```go
func Contains[T comparable](s []T, v T) bool {
	for _, x := range s {
		if x == v {
			return true
		}
	}
	return false
}

Contains([]int{1, 2, 3}, 2)         // true
Contains([]string{"a", "b"}, "c")  // false
``
::

### The `constraints` package / standard constraints

Go 1.21+ provides standard constraints in `cmp`:

::code-wrapper{language="go"}
```go
import "cmp"

func Max[T cmp.Ordered](a, b T) T {
	if a > b {
		return a
	}
	return b
}

Max(3, 7)         // 7
Max("apple", "banana")   // "banana"
Max(3.14, 2.71)   // 3.14
``
::

`cmp.Ordered` includes all types supporting `<`, `<=`, `>`, `>=` (integers, floats, strings). Pre-1.21, use `golang.org/x/exp/constraints` or define your own:

::code-wrapper{language="go"}
```go
type Ordered interface {
	~int | ~int8 | ~int16 | ~int32 | ~int64 |
	~uint | ~uint8 | ~uint16 | ~uint32 | ~uint64 | ~uintptr |
	~float32 | ~float64 |
	~string
}
``
::

## Custom Constraints

::code-wrapper{language="go"}
```go
type Number interface {
	int | int64 | float64
}

func Sum[T Number](s []T) T {
	var total T
	for _, v := range s {
		total += v
	}
	return total
}

Sum([]int{1, 2, 3})          // 6
Sum([]float64{1.5, 2.5})    // 4.0
// Sum([]string{"a"})       // ERROR: string doesn't satisfy Number
``
::

Constraints are interfaces with **type sets** (a union of types, `int | float64`). `~T` includes types whose underlying type is `T` (so `type MyInt int` satisfies `~int`).

## Generic Types

::code-wrapper{language="go"}
```go
type Stack[T any] struct {
	items []T
}

func (s *Stack[T]) Push(v T) {
	s.items = append(s.items, v)
}

func (s *Stack[T]) Pop() (T, bool) {
	var zero T
	if len(s.items) == 0 {
		return zero, false
	}
	v := s.items[len(s.items)-1]
	s.items = s.items[:len(s.items)-1]
	return v, true
}

s := &Stack[int]{}
s.Push(1)
s.Push(2)
v, _ := s.Pop()   // 2
``
::

Methods on a generic type repeat the type parameter (`func (s *Stack[T]) ...`).

## The `slices` and `maps` Packages (Go 1.21+)

The standard library provides generic utilities:

::code-wrapper{language="go"}
```go
import (
	"slices"
	"maps"
)

s := []int{3, 1, 4, 1, 5}
slices.Sort(s)                 // [1 1 3 4 5]
slices.Contains(s, 3)          // true
i, ok := slices.BinarySearch(s, 4)
slices.Reverse(s)
slices.Clone(s)

m := map[string]int{"a": 1, "b": 2}
keys := maps.Keys(m)           // ["a" "b"] (Go 1.23+: returns iter.Seq)
vals := maps.Values(m)
maps.Copy(dst, src)            // copy all entries
maps.Equal(m1, m2)
``
::

Prefer `slices`/`maps` over hand-rolled generic helpers — they're tested, idiomatic, and cover the common cases.

## Type Inference

Go infers type arguments in most cases:

::code-wrapper{language="go"}
```go
// Inferred from the argument
Map([]int{1, 2, 3}, func(x int) int { return x * 2 })

// Explicit (needed sometimes)
Map[int, int]([]int{1, 2, 3}, func(x int) int { return x * 2 })

// When inference fails (ambiguous), specify explicitly
``
::

## When to Use Generics (and When Not)

**Use generics for**:
- Container types (`Stack[T]`, `Set[T]`, `Pair[K, V]`).
- Utility functions (`Map`, `Filter`, `Reduce`, `Contains`).
- Algorithms over multiple numeric types (`Sum`, `Max`).
- Reducing `interface{}` + type assertions.

**Avoid generics for**:
- Single-use code (just write the concrete version).
- When an interface is clearer (small interfaces compose well).
- Over-abstraction (a generic `Map` is fine; a generic framework is often over-engineered).

## 💡 Tips & Tricks

- **Idiom**: prefer the `slices` and `maps` packages (Go 1.21+) over hand-rolled generic helpers — they cover the common operations (`Sort`, `Contains`, `Clone`, `BinarySearch`, `Keys`, `Values`, `Equal`) and are tested and idiomatic. Reach for your own generics only when the stdlib doesn't cover the case.
- **Idiom**: use `cmp.Ordered` (Go 1.21+) for "any orderable type" — it's the standard constraint for `<`/`>` comparisons, covering integers, floats, and strings. Pre-1.21, define the constraint or use `golang.org/x/exp/constraints`.
- **Idiom**: use `~T` in constraints to include named types — `~int` matches `int` and any `type MyInt int`, so `type UserID int` still satisfies `~int` constraints. Without `~`, a named type based on `int` wouldn't match `int`.
- **Idiom**: don't over-genericize — if a function is used with one type, write it concretely. Generics shine for reusable containers and algorithms; over-abstracting single-use code adds complexity without benefit. "Don't write a generic `Map` if you only have one map call."
- **Idiom**: use generics to replace `interface{}` + type assertions where the type is known at the call site — a `Stack[T]` is type-safe (no `any`, no assertion), and the compiler catches type mismatches at the call, not at runtime.

## ⚠️ Edge Cases & Gotchas

- **Generics don't work with methods**: Go doesn't support generic methods (methods with their own type parameters, distinct from the receiver's). Methods can use the receiver's type parameters, but can't add new ones. This is a known limitation.
- **Type inference can fail**: when the inference is ambiguous (multiple possible type arguments), specify explicitly. The compiler error is usually clear.
- **`comparable` includes interfaces**: interfaces are comparable (with the nil-interface caveat — comparing interfaces holding slices/maps panics at runtime).
- **`~T` and named types**: `~int` matches `int` and `type MyInt int`, but `int` (without `~`) matches only the predeclared `int`, not `MyInt`. Always use `~` if you want named types based on `T` to satisfy the constraint.
- **No specialization**: you can't provide a special implementation for a specific type argument (like C++ template specialization). Write separate functions if you need type-specific behavior.
- **Constraint unions can be large**: `int | int8 | int16 | ...` is verbose. Use the standard constraints (`cmp.Ordered`) or factor common unions into a named constraint interface.
- **Generic types can have methods, but not generic methods**: `func (s *Stack[T]) Push(v T)` is fine (uses `T`); `func (s *Stack[T]) Map[U any](fn func(T) U) []U` is illegal (adds `U`).
- **Instantiation cost**: each distinct type argument set creates a new instantiation (monomorphization). Many distinct types can increase binary size, though the compiler deduplicates where possible.

## 🧠 Spot the Bug

A developer writes a generic `Sum` but it doesn't compile:

::code-wrapper{language="go"}
```go
func Sum[T Number](s []T) T {
	var total T
	for _, v := range s {
		total += v
	}
	return total
}

type Number interface {
	int | float64
}

type Score int

func main() {
	scores := []Score{10, 20, 30}
	fmt.Println(Sum(scores))   // ERROR: Score doesn't satisfy Number
}
```
::

What's wrong?

<details>
<summary>Answer</summary>

`Score` is a named type based on `int` (`type Score int`), but the `Number` constraint uses `int | float64` (without `~`), which matches only the *predeclared* `int` — not `Score`. So `[]Score` doesn't satisfy `Number`, and the call fails.

The fix — use `~int` to include named types whose underlying type is `int`:

```go
type Number interface {
	~int | ~float64
}
```

Now `Score` (underlying type `int`) satisfies `~int`, and `Sum(scores)` works.

**The lesson**: `int` in a constraint matches only the predeclared `int`; `~int` matches `int` and any named type with underlying type `int` (`type Score int`, `type UserID int64`, etc.). Use `~` when you want named types based on the constraint's types to be accepted.

</details>

## Summary

You can now write generic functions and types, use constraints (`any`/`comparable`/`cmp.Ordered`/custom), leverage `~T` for named types, use the `slices`/`maps` packages, and decide when generics are appropriate (reusable containers/algorithms, replacing `interface{}`). Next: error handling — Go's distinctive approach.