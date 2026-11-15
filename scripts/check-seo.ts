import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { PUBLIC_PAGES, SITE_URL } from '../src/seo';
import { website } from '../server/website';

const sitemap = await readFile('dist/sitemap.xml', 'utf8');
const robots = await readFile('dist/robots.txt', 'utf8');
assert(robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`));
assert(robots.includes('Allow: /'));
for (const [path, page] of Object.entries(PUBLIC_PAGES)) {
  const html = await readFile(path === '/' ? 'dist/index.html' : `dist${path}.html`, 'utf8');
  const response = await website.request(path);
  assert.equal(response.status, 200, `${path} must be served by the production Node website`);
  assert.equal(await response.text(), html);
  if (path !== '/') {
    const redirect = await website.request(`${path}/`);
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.get('location'), path);
  }
  const { window } = new JSDOM(html, { url: `${SITE_URL}${path}` });
  const doc = window.document;
  assert.equal(doc.title, page.title);
  assert.equal(doc.querySelector('meta[name="description"]')?.getAttribute('content'), page.description);
  assert.equal(doc.querySelector('link[rel="canonical"]')?.getAttribute('href'), `${SITE_URL}${path}`);
  assert.equal(doc.querySelectorAll('h1').length, 1, `${path} must have one primary heading`);
  assert((doc.querySelector('main')?.textContent?.length ?? 0) > 100, `${path} needs useful initial HTML`);
  assert.equal(sitemap.includes(`<loc>${SITE_URL}${path}</loc>`), page.index);
  assert.equal(doc.querySelector('meta[name="robots"]')?.getAttribute('content'), page.index ? 'index,follow' : 'noindex,follow');
  const data = JSON.parse(doc.querySelector('script[type="application/ld+json"]')!.textContent!);
  assert.equal(data['@context'], 'https://schema.org');
  assert(data['@graph'].some((node: { '@type': string; url: string }) => node['@type'] === 'WebPage' && node.url === `${SITE_URL}${path}`));
  for (const image of ['og:image', 'twitter:image']) {
    const url = doc.querySelector(`meta[property="${image}"], meta[name="${image}"]`)?.getAttribute('content');
    assert(url && url.startsWith(`${SITE_URL}/`));
    await access(`dist${new URL(url).pathname}`);
  }
  for (const element of doc.querySelectorAll('a[href], img[src]')) {
    const raw = element.getAttribute('href') ?? element.getAttribute('src')!;
    const url = new URL(raw, `${SITE_URL}${path}`);
    if (url.origin !== SITE_URL) continue;
    if (element.tagName === 'IMG') {
      assert(element.getAttribute('alt'));
      assert(element.getAttribute('width') && element.getAttribute('height'));
      await access(`dist${url.pathname}`);
    } else {
      assert(Object.hasOwn(PUBLIC_PAGES, url.pathname), `Broken internal destination: ${raw}`);
      if (url.hash && !url.hash.startsWith('#/')) {
        const targetHtml = await readFile(url.pathname === '/' ? 'dist/index.html' : `dist${url.pathname}.html`, 'utf8');
        const target = new JSDOM(targetHtml);
        assert(target.window.document.getElementById(url.hash.slice(1)), `Missing anchor: ${raw}`);
        target.window.close();
      }
    }
  }
  if (path === '/') {
    assert.equal(doc.querySelectorAll('.faq-list details').length, 7);
    assert(doc.querySelector('.fest-example img'));
    assert(doc.body.textContent?.includes('85 characters'));
  }
  window.close();
}
assert.equal((await website.request('/not-a-real-page')).status, 404);
for (const path of ['/sitemap.xml', '/robots.txt', '/social-card.png', '/examples/traced-characters.svg']) {
  assert.equal((await website.request(path)).status, 200);
}
console.log('SEO checks passed: initial HTML, headings, metadata, schema, sitemap, images, and internal links.');
