export function next(seed: number): [number, number] {
  let a = seed >>> 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const v = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [v, a >>> 0];
}
