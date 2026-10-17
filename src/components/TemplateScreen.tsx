import { markMetrics, pageFlagCenter, SHEETS, cellRect, inkRect, type SheetId } from '../spec';
import { GUIDES } from '../spec';
import type { Point } from '../types';

export function TemplateScreen({ onBack, onUpload }: { onBack: () => void; onUpload: () => void }) {
  return (
    <div className="template-screen">
      <div className="template-layout">
        <div className="template-copy no-print">
          <button type="button" className="text-btn back" onClick={onBack}>
            ← Back to the board
          </button>
          <p className="eyebrow">Template</p>
          <h2>Write the alphabet, then photograph it.</h2>
          <ol className="steps">
            <li>Print both pages. Use black ink and sit each letter on the blue line.</li>
            <li>Stay inside the guides. Leave every black square empty, including the extra square at the top of page 2.</li>
            <li>Photograph one page at a time, with all four corner squares in the frame, then upload it here.</li>
          </ol>
          <div className="template-actions">
            <button type="button" className="primary" onClick={() => window.print()}>
              Print both pages
            </button>
            <button type="button" className="ghost" onClick={onUpload}>
              Upload a photo
            </button>
          </div>
        </div>
        <div className="sheets">
          <Sheets />
        </div>
      </div>
    </div>
  );
}

export function Sheets() {
  return (
    <>
      <SheetView id="upper" />
      <SheetView id="lower" />
    </>
  );
}

function SheetView({ id }: { id: SheetId }) {
  const sheet = SHEETS[id];
  const marks = markCenters();
  return (
    <article className="sheet" aria-label={`${sheet.page}, ${sheet.title}`}>
      <header className="sheet-head">
        <strong>
          {sheet.page} · {sheet.title}
        </strong>
        <span>Black pen on the blue line. Leave the black squares empty.</span>
      </header>
      {marks.map((center) => (
        <i key={`${center.x}-${center.y}`} className="mark" style={markBox(center)} />
      ))}
      {id === 'lower' && <i className="mark" style={markBox(pageFlagCenter())} />}
      {sheet.chars.map((char, index) => {
        const cell = cellRect(id, index);
        const ink = inkRect(id, index);
        return (
          <div key={`${char}-${index}`}>
            <div
              className="cell-label"
              style={{
                left: `${cell.x}%`,
                top: `${cell.y}%`,
                width: `${cell.w}%`,
                height: `${cell.h * 0.18}%`,
              }}
            >
              <span>{char}</span>
            </div>
            <div
              className="ink-box"
              style={{
                left: `${ink.x}%`,
                top: `${ink.y}%`,
                width: `${ink.w}%`,
                height: `${ink.h}%`,
              }}
            >
              <span className="watermark">{char}</span>
              <i style={{ top: `${GUIDES.cap * 100}%` }} />
              <i className="xh" style={{ top: `${GUIDES.xh * 100}%` }} />
              <i className="base" style={{ top: `${GUIDES.baseline * 100}%` }} />
              <i className="desc" style={{ top: `${GUIDES.desc * 100}%` }} />
            </div>
          </div>
        );
      })}
    </article>
  );
}

function markCenters(): Point[] {
  const { insetX, insetY } = markMetrics();
  return [
    { x: insetX, y: insetY },
    { x: 100 - insetX, y: insetY },
    { x: insetX, y: 100 - insetY },
    { x: 100 - insetX, y: 100 - insetY },
  ];
}

function markBox(center: Point): { left: string; top: string; width: string; height: string } {
  const { sizeX, sizeY } = markMetrics();
  return {
    left: `${center.x - sizeX / 2}%`,
    top: `${center.y - sizeY / 2}%`,
    width: `${sizeX}%`,
    height: `${sizeY}%`,
  };
}
