---
title: "Bash 09 — Array Internals, Associative Maps & Data Structure Patterns"
description: "Deep-dive into Bash array mechanics: indexed vs associative arrays, @ vs * expansion semantics, mapfile/readarray internals, sparse arrays, slicing, and production patterns for key-value stores and CSV processing. Code-first reference for senior engineers."
---

# 09 — Array Internals, Associative Maps & Data Structure Patterns

## Indexed Arrays: Internal Representation

::code-wrapper{language="bash"}
```bash
# ── Indexed arrays store elements at integer indices (0-based, sparse) ──
fruits=("apple" "banana" "cherry")

# ── Access ──
echo "${fruits[0]}"           # apple — first element
echo "${fruits[1]}"           # banana — second element
echo "${fruits[-1]}"          # cherry — last element (Bash 4.3+)
echo "${fruits[@]}"           # apple banana cherry — ALL elements, separate words
echo "${fruits[*]}"           # apple banana cherry — ALL elements, ONE string (IFS-joined)
echo "${#fruits[@]}"          # 3 — count of elements
echo "${#fruits[0]}"          # 5 — length of first element ("apple")

# ── Modify ──
fruits[1]="blueberry"        # replace element at index 1
fruits[10]="date"            # sparse array! indices 4-9 are empty (unset)
echo "${#fruits[@]}"          # 4 — count doesn't include gaps
echo "${!fruits[@]}"          # 0 1 2 10 — INDICES (not values)

# ── Append ──
fruits+=("elderberry")       # append at next available index (11, not 3 — sparse)
fruits+=("fig" "grape")      # append multiple

# ── Delete ──
unset 'fruits[0]'            # remove element at index 0 (leaves a gap)
echo "${fruits[@]}"          # blueberry cherry date elderberry fig grape
echo "${#fruits[@]}"          # 6 — count excludes the gap
echo "${!fruits[@]}"          # 1 2 10 11 12 13 — indices have gaps!
unset 'fruits[*]'            # remove ALL elements (or: fruits=())
```
::

## `[@]` vs `[*]`: The Definitive Semantics

::code-wrapper{language="bash"}
```bash
# ── "${arr[@]}" — each element is a separate, quoted word ──
# ── "${arr[*]}" — all elements joined by IFS into ONE string ──

arr=("a" "b c" "d")   # note: "b c" is one element with a space

# ── Quoted @ (the ONLY correct way for iteration) ──
for x in "${arr[@]}"; do echo "[$x]"; done
# [a]
# [b c]    ← preserved as one word
# [d]

# ── Quoted * (joins into one string) ──
for x in "${arr[*]}"; do echo "[$x]"; done
# [a b c d]  ← ONE iteration with all joined by IFS (space)

# ── Unquoted @ (word-splits each element on IFS) ──
for x in ${arr[@]}; do echo "[$x]"; done
# [a]
# [b]       ← "b c" was split!
# [c]
# [d]

# ── Unquoted * (same as unquoted @ — word-splits everything) ──
for x in ${arr[*]}; do echo "[$x]"; done
# [a] [b] [c] [d]  ← same as unquoted @

# ── Changing IFS affects [*] but NOT [@] ──
save=$IFS
IFS=':'
echo "${arr[*]}"    # a:b c:d — joined by IFS (colon)
echo "${arr[@]}"    # a b c d — unaffected by IFS
IFS=$save

# ── Counting args with @ vs * ──
count_args() { echo "$#"; }
count_args "${arr[@]}"   # 3 — three separate args
count_args "${arr[*]}"   # 1 — one joined string
```
::

## Anti-Pattern: Iterating Without Quotes

::code-wrapper{language="bash"}
```bash
# ❌ NAIVE — unquoted array iteration
files=("my file.txt" "other file.txt" "third.txt")
for file in $files; do       # $files (no [@]) expands to first element only!
    echo "$file"
done
# Only "my file.txt" (first element) is used, and it word-splits:
# [my]
# [file.txt]

# ❌ ALSO WRONG — unquoted [@]
for file in ${files[@]}; do  # word-splits each element on spaces!
    echo "$file"
done
# [my] [file.txt] [other] [file.txt] [third.txt]

# ✅ CORRECT — quoted [@]
for file in "${files[@]}"; do  # each element preserved as a separate word
    echo "$file"
done
# [my file.txt]
# [other file.txt]
# [third.txt]

# ── Why $files (without [@]) is wrong ──
# $files is shorthand for ${files[0]} — only the FIRST element.
# It's a legacy POSIX sh compatibility feature (POSIX has no arrays, so $arr is the first element).
# ALWAYS use "${arr[@]}" for all elements.
```
::

## Associative Arrays (Bash 4+)

::code-wrapper{language="bash"}
```bash
# ── declare -A: key-value map (Bash 4+, NOT available on macOS 3.2) ──
declare -A config

# ── Assignment ──
config[host]="localhost"
config[port]="8080"
config[debug]=true
config["log_level"]="info"   # quotes around key are optional (for non-special keys)

# ── Access ──
echo "${config[host]}"        # localhost
echo "${config[port]}"        # 8080
echo "${config[nonexistent]}"  # (empty — not an error with set -u if you use :-)

# ── Keys and values ──
echo "${!config[@]}"          # host port debug log_level — KEYS (order is undefined!)
echo "${config[@]}"           # localhost 8080 true info — VALUES
echo "${#config[@]}"          # 4 — count

# ── Iterate (order is NOT guaranteed — hash map) ──
for key in "${!config[@]}"; do
    echo "$key = ${config[$key]}"
done

# ── Check if key exists (Bash 4.2+) ──
if [[ -v config[host] ]]; then   # true if key exists (even if value is empty)
    echo "host is set"
fi
# ⚠️ [[ -n "${config[host]}" ]] is false if value is "" — use -v for key existence

# ── Delete a key ──
unset 'config[debug]'   # quotes prevent glob expansion of the key
echo "${#config[@]}"    # 3

# ── Delete all ──
config=()   # or: unset config (but this unsets the variable, not just clears it)
```
::

## Production Pattern: Config Loader with Defaults

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
declare -A config

load_config() {
    local config_file="$1"
    [[ -f "$config_file" ]] || die "config not found: $config_file"

    while IFS='=' read -r key value; do
        # Skip comments and blank lines
        [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue

        # Strip whitespace around key and value
        key="${key// /}"
        value="${value# }"   # strip leading space
        value="${value% }"   # strip trailing space

        config["$key"]="$value"
    done < "$config_file"
}

# ── Config file (config.env) ──
# host=localhost
# port=8080
# debug=true

load_config config.env

# ── Access with defaults ──
host="${config[host]:-localhost}"
port="${config[port]:-8080}"
debug="${config[debug]:-false}"

echo "host=$host port=$port debug=$debug"
```
::

## `mapfile` / `readarray`: Bulk Read Into Arrays

::code-wrapper{language="bash"}
```bash
# ── mapfile (Bash 4+) reads lines from stdin into an array ──
# readarray is an alias for mapfile

mapfile -t lines < /etc/passwd
echo "${#lines[@]}"      # number of lines
echo "${lines[0]}"       # first line
echo "${lines[-1]}"      # last line

# ── -t: strip trailing newline (almost always want this) ──
mapfile -t lines < file.txt   # without -t, each element includes \n

# ── From a command (process substitution — no subshell trap) ──
mapfile -t py_files < <(find . -name "*.py" -print0 | xargs -0 -n1 echo)
# Wait, this is wrong — -print0 is null-delimited, but mapfile is newline-delimited.
# Correct:
mapfile -t py_files < <(find . -name "*.py")
for f in "${py_files[@]}"; do
    echo "found: $f"
done
# ⚠️ This breaks on filenames with newlines. For safety, use -d '' with mapfile:

mapfile -d '' -t py_files < <(find . -name "*.py" -print0)
# -d '' sets the delimiter to null byte (matches -print0)
# This is the ONLY safe way to read filenames into an array.

# ── Skip lines: -s N (skip first N lines) ──
mapfile -t -s 1 lines < file.txt   # skip header (first line)

# ── Limit: -n N (read at most N lines) ──
mapfile -t -n 100 lines < huge_file.txt   # read only first 100 lines

# ── Read into a specific array name ──
mapfile -t data < input.csv
# or: readarray -t data < input.csv
```
::

## String ↔ Array Conversion

::code-wrapper{language="bash"}
```bash
# ── String → array: split on delimiter ──
str="apple,banana,cherry"

# Method 1: IFS + read -ra (preferred — no subprocess)
IFS=',' read -ra fruits <<< "$str"
echo "${fruits[0]}"   # apple
echo "${fruits[@]}"   # apple banana cherry

# Method 2: Parameter expansion + array (for simple cases)
# (No direct split, but you can use () with a pre-split string)

# ── ⚠️ IFS=',' read changes IFS ONLY for that read command ──
# The global IFS is NOT affected (the IFS=, is a per-command prefix)
echo "$IFS"   # still " \t\n" (default) — not changed

# ── Split on multiple delimiters ──
str="a,b;c:d"
IFS=',;:' read -ra parts <<< "$str"
echo "${parts[@]}"   # a b c d — split on any of , ; :

# ── Array → string: join ──
arr=("apple" "banana" "cherry")

# Method 1: default IFS join (space)
joined="${arr[*]}"
echo "$joined"   # apple banana cherry

# Method 2: custom delimiter (temporary IFS change)
join_by() {
    local delim=$1; shift
    local first=$1; shift
    local result=$first
    local item
    for item in "$@"; do
        result+="$delim$item"
    done
    printf '%s' "$result"
}
join_by ", " "${arr[@]}"   # apple, banana, cherry

# Method 3: IFS trick (one-liner, but affects global IFS temporarily)
save=$IFS
IFS=', '
joined="${arr[*]}"
IFS=$save
echo "$joined"   # apple, banana, cherry (IFS=',' joins with comma)
```
::

## Slicing and Splicing

::code-wrapper{language="bash"}
```bash
arr=(0 1 2 3 4 5 6 7 8 9)

# ── Slice: ${arr[@]:start:length} ──
echo "${arr[@]:2:3}"    # 2 3 4 — from index 2, 3 elements
echo "${arr[@]:5}"      # 5 6 7 8 9 — from index 5 to end
echo "${arr[@]: -3}"    # 7 8 9 — last 3 (SPACE before - is required!)
echo "${arr[@]:0-3}"    # 7 8 9 — alternative: 0-3 (no space needed)

# ── Slice to a new array ──
subset=("${arr[@]:2:3}")  # subset = (2 3 4)
echo "${subset[@]}"       # 2 3 4

# ── ⚠️ ${arr[@]: -3} vs ${arr[@]:-3} ──
# ${arr[@]:-3}  → default expansion: if arr is empty, use "3" (the :- operator)
# ${arr[@]: -3} → slice: last 3 elements (space before - makes it arithmetic)
# Always use the space or 0-3 to avoid ambiguity.

# ── Reindex after unset (remove gaps) ──
sparse=([0]="a" [5]="b" [10]="c")
unset 'sparse[5]'     # remove element at index 5
echo "${!sparse[@]}"  # 0 10 — indices have a gap
sparse=("${sparse[@]}")  # reindex: contiguous 0 1
echo "${!sparse[@]}"  # 0 1 — reindexed
echo "${sparse[0]}"   # a
echo "${sparse[1]}"   # c
```
::

## Production Pattern: CSV Processor

::code-wrapper{language="bash"}
```bash
#!/usr/bin/env bash
# ── Parse a CSV into an array of associative arrays (row → column → value) ──

process_csv() {
    local csv_file=$1
    local -a headers=()
    local -A row
    local line_num=0

    while IFS=, read -r line || [[ -n "$line" ]]; do
        # Handle quoted CSV fields (basic — doesn't handle embedded commas in quotes)
        # For proper CSV parsing, use csvkit or mlr

        if ((line_num == 0)); then
            # First line is the header
            IFS=',' read -ra headers <<< "$line"
            ((line_num++))
            continue
        fi

        # Split the data line
        IFS=',' read -ra values <<< "$line"

        # Build associative array: header → value
        row=()
        for i in "${!headers[@]}"; do
            row["${headers[i]}"]="${values[i]:-}"
        done

        # Process the row
        printf '%s: %s\n' "${headers[0]}" "${row[${headers[0]}]}"

        ((line_num++))
    done < "$csv_file"
}

# CSV file:
# name,age,city
# Alice,30,NYC
# Bob,25,LA

process_csv data.csv
# name: Alice
# name: Bob
```
::

## 💡 Tips & Tricks

::code-wrapper{language="bash"}
```bash
# ── Simulate a stack with array ──
stack=()
push() { stack+=("$1"); }      # append to end
pop() {
    local -n _s=$1
    local last=${_s[-1]}
    unset '_s[-1]'
    _s=("${_s[@]}")             # reindex (remove gap)
    echo "$last"
}
push "first"
push "second"
pop stack   # second
pop stack   # first

# ── Simulate a queue ──
queue=()
enqueue() { queue+=("$1"); }   # append to end
dequeue() {
    local first=${queue[0]}
    unset 'queue[0]'
    queue=("${queue[@]}")       # reindex
    echo "$first"
}

# ── Flatten a nested array (Bash has no real nesting) ──
# Use a naming convention: arr_0, arr_1, etc.
# Or store as strings with a delimiter:
declare -A matrix
matrix["0_0"]="a"   matrix["0_1"]="b"
matrix["1_0"]="c"   matrix["1_1"]="d"
# Access: echo "${matrix["${row}_${col}"]}"

# ── Array of arrays via namerefs ──
declare -A arrays
arr1=(1 2 3)
arr2=(4 5 6)
arrays["set1"]=arr1   # store the NAME, not the array (can't store arrays in arrays)
arrays["set2"]=arr2

get_array() {
    local -n _result=$1
    local name=${arrays[$2]}   # get the array name
    local -n _src=$name         # nameref to the source array
    _result=("${_src[@]}")      # copy into caller's array
}
get_array my_arr "set1"
echo "${my_arr[@]}"   # 1 2 3

# ── Dedup an array (preserve order) ──
dedup_array() {
    local -n _arr=$1
    local -A seen=()
    local -A result=()
    local item
    for item in "${_arr[@]}"; do
        [[ -v seen[$item] ]] && continue
        seen[$item]=1
        result+=("$item")
    done
    _arr=("${result[@]}")
}
arr=(a b a c b d)
dedup_array arr
echo "${arr[@]}"   # a b c d
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="bash"}
```bash
# ── `unset 'arr[i]'` leaves a gap ──
arr=(a b c d)
unset 'arr[1]'       # remove "b"
echo "${arr[@]}"     # a c d — value gone
echo "${!arr[@]}"    # 0 2 3 — index 1 is a GAP
echo "${#arr[@]}"    # 3 — count excludes gap
# Reindex: arr=("${arr[@]}")  → indices 0 1 2

# ── `"${arr[@]: -1}"` needs a space (Bash < 4.3) ──
echo "${arr[@]: -1}"  # last element (space before -)
echo "${arr[@]:0-1}"  # also last element (0-1 is arithmetic)
echo "${arr[-1]}"     # last element (Bash 4.3+ — no [@] needed)

# ── Associative arrays are UNORDERED ──
declare -A m=([z]=1 [a]=2 [m]=3)
echo "${!m[@]}"       # z a m OR a z m OR ... — order is hash-dependent, NOT insertion order
# If you need ordered keys, maintain a separate indexed array of keys:
keys=("z" "a" "m")   # explicit order
for k in "${keys[@]}"; do echo "$k = ${m[$k]}"; done

# ── `arr+="x"` appends to arr[0], NOT as a new element ──
arr=("a" "b")
arr+="c"             # ❌ arr is now ("ac" "b") — string append to first element!
arr+=("c")           # ✅ arr is now ("a" "b" "c") — array append (parentheses required)

# ── `read -a` in a pipeline runs in a subshell ──
echo "a b c" | read -a arr   # arr is set in the SUBSHELL — lost after!
echo "${arr[@]}"             # empty — subshell didn't leak
# Fix: read -a arr <<< "a b c"  (here-string — no subshell)

# ── `local -n arr=$1` circular reference ──
func() { local -n arr=$1; echo "${arr[@]}"; }
arr=(1 2 3)
func arr   # ✗ circular name reference (arr references itself)
# Fix: func() { local -n _ref=$1; echo "${_ref[@]}"; }

# ── Empty array with `set -u` (Bash < 4.4) ──
set -u
arr=()
echo "${arr[@]}"   # Bash 4.4+: OK (empty). Bash < 4.4: unbound variable error!
# Fix: echo "${arr[@]:-}"
```
::

## 🧠 Quick Quiz

What does this print?

::code-wrapper{language="bash"}
```bash
arr=("a" "b" "c")
arr[10]="d"
echo "count: ${#arr[@]}"
echo "indices: ${!arr[@]}"
echo "values: ${arr[@]}"
```
::

<details>
<summary>Answer</summary>

```
count: 4
indices: 0 1 2 10
values: a b c d
```

Bash arrays are **sparse** — you can assign to any index, and gaps don't count toward `${#arr[@]}`. The count is the number of **set** elements, not the highest index + 1.

`${!arr[@]}` shows the actual indices (0, 1, 2, 10) — there's a gap from 3 to 9.

**The lesson**: Bash arrays are sparse hash maps (even indexed arrays). `${#arr[@]}` counts elements, not indices. Use `${!arr[@]}` to see the actual indices if you need contiguous access.

</details>