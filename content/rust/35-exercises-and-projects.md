# 35 — Exercises & Projects

Reading builds understanding; writing code builds skill. Try each exercise before opening the answer.

## Warm-Up: Predict the Output

Every line comes from a gotcha earlier in the course. Write down your answers, then check.

::code-wrapper{language="rust"}
```rust
fn main() {
    let a: u8 = 200;
    println!("{}", a.wrapping_add(100));                         // 1

    println!("{}", "naïve".len());                               // 2

    let v = vec![1, 2, 3];
    let s: i32 = v.iter().map(|x| x * x).filter(|x| x % 2 == 1).sum();
    println!("{s}");                                             // 3

    let mut x = 5;
    { let x = x + 1; let _ = x; }
    x += 1;
    println!("{x}");                                             // 4

    let o: Option<i32> = None;
    println!("{}", o.map(|n| n + 1).unwrap_or(-1));              // 5

    println!("{:?}", (1..=3).rev().collect::<Vec<_>>());         // 6
    println!("{}", -17 % 5);                                     // 7
    println!("{:?}", "a,b,".split(',').collect::<Vec<_>>());     // 8
}
```
::

<details>
<summary>Answers</summary>

::code-wrapper{language="bash"}
```bash
44            # 1  300 wraps around 256
6             # 2  ï is 2 bytes in UTF-8
10            # 3  squares 1, 4, 9 → odd ones 1 + 9
6             # 4  the inner x is a shadow; the outer x goes 5 → 6
-1            # 5  map on None stays None
[3, 2, 1]     # 6
-2            # 7  remainder takes the sign of the left side
["a", "b", ""] # 8 a trailing separator gives an empty last piece
```
::

</details>

And one that doesn't compile — why?

::code-wrapper{language="rust"}
```rust
fn main() {
    let mut stack = vec![1, 2];
    println!("{:?} {:?}", stack.last(), stack.pop());
}
```
::

<details>
<summary>Answer</summary>

`error[E0502]: cannot borrow stack as mutable because it is also borrowed as immutable`. All `println!` arguments are evaluated before printing, so the `&` from `last()` is still alive when `pop()` needs `&mut`. Print them in two statements.

</details>

## Beginner Exercises

### 1. FizzBuzz with `match`

Return `"Fizz"`, `"Buzz"`, `"FizzBuzz"` or the number as a `String` — using one `match` on a tuple.

<details>
<summary>Solution</summary>

::code-wrapper{language="rust"}
```rust
fn fizzbuzz(n: u32) -> String {
    match (n % 3, n % 5) {
        (0, 0) => "FizzBuzz".into(),
        (0, _) => "Fizz".into(),
        (_, 0) => "Buzz".into(),
        _ => n.to_string(),
    }
}

fn main() {
    let line: Vec<String> = (1..=15).map(fizzbuzz).collect();
    println!("{}", line.join(" "));
    // 1 2 Fizz 4 Buzz Fizz 7 8 Fizz Buzz 11 Fizz 13 14 FizzBuzz
}
```
::

</details>

### 2. Palindrome

`is_palindrome("A man, a plan, a canal: Panama")` → `true`. Ignore case and punctuation. Edge cases: `""` → `true`, `"ab"` → `false`.

<details>
<summary>Solution</summary>

::code-wrapper{language="rust"}
```rust
fn is_palindrome(s: &str) -> bool {
    let c: Vec<char> = s.chars()
        .filter(|c| c.is_alphanumeric())
        .map(|c| c.to_ascii_lowercase())
        .collect();
    c.iter().eq(c.iter().rev())
}
```
::

</details>

### 3. Word Frequency

Count words in a text, case-insensitive, ignoring punctuation. Return them sorted by count (highest first), then alphabetically.

<details>
<summary>Solution</summary>

::code-wrapper{language="rust"}
```rust
use std::collections::HashMap;

fn word_freq(text: &str) -> Vec<(String, usize)> {
    let mut m: HashMap<String, usize> = HashMap::new();
    for w in text.split_whitespace() {
        let w = w.trim_matches(|c: char| !c.is_alphanumeric()).to_lowercase();
        if w.is_empty() { continue; }
        *m.entry(w).or_default() += 1;
    }
    let mut v: Vec<_> = m.into_iter().collect();
    v.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));   // HashMap order is random → sort!
    v
}

fn main() {
    println!("{:?}", word_freq("The cat. the DOG, the end!"));
    // [("the", 3), ("cat", 1), ("dog", 1), ("end", 1)]
}
```
::

</details>

### 4. Generic Stack

Build `Stack<T>` with `push`, `pop -> Option<T>`, `peek -> Option<&T>`, `len`, `is_empty`.

<details>
<summary>Solution</summary>

::code-wrapper{language="rust"}
```rust
struct Stack<T> { items: Vec<T> }

impl<T> Stack<T> {
    fn new() -> Self { Stack { items: Vec::new() } }
    fn push(&mut self, t: T) { self.items.push(t); }
    fn pop(&mut self) -> Option<T> { self.items.pop() }
    fn peek(&self) -> Option<&T> { self.items.last() }
    fn len(&self) -> usize { self.items.len() }
    fn is_empty(&self) -> bool { self.items.is_empty() }
}
```
::

</details>

### 5. Balanced Brackets

`balanced("([]{})")` → `true`; `"(]"` → `false`; `"(("` → `false`; `""` → `true`.

<details>
<summary>Solution</summary>

::code-wrapper{language="rust"}
```rust
fn balanced(s: &str) -> bool {
    let mut st = Vec::new();
    for c in s.chars() {
        match c {
            '(' | '[' | '{' => st.push(c),
            ')' => if st.pop() != Some('(') { return false },
            ']' => if st.pop() != Some('[') { return false },
            '}' => if st.pop() != Some('{') { return false },
            _ => {}
        }
    }
    st.is_empty()   // leftover openers → unbalanced
}
```
::

</details>

## Intermediate Exercises

6. **Safe parser** — `parse_kv("a=1;b=2")` → `HashMap<String, i32>`. Return a custom error enum for missing `=`, bad numbers and duplicate keys (chapter 18). Test every error case.
7. **Iterator** — implement `Fibonacci` as an `Iterator<Item = u64>` that **stops** (returns `None`) instead of overflowing. Use `checked_add`.
8. **Matrix** — `Matrix<const R: usize, const C: usize>` with `transpose()` and `Add` (chapter 29). Adding different sizes must not compile.
9. **Typestate** — a `Connection<Disconnected>` → `Connection<Connected>` → `Connection<Authenticated>` where `send()` only exists on `Authenticated` (chapter 30).
10. **Thread pool** — sum `1..=10_000_000` across 4 threads using `thread::scope` and `chunks`; compare with `rayon`'s `par_iter().sum()`.
11. **Channels** — a producer sends 100 jobs, 3 workers process them, results come back on a second channel. Make sure the program exits (drop your senders!).

## Projects

### Beginner

1. **CLI to-do list** — `add`, `list`, `done`, `remove` with `clap`; save to a JSON file with `serde`. Handle a missing or corrupt file without panicking.
2. **Guessing game** — read input in a loop, `trim()` + `parse()`, give "too high/low" hints, handle non-numbers.
3. **Unit converter** — newtypes `Celsius`, `Fahrenheit`, `Kelvin` with `From` impls between them.

### Intermediate

4. **Log analyzer** — stream a large log file line by line (`BufReader::lines`), count status codes, print the top 10 IPs. Don't load the whole file.
5. **Key-value store** — `get`/`set`/`delete` commands over TCP with `tokio`; persist to disk; handle many clients.
6. **Markdown to HTML** — headings, bold, links, lists; snapshot-test the output.

### Advanced

7. **Mini interpreter** — tokenizer → parser → evaluator for arithmetic with variables. Use enums for tokens and AST nodes.
8. **Web API** — `axum` + `sqlx` CRUD service with input validation, typed errors mapped to HTTP status codes, and integration tests.
9. **FFI library** — expose a Rust function to C (`cdylib`, `#[unsafe(no_mangle)]`), call it from a C program, and free memory correctly (chapter 26).

## 💡 Tips & Tricks

- **Workflow** — `cargo check` while writing, `cargo clippy` before committing, `cargo test` always.
- **Edge cases** — for every function, test: empty input, one item, very large values, negative numbers, non-ASCII text.
- **Learning** — after solving an exercise, read how a standard-library function does the same thing (`Vec::dedup`, `str::split`).

## ⚠️ Edge Cases & Gotchas

- **Sorting** — `HashMap` results must be sorted before you compare them in tests.
- **Overflow** — Fibonacci, factorial and sums overflow sooner than you think; use `checked_*` or `u128`.
- **Input** — always `trim()` text from stdin or files before `parse()`.
- **Threads/channels** — a program that "hangs at the end" usually has an un-dropped `Sender` or an un-joined thread.

## Where to Go From Here

- [The Rust Book](https://doc.rust-lang.org/book/) — the official guide.
- [Rust by Example](https://doc.rust-lang.org/rust-by-example/) — short runnable examples.
- [Rustlings](https://github.com/rust-lang/rustlings) — small exercises that fix compiler errors.
- [Exercism Rust track](https://exercism.org/tracks/rust) — mentored practice.
- [The Rustonomicon](https://doc.rust-lang.org/nomicon/) — for `unsafe` in depth.
- [Asynchronous Programming in Rust](https://rust-lang.github.io/async-book/) — for async in depth.
