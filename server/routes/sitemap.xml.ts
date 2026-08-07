import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const SITE_URL = "https://learn.itsash.in";

function collectRoutes(): string[] {
  const contentDir = resolve("content");
  const routes: string[] = ["/"];

  for (const entry of readdirSync(contentDir)) {
    const entryPath = join(contentDir, entry);
    if (!statSync(entryPath).isDirectory()) {
      if (entry.endsWith(".md") && entry !== "index.md") {
        routes.push("/" + entry.replace(/\.md$/, ""));
      }
      continue;
    }
    for (const file of readdirSync(entryPath)) {
      if (!file.endsWith(".md")) continue;
      const slug = file.replace(/\.md$/, "");
      routes.push(slug === "index" ? "/" + entry : "/" + entry + "/" + slug);
    }
  }

  return routes;
}

export default defineEventHandler((event) => {
  setHeader(event, "content-type", "application/xml; charset=utf-8");

  const urls = collectRoutes()
    .map(
      (route) =>
        `  <url><loc>${SITE_URL}${route}</loc><changefreq>weekly</changefreq><priority>${route === "/" ? "1.0" : "0.7"}</priority></url>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
});
