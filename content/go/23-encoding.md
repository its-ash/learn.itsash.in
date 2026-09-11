---
title: "23 — Encoding: JSON, CSV, gob"
description: "Struct tag mechanics, streaming JSON, json.Number precision, custom marshalers, CSV streaming, and gob for Go-to-Go serialization."
---

# 23 — Encoding: JSON, CSV, gob

## JSON — Struct Tags and `omitempty`

::code-wrapper{language="go"}
```go
type User struct {
	// JSON tags control serialization:
	ID       int64  `json:"id"`                          // serialize as "id"
	Name     string `json:"name" validate:"required"`   // multiple tags
	Email    string `json:"email,omitempty"`             // omit if zero value
	Password string `json:"-"`                           // never serialize
	Age      *int   `json:"age,omitempty"`              // *int: nil=omit, 0=include
	CreatedAt time.Time `json:"created_at"`              // snake_case in JSON
}

// ─── omitempty traps ───
type Response struct {
	Count int    `json:"count,omitempty"`   // 0 → omitted (but 0 may be valid!)
	Items []int  `json:"items,omitempty"`    // nil/empty → omitted
	Name  string `json:"name,omitempty"`     // "" → omitted
	Done  bool   `json:"done,omitempty"`     // false → omitted
}

r := Response{Count: 0, Items: []int{}}
data, _ := json.Marshal(r)
// {"items":[]}  — Count and Name omitted (zero values), Items included (non-nil empty)
// ⚠️ Count=0 was omitted — but 0 might be a valid count!

// ✅ Fix: use *int for fields where 0 is a valid value:
type FixedResponse struct {
	Count *int `json:"count,omitempty"`  // nil → omitted, 0 → "count":0
}
c := 0
fr := FixedResponse{Count: &c}
data, _ = json.Marshal(fr)
// {"count":0}  — 0 is included because *int is non-nil
```

## JSON — Streaming with `json.Encoder`/`Decoder`

::code-wrapper{language="go"}
```go
// ─── Encoder — streaming write (NDJSON, log files) ───
func writeNDJSON(path string, records []User) error {
	f, err := os.Create(path)
	if err != nil { return err }
	defer f.Close()

	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")  // pretty-print (optional, don't use for NDJSON)
	for _, r := range records {
		if err := enc.Encode(r); err != nil {  // one JSON object per line
			return err
		}
	}
	return nil
}

// ─── Decoder — streaming read (HTTP bodies, large files) ───
func decodeStream(r io.Reader) error {
	dec := json.NewDecoder(r)
	for {
		var u User
		if err := dec.Decode(&u); err != nil {
			if err == io.EOF { break }
			return err
		}
		process(u)  // one record at a time — no full buffering
	}
	return nil
}

// ─── DisallowUnknownFields — strict schema ───
func strictDecode(r io.Reader, v any) error {
	dec := json.NewDecoder(r)
	dec.DisallowUnknownFields()  // error on unrecognized fields
	return dec.Decode(v)
}
// Useful for API clients where the server shouldn't add fields silently.
```

## JSON — The `float64` Number Trap

::code-wrapper{language="go"}
```go
// encoding/json decodes numbers as float64 by default.
// This loses precision for large integers (> 2^53).

func jsonNumberTrap() {
	var v any
	json.Unmarshal([]byte(`{"id": 12345678901234567890}`), &v)
	m := v.(map[string]any)
	id := m["id"].(float64)
	fmt.Println(int64(id))  // 12345678901234567000 — WRONG (precision lost!)
}

// ✅ Fix 1: UseNumber — numbers become json.Number (string-backed)
func jsonUseNumber() {
	dec := json.NewDecoder(strings.NewReader(`{"id": 12345678901234567890}`))
	dec.UseNumber()
	var v any
	dec.Decode(&v)
	m := v.(map[string]any)
	n := m["id"].(json.Number)  // json.Number is a string
	id, _ := n.Int64()  // 12345678901234567890 — exact
	fmt.Println(id)
}

// ✅ Fix 2: Unmarshal into a typed struct (best for known schemas)
type Data struct {
	ID int64 `json:"id"`  // unmarshal directly into int64 — exact
}
func jsonStruct() {
	var d Data
	json.Unmarshal([]byte(`{"id": 12345678901234567890}`), &d)
	fmt.Println(d.ID)  // 12345678901234567890 — exact
}
```

## Custom Marshalers — `MarshalJSON`/`UnmarshalJSON`

::code-wrapper{language="go"}
```go
// Implement json.Marshaler/Unmarshaler for custom serialization.

type Money struct {
	cents int64  // unexported — serialize as a string
}

func (m Money) MarshalJSON() ([]byte, error) {
	// Serialize as "$12.34" string (not a number — avoids float precision issues):
	s := fmt.Sprintf(`"$%d.%02d"`, m.cents/100, m.cents%100)
	return []byte(s), nil
}

func (m *Money) UnmarshalJSON(data []byte) error {
	var s string
	if err := json.Unmarshal(data, &s); err != nil {
		return err
	}
	// Parse "$12.34" → 1234 cents
	parts := strings.Split(strings.TrimPrefix(s, "$"), ".")
	if len(parts) != 2 { return errors.New("invalid money format") }
	dollars, _ := strconv.ParseInt(parts[0], 10, 64)
	cents, _ := strconv.ParseInt(parts[1], 10, 64)
	m.cents = dollars*100 + cents
	return nil
}

type Product struct {
	Price Money `json:"price"`
}
p := Product{Price: Money{cents: 1234}}
data, _ := json.Marshal(p)
// {"price":"$12.34"}
```

## JSON — Handling Null and Empty

::code-wrapper{language="go"}
```go
type Nullable struct {
	// *string: nil → "null", "" → `""`, "x" → `"x"`
	Optional *string `json:"optional"`

	// []string: nil → "null", []string{} → "[]"
	Tags []string `json:"tags"`

	// string: "" → `""` (always present unless omitempty)
	Name string `json:"name"`
}

func nullDemo() {
	// nil pointer and nil slice → "null":
	n1 := Nullable{}
	data, _ := json.Marshal(n1)
	// {"optional":null,"tags":null,"name":""}

	// Non-nil empty slice → "[]":
	n2 := Nullable{Tags: []string{}}
	data, _ = json.Marshal(n2)
	// {"optional":null,"tags":[],"name":""}

	// Non-nil pointer → the string value:
	s := ""
	n3 := Nullable{Optional: &s}
	data, _ = json.Marshal(n3)
	// {"optional":"","tags":null,"name":""}
}

// For APIs: distinguish "field absent" (null) from "field is empty" ("")
// Use *string (null = absent, "" = explicitly empty).
```

## CSV — Streaming Read/Write

::code-wrapper{language="go"}
```go
import "encoding/csv"

func readCSV(path string) ([][]string, error) {
	f, err := os.Open(path)
	if err != nil { return nil, err }
	defer f.Close()

	r := csv.NewReader(f)
	r.FieldsPerRecord = -1  // allow variable columns per row
	// r.Comma = ';'  // change delimiter (default is comma)

	records, err := r.ReadAll()  // reads all into memory
	// For large files, read one at a time:
	// for { record, err := r.Read(); if err == io.EOF { break }; ... }
	return records, err
}

func writeCSV(path string, records [][]string) error {
	f, err := os.Create(path)
	if err != nil { return err }
	defer f.Close()

	w := csv.NewWriter(f)
	defer w.Flush()  // ⚠️ must Flush to write buffered data

	for _, record := range records {
		if err := w.Write(record); err != nil {
			return err
		}
	}
	return w.Flush()  // ✅ check Flush error (defer discards it)
}
```

## `gob` — Go-to-Go Binary Serialization

::code-wrapper{language="go"}
```go
// gob is Go's binary encoding — faster and smaller than JSON for Go types.
// Only works between Go programs (not cross-language).

type CacheEntry struct {
	Key   string
	Value []byte
	Expiry time.Time
}

func gobEncode(entries []CacheEntry) ([]byte, error) {
	var buf bytes.Buffer
	enc := gob.NewEncoder(&buf)
	for _, e := range entries {
		if err := enc.Encode(e); err != nil {
			return nil, err
		}
	}
	return buf.Bytes(), nil
}

func gobDecode(data []byte) ([]CacheEntry, error) {
	dec := gob.NewDecoder(bytes.NewReader(data))
	var entries []CacheEntry
	for {
		var e CacheEntry
		if err := dec.Decode(&e); err != nil {
			if err == io.EOF { break }
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, nil
}

// ⚠️ gob requires types to be registered if using interfaces:
// gob.Register(MyType{})
// Without registration, decoding an interface value panics.
```

## 💡 Tips & Tricks

- **Idiom**: use `*int`/`*string` for fields where zero value is valid — `omitempty` omits zero values, which drops valid 0/""/false. `*int` lets nil=omit, 0=include.
- **Idiom**: use `json.Decoder` for streaming (HTTP bodies, large files) — `json.Unmarshal` buffers everything. `Decoder.Decode` reads one value at a time.
- **Idiom**: use `DisallowUnknownFields()` for strict API contracts — catches typos in JSON field names (client sends "usrname" instead of "username" → error, not silent ignore).
- **Idiom**: use `UseNumber()` when decoding into `any` and you need integer precision — `json.Number` is string-backed, preserving exact values. For known schemas, use typed structs.
- **Idiom**: implement `MarshalJSON`/`UnmarshalJSON` for custom serialization (Money as string, timestamps in a specific format, redacted fields). This is cleaner than post-processing the JSON.
- **Safety**: `csv.Writer.Flush()` can fail — don't rely on `defer w.Flush()` (error discarded). Call `w.Flush()` explicitly and check the error.

## ⚠️ Edge Cases & Gotchas

- **`omitempty` omits valid zero values**: `Count int` with `omitempty` → `0` is omitted. If 0 is valid, use `*int`.
- **nil slice → "null", empty slice → "[]"**: `var s []int` → `null`; `[]int{}` → `[]`. APIs may treat these differently — be deliberate.
- **`json.Unmarshal` into `any` makes numbers `float64`**: asserting to `int` panics. Use `UseNumber` or typed structs.
- **Unknown JSON fields are ignored by default**: `DisallowUnknownFields()` makes it an error. Without it, a typo in a field name is silently ignored (data lost).
- **`time.Time` is serialized as RFC3339 by default**: `{"created_at":"2024-03-15T14:30:00Z"}`. Parse with `time.Parse(time.RFC3339, ...)`.
- **`gob` requires type registration for interfaces**: `gob.Register(MyType{})` before encoding/decoding interface values. Without it, decode panics.
- **`csv.Writer` must be flushed**: `defer w.Flush()` discards the error. Call `w.Flush()` explicitly and check the return.
- **Large JSON → `json.Unmarshal` allocates everything**: for large responses, use `json.Decoder` to stream-record by record.
- **`json.Marshal` panics on cyclic structures**: a struct that references itself (directly or via a cycle) causes an infinite loop in `Marshal` → stack overflow.

## 🧠 Quick Quiz

::code-wrapper{language="go"}
```go
type T struct {
	A int    `json:"a"`
	B string `json:"b,omitempty"`
	C *int   `json:"c,omitempty"`
}

t := T{A: 0, B: "", C: nil}
data, _ := json.Marshal(t)
```

What's the JSON output?
::
<details>
<summary>Answer</summary>

```json
{"a":0}
```

- `A` → `"a":0` — no `omitempty`, always included.
- `B` → omitted — `omitempty` + zero value (`""`).
- `C` → omitted — `omitempty` + nil pointer.

So only `A` appears.

If you wanted to include `B` even when empty, remove `omitempty`. If you wanted to include `C` with a value, set `C` to a non-nil pointer: `c := 0; t.C = &c` → `"c":0`.

</details>

## 📚 What's Next

→ [24 — Time & Dates](/go/24-time-and-dates) — monotonic clock, the reference time format, time zones, and the `==` vs `Equal` trap.