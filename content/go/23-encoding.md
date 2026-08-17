# 23 — Encoding: JSON, CSV, gob

Go's `encoding/` packages handle serialization. `encoding/json` is the most-used — Go's struct tags make JSON mapping declarative.

## JSON Marshaling

::code-wrapper{language="go"}
```go
type User struct {
	ID       int    `json:"id"`
	Username string `json:"username"`
	Email    string `json:"email,omitempty"`
	Password string `json:"-"`           // never serialized
	Age      int    `json:"age,omitempty"`
}

u := User{ID: 1, Username: "alice", Password: "secret"}
data, err := json.Marshal(u)
// {"id":1,"username":"alice","email":"","age":0}
// (password excluded, email and age included because... see omitempty)

data, err := json.MarshalIndent(u, "", "  ")   // pretty-printed
```
::

### Struct tags

- `json:"name"` — serialize as `"name"`.
- `json:"name,omitempty"` — omit if the field is the zero value (`0`, `""`, `false`, `nil`, empty slice/map).
- `json:"-"` — never serialize.
- `json:",omitempty"` — use the field name, omit if zero.
- No tag — use the Go field name (PascalCase, which is unusual in JSON).

### `omitempty` and zero values

`omitempty` omits zero values, but this can be ambiguous — `0` (a real age of 0) and `""` (a real empty string) are omitted along with "not set." For fields where zero is a valid value, use a pointer (`*int`) — `nil` (omitted) vs `0` (included):

::code-wrapper{language="go"}
```go
type User struct {
	Age *int `json:"age,omitempty"`   // nil → omitted, 0 → "age":0
}
``
::

## JSON Unmarshaling

::code-wrapper{language="go"}
```go
var u User
err := json.Unmarshal([]byte(`{"id":1,"username":"alice"}`), &u)
// u.ID = 1, u.Username = "alice", other fields = zero values
``
::

- Unmarshal into a struct (typed) or `map[string]interface{}`/`any` (dynamic).
- Unknown JSON fields are **ignored** by default (no error).
- Use `json.Decoder` for streaming (from an `io.Reader`).

### `json.Decoder` (streaming)

::code-wrapper{language="go"}
```go
dec := json.NewDecoder(r)
for {
	var v MyType
	if err := dec.Decode(&v); err == io.EOF {
		break
	} else if err != nil {
		return err
	}
	process(v)
}

// Disallow unknown fields (strict)
dec := json.NewDecoder(r)
dec.DisallowUnknownFields()
``
::

`Decoder` reads from a stream (e.g., an HTTP body) and decodes one value at a time — efficient for large/streamed JSON.

## JSON and `interface{}`

::code-wrapper{language="go"}
```go
var v any
json.Unmarshal([]byte(`{"a": 1, "b": [2, 3]}`), &v)
// v is map[string]interface{}{"a": float64(1), "b": []interface{}{float64(2), float64(3)}}
// Numbers are float64! See chapter 13.
``
::

Decoding into `any` gives `map[string]any` for objects, `[]any` for arrays, `float64` for numbers, `string` for strings, `bool` for booleans, `nil` for null. Type-assert to use. Prefer typed structs for known schemas.

### `json.Number` (preserve number precision)

::code-wrapper{language="go"}
```go
dec := json.NewDecoder(r)
dec.UseNumber()
var v any
dec.Decode(&v)
n, _ := v.(json.Number).Int64()   // exact integer, not float64
``
::

`UseNumber` decodes numbers as `json.Number` (a string-backed type) instead of `float64`, preserving precision for large integers.

## Custom Marshaling (`MarshalJSON`/`UnmarshalJSON`)

::code-wrapper{language="go"}
```go
type Time struct{ time.Time }

func (t Time) MarshalJSON() ([]byte, error) {
	return []byte(t.Time.Format(`"2006-01-02"`)), nil
}

func (t *Time) UnmarshalJSON(data []byte) error {
	var s string
	if err := json.Unmarshal(data, &s); err != nil {
		return err
	}
	parsed, err := time.Parse("2006-01-02", s)
	if err != nil {
		return err
	}
	t.Time = parsed
	return nil
}
```
::

Implement `json.Marshaler`/`json.Unmarshaler` for custom serialization (dates, enums, encrypted fields).

## CSV

::code-wrapper{language="go"}
```go
// Write
w := csv.NewWriter(os.Stdout)
w.Write([]string{"name", "age", "city"})
w.Write([]string{"Alice", "30", "NYC"})
w.Flush()   // flush buffered data
if err := w.Error(); err != nil {
	log.Fatal(err)
}

// Read
r := csv.NewReader(f)
records, err := r.ReadAll()   // or Read() in a loop
for _, row := range records {
	fmt.Println(row[0], row[1], row[2])
}

// Custom options
r.Comma = ';'           // default ','
r.Comment = '#'         // lines starting with '#' are comments
r.FieldsPerRecord = -1  // variable fields per record (default: error on mismatch)
``
::

## gob (Go binary encoding)

::code-wrapper{language="go"}
```go
// Encode
var buf bytes.Buffer
enc := gob.NewEncoder(&buf)
enc.Encode(User{ID: 1, Name: "Alice"})

// Decode
dec := gob.NewDecoder(&buf)
var u User
dec.Decode(&u)
``
::

`gob` is Go-specific binary encoding — faster and smaller than JSON, but only readable by Go. Use for Go-to-Go RPC/serialization (e.g., internal services). Not for cross-language APIs.

## 💡 Tips & Tricks

- **Idiom**: use struct tags (`json:"name,omitempty"`) for JSON mapping — declarative, and `go vet` checks tag syntax. Use `omitempty` for optional fields (omit zero values) and `json:"-"` for never-serialized fields (passwords, internal state).
- **Idiom**: use pointers (`*int`, `*string`) for fields where zero is a valid value that must be distinguished from "not set" — `omitempty` on an `int` omits `0` (which might be a real age); `omitempty` on `*int` omits `nil` (not set) but includes `0` (real value). This is the standard "nullable field" pattern.
- **Idiom**: use `json.Decoder` for streaming JSON from an `io.Reader` (HTTP body, file) — `json.Unmarshal` requires the whole input in memory; `Decoder.Decode` reads one value at a time. Use `DisallowUnknownFields` for strict input validation.
- **Idiom**: use `json.Number` + `UseNumber` when decoding into `any` and you need exact integers — default decoding makes all numbers `float64`, losing precision for large integers (> 2^53). `json.Number` keeps them as strings, parseable to `int64`/`float64`/`big.Int`.
- **Idiom**: implement `MarshalJSON`/`UnmarshalJSON` for custom serialization (dates as "YYYY-MM-DD", enums as strings, encrypted fields) — it's the escape hatch when struct tags aren't enough. Keep the custom format documented for API consumers.

## ⚠️ Edge Cases & Gotchas

- **`omitempty` omits zero values, including valid zeros**: `0`, `""`, `false`, `nil`, empty slice/map are all omitted. For "zero is valid," use a pointer.
- **Numbers in `any` are `float64`**: `json.Unmarshal` into `any` makes `42` a `float64` (not `int`). Type-asserting to `int` panics. Use `json.Number` or typed structs.
- **Unknown fields are ignored by default**: `Unmarshal` silently drops fields not in the struct. Use `DisallowUnknownFields` to catch typos/API mismatches.
- **`json.Marshal` of `nil` map/slice**: `nil` map → `null`; empty `[]int{}` → `[]`. For APIs expecting `[]` not `null`, initialize slices: `s := []int{}`.
- **`time.Time` JSON**: `time.Time` marshals as an RFC 3339 string (`"2024-03-15T14:30:00Z"`). Custom formats require a custom type with `MarshalJSON`.
- **Unexported fields aren't serialized**: `json.Marshal` only sees exported fields. Unexported fields are silently ignored (no error).
- **`interface{}` field and concrete types**: a struct field of type `any` can hold any JSON value, but the type is lost — type-assert on use.
- **Circular references**: `json.Marshal` doesn't handle cycles (infinite loop). Avoid cycles in structs you serialize.
- **CSV quoting**: `csv` handles quoting/escaping automatically. `a,b"c,"` → `"a","b""c"",""` (RFC 4180). Don't quote manually.
- **`gob` requires registration for interfaces**: encoding an interface value requires the concrete type to be registered (`gob.Register(MyType{})`) for decoding to work. Without it, decoding fails.

## 🧠 Spot the Bug

A developer decodes JSON into `any` and checks for an integer:

::code-wrapper{language="go"}
```go
var v any
json.Unmarshal([]byte(`{"count": 42}`), &v)
m := v.(map[string]any)
if count, ok := m["count"].(int); ok {   // ❌ never true
	fmt.Println("count:", count)
}
```
::

What's wrong?

<details>
<summary>Answer</summary>

`json.Unmarshal` into `any` decodes JSON numbers as `float64`, not `int`. So `m["count"]` is `float64(42)`, and `m["count"].(int)` fails (`ok` is false) — the type assertion to `int` never matches.

The fixes:

```go
// Option 1: assert to float64, convert to int
if count, ok := m["count"].(float64); ok {
	fmt.Println("count:", int(count))
}

// Option 2: use json.Number for exact types
dec := json.NewDecoder(bytes.NewReader([]byte(`{"count": 42}`)))
dec.UseNumber()
var v any
dec.Decode(&v)
m := v.(map[string]any)
if n, ok := m["count"].(json.Number); ok {
	count, _ := n.Int64()
	fmt.Println("count:", count)
}

// Option 3: unmarshal into a typed struct (best for known schemas)
type Data struct{ Count int }
var d Data
json.Unmarshal([]byte(`{"count": 42}`), &d)
fmt.Println("count:", d.Count)   // 42
```
::
Option 3 (typed struct) is the idiomatic way for known schemas — it avoids the `any`/type-assertion dance entirely and gives exact types. Use `any` only for dynamic/unknown schemas, and then prefer `json.Number`.

**The lesson**: `json.Unmarshal` into `any` makes numbers `float64`. Asserting to `int` fails. Assert to `float64` and convert, use `json.Number`, or unmarshal into a struct.

</details>

## Summary

You can now marshal/unmarshal JSON with struct tags (`omitempty`, `-`), use pointers for nullable fields, stream with `Decoder`, handle `any`/`json.Number` for dynamic JSON, implement custom `MarshalJSON`/`UnmarshalJSON`, and use `csv`/`gob` for other formats. Next: time and dates.