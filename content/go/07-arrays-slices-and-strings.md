# 07 — Arrays, Slices & Strings

Slices are Go's primary list type. Understanding the array/slice distinction, capacity, and `append` mechanics is essential — most Go bugs involve slices.

## Arrays

An array has a **fixed length** (part of the type) and is **value-typed** (copied on assignment):

::code-wrapper{language="go"}
```go
var a [3]int              // [0 0 0]
b := [3]int{1, 2, 3}
c := [...]int{4, 5, 6}    // length inferred: [3]int{4, 5, 6}

// Length is part of the type — [3]int and [4]int are different types
// Arrays are copied on assignment (value semantics)
d := b
d[0] = 99
fmt.Println(b)   // [1 2 3] — b unchanged
fmt.Println(d)   // [99 2 3]
``
::

Arrays are rare in application code — use slices instead. Arrays are used for fixed-size collections (e.g., a SHA-256 hash `[32]byte`) or when the size is a compile-time constant.

## Slices

A slice is a **dynamic-length view** into an underlying array. It's a header (`{pointer, length, capacity}`), passed by value (the header, not the data):

::code-wrapper{language="go"}
```go
var s []int               // nil slice (len 0, cap 0, s == nil)
s = []int{}               // empty, non-nil slice
s = []int{1, 2, 3}
s = make([]int, 5)        // len 5, cap 5, zero values
s = make([]int, 5, 10)    // len 5, cap 10

len(s)   // length (number of elements)
cap(s)   // capacity (space in underlying array)

s[0]     // index
s[1:3]   // slice (half-open: indices 1, 2)
s[:2]    // first 2
s[2:]    // from index 2 to end
s[:]     // whole slice
```
::

### Slice internals

A slice header is `{ptr *array, len int, cap int}`:
- `ptr` points to the first element in the underlying array.
- `len` is the number of elements visible.
- `cap` is the number of elements from `ptr` to the end of the underlying array.

Slicing (`s[1:3]`) creates a new header pointing into the *same* array — no copy. Modifying elements through the sub-slice affects the original.

## `append`

`append` adds elements, growing the underlying array if needed:

::code-wrapper{language="go"}
```go
s := []int{1, 2, 3}
s = append(s, 4)         // [1 2 3 4]
s = append(s, 5, 6)      // [1 2 3 4 5 6]
s = append(s, []int{7, 8}...)   // spread another slice

// append returns a new slice — always reassign:
s = append(s, x)         // ✅
append(s, x)             // ❌ result is lost
```
::

### How `append` grows

When `len == cap`, `append` allocates a new, larger array, copies the old elements, and appends. The growth strategy (Go runtime): roughly doubles for small slices, ~1.25x for large — balancing allocation frequency vs. memory waste.

**Always reassign the result of `append`**: `s = append(s, x)`. If the slice grew, the new header points to a new array; the old header still points to the old (now-stale) array.

### The `append` aliasing trap

::code-wrapper{language="go"}
```go
s := make([]int, 3, 5)   // [0 0 0], cap 5
t := s                   // t shares the same underlying array
t = append(t, 1)         // t = [0 0 0 1], len 4 — still within cap 5, same array
// s is still [0 0 0] (len 3), but s[3] is now 1 (shared array!)
fmt.Println(s[:4])       // [0 0 0 1] — the append affected s's underlying array
``
::

When `append` stays within capacity, it writes to the shared underlying array — surprising if you expected `t` to be independent. When `append` exceeds capacity, a new array is allocated and the sharing stops.

## `copy`

`copy` copies elements between slices (no aliasing):

::code-wrapper{language="go"}
```go
src := []int{1, 2, 3}
dst := make([]int, 3)
n := copy(dst, src)      // 3 — min(len(dst), len(src))
fmt.Println(dst)         // [1 2 3]

// copy to a sub-slice
copy(dst[1:], src)       // dst = [1 1 2]
```
::

`copy` is the safe way to duplicate a slice's data. `dst = append([]int{}, src...)` also copies but is less clear.

## Removing an Element

::code-wrapper{language="go"}
```go
s := []int{1, 2, 3, 4, 5}
i := 2

// Remove s[i], preserving order (shifts)
s = append(s[:i], s[i+1:]...)   // [1 2 4 5]

// Remove s[i], not preserving order (fast — swaps with last)
s[i] = s[len(s)-1]
s = s[:len(s)-1]                // [1 2 5] (order changed)
``
::

The order-preserving removal is O(n) (shifts elements). The swap-and-pop is O(1) but changes order — fine when order doesn't matter.

## Inserting an Element

::code-wrapper{language="go"}
```go
s := []int{1, 2, 4, 5}
i := 2
s = append(s, 0)             // grow by one (placeholder)
copy(s[i+1:], s[i:])         // shift right
s[i] = 3                     // [1 2 3 4 5]
``
::

The `slices` package (Go 1.21+) provides `slices.Insert`, `slices.Delete`, `slices.Sort`, etc. — prefer these over manual manipulation:

::code-wrapper{language="go"}
```go
import "slices"

s := []int{1, 2, 4, 5}
s = slices.Insert(s, 2, 3)   // [1 2 3 4 5]
s = slices.Delete(s, 1, 2)   // remove index 1: [1 3 4 5]
slices.Sort(s)
i, ok := slices.BinarySearch(s, 3)
``
::

## Strings (recap)

Strings are immutable byte slices (chapter 04). For mutable byte buffers, use `[]byte` or `bytes.Buffer`/`strings.Builder`.

### `strings.Builder` for efficient concatenation

::code-wrapper{language="go"}
```go
// ❌ O(n²) — each + allocates a new string
s := ""
for _, w := range words {
	s += w
}

// ✅ O(n) — Builder amortizes
var b strings.Builder
for _, w := range words {
	b.WriteString(w)
}
result := b.String()
``
::

`strings.Builder` (and `bytes.Buffer`) grow exponentially, making repeated appends O(n) total. String concatenation with `+` in a loop is O(n²).

## 💡 Tips & Tricks

- **Idiom**: use `make([]T, 0, capacity)` when you know the eventual size — pre-allocating the capacity avoids repeated reallocations as `append` grows the slice. `make([]int, 0, n)` followed by n appends is O(n); starting from nil and appending n times is O(n log n) (amortized, but with more allocations).
- **Idiom**: always reassign the result of `append` — `s = append(s, x)`. If the slice grew beyond capacity, `append` returns a new header pointing to a new array; the old `s` header still points to the old (stale) array. Forgetting to reassign is a classic silent bug.
- **Idiom**: use the `slices` package (Go 1.21+) for slice operations — `slices.Insert`, `slices.Delete`, `slices.Sort`, `slices.Contains`, `slices.BinarySearch` are clearer and less error-prone than manual `append`/`copy` manipulations. The generic versions work with any comparable type.
- **Idiom**: use `strings.Builder` (or `bytes.Buffer`) for repeated string concatenation — `s += w` in a loop is O(n²) (each `+` allocates); `Builder.WriteString` amortizes to O(n). The difference is dramatic for large strings.
- **Debug**: the slice aliasing trap — `t := s; t = append(t, x)` *may* modify `s`'s underlying array (if `t`'s append stays within `cap(s)`). If you need an independent copy, `t := make([]T, len(s)); copy(t, s)` or `t := slices.Clone(s)` (Go 1.21+).

## ⚠️ Edge Cases & Gotchas

- **`len(nil slice) == 0`, `cap(nil slice) == 0`**: a nil slice behaves like an empty slice for most operations (`range`, `append`, `len`). `json.Marshal(nil)` → `null` vs `[]` for empty — a JSON API surprise.
- **`append` to a nil slice works**: `var s []int; s = append(s, 1)` → `[1]`. No need to `make` first.
- **Slice aliasing**: `t := s[1:3]` shares the underlying array; modifying `t[0]` modifies `s[1]`. Use `copy` or `slices.Clone` for independence.
- **`append` within capacity modifies the shared array**: `t := s[:2:2]` (full-slice expression, cap 2) forces `append(t, x)` to allocate a new array — a way to prevent aliasing. `s[low:high:max]` sets the capacity to `max - low`.
- **`range` over a slice evaluates the slice once**: `for i, v := range s` — `s` is evaluated at loop start; appending to `s` inside the loop doesn't extend the iteration.
- **Removing while ranging**: `for i, v := range s { if cond { s = append(s[:i], s[i+1:]...) } }` — the indices shift after removal, skipping elements. Iterate backwards or build a new slice.
- **`copy` returns the number of elements copied**: `n := copy(dst, src)` is `min(len(dst), len(src))` — useful when dst is smaller than src.
- **Array vs slice type**: `[3]int` is an array (fixed size, value type); `[]int` is a slice (dynamic, reference-ish). They're different types — you can't assign one to the other without conversion (`s := arr[:]`).
- **`make([]T, n)` vs `make([]T, 0, n)`**: the first gives len n (n zero elements); the second gives len 0, cap n (empty but ready for n appends). For "collect n items," use the second (don't pre-fill with zeros you'll overwrite).
- **`strings.Builder` `String()` doesn't copy**: `b.String()` returns the underlying buffer (zero-copy) — safe because strings are immutable, but don't modify the Builder after calling `String()` (it panics).

## 🧠 Spot the Bug

A developer filters a slice in place and loses elements:

::code-wrapper{language="go"}
```go
func filterEven(s []int) []int {
	for i, v := range s {
		if v%2 != 0 {
			s = append(s[:i], s[i+1:]...)   // ❌ shifts elements, range index drifts
		}
	}
	return s
}
filterEven([]int{1, 2, 3, 4, 5})   // expects [2 4], gets [2 4 5] (5 not checked)
```
::

What's wrong, and how do you fix it?

<details>
<summary>Answer</summary>

Two problems:

1. **Index drift**: after `s = append(s[:i], s[i+1:]...)`, all elements after `i` shift left by one. The next `range` iteration increments `i` to `i+1`, but the element that *was* at `i+1` is now at `i` — so it's skipped. Elements after a removal are never checked.

2. **Modifying a slice during `range`**: `range` evaluated `s` at loop start (its length and backing array). After `append(s[:i], s[i+1:]...)` shifts elements, the loop continues based on the *original* length, reading stale/shifted positions.

The fix — build a new slice (cleanest) or iterate backwards:

```go
// Option 1: build a new slice (idiomatic)
func filterEven(s []int) []int {
	result := make([]int, 0, len(s))
	for _, v := range s {
		if v%2 == 0 {
			result = append(result, v)
		}
	}
	return result
}

// Option 2: iterate backwards (in-place, no index drift)
func filterEven(s []int) []int {
	for i := len(s) - 1; i >= 0; i-- {
		if s[i]%2 != 0 {
			s = append(s[:i], s[i+1:]...)
		}
	}
	return s
}

// Option 3: Go 1.21+ slices.DeleteFunc
s = slices.DeleteFunc(s, func(v int) bool { return v%2 != 0 })
```
::
**The lesson**: removing elements from a slice while iterating forward with `range` skips elements (indices shift). Build a new slice (idiomatic) or iterate backwards. `slices.DeleteFunc` (Go 1.21+) is the cleanest.

</details>

## Summary

You can now use arrays (fixed, value-typed) and slices (dynamic, the default), understand the slice header and aliasing, `append` (and its growth/reassign rules), `copy`, removal/insertion (or `slices.Insert`/`Delete`), and `strings.Builder` for efficient concatenation — while avoiding the aliasing and modify-during-range traps. Next: maps.