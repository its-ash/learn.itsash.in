---
title: "Bash 15 — Production Projects: Backup, Deploy, Monitor & Capstone"
description: "Seven production-grade Bash projects from backup scripts to a capstone deployment system. Each project demonstrates real-world patterns: strict mode, traps, error handling, parallelism, retries, health checks, and testing. Code-first reference for senior engineers."
---

# 15 — Production Projects: Backup, Deploy, Monitor & Capstone

## Project 1 — Production Backup Script

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
# ── Timestamped backup with retention, verification, and dry-run ──
set -Eeuo pipefail

readonly SCRIPT_NAME=$(basename "${BASH_SOURCE[0]}")
readonly TS=$(date +%Y%m%d_%H%M%S)

# ── Config ──
RETENTION=5
DRY_RUN=false
COMPRESS=true
VERBOSE=false

usage() {
    cat <<EOF
Usage: $SCRIPT_NAME [OPTIONS] <source> <destination>

Options:
  -h, --help           Show this help
  -n, --dry-run        Show what would be done (no execution)
  -k, --keep N         Keep last N backups (default: $RETENTION)
  -z, --gzip           Compress backup (default: on)
  -v, --verbose        Verbose output

Examples:
  $SCRIPT_NAME /data /backups
  $SCRIPT_NAME -n -k 10 /data /backups
EOF
}

log() { printf '[%s] %s\n' "$(date -Iseconds)" "$*" >&2; }
die() { log "FATAL: $*"; exit 1; }

# ── Parse args ──
while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help)    usage; exit 0 ;;
        -n|--dry-run) DRY_RUN=true; shift ;;
        -k|--keep)    RETENTION="${2:?--keep requires a number}"; shift 2 ;;
        -z|--gzip)    COMPRESS=true; shift ;;
        --no-gzip)    COMPRESS=false; shift ;;
        -v|--verbose) VERBOSE=true; shift ;;
        -*)           die "unknown option: $1" ;;
        *)            break ;;
    esac
done

[[ $# -ge 2 ]] || { usage; exit 1; }
readonly SRC="$1"
readonly DST="$2"

# ── Validate ──
[[ -d "$SRC" ]] || die "source not a directory: $SRC"
[[ -d "$DST" ]] || mkdir -p "$DST" || die "can't create destination: $DST"

# ── Cleanup trap ──
tmpfile=""
cleanup() {
    local code=$?
    [[ -n "$tmpfile" && -f "$tmpfile" ]] && rm -f "$tmpfile"
    exit "$code"
}
trap cleanup EXIT

# ── Run wrapper (dry-run aware) ──
run() {
    if $DRY_RUN; then
        log "DRY RUN: $*"
    else
        $VERBOSE && log "executing: $*"
        "$@"
    fi
}

# ── Create backup ──
backup_file="$DST/backup_${TS}.tar.$([[ $COMPRESS == true ]] && echo gz || echo tar)"
log "backing up '$SRC' to '$backup_file'"

if $COMPRESS; then
    run tar -czf "$backup_file" -C "$(dirname "$SRC")" "$(basename "$SRC")"
else
    run tar -cf "$backup_file" -C "$(dirname "$SRC")" "$(basename "$SRC")"
fi

# ── Verify backup (only if not dry-run) ──
if ! $DRY_RUN; then
    log "verifying backup..."
    if $COMPRESS; then
        gzip -t "$backup_file" 2>/dev/null || die "backup verification failed (corrupt gzip)"
    else
        tar -tf "$backup_file" &>/dev/null || die "backup verification failed (corrupt tar)"
    fi
    log "verification passed"
fi

# ── Cleanup old backups ──
log "retention: keeping last $RETENTION backups"
mapfile -t backups < <(ls -1 "$DST"/backup_*.tar.* 2>/dev/null | sort -r)
if (( ${#backups[@]} > RETENTION )); then
    for old in "${backups[@]:RETENTION}"; do
        log "removing old backup: $old"
        run rm -f "$old"
    done
fi

log "done"
```
::

## Project 2 — Log Analyzer with Summary Report

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
# ── Analyze an access log: top IPs, URLs, status codes, busiest hour ──
set -euo pipefail

readonly LOG="${1:-access.log}"

[[ -f "$LOG" ]] || { echo "log not found: $LOG" >&2; exit 1; }

# ── Summary report ──
report() {
    local section=$1; shift
    printf '\n=== %s ===\n' "$section"
    "$@"
}

# ── Top 10 client IPs ──
report "Top 10 IPs" bash -c "awk '{print \$1}' \"\$1\" | sort | uniq -c | sort -rn | head -10" _ "$LOG"

# ── Top 10 URLs ──
report "Top 10 URLs" bash -c "awk '{print \$7}' \"\$1\" | sort | uniq -c | sort -rn | head -10" _ "$LOG"

# ── Status code distribution ──
report "Status Codes" bash -c "awk '{print \$9}' \"\$1\" | sort | uniq -c | sort -rn" _ "$LOG"

# ── Busiest hour ──
report "Busiest Hour" bash -c "awk '{print \$4}' \"\$1\" | cut -d: -f2 | sort | uniq -c | sort -rn | head -1" _ "$LOG"

# ── Total requests ──
printf '\n=== Total Requests ===\n'
wc -l < "$LOG"

# ── Error rate (4xx + 5xx) ──
printf '\n=== Error Rate ===\n'
total=$(wc -l < "$LOG")
errors=$(awk '$9 >= 400' "$LOG" | wc -l)
if ((total > 0)); then
    awk -v e="$errors" -v t="$total" 'BEGIN { printf "%.2f%%\n", (e/t)*100 }'
fi

# ── Top error URLs ──
report "Top Error URLs (4xx/5xx)" bash -c "awk '\$9 >= 400 {print \$7}' \"\$1\" | sort | uniq -c | sort -rn | head -10" _ "$LOG"
```
::

## Project 3 — Git Pre-Commit Hook

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
# ── .git/hooks/pre-commit: run ShellCheck and tests before commit ──
set -euo pipefail

log() { printf '[pre-commit] %s\n' "$*" >&2; }

# ── Get staged .sh files ──
mapfile -t staged_sh < <(git diff --cached --name-only --diff-filter=ACM | grep '\.sh$' || true)

if (( ${#staged_sh[@]} > 0 )); then
    log "running ShellCheck on ${#staged_sh[@]} file(s)..."
    # Use xargs for batch processing
    printf '%s\n' "${staged_sh[@]}" | xargs shellcheck
    log "ShellCheck passed"
fi

# ── Run bats tests if they exist ──
if [[ -d test ]] && ls test/*.bats &>/dev/null; then
    log "running bats tests..."
    bats test/
    log "tests passed"
fi

# ── Run ShellCheck on staged .bats files too ──
mapfile -t staged_bats < <(git diff --cached --name-only --diff-filter=ACM | grep '\.bats$' || true)
if (( ${#staged_bats[@]} > 0 )); then
    log "running ShellCheck on .bats files..."
    printf '%s\n' "${staged_bats[@]}" | xargs shellcheck --shell bash
fi

log "all pre-commit checks passed"
```
::
::code-wrapper{language="bash"}
```bash
# Install: chmod +x .git/hooks/pre-commit
```
::

## Project 4 — Process Supervisor with Backoff

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
# ── Monitor a process, restart on crash with exponential backoff ──
set -uo pipefail  # no set -e (we handle errors manually for restart logic)

log() { printf '[%s] %s\n' "$(date -Iseconds)" "$*" >&2; }
die() { log "FATAL: $*"; exit 1; }

[[ $# -ge 1 ]] || die "usage: $0 <command> [args...]"

child_pid=0
backoff=1
max_backoff=60
max_restarts=0  # 0 = unlimited
restart_count=0

cleanup() {
    local code=$?
    if ((child_pid > 0)) && kill -0 "$child_pid" 2>/dev/null; then
        log "stopping child (PID $child_pid)..."
        kill -TERM "$child_pid" 2>/dev/null
        # Wait up to 10s for graceful shutdown
        for i in {1..10}; do
            kill -0 "$child_pid" 2>/dev/null || break
            sleep 1
        done
        kill -KILL "$child_pid" 2>/dev/null  # force if still alive
        wait "$child_pid" 2>/dev/null
    fi
    exit "$code"
}
trap cleanup INT TERM EXIT

log "supervisor started: $*"

while true; do
    log "starting: $*"
    "$@" &
    child_pid=$!

    # Wait for the child to exit
    if wait "$child_pid"; then
        log "child exited normally"
        break  # clean exit — stop supervisor
    fi

    exit_code=$?
    log "child crashed (exit $exit_code)"

    # Check restart limit
    ((restart_count++))
    if ((max_restarts > 0 && restart_count >= max_restarts)); then
        die "max restarts ($max_restarts) reached"
    fi

    log "restarting in ${backoff}s (attempt $restart_count)..."
    sleep "$backoff"

    # Exponential backoff: 1, 2, 4, 8, 16, 32, 60, 60, ...
    ((backoff *= 2))
    ((backoff > max_backoff)) && backoff=$max_backoff
done

log "supervisor stopped"
```
::

## Project 5 — Parallel Batch Image Resizer

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
# ── Resize images in parallel with xargs -P ──
set -euo pipefail

size="${1:?usage: $0 <size> [directory]}"
dir="${2:-.}"

command -v convert &>/dev/null || { echo "ImageMagick not found" >&2; exit 1; }
[[ -d "$dir" ]] || { echo "not a directory: $dir" >&2; exit 1; }

# ── Resize function (exported for xargs) ──
resize_one() {
    local file=$1 size=$2
    local base="${file%.*}"
    local ext="${file##*.}"
    local out="${base}_${size}.${ext}"
    convert "$file" -resize "$size" "$out"
    printf '%s → %s\n' "$file" "$out"
}
export -f resize_one

# ── Find images and resize in parallel (4 at a time) ──
count=0
while IFS= read -r -d '' file; do
    resize_one "$file" "$size" &
    ((count++))
    # Limit to 4 parallel jobs
    ((count % 4 == 0)) && wait
done < <(find "$dir" -maxdepth 1 -type f \( -iname "*.jpg" -o -iname "*.png" \) -print0)
wait  # wait for remaining jobs

printf 'resized %d images\n' "$count"
```
::

## Project 6 — Dotfile Manager

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
# ── Symlink dotfiles from repo to $HOME with backup and status ──
set -euo pipefail

readonly SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
readonly DOTFILES=("bashrc" "vimrc" "gitconfig" "tmux.conf" "zshrc")

usage() {
    cat <<EOF
Usage: $(basename "$0") <command>

Commands:
  link     Symlink dotfiles to $HOME (backups existing files)
  unlink   Remove symlinks from $HOME
  status   Show link status
EOF
}

log() { printf '%s\n' "$*"; }

# ── Link dotfiles ──
link() {
    for dot in "${DOTFILES[@]}"; do
        local src="$SCRIPT_DIR/$dot"
        local dst="$HOME/.$dot"

        [[ -f "$src" ]] || continue  # skip if source doesn't exist

        # Backup existing file (if it's not already a symlink)
        if [[ -e "$dst" && ! -L "$dst" ]]; then
            local backup="$dst.backup.$(date +%s)"
            mv "$dst" "$backup"
            log "backed up existing .$dot → $backup"
        fi

        # Create symlink (force — replaces existing symlink)
        ln -sf "$src" "$dst"
        log "linked .$dot → $src"
    done
}

# ── Unlink dotfiles ──
unlink() {
    for dot in "${DOTFILES[@]}"; do
        local dst="$HOME/.$dot"
        if [[ -L "$dst" ]]; then
            rm "$dst"
            log "unlinked .$dot"
        fi
    done
}

# ── Show status ──
status() {
    for dot in "${DOTFILES[@]}"; do
        local src="$SCRIPT_DIR/$dot"
        local dst="$HOME/.$dot"
        if [[ -L "$dst" ]]; then
            local target
            target=$(readlink "$dst")
            if [[ "$target" == "$src" ]]; then
                log "  ✓ .$dot → $target"
            else
                log "  ⚠ .$dot → $target (wrong target!)"
            fi
        elif [[ -e "$dst" ]]; then
            log "  ! .$dot exists (not a symlink)"
        elif [[ -f "$src" ]]; then
            log "  ✗ .$dot missing (not linked)"
        fi
    done
}

# ── Dispatch ──
case "${1:-}" in
    link)   link ;;
    unlink) unlink ;;
    status) status ;;
    *)      usage; exit 1 ;;
esac
```
::

## Project 7 — Capstone: Deployment Script

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
# ── Production deployment script: build, test, deploy, health check, rollback ──
set -Eeuo pipefail

readonly SCRIPT_NAME=$(basename "${BASH_SOURCE[0]}")
readonly VERSION="2.0.0"

# ── Config (per-environment) ──
declare -A ENVS=(
    [staging_host]="staging.example.com"
    [staging_path]="/var/www/staging"
    [staging_service]="myapp-staging"
    [prod_host]="prod.example.com"
    [prod_path]="/var/www/prod"
    [prod_service]="myapp-prod"
)
RELEASES_TO_KEEP=5
DRY_RUN=false
ROLLBACK=false
HEALTH_RETRIES=5
HEALTH_DELAY=5

log() { printf '[%s] %s\n' "$(date -Iseconds)" "$*" >&2; }
die() { log "FATAL: $*"; exit 1; }

usage() {
    cat <<EOF
$SCRIPT_NAME v$VERSION

Usage: $SCRIPT_NAME <env> [OPTIONS]

Arguments:
  env         Target environment (staging, prod)

Options:
  -h, --help       Show this help
  -n, --dry-run    Show what would be done (no execution)
  --rollback       Rollback to previous release
  -k, --keep N     Keep last N releases (default: $RELEASES_TO_KEEP)

Examples:
  $SCRIPT_NAME staging
  $SCRIPT_NAME prod --dry-run
  $SCRIPT_NAME prod --rollback
EOF
}

# ── Parse args ──
[[ $# -ge 1 ]] || { usage; exit 1; }
ENV="$1"; shift
case "$ENV" in
    staging|prod) ;;
    -h|--help) usage; exit 0 ;;
    *) die "invalid env: $ENV (use: staging, prod)"; ;;
esac

while [[ $# -gt 0 ]]; do
    case "$1" in
        -n|--dry-run)  DRY_RUN=true; shift ;;
        --rollback)   ROLLBACK=true; shift ;;
        -k|--keep)    RELEASES_TO_KEEP="${2:?--keep requires N}"; shift 2 ;;
        -h|--help)    usage; exit 0 ;;
        *)            die "unknown option: $1" ;;
    esac
done

readonly ENV DRY_RUN ROLLBACK RELEASES_TO_KEEP

# ── Dependencies ──
require() { command -v "$1" &>/dev/null || die "missing: $1"; }
require rsync
require ssh
require curl

# ── Run wrapper ──
run() {
    if $DRY_RUN; then
        log "DRY RUN: $*"
    else
        "$@"
    fi
}

# ── Config lookup ──
get_config() { echo "${ENVS[${ENV}_$1]:-}"; }

readonly HOST=$(get_config host)
readonly REMOTE_PATH=$(get_config path)
readonly SERVICE=$(get_config service)

[[ -n "$HOST" ]] || die "no host configured for $ENV"
[[ -n "$REMOTE_PATH" ]] || die "no path configured for $ENV"
[[ -n "$SERVICE" ]] || die "no service configured for $ENV"

# ── Pre-deploy checks ──
pre_check() {
    log "pre-deploy checks for $ENV"

    # For prod: require branch to be main
    if [[ "$ENV" == "prod" ]]; then
        local branch
        branch=$(git rev-parse --abbrev-ref HEAD)
        [[ "$branch" == "main" ]] || die "prod deploy requires main branch (current: $branch)"
    fi

    # Check for uncommitted changes
    if ! $DRY_RUN; then
        [[ -z "$(git status --porcelain)" ]] || die "uncommitted changes — commit or stash first"
    fi

    log "pre-checks passed"
}

# ── Build and test ──
build_and_test() {
    log "building..."

    # Run tests in parallel with bats (if test dir exists)
    if [[ -d test ]] && ls test/*.bats &>/dev/null; then
        log "running tests..."
        run bats test/ || die "tests failed"
    fi

    # Build (npm, make, etc.)
    run npm run build || die "build failed"
    log "build complete"
}

# ── Deploy ──
deploy() {
    local ts=$(date +%Y%m%d_%H%M%S)
    local release_dir="$REMOTE_PATH/releases/$ts"

    log "deploying to $HOST:$release_dir"

    # Create release directory on remote
    run ssh "$HOST" "mkdir -p '$release_dir'"

    # Rsync build output to the new release directory
    log "syncing files..."
    run rsync -az --delete dist/ "$HOST:$release_dir/"

    # Symlink current → new release (atomic switch)
    log "switching current symlink..."
    run ssh "$HOST" "ln -sfn '$release_dir' '$REMOTE_PATH/current'"

    # Restart the service
    log "restarting $SERVICE..."
    run ssh "$HOST" "sudo systemctl restart '$SERVICE'"

    # Cleanup old releases
    cleanup_old_releases

    log "deployed: $ts"
    echo "$ts"  # return the release timestamp
}

# ── Health check with retries ──
health_check() {
    local url="https://$HOST/health"
    local attempt=1

    while ((attempt <= HEALTH_RETRIES)); do
        log "health check $attempt/$HEALTH_RETRIES: $url"

        if curl -sf --max-time 5 "$url" &>/dev/null; then
            log "health check passed"
            return 0
        fi

        log "health check failed (attempt $attempt)"
        ((attempt++))
        sleep "$HEALTH_DELAY"
    done

    die "health check failed after $HEALTH_RETRIES attempts"
}

# ── Rollback ──
rollback() {
    log "rolling back to previous release..."

    # Get the list of releases (sorted by name = by timestamp)
    local releases
    mapfile -t releases < <(ssh "$HOST" "ls -1 '$REMOTE_PATH/releases/' 2>/dev/null | sort -r" || true)

    if (( ${#releases[@]} < 2 )); then
        die "no previous release to rollback to (only ${#releases[@]} release(s))"
    fi

    local previous="${releases[1]}"  # second-newest
    log "rolling back to: $previous"

    run ssh "$HOST" "ln -sfn '$REMOTE_PATH/releases/$previous' '$REMOTE_PATH/current'"
    run ssh "$HOST" "sudo systemctl restart '$SERVICE'"

    log "rollback complete (now on $previous)"
}

# ── Cleanup old releases ──
cleanup_old_releases() {
    log "cleaning up old releases (keeping $RELEASES_TO_KEEP)..."

    local releases
    mapfile -t releases < <(ssh "$HOST" "ls -1 '$REMOTE_PATH/releases/' 2>/dev/null | sort -r" || true)

    if (( ${#releases[@]} > RELEASES_TO_KEEP )); then
        for old in "${releases[@]:RELEASES_TO_KEEP}"; do
            log "removing old release: $old"
            run ssh "$HOST" "rm -rf '$REMOTE_PATH/releases/$old'"
        done
    fi
}

# ── Main ──
main() {
    log "=== $SCRIPT_NAME v$VERSION → $ENV ==="

    pre_check

    if $ROLLBACK; then
        rollback
    else
        build_and_test
        deploy
        health_check
    fi

    log "=== deployment complete ==="
}

main "$@"
```
::

## Production Checklist

::code-wrapper{language="markdown"}
```markdown
- [ ] `#!/usr/bin/env bash` shebang (portable)
- [ ] `set -Eeuo pipefail` strict mode (-E for ERR trap inheritance)
- [ ] `trap cleanup EXIT` for temp file cleanup
- [ ] `trap err_handler ERR` for error logging
- [ ] All variables quoted: `"$var"`, `"${arr[@]}"`
- [ ] `local` for all function variables
- [ ] `readonly` for constants
- [ ] `main "$@"` entry point (functions defined before call)
- [ ] `usage` function and arg validation
- [ ] Errors to stderr (`>&2`), data to stdout
- [ ] Meaningful exit codes (0=success, 1=failure, 2=usage)
- [ ] `mktemp` for temp files (not predictable names)
- [ ] Idempotent operations (`mkdir -p`, `[[ -e ]] || create`)
- [ ] No `eval` on untrusted input
- [ ] `find -print0 | while IFS= read -r -d ''` for filenames
- [ ] ShellCheck clean (`shellcheck script.sh`)
- [ ] `bats` tests for logic functions
- [ ] `--dry-run` for dangerous operations
- [ ] Dependency checks (`command -v`)
- [ ] Graceful shutdown (`trap INT TERM`)
- [ ] Health checks with retries
- [ ] Atomic operations (temp file + `mv` for writes)
```
::

## 💡 Tips & Tricks

- **Debug**: run every script in this chapter through `shellcheck` before trusting it — Project 3's pre-commit hook exists precisely because ShellCheck catches unquoted expansions and word-splitting bugs that only surface on a machine with different `$IFS` or filenames containing spaces.
- **Idiom**: `run()` wrapper functions (seen in Projects 1 and 7) that gate every side-effecting command behind `$DRY_RUN` are the cheapest insurance you can add to a deploy/backup script — retrofit one into any existing script before it touches production data for the first time.
- **Performance**: Project 5's `((count % 4 == 0)) && wait` pattern throttles parallelism without a job-control library — for heavier fan-out, `xargs -P N` or GNU `parallel` do the same job with less bookkeeping and built-in output ordering.
- **Safety**: `trap cleanup EXIT` (Projects 1 and 4) fires on *any* exit path — normal, `die`, or a signal — so it's the one place to guarantee temp files are removed and child processes are reaped, instead of duplicating cleanup at every early return.
- **Debug**: when a supervised child (Project 4) misbehaves, `kill -0 "$pid"` is the idiomatic "is this PID still alive" check — it sends no signal, only tests permission and existence, and is far cheaper than parsing `ps` output.

## ⚠️ Edge Cases & Gotchas

- **`set -e` does not fire inside a conditional**: in Project 7's `build_and_test`, `run npm run build || die "build failed"` works because the failure is caught explicitly — but a bare failing command inside `if`, `while`, `&&`/`||`, or a pipeline (without `pipefail`) silently continues under `set -e`, which is why every project here pairs `set -e` with explicit `|| die` at the calls that matter most.
- **`mapfile -t releases < <(ssh ... || true)` can silently mask a real SSH failure**: Project 7's rollback trailing `|| true` exists to tolerate "no releases directory yet," but it equally swallows a genuine SSH connection failure — the subsequent `(( ${#releases[@]} < 2 ))` check catches the empty case either way, but the error message ("no previous release") would mislead you if the real cause was a dead host.
- **Backgrounded jobs in Project 5 inherit the parent's file descriptors**: `resize_one "$file" "$size" &` forked in a loop reading from `find ... -print0` means every background job also holds the same read end of that process substitution pipe open — usually harmless here, but it's the same mechanism that causes classic "background jobs reading stdin steal each other's input" bugs when the loop reads from stdin instead of a `-print0` fd.
- **`${releases[1]}` in Project 7 assumes `sort -r` gives lexicographic order matching chronological order**: this only holds because the release directory names are `YYYYMMDD_HHMMSS` timestamps — zero-padded, fixed-width, sortable as strings. Swap in an unpadded or non-ISO timestamp format and "previous release" silently picks the wrong one.

## 🧠 Quick Quiz

Project 1's cleanup trap is:

::code-wrapper{language="bash"}
```bash
tmpfile=""
cleanup() {
    local code=$?
    [[ -n "$tmpfile" && -f "$tmpfile" ]] && rm -f "$tmpfile"
    exit "$code"
}
trap cleanup EXIT
```
::

If the script's main body never assigns anything to `tmpfile`, and later fails with `die "backup verification failed"` (which calls `exit 1`), what does `cleanup` do, and what exit code does the script report?

<details>
<summary>Answer</summary>

`cleanup` runs (EXIT traps fire even when triggered by an explicit `exit`), reads `code=$?` — which captures `1` from `die`'s `exit 1`, since `$?` is evaluated as the very first statement inside `cleanup`, before anything else changes it — skips the `rm -f` because `tmpfile` is empty, and re-exits with `code`, i.e. `1`. The script correctly reports failure. The subtle part: if `local code=$?` weren't the *first* line of `cleanup`, any earlier command in the trap (even a no-op comparison) could overwrite `$?` before it's captured, and the script would exit `0` despite having failed — this is why every trap handler in this chapter captures `$?` immediately.

</details>
