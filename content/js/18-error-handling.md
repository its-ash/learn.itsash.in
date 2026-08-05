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

## Key Takeaways

- `Error` has `name`, `message`, `stack` — subclass for custom error types.
- Use `instanceof` to catch specific error types — re-throw unknowns.
- Throw `Error` objects, not strings — preserves stack traces.
- Never swallow errors silently — at minimum log them.
- Use `finally` for resource cleanup — runs regardless of success/failure.