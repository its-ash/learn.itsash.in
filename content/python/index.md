---
title: Learn Python — From Zero to Pro
description: A comprehensive, edge-case-covering, idiomatic Python curriculum. 28 chapters covering syntax, data structures, OOP, decorators, async, typing, testing, packaging, performance, and security. Go from beginner to pro Python developer.
---

# 🐍 Learn Python — From Zero to Pro

A comprehensive, edge-case-covering, idiomatic Python curriculum. Each document is self-contained and covers its concept deeply enough that a careful reader can go from beginner to pro Python developer.

## How to Use This Course

1. **Read sequentially** for a structured path (01 → 28).
2. **Jump to a chapter** as a reference when you hit a concept in the wild.
3. **Run every example** in a REPL or script as you read — Python rewards experimentation.
4. **Do the exercises** in chapter 28 after every few chapters, not just at the end.
5. **Read the CPython source and the standard library** alongside once you reach Part IV.

## Prerequisites

- A working Python 3.11+ installation (managed via `pyenv` is recommended — see chapter 01).
- A code editor (VS Code + Pylance, or PyCharm).
- Comfort with at least one other programming language helps but isn't required.

## Curriculum

### Part I — Foundations

| # | Topic | Why It Matters |
|---|---|---|
| 01 | [Introduction & Setup](/python/01-introduction-and-setup) | CPython vs PyPy, `pyenv`, the REPL, `.py` vs `.pyc`. |
| 02 | [Variables & Data Types](/python/02-variables-and-data-types) | Dynamic typing, `int`/`float`/`bool`/`str`/`None`, duck typing. |
| 03 | [Operators & Expressions](/python/03-operators-and-expressions) | Arithmetic, `is` vs `==`, chained comparisons, the walrus operator. |
| 04 | [Control Flow](/python/04-control-flow) | `if`/`while`/`for`, loop `else`, structural pattern matching (`match`/`case`). |
05 | [Functions](/python/05-functions) | `def`, `*args`/`**kwargs`, the mutable default argument trap. |
| 06 | [Strings & Text](/python/06-strings-and-text) | `str` methods, f-strings, encodings, `bytes` vs `str`, `re`. |
| 07 | [Lists & Tuples](/python/07-lists-and-tuples) | Mutability, slicing, comprehensions, packing/unpacking, `copy`/`deepcopy`. |
| 08 | [Dictionaries & Sets](/python/08-dictionaries-and-sets) | Insertion order, hashing, `defaultdict`, `Counter`, set algebra. |
| 09 | [Comprehensions & Generators](/python/09-comprehensions-and-generators) | All four comprehension forms, `yield`, `yield from`, `itertools`. |

### Part II — Functions & OOP

| # | Topic | Why It Matters |
|---|---|---|
| 10 | [Functional Programming](/python/10-functional-programming) | `lambda`, `map`/`filter`/`reduce`, `functools` (`partial`, `lru_cache`, `wraps`). |
| 11 | [Closures & Decorators](/python/11-closures-and-decorators) | `nonlocal`, writing decorators, parameterized decorators. |
| 12 | [Classes & Objects](/python/12-classes-and-objects) | `__init__`, instance vs class attributes, `self`, dunder overview. |
| 13 | [Inheritance & Polymorphism](/python/13-inheritance-and-polymorphism) | MRO/C3 linearization, `super()`, abstract base classes. |
| 14 | [Magic Methods & Protocols](/python/14-magic-methods-and-protocols) | `__eq__`/`__hash__`, `__getitem__`/`__iter__`, context managers. |
| 15 | [Properties & Descriptors](/python/15-properties-and-descriptors) | `@property`, the descriptor protocol, `__slots__`. |

### Part III — Error Handling & Modules

| # | Topic | Why It Matters |
|---|---|---|
| 16 | [Error Handling](/python/16-error-handling) | `try`/`except`/`else`/`finally`, exception hierarchy, `raise ... from`. |
| 17 | [Modules & Packages](/python/17-modules-and-packages) | Import system, `__init__.py`, circular imports, `__name__ == '__main__'`. |
| 18 | [File I/O & Serialization](/python/18-file-io-and-serialization) | `open()` modes, `pathlib`, `json`/`pickle`/`csv`, encoding pitfalls. |

### Part IV — Advanced Language Features

| # | Topic | Why It Matters |
|---|---|---|
| 19 | [Iterators & Context Managers](/python/19-iterators-and-context-managers) | The iterator protocol, `contextlib`, `itertools` deep dive. |
| 20 | [Type Hints & Typing](/python/20-type-hints-and-typing) | `typing`, generics, `Protocol`, `TypedDict`, `mypy`. |
| 21 | [Concurrency: Threading & Multiprocessing](/python/21-concurrency-threading-and-multiprocessing) | The GIL, `threading`, `multiprocessing`, race conditions. |
| 22 | [Async / Await](/python/22-async-await) | The event loop, coroutines vs tasks, `asyncio.gather`, pitfalls. |
| 23 | [Metaprogramming](/python/23-metaprogramming) | Metaclasses, `__new__`, class decorators, `__getattr__`. |

### Part V — Production Engineering

| # | Topic | Why It Matters |
|---|---|---|
| 24 | [Testing](/python/24-testing) | `unittest` vs `pytest`, fixtures, mocking, parametrization, coverage. |
| 25 | [Packaging & Virtual Environments](/python/25-packaging-and-virtual-environments) | `venv`, `pip`, `pyproject.toml`, `uv`/`poetry`, publishing to PyPI. |
| 26 | [Performance & Optimization](/python/26-performance-and-optimization) | `cProfile`, memory views, `__slots__`, when to reach for C extensions. |
| 27 | [Security](/python/27-security) | `pickle` risks, `eval`/`exec` dangers, SQL injection, `secrets`. |
| 28 | [Exercises & Projects](/python/28-exercises-and-projects) | Capstone projects from beginner to advanced. |

## Learning Path Suggestions

### If you're new to programming

Read 01–09 slowly, running every example. Don't skip the Edge Cases sections — Python's forgiving syntax hides real mechanics (mutability, references, truthiness) that will confuse you later if skipped now. Do the beginner exercises in chapter 28 after chapter 09, then continue to Part II.

### If you're coming from JavaScript

Skim 01–04 (similar shape, different keywords: `elif`, `None`, no `var`/`let` distinction — Python has no block scope). Pay close attention to 05 (default argument mutation is a Python-specific trap JS doesn't have), 07–08 (Python's list/dict semantics around copying and mutation differ from JS arrays/objects), and 21–22 (the GIL means Python's concurrency story is fundamentally different from Node's single-threaded event loop). Don't assume `==` behaves like JS — read 03 carefully.

### If you're coming from a statically-typed language (Java, C#, Go)

Python's duck typing (02) and dynamic dispatch will feel unfamiliar at first — lean into it rather than fighting it with excessive `isinstance` checks. Read 20 (Type Hints) early to get static-analysis safety back via `mypy`. Read 13–15 for how Python does OOP differently (multiple inheritance via MRO, properties instead of getters/setters, duck-typed protocols instead of explicit interfaces).

### If you have a data science background (pandas/numpy but shaky on "core" Python)

You likely know 02, 04, 07–08 already — skim them for gaps (slicing edge cases, the `is`/`==` distinction). Focus on 05, 09–11 (comprehensions and generators are everywhere in idiomatic pipeline code), 16 (proper exception handling instead of bare `except:`), 19 (iterators/context managers explain why `with open(...)` and generators in `pandas`/numpy code work the way they do), and 26 (performance — vectorization vs Python loops, memory views).

## Companion Resources

- [Python Official Documentation](https://docs.python.org/3/) — the source of truth.
- [Real Python](https://realpython.com/) — deep, practical tutorials.
- [PEP Index](https://peps.python.org/) — language design decisions, especially [PEP 8](https://peps.python.org/pep-0008/) (style), [PEP 20](https://peps.python.org/pep-0020/) (Zen of Python), [PEP 484](https://peps.python.org/pep-0484/) (type hints).
- [The Hitchhiker's Guide to Python](https://docs.python-guide.org/) — best practices and structure.
- [CPython source](https://github.com/python/cpython) — read the implementation once you're comfortable.
- [r/Python](https://reddit.com/r/python) and [Python Discourse](https://discuss.python.org/) — community.

## Tooling to Install

::code-wrapper{language="bash"}
```bash
# Python version management
curl https://pyenv.run | bash
pyenv install 3.12.4
pyenv global 3.12.4

# Fast, modern package/project manager (installs Python too)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Linting, formatting, static typing, testing
pip install ruff mypy pytest pytest-cov ipython
```
::

## License

These notes are yours to use, share, and modify.

🐍
