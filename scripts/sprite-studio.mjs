/**
 * Sprite staging: turn the raw raphael.app dumps into in-game PNGs plus a
 * contact sheet to judge, then promote the chosen one.
 *
 *   node scripts/sprite-studio.mjs build <slug> [files…]  # pixelize + sheet
 *   node scripts/sprite-studio.mjs pick <slug> <n>        # sheet pick -> public/game
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { encodePng, decodePng } from "./pixelkit/png.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const STAGE = path.join(ROOT, "..", "raphael-out");
const PX = path.join(STAGE, "px");
const OUT = path.join(ROOT, "public", "game");
const CELL = 260;
const LABEL = 26;

const GLYPHS = {
  "0": ["111", "101", "101", "101", "111"], "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"], "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"], "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"], "9": ["111", "101", "111", "001", "111"],
  "-": ["000", "000", "111", "000", "000"], "=": ["000", "111", "000", "111", "000"],
};

function drawText(buf, w, x, y, str, color) {
  let cx = x;
  for (const ch of str) {
    const glyph = GLYPHS[ch];
    if (!glyph) {
      cx += 4;
      continue;
    }
    for (let gy = 0; gy < 5; gy++)
      for (let gx = 0; gx < 3; gx++)
        if (glyph[gy][gx] === "1") {
          const i = ((y + gy) * w + cx + gx) * 4;
          buf[i] = color[0];
          buf[i + 1] = color[1];
          buf[i + 2] = color[2];
          buf[i + 3] = 255;
        }
    cx += 4;
  }
}

function checker(w, h) {
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const on = ((x >> 4) + (y >> 4)) & 1;
      px[i] = on ? 46 : 34;
      px[i + 1] = on ? 50 : 38;
      px[i + 2] = on ? 60 : 46;
      px[i + 3] = 255;
    }
  return px;
}

function blit(dst, dw, src, sw, sh, ox, oy) {
  for (let y = 0; y < sh; y++)
    for (let x = 0; x < sw; x++) {
      const si = (y * sw + x) * 4;
      if (!src[si + 3]) continue;
      const di = ((oy + y) * dw + ox + x) * 4;
      dst[di] = src[si];
      dst[di + 1] = src[si + 1];
      dst[di + 2] = src[si + 2];
      dst[di + 3] = 255;
    }
}

function nearest(src, sw, sh, sch, dw, dh) {
  const buf = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < dh; y++)
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.floor((x * sw) / dw));
      const sy = Math.min(sh - 1, Math.floor((y * sh) / dh));
      const si = (sy * sw + sx) * sch;
      const di = (y * dw + x) * 4;
      buf[di] = src[si];
      buf[di + 1] = src[si + 1];
      buf[di + 2] = src[si + 2];
      buf[di + 3] = sch === 4 ? src[si + 3] : 255;
    }
  return buf;
}

/** Coverage and colour count separate a real sprite from a blank or a photo. */
function audit(img) {
  const { w, h, px, ch } = img;
  let n = 0;
  const seen = new Set();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      if (ch < 4 || px[i + 3] > 10) {
        n++;
        seen.add(`${px[i] >> 4},${px[i + 1] >> 4},${px[i + 2] >> 4}`);
      }
    }
  return { fill: +((100 * n) / (w * h)).toFixed(0), colors: seen.size };
}

const argv = process.argv.slice(2);
const cmd = argv[0];

if (cmd === "build") {
  const slug = argv[1];
  const dash = argv.indexOf("--");
  const flags = dash === -1 ? [] : argv.slice(dash + 1);
  const given = argv.slice(2, dash === -1 ? argv.length : dash);
  const dir = path.join(STAGE, slug);
  // Characters share one detail density so a floor of enemies reads as a set;
  // icons are small single objects and keep whatever grid they came with.
  if (slug.startsWith("enemy-") && !flags.includes("--logical")) flags.push("--logical", "64");
  const sources = given.length
    ? given
    : fs.readdirSync(dir).filter((f) => /\.png$/i.test(f)).sort().map((f) => path.join(dir, f));
  if (!sources.length) throw new Error(`sin fuentes para ${slug}`);
  fs.mkdirSync(PX, { recursive: true });

  const cells = [];
  for (const [i, src] of sources.entries()) {
    const target = path.join(PX, `${slug}-${i + 1}.png`);
    process.stdout.write(execFileSync(process.execPath, [
      path.join(ROOT, "scripts", "pixelize.mjs"), src, target, ...flags,
    ], { encoding: "utf8" }));
    const img = await decodePng(target);
    cells.push({ file: target, img, ...audit(img) });
  }

  const cols = Math.min(3, cells.length);
  const rows = Math.ceil(cells.length / cols);
  const sheetW = cols * CELL;
  const sheetH = rows * (CELL + LABEL);
  const px = checker(sheetW, sheetH);
  cells.forEach((c, i) => {
    const cx = (i % cols) * CELL;
    const cy = Math.floor(i / cols) * (CELL + LABEL);
    const fit = Math.min((CELL - 28) / c.img.w, (CELL - LABEL - 32) / c.img.h);
    const dw = Math.round(c.img.w * fit);
    const dh = Math.round(c.img.h * fit);
    blit(px, sheetW, nearest(c.img.px, c.img.w, c.img.h, c.img.ch, dw, dh), dw, dh,
      cx + Math.round((CELL - dw) / 2), cy + LABEL + Math.round((CELL - LABEL - dh) / 2));
    drawText(px, sheetW, cx + 6, cy + 9, `${i + 1}=${c.fill} ${c.colors}`, [240, 240, 255]);
  });
  const sheet = path.join(STAGE, `sheet-${slug}.png`);
  fs.writeFileSync(sheet, encodePng(sheetW, sheetH, px));
  console.log(`hoja ${sheet}`);
  cells.forEach((c, i) => console.log(`  ${i + 1} ${c.img.w}x${c.img.h} relleno=${c.fill}% colores=${c.colors}`));
} else if (cmd === "pick") {
  const [slug, n] = argv.slice(1);
  const src = path.join(PX, `${slug}-${n}.png`);
  fs.copyFileSync(src, path.join(OUT, `${slug}.png`));
  console.log(`${src} -> ${path.join(OUT, `${slug}.png`)}`);
} else {
  console.error("usage: sprite-studio.mjs build <slug> [files…] | pick <slug> <n>");
  process.exit(2);
}
