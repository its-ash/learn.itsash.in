# 01 — Introduction & Setup

## Execution Model: Source → Bytecode → VM

::code-wrapper{language="python"}
```python
# CPython's execution pipeline, observable from pure Python:
# 1. Source (.py) → compiler → bytecode (platform-independent .pyc)
# 2. Bytecode → CPython VM eval loop → execution
# 3. .pyc cached in __pycache__/ to skip step 1 on subsequent imports

import dis, sys, types

# Compile a function and inspect its bytecode — this is what the VM actually executes
def pipeline_example(data: list[int]) -> int:
    total = 0
    for item in data:
        if item > 0:                    # POP_JUMP_IF_FALSE branches at bytecode level
            total += item               # BINARY_OP in-place add
    return total

# disassembles to CPython bytecode — each line is one VM instruction
dis.dis(pipeline_example)
#  2           0 RESUME                   0      ← 3.11+ opcode, coroutine-aware entry
#  3           2 LOAD_CONST               1 (0)  ← push literal 0 onto value stack
#              4 STORE_FAST               1 (total) ← store into fast local slot 1
#  4           6 LOAD_FAST                1 (total) ← load local for loop init
#  ... (full output shows LOAD_FAST, BINARY_OP, POP_JUMP_IF_FALSE, JUMP_BACKWARD)

# The bytecode object itself is a real object you can inspect
code = pipeline_example.__code__
print(f"argcount={code.co_argcount}, varnames={code.co_varnames}")
print(f"stacksize={code.co_stacksize}  ← max value-stack depth the VM needs")
print(f"consts={code.co_consts}  ← literals folded into the code object at compile time")
```
::

::code-wrapper{language="python"}
```python
# Production-grade: a bytecode-level hot-path analyzer
# Walks a function's code object to count specific opcodes — useful for
# understanding why a "simple" function is slow without a full profiler

import dis
from collections import Counter

def opcode_profile(func):
    """Count VM opcodes in a function — reveals hidden overhead in 'simple' code."""
    counts = Counter()
    for instr in dis.get_instructions(func):
        counts[instr.opname] += 1
    return counts

def naive_sum(data):
    total = 0
    for x in data:
        total += x          # LOAD_FAST + LOAD_CONST + BINARY_OP + STORE_FAST per iteration
    return total

profile = opcode_profile(naive_sum)
# Each loop iteration = ~4 opcodes × N iterations — this is why pure-Python
# loops are O(N) bytecode dispatches while sum(data) is a single C call
print(profile.most_common(5))
# [('LOAD_FAST', ...), ('STORE_FAST', ...), ('BINARY_OP', ...), ...]
```
::

### Implementation Landscape

| Implementation | Engine | Use Case |
|---|---|---|
| **CPython** | C interpreter, no JIT (3.13 adds experimental JIT) | Default — the reference implementation. All examples here target CPython 3.11+. |
| **PyPy** | RPython JIT, 4–10× faster on long-running pure-Python | CPU-bound workloads without heavy C-extension dependencies. |
| **MicroPython** | Lean interpreter for embedded | ESP32, Raspberry Pi Pico — restricted stdlib, no `asyncio` in full form. |

### The GIL — architectural constraint, not a bug

::code-wrapper{language="python"}
```python
# The GIL (Global Interpreter Lock) means only ONE thread executes CPython
# bytecode at any instant — even on a 64-core machine. This is because
# CPython's reference counting (refcount in every PyObject header) is not
# thread-safe without a global lock.
#
# Consequence: threading gives NO speedup for CPU-bound pure Python.
# Use multiprocessing (separate interpreters, separate GILs) for CPU parallelism.
# Use threading/asyncio for I/O-bound work (GIL released during I/O waits).

import threading, time, multiprocessing as mp

def cpu_bound(n):
    return sum(i * i for i in range(n))

if __name__ == "__main__":
    N = 20_000_000

    # Sequential baseline
    t0 = time.perf_counter(); cpu_bound(N); cpu_bound(N)
    print(f"sequential: {time.perf_counter() - t0:.2f}s")

    # Threading — NO parallelism for CPU-bound work (GIL serializes)
    t0 = time.perf_counter()
    threads = [threading.Thread(target=cpu_bound, args=(N,)) for _ in range(2)]
    for t in threads: t.start()
    for t in threads: t.join()
    print(f"2 threads (CPU-bound): {time.perf_counter() - t0:.2f}s  ← ~same as sequential")

    # Multiprocessing — TRUE parallelism (separate processes, separate GILs)
    t0 = time.perf_counter()
    with mp.Pool(2) as pool:
        pool.map(cpu_bound, [N, N])
    print(f"2 processes (CPU-bound): {time.perf_counter() - t0:.2f}s  ← ~half")
```
::

## Production Environment Setup

::code-wrapper{language="bash" filename="setup.sh"}
```bash
# ── Production-grade Python environment bootstrap ──
# Never use system Python for development — macOS ships 3.9 for OS tooling,
# Ubuntu ships whatever the distro pinned. Both are stale and shared with OS tools.

# Option A: uv (recommended 2025+) — manages interpreters AND venvs in one tool
curl -LsSf https://astral.sh/uv/install.sh | sh
eval "$(uv generate-shell-support)"   # or restart shell

uv python install 3.12.4               # downloads + installs a standalone CPython
uv python pin 3.12.4                    # writes .python-version for the project
uv venv .venv                           # creates isolated venv with its own site-packages
source .venv/bin/activate
uv pip install -e ".[dev]"              # editable install + dev extras from pyproject.toml

# Option B: pyenv + venv (traditional, works everywhere)
curl https://pyenv.run | bash
export PYENV_ROOT="$HOME/.pyenv"
export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init -)"

pyenv install 3.12.4
pyenv local 3.12.4                     # writes .python-version — pinned per-directory
python -m venv .venv                   # stdlib venv: own interpreter + own site-packages
source .venv/bin/activate
python -m pip install --upgrade pip    # bundled pip may lag by months
```
::

::code-wrapper{language="bash"}
```bash
# Verify the environment is correctly isolated — critical for debugging import issues
which python                           # must resolve INSIDE .venv/bin/, not system
python -c "import sys; print(sys.executable)"  # the actual interpreter binary path
python -c "import sys; print(sys.prefix)"       # venv root — differs from base_prefix
python -c "import sys; print(sys.path)"        # site-packages should be .venv-local
pip show pip | grep Location            # confirms installs land in the right place
```
::

## The REPL

Python ships an interactive **Read-Eval-Print Loop**. It's invaluable for exploring APIs, testing snippets, and debugging.

::code-wrapper{language="bash"}
```bash
python
```
::

::code-wrapper{language="python"}
```python
>>> 2 + 2
4
>>> import math
>>> math.sqrt(16)
4.0
>>> name = "Ada"
>>> f"Hello, {name}!"
'Hello, Ada!'
>>> exit()   # or Ctrl+D
```
::

### IPython — a vastly better REPL

The stock REPL is minimal. `ipython` adds syntax highlighting, tab completion, magic commands, and better tracebacks.

::code-wrapper{language="bash"}
```bash
pip install ipython
ipython
```
::

::code-wrapper{language="python"}
```python
In [1]: %timeit sum(range(1000))
6.53 µs ± 45.1 ns per loop (mean ± std. dev. of 7 runs, 100000 loops each)

In [2]: import requests   # tab-completion, ? for docs
In [3]: requests.get?     # shows docstring and signature
```
::

## Running Scripts

::code-wrapper{language="python" filename="hello.py"}
```python
print("Hello, World!")
```
::

::code-wrapper{language="bash"}
```bash
python hello.py
# Hello, World!

# Run as a module (adds the script's directory to sys.path differently —
# matters for relative imports, see chapter 17)
python -m hello

# Pass arguments
python hello.py arg1 arg2   # available via sys.argv
```
::

### The shebang line and executable scripts

::code-wrapper{language="python" filename="greet.py"}
```python
#!/usr/bin/env python3
print("Hello from an executable script!")
```
::

::code-wrapper{language="bash"}
```bash
chmod +x greet.py
./greet.py
```
::

## `.py` vs `.pyc` — What Actually Happens When You Run Python

A common misconception is that Python is "purely interpreted." In reality:

1. CPython **compiles** your `.py` source into **bytecode** (an intermediate, platform-independent instruction set for the CPython VM).
2. That bytecode is cached in a `__pycache__/` directory as `.pyc` files, named like `module.cpython-312.pyc`, so re-running unchanged modules skips re-compilation.
3. The **CPython VM** then interprets that bytecode — this step is the actual "interpretation."

::code-wrapper{language="bash"}
```bash
# Force-see the bytecode cache
python -c "import mymodule"
ls __pycache__/
# mymodule.cpython-312.pyc

# Inspect bytecode directly
python -c "
import dis
def add(a, b):
    return a + b
dis.dis(add)
"
```
::

::code-wrapper{language="python"}
```python
  2           0 RESUME                   0
  3           2 LOAD_FAST                0 (a)
              4 LOAD_FAST                1 (b)
              6 BINARY_OP                0 (+)
             10 RETURN_VALUE
```
::

This matters because:
- `.pyc` caching is *why* the second run of an unchanged script/module import is faster than the first.
- `.pyc` files are **not** portable across major/minor Python versions or CPU architectures in a meaningful "compiled binary" sense — they're not a substitute for ahead-of-time compilation like C's `.o` files. They only skip the *parse+compile* step, not execution.
- Top-level script files (the one you invoke with `python script.py`) are **not** cached to `.pyc` — only *imported* modules are. This is a frequent point of confusion when people expect `__pycache__` to appear next to their entry-point script.

## Where Python Sits in the Compilation Spectrum

| | C / Rust | Java / C# | CPython | PyPy |
|---|---|---|---|---|
| Compiles to | Native code (AOT) | Bytecode → JIT to native | Bytecode (lazy, on import) | Bytecode → JIT (tracing) |
| Type checking | Compile-time | Compile-time | Runtime (dynamic) | Runtime (dynamic) |
| CPU-bound loop speed | 1× (baseline) | ~0.8–1.2× | ~30–100× slower | ~3–10× slower |

::code-wrapper{language="python"}
```python
# The performance gap, demonstrated — same algorithm, different execution paths
import time

N = 5_000_000

# Pure-Python loop — millions of bytecode dispatches, each with type dispatch overhead
t0 = time.perf_counter()
total = 0
for i in range(N):
    total += i
python_loop = time.perf_counter() - t0     # ~0.3s — each += is 4+ VM opcodes

# Built-in sum() — single C function call, loop runs in compiled C, no per-element dispatch
t0 = time.perf_counter()
total = sum(range(N))                       # C-level iteration, no bytecode per element
builtin_sum = time.perf_counter() - t0      # ~0.03s — 10× faster, same algorithm

# numpy — SIMD-vectorized C, operates on contiguous memory blocks
import numpy as np
t0 = time.perf_counter()
total = int(np.arange(N).sum())              # single C call over a contiguous int64 buffer
numpy_sum = time.perf_counter() - t0         # ~0.005s — 60× faster than the Python loop

print(f"python loop:  {python_loop:.4f}s  ({N:,} bytecode dispatches)")
print(f"builtin sum:  {builtin_sum:.4f}s  (1 C call)")
print(f"numpy sum:    {numpy_sum:.4f}s  (SIMD-vectorized C)")
```
::

## Project Structure Conventions

::code-wrapper{language="bash"}
```bash
my-project/
├── pyproject.toml       # modern project metadata, deps, build config (ch. 25)
├── README.md
├── src/
│   └── my_project/
│       ├── __init__.py
│       ├── main.py
│       └── utils.py
├── tests/
│   └── test_utils.py
└── .python-version      # pyenv local version pin
```
::

## 💡 Tips & Tricks

- **`python -i script.py`** — Debug: runs the script, then drops you into a REPL with all its top-level names still bound, so you can poke at final state without adding `breakpoint()` calls.
- **`python -m` runs installed tools as modules** — `python -m http.server 8000` starts a static file server instantly; `python -m venv .venv` creates a virtual environment; `python -m pip` guarantees you're using the pip tied to *this* interpreter, sidestepping PATH ambiguity between multiple Pythons.
- **`breakpoint()` is the built-in debugger entry point** — Since 3.7, calling `breakpoint()` anywhere in code drops into `pdb` (or whatever `PYTHONBREAKPOINT` points to) at that exact line — no `import pdb; pdb.set_trace()` boilerplate needed.
- **`python -c` for one-liners** — `python -c "import platform; print(platform.python_version())"` runs code without creating a file; useful in shell scripts and CI checks.
- **`__pycache__` and `.pyc` files are safe to delete** — They're purely a compile cache; deleting them just forces recompilation on next import, never a correctness issue (unless you're debugging a Python-version bytecode mismatch bug).

## ⚠️ Edge Cases & Gotchas

- **`python` vs `python3`** — On many Linux distributions and older macOS versions, `python` either doesn't exist or still points to Python 2. Always use `python3` explicitly in portable scripts, or better, use `pyenv`/`uv` so `python` unambiguously resolves to your intended version.
- **`.pyc` files can go stale across environments** — If you copy a `__pycache__` directory between machines running different Python patch versions, CPython detects the mismatch via an embedded magic number and simply recompiles — it does not silently run incompatible bytecode. Still, don't commit `__pycache__/` to version control; add it to `.gitignore`.
- **The REPL's `_` holds the last expression's value** — `>>> 2 + 2` then `>>> _ * 10` gives `40`. This is genuinely useful but invisible unless you know it exists, and it only works for expressions typed directly at the prompt, not inside scripts.
- **Indentation errors are `IndentationError`, not `SyntaxError`, and mixing tabs/spaces is a runtime error, not a style nit** — Python 3 raises `TabError: inconsistent use of tabs and spaces in indentation` if a file mixes them in a way that's ambiguous, even if your editor renders it identically. Configure your editor to insert spaces only.
- **`python script.py` changes `sys.path[0]` differently than `python -m package.module`** — Running a file directly inserts the *script's own directory* at the front of `sys.path`; running with `-m` inserts the *current working directory* instead. This difference is the root cause of many "it works when I run it one way but not the other" import bugs — covered in depth in chapter 17.

## 🧠 Spot the Bug

A teammate says this script "sometimes" fails with `ModuleNotFoundError` depending on how they invoke it. Why?

::code-wrapper{language="bash"}
```bash
# project layout:
# project/
#   src/
#     app/
#       __init__.py
#       main.py      # does `from app.utils import helper`
#       utils.py

cd project/src/app
python main.py
```
::

<details>
<summary>Answer</summary>

Running `python main.py` from inside `app/` puts `app/` itself (not `src/`) at the front of `sys.path`. So `from app.utils import helper` fails — Python is looking for a package named `app` *inside* `app/`, which doesn't exist. The fix is to run it as a module from the `src/` directory instead: `cd project/src && python -m app.main`. This makes `src/` the path root, so `app` resolves as the top-level package, and the internal `app.utils` import works correctly.

**The lesson**: how you invoke a script determines what `sys.path[0]` is, which determines whether internal absolute imports succeed — always run package-internal entry points with `-m` from the project root, not as a bare script from inside the package.

</details>

## Key Takeaways

- Python is dynamically typed, multi-paradigm, and reference-counted with a cycle-collecting GC; CPython is the reference implementation you should default to.
- Python source is compiled to bytecode (cached as `.pyc` in `__pycache__/`) and then interpreted by the CPython VM — it is neither purely interpreted nor ahead-of-time compiled.
- Use `pyenv` to manage Python versions per-project instead of relying on the system Python.
- The REPL (or better, IPython) is a first-class tool for exploration, not just a toy.
- How you invoke a script (`python file.py` vs `python -m pkg.module`) changes `sys.path` and can silently determine whether imports succeed.
