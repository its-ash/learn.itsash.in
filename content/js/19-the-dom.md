---
title: "JavaScript 19 — DOM Internals: Selection, Mutation & Live Collections"
description: "Deep-dive into the DOM API: selection methods (querySelector vs getElementById), node types, live vs static collections, DocumentFragment for batch insertion, mutation observation, and Shadow DOM encapsulation. Code-first reference for senior engineers."
---

# 19 — DOM Internals: Selection, Mutation & Live Collections

## DOM Selection Methods

::code-wrapper{language="javascript"}
```javascript
// ── Selection methods (ranked by specificity and performance) ──

// getElementById: fastest, returns a single element (or null)
const el = document.getElementById("header");  // O(1) — hashed lookup by ID
// Only works for IDs. Returns the first match (IDs should be unique).

// querySelector: CSS selector, returns first match (or null)
const first = document.querySelector(".item");          // first .item
const nested = document.querySelector(".container > .item:first-child");
const complex = document.querySelector('[data-role="admin"]:not(.disabled)');

// querySelectorAll: returns a STATIC NodeList (not live — doesn't update)
const items = document.querySelectorAll(".item");  // NodeList (array-like, has forEach)
items.forEach(item => console.log(item.textContent));
// ⚠️ This is a SNAPSHOT — if you add a new .item later, this NodeList doesn't update.

// getElementsByClassName / getElementsByTagName: return LIVE HTMLCollection
const liveItems = document.getElementsByClassName("item");  // HTMLCollection (LIVE)
const allDivs = document.getElementsByTagName("div");     // HTMLCollection (LIVE)
// ⚠️ LIVE collection: if you add/remove elements, the collection updates automatically.
// This can cause bugs in loops (adding elements extends the loop → infinite loop).

// ── Live collection loop trap ──
const divs = document.getElementsByTagName("div");
// ❌ NAIVE — modifying the DOM while iterating a live collection
// for (let i = 0; i < divs.length; i++) {
//     document.body.appendChild(document.createElement("div"));  // adds to DOM → divs.length grows
// }  // infinite loop! (divs.length keeps increasing)
// ✅ FIX: cache the length first, or use a static copy
for (let i = 0, len = divs.length; i < len; i++) { ... }
// Or: const staticCopy = [...document.getElementsByTagName("div")];
```
::

## Anti-Pattern: Repeated Layout Thrashing (Reflow)

::code-wrapper{language="javascript"}
```javascript
// ❌ NAIVE — reading and writing layout alternately (forces reflow each time)
const items = document.querySelectorAll(".item");
items.forEach(item => {
    const width = item.offsetWidth;   // READ: forces layout calculation (reflow)
    item.style.width = width + 10 + "px";  // WRITE: invalidates layout
    // Next iteration: offsetWidth reads again → another reflow!
});
// N elements → N reflows (very expensive — each reflow recalculates the whole page layout)

// ✅ CORRECT — batch reads first, then batch writes (minimize reflows)
const items = document.querySelectorAll(".item");
// Phase 1: read all layout values
const widths = [...items].map(item => item.offsetWidth);  // all reads at once (1 reflow)
// Phase 2: write all styles
items.forEach((item, i) => {
    item.style.width = widths[i] + 10 + "px";  // all writes at once (1 reflow)
});
// Total: 2 reflows (instead of 2*N) — much faster.

// ✅ BEST — use requestAnimationFrame for DOM writes
function batchDOMUpdates(updates) {
    // Collect all updates, apply them in a single frame
    requestAnimationFrame(() => {
        for (const [el, style] of updates) {
            Object.assign(el.style, style);
        }
    });
}
```
::

## DocumentFragment: Batch DOM Insertion

::code-wrapper{language="javascript"}
```javascript
// ❌ NAIVE — appending elements one at a time (N reflows for N elements)
for (let i = 0; i < 1000; i++) {
    const li = document.createElement("li");
    li.textContent = `Item ${i}`;
    document.querySelector("ul").appendChild(li);  // each append triggers a reflow
}
// 1000 appends → 1000 reflows (very slow)

// ✅ CORRECT — use DocumentFragment (batch all insertions, 1 reflow)
const fragment = document.createDocumentFragment();  // lightweight container (no DOM node)
for (let i = 0; i < 1000; i++) {
    const li = document.createElement("li");
    li.textContent = `Item ${i}`;
    fragment.appendChild(li);  // append to fragment (no reflow — fragment isn't in the DOM)
}
document.querySelector("ul").appendChild(fragment);  // 1 append → 1 reflow (all 1000 items inserted at once)

// ✅ ALSO CORRECT — build a string and use innerHTML (1 reflow, but no event listeners on innerHTML)
const html = Array.from({ length: 1000 }, (_, i) => `<li>Item ${i}</li>`).join("");
document.querySelector("ul").innerHTML = html;  // 1 reflow (but XSS risk if data is untrusted!)
// ⚠️ innerHTML with user data = XSS vulnerability. Sanitize or use textContent / DOM methods.
```
::

## DOM Traversal

::code-wrapper{language="javascript"}
```javascript
const el = document.querySelector(".container");

// ── Tree traversal ──
el.parentNode;           // direct parent (or null)
el.parentElement;        // parent if it's an element (or null if parent is not element)
el.childNodes;           // NodeList of ALL children (including text nodes, comments)
el.children;            // HTMLCollection of ELEMENT children only (no text/comment nodes)
el.firstChild;          // first child (including text nodes — might be a whitespace text node)
el.firstElementChild;   // first ELEMENT child (skips text/comment nodes)
el.lastElementChild;    // last element child
el.nextElementSibling;  // next sibling element
el.previousElementSibling;  // previous sibling element

// ── closest: traverse UP the tree (find nearest ancestor matching selector) ──
const button = document.querySelector("button");
const row = button.closest("tr");  // nearest ancestor <tr> (or null)
const form = button.closest("form");

// ── matches: check if element matches a CSS selector ──
if (el.matches(".active")) { ... }
if (el.matches("[data-action='delete']")) { ... }

// ── contains: check if an element is a descendant ──
if (parentEl.contains(childEl)) { ... }  // true if childEl is inside parentEl (or is parentEl)
// Useful for click-outside detection:
document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target)) dropdown.close();
});
```
::

## MutationObserver: Watching DOM Changes

::code-wrapper{language="javascript"}
```javascript
// ── MutationObserver: watch for DOM mutations (efficient, async) ──
const observer = new MutationObserver((mutations, obs) => {
    // mutations: array of MutationRecord (what changed)
    for (const mutation of mutations) {
        if (mutation.type === "childList") {
            console.log("children changed");
            console.log("added:", mutation.addedNodes);    // NodeList of added nodes
            console.log("removed:", mutation.removedNodes); // NodeList of removed nodes
        }
        if (mutation.type === "attributes") {
            console.log("attribute changed:", mutation.attributeName);
            console.log("old value:", mutation.oldValue);
        }
        if (mutation.type === "characterData") {
            console.log("text content changed");
        }
    }
});

// Start observing (with options)
observer.observe(document.body, {
    childList: true,      // watch for added/removed children
    subtree: true,        // watch all descendants (not just direct children)
    attributes: true,     // watch attribute changes
    attributeOldValue: true,  // record old attribute values
    characterData: true,  // watch text content changes
    characterDataOldValue: true,
});

// Stop observing (when done — prevents memory leaks)
// observer.disconnect();

// ── Use case: infinite scroll (observe last element visibility) ──
const sentinel = document.querySelector(".scroll-sentinel");
const scrollObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
        loadMoreContent();  // load next page when sentinel is visible
    }
}, { rootMargin: "100px" });  // trigger 100px before sentinel enters viewport
scrollObserver.observe(sentinel);
```
::

## 💡 Tips & Tricks

::code-wrapper{language="javascript"}
```javascript
// ── data-* attributes for metadata ──
const el = document.querySelector("[data-user-id]");
el.dataset.userId;   // "123" (camelCase: data-user-id → dataset.userId)
el.dataset.role;     // "admin"
el.dataset.customKey = "value";  // sets data-custom-key

// ── classList API (no manual string manipulation) ──
el.classList.add("active", "visible");      // add multiple classes
el.classList.remove("hidden");              // remove
el.classList.toggle("active");              // toggle (add if absent, remove if present)
el.classList.toggle("active", condition);  // toggle based on condition
el.classList.replace("old", "new");         // replace
el.classList.contains("active");            // check

// ── Create and configure elements in one step ──
function createElement(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (key === "class") el.className = value;
        else if (key === "style") Object.assign(el.style, value);
        else if (key.startsWith("on") && typeof value === "function") {
            el.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key in el) el[key] = value;
        else el.setAttribute(key, value);
    }
    for (const child of children) {
        el.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    }
    return el;
}
const div = createElement("div", { class: "card", onClick: handler }, "Hello");

// ── Avoid layout thrashing with getBoundingClientRect ──
const rect = el.getBoundingClientRect();  // READ (1 reflow)
// Now you have: rect.top, rect.left, rect.width, rect.height, rect.bottom, rect.right
// Use these cached values — don't read them again after DOM modifications.

// ── Shadow DOM for style encapsulation ──
const host = document.querySelector("#host");
const shadow = host.attachShadow({ mode: "open" });
shadow.innerHTML = `
    <style>:host { display: block; padding: 10px; } p { color: red; }</style>
    <p>Shadow content</p>
`;
// Styles in shadow DOM don't leak out, page styles don't leak in (encapsulation)
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="javascript"}
```javascript
// ── Live collections update automatically (can cause loop bugs) ──
const divs = document.getElementsByTagName("div");
for (let i = 0; i < divs.length; i++) {
    document.body.appendChild(document.createElement("div"));  // divs.length grows → infinite loop
}
// Fix: cache length, or use a static copy ([...divs] or querySelectorAll).

// ── querySelectorAll returns a STATIC NodeList (not live) ──
const items = document.querySelectorAll(".item");
document.body.appendChild(document.createElement("div")).className = "item";
items.length;  // unchanged (static snapshot — doesn't reflect new .item)

// ── firstChild includes text nodes (whitespace) ──
// <div>\n  <span>text</span>\n</div>
// div.firstChild is a text node (the "\n  " whitespace), NOT the span
// Use firstElementChild for elements only.

// ── innerHTML is XSS-prone with user data ──
// ❌ el.innerHTML = `<div>${userInput}</div>`;  // XSS if userInput has <script>
// ✅ el.textContent = userInput;  // safe (escaped automatically)
// ✅ el.innerHTML = `<div>${escapeHtml(userInput)}</div>`;  // escape manually

// ── offsetWidth/offsetHeight force reflow (layout calculation) ──
// Reading offsetWidth after a style change forces the browser to recalculate layout.
// Batch reads: const w = el.offsetWidth (read once, use multiple times).

// ── textContent vs innerHTML ──
el.textContent = "<b>not bold</b>";  // displays literally (escaped)
el.innerHTML = "<b>bold</b>";        // parses HTML (renders as bold)
// Use textContent for plain text (safe). Use innerHTML only for trusted HTML.
```
::

## 🧠 Quick Quiz

What's wrong with this code?

::code-wrapper{language="javascript"}
```javascript
const items = document.getElementsByClassName("item");
for (let i = 0; i < items.length; i++) {
    if (items[i].dataset.active === "true") {
        items[i].remove();
    }
}
```
::

<details>
<summary>Answer</summary>

`getElementsByClassName` returns a **live** `HTMLCollection`. When you `remove()` an element, the collection **shrinks immediately**. This causes the loop to skip elements:

- Iteration 0: `i=0`, remove `items[0]` → collection shrinks, `items[0]` is now the former `items[1]`
- Iteration 1: `i=1`, but `items[1]` is now the former `items[2]` (former `items[1]` moved to index 0)
- The former `items[1]` is **never checked** — skipped!

**Fix**: iterate backwards (removing from the end doesn't shift indices):

```javascript
const items = document.getElementsByClassName("item");
for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].dataset.active === "true") {
        items[i].remove();
    }
}
```

Or use a static copy:

```javascript
const items = [...document.getElementsByClassName("item")];  // static array
items.forEach(item => { if (item.dataset.active === "true") item.remove(); });
```

**The lesson**: live collections (`getElementsBy*`) update in real-time. Removing elements during forward iteration causes index shifting and skipped elements. Iterate backwards or use a static copy.

</details>