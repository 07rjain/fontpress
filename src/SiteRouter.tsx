import { Suspense, lazy, useEffect, useState } from 'react';
import { PublicSite } from './components/PublicSite';
import { PUBLIC_PAGES, publicPath } from './seo';

const StudioApp = lazy(() => import('./StudioApp'));
const currentPublicPath = () => publicPath(window.location.pathname, window.location.hash);

export function SiteRouter() {
  const [path, setPath] = useState(currentPublicPath);
  useEffect(() => {
    const sync = () => setPath(currentPublicPath());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => { window.removeEventListener('hashchange', sync); window.removeEventListener('popstate', sync); };
  }, []);
  useEffect(() => {
    if (path) {
      document.title = PUBLIC_PAGES[path].title;
      document.querySelector('meta[name="robots"]')?.setAttribute('content', PUBLIC_PAGES[path].index ? 'index,follow' : 'noindex,follow');
    }
  }, [path]);
  return path ? <PublicSite key={path} path={path} /> : <Suspense fallback={<main className="boot"><p>Opening your font studio…</p></main>}><StudioApp /></Suspense>;
}
