# 06 — Control Flow

Go has minimal control flow: `if`, `for`, `switch`, `select`, and `goto`. No `while`, no `do-while`. This simplicity is deliberate — fewer constructs, less to learn, less to argue about.

## `if`

::code-wrapper{language="go"}
```go
if x > 0 {
	fmt.Println("positive")
} else if x < 0 {
	fmt.Println("negative")
} else {
	fmt.Println("zero")
}

// if with an initialization statement
if err := doSomething(); err != nil {
	log.Fatal(err)
}
// err is scoped to the if/else block — not visible outside
```
::

The `if init; condition` form is idiomatic for "try something, check the result" — `err` is scoped to the block, avoiding leakage. No parentheses around conditions; braces are **mandatory** even for one-line bodies (and the opening brace must be on the same line as `if`).

## `for`

Go has one loop construct — `for` — which serves as `while`, `do-while` (via infinite loop + break), and traditional `for`:

::code-wrapper{language="go"}
```go
// Traditional for
for i := 0; i < 10; i++ {
	fmt.Println(i)
}

// While-like (condition only)
n := 10
for n > 0 {
	n--
}

// Infinite loop
for {
	if done {
		break
	}
}

// Range (over slice, array, map, string, channel)
for i, v := range items {
	fmt.Println(i, v)
}
for _, v := range items {   // discard index
	fmt.Println(v)
}
for k, v := range m {       // map: key, value
	fmt.Println(k, v)
}
for i, r := range "Hello" { // string: byte offset, rune
	fmt.Println(i, r)
}
for v := range ch {         // channel: values until closed
	fmt.Println(v)
}
``
::

### Range over integers (Go 1.22+)

Go 1.22 added `range` over integers:

::code-wrapper{language="go"}
```go
for i := range 10 {   // i = 0, 1, ..., 9
	fmt.Println(i)
}
``
::

### Loop variable scoping (Go 1.22+ fix)

Pre-1.22, the loop variable was shared across iterations — closures/goroutines capturing it saw the final value. Go 1.22+ makes each iteration's variable distinct, fixing the classic bug:

::code-wrapper{language="go"}
```go
// Pre-1.22: prints "3 3 3" (all see final i)
// 1.22+: prints "0 1 2" (each i is distinct)
for i := 0; i < 3; i++ {
	go func() { fmt.Println(i) }()
}
``
::

On older Go, pass the variable as an argument: `go func(i int) { ... }(i)`.

## `switch`

::code-wrapper{language="go"}
```go
switch x {
case 1:
	fmt.Println("one")
case 2, 3:
	fmt.Println("two or three")
default:
	fmt.Println("other")
}

// No break needed — cases don't fall through by default (unlike C/Java)
// Use fallthrough to explicitly fall through:
switch x {
case 1:
	fmt.Println("one")
	fallthrough
case 2:
	fmt.Println("one or two")
}

// Switch with no expression — like if/else chain
switch {
case x < 0:
	fmt.Println("negative")
case x == 0:
	fmt.Println("zero")
default:
	fmt.Println("positive")
}

// Switch with init
switch n := compute(); {
case n < 0:
	// ...
case n > 0:
	// ...
}
``
::

Go `switch` doesn't fall through by default — a huge difference from C/Java. `fallthrough` is explicit and rare. Multiple values in one case: `case 2, 3:`.

### Type switch (chapter 13)

::code-wrapper{language="go"}
```go
switch v := x.(type) {
case int:
	fmt.Println("int:", v)
case string:
	fmt.Println("string:", v)
default:
	fmt.Println("unknown")
}
``
::

## `break` and `continue`

::code-wrapper{language="go"}
```go
for i := 0; i < 10; i++ {
	if i%2 == 0 {
		continue   // skip even
	}
	if i > 7 {
		break      // exit loop
	}
	fmt.Println(i)
}

// break/continue with labels (for nested loops)
outer:
	for i := 0; i < 3; i++ {
		for j := 0; j < 3; j++ {
			if i == j {
				continue outer   // skip to next iteration of outer
			}
			if i+j > 3 {
				break outer      // break out of outer
			}
		}
	}
``
::

Labels (`outer:`) are the way to break/continue an outer loop from an inner one. Rare but necessary for nested-loop control.

## `select` (preview)

`select` waits on multiple channel operations (chapter 18):

::code-wrapper{language="go"}
```go
select {
case v := <-ch1:
	fmt.Println("from ch1:", v)
case ch2 <- 42:
	fmt.Println("sent to ch2")
case <-time.After(time.Second):
	fmt.Println("timeout")
default:
	fmt.Println("no operation ready")
}
``
::

`select` chooses one ready case at random; `default` makes it non-blocking.

## `goto`

::code-wrapper{language="go"}
```go
i := 0
loop:
	if i < 10 {
		i++
		goto loop
	}
``
::

`goto` exists but is almost never used in idiomatic Go. The one legitimate use is error-handling cleanup in generated code or very specific C-style patterns. Prefer `for`/`if`/`break`.

## 💡 Tips & Tricks

- **Idiom**: use `if init; condition` to scope temporary variables to the `if` block — `if err := f(); err != nil { ... }` keeps `err` out of the outer scope, signaling it's only relevant to this check. This is the Go idiom for "try and check."
- **Idiom**: use `switch` with no expression (`switch { case x < 0: ... }`) for multi-branch conditionals — it's cleaner than a long `if/else if/else` chain, and each case can have a complex condition.
- **Idiom**: use `range` over an integer (`for i := range n`) in Go 1.22+ for simple count loops — `for i := range 10` is clearer than `for i := 0; i < 10; i++` and avoids the classic off-by-one.
- **Idiom**: use labeled `break`/`continue` for nested-loop control — `break outer` exits an outer loop from an inner one, which is otherwise awkward. Rare but the clean solution when needed.
- **Portability**: be aware of the loop variable scoping change in Go 1.22 — pre-1.22, closures/goroutines capturing the loop variable saw the final value (a classic bug); 1.22+ fixes it by making each iteration's variable distinct. For code targeting older Go, pass the variable as an argument: `go func(i int) { ... }(i)`.

## ⚠️ Edge Cases & Gotchas

- **Braces are mandatory**: `if x { ... }` is required — `if x fmt.Println(x)` is a syntax error. And the opening brace must be on the same line as `if`/`for`/`func` — Go's automatic semicolon insertion puts a semicolon at end of line, so `if x\n{` is a syntax error.
- **No parentheses around conditions**: `if (x > 0)` works but is non-idiomatic (gofmt leaves it, but `go vet` doesn't complain — it's just style). Use `if x > 0`.
- **`switch` doesn't fall through by default**: unlike C/Java, each case ends without needing `break`. `fallthrough` is explicit and rare.
- **`fallthrough` doesn't evaluate the next case's condition**: `fallthrough` jumps to the next case's body unconditionally — it doesn't check the next case's value. This is unlike C.
- **`range` over a string yields `(byte_offset, rune)`**: the index is the byte position, not the rune index. For "世a", the first iteration gives `(0, '世')`, the second gives `(3, 'a')` — the 3 is the byte offset after the 3-byte "世".
- **`range` over a map is unordered**: map iteration order is unspecified (and intentionally randomized in Go). If you need ordered keys, sort them: `var keys []string; for k := range m { keys = append(keys, k) }; sort.Strings(keys)`.
- **Modifying a slice during range**: `for i, v := range s { s = append(s, v) }` — `range` evaluates `s` once at loop start, so the appended elements aren't iterated. But modifying existing elements (`s[i] = ...`) works.
- **`continue` in a `select` inside a `for`**: `continue` inside a `select` continues the enclosing `for` loop, not the `select` (there's no loop iteration in `select`). Subtle but correct.
- **`goto` can't jump over variable declarations**: `goto end; x := 5; end:` is an error (jumping over `x`'s declaration). `goto` is restricted to avoid spaghetti.
- **Loop variable capture (pre-1.22)**: the classic goroutine-in-a-loop bug. Go 1.22 fixes it; on older Go, pass the variable as an argument or use a local copy.

## 🧠 Spot the Bug

A developer runs this on Go 1.21 and expects "0 1 2" but gets "3 3 3":

::code-wrapper{language="go"}
```go
for i := 0; i < 3; i++ {
	go func() {
		fmt.Println(i)
	}()
}
time.Sleep(time.Second)
```
::

<details>
<summary>Answer</summary>

Pre-Go 1.22, the loop variable `i` is a **single variable** reused across iterations — not a fresh variable per iteration. All three goroutines capture the same `i` by reference. By the time they run (after the `Sleep`), the loop has finished and `i` is 3 — so all three print 3.

Go 1.22+ fixes this: each iteration gets a distinct `i`, so the goroutines print 0, 1, 2.

The fix (portable across versions) — pass `i` as an argument to the goroutine, creating a fresh copy per call:

```go
for i := 0; i < 3; i++ {
	go func(i int) {
		fmt.Println(i)
	}(i)
}
```

Or, on 1.22+, just use the original — the fix is automatic.

**The lesson**: pre-1.22, loop variables are shared across iterations; closures/goroutines capture them by reference and see the final value. Pass the variable as an argument (`func(i int) { ... }(i)`) to create a fresh copy per iteration. Go 1.22+ makes each iteration's variable distinct, eliminating the bug.

</details>

## Summary

You can now use `if init; cond`, `for` (all forms including `range` over integers in 1.22+), `switch` (no default fallthrough, no-expression form, type switch), `break`/`continue` with labels, and `select`. You understand the Go 1.22 loop-variable fix and the mandatory-brace / same-line-brace rules. Next: arrays, slices, and strings — the most-used data structures.