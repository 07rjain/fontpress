import { useEffect, useState } from 'react';
import { fetchFontFile, searchPublicFonts, type FontPage } from '../api';
import { CHARSET } from '../spec';
import { FontCard, relativeTime } from './FontCard';
import type { SavedFont } from '../api';

type Props = { onDownload: (font: SavedFont) => void; onStart: () => void };

export function Gallery({ onDownload, onStart }: Props) {
  const [result, setResult] = useState<FontPage | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    searchPublicFonts(query, page).then(
      (value) => {
        if (!alive) return;
        // A font may have been made private while browsing the last page.
        const last = Math.max(1, Math.ceil(value.total / value.pageSize));
        if (page > last) { setPage(last); return; }
        setResult(value);
        setLoading(false);
      },
      (err: Error) => { if (alive) { setError(err.message); setLoading(false); } },
    );
    return () => { alive = false; };
  }, [attempt, query, page]);

  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  return (
    <div className="collection-page">
      <header className="collection-head">
        <div>
          <p className="eyebrow">Gallery</p>
          <h1>Fonts people have published</h1>
          <p className="lede">Handwriting fonts made with Handpress. Every one here is free to download.</p>
        </div>
        <button type="button" className="primary" onClick={onStart}>Make your own</button>
      </header>
      <form className="gallery-search" role="search" onSubmit={(event) => {
        event.preventDefault(); setQuery(input.trim()); setPage(1); setAttempt((value) => value + 1);
      }}>
        <label className="field"><span>Search fonts or designers</span>
          <input type="search" value={input} maxLength={100} onChange={(event) => setInput(event.target.value)} />
        </label>
        <button type="submit" className="ghost">Search</button>
      </form>
      {loading && <p className="meta" role="status">Loading the gallery…</p>}
      {error && <div className="empty" role="alert"><p>{error}</p>
        <button type="button" className="ghost" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
      </div>}
      {!loading && !error && result?.fonts.length === 0 && <div className="empty">
        <h2>{query ? 'No matching fonts' : 'No public fonts yet'}</h2>
        <p>{query ? 'Try another font name or designer.' : 'Be the first. Draw your alphabet, then publish it from the Specimen page.'}</p>
      </div>}
      {!loading && !error && result && result.fonts.length > 0 && <>
        <p className="meta" role="status">{result.total} font{result.total === 1 ? '' : 's'}{query ? ` matching “${query}”` : ''}</p>
        <div className="card-grid">{result.fonts.map((font) => <FontCard key={font.id} font={font}
          sample="The quick brown fox jumps over the lazy dog." load={() => fetchFontFile(font)}
          byline={`by ${font.designer || font.ownerName} · ${font.glyphCount} of ${CHARSET.length} characters · ${relativeTime(font.updatedAt)}`}>
          <button type="button" className="ghost" onClick={() => onDownload(font)}>Download</button>
        </FontCard>)}</div>
        <nav className="pagination" aria-label="Gallery pages">
          <button type="button" className="ghost" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
          <span>Page {page} of {pages}</span>
          <button type="button" className="ghost" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next</button>
        </nav>
      </>}
    </div>
  );
}
