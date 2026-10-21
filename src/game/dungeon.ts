import { next } from "./rng";
import { DIRS, H, W, cellKey, idx, inb, type ItemId, type Prop, type Tile } from "./types";

export type MapData = {
  tiles: Tile[];
  stairs: { x: number; y: number };
  player: { x: number; y: number };
  archetype: number;
  enemyCells: { x: number; y: number }[];
  chests: { id: string; x: number; y: number; item: ItemId }[];
  props: Prop[];
};

const START = { x: 4, y: 9 };
const STAIRS = { x: 4, y: 1 };

function blank(): Tile[] {
  const tiles: Tile[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      tiles.push(x === 0 || y === 0 || x === W - 1 || y === H - 1 ? "wall" : "floor");
    }
  }
  return tiles;
}

function setWall(tiles: Tile[], x: number, y: number) {
  if (x > 0 && y > 0 && x < W - 1 && y < H - 1) tiles[idx(x, y)] = "wall";
}

function protect(tiles: Tile[]) {
  const cells = [
    [3, 8],
    [4, 8],
    [5, 8],
    [3, 9],
    [4, 9],
    [5, 9],
    [3, 1],
    [4, 1],
    [5, 1],
    [3, 2],
    [4, 2],
    [5, 2],
  ];
  for (const [x, y] of cells) tiles[idx(x, y)] = "floor";
}

function reachable(tiles: Tile[], blocks: Set<string>) {
  const q: [number, number][] = [[START.x, START.y]];
  const seen = new Set([cellKey(START.x, START.y)]);
  while (q.length) {
    const [x, y] = q.shift()!;
    if (x === STAIRS.x && y === STAIRS.y) return true;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inb(nx, ny) || tiles[idx(nx, ny)] !== "floor") continue;
      const k = cellKey(nx, ny);
      if (seen.has(k) || blocks.has(k)) continue;
      seen.add(k);
      q.push([nx, ny]);
    }
  }
  return false;
}

function carve(tiles: Tile[]) {
  let x = START.x;
  let y = START.y;
  let guard = 0;
  while ((x !== STAIRS.x || y !== STAIRS.y) && guard++ < 40) {
    if (Math.abs(STAIRS.x - x) >= Math.abs(STAIRS.y - y)) x += Math.sign(STAIRS.x - x);
    else y += Math.sign(STAIRS.y - y);
    if (x > 0 && y > 0 && x < W - 1 && y < H - 1) tiles[idx(x, y)] = "floor";
  }
}

function paint(tiles: Tile[], arch: number, rand: () => number) {
  if (arch === 0) {
    for (const [x, y] of [
      [3, 4],
      [5, 4],
      [3, 6],
      [5, 6],
      [4, 5],
    ]) setWall(tiles, x, y);
  } else if (arch === 1) {
    for (let y = 3; y <= 7; y++) if (y !== 5) setWall(tiles, 4, y);
  } else if (arch === 2) {
    for (let x = 2; x <= 6; x++) {
      if (x !== 2) setWall(tiles, x, 3);
      if (x !== 6) setWall(tiles, x, 6);
    }
  } else if (arch === 3) {
    for (let x = 1; x <= 7; x++) if (x !== 2 && x !== 6) setWall(tiles, x, 5);
    for (let y = 3; y <= 7; y++) if (y !== 3 && y !== 7) setWall(tiles, 4, y);
  } else if (arch === 4) {
    for (const [x, y] of [
      [2, 3],
      [3, 3],
      [6, 3],
      [5, 3],
      [2, 7],
      [3, 7],
      [6, 7],
      [5, 7],
    ]) setWall(tiles, x, y);
  } else if (arch === 5) {
    for (let x = 3; x <= 5; x++) {
      setWall(tiles, x, 4);
      setWall(tiles, x, 6);
    }
    setWall(tiles, 3, 5);
    setWall(tiles, 5, 5);
  } else if (arch === 6) {
    for (const [x, y] of [
      [3, 3],
      [4, 3],
      [5, 4],
      [2, 5],
      [3, 5],
      [5, 6],
      [6, 6],
      [4, 7],
    ]) setWall(tiles, x, y);
  } else {
    for (let y = 2; y <= 8; y++) {
      for (let x = 1; x <= 7; x++) {
        if (rand() < 0.2) setWall(tiles, x, y);
      }
    }
    for (let y = 1; y <= 9; y++) tiles[idx(4, y)] = "floor";
  }
}

function shuffle<T>(items: T[], rand: () => number) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function generateMap(floor: number, seed: number, enemyCount: number): MapData {
  let s = (seed + floor * 9973) >>> 0;
  const rand = () => {
    const [v, ns] = next(s);
    s = ns;
    return v;
  };
  const archetype = Math.floor(rand() * 8);
  const tiles = blank();
  paint(tiles, archetype, rand);
  protect(tiles);
  if (!reachable(tiles, new Set())) carve(tiles);
  protect(tiles);

  const floors: { x: number; y: number }[] = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (tiles[idx(x, y)] !== "floor") continue;
      if ((x === START.x && y === START.y) || (x === STAIRS.x && y === STAIRS.y)) continue;
      floors.push({ x, y });
    }
  }
  const far = shuffle(
    floors.filter((c) => Math.max(Math.abs(c.x - START.x), Math.abs(c.y - START.y)) >= 3),
    rand,
  );
  const near = shuffle(floors, rand);
  const pool = far.length >= enemyCount ? far : near;
  const enemyCells = pool.slice(0, enemyCount);
  const used = new Set(enemyCells.map((c) => cellKey(c.x, c.y)));
  used.add(cellKey(START.x, START.y));
  used.add(cellKey(STAIRS.x, STAIRS.y));

  const chestCount = floor >= 6 ? 2 : 1;
  const chests: MapData["chests"] = [];
  for (const c of shuffle(floors, rand)) {
    if (chests.length >= chestCount) break;
    const k = cellKey(c.x, c.y);
    if (used.has(k)) continue;
    if (Math.max(Math.abs(c.x - START.x), Math.abs(c.y - START.y)) < 2) continue;
    used.add(k);
    chests.push({
      id: `c${floor}-${chests.length}`,
      x: c.x,
      y: c.y,
      item: rand() < 0.55 ? "potion" : "ether",
    });
  }

  const props: Prop[] = [];
  for (const c of shuffle(floors, rand)) {
    if (props.length >= 3) break;
    const k = cellKey(c.x, c.y);
    if (used.has(k)) continue;
    const blocks = new Set<string>();
    for (const p of props) blocks.add(cellKey(p.x, p.y));
    blocks.add(k);
    if (!reachable(tiles, blocks)) continue;
    used.add(k);
    props.push({ id: `p${floor}-${props.length}`, x: c.x, y: c.y, kind: "pillar", blocks: true });
  }

  return { tiles, stairs: STAIRS, player: START, archetype, enemyCells, chests, props };
}
