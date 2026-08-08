# 22 — Security

## Vue's Default Escaping — and Where It Stops

Vue's template interpolation (`{{ }}`) and `v-bind` both escape values by default — text is inserted via `textContent`-equivalent DOM APIs, never parsed as HTML, so a value like `<img src=x onerror=alert(1)>` renders as inert, visible text, not an executing tag. This default is *why* Vue apps are relatively resistant to XSS out of the box — but that protection has one deliberate, explicit escape hatch: `v-html`.

::code-wrapper{language="vue" filename="CommentSafe.vue"}
```vue
<script setup>
const comment = ref('<img src=x onerror="alert(document.cookie)">')
</script>

<template>
  <!-- SAFE — Vue escapes this; the literal text is displayed, nothing executes -->
  <p>{{ comment }}</p>
</template>
```
::

## `v-html` Is a Direct XSS Vector

::code-wrapper{language="vue" filename="CommentUnsafe.vue"}
```vue
<script setup>
const comment = ref('<img src=x onerror="alert(document.cookie)">')
</script>

<template>
  <!-- DANGEROUS — v-html sets innerHTML directly; any <script>-equivalent
       markup in `comment` executes with full access to the page, including
       cookies, localStorage, and the ability to make authenticated requests
       on the victim's behalf -->
  <p v-html="comment"></p>
</template>
```
::

The Vue documentation itself states this plainly: "dynamically rendering arbitrary HTML on your website can be very dangerous because it can easily lead to XSS vulnerabilities." `v-html` is not a bug in Vue — it's an intentional, clearly-named escape hatch for cases where you genuinely need to render markup (a rich-text editor's output, a CMS field authored by a trusted admin) — the danger is entirely a function of *whose* content ends up there. Rendering your own hard-coded marketing copy via `v-html` is harmless; rendering unsanitized user-submitted text via `v-html` is a real, exploitable vulnerability, full stop, regardless of how unlikely an attack "feels" for a given app.

## Sanitizing User Content Before `v-html`

When user-generated or third-party HTML genuinely must be rendered, sanitize it through an allowlist-based library — never a hand-rolled regex or blocklist, both of which are reliably bypassable:

::code-wrapper{language="bash"}
```bash
npm install dompurify
```
::

::code-wrapper{language="vue" filename="RichCommentDisplay.vue"}
```vue
<script setup>
import { computed } from 'vue'
import DOMPurify from 'dompurify'

const props = defineProps({
  rawHtml: { type: String, required: true }
})

// sanitized on every read — DOMPurify strips <script> tags, inline event
// handlers (onerror, onclick, ...), javascript: URLs, and other known
// XSS vectors, keeping only a safe subset of markup
const safeHtml = computed(() => DOMPurify.sanitize(props.rawHtml))
</script>

<template>
  <div v-html="safeHtml"></div>
</template>
```
::

::code-wrapper{language="javascript"}
```javascript
// a stricter allowlist for contexts where even basic formatting tags
// are more permissive than needed — e.g. a plain-text comment that only
// supports bold/italic/links
const strictConfig = {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a'],
  ALLOWED_ATTR: ['href']
}

DOMPurify.sanitize(userInput, strictConfig)
```
::

A regex-based "strip `<script>` tags" approach is a well-known anti-pattern precisely because it's trivially bypassable — `<img src=x onerror=...>`, `<svg onload=...>`, and `javascript:` URLs in an `href` all execute code without ever containing the literal string `<script>`; a maintained sanitizer library tracks the constantly-evolving list of actual browser-exploitable vectors so you don't have to rediscover them one incident at a report.

## `javascript:` URLs and `:href`

::code-wrapper{language="vue" filename="UserLink.vue"}
```vue
<script setup>
const props = defineProps({ url: String })
</script>

<template>
  <!-- DANGEROUS if `url` is user-controlled and unvalidated — a value of
       "javascript:alert(document.cookie)" executes when the link is
       clicked, since it's a completely valid href value as far as the
       browser is concerned -->
  <a :href="url">Visit link</a>
</template>
```
::

::code-wrapper{language="javascript"}
```javascript
function isSafeUrl(url) {
  try {
    const parsed = new URL(url, window.location.origin)
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol)
  } catch {
    return false
  }
}
```
::

::code-wrapper{language="vue" filename="UserLink.vue"}
```vue
<template>
  <a :href="isSafeUrl(url) ? url : '#'">Visit link</a>
</template>
```
::

Vue does not sanitize `:href`/`:src` bindings for you — attribute binding is escaped in the sense that it can't break out of the attribute into new HTML, but a syntactically valid `javascript:` or `data:` URL passed as the attribute's *value* is exactly what the attacker wants and Vue has no way to know that's not a legitimate use case; validating the URL scheme against an explicit allowlist before binding it is the application's responsibility.

## Content Security Policy (CSP)

CSP is a browser-enforced HTTP response header that restricts what a page is allowed to execute or load, acting as defense-in-depth *even if* an XSS payload somehow makes it into the DOM:

::code-wrapper{language="ini" filename="CSP header example"}
```ini
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://cdn.example.com; connect-src 'self' https://api.example.com; object-src 'none'; base-uri 'self'
```
::

- `script-src 'self'` — only scripts served from your own origin execute; an injected inline `<script>alert(1)</script>` from a successful `v-html` XSS is blocked by the browser itself, even though the markup made it into the DOM.
- `object-src 'none'` — disables `<object>`/`<embed>`, both legacy vectors for plugin-based exploits.
- `base-uri 'self'` — prevents an attacker-injected `<base>` tag from silently rewriting all relative URLs on the page to point at an attacker-controlled origin.

### The `unsafe-inline`/`unsafe-eval` tension with Vue

::code-wrapper{language="bash"}
```bash
# Vue 3 templates precompiled at build time (Single File Components,
# the standard setup) do NOT need 'unsafe-eval' — compilation to render
# functions happens ahead of time, not in the browser
#
# 'unsafe-eval' is only needed for the (rare, non-recommended) in-browser
# template compilation, or the full runtime+compiler build of Vue
```
::

A production Nuxt/Vite build using standard `<script setup>` SFCs — which is nearly every real Vue app — can adopt a strict CSP without `'unsafe-eval'`; needing it is usually a sign that raw template strings are being compiled at runtime somewhere, which is worth eliminating rather than working around with a looser policy. `'unsafe-inline'` for `style-src` is a more common, more defensible relaxation, since Vue's `:style`/scoped-style output relies on inline styles in some cases — a nonce-based or hash-based CSP is the stricter alternative when even that needs closing off.

## Server-Side Rendering and XSS

Chapter 20 covered SSR mechanics; the security-relevant detail is that server-rendered HTML is just as vulnerable to injection as client-rendered `v-html` — `renderToString` does not add any sanitization step of its own:

::code-wrapper{language="vue" filename="ArticleBody.vue"}
```vue
<script setup>
const props = defineProps({ article: Object })
</script>

<template>
  <!-- if article.bodyHtml came from user input and was never sanitized,
       this is exploitable identically whether rendered on the server
       during SSR or on the client -->
  <div v-html="article.bodyHtml"></div>
</template>
```
::

Sanitize at the point content is *stored* (or at minimum, at every point it's rendered) — relying on "the server already checked it" from an earlier, different code path is a common source of second-order XSS, where content that was safe when first written becomes dangerous after a schema change or a new rendering surface is added later that skips the original sanitization step.

## Dependency Security

A Vue app's real attack surface is overwhelmingly its `node_modules` tree, not hand-written application code — a single compromised transitive dependency runs with full access to the build process and, if it ships malicious runtime code, the deployed app itself.

::code-wrapper{language="bash"}
```bash
npm audit                    # lists known vulnerabilities in installed dependencies
npm audit fix                # applies non-breaking fixes automatically
npm audit fix --force        # applies fixes that may include breaking major-version bumps — review before running

npm ls <package-name>        # shows exactly which dependency pulled in a flagged transitive package
```
::

::code-wrapper{language="bash"}
```bash
# lockfiles (package-lock.json / pnpm-lock.yaml) pin exact resolved
# versions, including of transitive dependencies — always commit them
npm ci    # installs EXACTLY what the lockfile specifies, and fails loudly
          # if package.json and the lockfile have drifted out of sync —
          # the correct command for CI/production installs, not `npm install`
```
::

`npm ci` versus `npm install` is worth being deliberate about specifically for security: `npm install` can silently update the lockfile to satisfy a loosely-specified semver range (`^3.2.0` resolving to a newer `3.x` that was just published, including one published minutes ago by a compromised maintainer account), while `npm ci` refuses to deviate from what's already committed — build/deploy pipelines should use `npm ci`, reserving `npm install` for the deliberate, human-reviewed act of updating dependencies.

## Sensitive Data in the Client Bundle

Chapter 21 covered the `VITE_` prefix mechanism; the security framing of the same fact bears restating directly: anything that ends up in client-side JavaScript is public, permanently, the moment it's deployed — there is no client-side secret, because any string embedded in a bundle can be read by opening browser DevTools.

::code-wrapper{language="javascript"}
```javascript
// WRONG — regardless of the VITE_ prefix technicality, an API key with
// real privileges (write access, billing-relevant scope, admin capability)
// must never be embedded in client code, because "the user would have to
// look for it" is not a security boundary
const stripeSecretKey = import.meta.env.VITE_STRIPE_SECRET_KEY

// RIGHT — a genuinely public-scoped key (Stripe's publishable key is
// explicitly designed to be public) is fine client-side; anything
// privileged stays server-side, called through your own backend
const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
```
::

The real question to ask before embedding any credential client-side is not "is this technically hidden" but "was this key specifically designed by its issuer to be safe if fully public" — a payment provider's *publishable* key, a map provider's domain-restricted key, and similar are designed for exactly this; a database connection string, a secret/private API key, or an admin token never are, regardless of build tooling.

## 💡 Tips & Tricks

- **Safety** — Default to `{{ }}`/`v-bind` for every value unless there's a specific, named reason markup needs to render as HTML — treat `v-html` as a deliberate, reviewable decision each time it's introduced, not a routine templating choice.
- **Safety** — Run user-generated HTML through DOMPurify (or an equivalent allowlist sanitizer) at the point of *storage*, not only at render time — this protects every future rendering surface, including ones that don't exist yet, rather than relying on every future developer remembering to sanitize on read.
- **Debug** — Browser DevTools' Network tab, on the response headers of your own page, shows the actual `Content-Security-Policy` header being sent — a good first check when CSP seems to not be applying, since a typo in server config silently ships no policy at all rather than erroring.
- **Portability** — Run `npm audit` as a normal part of CI, not just occasionally by hand — a dependency vulnerability disclosed after your last manual check sits unnoticed until the next one, and CI is the natural place to catch that gap automatically.
- **Safety** — Validate URL schemes explicitly (`http:`, `https:`, `mailto:`) before binding any user-supplied value to `:href`/`:src` — Vue's attribute escaping prevents breaking out of the attribute, but does nothing to stop a syntactically valid `javascript:` URL from being exactly what ends up there.

## ⚠️ Edge Cases & Gotchas

- **`v-html` sanitized once at input time can become unsafe later if the rendering context changes** — Content sanitized for rendering inside a `<div>` may still be unsafe if a later feature renders the same stored value inside an `<a>` attribute or a `<style>` block, since different HTML contexts have different injection vectors — sanitize with the actual rendering context in mind, not generically.
- **`npm audit`'s reported vulnerability count includes advisories for code paths your app may never actually execute** — A vulnerability in a dependency's rarely-used function that your app never calls still shows up, which can lead to either alarm fatigue (ignoring all audit output) or wasted effort patching non-reachable issues — triage by whether the vulnerable code path is actually reachable from your usage, not just presence in the tree.
- **A CSP that's too strict silently breaks features with no visible error in the UI itself — only a console warning most users (and sometimes developers) never look at** — An image failing to load because `img-src` didn't include its CDN origin, or a third-party widget failing because `frame-src` excludes it, looks like an unrelated bug unless the console is checked specifically for CSP violation reports.
- **`v-bind` escapes to prevent breaking out of an HTML attribute, but does not validate the *meaning* of the value it binds** — `:href="userUrl"` with `userUrl` set to `javascript:...` is not an XSS bug in the sense of injected markup — the markup is entirely well-formed — but it's exploitable identically, and easy to miss in review because nothing about the template itself "looks" unsafe.
- **A dependency that's safe in isolation can still be a supply-chain risk through its own build-time scripts (`postinstall` hooks)** — `npm audit` covers *known published* vulnerabilities in package code, but a malicious `postinstall` script in a compromised package version runs arbitrary code on your machine or CI runner during `npm install`, before your application code ever executes — this is a distinct risk from XSS/CSP concerns and mitigated by lockfile discipline (`npm ci`) and vetting new dependencies before adoption, not by anything covered above.

## 🧠 Spot the Bug

A support-ticket app lets users paste rich-text descriptions, stored as HTML and displayed to support agents. A sanitizer is used — but agents report that a malicious ticket redirected them to a phishing page just by opening it.

::code-wrapper{language="vue" filename="TicketBody.vue"}
```vue
<script setup>
import { computed } from 'vue'
import DOMPurify from 'dompurify'

const props = defineProps({ ticket: Object })

const safeBody = computed(() =>
  DOMPurify.sanitize(props.ticket.bodyHtml, { ALLOWED_TAGS: ['b', 'i', 'a', 'p', 'br'] })
)
</script>

<template>
  <div v-html="safeBody"></div>
</template>
```
::

<details>
<summary>Answer</summary>

`ALLOWED_TAGS` restricts which *tags* survive sanitization, but says nothing about which *attribute values* are allowed on them — an `<a>` tag is permitted, and DOMPurify's default attribute allowlist for `<a>` includes `href`, but it does not, by default, restrict `href` to safe URL schemes. A submitted body containing `<a href="javascript:window.location='https://evil.example'">Click for details</a>` passes sanitization intact — the tag and attribute are both "allowed" — and executes the instant an agent clicks it, or in some older browser/markup combinations, without any click at all.

::code-wrapper{language="vue" filename="TicketBody.vue"}
```vue
<script setup>
import { computed } from 'vue'
import DOMPurify from 'dompurify'

const props = defineProps({ ticket: Object })

const safeBody = computed(() =>
  DOMPurify.sanitize(props.ticket.bodyHtml, {
    ALLOWED_TAGS: ['b', 'i', 'a', 'p', 'br'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i
  })
)
</script>
```
::

DOMPurify actually ships a safe default `ALLOWED_URI_REGEXP` that already blocks `javascript:` — the realistic version of this bug is a team that customized the config (as shown) and, in doing so, either overrode that default incorrectly or copied a config snippet from an unrelated project without carrying the URI restriction along with the tag allowlist.

**The lesson**: an allowlist sanitizer must be configured for tags *and* attribute-value schemes together — restricting which tags are permitted while leaving attribute values unconstrained still leaves a fully exploitable `javascript:` URL vector sitting inside an otherwise "sanitized" allowed tag.

</details>

## Key Takeaways

- Vue's `{{ }}` interpolation and `v-bind` escape by default — `v-html` is the one deliberate escape hatch, and rendering unsanitized user content through it is a direct, exploitable XSS vulnerability.
- Sanitize with an allowlist library (DOMPurify), configuring both allowed tags *and* allowed attribute-value URL schemes together — a tag allowlist alone doesn't block a `javascript:` URL inside an otherwise-permitted `<a href>`.
- `:href`/`:src` bindings are escaped against breaking out of the attribute, but not validated for meaning — always check the URL scheme against an explicit allowlist before binding user-controlled URLs.
- CSP is defense-in-depth that blocks injected scripts from executing even if they make it into the DOM — a standard precompiled Vue SFC build typically doesn't need `'unsafe-eval'`.
- SSR-rendered HTML is exactly as vulnerable to injection as client-rendered `v-html` — sanitize at the point content is stored, not only at a single render call site, so every future rendering surface is protected.
- Treat `node_modules` as the real attack surface: use `npm ci` (not `npm install`) in CI/production to avoid silent lockfile drift, run `npm audit` continuously, and never embed a privileged credential in client code — anything in the bundle is public the moment it ships.
