export interface SeededRandom {
  next(): number;
  between(min: number, max: number): number;
  integer(min: number, max: number): number;
  pick<T>(values: readonly T[]): T;
}

function hashSeed(value: string) {
  let hash = 1779033703 ^ value.length;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 3432918353);
    hash = hash << 13 | hash >>> 19;
  }
  return () => {
    hash = Math.imul(hash ^ hash >>> 16, 2246822507);
    hash = Math.imul(hash ^ hash >>> 13, 3266489909);
    return (hash ^= hash >>> 16) >>> 0;
  };
}

export function deriveAudioSeed(seed: string, variationId: string, revision = 0) {
  return `${seed}:${variationId}:r${revision}`;
}

export function createSeededRandom(seed: string): SeededRandom {
  const seedHash = hashSeed(seed || "umbra-audio-shuffle")();
  let state = seedHash;
  const next = () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
  return {
    next,
    between: (min, max) => min + next() * (max - min),
    integer: (min, max) => Math.floor(min + next() * (max - min + 1)),
    pick: <T>(values: readonly T[]) => {
      if (!values.length) throw new Error("Não é possível sortear uma lista vazia.");
      return values[Math.floor(next() * values.length)];
    },
  };
}
