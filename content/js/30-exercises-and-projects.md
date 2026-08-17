# 30 — Exercises & Project Ideas

## Beginner

### 1. Todo List (DOM, events, localStorage)

::code-wrapper{language="javascript"}
```javascript
// Build a todo list with add, complete, delete, filter, localStorage persistence
class TodoApp {
  #todos = []

  add(text) {
    this.#todos = [...this.#todos, { id: crypto.randomUUID(), text, done: false }]
    this.save()
    this.render()
  }

  toggle(id) {
    this.#todos = this.#todos.map(t => t.id === id ? { ...t, done: !t.done } : t)
    this.save()
    this.render()
  }

  remove(id) {
    this.#todos = this.#todos.filter(t => t.id !== id)
    this.save()
    this.render()
  }

  save() { localStorage.setItem('todos', JSON.stringify(this.#todos)) }
  load() { this.#todos = JSON.parse(localStorage.getItem('todos') || '[]') }
  render() { /* update DOM */ }
}
```
::
::

### 2. Calculator (functions, events)

### 3. Quiz App (objects, arrays, conditional logic)

## Intermediate

### 4. Weather App (fetch, async/await, error handling)

::code-wrapper{language="javascript"}
```javascript
async function getWeather(city) {
  try {
    const res = await fetch(`https://api.weatherapi.com/v1/current.json?key=${API_KEY}&q=${city}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return { city: data.location.name, temp: data.current.temp_c }
  } catch (err) {
    console.error('Weather fetch failed:', err)
    return null
  }
}
```
::
::

### 5. Markdown Parser (string manipulation, regex)

### 6. Real-time Chat (WebSocket, events, closures)

## Advanced

### 7. Promise Library (implement Promise from scratch)

### 8. Mini Framework (virtual DOM, diffing, reactivity)

### 9. Function Library (lodash-style: debounce, throttle, curry, memoize)

### 10. Type Checker (mini TypeScript — parse and validate types at runtime)

## 💡 Tips & Tricks

**Build vertically, not horizontally** — Get one feature fully working end-to-end (e.g. adding a todo, saving it, rendering it) before starting the next, rather than building all the UI first and wiring up logic later — you'll catch integration bugs immediately instead of at the end.

**Constrain yourself before reaching for a framework** — Building the Todo app or Mini Framework in plain JavaScript first (no React/Vue) forces you to understand what the framework is actually doing under the hood — DOM diffing, event delegation, state-to-render syncing.

**Write the test cases before the implementation for the Function Library project** — Since `debounce`, `throttle`, `curry`, and `memoize` all have well-known edge cases (rapid calls, zero-arg functions, `this` binding), writing `it('debounces rapid calls', ...)` first clarifies exactly what "correct" means before you write a line of implementation.

**Commit after every working milestone, not just at the end** — Small, frequent commits (`git commit -m "todo: add localStorage persistence"`) let you bisect back to a working state if a later refactor breaks something, especially useful in the Advanced projects where a single bug (e.g. in the Promise Library) can be hard to isolate later.

**Read one production library's source before building your own version** — Before attempting the Function Library or Mini Framework, skim the actual source of `lodash.debounce` or a small virtual-DOM implementation — you'll reuse fewer wrong assumptions and recognize the real edge cases (leading vs trailing calls, key-based reconciliation) instead of discovering them the hard way.

## Key Takeaways

- Start small — Todo app covers DOM, events, storage, and state management.
- Weather app teaches async/await, fetch, and error handling.
- Build a promise library to deeply understand async JavaScript.
- Ship projects — deploy to GitHub Pages, Vercel, or Netlify.