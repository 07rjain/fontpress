import { useEffect, useState, type ReactNode } from 'react';
import type { SavedFont } from '../api';

const families = new Map<string, Promise<string>>();

function useFontFamily(font: SavedFont, load: () => Promise<ArrayBuffer>): string | null | false {
  const key = `${font.id}-${font.updatedAt}`;
  const [family, setFamily] = useState<string | null | false>(null);

  useEffect(() => {
    let alive = true;
    let pending = families.get(key);
    if (!pending) {
      const name = `hp_${key.replace(/[^a-z0-9]/gi, '')}`;
      pending = load().then(async (buffer) => {
        const face = new FontFace(name, buffer);
        await face.load();
        document.fonts.add(face);
        return name;
      });
      families.set(key, pending);
      pending.catch(() => families.delete(key));
    }
    pending.then(
      (name) => alive && setFamily(name),
      () => alive && setFamily(false),
    );
    return () => {
      alive = false;
    };
    // load is recreated each render; the key identifies the file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return family;
}

type Props = {
  font: SavedFont;
  sample: string;
  load: () => Promise<ArrayBuffer>;
  byline: ReactNode;
  badges?: ReactNode;
  children?: ReactNode;
};

export function FontCard({ font, sample, load, byline, badges, children }: Props) {
  const family = useFontFamily(font, load);
  const style = family ? { fontFamily: `"${family}", var(--serif)` } : undefined;

  return (
    <article className="font-card">
      <div className={family === null ? 'font-card-preview loading' : 'font-card-preview'} style={style} aria-hidden="true">
        {family === false ? (
          <span className="preview-error">Preview unavailable</span>
        ) : (
          <>
            <p className="font-card-title">{font.name}</p>
            <p className="font-card-sample">{sample}</p>
          </>
        )}
      </div>
      <div className="font-card-body">
        <div className="font-card-head">
          <h3>{font.name}</h3>
          {badges}
        </div>
        <p className="meta">{byline}</p>
        {children && <div className="font-card-actions">{children}</div>}
      </div>
    </article>
  );
}

export function relativeTime(ms: number): string {
  const seconds = Math.round((Date.now() - ms) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(ms).toLocaleDateString();
}
