<script setup lang="ts">
const progress = ref(0)
const el = ref<HTMLElement | null>(null)

function onScroll() {
  if (!el.value || !document.documentElement) return
  const doc = document.documentElement
  const scrolled = doc.scrollTop
  const max = doc.scrollHeight - doc.clientHeight
  progress.value = max > 0 ? Math.min(100, (scrolled / max) * 100) : 0
}

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
})
</script>

<template>
  <div
    ref="el"
    aria-hidden="true"
    class="fixed inset-x-0 top-0 z-[60] h-0.5 bg-transparent"
  >
    <div
      class="h-full bg-c-fg transition-[width] duration-100 ease-out"
      :style="{ width: progress + '%' }"
    />
  </div>
</template>