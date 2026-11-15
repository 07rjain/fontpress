import type { ReactNode } from 'react';

/** Keep public destinations crawlable and preserve open-in-new-tab behavior. */
export function ActionLink({ href, onClick, className, children }: {
  href: string; onClick?: () => void; className?: string; children: ReactNode;
}) {
  return <a href={href} className={className} onClick={(event) => {
    if (!onClick || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onClick();
  }}>{children}</a>;
}
