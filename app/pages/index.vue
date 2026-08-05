<script setup lang="ts">
const search = ref('')
const isFocused = ref(false)

const { data: pages } = await useAsyncData('all-pages', () =>
  queryCollection('content').all()
)

useSeoMeta({
  title: 'Index — Browse All Content — Learn',
  description: 'Search and browse all available programming guides, Rust curriculum chapters, and technical documentation. Find exactly what you need.',
  ogTitle: 'Index — Browse All Content',
  ogDescription: 'Search and browse all available programming guides, Rust curriculum chapters, and technical documentation.',
  ogType: 'website',
  robots: 'index, follow',
})

useHead({
  link: [{ rel: 'canonical', href: 'https://learn.example.com/index' }],
})

const allItems = computed(() =>
  (pages.value || [])
    .filter((p: any) => p.path && p.path !== '/' && p.path !== '/index')
    .map((p: any) => {
      const segments = p.path.split('/').filter(Boolean)
      const category = segments[0] || 'misc'
      const isSectionReadme = segments.length === 2 && segments[1] === 'readme'
      return {
        path: p.path,
        title: p.title || segments.pop() || p.path,
        description: p.description || '',
        category,
        depth: segments.length,
        isSectionReadme,
        label: formatLabel(p.path),
      }
    })
)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return allItems.value
  return allItems.value.filter(
    (i) =>
      i.title.toLowerCase().includes(q) ||
      i.path.toLowerCase().includes(q) ||
      i.description.toLowerCase().includes(q) ||
      i.category.toLowerCase().includes(q)
  )
})

const dropdownResults = computed(() => {
  if (!search.value.trim()) return []
  return filtered.value.slice(0, 8)
})

const grouped = computed(() => {
  const seen = new Set<string>()
  const items = filtered.value.filter((i) => {
    if (seen.has(i.category)) return false
    if (i.category === 'rust') {
      if (i.isSectionReadme || i.depth <= 1) {
        seen.add(i.category)
        return true
      }
      return false
    }
    seen.add(i.category)
    return true
  })

  const map: Record<string, typeof items> = {}
  for (const item of items) {
    if (!map[item.category]) map[item.category] = []
    map[item.category].push(item)
  }
  return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]))
})

function formatLabel(path: string) {
  return path
    .split('/')
    .pop()!
    .replace(/-/g, ' ')
    .replace(/^\d+\s+/, '')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function selectResult() {
  if (dropdownResults.value.length > 0) {
    navigateTo(dropdownResults.value[0].path)
  }
}
</script>

<template>
  <section class="relative z-10 py-16 md:py-24 lg:py-32">
    <div class="mx-auto max-w-6xl px-6 md:px-8 lg:px-12">
      <div class="mb-12 flex items-center gap-4">
        <div class="h-1 w-16 bg-c-fg" />
        <div class="h-4 w-4 border-2 border-c-fg" />
      </div>

      <h1
        class="mb-2 font-serif text-6xl font-black tracking-tighter sm:text-7xl md:text-8xl"
        style="line-height: 1"
      >
        Index
      </h1>
      <p class="mb-12 max-w-xl text-lg leading-relaxed text-c-muted-fg">
        Every section in the library, searchable. Type to filter.
      </p>

      <div class="relative mb-16 border-[2px] border-c-fg">
        <input
          v-model="search"
          type="text"
          placeholder="Search pages..."
          autocomplete="off"
          class="h-14 w-full border-none bg-transparent px-5 font-mono text-sm uppercase tracking-widest text-c-fg placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-c-muted-fg focus:outline-none"
          @focus="isFocused = true"
          @blur="setTimeout(() => isFocused = false, 150)"
          @keydown.enter="selectResult"
        />

        <div
          v-if="isFocused && dropdownResults.length > 0"
          class="absolute inset-x-0 top-full z-50 mt-px border-[2px] border-t-0 border-c-fg bg-c-bg"
        >
          <NuxtLink
            v-for="item in dropdownResults"
            :key="item.path"
            :to="item.path"
            class="group flex items-center justify-between gap-4 border-b border-c-border-light px-5 py-3 transition-colors duration-100 last:border-0 hover:bg-c-fg"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate font-serif text-base font-medium text-c-fg group-hover:text-c-bg">
                {{ item.label }}
              </p>
              <p class="mt-0.5 truncate font-mono text-xs uppercase tracking-widest text-c-muted-fg group-hover:text-c-bg/70">
                {{ item.category }} · {{ item.path }}
              </p>
            </div>
            <span class="shrink-0 font-mono text-xs text-c-muted-fg group-hover:text-c-bg">&rarr;</span>
          </NuxtLink>
        </div>
      </div>

      <div v-if="grouped.length === 0" class="py-24 text-center">
        <p class="font-serif text-3xl italic text-c-muted-fg">
          No results found.
        </p>
      </div>

      <div v-else class="space-y-16">
        <div v-for="[category] in grouped" :key="category">
          <NuxtLink
            :to="'/' + category"
            class="group block border border-c-fg transition-colors duration-100 hover:bg-c-fg"
          >
            <div class="flex items-center justify-between gap-4 px-5 py-6">
              <h2 class="font-serif text-3xl font-bold capitalize tracking-tight text-c-fg group-hover:text-c-bg">
                {{ category }}
              </h2>
              <span class="shrink-0 font-mono text-xs uppercase tracking-widest text-c-muted-fg group-hover:text-c-bg">
                &rarr;
              </span>
            </div>
          </NuxtLink>
        </div>
      </div>
    </div>
  </section>
</template>