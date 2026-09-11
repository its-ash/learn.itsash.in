---
title: "08 — Maps"
description: "Hash map internals, bucket layout, the concurrency fatal error, the non-addressable value trap, ordered maps, and concurrent map patterns."
---

# 08 — Maps

## Hash Map Internals

::code-wrapper{language="go"}
```go
// Go's map is a hash table with overflow buckets.
// ┌──────────────────────────────────────────────────────────────────┐
// │  hmap struct (runtime/map.go)                                   │
// │   ├── count     int      — number of entries                    │
// │   ├── B         uint8    — log2 of bucket count (2^B buckets)   │
// │   ├── hash0      uint32   — hash seed (randomized per map)       │
// │   ├── buckets    unsafe.Pointer — array of 2^B buckets          │
// │   └── oldbuckets unsafe.Pointer — pre-growth buckets (for evac) │
// │                                                                  │
// │  Bucket (8 entries max):                                        │
// │   ├── tophash [8]uint8  — top byte of each key's hash            │
// │   ├── keys    [8]KeyType                                       │
// │   ├── values  [8]ValueType                                      │
// │   └── overflow *bucket  — linked list for >8 collisions         │
// │                                                                  │
// │  Lookup: hash(key) → bucket = hash & (2^B - 1)                  │
// │          scan tophash array for top byte match → full key compare│
// │          if bucket full, follow overflow pointer                 │
// │                                                                  │
// │  Growth: when load factor > 6.5 or too many overflow buckets:   │
// │          allocate 2x buckets, evacuate incrementally (not all   │
// │          at once — amortized, prevents latency spikes)          │
// └──────────────────────────────────────────────────────────────────┘

func internals() {
	m := make(map[string]int, 1000)  // hint: pre-allocate ~1000 buckets
	// The hint is NOT a limit — the map grows as needed.
	// But pre-sizing avoids the incremental growth phase (rehashing).
	// Actual bucket count = next power of 2 >= hint.

	// Each bucket holds 8 entries. With 1000 entries and 8 per bucket:
	//   128 buckets minimum (2^7 = 128). The hint causes B=7.
	// Without the hint, the map starts with B=0 (1 bucket) and grows
	// incrementally, rehashing multiple times to reach B=7.
}
```

## Declaration and the Comma-OK Idiom

::code-wrapper{language="go"}
```go
// ┌────────────────────────────────────────────────────────────┐
// │ Declaration              │ Nil?    │ Can Write?            │
// │ ──────────────────────── │ ─────── │ ────────────────────── │
// │ var m map[K]V           │ yes     │ ❌ panic on write     │
// │ m = map[K]V{}           │ no      │ ✅                    │
// │ m = make(map[K]V)       │ no      │ ✅                    │
// │ m = make(map[K]V, n)   │ no      │ ✅ (pre-sized)        │
// └────────────────────────────────────────────────────────────┘

func basics() {
	m := map[string]int{"a": 1, "b": 2}
	m["c"] = 3
	delete(m, "a")

	// Comma-ok: distinguish "absent" from "zero value"
	v, ok := m["x"]
	if !ok {
		// "x" is not in the map
		fmt.Println("missing")
	} else {
		fmt.Println("value:", v)
	}

	// ⚠️ Without comma-ok, m["missing"] returns the ZERO VALUE:
	fmt.Println(m["nonexistent"])  // 0 — indistinguishable from a stored 0

	// Reading a nil map is safe (returns zero value):
	var nilMap map[string]int
	fmt.Println(nilMap["a"])  // 0 — no panic

	// Writing to a nil map PANICS:
	// nilMap["a"] = 1  // panic: assignment to entry in nil map
}
```

## The Non-Addressable Value Trap

::code-wrapper{language="go"}
```go
type User struct{ Name string; Active bool }

func mapFieldTrap() {
	users := map[int]User{1: {"Alice", false}}

	// ❌ Compile error: cannot assign to struct field users[1].Active
	// users[1].Active = true
	//
	// WHY: map entries are NOT addressable — they can move during
	// rehashing. &users[1] would be a dangling pointer after a growth.

	// ✅ Fix 1: copy out, modify, assign back:
	u := users[1]
	u.Active = true
	users[1] = u

	// ✅ Fix 2: store pointers (the struct lives on the heap, the map
	//    holds pointers — pointers are addressable):
	usersPtr := map[int]*User{1: {"Alice", false}}
	usersPtr[1].Active = true  // ✅ usersPtr[1] is *User, modifiable
	// Trade-off: extra allocation per struct, must nil-check pointers
}

// ✅ Production pattern: map of pointers for mutable structs:
type Session struct {
	ID     string
	UserID int64
	Expiry time.Time
}

type SessionStore struct {
	mu       sync.RWMutex
	sessions map[string]*Session  // pointers — fields modifiable in place
}

func (s *SessionStore) Touch(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if sess, ok := s.sessions[id]; ok {  // nil-check the pointer
		sess.Expiry = time.Now().Add(30 * time.Minute)
	}
}
```

## Concurrent Map Access — The Fatal Error

::code-wrapper{language="go"}
```go
// ❌ ANTI-PATTERN: concurrent map writes — FATAL (not recoverable)
func concurrentMapBad() {
	m := map[int]int{}
	go func() { m[1] = 1 }()
	go func() { m[2] = 2 }()
	// fatal error: concurrent map writes
	// The runtime detects this and aborts — you CANNOT recover.
	// This is not a panic; it's a direct crash.
	time.Sleep(time.Second)
}

// ✅ Pattern 1: sync.RWMutex + map (general purpose, type-safe)
type SafeMap[K comparable, V any] struct {
	mu sync.RWMutex
	m  map[K]V
}

func NewSafeMap[K comparable, V any]() *SafeMap[K, V] {
	return &SafeMap[K, V]{m: make(map[K]V)}
}

func (sm *SafeMap[K, V]) Get(key K) (V, bool) {
	sm.mu.RLock()
	defer sm.mu.RUnlock()
	v, ok := sm.m[key]
	return v, ok
}

func (sm *SafeMap[K, V]) Set(key K, val V) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	sm.m[key] = val
}

func (sm *SafeMap[K, V]) Delete(key K) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	delete(sm.m, key)
}

// ✅ Pattern 2: sync.Map (write-rarely, read-many)
// import "sync"
var cache sync.Map
cache.Store("key", "value")
v, ok := cache.Load("key")
cache.Delete("key")
cache.Range(func(k, v any) bool {
	return true  // continue iteration
})
// Trade-off: uses `any` (no generics — must type-assert), slower than
// map+RWMutex for balanced read/write, but faster for write-rarely.

// ✅ Pattern 3: channel-owned map (owner goroutine pattern)
// See chapter 26 — one goroutine owns the map, others send commands.
```

## Ordered Map — Production Implementation

::code-wrapper{language="go"}
```go
// Go's map is unordered (intentionally randomized). When you need
// insertion-order iteration, build an ordered map:

type OrderedMap[K comparable, V any] struct {
	keys []K          // insertion order
	data map[K]V      // fast lookup
}

func NewOrderedMap[K comparable, V any]() *OrderedMap[K, V] {
	return &OrderedMap[K, V]{data: make(map[K]V)}
}

func (m *OrderedMap[K, V]) Set(key K, val V) {
	if _, exists := m.data[key]; !exists {
		m.keys = append(m.keys, key)  // only add to keys on first insertion
	}
	m.data[key] = val
}

func (m *OrderedMap[K, V]) Get(key K) (V, bool) {
	v, ok := m.data[key]
	return v, ok
}

func (m *OrderedMap[K, V]) Delete(key K) {
	if _, exists := m.data[key]; !exists {
		return
	}
	delete(m.data, key)
	// Remove from keys slice (O(n) — use a linked list for O(1) deletion):
	for i, k := range m.keys {
		if k == key {
			m.keys = append(m.keys[:i], m.keys[i+1:]...)
			break
		}
	}
}

func (m *OrderedMap[K, V]) Range(fn func(K, V) bool) {
	for _, k := range m.keys {
		if !fn(k, m.data[k]) {
			break
		}
	}
}
```

## Key Types — What Can Be a Map Key

::code-wrapper{language="go"}
```go
// Keys must be COMPARABLE (support == and !=):
//   ✅ bool, int, float, string, rune, pointer, channel, interface
//   ✅ array (if element type is comparable)
//   ✅ struct (if all fields are comparable)
//   ❌ slice, map, function — NOT comparable (can't be keys)

// Struct key — compound key (cleaner than nested maps):
type Point struct{ X, Y int }
grid := map[Point]string{
	{0, 0}: "origin",
	{1, 2}: "target",
}

// ❌ Nested map is slower (two hash lookups) and less clear:
// grid := map[int]map[int]string{}  // grid[1][2] — two lookups

// Array key — fixed-size byte sequence as key:
paths := map[[32]byte]*Node{}  // SHA-256 hash → node

// For a "string key" that's a byte slice — convert to string:
// m[string(byteSlice)] = value
// ⚠️ This allocates (string(bytes) copies). For high-frequency keys,
// use a string from the start (avoid the conversion).
```

## Iteration — Randomized Order and Safe Deletion

::code-wrapper{language="go"}
```go
func iteration() {
	m := map[string]int{"a": 1, "b": 2, "c": 3, "d": 4}

	// Iteration order is RANDOMIZED (intentionally — prevents code
	// from depending on order, which would break on different Go versions):
	for k, v := range m {
		fmt.Println(k, v)  // order varies each run
	}

	// Ordered iteration — extract and sort keys:
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		fmt.Println(k, m[k])  // deterministic: a, b, c, d
	}

	// Safe deletion during iteration:
	for k := range m {
		delete(m, k)  // ✅ safe — Go explicitly allows this
	}
	fmt.Println(len(m))  // 0

	// ⚠️ Adding keys during iteration is UNspecified:
	// new keys may or may not be iterated — don't rely on this behavior
}
```

## 💡 Tips & Tricks

- **Performance**: `make(map[K]V, hint)` pre-allocates buckets when you know the approximate size — avoids the incremental growth/rehashing phase. The hint is not a limit; the map grows as needed.
- **Safety**: never use a plain map across goroutines — concurrent writes cause a **fatal** (unrecoverable) error. Use `sync.RWMutex` + map for the general case, `sync.Map` for write-rarely/read-many.
- **Idiom**: use struct keys for compound keys — `map[struct{ X, Y int }]Cell` is cleaner and faster (one hash lookup) than nested maps `map[int]map[int]Cell` (two lookups).
- **Idiom**: the comma-ok idiom (`v, ok := m[key]`) is essential when the zero value is a valid stored value — `m["missing"]` returns `0`, indistinguishable from a stored `0`. Always use comma-ok when absence is meaningful.
- **Performance**: store `*Struct` in maps when you need to mutate fields — map values aren't addressable, so `map[int]Struct` requires copy-out/modify/assign-back for each field update. `map[int]*Struct` allows in-place mutation.
- **Idiom**: clear a map with `clear(m)` (Go 1.21+) — deletes all entries in one call. Faster than re-allocating with `m = make(map[K]V)`, and keeps the same underlying buckets.

## ⚠️ Edge Cases & Gotchas

- **Writing to nil map panics**: `var m map[string]int; m["a"] = 1` → `panic: assignment to entry in nil map`. Always `make` or use a literal.
- **Reading nil map returns zero value**: `var m map[string]int; v := m["a"]` → `0` (no panic). Can mask uninitialized-map bugs.
- **Concurrent map access is fatal**: not a recoverable panic — the program crashes. The runtime detects concurrent writes and aborts immediately.
- **Map values are not addressable**: `&m["a"]` is illegal (entries can move during rehashing). Copy out, modify, assign back — or store `*Struct`.
- **`m[key].field = value` is a compile error**: can't take the address of a map value. Use the copy-out pattern or store pointers.
- **Map iteration order is randomized**: never depend on iteration order — it changes between runs. Sort keys for stable output.
- **Deleting during iteration is safe**: `for k := range m { delete(m, k) }` is explicitly allowed. Adding keys during iteration is unspecified.
- **Slices, maps, functions can't be keys**: they're not comparable. Use a string or struct representation as the key.
- **`clear(m)` (Go 1.21+)**: deletes all entries but keeps the map allocated (buckets retained). `m = make(map[K]V)` creates a new map (old GC'd). `clear` is faster if you'll reuse the map.
- **`make(map, hint)` hint is not exact**: the actual bucket count is the next power of 2 ≥ hint. `make(map[K]V, 100)` → 128 buckets.
- **Pointer keys compare by address, not value**: `map[*int]string` — two `&x` and `&y` where `x == y` are different keys (different addresses). Use `int` as the key, not `*int`.

## 🧠 Quick Quiz

::code-wrapper{language="go"}
```go
m := map[string]*int{}
x := 1
y := 1
m["a"] = &x
m["b"] = &y
fmt.Println(*m["a"] == *m["b"])
fmt.Println(m["a"] == m["b"])
```

What's printed?
::
<details>
<summary>Answer</summary>

```
true
false
```

- `*m["a"] == *m["b"]` → `true` — the pointed-to values are both 1.
- `m["a"] == m["b"]` → `false` — the pointers are different (`&x` ≠ `&y`, different addresses).

This is the key distinction for pointer-keyed maps: `map[*int]string` uses pointer **address** for equality, not the pointed-to value. Two distinct `*int` variables pointing to equal values are **different keys**.

If you want value-based equality, use the value as the key: `map[int]string` (not `map[*int]string`).

</details>

## 📚 What's Next

→ [09 — Structs](/go/09-structs) — field layout, embedding vs inheritance, struct tags, and the zero-value-is-useful idiom.