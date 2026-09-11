---
title: "JavaScript 18 — Error Handling Architecture: Custom Errors, Async & Stack Traces"
description: "Deep-dive into JavaScript error handling: try/catch/finally semantics, the Error object and stack trace internals, custom error hierarchies, async error propagation, and global error handlers. Code-first reference for senior engineers."
---

# 18 — Error Handling Architecture: Custom Errors, Async & Stack Traces

## The `Error` Object Internals

::code-wrapper{language="javascript"}
```javascript
// ── The Error object has: name, message, stack (and optionally cause) ──
const err = new Error("something went wrong");
console.log(err.name);    // "Error"
console.log(err.message); // "something went wrong"
console.log(err.stack);   // "Error: something went wrong\n    at file.js:1:13\n    at ..."
// stack is a string (non-standard format, varies by engine)
// In V8: includes the call stack frames
// In modern engines: stack is a getter (lazily computed, can be modified)

// ── Error subclasses (built-in) ──
// TypeError, RangeError, SyntaxError, ReferenceError, URIError, EvalError
try { null.x } catch (e) { console.log(e instanceof TypeError); }  // true
try { [].length = -1 } catch (e) { console.log(e instanceof RangeError); }  // true
try { eval("if (true) {") } catch (e) { console.log(e instanceof SyntaxError); }  // true
try { undeclaredVar } catch (e) { console.log(e instanceof ReferenceError); }  // true

// ── Error.cause (ES2022) — chain errors for better debugging ──
try {
    JSON.parse(invalidJson);
} catch (originalError) {
    throw new Error("Failed to parse config file", { cause: originalError });
    // cause preserves the original error (stack trace chain)
}
// Caller can access: err.cause → the original SyntaxError
```
::

## Custom Error Hierarchy

::code-wrapper{language="javascript"}
```javascript
// ── Custom error classes for domain-specific errors ──
class AppError extends Error {
    constructor(message, { code, statusCode, cause } = {}) {
        super(message, { cause });
        this.name = this.constructor.name;  // set name to the subclass name
        this.code = code;                    // machine-readable error code
        this.statusCode = statusCode;        // HTTP status code (for APIs)
        Error.captureStackTrace?.(this, this.constructor);  // V8: clean stack (skip this frame)
    }
}

class ValidationError extends AppError {
    constructor(message, { field, cause } = {}) {
        super(message, { code: "VALIDATION_ERROR", statusCode: 400, cause });
        this.field = field;  // which field failed validation
    }
}

class NotFoundError extends AppError {
    constructor(resource, id) {
        super(`${resource} not found: ${id}`, {
            code: "NOT_FOUND",
            statusCode: 404,
        });
        this.resource = resource;
        this.id = id;
    }
}

class DatabaseError extends AppError {
    constructor(message, { query, cause } = {}) {
        super(message, { code: "DATABASE_ERROR", statusCode: 500, cause });
        this.query = query;
    }
}

// ── Usage with instanceof (hierarchical error handling) ──
function handleApiError(error) {
    if (error instanceof ValidationError) {
        return { status: 400, error: { code: error.code, message: error.message, field: error.field } };
    }
    if (error instanceof NotFoundError) {
        return { status: 404, error: { code: error.code, message: error.message } };
    }
    if (error instanceof DatabaseError) {
        console.error("DB error:", error.cause);  // log the original cause
        return { status: 500, error: { code: "INTERNAL_ERROR", message: "database error" } };
    }
    // Fallback for unknown errors
    console.error("unexpected error:", error);
    return { status: 500, error: { code: "INTERNAL_ERROR", message: "unexpected error" } };
}

// ── Throwing and catching ──
try {
    throw new ValidationError("invalid email", { field: "email" });
} catch (error) {
    if (error instanceof ValidationError) {
        console.log("validation failed:", error.field);  // "email"
    }
}
```
::

## Async Error Handling

::code-wrapper{language="javascript"}
```javascript
// ── try/catch with await (catches async errors) ──
async function fetchData(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        if (error instanceof TypeError) {
            // Network error (fetch failed entirely — CORS, DNS, offline)
            throw new AppError("Network request failed", { code: "NETWORK_ERROR", cause: error });
        }
        throw error;  // re-throw HTTP errors and parse errors
    }
}

// ── Promise.catch for error handling (alternative to try/catch) ──
fetchData(url)
    .then(data => console.log(data))
    .catch(error => console.error("failed:", error));

// ── Multiple error types in one catch ──
async function processData() {
    try {
        const data = await fetchData("/api/data");
        const validated = validate(data);  // might throw ValidationError
        const saved = await save(validated);  // might throw DatabaseError
        return saved;
    } catch (error) {
        if (error instanceof ValidationError) {
            // Validation error — 400
            throw error;
        }
        if (error instanceof DatabaseError) {
            // DB error — 500
            throw error;
        }
        if (error instanceof TypeError) {
            // Network error — 503
            throw new AppError("service unavailable", { code: "NETWORK_ERROR", statusCode: 503, cause: error });
        }
        // Unknown error — re-throw
        throw error;
    }
}

// ── `finally` with async (cleanup that always runs) ──
async function withDatabase() {
    const client = await connectDB();
    try {
        return await client.query("SELECT * FROM users");
    } finally {
        await client.disconnect();  // always runs (even if query throws)
    }
}
```
::

## Anti-Pattern: Swallowing Errors

::code-wrapper{language="javascript"}
```javascript
// ❌ NAIVE — empty catch swallows errors (makes debugging impossible)
try {
    JSON.parse(data);
} catch (e) {
    // silently ignored — no log, no re-throw, no handling
}
// If the parse fails, the caller has no idea something went wrong.

// ❌ ALSO BAD — catch with console.log but no re-throw
try {
    JSON.parse(data);
} catch (e) {
    console.log("error:", e);  // logs but continues with undefined data
}
// The function continues with `data` being undefined — downstream code breaks.

// ✅ CORRECT — handle, re-throw, or provide a fallback
try {
    return JSON.parse(data);
} catch (e) {
    // Option 1: re-throw with context
    throw new Error("Failed to parse data", { cause: e });
    // Option 2: return a safe default
    // return {};
    // Option 3: log and re-throw
    // console.error("parse failed:", e); throw e;
}
```
::

## Global Error Handlers

::code-wrapper{language="javascript"}
```javascript
// ── Browser: window.onerror (catches uncaught synchronous errors) ──
window.addEventListener("error", (event) => {
    // event.error: the Error object
    // event.message, event.filename, event.lineno, event.colno
    console.error("Uncaught error:", event.error);
    // Send to error reporting service (Sentry, etc.)
    reportError(event.error);
    event.preventDefault();  // prevent the default error console output
});

// ── Browser: unhandledrejection (catches uncaught Promise rejections) ──
window.addEventListener("unhandledrejection", (event) => {
    console.error("Unhandled rejection:", event.reason);
    reportError(event.reason);
    event.preventDefault();  // prevent console warning
});

// ── Node.js: process error events ──
// process.on("uncaughtException", (error) => {
//     console.error("uncaught:", error);
//     // ⚠️ Don't continue running — the app is in an inconsistent state.
//     // Best practice: log, cleanup, and exit.
//     process.exit(1);
// });
// process.on("unhandledRejection", (reason) => {
//     console.error("unhandled rejection:", reason);
//     process.exit(1);
// });

// ── Error boundary pattern (React-style) ──
class ErrorBoundary {
    constructor() {
        this.handlers = [];
    }
    catch(fn) {
        try {
            return fn();
        } catch (error) {
            for (const handler of this.handlers) {
                if (handler.canHandle(error)) return handler.handle(error);
            }
            throw error;
        }
    }
    addHandler(handler) { this.handlers.push(handler); }
}
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript"}
```javascript
// ── Error.cause for error chains (ES2022) ──
try {
    await fetch(url);
} catch (networkError) {
    throw new Error("API call failed", { cause: networkError });
    // The original error is preserved in .cause — full debug trail
}

// ── Error.captureStackTrace (V8/Node) for clean stack traces ──
class MyError extends Error {
    constructor(message) {
        super(message);
        Error.captureStackTrace(this, MyError);  // skips the MyError constructor frame
    }
}

// ── `throw` can throw anything (not just Error objects) ──
// throw "string error";   // works but bad practice (no stack trace)
// throw { code: 42 };     // works but bad practice
// ALWAYS throw an Error (or subclass) — it has a stack trace.
// If you catch non-Error throws: try { ... } catch (e) { if (e instanceof Error) ... }

// ── AggregateError (ES2021) — multiple errors in one ──
const errors = [
    new Error("error 1"),
    new Error("error 2"),
];
throw new AggregateError(errors, "multiple failures");
// catch: err.errors → [Error("error 1"), Error("error 2")]

// ── Structured error for API responses ──
function toApiError(error) {
    return {
        error: {
            code: error.code ?? "UNKNOWN",
            message: error.message ?? "An error occurred",
            field: error.field,
            ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
        },
    };
}
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript"}
```javascript
// ── `throw` can throw any value (not just Error) ──
// throw "string";  // catch(e) → e is "string" (no .stack, no .message)
// Always throw new Error() or a subclass — for stack traces and consistency.
// In catch: if (e instanceof Error) ... else // handle non-Error throws

// ── `finally` runs even after return (and can override the return value) ──
function f() {
    try { return "try"; }
    finally { return "finally"; }  // overrides "try" — returns "finally"
}
// Don't return from finally — it silently swallows errors and return values.

// ── Async errors don't propagate to the caller's try/catch without await ──
async function f() { throw new Error("async error"); }
try {
    f();  // doesn't throw — returns a rejected Promise (not awaited)
} catch (e) {
    console.log("caught");  // NOT reached — the rejection is unhandled
}
// Fix: await f() or f().catch(...)

// ── `catch` without a parameter (ES2019) ──
try { JSON.parse(data) } catch { console.log("parse failed") }  // no (e) needed

// ── Error.stack is non-standard (format varies by engine) ──
// V8 (Chrome/Node): multi-line string with function names and positions
// SpiderMonkey (Firefox): different format
// Don't parse .stack programmatically — use Error.prepareStackTrace (V8) or source maps.

// ── `Error.captureStackTrace` is V8-only (not in Firefox/Safari) ──
// Use optional chaining: Error.captureStackTrace?.(this, constructor)

// ── `instanceof Error` is false for non-Error throws ──
try { throw "string" } catch (e) { console.log(e instanceof Error); }  // false
```
::

## 🧠 Quick Quiz

What's the output?

::code-wrapper{language="javascript"}
```javascript
async function test() {
    try {
        throw new Error("A");
    } catch (e) {
        console.log("B", e.message);
        throw new Error("C");
    } finally {
        console.log("D");
    }
}
test().catch(e => console.log("E", e.message));
```
::

<details>
<summary>Answer</summary>

```
B A
D
E C
```

1. `test()` is called. Inside: `throw new Error("A")` → caught by `catch`.
2. `B A` — catch logs `"B"` and the error message `"A"`.
3. `throw new Error("C")` — re-throws a new error.
4. `finally` runs (always): logs `"D"`.
5. The function returns a rejected Promise (Error("C") was thrown).
6. `.catch(e => ...)` catches the rejection: logs `"E C"`.

**The lesson**: `finally` always runs (even after a `throw` in `catch`). The `throw new Error("C")` in `catch` propagates as a rejected Promise, caught by `.catch()` in the caller.

</details>