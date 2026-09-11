---
title: "JavaScript 25 — Testing Architecture: Vitest, Mocking & TDD Patterns"
description: "Deep-dive into JavaScript testing: test types (unit/integration/e2e), Vitest setup and assertions, mocking with vi.mock and vi.fn, dependency injection for testability, snapshot testing, and the TDD red-green-refactor cycle. Code-first reference for senior engineers."
---

# 25 — Testing Architecture: Vitest, Mocking & TDD Patterns

## Test Types and Their Boundaries

::code-wrapper{language="javascript"}
```javascript
// ── Test pyramid (most tests at the bottom, fewest at the top) ──
//
//        E2E (few)     — full browser/network (Playwright, Cypress)
//       /          \
//   Integration (some) — multiple units together (API + DB, component + store)
//  /                \
// Unit (many)           — isolated function/class (mocked dependencies)
//
// ── Unit test: test one function in isolation (dependencies mocked) ──
// ── Integration test: test multiple units together (real dependencies) ──
// ── E2E test: test the full user flow (browser, server, database) ──

// ── Vitest test structure ──
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { calculateTotal, applyDiscount } from "./math.js";

describe("calculateTotal", () => {  // group related tests
    it("sums an array of prices", () => {  // individual test
        expect(calculateTotal([10, 20, 30])).toBe(60);
    });

    it("returns 0 for empty array", () => {
        expect(calculateTotal([])).toBe(0);
    });

    it("handles negative values", () => {
        expect(calculateTotal([-10, 20])).toBe(10);
    });
});

// ── Vitest assertions ──
expect(value).toBe(expected);        // strict equality (===)
expect(value).toEqual(expected);    // deep equality (object/array content)
expect(value).toBeTruthy();         // truthy check
expect(value).toBeFalsy();          // falsy check
expect(value).toBeNull();           // === null
expect(value).toBeUndefined();      // === undefined
expect(value).toBeNaN();            // Number.isNaN
expect(array).toContain(item);     // array.includes(item) or string.includes
expect(array).toHaveLength(3);     // array.length === 3
expect(fn).toThrow("error msg");   // function throws
expect(value).toMatch(/regex/);    // regex match
expect(object).toMatchObject({ key: value });  // partial object match
```
::

## Mocking: `vi.fn`, `vi.mock`, and `vi.spyOn`

::code-wrapper{language="javascript"}
```javascript
import { vi, describe, it, expect, beforeEach } from "vitest";

// ── vi.fn: create a mock function (track calls, return values) ──
const mockCallback = vi.fn();
mockCallback("arg1", "arg2");
expect(mockCallback).toHaveBeenCalledTimes(1);
expect(mockCallback).toHaveBeenCalledWith("arg1", "arg2");
expect(mockCallback).toHaveBeenLastCalledWith("arg1", "arg2");

// Control the return value:
const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => ({ data: "test" }) });
await mockFetch("/api/data");  // returns the mocked resolved value

// ── vi.mock: replace a module's exports with mocks ──
vi.mock("./api.js", () => ({
    fetchData: vi.fn().mockResolvedValue({ id: 1, name: "test" }),
    deleteUser: vi.fn().mockResolvedValue(true),
}));

import { fetchData, deleteUser } from "./api.js";
// fetchData is now a mock — returns { id: 1, name: "test" } without hitting the real API

// ── vi.spyOn: spy on an existing method (track calls, optionally override) ──
const obj = { method: (x) => x * 2 };
const spy = vi.spyOn(obj, "method");
obj.method(5);
expect(spy).toHaveBeenCalledWith(5);
expect(spy).toHaveReturnedWith(10);
// spy tracks calls but calls the REAL method (unless you mock the return):
spy.mockReturnValue(999);
obj.method(5);  // returns 999 (mocked, real method not called)

// ── beforeEach / afterEach: setup and teardown ──
beforeEach(() => {
    vi.clearAllMocks();  // reset call counts and return values
    // vi.resetAllMocks();  // also resets the implementation
});

afterEach(() => {
    vi.restoreAllMocks();  // restore spies to original implementations
});
```
::

## Anti-Pattern: Testing Implementation Details

::code-wrapper{language="javascript"}
```javascript
// ❌ NAIVE — testing implementation details (breaks on refactoring)
describe("UserService", () => {
    it("uses Map internally", () => {
        const service = new UserService();
        expect(service.users).toBeInstanceOf(Map);  // testing the internal data structure
        // If you refactor from Map to Array, this test breaks — even if behavior is correct.
    });

    it("calls validate exactly once", () => {
        const spy = vi.spyOn(service, "validate");
        service.create({ name: "Alice" });
        expect(spy).toHaveBeenCalledTimes(1);  // testing internal call count
        // If you add caching to validate, this test breaks — even if behavior is correct.
    });
});

// ✅ CORRECT — test behavior (public API, not internals)
describe("UserService", () => {
    it("creates a user and returns it with an ID", () => {
        const service = new UserService();
        const user = service.create({ name: "Alice" });
        expect(user).toEqual(expect.objectContaining({  // partial match
            id: expect.any(Number),
            name: "Alice",
        }));
    });

    it("throws on invalid input", () => {
        const service = new UserService();
        expect(() => service.create({ name: "" })).toThrow("invalid name");
        expect(() => service.create({})).toThrow("invalid name");
    });

    it("retrieves a created user by ID", () => {
        const service = new UserService();
        const created = service.create({ name: "Alice" });
        const found = service.getById(created.id);
        expect(found).toEqual(created);
    });
});
```
::

## Production Pattern: Dependency Injection for Testability

::code-wrapper{language="javascript"}
```javascript
// ── Inject dependencies (don't import them directly) for easy mocking ──

// ❌ Hard to test (direct import — can't mock without vi.mock)
class UserService {
    async getUser(id) {
        const response = await fetch(`/api/users/${id}`);  // direct fetch — hard to mock
        return response.json();
    }
}

// ✅ Testable (dependency injection — pass fetch as a constructor arg)
class TestableUserService {
    constructor(fetchImpl = fetch) {  // default to global fetch, but injectable
        this.fetch = fetchImpl;
    }
    async getUser(id) {
        const response = await this.fetch(`/api/users/${id}`);
        return response.json();
    }
}

// Test with a mock fetch:
test("getUser fetches from the API", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ id: 1, name: "Alice" }),
    });
    const service = new TestableUserService(mockFetch);

    const user = await service.getUser(1);

    expect(mockFetch).toHaveBeenCalledWith("/api/users/1");
    expect(user).toEqual({ id: 1, name: "Alice" });
});

// ── Factory function with injected dependencies ──
const createUserService = ({ fetch: fetchImpl = fetch, log = console.log } = {}) => ({
    async getUser(id) {
        const response = await fetchImpl(`/api/users/${id}`);
        const user = await response.json();
        log("fetched user:", user.name);
        return user;
    },
});
// Test: createUserService({ fetch: mockFetch, log: mockLog })
```
::

## TDD: Red-Green-Refactor

::code-wrapper{language="javascript"}
```javascript
// ── TDD cycle: 1. Red (write failing test) → 2. Green (make it pass) → 3. Refactor ──

// Step 1: RED — write a test for a function that doesn't exist yet
describe("formatCurrency", () => {
    it("formats a number as USD", () => {
        expect(formatCurrency(1234.56)).toBe("$1,234.56");
    });
    it("handles zero", () => {
        expect(formatCurrency(0)).toBe("$0.00");
    });
    it("handles negative numbers", () => {
        expect(formatCurrency(-100)).toBe("-$100.00");
    });
});
// Test fails: formatCurrency is not defined (RED — write minimal code to pass)

// Step 2: GREEN — write the minimum code to make the test pass
function formatCurrency(amount) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
    }).format(amount);
}
// Test passes (GREEN)

// Step 3: REFACTOR — improve the code without changing behavior (tests still pass)
// e.g., add error handling, optimize, extract constants — tests ensure correctness.

// ── Snapshot testing (for stable output like rendered HTML) ──
it("matches the snapshot", () => {
    const html = renderComponent({ title: "Hello" });
    expect(html).toMatchInlineSnapshot(`
      "<div class=\\"title\\">Hello</div>"
    `");
    // If the output changes, the snapshot test fails (review and update if intentional).
});
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript"}
```javascript
// ── Test data builders (reduce boilerplate) ──
const createUser = (overrides = {}) => ({
    id: Math.random(),
    name: "Test User",
    email: "test@example.com",
    active: true,
    ...overrides,  // allow partial overrides
});
createUser({ name: "Alice" });  // { id: ..., name: "Alice", email: ..., active: true }

// ── Test async code ──
it("fetches user data", async () => {
    const user = await getUser(1);
    expect(user.name).toBe("Alice");
});

// ── Test rejected promises ──
it("rejects on invalid ID", async () => {
    await expect(getUser(-1)).rejects.toThrow("invalid ID");
});

// ── beforeEach for common setup ──
beforeEach(() => {
    localStorage.clear();  // reset state before each test
    document.body.innerHTML = "";  // clean DOM
});

// ── Test with timers (vi.useFakeTimers) ──
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("debounces calls", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 1000);
    debounced(); debounced(); debounced();  // multiple calls
    vi.advanceTimersByTime(1000);  // fast-forward 1s (no real waiting)
    expect(fn).toHaveBeenCalledTimes(1);  // only called once after debounce
});
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript"}
```javascript
// ── Don't test implementation details (test behavior, not internals) ──
// Tests that check internal state, call counts, or data structures break on refactoring.
// Test the public API and observable behavior.

// ── `toEqual` does deep equality; `toBe` does strict equality ──
expect({ a: 1 }).toEqual({ a: 1 });  // ✓ (deep — same content)
expect({ a: 1 }).toBe({ a: 1 });    // ✗ (different object references)

// ── `toBeNaN` (not `toBe(NaN)`) ──
expect(NaN).toBeNaN();  // ✓ (NaN !== NaN, so toBe(NaN) would fail)

// ── Mock cleanup: clear mocks between tests to avoid cross-test pollution ──
beforeEach(() => vi.clearAllMocks());  // reset call counts

// ── vi.mock is hoisted (runs before imports) ──
// vi.mock("./api.js", () => ({ fetchData: vi.fn() }));
// This is hoisted to the top — even imports below are mocked.
// Can't use variables defined later in the mock factory (hoisting breaks references).

// ── Snapshot tests can hide bugs (update too easily) ──
// If the output changes, the test fails, but `--update-snapshot` silently passes.
// Review snapshot changes carefully — don't blindly update.

// ── Testing async: always use async/await or expect.assertions ──
it("async test", async () => {
    expect.assertions(1);  // ensure exactly 1 assertion runs (catches swallowed async)
    await someAsyncFunction();
    expect(result).toBe(true);
});
```
::

## 🧠 Quick Quiz

Why is this test fragile?

::code-wrapper{language="javascript"}
```javascript
it("sorts users by name", () => {
    const users = [createUser({ name: "Zara" }), createUser({ name: "Alice" })];
    const sorted = sortBy(users, "name");
    expect(sorted[0].id).toBe(users[1].id);  // fragile
});
```
::

<details>
<summary>Answer</summary>

The test depends on the **implementation detail** of which user object was created second (`users[1].id`). If the test data creation order changes, or if `createUser` is refactored to generate IDs differently, the test breaks — even if the sort is correct.

**Fix**: test the observable behavior (the sorted order of names), not the implementation detail (which object ID is first):

```javascript
it("sorts users by name", () => {
    const users = [createUser({ name: "Zara" }), createUser({ name: "Alice" })];
    const sorted = sortBy(users, "name");
    expect(sorted.map(u => u.name)).toEqual(["Alice", "Zara"]);  // test behavior
});
```

**The lesson**: test what the user observes (the sorted names), not implementation details (object IDs, internal order). Behavior tests survive refactoring; implementation tests break when internals change.

</details>