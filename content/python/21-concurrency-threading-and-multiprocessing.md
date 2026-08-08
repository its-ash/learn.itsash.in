# 21 — Concurrency: Threading & Multiprocessing

## The GIL: Python's Global Interpreter Lock

::code-wrapper{language="python"}
```python
import threading
import time

def cpu_bound_work():
    total = 0
    for i in range(50_000_000):
        total += i
    return total

start = time.perf_counter()
cpu_bound_work()
cpu_bound_work()
print(f"Sequential: {time.perf_counter() - start:.2f}s")

start = time.perf_counter()
t1 = threading.Thread(target=cpu_bound_work)
t2 = threading.Thread(target=cpu_bound_work)
t1.start(); t2.start()
t1.join(); t2.join()
print(f"Two threads: {time.perf_counter() - start:.2f}s")   # NOT roughly half — often SLOWER than sequential!
```
::

The **Global Interpreter Lock (GIL)** is a single mutex inside CPython (the reference implementation) that ensures only one thread executes Python bytecode at any instant, no matter how many CPU cores are available or how many threads exist. This is why the two-thread version above is not meaningfully faster than the sequential version for CPU-bound work — the threads take turns holding the GIL, switching every few milliseconds, but never truly run Python code in parallel. The GIL exists because CPython's memory management (reference counting, covered in chapter 12) is not thread-safe without a global lock protecting it.

**Best practice**: for CPU-bound work, `threading` does not provide real parallelism in CPython — use `multiprocessing` instead. For I/O-bound work (network calls, file access, waiting on external resources), `threading` (or `asyncio`, chapter 22) works well, because the GIL is released during I/O waits.

::code-wrapper{language="python"}
```python
import threading
import requests

def fetch(url):
    return requests.get(url).status_code

# I/O-bound: threads DO help here, because each thread releases the GIL while waiting on the network
urls = ["https://example.com"] * 10
threads = [threading.Thread(target=fetch, args=(url,)) for url in urls]
for t in threads:
    t.start()
for t in threads:
    t.join()
# Roughly as fast as the slowest single request, not 10x the total — genuine overlap during I/O waits
```
::

> Python 3.13 introduced an experimental **free-threaded** build (`--disable-gil`) that removes the GIL entirely, enabling true multi-core parallelism for threads. As of this writing it's opt-in and not yet the default — the GIL's behavior described here is standard CPython.

## `threading` — Shared Memory, Explicit Locks

::code-wrapper{language="python"}
```python
import threading

counter = 0

def increment_unsafe():
    global counter
    for _ in range(100_000):
        counter += 1     # NOT atomic! read-modify-write across three bytecode ops, interruptible mid-way

threads = [threading.Thread(target=increment_unsafe) for _ in range(4)]
for t in threads:
    t.start()
for t in threads:
    t.join()
print(counter)   # expected 400,000 — often prints something LESS, e.g. 391,842 — a lost-update race condition
```
::

This is a **race condition**: `counter += 1` is not a single atomic operation — it compiles to a load, an add, and a store, and the GIL can switch threads between any of those steps. Two threads can both read the same old value before either writes back the incremented result, silently losing an update. The fix is a `Lock`:

::code-wrapper{language="python"}
```python
import threading

counter = 0
lock = threading.Lock()

def increment_safe():
    global counter
    for _ in range(100_000):
        with lock:            # only ONE thread can hold the lock at a time
            counter += 1

threads = [threading.Thread(target=increment_safe) for _ in range(4)]
for t in threads:
    t.start()
for t in threads:
    t.join()
print(counter)   # always exactly 400,000
```
::

`with lock:` acquires on entry and releases on exit (even if an exception is raised inside), exactly like the context managers from chapters 18-19 — never call `lock.acquire()`/`lock.release()` manually, since a missed `release()` on an exception path causes every other thread waiting on that lock to hang forever (a deadlock).

### `RLock`, `Condition`, and `Event`

::code-wrapper{language="python"}
```python
import threading

# RLock — reentrant: the SAME thread can acquire it multiple times without deadlocking itself
rlock = threading.RLock()

def outer():
    with rlock:
        inner()             # inner() also acquires rlock — fine, same thread, RLock tracks a counter

def inner():
    with rlock:
        print("inner")

# A plain Lock here would deadlock: the second `with lock` in the same thread would block forever
# waiting for a lock the SAME thread already holds and will never release until this call returns.
```
::

::code-wrapper{language="python"}
```python
import threading
import time

ready = threading.Event()

def waiter():
    print("waiting for signal...")
    ready.wait()            # blocks until .set() is called from any thread
    print("signal received, proceeding")

def setter():
    time.sleep(1)
    ready.set()

threading.Thread(target=waiter).start()
threading.Thread(target=setter).start()
```
::

`Event` is the simplest cross-thread signaling primitive — one or more threads `wait()`, another thread calls `set()`, and all waiters wake up. `Condition` extends this with the ability to wait for an arbitrary predicate and notify one (`notify()`) or all (`notify_all()`) waiters, the standard tool for producer/consumer patterns.

## `queue.Queue` — Thread-Safe Producer/Consumer

::code-wrapper{language="python"}
```python
import threading
import queue

task_queue = queue.Queue()

def producer():
    for i in range(5):
        task_queue.put(i)
    task_queue.put(None)      # sentinel value signaling "no more work"

def consumer():
    while (item := task_queue.get()) is not None:
        print(f"processing {item}")
        task_queue.task_done()
    task_queue.task_done()

threading.Thread(target=producer).start()
threading.Thread(target=consumer).start()
```
::

`queue.Queue` handles all locking internally — `put()`/`get()` are safe to call concurrently from any number of threads without a manual `Lock`, making it the preferred way to hand data between threads instead of shared mutable variables protected by hand-managed locks.

## `concurrent.futures` — The High-Level Pool API

::code-wrapper{language="python"}
```python
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests

urls = ["https://example.com"] * 5

with ThreadPoolExecutor(max_workers=5) as executor:
    futures = {executor.submit(requests.get, url): url for url in urls}
    for future in as_completed(futures):
        url = futures[future]
        try:
            response = future.result()
            print(f"{url}: {response.status_code}")
        except Exception as exc:
            print(f"{url} raised {exc!r}")
```
::

`ThreadPoolExecutor` manages a fixed pool of worker threads and a task queue for you — `submit()` returns a `Future` immediately (non-blocking), and `.result()` blocks until that specific task completes, re-raising any exception the task raised. This is almost always preferable to manually creating and joining `Thread` objects for anything beyond a couple of one-off threads.

## `multiprocessing` — True Parallelism via Separate Processes

::code-wrapper{language="python"}
```python
from multiprocessing import Process, Pool
import os

def cpu_bound_work(n):
    total = 0
    for i in range(n):
        total += i
    return total

if __name__ == "__main__":     # REQUIRED on Windows/macOS spawn start method — see gotcha below
    with Pool(processes=4) as pool:
        results = pool.map(cpu_bound_work, [50_000_000] * 4)
    print(results)   # genuinely runs on 4 cores in parallel — no GIL contention, separate interpreters
```
::

Each process spawned by `multiprocessing` gets its **own Python interpreter and its own GIL** — there is no shared memory and no lock contention between them, which is why CPU-bound work genuinely parallelizes across cores this way. The cost: data passed between processes must be **pickled** (chapter 18) to cross the process boundary, which has real overhead for large objects, and processes don't share global variables or objects by default.

::code-wrapper{language="python"}
```python
from multiprocessing import Process, Value, Array, Manager

def worker(shared_counter, lock):
    with lock:
        shared_counter.value += 1

if __name__ == "__main__":
    from multiprocessing import Lock
    counter = Value("i", 0)          # 'i' = C int, allocated in SHARED memory across processes
    lock = Lock()
    processes = [Process(target=worker, args=(counter, lock)) for _ in range(10)]
    for p in processes:
        p.start()
    for p in processes:
        p.join()
    print(counter.value)   # 10 — Value/Array are the explicit mechanisms for sharing primitive state
```
::

`Value` and `Array` are `multiprocessing`'s narrow escape hatches for sharing simple, fixed-layout data (a single number, a fixed-size array) across process boundaries via actual shared memory — for anything more complex (dicts, lists, custom objects), use a `Manager()`, which runs a separate server process brokering access, at higher overhead than `Value`/`Array` but much more flexible.

## `if __name__ == "__main__":` — Not Optional With `multiprocessing`

::code-wrapper{language="python"}
```python
# WRONG on Windows and macOS (default 'spawn' start method) — causes infinite recursive process spawning
from multiprocessing import Process

def worker():
    print("working")

p = Process(target=worker)   # module-level code, NOT guarded
p.start()
# When spawn re-imports this module in the child process, THIS LINE RUNS AGAIN,
# spawning another child, which re-imports and spawns another... (RuntimeError, usually caught by a guard)
```
::

On the `spawn` start method (the default on Windows and macOS since Python 3.8), each new process is a **fresh interpreter that re-imports the launching module from scratch** — any code at module level (not inside `if __name__ == "__main__":`) re-executes in the child, including the `Process(...).start()` call itself if it isn't guarded, causing runaway recursive process creation. On Linux, the default `fork` start method copies the parent's already-initialized memory instead, which is why this bug is often invisible in Linux-only development and then explodes in CI or on a teammate's Mac.

::code-wrapper{language="python"}
```python
from multiprocessing import Process

def worker():
    print("working")

if __name__ == "__main__":    # guards module-level process-spawning code — REQUIRED, not just tidy style
    p = Process(target=worker)
    p.start()
    p.join()
```
::

## `ProcessPoolExecutor` — The High-Level Multiprocessing API

::code-wrapper{language="python"}
```python
from concurrent.futures import ProcessPoolExecutor

def is_prime(n):
    if n < 2:
        return False
    return all(n % i for i in range(2, int(n ** 0.5) + 1))

if __name__ == "__main__":
    numbers = list(range(100_000, 100_020))
    with ProcessPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(is_prime, numbers))
    print(list(zip(numbers, results)))
```
::

`ProcessPoolExecutor` shares the exact same `.submit()`/`.map()`/`as_completed()` API as `ThreadPoolExecutor` — swapping between thread-based and process-based parallelism for a given workload is often a one-line change, which makes it easy to benchmark both and pick whichever actually performs better for the workload at hand.

## Choosing Threading vs Multiprocessing vs Async

| Workload | Best tool | Why |
|---|---|---|
| I/O-bound (network, disk, waiting) | `threading` or `asyncio` | GIL is released during I/O waits; no need for separate processes |
| CPU-bound (heavy computation) | `multiprocessing` | Bypasses the GIL entirely via separate interpreters/processes |
| Thousands of concurrent I/O tasks | `asyncio` | Threads have real memory/OS overhead per thread; coroutines are far cheaper (chapter 22) |
| Mixed / simplicity over raw throughput | `concurrent.futures` (either pool) | Uniform, simple API; easy to swap thread pool for process pool |

## 💡 Tips & Tricks

- **Performance**: profile before reaching for `multiprocessing` — process creation and pickling data across the boundary has real overhead, and for small workloads a naive multiprocessing version can be slower than a single-threaded one; it pays off on genuinely CPU-heavy, easily-partitioned work.
- **Debug**: a hanging program that never exits is often a `Lock` acquired but never released on an exception path, or a non-daemon thread that was never `.join()`-ed — use `threading.enumerate()` to list all currently alive threads when diagnosing a hang.
- **Idiom**: prefer `concurrent.futures` (`ThreadPoolExecutor`/`ProcessPoolExecutor`) over raw `threading.Thread`/`multiprocessing.Process` for anything beyond a single one-off background task — the pool API handles queuing, result collection, and exception propagation for you.
- **Safety**: never share a mutable object across threads without a `Lock` (or use `queue.Queue`, which is internally safe) — "it worked in my testing" is not evidence of thread safety, since race conditions are often timing-dependent and can pass thousands of test runs before failing in production under different load.
- **Idiom**: set `daemon=True` on background threads that should not prevent the program from exiting (e.g., a periodic heartbeat) — a non-daemon thread that's still running keeps the entire Python process alive even after `main()` returns.

## ⚠️ Edge Cases & Gotchas

- **The GIL means `threading` provides no real parallelism for CPU-bound Python code** — adding more threads to a compute-heavy loop can even be slower than sequential execution, due to the overhead of the GIL being repeatedly released and reacquired between threads; use `multiprocessing` for CPU-bound parallelism instead.
- **`counter += 1` is not atomic**, even though it looks like a single operation — it's a read, an add, and a write, and the GIL can switch threads between any of those steps, producing lost updates under concurrent access without a `Lock`.
- **On Windows and macOS, `multiprocessing` code not guarded by `if __name__ == "__main__":` can spawn processes recursively without bound**, because the `spawn` start method re-imports the launching module fresh in every child process, re-running any unguarded module-level code including the process-creation call itself.
- **Data passed to a `multiprocessing.Pool` or `Process` must be picklable** — lambdas, open file handles, database connections, and many other objects can't cross the process boundary and raise `PicklingError` at the point of submission, not always where the developer expects.
- **A `Lock` acquired in a `try` block without `finally` (or, better, without using `with lock:`) that is never released on an exception path causes every other thread waiting on that same lock to block forever** — a silent deadlock with no traceback, since the waiting threads are simply parked, not crashed.

## 🧠 Spot the Bug

A script fans out ten "download and process" tasks across threads and accumulates results into a shared list. It occasionally produces fewer than ten results, with no exception raised. Find the bug.

::code-wrapper{language="python"}
```python
import threading

results = []

def fetch_and_store(item_id):
    data = f"result-{item_id}"
    if len(results) < 10:
        results.append(data)

threads = [threading.Thread(target=fetch_and_store, args=(i,)) for i in range(10)]
for t in threads:
    t.start()
for t in threads:
    t.join()

print(len(results))   # sometimes 10, sometimes less
```
::

<details>
<summary>Answer</summary>

`list.append()` itself is thread-safe in CPython (it's a single bytecode-level operation protected by the GIL), but `if len(results) < 10: results.append(data)` is **two separate operations** — a length check, then an append — with no atomicity guarantee across the two. Between one thread checking `len(results) < 10` and it actually calling `.append()`, other threads can interleave, but that's not even the real bug here (all 10 threads should still append since none of them exceed 10 in this scenario) — the actual issue is subtler: `len(results) < 10` is a check-then-act race in general, and in a variation of this pattern with more threads than the limit, some threads pass the check with a stale length, all append, and the list ends up *larger* than intended, or (as observed here) if any exception occurs inside a thread's target function it is silently swallowed by `threading.Thread` — printed to stderr but never re-raised to the main thread — masking a `fetch_and_store` failure entirely and undercounting `results` with no visible traceback in the main thread's flow.

The fix is a lock around the read-modify-write of the shared list, and explicit propagation of any exception raised inside a thread:
::code-wrapper{language="python"}
```python
import threading

results = []
lock = threading.Lock()
errors = []

def fetch_and_store(item_id):
    try:
        data = f"result-{item_id}"
        with lock:
            results.append(data)
    except Exception as exc:
        errors.append(exc)

threads = [threading.Thread(target=fetch_and_store, args=(i,)) for i in range(10)]
for t in threads:
    t.start()
for t in threads:
    t.join()

if errors:
    raise errors[0]
print(len(results))   # reliably 10
```
::

**The lesson**: `threading.Thread` swallows exceptions raised inside the target function (printing a traceback to stderr but not stopping the main thread or `.join()`), and any check-then-act sequence on shared mutable state needs a `Lock` around the whole sequence, not just the final mutation — always assume interleaving can happen between any two lines touching shared state.

</details>

## Key Takeaways

- The GIL allows only one thread to execute Python bytecode at a time in CPython, which means `threading` does not provide real parallelism for CPU-bound work — it's only helpful for I/O-bound work, where the GIL is released during waits.
- `multiprocessing` sidesteps the GIL by using separate OS processes with their own interpreters, at the cost of pickling overhead for data crossing the process boundary and no default shared memory.
- Shared mutable state accessed from multiple threads needs an explicit `Lock` around every read-modify-write sequence — operations that look atomic (`counter += 1`, "check then append") frequently are not.
- `if __name__ == "__main__":` is mandatory, not stylistic, around `multiprocessing` code on Windows/macOS — the `spawn` start method re-imports the module fresh in each child process.
- `concurrent.futures.ThreadPoolExecutor`/`ProcessPoolExecutor` provide a uniform, higher-level pool API that's usually preferable to hand-managing raw `Thread`/`Process` objects, and make it easy to switch between the two.
- Exceptions raised inside a `threading.Thread` target are not automatically propagated to the main thread — they must be explicitly caught and communicated back (e.g., via a shared list, `queue.Queue`, or `concurrent.futures.Future.result()`, which does re-raise).
