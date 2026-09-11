# 06 — Strings & Text

## String Representation — Unicode Code Points, Not Bytes or Graphemes

::code-wrapper{language="python"}
```python
# Python str stores Unicode CODE POINTS (integers in 0..0x10FFFF).
# This is NEITHER bytes (the on-disk encoding) NOR graphemes (what users see).

# ── The three-level model ──
s = "café"
print(len(s))                     # 4 — four CODE POINTS: c, a, f, é
print(len(s.encode("utf-8")))     # 5 — five BYTES (é is 2 bytes in UTF-8: 0xC3 0xA9)
# User-perceived "characters" (grapheme clusters) can differ from both — see below

# ── Code point ↔ integer conversion ──
print(ord("A"))                   # 65 — the integer value of code point U+0041
print(chr(65))                    # 'A' — code point U+0041 → str
print(hex(ord("é")))             # '0xe9' — U+00E9 (precomposed form)

# ── Production: Unicode normalization before comparison/lookup ──
# "é" has TWO valid Unicode representations:
#   NFC (precomposed):  U+00E9      — one code point, "é"
#   NFD (decomposed):   U+0065 + U+0301 — "e" + combining acute accent — two code points
import unicodedata

nfc = "é"                          # precomposed — \u00e9
nfd = "e\u0301"                    # decomposed — "e" + combining accent

print(nfc == nfd)                  # False! — different code point sequences
print(len(nfc), len(nfd))          # 1 2 — different lengths!
print(unicodedata.normalize("NFC", nfd) == nfc)   # True — normalize before comparing

# ANTI-PATTERN: using user-supplied strings as dict keys without normalization
# A user who types "café" via a compose key vs. a dead-key accent produces
# different code point sequences — they'll be DIFFERENT keys in a dict.
user_input_a = "café"              # NFC from one input method
user_input_b = "cafe\u0301"        # NFD from another input method
cache = {user_input_a: "data"}
print(user_input_b in cache)       # False — miss! same visual string, different code points

# CORRECT: normalize all strings to NFC before use as keys/comparisons
def normalize_key(s: str) -> str:
    return unicodedata.normalize("NFC", s)

cache = {normalize_key(user_input_a): "data"}
print(normalize_key(user_input_b) in cache)   # True — normalized comparison works
```
::

::code-wrapper{language="python"}
```python
# ── Grapheme clusters: what users perceive vs. what len() reports ──
# Emoji and flags are the most common source of "len() is wrong" bugs.

flag = "🇺🇸"                       # US flag — two REGIONAL INDICATOR code points
print(len(flag))                   # 2 — two code points, one visible glyph
print([hex(ord(c)) for c in flag]) # ['0x1f1fa', '0x1f1f8'] — U=U+1F1FA, S=U+1F1F8

family = "👨‍👩‍👧‍👦"                  # family emoji — joined by ZWJ (zero-width joiner)
print(len(family))                 # 7 — seven code points (4 people + 3 ZWJ), one glyph
# ZWJ = U+200D — invisible joiner that tells the renderer to combine adjacent emoji

# For correct user-perceived character counting, use the \X regex grapheme cluster
# (requires the `regex` module, not stdlib `re`, which lacks grapheme support)
# import regex
# print(len(regex.findall(r"\X", family)))   # 1 — one grapheme cluster

# ── Production: truncating user-display text at grapheme boundaries ──
# Naive truncation at code point N can split a combining character from its base
def truncate_naive(s: str, max_len: int) -> str:
    """WRONG — can split combining accents from their base characters."""
    return s[:max_len]              # cuts at code point boundary, not grapheme boundary

def truncate_safe(s: str, max_len: int) -> str:
    """CORRECT — counts grapheme clusters, not code points (requires `regex` module)."""
    import regex
    clusters = regex.findall(r"\X", s)
    return "".join(clusters[:max_len])

# "café" in NFD form: c, a, f, e, combining-acute — truncating at 4 drops the accent
nfd_cafe = "cafe\u0301"
print(truncate_naive(nfd_cafe, 4))   # "cafe" — accent lost! displays as "cafe" not "café"
# print(truncate_safe(nfd_cafe, 4))  # "café" — correct, keeps the combining cluster intact
```
::

## Indexing and Slicing

::code-wrapper{language="python"}
```python
s = "Hello, World!"
print(s[0])          # 'H'
print(s[-1])           # '!'          — negative indices count from the end
print(s[7:12])           # 'World'
print(s[:5])                # 'Hello'
print(s[7:])                  # 'World!'
print(s[::-1])                  # '!dlroW ,olleH'  — reverse via step -1
print(s[::2])                     # 'Hlo ol!'        — every other character
print(s[100:200])                   # ''  — out-of-range slices never raise, just return empty/partial
```
::

**Best practice**: slicing never raises `IndexError`, even for wildly out-of-range bounds — it clamps silently. Direct indexing (`s[100]`) *does* raise `IndexError`. This asymmetry is worth internalizing: if you need bounds-safety, prefer slicing or explicit length checks over bare indexing.

## Essential String Methods

::code-wrapper{language="python"}
```python
s = "  Hello, World!  "

print(s.strip())            # "Hello, World!"      — trims whitespace both sides
print(s.lower())               # "  hello, world!  "
print(s.upper())                  # "  HELLO, WORLD!  "
print(s.replace("World", "Python"))  # "  Hello, Python!  "
print(s.strip().split(", "))            # ['Hello', 'World!']
print("-".join(["a", "b", "c"]))          # "a-b-c"
print("Hello".startswith("He"))              # True
print("Hello".endswith("lo"))                  # True
print("Hello".find("l"))                         # 2  — index of first match, -1 if absent
print("Hello".index("z"))                          # ValueError: substring not found (raises!)
print("hello world".title())                          # "Hello World"
print("  ".isspace())                                    # True
print("42".isdigit())                                      # True
print("Hello123".isalnum())                                   # True
```
::

`.find()` returns `-1` on failure; `.index()` raises `ValueError` on failure. Choosing between them is choosing between EAFP (`.index()` + `try`/`except`) and a manual sentinel check (`.find()` + `if result == -1`).

## f-strings — The Modern Standard for Formatting

::code-wrapper{language="python"}
```python
name = "Ada"
age = 36
pi = 3.14159265

print(f"{name} is {age} years old")             # Ada is 36 years old
print(f"{name!r}")                                 # 'Ada'  — !r calls repr()
print(f"{pi:.2f}")                                    # 3.14  — format spec: 2 decimal places
print(f"{1234567:,}")                                    # 1,234,567 — thousands separator
print(f"{age:>5}")                                          # "   36" — right-aligned, width 5
print(f"{age:<5}|")                                            # "36   |" — left-aligned
print(f"{age:^5}|")                                                # " 36  |" — centered

# Self-documenting expressions (3.8+) — the = specifier
print(f"{name=}")                                                     # name='Ada'
print(f"{age * 2=}")                                                    # age * 2=72

# Nested expressions and method calls work directly inside braces
items = ["apple", "banana"]
print(f"Items: {', '.join(items).upper()}")                              # Items: APPLE, BANANA
```
::

### f-strings vs `.format()` vs `%` — know all three, prefer f-strings

::code-wrapper{language="python"}
```python
name, score = "Ada", 98

# %-formatting — legacy, still seen in logging calls and old codebases
print("%s scored %d" % (name, score))

# .format() — flexible, verbose, used when the template is data (not a literal)
print("{} scored {}".format(name, score))
template = "{n} scored {s}"      # e.g. loaded from a config file or translation string
print(template.format(n=name, s=score))

# f-strings — fastest, clearest, the default choice for literal templates (3.6+)
print(f"{name} scored {score}")
```
::

**Important distinction**: f-strings require the template to be a literal known at the point of writing the code — they can't be built from a runtime string loaded from a file or database, because the interpolation happens at parse time. `.format()` and `%` operate on *any* string value at runtime, which is why templating systems, translation files, and logging format strings still use them.

## Bytes vs `str` — The Encoding Boundary

`str` is text (Unicode code points); `bytes` is raw binary data. Converting between them requires an explicit **encoding**.

::code-wrapper{language="python"}
```python
text = "café"                    # str — a sequence of Unicode code points
encoded = text.encode("utf-8")     # bytes — b'caf\xc3\xa9', é takes 2 bytes in UTF-8
print(encoded)                       # b'caf\xc3\xa9'
print(len(text))                       # 4 — 4 code points
print(len(encoded))                      # 5 — 5 bytes (é is 2 bytes in UTF-8)

decoded = encoded.decode("utf-8")           # back to str
print(decoded == text)                        # True

# Wrong encoding raises or corrupts silently depending on the codec
try:
    encoded.decode("ascii")
except UnicodeDecodeError as e:
    print(f"Failed: {e}")
```
::

::code-wrapper{language="python"}
```python
# Mixing str and bytes is a TypeError — Python 3 refuses to silently coerce
try:
    "hello" + b"world"
except TypeError as e:
    print(e)   # can only concatenate str (not "bytes") to str
```
::

Python 2 blurred this line (its `str` was really bytes); Python 3's hard separation is one of the most important — and most disruptive to ported code — changes in the 2-to-3 migration.

### Default encoding pitfalls

::code-wrapper{language="python"}
```python
# BAD — relies on the platform's default encoding, which varies!
# (open() without encoding= uses locale.getpreferredencoding(), which is
#  UTF-8 on most modern Linux/macOS but can be cp1252 on some Windows setups)
with open("data.txt") as f:      # DANGEROUS: implicit encoding
    content = f.read()

# GOOD — always specify encoding explicitly for portable, reproducible I/O
with open("data.txt", encoding="utf-8") as f:
    content = f.read()
```
::

## Regular Expressions with `re`

::code-wrapper{language="python"}
```python
import re

text = "Contact: alice@example.com or bob@work.org"

# search — first match anywhere
match = re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", text)
print(match.group())          # alice@example.com

# findall — all non-overlapping matches
emails = re.findall(r"[\w.+-]+@[\w-]+\.[\w.-]+", text)
print(emails)                   # ['alice@example.com', 'bob@work.org']

# sub — replace matches
redacted = re.sub(r"[\w.+-]+@[\w-]+\.[\w.-]+", "[REDACTED]", text)
print(redacted)                    # Contact: [REDACTED] or [REDACTED]

# Named groups for structured extraction
pattern = re.compile(r"(?P<user>[\w.+-]+)@(?P<domain>[\w.-]+)")
m = pattern.search("alice@example.com")
print(m.group("user"), m.group("domain"))   # alice example.com
print(m.groupdict())                            # {'user': 'alice', 'domain': 'example.com'}
```
::

### Compiling patterns for reuse — a real performance consideration

::code-wrapper{language="python"}
```python
# Compile once, reuse many times, in hot paths (loops, per-request validation)
EMAIL_RE = re.compile(r"^[\w.+-]+@[\w-]+\.[\w.-]+$")

def is_valid_email(s: str) -> bool:
    return bool(EMAIL_RE.match(s))    # match() anchors at the START only, not the end!

print(is_valid_email("alice@example.com"))     # True
print(is_valid_email("alice@example.com\nmalicious"))   # True in re.match with $!
```
::

**Gotcha**: `$` in a regex matches the end of the string **or just before a trailing newline** — it is not a strict end-of-string anchor. `"alice@example.com\nmalicious"` matches `^[\w.+-]+@[\w-]+\.[\w.-]+$` because `$` allows a trailing `\n` before the true end. For strict whole-string validation (security-sensitive contexts especially — see chapter 27), use `\Z` instead of `$`, or `re.fullmatch()`.

::code-wrapper{language="python"}
```python
STRICT_EMAIL_RE = re.compile(r"^[\w.+-]+@[\w-]+\.[\w.-]+\Z")

def is_valid_email_strict(s: str) -> bool:
    return bool(STRICT_EMAIL_RE.match(s))

print(is_valid_email_strict("alice@example.com\nmalicious"))   # False — correctly rejected

# Or, more idiomatically:
def is_valid_email_fullmatch(s: str) -> bool:
    return bool(re.fullmatch(r"[\w.+-]+@[\w-]+\.[\w.-]+", s))

print(is_valid_email_fullmatch("alice@example.com\nmalicious"))   # False
```
::

## String Building — Concatenation Performance

::code-wrapper{language="python"}
```python
# BAD in a loop — each += creates a brand-new string (strings are immutable),
# making naive concatenation O(n^2) for n appends in the worst case
result = ""
for i in range(10000):
    result += str(i)   # allocates a new string of growing size EVERY iteration

# GOOD — collect pieces, join once (join is O(n))
parts = [str(i) for i in range(10000)]
result = "".join(parts)
```
::

CPython has an optimization (`str` concatenation in a loop can sometimes resize in place when the left operand has refcount 1) that mitigates this in some cases, but it is a CPython implementation detail, not a language guarantee — `"".join(...)` is the portable, always-correct-and-fast idiom, and is what experienced Python developers reach for reflexively.

## 💡 Tips & Tricks

- **`str.format_map` and f-strings with `=` for debugging** — `f"{some_expr=}"` prints both the source expression text and its value, replacing manual `print("some_expr:", some_expr)` debug lines.
- **`textwrap.dedent` cleans up triple-quoted strings indented to match code** — writing a multi-line string inside an indented function body normally bakes in the indentation; `textwrap.dedent(s)` strips the common leading whitespace.
- **`str.translate` + `str.maketrans` for fast bulk character replacement** — replacing many individual characters is far faster via a translation table than chained `.replace()` calls.
- **`re.VERBOSE` for readable complex patterns** — `re.compile(r"""\d{3} -\d{4}""", re.VERBOSE)` lets you add whitespace and comments inside a pattern for maintainability; whitespace in the pattern is ignored unless escaped or in a character class.
- **`unicodedata.normalize` before comparing user-supplied Unicode text** — visually identical strings can have different underlying code point sequences (`"é"` as one composed code point vs. `"e" + combining acute accent`); normalize with `NFC` before equality checks or lookups.

## ⚠️ Edge Cases & Gotchas

- **`len()` counts code points, not "characters" as a human perceives them, and not bytes** — a single visually-perceived emoji or accented character can be one code point, multiple combining code points, or (in UTF-8 bytes) up to 4 bytes — `len("café")` is `4` but `len("café".encode())` is `5`, and something like a flag emoji built from regional indicator pairs can have `len() == 2` for what looks like one glyph.
- **`str.format()`/f-strings silently call `__format__`, which can differ wildly from `__str__`** — custom objects that define `__format__` (e.g., for locale-aware number formatting) can produce output in an f-string that doesn't match `print(obj)`; this is rare but confusing when it happens.
- **Regex `$` matches before a trailing `\n`, not strictly "end of string"** — as shown above, naive `^...$` "validation" patterns can be bypassed by appending a newline plus arbitrary content; use `\Z` or `re.fullmatch()` for security-sensitive validation.
- **Implicit default encoding varies by platform** — omitting `encoding=` in `open()` relies on `locale.getpreferredencoding()`, which is usually UTF-8 on modern Linux/macOS but historically defaulted to something like `cp1252` on Windows — always pass `encoding="utf-8"` explicitly for reproducible cross-platform behavior.
- **String concatenation with `+=` in a loop is O(n²) in the general case, despite sometimes appearing fast in CPython due to an internal optimization** — that optimization only triggers when the string has a reference count of exactly 1 and is CPython-specific (not guaranteed by the language, and absent in PyPy/Jython) — always use `"".join(...)` for building strings from many pieces in production code.

## 🧠 Spot the Bug

What does this print, and why does the count look wrong to a beginner?

::code-wrapper{language="python"}
```python
flag = "🇺🇸"
name = "café"

print(len(flag))
print(len(name))
print(name[3])
print(name.encode("utf-8")[3])
```
::

<details>
<summary>Answer</summary>

`len(flag)` is `2` — the US flag emoji is not one code point; it's two "regional indicator symbol" code points (🇺 + 🇸) that renderers combine visually into a single flag glyph. `len(name)` is `4` — `"café"` has 4 Unicode code points (`c`, `a`, `f`, `é`), each counted as one, regardless of how many bytes they take when encoded. `name[3]` is `'é'` — indexing operates on code points, giving the whole accented character as one unit. `name.encode("utf-8")[3]` is `169` — an integer, because indexing a `bytes` object returns an `int` (the byte value), not a length-1 `bytes` object, and it's the *second* byte of é's 2-byte UTF-8 encoding (`0xc3 0xa9` = 195, 169), not the character itself.

**The lesson**: `len()` and indexing on `str` operate on Unicode code points, which don't correspond 1:1 with either "user-perceived characters" (grapheme clusters, which may span multiple code points) or bytes (which vary 1–4 per code point in UTF-8) — never assume any of the three counts match.

</details>

## Key Takeaways

- Strings are immutable sequences of Unicode code points; every "modification" method returns a new string.
- f-strings are the preferred formatting mechanism for literal templates known at write-time; `.format()`/`%` remain necessary for runtime-supplied templates (config files, i18n).
- `str` (text) and `bytes` (binary data) are strictly separate types in Python 3 — conversion requires an explicit `.encode()`/`.decode()` with a named codec; never rely on the platform default encoding.
- `re.compile()` your patterns once and reuse them in hot paths; use `\Z`/`re.fullmatch()` instead of `$`/`re.match()` when validating untrusted input, since `$` tolerates a trailing newline.
- Build strings from many pieces with `"".join(parts)`, not repeated `+=` in a loop — the latter is O(n²) in the general case and relies on a non-portable CPython optimization to ever be fast.
