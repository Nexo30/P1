import { CLASSES, FLOOR_ENEMIES, critChance, enemyStats, skillMult } from "./data";
import { generateMap } from "./dungeon";
import { next } from "./rng";
import {
  DIRS,
  H,
  W,
  cheb,
  idx,
  inb,
  type Action,
  type Actor,
  type Aim,
  type ClassId,
  type Floater,
  type ItemId,
  type MaterialId,
  type Rarity,
  type Run,
  type Sex,
} from "./types";

export type FloaterIn = Omit<Floater, "id" | "at">;

export type ActionResult =
  | { ok: false; reason: string }
  | {
      ok: true;
      run: Run;
      banner: string;
      floaters: FloaterIn[];
      sound: "move" | "hit" | "skill" | "ui";
      pulse: { id: string; x: number; y: number } | null;
    };

export type EnemyResult = {
  run: Run;
  banner: string;
  floaters: FloaterIn[];
  sound: "move" | "hurt" | "ui";
  hurt: boolean;
  pulse: { id: string; x: number; y: number } | null;
};

type Carry = {
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  atk: number;
  def: number;
  potions: number;
  ethers: number;
  materials?: Partial<Record<MaterialId, number>>;
};

export function createRun(opts: {
  classId: ClassId;
  sex: Sex;
  floor: number;
  seed: number;
  carry?: Carry;
}): Run {
  const cls = CLASSES[opts.classId];
  const roster = FLOOR_ENEMIES[opts.floor - 1] ?? FLOOR_ENEMIES[0];
  const map = generateMap(opts.floor, opts.seed, roster.length);
  const maxHp = opts.carry?.maxHp ?? cls.hp;
  const maxMp = opts.carry?.maxMp ?? cls.mp;
  const player: Actor = {
    id: "player",
    name: opts.sex === "f" ? cls.female : cls.male,
    sprite: `hero-${opts.classId}-${opts.sex}`,
    x: map.player.x,
    y: map.player.y,
    hp: opts.carry?.hp ?? maxHp,
    maxHp,
    mp: opts.carry?.mp ?? maxMp,
    maxMp,
    atk: opts.carry?.atk ?? cls.atk,
    def: opts.carry?.def ?? cls.def,
    range: cls.range,
    classId: opts.classId,
    sex: opts.sex,
    facing: 1,
  };
  const enemies: Actor[] = [];
  roster.forEach((id, i) => {
    const cell = map.enemyCells[i];
    if (!cell) return;
    const stats = enemyStats(id, opts.floor);
    const facing: 1 | -1 = cell.x <= player.x ? 1 : -1;
    enemies.push({
      id: `e${opts.floor}-${i}`,
      name: stats.name,
      sprite: `enemy-${id}`,
      x: cell.x,
      y: cell.y,
      hp: stats.hp,
      maxHp: stats.hp,
      mp: 0,
      maxMp: 0,
      atk: stats.atk,
      def: stats.def,
      range: stats.range,
      enemyId: id,
      facing,
    });
  });
  return {
    floor: opts.floor,
    seed: opts.seed,
    rng: (opts.seed ^ (opts.floor * 131)) >>> 0,
    archetype: map.archetype,
    tiles: map.tiles,
    stairs: map.stairs,
    player,
    enemies,
    chests: map.chests,
    props: map.props,
    potions: opts.carry?.potions ?? 2,
    ethers: opts.carry?.ethers ?? 0,
    materials: opts.carry?.materials ?? {},
    groundItems: (() => {
      const available: { x: number; y: number }[] = [];
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        if (map.tiles[idx(x, y)] !== "floor" || (x === map.player.x && y === map.player.y) || (x === map.stairs.x && y === map.stairs.y)) continue;
        if (map.enemyCells.some(c => c.x === x && c.y === y) || map.chests.some(c => c.x === x && c.y === y) || map.props.some(c => c.x === x && c.y === y)) continue;
        available.push({ x, y });
      }
      let seed = (opts.seed ^ (opts.floor * 9176)) >>> 0;
      const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const materials: MaterialId[] = ["herb", "ore", "crystal", "fang"];
      const rarities: Rarity[] = ["comun", "comun", "comun", "poco_comun", "poco_comun", "raro", "epico"];
      const out: Run["groundItems"] = [];
      for (let i = 0; i < Math.min(5, Math.floor(available.length / 5)); i++) {
        const at = Math.floor(rand() * available.length);
        const cell = available.splice(at, 1)[0];
        if (!cell) continue;
        const rarity = rarities[Math.min(rarities.length - 1, Math.floor(Math.pow(rand(), 1.8) * rarities.length))];
        out.push({ id: `loot-${opts.floor}-${i}`, ...cell, material: materials[Math.floor(rand() * materials.length)], rarity });
      }
      return out;
    })(),
  };
}

export function blocked(run: Run, x: number, y: number, ignoreId?: string) {
  if (!inb(x, y)) return true;
  if (run.tiles[idx(x, y)] !== "floor") return true;
  if (run.props.some((p) => p.blocks && p.x === x && p.y === y)) return true;
  if (run.player.x === x && run.player.y === y && ignoreId !== "player") return true;
  if (run.enemies.some((e) => e.x === x && e.y === y && e.id !== ignoreId)) return true;
  return false;
}

export function los(run: Run, x0: number, y0: number, x1: number, y1: number) {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (x !== x1 || y !== y1) {
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
    if (x === x1 && y === y1) return true;
    if (!inb(x, y)) return false;
    if (run.tiles[idx(x, y)] === "wall") return false;
    if (run.props.some((p) => p.blocks && p.x === x && p.y === y)) return false;
    if (run.enemies.some((e) => e.x === x && e.y === y)) return false;
    if (run.player.x === x && run.player.y === y) return false;
  }
  return true;
}

function inRange(ax: number, ay: number, bx: number, by: number, range: number) {
  return cheb(ax, ay, bx, by) <= range && !(ax === bx && ay === by);
}

export function moveOptions(run: Run) {
  const p = run.player;
  const out: { x: number; y: number }[] = [];
  for (const [dx, dy] of DIRS) {
    const x = p.x + dx;
    const y = p.y + dy;
    if (!blocked(run, x, y, "player")) out.push({ x, y });
  }
  return out;
}

export function attackTargets(run: Run) {
  const p = run.player;
  return run.enemies.filter(
    (e) => inRange(p.x, p.y, e.x, e.y, p.range) && los(run, p.x, p.y, e.x, e.y),
  );
}

export function skillAims(run: Run): Aim[] {
  const p = run.player;
  if (p.classId === "maga") {
    const aims: Aim[] = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!inRange(p.x, p.y, x, y, p.range)) continue;
        if (run.tiles[idx(x, y)] === "wall") continue;
        if (!los(run, p.x, p.y, x, y)) continue;
        if (run.enemies.some((e) => cheb(e.x, e.y, x, y) <= 1)) aims.push({ x, y });
      }
    }
    return aims;
  }
  return attackTargets(run).map((e) => ({ x: e.x, y: e.y, id: e.id }));
}

export function nearestAim(run: Run, aims: Aim[]): Aim {
  const p = run.player;
  return aims.slice().sort((a, b) => {
    const d = cheb(p.x, p.y, a.x, a.y) - cheb(p.x, p.y, b.x, b.y);
    return d || a.y - b.y || a.x - b.x;
  })[0];
}

export function bestAim(run: Run, aims: Aim[]): Aim {
  if (run.player.classId === "maga") {
    const onEnemy = aims.filter((a) => run.enemies.some((e) => e.x === a.x && e.y === a.y));
    if (onEnemy.length) return nearestAim(run, onEnemy);
  }
  return nearestAim(run, aims);
}

function face(actor: Actor, tx: number) {
  if (tx < actor.x) actor.facing = -1;
  else if (tx > actor.x) actor.facing = 1;
}

function strike(run: Run, atk: number, def: number, mult: number, chance: number) {
  let roll: number;
  let jitterRoll: number;
  [roll, run.rng] = next(run.rng);
  [jitterRoll, run.rng] = next(run.rng);
  const crit = roll < chance;
  const jitter = Math.floor(jitterRoll * 3);
  let raw = atk * mult - def * 0.45 + jitter;
  if (crit) raw *= 1.5;
  return { dmg: Math.max(1, Math.round(raw)), crit };
}

function fxFor(classId: ClassId | undefined, skill: boolean): FloaterIn["fx"] {
  if (classId === "arquero") return "arrow";
  if (classId === "maga") return "orb";
  if (skill && classId === "asesino") return "slash";
  return "slash";
}

export function applyAction(run: Run, action: Action): ActionResult {
  const draft = structuredClone(run);
  const p = draft.player;
  const cls = CLASSES[p.classId!];

  if (action.type === "wait") {
    p.mp = Math.min(p.maxMp, p.mp + 2);
    return {
      ok: true,
      run: draft,
      banner: "Recuperas el aliento (+2 MP).",
      floaters: [],
      sound: "ui",
      pulse: null,
    };
  }

  if (action.type === "item") {
    return useItem(draft, action.item);
  }

  if (action.type === "move") {
    if (!moveOptions(draft).some((o) => o.x === action.x && o.y === action.y)) {
      return { ok: false, reason: "No puedes pasar." };
    }
    face(p, action.x);
    p.x = action.x;
    p.y = action.y;
    const chest = draft.chests.find((c) => c.x === action.x && c.y === action.y);
    let banner = "Avanzas un paso.";
    const loot = draft.groundItems.find((item) => item.x === action.x && item.y === action.y);
    if (loot) {
      draft.groundItems = draft.groundItems.filter((item) => item.id !== loot.id);
      draft.materials[loot.material] = (draft.materials[loot.material] ?? 0) + 1;
      banner = `Recogiste ${loot.material} (${loot.rarity.replace("_", " ")}).`;
    }
    if (chest) {
      draft.chests = draft.chests.filter((c) => c.id !== chest.id);
      if (chest.item === "potion") {
        draft.potions += 1;
        banner = "Encontraste una poción.";
      } else {
        draft.ethers += 1;
        banner = "Encontraste un éter.";
      }
    }
    return { ok: true, run: draft, banner, floaters: [], sound: "move", pulse: null };
  }

  if (action.type === "attack") {
    const enemy = draft.enemies.find((e) => e.id === action.id);
    if (!enemy || !attackTargets(draft).some((e) => e.id === enemy.id)) {
      return { ok: false, reason: "Nadie al alcance." };
    }
    face(p, enemy.x);
    const hit = strike(draft, p.atk, enemy.def, 1, critChance(p.classId!, false));
    enemy.hp -= hit.dmg;
    const floaters: FloaterIn[] = [
      {
        x: enemy.x,
        y: enemy.y,
        text: String(hit.dmg),
        tone: hit.crit ? "crit" : "hurt",
        fx: fxFor(p.classId, false),
      },
    ];
    let banner = hit.crit ? `¡Crítico! ${enemy.name}: ${hit.dmg}.` : `Golpeas a ${enemy.name}: ${hit.dmg}.`;
    if (enemy.hp <= 0) {
      draft.enemies = draft.enemies.filter((e) => e.id !== enemy.id);
      banner = `${enemy.name} cae.`;
    }
    return {
      ok: true,
      run: draft,
      banner,
      floaters,
      sound: "hit",
      pulse: { id: "player", x: enemy.x, y: enemy.y },
    };
  }

  if (p.mp < cls.skillCost) return { ok: false, reason: "Sin maná." };
  const aims = skillAims(draft);
  const aim = aims.find((a) => a.x === action.x && a.y === action.y && (!action.id || a.id === action.id));
  if (!aim) return { ok: false, reason: "Sin objetivo para el poder." };
  p.mp -= cls.skillCost;
  face(p, aim.x);

  if (p.classId === "maga") {
    const victims = draft.enemies.filter((e) => cheb(e.x, e.y, aim.x, aim.y) <= 1);
    const floaters: FloaterIn[] = [];
    const dead = new Set<string>();
    for (const enemy of victims) {
      const hit = strike(draft, p.atk, enemy.def, skillMult("maga"), critChance("maga", true));
      enemy.hp -= hit.dmg;
      floaters.push({
        x: enemy.x,
        y: enemy.y,
        text: String(hit.dmg),
        tone: hit.crit ? "crit" : "hurt",
        fx: "orb",
      });
      if (enemy.hp <= 0) dead.add(enemy.id);
    }
    draft.enemies = draft.enemies.filter((e) => !dead.has(e.id));
    return {
      ok: true,
      run: draft,
      banner: `Nova golpea a ${victims.length}.`,
      floaters,
      sound: "skill",
      pulse: null,
    };
  }

  const enemy = draft.enemies.find((e) => e.id === aim.id);
  if (!enemy) return { ok: false, reason: "Sin objetivo para el poder." };
  const hit = strike(draft, p.atk, enemy.def, skillMult(p.classId!), critChance(p.classId!, true));
  enemy.hp -= hit.dmg;
  const floaters: FloaterIn[] = [
    {
      x: enemy.x,
      y: enemy.y,
      text: String(hit.dmg),
      tone: hit.crit ? "crit" : "hurt",
      fx: fxFor(p.classId, true),
    },
  ];
  let banner = `${cls.skill}: ${hit.dmg}.`;
  if (p.classId === "asesino") {
    const bx = enemy.x + (enemy.x - p.x);
    const by = enemy.y + (enemy.y - p.y);
    if (inb(bx, by) && !blocked(draft, bx, by, "player")) {
      p.x = bx;
      p.y = by;
      banner = `Paso de sombra: ${hit.dmg}.`;
    }
  }
  if (enemy.hp <= 0) {
    draft.enemies = draft.enemies.filter((e) => e.id !== enemy.id);
    banner = `${enemy.name} cae.`;
  }
  return {
    ok: true,
    run: draft,
    banner,
    floaters,
    sound: "skill",
    pulse: { id: "player", x: enemy.x, y: enemy.y },
  };
}

function useItem(draft: Run, item: ItemId): ActionResult {
  const p = draft.player;
  if (item === "potion") {
    if (draft.potions <= 0) return { ok: false, reason: "No tienes pociones." };
    if (p.hp >= p.maxHp) return { ok: false, reason: "La vida ya está llena." };
    const gain = Math.max(10, Math.round(p.maxHp * 0.38));
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + gain);
    draft.potions -= 1;
    const healed = p.hp - before;
    return {
      ok: true,
      run: draft,
      banner: `Bebes una poción (+${healed}).`,
      floaters: [{ x: p.x, y: p.y, text: `+${healed}`, tone: "heal", fx: "none" }],
      sound: "ui",
      pulse: null,
    };
  }
  if (draft.ethers <= 0) return { ok: false, reason: "No tienes éter." };
  if (p.mp >= p.maxMp) return { ok: false, reason: "El maná ya está lleno." };
  const gain = Math.max(4, Math.round(p.maxMp * 0.5));
  const before = p.mp;
  p.mp = Math.min(p.maxMp, p.mp + gain);
  draft.ethers -= 1;
  return {
    ok: true,
    run: draft,
    banner: `Bebes un éter (+${p.mp - before} MP).`,
    floaters: [{ x: p.x, y: p.y, text: `+${p.mp - before}`, tone: "info", fx: "none" }],
    sound: "ui",
    pulse: null,
  };
}

function nextStep(run: Run, enemy: Actor) {
  const goal = run.player;
  const q: { x: number; y: number; first: { x: number; y: number } | null }[] = [
    { x: enemy.x, y: enemy.y, first: null },
  ];
  const seen = new Set([`${enemy.x},${enemy.y}`]);
  while (q.length) {
    const cur = q.shift()!;
    if (cur.x === goal.x && cur.y === goal.y) return cur.first;
    for (const [dx, dy] of DIRS) {
      const x = cur.x + dx;
      const y = cur.y + dy;
      const k = `${x},${y}`;
      if (seen.has(k) || !inb(x, y)) continue;
      const isGoal = x === goal.x && y === goal.y;
      if (!isGoal && blocked(run, x, y, enemy.id)) continue;
      seen.add(k);
      q.push({ x, y, first: cur.first ?? { x, y } });
    }
  }
  return null;
}

export function applyEnemy(run: Run, id: string): EnemyResult {
  const draft = structuredClone(run);
  const enemy = draft.enemies.find((e) => e.id === id);
  if (!enemy) return { run: draft, banner: "Tu turno.", floaters: [], sound: "ui", hurt: false, pulse: null };
  const p = draft.player;
  if (inRange(enemy.x, enemy.y, p.x, p.y, enemy.range) && los(draft, enemy.x, enemy.y, p.x, p.y)) {
    face(enemy, p.x);
    const mult = enemy.enemyId === "boss" ? 1.15 : 1;
    const hit = strike(draft, enemy.atk, p.def, mult, 0.05);
    p.hp = Math.max(0, p.hp - hit.dmg);
    return {
      run: draft,
      banner: `${enemy.name} te hiere: ${hit.dmg}.`,
      floaters: [{ x: p.x, y: p.y, text: String(hit.dmg), tone: "hurt", fx: "hit" }],
      sound: "hurt",
      hurt: true,
      pulse: { id: enemy.id, x: p.x, y: p.y },
    };
  }
  const step = nextStep(draft, enemy);
  if (step && (step.x !== p.x || step.y !== p.y) && !blocked(draft, step.x, step.y, enemy.id)) {
    face(enemy, step.x);
    enemy.x = step.x;
    enemy.y = step.y;
    return {
      run: draft,
      banner: `${enemy.name} se acerca.`,
      floaters: [],
      sound: "move",
      hurt: false,
      pulse: null,
    };
  }
  return { run: draft, banner: `${enemy.name} espera.`, floaters: [], sound: "ui", hurt: false, pulse: null };
}

