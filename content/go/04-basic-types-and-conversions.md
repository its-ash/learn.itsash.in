---
title: "04 — Basic Types & Conversions"
description: "Integer overflow mechanics, IEEE 754 float precision traps, UTF-8 string internals, rune vs byte, and zero-allocation conversion patterns."
---

# 04 — Basic Types & Conversions

## Numeric Type Map

::code-wrapper{language="text"}
```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Signed   │ int   int8   int16   int32   int64                          │
│ Unsigned │ uint  uint8  uint16  uint32  uint64  uintptr                 │
│ Float    │ float32  float64                                          │
│ Complex  │ complex64  complex128                                      │
│ Aliases  │ byte = uint8    rune = int32                               │
└──────────────────────────────────────────────────────────────────────────┘

Platform sizes:
  int/uint     → 32-bit on 32-bit OS, 64-bit on 64-bit OS (NEVER assume 64)
  float64      → IEEE 754 double precision (53-bit mantissa, 11-bit exponent)
  uintptr      → integer type large enough to hold a pointer (for unsafe code)
```
::

## Integer Overflow — Silent and Deadly

::code-wrapper{language="go"}
```go
package main

import (
	"fmt"
	"math/bits"
)

func overflowDemo() {
	// Signed overflow wraps (two's complement):
	var i int8 = 127
	i++                          // -128 (wrapped from max to min)
	fmt.Println(i)               // -128

	// Unsigned overflow wraps to 0:
	var u uint8 = 255
	u++                          // 0
	fmt.Println(u)               // 0

	// ❌ ANTI-PATTERN: trusting integer arithmetic in security-critical code
	func addUnchecked(a, b int) int {
		return a + b  // silent overflow — can wrap to negative, bypass bounds checks
	}

	// ✅ CORRECT: use math/bits for overflow detection
	sum, carry := bits.Add64(uint64(a), uint64(b), 0)  // carry=1 if overflow
	if carry == 1 {
		return 0, errors.New("integer overflow")
	}
	_ = sum
}
```
::

### Production overflow-safe arithmetic

::code-wrapper{language="go"}
```go
package money

import "errors"

// SafeAdd adds two int64s, returning an error on overflow.
// Use in financial, capacity, and size calculations where silent
// overflow would cause data loss or security vulnerabilities.
func SafeAdd(a, b int64) (int64, error) {
	if b > 0 {
		if a > math.MaxInt64-b {  // positive overflow: a + b > MaxInt64
			return 0, errors.New("money: integer overflow")
		}
	} else {
		if a < math.MinInt64-b {  // negative overflow: a + b < MinInt64
			return 0, errors.New("money: integer overflow")
		}
	}
	return a + b, nil
}

// SafeMul multiplies two int64s with overflow check.
func SafeMul(a, b int64) (int64, error) {
	if a == 0 || b == 0 {
		return 0, nil
	}
	r := a * b
	if r/a != b {  // standard overflow detection trick
		return 0, errors.New("money: integer overflow in multiply")
	}
	return r, nil
}

// For arbitrary precision — use math/big:
// import "math/big"
// result := new(big.Int).Mul(big.NewInt(a), big.NewInt(b))
```
::

## IEEE 754 Float64 — Precision Traps

::code-wrapper{language="go"}
```go
package main

import (
	"fmt"
	"math"
)

func floatTraps() {
	// 1. The classic: 0.1 + 0.2 ≠ 0.3
	fmt.Println(0.1 + 0.2 == 0.3)  // false
	fmt.Printf("%.20f\n", 0.1+0.2) // 0.30000000000000004441

	// 2. Comparing floats — use an epsilon:
	func almostEqual(a, b float64) bool {
		return math.Abs(a-b) <= 1e-9 * math.Max(math.Abs(a), math.Abs(b))
	}

	// 3. NaN doesn't equal itself:
	nan := math.NaN()
	fmt.Println(nan == nan)  // false — use math.IsNaN()

	// 4. Inf comparisons:
	fmt.Println(math.Inf(1) > 1e308)  // true
	fmt.Println(math.Inf(1) == math.Inf(1))  // true (unlike NaN)

	// 5. Integer precision limit: float64 can represent integers
	//    exactly up to 2^53. Beyond that, precision is lost:
	fmt.Println(float64(1<<53))     // 9007199254740992 (exact)
	fmt.Println(float64(1<<53 + 1)) // 9007199254740992 (SAME — rounded!)
	fmt.Println(float64(1<<53 + 2)) // 9007199254740994 (exact, +2 is representable)
}
```
::

### Money — never use float64

::code-wrapper{language="go"}
```go
// ❌ ANTI-PATTERN: float64 for money
func badTotal(prices []float64) float64 {
	total := 0.0
	for _, p := range prices {
		total += p  // accumulating rounding errors
	}
	return total
}
// badTotal([]float64{0.10, 0.20, 0.30}) → 0.6000000000000001

// ✅ CORRECT: use shopspring/decimal or math/big for exact decimal math
//
// import "github.com/shopspring/decimal"
// func goodTotal(prices []decimal.Decimal) decimal.Decimal {
//     total := decimal.Zero
//     for _, p := range prices {
//         total = total.Add(p)  // exact base-10 arithmetic
//     }
//     return total
// }

// ✅ Or store money as integer cents (simplest, no deps):
type Cents int64  // $1.00 = 100 cents — never lose precision

func totalCents(prices []Cents) Cents {
	var total Cents
	for _, p := range prices {
		total += p  // integer arithmetic — exact
	}
	return total
}

func (c Cents) String() string {
	return fmt.Sprintf("$%d.%02d", c/100, c%100)  // $12.34
}
```
::

## String Internals — The Memory Layout

::code-wrapper{language="go"}
```go
// A Go string is a 2-word header: {pointer to data, length}
//   - The data is READ-ONLY (stored in read-only memory or the string table)
//   - The pointer can be nil (empty string) — but "" has a non-nil ptr in practice
//   - len(s) is the BYTE count, NOT the character count

// ┌─────────────────────────────────────────────────┐
// │ string header (16 bytes on 64-bit)             │
// │   ┌──────────┬──────────┐                      │
// │   │ ptr      │ len      │                      │
// │   │ 8 bytes  │ 8 bytes  │                      │
// │   └──────────┴──────────┘                      │
// │        ↓                                        │
// │   [H][e][l][l][o][,][ ][ä][\\xb6]... (read-only)│
// │   'ä' is 2 bytes in UTF-8 (0xC3 0xA4)          │
// └─────────────────────────────────────────────────┘

func stringInternals() {
	s := "Hello, 世界"
	fmt.Println(len(s))                    // 13 (bytes: "Hello, " = 7, "世" = 3, "界" = 3)
	fmt.Println(utf8.RuneCountInString(s)) // 9 (characters)

	// Indexing gives bytes (uint8), not characters:
	fmt.Println(s[0])     // 72 (byte for 'H')
	fmt.Println(s[7])     // 228 (first byte of '世' — 0xE4)

	// ❌ Can't index a character in O(1) — UTF-8 is variable-width.
	// s[7] is a BYTE, not '世'. To get rune at position 7:
	r, size := utf8.DecodeRuneInString(s[7:])
	fmt.Printf("%c (size=%d)\n", r, size)  // 世 (size=3)

	// Slicing by bytes — valid only at rune boundaries:
	sub := s[:7]  // "Hello, " — valid (7 is a rune boundary)
	// sub = s[:8]  // invalid UTF-8 — cuts '世' mid-rune (no error, but broken)
	_ = sub
}
```
::

### `range` over strings — free UTF-8 decoding

::code-wrapper{language="go"}
```go
func rangeString() {
	s := "Go=go"

	// range decodes UTF-8 and yields (byte_offset, rune):
	for i, r := range s {
		fmt.Printf("offset=%d rune=%c (U+%04X)\n", i, r, r)
	}
	// offset=0 rune=G (U+0047)
	// offset=1 rune=o (U+006F)
	// offset=2 rune== (U+003D)
	// offset=3 rune=世 (U+4E16)  ← offset jumps by 3 bytes (UTF-8 width of 世)
	// offset=6 rune=界 (U+754C)

	// ⚠️ The index is the BYTE offset, not the character index.
	// If you need character index, use a counter:
	charIdx := 0
	for _, r := range s {
		fmt.Printf("char[%d]=%c\n", charIdx, r)
		charIdx++
	}
}
```
::

## Conversions — The Cost Table

::code-wrapper{language="go"}
```go
// ┌──────────────────────────────────────────────────────────────────────┐
// │ Conversion           │ Allocates? │ Notes                            │
// │ ──────────────────── │ ────────── │ ──────────────────────────────── │
// │ int → float64        │ No         │ CPU instruction (CVTSI2SD)      │
// │ float64 → int        │ No         │ Truncates toward zero            │
// │ int → string         │ Yes        │ string(65) = "A" (code point!)   │
// │ []byte ↔ string      │ Yes        │ Copies (strings are immutable)   │
// │ []rune ↔ string      │ Yes        │ Decodes/encodes UTF-8            │
// │ []byte → []rune      │ Yes        │ Decodes UTF-8                    │
// │ T → *T (with &)      │ No         │ Address-of operator              │
// │ []T → []U (diff T)   │ Yes        │ Element-by-element copy          │
// └──────────────────────────────────────────────────────────────────────┘

// The []byte ↔ string copy is the #1 hidden allocation in Go programs.
// It's necessary because strings are immutable (read-only memory) but
// []byte is mutable — they can't share storage safely.

func conversionCosts() {
	s := "hello"

	// ❌ Each conversion allocates a copy:
	b := []byte(s)    // allocates 5 bytes + slice header
	s2 := string(b)   // allocates 5 bytes + string header
	_ = s2

	// ✅ For comparison, use strings/bytes packages (no conversion needed):
	// strings.Contains(s, "ell")     — works on string directly
	// bytes.Contains(b, []byte("ell")) — works on []byte directly

	// ✅ For zero-copy (Go 1.20+, unsafe — only when you control the data):
	// import "unsafe"
	// b := unsafe.Slice(unsafe.StringData(s), len(s))  // []byte sharing s's memory
	// ⚠️ Only safe if you NEVER modify b (modifying corrupts the read-only string table)
}
```
::

### The `string(int)` gotcha

::code-wrapper{language="go"}
```go
func stringIntGotcha() {
	// string(number) converts to a string containing that Unicode CODE POINT,
	// NOT the decimal representation of the number:
	s := string(65)     // "A" (code point 65 = 'A')
	fmt.Println(s)      // A

	s2 := string(65290) // "％" (fullwidth percent sign, U+FF05)
	fmt.Println(s2)

	// ❌ Common mistake: expecting "65"
	// ✅ Use strconv for number-to-string:
	correct := strconv.Itoa(65)       // "65"
	correct2 := strconv.FormatInt(65, 10)  // "65"
	fmt.Println(correct, correct2)

	// go vet catches this: "conversion from int to string yields a string of
	// one rune, not a string of digits" (vet's default check since Go 1.15)
}
```
::

## String Building — Zero-Allocation Patterns

::code-wrapper{language="go"}
```go
// ❌ ANTI-PATTERN: string concatenation in a loop (O(n²) allocations)
func badConcat(words []string) string {
	s := ""
	for _, w := range words {
		s += w  // each += allocates a new string (old + new copied)
	}
	return s
}

// ✅ CORRECT: strings.Builder (Go 1.10+) — amortized O(n), minimal allocations
func goodConcat(words []string) string {
	var b strings.Builder
	b.Grow(64)  // pre-grow to avoid reallocation (estimate total size)
	for _, w := range words {
		b.WriteString(w)
	}
	return b.String()  // single allocation for the final string
}

// ✅ For joining with a separator: strings.Join (uses Builder internally)
joined := strings.Join(words, ", ")

// ✅ For byte manipulation without string conversion: bytes.Buffer
func byteConcat(parts [][]byte) []byte {
	var buf bytes.Buffer
	for _, p := range parts {
		buf.Write(p)
	}
	return buf.Bytes()
}
```
::

## 💡 Tips & Tricks

- **Performance**: `strings.Builder.Grow(n)` pre-allocates the internal slice — call it when you know the approximate output size. Without `Grow`, the builder doubles its buffer, causing log(n) reallocations. `b.Grow(1024)` before writing 1000 bytes avoids 4-5 reallocations.
- **Safety**: use `math/big.Int` for cryptographic operations, file sizes, or any value that might exceed `int64` (2^63-1). `int64` max = ~9.2 quintillion — sufficient for most apps, but file offsets on 18-exabyte storage or nanosecond timestamps overflow.
- **Idiom**: `strconv.Itoa` for int→string, `strconv.Atoi` for string→int — both are faster than `fmt.Sprintf`/`fmt.Sscanf`. `strconv.ParseInt(s, 10, 64)` gives control over base and bit size.
- **Performance**: `bytes.Equal(a, b)` is faster than `string(a) == string(b)` — it compares bytes directly without allocating string conversions. Same for `bytes.Compare` vs `strings.Compare`.
- **Portability**: `int` is 32-bit on 32-bit platforms. If you serialize data (binary formats, network protocols), always use `int32`/`int64` with explicit sizes. `encoding/binary` enforces fixed-width types.
- **Debug**: `fmt.Sprintf("%x", s)` prints a string as hex bytes — useful for debugging encoding issues. `fmt.Sprintf("%q", s)` prints with quotes and escapes non-printable bytes — shows invalid UTF-8 clearly.

## ⚠️ Edge Cases & Gotchas

- **`len(s)` is bytes, not characters**: `len("世")` = 3, not 1. Use `utf8.RuneCountInString(s)` for character count. `len()` is O(1) (reads the header); `RuneCountInString` is O(n).
- **`s[i]` is a byte, not a character**: indexing multi-byte UTF-8 at an arbitrary position gives a partial rune. Use `range` or `utf8.DecodeRuneInString` for character access.
- **Integer overflow wraps silently**: no panic — `byte(255) + 1` = 0, `int8(127) + 1` = -128. Use `math/bits.Add64`/`Mul64` for overflow detection, or `math/big` for arbitrary precision.
- **`0.1 + 0.2 ≠ 0.3`**: IEEE 754 double can't represent 0.1 exactly. Use a decimal library for money, or store as integer cents.
- **`float64` can't represent all integers beyond 2^53**: `float64(1<<53+1)` == `float64(1<<53)`. For large integer IDs, use `int64`, not `float64`.
- **`NaN != NaN`**: the only value in Go that doesn't equal itself. Use `math.IsNaN()` to test. JSON marshals NaN as an error (use `json.Marshal` carefully with floats).
- **`string(65)` = "A", not "65"**: `string(int)` gives the Unicode code point. Use `strconv.Itoa` for digits. `go vet` warns about this.
- **Strings are immutable**: `s[0] = 'x'` is a compile error. Convert to `[]byte`, modify, convert back (two allocations).
- **`[]byte(s)` and `string(b)` each allocate**: they copy the data because strings are read-only. Avoid in hot paths — use `bytes`/`strings` package functions that work on the native type.
- **`int` size is platform-dependent**: 32-bit on 32-bit, 64-bit on 64-bit. `unsafe.Sizeof(int(0))` = 4 or 8. Never assume `int` = `int64` — use `int64` explicitly for fixed-width.
- **Truncating conversions**: `int(3.9)` = 3 (truncates toward zero, not rounding). `byte(300)` = 44 (wraps). `int(-3.9)` = -3. Use `math.Round` for rounding: `int(math.Round(3.9))` = 4.
- **`uintptr` is not a pointer**: `uintptr` is an integer that holds a pointer's *value*, but the GC doesn't treat it as a pointer — converting `*T → uintptr` can cause the object to be collected. Only use `uintptr` with `unsafe` for syscall arguments.

## 🧠 Quick Quiz

::code-wrapper{language="go"}
```go
s := "café"
b := []byte(s)
b[len(b)-1] = 't'
fmt.Println(s)
fmt.Println(string(b))
```

What's printed?
::
<details>
<summary>Answer</summary>

```
café
caft
```

`s` is still `"café"` — strings are immutable, and `[]byte(s)` **copies** the data. Modifying `b` doesn't affect `s`. `string(b)` creates a new string from the modified bytes: `"caft"`.

But wait — "é" is 2 bytes in UTF-8 (0xC3 0xA9). `b[len(b)-1]` modifies the last byte (0xA9 → 0x74 = 't'), leaving 0xC3 intact. `string(b)` now contains `0xC3 0x74` — which is invalid UTF-8 (0xC3 starts a 2-byte sequence but 0x74 is not a continuation byte). `fmt.Println` may print "caf\u00f3" or garbage depending on the terminal.

The lesson: modifying `[]byte` of a string at byte positions can break UTF-8. If you need to modify characters, work in `[]rune`.

</details>

## 📚 What's Next

→ [05 — Functions](/go/05-functions) — multiple returns, closures, defer mechanics, variadic functions, and function types as values.