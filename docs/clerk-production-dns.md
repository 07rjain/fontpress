# Clerk DNS for handpress.subdomain.wtf

The production Clerk instance uses `clerk.handpress.subdomain.wtf` for both its JavaScript and Frontend API. That hostname must reach Clerk over HTTPS. Loading Clerk JS from a different CDN alone cannot repair an unreachable Frontend API.

The authoritative nameservers for `subdomain.wtf` are `ns1.vercel-dns.com` and `ns2.vercel-dns.com`. DNS records must be edited in the Vercel team that controls the DNS zone; adding a hostname to a project's Domains list does not create the required Clerk service routing.

## Records

Use these values exactly as supplied by the production Clerk Domains page:

| Full hostname | Type | Target |
| --- | --- | --- |
| `accounts.handpress.subdomain.wtf` | CNAME | `accounts.clerk.services` |
| `clerk.handpress.subdomain.wtf` | CNAME | `frontend-api.clerk.services` |
| `clk._domainkey.handpress.subdomain.wtf` | CNAME | `dkim1.ypa3rxzjuirh.clerk.services` |
| `clk2._domainkey.handpress.subdomain.wtf` | CNAME | `dkim2.ypa3rxzjuirh.clerk.services` |
| `clkmail.handpress.subdomain.wtf` | CNAME | `mail.ypa3rxzjuirh.clerk.services` |

In a DNS zone for **handpress.subdomain.wtf**, the relative names are `accounts`, `clerk`, `clk._domainkey`, `clk2._domainkey`, and `clkmail`.

In the parent DNS zone for **subdomain.wtf**, the relative names are `accounts.handpress`, `clerk.handpress`, `clk._domainkey.handpress`, `clk2._domainkey.handpress`, and `clkmail.handpress`. Check the UI's full-name preview to avoid accidentally creating a duplicated suffix.

## Vercel steps

1. Open the Vercel team dashboard, then Domains, and choose the DNS zone you control.
2. Add or update the five CNAME records above. Enter each target hostname exactly, without `https://`, paths, or Vercel's deployment CNAME target.
3. Ensure the website has an explicit DNS record before adding its child hostnames. If `handpress.subdomain.wtf` relies only on `*.subdomain.wtf`, adding the Clerk children creates an existing DNS branch and stops the website hostname from matching that wildcard. In this zone, the website uses an explicit `handpress` ALIAS to `6a61ae329fa4b635.vercel-dns-017.com`, as recommended for this project by Vercel. Preserve the unrelated wildcard record.
4. Remove conflicting A/AAAA/CNAME records only for the exact five Clerk hostnames. Keep the main website's records and unrelated wildcard records. A specific CNAME takes precedence over an inherited wildcard.
5. If these records are later hosted behind a DNS proxy, use DNS-only mode for Clerk's CNAME records.
6. Keep any existing valid DMARC policy. If no policy exists, `v=DMARC1; p=none` is an optional non-enforcing recommendation, rather than a replacement for an existing policy. Do not replace a stricter inherited policy without reviewing it.
7. Return to the production instance in Clerk, run DNS verification again, and complete the certificate deployment step if Clerk requests it.
8. Wait for DNS caches to expire, then test the production hostname and sign-in again.

If Vercel only shows a project domain without editable DNS records, access to the parent DNS zone is still required. A Vercel token must have access to the team that owns that zone. Provide tokens through the private secret-input card, never in chat, source files, or screenshots.

## Verify

```sh
npm run check:auth -- --host clerk.handpress.subdomain.wtf --origin https://handpress.subdomain.wtf
```

This checks public DNS, a real HTTPS JavaScript download, and the Frontend API environment response. It exits nonzero on a connection or response failure, without printing API keys. `npm run check:auth` without `--host` checks the instance selected by the local publishable key, which may be the development instance rather than production.

For each record, `dig +short CNAME <full-hostname>` should return the target in the table. An A lookup can follow a valid CNAME to its final addresses, so validate the CNAME itself rather than comparing IP addresses.

References: [Clerk production deployment](https://clerk.com/docs/guides/development/deployment/production), [Vercel DNS records](https://vercel.com/docs/domains/managing-dns-records).
