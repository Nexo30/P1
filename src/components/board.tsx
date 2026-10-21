import { useEffect, useRef } from "react";
import { attackTargets, moveOptions, skillAims } from "@/game/combat";
import { useGame } from "@/game/store";
import { H, W, idx, inb, type Actor } from "@/game/types";

const images = new Map<string, HTMLImageElement>();

function image(src: string) {
  let img = images.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    images.set(src, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

function paint(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function Board({ onTile }: { onTile: (x: number, y: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const metrics = useRef({ ox: 0, oy: 0, tile: 32 });

  useEffect(() => {
    let frame = 0;
    const loop = () => {
      const canvas = ref.current;
      if (canvas) draw(canvas, metrics.current);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <canvas
      ref={ref}
      className="absolute inset-0 h-full w-full touch-none"
      onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const m = metrics.current;
        const x = Math.floor((event.clientX - rect.left - m.ox) / m.tile);
        const y = Math.floor((event.clientY - rect.top - m.oy) / m.tile);
        if (inb(x, y)) onTile(x, y);
      }}
    />
  );
}

function draw(canvas: HTMLCanvasElement, metrics: { ox: number; oy: number; tile: number }) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const bw = canvas.clientWidth;
  const bh = canvas.clientHeight;
  if (bw < 2 || bh < 2) return;
  const pw = Math.floor(bw * dpr);
  const ph = Math.floor(bh * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const bg = paint("--color-bg", "#070b16");
  const gold = paint("--color-gold", "#e4c36a");
  const cyan = paint("--color-cyan", "#6fd0ff");
  const hp = paint("--color-hp", "#e23b4a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, bw, bh);
  const state = useGame.getState();
  const run = state.run;
  if (!run) return;
  const tile = Math.max(18, Math.floor(Math.min(bw / W, bh / H)));
  const ox = Math.floor((bw - tile * W) / 2);
  const oy = Math.floor((bh - tile * H) / 2);
  metrics.ox = ox;
  metrics.oy = oy;
  metrics.tile = tile;
  const shaking = Date.now() - state.shake < 160;
  ctx.save();
  ctx.translate(ox + (shaking ? Math.sin(Date.now() / 18) * 3 : 0), oy);

  const floor = image("/game/tile-floor.png");
  const wall = image("/game/tile-wall.png");
  const stairs = image("/game/tile-stairs.png");
  const chest = image("/game/prop-chest.png");

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const gx = x * tile;
      const gy = y * tile;
      if (run.tiles[idx(x, y)] === "wall") {
        if (wall) ctx.drawImage(wall, gx, gy, tile, tile);
        else {
          ctx.fillStyle = "#0c1222";
          ctx.fillRect(gx, gy, tile, tile);
        }
        if (y + 1 < H && run.tiles[idx(x, y + 1)] === "floor" && ((x * 13 + y * 7 + run.seed) % 7 === 0)) {
          ctx.fillStyle = "#e8a04a";
          ctx.fillRect(gx + tile * 0.42, gy + tile * 0.62, tile * 0.16, tile * 0.28);
          ctx.fillStyle = "#ffe08a";
          ctx.fillRect(gx + tile * 0.46, gy + tile * 0.55, tile * 0.08, tile * 0.16);
        }
      } else if (floor) ctx.drawImage(floor, gx, gy, tile, tile);
      else {
        ctx.fillStyle = "#1a2740";
        ctx.fillRect(gx, gy, tile, tile);
      }
    }
  }

  ctx.strokeStyle = gold;
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (run.tiles[idx(x, y)] !== "floor") continue;
      ctx.strokeRect(x * tile + 0.5, y * tile + 0.5, tile - 1, tile - 1);
    }
  }
  ctx.globalAlpha = 1;

  const moves = state.mode === "idle" || state.mode === "move" ? moveOptions(run) : [];
  ctx.fillStyle = cyan;
  ctx.globalAlpha = 0.28;
  for (const cell of moves) ctx.fillRect(cell.x * tile, cell.y * tile, tile, tile);
  ctx.globalAlpha = 1;

  if (state.mode === "attack") {
    ctx.fillStyle = hp;
    ctx.globalAlpha = 0.35;
    for (const enemy of attackTargets(run)) ctx.fillRect(enemy.x * tile, enemy.y * tile, tile, tile);
    ctx.globalAlpha = 1;
  }
  if (state.mode === "skill") {
    ctx.fillStyle = gold;
    ctx.globalAlpha = 0.32;
    for (const aim of skillAims(run)) ctx.fillRect(aim.x * tile, aim.y * tile, tile, tile);
    ctx.globalAlpha = 1;
  }

  if (stairs) {
    const s = tile * 0.82;
    ctx.drawImage(stairs, run.stairs.x * tile + (tile - s) / 2, run.stairs.y * tile + (tile - s) / 2, s, s);
  }

  for (const prop of run.props) {
    const s = tile * 0.72;
    if (wall) ctx.drawImage(wall, prop.x * tile + (tile - s) / 2, prop.y * tile + tile - s - 2, s, s);
  }
  for (const item of run.chests) {
    const s = tile * 0.7;
    if (chest) ctx.drawImage(chest, item.x * tile + (tile - s) / 2, item.y * tile + tile - s - 1, s, s);
  }

  const actors = [...run.enemies, run.player].sort((a, b) => a.y - b.y);
  for (const actor of actors) drawActor(ctx, actor, tile, state.pulse);

  ctx.strokeStyle = cyan;
  ctx.lineWidth = 2;
  ctx.strokeRect(run.player.x * tile + 2, run.player.y * tile + 2, tile - 4, tile - 4);

  const now = Date.now();
  ctx.textAlign = "center";
  ctx.font = `700 ${Math.max(12, Math.floor(tile * 0.38))}px Outfit, sans-serif`;
  for (const floater of state.floaters) {
    const age = now - floater.at;
    if (age < 0 || age > 900) continue;
    ctx.globalAlpha = 1 - age / 900;
    ctx.fillStyle = floater.tone === "heal" ? "#8dffb0" : floater.tone === "crit" ? gold : floater.tone === "info" ? cyan : hp;
    ctx.fillText(floater.text, floater.x * tile + tile / 2, floater.y * tile - (age / 900) * tile * 0.7 + 8);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawActor(
  ctx: CanvasRenderingContext2D,
  actor: Actor,
  tile: number,
  pulse: { id: string; x: number; y: number; at: number } | null,
) {
  const bob = Math.sin(Date.now() / 280 + actor.x) * 1.2;
  let ox = 0;
  let oy = 0;
  if (pulse && pulse.id === actor.id && Date.now() - pulse.at < 180) {
    const k = 1 - (Date.now() - pulse.at) / 180;
    ox = (pulse.x - actor.x) * tile * 0.28 * k;
    oy = (pulse.y - actor.y) * tile * 0.28 * k;
  }
  const boss = actor.enemyId === "boss";
  const dw = tile * (boss ? 1.15 : 0.92);
  const dh = tile * (boss ? 1.55 : 1.32);
  const dx = actor.x * tile + (tile - dw) / 2 + ox;
  const dy = actor.y * tile + tile - dh + 4 + oy + bob;
  const img = image(`/game/${actor.sprite}.png`);
  ctx.save();
  ctx.translate(dx + dw / 2, dy + dh / 2);
  ctx.scale(actor.facing, 1);
  if (img) ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  else {
    ctx.fillStyle = actor.id === "player" ? "#6fd0ff" : "#e23b4a";
    ctx.fillRect(-dw / 4, -dh / 3, dw / 2, dh / 2);
  }
  ctx.restore();
  if (actor.id !== "player") {
    const bw = tile * 0.7;
    const bx = actor.x * tile + (tile - bw) / 2;
    const by = actor.y * tile + 3;
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(bx, by, bw, 4);
    ctx.fillStyle = "#e23b4a";
    ctx.fillRect(bx, by, bw * Math.max(0, actor.hp / actor.maxHp), 4);
  }
}
