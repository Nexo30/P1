import { useEffect, type ReactNode } from "react";
import {
  Backpack,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Footprints,
  Hourglass,
  Sparkles,
  Sword,
  Target,
} from "lucide-react";
import { unlockAudio } from "@/game/audio";
import { attackTargets, bestAim, moveOptions, skillAims } from "@/game/combat";
import { CLASS_ORDER, CLASSES, PATHS } from "@/game/data";
import { useGame } from "@/game/store";
import type { ClassId, Sex } from "@/game/types";
import { Board } from "@/components/board";

const ICONS = {
  guerrero: Sword,
  maga: Sparkles,
  arquero: Target,
  asesino: Footprints,
} as const;

function pressMove() {
  const s = useGame.getState();
  if (!s.run || s.locked) return;
  if (!moveOptions(s.run).length) {
    s.say("No hay paso libre.");
    return;
  }
  s.setMode("move");
  s.say("Un paso: casilla azul o flecha.");
}

function pressAttack() {
  const s = useGame.getState();
  if (!s.run || s.locked) return;
  const targets = attackTargets(s.run);
  if (!targets.length) {
    s.say("Nadie al alcance.");
    return;
  }
  if (targets.length === 1 || s.mode === "attack") {
    const aim = bestAim(
      s.run,
      targets.map((e) => ({ x: e.x, y: e.y, id: e.id })),
    );
    void s.act({ type: "attack", id: aim.id! });
    return;
  }
  s.setMode("attack");
  s.say("Elige un enemigo, o pulsa Atacar otra vez.");
}

function pressSkill() {
  const s = useGame.getState();
  if (!s.run || s.locked || !s.run.player.classId) return;
  const cls = CLASSES[s.run.player.classId];
  if (s.run.player.mp < cls.skillCost) {
    s.say("Sin maná.");
    return;
  }
  const aims = skillAims(s.run);
  if (!aims.length) {
    s.say("Sin objetivo para el poder.");
    return;
  }
  if (aims.length === 1 || s.mode === "skill") {
    const aim = bestAim(s.run, aims);
    void s.act({ type: "skill", x: aim.x, y: aim.y, id: aim.id });
    return;
  }
  s.setMode("skill");
  s.say(`${cls.skill}: elige objetivo.`);
}

function pressItem() {
  const s = useGame.getState();
  if (!s.run || s.locked) return;
  if (!s.run.potions && !s.run.ethers) {
    s.say("No tienes objetos.");
    return;
  }
  if (s.run.potions && !s.run.ethers) {
    void s.act({ type: "item", item: "potion" });
    return;
  }
  if (s.run.ethers && !s.run.potions) {
    void s.act({ type: "item", item: "ether" });
    return;
  }
  s.setMode("item");
  s.say("Elige poción o éter.");
}

function step(dx: number, dy: number) {
  const s = useGame.getState();
  if (!s.run || s.locked || s.phase !== "play") return;
  const x = s.run.player.x + dx;
  const y = s.run.player.y + dy;
  if (!moveOptions(s.run).some((p) => p.x === x && p.y === y)) {
    s.say("No puedes pasar.");
    return;
  }
  void s.act({ type: "move", x, y });
}

function onTile(x: number, y: number) {
  const s = useGame.getState();
  if (!s.run || s.locked || s.phase !== "play") return;
  const run = s.run;
  if (s.mode === "skill") {
    const aim = skillAims(run).find((a) => a.x === x && a.y === y);
    if (aim) void s.act({ type: "skill", x: aim.x, y: aim.y, id: aim.id });
    return;
  }
  const enemy = run.enemies.find((e) => e.x === x && e.y === y);
  if (enemy) {
    const target = attackTargets(run).find((e) => e.id === enemy.id);
    if (target) void s.act({ type: "attack", id: target.id });
    else s.say("Fuera de alcance.");
    return;
  }
  if (moveOptions(run).some((p) => p.x === x && p.y === y)) void s.act({ type: "move", x, y });
}

export function TowerGame() {
  const phase = useGame((s) => s.phase);
  const loadBest = useGame((s) => s.loadBest);

  useEffect(() => {
    loadBest();
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, [loadBest]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const s = useGame.getState();
      if (s.phase !== "play" || s.locked || !s.run) return;
      if (event.code === "Digit1") pressMove();
      else if (event.code === "Digit2") pressAttack();
      else if (event.code === "Digit3") pressSkill();
      else if (event.code === "Digit4") pressItem();
      else if (event.code === "Digit5" || event.code === "Space") {
        event.preventDefault();
        void s.act({ type: "wait" });
      } else if (event.code === "ArrowLeft" || event.code === "KeyA") {
        event.preventDefault();
        step(-1, 0);
      } else if (event.code === "ArrowRight" || event.code === "KeyD") {
        event.preventDefault();
        step(1, 0);
      } else if (event.code === "ArrowUp" || event.code === "KeyW") {
        event.preventDefault();
        step(0, -1);
      } else if (event.code === "ArrowDown" || event.code === "KeyS") {
        event.preventDefault();
        step(0, 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (phase === "select") return <SelectScreen />;
  return <PlayScreen />;
}

function SelectScreen() {
  const pick = useGame((s) => s.pick);
  const best = useGame((s) => s.best);
  const setPick = useGame((s) => s.setPick);
  const start = useGame((s) => s.start);
  const chosen = pick ? CLASSES[pick.classId] : null;

  return (
    <main className="mx-auto grid min-h-dvh max-w-5xl md:grid-cols-2">
      <div className="relative hidden md:block">
        <img src="/game/tower-banner.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/50 to-bg/20" />
      </div>
      <section className="flex flex-col gap-4 overflow-y-auto p-4 pb-8">
        <div className="relative h-36 overflow-hidden rounded-lg md:hidden">
          <img src="/game/tower-banner.jpg" alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-bg to-transparent" />
          <h1 className="font-display absolute bottom-3 left-4 text-3xl text-fg">La Torre</h1>
        </div>
        <header className="hidden md:block">
          <p className="text-xs tracking-widest text-gold uppercase">10 pisos</p>
          <h1 className="font-display text-4xl text-fg">La Torre</h1>
        </header>
        <p className="text-sm text-muted">
          Elige clase y sexo. Cada turno es una sola acción. Después se mueven ellos.
        </p>
        {best > 0 ? <p className="text-sm text-gold">Mejor ascenso: piso {best}</p> : null}
        <div className="grid grid-cols-2 gap-3">
          {CLASS_ORDER.map((id) => (
            <ClassCard key={id} id={id} picked={pick?.classId === id ? pick.sex : null} onPick={setPick} />
          ))}
        </div>
        {chosen ? (
          <p className="text-sm text-muted">
            {chosen.skill}: {chosen.skillInfo}. Alcance {chosen.range}. Cuesta {chosen.skillCost} MP.
          </p>
        ) : (
          <p className="text-sm text-muted">Toca Hombre o Mujer en una clase.</p>
        )}
        <button
          type="button"
          disabled={!pick}
          onClick={() => pick && start(pick.classId, pick.sex)}
          className="h-12 rounded-lg bg-gold font-semibold text-bg disabled:opacity-40"
        >
          Entrar en la torre
        </button>
      </section>
    </main>
  );
}

function ClassCard({
  id,
  picked,
  onPick,
}: {
  id: ClassId;
  picked: Sex | null;
  onPick: (id: ClassId, sex: Sex) => void;
}) {
  const cls = CLASSES[id];
  const Icon = ICONS[id];
  return (
    <article className={`rounded-lg border bg-surface p-2 ${picked ? "border-gold" : "border-gold/30"}`}>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="size-4 text-gold" aria-hidden="true" />
        <div>
          <h2 className="font-display text-sm text-fg">{cls.title}</h2>
          <p className="text-xs text-muted">{cls.blurb}</p>
        </div>
      </div>
      <p className="mb-2 text-xs text-muted">
        HP {cls.hp} · ATK {cls.atk}
      </p>
      <div className="grid grid-cols-2 gap-1">
        {(["m", "f"] as const).map((sex) => (
          <button
            key={sex}
            type="button"
            aria-pressed={picked === sex}
            aria-label={`${cls.title} ${sex === "m" ? "hombre" : "mujer"}`}
            onClick={() => onPick(id, sex)}
            className={`rounded-md px-1 py-1 ${picked === sex ? "bg-surface-2 ring-2 ring-cyan" : "bg-bg/50"}`}
          >
            <img
              src={`/game/hero-${id}-${sex}.png`}
              alt=""
              className="mx-auto h-20 w-full object-contain"
            />
            <span className="text-xs text-muted">{sex === "m" ? "Hombre" : "Mujer"}</span>
          </button>
        ))}
      </div>
    </article>
  );
}

function PlayScreen() {
  const run = useGame((s) => s.run);
  const phase = useGame((s) => s.phase);
  const banner = useGame((s) => s.banner);
  const mode = useGame((s) => s.mode);
  const locked = useGame((s) => s.locked);
  const confirmQuit = useGame((s) => s.confirmQuit);
  const setConfirmQuit = useGame((s) => s.setConfirmQuit);
  const quit = useGame((s) => s.quit);
  const continueRun = useGame((s) => s.continueRun);
  const retry = useGame((s) => s.retry);
  const act = useGame((s) => s.act);
  if (!run) return null;
  const p = run.player;
  const hpPct = Math.max(0, Math.round((p.hp / p.maxHp) * 100));
  const mpPct = p.maxMp ? Math.max(0, Math.round((p.mp / p.maxMp) * 100)) : 0;

  return (
    <main className="mx-auto flex h-dvh max-w-lg flex-col gap-2 overflow-hidden p-3 select-none">
      <header className="flex items-center gap-3">
        <img src={`/game/${p.sprite}.png`} alt="" className="h-14 w-12 object-contain" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h1 className="font-display truncate text-lg text-fg">{p.name}</h1>
            <p className="text-xs text-gold">Piso {run.floor}/10</p>
          </div>
          <Meter label="HP" value={`${p.hp}/${p.maxHp}`} pct={hpPct} tone="hp" />
          <Meter label="MP" value={`${p.mp}/${p.maxMp}`} pct={mpPct} tone="mp" />
        </div>
      </header>
      <p className="text-xs text-muted">
        {PATHS[run.archetype]} · quedan {run.enemies.length} · pociones {run.potions} · éter {run.ethers}
      </p>
      <p className="min-h-5 text-sm text-fg" aria-live="polite">
        {banner}
      </p>
      <div className="relative min-h-0 flex-1">
        <Board onTile={onTile} />
        {phase !== "play" ? (
          <div className="absolute inset-0 flex items-center justify-center bg-bg/75 p-4">
            <div className="w-full max-w-xs rounded-lg border border-gold/40 bg-surface p-4 text-center">
              <h2 className="font-display text-2xl text-fg">
                {phase === "victory" ? "Cima" : phase === "clear" ? `Piso ${run.floor} limpio` : "Has caído"}
              </h2>
              <p className="mt-2 text-sm text-muted">
                {phase === "victory"
                  ? "Diez pisos. Llegaste como quisiste."
                  : phase === "clear"
                    ? "Los enemigos cayeron. Puedes subir."
                    : "La torre se queda con este intento."}
              </p>
              <div className="mt-4 flex flex-col gap-2">
                {phase === "clear" ? (
                  <button type="button" onClick={continueRun} className="h-12 rounded-lg bg-gold font-semibold text-bg">
                    Subir al piso {run.floor + 1}
                  </button>
                ) : null}
                {phase === "victory" ? (
                  <button type="button" onClick={quit} className="h-12 rounded-lg bg-gold font-semibold text-bg">
                    Jugar de nuevo
                  </button>
                ) : null}
                {phase === "defeat" ? (
                  <button type="button" onClick={retry} className="h-12 rounded-lg bg-gold font-semibold text-bg">
                    Reintentar este piso
                  </button>
                ) : null}
                {phase !== "victory" ? (
                  <button type="button" onClick={quit} className="h-11 rounded-lg border border-gold/40 text-fg">
                    Elegir otra clase
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
      {phase === "play" ? (
        <>
          {mode === "item" ? (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => void act({ type: "item", item: "potion" })} className="h-11 rounded-lg border border-gold/40 bg-surface text-sm">
                Poción ({run.potions})
              </button>
              <button type="button" onClick={() => void act({ type: "item", item: "ether" })} className="h-11 rounded-lg border border-gold/40 bg-surface text-sm">
                Éter ({run.ethers})
              </button>
            </div>
          ) : null}
          <div className="mx-auto grid w-44 grid-cols-3 gap-1">
            <span />
            <Pad label="Arriba" onClick={() => step(0, -1)} disabled={locked}>
              <ChevronUp className="size-5" />
            </Pad>
            <span />
            <Pad label="Izquierda" onClick={() => step(-1, 0)} disabled={locked}>
              <ChevronLeft className="size-5" />
            </Pad>
            <Pad label="Abajo" onClick={() => step(0, 1)} disabled={locked}>
              <ChevronDown className="size-5" />
            </Pad>
            <Pad label="Derecha" onClick={() => step(1, 0)} disabled={locked}>
              <ChevronRight className="size-5" />
            </Pad>
          </div>
          <div className="grid grid-cols-5 gap-1">
            <Action icon={Footprints} label="Mover" pressed={mode === "move"} disabled={locked} onClick={pressMove} />
            <Action icon={Sword} label="Atacar" pressed={mode === "attack"} disabled={locked} onClick={pressAttack} />
            <Action icon={Sparkles} label="Poder" pressed={mode === "skill"} disabled={locked} onClick={pressSkill} />
            <Action icon={Backpack} label="Ítem" pressed={mode === "item"} disabled={locked} onClick={pressItem} />
            <Action icon={Hourglass} label="Esperar" pressed={false} disabled={locked} onClick={() => void act({ type: "wait" })} />
          </div>
          <div className="flex justify-end">
            {confirmQuit ? (
              <button type="button" onClick={quit} className="text-xs text-hp">
                Confirmar salida
              </button>
            ) : (
              <button type="button" onClick={() => setConfirmQuit(true)} className="text-xs text-muted">
                Salir
              </button>
            )}
          </div>
        </>
      ) : null}
    </main>
  );
}

function Meter({ label, value, pct, tone }: { label: string; value: string; pct: number; tone: "hp" | "mp" }) {
  return (
    <div className="mt-1 flex items-center gap-2">
      <span className="w-6 text-xs text-muted">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full ${tone === "hp" ? "bg-hp" : "bg-cyan"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-14 text-right text-xs text-muted">{value}</span>
    </div>
  );
}

function Pad({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-11 items-center justify-center rounded-lg border border-gold/40 bg-surface text-fg disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Action({
  icon: Icon,
  label,
  pressed,
  disabled,
  onClick,
}: {
  icon: typeof Sword;
  label: string;
  pressed: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-14 flex-col items-center justify-center gap-1 rounded-lg border text-xs ${
        pressed ? "border-cyan bg-surface-2 text-fg" : "border-gold/30 bg-surface text-muted"
      } disabled:opacity-40`}
    >
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </button>
  );
}
