import { create } from "zustand";
import { blip } from "./audio";
import { CLASSES, FOREST_NAME, PATHS } from "./data";
import { applyAction, applyEnemy, createRun, forge, type FloaterIn } from "./combat";
import { recipeById } from "./crafting";
import type { Action, ClassId, Floater, Mode, Phase, Run, Sex } from "./types";
import { cheb } from "./types";

type GameStore = {
  phase: Phase;
  pick: { classId: ClassId; sex: Sex } | null;
  run: Run | null;
  checkpoint: Run | null;
  mode: Mode;
  locked: boolean;
  banner: string;
  floaters: Floater[];
  pulse: { id: string; x: number; y: number; at: number } | null;
  shake: number;
  epoch: number;
  best: number;
  confirmQuit: boolean;
  setPick: (classId: ClassId, sex: Sex) => void;
  loadBest: () => void;
  say: (banner: string) => void;
  setMode: (mode: Mode) => void;
  start: (classId: ClassId, sex: Sex) => void;
  act: (action: Action) => Promise<void>;
  continueRun: () => void;
  retry: () => void;
  quit: () => void;
  setConfirmQuit: (value: boolean) => void;
  craft: (recipeId: string) => void;
};

let floaterId = 1;

function stamp(list: FloaterIn[]): Floater[] {
  const at = Date.now();
  return list.map((f) => ({ ...f, id: floaterId++, at }));
}

function pace(ms: number) {
  const reduce =
    typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  return new Promise((resolve) => setTimeout(resolve, reduce ? 40 : ms));
}

function remember(floor: number) {
  try {
    const prev = Number(localStorage.getItem("la-torre-best") || 0);
    const next = Math.max(prev, floor);
    localStorage.setItem("la-torre-best", String(next));
    return next;
  } catch {
    return floor;
  }
}

declare global {
  interface Window {
    __torre?: { getState: () => GameStore };
  }
}

export const useGame = create<GameStore>((set, get) => ({
  phase: "select",

  pick: null,
  run: null,
  checkpoint: null,
  mode: "idle",
  locked: false,
  banner: "",
  floaters: [],
  pulse: null,
  shake: 0,
  epoch: 0,
  best: 0,
  confirmQuit: false,
  setPick: (classId, sex) => set({ pick: { classId, sex } }),
  loadBest: () => {
    try {
      const n = Number(localStorage.getItem("la-torre-best") || 0);
      if (n) set({ best: n });
    } catch {
      /* ignore */
    }
  },
  say: (banner) => set({ banner }),
  setMode: (mode) => set({ mode }),
  setConfirmQuit: (value) => set({ confirmQuit: value }),
  craft: (recipeId) => {
    const state = get();
    const run = state.run;
    if (!run || state.locked || (state.phase !== "play" && state.phase !== "clear")) return;
    const recipe = recipeById(recipeId);
    if (!recipe) return;
    const made = forge(run, recipe);
    if (!made.ok) {
      set({ banner: made.reason });
      blip("ui");
      return;
    }
    // Forging between floors is free; with enemies still breathing it costs the turn.
    if (state.phase === "play" && run.enemies.length) void state.act({ type: "forge", recipe: recipeId });
    else {
      const next = structuredClone(run);
      forge(next, recipe);
      set({ run: next, banner: made.text });
      blip("skill");
    }
  },
  start: (classId, sex) => {
    const seed = (Math.floor(Math.random() * 1e9) ^ Date.now()) >>> 0;
    const run = createRun({ classId, sex, floor: 0, seed });
    set({
      phase: "play",
      pick: { classId, sex },
      run,
      checkpoint: structuredClone(run),
      mode: "idle",
      locked: false,
      banner: `${FOREST_NAME}. Recoge lo que sirva para forjar; la puerta espera al norte.`,
      floaters: [],
      pulse: null,
      shake: 0,
      epoch: get().epoch + 1,
      confirmQuit: false,
    });
    blip("ui");
  },
  act: async (action) => {
    const epoch = get().epoch;
    if (get().locked || get().phase !== "play" || !get().run) return;
    const applied = applyAction(get().run!, action);
    if (!applied.ok) {
      set({ banner: applied.reason });
      blip("ui");
      return;
    }
    set({
      run: applied.run,
      mode: "idle",
      locked: true,
      banner: applied.banner,
      floaters: [...get().floaters.filter((f) => Date.now() - f.at < 900), ...stamp(applied.floaters)].slice(-16),
      pulse: applied.pulse ? { ...applied.pulse, at: Date.now() } : null,
    });
    blip(applied.sound);
    await pace(action.type === "move" ? 220 : 320);
    if (get().epoch !== epoch || get().phase !== "play" || !get().run) return;
    if (get().run!.player.hp <= 0) {
      set({ phase: "defeat", locked: false, banner: "Has caído." });
      blip("lose");
      return;
    }
    // The forest has nothing to kill: its turn ends when you reach the door.
    if (get().run!.zone === "bosque") {
      if (atDoor(get().run!)) finishFloor();
      else set({ locked: false, mode: "idle", banner: "Tu turno." });
      return;
    }
    if (get().run!.enemies.length === 0) {
      finishFloor();
      return;
    }
    const order = [...get().run!.enemies].sort((a, b) => {
      const p = get().run!.player;
      return cheb(a.x, a.y, p.x, p.y) - cheb(b.x, b.y, p.x, p.y) || a.id.localeCompare(b.id);
    });
    for (const enemy of order) {
      if (get().epoch !== epoch || !get().run) return;
      if (!get().run!.enemies.some((e) => e.id === enemy.id)) continue;
      const step = applyEnemy(get().run!, enemy.id);
      set({
        run: step.run,
        banner: step.banner,
        floaters: [...get().floaters.filter((f) => Date.now() - f.at < 900), ...stamp(step.floaters)].slice(-16),
        shake: step.hurt ? Date.now() : get().shake,
        pulse: step.pulse ? { ...step.pulse, at: Date.now() } : null,
      });
      blip(step.sound);
      await pace(200);
      if (get().epoch !== epoch || !get().run) return;
      if (get().run!.player.hp <= 0) {
        set({ phase: "defeat", locked: false, banner: "Has caído." });
        blip("lose");
        return;
      }
    }
    if (get().epoch !== epoch || !get().run) return;
    if (get().run!.enemies.length === 0) finishFloor();
    else set({ locked: false, mode: "idle", banner: "Tu turno." });
  },
  continueRun: () => {
    const { run, pick } = get();
    if (!run || !pick) return;
    if (run.floor >= 10) {
      const best = remember(10);
      set({ phase: "victory", best, locked: false, banner: "La cima es tuya." });
      return;
    }
    const cls = CLASSES[pick.classId];
    // The forest is a prelude: no growth, only what you gathered walks in with you.
    const prelude = run.floor <= 0;
    const maxHp = prelude ? run.player.maxHp : run.player.maxHp + cls.growthHp;
    const atk = prelude ? run.player.atk : run.player.atk + cls.growthAtk;
    const next = createRun({
      classId: pick.classId,
      sex: pick.sex,
      floor: run.floor + 1,
      seed: run.seed,
      carry: {
        maxHp,
        hp: Math.min(maxHp, run.player.hp + (prelude ? 0 : Math.round(maxHp * 0.42))),
        maxMp: run.player.maxMp,
        mp: Math.min(run.player.maxMp, run.player.mp + (prelude ? 0 : 4)),
        atk,
        def: run.player.def,
        items: run.items,
        components: run.components,
        equipment: run.equipment,
        bonus: run.bonus,
      },
    });
    set({
      phase: "play",
      run: next,
      checkpoint: structuredClone(next),
      mode: "idle",
      locked: false,
      banner: prelude
        ? `${PATHS[next.archetype]}. Piso 1. Empieza la torre.`
        : `${PATHS[next.archetype]}. Piso ${next.floor}.`,
      floaters: [],
      pulse: null,
      epoch: get().epoch + 1,
    });
    blip("ui");
  },
  retry: () => {
    const cp = get().checkpoint;
    if (!cp) return;
    set({
      phase: "play",
      run: structuredClone(cp),
      mode: "idle",
      locked: false,
      banner: "Otra oportunidad.",
      floaters: [],
      pulse: null,
      shake: 0,
      epoch: get().epoch + 1,
    });
    blip("ui");
  },
  quit: () => {
    set({
      phase: "select",
      run: null,
      checkpoint: null,
      mode: "idle",
      locked: false,
      banner: "",
      floaters: [],
      confirmQuit: false,
      epoch: get().epoch + 1,
    });
  },
}));

function atDoor(run: Run) {
  return run.player.x === run.stairs.x && run.player.y === run.stairs.y;
}

function finishFloor() {
  const run = useGame.getState().run;
  if (!run) return;
  if (run.zone === "bosque") {
    useGame.setState({
      phase: "clear",
      locked: false,
      banner: "La puerta de la torre se abre ante ti.",
    });
    blip("win");
    return;
  }
  const best = remember(run.floor);
  if (run.floor >= 10) {
    useGame.setState({ phase: "victory", best, locked: false, banner: "La cima es tuya." });
    blip("win");
  } else {
    useGame.setState({ phase: "clear", best, locked: false, banner: "Piso despejado." });
    blip("win");
  }
}

// The browser harness needs to read the live run; SSR and production builds skip it.
if (import.meta.env.DEV && typeof window !== "undefined") window.__torre = useGame;
