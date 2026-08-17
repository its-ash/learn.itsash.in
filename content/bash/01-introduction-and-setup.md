# 01 — Introduction & Setup

Bash (Bourne Again Shell) is the standard shell on most Linux and macOS systems. It's both a command interpreter (interactive) and a scripting language (automating tasks).

## Why Bash?

- **Everywhere** — pre-installed on Linux, macOS, and WSL on Windows.
- **Automation** — glue commands, scripts, cron jobs, CI/CD.
- **Pipelines** — combine small tools (`grep`, `sed`, `awk`, `sort`, `uniq`) into powerful pipelines.
- **System administration** — manage files, processes, services.

## The Terminal vs Scripts

- **Interactive** — type commands in the terminal, get immediate output.
- **Script** — a file (`.sh`) with a sequence of commands, run with `bash script.sh` or `./script.sh`.

## Your First Script

Create `hello.sh`:

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
echo "Hello, Bash!"
```
::

### Run it

::code-wrapper{language="bash"}
```bash
chmod +x hello.sh   # make executable
./hello.sh          # run
```
::
Or without making it executable:

::code-wrapper{language="bash"}
```bash
bash hello.sh
```
::
## The Shebang (`#!`)

The first line `#!/usr/bin/env bash` is the **shebang** — it tells the system which interpreter to use. `#!/usr/bin/env bash` is preferred over `#!/bin/bash` (finds `bash` via the `PATH`, more portable).

Common shebangs:
- `#!/usr/bin/env bash` — Bash script.
- `#!/usr/bin/env sh` — POSIX shell (more portable, fewer features).
- `#!/usr/bin/env python3` — Python script.
- `#!/usr/bin/env node` — Node.js script.

## `echo` and `printf`

::code-wrapper{language="bash"}
```bash
echo "Hello"           # Hello (with newline)
echo -n "No newline"   # no trailing newline
printf "%s is %d\n" "Alice" 30   # formatted (like C printf)
```
::
`printf` is more portable and supports formatting. `echo` behavior varies between shells (especially with `-e`/`-n`); `printf` is consistent.

## Which Bash?

Check your Bash version:

::code-wrapper{language="bash"}
```bash
bash --version
```
::
Bash 4.0+ (2009) added associative arrays, `coproc`, etc. Bash 5.0+ (2019) added `--` handling, `${var@operator}`. macOS ships Bash 3.2 (due to licensing — GPLv3). On macOS, install Bash 5 via Homebrew: `brew install bash`.

## A Slightly Bigger Script

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
set -euo pipefail

name="${1:-World}"
echo "Hello, $name!"
echo "Today is $(date +%A)"
```
::
- `set -euo pipefail` — enable strict mode (chapter 18).
- `"${1:-World}"` — the first argument, defaulting to `World` if not provided.
- `$(date +%A)` — command substitution (runs `date`, inserts output).

Run it:

::code-wrapper{language="bash"}
```bash
./hello.sh Alice
# Hello, Alice!
# Today is Monday
```
::
## Comments

::code-wrapper{language="bash"}
```bash
# This is a comment
echo "hi"   # inline comment
```
::
`#` starts a comment (to the end of the line). There are no block comments in Bash.

## Getting Help

- `man bash` — the Bash manual (long but comprehensive).
- `man <command>` — a command's manual (`man grep`, `man sed`).
- `tldr <command>` — concise examples (`tldr grep`), install via `npm install -g tldr`.
- `command --help` — brief help for most commands.

## ShellCheck

[ShellCheck](https://www.shellcheck.net) is a linter for Bash — catches common bugs and suggests improvements. Install it:

::code-wrapper{language="bash"}
```bash
brew install shellcheck           # macOS
apt install shellcheck            # Debian/Ubuntu
```
::
Run it:

::code-wrapper{language="bash"}
```bash
shellcheck hello.sh
```
::
Use it on every script — it catches quoting issues, `set -e` gaps, unquoted variables, and many footguns. VS Code has a ShellCheck extension.

## VS Code

Install the **Shell Script** extension (built-in) and **shellcheck** (timonwong.shellcheck). They provide:
- Syntax highlighting.
- Linting (ShellCheck).
- Snippets.
- "ShellCheck: Fix all" for auto-fixes.

## Project Structure

Bash scripts are usually standalone files, but for a larger project:

::code-wrapper{language="text"}
```text
my_project/
├── bin/
│   └── my_script.sh        # main entry point
├── lib/
│   └── utils.sh            # sourced library
├── test/
│   └── test_utils.sh       # tests (using bats, etc.)
├── README.md
```
::
## 💡 Tips & Tricks

- **Idiom**: always start scripts with `#!/usr/bin/env bash` (shebang) and `set -euo pipefail` (strict mode) — the shebang makes it executable directly (`./script.sh`), strict mode catches errors early (exit on error, error on undefined var, fail on pipe failure). See chapter 18.
- **Idiom**: use ShellCheck on every script — it catches quoting issues, unquoted variables, `set -e` gaps, and many common Bash footguns. Install the VS Code extension for real-time linting.
- **Idiom**: use `#!/usr/bin/env bash` (not `#!/bin/bash`) — `env` finds `bash` via `PATH`, more portable across systems where Bash is in different locations. `#!/bin/bash` assumes a specific path.
- **Idiom**: use `printf` over `echo` for formatting and portability — `printf "%s is %d\n" "Alice" 30` formats reliably. `echo`'s behavior with `-e`/`-n` varies between shells; `printf` is consistent.
- **Idiom**: use `man <command>` and `tldr <command>` for reference — `man` is comprehensive, `tldr` is concise examples. Install `tldr` (`npm install -g tldr`) for quick lookups.

## ⚠️ Edge Cases & Gotchas

- **macOS ships Bash 3.2**: due to GPLv3 licensing, macOS's default `/bin/bash` is 3.2 (2007). No associative arrays, no `mapfile`, etc. Install Bash 5 via `brew install bash`, use `#!/usr/bin/env bash` to find it.
- **`echo -e` is not portable**: in POSIX `sh`, `echo -e` prints `-e` literally. Use `printf` for escape sequences. `echo -e` works in Bash but not all shells.
- **`./script.sh` vs `bash script.sh`**: `./script.sh` uses the shebang's interpreter (and needs execute permission). `bash script.sh` explicitly uses `bash` (no execute permission needed, shebang ignored).
- **Execute permission**: `./script.sh` needs `chmod +x`. `bash script.sh` doesn't. For scripts you run often, `chmod +x` once.
- **Spaces in filenames**: `"my file.txt"` (quoted) works; `my file.txt` (unquoted) is two args. Always quote variables: `"$file"`.
- **CRLF line endings break scripts**: Windows line endings (`\r\n`) cause `bash: ./script.sh: /usr/bin/env: bad interpreter: No such file or directory`. Use LF (`\n`) — `dos2unix script.sh` or configure your editor.
- **`set -e` doesn't catch everything**: commands in `if`/`&&`/`||` conditions don't trigger exit. Pipes fail only with `set -o pipefail`. See chapter 18.
- **`$0` is the script name, `$1`…`$9` are args**: `$10` needs `${10}` (or it's `$1` followed by `0`). `$@` is all args, `$#` is the count.

## 🧠 Spot the Bug

A developer writes a script, but the shebang line causes an error:

::code-wrapper{language="bash"}
```bash
#! /usr/bin/env bash
echo "Hello"
```
::

What's wrong?

<details>
<summary>Answer</summary>

Actually, `#! /usr/bin/env bash` (with a space after `#!`) works on most systems — the space is allowed. So this isn't the bug.

The common shebang bug is a **typo or wrong path**: `#!/bin/bash` on a system where Bash is in `/usr/bin/bash` (or vice versa). Or `#!/usr/bin/env bashx` (typo). Or **CRLF line endings** (Windows), which make the shebang `#!/usr/bin/env bash\r` — the `\r` becomes part of the interpreter name, and the system can't find `bash\r`.

If the error is `bash: ./script.sh: /usr/bin/env: bad interpreter: No such file or directory`, the cause is almost always CRLF line endings. Fix with:

```bash
dos2unix script.sh
# or
sed -i 's/\r$//' script.sh
```
::
Configure your editor (VS Code: bottom-right "CRLF" → "LF") to use LF for Bash scripts.

**The lesson**: shebang errors are usually (1) wrong interpreter path (use `#!/usr/bin/env bash` for portability), (2) typos, or (3) CRLF line endings (Windows). Use LF line endings and `#!/usr/bin/env bash`.

</details>

## Summary

You installed/verified Bash, wrote and ran a script (shebang, `chmod +x`), used `echo`/`printf`, comments, and command substitution (`$(...)`). You know about Bash versions (macOS 3.2), ShellCheck (the linter), and the project structure — with the CRLF and `echo -e` portability traps noted. Next: variables and data types.