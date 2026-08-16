# 15 — Exercises & Projects

Apply everything from chapters 1–14 in real-world projects. These exercises progress from focused drills to a full capstone.

## Project 1 — File Backup Script

A script that backs up a directory (chapter 2–8).

**Requirements**:
- Take source and destination as args.
- Use `rsync` (or `tar`) to create a timestamped backup.
- Verify the source exists; error clearly if not.
- Clean up old backups (keep last N).
- `trap` cleanup for temp files.
- Strict mode (`set -euo pipefail`).
- `--dry-run` flag.

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
set -euo pipefail

usage() {
	cat <<EOF
Usage: $0 [--dry-run] <source> <destination> [keep]
  --dry-run  Show what would be done
  keep       Number of old backups to keep (default: 5)
EOF
}

dry_run=false
keep=5

while [[ $# -gt 0 ]]; do
	case "$1" in
		--dry-run) dry_run=true; shift ;;
		-h|--help) usage; exit 0 ;;
		-*) echo "Unknown option: $1" >&2; usage; exit 1 ;;
		*) break ;;
	esac
done

[[ $# -lt 2 ]] && { usage; exit 1; }
src="$1"
dst="$2"
[[ $# -ge 3 ]] && keep="$3"

[[ -d "$src" ]] || { echo "Error: source '$src' not a directory" >&2; exit 1; }
[[ -d "$dst" ]] || mkdir -p "$dst"

timestamp=$(date +%Y%m%d_%H%M%S)
backup="$dst/backup_${timestamp}.tar.gz"

run() {
	if $dry_run; then
		echo "DRY RUN: $*" >&2
	else
		"$@"
	fi
}

echo "Backing up '$src' to '$backup'" >&2
run tar -czf "$backup" -C "$(dirname "$src")" "$(basename "$src")"

# Clean up old backups
mapfile -t backups < <(ls -1 "$dst"/backup_*.tar.gz 2>/dev/null | sort -r)
if (( ${#backups[@]} > keep )); then
	for old in "${backups[@]:keep}"; do
		echo "Removing old backup: $old" >&2
		run rm -f "$old"
	done
fi

echo "Done" >&2
```

**Goal**: a robust backup script with error handling, cleanup, and dry-run.

## Project 2 — Log Analyzer

Analyze a web server log (chapter 6, 9, 10).

**Requirements**:
- Find the top 10 most requested URLs.
- Find the top 10 client IPs.
- Count HTTP status codes (200, 404, 500, etc.).
- Find the busiest hour.
- Output a summary report.

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
set -euo pipefail

log="${1:-access.log}"
[[ -f "$log" ]] || { echo "Log not found: $log" >&2; exit 1; }

echo "=== Top 10 URLs ==="
awk '{print $7}' "$log" | sort | uniq -c | sort -rn | head -10

echo -e "\n=== Top 10 IPs ==="
awk '{print $1}' "$log" | sort | uniq -c | sort -rn | head -10

echo -e "\n=== Status codes ==="
awk '{print $9}' "$log" | sort | uniq -c | sort -rn

echo -e "\n=== Busiest hour ==="
awk '{print $4}' "$log" | cut -d: -f2 | sort | uniq -c | sort -rn | head -1

echo -e "\n=== Total requests ==="
wc -l < "$log"
```

**Goal**: a log analyzer using `awk`/`sort`/`uniq` pipelines.

## Project 3 — Git Commit Hook

A pre-commit hook that runs checks (chapter 5, 8, 12).

**Requirements**:
- Run ShellCheck on all staged `.sh` files.
- Run tests (`bats test/`) if they exist.
- Block the commit if any check fails.
- Skip with `--no-verify` (Git's built-in).

`.git/hooks/pre-commit`:

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
set -euo pipefail

# Run ShellCheck on staged .sh files
staged_sh=$(git diff --cached --name-only --diff-filter=ACM | grep '\.sh$' || true)
if [[ -n "$staged_sh" ]]; then
	echo "Running ShellCheck..."
	echo "$staged_sh" | xargs shellcheck
fi

# Run tests if they exist
if [[ -d test ]] && ls test/*.bats &>/dev/null; then
	echo "Running bats tests..."
	bats test/
fi

echo "Pre-commit checks passed."
```

::code-wrapper{language="bash"}
```bash
chmod +x .git/hooks/pre-commit
```

**Goal**: a Git hook enforcing code quality.

## Project 4 — Process Monitor

Monitor a process and restart it if it dies (chapter 8).

**Requirements**:
- Start a command (given as args).
- Monitor it; restart if it exits.
- Backoff between restarts (1s, 2s, 4s, ..., max 60s).
- Handle Ctrl-C (stop both the monitor and the child).
- Log restarts.

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
set -uo pipefail

[[ $# -lt 1 ]] && { echo "Usage: $0 <command> [args...]" >&2; exit 1; }

child_pid=0
backoff=1
max_backoff=60

cleanup() {
	[[ $child_pid -gt 0 ]] && kill "$child_pid" 2>/dev/null
	exit
}
trap cleanup INT TERM

while true; do
	echo "[$(date +%T)] Starting: $*" >&2
	"$@" &
	child_pid=$!
	if wait "$child_pid"; then
		echo "[$(date +%T)] Exited normally" >&2
		break
	fi
	echo "[$(date +%T)] Crashed, restarting in ${backoff}s" >&2
	sleep "$backoff"
	backoff=$((backoff * 2))
	((backoff > max_backoff)) && backoff=$max_backoff
done
```

**Goal**: a supervisor script with backoff and signal handling.

## Project 5 — Batch Image Resizer

Resize all images in a directory (chapter 6, 8, 11).

**Requirements**:
- Take a directory and a size (e.g., `800x600`).
- Find all `.jpg`/`.png` files.
- Resize in parallel (4 at a time) using `xargs -P` or background jobs.
- Use `convert` (ImageMagick) or `sips` (macOS).
- `--dry-run` flag.

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
set -euo pipefail

size="${1:?Usage: $0 <size> [directory]}"
dir="${2:-.}"

command -v convert &>/dev/null || { echo "ImageMagick not found" >&2; exit 1; }
[[ -d "$dir" ]] || { echo "Not a directory: $dir" >&2; exit 1; }

resize_one() {
	local file="$1" size="$2"
	local base="${file%.*}"
	local ext="${file##*.}"
	local out="${base}_${size}.${ext}"
	echo "Resizing: $file → $out"
	convert "$file" -resize "$size" "$out"
}
export -f resize_one

find "$dir" -maxdepth 1 -type f \( -iname "*.jpg" -o -iname "*.png" \) -print0 |
	xargs -0 -P 4 -I {} bash -c 'resize_one "$1" "$2"' _ {} "$size"

echo "Done"
```

**Goal**: a parallel batch processor using `find`/`xargs -P`.

## Project 6 — Dotfile Manager

Symlink dotfiles from a repo to `$HOME` (chapter 7, 11, 13).

**Requirements**:
- `link` — symlink dotfiles from the repo to `$HOME`.
- `unlink` — remove the symlinks.
- `status` — show what's linked / missing / changed.
- Backup existing files before overwriting.
- Idempotent (safe to run multiple times).

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly DOTFILES=("bashrc" "vimrc" "gitconfig" "tmux.conf")

usage() { echo "Usage: $0 {link|unlink|status}"; }

link() {
	for dot in "${DOTFILES[@]}"; do
		local src="$SCRIPT_DIR/$dot"
		local dst="$HOME/.$dot"
		[[ -f "$src" ]] || continue
		if [[ -e "$dst" && ! -L "$dst" ]]; then
			mv "$dst" "$dst.backup.$(date +%s)"
			echo "Backed up existing .$dot"
		fi
		ln -sf "$src" "$dst"
		echo "Linked .$dot"
	done
}

unlink() {
	for dot in "${DOTFILES[@]}"; do
		local dst="$HOME/.$dot"
		[[ -L "$dst" ]] && { rm "$dst"; echo "Unlinked .$dot"; }
	done
}

status() {
	for dot in "${DOTFILES[@]}"; do
		local dst="$HOME/.$dot"
		if [[ -L "$dst" ]]; then
			echo " ✓ .$dot → $(readlink "$dst")"
		elif [[ -e "$dst" ]]; then
			echo " ! .$dot exists (not a symlink)"
		else
			echo " ✗ .$dot missing"
		fi
	done
}

case "${1:-}" in
	link) link ;;
	unlink) unlink ;;
	status) status ;;
	*) usage; exit 1 ;;
esac
```

**Goal**: a dotfile manager with subcommands, idempotent operations, and backups.

## Project 7 — Deployment Script (Capstone)

A full deployment script combining all skills (all chapters).

**Requirements**:
- **Args**: `./deploy.sh <env> [--dry-run] [--rollback]` (env: `staging`/`prod`).
- **Config**: per-env config (host, path, service name) in a sourced file or associative array.
- **Pre-checks**: dependencies (`rsync`, `ssh`), required env vars, branch (must be `main` for prod).
- **Build**: run tests (`bats test/`), build the app.
- **Deploy**: `rsync` to the server, restart the service via `ssh`, verify it's up.
- **Rollback**: keep last N releases, symlink to current, rollback to previous.
- **Health check**: `curl` the health endpoint, retry with backoff.
- **Notifications**: log to a file, optionally send a Slack webhook on success/failure.
- **Strict mode**: `set -euo pipefail`, `trap` cleanup, `die` for errors.
- **Parallel**: build and test in parallel where possible.
- **Idempotent**: safe to rerun.
- **Dry-run**: show what would be done without executing.
- **Tests**: `bats` tests for the helper functions (parsing, config, rollback logic).
- **ShellCheck** clean.

**Bonus**:
- Blue-green deployment (switch a symlink, no downtime).
- Canary (deploy to one server, check, then the rest).
- Slack/Teams notification on success/failure.
- Lock file to prevent concurrent deploys.
- Log rotation for the deploy log.

**Goal**: a production-quality deployment script demonstrating all Bash skills — args, config, error handling, SSH/rsync, retries, health checks, notifications, testing, and idempotency.

## Checklist

::code-wrapper{language="markdown"}
```markdown
- [ ] `#!/usr/bin/env bash` shebang
- [ ] `set -euo pipefail` (strict mode)
- [ ] `trap cleanup EXIT` (cleanup)
- [ ] All variables quoted (`"$var"`, `"${arr[@]}"`)
- [ ] `local` for function variables
- [ ] `readonly` for constants
- [ ] `main "$@"` entry point
- [ ] `usage` function and arg validation
- [ ] Errors to stderr (`>&2`), data to stdout
- [ ] Meaningful exit codes
- [ ] `mktemp` for temp files (not predictable names)
- [ ] Idempotent operations (`mkdir -p`, `[[ -e ]] || create`)
- [ ] No `eval` on untrusted input
- [ ] `find -print0 | while IFS= read -r -d ''` for filenames
- [ ] ShellCheck clean
- [ ] `bats` tests for logic
- [ ] `--dry-run` for dangerous operations
```

## Summary

You've applied the full Bash toolkit — from a backup script and log analyzer to a Git hook, process monitor, batch resizer, dotfile manager, and a capstone deployment script. You can write robust, strict-mode scripts with proper quoting, error handling, traps, and tests — a production-quality Bash foundation. Bash's power is composing small tools into pipelines and automating system tasks; with discipline (quoting, strict mode, ShellCheck, tests), it's a reliable automation language.