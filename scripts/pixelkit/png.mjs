import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const rowStart = y * (w * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function hex(c) {
  const s = c.replace("#", "");
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
    s.length > 6 ? parseInt(s.slice(6, 8), 16) : 255,
  ];
}

/**
 * Build RGBA pixels from an array of equal-length row strings and a palette map.
 * Returns { w, h, rgba }.
 */
export function raster(rows, palette) {
  const h = rows.length;
  const w = rows[0].length;
  for (const r of rows) {
    if (r.length !== w) throw new Error(`row width mismatch: expected ${w}, got ${r.length} in "${r}"`);
  }
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      const i = (y * w + x) * 4;
      if (ch === "." || ch === " ") continue;
      const c = palette[ch];
      if (!c) throw new Error(`palette char '${ch}' missing (row ${y}, col ${x})`);
      rgba[i] = c[0];
      rgba[i + 1] = c[1];
      rgba[i + 2] = c[2];
      rgba[i + 3] = c.length > 3 ? c[3] : 255;
    }
  }
  return { w, h, rgba };
}

export function scaleNearest(src, factor) {
  const w = src.w * factor;
  const h = src.h * factor;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.floor(y / factor);
    for (let x = 0; x < w; x++) {
      const sx = Math.floor(x / factor);
      const si = (sy * src.w + sx) * 4;
      const di = (y * w + x) * 4;
      out[di] = src.rgba[si];
      out[di + 1] = src.rgba[si + 1];
      out[di + 2] = src.rgba[si + 2];
      out[di + 3] = src.rgba[si + 3];
    }
  }
  return { w, h, rgba: out };
}

export function writeSprite(file, rows, palette, { scale = 8 } = {}) {
  const r = raster(rows, palette);
  const big = scale > 1 ? scaleNearest(r, scale) : r;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodePng(big.w, big.h, big.rgba));
  return { w: big.w, h: big.h, grid: `${r.w}x${r.h}` };
}

/** Composite RGBA layers onto a canvas of the given size at an offset. */
export function blit(canvas, w, h, src, ox, oy, alpha = 1) {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const dx = ox + x;
      const dy = oy + y;
      if (dx < 0 || dy < 0 || dx >= w || dy >= h) continue;
      const si = (y * src.w + x) * 4;
      const a = src.rgba[si + 3] * alpha;
      if (a === 0) continue;
      const di = (dy * w + dx) * 4;
      const da = canvas[di + 3];
      if (da === 0) {
        canvas[di] = src.rgba[si];
        canvas[di + 1] = src.rgba[si + 1];
        canvas[di + 2] = src.rgba[si + 2];
        canvas[di + 3] = a;
      } else {
        const na = a + da * (1 - a / 255);
        for (let c = 0; c < 3; c++)
          canvas[di + c] = Math.round(
            (src.rgba[si + c] * a + canvas[di + c] * da * (1 - a / 255)) / (na || 1),
          );
        canvas[di + 3] = na;
      }
    }
  }
}

export function fillCanvas(w, h, color) {
  const buf = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    buf[i * 4] = color[0];
    buf[i * 4 + 1] = color[1];
    buf[i * 4 + 2] = color[2];
    buf[i * 4 + 3] = color.length > 3 ? color[3] : 255;
  }
  return buf;
}

export function solidRect(buf, w, x, y, rw, rh, color) {
  for (let j = y; j < y + rh; j++) {
    for (let i = x; i < x + rw; i++) {
      if (i < 0 || j < 0 || i >= w) continue;
      const di = (j * w + i) * 4;
      buf[di] = color[0];
      buf[di + 1] = color[1];
      buf[di + 2] = color[2];
      buf[di + 3] = color.length > 3 ? color[3] : 255;
    }
  }
}

export async function decodePng(path) {
  const zlib = await import("node:zlib");
  const b = fs.readFileSync(path);
  let pos = 8;
  let w = 0;
  let h = 0;
  let bitDepth = 8;
  let colorType = 6;
  let idat = Buffer.alloc(0);
  while (pos < b.length) {
    const len = b.readUInt32BE(pos);
    const type = b.toString("ascii", pos + 4, pos + 8);
    if (type === "IHDR") {
      w = b.readUInt32BE(pos + 8);
      h = b.readUInt32BE(pos + 12);
      bitDepth = b[pos + 16];
      colorType = b[pos + 17];
    } else if (type === "IDAT") {
      idat = Buffer.concat([idat, b.slice(pos + 8, pos + 8 + len)]);
    }
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(idat);
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const stride = w * ch;
  const out = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, y * (stride + 1) + stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0;
      const bb = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (ft === 1) v = (v + a) & 255;
      else if (ft === 2) v = (v + bb) & 255;
      else if (ft === 3) v = (v + ((a + bb) >> 1)) & 255;
      else if (ft === 4) {
        const p = a + bb - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - bb);
        const pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? bb : c)) & 255;
      }
      cur[i] = v;
    }
  }
  return { w, h, bitDepth, colorType, px: out, ch };
}

function await0() {
  // node:zlib via createRequire-free dynamic import is not available sync; use bundled
  return globalThis.__zlib;
}

export function stats(info) {
  const { w, h, px, ch } = info;
  let opaque = 0;
  let topLeft = 0;
  let bottomRight = 0;
  let alphaMax = 0;
  let alphaMin = 255;
  const cols = [];
  const rows = [];
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let first = null;
  for (let y = 0; y < h; y++) {
    let any = false;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      const a = ch === 4 ? px[i + 3] : 255;
      if (a > alphaMax) alphaMax = a;
      if (a < alphaMin) alphaMin = a;
      if (a > 10) {
        any = true;
        opaque++;
        sumR += px[i];
        sumG += px[i + 1];
        sumB += px[i + 2];
        if (!first) first = { x, y };
        bottomRight = { x, y };
      }
    }
    rows.push(any);
  }
  for (let x = 0; x < w; x++) {
    let any = false;
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * ch;
      if ((ch === 4 ? px[i + 3] : 255) > 10) {
        any = true;
        break;
      }
    }
    cols.push(any);
  }
  const minY = rows.indexOf(true);
  const maxY = rows.lastIndexOf(true);
  const minX = cols.indexOf(true);
  const maxX = cols.lastIndexOf(true);
  const total = w * h;
  // distinct colours among opaque pixels (quantised to 4 bits/channel)
  const palette = new Set();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      if ((ch === 4 ? px[i + 3] : 255) > 10)
        palette.add(`${px[i] >> 4},${px[i + 1] >> 4},${px[i + 2] >> 4}`);
    }
  return {
    size: `${w}x${h}`,
    opaquePct: +((100 * opaque) / total).toFixed(1),
    bbox: { minX, minY, maxX, maxY },
    bboxPctOfCanvas: +(
      (100 * ((maxX - minX + 1) * (maxY - minY + 1))) /
      total
    ).toFixed(1),
    margin: { top: minY, bottom: h - 1 - maxY, left: minX, right: w - 1 - maxX },
    alphaRange: [alphaMin, alphaMax],
    paletteColors: palette.size,
    avgRGB: opaque ? [Math.round(sumR / opaque), Math.round(sumG / opaque), Math.round(sumB / opaque)] : null,
    firstOpaque: first,
  };
}
