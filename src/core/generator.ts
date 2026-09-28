/**
 * 谜题生成器
 * ============================================================================
 * 流程：
 *   1. 用可复现 PRNG（mulberry32，种子 = seed + 尝试次数）生成"像图案"的初始图案：
 *      「随机团块生长 + 对称镜像 + 少量噪声」混合，再跑几轮细胞自动机平滑，
 *      避免纯噪声带来的碎片化线索（那种题目又丑又难，且几乎必然多解）。
 *   2. 计算行/列线索。
 *   3. 用求解器验证：必须**唯一解**（多解题目体验极差，直接丢弃重来）。
 *   4. 用难度评估器打分，落在目标难度区间才采用。
 *   5. 不满足就换种子重试；有最大尝试次数与总时间预算（默认 < 1 秒）。
 *      超时 => 降级（缩小尺寸 / 降低难度）并给出提示标记。
 */

import { DIFFICULTY_META, isDifficulty } from './types'
import type { Difficulty, Puzzle } from './types'
import type { PuzzleQualityMetrics } from './types'
import { computeClues } from './clues'
import { analyzePuzzle, isDifficultyReachable } from './difficulty'
import type { AnalyzeResult } from './difficulty'
import { createBoard, createLimits, createSolverContext, countSolutions } from './solver'
import { chance, createRng, pick, randFloat, randInt, type Rng } from './rng'

const clock = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()

type Symmetry = 'none' | 'vertical' | 'horizontal' | 'quad'

export interface GenerateOptions {
  width: number
  height: number
  difficulty: Difficulty
  seed: string
  /**
   * 总时间预算（毫秒），默认按面积自适应。
   *
   * 传 `UNLIMITED_TIME_BUDGET_MS` 可以关掉墙钟，让候选搜索只受 `maxAttempts` 约束 ——
   * 此时「同一 seed 生成同一道题」是**数学上确定**的，与机器快慢、是否被插桩无关。
   */
  timeBudgetMs?: number
  /** 最大尝试次数 */
  maxAttempts?: number
  /** 允许在预算内未达标时自动降级（缩小尺寸/降低难度） */
  allowDowngrade?: boolean
  /** 允许生成器自行调整尺寸（只有调用方自己挑尺寸时才应传 true） */
  allowResize?: boolean
}

export interface GenerateResult {
  puzzle: Puzzle
  /** 是否达到了目标难度 */
  matched: boolean
  /** 实际尝试的种子数 */
  attempts: number
  elapsedMs: number
  /** 唯一性结论（true / false / 'unknown'） */
  unique: boolean | 'unknown'
  difficulty: Difficulty
  score: number
  metrics: AnalyzeResult['metrics']
  /** 是否触发了降级，以及原因 */
  downgrade: null | 'timeout' | 'attempts' | 'fallback'
  /** 降级说明，供界面提示 */
  notice?: string
}

/**
 * 应用层（新开一局 / 按 id 重放）统一使用的生成时间预算。
 * 「新开一局」和「按 id 重放」必须共享同一个常量，否则同一道题可能在刷新后变成另一道。
 */
export const GENERATION_TIME_BUDGET_MS = 4000

/**
 * 「不限时」预算：候选搜索只受 `maxAttempts` 约束，墙钟完全不参与决策。
 *
 * 存在的意义：
 *   1. 测试要断言「生成质量」（唯一解 / 难度达标）时，必须把机器快慢排除在外。
 *      否则同一份代码在覆盖率插桩、CI 抢占 CPU 或慢机器上会给出不同结论 ——
 *      这正是「质量断言被墙钟污染」这类 flaky 测试的根源。
 *   2. 需要跨设备复现同一道题时（每日挑战 / 按 id 重放），只要预算充足，
 *      「候选顺序 + 候选次数上限」就足以唯一确定结果。
 *
 * 生产路径（新开一局 / 重放）仍然用有限预算，保证慢设备上不会长时间卡住主线程；
 * 这也是 `createNewGame` 生成后会再验证一次「重放 == 同一道题」的原因。
 */
export const UNLIMITED_TIME_BUDGET_MS = Number.POSITIVE_INFINITY

/**
 * 各档的候选次数上限（同一个种子下候选序列是确定的，所以这个数字也必须由两边共享）。
 *
 * 「困难」需要的图案最稀有：15×15 的尺寸地板只是“中等”，
 * 必须**恰好**落在「3~10 次回溯」这个窗口里才会被判成困难。
 * 实测单个候选的命中率只有百分之几，因此困难档给更大的候选预算
 * （40 个种子实测最多用到 560 次候选，取 1200 留出余量）。
 */
export function defaultMaxAttempts(difficulty: Difficulty): number {
  if (difficulty === 'hard') return 1200
  if (difficulty === 'medium') return 600
  return 200
}

/**
 * 默认时间预算（毫秒），随面积自适应；困难档额外放宽，
 * 免得候选次数还没跑完就被截止时间打断（被打断会让降级概率变高）。
 */
export function defaultTimeBudget(width: number, height: number, difficulty: Difficulty = 'easy'): number {
  const base = Math.min(900, Math.max(320, Math.round(width * height * 1.6)))
  return difficulty === 'hard' ? Math.max(base, 1500) : base
}

/**
 * 各难度自动生成时使用的盘面尺寸（**正方形、边长为 5 的倍数**）。
 *
 * 需求：自动生成的盘面只能是 5×5 / 10×10 / 15×15 / 20×20 这类「5 的倍数正方形」，
 * 不允许出现 11×11、12×13、15×10 这种盘面，因此每档**固定一个尺寸**（不再随机取边长）。
 *
 * 尺寸与难度判定的“尺寸地板”（<=10 简单 / 11~15 中等 / 16~19 困难 / >=20 专家）正好错开一档：
 *   5×5   地板=简单 => 只要纯传播可解就达标（0 次回溯，命中率 ~100%）
 *   10×10 地板=简单 => 必须恰好出现 1~2 次回溯才会被判成中等
 *   15×15 地板=中等 => 必须恰好出现 3~10 次回溯才会被判成困难（最稀有，见下方 defaultMaxAttempts 的说明）
 *   20×20 地板=专家 => 无论推理成本如何都会被判成专家（所以专家档反而最容易生成）
 */
export function boardSizeFor(difficulty: Difficulty): { width: number; height: number } {
  const size = boardSideFor(difficulty)
  return { width: size, height: size }
}

/** 该档盘面的边长（= 5 的倍数） */
export function boardSideFor(difficulty: Difficulty): number {
  return DIFFICULTY_META[difficulty].boardSize
}

/**
 * 各档允许残留的「退化线」（全空 / 全满的行列）数量上限。
 *
 * 需求是「尽量避免，尤其是高难度」：
 *   · 简单 / 中等：盘面本来就小、是全空/全满的比例天然高，容忍 1 条（玩家也当提示用）；
 *   · 困难 / 专家：要求 0 条 —— 这两档的卖点就是「每一行都得认真算」。
 * 达不到上限不会让生成失败：手上已经达标的候选照样会用，只是会多花一小段时间
 * 继续找一个更干净的（见 attemptGenerate 里的 cleanDeadline）。
 */
export const DEGENERATE_LINE_CAP: Record<Difficulty, number> = {
  easy: 1,
  medium: 1,
  hard: 0,
  expert: 0,
}

/**
 * 拿到「达标但还有退化线」的候选之后，为「再找一个更干净的版本」预留的时间余量（毫秒）。
 * 距离总预算不足这个数时就不再延长搜索，直接用手上这个已经达标的候选，
 * 免得「为了更干净」把整体耗时顶到预算边缘（慢机器上尤其重要）。
 */
const CLEAN_SEARCH_MARGIN_MS = 400

// ---------------------------------------------------------------------------
// 图案生成
// ---------------------------------------------------------------------------

export interface PatternParams {
  blobCount: number
  /** 随机小碎块数量（越多线索越碎，越容易需要回溯） */
  scatterCount: number
  /** 噪声概率 */
  noise: number
  /** 平滑轮数 */
  smoothing: number
  symmetryPool: readonly Symmetry[]
}

const PATTERN_PARAMS: Record<Difficulty, PatternParams> = {
  easy: {
    blobCount: 2,
    scatterCount: 0,
    noise: 0,
    smoothing: 3,
    symmetryPool: ['vertical', 'horizontal', 'quad', 'none'],
  },
  medium: {
    blobCount: 3,
    scatterCount: 1,
    noise: 0.015,
    smoothing: 2,
    symmetryPool: ['vertical', 'horizontal', 'quad', 'none'],
  },
  hard: {
    blobCount: 11,
    scatterCount: 20,
    noise: 0.2,
    smoothing: 0,
    symmetryPool: ['none'],
  },
  expert: {
    blobCount: 7,
    scatterCount: 11,
    noise: 0.12,
    smoothing: 1,
    symmetryPool: ['vertical', 'horizontal', 'none', 'none'],
  },
}

/** 与 (x,y) 具有镜像关系的所有格子下标（含自身）——用于保证对称性 */
function mirrorIndices(width: number, height: number, x: number, y: number, symmetry: Symmetry, out: number[]): void {
  out.length = 0
  const add = (px: number, py: number) => {
    const idx = py * width + px
    if (!out.includes(idx)) out.push(idx)
  }
  add(x, y)
  if (symmetry === 'vertical' || symmetry === 'quad') add(width - 1 - x, y)
  if (symmetry === 'horizontal' || symmetry === 'quad') add(x, height - 1 - y)
  if (symmetry === 'quad') add(width - 1 - x, height - 1 - y)
}

/** 在「生成区域」里用随机游走长出团块 */
function growBlobs(
  grid: Uint8Array,
  width: number,
  height: number,
  region: { x0: number; x1: number; y0: number; y1: number },
  rng: Rng,
  blobs: number,
  totalCells: number,
  symmetry: Symmetry,
  scratch: number[],
): void {
  const perBlob = Math.max(1, Math.round(totalCells / blobs))
  const setFilled = (x: number, y: number) => {
    mirrorIndices(width, height, x, y, symmetry, scratch)
    for (const idx of scratch) grid[idx] = 1
  }

  for (let b = 0; b < blobs; b++) {
    let x = randInt(rng, region.x0, region.x1 - 1)
    let y = randInt(rng, region.y0, region.y1 - 1)
    let dx = pick(rng, [1, -1, 0, 0])
    let dy = dx === 0 ? pick(rng, [1, -1]) : 0
    let placed = 0
    let guard = 0
    while (placed < perBlob && guard++ < perBlob * 12) {
      const before = grid[y * width + x]
      setFilled(x, y)
      // 随机膨胀：让团块更像“形状”而不是一条细线
      if (chance(rng, 0.35)) {
        const nx = Math.min(region.x1 - 1, Math.max(region.x0, x + randInt(rng, -1, 1)))
        const ny = Math.min(region.y1 - 1, Math.max(region.y0, y + randInt(rng, -1, 1)))
        setFilled(nx, ny)
      }
      if (!before) placed++

      // 方向：一定概率转向、一定概率保持惯性
      const roll = rng()
      if (roll < 0.35) {
        dx = randInt(rng, -1, 1)
        dy = randInt(rng, -1, 1)
        if (dx === 0 && dy === 0) dx = 1
      } else if (roll < 0.5) {
        const t = dx
        dx = dy
        dy = -t
      }
      x += dx
      y += dy
      if (x < region.x0 || x >= region.x1) dx = -dx
      if (y < region.y0 || y >= region.y1) dy = -dy
      x = Math.min(region.x1 - 1, Math.max(region.x0, x))
      y = Math.min(region.y1 - 1, Math.max(region.y0, y))
    }
  }
}

/** 细胞自动机平滑：去掉孤立点、填补小洞，让形状更“成块” */
function smooth(grid: Uint8Array, width: number, height: number, passes: number): void {
  if (passes <= 0) return
  const next = new Uint8Array(grid.length)
  for (let pass = 0; pass < passes; pass++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let neighbours = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
            if (grid[ny * width + nx]) neighbours++
          }
        }
        const self = grid[y * width + x]
        next[y * width + x] = self ? (neighbours >= 2 ? 1 : 0) : neighbours >= 5 ? 1 : 0
      }
    }
    grid.set(next)
  }
}

/** 把填充率调整到目标区间（保持对称） */
function adjustFillRatio(
  grid: Uint8Array,
  width: number,
  height: number,
  rng: Rng,
  target: number,
  symmetry: Symmetry,
  scratch: number[],
): void {
  const size = width * height
  const countFilled = () => {
    let n = 0
    for (let i = 0; i < size; i++) if (grid[i]) n++
    return n
  }
  let filled = countFilled()
  let guard = 0
  while (filled / size < target - 0.02 && guard++ < size * 4) {
    const x = randInt(rng, 0, width - 1)
    const y = randInt(rng, 0, height - 1)
    if (grid[y * width + x]) continue
    // 多数情况下只贴着已有块生长，避免出现“满天星”
    let neighbours = 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        if (grid[ny * width + nx]) neighbours++
      }
    }
    if (neighbours === 0 && rng() > 0.15) continue
    mirrorIndices(width, height, x, y, symmetry, scratch)
    for (const idx of scratch) grid[idx] = 1
    filled = countFilled()
  }
  guard = 0
  while (filled / size > target + 0.02 && guard++ < size * 4) {
    const x = randInt(rng, 0, width - 1)
    const y = randInt(rng, 0, height - 1)
    if (!grid[y * width + x]) continue
    mirrorIndices(width, height, x, y, symmetry, scratch)
    for (const idx of scratch) grid[idx] = 0
    filled = countFilled()
  }
}

/**
 * 「退化线」数量：整行 / 整列**全空**（线索 [0]）或**全满**（线索 [length]）。
 *
 * 为什么要把它们尽量消掉：
 *   · 全满的一行/一列，玩家一眼就能整条涂完，等于白送；
 *   · 全空的一行/一列同理，还会让线索表出现一排孤零零的 0，观感很差；
 *   · 难度越高，玩家越依赖「一行一行算」的推理，退化线越多越像凑数的题。
 *
 * 所以生成器把它当作质量指标：候选图案先尽量修掉，修不掉的高难度候选直接丢弃
 * （见 DEGENERATE_LINE_CAP 与 attemptGenerate）。
 */
export function countDegenerateLines(solution: ArrayLike<number>, width: number, height: number): number {
  let count = 0
  for (let y = 0; y < height; y++) {
    const offset = y * width
    let filled = 0
    for (let x = 0; x < width; x++) if (solution[offset + x]) filled++
    if (filled === 0 || filled === width) count++
  }
  for (let x = 0; x < width; x++) {
    let filled = 0
    for (let y = 0; y < height; y++) if (solution[y * width + x]) filled++
    if (filled === 0 || filled === height) count++
  }
  return count
}

/**
 * 汇总一个生成结果的质量指标（见 types.ts 的 PuzzleQualityMetrics）。
 * 只做派生计算、不跑搜索，因此可以安全地用于批量 QA 或调试输出。
 */
export function qualityMetricsOf(result: GenerateResult): PuzzleQualityMetrics {
  const { puzzle, metrics, score } = result
  return {
    fillRate: metrics.fillRatio,
    clueCount: metrics.clueCount,
    degenerateLines: countDegenerateLines(puzzle.solution, puzzle.width, puzzle.height),
    difficultyScore: score,
    guesses: metrics.guesses,
    solutionDepth: metrics.solutionDepth,
    propagationRounds: metrics.propagationRounds,
  }
}

/**
 * 尽量消掉退化线（**就地修改** grid），返回是否改动过。
 *
 * 两条规则都很关键，否则会「按下葫芦浮起瓢」：
 *   · 全空线 ⇒ 补一格：补格**永远不会制造新的全空线**，但可能把垂直方向那条线顶成全满，
 *     因此候选位置要排除「垂直方向只差这一格就满」的格子。
 *   · 全满线 ⇒ 减一格：减格**永远不会制造新的全满线**，但可能让垂直方向那条线变全空，
 *     因此候选位置必须满足「垂直方向至少还有 2 个黑格」。
 *
 * 补/减的位置优先挑 8 邻域黑格多的格子（看起来更像成块的图案，而不是满天星），
 * 同分时用传入的 rng 随机挑一个。改动会改变线索，所以调用方必须重新验证唯一解。
 */
function reduceDegenerateLines(grid: Uint8Array, width: number, height: number, rng: Rng): boolean {
  const rowCount = new Int32Array(height)
  const colCount = new Int32Array(width)
  const recount = () => {
    rowCount.fill(0)
    colCount.fill(0)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (grid[y * width + x]) {
          rowCount[y]++
          colCount[x]++
        }
      }
    }
  }
  /** 8 邻域黑格数：用来挑「长得自然」的位置 */
  const neighbours = (x: number, y: number): number => {
    let n = 0
    for (let dy = -1; dy <= 1; dy++) {
      const ny = y + dy
      if (ny < 0 || ny >= height) continue
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        const nx = x + dx
        if (nx < 0 || nx >= width) continue
        if (grid[ny * width + nx]) n++
      }
    }
    return n
  }
  let changed = false
  recount()
  for (let pass = 0; pass < 4; pass++) {
    let dirty = false
    // ---- 行 ----
    for (let y = 0; y < height; y++) {
      if (rowCount[y] === 0) {
        // 补一格：跳过会把该列顶满的位置
        let bestX = -1
        let bestScore = -1
        let fallbackX = -1
        for (let x = 0; x < width; x++) {
          if (grid[y * width + x]) continue
          if (fallbackX < 0) fallbackX = x
          if (colCount[x] === height - 1) continue
          const score = neighbours(x, y)
          if (score > bestScore || (score === bestScore && rng() < 0.35)) {
            bestScore = score
            bestX = x
          }
        }
        if (bestX < 0) bestX = fallbackX
        if (bestX >= 0) {
          grid[y * width + bestX] = 1
          rowCount[y]++
          colCount[bestX]++
          dirty = true
        }
      } else if (rowCount[y] === width) {
        // 减一格：只挑减完之后该列仍有黑格的位置
        let bestX = -1
        let bestScore = -1
        for (let x = 0; x < width; x++) {
          if (colCount[x] < 2) continue
          const score = neighbours(x, y)
          if (score > bestScore || (score === bestScore && rng() < 0.35)) {
            bestScore = score
            bestX = x
          }
        }
        if (bestX >= 0) {
          grid[y * width + bestX] = 0
          rowCount[y]--
          colCount[bestX]--
          dirty = true
        }
      }
    }
    // ---- 列（与行完全对称）----
    for (let x = 0; x < width; x++) {
      if (colCount[x] === 0) {
        let bestY = -1
        let bestScore = -1
        let fallbackY = -1
        for (let y = 0; y < height; y++) {
          if (grid[y * width + x]) continue
          if (rowCount[y] === width - 1) continue
          if (fallbackY < 0) fallbackY = y
          const score = neighbours(x, y)
          if (score > bestScore || (score === bestScore && rng() < 0.35)) {
            bestScore = score
            bestY = y
          }
        }
        if (bestY < 0) bestY = fallbackY
        if (bestY >= 0) {
          grid[bestY * width + x] = 1
          colCount[x]++
          rowCount[bestY]++
          dirty = true
        }
      } else if (colCount[x] === height) {
        let bestY = -1
        let bestScore = -1
        for (let y = 0; y < height; y++) {
          if (rowCount[y] < 2) continue
          const score = neighbours(x, y)
          if (score > bestScore || (score === bestScore && rng() < 0.35)) {
            bestScore = score
            bestY = y
          }
        }
        if (bestY >= 0) {
          grid[bestY * width + x] = 0
          colCount[x]--
          rowCount[bestY]--
          dirty = true
        }
      }
    }
    if (!dirty) break
    changed = true
  }
  return changed
}

/** 图案是否“有意思”：避免整行全满、所有行完全一样之类的退化图案 */
function isInteresting(grid: Uint8Array, width: number, height: number): boolean {
  const { rowClues, colClues } = computeClues(grid, width, height)
  const rows = new Set(rowClues.map((c) => c.join(',')))
  const cols = new Set(colClues.map((c) => c.join(',')))
  let rowFull = 0
  let colFull = 0
  for (const c of rowClues) if (c.length === 1 && c[0] === width) rowFull++
  for (const c of colClues) if (c.length === 1 && c[0] === height) colFull++
  let filled = 0
  for (let i = 0; i < grid.length; i++) if (grid[i]) filled++
  const ratio = filled / (width * height)
  return (
    rows.size >= 3 && cols.size >= 3 && rowFull <= height / 2 && colFull <= width / 2 && ratio > 0.15 && ratio < 0.85
  )
}

/** 生成一张候选图案（0/1） */
export function generatePattern(
  width: number,
  height: number,
  difficulty: Difficulty,
  seed: string,
  overrides?: Partial<PatternParams>,
): Uint8Array {
  const rng = createRng(seed)
  const params = { ...PATTERN_PARAMS[difficulty], ...overrides }
  const meta = DIFFICULTY_META[difficulty]
  const symmetry = pick(rng, params.symmetryPool)
  const grid = new Uint8Array(width * height)
  const scratch: number[] = []

  // 对称图案只生成一半再镜像，保证图案“看得出是设计过的”
  const region = {
    x0: 0,
    x1: symmetry === 'vertical' || symmetry === 'quad' ? Math.ceil(width / 2) : width,
    y0: 0,
    y1: symmetry === 'horizontal' || symmetry === 'quad' ? Math.ceil(height / 2) : height,
  }

  const target = randFloat(rng, meta.fillMin, meta.fillMax)
  const regionCells = (region.x1 - region.x0) * (region.y1 - region.y0)
  const blobCount = Math.max(1, randInt(rng, Math.max(1, params.blobCount - 1), params.blobCount + 1))
  const scatterCount = params.scatterCount > 0 ? randInt(rng, 0, params.scatterCount + 2) : 0

  // 主体：随机团块生长
  growBlobs(grid, width, height, region, rng, blobCount, Math.round(regionCells * target * 0.8), symmetry, scratch)

  // 少量随机碎块：提高线索碎片度（难度更高）
  for (let s = 0; s < scatterCount; s++) {
    const x = randInt(rng, region.x0, region.x1 - 1)
    const y = randInt(rng, region.y0, region.y1 - 1)
    const size = randInt(rng, 1, 3)
    for (let k = 0; k < size; k++) {
      const px = Math.min(region.x1 - 1, Math.max(region.x0, x + randInt(rng, -1, 1)))
      const py = Math.min(region.y1 - 1, Math.max(region.y0, y + randInt(rng, -1, 1)))
      mirrorIndices(width, height, px, py, symmetry, scratch)
      for (const idx of scratch) grid[idx] = 1
    }
  }

  // 噪声
  if (params.noise > 0) {
    const noisePixels = Math.round(regionCells * params.noise)
    for (let n = 0; n < noisePixels; n++) {
      const x = randInt(rng, region.x0, region.x1 - 1)
      const y = randInt(rng, region.y0, region.y1 - 1)
      mirrorIndices(width, height, x, y, symmetry, scratch)
      for (const idx of scratch) grid[idx] = grid[idx] ? 0 : 1
    }
  }

  smooth(grid, width, height, params.smoothing)
  adjustFillRatio(grid, width, height, rng, target, symmetry, scratch)
  return grid
}

// ---------------------------------------------------------------------------
// 生成主流程
// ---------------------------------------------------------------------------

/** 用求解器确认某个图案是否恰好只有一个解（兜底路径专用） */
function isUniqueSolution(width: number, height: number, solution: Uint8Array): boolean {
  const { rowClues, colClues } = computeClues(solution, width, height)
  const puzzle: Puzzle = {
    id: 'probe',
    width,
    height,
    solution,
    rowClues,
    colClues,
    difficulty: 'easy',
    seed: 'probe',
  }
  const ctx = createSolverContext(puzzle)
  const board = createBoard(width * height)
  const counted = countSolutions(ctx, board, 2, createLimits({ nodeLimit: 40_000, timeLimitMs: 400 }))
  return !counted.truncated && counted.count === 1
}

/**
 * 极端兜底图案：只有在候选全部失败时才会走到这里，必须同时保证
 * 「一定有解、唯一解」与「不会满屏退化线」。
 *
 * 构造思路（唯一性不靠搜索，直接从结构上成立）：
 *   每一行只放**一段**连续方块，且**段长 > 宽度的一半**。
 *   这种行的线索一定是 [L]，而长度 L 在宽度 w 的格子里只有唯一摆放位置，
 *   于是每一行都被自己的线索钉死 ⇒ 全盘被行线索唯一确定。
 *   段长又严格小于 w，所以永远不会有全满行；段的位置逐行滑动，
 *   使得每一列都有黑格、也不会整列全满（用 countDegenerateLines 校验）。
 *
 * 老实现是「隔行全填」，虽然同样必定唯一，但会产生成排的全满行与全空行，
 * 属于要尽量避免的退化线，因此只作为最后的保险。
 */
function fallbackPattern(width: number, height: number): Uint8Array {
  const combos: readonly (readonly [number, number])[] = [
    [0.62, 2],
    [0.7, 3],
    [0.56, 1],
    [0.8, 5],
  ]
  for (const [ratio, step] of combos) {
    const len = Math.max(2, Math.ceil(width * ratio))
    // 必须严格超过一半（保证唯一摆放），又不能等于整行（否则是全满行）
    if (len * 2 <= width || len >= width) continue
    const span = width - len + 1
    const grid = new Uint8Array(width * height)
    for (let y = 0; y < height; y++) {
      const start = (y * step) % span
      for (let x = start; x < start + len; x++) grid[y * width + x] = 1
    }
    if (countDegenerateLines(grid, width, height) === 0 && isUniqueSolution(width, height, grid)) return grid
  }
  // 最后的保险：隔行全填（行线索 [width] / [0] 把每一行钉死，因此必定唯一）
  const grid = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x++) grid[y * width + x] = 1
  }
  return grid
}

interface RepairedCandidate {
  puzzle: Puzzle
  /** 退化线（全空/全满的行列）数量 */
  degenerate: number
}

/**
 * 唯一性“修形” + 退化线清理。
 *
 * 随机图案天生多解的概率不低（尤其是有噪声、碎块多的图案），直接丢弃会导致
 * 产出率极低，最后只能挑到“最好推理”的那一类图案，难度自然上不去。
 * 这里改成主动修复：发现多解就取第 2 个解，找出它与当前图案的差异格，
 * 翻转其中一格（线索随之改变，原来的歧义被破坏），再重新验证，直到唯一。
 * 这样既大幅提高产出率，又能保留“碎块多、需要试探”的结构 —— 也就是真正的高难度题。
 *
 * 唯一之后还要过一遍退化线（全空/全满行列）清理；清理会改动图案、可能破坏唯一性，
 * 所以清理完回到循环顶部**重新验证**，形成一个「修唯一 ⇒ 修退化 ⇒ 再验唯一」的小闭环。
 * 循环走完仍未拿到「唯一且无退化线」的图案时，返回过程中最好的那个（保证不比修复前差）。
 */
function repairToUnique(
  width: number,
  height: number,
  difficulty: Difficulty,
  seed: string,
  initial: Uint8Array,
  rng: Rng,
  deadline: number,
  remaining: number,
): RepairedCandidate | null {
  let solution = initial
  let best: RepairedCandidate | null = null
  for (let step = 0; step < 16; step++) {
    const puzzle = buildPuzzle(width, height, difficulty, seed, solution)
    const ctx = createSolverContext(puzzle)
    const board = createBoard(puzzle.width * puzzle.height)
    const limits = createLimits({
      nodeLimit: 20_000,
      timeLimitMs: Math.max(8, Math.min(deadline - clock(), remaining * 0.5, 90)),
    })
    const counted = countSolutions(ctx, board, 2, limits)
    if (counted.truncated) break
    if (counted.count <= 1) {
      const degenerate = countDegenerateLines(solution, width, height)
      if (!best || degenerate < best.degenerate) best = { puzzle, degenerate }
      if (degenerate === 0) return best
      // 唯一但还有退化线：先消退化线，回到循环顶部重新验证唯一性
      const fixed = solution.slice()
      if (!reduceDegenerateLines(fixed, width, height, rng)) return best
      solution = fixed
      continue
    }

    // 多解：翻转“第 2 个解”与当前图案的某个差异格
    const other = counted.solutions[1]
    const diffs: number[] = []
    for (let i = 0; i < solution.length; i++) if (other[i] !== solution[i]) diffs.push(i)
    if (diffs.length === 0) break
    const flip = diffs[Math.floor(rng() * diffs.length) % diffs.length]
    const next = solution.slice()
    next[flip] = next[flip] ? 0 : 1
    solution = next
  }
  return best
}

function buildPuzzle(
  width: number,
  height: number,
  difficulty: Difficulty,
  seed: string,
  solution: Uint8Array,
): Puzzle {
  const { rowClues, colClues } = computeClues(solution, width, height)
  return {
    id: `${difficulty}-${width}x${height}-${seed}`,
    width,
    height,
    solution,
    rowClues,
    colClues,
    difficulty,
    seed,
    // 每日挑战的种子有固定前缀：这样无论是新开一局、按 id 重放还是分享，来源都不会丢
    source: seed.startsWith('daily-') ? 'daily' : 'generated',
  }
}

interface AttemptResult {
  puzzle: Puzzle
  matched: boolean
  attempts: number
  unique: boolean | 'unknown'
  /** 实际判定出来的难度（可能与请求的难度不同） */
  difficulty: Difficulty
  score: number
  metrics: AnalyzeResult['metrics']
  reason: null | 'timeout' | 'attempts' | 'fallback'
}

function attemptGenerate(options: {
  width: number
  height: number
  difficulty: Difficulty
  seed: string
  timeBudgetMs: number
  maxAttempts: number
}): AttemptResult {
  const { width, height, difficulty, seed } = options
  const t0 = clock()
  const deadline = t0 + options.timeBudgetMs
  // 目标难度低于该尺寸的难度下限时（例如 20x20 想判成「简单」）永远不可能达标，
  // 跑满候选次数只是浪费预算：这里只跑少量候选，尽快给出一个“最接近”的备选。
  const maxAttempts = isDifficultyReachable(difficulty, width, height)
    ? options.maxAttempts
    : Math.min(options.maxAttempts, 12)
  let bestFallback: {
    puzzle: Puzzle
    score: number
    metrics: AnalyzeResult['metrics']
    assessed: Difficulty
    degenerate: number
  } | null = null
  /**
   * 已经达到目标难度的候选。退化线允许数量（DEGENERATE_LINE_CAP）为 0 时，
   * 我们不急着用第一个达标的候选收工，而是继续找一小段时间的「无退化线」版本；
   * 找到更干净的就更替，超时或候选耗尽就用手上这个（达标结论不受影响）。
   */
  let bestMatch: {
    puzzle: Puzzle
    score: number
    metrics: AnalyzeResult['metrics']
    degenerate: number
  } | null = null
  let cleanDeadline = Number.POSITIVE_INFINITY
  const degenerateCap = DEGENERATE_LINE_CAP[difficulty]
  let attempts = 0
  let reason: null | 'timeout' | 'attempts' = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attempts = attempt
    const remaining = deadline - clock()
    if (remaining <= 0) {
      reason = 'timeout'
      break
    }
    // 已经有一个达标的候选在手：只再多花一小段时间找更干净的版本
    if (bestMatch && clock() >= cleanDeadline) break
    const candidateSeed = `${seed}-${attempt}`
    const initial = generatePattern(width, height, difficulty, candidateSeed)
    if (!isInteresting(initial, width, height)) continue

    // 生成阶段先便宜地消一遍退化线（此时还没有唯一性可言，不必额外验证）
    reduceDegenerateLines(initial, width, height, createRng(`${candidateSeed}:degenerate`))

    // 每轮都做唯一性修形；修形失败（超预算）则换下一个候选
    const repaired = repairToUnique(
      width,
      height,
      difficulty,
      candidateSeed,
      initial,
      createRng(`${candidateSeed}:repair`),
      deadline,
      remaining,
    )
    if (!repaired) continue
    const degenerate = repaired.degenerate
    if (!isInteresting(repaired.puzzle.solution, width, height)) continue

    // repairToUnique 已经用“数到 2 个解”的方式证明了唯一性，这里直接复用结论
    const analysis = analyzePuzzle(repaired.puzzle, {
      nodeLimit: 30_000,
      timeLimitMs: Math.max(20, Math.min(remaining, remaining * 0.6, 240)),
      assumeUnique: true,
    })
    if (analysis.metrics.truncated || analysis.unique !== true) continue
    // 对外只暴露「基准种子」：id / seed 里不出现内部候选序号（seed-1 / seed-2 …），
    // 否则 regenerateFromId（刷新页面、打开分享链接）会再追加一次序号，
    // 得到的是另一个候选图案。基准种子 + 固定的候选顺序 = 可复现的同一道题。
    const puzzle: Puzzle = { ...repaired.puzzle, seed, id: `${difficulty}-${width}x${height}-${seed}` }
    if (analysis.difficulty === difficulty) {
      if (!bestMatch || degenerate < bestMatch.degenerate) {
        bestMatch = { puzzle, score: analysis.score, metrics: analysis.metrics, degenerate }
      }
      if (degenerate <= degenerateCap) break
      if (cleanDeadline === Number.POSITIVE_INFINITY) {
        // 再多找一小会儿（最多 250ms）：够把一个带退化线的候选换成干净的，又不会拖慢出题。
        // 留 400ms 余量：接近预算尾段时不再延长搜索，直接用手上这个已经达标的候选，
        // 免得「为了更干净」把整体耗时顶到预算边缘（慢机器上尤其重要）。
        const extra = Math.min(250, remaining - CLEAN_SEARCH_MARGIN_MS)
        if (extra < 30) break
        cleanDeadline = clock() + extra
      }
      continue
    }
    // 记住一个“最接近目标”的备选，超时时作为降级输出
    if (
      !bestFallback ||
      analysis.score < bestFallback.score ||
      (analysis.score === bestFallback.score && degenerate < bestFallback.degenerate)
    ) {
      bestFallback = {
        puzzle,
        score: analysis.score,
        metrics: analysis.metrics,
        assessed: analysis.difficulty,
        degenerate,
      }
    }
  }

  if (bestMatch) {
    return {
      puzzle: bestMatch.puzzle,
      matched: true,
      attempts,
      unique: true,
      difficulty,
      score: bestMatch.score,
      metrics: bestMatch.metrics,
      reason: null,
    }
  }

  if (!reason) reason = 'attempts'
  if (bestFallback) {
    return {
      puzzle: bestFallback.puzzle,
      matched: false,
      attempts,
      unique: true,
      difficulty: bestFallback.assessed,
      score: bestFallback.score,
      metrics: bestFallback.metrics,
      reason,
    }
  }

  // 极端兜底：构造一个必定唯一、必定可解的图案
  const solution = fallbackPattern(width, height)
  const puzzle = buildPuzzle(width, height, difficulty, `${seed}-fallback`, solution)
  return {
    puzzle,
    matched: false,
    attempts,
    unique: true,
    difficulty: 'easy',
    score: 0,
    metrics: {
      guesses: 0,
      failedGuesses: 0,
      solutionDepth: 0,
      propagationRounds: 0,
      deducedCells: 0,
      nodes: 0,
      fillRatio: 0.5,
      maxClue: width,
      clueCount: 0,
      longCrossings: 0,
      timeMs: 0,
      truncated: false,
    },
    reason: 'fallback',
  }
}

/**
 * 生成谜题（带降级保护）。
 * 返回的 puzzle **一定**满足唯一解；`matched` 表示是否达成目标难度。
 */
export function generatePuzzle(options: GenerateOptions): GenerateResult {
  const t0 = clock()
  const timeBudgetMs = options.timeBudgetMs ?? defaultTimeBudget(options.width, options.height, options.difficulty)
  const maxAttempts = options.maxAttempts ?? defaultMaxAttempts(options.difficulty)
  const allowDowngrade = options.allowDowngrade !== false
  const allowResize = options.allowResize === true

  let width = options.width
  let height = options.height
  const difficulty = options.difficulty

  let result = attemptGenerate({
    width,
    height,
    difficulty,
    seed: options.seed,
    timeBudgetMs,
    maxAttempts,
  })
  let downgrade: GenerateResult['downgrade'] = null
  let notice: string | undefined

  if (!result.matched && allowDowngrade && allowResize) {
    downgrade = result.reason ?? 'attempts'
    // 降级：降低难度档位。
    // 盘面尺寸被固定成「5 的倍数正方形」之后，已经没有办法「缩小尺寸但保持同档」
    // （缩小到下一个 5 的倍数就会跨到更简单的档位），所以这里直接换成相邻的更简单档位，
    // 盘面尺寸也随之切换到该档的固定尺寸。降级出来的题目仍然保证唯一解。
    const order: Difficulty[] = ['easy', 'medium', 'hard', 'expert']
    const idx = order.indexOf(difficulty)
    if (idx > 0) {
      const easier = order[idx - 1]
      const size = boardSideFor(easier)
      const third = attemptGenerate({
        width: size,
        height: size,
        difficulty: easier,
        seed: `${options.seed}-easier`,
        timeBudgetMs,
        maxAttempts: defaultMaxAttempts(easier),
      })
      if (third.matched) {
        // 降级到更简单的档位 => 不再算“达标”
        result = { ...third, matched: false }
        width = size
        height = size
        notice = `未能生成符合「${DIFFICULTY_META[options.difficulty].label}」的题目，已降级为「${DIFFICULTY_META[easier].label}」（${size}×${size}）`
      } else if (third.score > result.score) {
        result = third
        width = size
        height = size
      }
    }
  }

  if (!result.matched && !notice) {
    // 没达标：如实告知实际难度（题目依然保证唯一解）
    const requested = DIFFICULTY_META[options.difficulty].label
    notice =
      result.difficulty === options.difficulty
        ? '生成条件较苛刻，已回退到最接近的题目（仍保证唯一解）'
        : `未能在 ${width}x${height} 生成「${requested}」难度，实际难度为「${DIFFICULTY_META[result.difficulty].label}」`
  }

  // 把连续难度分附在谜题上：开局信息页要显示「难度 78 / 100」，
  // 不想在渲染时再跑一次求解器（而且题目一旦重放，这个分数也必须是同一份）。
  result.puzzle.score = result.score
  return finish(result, downgrade, notice, t0)
}

function finish(
  result: AttemptResult,
  downgrade: GenerateResult['downgrade'],
  notice: string | undefined,
  t0: number,
): GenerateResult {
  return {
    puzzle: result.puzzle,
    matched: result.matched,
    attempts: result.attempts,
    elapsedMs: clock() - t0,
    unique: result.unique,
    difficulty: result.difficulty,
    score: result.score,
    metrics: result.metrics,
    downgrade,
    notice,
  }
}

/** 解析 URL / 表单来的难度字符串，非法则返回 easy */
export function safeDifficulty(value: string | null | undefined): Difficulty {
  return isDifficulty(value) ? value : 'easy'
}
