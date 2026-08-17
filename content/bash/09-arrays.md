# 09 — Arrays & Data Structures

Bash has indexed arrays (all versions) and associative arrays (Bash 4+). Mastering them avoids the word-splitting pitfalls of space-delimited strings.

## Indexed Arrays

::code-wrapper{language="bash"}
```bash
fruits=("apple" "banana" "cherry")
echo "${fruits[0]}"      # apple
echo "${fruits[1]}"      # banana
echo "${fruits[@]}"      # apple banana cherry (all elements)
echo "${fruits[*]}"      # apple banana cherry (single string, IFS-joined)
echo "${#fruits[@]}"     # 3 (count)
echo "${#fruits[0]}"     # 5 (length of first element)

fruits[3]="date"
fruits+=("elderberry")   # append
echo "${fruits[@]}"      # apple banana cherry date elderberry

unset 'fruits[1]'        # remove element at index 1 (leaves a gap)
echo "${fruits[@]}"      # apple cherry date elderberry
echo "${#fruits[@]}"     # 4 (count excludes the gap)

fruits=()                # empty array
echo "${#fruits[@]}"     # 0
```
::
### Iterating

::code-wrapper{language="bash"}
```bash
for fruit in "${fruits[@]}"; do
	echo "$fruit"
done

# With indices
for i in "${!fruits[@]}"; do
	echo "$i: ${fruits[$i]}"
done
```
::
**Always quote `"${arr[@]}"`** — it preserves each element as a separate item (even with spaces). `${arr[@]}` (unquoted) word-splits. `"${arr[*]}"` joins into one string.

## Associative Arrays (Bash 4+)

::code-wrapper{language="bash"}
```bash
declare -A ages
ages["Alice"]=30
ages["Bob"]=25
ages["Charlie"]=35

echo "${ages[Alice]}"        # 30
echo "${ages[Bob]}"          # 25
echo "${#ages[@]}"           # 3 (count)

# Keys and values
echo "${!ages[@]}"           # Alice Bob Charlie (keys)
echo "${ages[@]}"            # 30 25 35 (values)

# Iterate
for name in "${!ages[@]}"; do
	echo "$name is ${ages[$name]}"
done

# Check if key exists
if [[ -v ages[Alice] ]]; then
	echo "Alice exists"
fi

# Delete
unset 'ages[Bob]'
```
::
### Associative array of arrays (workaround)

Bash doesn't support nested arrays. Use a naming convention:

::code-wrapper{language="bash"}
```bash
declare -A users
users["alice"]="Alice:30:admin"
users["bob"]="Bob:25:user"

for username in "${!users[@]}"; do
	IFS=':' read -r name age role <<< "${users[$username]}"
	echo "$name, $age, $role"
done
```
::
## `read -a` (read into an array)

::code-wrapper{language="bash"}
```bash
echo "apple banana cherry" | read -a fruits
echo "${fruits[0]}"   # apple
echo "${fruits[@]}"   # apple banana cherry

# From a string
read -a nums <<< "1 2 3 4 5"
echo "${nums[@]}"     # 1 2 3 4 5

# With a delimiter
IFS=',' read -a items <<< "a,b,c"
echo "${items[@]}"    # a b c
```
::
## `mapfile` / `readarray` (read lines into an array)

::code-wrapper{language="bash"}
```bash
mapfile -t lines < file.txt
echo "${#lines[@]}"     # line count
echo "${lines[0]}"      # first line

# From a command
mapfile -t files < <(find . -name "*.py")
for file in "${files[@]}"; do
	echo "$file"
done
```
::
`mapfile -t` reads lines into an array (stripping the trailing newline). `-t` is important (without it, lines include the newline). Bash 4+.

## Converting Between Strings and Arrays

::code-wrapper{language="bash"}
```bash
# String → array (split on delimiter)
str="apple,banana,cherry"
IFS=',' read -ra fruits <<< "$str"
echo "${fruits[@]}"   # apple banana cherry

# Array → string (join)
fruits=("apple" "banana" "cherry")
str="${fruits[*]}"    # "apple banana cherry" (IFS-joined)
str=$(IFS=','; echo "${fruits[*]}")   # "apple,banana,cherry" (custom IFS)
```
::
## Slicing Arrays

::code-wrapper{language="bash"}
```bash
arr=(1 2 3 4 5)
echo "${arr[@]:1:2}"    # 2 3 (from index 1, 2 elements)
echo "${arr[@]:2}"      # 3 4 5 (from index 2 to end)
echo "${arr[@]: -2}"    # 4 5 (last 2 — note the space before -)
```
::
## 💡 Tips & Tricks

- **Idiom**: use `"${arr[@]}"` (quoted) to expand/iterate array elements — it preserves each element as a separate item, even with spaces. `"${arr[*]}"` joins into one string; unquoted `${arr[@]}` word-splits. Always quote `[@]`.
- **Idiom**: use `mapfile -t lines < file` (Bash 4+) to read a file into an array — each line is an element, `-t` strips the newline. Cleaner than `while read` for loading all lines. Use `while read` for streaming (large files).
- **Idiom**: use `declare -A` (Bash 4+) for key-value data — `declare -A ages; ages[Alice]=30`. `${!arr[@]}` gets keys, `${arr[@]}` gets values, `[[ -v arr[key] ]]` checks existence. Avoids parallel indexed arrays.
- **Idiom**: use `IFS=',' read -ra arr <<< "$str"` to split a string into an array — `IFS=','` sets the delimiter, `-a` reads into an array, `<<<` provides the string. Cleaner than `tr ... read`.
- **Idiom**: use `unset 'arr[i]'` (quoted) to remove an element — the quotes prevent globbing if the index is a pattern. Note: this leaves a gap (the array isn't reindexed). Use `arr=("${arr[@]}")` to reindex if needed.

## ⚠️ Edge Cases & Gotchas

- **`"${arr[@]}"` vs `"${arr[*]}"`**: `[@]` (quoted) preserves each element as a separate arg (use for iteration/passing); `[*]` (quoted) joins into one string (IFS-joined). Without quotes, both word-split. Always use `"${arr[@]}"`.
- **`unset 'arr[i]'` leaves a gap**: the array isn't reindexed. `${#arr[@]}` (count) excludes the gap, but indices aren't contiguous. Reindex: `arr=("${arr[@]}")`.
- **`"${arr[@]: -1}"` (last element)**: note the space before `-1` (Bash parses `${arr[@]:-1}` as a default expansion). Or use `${arr[-1]}` (Bash 4.3+).
- **Associative arrays need Bash 4+**: `declare -A` doesn't work in Bash 3.2 (macOS default). Install Bash 5 (`brew install bash`) or use parallel indexed arrays.
- **`[[ -v arr[key] ]]` checks existence (Bash 4.2+)**: for associative arrays, `[[ -v ages[Alice] ]]` is true if the key exists (even if the value is empty). `[[ -n "${ages[Alice]}" ]]` is false for an empty value.
- **Arrays aren't nested**: Bash has no 2D arrays. Use a naming convention (`arr_0`, `arr_1`) or string encoding (`"a:b:c"`). Or use a real language for complex data.
- **`mapfile -t` strips newlines**: `-t` removes the trailing newline from each line. Without `-t`, lines include the newline (usually not wanted).
- **`read -a` in a pipeline runs in a subshell**: `echo "a b c" | read -a arr` — `arr` is set in the subshell, lost after. Use `read -a arr <<< "a b c"` (here-string) or `echo "a b c" | { read -a arr; echo "${arr[@]}"; }`.
- **`arr+=("x")` appends; `arr+="x"` doesn't do what you think**: `arr+=("x")` appends an element; `arr+="x"` (string +=) appends to the first element (Bash quirk). Use `+=("x")` for appending.
- **Quoting `unset 'arr[i]'`**: the quotes prevent globbing if `i` is a pattern like `*`. `unset arr[*]` might glob-expand. Always quote: `unset 'arr[i]'`.

## 🧠 Spot the Bug

A developer iterates an array of filenames, but files with spaces are split:

::code-wrapper{language="bash"}
```bash
files=("my file.txt" "other file.txt" "third.txt")
for file in $files; do
	echo "Processing $file"
done
```
::

What's wrong?

<details>
<summary>Answer</summary>

`for file in $files` (unquoted `$files`) expands to only the *first* element (`my file.txt`), and then word-splits it on spaces — so the loop iterates `my`, `file.txt` (two iterations, each a word). The other array elements are ignored (unquoted `$files` is the first element only, word-split).

The fix — use `"${files[@]}"` (quoted):

```bash
files=("my file.txt" "other file.txt" "third.txt")
for file in "${files[@]}"; do
	echo "Processing $file"
done
```
::
`"${files[@]}"` expands to all elements, each as a separate item (preserving spaces). The loop iterates `my file.txt`, `other file.txt`, `third.txt` (three iterations, each a full filename).

**The lesson**: `for x in $arr` (unquoted) is wrong — it expands only the first element and word-splits it. Always use `for x in "${arr[@]}"` (quoted `[@]`) to iterate all elements, each preserved as a separate item (even with spaces).

</details>

## Summary

You can use indexed arrays (create, access, append, unset, iterate with `"${arr[@]}"`, slice `${arr[@]:1:2}`), associative arrays (`declare -A`, keys `${!arr[@]}`, `[[ -v arr[key] ]]`), `read -a` (split into array), `mapfile -t` (read file into array), and convert between strings and arrays (`IFS=',' read -ra arr <<< "$str"`) — with the always-quote-`[@]` and `unset`-leaves-gap traps internalized. Next: string manipulation.