# Production domain migration

Handpress's canonical site URL is `https://handpress.subdomain.wtf`. The existing Vercel project is still named `fontpress`; changing the website domain does not require renaming the project, repository, or Supabase database.

## Hosting and deployment

1. Attach `handpress.subdomain.wtf` to the existing Vercel project's production environment. It must serve this project's deployment rather than the wildcard's default site.
2. Verify the domain's DNS configuration and HTTPS certificate in Vercel. DNS for `subdomain.wtf` is hosted on Vercel. If an explicit record is required, use the destination Vercel supplies for this project. Preserve unrelated records.
3. Add `https://handpress.subdomain.wtf` to the production `APP_ORIGINS` environment variable, preserving any other required origins, and redeploy. An explicit environment value overrides the fallback in `server/auth.ts`.
4. The build uses `SITE_URL` in `src/seo.ts` for canonical links, social image URLs, JSON-LD, robots.txt, and sitemap.xml.
5. After verifying the new website and sign-in, set the old `fontpress.subdomain.wtf` project domain to permanently redirect to `handpress.subdomain.wtf`, preserving paths and query strings. Avoid redirecting the `clerk.fontpress.subdomain.wtf` and `accounts.fontpress.subdomain.wtf` authentication services.

## Authentication and existing drafts

The production Clerk instance now uses `handpress.subdomain.wtf` as its primary domain, with Frontend API `clerk.handpress.subdomain.wtf` and account portal `accounts.handpress.subdomain.wtf`. Its instance and domain IDs are retained, preserving existing users. The Vercel publishable key must point to the new Frontend API; the secret key remains unchanged. The email CNAME targets changed during the rename: use the exact current targets in [Clerk DNS](clerk-production-dns.md), rather than copying the old email targets. Keep old authentication DNS records during the transition.

Check Clerk's application home URL, account portal destinations, and sign-in/sign-up redirects for the new website. Confirm any social sign-in callback changes required by Clerk. Custom OAuth providers may need their allowed callback URLs updated separately.

Browser-only drafts live in IndexedDB under the original website origin. They do not automatically move to the new domain. Saved cloud fonts remain tied to the same Clerk users and Supabase project. Before retiring access to the old studio, users with unsaved local drafts should sign in and save them to My fonts on the old domain.

## Verification

```sh
npm run build
npm run check:seo
npm run check:api -- --origin https://handpress.subdomain.wtf
npm run check:auth -- --host clerk.handpress.subdomain.wtf --origin https://handpress.subdomain.wtf
```

Verify the live homepage, guides, gallery, sitemap, social image, and real sign-in/sign-out. A successful public Clerk API check alone does not establish that sign-in or authenticated font saves work. After enabling the redirect, check an old guide URL with a query string as well as the homepage. Update Search Console and external marketing links to the new domain.
