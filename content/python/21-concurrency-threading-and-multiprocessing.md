# 21 — Concurrency: Threading & Multiprocessing

## Starting a Thread

::code-wrapper{language="python"}
```python
import threading, time

def work(name, delay):
    time.sleep(delay)          # sleeping/waiting releases the GIL
    print(f"{name} done")

t1 = threading.Thread(target=work, args=("A", 1))
t2 = threading.Thread(target=work, args=("B", 1))
t1.start(); t2.start()         # both sleep AT THE SAME TIME
t1.join(); t2.join()           # wait for both — total ≈ 1s, not 2s
```
::

### Three classic mistakes

::code-wrapper{language="python"}
```python
# 1. Calling the function instead of passing it
threading.Thread(target=work("A", 1))   # runs work() NOW, in the main thread,
                                        # then passes its return value (None) as target

# 2. args must be a tuple — (5) is just 5
def show(n): print(n)
threading.Thread(target=show, args=(5)).start()
# Exception in thread ...: TypeError: show() argument after * must be an iterable, not int
threading.Thread(target=show, args=(5,)).start()   # correct: trailing comma

# 3. run() vs start()
t = threading.Thread(target=show, args=(1,))
t.run()      # runs in the CURRENT thread — no concurrency at all
t.start()    # runs in a NEW thread (and only once — a second start() raises RuntimeError)
```
::

### Exceptions in threads do not reach the main thread

::code-wrapper{language="python"}
```python
results = []

def fetch(i):
    if i == 3:
        raise ValueError("bad item")
    results.append(i)

ts = [threading.Thread(target=fetch, args=(i,)) for i in range(5)]
for t in ts: t.start()
for t in ts: t.join()
print(len(results))   # 4 — a traceback is printed to stderr, but the main thread keeps going
```
::

`ThreadPoolExecutor` fixes this — `.result()` (and `map`) **re-raise** the worker's exception in your thread:

::code-wrapper{language="python"}
```python
from concurrent.futures import ThreadPoolExecutor

with ThreadPoolExecutor() as ex:
    list(ex.map(fetch, range(5)))   # ValueError: bad item — raised right here
```
::

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
print(counter)   # expected 400,000 — MAY print less (lost updates)
```
::

On CPython 3.10+ with the GIL, this exact loop rarely shows the bug, because thread switches happen only at certain points. That makes it **worse**: the code passes tests and fails later (another Python version, the free-threaded build, more load). Force a switch between the read and the write and the bug shows every time:

::code-wrapper{language="python"}
```python
import threading, time

counter = 0

def increment_unsafe():
    global counter
    for _ in range(1000):
        value = counter        # read
        time.sleep(0)          # let another thread run
        counter = value + 1    # write — overwrites the other thread's work

threads = [threading.Thread(target=increment_unsafe) for _ in range(4)]
for t in threads: t.start()
for t in threads: t.join()
print(counter)   # expected 4000 — prints something like 1064
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

Ten threads each add one result. The total is sometimes below 10, but no error stops the program. Why?

::code-wrapper{language="python"}
```python
import threading, time

count = 0

def fetch_and_store(item_id):
    global count
    if item_id == 7:
        raise ConnectionError("timeout")
    current = count
    time.sleep(0.001)          # simulates work between read and write
    count = current + 1

threads = [threading.Thread(target=fetch_and_store, args=(i,)) for i in range(10)]
for t in threads: t.start()
for t in threads: t.join()
print(count)
```
::

<details>
<summary>Answer</summary>

Two bugs:

1. **Race condition** — `current = count` … `count = current + 1` is a read-modify-write. Threads read the same old value and overwrite each other. Result: often `1`, not `9`.
2. **Swallowed exception** — item 7 raises `ConnectionError`. `threading.Thread` prints the traceback to stderr, but the main thread never sees it and prints a number as if all is fine.

Fix both with a lock and a pool that re-raises:

::code-wrapper{language="python"}
```python
import threading
from concurrent.futures import ThreadPoolExecutor

count = 0
lock = threading.Lock()

def fetch_and_store(item_id):
    global count
    if item_id == 7:
        raise ConnectionError("timeout")
    with lock:
        count += 1

with ThreadPoolExecutor() as ex:
    list(ex.map(fetch_and_store, range(10)))   # ConnectionError is raised HERE
```
::

**The lesson**: protect every read-modify-write of shared state with a `Lock`, and use `concurrent.futures` so worker errors reach your code.

</details>

## Key Takeaways

- The GIL allows only one thread to execute Python bytecode at a time in CPython, which means `threading` does not provide real parallelism for CPU-bound work — it's only helpful for I/O-bound work, where the GIL is released during waits.
- `multiprocessing` sidesteps the GIL by using separate OS processes with their own interpreters, at the cost of pickling overhead for data crossing the process boundary and no default shared memory.
- Shared mutable state accessed from multiple threads needs an explicit `Lock` around every read-modify-write sequence — operations that look atomic (`counter += 1`, "check then append") frequently are not.
- `if __name__ == "__main__":` is mandatory, not stylistic, around `multiprocessing` code on Windows/macOS — the `spawn` start method re-imports the module fresh in each child process.
- `concurrent.futures.ThreadPoolExecutor`/`ProcessPoolExecutor` provide a uniform, higher-level pool API that's usually preferable to hand-managing raw `Thread`/`Process` objects, and make it easy to switch between the two.
- Exceptions raised inside a `threading.Thread` target are not automatically propagated to the main thread — they must be explicitly caught and communicated back (e.g., via a shared list, `queue.Queue`, or `concurrent.futures.Future.result()`, which does re-raise).
