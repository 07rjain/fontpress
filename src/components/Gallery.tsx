import { useEffect, useState } from 'react';
import { fetchFontFile, listPublicFonts, type SavedFont } from '../api';
import { CHARSET } from '../spec';
import { FontCard, relativeTime } from './FontCard';

type Props = {
  onDownload: (font: SavedFont) => void;
  onStart: () => void;
};

export function Gallery({ onDownload, onStart }: Props) {
  const [fonts, setFonts] = useState<SavedFont[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setError('');
    listPublicFonts().then(
      (list) => alive && setFonts(list),
      (err: Error) => alive && setError(err.message),
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  return (
    <div className="collection-page">
      <header className="collection-head">
        <div>
          <p className="eyebrow">Gallery</p>
          <h1>Fonts people have published</h1>
          <p className="lede">Handwriting fonts made with Handpress. Every one here is free to download.</p>
        </div>
        <button type="button" className="primary" onClick={onStart}>
          Make your own
        </button>
      </header>

      {error && (
        <div className="empty">
          <p>{error}</p>
          <button type="button" className="ghost" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </button>
        </div>
      )}
      {!error && fonts === null && <p className="meta">Loading the gallery…</p>}
      {!error && fonts?.length === 0 && (
        <div className="empty">
          <h2>No public fonts yet</h2>
          <p>Be the first. Draw your alphabet, then publish it from the Specimen page.</p>
        </div>
      )}

      {fonts && fonts.length > 0 && (
        <div className="card-grid">
          {fonts.map((font) => (
            <FontCard
              key={font.id}
              font={font}
              sample="The quick brown fox jumps over the lazy dog."
              load={() => fetchFontFile(font)}
              byline={`by ${font.designer || font.ownerName} · ${font.glyphCount} of ${CHARSET.length} characters · ${relativeTime(font.updatedAt)}`}
            >
              <button type="button" className="ghost" onClick={() => onDownload(font)}>
                Download
              </button>
            </FontCard>
          ))}
        </div>
      )}
    </div>
  );
}
