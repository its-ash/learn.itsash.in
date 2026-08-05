<script setup lang="ts">
const props = defineProps<{
  href?: string
  target?: string
  rel?: string
}>()

const route = useRoute()

const resolvedHref = computed(() => {
  const href = props.href || ''
  if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('#') || href.startsWith('/')) {
    return href
  }
  const base = route.path.replace(/\/$/, '')
  const stripped = href.replace(/^\.?\//, '').replace(/\.md$/, '')
  const segments = base.split('/').filter(Boolean)
  segments.pop()
  return '/' + [...segments, stripped].join('/')
})
</script>

<template>
  <NuxtLink :to="resolvedHref">
    <slot />
  </NuxtLink>
</template>