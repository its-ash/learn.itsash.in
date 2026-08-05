<script setup lang="ts">
withDefaults(defineProps<{
  to?: string
  label?: string
  fallback?: boolean
}>(), {
  label: 'Back',
  fallback: true,
})

const router = useRouter()

function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push('/')
  }
}
</script>

<template>
  <component
    :is="to ? NuxtLink : 'button'"
    v-bind="to ? { to } : { type: 'button', onClick: goBack }"
    class="group inline-flex items-center gap-2 border-2 border-c-fg px-5 py-2.5 font-mono text-xs font-medium uppercase tracking-widest text-c-fg transition-colors duration-100 hover:bg-c-fg hover:text-c-bg focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-3"
  >
    <span>&larr;</span>
    <span>{{ label }}</span>
  </component>
</template>