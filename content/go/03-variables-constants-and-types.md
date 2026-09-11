---
title: "03 — Variables, Constants & Types"
description: "Zero-value semantics, untyped constant precision, iota bit-flag patterns, named-type safety, and the shadowing trap — with production code."
---

# 03 — Variables, Constants & Types

## Variable Declaration — All Forms and When to Use Each

::code-wrapper{language="go"}
```go
// ┌─────────────────────────────────────────────────────────────────┐
// │ Form            │ Scope        │ Use When                       │
// │ ─────────────── │ ──────────── │ ────────────────────────────── │
// │ var x int       │ any          │ need zero value, explicit type │
// │ var x = 42      │ any          │ type inference at pkg scope    │
// │ var x int = 42  │ any          │ explicit type + initial value  │
// │ x := 42         │ func body    │ most common inside functions   │
// │ var (...)       │ any          │ grouped package-level vars     │
// └─────────────────────────────────────────────────────────────────┘

package server

// Package-level declarations — use `var` (:= not allowed here).
var (
	shutdownChan = make(chan struct{})  // type inferred: chan struct{}
	listenAddr   = ":8080"              // type inferred: string
	maxProcs     = runtime.GOMAXPROCS(0) // type inferred: int (runtime call)
)

func example() {
	// Inside functions — `:=` is idiomatic.
	port := 8080
	host, err := lookupHost("example.com")  // multi-value declaration
	if err != nil {
		return
	}

	// `:=` with mixed new + existing variables — legal if ≥1 is new.
	host2, err := lookupHost("other.com")  // host2 is new, err is reassigned
	_ = host2
}
```
::

### `:=` rules and the shadowing trap

::code-wrapper{language="go"}
```go
func shadowTrap() int {
	x := 5

	if true {
		x := 10        // ❌ ANTI-PATTERN: declares a NEW x in the if-block scope
		               //   shadows the outer x — outer x is never modified
		fmt.Println(x) // 10 (inner x)
	}
	fmt.Println(x)    // 5 (outer x unchanged)
	return x           // returns 5

	// ✅ CORRECT: use `=` to modify the outer variable:
	// x = 10          // assignment, not declaration — modifies outer x
}

// ⚠️ The same trap in for-loops (pre-Go 1.22):
func loopShadowPre122() {
	var fns []func()
	for i := 0; i < 3; i++ {
		fns = append(fns, func() { fmt.Println(i) })  // captures the SAME i
	}
	for _, f := range fns {
		f()  // pre-1.22: prints 3 3 3 (all see final i=3)
	}
}

// ✅ Fixed — pass as parameter (pre-1.22 pattern):
func loopShadowFixed() {
	var fns []func()
	for i := 0; i < 3; i++ {
		i := i  // ⚠️ creates a new i per iteration (pre-1.22 idiom)
		fns = append(fns, func() { fmt.Println(i) })
	}
	// Go 1.22+ fixes this — loop vars are per-iteration by default.
	// The `i := i` shadow is no longer needed (but doesn't hurt).
}
```
::

## Zero Values — The Memory Story

::code-wrapper{language="go"}
```go
// Every Go variable is initialized to its type's zero value.
// No "uninitialized" memory ever exists — this is a safety guarantee.

// ┌───────────────────────────────────────────────────────────────┐
// │ Type          │ Zero value    │ Memory representation         │
// │ ────────────  │ ────────────  │ ──────────────────────────── │
// │ int, uint     │ 0             │ all zero bytes (e.g., 8 bytes)│
// │ float64       │ 0.0           │ IEEE 754 all-zero = 0.0      │
// │ bool          │ false         │ 0 byte                        │
// │ string        │ ""            │ {ptr=nil, len=0} (16 bytes)   │
// │ pointer       │ nil           │ 0x0 (8 bytes)                 │
// │ slice         │ nil           │ {ptr=nil, len=0, cap=0} (24B)│
// │ map           │ nil           │ pointer to nil hmap (8 bytes) │
// │ chan          │ nil           │ pointer to nil hchan (8 bytes)│
// │ func          │ nil           │ pointer to nil (8 bytes)      │
// │ interface     │ nil           │ {type=nil, val=nil} (16 bytes)│
// │ struct        │ all-zero      │ each field at its zero value  │
// └───────────────────────────────────────────────────────────────┘

func zeroValueDemo() {
	var s []int
	fmt.Println(s == nil)  // true — nil slice (ptr is nil, len 0, cap 0)

	t := make([]int, 0)    // non-nil empty slice (ptr to real array, len 0, cap 0)
	fmt.Println(t == nil)  // false

	// Both have len=0 and range over them does nothing. BUT:
	//   json.Marshal(s) → "null"     (nil slice)
	//   json.Marshal(t) → "[]"       (empty slice)
	// API consumers treat null and [] differently — be deliberate.
}
```
::

### Zero-value struct initialization

::code-wrapper{language="go"}
```go
type Server struct {
	Addr    string
	Port    int
	TLS     *tls.Config  // nil = no TLS (zero value is meaningful)
	Timeout time.Duration
}

func zeroValueStruct() {
	// Zero-value initialization — all fields at their zero values.
	// Design structs so the zero value is usable (Go idiom).
	var s Server
	// s.Addr = "", s.Port = 0, s.TLS = nil, s.Timeout = 0

	// `0` for Port is probably wrong — use a constructor:
	srv := NewServer(":8080")
	_ = srv
}

// ✅ Idiom: make zero values useful, provide constructors for required fields.
func NewServer(addr string) *Server {
	return &Server{
		Addr:    addr,
		Port:    8080,           // sensible default
		Timeout: 30 * time.Second,
	}
}

// ❌ ANTI-PATTERN: struct with required fields and no constructor.
//   type Config struct { DSN string }  // zero value has empty DSN → runtime panic
//   Users will write `var cfg Config` and forget DSN.
```
::

## Constants — Compile-Time Immutability

::code-wrapper{language="go"}
```go
// Constants are evaluated at compile time. They CANNOT be:
//   - mutated at runtime
//   - of types that require runtime computation (slices, maps, structs)
//   - declared with function calls (unless the function is constant)

const (
	Pi       = 3.14159265358979323846264338327950288  // arbitrary precision
	MaxInt32 = 1 << 31 - 1                              // compile-time arithmetic
	DefaultPort = 8080
)

// Typed vs untyped:
const (
	TimeoutSeconds int = 30          // typed: must convert to use as int64
	TimeoutGeneric   = 30            // untyped: adapts to any numeric context
)

func constantTypes() {
	// Untyped constant adapts:
	var i int = TimeoutGeneric        // ok — becomes int
	var i64 int64 = TimeoutGeneric    // ok — becomes int64
	var f float64 = TimeoutGeneric    // ok — becomes float64
	_ = i; _ = i64; _ = f

	// Typed constant requires explicit conversion:
	var i2 int64 = int64(TimeoutSeconds)  // ok — explicit conversion
	// var i3 int64 = TimeoutSeconds       // ❌ compile error: int ≠ int64
	_ = i2
}
```
::

### Untyped constant precision — the power and the trap

::code-wrapper{language="go"}
```go
// Untyped constants have ARBITRARY precision (they're big.Int at compile time).
// This lets you express values that don't fit in any runtime type:

const (
	Big = 1 << 100             // 2^100 — way bigger than int64 (2^63-1)
	Small = Big >> 99          // 2^1 = 2 — works because Big is untyped
)

func bigConstants() {
	// The constant itself is fine (compile-time):
	fmt.Println(Small)         // 2

	// But assigning to a runtime type fails if it doesn't fit:
	// var x int = Big          // ❌ compile error: constant overflows int
	var x int = Small           // ok — 2 fits in int
	_ = x

	// ⚠️ Float constant precision trap:
	const Almost = 0.1 + 0.2   // 0.3 exactly (arbitrary precision at compile time)
	var f float64 = 0.1 + 0.2  // 0.30000000000000004 (float64 arithmetic at runtime)
	fmt.Println(Almost == 0.3) // true (compile-time, untyped)
	fmt.Println(f == 0.3)      // false (runtime float64)
}
```
::

## `iota` — Beyond Simple Enums

::code-wrapper{language="go"}
```go
// iota resets to 0 in each const block and increments per LINE (not per use).

// --- Basic enum ---
type Weekday int
const (
	Sunday Weekday = iota    // 0
	Monday                   // 1
	Tuesday                  // 2
	Wednesday                // 3
	Thursday                 // 4
	Friday                   // 5
	Saturday                 // 6
)

// --- Bit flags (permissions) ---
type Permission uint8
const (
	Read    Permission = 1 << iota    // 1  (00000001)
	Write                              // 2  (00000010)
	Execute                            // 4  (00000100)
	Delete                             // 8  (00001000)
	Admin    = Read | Write | Execute | Delete  // 15 — manual composition
)

func checkPerm(p, required Permission) bool {
	return p&required == required  // all bits must be set
}

// --- Skipping with _ (file sizes) ---
const (
	_  = iota             // 0 — ignored (we don't need a "Byte" unit)
	KB = 1 << (10 * iota) // 1 << 10 = 1024
	MB                     // 1 << 20
	GB                     // 1 << 30
	TB                     // 1 << 40
	PB                     // 1 << 50
)

// --- iota in expressions (state machine states) ---
type State int
const (
	StateIdle State = iota     // 0
	StateConnecting            // 1
	StateConnected             // 2
	StateDisconnecting         // 3
	StateError    = -1         // explicit value, iota continues below
)

// --- iota for array index alignment ---
const (
	ColorRed = iota
	ColorGreen
	ColorBlue
	ColorCount  // 3 — use as array size: [ColorCount]string
)
var colorNames = [ColorCount]string{"red", "green", "blue"}
```
::

### Adding `String()` to enums

::code-wrapper{language="go"}
```go
// Go has no built-in enum string representation. Use `stringer` or manual.

// Manual approach — explicit, no code generation:
type State int
const (
	StateIdle State = iota
	StateConnecting
	StateConnected
)
var stateNames = [...]string{"idle", "connecting", "connected"}
func (s State) String() string {
	if s < 0 || int(s) >= len(stateNames) {
		return fmt.Sprintf("State(%d)", s)
	}
	return stateNames[s]
}

// `go generate` + `stringer` tool approach:
//go:generate stringer -type=State -output=state_string.go
// Produces a fast String() method — recommended for large enums.
```
::

## Named Types — Compile-Time Safety

::code-wrapper{language="go"}
```go
// A `type` declaration creates a NEW type with the same underlying type.
// Named types are NOT assignable to their underlying type without conversion.

type UserID int64
type AccountID int64

func namedTypeSafety() {
	var uid UserID = 42
	var aid AccountID = 100

	// ❌ Compile error: cannot use uid (type UserID) as type AccountID
	// _ = uid + aid

	// ✅ Must convert explicitly — this is the safety feature:
	combined := int64(uid) + int64(aid)  // ok — both converted to int64
	_ = combined

	// Methods on named types:
	fmt.Println(uid)  // calls UserID.String() if defined, else prints the number
}

// Domain modeling with named types — prevents entire classes of bugs:
type (
	Celsius    float64
	Fahrenheit float64
	Kelvin     float64
)

func (c Celsius) ToF() Fahrenheit { return Fahrenheit(c*9/5 + 32) }
func (c Celsius) ToK() Kelvin     { return Kelvin(c + 273.15) }
func (c Celsius) String() string  { return fmt.Sprintf("%.1f°C", c) }

// ⚠️ Named types share operations with their underlying type:
//   Celsius(100) > Celsius(50)  // ✅ comparison works (float64 comparison)
//   Celsius(100) + Celsius(50)  // ✅ arithmetic works (float64 arithmetic)
//   Celsius(100) + 50.0         // ❌ untyped 50.0 works, but typed float64 doesn't
```
::

## Type Inference Rules

::code-wrapper{language="go"}
```go
func typeInference() {
	var i = 42          // int   (default for integer literals)
	var f = 3.14        // float64 (default for float literals)
	var s = "hello"     // string
	var b = true        // bool
	var r = 'A'         // rune (int32) — single quotes = rune literal

	// Inferred from function return type:
	var ctx = context.Background()  // context.Context

	// ⚠️ Numeric literal defaults:
	//   integer → int
	//   float   → float64
	//   rune    → rune (int32)
	//   There's NO way to make `x := 42` infer int64 — use `var x int64 = 42`

	// Inferred from composite literal:
	m := map[string]int{"a": 1}  // map[string]int
	sl := []int{1, 2, 3}         // []int
	st := struct{ X int }{X: 5}  // anonymous struct

	// ⚠️ nil has no type — can't infer:
	// var x = nil  // ❌ compile error: use of untyped nil
	var p *int = nil  // ✅ explicit type
	_ = p
}
```
::

## The Blank Identifier `_`

::code-wrapper{language="go"}
```go
// `_` discards a value. It's a write-only identifier — you can't read it.

// 1. Discard unwanted return values:
_, err := os.Open("file.txt")  // don't care about the file, just the error
for _, v := range items {       // don't care about the index
	_ = v
}

// 2. Discard an assignment to suppress "unused variable" error:
func _suppress() {
	x := expensiveComputation()
	_ = x  // suppress unused error — but this is a code smell, prefer to use x
}

// 3. Import for side effects (blank import):
import _ "github.com/lib/pq"  // runs pq's init() to register the postgres driver

// 4. Interface satisfaction check (compile-time assertion):
var _ io.Reader = (*MyReader)(nil)  // fails to compile if *MyReader doesn't satisfy io.Reader

// 5. Explicitly ignore a channel receive:
<-done  // wait for done signal, discard the value
```
::

## 💡 Tips & Tricks

- **Safety**: `type UserID int64` prevents passing a `UserID` where an `AccountID` is expected — the compiler catches the bug. Use named types for all domain IDs, currency amounts, and measurement units. The zero cost (no runtime overhead) makes this a no-brainer.
- **Idiom**: design structs so the zero value is immediately usable — `sync.Mutex{}`, `bytes.Buffer{}`, `http.Server{}` all work without initialization. If a field has no sensible zero value, make it unexported and require a constructor.
- **Performance**: untyped constants avoid conversion overhead — `const Size = 1024` compiles to a literal instruction with zero conversion. Typed constants may need an implicit conversion at each use site.
- **Idiom**: use `var _ Interface = (*Type)(nil)` at package scope to assert interface satisfaction at compile time — catches breakage when a method signature changes.
- **Debug**: `go vet -shadow` (or `golangci-lint` with `shadow` enabled) catches variable shadowing — `x := 10` inside an `if` block that shadows an outer `x`. Enable in CI.
- **Idiom**: `iota` with `1 << iota` is the clean way to define bit flags — each flag gets a distinct power-of-2 value. Compose with `|` (OR), test with `&` (AND), remove with `&^` (AND NOT).

## ⚠️ Edge Cases & Gotchas

- **`:=` requires at least one new variable**: `x, y := 1, 2` then `x, y := 3, 4` → compile error (no new variable). Use `=`.
- **`:=` in a new scope shadows**: `if true { x := 5 }` declares a new `x`, not reassigning outer `x`. Use `=` to modify the outer variable.
- **nil slice vs empty slice**: `var s []int` (nil, `s == nil` true) vs `s := []int{}` (non-nil, empty). `json.Marshal(nil)` → `null`; `json.Marshal([]int{})` → `[]`. APIs may treat these differently.
- **nil interface vs nil concrete value**: `var p *int = nil; var i any = p; i == nil` → `false`. The interface holds `(*int, nil)`, not a nil interface. See chapter 12.
- **Untyped constant overflow**: `const Big = 1 << 100` is fine (arbitrary precision), but `var x int = Big` → compile error (overflows int). Untyped constants only overflow when assigned to a type.
- **`var x = nil` is illegal**: `nil` has no type, so type inference fails. Use `var x *int = nil`.
- **Named types and literals**: `var c Celsius = 25.0` works (literal is untyped, adapts to `Celsius`), but `var c Celsius = float64(25.0)` → compile error (typed value needs conversion).
- **`iota` increments per line**: in a `const` block, `iota` is 0 on the first line, 1 on the second — even if a line doesn't use `iota`. `const ( A = iota; B = 10; C = iota )` → A=0, B=10, C=2 (not 1).
- **Constants can't reference runtime values**: `const Now = time.Now()` → compile error. Use `var` for runtime-computed values.
- **Zero value of `time.Duration` is 0**: `var d time.Duration` → 0 (not "no duration"). `0 * time.Second` = 0ns. This is meaningful — check `d == 0` to detect "unset".

## 🧠 Quick Quiz

::code-wrapper{language="go"}
```go
const x = 1 << 62
var y int = x
var z int64 = x
var w float64 = x

fmt.Println(y, z, w)
```

What happens?
::
<details>
<summary>Answer</summary>

All three assignments compile and work:

```
4611686018427387904 4611686018427387904 4.611686018427388e+18
```

`1 << 62` = 4,611,686,018,427,387,904, which fits in:
- `int` (64-bit: max 2^63-1) ✅
- `int64` (max 2^63-1) ✅
- `float64` (can represent integers up to 2^53 exactly; beyond that, precision loss) — `w` prints in scientific notation with rounding

The key: `x` is an **untyped constant** with arbitrary precision. It adapts to each type's context. If it were `const x = 1 << 65`, the `int` and `int64` assignments would fail (overflow) but `float64` would still work (float64 can represent large exponents).

</details>

## 📚 What's Next

→ [04 — Basic Types & Conversions](/go/04-basic-types-and-conversions) — integer overflow behavior, float64 precision, rune vs byte, string internals, and safe conversion patterns.