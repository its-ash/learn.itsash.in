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

## Key Takeaways

- TypeScript adds static types to JavaScript — catches errors at compile time.
- Use `interface` for object shapes, `type` for unions/intersections/aliases.
- Generics enable reusable type-safe functions and classes.
- Type narrowing via `typeof`, `instanceof`, `in` — TS infers type within branches.