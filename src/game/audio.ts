let ctx: AudioContext | null = null;

function context() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function unlockAudio() {
  context();
}

export function blip(kind: "move" | "hit" | "hurt" | "skill" | "ui" | "win" | "lose") {
  const audio = context();
  if (!audio) return;
  const now = audio.currentTime;
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.connect(g);
  g.connect(audio.destination);
  const plan = {
    move: { f: 180, t: "triangle" as OscillatorType, d: 0.06, v: 0.03 },
    hit: { f: 240, t: "square" as OscillatorType, d: 0.08, v: 0.035 },
    hurt: { f: 110, t: "sawtooth" as OscillatorType, d: 0.12, v: 0.04 },
    skill: { f: 420, t: "sine" as OscillatorType, d: 0.16, v: 0.04 },
    ui: { f: 520, t: "sine" as OscillatorType, d: 0.05, v: 0.025 },
    win: { f: 523, t: "triangle" as OscillatorType, d: 0.22, v: 0.04 },
    lose: { f: 160, t: "sine" as OscillatorType, d: 0.24, v: 0.04 },
  }[kind];
  o.type = plan.t;
  o.frequency.setValueAtTime(plan.f, now);
  if (kind === "skill") o.frequency.exponentialRampToValueAtTime(680, now + plan.d);
  if (kind === "lose") o.frequency.exponentialRampToValueAtTime(70, now + plan.d);
  g.gain.setValueAtTime(plan.v, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + plan.d);
  o.start(now);
  o.stop(now + plan.d + 0.02);
}
