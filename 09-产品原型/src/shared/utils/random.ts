/** 固定种子的伪随机数，保证每次生成的演示数据一样 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Rng {
  next(): number
  int(min: number, max: number): number
  pick<T>(items: readonly T[]): T
  chance(p: number): boolean
  weighted<T>(items: readonly (readonly [T, number])[]): T
  shuffle<T>(items: readonly T[]): T[]
  digits(len: number): string
}

export function createRng(seed: number): Rng {
  const next = mulberry32(seed)
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1))
  return {
    next,
    int,
    pick: (items) => items[Math.floor(next() * items.length)],
    chance: (p) => next() < p,
    weighted(items) {
      const total = items.reduce((s, [, w]) => s + w, 0)
      let r = next() * total
      for (const [v, w] of items) {
        r -= w
        if (r < 0) return v
      }
      return items[items.length - 1][0]
    },
    shuffle(items) {
      const arr = [...items]
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
      }
      return arr
    },
    digits: (len) => Array.from({ length: len }, () => int(0, 9)).join(''),
  }
}

let counter = 0

/** 内部标识，不是业务单号。不用 crypto.randomUUID，局域网 http 打开时不可用 */
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1679616
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36).padStart(4, '0')}${Math.random().toString(36).slice(2, 6)}`
}
