# 29 — Security

## XSS (Cross-Site Scripting)

::code-wrapper{language="javascript"}
```javascript
// ❌ XSS — inserting untrusted data as HTML
element.innerHTML = userInput  // attacker can inject <script>

// ✅ Safe — textContent escapes HTML
element.textContent = userInput

// ✅ Sanitize if you must use innerHTML
import DOMPurify from 'dompurify'
element.innerHTML = DOMPurify.sanitize(userHtml)

// ✅ Safe URL construction
const url = new URL(userInput)
if (url.origin !== 'https://example.com') throw new Error('Invalid origin')
```
::
::

## CSRF (Cross-Site Request Forgery)

::code-wrapper{language="javascript"}
```javascript
// Use SameSite cookies
// Set-Cookie: token=abc; SameSite=Strict; Secure; HttpOnly

// CSRF tokens in requests
fetch('/api/delete', {
  method: 'POST',
  headers: { 'X-CSRF-Token': csrfToken }
})
```
::
::

## Input Validation

::code-wrapper{language="javascript"}
```javascript
// Validate all external input — query params, body, headers
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// Parse integers safely
const id = parseInt(req.params.id, 10)
if (Number.isNaN(id)) throw new Error('Invalid ID')

// Never eval() user input
eval(userInput)  // ❌ arbitrary code execution
```
::
::

## 💡 Tips & Tricks

**Content Security Policy blocks XSS even if sanitization fails** — A strict `Content-Security-Policy: script-src 'self'` header stops injected inline `<script>` tags from executing at all, acting as a second line of defense behind input sanitization — defense in depth, not either/or.

**Use `rel="noopener noreferrer"` on `target="_blank"` links** — Without it, a linked page can access `window.opener` and redirect your original tab to a phishing page (tabnabbing) — a one-line fix that's easy to forget on every external link.

**Trusted Types API prevents DOM XSS sinks at the browser level** — Enabling `require-trusted-types-for 'script'` via CSP makes the browser throw on any raw string passed to `innerHTML`, forcing all HTML injection through an explicitly reviewed sanitizer function.

**Audit dependencies regularly, not just at install time** — `npm audit` only checks what's currently in the lockfile — set up Dependabot or a scheduled `npm audit` in CI so newly disclosed vulnerabilities in existing dependencies get caught even without a new install.

**Use `crypto.randomUUID()` or `crypto.getRandomValues()`, never `Math.random()`, for security-sensitive tokens** — `Math.random()` is not cryptographically secure and its output can be predicted by an attacker who observes enough samples — session tokens, CSRF tokens, and password reset tokens all need a CSPRNG.

## ⚠️ Edge Cases & Gotchas

**`textContent` protects against HTML injection but not all injection vectors** — Setting `el.textContent = userInput` is safe from HTML/script injection, but if that same string is later used to build a URL (`href = userInput`), a `javascript:alert(1)` URL still executes when clicked — sanitization must match the actual sink, not just the DOM write.

**Sanitizing on the client doesn't protect your server or other clients** — Client-side `DOMPurify.sanitize()` stops the attack in the browser it runs in, but if the raw, unsanitized value was already sent to and stored by the server, every other client (or the server's own rendering, e.g. server-side rendered HTML, email digests) is still vulnerable unless the server also sanitizes/escapes on output.

**`SameSite=Lax` (the modern default) still allows top-level GET navigation with cookies** — Many developers assume any `SameSite` setting blocks CSRF entirely, but `Lax` still sends cookies on top-level GET requests from external links — a CSRF attack via a crafted GET request (e.g. `<img src="https://bank.com/transfer?to=attacker">` if the endpoint incorrectly allows state changes via GET) can still succeed. `Strict` or proper anti-CSRF tokens are needed for full protection.

**`JSON.parse(userInput)` is not inherently unsafe like `eval`, but the resulting object can still drive unsafe code paths** — Parsing untrusted JSON is safe from code execution, but if the parsed object is later used to construct a database query, file path, or DOM update without validation, the "safe" parse gave a false sense of security about everything downstream.

**Regex-based email/input validation can be bypassed or over-restrictive** — `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` accepts many invalid addresses and rejects some valid ones (internationalized domains, `+` aliases in unusual positions) — validation is a UX helper, not a security boundary; the server must still enforce real constraints (uniqueness, format) independent of client-side regex.

## 🧠 Spot the Bug

Is this input handling actually safe?

::code-wrapper{language="javascript"}
```javascript
function renderProfile(user) {
  const container = document.querySelector('#profile')
  container.textContent = ''
  const link = document.createElement('a')
  link.href = user.website
  link.textContent = 'Visit site'
  container.appendChild(link)
}

renderProfile({ website: 'javascript:alert(document.cookie)' })
```
::

<details>
<summary>Answer</summary>

This is vulnerable, even though `textContent` is used correctly everywhere it appears. The bug is in `link.href = user.website` — assigning a `javascript:` URL to an anchor's `href` is a valid injection vector; clicking the link executes the script in the page's context and can exfiltrate `document.cookie`. `textContent` only protects against HTML/markup injection, not URL-scheme injection into attributes like `href` or `src`.

**The lesson**: sanitize based on the sink, not just the string — validate that URLs use `http:`/`https:` (e.g. `new URL(user.website).protocol` check) before assigning them to `href`, `src`, or similar attributes.

</details>

## Key Takeaways

- Never use `innerHTML` with untrusted input — use `textContent` or `DOMPurify`.
- Set cookies with `HttpOnly`, `Secure`, `SameSite=Strict`.
- Validate all external input on the server — never trust the client.
- Never `eval()` user input — it's arbitrary code execution.