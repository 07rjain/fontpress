# Deploy Handpress on Vercel and Supabase

The Vite frontend and Hono API run on Vercel. Supabase Postgres stores saved-font metadata, and a private Supabase Storage bucket holds the compiled font and editable drawings. Clerk still handles sign-in. No separately hosted Node server or persistent Vercel disk is needed.

## 1. Create the database and private bucket

Open your project's [Supabase SQL Editor](https://supabase.com/dashboard/project/hftgjgaiosohsolvcyiv/sql/new), paste the entire contents of [`supabase/migrations/202611150001_handpress.sql`](../supabase/migrations/202611150001_handpress.sql), and run it. It creates two tables, three server-only database functions, indexes, and the private `handpress` bucket. The SQL is safe to rerun; it does not remove saved records.

Do not create public Storage policies or change the bucket to public. Database tables have row-level security enabled and no browser-role grants. The server uses its secret key after checking the Clerk session and font ownership. Publishing shares compiled fonts through the API; it does not share drawings.

This creates a new cloud library. It does not automatically copy any existing local `data/handpress.db` or legacy font files. Keep a backup if you previously ran the Node backend with real saved data. Existing browser drafts remain available for reopening and saving to the new cloud library.

## 2. Vercel environment

Set these in **Project → Settings → Environment Variables**, for Production and any Preview environment you intend to test:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | `https://hftgjgaiosohsolvcyiv.supabase.co` |
| `SUPABASE_SECRET_KEY` | Your Supabase project's secret key (`sb_secret_…`), or legacy `service_role` key |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Your existing Clerk publishable key |
| `CLERK_SECRET_KEY` | The matching existing Clerk secret key |
| `APP_ORIGINS` | `https://fontpress.vercel.app,https://fontpress.subdomain.wtf` plus any additional origins you use |

Keep the Supabase secret server-only. The frontend receives only temporary URLs for individual upload objects. `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_JWKS_URL` can remain in Vercel, but this integration does not use them: Clerk sessions are verified against Clerk, not Supabase Auth. Do not replace the Clerk keys or enable a Supabase sign-in flow for this setup.

Use Vercel's **Vite** framework preset, build command `npm run build`, and output directory `dist`. The committed `api/index.ts` deploys the API as a Node function, with a 60-second maximum duration. `vercel.json` explicitly rewrites every `/api/*` path to that function and retains clean public-page URLs. The build checks the compiled API with native Node ESM, catching import errors that a TypeScript development loader would hide. Use a supported Node version from `package.json` (22 or 24 recommended).

Redeploy after adding or changing variables. Vercel environment values are not automatically copied into your local `.env`. To test Supabase locally, set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in your local `.env` too; otherwise local development continues to use SQLite. A Vercel function with missing cloud configuration fails instead of writing a temporary SQLite database.

## 3. Verify the deployment

```sh
npm run check:api -- --origin https://fontpress.vercel.app
```

The check expects healthy database/storage access, a JSON gallery response, and an unauthenticated 401 for the private library. It catches missing API routes and HTML fallbacks. `/api/health` returns 503 if the schema, secret, bucket, or connection is unavailable.

Then use a real account to:

1. Save a partial private font, reload, and reopen its drawings.
2. Confirm another account cannot open or update it.
3. Confirm downloading and publishing require all 85 characters.
4. Complete and publish a font, then check gallery search, preview, and download while signed out.
5. Make a private replacement save and confirm its drawings remain private.

The automated tests use fake verified identities and a separate disposable Postgres cluster; they do not establish that the production Clerk environment or Supabase project is configured.

## Uploads, limits, and cleanup

Compiled fonts are limited to 4 MiB and project JSON to 12 MiB. Browser uploads go directly to private staging objects in Supabase Storage to avoid Vercel's 4.5 MB body limit. A small authenticated completion request validates the actual font outlines and source drawings. The server writes validated content into separate objects that upload tokens cannot modify, then atomically switches the saved metadata. A failed save leaves the previous version intact. Drawings reopen through an owner-authorized URL valid for 60 seconds, avoiding Vercel's response-size limit as well.

Postgres enforces 50 fonts per account, up to three outstanding uploads per account for 15 minutes, and 30 upload reservations per account per hour. Concurrent and stale updates cannot bypass the quota or replace a newer completed upload. Signed upload tokens expire after two hours; staging objects and unreferenced saved versions are cleaned after 130 minutes during subsequent saves (up to five expired uploads per save). If there is no traffic, cleanup waits until the next save. Current saved objects are retained. Monitor Storage usage, particularly for image-heavy projects; temporary and replaced versions count toward the free allowance until cleanup.

Supabase free-tier capacity and inactivity rules still apply. A paused project must be restored from its dashboard. Storage or database limits cause a real error; the app does not pretend a failed save succeeded or silently hide a failed gallery query.

## Local database verification

```sh
npm run check:supabase-db
```

This optional check requires PostgreSQL command-line tools (`initdb`, `pg_ctl`, `psql`). It creates and removes its own temporary cluster, applies the migration twice, and checks role permissions, ownership, expiry, stale updates, search, upload limits, and two concurrent saves racing for the 50th slot. It never connects to your Supabase database. The regular test suite also checks the API and actual Supabase SDK request shapes without live credentials.
