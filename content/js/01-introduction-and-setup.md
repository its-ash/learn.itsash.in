# 01 — Introduction & Setup

## What Is JavaScript?

JavaScript is a **high-level, dynamically typed, multi-paradigm** language. It runs in browsers, servers (Node.js), and embedded devices. Key characteristics:

- **Dynamic typing** — variables can hold any type, types checked at runtime.
- **Single-threaded** with an event loop — handles async via callbacks, promises, and microtask queues.
- **Multi-paradigm** — supports OOP (classes, prototypes), FP (first-class functions, closures), and procedural styles.
- **Prototypal inheritance** — objects inherit from objects (no classes in the classical sense; ES6 `class` is syntactic sugar over prototypes).
- **First-class functions** — functions are values; can be passed, returned, stored.
- **Ubiquitous** — runs everywhere there's a JS engine (V8, SpiderMonkey, JavaScriptCore).

## A Brief History

| Year | Event |
|---|---|
| 1995 | Brendan Eich creates "Mocha" in 10 days at Netscape. |
| 1996 | Renamed to JavaScript (marketing tie to Java). |
| 1997 | Standardized as ECMAScript (ES1). |
| 2009 | ES5 — strict mode, `JSON`, `Object.create`, getters/setters. |
| 2015 | ES6/ES2015 — `let`/`const`, arrows, classes, modules, promises, destructuring, template literals. |
| 2016– | Annual releases (ES2016+): `async`/`await`, optional chaining, nullish coalescing, `BigInt`. |

## The JavaScript Runtime

### Browser

The browser provides:
- **JS engine** (V8 in Chrome, SpiderMonkey in Firefox, JavaScriptCore in Safari)
- **DOM API** — document object model
- **BOM API** — `window`, `navigator`, `location`, `history`
- **Web APIs** — `fetch`, `localStorage`, `IndexedDB`, `setTimeout`, `canvas`, `WebSocket`

### Node.js

Node.js provides:
- **V8 engine** (same as Chrome)
- **`fs`** — file system
- **`http`/`https`** — networking
- **`path`**, **`os`**, **`crypto`**, **`stream`**, **`child_process`**
- **No DOM/BOM** — `window` and `document` don't exist.

::code-wrapper{language="bash"}
```bash
# Check if Node.js is installed
node --version    # v22.x.x (LTS recommended)
npm --version     # 10.x.x

# Run a JavaScript file
node script.js

# Start a REPL (interactive shell)
node
> 2 + 2
4
> .exit
```
::

## Installing Node.js

### Using nvm (recommended — manages multiple versions)

::code-wrapper{language="bash"}
```bash
# macOS / Linux
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
nvm install --lts
nvm use --lts

# Windows: use fnm or nvm-windows
winget install Schniz.fnm
fnm install --lts
```
::

### Verify

::code-wrapper{language="bash"}
```bash
node --version
npm --version
npx --version
```
::

### Edge case: permission errors with npm global installs

If `npm install -g <pkg>` fails with `EACCES`:

::code-wrapper{language="bash"}
```bash
# Option 1: change npm's default directory
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.zshrc
source ~/.zshrc

# Option 2: use npx (no global install needed)
npx cowsay "hello"
```
::

## Hello World

### In the browser

::code-wrapper{language="html"}
```html
<!DOCTYPE html>
<html>
  <body>
    <script>
      console.log('Hello, World!')
    </script>
  </body>
</html>
```
::

### In Node.js

::code-wrapper{language="javascript"}
```javascript
console.log('Hello, World!')
```
::

::code-wrapper{language="bash"}
```bash
node hello.js
# Hello, World!
```
::

## Browser DevTools

Open with `Cmd+Opt+I` (Mac) or `Ctrl+Shift+I` (Windows/Linux).

| Tab | Purpose |
|---|---|
| Console | Evaluate JS, see logs and errors. |
| Sources | Set breakpoints, step through code. |
| Network | Inspect HTTP requests/responses. |
| Elements | Inspect and edit DOM/CSS live. |
| Application | View `localStorage`, `sessionStorage`, cookies, IndexedDB. |
| Memory | Take heap snapshots, find leaks. |
| Performance | Record CPU profiles, identify bottlenecks. |

### Best practice: use `console` methods purposefully

::code-wrapper{language="javascript"}
```javascript
// Good — descriptive levels
console.log('User logged in:', user)
console.warn('Deprecated API called: getComputedStyle')
console.error('Failed to fetch:', error)
console.table([{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }])
console.group('API Calls')
console.log('GET /users')
console.log('POST /login')
console.groupEnd()
```
::

## REPL and Interactive Debugging

::code-wrapper{language="javascript"}
```javascript
// Node.js REPL — experiment interactively
// $ node
> const arr = [1, 2, 3]
> arr.map(x => x * 2)
[ 2, 4, 6 ]

// debugger statement — pauses execution in dev tools or Node inspector
function calculateTotal(items) {
  debugger  // execution pauses here when DevTools open
  return items.reduce((sum, i) => sum + i.price, 0)
}
```
::

## Strict Mode

Always use strict mode. ES modules are strict by default.

::code-wrapper{language="javascript"}
```javascript
// Non-strict — silent failures, accidental globals
function bad() {
  undeclaredVar = 42  // creates global variable!
}
bad()
console.log(undeclaredVar) // 42

// Strict mode — catches mistakes
'use strict'
function good() {
  undeclaredVar = 42  // ReferenceError: undeclaredVar is not defined
}
```
::

## Project Structure

::code-wrapper{language="bash"}
```bash
my-project/
├── package.json        # metadata, scripts, dependencies
├── package-lock.json   # exact dependency versions
├── src/
│   ├── index.js        # entry point
│   └── utils.js        # helper functions
├── public/             # static assets (browser projects)
├── test/               # test files
└── README.md
```
::

### Initialize a project

::code-wrapper{language="bash"}
```bash
mkdir my-project && cd my-project
npm init -y             # creates package.json with defaults
npm init                # interactive — answer questions

# Install a dependency
npm install lodash

# Install a dev dependency
npm install --save-dev vitest
```
::

## package.json basics

::code-wrapper{language="json"}
```json
{
  "name": "my-project",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js",
    "test": "vitest"
  },
  "dependencies": {
    "lodash": "^4.17.21"
  },
  "devDependencies": {
    "vitest": "^2.0.0"
  }
}
```
::

::code-wrapper{language="bash"}
```bash
npm run start           # runs: node src/index.js
npm run dev             # runs: node --watch src/index.js
npm test                # runs: vitest
```
::

## 💡 Tips & Tricks

**`node --watch` for instant reload** — Skip nodemon for simple projects: `node --watch src/index.js` restarts on file save, built into Node 18.11+.

**Use the REPL as a scratchpad** — Type `.editor` inside `node` REPL to enter multi-line paste mode, then `Ctrl+D` to run — great for testing snippets without creating a file.

**`npx` runs without polluting global installs** — `npx cowsay hi` downloads, runs, and discards — no `npm install -g` needed, no version conflicts across projects.

**Console object shortcuts** — `console.table()` renders arrays of objects as a readable grid; `console.time('label')` / `console.timeEnd('label')` measures elapsed time without manual `Date.now()` math.

**Check installed Node version per-project** — An `.nvmrc` file with just a version string (e.g. `22`) lets teammates run `nvm use` and get the exact same runtime.

## ⚠️ Edge Cases & Gotchas

**Non-strict mode silently creates globals** — Assigning to an undeclared variable inside a function (`undeclaredVar = 42`) creates a global instead of throwing, unless `'use strict'` is active. ES modules are strict automatically; plain `<script>` tags and CommonJS files are not.

**`"type": "module"` changes `require`/`__dirname` availability** — Once `package.json` has `"type": "module"`, `.js` files become ES modules — `require()`, `module.exports`, and `__dirname` stop working and throw `ReferenceError`.

**`npm install -g` permission errors are platform-specific** — On macOS/Linux, global installs often fail with `EACCES` because the default prefix is owned by root; on Windows this rarely happens. Fixing npm's prefix (or using `npx`) avoids `sudo npm install -g`, which creates further permission tangles.

**`node --version` inside nvm shells vs system shells** — If a new terminal tab opens before nvm's shell init runs, `node --version` may report the system-installed Node (or "command not found") instead of the nvm-selected version — a common "it works in my other tab" confusion.

**HTML `<script>` order matters for `document` access** — A `<script>` in `<head>` that queries `document.querySelector(...)` before the body has parsed gets `null`, not an error — the classic beginner bug fixed by moving the script to the end of `<body>` or using `defer`.

## 🧠 Spot the Bug

What does this log, and why?

::code-wrapper{language="javascript"}
```javascript
function setName() {
  userName = 'Alice'
}
setName()
console.log(userName)

function setNameStrict() {
  'use strict'
  userNameStrict = 'Bob'
}
setNameStrict()
```
::

<details>
<summary>Answer</summary>

The first block logs `Alice` — assigning to `userName` without `let`/`const`/`var` silently creates a global property on `globalThis`. The second block throws `ReferenceError: userNameStrict is not defined` because `'use strict'` disables implicit global creation.

**The lesson**: always run in strict mode (or use ES modules, which are strict by default) so typos in variable names fail loudly instead of leaking into global state.

</details>

## Key Takeaways

- JavaScript runs in browsers (with DOM) and Node.js (with `fs`/`http`).
- Use `nvm` to manage Node.js versions.
- Always use `'use strict'` (automatic in ES modules).
- `package.json` is the heart of a JS project — scripts, dependencies, metadata.
- Browser DevTools are your primary debugging tool.