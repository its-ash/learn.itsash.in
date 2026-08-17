# 22 — I/O, Files & the io Package

Go's I/O is built around two interfaces: `io.Reader` and `io.Writer`. Almost every I/O type (files, network, buffers, compression) implements them, making streams composable.

## `io.Reader` and `io.Writer`

::code-wrapper{language="go"}
```go
type Reader interface {
	Read(p []byte) (n int, err error)
}

type Writer interface {
	Write(p []byte) (n int, err error)
}
``
::

- `Read` fills `p` up to `len(p)` bytes, returns the number read and `error` (`io.EOF` when done).
- `Write` writes `p`, returns the number written and `error`.

Implementations: `*os.File`, `*bytes.Buffer`, `*strings.Builder`, `net.Conn`, `*gzip.Reader`, `*http.ResponseWriter`, etc.

## `io.Copy` — the Workhorse

::code-wrapper{language="go"}
```go
// Copy all data from src to dst
n, err := io.Copy(dst, src)
``
::

`io.Copy` reads from a `Reader` and writes to a `Writer` until `io.EOF`, using a small buffer internally. It's the standard way to transfer data (file-to-file, file-to-network, etc.) without manual buffering.

## Files (`os` package)

::code-wrapper{language="go"}
```go
// Open for reading
f, err := os.Open("file.txt")
if err != nil {
	return err
}
defer f.Close()

// Read
data := make([]byte, 1024)
n, err := f.Read(data)

// Read all (Go 1.16+)
data, err := os.ReadFile("file.txt")

// Create/open for writing (truncate if exists)
f, err := os.Create("file.txt")
defer f.Close()
n, err := f.Write([]byte("hello"))

// Write all (Go 1.16+)
err := os.WriteFile("file.txt", []byte("hello"), 0644)

// Open with flags
f, err := os.OpenFile("file.txt", os.O_APPEND|os.O_WRONLY, 0644)
defer f.Close()
f.WriteString("appended\n")
``
::

### File modes and permissions

::code-wrapper{language="text"}
```text
os.O_RDONLY   read only
os.O_WRONLY   write only
os.O_RDWR     read/write
os.O_CREATE   create if not exists
os.O_TRUNC    truncate to 0 on open
os.O_APPEND   append to end

0644         user: rw, group: r, other: r
0600         user: rw only
0755         user: rwx, group: rx, other: rx
```
::

## `bufio` — Buffered I/O

::code-wrapper{language="go"}
```go
// Buffered reader — efficient for line-by-line
f, _ := os.Open("file.txt")
defer f.Close()
scanner := bufio.NewScanner(f)
for scanner.Scan() {
	line := scanner.Text()
	fmt.Println(line)
}
if err := scanner.Err(); err != nil {
	log.Fatal(err)
}

// Buffered writer — batches writes
w := bufio.NewWriter(os.Stdout)
defer w.Flush()   // flush remaining buffer
w.WriteString("buffered\n")
``
::

`bufio.Scanner` reads line-by-line (or word, or rune — configurable). `bufio.Writer` batches small writes into larger ones (more efficient for many small writes; remember `Flush`).

### `Scanner` vs `Reader`

- `Scanner` — line/word/rune-based, easy API, but limited buffer size (default 64KB — long lines fail). Use for typical text.
- `Reader` (`bufio.Reader`) — byte-based, more control (`ReadString`, `ReadBytes`), handles long lines. Use for unusual input.

## `strings.Reader` and `bytes.Reader`

For treating a string or byte slice as a `Reader` (e.g., to pass to a function expecting `io.Reader`):

::code-wrapper{language="go"}
```go
r := strings.NewReader("hello world")
io.Copy(os.Stdout, r)   // prints "hello world"

b := bytes.NewReader([]byte("hello"))
scanner := bufio.NewScanner(b)
``
::

## Combining Streams (composition)

Because everything is a `Reader`/`Writer`, you can compose:

::code-wrapper{language="go"}
```go
// Read a gzipped file
f, _ := os.Open("file.gz")
defer f.Close()
gz, _ := gzip.NewReader(f)
defer gz.Close()
data, _ := io.ReadAll(gz)   // decompressed content

// Write a gzipped file
f, _ := os.Create("file.gz")
defer f.Close()
gz := gzip.NewWriter(f)
defer gz.Close()
gz.Write([]byte("compress me"))
``
::

The same `io.Copy(os.Stdout, gz)` works whether the source is a file, a gzip stream, a network connection — the interface is the abstraction.

## `io.ReadAll` (Go 1.16+)

::code-wrapper{language="go"}
```go
data, err := io.ReadAll(r)   // reads until EOF, returns []byte
``
::

Reads everything into memory. Convenient but beware memory use for large streams — prefer streaming (`io.Copy`) for big data.

## `io.Pipe` — In-Memory Stream

::code-wrapper{language="go"}
```go
r, w := io.Pipe()
go func() {
	defer w.Close()
	w.Write([]byte("hello"))
}()
data, _ := io.ReadAll(r)   // "hello"
``
::

`io.Pipe` creates a synchronous in-memory pipe — writes block until reads consume. Useful for connecting producers and consumers in the same process.

## `ioutil` is deprecated

Pre-1.16, `ioutil.ReadFile`, `ioutil.WriteFile`, `ioutil.ReadAll` were the APIs. Go 1.16 moved them to `os` and `io` — use `os.ReadFile`, `os.WriteFile`, `io.ReadAll`. `ioutil` is an alias now; don't use it in new code.

## 💡 Tips & Tricks

- **Idiom**: use `io.Copy(dst, src)` for transferring data between streams — it handles buffering, looping, and EOF, and works for any `Reader`/`Writer` pair (file-to-network, gzip-to-file, etc.). Don't write manual `Read`/`Write` loops.
- **Idiom**: use `os.ReadFile`/`os.WriteFile` (Go 1.16+) for whole-file reads/writes — they're one-liners that handle open/close/read/write. Reserve `os.Open` + `defer Close` + `Read` for streaming large files.
- **Idiom**: use `bufio.Scanner` for line-by-line text reading — `for scanner.Scan() { line := scanner.Text() }` is the idiomatic pattern. But be aware of the 64KB default buffer limit (long lines fail with "token too long") — increase with `scanner.Buffer()` for long lines.
- **Idiom**: compose streams via `io.Reader`/`io.Writer` — `gzip.NewReader(file)` gives a `Reader` that decompresses; `io.Copy(os.Stdout, gz)` prints decompressed data. The interface is the abstraction — you can stack compression, encryption, buffering, etc. without changing the consuming code.
- **Idiom**: always `defer Close()` on files (and any `io.Closer`) right after opening — `f, _ := os.Open(...); defer f.Close()`. Even on error, the `defer` runs (if `f` is non-nil). For `bufio.Writer`/`gzip.Writer`, `defer w.Flush()` too — unwritten buffered data is lost on close without flush.

## ⚠️ Edge Cases & Gotchas

- **`Read` returning `n > 0` and `err == io.EOF`**: some readers return data and EOF in the same call. Always process `n` bytes first, then check `err` — don't break on EOF before handling the data. `io.Copy`/`io.ReadAll` handle this; manual loops often don't.
- **`Scanner` 64KB line limit**: `bufio.Scanner` has a default max token size of 64KB — lines longer than that cause `ErrTooLong`. Increase with `scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)`.
- **`bufio.Writer` needs `Flush`**: `w := bufio.NewWriter(f); w.Write(...); // f.Close()` — without `w.Flush()`, buffered data is lost. `defer w.Flush()` before `defer f.Close()`.
- **`os.Create` truncates**: `os.Create` opens with `O_RDWR|O_CREATE|O_TRUNC` — it empties an existing file. Use `os.OpenFile` with `O_APPEND` to append.
- **`io.ReadAll` loads everything into memory**: for large streams (a multi-GB file), this exhausts memory. Stream with `io.Copy` instead.
- **`Close` error is often ignored**: `defer f.Close()` ignores the error. For writes (where `Close` may flush and fail), check: `defer func() { if err := f.Close(); err != nil { log.Println(err) } }()`.
- **`os.Open` returns a `*os.File`, not `io.Reader`**: `*os.File` implements `Reader`/`Writer`/`Closer` and more. Most functions accept `io.Reader`, so passing `*os.File` works.
- **`io.EOF` is expected**: `Read` returning `io.EOF` is normal end-of-input, not an error. Distinguish it from real errors: `if err != nil && err != io.EOF { return err }`.
- **File permissions on `os.WriteFile`**: the third arg (e.g., `0644`) is the mode, applied after umask. `0644` is user-rw, group-r, other-r. `0600` is user-only.

## 🧠 Spot the Bug

A developer reads a file and processes lines, but the last line is sometimes missing:

::code-wrapper{language="go"}
```go
scanner := bufio.NewScanner(f)
for scanner.Scan() {
	line := scanner.Text()
	process(line)
}
``
::

They claim this misses the last line when the file doesn't end with a newline.

<details>
<summary>Answer</summary>

Actually, `bufio.Scanner` **does** handle a final line without a trailing newline — `Scan` returns true for the last line and false after. This is correct behavior; the loop processes all lines.

The real "missing last line" bug is when using `ReadString('\n')` with a `bufio.Reader`:

```go
r := bufio.NewReader(f)
for {
	line, err := r.ReadString('\n')
	if err == io.EOF {
		break   // ❌ breaks before processing the last line if it has no \n
	}
	process(line)
}
```
::
Here, `ReadString` returns the last line *with* `io.EOF` (no trailing `\n`), and the `break` discards it.

The fix — process the line before breaking, or check for non-empty line:

```go
for {
	line, err := r.ReadString('\n')
	if line != "" {
		process(line)
	}
	if err == io.EOF {
		break
	}
	if err != nil {
		log.Fatal(err)
	}
}
```
::
Or just use `bufio.Scanner`, which handles this correctly — the `Scan` loop processes the last line regardless of trailing newline.

**The lesson**: `bufio.Scanner` correctly handles files without a trailing newline. The `ReadString` + `EOF` pattern is the one that drops the last line — process the line before checking `EOF`, or use `Scanner`.

</details>

## Summary

You can now use `io.Reader`/`io.Writer` (the composable I/O abstraction), `io.Copy` for transfers, `os` for files (`Open`/`Create`/`OpenFile`/`ReadFile`/`WriteFile`), `bufio` for buffered/line-based I/O, compose streams (gzip + file + network), and handle `io.EOF`/`Flush`/`Close` correctly. Next: encoding (JSON, CSV, gob).