# 27 — Tooling & Build Systems

## npm / pnpm

::code-wrapper{language="bash"}
```bash
npm install              # install dependencies
npm install pkg          # add dependency
npm install -D pkg       # add dev dependency
npm install -g pkg       # global install
npm uninstall pkg        # remove
npm update               # update all
npm audit                # check for vulnerabilities
npm run script-name      # run package.json script
npx pkg                  # run without installing
```
::
::

## ESLint & Prettier

::code-wrapper{language="json" filename=".eslintrc.json"}
```json
{
  "extends": ["eslint:recommended"],
  "env": { "browser": true, "es2024": true, "node": true },
  "rules": {
    "no-unused-vars": "warn",
    "no-console": "off",
    "eqeqeq": "error"
  }
}
```
::
::

::code-wrapper{language="json" filename=".prettierrc"}
```json
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 80
}
```
::
::

## Vite

::code-wrapper{language="bash"}
```bash
npm create vite@latest my-app -- --template vanilla
cd my-app && npm install && npm run dev
```
::
::

## 💡 Tips & Tricks

**`npm ci` for reproducible installs in CI** — Unlike `npm install`, `npm ci` deletes `node_modules` first and installs strictly from `package-lock.json`, failing if the lockfile and `package.json` are out of sync — catches "works on my machine" dependency drift before it ships.

**`npx` can run a specific version** — `npx create-vite@5.0.0` pins the exact tool version for a one-off run without touching global state or your project's dependencies.

**ESLint auto-fix handles most formatting-adjacent issues** — `eslint . --fix` resolves many rule violations automatically (unused imports, quote style, spacing) — run it before Prettier in a pre-commit hook to reduce manual cleanup.

**`npm audit fix` vs manual review** — `npm audit fix` only applies non-breaking patch/minor updates automatically; `npm audit fix --force` can bump major versions and break your app — always review the diff before using `--force`.

**Vite's `import.meta.env` exposes build-time variables safely** — Variables prefixed with `VITE_` in a `.env` file are statically replaced at build time, keeping unprefixed secrets out of the client bundle by design.

## ⚠️ Edge Cases & Gotchas

**`npm install` can silently update `package-lock.json` in ways you didn't intend** — Running plain `npm install` after pulling a teammate's lockfile changes can resolve slightly different transitive dependency versions if your local npm version differs, causing lockfile churn in every PR — `npm ci` avoids this entirely for CI and clean installs.

**ESLint and Prettier can fight each other on formatting rules** — If ESLint's `indent` or `quotes` rules are enabled alongside Prettier, the two tools can flip-flop the same line back and forth on save — always disable ESLint's stylistic rules (via `eslint-config-prettier`) and let Prettier own formatting exclusively.

**Global vs local installs of the same package silently diverge** — Running a globally installed CLI tool (`eslint` from `npm i -g eslint`) instead of the project's local version (`npx eslint` or the `node_modules/.bin` copy) can lint with a completely different ruleset/version than what's declared in `package.json` — teammates and CI then disagree on what "passes."

**Semver caret (`^`) ranges allow unexpected minor bumps** — `"lodash": "^4.17.21"` permits any `4.x.x` update on a fresh install without a lockfile, meaning "works today" can silently break tomorrow if a minor release introduces a bug — lockfiles exist precisely to pin this down for reproducible builds.

**Vite dev server behavior differs from the production build** — Code that works in `vite dev` (unbundled ESM, no tree-shaking, dev-only polyfills) can behave differently after `vite build` — always test against the built output (`vite preview`) before shipping, not just the dev server.

## 🧠 Spot the Bug

A teammate says "it works on my machine" but CI fails on `npm ci`. What's the likely cause?

::code-wrapper{language="bash"}
```bash
# Teammate's local workflow
npm install lodash
git add package.json
git commit -m "add lodash"
git push

# CI workflow
git clone repo
npm ci
npm test
```
::

<details>
<summary>Answer</summary>

The teammate committed the `package.json` change but forgot to commit the updated `package-lock.json` (or it wasn't staged). `npm ci` requires the lockfile to exactly match `package.json` — if `lodash` isn't present in the committed lockfile at all, `npm ci` fails immediately with an error rather than trying to resolve it, unlike `npm install`, which would happily update the lockfile and proceed.

**The lesson**: always `git add package-lock.json` alongside `package.json` — `npm ci`'s strictness is a feature (reproducible builds), but only if the lockfile is actually committed and current.

</details>

## Key Takeaways

- `npm` manages dependencies and scripts; `pnpm` is faster with disk-efficient linking.
- ESLint catches bugs; Prettier enforces formatting — use both.
- Vite is the modern bundler — instant HMR, ESM-native, build with Rollup.