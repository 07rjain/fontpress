import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { renderToString } from 'react-dom/server';
import { PublicSite } from '../src/components/PublicSite';
import { PUBLIC_PAGES, SITE_URL, structuredData, type PublicPath } from '../src/seo';

const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const template = await readFile('dist/index.html', 'utf8');
if (!template.includes('<div id="root"></div>')) throw new Error('The Vite HTML root could not be found.');
if (!template.includes('<!-- seo:start -->') || !template.includes('<!-- seo:end -->')) throw new Error('The SEO metadata markers could not be found.');

for (const path of Object.keys(PUBLIC_PAGES) as PublicPath[]) {
  const page = PUBLIC_PAGES[path];
  const url = `${SITE_URL}${path}`;
  const tags = `<title>${escape(page.title)}</title>
    <meta name="description" content="${escape(page.description)}" />
    <meta name="robots" content="${page.index ? 'index,follow' : 'noindex,follow'}" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Handpress" />
    <meta property="og:title" content="${escape(page.title)}" />
    <meta property="og:description" content="${escape(page.description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${SITE_URL}/social-card.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Handpress: Turn your handwriting into a font. Free online handwriting font generator." />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escape(page.title)}" />
    <meta name="twitter:description" content="${escape(page.description)}" />
    <meta name="twitter:image" content="${SITE_URL}/social-card.png" />
    <script type="application/ld+json">${JSON.stringify(structuredData(path)).replaceAll('<', '\\u003c')}</script>`;
  const html = template.replace(/<!-- seo:start -->[\s\S]*?<!-- seo:end -->/, `<!-- seo:start -->\n${tags}\n<!-- seo:end -->`)
    .replace('<div id="root"></div>', `<div id="root">${renderToString(<PublicSite path={path} />)}</div>`);
  await writeFile(path === '/' ? 'dist/index.html' : `dist${path}.html`, html);
}

const indexable = Object.entries(PUBLIC_PAGES).filter(([, page]) => page.index);
await mkdir('dist', { recursive: true });
await writeFile('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${indexable.map(([path]) => `<url><loc>${SITE_URL}${path}</loc></url>`).join('')}</urlset>\n`);
await writeFile('dist/robots.txt', `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
console.log(`Prerendered ${Object.keys(PUBLIC_PAGES).length} public pages; ${indexable.length} sitemap entries.`);
