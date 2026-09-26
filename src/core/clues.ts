/**
 * 线索计算：把图案（0/1 网格）转换成数织行/列线索。
 *
 * 约定：空行的线索写成 [0]（而不是 []），这样渲染与比较都更简单，
 * 同时 `computeLineClues` 的输出与各类测试的期望值保持一致。
 */

import type { Puzzle, Difficulty } from './types'

/** 计算**单行/单列**的线索（输入顺序即从左到右 / 从上到下） */
export function computeLineClues(line: ArrayLike<number>): number[] {
  const clues: number[] = []
  let run = 0
  for (let i = 0; i < line.length; i++) {
    if (line[i]) {
      run++
    } else if (run > 0) {
      clues.push(run)
      run = 0
    }
  }
  if (run > 0) clues.push(run)
  return clues.length > 0 ? clues : [0]
}

/** 一次性算出整盘的行线索与列线索（行优先存储） */
export function computeClues(
  solution: Uint8Array | number[],
  width: number,
  height: number,
): { rowClues: number[][]; colClues: number[][] } {
  const rowClues: number[][] = new Array(height)
  const colClues: number[][] = new Array(width)

  const rowBuf = new Uint8Array(width)
  for (let y = 0; y < height; y++) {
    const offset = y * width
    for (let x = 0; x < width; x++) rowBuf[x] = solution[offset + x] ? 1 : 0
    rowClues[y] = computeLineClues(rowBuf)
  }

  const colBuf = new Uint8Array(height)
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) colBuf[y] = solution[y * width + x] ? 1 : 0
    colClues[x] = computeLineClues(colBuf)
  }

  return { rowClues, colClues }
}

/** 线索总和 = 该行/列需要填的格子数 */
export function clueSum(clues: readonly number[]): number {
  let sum = 0
  for (const c of clues) sum += c
  return sum
}

/** 单条线索里最长的块长（空行视为 0） */
export function clueMax(clues: readonly number[]): number {
  let max = 0
  for (const c of clues) if (c > max) max = c
  return max
}

export function clueCount(clues: readonly number[][]): number {
  let n = 0
  for (const line of clues) {
    if (line.length === 1 && line[0] === 0) continue
    n += line.length
  }
  return n
}

export function cluesEqual(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/** 人类可读的线索文本（调试/测试用） */
export function formatClue(clues: readonly number[]): string {
  return clues.length === 0 || (clues.length === 1 && clues[0] === 0) ? '0' : clues.join(' ')
}

export function createPuzzle(params: {
  solution: Uint8Array
  width: number
  height: number
  difficulty: Difficulty
  seed: string
  title?: string
  id?: string
}): Puzzle {
  const { solution, width, height, difficulty, seed, title } = params
  const { rowClues, colClues } = computeClues(solution, width, height)
  return {
    id: params.id ?? `${difficulty}-${width}x${height}-${seed}`,
    width,
    height,
    solution,
    rowClues,
    colClues,
    difficulty,
    seed,
    title,
  }
}
