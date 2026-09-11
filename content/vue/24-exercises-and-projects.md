---
title: Vue 3 Engineering Reference — Exercises & Projects
description: Capstone projects building production-grade Vue 3 apps — reactive Kanban board, real-time chat with WebSocket, SSR blog with Nuxt, and component library with TypeScript generics.
---

# 24 — Exercises & Projects

## Project 1 — Reactive Kanban Board

::code-wrapper{language="typescript" filename="kanban/useBoard.ts"}
```typescript
import { ref, computed, watch, type Ref } from 'vue'

// ── Capstone: build a Kanban board with drag-and-drop, persistence ──
// Concepts: reactive state, computed derived state, watch for persistence,
// composable composition, scoped slots for column rendering.

interface Column {
  id: string
  title: string
  cardIds: string[]
}

interface Card {
  id: string
  title: string
  description: string
  columnId: string
  order: number
  createdAt: number
}

export function useKanbanBoard() {
  const columns: Ref<Column[]> = ref([])
  const cards: Ref<Card[]> = ref([])

  // ── Computed: cards grouped by column for rendering ──
  const cardsByColumn = computed(() => {
    const map = new Map<string, Card[]>()
    for (const col of columns.value) {
      map.set(col.id, cards.value
        .filter(c => c.columnId === col.id)
        .sort((a, b) => a.order - b.order))
    }
    return map
  })

  // ── Move card: update column + order ────────────────────
  function moveCard(cardId: string, toColumnId: string, toIndex: number) {
    const card = cards.value.find(c => c.id === cardId)
    if (!card) return

    const oldColumn = columns.value.find(c => c.id === card.columnId)
    const newColumn = columns.value.find(c => c.id === toColumnId)
    if (!oldColumn || !newColumn) return

    // Remove from old column's card list
    oldColumn.cardIds = oldColumn.cardIds.filter(id => id !== cardId)

    // Insert at new position in new column
    newColumn.cardIds.splice(toIndex, 0, cardId)
    card.columnId = toColumnId

    // Re-order all cards in the new column
    newColumn.cardIds.forEach((id, i) => {
      const c = cards.value.find(card => card.id === id)
      if (c) c.order = i
    })
  }

  function addCard(columnId: string, title: string) {
    const card: Card = {
      id: crypto.randomUUID(),
      title,
      description: '',
      columnId,
      order: cards.value.filter(c => c.columnId === columnId).length,
      createdAt: Date.now(),
    }
    cards.value.push(card)
    columns.value.find(c => c.id === columnId)?.cardIds.push(card.id)
  }

  // ── Persistence: auto-save to localStorage on every change ──
  watch([columns, cards], () => {
    localStorage.setItem('kanban', JSON.stringify({
      columns: columns.value,
      cards: cards.value,
    }))
  }, { deep: true })

  // ── Restore from localStorage on init ──────────────────
  function loadFromStorage() {
    const saved = localStorage.getItem('kanban')
    if (saved) {
      const data = JSON.parse(saved)
      columns.value = data.columns
      cards.value = data.cards
    } else {
      // Default columns
      columns.value = [
        { id: 'todo', title: 'To Do', cardIds: [] },
        { id: 'progress', title: 'In Progress', cardIds: [] },
        { id: 'done', title: 'Done', cardIds: [] },
      ]
    }
  }

  loadFromStorage()

  return { columns, cards, cardsByColumn, moveCard, addCard }
}
```
::

## Project 2 — Real-Time Chat with WebSocket

::code-wrapper{language="typescript" filename="chat/useChat.ts"}
```typescript
import { ref, onScopeDispose, type Ref } from 'vue'

// ── Capstone: real-time chat with WebSocket composable ──
// Concepts: WebSocket lifecycle, reconnection, message buffering,
// onScopeDispose for cleanup, reactive message list.

interface ChatMessage {
  id: string
  userId: string
  text: string
  timestamp: number
}

export function useChat(roomId: string) {
  const messages: Ref<ChatMessage[]> = ref([])
  const connected = ref(false)
  const error = ref<Error | null>(null)

  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempts = 0

  function connect() {
    // ── Clean up existing connection ──
    ws?.close()

    const url = `wss://chat.example.com/rooms/${roomId}`
    ws = new WebSocket(url)

    ws.onopen = () => {
      connected.value = true
      error.value = null
      reconnectAttempts = 0  // reset on successful connect
    }

    ws.onmessage = (event) => {
      const message: ChatMessage = JSON.parse(event.data)
      messages.value.push(message)
    }

    ws.onerror = (e) => {
      error.value = new Error('WebSocket error')
    }

    ws.onclose = () => {
      connected.value = false
      // ── Exponential backoff reconnection ────────────
      if (reconnectAttempts < 5) {
        const delay = Math.min(1000 * 2 ** reconnectAttempts, 30_000)
        reconnectTimer = setTimeout(() => {
          reconnectAttempts++
          connect()
        }, delay)
      }
    }
  }

  function send(text: string) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      error.value = new Error('Not connected')
      return
    }
    ws.send(JSON.stringify({ text, timestamp: Date.now() }))
  }

  // ── Cleanup: close WebSocket + clear timer on scope dispose ──
  onScopeDispose(() => {
    ws?.close()
    if (reconnectTimer) clearTimeout(reconnectTimer)
  })

  connect()  // start immediately

  return { messages, connected, error, send, reconnect: connect }
}
```
::

## Project 3 — SSR Blog with Nuxt

::code-wrapper{language="vue" filename="blog/pages/[slug].vue"}
```vue
<script setup>
// ── Capstone: Nuxt SSR blog with dynamic routes, SEO, markdown ──
// Concepts: useAsyncData for SSR data fetching, useHead for SEO,
// markdown rendering, static generation (SSG).

const route = useRoute()
const { data: post } = await useAsyncData(`post-${route.params.slug}`, async () => {
  // ── Fetch from API during SSR, hydrate on client ──
  const res = await $fetch(`/api/posts/${route.params.slug}`)
  return res
})

// ── SEO: dynamic meta tags from post data ──────────────
useHead({
  title: () => post.value?.title ?? 'Loading...',
  meta: [
    { name: 'description', content: () => post.value?.excerpt ?? '' },
    { property: 'og:title', content: () => post.value?.title ?? '' },
    { property: 'og:type', content: 'article' },
  ],
})

// ── Markdown rendering with sanitization ──────────────
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const renderedHtml = computed(() => {
  if (!post.value?.content) return ''
  return DOMPurify.sanitize(marked.parse(post.value.content))
})
</script>

<template>
  <article v-if="post">
    <h1>{{ post.title }}</h1>
    <time :datetime="post.publishedAt">{{ new Date(post.publishedAt).toLocaleDateString() }}</time>

    <!-- Sanitized markdown content -->
    <div class="prose" v-html="renderedHtml" />

    <RouterLink to="/">Back to all posts</RouterLink>
  </article>

  <div v-else>Post not found</div>
</template>
```

::code-wrapper{language="typescript" filename="blog/server/api/posts/[slug].get.ts"}
```typescript
// ── Nuxt server route: API endpoint for blog posts ─────
// File-based: server/api/posts/[slug].get.ts → GET /api/posts/:slug

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')

  // ── Fetch from database (parameterized query — injection-safe) ──
  const post = await db.prepare('SELECT * FROM posts WHERE slug = ?').get(slug)

  if (!post) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Post not found',
    })
  }

  return post
})
```
::

## Project 4 — Component Library with TypeScript Generics

::code-wrapper{language="vue" filename="library/DataSelect.vue"}
```vue
<script setup lang="ts" generic="T extends { id: string }">
// ── Capstone: reusable type-safe DataSelect component ──
// Concepts: generic components (3.3+), defineModel, defineEmits,
// typed props with generics, composable integration.

// ── Generic prop: T extends { id: string } constrains the item type ──
// Parent: <DataSelect :items="users" v-model="selectedUserId" />
// T is inferred as User (where User has an id property).
const props = defineProps<{
  items: T[]
  labelKey: keyof T  // which property to display as the label
  placeholder?: string
}>()

const model = defineModel<string>()  // selected id (string)

// ── Computed: selected item object (derived from id + items) ──
const selectedItem = computed(() =>
  props.items.find(item => item.id === model.value) ?? null
)

// ── Computed: display labels ────────────────────────────
const labels = computed(() =>
  props.items.map(item => ({
    id: item.id,
    label: String(item[props.labelKey]),  // cast to string for display
  }))
)

const isOpen = ref(false)

function select(id: string) {
  model.value = id  // defineModel handles the emit automatically
  isOpen.value = false
}

function close() { isOpen.value = false }

// ── Click outside: close dropdown when clicking elsewhere ──
const rootRef = ref<HTMLElement | null>(null)
onClickOutside(rootRef, close)
</script>

<template>
  <div ref="rootRef" class="data-select">
    <button @click="isOpen = !isOpen">
      {{ selectedItem ? selectedItem[labelKey] : placeholder ?? 'Select...' }}
    </button>

    <ul v-if="isOpen" class="options">
      <li
        v-for="item in items"
        :key="item.id"
        @click="select(item.id)"
        :class="{ selected: item.id === model }"
      >
        {{ item[labelKey] }}
      </li>
    </ul>
  </div>
</template>
```

::code-wrapper{language="vue" filename="library/DataTable.vue"}
```vue
<script setup lang="ts" generic="T extends Record<string, any>">
// ── Generic DataTable: type-safe columns + data ──
// Concepts: generic components, scoped slots with typed props,
// dynamic column configuration, renderless data layer.

interface Column<K extends string> {
  key: K
  label: string
  sortable?: boolean
}

const props = defineProps<{
  data: T[]
  columns: Column<keyof T & string>[]
}>()

const sortBy = ref<keyof T | null>(null)
const sortDir = ref<'asc' | 'desc'>('asc')

// ── Computed: sorted data (immutable — doesn't mutate prop) ──
const sortedData = computed(() => {
  if (!sortBy.value) return props.data
  return [...props.data].sort((a, b) => {
    const av = a[sortBy.value!]
    const bv = b[sortBy.value!]
    const cmp = av < bv ? -1 : av > bv ? 1 : 0
    return sortDir.value === 'asc' ? cmp : -cmp
  })
})

function toggleSort(col: Column<keyof T & string>) {
  if (!col.sortable) return
  if (sortBy.value === col.key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortBy.value = col.key
    sortDir.value = 'asc'
  }
}

// ── Scoped slot: pass row + column data to parent for custom rendering ──
// Parent: <DataTable :data="users" :columns="cols">
//   <template #cell="{ row, column, value }">{{ value }}</template>
// </DataTable>
</script>

<template>
  <table>
    <thead>
      <tr>
        <th
          v-for="col in columns"
          :key="col.key"
          @click="toggleSort(col)"
          :class="{ sortable: col.sortable }"
        >
          {{ col.label }}
          <span v-if="sortBy === col.key">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(row, index) in sortedData" :key="index">
        <td v-for="col in columns" :key="col.key">
          <!-- Scoped slot: parent gets row, column, and value ── -->
          <slot name="cell" :row="row" :column="col" :value="row[col.key]">
            {{ row[col.key] }}  <!-- default rendering if slot not filled -->
          </slot>
        </td>
      </tr>
    </tbody>
  </table>
</template>
```
::

## 💡 Tips & Tricks

::code-wrapper{language="typescript" filename="tips.ts"}
```typescript
// ── 1. Generic components: use <script setup generic="T"> for type-safe reuse ──
// T is inferred from props — no manual type annotation needed at call site.
// Constraint: generic="T extends { id: string }" ensures T has an id property.

// ── 2. Persistence with watch deep:true — auto-save on any nested change ──
// watch(state, saveToStorage, { deep: true }) — fires on any nested mutation.
// Debounce the save for frequent updates (don't write to localStorage per keystroke).

// ── 3. WebSocket reconnection: exponential backoff with max attempts ──
// delay = min(1000 * 2^attempts, 30_000) — caps at 30s, gives up after N tries.
// Reset attempts to 0 on successful connection.

// ── 4. Nuxt useAsyncData: unique key per route for cache isolation ──
// useAsyncData(`post-${slug}`, fetcher) — each post has its own cache entry.
// Without unique keys, navigating between posts shows stale data.

// ── 5. Component library: expose API via defineExpose + TypeScript ──
// Generic components can expose typed methods (validate, focus, reset) for
// parent use via template refs — fully type-checked at the call site.
```
::

## ⚠️ Edge Cases & Gotchas

::code-wrapper{language="typescript" filename="edge-cases.ts"}
```typescript
// ── 1. Generic components: T is erased at runtime — no instanceof checks ──
// generic="T" exists only at compile time. At runtime, all generics are `any`.
// Don't rely on T for runtime logic — use props for runtime values.

// ── 2. WebSocket: onclose fires even on intentional close() ──
// If you close() on unmount, onclose still fires → triggers reconnection.
// Set a flag (intentionalClose = true) before close() and check in onclose.

// ── 3. localStorage persistence: non-serializable values break ──
// Date objects → strings, Map/Set → {}, class instances lose methods.
// Use a replacer/reviver in JSON.stringify/parse, or store primitives only.

// ── 4. Nuxt useAsyncData: errors during SSR crash the page ──
// If the fetcher throws on server, the entire page render fails (500).
// Wrap in try/catch, or use the `default` option for fallback data.

// ── 5. Kanban drag-and-drop: HTML5 drag events are finicky ──
// dragstart, dragover (preventDefault!), drop — order and preventDefault matter.
// Use a library (vuedraggable, @vueuse/integrations/useSortable) for reliability.

// ── 6. Component library generics: scoped slot props are NOT typed with T ──
// <slot :row="row" /> — row is T, but the parent's slot prop is `any` unless
// the parent explicitly types it. Vue 3.4+ improves this with defineSlots.
```
::

## 🧠 Spot the Bug

A WebSocket chat reconnects even after the user intentionally navigates away.

::code-wrapper{language="typescript" filename="WSBug.ts"}
```typescript
let ws: WebSocket | null = null

function connect() {
  ws = new WebSocket(url)
  ws.onclose = () => {
    // ⚠️ Reconnects even after intentional close() on unmount
    setTimeout(connect, 1000)
  }
}

onScopeDispose(() => {
  ws?.close()  // this triggers onclose → reconnection!
})
```
::

<details>
<summary>Answer</summary>

`ws.close()` triggers the `onclose` handler, which schedules a reconnection. The component is unmounted, but the WebSocket reconnects in the background — wasting resources and potentially causing errors when it tries to update unmounted reactive state.

**Fix** — set a flag before closing and check it in `onclose`:

::code-wrapper{language="typescript" filename="WSFixed.ts"}
```typescript
let ws: WebSocket | null = null
let intentionalClose = false

function connect() {
  ws = new WebSocket(url)
  ws.onclose = () => {
    if (intentionalClose) return  // don't reconnect on intentional close
    setTimeout(connect, 1000)
  }
}

onScopeDispose(() => {
  intentionalClose = true  // set flag before close
  ws?.close()               // onclose sees the flag → no reconnect
})
```
::

**The lesson**: `WebSocket.close()` triggers `onclose`, which runs reconnection logic. Set an `intentionalClose` flag before closing to prevent the reconnect handler from firing after the component unmounts.

</details>