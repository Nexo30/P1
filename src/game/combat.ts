import { CLASSES, ENEMIES, FLOOR_ENEMIES, critChance, enemyStats, skillMult } from "./data";
import { generateMap } from "./dungeon";
import { next } from "./rng";
import {
  canAfford,
  COMPONENTS,
  ITEMS,
  RAW_COMPONENTS,
  recipeById,
  shortfallText,
  TIER_FLOOR,
  TIERS,
  TIER_ORDER,
  tierAtLeast,
  unlockedTier,
  type Recipe,
} from "./crafting";
import type { Tier } from "./types";
import {
  DIRS,
  cheb,
  idx,
  inb,
  isSolid,
  isWalkable,
  type Action,
  type Actor,
  type Aim,
  type ClassId,
  type ComponentId,
  type EnemyId,
  type Floater,
  type ItemId,
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
  items?: Partial<Record<ItemId, number>>;
  components?: Partial<Record<ComponentId, number>>;
  equipment?: Run["equipment"];
  bonus?: Run["bonus"];
};

const TIER_WEIGHTS: [Tier, number][] = [
  ["comun", 60],
  ["raro", 27],
  ["epico", 11],
  ["legendario", 2],
];

/** Deeper floors tilt the roll toward richer finds. */
function rollRarity(rand: () => number, floor: number): Tier {
  const boost = Math.min(30, (floor - 1) * 3.5);
  const weights = TIER_WEIGHTS.map(([tier, w], i) => {
    if (i === 0) return [tier, Math.max(8, w - boost * 1.6)] as [Tier, number];
    if (i === 1) return [tier, w + boost * 0.5] as [Tier, number];
    if (i === 2) return [tier, w + boost * 0.7] as [Tier, number];
    return [tier, w + boost * 0.4] as [Tier, number];
  });
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let pick = rand() * total;
  for (const [tier, w] of weights) {
    pick -= w;
    if (pick <= 0) return tier;
  }
  return "comun";
}

/** A find's rarity caps what it can be: no legendary herb, no common core. */
function rollComponent(rand: () => number, rarity: Tier): ComponentId {
  const ceiling = TIER_ORDER.indexOf(rarity);
  const pool = RAW_COMPONENTS.filter((c) => TIER_ORDER.indexOf(COMPONENTS[c].tier) <= ceiling);
  return pool[Math.floor(rand() * pool.length)] ?? "rama";
}

export function makeLoot(
  rand: () => number,
  floor: number,
  forced?: ComponentId,
): { component: ComponentId; rarity: Tier } {
  const rarity = rollRarity(rand, floor);
  if (forced) {
    const own = COMPONENTS[forced].tier;
    return { component: forced, rarity: rank(own) > rank(rarity) ? own : rarity };
  }
  return { component: rollComponent(rand, rarity), rarity };
}

function rank(t: Tier) {
  return TIER_ORDER.indexOf(t);
}

/** Rarity is not decoration: a richer find yields more of the component. */
function collect(draft: Run, loot: Run["groundItems"]): string {
  const parts: string[] = [];
  for (const item of loot) {
    const gain = TIERS[item.rarity].yield;
    draft.components[item.component] = (draft.components[item.component] ?? 0) + gain;
    parts.push(`${COMPONENTS[item.component].name} x${gain}`);
  }
  return `Recogiste ${parts.join(", ")}.`;
}

/** A fallen creature leaves its own components on the tile where it died. */
function fell(draft: Run, enemy: Actor): string {
  draft.enemies = draft.enemies.filter((e) => e.id !== enemy.id);
  const def = ENEMIES[enemy.enemyId ?? "goblin"];
  const rand = seeded((draft.rng ^ (enemy.x * 73856093) ^ (enemy.y * 19349663)) >>> 0);
  const drops: Run["groundItems"] = [];
  for (let i = 0; i < (def.dropCount ?? 1); i++) {
    drops.push({
      id: `drop-${enemy.id}-${i}`,
      x: enemy.x,
      y: enemy.y,
      ...makeLoot(rand, draft.floor, def.drops[Math.floor(rand() * def.drops.length)]),
    });
  }
  draft.groundItems.push(...drops);
  const what = drops.map((d) => COMPONENTS[d.component].name.toLowerCase()).join(" y ");
  return `${enemy.name} cae y deja ${what}.`;
}

export function createRun(opts: {
  classId: ClassId;
  sex: Sex;
  floor: number;
  seed: number;
  carry?: Carry;
}): Run {
  const cls = CLASSES[opts.classId];
  const forest = opts.floor <= 0;
  const roster: EnemyId[] = forest ? [] : (FLOOR_ENEMIES[opts.floor - 1] ?? FLOOR_ENEMIES[0]);
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
    zone: map.zone,
    seed: opts.seed,
    rng: (opts.seed ^ (opts.floor * 131)) >>> 0,
    archetype: map.archetype,
    w: map.w,
    h: map.h,
    tiles: map.tiles,
    stairs: map.stairs,
    player,
    enemies,
    chests: map.chests,
    props: map.props,
    items: opts.carry?.items ?? { potion: 2 },
    components: opts.carry?.components ?? {},
    equipment: opts.carry?.equipment ?? { weapon: null, armor: null, trinket: null },
    bonus: opts.carry?.bonus ?? { atk: 0, def: 0, maxHp: 0 },
    groundItems: (() => {
      if (forest)
        return map.loot.map((c, i) => ({
          id: `gather-${opts.seed}-${i}`,
          x: c.x,
          y: c.y,
          component: c.component,
          rarity: "comun" as Tier,
        }));
      const rand = seeded(opts.seed ^ (opts.floor * 9176));
      const spots = freeCells(map);
      const out: Run["groundItems"] = [];
      // Big floors hold more caches than the old nine-by-eleven grids did.
      const count = Math.min(11, Math.max(5, Math.floor(spots.length / 9)));
      for (let i = 0; i < count; i++) {
        const cell = spots.splice(Math.floor(rand() * spots.length), 1)[0];
        if (!cell) continue;
        out.push({ id: `loot-${opts.floor}-${i}`, ...cell, ...makeLoot(rand, opts.floor) });
      }
      return out;
    })(),
  };
}

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Floor cells nothing else already claims. */
function freeCells(map: ReturnType<typeof generateMap>) {
  const taken = (x: number, y: number) =>
    (x === map.player.x && y === map.player.y) ||
    (x === map.stairs.x && y === map.stairs.y) ||
    map.enemyCells.some((c) => c.x === x && c.y === y) ||
    map.chests.some((c) => c.x === x && c.y === y) ||
    map.props.some((c) => c.x === x && c.y === y);
  const out: { x: number; y: number }[] = [];
  for (let y = 1; y < map.h - 1; y++)
    for (let x = 1; x < map.w - 1; x++)
      if (isWalkable(map.tiles[idx(map, x, y)]) && !taken(x, y)) out.push({ x, y });
  return out;
}

export function blocked(run: Run, x: number, y: number, ignoreId?: string) {
  if (!inb(run, x, y)) return true;
  if (!isWalkable(run.tiles[idx(run, x, y)])) return true;
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
    if (!inb(run, x, y)) return false;
    if (isSolid(run.tiles[idx(run, x, y)])) return false;
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
    for (let y = 0; y < run.h; y++) {
      for (let x = 0; x < run.w; x++) {
        if (!inRange(p.x, p.y, x, y, p.range)) continue;
        if (isSolid(run.tiles[idx(run, x, y)])) continue;
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

  if (action.type === "forge") {
    const recipe = recipeById(action.recipe);
    if (!recipe) return { ok: false, reason: "No conoces esa receta." };
    const made = forge(draft, recipe);
    if (!made.ok) return made;
    return {
      ok: true,
      run: draft,
      banner: made.text,
      floaters: [{ x: p.x, y: p.y, text: "Forjado", tone: "info", fx: "none" }],
      sound: "ui",
      pulse: null,
    };
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
    const loot = draft.groundItems.filter((item) => item.x === action.x && item.y === action.y);
    if (loot.length) {
      const ids = new Set(loot.map((item) => item.id));
      draft.groundItems = draft.groundItems.filter((item) => !ids.has(item.id));
      banner = collect(draft, loot);
    }
    if (chest) {
      draft.chests = draft.chests.filter((c) => c.id !== chest.id);
      const roll = (chest.item === "potion" ? 0 : chest.item === "ether" ? 1 : 2) as 0 | 1 | 2;
      const gift: ItemId[] = ["potion", "ether", "bomb"];
      const item = gift[roll];
      draft.items[item] = (draft.items[item] ?? 0) + 1;
      banner = `Encontraste ${ITEMS[item].name.toLowerCase()} en el cofre.`;
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
    if (enemy.hp <= 0) banner = fell(draft, enemy);
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
    const kills: string[] = [];
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
      if (enemy.hp <= 0) kills.push(enemy.name);
    }
    for (const enemy of victims.filter((e) => e.hp <= 0)) fell(draft, enemy);
    return {
      ok: true,
      run: draft,
      banner: kills.length ? `Nova barre a ${kills.join(" y ")}.` : `Nova golpea a ${victims.length}.`,
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
    if (inb(draft, bx, by) && !blocked(draft, bx, by, "player")) {
      p.x = bx;
      p.y = by;
      banner = `Paso de sombra: ${hit.dmg}.`;
    }
  }
  if (enemy.hp <= 0) banner = fell(draft, enemy);
  return {
    ok: true,
    run: draft,
    banner,
    floaters,
    sound: "skill",
    pulse: { id: "player", x: enemy.x, y: enemy.y },
  };
}

/** A bomb hits everything within one tile of the hero; it scales with depth. */
export function bombDamage(floor: number) {
  return 10 + floor * 2;
}

function useItem(draft: Run, item: ItemId): ActionResult {
  const p = draft.player;
  const name = ITEMS[item].name;
  if ((draft.items[item] ?? 0) <= 0) return { ok: false, reason: `No tienes ${name.toLowerCase()}.` };
  const spend = () => {
    draft.items[item] = (draft.items[item] ?? 1) - 1;
  };

  if (item === "potion" || item === "panacea") {
    if (item === "potion" && p.hp >= p.maxHp) return { ok: false, reason: "La vida ya está llena." };
    if (item === "panacea" && p.hp >= p.maxHp && p.mp >= p.maxMp)
      return { ok: false, reason: "Estás en plenitud." };
    const beforeHp = p.hp;
    const beforeMp = p.mp;
    if (item === "potion") p.hp = Math.min(p.maxHp, p.hp + Math.max(10, Math.round(p.maxHp * 0.38)));
    else {
      p.hp = p.maxHp;
      p.mp = p.maxMp;
    }
    spend();
    const floaters: FloaterIn[] = [{ x: p.x, y: p.y, text: `+${p.hp - beforeHp}`, tone: "heal", fx: "none" }];
    if (p.mp > beforeMp)
      floaters.push({ x: p.x, y: p.y - 1, text: `+${p.mp - beforeMp}`, tone: "info", fx: "none" });
    return {
      ok: true,
      run: draft,
      banner:
        item === "potion"
          ? `Bebes la poción (+${p.hp - beforeHp} HP).`
          : `La panacea te devuelve: +${p.hp - beforeHp} HP, +${p.mp - beforeMp} MP.`,
      floaters,
      sound: "ui",
      pulse: null,
    };
  }

  if (item === "ether") {
    if (p.mp >= p.maxMp) return { ok: false, reason: "El maná ya está lleno." };
    const before = p.mp;
    p.mp = Math.min(p.maxMp, p.mp + Math.max(4, Math.round(p.maxMp * 0.5)));
    spend();
    return {
      ok: true,
      run: draft,
      banner: `Bebes un éter (+${p.mp - before} MP).`,
      floaters: [{ x: p.x, y: p.y, text: `+${p.mp - before}`, tone: "info", fx: "none" }],
      sound: "ui",
      pulse: null,
    };
  }

  const victims = draft.enemies.filter((e) => cheb(e.x, e.y, p.x, p.y) <= 1);
  if (!victims.length) return { ok: false, reason: "Nadie cerca de la explosión." };
  const dmg = bombDamage(draft.floor);
  const floaters: FloaterIn[] = victims.map((e) => ({
    x: e.x,
    y: e.y,
    text: String(dmg),
    tone: "crit" as const,
    fx: "orb" as const,
  }));
  const names = victims.filter((e) => (e.hp -= dmg) <= 0).map((e) => e.name);
  for (const enemy of victims) if (enemy.hp <= 0) fell(draft, enemy);
  spend();
  return {
    ok: true,
    run: draft,
    banner: names.length
      ? `La bomba estalla: ${dmg} y barre a ${names.join(" y ")}.`
      : `La bomba estalla contra ${victims.length}: ${dmg}.`,
    floaters,
    sound: "skill",
    pulse: { id: "player", x: p.x, y: p.y },
  };
}

/**
 * Spend the components and hand back whatever the recipe makes. Mutates the
 * run it is given, so callers clone first.
 */
export function forge(
  run: Run,
  recipe: Recipe,
): { ok: true; text: string } | { ok: false; reason: string } {
  if (!tierAtLeast(unlockedTier(run.floor), recipe.tier))
    return { ok: false, reason: `${recipe.name} pide piso ${TIER_FLOOR[recipe.tier]}.` };
  if (!canAfford(run, recipe))
    return { ok: false, reason: `Te falta: ${shortfallText(run, recipe)}.` };

  for (const [id, n] of Object.entries(recipe.cost)) {
    const key = id as ComponentId;
    const left = (run.components[key] ?? 0) - (n ?? 0);
    if (left > 0) run.components[key] = left;
    else delete run.components[key];
  }

  const gives = recipe.gives;
  if (gives && "component" in gives) {
    run.components[gives.component] = (run.components[gives.component] ?? 0) + 1;
    return { ok: true, text: `Forjas ${recipe.name}: ${recipe.effect.toLowerCase()}.` };
  }
  if (gives && "item" in gives) {
    run.items[gives.item] = (run.items[gives.item] ?? 0) + 1;
    return { ok: true, text: `${recipe.name} guardado en la mochila.` };
  }
  if (gives && "equip" in gives) {
    const slot = gives.equip;
    const worn = recipeById(run.equipment[slot] ?? "");
    if (worn) shiftStats(run, worn, -1);
    run.equipment[slot] = recipe.id;
    shiftStats(run, recipe, 1);
    return { ok: true, text: `Estrenas ${recipe.name} (${recipe.effect}).` };
  }
  run.bonus.atk += recipe.atk ?? 0;
  run.bonus.def += recipe.def ?? 0;
  run.bonus.maxHp += recipe.maxHp ?? 0;
  shiftStats(run, recipe, 1);
  return { ok: true, text: `${recipe.name} grabado en ti: ${recipe.effect}.` };
}

/** Only the piece you are wearing counts, so swapping one out gives the stats back. */
function shiftStats(run: Run, recipe: Recipe, sign: 1 | -1) {
  const p = run.player;
  p.atk += (recipe.atk ?? 0) * sign;
  p.def += (recipe.def ?? 0) * sign;
  p.maxHp += (recipe.maxHp ?? 0) * sign;
  p.maxMp += (recipe.maxMp ?? 0) * sign;
  p.hp = Math.min(p.hp, p.maxHp);
  p.mp = Math.min(p.mp, p.maxMp);
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
      if (seen.has(k) || !inb(run, x, y)) continue;
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

