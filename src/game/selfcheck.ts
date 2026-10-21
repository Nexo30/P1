import { applyAction, applyEnemy, attackTargets, createRun, moveOptions, skillAims } from "./combat";
import { cheb, type Run } from "./types";

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

function errors() {
  const problems: string[] = [];
  for (const seed of [1, 2, 3, 7, 11]) {
    for (let floor = 1; floor <= 10; floor++) {
      const run = createRun({ classId: "guerrero", sex: "m", floor, seed });
      if (run.tiles[run.player.y * 9 + run.player.x] !== "floor") problems.push(`start wall ${seed}:${floor}`);
      if (run.enemies.length === 0) problems.push(`no enemies ${seed}:${floor}`);
      const spots = new Set(run.enemies.map((e) => `${e.x},${e.y}`));
      if (spots.size !== run.enemies.length) problems.push(`overlap ${seed}:${floor}`);
      if (run.enemies.some((e) => e.x === run.player.x && e.y === run.player.y)) problems.push(`spawn on player ${seed}:${floor}`);
    }
  }
  let wins = 0;
  for (const seed of [1, 2, 3, 4, 5, 8, 13, 21]) {
    let run = createRun({ classId: "guerrero", sex: "m", floor: 1, seed });
    for (let turn = 0; turn < 40 && run.player.hp > 0 && run.enemies.length; turn++) {
      const targets = attackTargets(run);
      if (run.player.hp < run.player.maxHp * 0.35 && run.potions > 0) {
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
