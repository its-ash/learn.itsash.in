---
title: "22 — I/O, Files & the io Package"
description: "Reader/Writer composition, io.Copy mechanics, bufio streaming, file handling patterns, and zero-copy transfer with io.CopyN/LimitReader."
---

# 22 — I/O, Files & the io Package

Go's I/O is built around two small interfaces — `io.Reader` and `io.Writer` — that compose into pipelines for files, networks, compression, and encoding.

## The Two Core Interfaces

::code-wrapper{language="go"}
```go
// ┌──────────────────────────────────────────────────────────────────────┐
// │ io.Reader                                                             │
// │   Read(p []byte) (n int, err error)                                   │
// │   Fills p up to len(p) bytes. Returns n=bytes read, err=io.EOF at end│
// │   ⚠️ May return n < len(p) and err=nil — that's OK, call Read again  │
// │   ⚠️ Never assume Read fills the buffer — always use the returned n   │
// └──────────────────────────────────────────────────────────────────────┘

// ┌──────────────────────────────────────────────────────────────────────┐
// │ io.Writer                                                             │
// │   Write(p []byte) (n int, err error)                                 │
// │   Writes p. Returns n=bytes written, err if not all written.         │
// │   ⚠️ If n < len(p) and err=nil, it's a short write — caller retries  │
// └──────────────────────────────────────────────────────────────────────┘

// Implementations: *os.File, *bytes.Buffer, *strings.Builder, net.Conn,
//   *gzip.Reader/Writer, *http.Response.Body, *json.Encoder, etc.

// ─── Custom Reader (a rate-limited reader) ───
type rateLimitReader struct {
	r       io.Reader
	limit   int  // bytes per second
	tokens  int
	ticker  *time.Ticker
}

func (r *rateLimitReader) Read(p []byte) (int, error) {
	// Wait for tokens, then read up to the available amount
	<-r.ticker.C  // one token per tick
	max := min(len(p), r.limit)
	return r.r.Read(p[:max])
}
```

## `io.Copy` — The Zero-Copy Transfer

::code-wrapper{language="go"}
```go
// io.Copy reads from src and writes to dst until EOF, using a 32KB buffer.
// It's the standard way to transfer data without manual buffering.

func copyFile(src, dst string) (int64, error) {
	in, err := os.Open(src)
	if err != nil {
		return 0, fmt.Errorf("open src: %w", err)
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return 0, fmt.Errorf("create dst: %w", err)
	}
	defer out.Close()

	n, err := io.Copy(out, in)  // returns bytes copied
	if err != nil {
		return 0, fmt.Errorf("copy: %w", err)
	}

	// ⚠️ defer out.Close() error is lost — call Sync explicitly:
	if err := out.Sync(); err != nil {  // flush to disk
		return 0, fmt.Errorf("sync: %w", err)
	}
	return n, nil
}

// ─── io.CopyN — copy exactly N bytes ───
n, err := io.CopyN(dst, src, 1024)  // copies exactly 1024 bytes (or fewer if EOF)

// ─── io.LimitReader — wrap to limit reads ───
limited := io.LimitReader(src, 1024)  // reads at most 1024 bytes from src
io.Copy(dst, limited)  // copies at most 1024 bytes
```

## `bufio` — Buffered Scanning

::code-wrapper{language="go"}
```go
// bufio.Scanner — line-by-line reading (most common pattern):
func readLines(path string) error {
	f, err := os.Open(path)
	if err != nil { return err }
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {  // reads one line at a time
		line := scanner.Text()
		fmt.Println(line)
	}

	// ⚠️ Always check scanner.Err() after the loop:
	return scanner.Err()  // returns io.EOF normally, or an error
}

// ─── Scanner buffer size — the 64KB limit trap ───
func readLongLines(path string) error {
	f, _ := os.Open(path)
	defer f.Close()

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)  // 1MB max line
	// Default max line is 64KB — lines longer than that cause scanner.Err()
	// to return bufio.ErrTooLong. Increase the buffer for long lines.

	for scanner.Scan() {
		// process line
	}
	return scanner.Err()
}

// ─── bufio.Reader — lower-level, more control ───
func readWithReader(path string) error {
	f, _ := os.Open(path)
	defer f.Close()

	r := bufio.NewReader(f)
	for {
		line, err := r.ReadString('\n')  // reads up to and including '\n'
		if err != nil {
			if err == io.EOF && line != "" {
				process(line)  // last line without newline
			}
			break
		}
		process(line)
	}
	return nil
}
```

## File Operations

::code-wrapper{language="go"}
```go
func fileOps() {
	// Read all (Go 1.16+ — replaces ioutil.ReadFile):
	data, err := os.ReadFile("config.yaml")
	if err != nil { /* file doesn't exist, permission denied, etc. */ }

	// Write all (Go 1.16+):
	err = os.WriteFile("output.txt", []byte("hello"), 0644)
	// 0644 = user: rw, group: r, other: r

	// Open for reading:
	f, _ := os.Open("file.txt")
	defer f.Close()

	// Create/open for writing (truncates if exists):
	f, _ = os.Create("new.txt")
	defer f.Close()

	// Open with explicit flags:
	f, _ = os.OpenFile("log.txt", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	defer f.Close()
	f.WriteString("appended line\n")

	// ─── File flags ───
	// os.O_RDONLY   read only
	// os.O_WRONLY   write only
	// os.O_RDWR     read/write
	// os.O_CREATE   create if not exists
	// os.O_TRUNC    truncate to 0 on open
	// os.O_APPEND   append to end (no overwrite)
	// os.O_EXCL     fail if file exists (with O_CREATE)
	// os.O_SYNC     synchronous I/O (no buffering, for durability)
}

// ─── The defer-close error trap ───
func writeFile(path string, data []byte) error {
	f, err := os.Create(path)
	if err != nil { return err }
	defer f.Close()  // ⚠️ Close() error is DISCARDED by defer

	if _, err := f.Write(data); err != nil {
		return err  // f.Close() runs in defer, but error is lost
	}

	// ✅ For write durability, call Sync and Close explicitly:
	if err := f.Sync(); err != nil {  // flush kernel buffers to disk
		f.Close()
		return fmt.Errorf("sync: %w", err)
	}
	if err := f.Close(); err != nil {  // close can fail (flush error)
		return fmt.Errorf("close: %w", err)
	}
	return nil
}
```

## Streaming Pipeline — Composing Readers and Writers

::code-wrapper{language="go"}
```go
// ─── gzip-compressed HTTP response ───
func decompressResponse(resp *http.Response) ([]byte, error) {
	// resp.Body is a Reader → gzip.Reader → io.ReadAll → bytes
	gz, err := gzip.NewReader(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("gzip: %w", err)
	}
	defer gz.Close()

	return io.ReadAll(gz)  // decompressed bytes
}

// ─── gzip-compressed file writer ───
func writeGzipped(path string, data []byte) error {
	f, err := os.Create(path)
	if err != nil { return err }
	defer f.Close()

	gz := gzip.NewWriter(f)
	defer gz.Close()  // ⚠️ must Close to flush compressed data

	_, err = gz.Write(data)
	return err
}

// ─── Base64-encoded gzip stream ───
// Read: file → base64 decoder → gzip decoder → JSON decoder → struct
func decodeNested(r io.Reader) (*Config, error) {
	b64 := base64.NewDecoder(base64.StdEncoding, r)
	gz, err := gzip.NewReader(b64)
	if err != nil { return nil, err }
	defer gz.Close()

	var cfg Config
	if err := json.NewDecoder(gz).Decode(&cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}
```

## `io.Pipe` — In-Memory Stream Between Goroutines

::code-wrapper{language="go"}
```go
// io.Pipe creates a synchronous pipe: a Reader and Writer pair where
// writes block until reads consume (and vice versa). It's a channel
// for byte streams.

func pipeDemo() {
	r, w := io.Pipe()

	// Writer goroutine:
	go func() {
		defer w.Close()  // signal EOF to the reader
		json.NewEncoder(w).Encode(map[string]int{"x": 1, "y": 2})
	}()

	// Reader (blocks until writer writes, then blocks again for more):
	var m map[string]int
	if err := json.NewDecoder(r).Decode(&m); err != nil {
		log.Fatal(err)
	}
	fmt.Println(m)  // map[x:1 y:2]
}

// Use case: stream a large JSON response to S3 without buffering it all
// in memory. The HTTP body reader writes to the pipe; S3 upload reads
// from it concurrently.
```

## 💡 Tips & Tricks

- **Idiom**: use `io.Copy(dst, src)` for all data transfer — it handles buffering, EOF, and short reads. Don't manually loop `Read` + `Write` — `io.Copy` is tested and optimized.
- **Idiom**: use `os.ReadFile`/`os.WriteFile` (Go 1.16+) for whole-file operations — they replace `ioutil.ReadFile`/`WriteFile` (deprecated). For streaming, use `os.Open` + `io.Copy`.
- **Idiom**: use `bufio.Scanner` for line-by-line reading — increase the buffer with `scanner.Buffer(make([]byte, 0, 64*1024), maxSize)` for long lines (default max is 64KB).
- **Performance**: `io.Copy` uses a 32KB internal buffer — optimal for most cases. For very large transfers, `io.CopyBuffer` lets you reuse a buffer (zero allocation).
- **Safety**: for write durability, call `f.Sync()` before `f.Close()` — `Sync` flushes kernel buffers to disk. Without it, a crash after Close may lose data (the OS buffer is lost).
- **Idiom**: check `scanner.Err()` after the `scanner.Scan()` loop — the loop exits on EOF (normal) or error; `Err()` tells you which.

## ⚠️ Edge Cases & Gotchas

- **`Read` may return `n < len(p)` with `err=nil`**: that's normal — don't assume the buffer is full. Always use `p[:n]` for the actual data.
- **`bufio.Scanner` default max line is 64KB**: lines longer than 64KB cause `scanner.Err()` to return `bufio.ErrTooLong`. Increase with `scanner.Buffer(...)`.
- **`defer f.Close()` discards the error**: `Close` can fail (flush error, network write). For writes, call `Close` explicitly and check the error. For reads, the discarded error is usually fine.
- **`os.WriteFile` doesn't sync**: it writes and closes, but doesn't call `Sync`. For durability, open with `O_SYNC` or call `Sync` explicitly.
- **`io.ReadAll` reads everything into memory**: for large streams, this causes OOM. Use `io.Copy` to stream to a file or `json.NewDecoder` for streaming decode.
- **`http.Response.Body` must be closed**: `defer resp.Body.Close()` — leaking it leaks the TCP connection. Even on error, close it.
- **`io.Pipe` is synchronous**: writes block until reads consume. If the reader is slow, the writer blocks. Use a buffered channel or `bytes.Buffer` for async buffering.
- **Short writes**: `Write` may write fewer bytes than requested (`n < len(p)`). `io.Copy` handles this; manual code must loop until all bytes are written.

## 🧠 Quick Quiz

::code-wrapper{language="go"}
```go
func readConfig(path string) ([]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return io.ReadAll(f)
}
```

What's the issue if the file is 10GB?
::
<details>
<summary>Answer</summary>

`io.ReadAll` reads the ENTIRE file into memory. For a 10GB file, this allocates ~10GB of RAM — likely OOM-killed.

The fix — stream with `io.Copy` or `bufio.Scanner`:

```go
// Stream to another writer (no full buffering):
func streamConfig(path string, w io.Writer) error {
	f, err := os.Open(path)
	if err != nil { return err }
	defer f.Close()
	_, err = io.Copy(w, f)  // streams in 32KB chunks
	return err
}

// Or read line by line:
func readConfigLines(path string) error {
	f, err := os.Open(path)
	if err != nil { return err }
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		// process line — only one line in memory at a time
	}
	return scanner.Err()
}
```

`io.ReadAll` is fine for small files (configs, JSON responses). For large files, always stream.

</details>

## 📚 What's Next

→ [23 — Encoding: JSON, CSV, gob](/go/23-encoding) — struct tags, streaming JSON, `json.Number` precision, and gob for Go-to-Go serialization.