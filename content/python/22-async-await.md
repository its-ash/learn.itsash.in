# 22 — Async / Await

## Why Async Exists: Concurrency Without Threads

::code-wrapper{language="python"}
```python
import asyncio
import time

async def fetch_simulated(name, delay):
    print(f"{name}: starting")
    await asyncio.sleep(delay)      # yields control back to the event loop for `delay` seconds
    print(f"{name}: done")
    return f"{name} result"

async def main():
    start = time.perf_counter()
    results = await asyncio.gather(
        fetch_simulated("A", 2),
        fetch_simulated("B", 2),
        fetch_simulated("C", 2),
    )
    print(results)
    print(f"Elapsed: {time.perf_counter() - start:.2f}s")   # ~2s total, NOT 6s — all three ran concurrently

asyncio.run(main())
```
::

`asyncio` provides concurrency using a **single thread and a single event loop**, cooperatively switching between tasks at `await` points — rather than the OS preemptively switching between threads at arbitrary bytecode boundaries (chapter 21). This makes `asyncio` extremely well suited to I/O-bound workloads with many simultaneous waits (thousands of open network connections), since each coroutine has far less memory/scheduling overhead than an OS thread, and there's no `Lock`-style race condition risk from preemptive interruption — control only ever switches at an explicit `await`.

## `async def`, Coroutines, and `await`

::code-wrapper{language="python"}
```python
async def greet(name):
    return f"Hello, {name}"

result = greet("Ada")
print(result)          # <coroutine object greet at 0x...> — calling an async function does NOT run it!
# print(result.upper())  # AttributeError — it's a coroutine object, not a string, until awaited

async def main():
    message = await greet("Ada")    # NOW it actually runs, and `await` unwraps the returned value
    print(message)                    # "Hello, Ada"

asyncio.run(main())
```
::

Calling an `async def` function does not execute its body — it immediately returns a **coroutine object**, a suspended computation that does nothing until something drives it forward, either via `await` (inside another coroutine) or by handing it to the event loop (`asyncio.run()`, `asyncio.create_task()`). This is the single most common beginner confusion: forgetting `await` doesn't raise an error, it just silently produces an unused coroutine object and a `RuntimeWarning: coroutine 'greet' was never awaited`.

## Coroutines vs Tasks: Scheduling and Concurrency

::code-wrapper{language="python"}
```python
import asyncio

async def worker(name, delay):
    await asyncio.sleep(delay)
    print(f"{name} finished")
    return name

async def sequential():
    # awaiting coroutines directly runs them ONE AT A TIME — no concurrency at all
    await worker("A", 1)
    await worker("B", 1)
    # total: ~2 seconds

async def concurrent_tasks():
    # wrapping in create_task() schedules BOTH immediately, running concurrently
    task_a = asyncio.create_task(worker("A", 1))
    task_b = asyncio.create_task(worker("B", 1))
    await task_a
    await task_b
    # total: ~1 second — both tasks were running "at the same time" from the moment create_task() was called

asyncio.run(concurrent_tasks())
```
::

A bare coroutine, awaited directly, blocks the awaiting coroutine until it finishes — sequential, not concurrent. A **`Task`** (created via `asyncio.create_task()`) is scheduled on the event loop immediately and runs independently in the background; `await`-ing a task later just waits for a result that may already be in progress (or done). **This distinction is the single biggest performance gotcha in async code**: writing `await coro1(); await coro2()` when you meant "run both at once" silently serializes work that should have overlapped.

## `asyncio.gather` — Running Many Coroutines Concurrently

::code-wrapper{language="python"}
```python
import asyncio

async def fetch(id_, fail=False):
    await asyncio.sleep(0.1)
    if fail:
        raise ValueError(f"fetch {id_} failed")
    return id_

async def main():
    # DEFAULT: gather propagates the FIRST exception immediately, cancelling nothing else automatically
    try:
        results = await asyncio.gather(fetch(1), fetch(2, fail=True), fetch(3))
    except ValueError as e:
        print(f"gather raised: {e}")   # only ONE exception surfaces, even though only task 2 failed

    # return_exceptions=True — collects EVERY result/exception instead of raising immediately
    results = await asyncio.gather(fetch(1), fetch(2, fail=True), fetch(3), return_exceptions=True)
    print(results)   # [1, ValueError('fetch 2 failed'), 3] — exceptions returned as VALUES, not raised

asyncio.run(main())
```
::

Without `return_exceptions=True`, `gather` raises the first exception it encounters, but the *other* coroutines are **not automatically cancelled** — they keep running in the background, and their results (or further exceptions) are simply discarded, which can silently mask a fire-and-forget failure or leave background work running longer than expected.

## `async with` and `async for`

::code-wrapper{language="python"}
```python
import asyncio

class AsyncResource:
    async def __aenter__(self):
        print("acquiring (async)")
        await asyncio.sleep(0.1)
        return self

    async def __aexit__(self, exc_type, exc_value, tb):
        print("releasing (async)")
        await asyncio.sleep(0.1)
        return False

async def main():
    async with AsyncResource() as resource:
        print("using resource")

asyncio.run(main())
```
::

`__aenter__`/`__aexit__` mirror `__enter__`/`__exit__` from chapter 14 exactly, except both are coroutines — necessary any time acquiring or releasing a resource itself requires an `await` (e.g., an async database connection pool). The same pattern applies to iteration:

::code-wrapper{language="python"}
```python
class AsyncRange:
    def __init__(self, limit):
        self.limit = limit
        self.current = 0

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self.current >= self.limit:
            raise StopAsyncIteration
        await asyncio.sleep(0.05)
        value = self.current
        self.current += 1
        return value

async def main():
    async for value in AsyncRange(3):
        print(value)   # 0, 1, 2 — each with a real await between iterations

asyncio.run(main())
```
::

## Async Generators

::code-wrapper{language="python"}
```python
async def fetch_pages(total):
    for page in range(total):
        await asyncio.sleep(0.1)     # simulate an async network call per page
        yield f"page-{page}"

async def main():
    async for page in fetch_pages(3):
        print(page)

    all_pages = [page async for page in fetch_pages(3)]   # async comprehension — note `async for`
    print(all_pages)

asyncio.run(main())
```
::

An `async def` function containing `yield` is an **async generator**, combining chapter 9's generator laziness with async's cooperative scheduling — each `yield` can be preceded by real `await`s, ideal for streaming paginated API results without loading everything into memory upfront.

## Common Pitfalls

### Blocking calls inside a coroutine freeze the entire event loop

::code-wrapper{language="python"}
```python
import asyncio
import time

async def bad_worker(name):
    print(f"{name}: starting")
    time.sleep(2)              # BLOCKING call — freezes the ENTIRE event loop, not just this coroutine!
    print(f"{name}: done")

async def main():
    await asyncio.gather(bad_worker("A"), bad_worker("B"))
    # takes ~4 seconds, NOT ~2 — time.sleep() blocks the whole thread, defeating async's entire purpose

asyncio.run(main())
```
::

`time.sleep()`, synchronous `requests.get()`, blocking file I/O, and any other call that doesn't yield control back to the event loop will stall **every** coroutine scheduled on that loop, not just the one that called it — because everything shares one thread. The fix is either an async-native library (`asyncio.sleep`, `aiohttp`/`httpx` for HTTP) or explicitly offloading blocking work to a thread pool:

::code-wrapper{language="python"}
```python
import asyncio
import time

async def good_worker(name):
    print(f"{name}: starting")
    await asyncio.to_thread(time.sleep, 2)   # runs the blocking call in a worker thread, event loop stays free
    print(f"{name}: done")

async def main():
    await asyncio.gather(good_worker("A"), good_worker("B"))
    # ~2 seconds total — both blocking calls genuinely overlap via separate threads

asyncio.run(main())
```
::

### Forgetting to await a coroutine

::code-wrapper{language="python"}
```python
async def save_to_db(record):
    await asyncio.sleep(0.1)
    print(f"saved {record}")

async def main():
    save_to_db("record-1")    # BUG: missing `await` — schedules nothing, does nothing, warns at best
    print("done")

asyncio.run(main())
# done
# <sys>:0: RuntimeWarning: coroutine 'save_to_db' was never awaited
```
::

### Mixing `asyncio.run()` calls, or calling it from inside already-running async code

::code-wrapper{language="python"}
```python
async def inner():
    return 1

async def outer():
    # result = asyncio.run(inner())   # RuntimeError: asyncio.run() cannot be called from a running event loop
    result = await inner()              # CORRECT — just await directly, you're already inside the loop
    return result
```
::

`asyncio.run()` is meant to be called exactly once, from synchronous top-level code, to start the event loop — never from inside a coroutine that's already running on one.

## `asyncio.wait_for` — Timeouts

::code-wrapper{language="python"}
```python
import asyncio

async def slow_operation():
    await asyncio.sleep(5)
    return "done"

async def main():
    try:
        result = await asyncio.wait_for(slow_operation(), timeout=1.0)
    except asyncio.TimeoutError:
        print("operation timed out")    # raised after 1s, the underlying task is cancelled automatically

asyncio.run(main())
```
::

## `asyncio.Lock` — Yes, Async Code Can Still Have Race Conditions

::code-wrapper{language="python"}
```python
import asyncio

balance = 100

async def withdraw_unsafe(amount):
    global balance
    current = balance
    await asyncio.sleep(0.01)   # simulates an await point where ANOTHER task can interleave
    balance = current - amount

async def main():
    await asyncio.gather(withdraw_unsafe(50), withdraw_unsafe(50))
    print(balance)   # expected 0, but often prints 50 — both tasks read balance=100 before either wrote back

asyncio.run(main())
```
::

Even without OS-level thread preemption, an `await` point is exactly where another task can run and mutate shared state — the same class of bug as chapter 21's threading race conditions, just triggered by explicit `await` instead of an arbitrary GIL switch. `asyncio.Lock` fixes it identically to `threading.Lock`, just with `async with`:

::code-wrapper{language="python"}
```python
import asyncio

balance = 100
lock = asyncio.Lock()

async def withdraw_safe(amount):
    global balance
    async with lock:
        current = balance
        await asyncio.sleep(0.01)
        balance = current - amount

async def main():
    await asyncio.gather(withdraw_safe(50), withdraw_safe(50))
    print(balance)   # reliably 0

asyncio.run(main())
```
::

## 💡 Tips & Tricks

- **Idiom**: use `asyncio.create_task()` the moment you want two or more independent coroutines to overlap — `await`-ing coroutines back-to-back is sequential by default, which surprises developers coming from other async models where concurrency is implicit.
- **Debug**: `asyncio.run(main(), debug=True)` (or setting `PYTHONASYNCIODEBUG=1`) enables slow-callback warnings and better tracebacks for "coroutine never awaited" and similar mistakes — invaluable while learning.
- **Performance**: `asyncio.to_thread()` (3.9+) is the simplest way to keep a genuinely blocking call (synchronous library, CPU-light blocking I/O) from freezing the entire event loop, without hand-rolling a `ThreadPoolExecutor`.
- **Idiom**: name every task you create (`asyncio.create_task(coro(), name="fetch-user")`) — an unhandled exception in an un-awaited, unnamed task is much harder to trace back to its origin in logs than a named one.
- **Safety**: an `asyncio.Task` that's created but never awaited or stored can be garbage-collected before it finishes, silently cancelling it — keep a reference (e.g., in a set) to any "fire and forget" background task until it completes.

## ⚠️ Edge Cases & Gotchas

- **Calling an `async def` function does not run it — it returns a coroutine object that does nothing until awaited or scheduled**, and forgetting the `await` produces no error, only a `RuntimeWarning` that's easy to miss in noisy logs.
- **A single blocking call (`time.sleep`, a synchronous HTTP request, blocking disk I/O) anywhere in a coroutine freezes the entire event loop**, stalling every other coroutine scheduled on it — not just the offending one — because `asyncio` concurrency is entirely cooperative on one thread.
- **`asyncio.gather()` without `return_exceptions=True` raises only the first exception it encounters, while the other coroutines keep running in the background, unawaited and unmonitored** — their eventual results or further exceptions are silently discarded unless explicitly handled.
- **`await` points are exactly where other tasks can interleave and mutate shared state** — async code is not automatically free of race conditions just because there's only one thread; any shared mutable state read before an `await` and written after it needs an `asyncio.Lock`.
- **An `asyncio.Task` with no remaining strong reference can be garbage-collected mid-flight, silently cancelling it** — a "fire and forget" `asyncio.create_task(...)` call with the return value discarded is a common source of work that mysteriously never completes.

## 🧠 Spot the Bug

A function is meant to fetch three resources concurrently and return all results. It works, but takes about three times longer than expected. Find the bug.

::code-wrapper{language="python"}
```python
import asyncio

async def fetch(name):
    await asyncio.sleep(1)
    return f"{name}-data"

async def fetch_all():
    results = []
    for name in ["a", "b", "c"]:
        result = await fetch(name)
        results.append(result)
    return results

asyncio.run(fetch_all())   # takes ~3 seconds instead of ~1
```
::

<details>
<summary>Answer</summary>

`await fetch(name)` inside the `for` loop runs each call to completion before starting the next one — this is sequential execution, not concurrent, despite `fetch` being an `async def` function. `async def` alone does not make calls run in parallel; it only makes a function *awaitable* and able to suspend at its own `await` points. Concurrency requires actually scheduling multiple coroutines to run before waiting on any of them, either via `asyncio.create_task()` for each, or by passing all of them to `asyncio.gather()` at once — awaiting one at a time in a loop is functionally identical to synchronous code, just with extra syntax.

The fix schedules all three fetches before awaiting any of them:
::code-wrapper{language="python"}
```python
async def fetch_all():
    return await asyncio.gather(*(fetch(name) for name in ["a", "b", "c"]))
```
::

This runs all three `asyncio.sleep(1)` calls concurrently, so the whole function takes about 1 second instead of 3, since all three coroutines are suspended waiting on their sleeps at the same time rather than one after another.

**The lesson**: `async`/`await` syntax alone doesn't imply concurrency — awaiting coroutines one at a time in sequence is sequential; genuine concurrency requires `asyncio.gather()`, `asyncio.create_task()`, or equivalent, to have more than one coroutine actually in flight simultaneously.

</details>

## Key Takeaways

- `asyncio` provides single-threaded, cooperative concurrency — control only switches at explicit `await` points, which avoids OS-thread overhead and preemption-based race conditions, but means one blocking call can freeze everything.
- Calling an `async def` function returns a coroutine object immediately without running its body; the body only executes once the coroutine is awaited or scheduled as a `Task`.
- Awaiting coroutines one after another in a loop or in sequence is sequential execution — real concurrency requires `asyncio.gather()` or `asyncio.create_task()` to have multiple coroutines in flight at once.
- Any blocking (non-async) call inside a coroutine stalls the entire event loop; use async-native libraries or `asyncio.to_thread()` to offload genuinely blocking work.
- `asyncio.gather()` without `return_exceptions=True` raises only the first exception, leaving other coroutines running in the background with their results discarded — use `return_exceptions=True` to collect everything.
- Shared mutable state is still subject to race conditions in async code, because other tasks can run during any `await` — protect read-modify-write sequences with `asyncio.Lock` exactly as `threading.Lock` protects them in threaded code.
