/**
 * 「难度 + 种子」-> 一局可复现的新游戏。
 *
 * 为什么要单独包一层：
 *   对局是通过 URL 里的谜题 id（`hard-15x15-ab12cd34`）标识的，刷新页面或把链接
 *   发给别人时，GamePage 会用 `regenerateFromId()` **重新生成**同一个谜题。
 *   因此这里生成时必须使用与 `regenerateFromId` 完全一致的参数（时间预算 /
 *   尝试次数 / 降级开关），并且生成后再验证一次「按 id 重新生成 == 同一道题」，
 *   保证「当前这局」与「刷新后那局」永远是同一道题。
 */

import { GENERATION_TIME_BUDGET_MS, boardSizeFor, generatePuzzle, type GenerateResult } from '../core/generator'
import type { Difficulty, Puzzle } from '../core/types'
import { regenerateFromId } from './bootstrap'

/**
 * 生成预算必须与 bootstrap.regenerateFromId 保持一致（两边都直接用 generator 的
 * GENERATION_TIME_BUDGET_MS / defaultMaxAttempts(难度)），否则同一道题可能在刷新后变形。
 */
const TIME_BUDGET_MS = GENERATION_TIME_BUDGET_MS

export interface NewGameOutcome {
  puzzle: Puzzle
  /** 求解器实际判定的难度（可能与请求的档位不同） */
  difficulty: Difficulty
  /** 是否命中请求的难度档位 */
  matched: boolean
  attempts: number
  elapsedMs: number
  score: number
  notice?: string
}

function sameSolution(a: Puzzle, b: Puzzle | null): boolean {
  if (!b) return false
  if (a.width !== b.width || a.height !== b.height || a.solution.length !== b.solution.length) return false
  for (let i = 0; i < a.solution.length; i++) if (a.solution[i] !== b.solution[i]) return false
  return true
}

function toOutcome(result: GenerateResult, extraNotice?: string): NewGameOutcome {
  return {
    puzzle: result.puzzle,
    difficulty: result.difficulty,
    matched: result.matched,
    attempts: result.attempts,
    elapsedMs: result.elapsedMs,
    score: result.score,
    notice: extraNotice ?? result.notice,
  }
}

/**
 * 生成一道新题。
 *
 * 两轮策略：
 *   1. 允许降级（缩尺寸 / 降档）—— 对应「生成超过预算就降级」的要求；
 *   2. 严格按目标档位 —— 第 1 轮若走了降级分支，这一轮给出同尺寸下最接近目标的题。
 * 两轮都必须通过「可复现性验证」才会被采用。
 */
export function createNewGame(difficulty: Difficulty, seed: string): NewGameOutcome {
  // 尺寸由难度决定：固定为 5 的倍数正方形（5×5 / 10×10 / 15×15 / 20×20）
  const { width, height } = boardSizeFor(difficulty)
  const base = { width, height, difficulty, seed, timeBudgetMs: TIME_BUDGET_MS }

  let last: GenerateResult | null = null
  for (const flexible of [true, false]) {
    const result = generatePuzzle({ ...base, allowDowngrade: flexible, allowResize: flexible })
    last = result
    if (sameSolution(result.puzzle, regenerateFromId(result.puzzle.id))) {
      return toOutcome(result, flexible ? undefined : '未能完全达到目标难度，已回退到最接近的题目（仍保证唯一解）')
    }
  }

  // 理论上不可达：同一参数的两次生成结果不一致属于环境异常，如实告知玩家
  return toOutcome(last as GenerateResult, '生成过程不稳定，建议重开一局')
}
