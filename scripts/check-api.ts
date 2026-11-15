import assert from 'node:assert/strict';

const args = process.argv.slice(2);
const origin = args[args.indexOf('--origin') + 1];
if (!args.includes('--origin') || !origin) throw new Error('Usage: npm run check:api -- --origin https://your-website.example');
const url = new URL(origin);
if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
  throw new Error('Provide a plain HTTP(S) origin without credentials, a path, a query, or a fragment.');
}
for (const [path, expected] of [['/api/health', 200], ['/api/fonts/public?pageSize=1', 200], ['/api/fonts/mine', 401]] as const) {
  const response = await fetch(new URL(path, url), { redirect: 'error', signal: AbortSignal.timeout(10_000) });
  assert.equal(response.status, expected, `${path}: expected HTTP ${expected}, got ${response.status}. Check API deployment and routing.`);
  assert(response.headers.get('content-type')?.includes('application/json'), `${path}: expected JSON, not a static page or hosting error.`);
  const data = await response.json();
  if (path === '/api/health') assert.equal(data.ok, true);
  if (path.includes('/public')) assert(Array.isArray(data.fonts) && Number.isInteger(data.total) && data.total >= 0);
  if (expected === 401) assert.equal(typeof data.error, 'string');
  console.log(`${path}: HTTP ${expected}, JSON response OK`);
}
console.log('Deployment API checks passed without creating or changing user data.');
