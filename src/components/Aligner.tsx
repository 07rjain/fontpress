import { useEffect, useMemo, useRef, useState } from 'react';
import { extractSheet } from '../extract';
import { applyH, solveHomography } from '../geometry';
import type { LoadedPhoto } from '../image';
import { cellRect, inkRect, SHEETS, sheetMarkCenters, type SheetId } from '../spec';

const HANDLE_LABELS = ['Top-left square', 'Top-right square', 'Bottom-left square', 'Bottom-right square'];

type Props = {
  photo: LoadedPhoto;
  filled: Set<string>;
  onCancel: () => void;
  onSheet: (sheet: SheetId) => void;
  onApply: (images: Record<string, string>) => void;
};

export function Aligner({ photo, filled, onCancel, onSheet, onApply }: Props) {
  const { raster, bitmap } = photo;
  const [corners, setCorners] = useState(photo.corners);
  const [delta, setDelta] = useState(50);
  const [phase, setPhase] = useState<'align' | 'working' | 'review'>('align');
  const [progress, setProgress] = useState(0);
  const [pending, setPending] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState('');
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<number | null>(null);
  const cancel = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  }, [bitmap]);

  useEffect(() => () => {
    cancel.current = true;
  }, []);

  const homography = useMemo(() => solveHomography(sheetMarkCenters(), corners), [corners]);
  const sheet = SHEETS[photo.sheet];

  const polygons = useMemo(() => {
    if (!homography) return [];
    return sheet.chars.map((char, index) => {
      const ink = inkRect(photo.sheet, index);
      const cell = cellRect(photo.sheet, index);
      const points = [
        applyH(homography, ink.x, ink.y),
        applyH(homography, ink.x + ink.w, ink.y),
        applyH(homography, ink.x + ink.w, ink.y + ink.h),
        applyH(homography, ink.x, ink.y + ink.h),
      ];
      const labelAt = applyH(homography, cell.x + cell.w / 2, cell.y + cell.h * 0.09);
      const width = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      return { char, index, points, labelAt, size: width * 0.16 };
    });
  }, [homography, photo.sheet, sheet.chars]);

  function clientToImage(event: { clientX: number; clientY: number }) {
    const rect = stageRef.current!.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * raster.w, 0, raster.w),
      y: clamp(((event.clientY - rect.top) / rect.height) * raster.h, 0, raster.h),
    };
  }

  async function extract() {
    setError('');
    setPhase('working');
    setProgress(0);
    cancel.current = false;
    try {
      const images = await extractSheet(
        raster,
        corners,
        photo.sheet,
        delta,
        () => cancel.current,
        (done, total) => setProgress(Math.round((done / total) * 100)),
      );
      if (cancel.current) return;
      setPending(images);
      setPhase('review');
    } catch (err) {
      setPhase('align');
      setError(err instanceof Error ? err.message : 'Could not read the page.');
    }
  }

  const found = pending ? Object.keys(pending) : [];
  const overlap = found.filter((char) => filled.has(char));

  return (
    <div className="aligner no-print">
      <div className="align-copy">
        <button type="button" className="text-btn back" onClick={onCancel}>
          ← Back to the board
        </button>
        <p className="eyebrow">Photograph</p>
        <h2>Line the grid up with the page.</h2>
        <p className="lede">
          {photo.detected
            ? 'The black squares were found. Confirm the letters sit in the right boxes.'
            : 'Drag each red handle onto a corner square.'}
        </p>
        <div className="segmented" role="group" aria-label="Template page">
          <button
            type="button"
            aria-pressed={photo.sheet === 'upper'}
            onClick={() => {
              onSheet('upper');
              setPhase('align');
              setPending(null);
            }}
          >
            Page 1 · Capitals
          </button>
          <button
            type="button"
            aria-pressed={photo.sheet === 'lower'}
            onClick={() => {
              onSheet('lower');
              setPhase('align');
              setPending(null);
            }}
          >
            Page 2 · Lowercase
          </button>
        </div>
        <div className="field">
          <label htmlFor="darkness">Darkness {delta}</label>
          <input
            id="darkness"
            type="range"
            min={28}
            max={90}
            value={delta}
            onChange={(event) => {
              setDelta(Number(event.target.value));
              setPhase('align');
              setPending(null);
            }}
          />
        </div>
        <p className="hint">If ink is missed, lower the number. If the paper texture comes through, raise it.</p>
        {error && <p className="error">{error}</p>}
        {phase === 'working' && <p className="hint">Reading the page… {progress}%</p>}
        {phase === 'review' && pending && (
          <div className="review">
            <p>
              Found ink for {found.length} letters
              {overlap.length > 0 ? `, including ${overlap.length} you already drew` : ''}.
            </p>
            {found.length === 0 && <p className="error">No letters came through. Adjust the squares or the darkness.</p>}
            <div className="template-actions">
              {found.length > 0 && overlap.length > 0 && (
                <button type="button" className="primary" onClick={() => onApply(pending)}>
                  Replace what I drew
                </button>
              )}
              {found.length > 0 && (
                <button
                  type="button"
                  className={overlap.length > 0 ? 'ghost' : 'primary'}
                  onClick={() => {
                    const emptyOnly: Record<string, string> = {};
                    for (const [char, image] of Object.entries(pending)) {
                      if (!filled.has(char)) emptyOnly[char] = image;
                    }
                    onApply(emptyOnly);
                  }}
                >
                  {overlap.length > 0 ? 'Only fill empty letters' : 'Use these letters'}
                </button>
              )}
              <button
                type="button"
                className="text-btn"
                onClick={() => {
                  setPhase('align');
                  setPending(null);
                }}
              >
                Adjust alignment
              </button>
            </div>
          </div>
        )}
        {phase === 'align' && (
          <button type="button" className="primary" disabled={!homography} onClick={() => void extract()}>
            Extract letters
          </button>
        )}
      </div>
      <div className="align-stage">
        <div
          className="stage"
          ref={stageRef}
          style={{ aspectRatio: `${raster.w} / ${raster.h}` }}
        >
          <canvas ref={canvasRef} />
          <svg className="overlay" viewBox={`0 0 ${raster.w} ${raster.h}`}>
            {polygons.map((poly) => (
              <g key={poly.index}>
                <polygon
                  points={poly.points.map((point) => `${point.x},${point.y}`).join(' ')}
                  fill="rgba(36, 63, 56, 0.08)"
                  stroke="#243f38"
                  strokeWidth={Math.max(2, raster.w / 700)}
                />
                <text
                  x={poly.labelAt.x}
                  y={poly.labelAt.y}
                  textAnchor="middle"
                  fill="#243f38"
                  fontSize={Math.max(12, poly.size)}
                  fontFamily="Libre Franklin, sans-serif"
                >
                  {poly.char}
                </text>
              </g>
            ))}
          </svg>
          {corners.map((point, index) => (
            <button
              key={HANDLE_LABELS[index]}
              type="button"
              className="handle"
              aria-label={HANDLE_LABELS[index]}
              style={{ left: `${(point.x / raster.w) * 100}%`, top: `${(point.y / raster.h) * 100}%` }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                drag.current = index;
                setPhase('align');
                setPending(null);
              }}
              onPointerMove={(event) => {
                if (drag.current !== index) return;
                const next = clientToImage(event);
                setCorners((current) => current.map((corner, cornerIndex) => (cornerIndex === index ? next : corner)));
              }}
              onPointerUp={() => {
                drag.current = null;
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
