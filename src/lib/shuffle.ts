function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

/** Deterministic order derived from the ids, so every emit shows all
 *  students the same shuffled order. */
export function seededShuffle<T extends { id: string }>(items: T[], seed: string): T[] {
  return [...items].sort((a, b) => hashSeed(`${seed}:${a.id}`) - hashSeed(`${seed}:${b.id}`));
}
