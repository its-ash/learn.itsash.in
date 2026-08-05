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

## Content Quality

When creating programming documentation or technical guides:

- Always include **edge cases** — show what happens at boundaries, with empty inputs, with maximum values, error states, and unusual but valid inputs
- Always include **best practices** — demonstrate idiomatic patterns, recommended approaches, and common pitfalls to avoid
- Use real-world examples, not toy snippets — show how the concept is used in production code
- When showing an error case, also show the correct way to handle it
- Group related examples logically — start with the basic case, then edge cases, then best practices