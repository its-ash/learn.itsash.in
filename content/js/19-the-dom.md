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

## Key Takeaways

- Use `querySelector`/`querySelectorAll` — modern, flexible, CSS-selector based.
- `textContent` is XSS-safe; `innerHTML` is not — never use with user input.
- `classList` API is cleaner than manipulating `className` string.
- Batch DOM updates with `DocumentFragment` — reduces reflows.
- `dataset` maps `data-*` attributes — camelCase in JS, kebab-case in HTML.