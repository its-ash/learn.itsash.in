import tailwindcssVite from '@tailwindcss/vite'
import { readdirSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

const contentDir = resolve('content')
const contentRoutes: string[] = []

for (const entry of readdirSync(contentDir)) {
  const entryPath = join(contentDir, entry)
  if (!statSync(entryPath).isDirectory()) {
    if (entry.endsWith('.md') && entry !== 'index.md') {
      contentRoutes.push('/' + entry.replace(/\.md$/, ''))
    }
    continue
  }
  for (const file of readdirSync(entryPath)) {
    if (!file.endsWith('.md')) continue
    const slug = file.replace(/\.md$/, '')
    if (slug === 'index') {
      contentRoutes.push('/' + entry)
    } else {
      contentRoutes.push('/' + entry + '/' + slug)
    }
  }
}

export default defineNuxtConfig({
  modules: [
    '@nuxt/content',
    '@nuxt/icon',
    '@nuxt/image',
    '@nuxt/scripts',
    '@nuxtjs/google-fonts',
  ],
  ssr: true,
  devtools: { enabled: false },
  compatibilityDate: '2024-04-03',
  app: {
    baseURL: '/',
    buildAssetsDir: '/_nuxt/',
  },
  nitro: {
    output: {
      publicDir: 'docs',
    },
    rollupConfig: {
      onwarn(warning, defaultHandler) {
        if (warning.code === 'UNUSED_EXTERNAL_IMPORT') return
        defaultHandler(warning)
      },
    },
    prerender: {
      crawlLinks: true,
      routes: [
        '/',
        '/browse',
        ...contentRoutes,
        '/404.html',
      ],
      failOnError: false,
    },
  },
  content: {
    build: {
      markdown: {
        highlight: false,
      },
    },
  },
  build: {
    transpile: [],
  },
  css: ['~/assets/css/tailwind.css', '~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcssVite()],
  },
  googleFonts: {
    families: {
      'Playfair Display': [400, 500, 700, 900],
      'Source Serif 4': [400, 500, 600],
      'JetBrains Mono': [400, 500],
    },
    display: 'swap',
    preconnect: true,
  },
  icon: {
    serverBundle: 'local',
    clientBundle: {
      scan: true,
    },
  },
})