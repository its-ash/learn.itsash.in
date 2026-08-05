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

## Key Takeaways

- Never use `innerHTML` with untrusted input — use `textContent` or `DOMPurify`.
- Set cookies with `HttpOnly`, `Secure`, `SameSite=Strict`.
- Validate all external input on the server — never trust the client.
- Never `eval()` user input — it's arbitrary code execution.