import type { ClassId, ComponentId, EnemyId } from "./types";

export type ClassDef = {
  title: string;
  male: string;
  female: string;
  blurb: string;
  skill: string;
  skillInfo: string;
  hp: number;
  mp: number;
  atk: number;
  def: number;
  range: number;
  skillCost: number;
  growthHp: number;
  growthAtk: number;
};

export const CLASSES: Record<ClassId, ClassDef> = {
  guerrero: {
    title: "Guerrero",
    male: "Guerrero",
    female: "Guerrera",
    blurb: "Fuerza y resistencia",
    skill: "Golpe férreo",
    skillInfo: "Golpe pesado cuerpo a cuerpo",
    hp: 44,
    mp: 8,
    atk: 8,
    def: 4,
    range: 1,
    skillCost: 4,
    growthHp: 4,
    growthAtk: 1,
  },
  maga: {
    title: "Maga",
    male: "Mago",
    female: "Maga",
    blurb: "Poder y control",
    skill: "Nova",
    skillInfo: "Estalla alrededor de un punto",
    hp: 28,
    mp: 18,
    atk: 10,
    def: 1,
    range: 3,
    skillCost: 6,
    growthHp: 2,
    growthAtk: 2,
  },
  arquero: {
    title: "Arquero",
    male: "Arquero",
    female: "Arquera",
    blurb: "Precisión y agilidad",
    skill: "Tiro certero",
    skillInfo: "Disparo lejano, casi siempre crítico",
    hp: 32,
    mp: 12,
    atk: 7,
    def: 2,
    range: 4,
    skillCost: 4,
    growthHp: 3,
    growthAtk: 1,
  },
  asesino: {
    title: "Asesino",
    male: "Asesino",
    female: "Asesina",
    blurb: "Velocidad y sigilo",
    skill: "Paso de sombra",
    skillInfo: "Hiere y aparece detrás",
    hp: 30,
    mp: 12,
    atk: 9,
    def: 2,
    range: 1,
    skillCost: 4,
    growthHp: 2,
    growthAtk: 1,
  },
};

export const CLASS_ORDER: ClassId[] = ["guerrero", "maga", "arquero", "asesino"];

/** The clearing you wake in: gathering, no fighting. */
export const FOREST_NAME = "El claro del bosque";

export const PATHS = [
  "Sala de columnas",
  "Pasillo partido",
  "Tres rejas",
  "Cruce de guardia",
  "Cámaras gemelas",
  "El anillo",
  "Zigzag",
  "Cripta abierta",
];

type EnemyDef = {
  name: string;
  hp: number;
  atk: number;
  def: number;
  range: number;
  hpG: number;
  atkG: number;
  /** Components this creature leaves behind when it falls. */
  drops: ComponentId[];
  /** How many of those drops it tends to leave, before rarity scaling. */
  dropCount?: number;
};

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  goblin: {
    name: "Goblin",
    hp: 12,
    atk: 4,
    def: 0,
    range: 1,
    hpG: 2,
    atkG: 0.45,
    drops: ["rama", "trapo"],
  },
  skeleton: {
    name: "Esqueleto",
    hp: 14,
    atk: 5,
    def: 1,
    range: 1,
    hpG: 2,
    atkG: 0.5,
    drops: ["hueso", "piedra"],
  },
  wolf: {
    name: "Lobo",
    hp: 11,
    atk: 6,
    def: 0,
    range: 1,
    hpG: 2,
    atkG: 0.5,
    drops: ["colmillo", "trapo"],
  },
  bat: {
    name: "Murciélago",
    hp: 8,
    atk: 5,
    def: 0,
    range: 1,
    hpG: 1.5,
    atkG: 0.4,
    drops: ["hueso", "trapo"],
  },
  spider: {
    name: "Araña tejedientas",
    hp: 13,
    atk: 5,
    def: 1,
    range: 1,
    hpG: 2,
    atkG: 0.45,
    drops: ["seda"],
  },
  knight: {
    name: "Caballero espectral",
    hp: 20,
    atk: 6,
    def: 3,
    range: 1,
    hpG: 3,
    atkG: 0.4,
    drops: ["hierro", "esencia"],
  },
  mage: {
    name: "Mago oscuro",
    hp: 13,
    atk: 7,
    def: 0,
    range: 3,
    hpG: 2,
    atkG: 0.45,
    drops: ["cristal", "esencia"],
  },
  golem: {
    name: "Gólem de la torre",
    hp: 26,
    atk: 6,
    def: 5,
    range: 1,
    hpG: 3,
    atkG: 0.35,
    drops: ["piedra", "hierro"],
  },
  specter: {
    name: "Espectro",
    hp: 15,
    atk: 8,
    def: 1,
    range: 2,
    hpG: 2,
    atkG: 0.5,
    drops: ["seda", "esencia"],
  },
  king: {
    name: "Rey Esqueleto",
    hp: 44,
    atk: 9,
    def: 4,
    range: 1,
    hpG: 0,
    atkG: 0,
    drops: ["nucleo", "hueso"],
    dropCount: 2,
  },
  boss: {
    name: "Guardián",
    hp: 72,
    atk: 11,
    def: 3,
    range: 1,
    hpG: 0,
    atkG: 0,
    drops: ["nucleo", "esencia"],
    dropCount: 3,
  },
};

export const FLOOR_ENEMIES: EnemyId[][] = [
  ["goblin", "goblin", "bat"],
  ["goblin", "bat", "skeleton"],
  ["skeleton", "wolf", "goblin", "bat"],
  ["wolf", "skeleton", "spider"],
  ["spider", "wolf", "knight", "bat"],
  ["mage", "spider", "skeleton", "knight"],
  ["golem", "knight", "mage", "wolf"],
  ["specter", "golem", "mage", "spider"],
  ["king", "specter", "knight", "golem"],
  ["boss", "specter", "mage"],
];

export function skillMult(id: ClassId) {
  if (id === "guerrero") return 1.85;
  if (id === "maga") return 1.05;
  if (id === "arquero") return 1.6;
  return 1.75;
}

export function critChance(id: ClassId, skill: boolean) {
  if (id === "asesino" && !skill) return 0.3;
  if (id === "asesino" && skill) return 0.45;
  if (id === "arquero" && skill) return 0.75;
  if (id === "arquero") return 0.12;
  return 0.05;
}

export function enemyStats(id: EnemyId, floor: number) {
  const e = ENEMIES[id];
  const n = floor - 1;
  return {
    name: e.name,
    hp: e.hp + n * e.hpG,
    atk: e.atk + Math.floor(n * e.atkG),
    def: e.def,
    range: e.range,
  };
}
