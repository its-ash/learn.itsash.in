---
title: "07 — Arrays, Slices & Strings"
description: "Slice header memory layout, append growth strategy, aliasing and full-slice expressions, the slices package, and zero-allocation string/byte patterns."
---

# 07 — Arrays, Slices & Strings

## Array vs Slice — The Type Distinction

::code-wrapper{language="go"}
```go
// ┌──────────────────────────────────────────────────────────────────────┐
// │ Array                          │ Slice                               │
// │ ────────────────────────────── │ ─────────────────────────────────── │
// │ [3]int — length is IN the type │ []int — length is dynamic           │
// │ Value type (copied on assign)  │ Reference-ish (header copied)       │
// │ Fixed size, stack-allocated    │ Header {ptr, len, cap}, heap data   │
// │ Rarely used directly            │ Go's primary list type              │
// └──────────────────────────────────────────────────────────────────────┘

// Arrays — length is part of the type:
var a [3]int         // [0 0 0] — zero value, stack-allocated
b := [3]int{1, 2, 3}
c := [...]int{4, 5}  // [2]int — length inferred

// ❌ ANTI-PATTERN: passing arrays by value (copies the whole array)
func badSum(arr [1000]int) int {  // copies 8000 bytes on every call
	total := 0
	for _, v := range arr { total += v }
	return total
}

// ✅ CORRECT: pass a slice (copies only the 24-byte header)
func goodSum(arr []int) int {
	total := 0
	for _, v := range arr { total += v }
	return total
}

// When to use arrays: fixed-size collections known at compile time
//   — SHA-256 hash: [32]byte
//   — UUID: [16]byte
//   — RGB color: [3]uint8
//   — Matrix math: [4][4]float64
```

## Slice Header — The Memory Model

::code-wrapper{language="go"}
```go
// A slice is a 3-word header (24 bytes on 64-bit):
//
//   ┌──────────┬──────────┬──────────┐
//   │ ptr      │ len      │ cap      │
//   │ 8 bytes │ 8 bytes │ 8 bytes │
//   └──────────┴──────────┴──────────┘
//        ↓
//   [elem0][elem1][elem2]...[elemN-1]  ← underlying array (heap)
//
// ptr: points to the first element in the underlying array
// len: number of elements VISIBLE (the slice can see)
// cap: number of elements from ptr to the end of the underlying array

type sliceHeader struct {
	data unsafe.Pointer  // pointer to underlying array
	len  int             // visible length
	cap  int             // capacity (from data to end of array)
}

// Passing a slice to a function copies the HEADER (24 bytes), not the data.
// The function can modify elements (shared array) but can't change the
// caller's len/cap (the header is copied by value).

func modifySlice(s []int) {
	s[0] = 99          // ✅ modifies the shared underlying array — caller sees it
	s = append(s, 1)    // ✅ modifies the LOCAL copy of the header — caller does NOT see the append
	_ = s
}

func main() {
	s := []int{1, 2, 3}
	modifySlice(s)
	fmt.Println(s)  // [99 2 3] — s[0] changed, but len is still 3 (append not visible)
}
```

## `append` — Growth Strategy and the Reassignment Rule

::code-wrapper{language="go"}
```go
// When len < cap: append writes to the existing array, increments len.
// When len == cap: append allocates a NEW larger array, copies old elements,
//                  appends the new element, and returns a NEW header.

// ❌ ANTI-PATTERN: not reassigning the result of append
func appendBad(s []int, x int) {
	append(s, x)  // result is LOST — s is unchanged
	// if append grew the slice, the new array is orphaned (memory leak)
}

// ✅ CORRECT: always reassign
func appendGood(s []int, x int) []int {
	return append(s, x)  // returns the (possibly new) header
}

// ─── Go's growth strategy (runtime/slice.go) ───
//   - For small slices (cap < 256): doubles the capacity
//   - For large slices (cap >= 256): grows by ~1.25x + 192 bytes
//   - This balances allocation frequency vs. memory waste
//
//   newcap := old.cap * 2          (if old.cap < 256)
//   newcap := old.cap + old.cap/4 + 192  (if old.cap >= 256)
//
// Pre-allocate when you know the size to avoid this entirely:
func preAlloc(n int) []int {
	s := make([]int, 0, n)  // one allocation, zero reallocations
	for i := 0; i < n; i++ {
		s = append(s, i)    // stays within cap — no reallocation
	}
	return s
}
```

### The aliasing trap

::code-wrapper{language="go"}
```go
func aliasingTrap() {
	s := make([]int, 3, 5)  // [0 0 0], cap 5 — room for 2 more without realloc
	t := s                   // t shares the SAME underlying array

	t = append(t, 42)        // len(t)=4, still within cap 5 — writes to shared array
	fmt.Println(s)           // [0 0 0] — len(s) is still 3, but...
	fmt.Println(s[:4])       // [0 0 0 42] — the 42 is in s's underlying array!

	// When append EXCEEDS capacity, a new array is allocated:
	t = append(t, 99)        // len(t)=5, still within cap 5
	t = append(t, 100)       // len(t)=6, cap exceeded → NEW array allocated
	// Now t points to a new array; s still points to the old one.
	// s is [0 0 0 42 99] (cap 5), t is [0 0 0 42 99 100] (new array, new cap)
}

// ✅ Full-slice expression to prevent aliasing: s[low:high:max]
//   — sets the capacity to (max - low), forcing append to reallocate
func noAliasing() {
	s := make([]int, 3, 5)
	t := s[:2:2]  // cap = 2 (not 5) — append(t, x) MUST allocate a new array
	t = append(t, 42)
	fmt.Println(s)  // [0 0 0] — s's underlying array untouched
}
```

## `copy` and `slices.Clone`

::code-wrapper{language="go"}
```go
// copy copies min(len(dst), len(src)) elements — no aliasing.
func copyDemo() {
	src := []int{1, 2, 3, 4, 5}
	dst := make([]int, 3)
	n := copy(dst, src)    // 3 — copies 3 elements
	fmt.Println(dst)      // [1 2 3]

	// Copy a sub-slice:
	dst2 := make([]int, 5)
	copy(dst2[1:], src)   // dst2 = [0 1 2 3 4]
	_ = dst2
}

// Go 1.21+ slices.Clone — creates an independent copy:
import "slices"
func cloneDemo() {
	original := []int{1, 2, 3}
	copy := slices.Clone(original)  // new underlying array
	copy[0] = 99
	fmt.Println(original)  // [1 2 3] — unaffected
	fmt.Println(copy)      // [99 2 3]
}
```

## `slices` Package (Go 1.21+) — Production Slice Operations

::code-wrapper{language="go"}
```go
import "slices"

func slicesPkg() {
	s := []int{3, 1, 4, 1, 5, 9, 2, 6}

	// Sorting (generic — works with any ordered type):
	slices.Sort(s)                      // [1 1 2 3 4 5 6 9]
	slices.SortStableFunc(s, func(a, b int) int { return a - b })

	// Searching (sorted slice required):
	idx, found := slices.BinarySearch(s, 5)  // idx=5, found=true

	// Insert at index:
	s = slices.Insert(s, 0, 0)  // insert 0 at front: [0 1 1 2 3 4 5 6 9]

	// Delete range [low, high):
	s = slices.Delete(s, 0, 2)  // remove indices 0,1: [1 2 3 4 5 6 9]

	// Delete by predicate:
	s = slices.DeleteFunc(s, func(v int) bool { return v < 3 })

	// Contains:
	if slices.Contains(s, 5) { /* ... */ }

	// Reverse (in place):
	slices.Reverse(s)

	// Max/Min (ordered):
	largest := slices.Max(s)
	smallest := slices.Min(s)

	// Compact (remove consecutive duplicates — like Unix uniq):
	dupes := []int{1, 1, 2, 2, 2, 3}
	compact := slices.Compact(dupes)  // [1 2 3]
	_ = compact
}
```

## Zero-Allocation String/Byte Patterns

::code-wrapper{language="go"}
```go
// ─── strings.Builder — amortized O(n) concatenation ───
func buildString(parts []string) string {
	// Estimate total length to pre-grow (avoids reallocations):
	total := 0
	for _, p := range parts { total += len(p) }

	var b strings.Builder
	b.Grow(total)  // pre-allocate — one allocation, no reallocations
	for _, p := range parts {
		b.WriteString(p)
	}
	return b.String()  // zero-copy: returns the internal buffer directly
}

// ─── bytes.Buffer — mutable byte buffer (for byte-level work) ───
func buildBytes(parts [][]byte) []byte {
	var buf bytes.Buffer
	for _, p := range parts {
		buf.Write(p)  // Write([]byte) — no string conversion
	}
	return buf.Bytes()  // returns the internal slice (alias, not a copy)
}

// ─── unsafe zero-copy string ↔ []byte (Go 1.20+ — advanced) ───
// import "unsafe"
func unsafeZeroCopy() {
	s := "hello"
	// Get a []byte that shares s's memory — ZERO allocation:
	b := unsafe.Slice(unsafe.StringData(s), len(s))
	// ⚠️ b shares the string's read-only memory. NEVER modify b —
	// it would corrupt the read-only string table and cause crashes.
	// Only use this for READ-ONLY operations (hashing, comparison).

	// The reverse: []byte → string without copying:
	b2 := []byte{'w', 'o', 'r', 'l', 'd'}
	s2 := unsafe.String(&b2[0], len(b2))
	// ⚠️ s2 aliases b2's memory. Modifying b2 after this corrupts s2.
	// Only safe if b2 is never modified after this point.
	_ = s2
}
```

## Performance — Pre-allocation Benchmark

::code-wrapper{language="go"}
```go
// benchmark_test.go
func BenchmarkAppendNoPrealloc(b *testing.B) {
	b.ReportAllocs()
	for n := 0; n < b.N; n++ {
		s := []int{}            // starts nil, grows via append
		for i := 0; i < 1000; i++ {
			s = append(s, i)
		}
	}
}
// Result: ~1000 allocs/op (one per reallocation cycle)
//         ~8000 B/op

func BenchmarkAppendPrealloc(b *testing.B) {
	b.ReportAllocs()
	for n := 0; n < b.N; n++ {
		s := make([]int, 0, 1000)  // one allocation, capacity for all
		for i := 0; i < 1000; i++ {
			s = append(s, i)  // stays within cap — zero reallocations
		}
	}
}
// Result: 1 alloc/op (the initial make)
//         ~8000 B/op
// ~10x fewer allocations, same memory — the allocation overhead is the win
```

## 💡 Tips & Tricks

- **Performance**: `make([]T, 0, capacity)` when you know the eventual size — pre-allocating avoids repeated reallocations. The zero in `make([]T, 0, n)` means "don't pre-fill with zero values I'll overwrite"; the `n` means "reserve space for n elements."
- **Safety**: use the full-slice expression `s[low:high:max]` when you need to prevent aliasing — `s[:2:2]` forces `append` to allocate a new array, so the caller's underlying array is never modified.
- **Idiom**: `slices.Clone(s)` (Go 1.21+) is the clear way to make an independent copy — `make([]T, len(s)); copy(...)` is verbose. `slices.Clone` allocates a new array and copies all elements.
- **Performance**: `strings.Builder.Grow(total)` before writing — estimate the total size and pre-grow. Without `Grow`, the builder doubles its buffer, causing log(n) reallocations. One `Grow` call can eliminate all of them.
- **Idiom**: `bytes.Equal(a, b)` is faster than `string(a) == string(b)` — it compares bytes directly without allocating string conversions. Same for `bytes.Compare` vs `strings.Compare`.
- **Debug**: the slice aliasing trap — `t := s; t = append(t, x)` may modify `s`'s underlying array if `t`'s append stays within `cap(s)`. If you need `t` independent, use `slices.Clone(s)` or the full-slice expression `s[:len(s):len(s)]`.

## ⚠️ Edge Cases & Gotchas

- **nil slice vs empty slice**: `var s []int` (nil, `s == nil` true) vs `s := []int{}` (non-nil, empty). `json.Marshal(nil)` → `null`; `json.Marshal([]int{})` → `[]`. APIs may treat these differently.
- **`append` to nil slice works**: `var s []int; s = append(s, 1)` → `[1]`. No need to `make` first.
- **Always reassign `append`'s result**: `append(s, x)` returns a new header (possibly pointing to a new array). If you don't reassign, the growth is lost and the new array is leaked.
- **`range` captures len at start**: `for i, v := range s` evaluates `s` once; appending to `s` inside the loop doesn't extend iteration.
- **Removing while ranging forward skips elements**: indices shift after removal. Build a new slice, iterate backwards, or use `slices.DeleteFunc`.
- **`make([]T, n)` vs `make([]T, 0, n)`**: first gives len n (n zeros); second gives len 0, cap n (empty, ready for n appends). Use the second for "collect n items."
- **`strings.Builder.String()` doesn't copy**: returns the internal buffer directly (zero-copy, safe because strings are immutable). Don't call `Write` after `String()` — it panics.
- **`copy` returns `min(len(dst), len(src))`**: useful when dst is smaller than src — you know exactly how many elements were copied.
- **`append` with multiple slices**: `s = append(s, other...)` spreads `other` into `s`. If `cap(s) - len(s) < len(other)`, append reallocates once. Pre-grow: `s = slices.Grow(s, len(other))` then `append`.

## 🧠 Quick Quiz

::code-wrapper{language="go"}
```go
func grow(s []int) []int {
	s = append(s, 1)
	s = append(s, 2)
	s = append(s, 3)
	return s
}

func main() {
	s := make([]int, 0, 2)
	t := grow(s)
	fmt.Println(s, t)
	fmt.Println(cap(s), cap(t))
}
```

What's printed?
::
<details>
<summary>Answer</summary>

`s` and `t` likely share the same underlying array:

```
[] [1 2 3]
2 4
```

Wait — let's trace it:
1. `s := make([]int, 0, 2)` — len 0, cap 2
2. `s = append(s, 1)` — len 1, cap 2 (within capacity, writes to shared array)
3. `s = append(s, 2)` — len 2, cap 2 (within capacity)
4. `s = append(s, 3)` — len 3 > cap 2 → **new array allocated**, cap grows to 4

After step 4, `s` (inside `grow`) points to a NEW array. The original `s` (in `main`) still points to the old array with cap 2.

But the old array has `1` and `2` written to it (from steps 2-3). So:
- `main`'s `s` = `[]` (len 0, but the underlying array has [1, 2])
- `grow`'s `t` = `[1, 2, 3]` (new array, cap 4)

Output:
```
[] [1 2 3]
2 4
```

The key insight: `grow` receives a copy of the slice header. The first two appends modify the shared underlying array (visible to `main` if it slices further), but the third append triggers a reallocation — `grow`'s `s` now points to a new array, while `main`'s `s` still points to the old one. The returned `t` is the new header.

</details>

## 📚 What's Next

→ [08 — Maps](/go/08-maps) — hash map internals, concurrency safety, the comma-ok idiom, and the non-addressable value trap.