---
title: "13 — Type Assertions & Type Switches"
description: "Comma-ok assertions, type switch dispatch, interface-to-interface capability checks, JSON float64 traps, and panic-safe patterns."
---

# 13 — Type Assertions & Type Switches

## Type Assertion — Panicking vs Comma-Ok

::code-wrapper{language="go"}
```go
// Type assertion extracts the concrete type from an interface.
// Two forms: panicking (unsafe) and comma-ok (safe).

func assertionDemo() {
	var i any = "hello"

	// ❌ Panicking form — panics if the type doesn't match:
	s := i.(string)    // s = "hello" — ok
	// n := i.(int)     // PANIC: interface conversion: interface {} is string, not int

	// ✅ Comma-ok form — never panics, returns (zero, false) on mismatch:
	s, ok := i.(string)  // s = "hello", ok = true
	n, ok := i.(int)     // n = 0, ok = false — no panic

	// Idiomatic: use comma-ok in an if-init:
	if s, ok := i.(string); ok {
		fmt.Println("string of length", len(s))
	} else {
		fmt.Println("not a string")
	}
}

// ┌──────────────────────────────────────────────────────────────────────┐
// │ When to use the panicking form:                                      │
// │   Only when a mismatch indicates a programming error (a violated     │
// │   invariant). Example: you KNOW the interface holds a *Config        │
// │   because you put it there — `cfg := i.(*Config)` panics if your    │
// │   assumption is wrong, which is a bug you want to catch.             │
// │                                                                      │
// │ When to use comma-ok:                                                │
// │   Whenever the type isn't guaranteed — external input, JSON decode, │
// │   optional capabilities. This is the default in production code.     │
// └──────────────────────────────────────────────────────────────────────┘
```

## Type Switch — Multi-Type Dispatch

::code-wrapper{language="go"}
```go
// The type switch dispatches on the dynamic type of an interface.
// Each case binds the variable to the asserted type.

func describe(i any) string {
	switch v := i.(type) {
	case nil:
		return "nil"
	case int:
		return fmt.Sprintf("int: %d", v)        // v is int
	case string:
		return fmt.Sprintf("string: %q", v)    // v is string
	case []byte:
		return fmt.Sprintf("bytes: %x", v)      // v is []byte
	case error:
		return v.Error()                         // v is error interface
	default:
		return fmt.Sprintf("unknown %T: %v", v, v)
	}
}

// ─── Multiple types in one case ───
func numericType(i any) {
	switch v := i.(type) {
	case int, int8, int16, int32, int64:
		// ⚠️ v is `any` here (not int or int64) — could be any of them
		// Must type-assert again to use as a specific type:
		fmt.Printf("integer: %v\n", v)
	case float32, float64:
		fmt.Printf("float: %v\n", v)
	}
}

// ─── Type switch with init statement ───
func switchWithInit(i any) {
	switch v := i.(type); v {
	case int:
		_ = v
	}
}
```

## Interface-to-Interface Assertion — Capability Checks

::code-wrapper{language="go"}
```go
// You can assert that an interface value satisfies ANOTHER interface.
// This is "capability checking" — does this type also implement X?

func capabilityCheck() {
	var r io.Reader = strings.NewReader("hello")

	// Does r also satisfy io.Writer? (strings.Reader does NOT)
	if w, ok := r.(io.Writer); ok {
		w.Write([]byte("..."))  // never reached
	}

	// Does r satisfy io.ReaderAt? (strings.Reader DOES)
	if ra, ok := r.(io.ReaderAt); ok {
		buf := make([]byte, 3)
		ra.ReadAt(buf, 1)  // reads "ell"
		fmt.Println(string(buf))  // "ell"
	}
}

// ─── Production pattern: optional capabilities ───
func writeAll(w io.Writer, data []byte) error {
	// If w supports io.Closer, close it after writing:
	if c, ok := w.(io.Closer); ok {
		defer c.Close()
	}
	_, err := w.Write(data)
	return err
}

// The stdlib does this: http.Response.Body is an io.ReadCloser, but
// some wrappers only implement io.Reader. Code checks for io.Closer
// before calling Close to avoid panics.
```

## The JSON float64 Trap

::code-wrapper{language="go"}
```go
// encoding/json decodes numbers as float64 by default.
// Type-asserting to int panics — the dynamic type is float64.

func jsonTrap() {
	var data any
	json.Unmarshal([]byte(`{"count": 42, "price": 9.99}`), &data)

	m := data.(map[string]any)
	// count := m["count"].(int)  // PANIC: interface is float64, not int

	// ✅ Assert to float64, then convert:
	count := int(m["count"].(float64))  // 42
	price := m["price"].(float64)      // 9.99

	// ✅ Or use comma-ok to handle safely:
	if f, ok := m["count"].(float64); ok {
		count := int(f)
		_ = count
	}
}

// ─── Better: use UseNumber for json.Number (string-backed) ───
func jsonUseNumber() {
	dec := json.NewDecoder(strings.NewReader(`{"count": 42}`))
	dec.UseNumber()  // numbers become json.Number (a string)
	var data any
	dec.Decode(&data)
	m := data.(map[string]any)
	n, _ := m["count"].(json.Number).Int64()  // parse as int64
	fmt.Println(n)  // 42
}

// ─── Best: unmarshal into a typed struct ───
type Product struct {
	Count int     `json:"count"`
	Price float64 `json:"price"`
}
func jsonStruct() {
	var p Product
	json.Unmarshal([]byte(`{"count": 42, "price": 9.99}`), &p)
	fmt.Println(p.Count)  // 42 (int, not float64)
}
```

## Production Pattern — Custom Unmarshaler

::code-wrapper{language="go"}
```go
// When JSON has a polymorphic field (different types per key), implement
// json.Unmarshaler to handle the type dispatch cleanly.

type FlexibleValue struct {
	StrVal   string
	IntVal   int64
	FloatVal float64
	BoolVal  bool
	IsNull   bool
}

func (f *FlexibleValue) UnmarshalJSON(data []byte) error {
	data = bytes.TrimSpace(data)
	if string(data) == "null" {
		f.IsNull = true
		return nil
	}
	if data[0] == '"' {
		return json.Unmarshal(data, &f.StrVal)
	}
	if data[0] == 't' || data[0] == 'f' {
		return json.Unmarshal(data, &f.BoolVal)
	}
	// Try int first, then float:
	if i, err := strconv.ParseInt(string(data), 10, 64); err == nil {
		f.IntVal = i
		return nil
	}
	return json.Unmarshal(data, &f.FloatVal)
}

// This avoids the float64-for-everything problem — you control the
// type inference instead of relying on json's default behavior.
```

## ⚠️ Edge Cases & Gotchas

- **`i.(T)` panics on mismatch**: the single-value form. Use comma-ok unless a mismatch is a bug.
- **Multi-type case `v` is `any`**: `case int, string: ... v ...` — `v` is `any`, not `int` or `string`. Assert again inside the case.
- **Assertion to pointer type**: `i.(*Dog)` works if `i` holds a `*Dog`. `i.(Dog)` fails if `i` holds `*Dog` (pointer ≠ value type).
- **`case nil` matches nil interface**: `case nil:` matches `(type=nil, value=nil)`, NOT an interface wrapping a nil pointer. Handle both.
- **`default` is required for unknown types**: without `default`, an unrecognized type falls through silently. Add `default:` for safety.
- **Type assertions don't work on non-interface types**: `var x int = 5; x.(int)` is a compile error. Assertions are for interface values only.
- **JSON numbers are float64**: `json.Unmarshal` into `any` makes all numbers `float64`. Asserting to `int` panics. Use `UseNumber` or typed structs.
- **Assertion to an interface the type doesn't satisfy**: `i.(io.Writer)` where `i`'s type doesn't have `Write` → `ok = false` (comma-ok) or panic (single-value).

## 🧠 Quick Quiz

::code-wrapper{language="go"}
```go
func process(i any) {
	switch v := i.(type) {
	case nil:
		fmt.Println("nil")
	case int, string:
		fmt.Println("int or string:", v)
	case string:
		fmt.Println("string:", v)
	}
}
process("hello")
```

What's printed?
::
<details>
<summary>Answer</summary>

```
int or string: hello
```

The `case int, string:` matches FIRST (it comes before `case string:`). In a type switch, the FIRST matching case wins — cases are checked top to bottom. The `case string:` below is unreachable (shadowed).

`v` in the `case int, string:` block is `any` (since it could be either), so `fmt.Println("int or string:", v)` prints the value with default formatting: `hello`.

**The lesson**: type switch cases are checked in order. If a multi-type case comes before a specific case for one of those types, the specific case is unreachable. Put specific cases first, or remove the overlap. `go vet` and linters can flag unreachable cases.

</details>

## 📚 What's Next

→ [14 — Generics](/go/14-generics) — type parameters, constraints, `cmp.Ordered`, `~T` underlying-type matching, and the `slices`/`maps` packages.