---
title: Learn Scala — From Scratch to Advanced
description: A comprehensive Scala curriculum covering fundamentals, object-oriented and functional programming, type system, collections, concurrency, and testing. Master Scala from beginner to advanced developer. Includes edge cases, best practices, and practical patterns.
---

# 📖 Learn Scala — From Scratch to Advanced

A comprehensive, edge-case-covering Scala curriculum. Each document is self-contained and covers its concept deeply enough that a careful reader can go from beginner to advanced Scala developer.

Scala is a statically-typed, compiled language that runs on the JVM and combines object-oriented and functional programming paradigms. It's used in data engineering (Apache Spark, Kafka), backend services (Twitter, LinkedIn), distributed systems (Akka), and anywhere Java runs but you want better expressiveness.

## How to Use This Course

1. **Read sequentially** for a structured path (01 → 11).
2. **Jump to a chapter** as a reference when you hit a concept in the wild.
3. **Run the examples** using `scala-cli` for quick experimentation or `sbt` for projects.
4. **Use the REPL**: Type `scala` to start an interactive prompt.
5. **Compare to Java**: If you know Java, note how Scala simplifies or extends it.

## Prerequisites

- **Java 11+** installed (`java -version` to verify).
- Scala installed (`brew install scala` on macOS, or download from scala-lang.org).
- A text editor (VS Code, IntelliJ IDEA, Vim).
- Basic programming experience (familiarity with Java, Python, or similar).

## Curriculum

### Part I — Foundations

| # | Topic | Why It Matters |
|---|---|---|
| 01 | [Getting Started](/scala/01-getting-started) | Installation, REPL, scala-cli, sbt setup, from-Java perspective. |
| 02 | [Variables & Data Types](/scala/02-variables-and-data-types) | `val`/`var`/`lazy val`, type inference, primitives, tuples, type hierarchy. |
| 03 | [Functions](/scala/03-functions) | Declarations, lambdas, higher-order functions, closures, currying. |
| 04 | [Control Flow](/scala/04-control-flow) | If/else (expressions!), pattern matching, loops, try/catch, Option/Either. |

### Part II — Collections & OOP

| # | Topic | Why It Matters |
|---|---|---|
| 05 | [Collections](/scala/05-collections) | List, Set, Map, Vector, operations (map/filter/fold), mutability trade-offs. |
| 06 | [Classes & Objects](/scala/06-classes-and-objects) | Class definitions, inheritance, traits, singleton objects, case classes. |
| 07 | [Case Classes & Pattern Matching](/scala/07-case-classes-and-pattern-matching) | Sealed hierarchies, exhaustiveness checking, destructuring, extractors. |

### Part III — Type System & Advanced Features

| # | Topic | Why It Matters |
|---|---|---|
| 08 | [Type System](/scala/08-type-system) | Generics, bounds, variance, type aliases, implicit parameters, phantom types. |
| 09 | [Concurrent Programming](/scala/09-concurrent-programming) | Futures, async operations, Promise, Try, thread safety, ExecutionContext. |

### Part IV — Production

| # | Topic | Why It Matters |
|---|---|---|
| 10 | [Testing](/scala/10-testing) | ScalaTest, matchers, fixtures, property-based testing, mocking. |
| 11 | [Java Interoperability](/scala/11-java-interoperability) | Using Java from Scala, collection conversion, calling Scala from Java. |

## Learning Path Suggestions

### If you're new to programming

1. Read 01–04 in order (covers fundamentals with Scala perspective).
2. Read 05 (Collections) — you'll use these constantly.
3. Read 06–07 (OOP and pattern matching — core Scala skills).
4. Do small projects before moving to advanced topics.

### If you're coming from Java

1. Skim 01–03 (Java basics translate easily; note `val` vs `var` and lambdas).
2. Read 06 carefully (classes are simpler, traits are powerful).
3. Read 07 (case classes and pattern matching are major improvements over Java).
4. Read 08 for Scala's type system features (generics, implicits).
5. Skip 11 (you know Java interop already).

### If you're coming from Python/Ruby

1. Read 02 (type system, type inference).
2. Read 03–04 (functions and control flow are different; expressions vs statements).
3. Read 05 (collections have different methods; more functional).
4. Read 06–07 (OOP and pattern matching replace Python's duck typing).
5. Read 09 (async model different from Python; Scala is more JVM-centric).

### If you're coming from Haskell/functional languages

1. Skim 01–06 (you'll find most concepts familiar).
2. Read 08 (generics and variance — different from Haskell's approach).
3. Read 07 (pattern matching is similar but with different syntax).
4. Read 11 (Java interop is unique to Scala).

### If you're a senior engineer

1. Skim 01–05 (fundamentals review).
2. Read 06–07 closely (OOP + pattern matching is Scala's sweet spot).
3. Read 08 (type system — implicit parameters are powerful and subtle).
4. Read 09 (concurrency and Futures).
5. Use 10–11 as references for teams/projects.

## Key Differences from Java

| Concept | Scala | Java |
|---|---|---|
| Variables | `val` (immutable, default) | `final` type (verbose) |
| Type inference | Automatic in many cases | Rarely inferred |
| Null | Avoided with `Option[T]` | Everywhere (nullable) |
| Functions | First-class, lambdas | Objects, verbose anonymous classes |
| Pattern matching | Built-in, exhaustive | No language support |
| Traits | Multiple inheritance via mixins | Interfaces only |
| Collections | Functional methods built-in | Streams API (verbose) |
| Concurrency | `Future`/async-await style | Threads, callbacks, CompletableFuture |

## Key Differences from Python

| Concept | Scala | Python |
|---|---|---|
| Type system | Static, checked at compile-time | Dynamic, checked at runtime |
| Type inference | Yes, powerful | No |
| Performance | Compiled to JVM bytecode | Interpreted, slow |
| Immutability | Default (`val`) | Not default (mutable everything) |
| Null | `Option[T]` (not `None`) | `None` (not optional) |
| Async | Futures, non-blocking | async/await (simpler) |
| Syntax | More verbose | Minimal |

## Companion Resources

- [Scala 3 Docs](https://docs.scala-lang.org) — official documentation (modern, comprehensive).
- [Scala 2 Book](https://docs.scala-lang.org/scala3/book/introduction.html) — foundational concepts.
- [Scala API](https://www.scala-lang.org/api/) — standard library documentation.
- [Akka Documentation](https://akka.io) — actor model for distributed systems.
- [Scala Collections](https://docs.scala-lang.org/overviews/collections-2.13/overview.html) — deep dive on collections.
- [Scala School](https://twitter.github.io/scala_school/) — Twitter's introduction (older but good).
- [Functional Programming in Scala](https://www.manning.com/books/functional-programming-in-scala) — the book (exercises online).
- [Stack Overflow](https://stackoverflow.com/questions/tagged/scala) — Scala tag (active community).

## Tooling to Install

::code-wrapper{language="bash"}
```bash
# Java (required)
java -version  # verify you have Java 11+

# Scala via Homebrew (macOS)
brew install scala

# Or via SDKMAN (all platforms)
curl -s "https://get.sdkman.io" | bash
sdk install scala

# Scala CLI (quick experimentation)
sdk install scala-cli
# Or: brew install scala-cli

# SBT (project build tool)
sdk install sbt
# Or: brew install sbt

# IDE (recommended)
# - IntelliJ IDEA (best for Scala, free Community Edition)
# - VS Code with Metals extension (lightweight)

# Linting and formatting
sbt scalafixAll
```
::

## Testing in Scala

Scala has excellent testing frameworks. Here's a quick start:

::code-wrapper{language="bash"}
```bash
# Add to build.sbt
libraryDependencies += "org.scalatest" %% "scalatest" % "3.2.17" % Test

# Run tests
sbt test
sbt "testOnly com.example.CalculatorTest"
```
::

## Common Use Cases

1. **Data engineering** (Spark, Kafka) → Focus on collections, functional programming.
2. **Backend APIs** (Play Framework, http4s) → Learn all chapters, emphasize concurrency.
3. **Distributed systems** (Akka) → Learn all chapters, especially 09 (concurrency).
4. **CLI tools** → Learn all chapters, use scala-cli for quick scripts.
5. **Interop with Java** → Read 11 (Java interoperability).

## Next Steps After This Course

- **Apache Spark**: Build data pipelines and machine learning models.
- **Play Framework or http4s**: Build web applications.
- **Akka**: Learn actor model for distributed systems.
- **ZIO or Cats**: Advanced functional programming libraries.
- **Scala CLI**: Write standalone scripts without sbt.
- **Contribute to open source**: Scala has vibrant projects (Typelevel, Lightbend).

## Scala 2 vs Scala 3

This course is written for **Scala 3** (released 2021). Key improvements over Scala 2:
- Better type inference
- Simplified syntax (optional braces, simplified imports)
- Union and intersection types
- Extension methods without implicits

If you're working on a Scala 2 project, most concepts still apply; syntax differs slightly. Check [migration guide](https://docs.scala-lang.org/scala3/guides/migration/compatibility-intro.html).

## License

These notes are yours to use, share, and modify.

📖
