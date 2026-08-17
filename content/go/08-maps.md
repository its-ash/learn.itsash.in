# 08 — Maps

Maps are Go's associative array (hash map) — unordered key/value pairs with O(1) average lookup.

## Declaration and Use

::code-wrapper{language="go"}
```go
var m map[string]int           // nil map — can read, can't write
m = map[string]int{}           // empty, non-nil
m = map[string]int{"a": 1, "b": 2}
m = make(map[string]int)       // empty, non-nil
m = make(map[string]int, 100)  // pre-sized hint

m["c"] = 3                     // set
v := m["a"]                    // get (zero value if absent)
delete(m, "a")                 // delete

// Comma-ok idiom: distinguish "absent" from "zero value"
v, ok := m["x"]
if !ok {
	// key "x" is not in the map
}

len(m)                         // number of entries
```
::

### The comma-ok idiom

`m[key]` returns the zero value if the key is absent — `m["missing"]` for `map[string]int` returns `0`, indistinguishable from a stored `0`. Use `v, ok := m[key]` to check presence:

::code-wrapper{language="go"}
```go
counts := map[string]int{"a": 0}
v, ok := counts["a"]
fmt.Println(v, ok)   // 0 true (present, value 0)

v, ok = counts["b"]
fmt.Println(v, ok)   // 0 false (absent, zero value)
```
::

## Iteration

::code-wrapper{language="go"}
```go
for k, v := range m {
	fmt.Println(k, v)
}
for k := range m {   // keys only
	fmt.Println(k)
}
for _, v := range m {   // values only
	fmt.Println(v)
}
```
::

Map iteration order is **unspecified** (intentionally randomized by the runtime to prevent reliance on it). If you need ordered keys, extract and sort:

::code-wrapper{language="go"}
```go
keys := make([]string, 0, len(m))
for k := range m {
	keys = append(keys, k)
}
sort.Strings(keys)
for _, k := range keys {
	fmt.Println(k, m[k])
}
```
::

## Nil Maps

::code-wrapper{language="go"}
```go
var m map[string]int    // nil map
fmt.Println(m["a"])     // 0 — reading a nil map works
// m["a"] = 1           // PANIC: assignment to entry in nil map
``
::

Reading a nil map returns the zero value; **writing to a nil map panics**. Always `make` a map before writing, or use the `map[...]...{}` literal.

## Map Concurrency (the big caveat)

Maps are **not safe for concurrent reads and writes** — concurrent use causes a fatal error (not a recoverable panic):

::code-wrapper{language="go"}
```go
// ❌ Concurrent writes — fatal: concurrent map writes
m := map[int]int{}
go func() { m[1] = 1 }()
go func() { m[2] = 2 }()
``
::

For concurrent access:
- `sync.RWMutex` wrapping a map (chapter 19).
- `sync.Map` (chapter 19) — built for concurrent use, but optimized for write-rarely/read-many; slower than a plain map + mutex for general use.
- A channel-based owner goroutine (chapter 26).

## Key Types

Map keys can be any **comparable** type: `bool`, numbers, `string`, `rune`, pointers, channels, interfaces (if the dynamic type is comparable), arrays, and structs (if all fields are comparable). **Slices, maps, and functions are not comparable** (can't be keys):

::code-wrapper{language="go"}
```go
m := map[[2]int]string{}          // array key — OK
m := map[struct{ x, y int }]bool{} // struct key — OK
// m := map[[]int]string{}        // ERROR: slice not comparable
``
::

For a "slice key" (e.g., a path), convert to a string (`string(bytes)`) or a struct.

## 💡 Tips & Tricks

- **Idiom**: use the comma-ok idiom (`v, ok := m[key]`) to distinguish "absent" from "zero value" — `m["missing"]` returns `0` for a `map[string]int`, which is indistinguishable from a stored `0`. `ok` tells you whether the key exists.
- **Idiom**: use `make(map[K]V, hint)` with a size hint when you know the approximate number of entries — it pre-allocates the hash buckets, avoiding rehashing as the map grows. Like pre-sizing a slice, this is a cheap optimization for known-size maps.
- **Idiom**: for ordered iteration, extract keys to a slice and sort — map iteration is randomized (intentionally, to prevent order reliance), so any output that needs stable order must sort explicitly. Wrap this in a helper if you do it often.
- **Concurrency**: never use a plain map across goroutines — concurrent map writes cause a fatal (unrecoverable) error. Use `sync.RWMutex` + map for the general case, `sync.Map` for write-rarely/read-many, or a channel-owned map for the owner-goroutine pattern (chapter 26).
- **Idiom**: use struct or array keys for compound keys — `map[struct{ X, Y int }]Cell` is cleaner than nesting maps (`map[int]map[int]Cell`), and it's a single hash lookup instead of two.

## ⚠️ Edge Cases & Gotchas

- **Writing to a nil map panics**: `var m map[string]int; m["a"] = 1` → `panic: assignment to entry in nil map`. Always `make` or use a literal.
- **Reading a nil map returns the zero value**: `var m map[string]int; v := m["a"]` → `0` (no panic). This is convenient but can mask bugs (you expected a value but the map was never initialized).
- **Concurrent map access is fatal**: not a recoverable panic — the program crashes. The runtime detects concurrent map writes and aborts. Use `sync.RWMutex`/`sync.Map`.
- **Map iteration order is randomized**: don't rely on iteration order — it changes between runs (the runtime randomizes it). Sort keys for stable output.
- **Slices, maps, functions can't be keys**: they're not comparable (no equality). Use a string or struct representation as the key.
- **Deleting during iteration**: `for k := range m { delete(m, k) }` is safe (Go allows it) — it deletes every key. But adding keys during iteration is unspecified (may or may not be iterated).
- **`len(nil map) == 0`**: a nil map has length 0, like an empty map. Use `== nil` to distinguish if it matters.
- **Map values can't be addressed**: `&m["a"]` is illegal (map entries may move during rehashing). Take a copy: `v := m["a"]; &v`.
- **Map values can't be modified in place**: `m["a"].field = 1` is illegal (can't take the address). Assign the whole value: `v := m["a"]; v.field = 1; m["a"] = v`. Or store a pointer: `map[string]*Struct`.
- **`make(map, hint)` is a hint, not a limit**: the map grows beyond the hint. The hint just pre-allocates buckets to reduce rehashing.

## 🧠 Spot the Bug

A developer stores structs in a map and tries to update a field:

::code-wrapper{language="go"}
```go
type User struct{ Name string; Active bool }

users := map[int]User{1: {"Alice", false}}
users[1].Active = true   // ERROR: cannot assign to struct field users[1].Active
```
::

What's wrong, and how do you fix it?

<details>
<summary>Answer</summary>

Map values in Go are **not addressable** — you can't take `&users[1]` because a map entry may move during rehashing (the runtime can relocate entries when the map grows). Since you can't take the address, you can't modify a field in place (`users[1].Active = true` requires `&users[1].Active`).

The fix — reassign the whole value:

```go
u := users[1]      // copy out
u.Active = true    // modify the copy
users[1] = u       // assign back
```
::
Or store pointers (then the map value is a pointer, which is addressable):

```go
users := map[int]*User{1: {"Alice", false}}
users[1].Active = true   // OK — users[1] is a *User, and the pointed-to struct is modifiable
```
::
The pointer approach is more efficient for large structs (no copy) but adds allocation (the struct lives on the heap) and requires nil-checking (a map of pointers can have nil values).

**The lesson**: map values aren't addressable (entries can move during rehashing). To modify a struct field in a map, copy out, modify, assign back — or store `*Struct` values.

</details>

## Summary

You can now declare maps, use the comma-ok idiom, iterate (with randomized order), handle nil maps (read ok, write panics), use comparable key types (including structs/arrays), and avoid the concurrent-access fatal error — knowing to use `sync.RWMutex`/`sync.Map` for cross-goroutine maps. Next: structs and composition.