---
title: "25 — Security"
description: "XSS in React, dangerouslySetInnerHTML, URL/href injection, CSP headers, dependency auditing, and where React's automatic escaping ends. Code-first reference for mid-to-senior React engineers."
---

# 25 — Security

## React's Automatic XSS Protection

::code-wrapper{language="javascript" filename="automatic_escaping.js"}
```javascript
// React automatically escapes all values rendered in {}.
// This prevents XSS for the overwhelming majority of rendering.

const userInput = '<script>alert("xss")</script>'

function SafeComponent() {
  return <div>{userInput}</div>
  // Renders as literal text: <script>alert("xss")</script>
  // The script is NOT executed — React escapes <, >, &, ", ' in string values.
}

// The escaping happens because React uses textContent (not innerHTML) for string
// children. The browser treats the content as text, not as HTML markup.
```
::

## The Escape Hatch: dangerouslySetInnerHTML

::code-wrapper{language="javascript" filename="dangerously_set_inner_html.js"}
```javascript
// ANTI-PATTERN: dangerouslySetInnerHTML with user-controlled content
function UnsafeComment({ content }) {
  return <div dangerouslySetInnerHTML={{ __html: content }} />
  // If `content` comes from a user and contains <img onerror=alert(1) src=x>,
  // it EXECUTES the onerror handler. This is a direct XSS vector.
}

// PRODUCTION: sanitize before injecting, using a trusted library
import DOMPurify from 'dompurify'

function SafeComment({ content }) {
  const clean = DOMPurify.sanitize(content, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  })
  return <div dangerouslySetInnerHTML={{ __html: clean }} />
  // DOMPurify strips event handlers, javascript: URLs, and disallowed tags.
  // NEVER use dangerouslySetInnerHTML without sanitization — the name is a warning.
}
```
::

## URL / href Injection

::code-wrapper{language="javascript" filename="href_injection.js"}
```javascript
// ANTI-PATTERN: user-controlled href without validation
function UserLink({ href, children }) {
  return <a href={href}>{children}</a>
  // If href = "javascript:alert(document.cookie)" → clicking the link executes JS.
  // If href = "data:text/html,<script>alert(1)</script>" → same.
}

// PRODUCTION: validate the protocol
function SafeLink({ href, children, ...props }) {
  // Only allow http, https, mailto, tel — block javascript:, data:, vbscript:
  const SAFE_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:']
  const url = new URL(href, window.location.origin)  // resolve relative URLs
  if (!SAFE_PROTOCOLS.includes(url.protocol)) {
    return null  // or render as plain text
  }
  // Additional check: block data: URIs even if someone adds them to the allowlist
  if (url.protocol === 'data:' && !href.startsWith('data:image/')) {
    return null
  }
  return <a href={href} rel="noopener noreferrer" target="_blank" {...props}>{children}</a>
}
```
::

## Content Security Policy (CSP)

::code-wrapper{language="text" filename="csp_header.txt"}
```
# CSP header — defense in depth against XSS even if a sanitization bug exists.
# Set as a response header: Content-Security-Policy: ...

# STRICT (recommended for React apps):
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';  # React injects styles inline — 'unsafe-inline' needed for styles
img-src 'self' data: https:\;
connect-src 'self' https://api.example.com\;
font-src 'self' https://fonts.gstatic.com\;
frame-ancestors 'none';  # clickjacking protection
base-uri 'self';
form-action 'self';

# For apps using nonces (if you can't avoid inline scripts):
# script-src 'self' 'nonce-{RANDOM}'
# Each <script> tag must include nonce="{RANDOM}" — nonces are unique per request.
```
::

## Dependency Auditing

::code-wrapper{language="bash" filename="dependency_audit.sh"}
```bash
# Check for known vulnerabilities in dependencies
npm audit

# Fix automatically where possible
npm audit fix

# Check for specific package: does it have known CVEs?
npm audit --audit-level=high

# Use Snyk for deeper scanning (catches more than npm audit)
npx snyk test

# Lockfile discipline: commit package-lock.json (or yarn.lock / pnpm-lock.yaml)
# to ensure CI and production install the EXACT same versions.
# NEVER run `npm install` without --save-exact or caret ranges you haven't reviewed.
```
::

## Client-Side Security Limitations

::code-wrapper{language="javascript" filename="client_limitations.js"}
```javascript
// CRITICAL MINDSET: anything in the client bundle is PUBLIC.
// Never put secrets, API keys, or passwords in React source code.

// ANTI-PATTERN: API key in client-side code
const API_KEY = 'sk-live-1234567890'  // ← visible in the browser bundle to anyone
fetch(`https://api.example.com/data?key=${API_KEY}`)

// PRODUCTION: proxy through your backend
fetch('/api/data')  // your server adds the API key server-side
// The key never reaches the browser. The browser only talks to YOUR server.

// Even "hidden" env vars (import.meta.env.VITE_API_KEY) are embedded in the
// client bundle at build time — they're not secrets, they're build-time constants.
// Only env vars WITHOUT the VITE_ prefix stay server-side in SSR frameworks.

// NEVER trust client-side validation alone — always validate on the server.
// Client validation is for UX (instant feedback), not security (trivially bypassed).
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript" filename="tips.js"}
```javascript
// [Safety] React's automatic escaping covers 99% of XSS scenarios. The danger
// zones are: dangerouslySetInnerHTML, href={userInput}, and eval/execScript.
// Audit these three patterns regularly.

// [Idiom] For rich-text rendering from user input, use a library (DOMPurify,
// sanitize-html) — never try to write your own HTML sanitizer. Regex-based
// sanitizers are bypassable.

// [Safety] Add rel="noopener noreferrer" to all target="_blank" links. Without
// it, the opened page can access window.opener (your original window) — a
// reverse tabnabbing attack.

// [Debug] Check your production bundle for secrets: search the built JS files
// for any string that looks like a key, token, or password. If it's in the
// bundle, it's public.

// [Idiom] Use HTTP-only cookies for auth tokens instead of localStorage.
// HTTP-only cookies can't be read by JavaScript (document.cookie) — immune to
// XSS-based token theft. localStorage tokens are readable by any script on the page.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript" filename="edge_cases.js"}
```javascript
// [Gotcha] dangerouslySetInnerHTML bypasses ALL of React's escaping. The prop
// name is a warning for a reason — it means "I take responsibility for this
// being safe." Always sanitize with DOMPurify, never trust user content directly.

// [Gotcha] href injection works with ANY attribute that accepts a URL:
// <a href={x}>, <img src={x}>, <iframe src={x}>, <form action={x}>, <link href={x}>.
// Validate the protocol on ALL of these, not just <a href>.

// [Gotcha] CSS injection via style={{...}} is limited (React uses inline styles,
// not CSS text), but className={userInput} can inject arbitrary class names.
// This isn't XSS, but it can enable CSS-based attacks (data exfiltration via
// attribute selectors + background-image URLs on internal-facing apps).

// [Gotcha] target="_blank" without rel="noopener" is a reverse tabnabbing vector.
// The opened page can redirect your original tab to a phishing site via
// window.opener.location = 'phishing.com'. React 18+ adds rel="noopener" by
// default for target="_blank" — but older versions don't.

// [Safety] PostMessage events: if your app uses window.postMessage for cross-origin
// communication, ALWAYS verify event.origin before trusting event.data.
// window.addEventListener('message', e => { if (e.origin !== 'https://trusted.com') return; ... })
```
::

## 🧠 Spot the Bug

A blog renders user-submitted comments with rich text (bold, links). The developer uses `dangerouslySetInnerHTML` because the content comes from "trusted" admin users:

::code-wrapper{language="javascript" filename="spot_the_bug.js"}
```javascript
function Comment({ content }) {
  // Content comes from admin users — "trusted"
  return <div dangerouslySetInnerHTML={{ __html: content }} />
}
```
::

What's the risk?

<details>
<summary>Answer</summary>

"Trusted" is not a security boundary — admin accounts can be compromised, and stored XSS in admin content affects every user who views the comment. If an attacker compromises an admin account (or an admin pastes content from an untrusted source), the `content` can contain `<script>`, `<img onerror=...>`, or `<a href="javascript:...">` tags that execute in every visitor's browser.

**Fix**: sanitize with DOMPurify regardless of the source:

```javascript
import DOMPurify from 'dompurify'

function Comment({ content }) {
  const clean = DOMPurify.sanitize(content, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  })
  return <div dangerouslySetInnerHTML={{ __html: clean }} />
}
```

The lesson: never bypass React's escaping without sanitization, regardless of the content source. "Trusted" users can be compromised, and stored XSS is the most dangerous type — it persists and affects every viewer.

</details>

## Key Takeaways

::code-wrapper{language="javascript" filename="key_takeaways.js"}
```javascript
// 1. React automatically escapes all {} values — XSS is prevented by default.
//   The escape hatches that bypass this: dangerouslySetInnerHTML, href={url},
//   and eval/execScript. Audit these patterns regularly.

// 2. dangerouslySetInnerHTML REQUIRES sanitization (DOMPurify). The name is a
//    warning. "Trusted" source is not a security boundary — admins can be compromised.

// 3. URL injection: validate protocol on ALL URL attributes (href, src, action).
//    Block javascript:, data: (except images), vbscript:. Use new URL() to parse.

// 4. CSP headers are defense-in-depth — even if a sanitization bug exists, CSP
//    blocks inline script execution. Set script-src 'self' (or nonce-based).

// 5. Client bundle is PUBLIC — never put secrets in React source. Proxy through
//   your backend. Use HTTP-only cookies for auth tokens (immune to XSS theft).
//   Client-side validation is UX, not security — always validate on the server.
```
::
