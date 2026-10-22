import type { ComponentId, EquipSlot, ItemId, RecipeKind, Run, Tier } from "./types";

/**
 * The forge is data-driven: components, recipes and their effects all live
 * here so new content is a table entry rather than a branch in the store.
 */

export const TIER_ORDER: Tier[] = ["comun", "raro", "epico", "legendario"];

export const TIERS: Record<Tier, { label: string; color: string; yield: number }> = {
  comun: { label: "Común", color: "#c3ccdb", yield: 1 },
  raro: { label: "Raro", color: "#5fd08a", yield: 2 },
  epico: { label: "Épico", color: "#5aa9ff", yield: 3 },
  legendario: { label: "Legendario", color: "#e0a0ff", yield: 5 },
};

export type ComponentDef = {
  name: string;
  tier: Tier;
  blurb: string;
  /** Processed parts are only ever made in the forge, never picked up. */
  crafted?: boolean;
};

export const COMPONENTS: Record<ComponentId, ComponentDef> = {
  rama: { name: "Rama", tier: "comun", blurb: "Madera torcida de las antorchas" },
  piedra: { name: "Piedra", tier: "comun", blurb: "Canto rodado de la torre" },
  hierba: { name: "Hierba", tier: "comun", blurb: "Hojas amargas, aún frescas" },
  trapo: { name: "Trapo", tier: "comun", blurb: "Jirones de los caídos" },
  hueso: { name: "Hueso", tier: "comun", blurb: "Aún con forma de algo" },
  colmillo: { name: "Colmillo", tier: "raro", blurb: "Corte natural, filo breve" },
  cristal: { name: "Cristal", tier: "raro", blurb: "Guarda luz que no lo ilumina" },
  hierro: { name: "Hierro", tier: "raro", blurb: "Mineral pardo y pesado" },
  seda: { name: "Seda", tier: "raro", blurb: "Tejida por algo que no debería" },
  esencia: { name: "Esencia", tier: "epico", blurb: "Magia destilada, tibias" },
  nucleo: { name: "Núcleo", tier: "legendario", blurb: "El latido de la torre" },
  vara: { name: "Vara", tier: "comun", blurb: "Rama astillada y recta", crafted: true },
  lingote: { name: "Lingote", tier: "raro", blurb: "Hierro vuelto a nacer", crafted: true },
  tela_arcana: { name: "Tela arcana", tier: "epico", blurb: "Seda que recuerda hechizos", crafted: true },
  vidrio_pulido: { name: "Vidrio pulido", tier: "epico", blurb: "Cristal con filo limpio", crafted: true },
};

export const RAW_COMPONENTS = (Object.keys(COMPONENTS) as ComponentId[]).filter(
  (id) => !COMPONENTS[id].crafted,
);

export type Recipe = {
  id: string;
  name: string;
  kind: RecipeKind;
  tier: Tier;
  cost: Partial<Record<ComponentId, number>>;
  effect: string;
  /** What the forge hands back. */
  gives?: { item: ItemId } | { component: ComponentId } | { equip: EquipSlot };
  atk?: number;
  def?: number;
  maxHp?: number;
  maxMp?: number;
  /** Damage dealt by a bomb, in flat points. */
  blast?: number;
};

export const RECIPES: Recipe[] = [
  // ---- Común: huesos de la economía -------------------------------------
  {
    id: "vara",
    name: "Vara",
    kind: "component",
    tier: "comun",
    cost: { rama: 2 },
    effect: "Base de casi todo lo que corta",
    gives: { component: "vara" },
  },
  {
    id: "garrote",
    name: "Garrote claveteado",
    kind: "weapon",
    tier: "comun",
    cost: { rama: 2, trapo: 1 },
    effect: "ATK +2",
    gives: { equip: "weapon" },
    atk: 2,
  },
  {
    id: "hacha_de_piedra",
    name: "Hacha de piedra",
    kind: "weapon",
    tier: "comun",
    cost: { vara: 1, piedra: 2, trapo: 1 },
    effect: "ATK +4",
    gives: { equip: "weapon" },
    atk: 4,
  },
  {
    id: "pocion_de_hierbas",
    name: "Poción de hierbas",
    kind: "consumable",
    tier: "comun",
    cost: { hierba: 2 },
    effect: "Devuelve 38% del HP",
    gives: { item: "potion" },
  },
  {
    id: "venda_apretada",
    name: "Venda apretada",
    kind: "permanent",
    tier: "comun",
    cost: { trapo: 2, hueso: 1 },
    effect: "DEF +1 permanente",
    def: 1,
  },

  // ---- Raro: el metal entra en juego ------------------------------------
  {
    id: "lingote",
    name: "Lingote",
    kind: "component",
    tier: "raro",
    cost: { hierro: 2, piedra: 1 },
    effect: "Pieza para armas y armaduras",
    gives: { component: "lingote" },
  },
  {
    id: "espada_de_hierro",
    name: "Espada de hierro",
    kind: "weapon",
    tier: "raro",
    cost: { lingote: 2, colmillo: 1 },
    effect: "ATK +7",
    gives: { equip: "weapon" },
    atk: 7,
  },
  {
    id: "cota_de_malla",
    name: "Cota de malla",
    kind: "armor",
    tier: "raro",
    cost: { lingote: 3, trapo: 2 },
    effect: "DEF +4",
    gives: { equip: "armor" },
    def: 4,
  },
  {
    id: "frasco_de_eter",
    name: "Frasco de éter",
    kind: "consumable",
    tier: "raro",
    cost: { cristal: 2, hierba: 1 },
    effect: "Devuelve 50% del MP",
    gives: { item: "ether" },
  },
  {
    id: "bomba_de_piedra",
    name: "Bomba de piedra",
    kind: "consumable",
    tier: "raro",
    cost: { piedra: 2, cristal: 1, hierba: 1 },
    effect: "Estalla contra todos los adyacentes",
    gives: { item: "bomb" },
    blast: 9,
  },
  {
    id: "piedra_de_afilar",
    name: "Piedra de afilar",
    kind: "permanent",
    tier: "raro",
    cost: { piedra: 3, colmillo: 1 },
    effect: "ATK +2 permanente",
    atk: 2,
  },

  // ---- Épico: material que ya no es del todo físico ----------------------
  {
    id: "tela_arcana",
    name: "Tela arcana",
    kind: "component",
    tier: "epico",
    cost: { seda: 2, esencia: 1 },
    effect: "Base de armaduras livianas",
    gives: { component: "tela_arcana" },
  },
  {
    id: "vidrio_pulido",
    name: "Vidrio pulido",
    kind: "component",
    tier: "epico",
    cost: { cristal: 2, piedra: 1 },
    effect: "Filo que no se oxida",
    gives: { component: "vidrio_pulido" },
  },
  {
    id: "espada_runita",
    name: "Espada rúnica",
    kind: "weapon",
    tier: "epico",
    cost: { vidrio_pulido: 2, lingote: 1, esencia: 1 },
    effect: "ATK +12",
    gives: { equip: "weapon" },
    atk: 12,
  },
  {
    id: "manto_espectral",
    name: "Manto espectral",
    kind: "armor",
    tier: "epico",
    cost: { tela_arcana: 2, seda: 1 },
    effect: "DEF +8",
    gives: { equip: "armor" },
    def: 8,
  },
  {
    id: "amuleto_de_sangre",
    name: "Amuleto de sangre",
    kind: "trinket",
    tier: "epico",
    cost: { vidrio_pulido: 1, colmillo: 2, esencia: 1 },
    effect: "MP máx +6 y HP máx +6",
    gives: { equip: "trinket" },
    maxMp: 6,
    maxHp: 6,
  },
  {
    id: "placa_toracica",
    name: "Placa torácica",
    kind: "permanent",
    tier: "epico",
    cost: { hueso: 3, lingote: 2 },
    effect: "HP máx +12 permanente",
    maxHp: 12,
  },

  // ---- Legendario: el núcleo de la torre --------------------------------
  {
    id: "hoja_del_guardian",
    name: "Hoja del Guardián",
    kind: "weapon",
    tier: "legendario",
    cost: { nucleo: 2, vidrio_pulido: 1, esencia: 1 },
    effect: "ATK +20",
    gives: { equip: "weapon" },
    atk: 20,
  },
  {
    id: "coraza_del_guardian",
    name: "Coraza del Guardián",
    kind: "armor",
    tier: "legendario",
    cost: { nucleo: 2, lingote: 2, tela_arcana: 1 },
    effect: "DEF +14",
    gives: { equip: "armor" },
    def: 14,
  },
  {
    id: "panacea",
    name: "Panacea",
    kind: "consumable",
    tier: "legendario",
    cost: { nucleo: 1, hierba: 3, esencia: 1 },
    effect: "Restaura todo el HP y el MP",
    gives: { item: "panacea" },
  },
  {
    id: "sello_inquebrantable",
    name: "Sello inquebrantable",
    kind: "permanent",
    tier: "legendario",
    cost: { nucleo: 1, hueso: 2, colmillo: 2 },
    effect: "ATK +3 y DEF +3 permanentes",
    atk: 3,
    def: 3,
  },
];

export const ITEMS: Record<ItemId, { name: string; sprite: string; blurb: string }> = {
  potion: { name: "Poción", sprite: "item-potion", blurb: "Devuelve 38% del HP" },
  ether: { name: "Éter", sprite: "item-ether", blurb: "Devuelve 50% del MP" },
  bomb: { name: "Bomba", sprite: "item-bomb", blurb: "Daña a todos los vecinos" },
  panacea: { name: "Panacea", sprite: "item-panacea", blurb: "Restaura HP y MP por completo" },
};

export function recipeById(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}

export function spriteFor(recipe: Recipe): string {
  if (recipe.gives && "component" in recipe.gives) return `comp-${recipe.gives.component}`;
  if (recipe.gives && "item" in recipe.gives) return ITEMS[recipe.gives.item].sprite;
  return `forge-${recipe.id}`;
}

export function have(run: Run, id: ComponentId): number {
  return run.components[id] ?? 0;
}

export function canAfford(run: Run, recipe: Recipe): boolean {
  return Object.entries(recipe.cost).every(([id, n]) => have(run, id as ComponentId) >= (n ?? 0));
}

/** What is still missing, so the forge can show the gap instead of a dead button. */
export function shortfall(run: Run, recipe: Recipe): [ComponentId, number][] {
  return Object.entries(recipe.cost)
    .map(([id, n]) => [id as ComponentId, (n ?? 0) - have(run, id as ComponentId)] as [ComponentId, number])
    .filter(([, missing]) => missing > 0);
}

export function shortfallText(run: Run, recipe: Recipe): string {
  return shortfall(run, recipe)
    .map(([id, n]) => `${n} ${COMPONENTS[id].name}`)
    .join(", ");
}

export function recipesByTier(tier: Tier): Recipe[] {
  return RECIPES.filter((r) => r.tier === tier);
}

/** Deepest tier the floor allows; the gate is depth, not luck. */
export const TIER_FLOOR: Record<Tier, number> = {
  comun: 1,
  raro: 3,
  epico: 6,
  legendario: 9,
};

export function unlockedTier(floor: number): Tier {
  return TIER_ORDER.filter((t) => floor >= TIER_FLOOR[t]).pop() ?? "comun";
}

export function tierAtLeast(a: Tier, b: Tier): boolean {
  return TIER_ORDER.indexOf(a) >= TIER_ORDER.indexOf(b);
}
