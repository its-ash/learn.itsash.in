---
title: "JavaScript 29 — Security: XSS, CSRF, CSP & Prototype Pollution"
description: "Deep-dive into JavaScript security: XSS prevention (textContent vs innerHTML, DOMPurify), CSRF tokens and SameSite cookies, Content Security Policy, prototype pollution attacks, and safe input validation. Code-first reference for senior engineers."
---

# 29 — Security: XSS, CSRF, CSP & Prototype Pollution

## XSS: Cross-Site Scripting Prevention

::code-wrapper{language="javascript"}
```javascript
// ── XSS: attacker injects malicious HTML/JS into a page ──
// Three types:
// 1. Stored XSS: payload saved in DB, rendered for all users (most severe)
// 2. Reflected XSS: payload in URL, reflected back in the page
// 3. DOM-based XSS: payload injected via client-side DOM manipulation

// ❌ NAIVE — innerHTML renders raw HTML (XSS vulnerability)
function renderUserInput(input) {
    document.querySelector("#output").innerHTML = input;  // XSS!
}
renderUserInput('<img src=x onerror="alert(document.cookie)">');  // script executes

// ✅ SAFE — textContent treats input as text (no HTML parsing)
function renderSafe(input) {
    document.querySelector("#output").textContent = input;  // escaped as text
}
renderSafe('<img src=x onerror="alert(1)">');  // displays as literal text

// ✅ SAFE — sanitize HTML with DOMPurify (allow safe tags, strip scripts)
import DOMPurify from "dompurify";
function renderSanitized(html) {
    const clean = DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ["b", "i", "em", "strong", "a", "p", "br"],
        ALLOWED_ATTR: ["href", "title"],
        FORBID_ATTR: ["style", "onerror", "onclick"],  // explicit deny list
    });
    document.querySelector("#output").innerHTML = clean;
}
renderSanitized('<b>safe</b><script>alert("xss")</script>');  // <b>safe</b> (script stripped)

// ── Dangerous sinks (never pass user input to these) ──
element.innerHTML = userInput;       // ❌ HTML injection
document.write(userInput);           // ❌ overwrites the page
element.setAttribute("onclick", userInput);  // ❌ event handler injection
element.outerHTML = userInput;       // ❌ replaces element
eval(userInput);                     // ❌ code execution
setTimeout(userInput, 0);            // ❌ string arg = eval
setInterval(userInput, 1000);        // ❌ string arg = eval
new Function(userInput);             // ❌ creates a function from a string
```
::

## XSS in Template Literals and URL Contexts

::code-wrapper{language="javascript"}
```javascript
// ── Template literals with user input → XSS if inserted into HTML ──
const userName = '<img src=x onerror="alert(1)">';
document.querySelector("#greeting").innerHTML = `Hello, ${userName}!`;  // ❌ XSS

// ✅ Escape HTML entities before inserting
function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;  // browser escapes: < → &lt;, > → &gt;, etc.
    return div.innerHTML;
}
document.querySelector("#greeting").innerHTML = `Hello, ${escapeHtml(userName)}!`;

// ── URL context: javascript: scheme is dangerous ──
const userInput = "javascript:alert(document.cookie)";
// ❌ NAIVE — allows javascript: URLs
document.querySelector("#link").href = userInput;  // clicking the link executes JS

// ✅ SAFE — validate the URL scheme
function safeUrl(url) {
    try {
        const parsed = new URL(url, window.location.origin);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") {
            return parsed.href;  // only http/https
        }
    } catch { /* invalid URL */ }
    return "#";  // fallback for dangerous or invalid URLs
}
document.querySelector("#link").href = safeUrl(userInput);  // "#" (blocked)

// ── Attribute injection (event handlers in attributes) ──
const userClass = 'foo" onmouseover="alert(1)';
// ❌ NAIVE — quote breakout
element.setAttribute("class", `custom ${userClass}`);  // class="custom foo" onmouseover="alert(1)"
// ✅ SAFE — use setAttribute (auto-escapes quotes in the value)
element.setAttribute("class", userClass);  // quotes escaped, no breakout
```
::

## CSRF: Cross-Site Request Forgery

::code-wrapper{language="javascript"}
```javascript
// ── CSRF: attacker tricks a user's browser into sending a request to your site ──
// The browser includes cookies → the request appears authenticated.
// Attack vector: <img src="https://bank.com/transfer?to=attacker&amount=1000">

// ── Defense 1: CSRF tokens (synchronizer pattern) ──
// Server generates a random token, embeds it in the form, validates on POST.
// Attackers can't read the token (same-origin policy prevents cross-site reads).

// Frontend: include the token in requests
const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
fetch("/api/transfer", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,  // send the token in a header
    },
    body: JSON.stringify({ to: "alice", amount: 100 }),
    credentials: "same-origin",  // include cookies
});

// ── Defense 2: SameSite cookies (prevent cross-site cookie transmission) ──
// Server sets: Set-Cookie: session=abc123; SameSite=Strict; Secure; HttpOnly
// SameSite=Strict: cookie never sent on cross-site requests (most secure)
// SameSite=Lax: cookie sent on top-level navigation (links), not on subrequests
// SameSite=None: cookie always sent (requires Secure — HTTPS only)

// ── Defense 3: custom header requirement (not achievable with plain forms) ──
// Require a custom header (X-Requested-With) — plain HTML forms can't set custom headers.
// Attackers can't send custom headers cross-origin without CORS permission.
fetch("/api/data", {
    headers: { "X-Requested-With": "XMLHttpRequest" },  // custom header
    credentials: "same-origin",
});
```
::

## Content Security Policy (CSP)

::code-wrapper{language="javascript"}
```javascript
// ── CSP: restrict what resources the browser is allowed to load ──
// Set via HTTP header or <meta http-equiv="Content-Security-Policy" content="...">

// ── Strict CSP (prevents XSS, inline scripts, unauthorized connections) ──
const csp = [
    "default-src 'self'",                    // default: only same origin
    "script-src 'self'",                     // scripts: only same origin (no inline)
    "style-src 'self' 'unsafe-inline'",      // styles: same origin + inline (for CSS-in-JS)
    "img-src 'self' data: https:",           // images: same origin, data URIs, HTTPS
    "connect-src 'self' https://api.example.com",  // fetch/XHR: same origin + API
    "font-src 'self' https://fonts.gstatic.com",   // fonts: same origin + Google Fonts
    "frame-ancestors 'none'",                // prevent framing (clickjacking)
    "base-uri 'self'",                       // <base> tag: only same origin
    "form-action 'self'",                    // form submissions: only same origin
    "object-src 'none'",                     // no <object>/<embed> (Flash, Java)
    "upgrade-insecure-requests",             // upgrade HTTP to HTTPS
].join("; ");

// ── Nonce-based CSP (allow specific inline scripts) ──
// Server generates a unique nonce per request:
// Content-Security-Policy: script-src 'self' 'nonce-random123'
// <script nonce="random123">console.log("allowed");</script>
// The nonce changes per request — attackers can't guess it.

// ── Hash-based CSP (allow scripts by their content hash) ──
// script-src 'self' 'sha256-abc123...'
// Only scripts with the matching hash execute.

// ── Reporting (monitor violations without blocking) ──
// Content-Security-Policy-Report-Only: default-src 'self'; report-to /csp-report
// Sends violation reports to /csp-report (doesn't block — for testing before enforcing).
```
::

## Prototype Pollution

::code-wrapper{language="javascript"}
```javascript
// ── Prototype pollution: attacker modifies Object.prototype ──
// All objects inherit from Object.prototype — polluting it affects every object.

// ❌ VULNERABLE — recursive merge can pollute the prototype
function merge(target, source) {
    for (const key in source) {
        if (typeof source[key] === "object" && source[key] !== null) {
            if (!target[key]) target[key] = {};
            merge(target[key], source[key]);
        } else {
            target[key] = source[key];
        }
    }
    return target;
}
// Attack: merge({}, JSON.parse('{"__proto__": {"isAdmin": true}}'))
// After this, every new object has isAdmin: true → privilege escalation
const obj = {};
console.log(obj.isAdmin);  // true (polluted!) — every object now has isAdmin

// ✅ SAFE — block __proto__, constructor, prototype keys
function safeMerge(target, source) {
    for (const key in source) {
        if (key === "__proto__" || key === "constructor" || key === "prototype") {
            continue;  // skip dangerous keys
        }
        if (typeof source[key] === "object" && source[key] !== null) {
            target[key] = safeMerge(target[key] || {}, source[key]);
        } else {
            target[key] = source[key];
        }
    }
    return target;
}

// ✅ SAFER — use Object.create(null) (no prototype)
const map = Object.create(null);  // no __proto__, no inherited properties
// Object.create(null) objects can't be polluted (they have no prototype chain)

// ✅ BEST — use Map instead of plain objects for key-value storage
const safeMap = new Map();
safeMap.set("key", "value");  // no prototype pollution risk
```
::

## Input Validation and Sanitization

::code-wrapper{language="javascript"}
```javascript
// ── Validate input early and strictly (never trust client-side validation alone) ──
// Client-side: UX feedback. Server-side: security enforcement.

// ── Schema validation with a validator (e.g., Zod, Joi, yup) ──
// Using Zod:
import { z } from "zod";

const UserSchema = z.object({
    email: z.string().email(),  // must be a valid email
    age: z.number().int().min(0).max(150),  // integer, 0-150
    name: z.string().min(1).max(100),  // 1-100 chars
    role: z.enum(["user", "admin"]),  // only these values
    website: z.string().url().optional(),  // valid URL or undefined
});

// Parse and validate (throws on invalid input)
const user = UserSchema.parse(request.body);  // throws ZodError if invalid
// Safe parse (returns success/error instead of throwing)
const result = UserSchema.safeParse(request.body);
if (result.success) {
    console.log(result.data);  // typed and validated
} else {
    console.log(result.error.issues);  // validation errors
}

// ── SQL injection prevention (use parameterized queries) ──
// ❌ NAIVE — string concatenation (SQL injection)
const query = `SELECT * FROM users WHERE name = '${userName}'`;
// Attack: userName = "'; DROP TABLE users; --" → SQL injection

// ✅ SAFE — parameterized queries (database escapes the values)
const safeQuery = "SELECT * FROM users WHERE name = ?";
db.execute(safeQuery, [userName]);  // userName is escaped by the driver
```
::

## Subresource Integrity (SRI)

::code-wrapper{language="html"}
```html
<!-- ── SRI: verify the integrity of external scripts/styles ── -->
<!-- If the CDN is compromised and the script changes, the browser won't execute it -->
<script
  src="https://cdn.example.com/library.js"
  integrity="sha384-abc123..."
  crossorigin="anonymous">
</script>
<!-- The hash must match the file content. If it doesn't, the browser blocks execution. -->
<!-- Generate: openssl dgst -sha384 -binary library.js | openssl base64 -A -->
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript"}
```javascript
// ── HttpOnly cookies: prevent JS from reading cookies (XSS can't steal them) ──
// Set-Cookie: session=abc123; HttpOnly; Secure; SameSite=Strict
// document.cookie → can't read "session" (HttpOnly) → XSS can't exfiltrate it

// ── Use `textContent` by default, `innerHTML` only with sanitization ──
// textContent: safe (no HTML parsing), slightly faster
// innerHTML: only with DOMPurify or trusted content

// ── Strict Transport Security (HSTS): force HTTPS ──
// Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
// Prevents SSL stripping attacks (browser always uses HTTPS for this domain)

// ── Use `rel="noopener noreferrer"` on target="_blank" links ──
// <a href="https://external.com" target="_blank" rel="noopener noreferrer">
// Without noopener: the new tab can access window.opener (reverse tabnabbing)

// ── JSON hijacking prevention (X-Content-Type-Options: nosniff) ──
// Set: X-Content-Type-Options: nosniff
// Prevents the browser from MIME-sniffing (treating JSON as HTML/JS)
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript"}
```javascript
// ── `textContent` and `innerHTML` differ on script tags ──
const script = document.createElement("script");
script.textContent = 'alert("executes")';  // ❌ DOES execute when inserted
document.body.appendChild(script);  // the script runs

// ── Sanitization is context-dependent ──
// DOMPurify sanitizes for HTML context. For URL context, validate the scheme.
// For JS string context, escape quotes and backslashes.
// No single sanitizer works in all contexts — use the right tool for each.

// ── `javascript:` URLs can bypass naive scheme checks ──
// "java\tscript:alert(1)" → tab character bypasses /javascript:/ regex check
// Use new URL() and check protocol (handles encoding correctly)

// ── Prototype pollution via JSON ──
// JSON.parse('{"__proto__": {"x": 1}}') → __proto__ is a key, not the prototype
// But if you merge this into an object with a recursive merge, it can pollute.

// ── `Object.freeze` doesn't prevent prototype pollution ──
// Object.freeze(obj) prevents changes to obj's own properties,
// but doesn't prevent changes to Object.prototype (the prototype).

// ── CSP doesn't prevent all XSS (only limits the damage) ──
// 'unsafe-inline' allows inline scripts (still vulnerable to inline XSS)
// Use nonces or hashes instead of 'unsafe-inline' for strict CSP.
```
::

## 🧠 Quick Quiz

Why is this code vulnerable, and how do you fix it?

::code-wrapper{language="javascript"}
```javascript
function highlightSearch(query) {
    const results = document.querySelector("#results");
    results.innerHTML = `Found: ${items
        .filter(item => item.name.includes(query))
        .map(item => `<li>${item.name}</li>`)
        .join("")}`;
}
```
::

<details>
<summary>Answer</summary>

The `item.name` values are inserted into `innerHTML` without escaping. If an attacker can control `item.name` (e.g., by submitting a product name like `<img src=x onerror="alert(document.cookie)">`), the HTML is parsed and the script executes — **stored XSS**.

Even though `query` is used in `.filter()` (not in the HTML), the `item.name` values are rendered as raw HTML.

**Fix**: Escape `item.name` before inserting into HTML:

```javascript
function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function highlightSearch(query) {
    const results = document.querySelector("#results");
    results.innerHTML = `Found: ${items
        .filter(item => item.name.includes(query))
        .map(item => `<li>${escapeHtml(item.name)}</li>`)  // ✅ escape each name
        .join("")}`;
}
```

Or use `textContent` and `createElement` (no HTML parsing):

```javascript
function highlightSearch(query) {
    const results = document.querySelector("#results");
    results.innerHTML = "Found:";
    const list = document.createElement("ul");
    for (const item of items.filter(i => i.name.includes(query))) {
        const li = document.createElement("li");
        li.textContent = item.name;  // ✅ textContent (no HTML parsing)
        list.appendChild(li);
    }
    results.appendChild(list);
}
```

**The lesson**: every value inserted into `innerHTML` must be escaped or sanitized — including data from your own database (stored XSS). Use `textContent` for plain text, or `DOMPurify.sanitize()` for rich HTML.

</details>