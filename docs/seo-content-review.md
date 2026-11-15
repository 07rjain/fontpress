# SEO content review and implementation

Date: 15 November 2026

## Implementation follow-up

Implemented locally on 15 November 2026 after approval of the proposal. The original review below records the reasoning; this section records the resulting behavior.

| Area | Before | Implemented result |
| --- | --- | --- |
| Homepage writing | Festival metaphors in the primary headline and actions | Clear handwriting-to-font headline, literal actions, visible account and 85-character requirements |
| Public rendering | Empty initial content; Clerk loaded before public content | Build-time HTML for homepage, two guides and gallery; public pages mount without Clerk |
| Useful content | No FAQ or independent output example | Seven FAQ answers; a labelled three-character example traced through the real exporter; template and installation guides |
| Public navigation | Mainly buttons and hash routes | Crawlable links to real `/handwriting-template`, `/install-font`, and `/gallery` paths; existing studio hash URLs retained |
| Metadata | Shared title/description | Page-specific titles, descriptions, canonicals, social cards and factual application/site/page JSON-LD |
| Discovery | No sitemap or intentional robots configuration | Three indexable sitemap entries; API crawler exclusion; gallery held at `noindex,follow` pending live verification |
| Failure behavior | Landing API failure looked like an empty gallery | Distinct unavailable state; truthful empty state only after successful response |
| Page delivery | Catch-all homepage for unknown URLs | Node server serves generated pages and returns 404 for unknown page URLs; Vercel clean URLs configured |

Verification: production build, `npm run check:seo`, all 36 tests across eight files, `npm run check`, and `git diff --check` pass. SEO checks inspect the generated HTML without JavaScript and exercise actual Node website responses, canonical redirects, metadata, JSON-LD, sitemap decisions, image files and internal destinations. New UI tests verify hydration without authentication, studio/home navigation, guide content and gallery failure handling. Example and share assets were generated and inspected locally.

No production deployment or Search Console changes were made. The previously observed production API routing issue is outside these copy/static-SEO changes. Fix and verify the Node/SQLite API before indexing the gallery or relying on production saves/publishing. Live social sharing, real-device rendering, authentication, Core Web Vitals, search indexing and AI citations remain unverified. No licensing rights or legal policies were invented.

## Original verdict and scope

The proposed copy is a sound starting point for the homepage. It explains the product and matches the likely intent of someone searching for a handwriting font generator. Copy alone does not establish search readiness: public content accessibility, discoverable URLs, indexing verification and useful examples still need work.

This review evaluates the copy and recommendations proposed in this conversation against the local source and documented product behavior. It does not implement website changes, migrate routing or assess rankings. At review time the checkout was one commit behind origin/main; the existing contact-link commit was subsequently fast-forwarded before implementation. No numerical SEO score is assigned because ranking, search demand and field performance have not been measured.

## Recommended copy

- **Search title:** Handwriting Font Generator — Create Your Own | Handpress
- **Meta description:** Create a font from your handwriting. Draw letters or upload a completed template, preview your words, and download an OpenType font. Free with an account.
- **H1:** Turn your handwriting into a font.
- **Introduction:** Draw letters, numbers and punctuation, or upload photos of our completed handwriting template. Preview your words, then finish all 85 characters to download your font.
- **Primary action:** Create my font
- **Secondary action:** Browse handwriting fonts
- **Supporting line:** Free account required. Complete all 85 characters to download. Save your progress as you go.

The proposed title is 56 characters and the description is 154 characters. These are editorial checks, not hard Google limits or guarantees against truncation or rewritten snippets. The H1 can use a natural synonym rather than repeat the search title verbatim.

Retain festival language in small labels and decorative copy. Use literal wording for navigation, instructions and actions. Rename “Specimen” to “Preview” for a general audience. Avoid “save anytime” because saving an empty font is disabled; a user must first create a character.

## Search intent and content gaps

Use “handwriting font generator” as an initial homepage topic, supported naturally by “turn handwriting into a font” and “create a font from your handwriting.” Keyword volume and competition have not been verified. Do not target “AI font generator,” TTF export, every language, commercial licensing or guaranteed creation times without matching product capabilities and evidence.

Add concise visible answers about the free account, 85 required characters, unfinished drafts, supported English characters, privacy, publishing and installation. Explain that saved projects upload both compiled fonts and editable drawings. Clarify public-font reuse terms before making licensing claims.

Include one genuine handwriting-to-font example, clearly labelled, with a readable sentence showing the result. Add useful installation and template instructions rather than numerous pages repeating the homepage keywords. A static example can explain the product without depending on the live gallery.

## Technical findings and priorities

1. **High — Public HTML:** `index.html` contains an empty root container, and `src/App.tsx` waits for Clerk before rendering the application. Prerender or server-render meaningful public content independently of identity loading. Google can render JavaScript, but not all crawlers do, and an auth-dependent render adds a failure point.
2. **High — Public discovery:** `src/App.tsx` uses fragment routes and navigation buttons. Give substantive public guides/gallery pages distinct path URLs and crawlable anchor links when those pages are introduced. The private studio does not need a routing migration for SEO. If only the homepage is public/indexable initially, prioritize that page rather than creating empty routes.
3. **Medium — Metadata:** Add a homepage canonical, Open Graph/Twitter metadata and a real share image. Public pages should have their own accurate titles and descriptions; they should not all canonicalize to the homepage. Avoid letting a private draft name replace the public homepage search title.
4. **Medium — Discovery files:** Add an accurate sitemap listing only canonical indexable public pages, plus intentional robots rules. A missing robots file alone does not block crawling. Robots exclusions are not access control for private data.
5. **Medium — Product accuracy:** Confirm that save/publish/gallery claims work before promoting them. The preceding live check in this conversation found API 404s; this review did not repeat production requests.
6. **Measure — Quality and performance:** Use Search Console inspection to verify rendered text, canonical selection and indexing. Inspect mobile usability and real LCP, INP and CLS data when available. Installing Speed Insights does not itself establish good performance.

## AI search and structured data

Provide a short product definition using the consistent Handpress name, followed by clear factual sections and direct FAQ answers. Make important facts available as accessible HTML text, supported by authentic examples. These practices help retrieval and interpretation but do not guarantee citations.

Add accurate WebApplication/SoftwareApplication structured data reflecting visible product facts. Do not invent reviews, ratings, organization details or supported platforms. Structured data is an enhancement, not a substitute for accessible content or a guarantee of a rich result. A useful FAQ does not require FAQ rich-result eligibility.

Google states that its AI search features require no special AI markup or new AI text files. Treat `llms.txt` as optional experimentation rather than a launch requirement. Search-crawler permissions and model-training permissions are separate choices; for example, OpenAI documents OAI-SearchBot for search and GPTBot for training.

## Implementation and verification checklist

- [x] Apply the revised copy without changing the visual identity.
- [x] Add visible FAQ answers and one genuine output example.
- [x] Serve meaningful homepage HTML without waiting for Clerk.
- [x] Add canonical and social metadata, with a valid share image URL.
- [x] Add crawlable links and real URLs for substantive public pages as needed.
- [x] Add an accurate sitemap and review crawler permissions.
- [x] Add factual application structured data and validate its generated JSON locally. External rich-result validation remains a deployment check.
- [ ] Confirm advertised cloud features work in production.
- [ ] Verify the live page in Search Console and monitor relevant queries and useful conversions.
- [ ] Check mobile behavior and representative performance; do not infer results from dependencies or bundle size alone.

The original review changed documentation only. Implementation now uses `src/seo.ts` for shared metadata and public-route settings; the follow-up above records the code changes and validation. Search Console, keyword tools, a rendered mobile audit, field performance and AI citation performance were not inspected.

## References

- [Current metadata](../index.html)
- [Current landing copy](../src/components/Landing.tsx)
- [Current routing and Clerk rendering dependency](../src/App.tsx)
- [Documented product behavior and limits](../README.md)
- [Google: JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Google: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)
- [OpenAI: crawler purposes and controls](https://platform.openai.com/docs/bots)
