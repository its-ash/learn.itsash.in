# 03 — Variables, Constants & Types

## Variable Declaration

Go offers several declaration forms:

::code-wrapper{language="go"}
```go
var x int           // zero value (0)
var y = 42          // type inferred from the value
var z int = 100     // explicit type and value
w := 7              // short declaration (inside functions only) — type inferred

var (
	a = 1
	b = 2
	c = 3
)
```
::

- `var name type` — declared with zero value.
- `var name = value` — type inferred.
- `name := value` — **short declaration**, only inside functions. The most common form.
- `var (...)` — block declaration for groups.

### Short declaration `:=` rules

- Only inside a function (not at package scope).
- At least one variable on the left must be **new** — if all are already declared, it's a compile error (use `=` instead).
- If some variables are new and some are re-assignments, the new ones are declared, the existing ones are assigned:

::code-wrapper{language="go"}
```go
f, err := os.Open("file")   // both new — declared
// ...
f, err = os.Open("other")   // both existing — must use =, not :=
f2, err := os.Open("third") // f2 is new, err is reassigned — legal
```
::

## Zero Values

Every type has a zero value — variables are never uninitialized:

| Type | Zero value |
|---|---|
| `int`, `float64`, etc. | `0` |
| `bool` | `false` |
| `string` | `""` (empty string) |
| `pointer`, `slice`, `map`, `chan`, `func`, `interface` | `nil` |
| `struct` | a struct with all fields at their zero values |

`nil` is the zero value for reference types. It's a predeclared identifier (not a keyword) representing "no value."

## Constants

Constants are compile-time-known, immutable values:

::code-wrapper{language="go"}
```go
const Pi = 3.14159
const MaxSize int = 100

const (
	StatusOK = 200
	StatusNotFound = 404
)

// Untyped constants — can be used in any numeric context without conversion
const x = 5
var y int64 = x   // no conversion needed — x is untyped
var z float64 = x // also works
```
::

### Untyped constants

An untyped constant has no fixed type — it adopts the type needed in its context. This lets `const x = 5` work with `int`, `int64`, `float64` without explicit conversion, as long as the value fits. Typed constants require conversion.

### `iota`

`iota` is a constant counter, used for enumerated values:

::code-wrapper{language="go"}
```go
const (
	Sunday    = iota   // 0
	Monday              // 1
	Tuesday             // 2
	Wednesday           // 3
	Thursday            // 4
	Friday              // 5
	Saturday            // 6
)

// Bit flags
const (
	Read    = 1 << iota   // 1
	Write                  // 2
	Execute                // 4
)

// Skipping values
const (
	_  = iota   // 0, ignored
	KB = 1 << (10 * iota)  // 1 << 10
	MB                      // 1 << 20
	GB                      // 1 << 30
)
```
::

`iota` resets to 0 in each `const` block and increments by 1 per line (regardless of blank lines or skipped values). It's the idiomatic way to define enums in Go (which has no `enum` keyword).

## Naming Conventions

- **Exported** (visible outside the package): `PascalCase` — `Println`, `Server`, `MaxRetries`.
- **Unexported** (package-private): `camelCase` — `println`, `server`, `maxRetries`.
- **Acronyms**: keep them consistently cased — `HTTPServer`, `xmlParser`, `userID` (not `UserId`).
- **Short names** for short scope: `i`, `j` for loop indices; `n` for counts. Longer names for larger scope.
- **No underscores** in identifiers (except `_` as a blank identifier). `my_var` is non-idiomatic; use `myVar` or `myVar`.

### The blank identifier `_`

`_` discards a value:

::code-wrapper{language="go"}
```go
_, err := os.Open("file")   // discard the file, keep the error
for _, v := range items {   // discard the index
	_ = v
}
_ = someFunc()   // suppress "unused" error (rarely needed)
```
::

## Type Declarations

::code-wrapper{language="go"}
```go
type Celsius float64    // a named type, distinct from float64
type Fahrenheit float64

func (c Celsius) String() string { return fmt.Sprintf("%.1f°C", c) }

var temp Celsius = 25.0
fmt.Println(temp)   // 25.0°C (uses the String method)
``
::

A `type` declaration creates a **named type** with the same underlying type but distinct identity — `Celsius` and `Fahrenheit` are both `float64` underneath but can't be mixed without conversion. This is Go's "newtype" pattern for type safety.

## Type Inference

::code-wrapper{language="go"}
```go
var x = 42          // x is int (default int type for an integer literal)
var y = 3.14        // y is float64 (default float type)
var z = "hello"     // z is string
var b = true        // b is bool
var p = &x          // p is *int
s := []int{1, 2, 3} // s is []int
m := map[string]int{"a": 1}  // m is map[string]int
``
::

Integer literals default to `int`; floats to `float64`; characters (single quotes) to `rune` (`int32`).

## 💡 Tips & Tricks

- **Idiom**: use `:=` for local variable declarations (inside functions) and `var` for package-level or zero-value declarations — `:=` is concise and idiomatic for the common case; `var name type` signals "I want the zero value, not an initializer."
- **Idiom**: use untyped constants for values that should work across numeric types — `const BatchSize = 100` works with `int`, `int64`, `uint` without conversion. Reserve typed constants (`const BatchSize int = 100`) for when you need a specific type (e.g., an API boundary).
- **Idiom**: use `iota` for enums and bit flags — it's the idiomatic Go pattern (Go has no `enum` keyword), it's compile-time-evaluated, and the `1 << iota` pattern is the clean way to define flags. Skip values with `_` for gaps.
- **Idiom**: use `type` to create named types for domain safety — `type UserID int64` prevents mixing a `UserID` with a generic `int64`, catching "wrong ID" bugs at compile time. Add a `String()` method for readable output.
- **Idiom**: use the blank identifier `_` to discard unwanted return values explicitly — `_, err := os.Open(...)` signals "I care about the error, not the file," and `for _, v := range s` signals "I don't need the index."

## ⚠️ Edge Cases & Gotchas

- **`:=` requires at least one new variable**: `x, y := 1, 2` then `x, y := 3, 4` is an error (no new variable). Use `=`: `x, y = 3, 4`.
- **`:=` in a new scope shadows**: `if true { x := 5 }` declares a *new* `x` in the `if` block, not reassigning the outer `x`. A common bug.
- **Zero value vs `nil`**: `var s []int` is `nil` (len 0, but `s == nil` is true). `s := []int{}` is non-nil but empty. Most operations (len, range, append) work the same, but `json.Marshal(nil)` → `null` vs `[]` for empty — a surprise.
- **`nil` interface vs nil concrete value**: `var p *int = nil; var i interface{} = p; i == nil` is `false` — `i` holds a `(*int, nil)` pair, not a nil interface. See chapter 12.
- **Constants can't be mutated at runtime**: `const X = 5; X = 6` is a compile error. Use a `var` if the value is computed at runtime.
- **Untyped constants overflow silently in some contexts**: an untyped constant `const Big = 1 << 100` is fine (it's a big integer constant), but `var x int = Big` fails (doesn't fit in `int`). Untyped constants have arbitrary precision; typed variables don't.
- **`iota` increments per line, not per use**: in a `const` block, `iota` is 0 on the first line, 1 on the second, etc. — even if a line doesn't use `iota`, it still increments. Skipping with `_` consumes an `iota` value.
- **Named types need conversion**: `var c Celsius = 25.0; var f float64 = c` is an error (distinct types) — `var f float64 = float64(c)`. But `var f float64 = 25.0` works (literal is untyped).
- **`var x = nil` is illegal**: `nil` has no type, so the type can't be inferred. Use `var x *int = nil` or `var x *int`.

## 🧠 Spot the Bug

A developer writes this in a function, expecting `x` to be updated to 10:

::code-wrapper{language="go"}
```go
x := 5
if true {
	x := 10
	fmt.Println(x)   // 10
}
fmt.Println(x)   // 5
```
::

Why is `x` still 5?

<details>
<summary>Answer</summary>

`x := 10` inside the `if` block is a **short variable declaration** (`:=`), which declares a *new* `x` in the `if` block's scope — it shadows the outer `x` rather than reassigning it. The outer `x` is never modified; the inner `x` is created, set to 10, printed, and discarded when the block ends.

The fix — use `=` (assignment) to modify the existing `x`:

```go
x := 5
if true {
	x = 10        // assignment, not declaration
	fmt.Println(x)   // 10
}
fmt.Println(x)   // 10
```
::
The `:=` inside a new scope (block, if, for, switch) is the classic Go shadowing trap. `go vet -shadow` (or `golangci-lint` with the `shadow` linter) catches many of these. When you mean to modify an outer variable, use `=`; `:=` is for declaring new variables.

**The lesson**: `:=` in an inner scope declares new variables (shadowing outer ones); `=` assigns to existing ones. When you want to update an outer variable inside a block, use `=`.

</details>

## Summary

You can now declare variables (`var`/`:=`), understand zero values and `nil`, define constants and `iota` enums, use untyped constants, create named types for domain safety, and avoid the `:=` shadowing trap. Next: basic types and explicit conversions.