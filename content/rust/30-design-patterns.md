# 30 — Design Patterns & Idiomatic Rust

Design patterns in Rust are not a translation of the Gang of Four catalog into a new syntax — half of that catalog (Strategy, Visitor, Command) is trivially subsumed by traits and closures, and the other half (Singleton, most of the inheritance-based patterns) is actively hostile to how Rust's ownership model wants you to structure state. The patterns that survive and matter in Rust exist because they encode a compile-time guarantee — a builder that can't produce an invalid config, a typestate that can't call `publish()` before `review()`, an RAII wrapper that can't leak a handle — and the senior-level skill is recognizing *when the compile-time guarantee is worth the added ceremony*, not applying every pattern reflexively.

This chapter treats each pattern as an engineering trade-off with a specific failure mode it closes, a cost it imposes, and a point past which it stops paying for itself.

## Under-the-Hood Mechanics

### Builder — ceremony lives in the type system, costs nothing at runtime

::code-wrapper{language="rust"}
```rust
// Plain builder: zero-cost — each self -> Self is a move, usually inlined away.
pub struct ServerBuilder { host: Option<String>, port: Option<u16> }
impl ServerBuilder {
    pub fn host(mut self, h: impl Into<String>) -> Self { self.host = Some(h.into()); self }
    pub fn port(mut self, p: u16) -> Self { self.port = Some(p); self }
}
let s = ServerBuilder { host: None, port: None }.host("x").port(80);
```
::

::code-wrapper{language="rust"}
```rust
// Typestate builder: "which fields are set" becomes a distinct compiled TYPE,
// not a runtime flag — build() literally doesn't exist for the incomplete state.
pub struct MissingHost;
pub struct WithHost(String);
pub struct ServerBuilder<H> { host: H, port: Option<u16> }

impl ServerBuilder<MissingHost> {
    pub fn host(self, h: impl Into<String>) -> ServerBuilder<WithHost> {
        ServerBuilder { host: WithHost(h.into()), port: self.port }
    }
}
impl ServerBuilder<WithHost> {
    pub fn build(self) -> String { self.host.0 } // only callable once host is set
}
// ServerBuilder::<MissingHost> { .. }.build(); // COMPILE ERROR: no such method
```
::

### Typestate — each state is a monomorphized type, not a runtime tag

::code-wrapper{language="rust"}
```rust
use std::marker::PhantomData;
pub struct Draft; pub struct Reviewed; pub struct Published;
pub struct Article<S> { content: String, _state: PhantomData<S> }

impl Article<Draft> {
    fn review(self) -> Article<Reviewed> {
        Article { content: self.content, _state: PhantomData } // move, not mutation
    }
}
impl Article<Reviewed> {
    fn publish(self) -> Article<Published> {
        Article { content: self.content, _state: PhantomData }
    }
}
// Article::<Draft> { .. }.publish(); // COMPILE ERROR — no publish() on Article<Draft>
```
::

`Article<Draft>` and `Article<Reviewed>` are unrelated compiled types after monomorphization — no enum tag, nothing to branch on. Each transition consumes `self` and returns a new binding; a typestate machine can't be mutated in place through `&mut self`.

### RAII — `Drop` calls are compiled into every exit path, not scanned at runtime

::code-wrapper{language="rust"}
```rust
struct FileGuard(std::fs::File);
impl Drop for FileGuard {
    fn drop(&mut self) { println!("closing file"); } // runs on every exit
}

fn read_config() -> Result<String, std::io::Error> {
    let _guard = FileGuard(std::fs::File::open("cfg.toml")?);
    // normal return, early `?`, or panic unwind — drop() still runs.
    Ok(String::new())
}
```
::

No scanning, no GC pause — drop call sites are baked into the function's control-flow graph at compile time.

### `dyn Trait` collections — heterogeneity via one runtime indirection

::code-wrapper{language="rust"}
```rust
trait Command { fn execute(&self); }
struct Save; impl Command for Save { fn execute(&self) { println!("save"); } }
struct Rollback; impl Command for Rollback { fn execute(&self) { println!("rollback"); } }

// Vec<T> needs one concrete T — Vec<Box<dyn Command>> allows genuinely different types.
let commands: Vec<Box<dyn Command>> = vec![Box::new(Save), Box::new(Rollback)];
for c in &commands {
    c.execute(); // fat pointer {data_ptr, vtable_ptr}, one indirect call per invocation
}
```
::

### Extension traits — compiler-resolved injection, not monkey-patching

::code-wrapper{language="rust"}
```rust
// Orphan rule forbids `impl Display for str` directly — so define your own trait instead.
trait StrExt { fn shout(&self) -> String; }
impl StrExt for str {
    fn shout(&self) -> String { self.to_uppercase() + "!" }
}

fn demo() {
    println!("{}", "hi".shout()); // only resolves where `StrExt` is in scope (`use`d)
}
```
::

## Cost, Performance, and Trade-Offs

::code-wrapper{language="rust"}
```rust
// Builder: fine for 3-4 independent fields — skip the ceremony.
#[derive(Default)]
struct Config { retries: u32, timeout_ms: u32 }
let cfg = Config { retries: 3, ..Default::default() };

// Reach for typestate only once fields have a validity RELATIONSHIP
// (e.g. TLS requires a cert path) — otherwise it's boilerplate for nothing.
```
::

| Pattern | Runtime cost | Real cost paid elsewhere |
|---|---|---|
| Typestate builder | Zero | One `impl` block per state; N-state protocols get boilerplate-heavy |
| `Box<dyn Trait>` | 1 allocation + 1 vtable call per use | Lost inlining — shows as a flat, wide flamegraph, not an "allocation" line |
| RAII (`Drop`) | Direct, non-virtual call | Type can't also be `Copy` — sometimes forces an explicit `.clone()` |
| Extension trait | Zero at call site | Discoverability — invisible unless the trait is `use`d |
| `Cow<'a, T>` | One branch per access | Worth it only when "no transformation needed" is the common case |

## Production Failure Modes & Anti-Patterns

### Anti-pattern: the `Option<T>`-field builder deferring required-field errors to runtime, silently, for months

::code-wrapper{language="rust"}
```rust
// WRONG (for anything with a genuinely required field) — compiles and
// "works" for every call site that happens to remember to call .host()
pub struct ServerBuilder { host: Option<String>, port: Option<u16> }

impl ServerBuilder {
    pub fn build(self) -> Result<Server, String> {
        Ok(Server {
            host: self.host.ok_or("host required")?,
            port: self.port.unwrap_or(80),
        })
    }
}
```
::

Fine when every field has a sensible default. The incident generator is a `host` with **no** sensible default: `ServerBuilder::new().build()` compiles cleanly and only fails the first time it *runs* without `.host(...)` — possibly in a rarely-exercised fallback path, long after any test would have caught it.

::code-wrapper{language="rust"}
```rust
// RIGHT — typestate builder makes the missing-required-field case
// impossible to construct, not just impossible to construct *correctly*
pub struct MissingHost;
pub struct WithHost(String);

pub struct ServerBuilder<H> { host: H, port: Option<u16> }

impl ServerBuilder<MissingHost> {
    pub fn new() -> Self { ServerBuilder { host: MissingHost, port: None } }
    pub fn host(self, h: impl Into<String>) -> ServerBuilder<WithHost> {
        ServerBuilder { host: WithHost(h.into()), port: self.port }
    }
}
impl ServerBuilder<WithHost> {
    pub fn build(self) -> Server {
        Server { host: self.host.0, port: self.port.unwrap_or(80) }
    }
}
// ServerBuilder::<MissingHost>::new().build() — does not compile: no such method
```
::

No runtime path ships without `.host(...)` — there is no compiled code representing that possibility.

### Anti-pattern: `Deref`-based "inheritance" that silently changes method resolution

::code-wrapper{language="rust"}
```rust
struct Connection;
impl Connection { fn send(&self, msg: &[u8]) { /* raw send */ } }

struct RetryingConnection(Connection);
impl std::ops::Deref for RetryingConnection {
    type Target = Connection;
    fn deref(&self) -> &Connection { &self.0 }
}
// Today: retrying_conn.send(...) resolves through Deref to Connection::send.
```
::

::code-wrapper{language="rust"}
```rust
// Someone later adds retry logic under the SAME method name:
impl RetryingConnection {
    fn send(&self, msg: &[u8]) {
        /* retry logic */
        self.0.send(msg);
    }
}
// Every existing retrying_conn.send(...) call site now silently resolves
// to THIS inherent method instead of the old Deref-forwarded one —
// no warning, because inherent methods always win over Deref-forwarded ones.
```
::

**The fix**: reserve `Deref` for genuine smart-pointer semantics (`Box`, `Rc`, a newtype meant to be indistinguishable from its inner type). For composition with distinct behavior, use explicit delegation — collisions then surface as compiler errors, not silent redirection.

### Anti-pattern: a public field defeating a smart constructor's entire purpose

::code-wrapper{language="rust"}
```rust
// WRONG — pub field means Percent::new()'s validation is optional, not enforced.
pub struct Percent(pub u8);
impl Percent {
    pub fn new(p: u8) -> Option<Self> { if p <= 100 { Some(Percent(p)) } else { None } }
}

fn main() {
    assert!(Percent::new(150).is_none()); // validated path: rejects it
    let bypass = Percent(150);            // tuple-struct literal: bypasses validation entirely
    println!("{}", bypass.0);             // prints 150 — "impossible" value exists anyway
}
```
::

::code-wrapper{language="rust"}
```rust
// RIGHT — private field means new() is the ONLY way in.
pub struct Percent(u8);
impl Percent {
    pub fn new(p: u8) -> Option<Self> { if p <= 100 { Some(Percent(p)) } else { None } }
    pub fn get(&self) -> u8 { self.0 }
}
// Percent(150) from outside the module: COMPILE ERROR — field is private
```
::

### Anti-pattern: `Box<dyn Trait>` adopted by default in a hot dispatch path, never revisited

::code-wrapper{language="rust"}
```rust
// Started as flexible plugin architecture, never revisited as the service
// scaled into a genuine hot path (tens of thousands of req/sec).
trait Handler { fn handle(&self, req: &Request); }
fn route(handlers: &[Box<dyn Handler>], req: &Request) {
    for h in handlers { h.handle(req); } // vtable call, no inlining, per request
}
// Fix once the handler set is closed at compile time: enum or generic dispatch,
// trading runtime flexibility for full inlining — an architecture change, not a tuning knob.
```
::

## Architectural Application

::code-wrapper{language="rust"}
```rust
// Builder choice: severity of an invalid state decides the variant.
// CLI/internal config, cheap to get wrong -> plain builder + ok_or("required")?.
// Library boundary, expensive to get wrong (e.g. server accepts unencrypted
// connections by default) -> typestate builder.

// RAII as default for anything with a foreign lifecycle:
struct DbConn(std::net::TcpStream);
impl Drop for DbConn { fn drop(&mut self) { /* close cleanly, always */ } }
// No leaks, no double-frees, no use-after-close — compile-time property,
// not a code-review discipline everyone has to remember.

// Dependency injection via generic trait bound — compile-time-verified
// test/production separation, no runtime DI container needed:
trait Clock { fn now(&self) -> u64; }
struct Service<C: Clock> { clock: C }
```
::

Reserve `Box<dyn Trait>` for genuine architectural boundaries — plugin systems, config-driven middleware — and prefer generics/enums everywhere else, especially anything hot-path. Treat "abstract on the third occurrence, not the first" (the rule of three) as an enforceable team norm against premature `trait`/generic/`dyn` introduction.

## 💡 Tips & Tricks

- **Idiom**: prefer the typestate builder over the `Option<T>`-field builder once your type has fields whose validity depends on each other (e.g., "TLS requires a cert path") — the typestate version turns a runtime `build()` error into a compile-time impossibility.
- **Debug**: when a `Box<dyn Trait>`-heavy codebase feels sluggish, `cargo flamegraph` will show vtable-dispatched calls as regular (non-inlined) stack frames — a flat, wide flamegraph with many small frames is a common signature of over-using dynamic dispatch in hot paths.
- **Clippy**: `clippy::use_self` nudges constructors and impl methods to write `Self` instead of repeating the concrete type name — helps typestate/builder code stay renamable without touching every method body.
- **Idiom**: for the extension-trait pattern, name the trait `FooExt` (e.g., `StrExt`, `IteratorExt`) by convention — this signals "adds methods to an existing type" at a glance and avoids collisions with a plain `Foo` domain trait.
- **Performance**: the newtype pattern (`struct Meters(f64)`) is verified zero-cost — `#[repr(transparent)]` guarantees identical layout to the wrapped type, so passing `Meters` around costs nothing over passing `f64` directly.
- **Debug**: `cargo expand` on a `#[derive(Default)]` struct shows exactly what field defaults get filled in — handy for confirming assumptions before using `..Default::default()` in a builder-style struct update.

## ⚠️ Edge Cases & Gotchas

- **The `Option<T>`-field builder pattern defers required-field errors to runtime**: `ServerBuilder::new().build()` without calling `.host(...)` first compiles perfectly fine and only fails when `build()` runs — in a codebase with many optional call sites, a missing required field can ship to production before any test exercises that exact path.
- **`Deref`-based "inheritance" silently changes method resolution when both types define the same method name**: if `struct B(A)` implements `Deref<Target = A>` and you later add a method to `B` with the same name as one on `A`, Rust resolves to `B`'s inherent method first — a previously-working call that relied on `A`'s method now silently calls different logic, with no warning about the shadowing.
- **Trait objects behind `Box<dyn Trait>` lose the concrete type permanently**: there's no safe way to "downcast" a `Box<dyn Trait>` back to its original concrete type unless the trait explicitly bounds `Any` and you use `.downcast_ref::<T>()` — a design that stores heterogeneous `Box<dyn Trait>` values without planning for this can hit a wall when later code needs type-specific behavior.
- **Extension traits can't override existing inherent methods**: if the type you're extending already has a method with the same name (even in a different, unimported trait), the compiler prefers the inherent/already-in-scope method, and your extension trait's method becomes unreachable through normal dot-call syntax without fully-qualified syntax (`StrExt::shout(&s)`).
- **The orphan rule blocks more than people expect**: you cannot implement `std::fmt::Display` (foreign trait) for `Vec<i32>` (foreign type) even though both individually seem "close enough" to your crate — the newtype pattern (`struct Wrapper(Vec<i32>)`) is the standard, sometimes surprising, workaround.
- **Smart-constructor validation is bypassable via `..` struct update syntax if the field is `pub`**: `pub struct Percent(pub u8)` with a validating `Percent::new()` constructor still lets any caller write `Percent(200)` directly if the tuple field is public — the "smart constructor" pattern only enforces invariants if the inner field is private, which is easy to get wrong when adding `pub` for unrelated reasons (e.g., enabling pattern matching).
- **Platform-independent trap — dependency injection via generics monomorphizes per concrete type**: `Service<RealClock>` and `Service<MockClock>` are two entirely separate types after compilation, which means you cannot store both behind the same `Vec<Service<_>>` without erasing to `Box<dyn Clock>` first — a design that started fully generic for performance sometimes has to partially give that up the moment heterogeneous storage is needed.

## 🧠 Spot the Bug

What's wrong with this "smart constructor," and how can a caller bypass its invariant?

::code-wrapper{language="rust"}
```rust
pub struct Percent(pub u8);

impl Percent {
    pub fn new(p: u8) -> Option<Self> {
        if p <= 100 { Some(Percent(p)) } else { None }
    }
}

fn main() {
    let a = Percent::new(150);
    assert!(a.is_none());

    let b = Percent(150);
    println!("{}", b.0);
}
```
::

<details>
<summary>Answer</summary>

Prints `150` — a value the type was supposed to make impossible to construct.

`Percent::new` correctly validates the range and returns `None` for out-of-bounds input, but the tuple field is declared `pub u8`. Making the field public exposes the tuple struct's default constructor syntax, `Percent(150)`, as a completely separate, unchecked way to build the type — it bypasses `new()` entirely because Rust doesn't have a way to make *only* the validating path reachable while the field itself remains publicly constructible. The "smart constructor" pattern only works as an invariant-enforcing boundary when the field is **private** (`u8`, not `pub u8`); with a private field, the only way to build a `Percent` from outside the module is through `new()`, and only within the same module can code construct it directly (where you presumably already uphold the invariant).

**The lesson**: a smart constructor only enforces its invariant if the wrapped field is private — a public field on the same type is an unchecked backdoor around the validation.

</details>

## Summary

Rust's design patterns earn their place by encoding a runtime failure mode as a compile-time impossibility — a typestate builder that can't produce an incomplete config, an RAII wrapper that can't leak or double-free, a smart constructor whose privacy is what makes it a constructor at all rather than a suggestion. Each comes with a real cost: builder ceremony scales with field interdependence, `dyn Trait` trades inlining for heterogeneity and a smaller binary, `Deref`-based composition risks silent method-resolution shadowing. The senior-level judgment is choosing the pattern whose compile-time guarantee is worth its ceremony for a *specific* call site — not applying the full catalog reflexively, and not skipping RAII/typestate where the failure mode they close is genuinely expensive in production.

Next: Performance, profiling, and optimization — measuring whether these architectural choices actually cost what you think they do.
