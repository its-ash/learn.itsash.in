---
title: Scala — Toolchain, Project Layout & JVM Execution Model
description: Production Scala 3 toolchain setup — scala-cli, sbt, Coursier, mill, compiler phases, JVM bytecode mapping, and project scaffolding patterns used in real codebases.
---

# 01 — Toolchain, Project Layout & JVM Execution Model

## Compiler Pipeline: `.scala` → JVM Bytecode

```scala
// scalac pipeline (what actually happens):
//   .scala → [parser] → AST → [typer] → typed AST → [uncurry] → [lazyVals]
//          → [cleanup] → [jvm] → .class bytecode
//
// Each phase is observable:
//   scalac -Xshow-class Simple.scala       // show class output
//   scalac -Xprint:typer Simple.scala      // dump typed AST after typer phase
//   scalac -Xprint:delambdafy Simple.scala // see how lambdas become classes
```

::code-wrapper{language="bash"}
```bash
# Inspect what scalac emits — object becomes a final class with MODULE$ singleton
scalac -Xprint:jvm Hello.scala 2>&1 | head -40

# Decompilation with javap reveals the JVM-level representation:
#   object Config  →  public final class Config$  with static MODULE$ field
#   def greet      →  public String greet(String)
#   val timeout    →  private final int timeout; public int timeout()
```
::

## scala-cli — Single-File & Scripting

::code-wrapper{language="scala"}
```scala
//> using scala 3.3.3
//> using dep com.typesafe::config:1.4.3

import com.typesafe.config.ConfigFactory

@main def run(path: String = "application.conf"): Unit =
  val cfg = ConfigFactory.load(path)
  println(cfg.getString("app.name"))
  // scala-cli uses 'using' directives at file top — pinned Scala version,
  // deps, and JVM version are resolved via Coursier under the hood.
  // No build.sbt needed; ideal for CLIs, scripts, prototyping.
```
::

::code-wrapper{language="bash"}
```bash
scala-cli run .                        # run all .scala in directory
scala-cli run . -- --watch             # recompile on change
scala-cli package . --executable -o app # fat JAR / native-image GraalVM
scala-cli repl                         # REPL with project deps on classpath
```
::

## sbt — Multi-Module Build

::code-wrapper{language="scala"}
```scala
// build.sbt — production layout with cross-building and strict settings
ThisBuild / scalaVersion := "3.3.3"
ThisBuild / organization := "com.acme"
ThisBuild / version      := sys.env.getOrElse("APP_VERSION", "0.1.0-SNAPSHOT")

// Compile-time fatal warnings, unused-symbol detection
ThisBuild / scalacOptions ++= Seq(
  "-deprecation", "-feature", "-unchecked",
  "-Wunused:all", "-Werror",        // fail build on warnings
  "-explain",                        // human-readable type error explanations
  "-new-syntax", "-indent"           // Scala 3 braces-optional syntax
)

// Parallel cross-build across Scala 2.13 + 3.x for library publishing
lazy val core = crossProject(JVMPlatform, JSPlatform)
  .crossType(CrossType.Pure)
  .settings(
    libraryDependencies ++= Seq(
      "org.typelevel" %% "cats-core" % "2.10.0",
      "org.scalameta" %% "munit"     % "1.0.0" % Test
    )
  )

lazy val app = project
  .dependsOn(core.jvm)
  .enablePlugins(JavaAppPackaging)   // sbt-native-packager → Debian/RPM/Docker
```
::

::code-wrapper{language="bash"}
```bash
sbt compile              # incremental compile — only recompiles changed closure
sbt ~compile             # watch mode — recompile on save
sbt "coreJS/fastLinkJS"  # Scala.js fast-opt for dev
sbt release              # cross-publish with signed artifacts (sbt-release)
sbt dependencyTree       # visualize transitive dependency graph
```
::

## Bytecode Reality: Scala Constructs on the JVM

::code-wrapper{language="scala"}
```scala
// What Scala emits at the bytecode level — critical for interop & perf:

object Config:                          // → final class Config$ with static MODULE$
  val timeout: Int = 5000               // → private static int + static getter
  def url: String = "https://api.x"     // → public static String url()

case class Point(x: Int, y: Int)        // → public final class Point
  // Auto-generated: apply, unapply, copy, equals, hashCode, toString, productElementNames
  // equals() uses field-by-field comparison — no reference identity
  // hashCode() uses MurmurHash3.productHash — consistent with equals

enum Color(val hex: Int):               // → sealed abstract class Color with nested finals
  case Red extends Color(0xFF0000)      // → public static final Color Red
  case Blue extends Color(0x0000FF)

extension (s: String)                   // → static method with String as first param
  def slug: String = s.toLowerCase.replaceAll("[^a-z0-9]+", "-")
  // From Java: StringOps$.MODULE$.slug$extension("Hello World")
```
::

::code-wrapper{language="bash"}
```bash
# Verify what Java sees when calling Scala — critical for cross-language teams
javap -p -c target/scala-3.3.3/classes/com/acme/Point.class | head -60

# javap output shows:
#   public int x();                    — getter (Scala 3: no () on val access)
#   public Point copy(int, int);       — generated copy
#   public boolean equals(java.lang.Object); — value-based equals
#   public int hashCode();             — MurmurHash3
```
::

## Project Layout — Production Structure

::code-wrapper{language="bash"}
```bash
# Standard multi-module sbt project
my-service/
├── build.sbt
├── project/
│   ├── build.properties               # sbt version pin: sbt.version=1.9.8
│   └── plugins.sbt                    # sbt-native-packager, sbt-jmh, etc.
├── modules/
│   ├── core/
│   │   └── src/{main,test}/scala/com/acme/core/
│   ├── domain/
│   │   └── src/main/scala/com/acme/domain/   # pure ADTs, no I/O deps
│   └── infra/
│       └── src/main/scala/com/acme/infra/    # DB, HTTP clients, side-effects
├── app/
│   └── src/main/scala/com/acme/Main.scala    # thin composition root
└── .jvmopts                                    # -Xmx2g -XX:+UseZGC
```
::

## 🔍 Spot the Bug — Incremental Compilation Staleness

::code-wrapper{language="scala"}
```scala
// Symptom: sbt says "compiling 0 files" but you changed a trait method
// signature that downstream modules use. Tests fail with NoSuchMethodError.

// Root cause: sbt's incremental compiler tracks API signatures, but
// renaming a method while keeping the same erased signature (e.g.
// def process(items: List[Int]) → def process(items: Seq[Int]))
// can miss the downstream recompile because the erased signature is
// identical (List → Seq both erase to scala.collection.immutable.Seq).

// Fix: force clean for erased-signature changes
//   sbt clean compile
// Or use Zinc's stronger analysis:
//   incOptions ~= (_.withRecompileAllFraction(1.0))
```
::

<details>
<summary>Answer</summary>

The `NoSuchMethodError` at runtime happens because Zinc (sbt's incremental compiler) uses **name + erased signature** for staleness detection. When two different source-level signatures erase to the same bytecode signature, Zinc doesn't detect the change in downstream modules.

**Fix**: Run `sbt clean compile` for signature-level refactors, or configure `incOptions` with stricter recompile triggers in `build.sbt`.

</details>

## 💡 Tips & Tricks

**`-Xprint:typer` for debugging type inference failures**: The compiler dumps the fully-typed AST — you see exactly what types it inferred at each step, exposing where inference diverges from your expectation.

::code-wrapper{language="bash"}
```bash
# Show typed AST to debug "found vs required" errors
scala-cli compile . --scalac-option "-Xprint:typer" 2>&1 | grep -A5 "myMethod"
```
::

**Coursier for reproducible toolchain**: Use `cs` (Coursier) to bootstrap Scala, sbt, and scalafmt — avoids Homebrew version drift across CI machines.

::code-wrapper{language="bash"}
```bash
# Pin everything via Coursier — CI uses identical versions
cs install scala3 sbt scalafmt
cs launch scalafmt:3.8.3 -- --test src/   # format check in CI
```
::

**`-explain` in Scala 3 gives human-readable type errors**: Far more actionable than the terse Scala 2 messages.

## ⚠️ Edge Cases & Gotchas

**Scala 2 and Scala 3 cannot share the same binary artifact**: Scala 2.13 and 3.x have different TASTy/classfile formats. For cross-published libraries, use `%%` (cross-built) not `%%` with a hardcoded version.

**`object` initialization is lazy**: The `MODULE$` singleton initializes on first access, not at class-load time. Side effects in `object` bodies run at an unpredictable time — use `@main` or explicit initialization.

**`-Werror` + Scala 2 macro libraries**: Macro expansions can produce warnings that become errors. Use `-Wconf:cat=unused:silent` to suppress warnings from generated code.

**JVM target mismatch**: If `scalaVersion` targets JVM 17 but your `JAVA_HOME` is JDK 11, `sbt` fails with `UnsupportedClassVersionError`. Pin `javaOptions` and `fork := true` to control the JVM version sbt uses for running.

## 🧠 Quick Quiz

What does `scalac -Xprint:delambdafy` show, and why does it matter for performance?

<details>
<summary>Answer</summary>

`-Xprint:delambdafy` shows how the compiler desugars lambdas (`x => x * 2`) into JVM constructs:
- **Non-capturing lambdas** → a singleton `$$Lambda$` object (zero allocation per call).
- **Capturing lambdas** → a new `$$Lambda$` instance per invocation, capturing free variables as fields.

This matters for hot paths: a lambda capturing `this` allocates on every call. In performance-critical code, hoist the lambda to a `val` or use a non-capturing method reference.
</details>