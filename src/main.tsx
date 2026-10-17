import { ClerkProvider } from '@clerk/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const publishableKey = import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const root = createRoot(document.getElementById('root')!);

// Clerk's default navigation sets window.location, and a hash-only change to
// "#/draw" never reloads the page, so Clerk would never publish the new session.
function navigate(method: 'pushState' | 'replaceState') {
  return (to: string) => {
    window.history[method](null, '', to);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
}

if (!publishableKey) {
  root.render(
    <div className="boot">
      <p>Add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY to .env and restart the dev server.</p>
    </div>,
  );
} else {
  root.render(
    <StrictMode>
      <ClerkProvider
        publishableKey={publishableKey}
        afterSignOutUrl="/"
        routerPush={navigate('pushState')}
        routerReplace={navigate('replaceState')}
        appearance={{
          variables: {
            colorPrimary: '#243f38',
            colorForeground: '#1c1915',
            colorBackground: '#f8f4ec',
            fontFamily: '"Libre Franklin", "Avenir Next", "Segoe UI", sans-serif',
            borderRadius: '6px',
          },
        }}
      >
        <App />
      </ClerkProvider>
    </StrictMode>,
  );
}
