# 28 — TypeScript Essentials

## Types and Interfaces

::code-wrapper{language="typescript"}
```typescript
// Basic types
const name: string = 'Alice'
const age: number = 30
const active: boolean = true
const ids: number[] = [1, 2, 3]
const tuple: [string, number] = ['Alice', 30]

// Interface — object shapes
interface User {
  id: number
  name: string
  email?: string           // optional
  readonly createdAt: Date  // immutable
}

// Type alias
type ID = string | number
type Callback = (data: User) => void

// Union and intersection
type Result = { success: true; data: User } | { success: false; error: string }
type Admin = User & { permissions: string[] }
```
::
::

## Generics

::code-wrapper{language="typescript"}
```typescript
function identity<T>(value: T): T {
  return value
}

function first<T>(arr: T[]): T | undefined {
  return arr[0]
}

// Constraints
function getLength<T extends { length: number }>(item: T): number {
  return item.length
}

// Generic with default
function create<T = string>(): T[] { return [] }
```
::
::

## Type Narrowing

::code-wrapper{language="typescript"}
```typescript
function process(value: string | number) {
  if (typeof value === 'string') {
    value.toUpperCase()  // TS knows it's string here
  } else {
    value.toFixed(2)     // TS knows it's number here
  }
}

// instanceof
if (error instanceof TypeError) { }

// in operator
interface Cat { meow(): void }
interface Dog { bark(): void }
function speak(animal: Cat | Dog) {
  if ('meow' in animal) animal.meow()
  else animal.bark()
}
```
::
::

## 💡 Tips & Tricks

**`satisfies` validates without widening the inferred type** — `const config = { url: 'x', timeout: 5 } satisfies Record<string, string | number>` checks the shape against the type while still letting TypeScript infer the narrowest possible literal types for autocomplete — `as` would just assert and lose that precision.

**`as const` locks values to their literal types** — `const dirs = ['up', 'down'] as const` types `dirs` as `readonly ['up', 'down']` instead of `string[]`, which is essential for deriving union types like `type Dir = typeof dirs[number]`.

**Use `tsc --noEmit` for type-checking in CI without building** — Skips generating output files entirely, running only the type checker — fast feedback in a lint/CI step separate from the actual bundler build.

**Utility types compose to avoid duplication** — `Partial<Pick<User, 'name' | 'email'>>` builds a type for "optionally update just these two fields" directly from an existing `User` interface instead of hand-writing a new one that can drift out of sync.

**`// @ts-expect-error` documents intentional type errors** — Unlike `// @ts-ignore`, it fails the build if the next line stops being an error (e.g. after a dependency fixes its types) — self-cleaning technical debt markers.

## ⚠️ Edge Cases & Gotchas

**`any` disables checking for everything it touches, including downstream** — `function process(data: any) { return data.name.toUpperCase() }` compiles fine even if `data` is a number at runtime — `any` isn't just "unknown type," it's "please stop type-checking this value and anything derived from it," which can silently swallow real bugs.

**Structural typing means unrelated types can satisfy an interface by accident** — `interface Point { x: number; y: number }` is satisfied by any object with those two properties, even a `{ x: 1, y: 2, z: 3 }` from a completely different domain — TypeScript checks shape, not name or intent, which is powerful but can let a `Vector3` slip in where a `Point` was expected.

**Optional properties (`email?`) and `undefined`-typed properties are not the same** — `interface User { email?: string }` allows omitting the key entirely, while `{ email: string | undefined }` requires the key to be present (even if its value is `undefined`) — `'email' in user` behaves differently between the two.

**Type narrowing can be invalidated by later mutation** — `if (typeof value === 'string') { setTimeout(() => value.toUpperCase(), 100) }` — TypeScript narrows `value` to `string` inside the `if`, but if `value` is a `let` captured by a closure and reassigned before the timeout fires, the narrowing was only ever a compile-time guarantee for that instant, not a runtime one.

**`interface` declarations merge; `type` aliases don't** — Declaring `interface User { id: number }` twice in the same scope silently merges both into one combined interface — useful for augmenting library types, but a genuine bug source if it happens by accident (e.g. a typo'd re-declaration you expected to be an error).

## 🧠 Spot the Bug

Does this compile, and does it behave the way it looks like it should?

::code-wrapper{language="typescript"}
```typescript
interface Shape { area(): number }
interface Circle { area(): number; radius: number }

function describe(shape: Shape) {
  console.log('Area:', shape.area())
}

const notReallyACircle = { area: () => 10, radius: 'wide' }
describe(notReallyACircle)

const circle: Circle = { area: () => 10, radius: 5 }
describe(circle)
```
::

<details>
<summary>Answer</summary>

Both calls compile and run without error, even though `notReallyACircle.radius` is a `string`, not a `number`, and the object was never declared as implementing `Circle` or `Shape`. TypeScript uses **structural typing** — `describe` only requires an `area(): number` method, and `notReallyACircle` happens to have one, so it satisfies `Shape` regardless of its other mismatched properties or lack of explicit type annotation.

**The lesson**: TypeScript checks "does this shape fit," not "was this declared as that type" — objects can accidentally satisfy an interface they were never intended to implement, so don't rely on a parameter type alone to guarantee semantic correctness.

</details>

## Key Takeaways

- TypeScript adds static types to JavaScript — catches errors at compile time.
- Use `interface` for object shapes, `type` for unions/intersections/aliases.
- Generics enable reusable type-safe functions and classes.
- Type narrowing via `typeof`, `instanceof`, `in` — TS infers type within branches.