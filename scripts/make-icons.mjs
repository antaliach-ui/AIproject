// Generates the PNG app icons (same artwork as icons/icon.svg) with no dependencies.
// Usage: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');

const BG = [0x1e, 0x3a, 0x8a];
const WHITE = [255, 255, 255];
const IRIS = [0xfb, 0xbf, 0x24];
const PUPIL = [0x0f, 0x17, 0x2a];

// Colour at a point in the 512x512 artwork, or null if transparent.
function sample(x, y, { maskable }) {
  if (!maskable) {
    // Rounded square background, radius 96.
    const r = 96;
    const cx = Math.min(Math.max(x, r), 512 - r);
    const cy = Math.min(Math.max(y, r), 512 - r);
    if (Math.hypot(x - cx, y - cy) > r) return null;
  } else {
    // Maskable: full-bleed background, artwork shrunk into the 80% safe zone.
    x = 256 + (x - 256) / 0.8;
    y = 256 + (y - 256) / 0.8;
  }
  const d = Math.hypot(x - 256, y - 256);
  if (Math.hypot(x - 276, y - 236) <= 14) return WHITE;
  if (d <= 44) return PUPIL;
  if (d <= 92) return IRIS;
  if (x > 56 && x < 456) {
    const t = (x - 56) / 400;
    if (Math.abs(y - 256) < 400 * t * (1 - t)) return WHITE;
  }
  return BG;
}

function render(size, opts) {
  const ss = 4; // supersampling per axis
  const px = Buffer.alloc(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = ((i + (sx + 0.5) / ss) / size) * 512;
          const y = ((j + (sy + 0.5) / ss) / size) * 512;
          const c = sample(x, y, opts);
          if (c) {
            r += c[0]; g += c[1]; b += c[2]; a += 1;
          }
        }
      }
      const o = (j * size + i) * 4;
      const n = ss * ss;
      px[o] = a ? Math.round(r / a) : 0;
      px[o + 1] = a ? Math.round(g / a) : 0;
      px[o + 2] = a ? Math.round(b / a) : 0;
      px[o + 3] = Math.round((a / n) * 255);
    }
  }
  return encodePng(size, size, px);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync(join(outDir, 'icon-192.png'), render(192, { maskable: false }));
writeFileSync(join(outDir, 'icon-512.png'), render(512, { maskable: false }));
writeFileSync(join(outDir, 'maskable-512.png'), render(512, { maskable: true }));
console.log('Icons written to', outDir);
