# 28 — Exercises & Projects

Reading is the first step; building is where you become a pro. This chapter gives you exercises and projects calibrated to internalize everything from chapters 01 through 27.

## How to Use This Chapter

Each section has:
- **Exercises**: small, focused tasks to test specific concepts.
- **Projects**: end-to-end builds with concrete requirements and stretch goals.
- **Solutions**: don't look anything up until you've tried for at least 30 minutes.

## Beginner Exercises

### 1. FizzBuzz with Comprehensions

Implement FizzBuzz for `1..=100` as a single list comprehension producing strings, using a conditional expression (chapter 04, 09).

### 2. Stack with `__slots__`

::code-wrapper{language="python"}
```python
class Stack:
    __slots__ = ("_items",)
    def __init__(self): ...
    def push(self, item): ...
    def pop(self): ...
    def peek(self): ...
    def __len__(self): ...
    def __bool__(self): ...
```
::

Back it with a `list`. Implement `__iter__` so `for x in stack` yields items top-to-bottom without mutating the stack (chapter 14, 15, 19).

### 3. Custom Exception Hierarchy

Write `parse_csv_row(row: str) -> list[int]` that raises a custom `CSVParseError` (with the offending row and column attached) rather than letting a bare `ValueError` propagate. Use `raise ... from` to preserve the original exception (chapter 16).

### 4. Linked List

Implement a singly linked list using a `Node` dataclass and `Optional[Node]` links. Then implement `__iter__`, `__len__`, and `__repr__` (chapter 09, 12, 14, 20).

### 5. CLI Calculator

Take `+ 2 3` or `* 4 5` from `sys.argv`, print the result. Handle malformed input with a helpful error message instead of a raw traceback. Add an `argparse`-based version as a stretch goal (chapter 05, 16).

## Intermediate Exercises

### 6. JSON-ish Parser

Hand-write a parser for a JSON subset (objects, arrays, strings, numbers, booleans, `null`) using recursive descent — no `json` module allowed. Cover nested structures and escaped characters in strings (chapter 06, 16).

### 7. Async File Watcher

Poll a directory for new/modified files using `asyncio` and `pathlib`, printing events as they occur. Support clean shutdown on `Ctrl+C` via a cancellation-aware loop (chapter 19, 22).

### 8. Concurrent Counter with Threads

Spawn 10 threads, each incrementing a shared counter 100,000 times. Demonstrate the race condition with no lock, then fix it with `threading.Lock`. Measure and report the difference in final (wrong vs. correct) totals (chapter 21).

### 9. Custom Iterator for Fibonacci

::code-wrapper{language="python"}
```python
class Fibonacci:
    def __init__(self, limit): ...
    def __iter__(self): ...
    def __next__(self): ...
```
::

Make it a proper iterator (raises `StopIteration` at `limit`), then chain it through `itertools.islice`, `map`, and `filter` (chapter 09, 19).

### 10. Type-State Builder with `Protocol`

Design a `QueryBuilder` where `.select(...)`, `.where(...)`, and `.build()` are only valid in certain call orders, enforced via type hints and `Protocol` classes (not runtime checks). Verify the intended misuse fails `mypy`, not just at runtime (chapter 20).

## Advanced Exercises

### 11. Custom Descriptor-Based ORM Field

Implement a `Field` descriptor (`__set_name__`, `__get__`, `__set__`) that validates type and range on assignment, used inside a small `Model` base class with `__init_subclass__` collecting all fields into a registry (chapter 15, 23).

### 12. Metaclass-Based Plugin Registry

Build a `PluginMeta` metaclass that auto-registers every subclass of `PluginBase` into a class-level registry, then compare the same behavior implemented with `__init_subclass__` instead. Write a short note on which approach you'd ship to production and why (chapter 23).

### 13. Thread-Safe LRU Cache From Scratch

Implement your own bounded LRU cache (no `functools.lru_cache`) using `collections.OrderedDict` and a `threading.Lock`, safe for concurrent `get`/`put` from multiple threads. Benchmark against `functools.lru_cache` for the single-threaded case (chapter 21, 26).

### 14. Async Rate-Limited API Client

Implement an `async` HTTP client wrapper (using `aiohttp` or `httpx`) that limits concurrent requests via `asyncio.Semaphore` and retries transient failures with exponential backoff. Test it against a local mock server, not a real API (chapter 22, 24).

### 15. Memory Profiler for Your Own Code

Use `tracemalloc` to snapshot memory before/after a function call, diff the snapshots, and print the top 5 lines responsible for allocation growth. Apply it to one of your earlier exercises and report a real finding (chapter 26).

### 16. C Extension via `ctypes` or Cython

Write a small numeric function (e.g., a tight loop computing a checksum) in C, call it from Python via `ctypes`, then rewrite the same function in Cython and benchmark both against a pure-Python version (chapter 26).

## Project Ideas

### Beginner

1. **CLI todo app**: `add`, `list`, `done`, `remove` subcommands. JSON file storage via `pathlib`/`json`. Use `argparse` or `click`.
   - *Requirements*: persists between runs, handles a missing/corrupt storage file gracefully, exit codes reflect success/failure.
   - *Stretch*: due dates with `datetime`, priority levels, colored terminal output.
2. **Word frequency counter**: read a text file, print the top 10 most common words.
   - *Requirements*: case-insensitive, strips punctuation, uses `collections.Counter`.
   - *Stretch*: exclude a configurable stopword list; handle files too large to fit in memory by streaming.
3. **Markdown to HTML converter**: minimal converter for headers, bold/italic, links, and lists.
   - *Requirements*: uses `re` or hand-written parsing, no external Markdown library.
   - *Stretch*: nested lists, code blocks with syntax-aware escaping.
4. **Unit converter CLI**: temperature, length, weight conversions.
   - *Requirements*: rejects invalid units with a clear error message, uses `Decimal` where precision matters.
   - *Stretch*: a REPL mode using `cmd` from the standard library.

### Intermediate

5. **REST API with FastAPI**: a small "bookmarks" service — create, list, delete, search bookmarks.
   - *Requirements*: `pydantic` models for request/response validation, SQLite via `sqlalchemy`, `pytest` test suite with a test database fixture.
   - *Stretch*: pagination, full-text search, JWT-based auth.
6. **Web scraper with rate limiting**: scrape a public site's listing pages politely.
   - *Requirements*: `requests`/`httpx` + `beautifulsoup4`, respects `robots.txt`, configurable delay between requests, retries with backoff.
   - *Stretch*: convert to `asyncio` + `aiohttp` for concurrent (still rate-limited) fetching; compare wall-clock time.
7. **Log analysis tool**: parse a large web server access log, report top IPs, status code distribution, and slow endpoints.
   - *Requirements*: streams the file (never loads it fully into memory), uses `re` or a proper log-format parser, outputs a summary table.
   - *Stretch*: process multiple gigabyte-scale log files in parallel using `multiprocessing`.
8. **Task queue with workers**: a producer enqueues jobs; multiple worker processes consume and execute them.
   - *Requirements*: `multiprocessing.Queue` or `redis`-backed queue, graceful shutdown, at-least-once job execution semantics documented.
   - *Stretch*: a simple retry/dead-letter mechanism for jobs that repeatedly fail.
9. **Database migration tool**: apply/rollback schema migrations tracked by version number, similar in spirit to `alembic` but hand-built.
   - *Requirements*: tracks applied migrations in a metadata table, supports up/down migrations, is idempotent (running twice is safe).
   - *Stretch*: dry-run mode that prints the SQL without executing it.
10. **Config management library**: load configuration from environment variables, a `.env` file, and a YAML/TOML file, with a defined precedence order.
    - *Requirements*: validated via `pydantic` (or dataclasses + manual validation), clear error messages for missing required values.
    - *Stretch*: hot-reload on file change using the async file watcher from Exercise 7.

### Advanced

11. **Async web framework mini-clone**: implement a minimal ASGI-compatible framework — routing, middleware, request/response objects.
    - *Requirements*: handles path parameters, at least one middleware (logging or auth), runs under `uvicorn`.
    - *Stretch*: dependency injection similar to FastAPI's `Depends`.
12. **Distributed task scheduler**: cron-like scheduler that distributes jobs across multiple worker processes/machines.
    - *Requirements*: jobs survive a worker crash (persisted state, not in-memory only), no job runs twice concurrently.
    - *Stretch*: a small web dashboard (via FastAPI) showing job history and status.
13. **Custom ORM**: descriptor-based fields, a `QuerySet`-like lazy query builder, migrations.
    - *Requirements*: supports at least SQLite, lazy evaluation (a query only hits the database when iterated/materialized), parameterized queries only — no string-formatted SQL anywhere.
    - *Stretch*: a basic connection pool; support for `JOIN`-like relationships between models.
14. **Static site generator**: Markdown → HTML with templates, front matter, and an RSS feed, similar in spirit to this very site.
    - *Requirements*: uses `jinja2` for templating, supports nested content directories, incremental rebuilds (only regenerate changed files).
    - *Stretch*: a `watch` mode with live-reload using the async file watcher pattern from Exercise 7.
15. **Package vulnerability scanner**: given a `requirements.txt`/`pyproject.toml`, cross-reference installed versions against a vulnerability database and report findings.
    - *Requirements*: parses both dependency file formats, calls a real advisory API (or a downloaded OSV dataset), produces a clear pass/fail report.
    - *Stretch*: a GitHub Action that runs it automatically on every pull request.
16. **Real-time chat server**: WebSocket-based, multiple rooms, message history.
    - *Requirements*: `asyncio` + `websockets` or FastAPI's WebSocket support, handles disconnects gracefully, broadcasts to all clients in a room.
    - *Stretch*: horizontal scaling across multiple server processes using Redis pub/sub for cross-process broadcast.
17. **Type checker plugin or `mypy` stub package**: write `.pyi` stub files for an untyped third-party library you use often, or a small `mypy` plugin that catches one specific project-specific mistake.
    - *Requirements*: stubs pass `mypy --strict` on a real consuming file; documents at least 3 real functions/classes accurately.
    - *Stretch*: publish the stub package to PyPI as a `types-<package>` package.
18. **Profiler-guided optimization case study**: take one of your own earlier, slower projects (the web scraper or log analyzer are good candidates), profile it with `cProfile`, and optimize it through at least three iterations.
    - *Requirements*: a before/after benchmark with real numbers, a short written note per iteration explaining what changed and why it helped (or didn't).
    - *Stretch*: rewrite the single hottest function in Cython or Numba and measure the final delta.
19. **Secrets-safe configuration loader**: a library that loads secrets from environment variables or a secrets manager (AWS Secrets Manager, HashiCorp Vault, or a local encrypted file), never logging or accidentally serializing secret values.
    - *Requirements*: secret values use a wrapper type whose `__repr__`/`__str__` redact the value, unit tests confirm no secret ever appears in a log line or exception traceback.
    - *Stretch*: automatic secret rotation support with a callback on rotation.
20. **End-to-end capstone**: combine at least four earlier projects into one cohesive application — for example, the CLI todo app (1) backed by the custom ORM (13), exposed via the async web framework (11), with dependencies checked by the vulnerability scanner (15).
    - *Requirements*: a real `pyproject.toml` with proper dependency groups, a `pytest` suite with meaningful coverage (not just executed-line coverage — see chapter 24), a `README` explaining how to run it, and a CI pipeline (GitHub Actions) running tests, `ruff`, `mypy`, and `pip-audit` on every push.
    - *Stretch*: containerize it with a `Dockerfile`, and deploy it somewhere reachable over the internet.

## Reading Code to Mastery

Read source of:
- `cpython` itself (`Lib/` for pure-Python standard library modules — `collections`, `itertools`, `functools` are approachable starting points).
- `requests` (a widely-imitated, readable HTTP client design).
- `flask` or `fastapi` (routing, request/response lifecycle, decorators in production use).
- `sqlalchemy` (descriptor-heavy ORM internals — directly relevant after chapter 15's descriptor material).
- `pytest` (plugin architecture, fixture resolution — dense but hugely rewarding).
- `click` (decorator-based CLI construction, a masterclass in ergonomic API design).
- `attrs` or the standard library's own `dataclasses` module (class-generation metaprogramming, chapter 23 territory).

The standard library is the best Python code you can read for free. Start with `collections/__init__.py`, `itertools` (implemented in C, but its documentation doubles as a spec you can reimplement in pure Python as an exercise), and `contextlib`.

## Practice Sites

- **Exercism Python track**: mentor-reviewed exercises, strong on idiomatic style feedback.
- **Advent of Code**: annual puzzles; a great forcing function for algorithms plus clean code under time pressure.
- **LeetCode / HackerRank**: algorithmic practice, useful for interview preparation specifically.
- **Project Euler**: math-flavored problems that reward writing genuinely efficient code, not just correct code.
- **CodeWars (Python kata)**: short, focused katas across a huge range of difficulty.

## Open Source Contribution

- `psf/requests`, `pallets/flask`, `tiangolo/fastapi`: widely used, well-documented codebases with active `good first issue` labels.
- `pytest-dev/pytest`: testing infrastructure used by nearly the entire ecosystem.
- `python/cpython`: the interpreter itself — a serious undertaking, but `good first issue`-labeled documentation and test fixes are approachable entry points.
- `django/django`: a large, mature, well-governed codebase; excellent for learning how a big project structures itself.
- `astral-sh/ruff` or `astral-sh/uv`: Rust-implemented but Python-ecosystem-facing tooling, if you're curious how the fastest Python tools are actually built.

## Mastery Self-Check

Can you confidently:
- Explain why `def f(x, items=[])` is dangerous, without looking it up? (Default arguments are evaluated once, at function definition time, and shared across all calls.)
- Predict the output of `0.1 + 0.2 == 0.3`? (`False` — binary floating-point can't represent 0.1 or 0.2 exactly.)
- Explain the difference between `__getattr__` and `__getattribute__`? (Fallback-on-miss vs. every access, unconditionally.)
- Choose correctly between `threading`, `multiprocessing`, and `asyncio` for a given workload? (I/O-bound + many tasks: `asyncio`; I/O-bound + simpler blocking code: `threading`; CPU-bound: `multiprocessing`.)
- Explain why `is` and `==` sometimes agree on small integers and sometimes don't? (CPython caches small ints `-5..256`; identity comparison on larger ints is implementation-dependent, never guaranteed.)
- Write a context manager two different ways — a class with `__enter__`/`__exit__`, and a generator with `@contextmanager`? (Both, and know when each is preferable.)
- Explain why `pickle.loads` on untrusted data is a security vulnerability, precisely? (`__reduce__` can specify arbitrary code to execute during deserialization.)
- Read a `Generic[T]` class and a `Protocol` and explain the difference in what they express? (Concrete generic type vs. structural/duck-typed interface.)
- Explain what the GIL actually prevents, and what it doesn't? (Prevents true parallel *bytecode* execution across threads in one process; doesn't prevent I/O-bound concurrency or multiprocessing parallelism.)
- Write a metaclass and explain when `__init_subclass__` would have been enough instead? (Yes — most of the time.)
- Profile a slow function and explain the difference between `tottime` and `cumtime`? (Time in the function alone vs. including everything it calls.)

If you can do all of the above without consulting docs, you're a pro Python developer.

## Final Words

Python's readability is deceptive — it makes advanced code *look* simple, which is exactly why so many of its real gotchas (mutable defaults, `is` vs `==`, the GIL, decorator/descriptor interactions, `pickle`'s trust assumptions) surprise experienced developers coming from other languages, and even Python developers who never pushed past the basics.

Build things. Break things on purpose. Read the standard library. Profile before you optimize. Run `mypy --strict` on your own code and see how much it catches. Read a security advisory for a package you use and understand *why* the fix was necessary, not just that a new version exists.

Welcome to being a Python developer.

🐍
