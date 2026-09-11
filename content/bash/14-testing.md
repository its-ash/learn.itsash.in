---
title: "Bash 14 — Testing Architecture: bats, Mocking & CI Integration"
description: "Deep-dive into Bash testing with bats-core: test structure, run/$status/$output mechanics, bats-assert, setup/teardown lifecycle, function mocking with export -f, parameterized tests, and CI integration with ShellCheck. Code-first reference for senior engineers."
---

# 14 — Testing Architecture: bats, Mocking & CI Integration

## bats Setup and Test Structure

::code-wrapper{language="bash"}
```bash
# ── Install bats-core ──
brew install bats-core          # macOS
npm install -g bats             # npm
apt install bats                # Debian/Ubuntu (may be older)
# From source (latest):
git clone https://github.com/bats-core/bats-core.git
cd bats-core && ./install.sh "$HOME/.local"

# ── Optional: bats-assert and bats-support (for assertion helpers) ──
git clone https://github.com/bats-core/bats-support.git test/test_helper/bats-support
git clone https://github.com/bats-core/bats-assert.git test/test_helper/bats-assert

# ── Test file structure (.bats extension) ──
# test/math_test.bats:
#!/usr/bin/env bats

# ── Setup/teardown: run before/after EACH test ──
setup() {
    # Create test fixtures
    tmpdir=$(mktemp -d)
    echo "3.14159" > "$tmpdir/pi"
    echo "hello world" > "$tmpdir/data"
}

teardown() {
    # Clean up (runs even if the test fails)
    [[ -n "$tmpdir" && -d "$tmpdir" ]] && rm -rf -- "$tmpdir"
}

# ── Test: @test "description" { body } ──
@test "string length" {
    str="hello"
    [[ "${#str}" -eq 5 ]]
}

@test "uppercase" {
    result=$(echo 'hello' | tr 'a-z' 'A-Z')
    [[ "$result" == "HELLO" ]]
}

@test "file exists after setup" {
    [[ -f "$tmpdir/pi" ]]
}

@test "file content is correct" {
    [[ "$(cat "$tmpdir/data")" == "hello world" ]]
}
```
::

## `run`, `$status`, `$output`: Testing Commands

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bats

# ── `run` executes a command and captures: ──
# $status  — exit code (0-255)
# $output  — combined stdout+stderr
# $lines   — array of output lines

@test "command succeeds" {
    run echo "hello"
    [[ "$status" -eq 0 ]]
    [[ "$output" == "hello" ]]
}

@test "command fails with specific exit code" {
    run bash -c 'exit 42'
    [[ "$status" -eq 42 ]]
}

@test "command outputs multiple lines" {
    run printf '%s\n' "line1" "line2" "line3"
    [[ "$status" -eq 0 ]]
    [[ "${#lines[@]}" -eq 3 ]]
    [[ "${lines[0]}" == "line1" ]]
    [[ "${lines[1]}" == "line2" ]]
    [[ "${lines[2]}" == "line3" ]]
}

@test "command outputs contains substring" {
    run echo "error: file not found"
    [[ "$status" -eq 0 ]]
    [[ "$output" == *"file not found"* ]]   # glob match (substring)
}

@test "command outputs matches regex" {
    run echo "2024-01-15"
    [[ "$output" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]
}

# ── ⚠️ `run` captures stdout AND stderr together ──
@test "stderr is captured" {
    run bash -c 'echo "stdout"; echo "stderr" >&2'
    [[ "$output" == *stdout* ]]
    [[ "$output" == *stderr* ]]   # both captured (order may vary)
}

# ── Separate stderr (bats-core 1.5+) ──
@test "separate stderr" {
    run --separate-stderr bash -c 'echo "out"; echo "err" >&2'
    [[ "$output" == "out" ]]
    [[ "$stderr" == "err" ]]
}
```
::

## Testing Script Functions (Source and Test)

::code-wrapper{language="bash"}
```bash
# ── lib/math.sh: the library under test ──
add() {
    echo "$(( $1 + $2 ))"
}

is_even() {
    (( $1 % 2 == 0 ))
}

factorial() {
    local n=$1 result=1
    for ((i = 2; i <= n; i++)); do
        ((result *= i))
    done
    echo "$result"
}

validate_email() {
    [[ "$1" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]
}

# ── test/math_test.bats: tests for lib/math.sh ──
#!/usr/bin/env bats

# Source the library (functions become available in the test shell)
source "$(dirname "$BATS_TEST_FILENAME")/../lib/math.sh"

@test "add returns the sum" {
    [[ "$(add 2 3)" == "5" ]]
}

@test "add with negative numbers" {
    [[ "$(add -5 -3)" == "-8" ]]
}

@test "add with zero" {
    [[ "$(add 0 0)" == "0" ]]
}

@test "is_even returns 0 for even numbers" {
    run is_even 4
    [[ "$status" -eq 0 ]]
}

@test "is_even returns non-zero for odd numbers" {
    run is_even 3
    [[ "$status" -ne 0 ]]
}

@test "factorial of 0 is 1" {
    [[ "$(factorial 0)" == "1" ]]
}

@test "factorial of 5 is 120" {
    [[ "$(factorial 5)" == "120" ]]
}

@test "validate_email accepts valid email" {
    run validate_email "user@example.com"
    [[ "$status" -eq 0 ]]
}

@test "validate_email rejects missing @" {
    run validate_email "userexample.com"
    [[ "$status" -ne 0 ]]
}
```
::

## bats-assert: Readable Assertions

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bats

# Load bats-support and bats-assert (for assertion helpers)
load '../test_helper/bats-support/load.bash'
load '../test_helper/bats-assert/load.bash'

@test "assert_success" {
    run echo "hello"
    assert_success   # $status is 0
}

@test "assert_failure" {
    run false
    assert_failure   # $status is non-zero
}

@test "assert_failure with specific code" {
    run bash -c 'exit 42'
    assert_failure 42   # $status is 42
}

@test "assert_output exact match" {
    run echo "hello"
    assert_output "hello"
}

@test "assert_output substring match" {
    run echo "hello world"
    assert_output --partial "world"
}

@test "assert_output regex match" {
    run echo "2024-01-15"
    assert_output --regexp "[0-9]{4}-[0-9]{2}-[0-9]{2}"
}

@test "assert_equal" {
    assert_equal "hello" "hello"
    assert_equal "$(add 2 3)" "5"
}

@test "refute_output (negate)" {
    run echo "hello"
    refute_output "world"   # output is NOT "world"
}

@test "assert_line (check specific line)" {
    run printf '%s\n' "line1" "line2" "line3"
    assert_line --index 0 "line1"
    assert_line --index 1 "line2"
    assert_line --partial "line"
}
```
::

## Mocking: Override Commands with Functions

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bats

# ── Mock: override a command with a function ──
# The function has the same name as the command.
# `export -f` makes it available in subshells (where `run` executes).

setup() {
    # Create mock functions for this test
    mock_curl() {
        echo '{"status": "ok"}'
        return 0
    }
    export -f mock_curl
}

@test "script handles successful API call" {
    # Create a mock for `curl`
    curl() {
        echo '{"status": "ok"}'
        return 0
    }
    export -f curl

    # The script calls curl — our mock returns success
    run ./my_script.sh --api-check
    assert_success
    assert_output --partial "API is healthy"
}

@test "script handles failed API call" {
    # Mock curl to fail
    curl() {
        echo "connection refused" >&2
        return 7   # curl exit 7 = connection refused
    }
    export -f curl

    run ./my_script.sh --api-check
    assert_failure
    assert_output --partial "API is down"
}

@test "mock with argument capture" {
    # Capture arguments passed to the mock
    mock_git() {
        echo "MOCK: git $*" >> "$BATS_TEST_TMPDIR/git_calls.log"
        return 0
    }
    export -f mock_git
    export BATS_TEST_TMPDIR

    # Override git
    git() { mock_git "$@"; }
    export -f git

    run ./deploy_script.sh
    assert_success

    # Verify git was called with expected args
    [[ -f "$BATS_TEST_TMPDIR/git_calls.log" ]]
    grep -q "git push" "$BATS_TEST_TMPDIR/git_calls.log"
}

# ── Restore in teardown ──
teardown() {
    unset -f curl git mock_curl mock_git 2>/dev/null
}
```
::

## Parameterized Tests

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bats

source "../lib/math.sh"

# ── bats doesn't have built-in parameterized tests ──
# But you can loop inside a test or generate tests with a helper.

# ── Method 1: loop inside a test ──
@test "is_even for multiple values" {
    for n in 2 4 6 8 10; do
        run is_even "$n"
        [[ "$status" -eq 0 ]] || fail "is_even $n should be even"
    done
    for n in 1 3 5 7 9; do
        run is_even "$n"
        [[ "$status" -ne 0 ]] || fail "is_even $n should be odd"
    done
}

# ── Method 2: table-driven with data array ──
@test "add table-driven" {
    # Format: "a b expected"
    local data=(
        "1 2 3"
        "0 0 0"
        "-1 -1 -2"
        "100 200 300"
    )
    for row in "${data[@]}"; do
        read -r a b expected <<< "$row"
        local actual
        actual=$(add "$a" "$b")
        [[ "$actual" == "$expected" ]] || fail "add $a $b = $actual (expected $expected)"
    done
}

# ── Method 3: generate tests with bats-loop or a generator ──
# bats-loop: https://github.com/bats-core/bats-loop
# Or generate .bats files from a template (for separate test per case)
```
::

## setup_file and teardown_file (bats-core 1.5+)

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bats

# ── setup_file/teardown_file: run ONCE per file (not per test) ──
setup_file() {
    # Heavy setup: start a test database, create fixtures
    export TEST_DB=$(mktemp /tmp/test.db.XXXXXX)
    sqlite3 "$TEST_DB" "CREATE TABLE users (id INTEGER, name TEXT);"
    sqlite3 "$TEST_DB" "INSERT INTO users VALUES (1, 'Alice'), (2, 'Bob');"
}

teardown_file() {
    # Clean up after ALL tests
    rm -f "$TEST_DB"
}

# ── setup/teardown: run before/after EACH test ──
setup() {
    # Per-test setup: reset state, create temp files
    tmpdir=$(mktemp -d)
}

teardown() {
    rm -rf -- "$tmpdir"
}

@test "database has 2 users" {
    local count
    count=$(sqlite3 "$TEST_DB" "SELECT COUNT(*) FROM users;")
    [[ "$count" == "2" ]]
}

@test "Alice exists in database" {
    local name
    name=$(sqlite3 "$TEST_DB" "SELECT name FROM users WHERE id=1;")
    [[ "$name" == "Alice" ]]
}
```
::

## Anti-Pattern: Calling the Function Twice

::code-wrapper{language="bash"}
```bash
# ❌ NAIVE — calls add() twice (once with run, once with $())
@test "add returns the sum" {
    run add 2 3          # runs add, captures into $status/$output (but doesn't check!)
    [[ "$(add 2 3)" == "5" ]]  # runs add AGAIN — wasteful, and side effects compound!
}

# ✅ CORRECT — use run and check $output
@test "add returns the sum" {
    run add 2 3
    assert_success
    assert_output "5"    # checks $output (from the single run call)
}

# ✅ ALSO CORRECT — capture directly (for pure functions, no run needed)
@test "add returns the sum" {
    local result
    result=$(add 2 3)
    [[ "$result" == "5" ]]
}

# ── Why double-calling is bad ──
# 1. Wasteful: runs the function twice.
# 2. Side effects: if the function writes to a file or modifies state,
#    calling it twice causes issues (double writes, double increments).
# 3. Confusing: the run's output isn't checked; the direct call's result is.
# Pick one: `run` + $status/$output (for commands), or `$(...)` + check (for pure functions).
```
::

## CI Integration

::code-wrapper{language="yaml"}
```yaml
# .github/workflows/test.yml
name: Bash Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install bats-core
        run: |
          git clone https://github.com/bats-core/bats-core.git
          cd bats-core && ./install.sh /usr/local

      - name: Install bats-assert and bats-support
        run: |
          git clone https://github.com/bats-core/bats-support.git test/test_helper/bats-support
          git clone https://github.com/bats-core/bats-assert.git test/test_helper/bats-assert

      - name: Install ShellCheck
        run: sudo apt-get install -y shellcheck

      - name: Run ShellCheck
        run: shellcheck *.sh lib/*.sh
        # Lint all shell scripts

      - name: Run bats tests
        run: bats test/
        # Run all .bats files in test/

      - name: Run bats tests (TAP output)
        run: bats --formatter tap test/
        # TAP format for CI integration
```
::

## Production Pattern: Testing a Complete Script

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bats

# ── Test the full backup script ──
# bin/backup.sh:
#   #!/usr/bin/env bash
#   set -euo pipefail
#   src="${1:-}"
#   dst="${2:-}"
#   [[ -d "$src" ]] || { echo "source not found: $src" >&2; exit 1; }
#   [[ -n "$dst" ]] || { echo "missing dest" >&2; exit 1; }
#   tar -czf "$dst/backup.tar.gz" -C "$src" .
#   echo "backup complete"

setup() {
    src=$(mktemp -d)
    dst=$(mktemp -d)
    echo "important data" > "$src/file.txt"
}

teardown() {
    rm -rf -- "$src" "$dst"
}

@test "creates a backup" {
    run bash "$BATS_TEST_DIRNAME/../bin/backup.sh" "$src" "$dst"
    assert_success
    assert_output --partial "backup complete"
    [[ -f "$dst/backup.tar.gz" ]]
    # Verify the backup content
    tar -xzf "$dst/backup.tar.gz" -C "$dst/extracted"
    [[ "$(cat "$dst/extracted/file.txt")" == "important data" ]]
}

@test "fails on missing source" {
    run bash "$BATS_TEST_DIRNAME/../bin/backup.sh" "/nonexistent" "$dst"
    assert_failure
    assert_output --partial "source not found"
}

@test "fails on missing dest" {
    run bash "$BATS_TEST_DIRNAME/../bin/backup.sh" "$src" ""
    assert_failure
    assert_output --partial "missing dest"
}

@test "fails on non-directory source" {
    echo "not a dir" > "$src/file2.txt"
    run bash "$BATS_TEST_DIRNAME/../bin/backup.sh" "$src/file2.txt" "$dst"
    assert_failure
    assert_output --partial "source not found"
}
```
::

## 💡 Tips & Tricks

::code-wrapper{language="bash"}
```bash
# ── Skip tests conditionally ──
@test "only run on Linux" {
    [[ "$(uname)" == "Linux" ]] || skip "Linux only"
    # ... test ...
}

@test "requires docker" {
    command -v docker &>/dev/null || skip "docker not installed"
    # ... test ...
}

@test "TODO: implement" {
    skip "not implemented yet"
}

# ── Skip with reason ──
@test "slow integration test" {
    [[ -n "${RUN_SLOW:-}" ]] || skip "set RUN_SLOW=1 to run"
    # ... slow test ...
}

# ── Test helpers: create reusable functions ──
setup() {
    # Create a temp project with a git repo
    setup_git_repo() {
        local dir=$1
        mkdir -p "$dir"
        cd "$dir"
        git init --quiet
        git config user.email "test@test.com"
        git config user.name "Test"
        echo "content" > file.txt
        git add . && git commit -m "initial" --quiet
    }
    export -f setup_git_repo
}

# ── Capture output for debugging ──
@test "debug output" {
    run ./my_script.sh
    # If the test fails, bats shows $output and $status
    # You can also print manually:
    echo "DEBUG: status=$status" >&3   # >&3 prints to bats' output (not captured)
    echo "DEBUG: output=$output" >&3
    assert_success
}

# ── Run a subset of tests ──
# bats test/math_test.bats        # run one file
# bats -f "factorial" test/       # run tests matching filter
# bats -n test/                   # run only tests that failed last time (junit output)
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="bash"}
```bash
# ── bats tests are in .bats files ──
# bats test/ runs all *.bats files. .sh test files are ignored.
# Name test files: test/feature_test.bats

# ── `source` in a test runs in the test's shell ──
# Functions/variables from the sourced file are available.
# But `set -e` in the sourced file applies to the test shell (may cause unexpected exits).
# Don't use `set -e` in libraries — use it only in scripts.

# ── `run` captures stdout AND stderr ──
# $output has both. Use `run --separate-stderr` (bats 1.5+) for $stderr separately.

# ── Mocking with functions affects the test shell ──
# `git() { ... }` overrides git in the test. Always unset in teardown: `unset -f git`.

# ── `$BATS_TEST_FILENAME` vs `$0` ──
# $0 is the bats executable. Use $BATS_TEST_FILENAME for the test file's path.
# source "$(dirname "$BATS_TEST_FILENAME")/../lib/utils.sh"

# ── bats and `set -e` ──
# A failing `[[ ]]` in a @test causes the test to fail (good).
# But `set -e` in a sourced file can exit the test shell. Don't source files with `set -e`.

# ── Tests don't catch everything ──
# bats tests behavior (runtime). ShellCheck catches static issues (quoting, unset vars).
# Use BOTH: bats for behavior, ShellCheck for static analysis.
```
::

## 🧠 Quick Quiz

Why does this test pass even when the function is broken?

::code-wrapper{language="bash"}
```bash
@test "add works" {
    run add 2 3
    [[ "$(add 2 3)" == "5" ]]
}
```
::

<details>
<summary>Answer</summary>

The test calls `add 2 3` **twice**:
1. `run add 2 3` — captures into `$status`/`$output`, but **neither is checked**.
2. `$(add 2 3)` — the `[[ ]]` checks this call's output against "5".

If `add` is broken (returns "6"), the `run` call's output ("6") is ignored, and the `[[ ]]` fails — the test **does** fail. But the issue is:

- **Wasteful**: `add` runs twice.
- **Side effects**: if `add` writes to a file or increments a counter, it runs twice.
- **Confusing**: the `run` is dead code (its output isn't checked). A reader might think the test checks `run`'s output.

**The fix**: use one approach:

```bash
@test "add works" {
    run add 2 3
    assert_success
    assert_output "5"    # checks the run's output (single call)
}
```

Or (for pure functions):

```bash
@test "add works" {
    result=$(add 2 3)
    [[ "$result" == "5" ]]
}
```

**The lesson**: don't mix `run` and direct `$(...)` calls in the same test. Pick one — `run` + `$output` for commands, or `$()` + `[[ ]]` for pure functions.

</details>