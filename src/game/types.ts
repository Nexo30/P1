export const W = 9;
export const H = 11;

export const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export type ClassId = "guerrero" | "maga" | "arquero" | "asesino";
export type Sex = "m" | "f";
export type EnemyId = "goblin" | "knight" | "skeleton" | "mage" | "wolf" | "boss";
export type Tile = "floor" | "wall";
export type ItemId = "potion" | "ether";
export type MaterialId = "herb" | "ore" | "crystal" | "fang";
export type Rarity = "comun" | "poco_comun" | "raro" | "epico";
export type GroundItem = { id: string; x: number; y: number; material: MaterialId; rarity: Rarity };
export type Mode = "idle" | "move" | "attack" | "skill" | "item";
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
export type Prop = { id: string; x: number; y: number; kind: "pillar"; blocks: boolean };

export type Run = {
  floor: number;
  seed: number;
  rng: number;
  archetype: number;
  tiles: Tile[];
  stairs: { x: number; y: number };
  player: Actor;
  enemies: Actor[];
  chests: Chest[];
  props: Prop[];
  potions: number;
  ethers: number;
  groundItems: GroundItem[];
  materials: Partial<Record<MaterialId, number>>;
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
  | { type: "wait" };

export function idx(x: number, y: number) {
  return y * W + x;
}

export function inb(x: number, y: number) {
  return x >= 0 && y >= 0 && x < W && y < H;
}

export function cheb(ax: number, ay: number, bx: number, by: number) {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export function cellKey(x: number, y: number) {
  return `${x},${y}`;
}
