import '../server/env';
import { resolve4, resolveCname } from 'node:dns/promises';

const args = process.argv.slice(2);
function option(name: string) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Provide a value for ${name}.`);
  return args[index + 1];
}

async function main() {
  const override = option('--host');
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
  const mode = override ? 'explicit hostname' : key.startsWith('pk_live_') ? 'production' : 'development';
  const encoded = key.match(/^pk_(?:test|live)_(.+)$/)?.[1];
  const decoded = encoded ? Buffer.from(encoded, 'base64').toString('utf8') : '';
  const host = override ?? (decoded.endsWith('$') ? decoded.slice(0, -1) : '');
  if (!host || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host) || !host.includes('.')) {
    throw new Error('Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, or supply --host with a Clerk hostname. Do not supply a secret key.');
  }
  const origin = option('--origin');
  if (origin && (!['http:', 'https:'].includes(new URL(origin).protocol) || new URL(origin).origin !== origin)) {
    throw new Error('--origin must be an HTTP(S) origin without a path or trailing slash.');
  }
  console.log(`Checking Clerk (${mode}): ${host}`);
  const [cname, addresses] = await Promise.allSettled([resolveCname(host), resolve4(host)]);
  console.log(`CNAME: ${cname.status === 'fulfilled' ? cname.value.join(', ') : '(none)'}`);
  console.log(`IPv4: ${addresses.status === 'fulfilled' ? addresses.value.join(', ') : '(not resolved)'}`);
  const scriptUrl = `https://${host}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`;
  try {
    const headers: Record<string, string> = origin ? { Origin: origin } : {};
    const script = await fetch(scriptUrl, { headers, signal: AbortSignal.timeout(10_000) });
    if (!script.ok) throw new Error(`Clerk script returned HTTP ${script.status}.`);
    if (!script.headers.get('content-type')?.includes('javascript')) {
      throw new Error('The script URL returned a non-JavaScript response. Check that this hostname routes to Clerk.');
    }
    await script.arrayBuffer();
    console.log('Clerk JS: HTTPS and JavaScript response OK');
    const environment = await fetch(`https://${host}/v1/environment`, { headers, signal: AbortSignal.timeout(10_000) });
    if (!environment.ok) throw new Error(`Clerk Frontend API returned HTTP ${environment.status}.`);
    await environment.json();
    console.log('Clerk Frontend API: HTTPS and JSON response OK');
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : '';
    console.error(`Authentication connection failed: ${error instanceof Error ? error.message : String(error)}${cause}`);
    if (cname.status !== 'fulfilled' && !host.endsWith('.clerk.accounts.dev')) {
      console.error(`No CNAME was found for ${host}. In Vercel DNS, add the exact Frontend API CNAME target from the Clerk production Domains page and remove conflicting A/AAAA records for this hostname.`);
    }
    console.error('Complete Clerk DNS verification and certificate deployment. Retest this same hostname; changing only the script CDN does not repair Frontend API access.');
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
