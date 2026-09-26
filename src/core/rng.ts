/**
 * 可复现伪随机数生成器。
 *
 * 使用 mulberry32：32 位状态、周期 2^32、分布质量足够好、实现只有几行，
 * 同一个种子串永远产出同一串随机数 —— 这是「同 seed 生成结果一致」的基础。
 */

/** 字符串 → 32 位整数种子（xmur3 哈希） */
export function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^= h >>> 16) >>> 0
}

export type Rng = () => number

/** mulberry32：返回 [0,1) 均匀分布 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createRng(seed: string): Rng {
  return mulberry32(hashSeed(seed))
}

/** [min, max] 整数 */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

/** [min, max) 浮点 */
export function randFloat(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min)
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length) % items.length]
}

export function chance(rng: Rng, probability: number): boolean {
  return rng() < probability
}

export function shuffle<T>(rng: Rng, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

/** 生成一个对人类友好的随机种子串（也用于谜题 id） */
export function randomSeed(rng: Rng = mulberry32((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0)): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < 10; i++) out += alphabet[Math.floor(rng() * alphabet.length) % alphabet.length]
  return out
}
