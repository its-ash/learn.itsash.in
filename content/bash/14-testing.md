# 14 — Testing Bash Scripts

Bash scripts can be tested with `bats` (Bash Automated Testing System) — a TAP-producing test framework, like `pytest` for Bash.

## `bats` Setup

::code-wrapper{language="bash"}
```bash
# Install
brew install bats-core           # macOS
npm install -g bats              # npm
apt install bats                 # Debian/Ubuntu (may be older)

# Or from source
git clone https://github.com/bats-core/bats-core.git
cd bats-core && ./install.sh "$HOME"
```

## Your First Test

`test/strings_test.bats`:

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bats

@test "uppercase converts to uppercase" {
	result="$(echo 'hello' | tr 'a-z' 'A-Z')"
	[[ "$result" == "HELLO" ]]
}

@test "string length" {
	str="hello"
	[[ "${#str}" -eq 5 ]]
}
```

### Run

::code-wrapper{language="bash"}
```bash
bats test/strings_test.bats
#  ✓ uppercase converts to uppercase
#  ✓ string length
#  2 tests, 0 failures
```

## Testing a Script's Functions

`lib/math.sh`:

::code-wrapper{language="bash"}
```bash
add() {
	echo "$(( $1 + $2 ))"
}

is_even() {
	(( $1 % 2 == 0 ))
}
```

`test/math_test.bats`:

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bats
source "$(dirname "$BATS_TEST_FILENAME")/../lib/math.sh"

@test "add returns the sum" {
	[[ "$(add 2 3)" == "5" ]]
}

@test "add with negatives" {
	[[ "$(add -1 -2)" == "-3" ]]
}

@test "is_even returns 0 for even numbers" {
	run is_even 4
	[[ "$status" -eq 0 ]]
}

@test "is_even returns 1 for odd numbers" {
	run is_even 3
	[[ "$status" -ne 0 ]]
}
```

`source` the library, test each function. `run` captures a command's output (`$status`, `$output`).

## `run` and `$status`/`$output`

::code-wrapper{language="bash"}
```bash
@test "script outputs greeting" {
	run ./hello.sh "Alice"
	[[ "$status" -eq 0 ]]
	[[ "$output" == "Hello, Alice!" ]]
}

@test "script fails on missing arg" {
	run ./hello.sh
	[[ "$status" -ne 0 ]]
	[[ "$output" == *"Usage"* ]]
}
```

`run cmd args` executes the command, capturing `status` (exit code) and `output` (stdout+stderr). Test both.

## Assertions with `bats-assert`

[bats-assert](https://github.com/bats-core/bats-assert) provides `assert_equal`, `assert_success`, `assert_failure`, `assert_output`:

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bats
load '/usr/local/bats-support/load.bash'
load '/usr/local/bats-assert/load.bash'

@test "add returns the sum" {
	run add 2 3
	assert_success
	assert_output "5"
}

@test "is_even fails for odd" {
	run is_even 3
	assert_failure
}
```

`bats-assert` makes tests more readable (vs. raw `[[ ]]`).

## Setup and Teardown

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bats
source "../lib/math.sh"

setup() {
	tmpfile=$(mktemp)
}

teardown() {
	rm -f "$tmpfile"
}

@test "writes to temp file" {
	echo "hello" > "$tmpfile"
	[[ -s "$tmpfile" ]]
}
```

`setup` runs before each test; `teardown` after. Use for temp files, fixtures.

## Testing `set -e` Scripts

Scripts with `set -e` exit on the first error — test the exit status:

::code-wrapper{language="bash"}
```bash
@test "script exits 1 on bad input" {
	run ./script.sh --bad-arg
	[[ "$status" -eq 1 ]]
	[[ "$output" == *"Unknown option"* ]]
}

@test "script succeeds with valid input" {
	run ./script.sh --valid
	[[ "$status" -eq 0 ]]
}
```

## Skipping Tests

::code-wrapper{language="bash"}
```bash
@test "not implemented yet" {
	skip "TODO: implement feature"
	run my_func
	assert_success
}
```

`skip "reason"` marks a test as skipped (doesn't run, shows as `# skip`).

## Parameterized Tests (with `bats-loop` or loops)

`bats` doesn't have built-in parameterized tests, but you can loop in a helper:

::code-wrapper{language="bash"}
```bash
@test "is_even for multiple values" {
	for n in 2 4 6 8 10; do
		run is_even "$n"
		[[ "$status" -eq 0 ]]
	done
}
```

Or generate `.bats` files from a template (for separate test per case).

## Mocking

Mock a command by creating a function with the same name:

::code-wrapper{language="bash"}
```bash
@test "handles git failure" {
	# Mock git
	git() { return 1; }
	export -f git

	run my_script_that_uses_git
	[[ "$status" -ne 0 ]]
	[[ "$output" == *"git failed"* ]]
}
```

Override a command with a function (and `export -f` for subshells). Restore in `teardown` if needed.

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
			- run: sudo apt install bats
			- run: bats test/
```

Run `bats test/` in CI. TAP output integrates with most CI systems.

## ShellCheck in CI

::code-wrapper{language="yaml"}
```yaml
- run: shellcheck *.sh lib/*.sh
```

Always run ShellCheck alongside tests — it catches what tests might miss (quoting, `set -e` gaps, etc.).

## 💡 Tips & Tricks

- **Idiom**: use `bats` for testing Bash scripts — `@test "name" { ... }` with `[[ ]]` assertions. `run cmd` captures `$status`/`$output`. `bats test/` runs all. Like `pytest` for Bash. Keeps logic in functions (testable).
- **Idiom**: use `run` + `$status`/`$output` for testing commands — `run ./script.sh arg; [[ $status -eq 0 ]]; [[ $output == "expected" ]]`. `run` captures the exit code and output. Test both success and failure cases.
- **Idiom**: load `bats-assert` for readable assertions — `assert_success`, `assert_failure`, `assert_output "expected"`, `assert_equal "$a" "$b"`. Cleaner than raw `[[ ]]`. Load with `load 'path/to/load.bash'`.
- **Idiom**: mock commands by overriding with a function — `git() { return 1; }; export -f git` mocks `git` to fail. Restore in `teardown` (or unset the function). Useful for testing error handling.
- **Idiom**: run `bats` and `shellcheck` in CI — `bats test/` for tests, `shellcheck *.sh lib/*.sh` for linting. Together they catch bugs and enforce best practices. Both produce CI-friendly output (TAP, checkstyle).

## ⚠️ Edge Cases & Gotchas

- **`bats` tests are in `.bats` files**: `test/test_foo.bats`. `bats test/` runs all `*.bats` files. A `.sh` test file is ignored.
- **`run` captures stdout and stderr together**: `$output` has both. For separate capture, use `run --separate-stderr` (bats-core 1.5+) or redirect in the command.
- **`source` in a test runs in the test's shell**: functions/variables from the sourced file are available. But `set -e` in the sourced file applies to the test (may cause unexpected exits).
- **`setup`/`teardown` per test**: `setup` runs before each `@test`, `teardown` after. For once-per-file, use `setup_file`/`teardown_file` (bats-core 1.5+).
- **Mocking with functions affects the current shell**: `git() { ... }` overrides `git` in the test. `export -f git` propagates to subshells. Unset (`unset -f git`) in `teardown` to restore.
- **`bats` and `set -e`**: a failing `[[ ]]` in a `@test` causes the test to fail (good). But `set -e` in a sourced file can cause the test to exit unexpectedly. Avoid `set -e` in libraries (use it in scripts).
- **TAP output for CI**: `bats --formatter tap test/` produces TAP (test anything protocol), which CI systems parse. Default formatter is human-readable.
- **`$BATS_TEST_FILENAME`**: the path to the `.bats` file. Use for `source`-ing libraries relative to the test: `source "$(dirname "$BATS_TEST_FILENAME")/../lib/foo.sh"`.
- **`bats` on macOS**: `brew install bats-core` (the npm/apt versions may be older). `bats-core` (the maintained fork) is preferred over the original `bats`.
- **Tests don't catch everything**: `bats` tests behavior, but ShellCheck catches static issues (quoting, `set -e` gaps, unquoted vars). Use both.

## 🧠 Spot the Bug

A developer tests a function, but the test passes even when the function is broken:

::code-wrapper{language="bash"}
```bash
@test "add returns the sum" {
	run add 2 3
	[[ "$(add 2 3)" == "5" ]]
}
```
::

What's wrong with this test?

<details>
<summary>Answer</summary>

The test calls `add 2 3` *twice* — once with `run` (capturing into `$status`/`$output`, but not checking them), and once directly in the `[[ ]]`. The `run` is wasted (its output isn't checked). If `add` has a side effect (writing to a file, incrementing a counter), calling it twice causes issues. And if `add` is broken, the direct `$(add 2 3)` would fail, but the test structure is confusing (two calls).

The fix — use `run` and check `$output`:

```bash
@test "add returns the sum" {
	run add 2 3
	[[ "$status" -eq 0 ]]
	[[ "$output" == "5" ]]
}
```

Or test directly (without `run`):

```bash
@test "add returns the sum" {
	result="$(add 2 3)"
	[[ "$result" == "5" ]]
}
```

Pick one approach. `run` is better for testing commands (it captures exit status and output cleanly). Direct `$(...)` is fine for pure functions.

**The lesson**: don't mix `run` and direct calls in the same test. Use `run` + check `$status`/`$output`, OR capture directly (`result=$(...)`) + check. Calling the function twice is wasteful and can cause side-effect bugs.

</details>

## Summary

You can test Bash scripts with `bats` (`@test`, `run`/`$status`/`$output`), `bats-assert` (`assert_success`/`assert_output`), `setup`/`teardown`, mocking (function overrides + `export -f`), skipping, and integrate with CI (`bats test/` + `shellcheck`) — with the don't-call-twice and `run`-captures-both traps internalized. Next: exercises and projects.