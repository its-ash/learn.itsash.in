<script setup lang="ts">
const route = useRoute()
const router = useRouter()

const { data: page, pending } = await useAsyncData(
  () => 'page-' + route.path,
  async () => {
    const found = await queryCollection('content').path(route.path).first()
    if (found) return found

    const readmePath = route.path.replace(/\/?$/, '/readme')
    const readme = await queryCollection('content').path(readmePath).first()
    if (readme) {
      if (import.meta.server) {
        throw createError({ statusCode: 307, statusMessage: 'Redirect', data: { location: readmePath } })
      }
      router.replace(readmePath)
      return readme
    }

    return null
  },
  { watch: [() => route.path] }
)

if (!page.value && !pending.value) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
}

const breadcrumbs = computed(() => {
  const segments = route.path.split('/').filter(Boolean)
  const crumbs: { label: string; to: string }[] = [{ label: 'Home', to: '/' }]
  let acc = ''
  for (const seg of segments) {
    acc += '/' + seg
    crumbs.push({
      label: seg
        .replace(/-/g, ' ')
        .replace(/^\d+\s+/, '')
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      to: acc,
    })
  }
  return crumbs
})

const pageTitle = computed(() => {
  const title = page.value?.title || page.value?.meta?.title
  if (title) return title as string
  const h1 = page.value?.body?.toc?.title
  if (h1) return h1
  return breadcrumbs.value.at(-1)?.label || 'Page'
})

const pageDescription = computed(() => {
  const desc = page.value?.description || page.value?.meta?.description
  if (desc) return desc as string
  const body = page.value?.body?.text || ''
  return body.slice(0, 160).replace(/\n/g, ' ').trim() + (body.length > 160 ? '...' : '')
})

const pageImage = computed(() => {
  return page.value?.meta?.image || page.value?.image || null
})

const currentUrl = computed(() => 'https://learn.itsash.in' + route.path)

const readingTime = computed(() => {
  const body = page.value?.body?.text || ''
  const words = body.split(/\s+/).length
  return Math.max(1, Math.ceil(words / 200))
})

const wordCount = computed(() => {
  const body = page.value?.body?.text || ''
  return body.split(/\s+/).length
})

useSeoMeta({
  title: () => `${pageTitle.value} — Learn`,
  description: () => pageDescription.value,
  ogTitle: () => pageTitle.value,
  ogDescription: () => pageDescription.value,
  ogUrl: () => currentUrl.value,
  ogType: 'article',
  ogImage: () => pageImage.value || undefined,
  twitterTitle: () => pageTitle.value,
  twitterDescription: () => pageDescription.value,
  twitterImage: () => pageImage.value || undefined,
  articleAuthor: () => 'Learn',
  articleSection: () => breadcrumbs.value[1]?.label || 'Programming',
  articleTag: () => breadcrumbs.value.map(c => c.label).join(', '),
  articleModifiedTime: () => (page.value as any)?.date || new Date().toISOString(),
  articlePublishedTime: () => (page.value as any)?.date || new Date().toISOString(),
})

useHead({
  link: [
    { rel: 'canonical', href: () => currentUrl.value },
  ],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: () => JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: pageTitle.value,
        description: pageDescription.value,
        url: currentUrl.value,
        author: { '@type': 'Organization', name: 'Learn' },
        publisher: { '@type': 'Organization', name: 'Learn' },
        datePublished: (page.value as any)?.date || new Date().toISOString(),
        dateModified: (page.value as any)?.date || new Date().toISOString(),
        mainEntityOfPage: { '@type': 'WebPage', '@id': currentUrl.value },
        breadcrumb: {
          '@type': 'BreadcrumbList',
          itemListElement: breadcrumbs.value.map((c, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: c.label,
            item: 'https://learn.itsash.in' + c.to,
          })),
        },
      }),
    },
    {
      type: 'application/ld+json',
      innerHTML: () => JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: breadcrumbs.value.map((c, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: c.label,
          item: 'https://learn.itsash.in' + c.to,
        })),
      }),
    },
  ],
})

definePageMeta({
  ssr: true,
})
</script>

<template>
  <section class="relative z-10 py-12 md:py-16">
    <ReadingProgress />

    <div class="mx-auto max-w-6xl px-6 md:px-8 lg:px-12">
      <nav aria-label="Breadcrumb" itemscope itemtype="https://schema.org/BreadcrumbList"
        class="mb-10 flex flex-wrap items-center gap-1.5 font-mono text-xs uppercase tracking-widest text-c-muted-fg">
        <template v-for="(crumb, i) in breadcrumbs" :key="crumb.to">
          <meta itemprop="position" :content="i + 1" />
          <NuxtLink :to="crumb.to" itemprop="item" class="py-1 transition-opacity duration-100 hover:opacity-60"
            :class="{ 'text-c-fg': i === breadcrumbs.length - 1 }">
            <span itemprop="name">{{ crumb.label }}</span>
          </NuxtLink>
          <span v-if="i < breadcrumbs.length - 1" class="text-c-fg" aria-hidden="true">/</span>
        </template>
      </nav>

      <article class="md-prose" itemscope itemtype="https://schema.org/Article">
        <meta itemprop="author" content="Learn" />
        <meta itemprop="publisher" content="Learn" />
        <meta itemprop="wordCount" :content="wordCount" />
        <div class="not-prose mb-12 flex items-center justify-between gap-4 border-b-[2px] border-c-fg pb-6">
          <BackButton label="Back" />
          <span
            class="inline-flex items-center gap-2 border border-c-fg px-3 py-1.5 font-mono text-xs font-medium uppercase tracking-widest text-c-fg">
            Article · {{ readingTime }} min read
          </span>
        </div>

        <ContentRenderer v-if="page" :value="page" />
        <div v-else-if="pending" class="flex items-center justify-center py-24">
          <span class="code-spinner" style="width: 1.5rem; height: 1.5rem; border-width: 2px;" />
        </div>

        <div class="not-prose mt-16 flex items-center justify-between gap-4 border-t-[2px] border-c-fg pt-6">
          <BackButton label="Go back" />
        </div>
      </article>
    </div>
  </section>
</template>
