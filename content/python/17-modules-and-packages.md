# 17 — Modules & Packages

## Modules: The Basic Unit of Code Organization

Any `.py` file is a module. Importing it runs the file's top-level code exactly once (subsequent imports reuse the cached result) and binds the module's name in the importer's namespace.

::code-wrapper{language="python"}
```python
# math_utils.py
def add(a, b):
    return a + b

PI = 3.14159
```
::

::code-wrapper{language="python"}
```python
# main.py
import math_utils

print(math_utils.add(2, 3))   # 5
print(math_utils.PI)            # 3.14159

from math_utils import add, PI   # import specific names directly into the current namespace
print(add(1, 1))                   # 2

from math_utils import add as sum_two   # rename on import to avoid clashes
print(sum_two(4, 5))                      # 9
```
::

## `if __name__ == "__main__":`

::code-wrapper{language="python"}
```python
# calculator.py
def add(a, b):
    return a + b

def main():
    print(add(2, 3))

if __name__ == "__main__":
    main()
```
::

Every module has a `__name__` attribute — when a file is run directly (`python calculator.py`), Python sets `__name__` to `"__main__"`; when the same file is *imported* by another module, `__name__` is set to the module's actual name (`"calculator"`) instead. This guard lets a file work both as a reusable, importable library **and** as a standalone script, without the "script" behavior (like `main()`) accidentally running just because something imported it for its functions.

::code-wrapper{language="python"}
```python
import calculator   # does NOT print anything — main() only runs when calculator.py is executed directly
print(calculator.add(10, 20))   # 30 — the function is still perfectly usable
```
::

## Packages: Directories of Modules

A **package** is a directory containing an `__init__.py` file (making it importable as a single namespace) plus any number of module files or sub-packages.

::code-wrapper{language="python"}
```bash
myapp/
    __init__.py
    models.py
    utils/
        __init__.py
        validation.py
        formatting.py
```
::

::code-wrapper{language="python"}
```python
# myapp/__init__.py
from .models import User          # re-export for a cleaner public API
__version__ = "1.0.0"
```
::

::code-wrapper{language="python"}
```python
# usage from outside the package
from myapp import User             # works because __init__.py re-exported it
from myapp.utils.validation import is_valid_email
import myapp
print(myapp.__version__)             # "1.0.0"
```
::

`__init__.py` runs once, the first time any part of the package is imported — it's the natural place to define a curated public API (via re-exports) and package-level metadata like `__version__`, hiding internal module structure from consumers who shouldn't need to know it.

## Absolute vs Relative Imports

::code-wrapper{language="python"}
```python
# myapp/utils/formatting.py

# Absolute import — spells out the full path from the top-level package; unambiguous, preferred
from myapp.utils.validation import is_valid_email

# Relative import — relative to the CURRENT module's position in the package
from . import validation          # "." = same directory (myapp/utils/)
from .validation import is_valid_email
from .. import models               # ".." = one level up (myapp/)
```
::

**Best practice** (PEP 8): prefer absolute imports for clarity — they remain correct even if a module is moved elsewhere within the package, and they make the source of every imported name immediately obvious when reading the file in isolation. Relative imports are more common in tightly-coupled internal package code, where hardcoding the full package name in every file would be brittle if the package itself gets renamed.

## Circular Imports — Why They Happen and How to Fix Them

::code-wrapper{language="python"}
```python
# a.py
from b import func_b

def func_a():
    return func_b() + 1
```
::

::code-wrapper{language="python"}
```python
# b.py
from a import func_a    # circular! a imports b, b imports a

def func_b():
    return 1

def func_c():
    return func_a() + 1
```
::

::code-wrapper{language="python"}
```python
import a
# ImportError: cannot import name 'func_a' from partially initialized module 'a'
# (most likely due to a circular import)
```
::

When `a.py` is imported, Python starts executing it top-to-bottom; its first line tries to import `b`, so Python starts executing `b.py`; `b.py`'s first line tries to import `func_a` from `a` — but `a` is still mid-import (its module object exists in `sys.modules`, but execution hasn't reached the point of defining `func_a` yet), so the name isn't there yet, and the import fails.

### Fix 1: import the module, not the name, and defer attribute access

::code-wrapper{language="python"}
```python
# b.py
import a                # imports the MODULE object, doesn't need func_a to exist YET

def func_c():
    return a.func_a() + 1   # func_a is looked up at CALL time, by which point a is fully loaded
```
::

### Fix 2: move the import inside the function (local import)

::code-wrapper{language="python"}
```python
# b.py
def func_c():
    from a import func_a    # deferred until func_c is actually CALLED, long after both modules finished loading
    return func_a() + 1
```
::

### Fix 3: restructure — the real fix

Circular imports are usually a signal of a genuine design problem: two modules that are too tightly coupled. The most durable fix is extracting the shared logic both modules need into a third module that neither `a` nor `b` needs to import the other for.

## `__all__` — Controlling `from module import *`

::code-wrapper{language="python"}
```python
# strings_utils.py
__all__ = ["slugify", "truncate"]     # explicitly whitelists what * imports

def slugify(text):
    return text.lower().replace(" ", "-")

def truncate(text, length):
    return text[:length]

def _internal_helper():               # not in __all__ — excluded from *, even without leading underscore protection
    pass
```
::

::code-wrapper{language="python"}
```python
from strings_utils import *
print(slugify("Hello World"))   # "hello-world" — works
# _internal_helper()             # NameError — not exported by *, though still directly importable by name
```
::

**Best practice**: avoid `from module import *` in production code regardless of `__all__` — it makes it impossible to tell, just by reading a file, where a given name came from, which defeats a large part of what makes Python code easy to trace and refactor. `__all__` is still worth setting on public library modules, since it also affects what tools like Sphinx/IDEs consider "public API."

## The Import System: `sys.path` and `sys.modules`

::code-wrapper{language="python"}
```python
import sys
print(sys.path)         # list of directories Python searches, in order, for modules to import
print(sys.modules.keys())   # every module already imported this process — a CACHE

import math_utils
import math_utils          # second import does NOT re-run the file — returns the cached module object
print(sys.modules["math_utils"] is math_utils)   # True
```
::

Because `sys.modules` caches by name, importing the same module twice (even from different places in a codebase) always yields the *same* module object — any mutable state a module defines at the top level is genuinely shared and can be mutated by one importer and observed by another, a pattern sometimes used deliberately for singletons, and sometimes a source of surprising coupling when done accidentally.

### Reloading a module (rare, mostly for interactive use)

::code-wrapper{language="python"}
```python
import importlib
import math_utils
importlib.reload(math_utils)   # re-executes the module's top-level code, useful in long-running REPLs/notebooks
```
::

## `pyproject.toml` and Package Discovery (Brief Preview)

Modern Python packaging (fully covered in chapter 25) declares a package's structure declaratively:

::code-wrapper{language="ini"}
```toml
[project]
name = "myapp"
version = "1.0.0"

[tool.setuptools.packages.find]
where = ["src"]
```
::

::code-wrapper{language="bash"}
```bash
src/
    myapp/
        __init__.py
        models.py
```
::

The `src/` layout (package code nested one level deeper than the project root) is increasingly the recommended convention — it prevents accidentally importing the package from the working directory instead of the properly-installed version, a subtle bug that a flat layout (package directory directly at the project root) is prone to.

## Namespace Packages (No `__init__.py` Required)

::code-wrapper{language="python"}
```python
# Since Python 3.3, a directory WITHOUT __init__.py can still be a "namespace package" —
# used for splitting a single logical package's code across multiple distributions.
# For almost all ordinary projects, still include __init__.py explicitly —
# it's clearer, and required for re-exports and package-level code to run at all.
```
::

## 💡 Tips & Tricks

- **Idiom**: keep `__init__.py` files thin — a handful of re-exports and `__version__`, not business logic — so that importing the top-level package doesn't accidentally trigger expensive work (database connections, network calls) as a side effect of merely importing something from it.
- **Debug**: `python -c "import module_name; print(module_name.__file__)"` instantly tells you *which* file on disk a given import actually resolved to — invaluable when multiple installed versions or a stray local file might be shadowing what you expect.
- **Idiom**: local (function-level) imports are a legitimate, common fix for circular imports — but overusing them for imports that don't need to be deferred (as a habit rather than a fix) hides a module's real dependencies from readers scanning the top of the file.
- **Debug**: `sys.path.insert(0, "...")` at the top of a script is a common quick hack to make an ad-hoc script find a package — but for real projects, an editable install (`pip install -e .`, chapter 25) is the durable fix, since path hacks are fragile and don't travel with the code.
- **Idiom**: `__all__` doubles as living documentation of a module's public surface — even projects that never use `from x import *` benefit from setting it, since IDEs and autocomplete tools respect it too.

## ⚠️ Edge Cases & Gotchas

- **A module's top-level code runs exactly once per process, the first time it's imported anywhere — later imports return the cached object from `sys.modules` without re-running anything**, including any print statements, network calls, or global mutable state initialization at the top level.
- **Circular imports fail with a confusing `ImportError` about a "partially initialized module," not an obviously-named "circular import" error** — recognizing this specific message is the fast path to diagnosing the real cause.
- **A local file that happens to share a name with a standard-library or installed package (e.g., a project's own `random.py` or `json.py`) silently shadows the real one for any import inside that directory** — this produces baffling `AttributeError`s on functions that definitely exist in the "real" module, because Python is actually importing your file instead.
- **`from module import *` silently skips any name starting with an underscore UNLESS it's explicitly listed in `__all__`** — and if `__all__` is defined, `*` imports ONLY the names in it, even ones without a leading underscore, meaning `__all__`'s presence fully overrides the "no leading underscore" default rule rather than adding to it.
- **Relative imports (`from . import x`) only work inside a package being imported as a package — running a file directly with `python somefile.py` when it contains relative imports raises `ImportError: attempted relative import with no known parent package`**, since the file's `__name__` is `"__main__"` with no package context at all in that mode.

## 🧠 Spot the Bug

A small project has a `utils.py` inside its package that shadows a name the developer didn't expect. Find the issue.

::code-wrapper{language="python"}
```python
# project structure:
# myapp/
#     __init__.py
#     queue.py
#     worker.py

# myapp/queue.py
import queue    # intends to import the STANDARD LIBRARY queue module

class TaskQueue:
    def __init__(self):
        self.q = queue.Queue()
```
::

<details>
<summary>Answer</summary>

`import queue` inside `myapp/queue.py` imports **itself**, not the standard library `queue` module — because the current package's directory is searched (as part of how Python resolves absolute imports inside a package in some configurations, and definitively so for any implicit relative-import-like resolution) and `myapp/queue.py` matches the name `queue` before the interpreter reaches the standard library entry on `sys.path`. This typically manifests as `AttributeError: module 'queue' has no attribute 'Queue'` — because `queue` resolved to the local file (which has no `Queue` class), not `queue.Queue` from the standard library, even though the error message doesn't say anything about "wrong module" directly.

The fix is to never name a module the same as a standard-library or widely-used third-party module — rename the local file:
::code-wrapper{language="python"}
```python
# myapp/task_queue.py
import queue   # now unambiguously the standard library

class TaskQueue:
    def __init__(self):
        self.q = queue.Queue()
```
::

If renaming isn't immediately possible, Python 3's absolute-import-by-default behavior (PEP 328) makes this specific collision less common than it was in Python 2, but it still occurs, particularly with `__init__.py`-relative resolution quirks and tooling that manipulates `sys.path` — the safest fix is always avoiding the name collision outright.

**The lesson**: never name a project module identically to a standard-library module (`queue`, `json`, `types`, `email`, `string`, `random` are common real-world collisions) — the failure mode is a confusing `AttributeError` deep inside code that looks completely correct, not an obvious import error pointing at the real cause.

</details>

## Key Takeaways

- A module's top-level code executes exactly once per process, cached in `sys.modules`; `if __name__ == "__main__":` lets a file work both as an importable library and a standalone script.
- Packages are directories with `__init__.py`; keep that file thin (re-exports and metadata) to avoid surprising side effects on import.
- Prefer absolute imports for clarity; relative imports (`from . import x`) are common inside tightly-coupled package-internal code but fail when the file is run directly rather than imported as part of a package.
- Circular imports produce a distinctive "partially initialized module" `ImportError` — fix by importing the module (not specific names) and deferring attribute access, moving the import inside a function, or restructuring shared logic into a third module.
- `__all__` controls what `from module import *` exports and doubles as documentation of a module's public surface — but avoid `import *` in real code regardless, since it obscures where names came from.
- Never name a local module the same as a standard-library module — it silently shadows the real one for any import inside that directory, producing confusing `AttributeError`s far from the actual cause.
