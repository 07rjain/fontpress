export const SITE_URL = 'https://fontpress.subdomain.wtf';

export const PUBLIC_PAGES = {
  '/': {
    title: 'Handwriting Font Generator — Create Your Own | Fontpress',
    description: 'Create a font from your handwriting. Draw letters or upload a completed template, preview your words, and download an OpenType font. Free with an account.',
    index: true,
  },
  '/handwriting-template': {
    title: 'Handwriting Font Template: Print and Photo Guide | Fontpress',
    description: 'Learn how to print the two-page Fontpress template, write all 85 characters, photograph each page, and turn your handwriting into an OpenType font.',
    index: true,
  },
  '/install-font': {
    title: 'How to Install Your Handwriting Font on Mac or Windows | Fontpress',
    description: 'Install your Fontpress OpenType font with Font Book on Mac or the font installer on Windows. Learn how to find your font and troubleshoot missing letters.',
    index: true,
  },
  '/gallery': {
    title: 'Browse Handwriting Fonts Made with Fontpress',
    description: 'Preview handwriting fonts published by the Fontpress community. Browse by font name or designer and download a completed OpenType font.',
    // Index this collection when its live API and public font content are verified.
    index: false,
  },
} as const;

export type PublicPath = keyof typeof PUBLIC_PAGES;

export function publicPath(pathname: string, hash: string): PublicPath | null {
  if (/^#\/?(?:draw|specimen|template|align|library|gallery)$/.test(hash)) return null;
  const path = pathname.replace(/\/$/, '') || '/';
  return Object.hasOwn(PUBLIC_PAGES, path) ? path as PublicPath : null;
}

export function structuredData(path: PublicPath) {
  const page = PUBLIC_PAGES[path];
  const url = `${SITE_URL}${path}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${SITE_URL}/#website`, name: 'Fontpress', url: `${SITE_URL}/` },
      { '@type': 'WebPage', '@id': `${url}#webpage`, name: page.title, description: page.description, url,
        isPartOf: { '@id': `${SITE_URL}/#website` }, inLanguage: 'en' },
      ...(path === '/' ? [{ '@type': 'WebApplication', '@id': `${SITE_URL}/#application`, name: 'Fontpress',
        url: `${SITE_URL}/`, applicationCategory: 'DesignApplication', operatingSystem: 'Web browser',
        description: 'A free online handwriting font generator. Draw or import 85 English letters, numbers and punctuation, preview your writing, and export an OpenType font. An account is required.',
        isAccessibleForFree: true }] : []),
    ],
  };
}
