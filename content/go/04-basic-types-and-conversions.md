# 04 — Basic Types & Conversions

## Numeric Types

| Category | Types |
|---|---|
| **Signed integers** | `int` (platform-dependent: 32 or 64 bits), `int8`, `int16`, `int32`, `int64` |
| **Unsigned integers** | `uint` (platform-dependent), `uint8`, `uint16`, `uint32`, `uint64`, `uintptr` |
| **Floating-point** | `float32`, `float64` |
| **Complex** | `complex64`, `complex128` |
| **Byte & rune** | `byte` (alias for `uint8`), `rune` (alias for `int32`, a Unicode code point) |

::code-wrapper{language="go"}
```go
var i int = 42
var u uint = 42
var b byte = 255
var r rune = '世'   // 19990 (a Unicode code point)
var f float64 = 3.14
```
::

### `int` vs `int32`/`int64`

`int` is the platform-dependent sized integer (32 bits on 32-bit systems, 64 on 64-bit). It's the **default** for integer literals and the most common choice. Use `int32`/`int64` when you need a specific size (binary formats, APIs with fixed-width fields).

### Integer overflow

Integer arithmetic wraps silently (no panic):

::code-wrapper{language="go"}
```go
var b byte = 255
b++   // 0 (wrapped)
var i int8 = 127
i++   // -128 (wrapped)
``
::

The `math/bits` package provides overflow-detecting operations (`bits.Add`, `bits.Mul`) for critical code. For arbitrary precision, use `math/big`.

### Floating-point

`float64` is the default (and the type of float literals). `float32` is rarely used (smaller, less precision). Floating-point has the usual IEEE 754 issues:

::code-wrapper{language="go"}
```go
fmt.Println(0.1 + 0.2)   // 0.30000000000000004
fmt.Println(1.0 / 3.0)   // 0.3333333333333333
``
::

For exact decimal arithmetic (money), use `math/big` with `big.Float` at fixed precision, or a third-party decimal library (`shopspring/decimal`).

## Booleans

::code-wrapper{language="go"}
```go
var b bool = true
var c bool      // false (zero value)
t := !b         // false
and := b && c   // false
or := b || c    // true
```
::

Go has no truthiness — only `bool` can be used in `if`/`for`/`&&`/`||`. `if 1` or `if "x"` are compile errors. This prevents a whole class of bugs.

## Strings

Strings are **immutable byte sequences** — by default UTF-8, but not required to be (a string can hold any bytes):

::code-wrapper{language="go"}
```go
s := "Hello, 世界"
fmt.Println(len(s))           // 13 (bytes, not runes — '世' is 3 bytes)
fmt.Println(utf8.RuneCountInString(s))  // 9 (runes)

// Indexing gives bytes, not characters
fmt.Println(s[0])             // 72 ('H' as a byte)
// s[0] = 'h'                // ERROR: strings are immutable

// Slicing gives a substring (by bytes)
sub := s[0:5]                 // "Hello"

// Iterating by rune
for i, r := range s {
	fmt.Printf("%d: %c\n", i, r)
}
``
::

- `len(s)` is the **byte** length, not the character count.
- `s[i]` is a **byte** (`uint8`), not a character.
- `range` over a string decodes UTF-8 and yields `(byte_offset, rune)` pairs.
- Strings are immutable — `s[0] = 'x'` is a compile error. To modify, convert to `[]byte` or `[]rune`, change, and convert back.

### Raw string literals

::code-wrapper{language="go"}
```go
s := `Hello,
World!`   // backticks — raw, no escape processing
escaped := "Hello,\nWorld!"   // double quotes — escapes processed
``
::

Raw strings (backticks) preserve newlines and backslashes literally — useful for regex, multi-line text, and HTML templates.

## Runes

A `rune` is a `int32` representing a Unicode code point:

::code-wrapper{language="go"}
```go
r := '世'           // a rune literal (single quotes)
fmt.Println(r)       // 19990
fmt.Printf("%c\n", r)   // 世
fmt.Printf("%U\n", r)   // U+4E16

// Convert between string and runes
runes := []rune("Hello, 世界")   // [H e l l o ,   世 界]
s := string(runes)               // "Hello, 世界"
```
::

Use `[]rune` when you need to work with characters (e.g., reversing a string, indexing by character). Use `[]byte` for raw byte manipulation.

## Type Conversions

All conversions in Go are **explicit** — there's no implicit conversion (no "coercion"):

::code-wrapper{language="go"}
```go
var i int = 42
var f float64 = float64(i)   // int → float64
var j int = int(f)           // float64 → int (truncates toward zero)

var b byte = byte(i)         // int → byte (truncates — i must fit in 0-255)
var r rune = 'A'
var s string = string(r)     // rune → string ("A")

// Numeric literal to string (gotcha!)
s := string(65)    // "A" (65 is the code point for 'A') — NOT "65"
``
::

### The `string(65)` gotcha

`string(n)` where `n` is an integer converts `n` to a **string containing that Unicode code point**, not the decimal representation:

::code-wrapper{language="go"}
```go
string(65)      // "A" (code point 65 = 'A')
string(1234)    // "Ӓ" (code point 1234)

// To get "65", use strconv:
strconv.Itoa(65)   // "65"
fmt.Sprintf("%d", 65)   // "65"
```
::

This is a common beginner mistake — `string(number)` gives a character, not digits.

### Conversions between string and slice

::code-wrapper{language="go"}
```go
s := "Hello"
b := []byte(s)   // string → []byte (allocates a copy — strings are immutable)
b[0] = 'h'
s2 := string(b)  // []byte → string (allocates)

r := []rune(s)   // string → []rune (decodes UTF-8, allocates)
s3 := string(r)  // []rune → string
``
::

`[]byte(s)` and `string(b)` allocate (they copy the data). For performance-sensitive code, see `unsafe.String`/`unsafe.StringData` (Go 1.20+) or the `bytes` package.

## 💡 Tips & Tricks

- **Idiom**: use `int` as the default integer type — it's the natural word size and the type of integer literals. Use `int32`/`int64`/`uint8` only when you need a specific size (binary formats, protocol fields, memory optimization).
- **Idiom**: use `[]rune` for character-level string manipulation (reversing, indexing by character) and `[]byte` for byte-level work (network buffers, hashing) — `range` decodes UTF-8 for free, but indexing `s[i]` gives bytes.
- **Idiom**: use `strconv.Itoa`/`strconv.Atoi` for int↔string, not `string(n)`/`int(s)` — `string(65)` gives "A" (the code point), not "65" (the decimal). `strconv.Itoa(65)` gives "65".
- **Idiom**: use raw string literals (backticks) for regex, multi-line text, and templates — they preserve newlines and backslashes literally, avoiding double-escaping (`\\d` becomes `\d`).
- **Performance**: avoid `[]byte(s)`/`string(b)` in hot paths — each conversion allocates a copy. Use `bytes.Equal`, `bytes.Contains`, or `strings.Builder` to work in-place. For zero-copy (advanced), `unsafe.String`/`unsafe.StringData` (Go 1.20+) — but use only when you understand the safety implications.

## ⚠️ Edge Cases & Gotchas

- **`len(s)` is bytes, not characters**: `len("世")` = 3, not 1. Use `utf8.RuneCountInString(s)` for the character count.
- **`s[i]` is a byte, not a character**: indexing a multi-byte UTF-8 string at an arbitrary position may give a byte in the middle of a rune (invalid UTF-8). Use `range` or `[]rune` for character access.
- **Integer overflow wraps silently**: no panic, no error — `byte(255) + 1` = 0. Use `math/bits` for overflow-checking operations, or `math/big` for arbitrary precision.
- **Floating-point is inexact**: `0.1 + 0.2 ≠ 0.3`. Use `math/big` or a decimal library for money.
- **`string(int)` gives a code point, not digits**: `string(65)` = "A". Use `strconv.Itoa` for digits.
- **No truthiness**: `if 1` or `if "x"` are compile errors — only `bool` is allowed in conditions. This prevents "truthy/falsy" bugs.
- **Strings are immutable**: `s[0] = 'x'` is a compile error. Convert to `[]byte`, modify, convert back (allocates).
- **`int` size is platform-dependent**: 32 bits on 32-bit systems, 64 on 64-bit. Don't assume `int` is 64 bits — use `int64` if you need a guaranteed size.
- **`byte` and `rune` are aliases**: `byte` = `uint8`, `rune` = `int32`. They're interchangeable with their underlying types, but using the alias is clearer for intent.
- **Truncating conversions**: `int(3.9)` = 3 (truncates toward zero, not rounding). `byte(300)` = 44 (wraps). Use `math.Round` for rounding, and check bounds before narrowing conversions.

## 🧠 Spot the Bug

A developer wants to reverse a string "Hello, 世界" and writes:

::code-wrapper{language="go"}
```go
func reverse(s string) string {
	b := []byte(s)
	for i, j := 0, len(b)-1; i < j; i, j = i+1, j-1 {
		b[i], b[j] = b[j], b[i]
	}
	return string(b)
}
fmt.Println(reverse("Hello, 世界"))   // garbled output
```
::

What's wrong?

<details>
<summary>Answer</summary>

`[]byte(s)` reverses the **bytes**, not the characters. Multi-byte UTF-8 runes (like "世" = 3 bytes, "界" = 3 bytes) get their bytes reversed individually, producing invalid UTF-8 — the output is garbled.

The fix — reverse **runes**, not bytes:

```go
func reverse(s string) string {
	r := []rune(s)
	for i, j := 0, len(r)-1; i < j; i, j = i+1, j-1 {
		r[i], r[j] = r[j], r[i]
	}
	return string(r)
}
fmt.Println(reverse("Hello, 世界"))   // "界世 ,olleH"
```
::
`[]rune(s)` decodes the UTF-8 into a slice of code points; reversing that slice preserves each character; `string(r)` re-encodes to UTF-8.

**The lesson**: Go strings are byte sequences (usually UTF-8). For character-level manipulation, work in `[]rune`; for byte-level (network, hashing), work in `[]byte`. Reversing bytes breaks multi-byte characters.

</details>

## Summary

You understand Go's numeric types (and overflow), booleans (no truthiness), strings (immutable byte sequences, UTF-8), runes (code points), and explicit conversions (including the `string(65)` gotcha). Next: functions — multiple returns, closures, and `defer`.