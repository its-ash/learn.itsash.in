import { defineEventHandler, setHeader } from 'h3'

export default defineEventHandler(async (event) => {
  const urls: string[] = []

  try {
    const { queryCollection } = await import('#content/server')
    const pages = await queryCollection(event, 'content').all()

    for (const p of pages) {
      if (!p.path) continue
      if (p.path === '/index') continue
      const priority = p.path === '/' ? '1.0' : p.path.split('/').length === 2 ? '0.8' : '0.6'
      urls.push(`  <url>
    <loc>https://learn.example.com${p.path}</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>`)
    }
  } catch {
    urls.push('  <url>\n    <loc>https://learn.example.com/</loc>\n    <priority>1.0</priority>\n  </url>')
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`

  setHeader(event, 'content-type', 'application/xml')
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return xml
})
