---
title: "12 — Interfaces"
description: "Interface internals (type, value pair), the nil interface trap, implicit satisfaction, consumer-side interface definition, and the accept-interfaces-return-structs idiom."
---

# 12 — Interfaces

## Interface Internals — The (Type, Value) Pair

::code-wrapper{language="go"}
```go
// An interface value is a 2-word header:
//   ┌──────────┬──────────┐
//   │ type     │ value    │
//   │ 8 bytes  │ 8 bytes  │
//   └──────────┴──────────┘
//
// type:  pointer to the interface's dynamic type metadata (itable)
// value: pointer to the concrete data (or the data itself if ≤ 1 word)
//
// The itable maps the interface's methods to the concrete type's methods.
// Method dispatch goes: interface method → itable → concrete method.
// This is a single indirection — fast, but not as fast as a direct call.

type Speaker interface{ Speak() string }

type Dog struct{ Name string }
func (d Dog) Speak() string { return d.Name + " barks" }

func internals() {
	var s Speaker
	s = Dog{Name: "Rex"}  // s holds (Dog, Dog{Name: "Rex"})
	// type = Dog, value = Dog{Name: "Rex"} (stored inline if ≤ 1 word,
	//   or a pointer to heap if larger)
	fmt.Println(s.Speak())  // dispatches via itable → Dog.Speak
}
```

## Implicit Satisfaction — No `implements` Keyword

::code-wrapper{language="go"}
```go
// Go interfaces are satisfied IMPLICITLY — the type doesn't declare
// "I implement Speaker." The compiler checks that all methods exist.
//
// This enables:
//   1. Decoupling: a type can satisfy an interface defined elsewhere
//   2. Retroactive: define an interface AFTER types exist
//   3. No import cycles: the interface and the type don't need to know
//      about each other

// Define the interface (consumer-side):
type Stringer interface {
	String() string
}

// A type defined elsewhere satisfies it automatically:
type Celsius float64
func (c Celsius) String() string { return fmt.Sprintf("%.1f°C", c) }

// Celsius satisfies Stringer — no declaration of intent needed.
// You can even define an interface for a type in the STD LIBRARY:
//   type ReadCloser interface { io.Reader; io.Close() }
//   — satisfied by *os.File, *bufio.Reader (if it has Close), etc.

// ─── Compile-time check (the idiom) ───
var _ Stringer = Celsius(0)  // compile error if Celsius doesn't satisfy Stringer
// This asserts satisfaction at compile time — catches breakage when a
// method is removed or the interface changes. Common in library code.
```

## The Nil Interface Trap — The #1 Go Gotcha

::code-wrapper{language="go"}
```go
// An interface is nil ONLY when BOTH type and value are nil.
// Wrapping a nil pointer in an interface makes the interface NON-NIL.

type Logger interface{ Log(string) }

type nullLogger struct{}
func (n *nullLogger) Log(string) {}

func getLogger(enabled bool) Logger {
	var l *nullLogger = nil  // nil pointer
	if enabled {
		l = &nullLogger{}
	}
	return l  // ❌ returns (type=*nullLogger, value=nil) — NON-NIL interface!
}

func nilTrap() {
	l := getLogger(false)
	fmt.Println(l == nil)  // false! The interface has a type, so it's non-nil.
	// l.Log("hello")      // panics: nil pointer dereference (the value is nil)
}

// ✅ CORRECT: return nil directly for a nil interface:
func getLoggerFixed(enabled bool) Logger {
	if !enabled {
		return nil  // returns a true nil interface (type=nil, value=nil)
	}
	return &nullLogger{}
}

func fixedDemo() {
	l := getLoggerFixed(false)
	fmt.Println(l == nil)  // true
}

// ┌──────────────────────────────────────────────────────────────────────┐
// │ nil interface    │ (type=nil, value=nil) │ == nil → true             │
// │ non-nil wrapping │ (type=*T,  value=nil) │ == nil → FALSE (the trap) │
// │ Calling a method │ panics (nil pointer dereference)                  │
// └──────────────────────────────────────────────────────────────────────┘
```

## Consumer-Side Interface Definition

::code-wrapper{language="go"}
```go
// Go idiom: define interfaces where they're USED (consumer-side), not
// where types are DEFINED (producer-side).
//
// Why: the consumer knows what it needs. The producer shouldn't force
// every type to implement a giant interface "just in case."
//
// "The bigger the interface, the weaker the abstraction." — Rob Pike

// ❌ ANTI-PATTERN: producer-side giant interface
// package storage
// type Storage interface {
//     Get(ctx, key) (val, error)
//     Set(ctx, key, val) error
//     Delete(ctx, key) error
//     List(ctx, prefix) ([]string, error)
//     BatchGet(ctx, keys) (map[string]string, error)
//     Watch(ctx, key) (<-chan Event, error)
//     // ... 20 more methods
// }
// Every storage backend must implement ALL of these.

// ✅ CORRECT: consumer-side small interfaces
package cache

// The cache only needs Get and Set — define the minimal interface:
type Storage interface {
	Get(ctx context.Context, key string) (string, error)
	Set(ctx context.Context, key, val string) error
}

type Cache struct {
	storage Storage  // accepts ANY type with Get and Set
}

func (c *Cache) GetOrSet(ctx context.Context, key string, load func() (string, error)) (string, error) {
	val, err := c.storage.Get(ctx, key)
	if err == nil {
		return val, nil
	}
	val, err = load()
	if err != nil {
		return "", err
	}
	_ = c.storage.Set(ctx, key, val)
	return val, nil
}

// Now ANY storage backend (Redis, Memcached, Postgres, in-memory) that
// has Get and Set works with Cache — even types defined AFTER Cache.
```

## Accept Interfaces, Return Structs

::code-wrapper{language="go"}
```go
// Go idiom: functions ACCEPT interface types (flexible, mockable) but
// RETURN concrete types (clear, inspectable).
//
// Accepting an interface lets callers pass any implementation.
// Returning a concrete type gives callers full access to the result.

// ✅ Accept interface, return concrete:
func process(r io.Reader) *Result {  // accepts any Reader
	data, _ := io.ReadAll(r)
	return &Result{data: data}  // returns *Result (concrete, inspectable)
}

// ❌ ANTI-PATTERN: return an interface (forces callers to type-assert)
func processBad(r io.Reader) Resulter {  // returns an interface
	return &Result{data: data}
}
// Caller must type-assert to use Result's fields:
//   r := processBad(reader)
//   if res, ok := r.(*Result); ok { ... }  // awkward, loses type safety

// ❌ ANTI-PATTERN: accept concrete (inflexible, hard to test)
func processBad2(f *os.File) *Result {  // only accepts *os.File
	// Can't pass a bytes.Reader, a network connection, a test mock.
	// Unit testing requires a real file — painful.
}
```

## Interface Composition

::code-wrapper{language="go"}
```go
// Interfaces compose by embedding other interfaces:
type ReadWriter interface {
	io.Reader   // embeds Read(p []byte) (int, error)
	io.Writer   // embeds Write(p []byte) (int, error)
}

type ReadWriteCloser interface {
	io.Reader
	io.Writer
	io.Closer
}

// The standard library uses this heavily:
//   io.ReadWriter      = Reader + Writer
//   io.ReadWriteCloser = Reader + Writer + Closer
//   io.ReadWriteSeeker = Reader + Writer + Seeker

// Small interfaces compose into larger ones. This is how Go avoids
// giant interfaces — compose the minimal pieces.
```

## The Empty Interface `any` (Go 1.18+)

::code-wrapper{language="go"}
```go
// `any` is an alias for `interface{}` (Go 1.18+). Every type satisfies it.
// It's the escape hatch for "I don't know the type" — but loses type safety.

func anyDemo() {
	var x any
	x = 42
	x = "hello"
	x = []int{1, 2, 3}

	// To use the value, you MUST type-assert:
	switch v := x.(type) {
	case int:
		fmt.Println("int:", v)
	case string:
		fmt.Println("string:", v)
	default:
		fmt.Printf("unknown: %T\n", v)
	}
}

// ⚠️ Avoid `any` when a specific interface works:
// ❌ func process(data any)  — caller can pass anything, you must assert
// ✅ func process(r io.Reader)  — caller must pass something readable

// Legitimate uses of `any`:
//   - fmt.Println(...any)  — printing any value (introspection)
//   - json.Marshal(any)    — encoding arbitrary JSON
//   - reflect package      — runtime type inspection
//   - Generic containers that truly hold anything (rare)
```

## Production Pattern — Interface for Testability

::code-wrapper{language="go"}
```go
// ─── Define interfaces for external dependencies to enable mocking ───

// internal/store/store.go
type UserStore interface {
	GetUser(ctx context.Context, id int64) (*User, error)
	SaveUser(ctx context.Context, u *User) error
}

// internal/store/postgres.go (production implementation)
type PostgresStore struct {
	db *sql.DB
}
func (s *PostgresStore) GetUser(ctx context.Context, id int64) (*User, error) {
	// real DB query
	return &User{}, nil
}
func (s *PostgresStore) SaveUser(ctx context.Context, u *User) error {
	// real DB insert
	return nil
}

// internal/service/user_service.go (uses the interface, not the concrete type)
type UserService struct {
	store UserStore  // accepts any UserStore — PostgresStore in prod, MockStore in tests
}

func (s *UserService) GetProfile(ctx context.Context, id int64) (*User, error) {
	return s.store.GetUser(ctx, id)  // testable with a mock
}

// internal/service/user_service_test.go
type MockUserStore struct {
	users map[int64]*User
}
func (m *MockUserStore) GetUser(ctx context.Context, id int64) (*User, error) {
	if u, ok := m.users[id]; ok {
		return u, nil
	}
	return nil, errors.New("not found")
}
func (m *MockUserStore) SaveUser(ctx context.Context, u *User) error {
	m.users[u.ID] = u
	return nil
}

func TestGetProfile(t *testing.T) {
	svc := &UserService{store: &MockUserStore{users: map[int64]*User{1: {ID: 1, Name: "Alice"}}}}
	u, err := svc.GetProfile(context.Background(), 1)
	if err != nil { t.Fatal(err) }
	if u.Name != "Alice" { t.Errorf("expected Alice, got %s", u.Name) }
}
```

## 💡 Tips & Tricks

- **Idiom**: define interfaces where they're USED (consumer-side), not where types are defined — a function that needs `io.Reader` should declare it locally, not require types to implement a "Readable" interface in their package. Small, consumer-defined interfaces keep code decoupled.
- **Idiom**: keep interfaces small (1-3 methods) — "the bigger the interface, the weaker the abstraction." `io.Reader` (one method) is satisfied by hundreds of types; a 20-method interface is satisfied by one. Compose small interfaces.
- **Idiom**: accept interfaces, return concrete types — functions take interface parameters (flexible, mockable) but return concrete types (clear, inspectable). Returning an interface forces callers into type assertions.
- **Idiom**: `var _ I = T{}` as a compile-time assertion — catches breakage when a method is removed from `T` or added to `I`, at compile time. Common in library code.
- **Debug**: the nil-interface trap — `var s Speaker = (*Dog)(nil); s == nil` is `false`. To return a nil interface, return `nil` directly, not a nil pointer of a concrete type. This is the #1 interface bug.
- **Idiom**: use interfaces for external dependencies (database, HTTP client, email sender) to enable testing with mocks — define the minimal interface the consumer needs, not the full API of the dependency.

## ⚠️ Edge Cases & Gotchas

- **The nil interface trap**: `var s Speaker = (*Dog)(nil); s == nil` is `false` — the interface has a type (`*Dog`), so it's non-nil. Calling a method panics. Return `nil` directly for a nil interface.
- **Interfaces satisfied by method set**: a value type satisfies only value-receiver methods; a pointer type satisfies all methods. `var s Speaker = T{}` fails if `Speaker` requires a pointer-receiver method — use `&T{}`.
- **Interface comparison**: interfaces are comparable with `==` if their dynamic types are comparable. Comparing interfaces holding slices/maps/functions panics at runtime.
- **`any` loses type safety**: you must type-assert to use the value. Prefer specific interfaces; reserve `any` for genuine "any value" cases (`fmt`, `json`).
- **Interface values are immutable**: the interface holds a (type, value) pair; you can reassign the interface variable, but can't mutate the held value through the interface (unless the method mutates via a pointer).
- **Embedding an interface in a struct**: `type S struct { io.Reader }` — `S` has a `Reader` field (an interface); `S` satisfies `io.Reader` via promotion. Useful for decorating/delegating.
- **Nil pointer receiver method call**: `var p *Dog; p.Speak()` — if `Speak` has a value receiver, Go can't dereference `p` (nil) → panic. If `Speak` has a pointer receiver, it CAN be called on nil `*Dog` (the method can check `p == nil`).
- **Interface boxing causes escape**: `var i any = x` moves `x` to the heap. In hot paths, avoid passing values through `any` — use concrete types to keep them on the stack.

## 🧠 Quick Quiz

::code-wrapper{language="go"}
```go
type MyErr struct{}
func (m *MyErr) Error() string { return "my error" }

func doSomething(fail bool) error {
	if fail {
		var err *MyErr = nil
		return err
	}
	return nil
}

func main() {
	err := doSomething(true)
	fmt.Println(err == nil)
}
```

What's printed?
::
<details>
<summary>Answer</summary>

```
false
```

`doSomething(true)` returns `err` where `err` is a nil `*MyErr`. But the return type is `error` (an interface). Returning a nil `*MyErr` into an `error` interface creates a non-nil interface with type `*MyErr` and value `nil`. So `err == nil` is `false`.

This is the nil-interface trap applied to error returns. Calling `err.Error()` would panic (nil pointer dereference).

The fix — return `nil` directly:

```go
func doSomething(fail bool) error {
	if fail {
		return &MyErr{}  // return a real error
		// or: return nil  // if you meant "no error"
	}
	return nil
}
```

If you need to return a nil error explicitly, return `nil` (not a nil pointer of a concrete error type).

</details>

## 📚 What's Next

→ [13 — Type Assertions & Type Switches](/go/13-type-assertions-and-switches) — comma-ok assertions, type switch dispatch, interface-to-interface assertions, and JSON's float64 trap.