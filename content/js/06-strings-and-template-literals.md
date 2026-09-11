---
title: "JavaScript 06 — String Internals: UTF-16 Encoding, Surrogate Pairs & Tagged Templates"
description: "Deep-dive into JavaScript string mechanics: UTF-16 code units vs code points, surrogate pair handling, Unicode normalization, tagged template literals, and the string iterator vs index access. Code-first reference for senior engineers."
---

# 06 — String Internals: UTF-16 Encoding, Surrogate Pairs & Tagged Templates

## UTF-16 Encoding: Code Units vs Code Points

::code-wrapper{language="javascript"}
```javascript
// ── JS strings are UTF-16: each "char" is a 16-bit code unit ──
// Most ASCII/Latin characters: 1 code unit (16 bits)
// Characters beyond U+FFFF (emoji, CJK, rare scripts): 2 code units (surrogate pair)

// ── .length counts CODE UNITS, not characters (visual chars) ──
"a".length;       // 1 (1 code unit)
"\n".length;      // 1
"é".length;       // 2 (é = U+00E9, but can also be e + combining accent → 2 units)
"𝕏".length;       // 2! (𝕏 = U+1D54F, requires a surrogate pair: 2 code units)
"😀".length;      // 2! (emoji = U+1F600, surrogate pair: 2 code units)

// ── Surrogate pairs: characters outside the BMP (Basic Multilingual Plane, U+0000–U+FFFF) ──
// Encoded as two 16-bit code units: high surrogate (U+D800–U+DBFF) + low surrogate (U+DC00–U+DFFF)
const emoji = "😀";  // U+1F600
console.log(emoji.charCodeAt(0));  // 55357 (0xD83D — high surrogate)
console.log(emoji.charCodeAt(1));  // 56800 (0xDE00 — low surrogate)
console.log(emoji.codePointAt(0));  // 128512 (0x1F600 — the actual code point!)

// ── .charAt() and index access break on surrogate pairs ──
console.log(emoji.charAt(0));  // '\uD83D' (high surrogate only — invalid/garbage)
console.log(emoji[0]);         // '\uD83D' (same — index gives a code unit, not a character)

// ── .codePointAt() and String.fromCodePoint() handle full code points ──
console.log("😀".codePointAt(0));  // 128512 (the actual code point)
console.log(String.fromCodePoint(128512));  // "😀" (from code point to string)
console.log(String.fromCharCode(128512));  // "\uD800\uDE00"? No — fromCharCode only does code units
// String.fromCharCode(0xD83D, 0xDE00) → "😀" (manual surrogate pair construction)

// ── Iterating with for...of iterates by CODE POINT (not code unit) ──
for (const ch of "😀abc") { console.log(ch); }
// "😀" (1 iteration — full code point), "a", "b", "c" (4 total iterations)
// But: "😀abc".length is 5 (2 code units for emoji + 3 for abc)
```
::

## Anti-Pattern: String Reversal with Surrogate Pairs

::code-wrapper{language="javascript"}
```javascript
// ❌ NAIVE — .split("").reverse().join("") breaks on surrogate pairs and combining marks
const str = "Hello 🌍";  // 🌍 = U+1F30D (surrogate pair)
const broken = str.split("").reverse().join("");
console.log(broken);  // "�� olleH" — the emoji is corrupted (surrogates reversed individually)
// split("") splits by code unit — the surrogate pair is split into two separate units
// and reversed independently, creating an invalid character sequence.

// ✅ CORRECT — use the string iterator (which iterates by code point)
const reversed = [...str].reverse().join("");
console.log(reversed);  // "🌍 olleH" — emoji preserved (spread iterates by code point)

// ✅ ALSO CORRECT — Array.from (also iterates by code point)
const reversed2 = Array.from(str).reverse().join("");

// ── Combining marks are still a problem (e.g., é = e + ̀) ──
const accented = "café";  // é might be U+00E9 (1 unit) or e + U+0301 (2 units)
// Reversing "café" (decomposed: c a e ́) → "éfac" (accent moved to the wrong letter)
// For full Unicode-aware reversal, use Intl.Segmenter (ES2022):
const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
const graphemes = [...segmenter.segment("café🇫🇷")].map(s => s.segment);
const reversed3 = graphemes.reverse().join("");
// Intl.Segmenter splits into grapheme clusters (visual characters), handling
// combining marks, emoji sequences, and flag emoji (regional indicator pairs).
```
::

## Template Literals and Tagged Templates

::code-wrapper{language="javascript"}
```javascript
// ── Template literal: string interpolation with backticks ──
const name = "Alice";
const age = 30;
console.log(`Hello, ${name}! You are ${age} years old.`);
// Expressions inside ${}:
console.log(`2 + 2 = ${2 + 2}`);   // "2 + 2 = 4"
console.log(`Upper: ${name.toUpperCase()}`);  // "Upper: ALICE"
console.log(`Nested: ${`inner ${name}`}`);     // "Nested: inner Alice"

// ── Multiline strings (no \n needed) ──
const html = `
<div>
    <h1>${name}</h1>
    <p>Age: ${age}</p>
</div>
`;
// The newline after the opening backtick and before the closing backtick are part of the string.

// ── Tagged templates: process template literal with a function ──
// The tag function receives: (strings[], ...values)
// strings: array of literal string parts (between ${} interpolations)
// values: array of interpolated expressions
function tag(strings, ...values) {
    console.log(strings);  // ["Hello, ", "! You are ", " years old.", raw: [...]]
    console.log(values);   // ["Alice", 30]
    return strings.reduce((result, str, i) =>
        result + str + (values[i] !== undefined ? `[${values[i]}]` : ""), "");
}
const tagged = tag`Hello, ${name}! You are ${age} years old.`;
// "Hello, [Alice]! You are [30] years old."
```
::

## Production Pattern: HTML Escaping with Tagged Templates

::code-wrapper{language="javascript"}
```javascript
// ── Safe HTML template tag (prevents XSS) ──
function html(strings, ...values) {
    // strings.raw contains the raw (unescaped) template parts
    // values contains the interpolated expressions
    return strings.reduce((result, str, i) => {
        const value = values[i];
        if (value === undefined) return result + str;

        // Escape HTML special characters in interpolated values
        const escaped = String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");

        return result + str + escaped;
    }, "");
}

const userInput = '<script>alert("xss")</script>';
const safe = html`<div>${userInput}</div>`;
// <div>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</div>
// The script tag is escaped — displayed as text, not executed.

// ── Conditional values and arrays ──
function html2(strings, ...values) {
    return strings.reduce((result, str, i) => {
        const value = values[i];
        if (value === undefined || value === null || value === false) return result + str;
        if (Array.isArray(value)) return result + str + value.join("");
        return result + str + String(value);
    }, "");
}
const items = ["apple", "banana"];
const list = html2`<ul>${items.map(i => html2`<li>${i}</li>`)}</ul>`;
// <ul><li>apple</li><li>banana</li></ul>
```
::

## String Methods: Finding and Extracting

::code-wrapper{language="javascript"}
```javascript
// ── Finding ──
"hello world".indexOf("world");  // 6 (index, or -1 if not found)
"hello world".includes("world"); // true (ES2015 — boolean, no index needed)
"hello".startsWith("he");        // true
"hello".endsWith("lo");          // true
"hello world".search(/world/);  // 6 (regex — returns index, not match)
"hello world".match(/o/g);      // ["o", "o"] (regex match — array of matches)
"hello".matchAll(/l/g);          // iterator of match objects (ES2020)
[..."hello".matchAll(/l/g)];    // [Match, Match] (each with index, groups, etc.)

// ── Extracting ──
"hello world".slice(0, 5);       // "hello" (start, end — negative allowed)
"hello world".slice(6);         // "world" (start to end)
"hello world".slice(-5);        // "world" (negative = from end)
"hello world".substring(0, 5);  // "hello" (like slice, but NO negative args)
"hello world".substr(0, 5);     // "hello" (start, length — DEPRECATED, avoid)
"hello".at(0);                  // "h" (ES2022 — supports negative: .at(-1) = "o")
"hello".at(-1);                 // "o" (negative index — from end)

// ── ⚠️ .substring() vs .slice() — negative behavior differs ──
"hello".slice(-3);       // "llo" (negative = from end)
"hello".substring(-3);   // "hello" (negative treated as 0)
"hello".substring(4, 1); // "ell" (SWAPS args if start > end!)
"hello".slice(4, 1);     // "" (no swap — empty if start > end)
// Always use .slice() — it has consistent negative-index behavior.

// ── .replace() vs .replaceAll() ──
"aaa".replace("a", "b");    // "baa" (replaces FIRST match only)
"aaa".replace(/a/g, "b");   // "bbb" (regex /g replaces ALL)
"aaa".replaceAll("a", "b"); // "bbb" (ES2021 — replaces ALL, no regex needed)
// ⚠️ .replace with a string pattern only replaces the FIRST occurrence.

// ── ⚠️ .replace() with regex /g has STATE (lastIndex persists on the regex object) ──
const re = /a/g;
"aaa".replace(re, "b");  // "bbb"
"aaa".replace(re, "b");  // "bbb" — wait, this might be wrong with stateful regex
// Actually: .replace() with /g is fine — it resets internally. But .test() and .exec() persist:
re.lastIndex = 0;  // must reset lastIndex for stateful regex with .test()/.exec()
```
::

## Unicode Normalization

::code-wrapper{language="javascript"}
```javascript
// ── The same character can have multiple representations ──
// "é" can be:
//   1. Precomposed: U+00E9 (é) — 1 code unit
//   2. Decomposed: U+0065 (e) + U+0301 (combining acute accent) — 2 code units

const precomposed = "é";        // U+00E9
const decomposed = "e\u0301";   // e + combining accent
console.log(precomposed === decomposed);  // false! (different code units)
console.log(precomposed.length);           // 1
console.log(decomposed.length);            // 2

// ── .normalize() converts to a canonical form ──
const norm1 = precomposed.normalize("NFC");  // composed form (U+00E9)
const norm2 = decomposed.normalize("NFC");  // composed form (U+00E9)
console.log(norm1 === norm2);  // true (both are the same composed form)

// ── Normalization forms ──
// NFC  (Canonical Composition): precomposed chars (default, best for storage/display)
// NFD  (Canonical Decomposition): decomposed chars (base + combining marks)
// NFKC (Compatibility Composition): like NFC + compatibility decomposition (e.g., ﬁ → fi)
// NFKD (Compatibility Decomposition): like NFD + compatibility decomposition

// ── When normalization matters ──
const names = ["café", "cafe\u0301"];  // both "café" but different code units
const unique = new Set(names);  // Set has 2 entries (they're not equal!)
const unique2 = new Set(names.map(n => n.normalize("NFC")));  // Set has 1 entry (normalized)
// Always normalize before comparison, hashing, or deduplication of Unicode strings.

// ── Collation with Intl.Collator (locale-aware sorting) ──
const words = ["café", "cafe", " Café", "café"];
words.sort();  // default sort: code unit order (not locale-aware)
words.sort(new Intl.Collator("en").compare);  // locale-aware sort
// Intl.Collator handles accents, case, and locale-specific ordering rules.
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript"}
```javascript
// ── .at(-1) for the last character (ES2022 — no .slice(-1) needed) ──
"hello".at(-1);   // "o" — negative index from end
"hello".at(-2);   // "l"
// Before .at(): "hello".slice(-1) or "hello"["hello".length - 1]

// ── Repeat and padStart/padEnd ──
"ab".repeat(3);        // "ababab"
"5".padStart(3, "0");  // "005" (pad with 0 to length 3)
"5".padEnd(3, "-");   // "5--" (pad on the right)
"255".padStart(6, "0"); // "000255" (useful for fixed-width formatting)

// ── Trim and variants ──
"  hello  ".trim();       // "hello" (both sides)
"  hello  ".trimStart();  // "hello  " (left only, formerly trimLeft)
"  hello  ".trimEnd();    // "  hello" (right only, formerly trimRight)

// ── String to array and back ──
[..."hello"];  // ["h", "e", "l", "l", "o"] (iterates by code point)
"hello".split("");  // ["h", "e", "l", "l", "o"] (splits by code unit)
// Use [...] for Unicode safety (surrogate pairs stay together)

// ── Multiline string from array ──
const lines = ["line 1", "line 2", "line 3"];
lines.join("\n");  // "line 1\nline 2\nline 3"

// ── Safe HTML attribute escaping ──
const escapeAttr = (str) => str.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript"}
```javascript
// ── .length counts code units, not characters ──
"😀".length;  // 2 (surrogate pair = 2 code units)
// Use [...str].length for grapheme count (code points)

// ── .charAt() and index access break on surrogate pairs ──
"😀".charAt(0);  // "\uD83D" (high surrogate only — garbage character)
"😀"[0];         // "\uD83D" (same — code unit, not code point)
// Use for...of or [...str] to iterate by code point.

// ── .substring() swaps args if start > end ──
"hello".substring(4, 1);  // "ell" (swaps to 1,4)
"hello".slice(4, 1);      // "" (no swap — empty)
// Use .slice() for consistent behavior.

// ── .replace() with a string replaces only the FIRST match ──
"aaa".replace("a", "b");  // "baa" (first only)
"aaa".replaceAll("a", "b");  // "bbb" (ES2021 — all)

// ── Regex with /g has stateful lastIndex (for .test() and .exec()) ──
const re = /a/g;
re.test("aaa");  // true (lastIndex = 1)
re.test("aaa");  // true (lastIndex = 2)
re.test("aaa");  // true (lastIndex = 3)
re.test("aaa");  // false (lastIndex = 0, reset — no more matches)
// .replace() and .matchAll() reset internally, but .test()/.exec() persist lastIndex.

// ── Template literals can contain newlines, but watch indentation ──
const html = `
    <div>
        content
    </div>
`;
// The leading whitespace is part of the string — use .trim() or a tag function.
```
::

## 🧠 Quick Quiz

What does this output?

::code-wrapper{language="javascript"}
```javascript
const str = "𝕏";  // U+1D54F (mathematical double-struck capital X)
console.log(str.length);
console.log([...str].length);
console.log(str.charAt(0) === str[0]);
console.log(str.codePointAt(0));
```
::

<details>
<summary>Answer</summary>

```javascript
2          // str.length — 2 code units (surrogate pair: U+D835, U+DD4F)
1          // [...str].length — 1 code point (spread iterates by code point)
true       // str.charAt(0) === str[0] — both return the high surrogate "\uD835"
120143     // str.codePointAt(0) — 0x1D54F = 120143 (the actual code point)
```

**The lesson**: JavaScript strings are UTF-16 — `.length`, `.charAt()`, and index access operate on **code units** (16-bit), not code points. Characters outside the BMP (U+0000–U+FFFF) are encoded as surrogate pairs (2 code units), so `.length` returns 2 for a single emoji. Use `[...str]` or `for...of` to iterate by code point, and `.codePointAt()` for the actual Unicode code point.

</details>