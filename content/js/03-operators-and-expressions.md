# 03 — Operators & Expressions

## Comparison Operators

### `==` (loose) vs `===` (strict)

::code-wrapper{language="javascript"}
```javascript
// Loose equality — coerces types before comparing
0 == ''           // true (both become 0)
0 == false        // true
null == undefined // true (special case — only equals each other)
'0' == 0          // true (string coerced to number)
[] == false       // true (toPrimitive → 0 == 0)

// Strict equality — no coercion, types must match
0 === ''           // false
null === undefined // false
'0' === 0          // false
[] === false       // false

// Best practice: ALWAYS use === and !==
```
::

### Edge cases with `Object.is`

::code-wrapper{language="javascript"}
```javascript
// Object.is — like === but fixes two edge cases
NaN === NaN         // false
Object.is(NaN, NaN) // true ⭐

-0 === 0            // true
Object.is(-0, 0)    // false ⭐

// Use Object.is when you need to distinguish -0 from 0 or detect NaN
```
::

## Arithmetic Operators

::code-wrapper{language="javascript"}
```javascript
5 + 2      // 7
5 - 2      // 3
5 * 2      // 10
5 / 2      // 2.5 (always float division — unlike Java/C)
5 % 2      // 1 (remainder, not modulo — negative results follow dividend sign)
-5 % 2     // -1 (not 1!)
5 ** 2     // 25 (exponentiation — ES2016)

// Increment / decrement
let x = 5
x++   // 5 (returns old value, then increments)
++x   // 7 (increments first, then returns new value)
x--   // 7 (returns old value, then decrements)
```
::

### Edge case: modulo with negative numbers

::code-wrapper{language="javascript"}
```javascript
// % is remainder, not modulo — sign follows the dividend
-7 % 3    // -1
7 % -3   // 1
-7 % -3  // -1

// True modulo (always non-negative) for positive divisor
function mod(n, m) {
  return ((n % m) + m) % m
}
mod(-7, 3)  // 2
```
::

## Logical Operators

::code-wrapper{language="javascript"}
```javascript
// Short-circuit evaluation
true && 'hello'     // 'hello' (returns second operand)
false && 'hello'    // false
true || 'hello'     // true
false || 'hello'    // 'hello' (returns second operand)
null ?? 'hello'     // 'hello'

// Chaining
const value = config?.options?.theme ?? 'default'

// ! negation
!true               // false
!0                  // true
!'text'             // false
!!value             // convert to boolean
```
::

## Bitwise Operators

::code-wrapper{language="javascript"}
```javascript
5 & 3      // 1   (AND: 0101 & 0011 = 0001)
5 | 3      // 7   (OR)
5 ^ 3      // 6   (XOR)
~5         // -6  (NOT)
5 << 1     // 10  (left shift = *2)
5 >> 1     // 2   (right shift = /2, preserves sign)
-5 >>> 1   // 2147483645 (unsigned right shift)

// Practical: flags
const READ = 1, WRITE = 2, EXEC = 4
let perms = READ | WRITE          // 3
perms & READ                      // 1 (truthy — has read)
perms & EXEC                      // 0 (falsy — no exec)
perms = perms & ~WRITE            // remove write
perms |= EXEC                    // add exec
```
::

## String Operators

::code-wrapper{language="javascript"}
```javascript
// Concatenation
'Hello' + ' ' + 'World'    // "Hello World"
'Count: ' + 42             // "Count: 42" (number coerced)

// Template literals (preferred)
const name = 'Alice'
const age = 30
`Hello ${name}, you are ${age} years old`    // "Hello Alice, you are 30 years old"
`2 + 2 = ${2 + 2}`                           // "2 + 2 = 4"

// Multi-line strings
const html = `
  <div>
    <p>Hello</p>
  </div>
`
```
::

## Ternary Operator

::code-wrapper{language="javascript"}
```javascript
const status = age >= 18 ? 'adult' : 'minor'

// Chaining (readable for short cases)
const tier = score >= 90 ? 'A'
  : score >= 80 ? 'B'
  : score >= 70 ? 'C'
  : 'F'

// Edge case: void expressions in ternary
const result = condition ? doSomething() : null  // returns return value of doSomething()
```
::

## Optional Chaining (`?.`) and Nullish Coalescing (`??`)

::code-wrapper{language="javascript"}
```javascript
// Optional chaining — short-circuits on null/undefined
const street = user?.address?.street    // undefined if any link is null/undefined
user?.greet?.()                        // call only if function exists
user?.friends?.[0]?.name               // bracket notation

// Without optional chaining (old way)
const street = user && user.address && user.address.street

// Nullish coalescing — default for null/undefined only
const name = user?.name ?? 'Anonymous'
const count = response?.count ?? 0     // keeps 0 if response.count is 0
```
::

### Edge case: optional chaining with `delete`

::code-wrapper{language="javascript"}
```javascript
// Optional chaining can't be used with delete in all engines
delete user?.address?.street   // SyntaxError in some contexts — use carefully

// Safe alternative
if (user?.address?.street) delete user.address.street
```
::

## Spread and Rest Operators

::code-wrapper{language="javascript"}
```javascript
// Spread — expands iterables
const arr1 = [1, 2, 3]
const arr2 = [...arr1, 4, 5]    // [1, 2, 3, 4, 5]
const copy = [...arr1]          // shallow copy
const merged = { ...obj1, ...obj2 }  // shallow merge (obj2 overrides obj1)

// Rest — collects remaining args
function sum(...nums) {
  return nums.reduce((a, b) => a + b, 0)
}
sum(1, 2, 3, 4)   // 10

const [first, ...rest] = [1, 2, 3, 4]   // first=1, rest=[2,3,4]
```
::

## 💡 Tips & Tricks

**Truthy checks without coercion** — Instead of `if (arr.length > 0)`, just `if (arr.length)` (0 is falsy). But for booleans, be explicit: `if (isActive === true)` vs `if (isActive)` prevents bugs when someone passes `1` or `"yes"`.

**Object.is for Sets/Maps** — Use `Object.is` when deduplicating with Sets: `new Set([0, -0, NaN, NaN]).size` is 3 (because `===` sees `0 === -0` and `NaN !== NaN`), but with custom Sets using `Object.is`, you can fix edge cases.

**Chaining `??` and `||`** — `a ?? b || c` is a trap: if `a` is `null`, `??` returns `b`, then `||` evaluates `b || c`. Use explicit grouping: `(a ?? b) || c`.

**Bitwise for fast checks** — `value & 1` checks odd; `(value >> 1) << 1 === value` checks even. Fast, but less readable — only in hot loops.

## ⚠️ Edge Cases & Gotchas

**The modulo sign trap** — JavaScript's `%` is remainder, not modulo. `-7 % 3` is `-1` (not `2`). If you need true modulo, use: `((n % m) + m) % m`. This bites floor-based grid systems.

**Optional chaining silently returns undefined** — `obj?.prop?.method?.()` returns `undefined` if any link is null. Don't chain too deep without explicit null checks — you lose debugging info.

**Spread doesn't deep-clone** — `{...obj}` creates shallow copies. Nested objects are still shared references. For deep clone: `JSON.parse(JSON.stringify(obj))` (but loses functions/symbols) or use a library.

**Ternary readability cliff** — `a ? b : c ? d : e` chains are confusing. The parser reads right-to-left: `a ? b : (c ? d : e)`. Always use parentheses for clarity. If >3 levels, use `if` statements instead.

## 🧠 Spot the Bug

What's the output?

```javascript
const obj = { x: 1 }
const result = obj?.x ?? 2
const value = undefined ?? 0 || 5
console.log(result, value)
```

<details>
<summary>Answer</summary>

Logs `1 5`. Here's why:
- `obj?.x ?? 2` → `1` (obj.x is 1, not null/undefined)
- `undefined ?? 0` → `0` (0 is not null/undefined, so `??` returns it)
- `0 || 5` → `5` (0 is falsy, so `||` returns 5)

**The lesson**: Chaining `??` with `||` causes the second half to flip falsy 0 back to truthy. Use one operator or parentheses.

</details>

## Key Takeaways

- Always use `===` / `!==` — never `==` / `!=`.
- `Object.is` fixes the `NaN === NaN` and `-0 === 0` edge cases.
- `%` is remainder (sign follows dividend), not modulo.
- `?.` and `??` are the modern way to handle optional values.
- Spread creates **shallow** copies — nested objects are still shared references.