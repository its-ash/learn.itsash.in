import tailwindcssVite from '@tailwindcss/vite'

export default defineNuxtConfig({
  modules: [
    '@nuxt/content',
    '@nuxt/icon',
    '@nuxt/image',
    '@nuxt/scripts',
    '@nuxtjs/google-fonts',
  ],
  ssr: false,
  devtools: { enabled: false },
  compatibilityDate: '2024-04-03',
  site: {
    url: 'https://learn.example.com',
    name: 'Learn',
  },
  content: {
    build: {
      markdown: {
        highlight: false,
      },
    },
  },
  build: {
    transpile: [
      '@codemirror/language',
      '@codemirror/legacy-modes',
      '@lezer/highlight',
      '@lezer/rust',
      '@lezer/markdown',
      '@lezer/python',
      '@lezer/yaml',
      '@lezer/json',
      '@lezer/javascript',
      '@lezer/common',
    ],
  },
  css: ['~/assets/css/tailwind.css', '~/assets/css/main.css'],
  vite: {
    plugins: [tailwindcssVite()],
    optimizeDeps: {
      include: [
        '@codemirror/language',
        '@codemirror/legacy-modes/mode/toml',
        '@codemirror/legacy-modes/mode/shell',
        '@codemirror/legacy-modes/mode/sql',
        '@lezer/highlight',
        '@lezer/rust',
        '@lezer/markdown',
        '@lezer/python',
        '@lezer/yaml',
        '@lezer/json',
        '@lezer/javascript',
        '@lezer/common',
      ],
    },
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