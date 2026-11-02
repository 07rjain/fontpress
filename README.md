# Handpress

Handpress turns handwriting into an installable OpenType font. Draw on the board, import an individual letter, or print and photograph the two-page handwriting template. Preview your writing, save an editable private draft, and complete all 85 characters before downloading or publishing your font.

## Run locally

Use Node.js 20.19+, 22.13+, or 24+ and npm. The native SQLite dependency requires a supported Node version; platforms without a prebuilt binary may need their C++ build tools.

```sh
npm ci
cp .env.example .env
```

Fill in both Clerk keys from the same Clerk application. Configure the localhost origin in Clerk. Keep `CLERK_SECRET_KEY` on the server; only `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is embedded in the browser bundle. Neither `.env` nor `data/` belongs in Git.

```sh
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to the API on port 8787. If you change `PORT` for development, update the Vite proxy too. Restart the development process after changing environment variables. Separate processes are available as `npm run dev:web` and `npm run dev:api`.

## Fonts and drafts

- **Draw and download:** all 85 required characters must have usable outlines before downloading an `.otf`. Both studio download buttons and saved-font downloads enforce completion. Generated outlines use OpenType/CFF. Font previews use `font/otf`; downloads use a binary attachment with a single `.otf` filename to avoid mobile download managers appending a second font extension.
- **Move between letters:** Previous and Next sit above the drawing canvas with a position counter. Completed strokes stay with their original character; navigation wraps at either end of the character set.
- **Spacing:** left/right nudges shift the letter within its advance width. They are saved independently of the raster drawing and survive preview, export, undo, and reopening. Up/down nudges move the drawing vertically.
- **Private saves:** save a partial or complete font from Specimen. Both the compiled font and editable drawings are kept in your account. Choose **Edit** in My fonts to continue on another device. Saving again updates that entry.
- **New fonts and local recovery:** starting a new font or opening another one preserves the previous draft. My fonts lists drafts on the current browser with a **Resume draft** action. These local copies are scoped to your account in IndexedDB. Clearing site data removes them; use a private save for an account-backed copy.
- **Publishing:** all 85 supported characters must map to usable outlines before a font can become public. The gallery supports search by font/designer/owner name and paginated browsing. Editable source remains accessible only to the owner even when a font is public.
- **Older saved entries:** existing file-backed fonts remain downloadable. If they predate saved source drawings, Edit reconstructs raster drawings from their stored outlines; original stroke history and photo information cannot be recovered. Saving the reconstructed project adds editable source.

The character set covers English capitals, lowercase letters, digits, and selected punctuation. It does not provide kerning controls, ligatures, or wider language coverage.

## Build and serve

Set the production Clerk publishable key before building. Set `APP_ORIGINS` to the actual browser origin, and provide the matching Clerk secret key to the server.

```sh
npm run build
npm start
```

The Node server serves `dist/` and `/api` together on `PORT` (8787 by default). `npm run preview` previews only the static Vite build; it does not run or proxy the API. Serve production traffic through HTTPS using your hosting platform or reverse proxy. A persistent Node process and writable persistent disk are required.

`DATA_DIR` contains `handpress.db` and SQLite WAL files. New font bytes and source projects are written together in SQLite. The `fonts/` subdirectory is retained for entries created by earlier versions. Startup adds the new nullable columns to older databases without deleting existing data. Back up the whole data directory before upgrading; take a consistent SQLite backup or stop the process while copying it, including any WAL files. This storage setup is intended for one application instance, rather than multiple replicas with separate disks.

The API limits each account to 50 saved fonts. Compiled uploads are limited to 4 MiB; editable project JSON to 12 MiB; each glyph drawing to 512 KiB; and the complete multipart request to 20 MiB.

## Verification

```sh
npm run check
npm test
npm run build
```

`check` covers geometry, contour orientation, template mark detection, raster cleanup, and basic font parsing. Vitest adds real-raster drawing and font-export checks, transparent artwork import, pointer cancellation and letter switching, delayed account and save responses, local draft recovery, cloud project round trips, upload validation, legacy database/file compatibility, account limits, and gallery search/pagination.

Tests use temporary SQLite databases and in-memory IndexedDB. API integration tests simulate verified identities at the Clerk boundary; they do not call Clerk or verify real session signatures. Canvas checks use a native raster implementation under jsdom. They do not establish compatibility with every browser or operating-system font installer.

Before a production release, also check real Clerk sign-in/sign-out and account switching, mouse/touch/stylus drawing, printing both template pages, importing photographs from a phone, and installation of a downloaded font on the operating systems you support.

## Authentication connection troubleshooting

If production reports `failed_to_load_clerk_js` or `ERR_CONNECTION_CLOSED`, test the production authentication hostname explicitly:

```sh
npm run check:auth -- --host clerk.fontpress.subdomain.wtf --origin https://fontpress.subdomain.wtf
```

This command checks DNS, TLS, the JavaScript response, and the Clerk Frontend API. The default `npm run check:auth` checks the local publishable key instead; a successful development-instance check does not prove production is configured correctly. See [the exact production DNS records and Vercel steps](docs/clerk-production-dns.md).

The app now shows a sign-in connection error with a retry button when Clerk fails or remains unavailable, rather than waiting indefinitely on the boot screen. This recovery screen does not repair DNS; the production hostname must route to Clerk and have a valid certificate.
