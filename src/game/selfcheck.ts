import { applyAction, applyEnemy, attackTargets, createRun, moveOptions, skillAims } from "./combat";
import { DIRS, cellKey, cheb, idx, inb, isWalkable, type Run } from "./types";

function enemyPhase(run: Run) {
  const order = [...run.enemies].sort((a, b) => cheb(a.x, a.y, run.player.x, run.player.y) - cheb(b.x, b.y, run.player.x, run.player.y));
  let cur = run;
  for (const enemy of order) {
    if (cur.player.hp <= 0) break;
    if (!cur.enemies.some((e) => e.id === enemy.id)) continue;
    cur = applyEnemy(cur, enemy.id).run;
  }
  return cur;
}

/** Walkable cells reachable from the hero; every map must leave nothing sealed. */
function openFrom(run: Run) {
  const seen = new Set([cellKey(run.player.x, run.player.y)]);
  const queue = [{ x: run.player.x, y: run.player.y }];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const [dx, dy] of DIRS) {
      const x = cur.x + dx;
      const y = cur.y + dy;
      if (!inb(run, x, y)) continue;
      const k = cellKey(x, y);
      if (seen.has(k) || !isWalkable(run.tiles[idx(run, x, y)])) continue;
      seen.add(k);
      queue.push({ x, y });
    }
  }
  return seen;
}

function errors() {
  const problems: string[] = [];

  for (const seed of [1, 2, 3, 7, 11]) {
    const run = createRun({ classId: "guerrero", sex: "m", floor: 0, seed });
    if (run.zone !== "bosque") problems.push(`not a forest ${seed}`);
    if (run.enemies.length) problems.push(`the forest fights back ${seed}`);
    if (!isWalkable(run.tiles[idx(run, run.player.x, run.player.y)])) problems.push(`forest start ${seed}`);
    if (run.groundItems.length < 8) problems.push(`forest too bare ${seed}: ${run.groundItems.length}`);
    const exotic = run.groundItems.filter((i) => !["rama", "piedra", "hierba"].includes(i.component));
    if (exotic.length) problems.push(`forest grows ${exotic[0].component} ${seed}`);
    const open = openFrom(run);
    if (!open.has(cellKey(run.stairs.x, run.stairs.y))) problems.push(`door sealed ${seed}`);
    if (run.props.some((p) => p.blocks && !open.has(cellKey(p.x, p.y)))) problems.push(`ghost rock ${seed}`);
  }

  for (const seed of [1, 2, 3, 7, 11]) {
    for (let floor = 1; floor <= 10; floor++) {
      const run = createRun({ classId: "guerrero", sex: "m", floor, seed });
      if (run.zone !== "torre") problems.push(`forest inside the tower ${seed}:${floor}`);
      if (!isWalkable(run.tiles[idx(run, run.player.x, run.player.y)])) problems.push(`start wall ${seed}:${floor}`);
      if (run.w < 12 || run.h < 12) problems.push(`floor ${floor} is a closet ${seed}: ${run.w}x${run.h}`);
      if (run.enemies.length === 0) problems.push(`no enemies ${seed}:${floor}`);
      const spots = new Set(run.enemies.map((e) => `${e.x},${e.y}`));
      if (spots.size !== run.enemies.length) problems.push(`overlap ${seed}:${floor}`);
      if (run.enemies.some((e) => e.x === run.player.x && e.y === run.player.y)) problems.push(`spawn on player ${seed}:${floor}`);
      const open = openFrom(run);
      if (!open.has(cellKey(run.stairs.x, run.stairs.y))) problems.push(`stairs sealed ${seed}:${floor}`);
      for (const enemy of run.enemies)
        if (!open.has(cellKey(enemy.x, enemy.y))) problems.push(`unreachable foe ${seed}:${floor}`);
      for (const chest of run.chests)
        if (!open.has(cellKey(chest.x, chest.y))) problems.push(`unreachable chest ${seed}:${floor}`);
      // A sealed pocket is fine as long as nothing worth reaching sits inside it.
      const loose = run.groundItems.filter((i) => !open.has(cellKey(i.x, i.y)));
      if (loose.length) problems.push(`loot behind stone ${seed}:${floor}`);
    }
  }

  let wins = 0;
  for (const seed of [1, 2, 3, 4, 5, 8, 13, 21]) {
    let run = createRun({ classId: "guerrero", sex: "m", floor: 1, seed });
    for (let turn = 0; turn < 140 && run.player.hp > 0 && run.enemies.length; turn++) {
      const targets = attackTargets(run);
      if (run.player.hp < run.player.maxHp * 0.35 && (run.items.potion ?? 0) > 0) {
        const used = applyAction(run, { type: "item", item: "potion" });
        if (used.ok) run = used.run;
      } else if (targets.length) {
        const hit = applyAction(run, { type: "attack", id: targets[0].id });
        if (!hit.ok) break;
        run = hit.run;
      } else {
        const foe = run.enemies.slice().sort((a, b) => cheb(a.x, a.y, run.player.x, run.player.y) - cheb(b.x, b.y, run.player.x, run.player.y))[0];
        const step = moveOptions(run).sort((a, b) => cheb(a.x, a.y, foe.x, foe.y) - cheb(b.x, b.y, foe.x, foe.y))[0];
        if (!step) {
          const wait = applyAction(run, { type: "wait" });
          if (wait.ok) run = wait.run;
        } else {
          const moved = applyAction(run, { type: "move", x: step.x, y: step.y });
          if (!moved.ok) break;
          run = moved.run;
        }
      }
      run = enemyPhase(run);
    }
    if (run.player.hp > 0 && run.enemies.length === 0) wins += 1;
    else problems.push(`floor1 loss seed ${seed} hp ${run.player.hp} left ${run.enemies.length}`);
  }
  const mage = createRun({ classId: "maga", sex: "f", floor: 6, seed: 3 });
  if (!skillAims(mage)) problems.push("skill aims missing");
  if (wins < 6) problems.push(`only ${wins}/8 warrior clears`);
  return problems;
}

const found = errors();
if (found.length) {
  console.error(found.join("\n"));
  process.exit(1);
}
console.log("selfcheck ok");
