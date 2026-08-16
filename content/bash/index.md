---
title: Learn Bash — From Zero to Pro
description: A comprehensive, edge-case-covering, idiomatic Bash curriculum. 15 chapters covering variables, operators, control flow, functions, text processing, file I/O, processes, arrays, strings, args, debugging, best practices, and testing. Go from beginner to pro Bash scripter.
---

# 🐚 Learn Bash — From Zero to Pro

A comprehensive, edge-case-covering, idiomatic Bash curriculum. Each document is self-contained and covers its concept deeply enough that a careful reader can go from beginner to pro Bash scripter.

## How to Use This Course

1. **Read sequentially** for a structured path (01 → 15).
2. **Jump to a chapter** as a reference when you hit a concept in the wild.
3. **Run the examples** — the terminal is your REPL.
4. **Use ShellCheck** on every script you write.

## Prerequisites

- A Unix-like system (Linux, macOS, or WSL on Windows).
- A terminal (Terminal.app, iTerm2, GNOME Terminal, etc.).
- Basic command-line familiarity (`ls`, `cd`, `cat`) helps, but isn't required.

## Curriculum

### Part I — Foundations

| # | Topic | Why It Matters |
|---|---|---|
| 01 | [Introduction & Setup](/bash/01-introduction-and-setup) | Why Bash, shebang, ShellCheck, script structure. |
| 02 | [Variables & Data Types](/bash/02-variables-and-data-types) | Assignment, quoting (critical), arrays, expansion. |
| 03 | [Operators & Expansions](/bash/03-operators-and-expansions) | Arithmetic, `[[ ]]` tests, command/brace/process expansion. |
| 04 | [Control Flow](/bash/04-control-flow) | `if`/loops/`case`, `IFS= read -r`, exit status. |
| 05 | [Functions & Scope](/bash/05-functions-and-scope) | `local`, return values, namerefs, `trap`, recursion. |

### Part II — Core Tools

| # | Topic | Why It Matters |
|---|---|---|
| 06 | [Text Processing](/bash/06-text-processing) | `grep`/`sed`/`awk`/`cut`/`sort`/`uniq`/`tr`, pipelines. |
| 07 | [File System & I/O](/bash/07-file-system-and-io) | Permissions, redirection, `find`, temp files, `mktemp`. |
| 08 | [Processes & Signals](/bash/08-processes-and-signals) | Background jobs, `kill`/`trap`, `wait`, `xargs`, `timeout`. |
| 09 | [Arrays & Data Structures](/bash/09-arrays) | Indexed/associative arrays, `mapfile`, safe iteration. |
| 10 | [String Manipulation](/bash/10-string-manipulation) | Parameter expansion, regex, `printf`, trim/replace. |

### Part III — Production

| # | Topic | Why It Matters |
|---|---|---|
| 11 | [Command-Line Arguments](/bash/11-command-line-arguments) | `getopts`, long options, subcommands, `"$@"`. |
| 12 | [Debugging & Error Handling](/bash/12-debugging-and-error-handling) | `set -euo pipefail`, `set -x`, `trap ERR`, logging. |
| 13 | [Best Practices & Idioms](/bash/13-best-practices) | Structure, naming, `main`, `readonly`/`local`, `die`. |
| 14 | [Testing Bash Scripts](/bash/14-testing) | `bats`, `run`/`$status`/`$output`, mocking, CI. |
| 15 | [Exercises & Projects](/bash/15-exercises-and-projects) | 7 projects from backup to a capstone deploy script. |

## Learning Path Suggestions

### If you're new to the command line

Read 01–04 (foundations, variables, control flow). Practice in the terminal — run each example. Then 05 (functions), 06 (text tools — the power of Bash), 07 (files). Do exercises 1–3 in chapter 15.

### If you know some Bash but scripts keep breaking

Read 02 (quoting — the #1 bug source), 12 (`set -euo pipefail` — strict mode), 13 (best practices), 14 (testing). You're likely missing quoting, strict mode, and ShellCheck. These catch 90% of bugs.

### If you're a developer using Bash for CI/CD

Read 06 (text processing — pipelines), 07 (file I/O, `find -print0`), 08 (processes, `wait`, `timeout`), 11 (args, `getopts`), 12 (error handling), 15 (deployment script capstone).

### If you're a sysadmin

Read 06 (text tools for log parsing), 07 (file system, permissions), 08 (processes, signals, `trap`), 11 (args), 13 (best practices, `main`, `readonly`), 15 (process monitor, backup, deploy).

## Companion Resources

- [GNU Bash Manual](https://www.gnu.org/software/bash/manual/) — the definitive reference.
- [ShellCheck](https://www.shellcheck.net) — the Bash linter (install locally for real-time linting).
- [Bash Hackers Wiki](https://wiki.bash-hackers.org) — idioms and gotchas.
- [Pure Bash Bible](https://github.com/dylanaraps/pure-bash-bible) — Bash-only replacements for external tools.
- [explainshell.com](https://explainshell.com) — paste a command, see what each part does.
- [tldr](https://tldr.sh) — concise command examples (`tldr grep`, `tldr sed`).

## Tooling

::code-wrapper{language="bash"}
```bash
# VS Code extensions:
# - "ShellCheck" (timonwong.shellcheck) — linting
# - "Bash IDE" (mads-hartmann.bash-ide) — language server
# - "Shell-format" (foxundermoon.shell-format) — formatter

# Install ShellCheck:
brew install shellcheck           # macOS
apt install shellcheck            # Debian/Ubuntu

# Install bats (testing):
brew install bats-core            # macOS
npm install -g bats               # npm
```
::

## Zero-to-Hero Path

1. **Day 1–2**: Read 01–04. Write small scripts (`hello.sh`, a counter, file checker).
2. **Day 3–5**: Read 05–08. Build a backup script, a log analyzer. Use `trap` and `set -euo pipefail`.
3. **Day 6–8**: Read 09–12. Build a CLI tool with `getopts`, proper error handling, and logging.
4. **Day 9–10**: Read 13–15. Refactor with `main`/`readonly`/`local`, add `bats` tests, do the capstone.
5. **Ongoing**: Run ShellCheck on everything, read others' scripts (`/etc/init.d/`, Homebrew formulas), automate your workflow.