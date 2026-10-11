# 01 — Introduction & Setup

## Execution Model: Source → Bytecode → VM

Python is not "purely interpreted". CPython does two steps:

1. It **compiles** your `.py` source into **bytecode**.
2. The **CPython VM** runs that bytecode, one instruction at a time.

You can see the bytecode with the `dis` module:

::code-wrapper{language="python"}
```python
import dis

def add(a, b):
    return a + b

dis.dis(add)
# Output on 3.14 (opcode names change between versions!):
#   RESUME                   0
#   LOAD_FAST_BORROW_LOAD_FAST_BORROW 1 (a, b)
#   BINARY_OP                0 (+)
#   RETURN_VALUE
```
::

**Tricky**: `a + b` is ONE bytecode op (`BINARY_OP`), but that op does a lot. It must check the types at run time, because `add(1, 2)`, `add("a", "b")` and `add([1], [2])` all use the same bytecode:

::code-wrapper{language="python"}
```python
def add(a, b):
    return a + b

print(add(1, 2))        # 3
print(add("1", "2"))    # '12'   — same bytecode, string concat
print(add([1], [2]))    # [1, 2] — same bytecode, list concat
print(add(1, "2"))      # TypeError: unsupported operand type(s) for +: 'int' and 'str'
```
::

The error happens at **run time**, not when the file is compiled. Python compiles the whole file first, so a `SyntaxError` stops everything, but a `TypeError` only appears when that line runs:

::code-wrapper{language="python"}
```python
def never_called():
    return 1 + "2"       # bug, but no error — this line never runs

print("still works")     # prints fine

# def broken(:          # a SyntaxError anywhere stops the WHOLE file, even line 1
```
::

### Implementation Landscape

| Implementation | Engine | Use Case |
|---|---|---|
| **CPython** | C interpreter (3.13+ has an experimental JIT and a free-threaded build) | Default — the reference implementation. All examples here target CPython 3.11+. |
| **PyPy** | JIT compiler, often 4–10× faster on long pure-Python loops | CPU-bound code without heavy C-extension dependencies. |
| **MicroPython** | Small interpreter for microcontrollers | ESP32, Raspberry Pi Pico — reduced stdlib. |

### The GIL — one thread runs Python bytecode at a time

In the standard CPython build, the **Global Interpreter Lock (GIL)** lets only one thread run Python bytecode at any moment. Threads still help when you wait for I/O (network, disk), because the GIL is released while waiting. They do **not** help for pure-Python math.

::code-wrapper{language="python"}
```python
import threading, time

def work():
    sum(i * i for i in range(5_000_000))

t0 = time.perf_counter()
work(); work()
print(f"sequential: {time.perf_counter() - t0:.2f}s")

t0 = time.perf_counter()
ts = [threading.Thread(target=work) for _ in range(2)]
for t in ts: t.start()
for t in ts: t.join()
print(f"2 threads:  {time.perf_counter() - t0:.2f}s")   # about the SAME — not 2× faster
```
::

Use `multiprocessing` for CPU-bound parallel work (chapter 21). Python 3.13+ also has an optional **free-threaded** build (`python3.13t`) without the GIL.

## Environment Setup

Never develop with the system Python. macOS and Linux distros ship an old version that OS tools depend on.

::code-wrapper{language="bash" filename="setup.sh"}
```bash
# Option A: uv (recommended) — installs Python AND manages venvs
curl -LsSf https://astral.sh/uv/install.sh | sh
uv python install 3.12
uv venv .venv
source .venv/bin/activate

# Option B: pyenv + venv (traditional)
curl https://pyenv.run | bash
pyenv install 3.12
pyenv local 3.12              # writes .python-version in this folder
python -m venv .venv
source .venv/bin/activate
```
::

Check that you use the Python you think you use:

::code-wrapper{language="bash"}
```bash
which python                                       # must be inside .venv/bin/
python -c "import sys; print(sys.executable)"      # the real interpreter path
python -c "import sys; print(sys.prefix != sys.base_prefix)"   # True → inside a venv
```
::

**Tricky**: `pip install x` and `python -m pip install x` can install into **different** Pythons if your `PATH` has more than one. `python -m pip` always uses the pip that belongs to that `python`.

## The REPL

Python ships an interactive **Read-Eval-Print Loop**:

::code-wrapper{language="python"}
```python
>>> 2 + 2
4
>>> _ * 10          # `_` holds the last printed result (REPL only)
40
>>> "hi"            # the REPL shows repr() — with quotes
'hi'
>>> print("hi")     # print() shows str() — no quotes
hi
>>> x = 5           # assignments print nothing
>>> None            # None prints nothing either
>>>
```
::

**Tricky**: `print()` returns `None`. In the REPL that is hidden, but you can see it:

::code-wrapper{language="python"}
```python
>>> result = print("hello")
hello
>>> print(result)
None
>>> print(print("a"))   # inner print runs first, outer prints its return value
a
None
```
::

`ipython` is a better REPL with colors, tab completion, `%timeit`, and `obj?` for help:

::code-wrapper{language="python"}
```python
In [1]: %timeit sum(range(1000))
6.53 µs ± 45.1 ns per loop (mean ± std. dev. of 7 runs, 100000 loops each)

In [2]: len?          # shows the docstring
```
::

## Running Scripts

::code-wrapper{language="python" filename="hello.py"}
```python
import sys

print("Hello, World!")
print(__name__)     # '__main__' when run directly
print(sys.argv)     # ['hello.py', 'a', 'b'] for: python hello.py a b
```
::

::code-wrapper{language="bash"}
```bash
python hello.py a b
python -c "print(1 + 1)"       # run one line without a file
python -i hello.py             # run, then stay in the REPL with its variables
```
::

### The `__name__ == "__main__"` guard

::code-wrapper{language="python" filename="tools.py"}
```python
def greet(name):
    return f"Hi {name}"

print("tools loaded")          # runs on EVERY import — usually a mistake

if __name__ == "__main__":     # runs ONLY with: python tools.py
    print(greet("Ada"))
```
::

::code-wrapper{language="python"}
```python
import tools        # prints "tools loaded"  (but NOT "Hi Ada")
import tools        # prints nothing — modules run only once per process, then cached
```
::

### Shebang and executable scripts

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

## `.py` vs `.pyc`

- CPython caches compiled bytecode of **imported** modules in `__pycache__/module.cpython-312.pyc`.
- The next import skips the compile step if the source did not change.
- The script you run directly (`python main.py`) is **not** cached — only modules it imports.
- `.pyc` files only skip *compiling*. They do not make the code run faster.

::code-wrapper{language="bash"}
```bash
echo 'X = 1' > mymod.py
python main.py          # main.py does: import mymod
ls __pycache__/
# mymod.cpython-312.pyc        ← no main.cpython-312.pyc!
```
::

## Speed: Python loop vs built-in

The same work can be 10× faster if the loop runs in C instead of in bytecode:

::code-wrapper{language="python"}
```python
import time

N = 5_000_000

t0 = time.perf_counter()
total = 0
for i in range(N):       # N bytecode loops
    total += i
print(f"for loop: {time.perf_counter() - t0:.3f}s")

t0 = time.perf_counter()
total = sum(range(N))    # one C call, loop runs in C
print(f"sum():    {time.perf_counter() - t0:.3f}s")   # several times faster
```
::

**Rule**: prefer built-ins (`sum`, `min`, `max`, `any`, `all`, `sorted`, `"".join`) over hand-written loops.

## Project Structure Conventions

::code-wrapper{language="bash"}
```bash
my-project/
├── pyproject.toml       # project metadata + dependencies (ch. 25)
├── README.md
├── src/
│   └── my_project/
│       ├── __init__.py
│       └── main.py
├── tests/
│   └── test_main.py
└── .python-version      # pinned Python version
```
::

## 💡 Tips & Tricks

- **Debug** — `python -i script.py` runs the script, then opens a REPL with all its variables still alive.
- **Debug** — `breakpoint()` anywhere in code opens the `pdb` debugger at that line. No import needed.
- **Tooling** — `python -m http.server 8000` serves the current folder over HTTP in one command.
- **Safety** — `python -m pip` instead of `pip` guarantees you install into the Python you run.
- **Idiom** — `python -c "import sys; print(sys.version)"` is the fastest way to check the version in CI.
- **Cleanup** — `__pycache__/` is safe to delete at any time. Add it to `.gitignore`.

## ⚠️ Edge Cases & Gotchas

- **Portability** — `python` may not exist, or may be Python 2, on older systems. Use `python3` in portable scripts.
- **Shadowing** — a file named `random.py`, `json.py` or `email.py` in your folder hides the stdlib module. `import random` then imports *your* file:

::code-wrapper{language="python" filename="random.py"}
```python
import random
print(random.randint(1, 6))
# AttributeError: module 'random' has no attribute 'randint'
# (consider renaming '.../random.py' since it has the same name as the
#  standard library module ...)          ← it imported ITSELF (3.13+ message)
```
::

- **Syntax** — mixing tabs and spaces gives `TabError`, even if the editor shows them the same. Use spaces only.
- **REPL only** — `_` (last result) works only at the interactive prompt, not inside scripts.
- **Imports** — `python app/main.py` puts `app/` on `sys.path`; `python -m app.main` puts the *current folder* on `sys.path`. This difference breaks imports (chapter 17).
- **Version** — `sys.version_info >= (3, 11)` works because tuples compare item by item. `sys.version >= "3.9"` is a string compare and is **wrong**: `"3.10" >= "3.9"` is `False`.

## 🧠 Spot the Bug

This script "sometimes" fails with `ModuleNotFoundError`. Why?

::code-wrapper{language="bash"}
```bash
# project/
#   src/
#     app/
#       __init__.py
#       main.py      # does: from app.utils import helper
#       utils.py

cd project/src/app
python main.py
```
::

<details>
<summary>Answer</summary>

`python main.py` puts the script's own folder (`app/`) at `sys.path[0]`. Python then looks for a package `app` *inside* `app/`, and it does not exist.

Fix: run it as a module from `src/`:

::code-wrapper{language="bash"}
```bash
cd project/src
python -m app.main
```
::

Now `src/` is on `sys.path`, so `app` is found as a top-level package.

</details>

## 🧠 Quick Quiz

What does this print?

::code-wrapper{language="python"}
```python
x = print("A"), print("B")
print(x)
```
::

<details>
<summary>Answer</summary>

::code-wrapper{language="bash"}
```bash
A
B
(None, None)
```
::

The comma makes a tuple. Both `print` calls run left to right, and each returns `None`.

</details>

## Key Takeaways

- CPython compiles source to bytecode, then runs it in a VM. Type errors appear only when a line runs.
- Imported modules are cached as `.pyc` in `__pycache__/`; the main script is not.
- Use `uv` or `pyenv` plus a venv per project. Use `python -m pip`.
- The GIL stops threads from speeding up CPU-bound pure Python code.
- How you start a script (`python file.py` vs `python -m pkg.mod`) changes `sys.path` and can break imports.
