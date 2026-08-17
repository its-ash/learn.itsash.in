# 18 — Error Handling

## `try` / `catch` / `finally`

::code-wrapper{language="javascript"}
```javascript
try {
  const data = JSON.parse(badJson)
} catch (error) {
  // error is a SyntaxError for JSON.parse
  console.error(error.name)    // "SyntaxError"
  console.error(error.message)  // "Unexpected token..."
  console.error(error.stack)    // full stack trace
} finally {
  cleanup()  // always runs
}
```
::
::

## Custom Errors

::code-wrapper{language="javascript"}
```javascript
class ValidationError extends Error {
  constructor(field, message) {
    super(message)
    this.name = 'ValidationError'
    this.field = field
  }
}

class NotFoundError extends Error {
  constructor(resource) {
    super(`${resource} not found`)
    this.name = 'NotFoundError'
    this.resource = resource
  }
}

function getUser(id) {
  if (id < 0) throw new ValidationError('id', 'Must be positive')
  if (!users[id]) throw new NotFoundError('User')
  return users[id]
}

// Catch specific error types
try {
  getUser(-1)
} catch (error) {
  if (error instanceof ValidationError) {
    console.error(`Invalid ${error.field}: ${error.message}`)
  } else if (error instanceof NotFoundError) {
    console.error(error.message)
  } else {
    throw error  // re-throw unknown errors
  }
}
```
::
::

## Async Error Handling

::code-wrapper{language="javascript"}
```javascript
// Promise.catch
fetch('/api/data')
  .then(res => res.json())
  .catch(err => console.error('Network error:', err))

// async/await with try/catch
async function fetchData() {
  try {
    const res = await fetch('/api/data')
    return await res.json()
  } catch (err) {
    if (err instanceof TypeError) {
      console.error('Network failure')
    } else {
      console.error('Other error:', err)
    }
    return null  // graceful fallback
  }
}

// .catch on promise chain — catches any rejection above it
fetchData()
  .then(process)
  .catch(err => console.error('Any error in chain:', err))
```
::
::

## Best Practices

::code-wrapper{language="javascript"}
```javascript
// ✅ Throw Errors, not strings
throw new Error('Something went wrong')  // yes
throw 'Something went wrong'              // no — loses stack trace

// ✅ Always handle rejections
promise.catch(err => console.error(err))  // yes
promise.then(handle)                      // no — unhandled rejection if it rejects

// ✅ Don't swallow errors silently
try { risky() } catch (e) { /* nothing */ }  // ❌
try { risky() } catch (e) { console.error(e) }  // ✅

// ✅ Use finally for cleanup
try {
  const conn = openConnection()
  // ... work
} finally {
  conn.close()  // always runs
}
```
::
::

## 💡 Tips & Tricks

**Use custom error classes for domain errors** — `class DuplicateUserError extends Error {}` is cleaner than generic errors with message strings. Callers can catch by type.

**Error.cause for chaining** — `throw new Error('Database failed', { cause: originalError })` (ES2022). Preserves the original error in stack for debugging.

**Stack property is lazy** — `new Error().stack` is computed on first access, not construction. If you capture errors but never log them, you save performance.

**Rethrow modified errors** — Catch, add context, rethrow: `catch (e) { throw new Error(\`Loading \${file} failed: \${e.message}\`) }`.

**Use error types for API contracts** — If your library throws `ValidationError`, callers can reliably catch it across versions.

## ⚠️ Edge Cases & Gotchas

**Errors in finally run after catch** — If both throw, the finally error replaces the original: `try { throw 1 } catch (e) { } finally { throw 2 }` throws 2, not 1.

**Unhandled rejections crash Node.js** — Forget `.catch()` on a promise and Node v15+ crashes. Use `--unhandled-rejections=warn` to demote to warnings.

**Custom errors lose instanceof in transpiled code** — Babel can break `instanceof` for subclassed Errors. Test in your target runtime.

**toString() on Error is hidden** — `throw "my error"` is caught as a string, but `e.toString()` is `"my error"`, not an Error object. Always throw Error objects.

**Error.stack format differs** — Chrome, Node, Firefox, Safari all have slightly different stack formats. Don't parse it; only log it or send to monitoring services.

## 🧠 Spot the Bug

What gets logged?

::code-wrapper{language="javascript"}
```javascript
try {
  try {
    throw new Error('Inner')
  } catch (e) {
    console.log(e.message)
    throw new Error('Caught')
  }
} catch (e) {
  console.log(e.message)
}

try {
  throw new Error('Test')
} finally {
  throw new Error('Finally')
}
```
::

<details>
<summary>Answer</summary>

First logs "Inner" then "Caught". Second throws "Finally" (the finally error replaces the original).

**The lesson**: Re-thrown errors replace the original. Errors in finally override the result entirely.

</details>

## Key Takeaways

- `Error` has `name`, `message`, `stack` — subclass for custom error types.
- Use `instanceof` to catch specific error types — re-throw unknowns.
- Throw `Error` objects, not strings — preserves stack traces.
- Never swallow errors silently — at minimum log them.
- Use `finally` for resource cleanup — runs regardless of success/failure.