export function fontFormat(buffer: ArrayBuffer | Uint8Array) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const otf = bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x54 && bytes[2] === 0x54 && bytes[3] === 0x4f;
  return otf ? { extension: 'otf', mime: 'font/otf' } as const : { extension: 'ttf', mime: 'font/ttf' } as const;
}
