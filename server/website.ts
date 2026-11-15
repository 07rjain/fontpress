import { existsSync } from 'node:fs';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { PUBLIC_PAGES } from '../src/seo';

export const website = new Hono();
if (existsSync('dist/index.html')) {
  for (const route of Object.keys(PUBLIC_PAGES).filter((route) => route !== '/')) {
    website.get(route, serveStatic({ path: `./dist${route}.html` }));
    website.get(`${route}/`, (c) => c.redirect(route, 308));
  }
  website.use('/*', serveStatic({ root: './dist' }));
  // Unknown pages deliberately fall through to a real 404.
}
