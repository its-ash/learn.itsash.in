# Content Authoring Instructions

## Code Blocks

When creating or editing Markdown content files, always wrap fenced code blocks with the `::code-wrapper` MDC component:

```md
::code-wrapper{language="bash"}
```bash
rustc src/main.rs && ./main      # produces ./main (or main.exe)
```
::
```

### Rules

- Every `` ``` `` fenced code block MUST be wrapped with `::code-wrapper{language="<lang>"} ... ::`
- The `language` prop MUST match the fenced code block's language
- Optionally add a `filename` prop: `::code-wrapper{language="rust" filename="main.rs"}`
- Supported languages: `rust`, `python`, `javascript`, `typescript`, `bash`, `json`, `yaml`, `markdown`, `sql`, `toml`, `ini`, `xml`, `css`, `shell`, `dockerfile`
- Never use bare fenced code blocks without the `::code-wrapper` wrapper

## Index Files

When creating or editing content in a topic directory (e.g., `content/js/`, `content/rust/`):

- Always include an `index.md` file at the root of each topic directory (e.g., `content/js/index.md`, `content/rust/index.md`)
- The `index.md` acts as the landing page and table of contents for the topic, listing all documents in the directory with links and a brief description of each
- When a new document is added to a directory, update the corresponding `index.md` to include it in the listing
- The `index.md` should group entries logically (e.g., by difficulty or topic) and include a short intro describing the overall track

## Zero-to-Hero Curriculum

When generating a "zero to hero" documentation track for a language (e.g., `content/js/`, `content/rust/`), create a comprehensive curriculum covering **all features the language offers**, from absolute basics to advanced/expert topics:

- **Structure**: Numbered files (`01-`, `02-`, ...) ordered by progression — foundations → intermediate → advanced → expert → projects/exercises
- **Comprehensive coverage**: Include every major language feature (syntax, types, control flow, functions, collections, OOP/structs, error handling, concurrency/async, modules, macros/meta-programming, testing, tooling, FFI, unsafe, etc.)
- **Self-contained docs**: Each document should fully explain its concept so a careful reader can progress from beginner to advanced without external material
- **Real-world focus**: Use production-grade examples, not toy snippets
- **Progressive difficulty**: Start with the basic case, build to edge cases, then best practices
- **Include an `index.md`**: Landing page with a grouped table (Parts/Phases), "How to Use This Course" section, prerequisites, and a curriculum table with `# | Topic | Why It Matters` columns linking each chapter
- **Final chapters**: Include testing, performance/optimization, tooling/build systems, security, and a capstone exercises/projects chapter

## Content Quality

When creating programming documentation or technical guides:

- Always include **edge cases** — show what happens at boundaries, with empty inputs, with maximum values, error states, and unusual but valid inputs
- Always include **best practices** — demonstrate idiomatic patterns, recommended approaches, and common pitfalls to avoid
- Use real-world examples, not toy snippets — show how the concept is used in production code
- When showing an error case, also show the correct way to handle it
- Group related examples logically — start with the basic case, then edge cases, then best practices

## Tips, Tricks & Tricky Examples

When creating or editing Markdown content files, always include the following sections (when applicable to the topic):

- Always include a **💡 Tips & Tricks** section near the end of each document — share lesser-known shortcuts, idioms, performance hacks, debugger tricks, or workflow improvements that experienced developers use but beginners rarely encounter
- Always include an **⚠️ Edge Cases & Gotchas** section near the end of each document — highlight surprising behavior, platform-specific quirks, silent failures, off-by-one traps, type coercion surprises, integer overflow, zero-copy pitfalls, or anything that can bite in production
- Always use **tricky examples** — prefer non-obvious, counterintuitive, or "gotcha" examples over straightforward ones. Each concept should include at least one example that a learner would likely get wrong on first attempt
- Examples should demonstrate *why* the tricky case behaves the way it does, not just *that* it does — include the underlying mechanism (evaluation order, borrow rules, floating-point representation, type coercion table, etc.)
- When a language has a famous "wat" moment or common interview gotcha related to the topic, include it (e.g., JavaScript `[] + {}`, Rust `String` vs `&str` moves, Python mutable default args, floating-point `0.1 + 0.2`)
- Show the *wrong* way first (what a beginner would write), then the *right* way, and explain the difference — this contrast makes the gotcha memorable
- Include a **🧠 Quick Quiz** or **🔍 Spot the Bug** challenge at the end where appropriate — present a small code snippet and ask the reader to predict the output or find the bug before revealing the answer in a collapsed/details block
- Tag each tip or gotcha with a short bold label (e.g., **Performance**, **Safety**, **Idiom**, **Debug**, **Portability**) so readers can scan for what matters to them