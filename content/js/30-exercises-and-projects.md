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

### 5. Markdown Parser (string manipulation, regex)

### 6. Real-time Chat (WebSocket, events, closures)

## Advanced

### 7. Promise Library (implement Promise from scratch)

### 8. Mini Framework (virtual DOM, diffing, reactivity)

### 9. Function Library (lodash-style: debounce, throttle, curry, memoize)

### 10. Type Checker (mini TypeScript — parse and validate types at runtime)

## Key Takeaways

- Start small — Todo app covers DOM, events, storage, and state management.
- Weather app teaches async/await, fetch, and error handling.
- Build a promise library to deeply understand async JavaScript.
- Ship projects — deploy to GitHub Pages, Vercel, or Netlify.