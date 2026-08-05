<script setup lang="ts">
const props = defineProps<{
  error: {
    statusCode: number
    statusMessage?: string
    message?: string
  }
}>()

const handleError = () => clearError({ redirect: '/' })
</script>

<template>
  <div class="flex min-h-screen flex-col items-center justify-center px-6 font-sans antialiased">
    <div class="flex flex-col items-center gap-8 text-center">
      <div class="flex items-center gap-4">
        <div class="h-1 w-16 bg-c-fg" />
        <div class="h-4 w-4 border-2 border-c-fg" />
      </div>

      <h1 class="font-serif text-[10rem] font-black tracking-tighter text-c-fg sm:text-[14rem]" style="line-height: 0.8">
        {{ error?.statusCode || 500 }}
      </h1>

      <p class="max-w-md font-serif text-2xl font-bold tracking-tight text-c-fg sm:text-3xl">
        <template v-if="error?.statusCode === 404">
          Page not found
        </template>
        <template v-else>
          {{ error?.statusMessage || 'Something went wrong' }}
        </template>
      </p>

      <p class="max-w-md text-base leading-relaxed text-c-muted-fg">
        <template v-if="error?.statusCode === 404">
          The page you're looking for doesn't exist or has been moved.
        </template>
        <template v-else>
          An unexpected error occurred while rendering this page.
        </template>
      </p>

      <div class="flex flex-wrap items-center justify-center gap-4">
        <button
          type="button"
          class="inline-flex items-center gap-2 border-2 border-c-fg px-6 py-3 font-mono text-xs font-medium uppercase tracking-widest text-c-fg transition-colors duration-100 hover:bg-c-fg hover:text-c-bg"
          @click="handleError"
        >
          <span>&larr;</span>
          <span>Back home</span>
        </button>
        <NuxtLink
          to="/"
          class="inline-flex items-center gap-2 border-2 border-c-fg px-6 py-3 font-mono text-xs font-medium uppercase tracking-widest text-c-fg transition-colors duration-100 hover:bg-c-fg hover:text-c-bg"
        >
          <span>Browse index</span>
        </NuxtLink>
      </div>

      <div class="mt-8 flex items-center gap-4">
        <div class="h-1 w-16 bg-c-fg" />
        <div class="h-4 w-4 border-2 border-c-fg" />
      </div>
    </div>
  </div>
</template>