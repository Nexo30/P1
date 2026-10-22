export const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export type ClassId = "guerrero" | "maga" | "arquero" | "asesino";
export type Sex = "m" | "f";
export type EnemyId =
  | "goblin"
  | "skeleton"
  | "wolf"
  | "bat"
  | "spider"
  | "knight"
  | "mage"
  | "golem"
  | "specter"
  | "king"
  | "boss";
/** "grass" and "floor" are the two walkable tiles; "tree" blocks like a wall. */
export type Tile = "floor" | "wall" | "grass" | "tree";
export type Zone = "bosque" | "torre";
export type ItemId = "potion" | "ether" | "bomb" | "panacea";
export type Tier = "comun" | "raro" | "epico" | "legendario";
export type ComponentId =
  | "rama"
  | "piedra"
  | "hierba"
  | "trapo"
  | "hueso"
  | "colmillo"
  | "cristal"
  | "hierro"
  | "seda"
  | "esencia"
  | "nucleo"
  | "vara"
  | "lingote"
  | "tela_arcana"
  | "vidrio_pulido";
/** What a forge result becomes once crafted. */
export type RecipeKind = "component" | "consumable" | "weapon" | "armor" | "trinket" | "permanent";
export type GroundItem = {
  id: string;
  x: number;
  y: number;
  component: ComponentId;
  rarity: Tier;
};
export type Equipment = {
  weapon: string | null;
  armor: string | null;
  trinket: string | null;
};
export type EquipSlot = keyof Equipment;
export type Mode = "idle" | "move" | "attack" | "skill" | "item" | "forge";
export type Phase = "select" | "play" | "clear" | "victory" | "defeat";

export type Actor = {
  id: string;
  name: string;
  sprite: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  atk: number;
  def: number;
  range: number;
  classId?: ClassId;
  sex?: Sex;
  enemyId?: EnemyId;
  facing: 1 | -1;
};

export type Chest = { id: string; x: number; y: number; item: ItemId };
export type Prop = {
  id: string;
  x: number;
  y: number;
  kind: "pillar" | "rock" | "bush" | "stump";
  blocks: boolean;
};

export type Run = {
  floor: number;
  /** The forest prelude (floor 0) has no enemies and only common finds. */
  zone: Zone;
  seed: number;
  rng: number;
  archetype: number;
  w: number;
  h: number;
  tiles: Tile[];
  stairs: { x: number; y: number };
  player: Actor;
  enemies: Actor[];
  chests: Chest[];
  props: Prop[];
  items: Partial<Record<ItemId, number>>;
  groundItems: GroundItem[];
  components: Partial<Record<ComponentId, number>>;
  equipment: Equipment;
  /** Permanent boosts from forged whetstones, plates and talismans. */
  bonus: { atk: number; def: number; maxHp: number };
};

export type Floater = {
  id: number;
  x: number;
  y: number;
  text: string;
  tone: "hurt" | "heal" | "crit" | "info";
  fx: "slash" | "orb" | "arrow" | "hit" | "none";
  at: number;
};

export type Aim = { x: number; y: number; id?: string };

export type Action =
  | { type: "move"; x: number; y: number }
  | { type: "attack"; id: string }
  | { type: "skill"; x: number; y: number; id?: string }
  | { type: "item"; item: ItemId }
  | { type: "forge"; recipe: string }
  | { type: "wait" };

/** A Run and a MapData both carry their own grid, so pass either. */
export type Size = { w: number; h: number };

export function idx(size: Size, x: number, y: number) {
  return y * size.w + x;
}

export function inb(size: Size, x: number, y: number) {
  return x >= 0 && y >= 0 && x < size.w && y < size.h;
}

export function isWalkable(t: Tile) {
  return t === "floor" || t === "grass";
}

export function isSolid(t: Tile) {
  return t === "wall" || t === "tree";
}

export function cellAt(size: Size, tiles: Tile[], x: number, y: number): Tile {
  if (!inb(size, x, y)) return "wall";
  return tiles[idx(size, x, y)];
}

export function cheb(ax: number, ay: number, bx: number, by: number) {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export function cellKey(x: number, y: number) {
  return `${x},${y}`;
}
