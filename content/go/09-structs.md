---
title: "09 — Structs"
description: "Field layout and alignment, embedding as composition, struct tags for serialization, the zero-value-is-useful idiom, and the empty struct set pattern."
---

# 09 — Structs

## Field Layout and Memory Alignment

::code-wrapper{language="go"}
```go
// The Go compiler lays out struct fields in declaration order, adding
// PADDING for alignment. The field order affects memory usage.

// ┌─────────────────────────────────────────────────────────────────┐
// │ struct { a bool; b int64; c bool }                             │
// │   a (1 byte) + 7 padding + b (8 bytes) + c (1 byte) + 7 pad = 24 │
// │                                                                 │
// │ struct { b int64; a bool; c bool }                             │
// │   b (8 bytes) + a (1 byte) + c (1 byte) + 6 padding = 16        │
// │                                                                 │
// │ Reordering fields from largest to smallest eliminates padding. │
// │ The `fieldalignment` linter (go vet -vettool) detects this.     │
// └─────────────────────────────────────────────────────────────────┘

// ❌ Poorly aligned — 24 bytes (8 bytes wasted as padding):
type Bad struct {
	a bool    // 1 byte + 7 padding
	b int64   // 8 bytes
	c bool    // 1 byte + 7 padding
}

// ✅ Well aligned — 16 bytes (fields ordered by size):
type Good struct {
	b int64   // 8 bytes
	a bool    // 1 byte
	c bool    // 1 byte
	// 6 bytes padding (to align to 8-byte boundary)
}

// Check alignment in practice:
// go install golang.org/x/tools/go/analysis/passes/fieldalignment/cmd/fieldalignment@latest
// fieldalignment -fix ./...
```

## Struct Literals — Named vs Positional

::code-wrapper{language="go"}
```go
type User struct {
	ID       int64
	Name     string
	Email    string
	IsActive bool
}

// ✅ Named fields — order-independent, survives field additions:
u := User{
	ID:       1,
	Name:     "Alice",
	Email:    "alice@example.com",
	IsActive: true,
}

// ❌ Positional — fragile: adding a field breaks ALL literals:
// u := User{1, "Alice", "alice@example.com", true}

// ✅ Partial — omitted fields get their zero value:
u2 := User{Name: "Bob"}  // ID=0, Email="", IsActive=false

// ✅ Zero value — all fields zero:
var u3 User  // User{ID:0, Name:"", Email:"", IsActive:false}
```

## Embedding — Composition, Not Inheritance

::code-wrapper{language="go"}
```go
// Go has NO inheritance. Embedding is COMPOSITION with method promotion.
// The embedded type's fields and methods are "promoted" to the outer struct.

type Repository struct {
	db *sql.DB
}

func (r *Repository) Save(ctx context.Context, entity any) error {
	return r.db.QueryRowContext(ctx, "INSERT ...", entity).Err()
}

func (r *Repository) FindByID(ctx context.Context, id int64) (any, error) {
	return nil, nil
}

// Embed Repository — UserService gets Save and FindByID promoted:
type UserService struct {
	*Repository          // embedded POINTER — must be initialized
	cache     redis.Cache
}

// UserService can override (shadow) promoted methods:
func (s *UserService) FindByID(ctx context.Context, id int64) (any, error) {
	// Check cache first, fall back to repo:
	if v, ok := s.cache.Get(ctx, fmt.Sprintf("user:%d", id)); ok {
		return v, nil
	}
	return s.Repository.FindByID(ctx, id)  // explicit access to the embedded method
}

// Usage:
func newUserService(db *sql.DB, cache redis.Cache) *UserService {
	return &UserService{
		Repository: &Repository{db: db},  // must initialize embedded pointer
		cache:      cache,
	}
}
```

### Embedding an interface — the decorator pattern

::code-wrapper{language="go"}
```go
// Embedding an interface lets you wrap/decorate any implementation:
type Logger interface {
	Log(msg string)
}

type LoggingService struct {
	Logger               // embedded interface — accepts any Logger
	inner Service
}

func (l *LoggingService) DoWork(ctx context.Context) error {
	l.Log("starting work")
	err := l.inner.DoWork(ctx)
	if err != nil {
		l.Log(fmt.Sprintf("work failed: %v", err))
	}
	return err
}

// Usage — inject any Logger:
svc := &LoggingService{
	Logger: log.New(os.Stderr, "", 0),
	inner:  realService{},
}
```

### The embedding ambiguity trap

::code-wrapper{language="go"}
```go
type A struct{ X int }
type B struct{ X int }

// ❌ Ambiguous — which X is promoted?
type C struct {
	A
	B
}
// c.X   // compile error: ambiguous selector c.X
// c.A.X // ok — explicit disambiguation
// c.B.X // ok

// This is the "diamond" problem — Go handles it by requiring explicit
// disambiguation. There's no virtual inheritance to resolve it automatically.
```

## Struct Tags — Serialization Metadata

::code-wrapper{language="go"}
```go
// Tags are raw strings read by reflection (encoding/json, database/sql, etc.)
// Format: `key:"value" key2:"value2"` (space-separated, double-quoted)

type User struct {
	// JSON tags:
	ID       int64  `json:"id"`                          // serialize as "id"
	Name     string `json:"name" validate:"required"`    // multiple tags
	Email    string `json:"email,omitempty"`             // omit if zero value
	Password string `json:"-"`                           // never serialize
	Age      int    `json:"age,string"`                  // serialize as string "25"

	// DB tags:
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

// ─── JSON tag options ───
//   json:"name"            — field name in JSON
//   json:"name,omitempty"  — omit if zero value (0, "", false, nil)
//   json:"-"               — never serialize
//   json:"-,omitempty"      — field literally named "-" (edge case)
//   json:"name,string"      — serialize as a JSON string ("42" not 42)
//   json:"name,omitempty,omitempty"  — last wins (just omitempty)

// ─── Validation tags (go-playground/validator) ───
//   validate:"required"        — must be non-zero
//   validate:"min=1,max=100"  — numeric range
//   validate:"email"          — must be a valid email
//   validate:"oneof=active inactive suspended"

// go vet checks json tag syntax:
//   go vet ./...
//   // "struct field tag X not compatible with reflect.StructTag.Get"
```

## The Zero-Value-Is-Useful Idiom

::code-wrapper{language="go"}
```go
// Go idiom: design structs so the zero value is immediately usable.
// This eliminates the need for constructors in the common case.

// ✅ Standard library examples:
//   sync.Mutex{}     — zero value is an unlocked mutex, ready to use
//   bytes.Buffer{}   — zero value is an empty buffer, ready to use
//   http.Server{}    — zero value is a server with sensible defaults

type Counter struct {
	mu    sync.Mutex
	count int
}

// Zero value is a usable counter (unlocked, count=0):
var c Counter
c.Inc()
fmt.Println(c.Value())  // 1

func (c *Counter) Inc() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.count++
}

func (c *Counter) Value() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.count
}

// ❌ ANTI-PATTERN: struct where zero value panics:
type BadConfig struct {
	dsn string  // zero value is "" → sql.Open("", "") panics
}
// User writes `var cfg BadConfig; db, _ := sql.Open(cfg.dsn)` → runtime panic

// ✅ Fix: provide a constructor for required fields:
func NewConfig(dsn string) *Config {
	return &Config{dsn: dsn, timeout: 30 * time.Second}
}
```

## Empty Struct — The Zero-Byte Type

::code-wrapper{language="go"}
```go
// struct{} occupies 0 bytes. Use as a set value or a signal channel.

// ─── Set implementation (map[string]struct{} is Go's set) ───
type Set[T comparable] struct {
	m map[T]struct{}
}

func NewSet[T comparable]() *Set[T] {
	return &Set[T]{m: make(map[T]struct{})}
}

func (s *Set[T]) Add(v T) {
	s.m[v] = struct{}{}  // struct{}{} is the zero-byte value
}

func (s *Set[T]) Contains(v T) bool {
	_, ok := s.m[v]
	return ok
}

func (s *Set[T]) Remove(v T) {
	delete(s.m, v)
}

func (s *Set[T]) Len() int {
	return len(s.m)
}

// ─── Signal channel (chan struct{} carries no data, zero-size) ───
done := make(chan struct{})
go func() {
	// work
	close(done)  // signal completion — all receivers unblock
}()
<-done  // wait for completion

// ┌───────────────────────────────────────────────┐
// │ Why struct{} is 0 bytes:                      │
// │  It has no fields, so no data to store.       │
// │  The compiler knows it's zero-width, so       │
// │  all struct{}{} values share the same         │
// │  address (or no address at all).              │
// │  This makes map[T]struct{} more memory-      │
// │  efficient than map[T]bool (bool is 1 byte). │
// └───────────────────────────────────────────────┘
```

## Struct Comparison and `reflect.DeepEqual`

::code-wrapper{language="go"}
```go
// Structs are comparable with == ONLY if all fields are comparable.
// Slices, maps, and functions are NOT comparable — a struct containing
// them can't use ==.

type Point struct{ X, Y int }
p1 := Point{1, 2}
p2 := Point{1, 2}
fmt.Println(p1 == p2)  // true — all fields comparable

type WithSlice struct {
	Name string
	Tags []string  // slice — not comparable
}
// w1 == w2  // compile error: struct containing []string cannot be compared

// ✅ Use reflect.DeepEqual for structs with non-comparable fields:
import "reflect"
w1 := WithSlice{Name: "a", Tags: []string{"x"}}
w2 := WithSlice{Name: "a", Tags: []string{"x"}}
fmt.Println(reflect.DeepEqual(w1, w2))  // true

// ⚠️ reflect.DeepEqual is slow (reflection + recursion). For hot paths,
// implement a custom Equals method:
func (w WithSlice) Equals(other WithSlice) bool {
	if w.Name != other.Name { return false }
	return slices.Equal(w.Tags, other.Tags)
}

// Comparable structs can be MAP KEYS:
m := map[Point]string{{0, 0}: "origin", {1, 1}: "diagonal"}
```

## 💡 Tips & Tricks

- **Performance**: order struct fields from largest to smallest (int64 before bool) to minimize padding. Use the `fieldalignment` linter to detect wasted space. For hot-path structs (one per request), saving 8-16 bytes × millions of requests = significant memory.
- **Idiom**: design zero values to be usable (`sync.Mutex{}`, `bytes.Buffer{}`, `Counter{}`) — eliminates constructor boilerplate. Reserve constructors for required fields that have no sensible zero value (DSN, API keys).
- **Idiom**: use named-field literals (`User{ID: 1, Name: "Alice"}`) — they're robust to field additions and self-documenting. Positional literals break silently when a field is inserted in the middle.
- **Idiom**: embed interfaces for decoration (`type LoggingService struct { Logger; inner Service }`) — the embedded interface promotes its methods, letting the outer struct delegate or wrap.
- **Idiom**: use `struct{}` as the map value for sets — `map[string]struct{}` uses 0 bytes per entry (vs 1 byte for `bool`). For large sets, this saves meaningful memory.
- **Safety**: `reflect.DeepEqual` is slow and can be surprising (it compares unexported fields too). For production code, implement a custom `Equals` method using `slices.Equal` for slice fields.

## ⚠️ Edge Cases & Gotchas

- **Field order affects struct size**: padding between misaligned fields wastes memory. `struct{ a bool; b int64 }` = 16 bytes; `struct{ b int64; a bool }` = 12 bytes (with 4 trailing padding to align to 8). Use `fieldalignment` to optimize.
- **Embedding promotes fields AND methods**: `d.X` and `d.Speak()` both work. If the outer struct defines a method with the same name, it shadows (not overrides) — no virtual dispatch.
- **Embedding a pointer**: `type S struct { *T }` leaves the field as `nil` unless initialized. Promoted method calls on a nil embedded pointer panic. Initialize in the literal or constructor.
- **Ambiguous embedding**: embedding two types with the same field/method name → `c.X` is a compile error. Disambiguate with `c.A.X` / `c.B.X`.
- **Embedding is not inheritance**: a `Dog` embedding `Animal` is not an `Animal` for interface purposes. Embedding is composition; interfaces provide polymorphism.
- **Positional literals break on field insertion**: `Point{1, 2}` still compiles if you add `Z int` (it gets 0), but the intent is lost. Named literals survive.
- **Struct with non-comparable fields can't use `==`**: a struct with a slice/map/func field can't be compared with `==` (compile error). Use `reflect.DeepEqual` or a custom method.
- **`struct{}` is 0 bytes**: all `struct{}{}` values may share the same address. Don't take `&struct{}{}` and compare addresses — they may be equal even for "different" values.
- **Struct tags are raw strings**: the `json:"x" db:"y"` format is a convention. `go vet` checks `json` tag syntax but not custom tags. Malformed tags are silently ignored by the consuming package.
- **`omitempty` checks for zero value**: `json:"x,omitempty"` omits the field if it's 0, "", false, or nil. For a field where 0 is a valid value, `omitempty` will incorrectly omit it — use a `*int` (nil = omit, 0 = include).

## 🧠 Quick Quiz

::code-wrapper{language="go"}
```go
type S struct {
	A int64
	B bool
	C int64
	D bool
}
type T struct {
	A int64
	C int64
	B bool
	D bool
}
fmt.Println(unsafe.Sizeof(S{}), unsafe.Sizeof(T{}))
```

What's printed (on a 64-bit system)?
::
<details>
<summary>Answer</summary>

```
32 24
```

**`S`** (poorly ordered): A(8) + B(1) + 7 padding + C(8) + D(1) + 7 padding = 32 bytes

**`T`** (well ordered): A(8) + C(8) + B(1) + D(1) + 6 padding = 24 bytes

The same fields, different order, 8 bytes saved (25% smaller). For a struct allocated millions of times (one per request, one per row), this is significant — 8 bytes × 1M = 8MB saved.

This is why the `fieldalignment` linter exists — it detects and can auto-fix (`-fix`) field ordering.

</details>

## 📚 What's Next

→ [10 — Pointers](/go/10-pointers) — escape analysis, value vs pointer receivers, nil pointer semantics, and when pointers help vs hurt performance.