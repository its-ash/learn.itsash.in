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

## Vite

::code-wrapper{language="bash"}
```bash
npm create vite@latest my-app -- --template vanilla
cd my-app && npm install && npm run dev
```

::

## Key Takeaways

- `npm` manages dependencies and scripts; `pnpm` is faster with disk-efficient linking.
- ESLint catches bugs; Prettier enforces formatting — use both.
- Vite is the modern bundler — instant HMR, ESM-native, build with Rollup.