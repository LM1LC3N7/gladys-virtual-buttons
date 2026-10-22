// Generates cover.png (800x534) for gladys-virtual-buttons: plain Node, no dependency.
// Usage: node scripts/cover.mjs cover.png
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const W = 800;
const H = 534;
const px = Buffer.alloc(W * H * 3);
const set = (x, y, [r, g, b], a = 1) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = px[i] * (1 - a) + r * a;
  px[i + 1] = px[i + 1] * (1 - a) + g * a;
  px[i + 2] = px[i + 2] * (1 - a) + b * a;
};

// Background: diagonal gradient, deep teal to night blue.
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    const t = (x / W + y / H) / 2;
    set(x, y, [16 + 20 * t, 60 - 30 * t, 80 + 40 * t]);
  }
}
const white = [255, 255, 255];

const disc = (cx, cy, r, color, alpha = 1) => {
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y += 1) {
    for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x += 1) {
      const a = Math.max(0, Math.min(1, r - Math.hypot(x - cx, y - cy) + 0.5));
      if (a > 0) set(x, y, color, a * alpha);
    }
  }
};
const box = (x0, y0, x1, y1, r, color, alpha = 1) => {
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const cx = Math.min(Math.max(x + 0.5, x0 + r), x1 - r);
      const cy = Math.min(Math.max(y + 0.5, y0 + r), y1 - r);
      const a = Math.max(0, Math.min(1, r - Math.hypot(x + 0.5 - cx, y + 0.5 - cy) + 0.5));
      if (a > 0) set(x, y, color, a * alpha);
    }
  }
};
const ring = (cx, cy, r, width, color, gapFrom = 0, gapTo = 0) => {
  for (let y = Math.floor(cy - r - width); y <= cy + r + width; y += 1) {
    for (let x = Math.floor(cx - r - width); x <= cx + r + width; x += 1) {
      const ang = Math.atan2(y - cy, x - cx);
      if (ang > gapFrom && ang < gapTo) continue;
      const a = Math.max(
        0,
        Math.min(1, width / 2 - Math.abs(Math.hypot(x - cx, y - cy) - r) + 0.5),
      );
      if (a > 0) set(x, y, color, a);
    }
  }
};

disc(400, 267, 260, white, 0.04);

// The dashboard card.
box(110, 70, 690, 464, 28, [248, 249, 252]);
box(150, 110, 420, 130, 8, [200, 205, 215]);

const blue = [32, 107, 196];
const grey = [134, 142, 150];
const red = [205, 32, 31];

// Three pills: power (blue), flame (red), moon (grey).
const pill = (x, y, color) => box(x, y, x + 150, y + 64, 32, color);
pill(150, 170, blue);
pill(325, 170, red);
pill(500, 170, grey);
// Power icon on the first pill.
ring(195, 202, 14, 5, white, -Math.PI * 0.7, -Math.PI * 0.3);
box(192, 182, 198, 202, 3, white);
// Flame on the second.
disc(370, 208, 12, white);
for (let i = 0; i < 18; i += 1) disc(370 + Math.sin(i / 5) * 2, 196 - i, 10 - i * 0.5, white);
// Moon on the third.
disc(545, 202, 14, white);
disc(552, 196, 12, grey);
// Short label bars.
for (const [x, c] of [
  [222, blue],
  [397, red],
  [572, grey],
]) {
  box(x, 195, x + 56, 209, 7, white, c === grey ? 0.9 : 1);
}

// A big switch, on, and a timer ring.
box(150, 290, 390, 410, 60, [218, 234, 252]);
box(160, 300, 380, 400, 50, blue);
disc(330, 350, 42, white);
ring(540, 350, 58, 12, [225, 228, 235]);
ring(540, 350, 58, 12, blue, -Math.PI, -Math.PI / 2);
box(536, 310, 544, 352, 4, [60, 66, 80]);
box(540, 346, 574, 354, 4, [60, 66, 80]);

// PNG encoding.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;
ihdr[9] = 2;
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y += 1) {
  raw[y * (W * 3 + 1)] = 0;
  px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync(process.argv[2] ?? 'cover.png', png);
console.log('cover', png.length, 'bytes');
