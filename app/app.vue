<script setup lang="ts">
useHead({
  htmlAttrs: { lang: 'en' },
  title: 'Learn — Minimalist Monochrome',
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { name: 'theme-color', content: '#000000' },
    { name: 'charset', content: 'utf-8' },
    { name: 'robots', content: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1' },
    { name: 'author', content: 'Learn' },
    { name: 'format-detection', content: 'telephone=no' },
    { 'http-equiv': 'X-UA-Compatible', content: 'IE=edge' },
  ],
  link: [
    { rel: 'canonical', href: () => 'https://learn.example.com' + useRoute().path },
    { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
    { rel: 'manifest', href: '/site.webmanifest' },
    { rel: 'apple-touch-icon', href: '/favicon.ico' },
    { rel: 'preconnect', href: 'https://fonts.googleapis.com', crossorigin: '' },
    { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
    { rel: 'dns-prefetch', href: 'https://fonts.googleapis.com' },
  ],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'Learn',
        url: 'https://learn.example.com',
        description: 'A personal reading space built with Nuxt Content — Rust curriculum, programming guides, and technical documentation.',
        potentialAction: {
          '@type': 'SearchAction',
          target: 'https://learn.example.com/index?q={search_term_string}',
          'query-input': 'required name=search_term_string',
        },
      }),
    },
  ],
})

useSeoMeta({
  ogSiteName: 'Learn',
  ogType: 'website',
  twitterCard: 'summary_large_image',
  twitterSite: '@learn',
})
</script>

<template>
  <div class="min-h-screen font-sans antialiased">
    <AppHeader />

    <main class="relative z-10">
      <NuxtPage />
    </main>

    <footer class="relative z-10 mt-24 border-t-[4px] border-c-fg py-12">
      <div class="mx-auto flex max-w-6xl flex-col items-center gap-3 px-6 md:px-8 lg:px-12">
        <p class="font-serif text-xl font-bold tracking-tight">LEARN</p>
        <p class="font-mono text-xs uppercase tracking-widest text-c-muted-fg">
          {{ new Date().getFullYear() }} · Minimalist Monochrome
        </p>
      </div>
    </footer>
  </div>
</template>