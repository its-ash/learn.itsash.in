# 24 — Testing

## `unittest`: The Standard Library's Built-In Framework

::code-wrapper{language="python"}
```python
import unittest

def add(a, b):
    return a + b

class TestAdd(unittest.TestCase):
    def setUp(self):
        print("running before each test method")

    def test_positive_numbers(self):
        self.assertEqual(add(2, 3), 5)

    def test_negative_numbers(self):
        self.assertEqual(add(-1, -1), -2)

    def test_type_error_on_bad_input(self):
        with self.assertRaises(TypeError):
            add("2", 3)

if __name__ == "__main__":
    unittest.main()
```
::

::code-wrapper{language="bash"}
```bash
python -m unittest test_add.py -v
```
::

`unittest` (inspired by Java's JUnit) requires subclassing `TestCase`, naming test methods `test_*`, and using `self.assert*` methods for checks. It ships with every Python installation — no dependency to add — which matters for tooling that must run in constrained environments, but its class-based, Java-flavored API is more verbose than the alternative most production Python codebases actually use.

## `pytest`: The De Facto Standard in Practice

::code-wrapper{language="python"}
```python
def add(a, b):
    return a + b

def test_positive_numbers():
    assert add(2, 3) == 5

def test_negative_numbers():
    assert add(-1, -1) == -2

def test_type_error_on_bad_input():
    import pytest
    with pytest.raises(TypeError):
        add("2", 3)
```
::

::code-wrapper{language="bash"}
```bash
pip install pytest
pytest test_add.py -v
```
::

No class required, no `self.assertEqual` — plain `assert` statements, with `pytest` rewriting assertion failures to show rich diffs of the actual vs expected values (down to which specific list element differed, or which dict keys mismatched) without any special assertion methods to memorize. **Best practice**: for new projects, use `pytest` — it's a strict superset in capability (it can even run `unittest`-style tests unchanged) and is the ecosystem default for a reason: fixtures, parametrization, and plugins (covered below) that `unittest` has no equivalent for.

::code-wrapper{language="python"}
```python
def test_list_equality():
    assert [1, 2, 3] == [1, 2, 4]
```
::

::code-wrapper{language="bash"}
```bash
# pytest's failure output shows exactly which element differs:
# E       assert [1, 2, 3] == [1, 2, 4]
# E         At index 2 diff: 3 != 4
```
::

## Fixtures: Reusable Setup and Teardown

::code-wrapper{language="python"}
```python
import pytest

@pytest.fixture
def sample_users():
    print("\nsetting up users")
    users = [{"id": 1, "name": "Ada"}, {"id": 2, "name": "Grace"}]
    yield users               # everything before yield is setup; after yield is teardown
    print("\ntearing down users")

def test_user_count(sample_users):
    assert len(sample_users) == 2

def test_first_user_name(sample_users):
    assert sample_users[0]["name"] == "Ada"
```
::

A fixture is requested simply by naming it as a test function's parameter — `pytest` matches the parameter name to a fixture function and injects its `yield`-ed value automatically, no explicit `setUp`/`tearDown` boilerplate class needed. The code after `yield` runs as teardown, exactly like a generator-based context manager (chapter 19) — and indeed, `@pytest.fixture` functions are literally generators under the hood.

### Fixture scope: controlling how often setup/teardown runs

::code-wrapper{language="python"}
```python
import pytest

@pytest.fixture(scope="function")   # default — runs fresh for EVERY test function
def fresh_connection():
    print("opening connection")
    yield "connection"
    print("closing connection")

@pytest.fixture(scope="module")     # runs ONCE per test file, shared across all tests in it
def expensive_database():
    print("setting up database (expensive!)")
    yield "db"
    print("tearing down database")

@pytest.fixture(scope="session")    # runs ONCE for the entire test run, across all files
def global_config():
    return {"env": "test"}
```
::

**The gotcha**: a `scope="module"` or `scope="session"` fixture is shared *mutable state* across multiple tests — if one test mutates the yielded object, later tests in the same scope see the mutation, which can produce order-dependent test failures that only appear when tests run in a particular sequence (or in parallel with `pytest-xdist`). **Best practice**: default to `scope="function"` unless setup is genuinely expensive (a real database connection, a Docker container) and the tests using it don't mutate shared state in ways that leak between them.

## `parametrize`: One Test Function, Many Inputs

::code-wrapper{language="python"}
```python
import pytest

def is_palindrome(s):
    cleaned = s.lower().replace(" ", "")
    return cleaned == cleaned[::-1]

@pytest.mark.parametrize("input_str,expected", [
    ("racecar", True),
    ("hello", False),
    ("", True),                    # edge case: empty string is trivially a palindrome
    ("A man a plan a canal Panama", True),
    ("a", True),                     # edge case: single character
])
def test_is_palindrome(input_str, expected):
    assert is_palindrome(input_str) == expected
```
::

Without `parametrize`, testing the same logic against multiple inputs means either five nearly-identical test functions (violating DRY) or one test function with five separate `assert` statements — the latter stops at the *first* failure, hiding whether the other four cases also fail. `parametrize` runs each input as its own independent test (`test_is_palindrome[racecar-True]`, etc.), so a failure on one input doesn't hide failures on the others, and the failing case is immediately visible by name in the test report.

## Mocking: Isolating Code From Its Dependencies

::code-wrapper{language="python"}
```python
from unittest.mock import Mock, patch
import requests

def get_user_name(user_id):
    response = requests.get(f"https://api.example.com/users/{user_id}")
    return response.json()["name"]

def test_get_user_name():
    with patch("requests.get") as mock_get:
        mock_get.return_value.json.return_value = {"name": "Ada"}
        result = get_user_name(1)
        assert result == "Ada"
        mock_get.assert_called_once_with("https://api.example.com/users/1")
```
::

`patch("requests.get")` temporarily replaces `requests.get` with a `Mock` object for the duration of the `with` block, restoring the real function afterward automatically — this is how tests avoid making real network calls (slow, flaky, dependent on external services) while still verifying the code under test calls its dependencies correctly. `mock_get.assert_called_once_with(...)` verifies not just the *return value* handling but that the mocked function was invoked with the exact expected arguments.

### The critical gotcha: patch the name where it's *used*, not where it's *defined*

::code-wrapper{language="python"}
```python
# mymodule.py
import requests

def fetch():
    return requests.get("https://api.example.com").json()
```
::

::code-wrapper{language="python"}
```python
# WRONG — patches requests.get globally in the `requests` module's own namespace,
# but if mymodule did `from requests import get`, this patch would silently miss it
from unittest.mock import patch
import mymodule

def test_fetch_wrong():
    with patch("requests.get") as mock_get:      # works ONLY because mymodule uses `requests.get(...)`
        mock_get.return_value.json.return_value = {"ok": True}
        assert mymodule.fetch() == {"ok": True}

# CORRECT, more robust form — patch the reference as seen from the CONSUMING module's namespace
def test_fetch_correct():
    with patch("mymodule.requests.get") as mock_get:
        mock_get.return_value.json.return_value = {"ok": True}
        assert mymodule.fetch() == {"ok": True}
```
::

`patch("requests.get")` and `patch("mymodule.requests.get")` happen to behave the same here only because `mymodule` imported the `requests` *module* (so `mymodule.requests` is the same object as the top-level `requests` module) — but if `mymodule` had instead written `from requests import get`, only `patch("mymodule.get")` would work, since `mymodule` would hold its own independent name binding to the original function, unaffected by patching `requests.get` elsewhere. **The rule to memorize**: always patch the name as looked up from the module under test, not from where the object was originally defined.

### `Mock` vs `MagicMock`, and `side_effect`

::code-wrapper{language="python"}
```python
from unittest.mock import Mock, MagicMock

plain_mock = Mock()
# print(len(plain_mock))   # TypeError: object of type 'Mock' has no len() — dunder methods NOT auto-mocked

magic_mock = MagicMock()
print(len(magic_mock))       # 0 — MagicMock pre-configures common dunder methods automatically

flaky_mock = Mock(side_effect=[ValueError("first call fails"), "success"])
try:
    flaky_mock()
except ValueError as e:
    print(f"caught: {e}")
print(flaky_mock())   # "success" — side_effect with a list yields each value/exception in sequence
```
::

`side_effect` is more flexible than `return_value`: assigning a list makes successive calls return (or raise, for exception instances) each item in order — the standard way to test retry logic, where the first N calls should fail and a later one should succeed.

## Coverage: Measuring What's Actually Tested

::code-wrapper{language="bash"}
```bash
pip install pytest-cov
pytest --cov=mypackage --cov-report=term-missing

# Name                 Stmts   Miss  Cover   Missing
# ----------------------------------------------------
# mypackage/utils.py       42      3    93%   57-59
# mypackage/models.py      88     20    77%   102-121
```
::

Coverage reports which lines executed during the test run — the `Missing` column pinpoints exact line numbers never hit by any test, a direct to-do list for gaps. **The critical caveat**: 100% coverage means every line *executed*, not that every *behavior* or *edge case* was verified — a test can execute a line without meaningfully asserting on its output, producing high coverage numbers that mask weak tests. Coverage is a lower bound on testing quality, not a target to chase for its own sake.

::code-wrapper{language="python"}
```python
def divide(a, b):
    return a / b

def test_divide():
    divide(10, 2)      # executes the line — counts toward "100% coverage" — but asserts NOTHING!
```
::

This test achieves full line coverage of `divide` while verifying absolutely nothing about its correctness — it wouldn't fail even if `divide` were rewritten to always return `0`. A real test needs an assertion tied to the expected behavior: `assert divide(10, 2) == 5`.

## Structuring a Real Test Suite

::code-wrapper{language="bash"}
```bash
myproject/
├── src/
│   └── mypackage/
│       ├── __init__.py
│       └── orders.py
├── tests/
│   ├── conftest.py           # shared fixtures, auto-discovered by pytest — no import needed
│   ├── test_orders.py
│   └── test_integration.py
└── pyproject.toml
```
::

::code-wrapper{language="python"}
```python
# tests/conftest.py — fixtures here are automatically available to every test file in this directory
import pytest

@pytest.fixture
def sample_order():
    return {"id": 1, "items": ["book", "pen"], "total": 25.50}
```
::

`conftest.py` is `pytest`'s convention for fixtures shared across multiple test files — no explicit import is needed; `pytest` discovers and injects it automatically into any test in the same directory (or subdirectories), based purely on the fixture's function name matching a test parameter name.

## 💡 Tips & Tricks

- **Idiom**: name tests descriptively as full sentences (`test_withdraw_raises_when_balance_insufficient`), not `test_1`/`test_withdraw` — a failing test's name should communicate what broke without needing to open the file.
- **Debug**: `pytest -x` stops at the first failure (useful when iterating on a fix); `pytest --lf` reruns only the tests that failed last time; `pytest -k "palindrome"` runs only tests whose name matches a substring — all far faster than rerunning a whole suite while debugging.
- **Idiom**: use `pytest.mark.parametrize` the moment you find yourself copy-pasting a test function and changing only the input/expected values — that repetition is exactly what parametrization exists to eliminate.
- **Safety**: never let a test suite depend on execution order or on state left behind by another test — `pytest-randomly` (a plugin that shuffles test order every run) is a good way to surface hidden order-dependencies before they cause a flaky CI failure.
- **Performance**: `pytest-xdist` (`pytest -n auto`) runs tests in parallel across CPU cores — valuable for large suites, but it makes order-dependent and shared-mutable-fixture bugs (see `scope="module"` above) surface immediately, which is a feature, not a bug, of running it.

## ⚠️ Edge Cases & Gotchas

- **A test that executes a line without asserting on its result contributes to coverage percentage while verifying nothing** — high coverage numbers can hide a suite that would not catch a real regression; always tie an assertion to the specific behavior being tested.
- **`patch()` must target the name as imported/used in the module under test, not where the original object is defined** — `from requests import get` in the tested module means `patch("requests.get")` silently does nothing, while the test still appears to "pass" because the code path making a real network call may coincidentally succeed or the test never noticed the mock wasn't applied.
- **`Mock()` does not auto-mock dunder methods (`__len__`, `__iter__`, etc.) — only `MagicMock()` does** — calling `len()` on a plain `Mock` raises `TypeError`, a surprising failure for code expecting a duck-typed collection-like object.
- **Module- or session-scoped fixtures that yield a mutable object are shared across every test in that scope** — one test mutating the fixture's value can silently affect a later test's starting state, producing failures that depend on test execution order and vanish when that single test is run in isolation.
- **`assertRaises`/`pytest.raises` blocks that are too broad (wrapping many lines) can pass even when the exception was raised by the wrong line** — narrow the `with pytest.raises(...)` block to just the call expected to raise, so a test doesn't accidentally "pass" due to an unrelated bug earlier in the block.

## 🧠 Spot the Bug

A test suite mocks an external payment API to verify that a failed charge is retried once before giving up. The test passes, but the retry logic has a real bug that reaches production. Find the bug in the test.

::code-wrapper{language="python"}
```python
from unittest.mock import patch

def charge_with_retry(amount):
    for attempt in range(2):
        try:
            return payment_api.charge(amount)
        except PaymentError:
            continue
    raise PaymentError("all retries exhausted")

def test_retry_succeeds_on_second_attempt():
    with patch("mymodule.payment_api.charge") as mock_charge:
        mock_charge.return_value = {"status": "success"}
        result = charge_with_retry(100)
        assert result == {"status": "success"}
```
::

<details>
<summary>Answer</summary>

The test only configures `mock_charge.return_value` — a single fixed return value used for *every* call — so it never actually exercises the retry path at all. `payment_api.charge` succeeds on the very first attempt in this test, meaning the `for attempt in range(2)` loop, the `except PaymentError` branch, and the "retry after failure" behavior are completely untested, despite the test's name (`test_retry_succeeds_on_second_attempt`) claiming otherwise. A real bug — e.g., `range(2)` accidentally being `range(1)` (no retry at all), or the loop not actually calling `charge` again on retry — would pass this test just as easily as correct code, because the test never forces a first-attempt failure to observe whether a second attempt happens.

The fix uses `side_effect` with a list to simulate an actual failure followed by success, which genuinely exercises the retry path:
::code-wrapper{language="python"}
```python
from unittest.mock import patch

def test_retry_succeeds_on_second_attempt():
    with patch("mymodule.payment_api.charge") as mock_charge:
        mock_charge.side_effect = [PaymentError("declined"), {"status": "success"}]
        result = charge_with_retry(100)
        assert result == {"status": "success"}
        assert mock_charge.call_count == 2   # explicitly verifies a retry actually happened
```
::

**The lesson**: a mock configured with a single `return_value` cannot verify branching or retry logic that depends on different outcomes across multiple calls — use `side_effect` with a sequence, and assert on `call_count`/`call_args`, whenever the behavior under test depends on *how many times* or *with what* a dependency was called, not just the final return value.

</details>

## Key Takeaways

- `pytest` is the ecosystem-standard framework — plain `assert` statements with rich failure diffs, fixtures, and parametrization that `unittest` has no equivalent for, while still being able to run `unittest`-style tests unchanged.
- Fixtures use `yield` to split setup (before) from teardown (after), and are injected by matching a test function's parameter name — default to `scope="function"` unless setup is genuinely expensive and safe to share.
- `pytest.mark.parametrize` runs one test function against many inputs as independent test cases, so one failing case doesn't hide others the way a single test function with multiple bare `assert` statements would.
- Always patch the name as looked up from the module under test (`patch("mymodule.dependency")`), not from where it was originally defined — this is the single most common mocking mistake.
- `Mock` does not auto-support dunder methods; use `MagicMock` when the code under test relies on protocol methods like `__len__` or `__iter__`.
- Coverage percentage measures executed lines, not verified behavior — a test can achieve full coverage while asserting nothing meaningful; use `side_effect` and explicit call assertions to genuinely exercise branching and retry logic.
