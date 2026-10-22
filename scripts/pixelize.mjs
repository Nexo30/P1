/**
 * Turn an AI-generated "pixel art" PNG into a real sprite: flat colour key,
 * snap onto the artist's pixel grid, quantise the palette, upscale nearest.
 *
 *   node scripts/pixelize.mjs in.png out.png [--block N] [--scale N] [--colors N]
 */
import fs from "node:fs";
import path from "node:path";
import { decodePng, encodePng } from "./pixelkit/png.mjs";

const EPS = 24; // colour distance below which two pixels count as the same block

function flag(argv, name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
}

function dist(px, py) {
  const dr = px[0] - py[0];
  const dg = px[1] - py[1];
  const db = px[2] - py[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Keep the creature; drop corner watermarks and stray specks.
 *
 * Size alone cannot be the criterion: a held weapon is a small blob but must
 * survive, while a corner signature is also small and must not. So a blob goes
 * only when it is small *and* compact — signatures are a few glyphs of text, a
 * cleaver spans most of the figure's height.
 */
function dropDebris(img, holes) {
  const { w, h } = img;
  const label = new Int32Array(w * h).fill(-1);
  const sizes = [];
  const diags = [];
  for (let start = 0; start < w * h; start++) {
    if (holes[start] || label[start] !== -1) continue;
    const id = sizes.length;
    let size = 0;
    let x0 = w;
    let y0 = h;
    let x1 = 0;
    let y1 = 0;
    const stack = [start];
    label[start] = id;
    while (stack.length) {
      const p = stack.pop();
      size++;
      const x = p % w;
      const y = (p / w) | 0;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (holes[q] || label[q] !== -1) continue;
          label[q] = id;
          stack.push(q);
        }
    }
    sizes.push(size);
    diags.push(Math.hypot(x1 - x0 + 1, y1 - y0 + 1));
  }
  const biggest = Math.max(...sizes);
  const biggestDiag = Math.max(...diags);
  const floor = Math.max(48, biggest * 0.02);
  let dropped = 0;
  for (let p = 0; p < w * h; p++) {
    if (holes[p]) continue;
    const id = label[p];
    if (sizes[id] < floor && diags[id] < biggestDiag * 0.3) {
      holes[p] = 1;
      dropped++;
    }
  }
  if (dropped) console.log(`  descartados ${dropped} px sueltos`);
  return holes;
}

/** Median colour of the canvas border: the paper the sprite was drawn on. */
function paperColor(img) {
  const { w, h, px, ch } = img;
  const samples = [];
  const push = (x, y) => {
    const i = (y * w + x) * ch;
    samples.push([px[i], px[i + 1], px[i + 2]]);
  };
  for (let x = 0; x < w; x += 3) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y += 3) {
    push(0, y);
    push(w - 1, y);
  }
  const mid = (k) => samples.map((s) => s[k]).sort((a, b) => a - b)[samples.length >> 1];
  return [mid(0), mid(1), mid(2)];
}

/**
 * Flood from the edges so white highlights inside the sprite survive.
 *
 * Light achromatic grey is keyed too, not just paper white: models keep adding
 * a soft contact-shadow puddle under the feet, which touches the background and
 * so detaches cleanly. Sprite interiors stay protected because their bold dark
 * outline is neither light nor reachable from the edge — which is why grey
 * enemies (skeleton, specter) survive the same rule. Pass --shadow 0 to disable.
 */
function keyOut(img, tol, shadowFloor) {
  const { w, h, px, ch } = img;
  const paper = paperColor(img);
  const holes = new Uint8Array(w * h);
  const queue = [];
  const near = (x, y) => {
    const i = (y * w + x) * ch;
    const a = ch === 4 ? px[i + 3] : 255;
    if (a < 128) return true;
    const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
    if (dist([r, g, b], paper) <= tol) return true;
    if (!shadowFloor) return false;
    return Math.max(r, g, b) - Math.min(r, g, b) <= 14 && (r + g + b) / 3 >= shadowFloor;
  };
  const seed = (x, y) => {
    if (holes[y * w + x] || !near(x, y)) return;
    holes[y * w + x] = 1;
    queue.push([x, y]);
  };
  for (let x = 0; x < w; x++) {
    seed(x, 0);
    seed(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    seed(0, y);
    seed(w - 1, y);
  }
  while (queue.length) {
    const [x, y] = queue.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || holes[ny * w + nx]) continue;
      if (!near(nx, ny)) continue;
      holes[ny * w + nx] = 1;
      queue.push([nx, ny]);
    }
  }
  return holes;
}

/**
 * Remove the contact-shadow puddle models draw under the feet.
 *
 * The edge flood cannot reach it: the puddle gets its own bold dark rim, so its
 * grey interior is a closed region. Hence a shape test — an achromatic grey blob
 * that is much wider than tall and sits on the figure's floor line. Grey enemies
 * (skeleton, specter) keep their bodies because those are tall, not flat; pass
 * --puddle 0 if one ever loses a foot.
 */
function dropPuddle(img, holes) {
  const { w, h, px, ch } = img;
  let fx0 = w;
  let fy0 = h;
  let fx1 = -1;
  let fy1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (holes[y * w + x]) continue;
      if (x < fx0) fx0 = x;
      if (y < fy0) fy0 = y;
      if (x > fx1) fx1 = x;
      if (y > fy1) fy1 = y;
    }
  if (fx1 < 0) return holes;
  const figureH = fy1 - fy0 + 1;
  const figureW = fx1 - fx0 + 1;

  const grey = (x, y) => {
    const i = (y * w + x) * ch;
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    if (Math.max(r, g, b) - Math.min(r, g, b) > 22) return false;
    const lum = (r + g + b) / 3;
    return lum >= 110 && lum <= 246;
  };

  const seen = new Uint8Array(w * h);
  let dropped = 0;
  for (let start = 0; start < w * h; start++) {
    if (holes[start] || seen[start] || !grey(start % w, (start / w) | 0)) continue;
    const blob = [];
    const stack = [start];
    seen[start] = 1;
    let x0 = w;
    let y0 = h;
    let x1 = 0;
    let y1 = 0;
    while (stack.length) {
      const p = stack.pop();
      blob.push(p);
      const x = p % w;
      const y = (p / w) | 0;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (holes[q] || seen[q] || !grey(nx, ny)) continue;
          seen[q] = 1;
          stack.push(q);
        }
    }
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    const onFloor = y1 > fy1 - figureH * 0.18;
    if (!onFloor || bw < figureW * 0.25 || bw < bh * 2.2) continue;
    for (const p of blob) holes[p] = 1;
    dropped += blob.length;
  }
  if (dropped) console.log(`  sombra de suelo retirada: ${dropped} px`);
  return holes;
}

/** Modal length of same-colour horizontal runs: the artist's pixel size. */
function detectBlock(img, holes) {
  const { w, h, px, ch } = img;
  const runs = [];
  for (let y = 0; y < h; y += 2) {
    let len = 1;
    for (let x = 1; x < w; x++) {
      const here = holes[y * w + x] || holes[y * w + x - 1];
      if (here) {
        if (len > 1) runs.push(len);
        len = 1;
        continue;
      }
      const i = (y * w + x) * ch;
      const j = (y * w + x - 1) * ch;
      if (dist([px[i], px[i + 1], px[i + 2]], [px[j], px[j + 1], px[j + 2]], ch) <= EPS) len++;
      else {
        if (len > 1) runs.push(len);
        len = 1;
      }
    }
    if (len > 1) runs.push(len);
  }
  runs.sort((a, b) => a - b);
  return Math.max(2, runs[Math.floor(runs.length * 0.6)] || 8);
}

/**
 * Snap the whole set onto one detail density. The block grows by a whole
 * multiple of the artist's own grid, so pixels stay crisp while a 121-row
 * skeleton and a 60-row goblin end up the same height on screen.
 */
function fitBlock(img, holes, block, target) {
  if (!target) return block;
  const { w, h } = img;
  let y0 = h;
  let y1 = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (holes[y * w + x]) continue;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  const factor = Math.max(1, Math.round((y1 - y0 + 1) / block / target));
  return block * factor;
}

function downsample(img, holes, block) {
  const { w, h, px, ch } = img;
  const gw = Math.ceil(w / block);
  const gh = Math.ceil(h / block);
  const cells = [];
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let dy = 0; dy < block; dy++) {
        const y = gy * block + dy;
        if (y >= h) break;
        for (let dx = 0; dx < block; dx++) {
          const x = gx * block + dx;
          if (x >= w || holes[y * w + x]) continue;
          const i = (y * w + x) * ch;
          r += px[i];
          g += px[i + 1];
          b += px[i + 2];
          n++;
        }
      }
      const total = block * block;
      cells.push(n / total < 0.45 ? null : [r / n, g / n, b / n]);
    }
  }
  return { gw, gh, cells };
}

function trim(grid) {
  const { gw, gh, cells } = grid;
  let x0 = gw;
  let y0 = gh;
  let x1 = -1;
  let y1 = -1;
  cells.forEach((c, i) => {
    if (!c) return;
    const x = i % gw;
    const y = (i / gw) | 0;
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  });
  if (x1 < 0) throw new Error("sprite vacío tras aplicar la clave");
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const out = new Array(w * h).fill(null);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) out[y * w + x] = cells[(y + y0) * gw + (x + x0)];
  return { w, h, cells: out };
}

/** Median-cut palette, then snap every cell onto it. */
function quantize(grid, colors) {
  const points = grid.cells.filter(Boolean);
  if (points.length <= colors) return grid;
  let boxes = [points];
  while (boxes.length < colors) {
    boxes.sort((a, b) => b.length * spread(b) - a.length * spread(a));
    const target = boxes.find((bx) => bx.length > 1);
    if (!target) break;
    boxes = boxes.filter((bx) => bx !== target);
    const axis = widestAxis(target);
    const sorted = [...target].sort((p, q) => p[axis] - q[axis]);
    const mid = sorted.length >> 1;
    boxes.push(sorted.slice(0, mid), sorted.slice(mid));
  }
  const palette = boxes.map((bx) => {
    const s = bx.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]);
    return s.map((v) => v / bx.length);
  });
  return {
    ...grid,
    cells: grid.cells.map((c) => {
      if (!c) return null;
      let best = palette[0];
      let d = Infinity;
      for (const p of palette) {
        const e = dist(c, p, 3);
        if (e < d) {
          d = e;
          best = p;
        }
      }
      return best.map((v) => Math.round(v));
    }),
  };
}

function spread(points) {
  let total = 0;
  for (const axis of [0, 1, 2]) {
    const vals = points.map((p) => p[axis]);
    total += Math.max(...vals) - Math.min(...vals);
  }
  return total / 3;
}

function widestAxis(points) {
  let best = 0;
  let bestRange = -1;
  for (const axis of [0, 1, 2]) {
    const vals = points.map((p) => p[axis]);
    const range = Math.max(...vals) - Math.min(...vals);
    if (range > bestRange) {
      bestRange = range;
      best = axis;
    }
  }
  return best;
}

/** Drop lone specks that survived the grid snap. */
function despeckle(grid) {
  const { w, h, cells } = grid;
  const same = (a, b) => a && b && dist(a, b, 3) <= EPS;
  const out = cells.slice();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const self = cells[i];
      if (!self) continue;
      const around = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .map(([dx, dy]) => cells[(y + dy) * w + x + dx])
        .filter(Boolean);
      if (around.length < 3 || around.some((c) => same(c, self))) continue;
      const tally = new Map();
      for (const c of around) {
        const k = c.join(",");
        tally.set(k, (tally.get(k) || 0) + 1);
      }
      const [win] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
      out[i] = win.split(",").map(Number);
    }
  return { ...grid, cells: out };
}

function upscale(grid, scale, margin) {
  const w = (grid.w + margin * 2) * scale;
  const h = (grid.h + margin * 2) * scale;
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const gx = Math.floor(x / scale) - margin;
      const gy = Math.floor(y / scale) - margin;
      const c = gx < 0 || gy < 0 ? null : grid.cells[gy * grid.w + gx];
      if (!c) continue;
      const i = (y * w + x) * 4;
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
      px[i + 3] = 255;
    }
  return { w, h, px };
}

const argv = process.argv.slice(2);
const [input, output] = argv;
if (!input || !output) {
  console.error("usage: node scripts/pixelize.mjs <in.png> <out.png> [options]");
  process.exit(2);
}

const img = await decodePng(path.resolve(input));
const holes = dropDebris(img, keyOut(img, Number(flag(argv, "tol", 70)), Number(flag(argv, "shadow", 190))));
if (Number(flag(argv, "puddle", 1))) dropPuddle(img, holes);
const block = fitBlock(img, holes, Number(flag(argv, "block", detectBlock(img, holes))), Number(flag(argv, "logical", 0)));
let grid = trim(downsample(img, holes, block));
grid = despeckle(quantize(grid, Number(flag(argv, "colors", 40))));
const longest = Math.max(grid.w, grid.h);
const scale = Number(flag(argv, "scale", Math.max(2, Math.round(240 / longest))));
const { w, h, px } = upscale(grid, scale, Number(flag(argv, "margin", 1)));

fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
fs.writeFileSync(path.resolve(output), encodePng(w, h, px));
console.log(
  `${path.basename(input)} → ${grid.w}x${grid.h} lógica @${block}px → ${w}x${h}px (x${scale}, ${grid.cells.filter(Boolean).length} celdas)`
);
