# 19 — The DOM

## Selecting Elements

::code-wrapper{language="javascript"}
```javascript
// Modern — querySelector / querySelectorAll
const el = document.querySelector('#app .content')
const items = document.querySelectorAll('.item')  // NodeList (not array)

// Convert NodeList to array for .map/.filter
const arr = [...items]
const arr2 = Array.from(items)

// Legacy
document.getElementById('app')
document.getElementsByClassName('item')    // HTMLCollection (live!)
document.getElementsByTagName('div')      // HTMLCollection (live!)
```
::
::

## Creating and Modifying

::code-wrapper{language="javascript"}
```javascript
// Create
const div = document.createElement('div')
div.textContent = 'Hello'
div.className = 'alert'
div.id = 'notification'

// Set attributes
div.setAttribute('data-role', 'message')
div.getAttribute('data-role')  // 'message'
div.hasAttribute('data-role')  // true
div.removeAttribute('data-role')

// Dataset — data-* attributes
div.dataset.userId = '123'  // <div data-user-id="123">
div.dataset.userId          // '123'

// Classes (classList)
div.classList.add('active')
div.classList.remove('hidden')
div.classList.toggle('visible')
div.classList.contains('active')  // true
div.classList.replace('old', 'new')

// Insert
document.body.appendChild(div)
document.body.insertBefore(div, referenceEl)
document.body.append(div, anotherEl)  // append multiple
document.body.prepend(div)

// Remove
div.remove()
div.parentElement.removeChild(div)  // old way
```
::
::

## Traversing

::code-wrapper{language="javascript"}
```javascript
const el = document.querySelector('.item')

el.parentElement        // parent
el.children             // HTMLCollection of children
el.firstElementChild    // first child element
el.lastElementChild     // last child element
el.nextElementSibling   // next sibling element
el.previousElementSibling  // previous sibling element

// Text/element nodes (includes text nodes)
el.childNodes           // all nodes (including text)
el.firstChild           // could be a text node
el.nextSibling          // could be a text node
```
::
::

## Best Practices

::code-wrapper{language="javascript"}
```javascript
// ✅ Use textContent, not innerHTML (XSS protection)
el.textContent = userInput  // safe
el.innerHTML = userInput    // ❌ XSS risk!

// ✅ Use innerHTML only for trusted static content
el.innerHTML = '<p>Safe static HTML</p>'

// ✅ Batch DOM updates with DocumentFragment
const fragment = document.createDocumentFragment()
for (let i = 0; i < 100; i++) {
  const li = document.createElement('li')
  li.textContent = `Item ${i}`
  fragment.appendChild(li)
}
ul.appendChild(fragment)  // single reflow
```
::
::

## 💡 Tips & Tricks

**`matches()` for delegation-style checks** — `el.matches('.item.active')` tests an element against a selector without querying the DOM — pairs well with `closest()` for delegated event handling.

**`replaceChildren()` clears and replaces in one call** — `el.replaceChildren()` empties a node faster and more safely than `el.innerHTML = ''`; `el.replaceChildren(newChild)` swaps content atomically.

**`insertAdjacentHTML` for precise placement** — `el.insertAdjacentHTML('beforeend', html)` inserts markup relative to an element (`beforebegin`, `afterbegin`, `beforeend`, `afterend`) without destroying existing children like `innerHTML +=` would.

**Live vs static collections affect loops** — `getElementsByClassName` returns a live `HTMLCollection` that updates as the DOM changes; `querySelectorAll` returns a static `NodeList`. Use the static version when iterating and mutating.

**`element.closest(selector)` walks up, including itself** — Useful for "is this click inside a modal" checks: `if (!e.target.closest('.modal')) closeModal()`.

## ⚠️ Edge Cases & Gotchas

**`innerHTML +=` re-parses the entire subtree** — `el.innerHTML += '<li>New</li>'` destroys and recreates every existing child node, losing event listeners and resetting form state, animations, and scroll positions attached to them — even though only one item was "added".

**Live `HTMLCollection`s change under you mid-loop** — `const items = document.getElementsByClassName('item'); for (let i = 0; i < items.length; i++) { items[i].remove() }` skips every other element, because removing an item shrinks the live collection and shifts indices as you iterate.

**`textContent` vs `innerText` differ on hidden elements** — `el.innerText` returns `''` for `display: none` elements (it respects rendering/CSS), while `el.textContent` still returns the raw text. `innerText` also triggers a reflow because it needs layout info; `textContent` doesn't.

**`childNodes` includes whitespace text nodes** — `<div>  <span></span>  </div>` has `children.length === 1` but `childNodes.length === 3` (whitespace before/after the span counts as text nodes) — a frequent off-by-one trap when walking the raw node tree.

**`dataset` keys are camelCased, and hyphens don't round-trip cleanly** — `data-user-id` becomes `dataset.userId`, but `data-XYZ` (uppercase after `data-`) does not reliably map back to `dataset.XYZ` — the HTML spec lowercases attribute names, so mixed-case custom attributes silently break the mapping.

## 🧠 Spot the Bug

What does this log?

::code-wrapper{language="javascript"}
```javascript
const list = document.createElement('ul')
list.innerHTML = '<li>A</li><li>B</li><li>C</li>'
document.body.appendChild(list)

const items = document.getElementsByClassName('placeholder')
list.querySelectorAll('li').forEach((li, i) => li.classList.add('placeholder'))

for (let i = 0; i < items.length; i++) {
  items[i].remove()
  console.log('Removed one, remaining:', items.length)
}
```
::

<details>
<summary>Answer</summary>

It logs `Removed one, remaining: 2` then `Removed one, remaining: 1` — only two lines print even though three `<li>` elements had the class, because `getElementsByClassName` returns a **live** `HTMLCollection`. Each `.remove()` call shrinks `items` immediately, so `items.length` drops as the loop runs, and the loop condition `i < items.length` becomes false one iteration early.

**The lesson**: convert live collections to a static array (`[...items]` or `Array.from(items)`) before removing or reordering elements inside a loop.

</details>

## Key Takeaways

- Use `querySelector`/`querySelectorAll` — modern, flexible, CSS-selector based.
- `textContent` is XSS-safe; `innerHTML` is not — never use with user input.
- `classList` API is cleaner than manipulating `className` string.
- Batch DOM updates with `DocumentFragment` — reduces reflows.
- `dataset` maps `data-*` attributes — camelCase in JS, kebab-case in HTML.