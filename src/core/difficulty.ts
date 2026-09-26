/**
 * 难度评估
 * ============================================================================
 * 依据（对应需求里的难度表）：难度 **不是** 只看棋盘大小，而是看求解器解出该题
 * 所需的「最高级技巧层级 + 回溯次数」。具体做法是让同一个求解器“像人一样”解题：
 *
 *   1. 先用行列约束传播（0 次猜测）能解出 ⇒ 逻辑上不需要任何试错；
 *   2. 传播卡住后按固定启发式做假设分支，统计
 *        guesses        —— 需要的假设次数（= 回溯次数）
 *        solutionDepth  —— 假设链深度（深层假设 ⇒ 更难）
 *        failedGuesses  —— 走进死路的次数（试错成本）
 *        longCrossings  —— “长线索交叉”的格子数（长块横竖相交的地方最容易看错）
 *
 * 分级规则（与需求表一一对应）：
 *   简单：纯传播即可解出，且棋盘 <= 10x10
 *   中等：纯传播但棋盘 > 10，或回溯 <= 2 次（需要多轮交叉传播）
 *   困难：回溯 3~10 次，或长线索交叉明显（>=16 的盘面）
 *   专家：回溯 > 10 次，或假设链深度 >= 4（深层假设链）
 * 此外应用“尺寸下限”：>=11 的盘面即使纯传播也至少算中等（表中 10x10~15x15 为中等）。
 *
 * 注意：metrics 由**固定启发式 + 固定假设顺序**得到，因此对同一个谜题完全可复现。
 */

import type { Difficulty, DifficultyAssessment, DifficultyMetrics, Puzzle } from './types'
import { clueCount, clueMax } from './clues'
import { createBoard, createLimits, createSolverContext, countSolutions, resetStats, solveFirst } from './solver'

const clock = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()

export interface AnalyzeOptions {
  /** 搜索节点上限（同时用于“求一个解”和“唯一性校验”两阶段） */
  nodeLimit?: number
  /** 分析总时间上限（毫秒） */
  timeLimitMs?: number
  /** 是否做唯一性校验（速度优先时可关闭，但生成器必须开启） */
  checkUniqueness?: boolean
  /** 调用方已经通过其他方式证明唯一解（例如生成器的“修形”流程），跳过一次重复搜索 */
  assumeUnique?: boolean
}

export interface AnalyzeResult {
  /** true=唯一解 / false=多解 / 'unknown'=预算耗尽无法判定 */
  unique: boolean | 'unknown'
  solution: Uint8Array | null
  metrics: DifficultyMetrics
  difficulty: Difficulty
  score: number
}

function staticMetrics(puzzle: Puzzle) {
  const { width, height, solution } = puzzle
  let filled = 0
  for (let i = 0; i < solution.length; i++) if (solution[i]) filled++

  let maxClue = 0
  for (const line of puzzle.rowClues) maxClue = Math.max(maxClue, clueMax(line))
  for (const line of puzzle.colClues) maxClue = Math.max(maxClue, clueMax(line))

  const rowMax = puzzle.rowClues.map(clueMax)
  const colMax = puzzle.colClues.map(clueMax)
  let longCrossings = 0
  for (let y = 0; y < height; y++) {
    if (rowMax[y] * 2 < width) continue
    for (let x = 0; x < width; x++) {
      if (colMax[x] * 2 >= height) longCrossings++
    }
  }

  return {
    fillRatio: filled / (width * height),
    maxClue,
    clueCount: clueCount(puzzle.rowClues) + clueCount(puzzle.colClues),
    longCrossings,
  }
}

/**
 * 分析一个谜题：求解 + 唯一性校验 + 难度指标。
 * 这是生成器与编辑器的核心依赖。
 */
export function analyzePuzzle(puzzle: Puzzle, opts: AnalyzeOptions = {}): AnalyzeResult {
  const t0 = clock()
  const nodeLimit = opts.nodeLimit ?? 40_000
  const timeLimitMs = opts.timeLimitMs ?? 500
  const deadline = t0 + timeLimitMs

  const ctx = createSolverContext(puzzle)
  const board = createBoard(puzzle.width * puzzle.height)
  resetStats(ctx)
  const limitsA = createLimits({ nodeLimit: Math.max(2_000, Math.floor(nodeLimit / 4)), timeLimitMs })
  const { solution, stats } = solveFirst(ctx, board, limitsA)

  let unique: boolean | 'unknown' = 'unknown'
  let truncated = stats.truncated

  if (solution) {
    if (stats.guesses === 0) {
      // 纯行列传播就确定了每一个格子 => 数学上唯一解（见 solver.ts 顶部说明）
      unique = true
    } else if (opts.assumeUnique) {
      unique = true
    } else if (opts.checkUniqueness === false) {
      unique = 'unknown'
    } else {
      const remaining = Math.max(1, deadline - clock())
      const ctx2 = createSolverContext(puzzle)
      const board2 = createBoard(puzzle.width * puzzle.height)
      const limitsB = createLimits({ nodeLimit, timeLimitMs: remaining })
      const counted = countSolutions(ctx2, board2, 2, limitsB)
      if (counted.truncated) {
        unique = 'unknown'
        truncated = true
      } else {
        unique = counted.count === 1
      }
    }
  } else {
    unique = 'unknown'
  }

  const base = staticMetrics(puzzle)
  const metrics: DifficultyMetrics = {
    guesses: stats.guesses,
    failedGuesses: stats.failedGuesses,
    solutionDepth: stats.solutionDepth,
    propagationRounds: stats.rounds,
    deducedCells: stats.deduced,
    nodes: stats.nodes,
    fillRatio: base.fillRatio,
    maxClue: base.maxClue,
    clueCount: base.clueCount,
    longCrossings: base.longCrossings,
    timeMs: clock() - t0,
    truncated,
  }

  const difficulty = classifyDifficulty(metrics, puzzle.width, puzzle.height)
  return { unique, solution, metrics, difficulty, score: difficultyScore(metrics, puzzle.width, puzzle.height) }
}

const TIER_ORDER: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2, expert: 3 }

export function tierRank(difficulty: Difficulty): number {
  return TIER_ORDER[difficulty]
}

/**
 * 尺寸下限：即使纯行列传播就能解出，盘面越大、需要连续交叉传播的量也越大，
 * 因此按需求表的尺寸列给出难度下限（尺寸只能抬高难度，不能降低难度）。
 */
export function sizeFloorFor(width: number, height: number): Difficulty {
  const maxDim = Math.max(width, height)
  return maxDim <= 10 ? 'easy' : maxDim <= 15 ? 'medium' : maxDim <= 19 ? 'hard' : 'expert'
}

/**
 * 在这个尺寸上是否**有可能**被判成目标难度。
 * 因为尺寸只能抬高难度，请求低于尺寸下限的难度（例如 20x20 想判成「简单」）
 * 一定不可能达成，生成器可以据此提前放弃，不必跑满候选次数。
 */
export function isDifficultyReachable(difficulty: Difficulty, width: number, height: number): boolean {
  return tierRank(difficulty) >= tierRank(sizeFloorFor(width, height))
}

function higher(a: Difficulty, b: Difficulty): Difficulty {
  return TIER_ORDER[a] >= TIER_ORDER[b] ? a : b
}

/** 规则分级（见文件顶部说明） */
export function classifyDifficulty(m: DifficultyMetrics, width: number, height: number): Difficulty {
  const maxDim = Math.max(width, height)
  // 1) 由“推理成本”得出的档位
  let tier: Difficulty
  if (m.guesses === 0) tier = 'easy'
  else if (m.guesses <= 2) tier = 'medium'
  else if (m.guesses <= 10) tier = 'hard'
  else tier = 'expert'

  // 深层假设链 => 至少困难/专家
  if (m.solutionDepth >= 4) tier = higher(tier, 'expert')
  else if (m.solutionDepth >= 3) tier = higher(tier, 'hard')

  // 2) 尺寸地板（见 sizeFloorFor）
  tier = higher(tier, sizeFloorFor(width, height))

  // 3) 长线索交叉：横竖都超过一半盘面的长块相交，人工极易看漏 => 至少困难
  if (m.longCrossings >= 4 && maxDim >= 16) tier = higher(tier, 'hard')

  return tier
}

/**
 * 连续难度分（0~100）。分级本身由规则决定，这个分数只用于展示/排序，
 * 让玩家看到“同一档里哪个更难”。
 */
export function difficultyScore(m: DifficultyMetrics, width: number, height: number): number {
  const maxDim = Math.max(width, height)
  const sizeFactor = Math.min(1, Math.max(0, (maxDim - 5) / 20))
  const score =
    45 * Math.min(1, m.guesses / 20) +
    20 * Math.min(1, m.solutionDepth / 4) +
    10 * Math.min(1, m.propagationRounds / 80) +
    15 * Math.min(1, m.longCrossings / 8) +
    10 * Math.min(1, m.failedGuesses / 10) +
    10 * sizeFactor
  return Math.round(Math.min(100, score))
}

export function assessPuzzle(puzzle: Puzzle, opts: AnalyzeOptions = {}): DifficultyAssessment {
  const res = analyzePuzzle(puzzle, opts)
  return { difficulty: res.difficulty, score: res.score, metrics: res.metrics, unique: res.unique }
}
