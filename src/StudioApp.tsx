import { ClerkProvider } from '@clerk/react';
import { App } from './App';

function navigate(method: 'pushState' | 'replaceState') {
  return (to: string) => {
    window.history[method](null, '', to);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
}

export default function StudioApp() {
  const publishableKey = import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) return <main className="boot"><p>The studio is not configured yet. Please try again later.</p><a href="/">Back to Fontpress</a></main>;
  return <ClerkProvider publishableKey={publishableKey} afterSignOutUrl="/" routerPush={navigate('pushState')} routerReplace={navigate('replaceState')}
    appearance={{ variables: { colorPrimary: '#243f38', colorForeground: '#1c1915', colorBackground: '#f8f4ec', fontFamily: '"Libre Franklin", "Avenir Next", "Segoe UI", sans-serif', borderRadius: '6px' } }}>
    <App />
  </ClerkProvider>;
}
