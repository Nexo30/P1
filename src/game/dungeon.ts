import { next } from "./rng";
import {
  DIRS,
  cellKey,
  idx,
  inb,
  isWalkable,
  type ComponentId,
  type ItemId,
  type Prop,
  type Size,
  type Tile,
  type Zone,
} from "./types";

type Cell = { x: number; y: number };
type Room = { x: number; y: number; w: number; h: number };

export type MapData = {
  zone: Zone;
  w: number;
  h: number;
  tiles: Tile[];
  stairs: Cell;
  player: Cell;
  archetype: number;
  enemyCells: Cell[];
  chests: { id: string; x: number; y: number; item: ItemId }[];
  props: Prop[];
  /** What lies on the ground waiting to be picked up. */
  loot: { x: number; y: number; component: ComponentId }[];
};

export const FOREST_SIZE: Size = { w: 15, h: 12 };

/** Floors get bigger with depth: a tower should not read like one small room. */
export function towerSize(floor: number): Size {
  if (floor >= 10) return { w: 17, h: 17 };
  if (floor >= 8) return { w: 17, h: 19 };
  if (floor >= 4) return { w: 16, h: 18 };
  return { w: 15, h: 16 };
}

function field(size: Size, fill: Tile): Tile[] {
  const tiles: Tile[] = [];
  for (let i = 0; i < size.w * size.h; i++) tiles.push(fill);
  return tiles;
}

function put(size: Size, tiles: Tile[], x: number, y: number, tile: Tile) {
  if (inb(size, x, y)) tiles[idx(size, x, y)] = tile;
}

function get(size: Size, tiles: Tile[], x: number, y: number): Tile {
  if (!inb(size, x, y)) return "wall";
  return tiles[idx(size, x, y)];
}

function walkableCells(size: Size, tiles: Tile[]): Cell[] {
  const out: Cell[] = [];
  for (let y = 0; y < size.h; y++)
    for (let x = 0; x < size.w; x++) if (isWalkable(tiles[idx(size, x, y)])) out.push({ x, y });
  return out;
}

function shuffle<T>(items: T[], rand: () => number) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Every walkable cell reachable from `from`, ignoring `blocked`. */
function flood(size: Size, tiles: Tile[], blocked: Set<string>, from: Cell) {
  const startKey = cellKey(from.x, from.y);
  if (!isWalkable(get(size, tiles, from.x, from.y)) || blocked.has(startKey)) return new Set<string>();
  const seen = new Set([startKey]);
  const queue: Cell[] = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const [dx, dy] of DIRS) {
      const x = cur.x + dx;
      const y = cur.y + dy;
      if (!inb(size, x, y)) continue;
      const k = cellKey(x, y);
      if (seen.has(k) || blocked.has(k) || !isWalkable(tiles[idx(size, x, y)])) continue;
      seen.add(k);
      queue.push({ x, y });
    }
  }
  return seen;
}

/** Nothing may be sealed off: pillars and rocks are placed under this veto. */
function connectsAll(size: Size, tiles: Tile[], blocked: Set<string>, from: Cell, to: Cell) {
  const seen = flood(size, tiles, blocked, from);
  if (!seen.has(cellKey(to.x, to.y))) return false;
  // The blockers themselves are not orphans; without this no prop ever lands.
  return walkableCells(size, tiles).every(
    (c) => blocked.has(cellKey(c.x, c.y)) || seen.has(cellKey(c.x, c.y)),
  );
}

function contains(room: Room, cell: Cell) {
  return cell.x >= room.x && cell.y >= room.y && cell.x < room.x + room.w && cell.y < room.y + room.h;
}

function center(room: Room): Cell {
  return { x: room.x + Math.floor(room.w / 2), y: room.y + Math.floor(room.h / 2) };
}

/**
 * Rooms come from halving the interior until there are enough of them: rejection
 * sampling left whole floors empty, and a partition always fills the grid.
 * Only an axis of 9 or more is cut, so each side keeps a chamber worth walking.
 */
function axes(region: Room) {
  const out: ("x" | "y")[] = [];
  if (region.w >= 9) out.push("x");
  if (region.h >= 9) out.push("y");
  return out;
}

function split(region: Room, axis: "x" | "y", rand: () => number): Room[] {
  const span = axis === "x" ? region.w : region.h;
  const cut = 4 + Math.floor(rand() * (span - 7));
  if (axis === "x")
    return [
      { x: region.x, y: region.y, w: cut, h: region.h },
      { x: region.x + cut, y: region.y, w: region.w - cut, h: region.h },
    ];
  return [
    { x: region.x, y: region.y, w: region.w, h: cut },
    { x: region.x, y: region.y + cut, w: region.w, h: region.h - cut },
  ];
}

/** Inset a region so a wall always stands between two chambers. */
function toRoom(region: Room, rand: () => number): Room {
  const px = region.w >= 8 && rand() < 0.35 ? 2 : 1;
  const py = region.h >= 8 && rand() < 0.35 ? 2 : 1;
  const w = Math.max(3, region.w - px * 2);
  const h = Math.max(3, region.h - py * 2);
  return {
    x: region.x + Math.floor((region.w - w) / 2),
    y: region.y + Math.floor((region.h - h) / 2),
    w,
    h,
  };
}

function placeRooms(size: Size, rand: () => number, want: number): Room[] {
  let regions: Room[] = [{ x: 1, y: 1, w: size.w - 2, h: size.h - 2 }];
  let guard = 0;
  while (regions.length < want && guard++ < 30) {
    const open = regions.filter((r) => axes(r).length > 0);
    if (!open.length) break;
    open.sort((a, b) => b.w * b.h - a.w * a.h);
    const target = open[0];
    const list = axes(target);
    // Cut the long way round first, so chambers stay roughly square.
    const axis =
      target.w >= target.h
        ? list.includes("x")
          ? "x"
          : "y"
        : list.includes("y")
          ? "y"
          : "x";
    const pieces = split(target, axis, rand);
    regions = regions.filter((r) => r !== target).concat(pieces);
  }
  return regions.map((r) => toRoom(r, rand));
}

function carveRoom(size: Size, tiles: Tile[], room: Room) {
  for (let y = room.y; y < room.y + room.h; y++)
    for (let x = room.x; x < room.x + room.w; x++) put(size, tiles, x, y, "floor");
}

/** One-tile corridors: they are what makes a floor read as chambers, not an arena. */
function carveCorridor(size: Size, tiles: Tile[], a: Cell, b: Cell, horizontalFirst: boolean) {
  const run = (from: number, to: number, fixed: number, alongX: boolean) => {
    const step = from <= to ? 1 : -1;
    for (let v = from; ; v += step) {
      if (alongX) put(size, tiles, v, fixed, "floor");
      else put(size, tiles, fixed, v, "floor");
      if (v === to) break;
    }
  };
  if (horizontalFirst) {
    run(a.x, b.x, a.y, true);
    run(a.y, b.y, b.x, false);
  } else {
    run(a.y, b.y, a.x, false);
    run(a.x, b.x, b.y, true);
  }
}

/**
 * Rooms joined in climb order, so entering low and ascending is always the
 * shape of the floor. A couple of extra links keep loops for flanking.
 */
function layout(size: Size, rand: () => number, want: number) {
  const tiles = field(size, "wall");
  let rooms = placeRooms(size, rand, want);
  if (rooms.length < 2) rooms = [{ x: 1, y: Math.floor(size.h / 2) - 2, w: size.w - 2, h: 5 }];
  // Index 0 is the top of the floor, the last index the room the hero wakes in.
  const climb = rooms.slice().sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2) || a.x - b.x);
  for (const room of climb) carveRoom(size, tiles, room);
  // Join each chamber to its nearest neighbour already reached: corridors end
  // up where a floor would naturally have them instead of one long snake.
  const done = [climb[0]];
  const rest = climb.slice(1);
  while (rest.length) {
    let pick = 0;
    let from = 0;
    let best = Infinity;
    rest.forEach((room, i) =>
      done.forEach((other, j) => {
        const a = center(room);
        const b = center(other);
        const dist = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        if (dist < best) {
          best = dist;
          pick = i;
          from = j;
        }
      }),
    );
    carveCorridor(size, tiles, center(rest[pick]), center(done[from]), rand() < 0.5);
    done.push(rest.splice(pick, 1)[0]);
  }
  for (let i = 0; i < 2 && climb.length > 3; i++) {
    const a = Math.floor(rand() * climb.length);
    const b = Math.floor(rand() * climb.length);
    if (a !== b) carveCorridor(size, tiles, center(climb[a]), center(climb[b]), rand() < 0.5);
  }
  return { tiles, rooms: climb };
}

/** Deep floors are fewer, larger chambers; the crown is a throne room. */
function roomCount(floor: number) {
  if (floor >= 10) return 3;
  if (floor >= 6) return 6;
  return 5;
}

function towerMap(floor: number, size: Size, rand: () => number, enemyCount: number): MapData {
  const { tiles, rooms } = layout(size, rand, roomCount(floor));
  const player = center(rooms[rooms.length - 1]);
  const stairs = center(rooms[0]);
  const archetype = Math.floor(rand() * 8);

  const taken = new Set<string>([cellKey(player.x, player.y), cellKey(stairs.x, stairs.y)]);

  // Fights belong in chambers, and never in the room the hero woke in.
  const home = rooms[rooms.length - 1];
  const halls = shuffle(
    rooms.filter((r) => r !== home),
    rand,
  );
  const enemyCells: Cell[] = [];
  for (const room of halls) {
    if (enemyCells.length >= enemyCount) break;
    const cells = shuffle(
      walkableCells(size, tiles).filter((c) => contains(room, c) && !taken.has(cellKey(c.x, c.y))),
      rand,
    );
    const spot = cells.find((c) => !enemyCells.some((e) => Math.abs(e.x - c.x) + Math.abs(e.y - c.y) < 2));
    if (spot) {
      enemyCells.push(spot);
      taken.add(cellKey(spot.x, spot.y));
    }
  }
  if (enemyCells.length < enemyCount) {
    for (const c of shuffle(walkableCells(size, tiles), rand)) {
      if (enemyCells.length >= enemyCount) break;
      const k = cellKey(c.x, c.y);
      if (taken.has(k)) continue;
      // Even as a last resort nothing spawns within arm's reach of the entry.
      if (Math.max(Math.abs(c.x - player.x), Math.abs(c.y - player.y)) < 3) continue;
      taken.add(k);
      enemyCells.push(c);
    }
  }

  const chests: MapData["chests"] = [];
  const chestCount = floor >= 6 ? 2 : 1;
  for (const room of shuffle(rooms.slice(0, -1), rand)) {
    if (chests.length >= chestCount) break;
    const cells = shuffle(
      walkableCells(size, tiles).filter((c) => contains(room, c) && !taken.has(cellKey(c.x, c.y))),
      rand,
    );
    const spot = cells[0];
    if (!spot) continue;
    taken.add(cellKey(spot.x, spot.y));
    chests.push({
      id: `c${floor}-${chests.length}`,
      x: spot.x,
      y: spot.y,
      item: rand() < 0.55 ? "potion" : "ether",
    });
  }

  // Columns only where a room is wide enough that one more wall cannot seal it.
  const props: Prop[] = [];
  const blockers = new Set<string>();
  for (const room of shuffle(rooms, rand)) {
    if (props.length >= 6) break;
    if (room.w < 4 || room.h < 4) continue;
    for (const [ox, oy] of [
      [1, 1],
      [room.w - 2, 1],
      [1, room.h - 2],
      [room.w - 2, room.h - 2],
    ]) {
      if (props.length >= 6) break;
      const c = { x: room.x + ox, y: room.y + oy };
      const k = cellKey(c.x, c.y);
      if (taken.has(k) || blockers.has(k)) continue;
      if (!connectsAll(size, tiles, new Set([...blockers, k]), player, stairs)) continue;
      blockers.add(k);
      props.push({ id: `p${floor}-${props.length}`, x: c.x, y: c.y, kind: "pillar", blocks: true });
    }
  }

  return {
    zone: "torre",
    w: size.w,
    h: size.h,
    tiles,
    stairs,
    player,
    archetype,
    enemyCells,
    chests,
    props,
    loot: [],
  };
}

/** The prelude: open ground, no enemies, and everything you need to forge once. */
const FOREST_GATHER: ComponentId[] = ["rama", "rama", "hierba", "piedra", "hierba", "rama"];

function forestMap(size: Size, rand: () => number, seed: number): MapData {
  const tiles = field(size, "grass");
  for (let x = 0; x < size.w; x++) {
    put(size, tiles, x, 0, "wall");
    put(size, tiles, x, size.h - 1, "wall");
  }
  for (let y = 0; y < size.h; y++) {
    put(size, tiles, 0, y, "wall");
    put(size, tiles, size.w - 1, y, "wall");
  }

  const player = { x: Math.floor(size.w / 2), y: size.h - 2 };
  const stairs = { x: 2 + Math.floor(rand() * (size.w - 4)), y: 1 };
  // A trodden path first: trees are only ever planted around it.
  let x = player.x;
  let y = player.y;
  put(size, tiles, x, y, "floor");
  let guard = 0;
  while ((x !== stairs.x || y !== stairs.y) && guard++ < size.w * size.h) {
    if (rand() < 0.62) x += Math.sign(stairs.x - x) || (rand() < 0.5 ? 1 : -1);
    else y += Math.sign(stairs.y - y) || (rand() < 0.5 ? 1 : -1);
    x = Math.max(1, Math.min(size.w - 2, x));
    y = Math.max(1, Math.min(size.h - 2, y));
    put(size, tiles, x, y, "floor");
  }

  const onPath = new Set<string>();
  for (const c of walkableCells(size, tiles)) if (get(size, tiles, c.x, c.y) === "floor") onPath.add(cellKey(c.x, c.y));

  // Groves in clumps, so the clearing reads as woodland rather than a field.
  const clumps = 7 + Math.floor(rand() * 4);
  for (let i = 0; i < clumps; i++) {
    const cx = 2 + Math.floor(rand() * (size.w - 4));
    const cy = 2 + Math.floor(rand() * (size.h - 4));
    const limbs = 2 + Math.floor(rand() * 4);
    for (let l = 0; l < limbs; l++) {
      const tx = cx + Math.round((rand() - 0.5) * 3);
      const ty = cy + Math.round((rand() - 0.5) * 3);
      if (!inb(size, tx, ty) || onPath.has(cellKey(tx, ty))) continue;
      if ((tx === player.x && ty === player.y) || (tx === stairs.x && ty === stairs.y)) continue;
      put(size, tiles, tx, ty, "tree");
    }
  }

  // Thin the wood until nothing is cut off from the path.
  for (let pass = 0; pass < 6; pass++) {
    const seen = flood(size, tiles, new Set(), player);
    const alone = walkableCells(size, tiles).filter((c) => !seen.has(cellKey(c.x, c.y)));
    if (!alone.length) break;
    for (const c of alone) {
      for (const [dx, dy] of DIRS) {
        const nx = c.x + dx;
        const ny = c.y + dy;
        if (inb(size, nx, ny) && get(size, tiles, nx, ny) === "tree") {
          put(size, tiles, nx, ny, "grass");
          break;
        }
      }
    }
  }

  const used = new Set<string>([cellKey(player.x, player.y), cellKey(stairs.x, stairs.y)]);
  const open = shuffle(
    walkableCells(size, tiles).filter((c) => !used.has(cellKey(c.x, c.y)) && !onPath.has(cellKey(c.x, c.y))),
    rand,
  );

  const props: Prop[] = [];
  const blockers = new Set<string>();
  for (const c of open) {
    if (props.length >= 9) break;
    const k = cellKey(c.x, c.y);
    const bush = rand() < 0.45;
    if (!bush) {
      if (!connectsAll(size, tiles, new Set([...blockers, k]), player, stairs)) continue;
      blockers.add(k);
    }
    used.add(k);
    props.push({
      id: `f${seed}-${props.length}`,
      x: c.x,
      y: c.y,
      kind: bush ? "bush" : rand() < 0.5 ? "rock" : "stump",
      blocks: !bush,
    });
  }

  const loot: MapData["loot"] = [];
  const finds = shuffle(
    walkableCells(size, tiles).filter((c) => !used.has(cellKey(c.x, c.y)) && !blockers.has(cellKey(c.x, c.y))),
    rand,
  );
  for (const c of finds) {
    if (loot.length >= 14) break;
    used.add(cellKey(c.x, c.y));
    loot.push({ ...c, component: FOREST_GATHER[loot.length % FOREST_GATHER.length] });
  }

  return {
    zone: "bosque",
    w: size.w,
    h: size.h,
    tiles,
    stairs,
    player,
    archetype: 0,
    enemyCells: [],
    chests: [],
    props,
    loot,
  };
}

export function generateMap(
  floor: number,
  seed: number,
  enemyCount: number,
): MapData {
  let s = (seed + floor * 9973) >>> 0;
  const rand = () => {
    const [v, ns] = next(s);
    s = ns;
    return v;
  };
  if (floor <= 0) return forestMap(FOREST_SIZE, rand, seed);
  return towerMap(floor, towerSize(floor), rand, enemyCount);
}
