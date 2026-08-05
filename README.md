# Learn — Minimalist Monochrome

A personal reading space built with **Nuxt Content** in a minimalist monochrome design language — pure black, white, and typography. Features a comprehensive Rust curriculum, programming guides, and technical documentation.

🌐 **Live site:** [learn.itsash.in](https://learn.itsash.in)

## Tech Stack

- **[Nuxt 4](https://nuxt.com)** — Vue framework with SSR & static generation
- **[Nuxt Content](https://content.nuxt.com)** — Markdown-powered content management
- **[Tailwind CSS 4](https://tailwindcss.com)** — Utility-first styling via `@tailwindcss/vite`
- **[Nuxt Icon](https://github.com/nuxt/icon)** — Iconify integration (Material Symbols)
- **[Nuxt Image](https://github.com/nuxt/image)** — Optimized images
- **[Nuxt Scripts](https://github.com/nuxt/scripts)** — Third-party script management
- **Google Fonts** — Playfair Display, Source Serif 4, JetBrains Mono

## Project Structure

```
learn/
├── app/
│   ├── app.vue              # Root layout, SEO head, JSON-LD
│   ├── error.vue            # Custom 404 / 500 error page
│   ├── assets/css/          # Tailwind + prose styles
│   ├── components/          # AppHeader, BackButton, ReadingProgress, ProsePre, ProseA
│   ├── composables/         # useTheme (light / dark / warm)
│   ├── pages/
│   │   ├── [...slug].vue    # Catch-all content renderer
│   │   └── browse.vue       # Searchable index of all pages
│   └── plugins/             # Drop cap enhancement
├── content/
│   ├── index.md             # Home page
│   └── rust/                # 35-chapter Rust curriculum
│       ├── index.md
│       └── 01-…35-*.md
├── public/                  # Static assets (robots.txt, manifest, .nojekyll)
├── server/routes/           # sitemap.xml generator
├── content.config.ts        # Content collection config
├── nuxt.config.ts           # Nuxt config (auto-discovers routes from content/)
└── docs/                    # Generated static output (GitHub Pages)
```

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

Starts on `http://localhost:3000`.

## Build for Production

Generates a static site into the `docs/` folder for GitHub Pages:

```bash
npm run generate
```

Preview the built site locally:

```bash
npx serve docs
```

## Deployment (GitHub Pages)

The site is configured for GitHub Pages static hosting:

1. **Build output** goes to `docs/` via `nitro.output.publicDir` in `nuxt.config.ts`.
2. **`.nojekyll`** is included in `public/` so GitHub Pages serves `_nuxt/` asset folders (Jekyll skips `_`-prefixed directories by default).
3. **Route prerendering** auto-discovers all `.md` files under `content/` — no hardcoded route list.
4. Set GitHub Pages source to **`main` branch / `/docs` folder** in repo settings.

### Custom Domain

The canonical URL is `https://learn.itsash.in`. Update it in:

- `app/app.vue` — canonical links, JSON-LD
- `app/pages/[...slug].vue` — article URLs, breadcrumbs
- `app/pages/browse.vue` — canonical link
- `server/routes/sitemap.xml.ts` — sitemap URLs
- `public/robots.txt` — sitemap reference

## Adding Content

Drop a `.md` file anywhere under `content/`:

```
content/my-guide/index.md        →  /my-guide
content/my-guide/01-intro.md     →  /my-guide/01-intro
content/standalone.md            →  /standalone
```

The build automatically discovers and prerenders all routes. Use frontmatter for metadata:

```yaml
---
title: My Page Title
description: A short description for SEO.
---
```

## Features

- **Minimalist monochrome design** — black, white, sharp geometry, oversized serif typography
- **Three theme modes** — light, dark, warm (persisted via localStorage)
- **Searchable browse page** at `/browse`
- **Reading progress bar** on article pages
- **Custom syntax highlighting** — zero Codemirror/Lezer dependencies, pure CSS token classes
- **SEO optimized** — per-page meta tags, Open Graph, Twitter Cards, JSON-LD structured data, breadcrumbs
- **Auto-generated sitemap** at `/sitemap.xml`
- **Custom 404/500 error page** matching the design language
- **Smart link resolution** — relative `.md` links in content auto-resolve to correct nested paths
- **Drop caps** on first paragraph of articles