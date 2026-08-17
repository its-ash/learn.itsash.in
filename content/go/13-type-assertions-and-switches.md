# 13 — Type Assertions & Type Switches

To use a value held in an interface, you need to get the concrete type back. Go provides type assertions and type switches for this.

## Type Assertion

::code-wrapper{language="go"}
```go
var i interface{} = "hello"

s := i.(string)      // asserts i holds a string; panics if not
fmt.Println(s)       // hello

// n := i.(int)      // PANIC: interface conversion: interface {} is string, not int
``
::

A type assertion `i.(T)` claims `i`'s dynamic type is `T`. If it's not, the program **panics**.

## Comma-Ok Form

::code-wrapper{language="go"}
```go
var i interface{} = "hello"

s, ok := i.(string)   // ok = true, s = "hello"
n, ok := i.(int)      // ok = false, n = 0 (zero value) — no panic

if s, ok := i.(string); ok {
	fmt.Println("string:", s)
} else {
	fmt.Println("not a string")
}
``
::

The comma-ok form is the safe way — it never panics, returning `(zeroValue, false)` on a mismatch. Use this whenever the type isn't guaranteed.

## Type Switch

::code-wrapper{language="go"}
```go
func describe(i interface{}) {
	switch v := i.(type) {
	case string:
		fmt.Println("string of length", len(v))
	case int:
		fmt.Println("int:", v)
	case []int:
		fmt.Println("int slice:", v)
	case nil:
		fmt.Println("nil")
	default:
		fmt.Printf("unknown type %T: %v\n", v, v)
	}
}

describe("hi")      // string of length 2
describe(42)        // int: 42
describe(nil)       // nil
``
::

`switch v := i.(type)` — `v` has the asserted type in each case. This is the idiomatic way to dispatch on an interface's dynamic type.

### Multiple types in a case

::code-wrapper{language="go"}
```go
switch v := i.(type) {
case int, int64, uint:
	fmt.Println("integer:", v)   // v has type interface{} here (multiple types)
case string:
	fmt.Println("string:", v)    // v is string
}
``
::

When multiple types share a case, `v` is `interface{}` (the original type), since it could be any of them.

## Assertion to an Interface

You can assert to another interface, not just a concrete type:

::code-wrapper{language="go"}
```go
var r io.Reader = strings.NewReader("hello")
ra, ok := r.(io.ReaderAt)   // does r also satisfy io.ReaderAt?
// strings.Reader doesn't, so ok = false
``
::

This checks whether the dynamic type satisfies a *different* interface — useful for optional capabilities.

## 💡 Tips & Tricks

- **Idiom**: use the comma-ok form (`v, ok := i.(T)`) whenever the type isn't guaranteed — the single-value form (`v := i.(T)`) panics on mismatch, which is almost never what you want in production code. Reserve the panicking form for cases where a mismatch is a genuine programming error (a violated invariant).
- **Idiom**: use a type switch (`switch v := i.(type)`) for multi-type dispatch — it's clearer and safer than a chain of `if v, ok := i.(T); ok` checks. Each case binds `v` to the asserted type, so you can use it directly.
- **Idiom**: prefer type switches over long assertion chains — `switch v := i.(type) { case int: ...; case string: ... }` is more readable than `if v, ok := i.(int); ok { ... } else if v, ok := i.(string); ok { ... }`.
- **Idiom**: assert to interfaces, not just concrete types — `if ra, ok := r.(io.ReaderAt); ok` checks an optional capability. This is how the stdlib does feature-checking (e.g., `io.Writer` vs `io.WriterAt`).
- **Debug**: `i.(T)` panicking with "interface conversion: interface {} is X, not T" means the dynamic type isn't `T` — use comma-ok to handle the mismatch gracefully, or fix the logic that put the wrong type in the interface.

## ⚠️ Edge Cases & Gotchas

- **`i.(T)` panics on mismatch**: the single-value form. Use comma-ok unless a mismatch is a bug.
- **Assertion to an unrelated type panics**: `i.(T)` where `i`'s dynamic type isn't `T` (and isn't assignable to `T`) panics, even if `T` is an interface the type doesn't satisfy.
- **`v` in a multi-type case is `interface{}`**: `case int, string: ... v ...` — `v` is `any`, not `int` or `string` (it could be either). Type-assert again inside the case if needed.
- **Assertion to a pointer type**: `i.(*Dog)` — works if `i` holds a `*Dog`. `i.(Dog)` fails if `i` holds a `*Dog` (pointer is not the value type).
- **Type switch with `nil` case**: `case nil:` matches a nil interface (not an interface wrapping a nil pointer — see chapter 12). Handle `nil` explicitly to avoid panicking in other cases.
- **`default` is required for unknown types**: without a `default`, an unrecognized type falls through silently. Add `default:` for safety (even if it just panics or logs).
- **Type assertions don't work on non-interface types**: `var x int = 5; x.(int)` is a compile error — assertions are for interface values. Use a regular type conversion for concrete types.

## 🧠 Spot the Bug

A developer processes a JSON-decoded value and gets a panic:

::code-wrapper{language="go"}
```go
var data interface{}
json.Unmarshal([]byte(`{"count": 42}`), &data)

m := data.(map[string]interface{})
count := m["count"].(int)   // PANIC: interface conversion: interface {} is float64, not int
```
::

What's wrong?

<details>
<summary>Answer</summary>

`encoding/json` decodes JSON numbers as `float64` (the default), not `int`. So `m["count"]` holds a `float64` (42.0), and `m["count"].(int)` panics because the dynamic type is `float64`, not `int`.

The fix — assert to `float64` and convert, or use `json.Decoder` with `UseNumber()`, or unmarshal into a typed struct:

```go
// Option 1: assert to float64, then convert
count := int(m["count"].(float64))

// Option 2: comma-ok to handle the mismatch safely
if f, ok := m["count"].(float64); ok {
	count := int(f)
}

// Option 3: UseNumber — numbers become json.Number (string-backed)
dec := json.NewDecoder(bytes.NewReader([]byte(`{"count": 42}`)))
dec.UseNumber()
var data interface{}
dec.Decode(&data)
m := data.(map[string]interface{})
n, _ := m["count"].(json.Number).Int64()   // parse as int64

// Option 4: unmarshal into a struct (best for known schemas)
type Data struct{ Count int }
var d Data
json.Unmarshal([]byte(`{"count": 42}`), &d)
// d.Count == 42
```
::
Option 4 (typed struct) is the idiomatic way for known schemas — it avoids the `interface{}`/type-assertion dance entirely. Use `interface{}` only for dynamic/unknown schemas.

**The lesson**: `json.Unmarshal` into `interface{}` makes numbers `float64` (not `int`). Type-asserting to `int` panics. Assert to `float64` and convert, use `UseNumber`, or unmarshal into a struct.

</details>

## Summary

You can now use type assertions (panicking and comma-ok forms), type switches (with per-case typed `v`), assert to interfaces (capability checks), and handle JSON's `float64`-for-numbers behavior. Next: generics.