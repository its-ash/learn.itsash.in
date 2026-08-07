# 06 — Strings & Template Literals

## String Creation

::code-wrapper{language="javascript"}
```javascript
// Single quotes
const s1 = 'Hello'

// Double quotes
const s2 = "World"

// Template literals (backticks) — multi-line + interpolation
const s3 = `Hello,
World`

const name = 'Alice'
const s4 = `Hello ${name}, you are ${30 + 1}`  // "Hello Alice, you are 31"

// String from char codes
String.fromCharCode(72, 105)       // "Hi"
String.fromCodePoint(128512)       // "😀" (handles surrogate pairs)

// Edge case: tagged template literals
function highlight(strings, ...values) {
  return strings.reduce((result, str, i) => {
    return result + str + (values[i] ? `[${values[i]}]` : '')
  }, '')
}
highlight`Hello ${name}!`  // "Hello [Alice]!"
```
::

## String Properties

::code-wrapper{language="javascript"}
```javascript
const s = 'Hello World'

s.length          // 11 (UTF-16 code units)
s[0]              // "H"
s[s.length - 1]  // "d"
s.at(-1)          // "d" (supports negative — ES2022)
s.charAt(0)       // "H"

// ⚠️ Length is in UTF-16 code units, not characters
'😀'.length           // 2 (surrogate pair)
[...'😀'].length      // 1 (spread iterates code points)
Array.from('😀').length // 1
```
::

## String Methods

### Finding

::code-wrapper{language="javascript"}
```javascript
const s = 'Hello World'

s.indexOf('o')      // 4 (first occurrence)
s.indexOf('o', 5)   // 7 (search starting at index 5)
s.lastIndexOf('o')  // 7
s.includes('World') // true
s.startsWith('Hello') // true
s.endsWith('World')   // true
s.search(/o/)       // 4 (regex — returns index, -1 if not found)
s.at(-1)            // "d"
```
::

### Extracting

::code-wrapper{language="javascript"}
```javascript
const s = 'Hello World'

s.slice(0, 5)       // "Hello" (start, end)
s.slice(6)          // "World" (from index to end)
s.slice(-5)         // "World" (from end)
s.substring(0, 5)   // "Hello" (like slice but swaps args if start > end)
s.substr(0, 5)      // "Hello" (deprecated — start, length)
s.split(' ')        // ["Hello", "World"]
s.split('')         // ["H","e","l","l","o"," ","W","o","r","l","d"]

// Edge case: substring vs slice with negative args
s.substring(-5)     // "Hello World" (treats -5 as 0)
s.slice(-5)         // "World" (from end)
```
::

### Transforming

::code-wrapper{language="javascript"}
```javascript
const s = '  Hello World  '

s.toUpperCase()       // "  HELLO WORLD  "
s.toLowerCase()       // "  hello world  "
s.trim()              // "Hello World"
s.trimStart()         // "Hello World  "
s.trimEnd()           // "  Hello World"
s.repeat(3)           // "Hello WorldHello WorldHello World"
s.padStart(20, '*')   // "*********Hello World"
s.padEnd(20, '-')     // "Hello World---------"
s.replace('o', '0')   // "Hell0 World" (only first match)
s.replaceAll('o', '0')// "Hell0 W0rld" (all matches — ES2021)
```
::

### Best practice: chaining string methods

::code-wrapper{language="javascript"}
```javascript
const slug = '  Hello World!  '
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
// "hello-world"
```
::

## Regex and Strings

::code-wrapper{language="javascript"}
```javascript
const text = 'The year is 2024 and the month is 08'

// match — returns array of matches or null
text.match(/\d+/g)          // ["2024", "08"]
text.match(/(\d+)\/(\d+)/)  // with capture groups

// matchAll — iterator of all matches (ES2020)
const matches = [...text.matchAll(/(\d+)/g)]
matches[0]  // { 0: "2024", 1: "2024", index: 12, input: "..." }

// replace with regex
'2024-08-05'.replace(/-/g, '/')  // "2024/08/05"
'Hello'.replace(/(?<word>\w+)/g, '$<word>!')  // "Hello!"

// test
/^\d{4}-\d{2}-\d{2}$/.test('2024-08-05')  // true
```
::

### Edge case: regex with global flag and `exec`

::code-wrapper{language="javascript"}
```javascript
const re = /(\w+)/g
let match
while ((match = re.exec('hello world')) !== null) {
  console.log(match[0], match.index)
}
// "hello" 0
// "world" 6

// ⚠️ Stateful — re.lastIndex persists between exec calls with /g flag
// Reset with re.lastIndex = 0
```
::

## Unicode and Internationalization

::code-wrapper{language="javascript"}
```javascript
// Code point vs code unit
'A'.codePointAt(0)    // 65
'😀'.codePointAt(0)   // 128512

// Iterating code points
const s = 'a😀b'
for (const char of s) {
  console.log(char)  // 'a', '😀', 'b'
}

// Normalize Unicode (NFC, NFD, NFKC, NFKD)
const cafe = 'café'           // NFC (one code point for é)
const cafe2 = 'cafe\u0301'    // NFD (e + combining accent)
cafe === cafe2                // false (different code units)
cafe.normalize() === cafe2.normalize()  // true

// Collation
new Intl.Collator('en').compare('a', 'b')  // -1
new Intl.Collator('de').compare('ä', 'a')  // depends on locale
```
::

## Practical Patterns

### Slugify

::code-wrapper{language="javascript"}
```javascript
function slugify(str) {
  return str
    .normalize('NFKD')                    // decompose accents
    .replace(/[\u0300-\u036f]/g, '')      // remove combining marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

slugify('Café au Lait!')  // "cafe-au-lait"
slugify('  Hello   World  ')  // "hello-world"
```
::

### Camel Case / Kebab Case

::code-wrapper{language="javascript"}
```javascript
function toCamelCase(str) {
  return str.replace(/[-_](.)/g, (_, c) => c.toUpperCase())
}
toCamelCase('hello-world')  // "helloWorld"
toCamelCase('foo_bar_baz')  // "fooBarBaz"

function toKebabCase(str) {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
}
toKebabCase('helloWorld')  // "hello-world"
```
::

### Truncate

::code-wrapper{language="javascript"}
```javascript
function truncate(str, maxLen, suffix = '...') {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - suffix.length) + suffix
}

truncate('Hello World', 8)        // "Hello..."
truncate('Short', 10)             // "Short"
truncate('Hello World', 8, '…')   // "Hello…"
```
::

## 💡 Tips & Tricks

**Backticks for all strings** — Modern style is to use backticks for all strings (even without interpolation). It's consistent and avoids escaping quotes. Linters like Prettier enforce this.

**Regex `.replace()` with `$1`, `$2`** — `"hello world".replace(/(\w+)\s(\w+)/, '$2 $1')` swaps words using capture groups. `$1` is group 1, `$2` is group 2, etc. Powerful for reformatting.

**String padding for alignment** — `'42'.padStart(5, ' ')` creates `'   42'`. Useful for columnar output: `nums.map(n => String(n).padStart(3, '0')).join('\n')`.

**Template literals in objects** — Computed keys work: `{ [`${key}_id`]: value }`. Useful for dynamic object construction.

## ⚠️ Edge Cases & Gotchas

**`.length` is UTF-16 code units, not characters** — Emoji are 2+ units each. `'😀'.length` is 2, not 1. Use `[...'😀'].length` or `Array.from()` to count actual characters. This breaks in databases too.

**`.substring()` swaps arguments if start > end** — `"hello".substring(3, 1)` is `"el"` (swaps to 1,3). `.slice()` doesn't; it returns `""`. Always use `.slice()` for predictable behavior.

**`.replace()` only replaces first match** — `"aaa".replace('a', 'b')` is `"baa"`, not `"bbb"`. Use `.replaceAll()` (ES2021) or `/g` regex. This trips up beginners constantly.

**Regex state persists with `/g` flag** — `const re = /a/g; re.test('a'); re.test('a')` — the second test is `false` because `.lastIndex` moves. Reset with `re.lastIndex = 0` or create a new regex each time.

**Unicode normalization matters for comparison** — `'é' === 'é'` might be false if one is NFC and one is NFD. Always normalize: `str1.normalize() === str2.normalize()`. Critical for database comparisons.

## 🧠 Spot the Bug

What's the output?

```javascript
const text = 'hello world'
const result1 = text.replace(/l/g, 'L')
const result2 = text.replace(/l/, 'L')
const result3 = '  trim me  '.trim().split(' ')

console.log(result1, result2, result3.length)
```

<details>
<summary>Answer</summary>

Logs `heLLo worLd heLo world 2`. Here's why:
- `.replace(/l/g, 'L')` — `/g` flag replaces ALL → `"heLLo worLd"`
- `.replace(/l/, 'L')` — no `/g` flag, only first match → `"heLo world"`
- `'  trim me  '.trim().split(' ')` → `["trim", "me"]` (length 2)

**The lesson**: The `/g` flag is required for `.replace()` to replace all. Easy to forget, common bug.

</details>

## Key Takeaways

- Use template literals for interpolation and multi-line strings.
- `.length` counts UTF-16 code units, not characters — use spread `[...str]` for code points.
- `.slice()` supports negative indices; `.substring()` does not.
- Use `.replaceAll()` instead of `.replace()` for replacing all occurrences (or `/g` regex).
- `String.raw` and tagged templates enable custom string processing.
- Always normalize Unicode when comparing strings from different sources.