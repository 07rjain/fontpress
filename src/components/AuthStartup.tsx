import { useClerk } from '@clerk/react';
import { useEffect, useState } from 'react';

/** Authentication must either finish loading or offer a visible way to retry. */
export function AuthStartup() {
  const { status } = useClerk();
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), 20_000);
    return () => window.clearTimeout(timer);
  }, []);
  const failed = status === 'error' || timedOut;
  return (
    <main className="gate auth-startup">
      <section className="gate-card" role={failed ? 'alert' : 'status'}>
        <span className="brand-mark big" aria-hidden="true">F</span>
        <h1>{failed ? 'We couldn’t connect to sign-in' : 'Connecting to sign-in…'}</h1>
        <p className="lede">{failed
          ? 'Sign-in is temporarily unavailable. Please try loading the page again in a moment.'
          : 'Getting your font studio ready.'}</p>
        {failed && <button type="button" className="primary" onClick={() => window.location.reload()}>Try again</button>}
      </section>
    </main>
  );
}
