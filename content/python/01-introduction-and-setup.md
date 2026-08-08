# 01 — Introduction & Setup

## What Is Python?

Python is a **high-level, dynamically typed, multi-paradigm** language created by Guido van Rossum, first released in 1991. Key characteristics:

- **Dynamic typing** — variables are names bound to objects; a name can be rebound to a value of any type at runtime.
- **Interpreted, but compiled to bytecode** — source (`.py`) is compiled to bytecode (`.pyc`) which runs on a virtual machine (the CPython VM). It is not "purely interpreted" line-by-line, nor is it compiled to native machine code ahead of time like C or Rust.
- **Multi-paradigm** — supports procedural, object-oriented (everything is an object), and functional styles (first-class functions, closures, `map`/`filter`).
- **Batteries included** — a large standard library (`os`, `json`, `datetime`, `collections`, `itertools`, `asyncio`, and more) ships with every installation.
- **Readable by design** — enforced significant whitespace (indentation defines blocks) and a philosophy captured in [PEP 20 — The Zen of Python](https://peps.python.org/pep-0020/): "There should be one — and preferably only one — obvious way to do it."
- **Reference-counted with cycle-detecting GC** — objects are freed via reference counting; a generational garbage collector handles reference cycles.

Run `import this` in any Python REPL to print the Zen of Python — it's an actual Easter egg module, not just a saying.

## CPython vs Other Implementations

"Python" is a *language specification*; there are multiple *implementations* that run it.

| Implementation | Description | When to use |
|---|---|---|
| **CPython** | The reference implementation, written in C. What you get from python.org, `pyenv`, `apt`, `brew`. | Default choice for almost everything. |
| **PyPy** | A Python implementation with a JIT (just-in-time) compiler, written in RPython. Often 4–10x faster for long-running, CPU-bound pure-Python code. | Long-running numeric/algorithmic workloads without heavy C-extension dependencies. |
| **Jython** | Runs on the JVM, compiles to Java bytecode. Largely inactive/legacy. | Interop with existing JVM codebases (rare today). |
| **IronPython** | Runs on .NET/CLR. | Interop with .NET codebases. |
| **MicroPython** | A lean reimplementation for microcontrollers. | Embedded systems (ESP32, Raspberry Pi Pico). |

Unless you have a specific reason (JIT speed, embedded target, VM interop), you want **CPython**. This curriculum assumes CPython 3.11+.

### Why "the GIL" matters even at this stage

CPython has a **Global Interpreter Lock (GIL)** — only one thread executes Python bytecode at a time, even on multi-core machines. This shapes idiomatic Python: CPU-bound parallelism uses `multiprocessing` (separate processes, no shared GIL) rather than `threading`. Chapter 21 covers this in depth — mentioned here because it explains *why* Python's concurrency story looks different from Java's or Go's from day one.

## Python 2 vs Python 3

Python 2 reached end-of-life on **January 1, 2020**. Every example in this curriculum targets **Python 3.11+**. If you encounter Python 2 code (`print "hello"` without parentheses, `xrange`, implicit integer division truncation being the *default* for `/`), treat it as legacy and port it — the `2to3` tool and `six` compatibility shims exist but are rarely needed for new work in 2026.

## Installing Python with pyenv

Never rely on your OS's system Python for development — on macOS and Linux it's often outdated, used internally by the OS itself, and modifying it can break system tools. Use a version manager.

::code-wrapper{language="bash"}
```bash
# macOS / Linux — install pyenv
curl https://pyenv.run | bash

# Add to your shell profile (~/.zshrc or ~/.bashrc)
export PYENV_ROOT="$HOME/.pyenv"
export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init -)"

# Restart your shell, then:
pyenv install --list | grep " 3.12"   # see available 3.12.x versions
pyenv install 3.12.4
pyenv global 3.12.4                   # set as the default for your user

# Per-project version (writes a .python-version file)
cd my-project
pyenv local 3.12.4
```
::

::code-wrapper{language="bash"}
```bash
# Verify
python --version    # Python 3.12.4
python3 --version   # same, on systems where "python" still points elsewhere
which python         # confirm it resolves inside ~/.pyenv/shims
```
::

### Windows

Use the official installer from python.org (check "Add python.exe to PATH"), or `pyenv-win`, or the Microsoft Store package for quick starts. For serious development, `pyenv-win` mirrors the Unix workflow above.

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

## Interpreted vs Compiled — Where Python Actually Sits

| | C / Rust | Java / C# | Python (CPython) |
|---|---|---|---|
| Compiles to | Native machine code (ahead of time) | Bytecode (ahead of time), JIT to native at runtime | Bytecode (lazily, on import/first run) |
| Execution | Direct CPU execution | JVM/CLR interprets or JIT-compiles bytecode | CPython VM interprets bytecode (no JIT by default) |
| Type checking | Compile-time (static) | Compile-time (static) | Runtime (dynamic) — see chapter 20 for optional static checking via `mypy` |

Python's lack of a default JIT is precisely why CPU-bound pure-Python loops are slow compared to Java/C#/Rust — and why performance-critical Python code either delegates to C extensions (numpy, pandas — see chapter 26) or reaches for PyPy.

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
