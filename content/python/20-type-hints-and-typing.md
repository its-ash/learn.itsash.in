# 20 — Type Hints & Typing

## Why Type Hints Exist: Static Analysis, Not Runtime Enforcement

::code-wrapper{language="python"}
```python
def greet(name: str) -> str:
    return f"Hello, {name}!"

print(greet("Ada"))    # "Hello, Ada!"
print(greet(42))         # "Hello, 42!" — NO error at runtime! Python never checks the hint
```
::

This is the single most important fact about Python type hints: **they are pure documentation and static-analysis metadata, ignored entirely by the interpreter at runtime**. `greet(42)` runs without complaint because Python's runtime semantics haven't changed at all since before type hints existed (PEP 484, 2014) — the annotation `name: str` is stored in `greet.__annotations__` and nowhere else consulted. Catching `greet(42)` as an error requires running a separate static type checker (`mypy`, `pyright`) against the source *before* running it, exactly like a linter.

::code-wrapper{language="python"}
```python
print(greet.__annotations__)   # {'name': <class 'str'>, 'return': <class 'str'>}
```
::

## Basic Annotations: Variables, Parameters, Return Types

::code-wrapper{language="python"}
```python
age: int = 30
name: str = "Grace"
scores: list[int] = [95, 88, 76]          # built-in generics (3.9+) — no need to import List
lookup: dict[str, int] = {"a": 1, "b": 2}

def average(values: list[float]) -> float:
    return sum(values) / len(values)

def log(message: str, level: int = 1) -> None:   # -> None means "no meaningful return value"
    print(f"[{level}] {message}")
```
::

Before Python 3.9, generics required importing from `typing`: `List[int]`, `Dict[str, int]`, `Tuple[int, ...]`. These still work (and are required pre-3.9), but `list[int]`/`dict[str, int]` using the built-ins directly is the modern, preferred form.

::code-wrapper{language="python"}
```python
from typing import List, Dict, Tuple   # legacy pre-3.9 style — still valid, but prefer built-ins now

legacy_scores: List[int] = [1, 2, 3]
modern_scores: list[int] = [1, 2, 3]     # identical meaning, no import needed
```
::

## `Optional` and `Union`: Values That Can Be More Than One Type

::code-wrapper{language="python"}
```python
from typing import Optional, Union

def find_user(user_id: int) -> Optional[str]:      # Optional[str] means str | None
    return database.get(user_id)                      # returns None if not found

def parse_id(raw: Union[str, int]) -> int:           # accepts EITHER a str or an int
    return int(raw)

# Python 3.10+ pipe syntax — preferred, no import needed
def find_user_modern(user_id: int) -> str | None:
    return database.get(user_id)

def parse_id_modern(raw: str | int) -> int:
    return int(raw)
```
::

`Optional[X]` is exactly `Union[X, None]` — it is not a special "maybe present" wrapper type at runtime, just shorthand. **The gotcha**: `Optional[str]` does NOT mean the parameter has a default value of `None` — the two are independent, and forgetting the explicit `= None` default is a common mistake:

::code-wrapper{language="python"}
```python
# WRONG mental model — Optional[str] does NOT supply a default
def greet(name: Optional[str]) -> str:
    return f"Hello, {name or 'stranger'}"

greet()   # TypeError: missing 1 required positional argument — Optional didn't make it optional to PASS!

# CORRECT — the default is a separate, explicit declaration
def greet(name: Optional[str] = None) -> str:
    return f"Hello, {name or 'stranger'}"

greet()   # "Hello, stranger" — works, because of `= None`, not because of Optional
```
::

## Generics: `TypeVar` and Generic Classes/Functions

::code-wrapper{language="python"}
```python
from typing import TypeVar, Generic

T = TypeVar("T")

def first(items: list[T]) -> T:            # T is a placeholder — whatever type is passed in, comes back out
    return items[0]

reveal_result_int = first([1, 2, 3])         # mypy infers: int
reveal_result_str = first(["a", "b"])          # mypy infers: str

class Stack(Generic[T]):
    def __init__(self) -> None:
        self._items: list[T] = []

    def push(self, item: T) -> None:
        self._items.append(item)

    def pop(self) -> T:
        return self._items.pop()

int_stack: Stack[int] = Stack()
int_stack.push(5)
# int_stack.push("oops")   # mypy error: Argument has incompatible type "str"; expected "int"
```
::

Python 3.12 introduced a terser native syntax for generics that replaces `TypeVar` boilerplate entirely:

::code-wrapper{language="python"}
```python
# Python 3.12+ — no TypeVar import needed
def first(items: list[T]) -> T:
    return items[0]

class Stack[T]:
    def __init__(self) -> None:
        self._items: list[T] = []

    def push(self, item: T) -> None:
        self._items.append(item)

    def pop(self) -> T:
        return self._items.pop()
```
::

### Bounded and constrained TypeVars

::code-wrapper{language="python"}
```python
from typing import TypeVar

Numeric = TypeVar("Numeric", bound=float)     # T must be float OR a subtype (int counts, via numeric tower quirks)

def double(value: Numeric) -> Numeric:
    return value * 2

StrOrBytes = TypeVar("StrOrBytes", str, bytes)   # T must be EXACTLY str or EXACTLY bytes — no subclasses substitute freely

def concat(a: StrOrBytes, b: StrOrBytes) -> StrOrBytes:
    return a + b
```
::

`bound=` accepts the named type or any subtype (like an upper bound in other languages' generics); the constrained form (listing explicit types as positional args) restricts to exactly those types, each checked independently — mixing `concat("a", b"b")` is still flagged as an error by `mypy` despite both being "allowed" types individually.

## `Protocol`: Structural Typing (Duck Typing, Statically Checked)

::code-wrapper{language="python"}
```python
from typing import Protocol

class SupportsQuack(Protocol):
    def quack(self) -> str: ...

class Duck:
    def quack(self) -> str:
        return "Quack!"

class Person:
    def quack(self) -> str:
        return "I'm quacking, I guess?"

def make_it_quack(entity: SupportsQuack) -> str:
    return entity.quack()

print(make_it_quack(Duck()))     # "Quack!"
print(make_it_quack(Person()))     # "I'm quacking, I guess?" — Person is accepted WITHOUT inheriting SupportsQuack!
```
::

This is the crucial difference from `abc.ABC` (chapter 13): `Protocol` implements **structural** typing — any object with a matching `quack(self) -> str` method satisfies `SupportsQuack`, with zero inheritance relationship required, exactly matching Python's runtime duck-typing philosophy but now checkable statically. An `ABC` subclass, by contrast, requires *explicit* inheritance to be recognized as satisfying the interface, even if the methods match structurally.

::code-wrapper{language="python"}
```python
from typing import Protocol, runtime_checkable

@runtime_checkable
class SupportsQuack(Protocol):
    def quack(self) -> str: ...

print(isinstance(Person(), SupportsQuack))   # True — runtime_checkable enables isinstance() checks
# NOTE: runtime_checkable only verifies METHOD NAMES exist, not their signatures or return types!
```
::

`@runtime_checkable` only checks that the named methods/attributes exist on the object — it does not verify parameter types or return types match at runtime (that's still `mypy`'s job, statically). An object with a `quack(self, volume: int) -> None` method still passes `isinstance` against `SupportsQuack` even though the signature is completely different.

## `TypedDict`: Typed Dictionary Shapes

::code-wrapper{language="python"}
```python
from typing import TypedDict, NotRequired

class UserRecord(TypedDict):
    id: int
    name: str
    email: str

def create_user(data: UserRecord) -> None:
    print(f"Creating {data['name']} <{data['email']}>")

create_user({"id": 1, "name": "Ada", "email": "ada@example.com"})   # OK
# create_user({"id": 1, "name": "Ada"})   # mypy error: Missing key "email"

class UserRecordPartial(TypedDict):
    id: int
    name: str
    nickname: NotRequired[str]     # 3.11+ — this key may be omitted entirely

create_user_partial: UserRecordPartial = {"id": 1, "name": "Ada"}   # OK — nickname is optional
```
::

`TypedDict` is purely a static-typing construct — at runtime, a `UserRecord` IS just a plain `dict`, with no validation, no special class, and no enforcement that required keys are present:

::code-wrapper{language="python"}
```python
bad_user: UserRecord = {"id": "not an int!", "name": 123, "email": None}   # mypy flags ALL three
print(type(bad_user))    # <class 'dict'> — runtime doesn't care, TypedDict vanishes completely at runtime
print(bad_user)             # {'id': 'not an int!', 'name': 123, 'email': None} — runs fine, no exception
```
::

For actual runtime validation of shapes like this (not just static hints), reach for a library like `pydantic`, which does enforce and coerce types when data is constructed — `TypedDict` alone gives you IDE autocomplete and `mypy` checking only.

## `Literal`, `Final`, and `Any`

::code-wrapper{language="python"}
```python
from typing import Literal, Final, Any

def set_mode(mode: Literal["read", "write", "append"]) -> None:
    print(f"Mode set to {mode}")

set_mode("read")     # OK
# set_mode("delete")   # mypy error: Argument has incompatible type; expected one of the Literal values

MAX_RETRIES: Final = 3       # mypy flags any later reassignment of MAX_RETRIES as an error
# MAX_RETRIES = 5             # mypy error: Cannot assign to final name "MAX_RETRIES"

def accept_anything(value: Any) -> Any:   # Any OPTS OUT of type checking entirely for this value
    return value.whatever_method_i_want()    # mypy will NOT flag this, even if it's nonsense
```
::

`Any` is the type-checking escape hatch — it is compatible with every other type in both directions, meaning assigning an `Any`-typed value to an `int` variable, or vice versa, is never flagged. **Best practice**: use `Any` sparingly and explicitly (e.g., for genuinely dynamic data like raw JSON) rather than as a shortcut to silence errors — overusing `Any` quietly disables the type checker across your whole call graph, since `Any` propagates through any expression it touches.

## Callable, Type Aliases, and `TYPE_CHECKING`

::code-wrapper{language="python"}
```python
from typing import Callable, TYPE_CHECKING

def apply_twice(fn: Callable[[int], int], value: int) -> int:   # Callable[[ArgTypes], ReturnType]
    return fn(fn(value))

print(apply_twice(lambda x: x * 2, 5))   # 20

Handler = Callable[[str, int], None]     # a TYPE ALIAS — just a name for a complex type, for readability

def register(event: str, priority: int) -> None: ...
handlers: list[Handler] = [register]

if TYPE_CHECKING:            # this block NEVER executes at runtime — imports here are type-checker-only
    from mymodule import HeavyExpensiveClass   # avoids a real import cost / circular import at runtime

def process(item: "HeavyExpensiveClass") -> None:   # forward reference as a STRING — resolved only by mypy
    ...
```
::

`TYPE_CHECKING` is `False` at runtime and `True` only from a static checker's perspective — it's the standard pattern for importing something purely for annotations (avoiding a circular import, or an expensive import that's never actually needed at runtime because the annotation is never evaluated as real code).

## Running `mypy`: Static Checking in Practice

::code-wrapper{language="bash"}
```bash
pip install mypy
mypy myscript.py

# myscript.py:12: error: Argument 1 to "greet" has incompatible type "int"; expected "str"  [arg-type]
# Found 1 error in 1 file (checked 1 source file)
```
::

::code-wrapper{language="ini"}
```ini
[mypy]
python_version = 3.12
disallow_untyped_defs = true
warn_return_any = true
warn_unused_ignores = true
strict = false
```
::

`disallow_untyped_defs = true` is the single highest-value setting for adopting typing in an existing codebase — it forces every function to have annotations, catching the common failure mode of typing *some* functions and leaving critical ones silently unchecked. Ratchet up to `strict = true` (which bundles a dozen stricter flags) once a codebase is mostly annotated.

::code-wrapper{language="python"}
```python
def risky_operation(value) -> int:      # UNANNOTATED parameter — mypy treats `value` as implicit Any
    return value + 1                      # no error reported, even if `value` is later called with a str!

result = risky_operation("not a number")   # mypy: no error (value: Any) — but this raises TypeError at RUNTIME
```
::

An unannotated parameter defaults to `Any` under normal settings, which silently defeats type checking for that parameter — `disallow_untyped_defs` exists specifically to catch this gap by making every def require full annotations before mypy will pass.

## 💡 Tips & Tricks

- **Idiom**: annotate function signatures first, and only add variable-level annotations (`x: int = 5`) where the inferred type would otherwise be ambiguous (e.g., an empty list `items: list[str] = []`) — annotating every trivial local variable is noise `mypy` doesn't need.
- **Debug**: `reveal_type(x)` is a special `mypy`-only pseudo-function — insert it anywhere to have `mypy` print its inferred type for `x` in the error output, then delete it; it's not a real function and will `NameError` if actually run.
- **Idiom**: use `from __future__ import annotations` (or rely on it being default behavior in newer Python) to make all annotations lazily-evaluated strings, which lets you reference a class in its own methods' hints (`def clone(self) -> "MyClass"`) without the quotes.
- **Performance**: since annotations are never evaluated at runtime under `from __future__ import annotations`, expensive or forward-referenced types in hints impose zero runtime cost — a good reason to type liberally without performance anxiety.
- **Safety**: `Protocol` classes are the correct tool for typing "duck typed" parameters (loggers, anything with a `.write()` method, etc.) instead of `Any` — you get real static checking without forcing every caller to inherit from a common base class.

## ⚠️ Edge Cases & Gotchas

- **Type hints are never checked at runtime by the interpreter itself** — `def f(x: int): ...` happily accepts `f("a string")` and runs to completion (or fails later, for unrelated reasons); only a separate tool like `mypy` catches the mismatch, and only if it's actually run as part of CI.
- **`Optional[X]` does not supply a default value of `None`** — it only widens the accepted type to `X | None`; forgetting the separate `= None` default still makes the parameter required to pass, producing a `TypeError: missing required argument`, not a helpful type error.
- **`TypedDict` provides zero runtime validation** — a dict missing required keys, or with wrong-typed values, is only ever flagged by `mypy`; at runtime it's an ordinary `dict` that will raise a plain `KeyError` (not a validation error) the first time a missing key is accessed.
- **An unannotated function parameter is implicitly `Any` under default `mypy` settings**, silently opting that parameter out of type checking — a partially-annotated codebase can look "typed" while large gaps go completely unchecked; `disallow_untyped_defs` closes this hole.
- **`Any` is bidirectionally compatible with everything and propagates through expressions** — one `Any`-typed value flowing into an otherwise fully-typed function can silence type errors for everything downstream that touches it, which is why overuse of `Any` is often worse than not typing at all (it creates false confidence).

## 🧠 Spot the Bug

A function is meant to look up a user by ID and return their display name, or a fallback if not found. `mypy` reports no errors, but it crashes in production. Find the bug.

::code-wrapper{language="python"}
```python
from typing import Optional

def get_display_name(user_id: int, users: dict[int, str]) -> str:
    name: Optional[str] = users.get(user_id)
    return name.upper()

print(get_display_name(1, {1: "ada"}))     # "ADA"
print(get_display_name(2, {1: "ada"}))       # crashes
```
::

<details>
<summary>Answer</summary>

`dict.get(user_id)` returns `None` when the key is missing — that's exactly why `name` is correctly annotated `Optional[str]`. But the very next line, `name.upper()`, calls `.upper()` unconditionally on `name`, without ever checking for `None` first. If `mypy` is run with default (non-strict) settings, this specific pattern can slip through depending on configuration and mypy version, but under proper strict settings (`strict = true` or at minimum `--strict-optional`, which is on by default in modern mypy), this SHOULD be flagged as `error: Item "None" of "Optional[str]" has no attribute "upper"`. The scenario here is the common real failure mode: the type checker isn't run at all in CI, or is run with settings loose enough to miss it, so the `Optional` annotation was correctly written but never actually enforced before deployment — `users.get(2)` returns `None` at runtime, and `None.upper()` raises `AttributeError: 'NoneType' object has no attribute 'upper'`.

The fix handles the `None` case explicitly, which is the entire point of marking something `Optional` in the first place:
::code-wrapper{language="python"}
```python
def get_display_name(user_id: int, users: dict[int, str]) -> str:
    name = users.get(user_id)
    if name is None:
        return "Unknown User"
    return name.upper()
```
::

**The lesson**: an `Optional[X]` annotation is a promise that must be honored with an actual `None` check in the code — it documents the possibility of `None` but does nothing to prevent a missed check unless a type checker is actually run, in strict mode, as a required CI gate rather than an optional local habit.

</details>

## Key Takeaways

- Type hints are purely static-analysis metadata — the Python interpreter never checks them at runtime; only a separate tool like `mypy` or `pyright`, run explicitly, catches mismatches.
- `Optional[X]` means `X | None`, not "has a default value" — the `= None` default must be written separately even when the parameter is `Optional`.
- `Protocol` gives you statically-checked structural typing (duck typing) with no inheritance required, in contrast to `abc.ABC`, which requires explicit subclassing to satisfy an interface.
- `TypedDict` documents a dict's expected shape for `mypy` and editors, but provides zero runtime validation — reach for `pydantic` if you need actual runtime enforcement.
- `Any` is compatible with everything in both directions and propagates through expressions — overusing it creates false confidence by silently disabling checks across everything it touches.
- Enable `disallow_untyped_defs` (and eventually `strict = true`) in `mypy` configuration — unannotated functions default to `Any` parameters, which silently defeats type checking for exactly the code most likely to have a bug.
