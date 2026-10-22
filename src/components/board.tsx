import { useEffect, useRef } from "react";
import { attackTargets, moveOptions, skillAims } from "@/game/combat";
import { useGame } from "@/game/store";
import { idx, inb, isWalkable, type Actor, type Prop, type Tile } from "@/game/types";

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
        const run = useGame.getState().run;
        if (run && inb(run, x, y)) onTile(x, y);
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
  const tile = Math.max(14, Math.floor(Math.min(bw / run.w, bh / run.h)));
  const ox = Math.floor((bw - tile * run.w) / 2);
  const oy = Math.floor((bh - tile * run.h) / 2);
  metrics.ox = ox;
  metrics.oy = oy;
  metrics.tile = tile;
  const shaking = Date.now() - state.shake < 160;
  ctx.save();
  ctx.translate(ox + (shaking ? Math.sin(Date.now() / 18) * 3 : 0), oy);

  const floor = image("/game/tile-floor.png");
  const wall = image("/game/tile-wall.png");
  const grass = image("/game/tile-grass.png");
  const bushArt = image("/game/prop-tree.png");
  const stairs = image("/game/tile-stairs.png");
  const chest = image("/game/prop-chest.png");
  const forest = run.zone === "bosque";

  const ground = (gx: number, gy: number, x: number, y: number, cell: Tile) => {
    if (cell === "grass") {
      if (grass) ctx.drawImage(grass, gx, gy, tile, tile);
      else drawGrass(ctx, gx, gy, tile, x, y);
      return;
    }
    if (forest) {
      // The trodden path through the clearing, not tower flagstones.
      drawDirt(ctx, gx, gy, tile, x, y);
      return;
    }
    if (floor) ctx.drawImage(floor, gx, gy, tile, tile);
    else {
      ctx.fillStyle = "#1a2740";
      ctx.fillRect(gx, gy, tile, tile);
    }
  };

  for (let y = 0; y < run.h; y++) {
    for (let x = 0; x < run.w; x++) {
      const gx = x * tile;
      const gy = y * tile;
      const cell = run.tiles[idx(run, x, y)];
      if (cell === "tree") {
        ground(gx, gy, x, y, "grass");
        if (bushArt) {
          const s = tile * 1.34;
          ctx.drawImage(bushArt, gx + (tile - s) / 2, gy + tile - s, s, s);
        } else {
          drawTree(ctx, gx, gy, tile, (x * 5 + y * 3 + run.seed) % 3);
        }
      } else if (cell === "wall") {
        if (forest) {
          drawThicket(ctx, gx, gy, tile, x, y);
        } else {
          if (wall) ctx.drawImage(wall, gx, gy, tile, tile);
          else {
            ctx.fillStyle = "#0c1222";
            ctx.fillRect(gx, gy, tile, tile);
          }
          if (y + 1 < run.h && isWalkable(run.tiles[idx(run, x, y + 1)]) && (x * 13 + y * 7 + run.seed) % 7 === 0) {
            ctx.fillStyle = "#e8a04a";
            ctx.fillRect(gx + tile * 0.42, gy + tile * 0.62, tile * 0.16, tile * 0.28);
            ctx.fillStyle = "#ffe08a";
            ctx.fillRect(gx + tile * 0.46, gy + tile * 0.55, tile * 0.08, tile * 0.16);
          }
        }
      } else {
        ground(gx, gy, x, y, cell);
      }
    }
  }

  ctx.strokeStyle = gold;
  ctx.globalAlpha = run.zone === "bosque" ? 0.1 : 0.28;
  ctx.lineWidth = 1;
  for (let y = 0; y < run.h; y++) {
    for (let x = 0; x < run.w; x++) {
      if (!isWalkable(run.tiles[idx(run, x, y)])) continue;
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
  } else {
    const s = tile * 0.7;
    ctx.fillStyle = gold;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(run.stairs.x * tile + (tile - s) / 2, run.stairs.y * tile + (tile - s) / 2, s, s);
    ctx.globalAlpha = 1;
  }

  for (const prop of run.props) drawProp(ctx, prop, tile, (prop.x * 7 + prop.y * 11) % 3);
  for (const item of run.chests) {
    const s = tile * 0.7;
    if (chest) ctx.drawImage(chest, item.x * tile + (tile - s) / 2, item.y * tile + tile - s - 1, s, s);
  }

  const rarityColors: Record<string, string> = {
    comun: "#d7dce5",
    raro: "#65e69b",
    epico: "#62b8ff",
    legendario: "#d58aff",
  };
  for (const item of run.groundItems) {
    const size = tile * 0.66;
    const tint = rarityColors[item.rarity] || "#fff";
    const img = image(`/game/comp-${item.component}.png`);
    ctx.save();
    ctx.shadowColor = tint;
    ctx.shadowBlur = item.rarity === "legendario" ? 12 : item.rarity === "epico" ? 8 : 2;
    if (img) {
      ctx.drawImage(img, item.x * tile + (tile - size) / 2, item.y * tile + (tile - size) / 2, size, size);
    } else {
      // A find still has to be visible before its icon art lands.
      const cx = item.x * tile + tile / 2;
      const cy = item.y * tile + tile / 2;
      const r = tile * 0.2;
      ctx.fillStyle = tint;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.72, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r * 0.72, cy);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(cx - r * 0.2, cy - r * 0.15, r * 0.4, r * 0.3);
    }
    ctx.restore();
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

function drawGrass(ctx: CanvasRenderingContext2D, gx: number, gy: number, tile: number, x: number, y: number) {
  ctx.fillStyle = (x + y) % 2 ? "#16281c" : "#182c20";
  ctx.fillRect(gx, gy, tile, tile);
  ctx.fillStyle = "#1f3a28";
  for (let i = 0; i < 3; i++) {
    const px = gx + ((x * 7 + i * 11 + y * 3) % Math.max(1, tile - 2));
    const py = gy + ((y * 5 + i * 17 + x * 2) % Math.max(1, tile - 2));
    ctx.fillRect(px, py, 2, 2);
  }
}

function drawDirt(ctx: CanvasRenderingContext2D, gx: number, gy: number, tile: number, x: number, y: number) {
  ctx.fillStyle = "#2b2118";
  ctx.fillRect(gx, gy, tile, tile);
  ctx.fillStyle = "#3a2d20";
  for (let i = 0; i < 2; i++) {
    const px = gx + ((x * 13 + i * 7 + y * 5) % Math.max(1, tile - 3));
    const py = gy + ((y * 11 + i * 3) % Math.max(1, tile - 3));
    ctx.fillRect(px, py, 3, 2);
  }
}

function drawTree(ctx: CanvasRenderingContext2D, gx: number, gy: number, tile: number, variant: number) {
  const s = tile * 1.34;
  const x = gx + (tile - s) / 2;
  const y = gy + tile - s;
  ctx.fillStyle = "#2b1d12";
  ctx.fillRect(x + s * 0.44, y + s * 0.62, s * 0.13, s * 0.36);
  const canopy = ["#1d3a26", "#22452c", "#1a3622"][variant] ?? "#1d3a26";
  ctx.fillStyle = canopy;
  for (const [ox, oy, r] of [
    [0.3, 0.44, 0.25],
    [0.68, 0.42, 0.23],
    [0.5, 0.26, 0.26],
  ]) {
    ctx.beginPath();
    ctx.arc(x + s * ox, y + s * oy, s * r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#2f5a3a";
  ctx.beginPath();
  ctx.arc(x + s * 0.44, y + s * 0.22, s * 0.12, 0, Math.PI * 2);
  ctx.fill();
}

/** The forest edge: unbroken undergrowth, so the clearing has a wall of it. */
function drawThicket(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  tile: number,
  x: number,
  y: number,
) {
  ctx.fillStyle = "#08120d";
  ctx.fillRect(gx, gy, tile, tile);
  ctx.fillStyle = "#122619";
  for (let i = 0; i < 2; i++) {
    const px = gx + ((x * 9 + i * 13 + y * 5) % Math.max(1, tile - 6)) + 3;
    const py = gy + ((y * 7 + i * 11 + x * 3) % Math.max(1, tile - 6)) + 3;
    ctx.beginPath();
    ctx.arc(px, py, tile * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawProp(ctx: CanvasRenderingContext2D, prop: Prop, tile: number, variant: number) {
  const art = image(`/game/prop-${prop.kind}.png`);
  const tall = prop.kind === "pillar" || prop.kind === "stump";
  const s = tile * (prop.kind === "bush" ? 0.6 : tall ? 0.78 : 0.62);
  const dx = prop.x * tile + (tile - s) / 2;
  const dy = prop.y * tile + tile - s - (tall ? 1 : 2);
  if (art) {
    ctx.drawImage(art, dx, dy, s, s);
    return;
  }
  if (prop.kind === "bush") {
    ctx.fillStyle = "#264a30";
    ctx.beginPath();
    ctx.arc(dx + s / 2, dy + s * 0.62, s * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#31603c";
    ctx.fillRect(dx + s * 0.3, dy + s * 0.2, s * 0.24, s * 0.3);
    return;
  }
  if (prop.kind === "rock") {
    ctx.fillStyle = ["#3a4256", "#454d63", "#333a4c"][variant] ?? "#3a4256";
    ctx.beginPath();
    ctx.moveTo(dx, dy + s);
    ctx.lineTo(dx + s * 0.28, dy + s * 0.2);
    ctx.lineTo(dx + s * 0.74, dy + s * 0.1);
    ctx.lineTo(dx + s, dy + s);
    ctx.closePath();
    ctx.fill();
    return;
  }
  // pillar and stump both read as a worked vertical block
  ctx.fillStyle = prop.kind === "pillar" ? "#2b3450" : "#4a3524";
  ctx.fillRect(dx + s * 0.14, dy + s * 0.1, s * 0.72, s * 0.9);
  ctx.fillStyle = prop.kind === "pillar" ? "#3d4a6e" : "#5f4630";
  ctx.fillRect(dx, dy, s, s * 0.18);
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
  const img = image(`/game/${actor.sprite}.png`);
  // Sprites keep their own proportions: fit inside a box and drop the feet on the tile line.
  const boxW = tile * (boss ? 1.75 : 1.5);
  const boxH = tile * (boss ? 1.8 : 1.34);
  const fit = img
    ? Math.min(boxW / img.naturalWidth, boxH / img.naturalHeight)
    : 1;
  const dw = img ? img.naturalWidth * fit : tile * 0.72;
  const dh = img ? img.naturalHeight * fit : tile * 0.9;
  const dx = actor.x * tile + (tile - dw) / 2 + ox;
  const dy = actor.y * tile + tile - dh + 3 + oy + bob;
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
