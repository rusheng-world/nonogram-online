/**
 * 「谜题 id <-> 谜题」的重放逻辑。
 *
 * 谜题 id 形如 `hard-17x19-ab12cd34`：难度 + 尺寸 + 种子。
 * 其中种子是**基准种子**（不含生成器内部的候选序号），因此
 * `regenerateFromId(generatePuzzle(...).puzzle.id)` 一定得到同一道题 ——
 * 这是「刷新页面继续玩」和「分享链接」能成立的前提。
 *
 * 这个文件刻意不依赖任何 store，方便单元测试直接验证可复现性。
 */

import { GENERATION_TIME_BUDGET_MS, generatePuzzle } from './generator'
import { MAX_EDITOR_SIZE, MIN_EDITOR_SIZE, isDifficulty } from './types'
import type { Difficulty, Puzzle } from './types'

export interface PuzzleIdParts {
  difficulty: Difficulty
  width: number
  height: number
  seed: string
}

/** 生成谜题 id（与 generator 内部保持一致的格式） */
export function puzzleIdFor(difficulty: Difficulty, width: number, height: number, seed: string): string {
  return `${difficulty}-${width}x${height}-${seed}`
}

export function parsePuzzleId(id: string): PuzzleIdParts | null {
  const first = id.indexOf('-')
  const second = id.indexOf('-', first + 1)
  if (first < 0 || second < 0) return null
  const difficulty = id.slice(0, first)
  const size = id.slice(first + 1, second)
  const seed = id.slice(second + 1)
  if (!isDifficulty(difficulty) || seed.length === 0) return null
  const match = /^(\d{1,2})x(\d{1,2})$/.exec(size)
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  if (width < MIN_EDITOR_SIZE || width > MAX_EDITOR_SIZE) return null
  if (height < MIN_EDITOR_SIZE || height > MAX_EDITOR_SIZE) return null
  return { difficulty, width, height, seed }
}

/** 按 id 重新生成同一个谜题（seed 固定 + 候选顺序固定 => 结果一致） */
export function regenerateFromId(id: string): Puzzle | null {
  const parsed = parsePuzzleId(id)
  if (!parsed) return null
  const result = generatePuzzle({
    width: parsed.width,
    height: parsed.height,
    difficulty: parsed.difficulty,
    seed: parsed.seed,
    // 时间预算与候选次数都走 generator 的默认值（只由难度决定），
    // 这样「新开一局」与「按 id 重放」用的是同一套参数，结果才是同一道题。
    timeBudgetMs: GENERATION_TIME_BUDGET_MS,
    allowDowngrade: false,
    allowResize: false,
  })
  return result.puzzle
}
