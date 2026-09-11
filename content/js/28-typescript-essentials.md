---
title: "JavaScript 28 — TypeScript Essentials: Type System, Generics & Conditional Types"
description: "Deep-dive into TypeScript: structural typing vs nominal, type vs interface, generics with constraints, conditional types and inference, mapped types, utility types, and declaration files. Code-first reference for senior engineers."
---

# 28 — TypeScript Essentials: Type System, Generics & Conditional Types

## Structural Typing vs Nominal Typing

::code-wrapper{language="typescript"}
```typescript
// ── TypeScript uses STRUCTURAL typing (duck typing) ──
// Objects are compatible if their SHAPE matches — names don't matter.

interface User { id: number; name: string; }
interface Product { id: number; name: string; }

const user: User = { id: 1, name: "Alice" };
const product: Product = user;  // ✅ compiles (same shape — structural compatibility)
// In nominal typing (Java, C#), this would fail (different types by name).

// ── Branded types: simulate nominal typing (distinguish same-shaped types) ──
type UserId = number & { readonly __brand: "UserId" };
type ProductId = number & { readonly __brand: "ProductId" };

function getUser(id: UserId) { /* ... */ }
function getProduct(id: ProductId) { /* ... */ }

const userId = 1 as UserId;  // must cast (branding at creation)
const productId = 2 as ProductId;

getUser(userId);      // ✅ correct brand
getProduct(userId);   // ❌ Type 'UserId' is not assignable to type 'ProductId'
// Brands prevent mixing same-shaped types (UserId vs ProductId) — runtime safety.
```
::

## `type` vs `interface`

::code-wrapper{language="typescript"}
```typescript
// ── interface: object shapes, can be merged (declaration merging) ──
interface Window {
    customProp: string;  // augments the global Window interface
}
interface Window {  // declaration merging — adds to the existing interface
    anotherProp: number;
}
// window.customProp;  window.anotherProp;  // both available

// ── type: more flexible (unions, intersections, primitives, mapped types) ──
type ID = number | string;           // union (interface can't do this)
type Callback<T> = (value: T) => void; // function type
type Nullable<T> = T | null;         // conditional/generic type alias
type Pair = [string, number];        // tuple (interface can't do this)

// ── When to use which ──
// interface: object shapes, class implementations, extensible (merging), public API
// type: unions, intersections, tuples, mapped types, utility types, internal types

// ── Extending ──
interface Animal { name: string; }
interface Dog extends Animal { bark(): void; }  // interface extends interface

type Animal2 = { name: string };
type Dog2 = Animal2 & { bark(): void };  // type intersection (&)

// ── Both can represent object shapes ──
type UserType = { id: number; name: string };
interface UserInterface { id: number; name: string; }
// Prefer interface for objects (extensible, better error messages)
// Prefer type for unions, intersections, and complex type logic
```
::

## Generics with Constraints

::code-wrapper{language="typescript"}
```typescript
// ── Generic functions: preserve the input type through the function ──
function identity<T>(value: T): T {  // T is a type parameter
    return value;
}
const result = identity("hello");  // T is inferred as string → result: string
const num = identity(42);          // T is inferred as number → num: number

// ── Generic constraints: restrict what T can be (extends) ──
function getLength<T extends { length: number }>(value: T): number {
    return value.length;  // T must have a `length` property
}
getLength("hello");  // ✅ string has length
getLength([1, 2, 3]); // ✅ array has length
getLength(123);       // ❌ number doesn't have length

// ── keyof constraint: get keys of a type ──
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
    return obj[key];  // return type is T[K] (the type of the property at key K)
}
const user = { name: "Alice", age: 30 };
getProperty(user, "name");  // returns string (type of user.name)
getProperty(user, "age");   // returns number (type of user.age)
getProperty(user, "email"); // ❌ "email" is not a key of user

// ── Generic class: type parameter on the class ──
class Stack<T> {
    private items: T[] = [];
    push(item: T): void { this.items.push(item); }
    pop(): T | undefined { return this.items.pop(); }
    peek(): T | undefined { return this.items[this.items.length - 1]; }
}
const numberStack = new Stack<number>();
numberStack.push(1);    // ✅ number
numberStack.push("a");  // ❌ string is not assignable to number

// ── Default type parameters ──
function createArray<T = string>(length: number, value: T): T[] {
    return Array.from({ length }, () => value);
}
createArray(3, "x");     // T=string → string[]
createArray<number>(3, 0); // T=number → number[] (explicit)
```
::

## Conditional Types and Inference

::code-wrapper{language="typescript"}
```typescript
// ── Conditional types: type-level if/else ──
type IsString<T> = T extends string ? "yes" : "no";
type A = IsString<string>;  // "yes"
type B = IsString<number>;  // "no"

// ── infer: extract a type from another type (within a conditional) ──
type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never;
// If T is a function, infer its return type as R; otherwise, never.
type F = ReturnType<() => string>;  // string
type G = ReturnType<(x: number) => boolean>;  // boolean

// ── Extract promise inner type ──
type Awaited2<T> = T extends Promise<infer U> ? U : T;
type H = Awaited2<Promise<number>>;  // number
type I = Awaited2<string>;           // string (not a promise → returns itself)

// ── Extract array element type ──
type ElementOf<T> = T extends (infer E)[] ? E : never;
type J = ElementOf<string[]>;  // string
type K = ElementOf<number[]>;  // number

// ── Extract function parameters ──
type FirstParam<T> = T extends (first: infer P, ...rest: any[]) => any ? P : never;
type L = FirstParam<(name: string, age: number) => void>;  // string

// ── Distributive conditional types (union distributes) ──
type ToArray<T> = T extends any ? T[] : never;
type M = ToArray<string | number>;  // string[] | number[] (distributed over the union)
// NOT (string | number)[] — each union member is processed separately.
```
::

## Mapped Types and Utility Types

::code-wrapper{language="typescript"}
```typescript
// ── Mapped types: transform properties (type-level loops) ──
type Readonly<T> = {
    readonly [K in keyof T]: T[K];  // iterate over keys, make each readonly
};
type Optional<T> = {
    [K in keyof T]?: T[K];  // make each property optional
};
type Nullable<T> = {
    [K in keyof T]: T[K] | null;  // make each property nullable
};

interface User { id: number; name: string; email: string; }
type ReadonlyUser = Readonly<User>;     // { readonly id: number; readonly name: string; ... }
type OptionalUser = Optional<User>;     // { id?: number; name?: string; ... }
type NullableUser = Nullable<User>;     // { id: number | null; name: string | null; ... }

// ── Key remapping (TypeScript 4.1+) ──
type Getters<T> = {
    [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
    // remap key: `getName`, `getEmail`, etc. (template literal + Capitalize)
};
type UserGetters = Getters<User>;
// { getId: () => number; getName: () => string; getEmail: () => string }

// ── Built-in utility types ──
type PartialUser = Partial<User>;         // all properties optional
type RequiredUser = Required<User>;       // all properties required (remove ?)
type ReadonlyUser2 = Readonly<User>;      // all properties readonly
type PickUser = Pick<User, "id" | "name">; // { id: number; name: string } (select keys)
type OmitUser = Omit<User, "email">;      // { id: number; name: string } (remove keys)
type RecordType = Record<string, number>; // { [key: string]: number } (key → value map)
type ReturnTypeT = ReturnType<() => string>; // string (function return type)
type ParametersT = Parameters<(x: number, y: string) => void>; // [number, string]
type AwaitedT = Awaited<Promise<string[]>>;  // string[] (unwrap Promise)
type ExcludeT = Exclude<"a" | "b" | "c", "a">;  // "b" | "c" (remove from union)
type ExtractT = Extract<"a" | "b" | "c", "a" | "b">;  // "a" | "b" (keep from union)
type NonNullableT = NonNullable<string | null | undefined>;  // string (remove null/undefined)
```
::

## Type Narrowing and Guards

::code-wrapper{language="typescript"}
```typescript
// ── Type narrowing: refine the type within a conditional branch ──
function process(value: string | number) {
    if (typeof value === "string") {
        value.toUpperCase();  // narrowed to string
    } else {
        value.toFixed(2);  // narrowed to number
    }
}

// ── instanceof narrowing (class types) ──
function handleError(error: Error | string) {
    if (error instanceof Error) {
        error.message;  // narrowed to Error
    } else {
        error.trim();  // narrowed to string
    }
}

// ── in narrowing (property check) ──
interface Cat { meow(): void; }
interface Dog { bark(): void; }
function speak(animal: Cat | Dog) {
    if ("meow" in animal) {
        animal.meow();  // narrowed to Cat
    } else {
        animal.bark();  // narrowed to Dog
    }
}

// ── Custom type guards (user-defined type predicates) ──
function isString(value: unknown): value is string {  // `value is string` is the predicate
    return typeof value === "string";
}
function processUnknown(value: unknown) {
    if (isString(value)) {
        value.toUpperCase();  // narrowed to string (type guard worked)
    }
}

// ── Discriminated unions (narrowing on a common property) ──
type Result =
    | { status: "success"; data: string }
    | { status: "error"; message: string };

function handle(result: Result) {
    if (result.status === "success") {
        result.data;  // narrowed to the success variant
    } else {
        result.message;  // narrowed to the error variant
    }
}
```
::

## Declaration Files (`.d.ts`)

::code-wrapper{language="typescript"}
```typescript
// ── Declaration files: type definitions for JavaScript libraries ──
// .d.ts files contain only types (no runtime code) — describe the shape of a JS module.

// ── global.d.ts: declare global types ──
declare global {
    interface Window {
        myCustomAPI: {
            init: () => void;
            track: (event: string) => void;
        };
    }
}
// Now `window.myCustomAPI` is typed throughout the project.

// ── module.d.ts: declare types for an untyped JS module ──
// untyped-lib.d.ts:
declare module "untyped-lib" {
    export function greet(name: string): string;
    export const version: string;
    export type Config = { timeout: number; retries: number };
}

// ── Ambient declarations (declare without implementation) ──
declare const API_URL: string;  // provided by webpack DefinePlugin or Vite define
// tsconfig.json: "compilerOptions": { "typeRoots": ["./node_modules/@types", "./src/types"] }

// ── DefinitelyTyped (@types/*) ──
// npm install --save-dev @types/express  → provides express.d.ts
// If a library ships its own types (package.json "types" field), no @types needed.
```
::

## `tsconfig.json` Configuration

::code-wrapper{language="json"}
```json
{
  "compilerOptions": {
    "target": "ES2022",           // output JS version
    "module": "ESNext",           // module system (ESM)
    "moduleResolution": "bundler",// how modules are resolved (bundler for Vite/webpack)
    "lib": ["ES2022", "DOM"],     // available type definitions
    "strict": true,               // enable all strict checks (recommended)
    "noUncheckedIndexedAccess": true, // arr[0] is T | undefined (not just T)
    "noImplicitReturns": true,    // error if not all code paths return
    "noFallthroughCasesInSwitch": true, // error on switch fall-through
    "exactOptionalPropertyTypes": true, // optional props can't be explicitly undefined
    "esModuleInterop": true,      // allow default import from CJS modules
    "skipLibCheck": true,         // skip type checking of .d.ts files (faster)
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,    // allow importing .json files
    "isolatedModules": true,      // each file is compiled independently (Vite requirement)
    "verbatimModuleSyntax": true, // enforce type-only imports (import type)
    "outDir": "./dist",           // output directory
    "rootDir": "./src",           // source root
    "baseUrl": ".",               // base for path mapping
    "paths": { "@/*": ["./src/*"] } // path alias: import from "@/..."
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```
::

## 💡 Tips & Tricks

::code-wrapper{language="typescript"}
```typescript
// ── `as const`: make everything readonly and literal ──
const config = { env: "production", port: 3000 } as const;
// type: { readonly env: "production"; readonly port: 3000 } (literal types, not string/number)

// ── `satisfies`: check a type without widening ──
const routes = {
    home: "/",
    about: "/about",
} satisfies Record<string, string>;
// `satisfies` checks the type but keeps the literal types (home: "/", not string)

// ── `import type`: type-only imports (erased at runtime) ──
import type { User } from "./types.js";  // no runtime import (just types)
import { getUser } from "./api.js";       // runtime import (value)

// ── `unknown` is safer than `any` (forces narrowing) ──
function process(value: unknown) {
    // value.foo();  // ❌ error — unknown has no properties
    if (typeof value === "string") {
        value.toUpperCase();  // ✅ narrowed to string
    }
}
// `any` disables all checks — `unknown` forces you to narrow before use.

// ── Exhaustive checking (never type) ──
type Status = "pending" | "active" | "inactive";
function handle(status: Status) {
    switch (status) {
        case "pending": return 1;
        case "active": return 2;
        case "inactive": return 3;
        default:
            const _exhaustive: never = status;  // error if a case is missing
            throw new Error(`unhandled: ${_exhaustive}`);
    }
}
// If you add "archived" to Status, the default branch fails (status is not never).
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="typescript"}
```typescript
// ── TypeScript types are erased at runtime (no runtime type checking) ──
function isUser(value: any): value is User {
    return typeof value?.id === "number" && typeof value?.name === "string";
    // Can't use `value instanceof User` (interface has no runtime presence).
    // Must manually check properties (structural validation).
}

// ── `any` disables type checking (escape hatch — avoid) ──
// Use `unknown` instead (forces narrowing before use).

// ── `null` and `undefined` are different types ──
// strict: true enables strictNullChecks — null and undefined are not assignable to other types.
// string | undefined ≠ string | null ≠ string | null | undefined

// ── Excess property checking only applies to object literals ──
interface User { id: number; name: string; }
const user: User = { id: 1, name: "Alice", extra: "x" };  // ❌ excess property
const obj = { id: 1, name: "Alice", extra: "x" };
const user2: User = obj;  // ✅ no excess check (obj is not a literal — structural match)

// ── Type assertions don't change runtime behavior ──
const value: any = "hello";
const num: number = value as number;  // compiles, but runtime: num is still "hello" (string)
// `as` only affects the compiler — no runtime conversion. Use Number(value) for conversion.

// ── `interface` merging can cause surprises ──
// If you declare the same interface twice, they merge (additive).
// This can accidentally augment global types (like Window) — be careful.
```
::

## 🧠 Quick Quiz

Why does this fail, and how do you fix it?

::code-wrapper{language="typescript"}
```typescript
type EventName<T> = T extends `on${infer E}` ? E : never;
type Handler<T> = (event: T) => void;

function on<T extends string>(event: T, handler: Handler<EventName<T>>): void {
    // ...
}

on("onClick", (event) => { /* what is the type of `event`? */ });
```
::

<details>
<summary>Answer</summary>

The type of `event` is `"Click"` — the literal string `"Click"`, not a generic event object.

Here's why:

1. `T` is inferred as `"onClick"` (the literal string, because `T extends string` and the argument is a string literal).
2. `EventName<"onClick">` evaluates: `"onClick" extends \`on${infer E}\` ? E : never`.
3. The template literal pattern `\`on${infer E}\`` matches `"onClick"`, so `E` is inferred as `"Click"`.
4. `Handler<EventName<"onClick">>` = `Handler<"Click">` = `(event: "Click") => void`.

So the handler receives the literal string `"Click"` — probably not what you want.

**Fix**: If you want the handler to receive an actual event object (not a string), define a proper event type:

```typescript
interface ClickEvent { target: HTMLElement; type: "click"; }
type EventMap = { onClick: ClickEvent; onHover: { type: "hover" } };

function on<K extends keyof EventMap>(event: K, handler: (e: EventMap[K]) => void): void {
    // ...
}

on("onClick", (event) => { event.target; });  // event: ClickEvent (properly typed)
```

**The lesson**: template literal types and `infer` extract string fragments at the type level — they produce string literal types, not runtime values. If you need proper event types, use a mapped type (`EventMap`) that maps event names to their payload types.

</details>