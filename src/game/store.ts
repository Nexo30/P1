import { create } from "zustand";
import { blip } from "./audio";
import { CLASSES, PATHS } from "./data";
import { applyAction, applyEnemy, createRun, type FloaterIn } from "./combat";
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
  craft: (recipe: "potion" | "ether" | "whetstone") => void;
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
  craft: (recipe) => {
    const run = get().run;
    if (!run || get().phase !== "play" || get().locked) return;
    const costs = recipe === "potion" ? { herb: 2 } : recipe === "ether" ? { crystal: 2 } : { ore: 2, fang: 1 };
    for (const [id, amount] of Object.entries(costs)) {
      if ((run.materials[id as keyof typeof run.materials] ?? 0) < amount) {
        set({ banner: "No tienes materiales suficientes para esa receta." });
        return;
      }
    }
    const nextRun = structuredClone(run);
    for (const [id, amount] of Object.entries(costs)) nextRun.materials[id as keyof typeof nextRun.materials] = (nextRun.materials[id as keyof typeof nextRun.materials] ?? 0) - amount;
    if (recipe === "potion") nextRun.potions += 1;
    else if (recipe === "ether") nextRun.ethers += 1;
    else nextRun.player.atk += 1;
    set({ run: nextRun, banner: recipe === "potion" ? "¡Fabricaste una poción!" : recipe === "ether" ? "¡Fabricaste un éter!" : "¡Piedra de afilar usada! ATK +1 permanente." });
    blip("ui");
  },
  start: (classId, sex) => {
    const seed = (Math.floor(Math.random() * 1e9) ^ Date.now()) >>> 0;
    const run = createRun({ classId, sex, floor: 1, seed });
    set({
      phase: "play",
      pick: { classId, sex },
      run,
      checkpoint: structuredClone(run),
      mode: "idle",
      locked: false,
      banner: `${PATHS[run.archetype]}. Tu turno.`,
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
    const maxHp = run.player.maxHp + cls.growthHp;
    const atk = run.player.atk + cls.growthAtk;
    const next = createRun({
      classId: pick.classId,
      sex: pick.sex,
      floor: run.floor + 1,
      seed: run.seed,
      carry: {
        maxHp,
        hp: Math.min(maxHp, run.player.hp + Math.round(maxHp * 0.42)),
        maxMp: run.player.maxMp,
        mp: Math.min(run.player.maxMp, run.player.mp + 4),
        atk,
        def: run.player.def,
        potions: run.potions,
        ethers: run.ethers,
        materials: run.materials,
      },
    });
    set({
      phase: "play",
      run: next,
      checkpoint: structuredClone(next),
      mode: "idle",
      locked: false,
      banner: `${PATHS[next.archetype]}. Piso ${next.floor}.`,
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

function finishFloor() {
  const run = useGame.getState().run;
  if (!run) return;
  const best = remember(run.floor);
  if (run.floor >= 10) {
    useGame.setState({ phase: "victory", best, locked: false, banner: "La cima es tuya." });
    blip("win");
  } else {
    useGame.setState({ phase: "clear", best, locked: false, banner: "Piso despejado." });
    blip("win");
  }
}
