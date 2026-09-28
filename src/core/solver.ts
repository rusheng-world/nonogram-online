/**
 * 数织求解器
 * ============================================================================
 * 为什么不用「枚举排列」：
 *   长度 25、线索 [1,1,1,1,1,...] 的行有 C(25,k) 级别的排列组合，
 *   朴素的“把所有可能排列列出来再取交集”在 20×20 以上会直接爆炸。
 *
 * 本实现采用 **动态规划 + 前缀/后缀可达性**：
 *   对一条长度为 n、线索为 b0..b(m-1) 的线，定义
 *     suffix[i][j] = 从第 i 格开始、还剩第 j..m-1 个块要放，是否可能成立
 *     reach[i][j]  = 前 i 格已经恰好放好第 0..j-1 个块，是否可能成立
 *   两个表都只有 (n+1)×(m+1) 大小（m ≤ ⌊(n+1)/2⌋），可在 O(n·m) 内算完。
 *
 *   于是对每个格子：
 *     能把第 i 格涂黑  ⇔ 存在 j，使 reach[i][j] 成立且第 j 个块正好从 i 开始放置
 *     能把第 i 格留白  ⇔ 存在 j，使 reach[i][j] 与 suffix[i+1][j] 同时成立
 *   两者都成立 ⇒ 该格无法确定；只有一种成立 ⇒ 该格被“逻辑强制”。
 *
 * 单行推理是**可靠（sound）**的：它对任意一个满足线索的染色都成立，
 * 所以“所有格子都被行列传播确定”这件事本身就直接证明了谜题唯一解
 * （任何解都必须满足每条线，而每条线里该格取值唯一）。见 analyzePuzzle。
 *
 * 传播卡住时进入**假设分支（回溯）**：挑选一条“未知格最少”的线中的格子，
 * 分别尝试黑/白并递归。分支用于两件事：
 *   1. 统计解的个数（找到第 2 个解立刻返回 ⇒ 多解，直接淘汰该谜题）
 *   2. 评估推理难度（猜测次数 / 假设链深度）
 *
 * 所有搜索都带节点上限 + 时间上限（deadline），保证不会死循环。
 */

import { UNKNOWN, FILLED, EMPTY } from './types'
import type { CellState, Puzzle } from './types'

/** 供性能测量使用；在 Node 与浏览器中都存在 */
const clock = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()

// ---------------------------------------------------------------------------
// 单行 DP
// ---------------------------------------------------------------------------

export interface LineWorkspace {
  maxLen: number
  /** (maxLen+1) × (mMax+1) 的扁平表步长 */
  stride: number
  suffix: Uint8Array
  reach: Uint8Array
  /** start[i][j]：第 j 个块可以从第 i 格开始、且前缀可达 */
  start: Uint8Array
  /** 每格结论：UNKNOWN / FILLED / EMPTY */
  out: Uint8Array
  whitePrefix: Int32Array
  clue: Int32Array
  /** 差分数组：统计“该格能被某个可行块覆盖” */
  diff: Int32Array
  /** 差分数组：统计“该格是某个可行块之后的分隔格（必须留白）” */
  whiteDiff: Int32Array
}

export function createLineWorkspace(maxLen: number): LineWorkspace {
  const mMax = Math.floor((maxLen + 1) / 2)
  const stride = mMax + 1
  const size = (maxLen + 1) * stride
  return {
    maxLen,
    stride,
    suffix: new Uint8Array(size),
    reach: new Uint8Array(size),
    start: new Uint8Array(size),
    out: new Uint8Array(maxLen),
    whitePrefix: new Int32Array(maxLen + 1),
    clue: new Int32Array(Math.max(1, mMax)),
    diff: new Int32Array(maxLen + 1),
    whiteDiff: new Int32Array(maxLen + 1),
  }
}

export interface LineSolveResult {
  /** 该行线索本身是否矛盾（例如线索总和超过行长） */
  contradiction: boolean
  /** 被确定的格子数（用于统计推理强度） */
  determined: number
}

/**
 * 求解一行（或一列）。
 *
 * @param clues  线索（空行传 [0] 或 []）
 * @param line   当前已知状态，长度为 len，取值 UNKNOWN / FILLED / EMPTY
 * @param len    有效长度（line 可能是复用的更大缓冲区）
 * @param ws     复用的暂存区
 * @param out    solveLine 会把结论写进 ws.out[0..len)
 */
export function solveLine(
  clues: readonly number[],
  line: ArrayLike<number>,
  len: number,
  ws: LineWorkspace,
): LineSolveResult {
  const out = ws.out
  // 归一化线索：把 [0] / 空数组都当作“没有块”
  let m = 0
  for (let i = 0; i < clues.length; i++) {
    const c = clues[i]
    if (c > 0) ws.clue[m++] = c
  }

  if (m === 0) {
    // 整行必须为白
    let determined = 0
    for (let i = 0; i < len; i++) {
      if (line[i] === FILLED) return { contradiction: true, determined: 0 }
      out[i] = EMPTY
      determined++
    }
    return { contradiction: false, determined }
  }

  const stride = ws.stride
  if (m > stride - 1 || len > ws.maxLen) {
    // 线索数量不可能被放下（块之间至少要空一格）
    return { contradiction: true, determined: 0 }
  }

  let sum = 0
  for (let j = 0; j < m; j++) sum += ws.clue[j]
  if (sum + (m - 1) > len) return { contradiction: true, determined: 0 }

  const suffix = ws.suffix
  const reach = ws.reach
  const start = ws.start
  const whitePrefix = ws.whitePrefix

  whitePrefix[0] = 0
  for (let i = 0; i < len; i++) whitePrefix[i + 1] = whitePrefix[i] + (line[i] === EMPTY ? 1 : 0)

  const cells = (len + 1) * stride
  suffix.fill(0, 0, cells)
  reach.fill(0, 0, cells)
  start.fill(0, 0, cells)

  // ---- 后缀可达性 suffix[i][j] ----
  for (let j = 0; j <= m; j++) suffix[len * stride + j] = j === m ? 1 : 0
  for (let i = len - 1; i >= 0; i--) {
    const rowOff = i * stride
    const nextOff = (i + 1) * stride
    const canBeWhite = line[i] !== FILLED
    for (let j = 0; j <= m; j++) {
      let ok = 0
      if (canBeWhite && suffix[nextOff + j]) {
        ok = 1
      } else if (j < m) {
        const blockLen = ws.clue[j]
        const end = i + blockLen
        if (end <= len && whitePrefix[end] - whitePrefix[i] === 0 && (end === len || line[end] !== FILLED)) {
          const ni = end === len ? len : end + 1
          if (suffix[ni * stride + j + 1]) ok = 1
        }
      }
      suffix[rowOff + j] = ok
    }
  }
  if (!suffix[0]) return { contradiction: true, determined: 0 }

  // ---- 前缀可达性 reach[i][j]（同时记录块起点） ----
  reach[0] = 1
  for (let i = 0; i < len; i++) {
    const rowOff = i * stride
    const nextOff = (i + 1) * stride
    const canBeWhite = line[i] !== FILLED
    for (let j = 0; j <= m; j++) {
      if (!reach[rowOff + j]) continue
      if (canBeWhite) reach[nextOff + j] = 1
      if (j < m) {
        const blockLen = ws.clue[j]
        const end = i + blockLen
        if (end <= len && whitePrefix[end] - whitePrefix[i] === 0 && (end === len || line[end] !== FILLED)) {
          start[rowOff + j] = 1
          const ni = end === len ? len : end + 1
          reach[ni * stride + j + 1] = 1
        }
      }
    }
  }

  // ---- 逐格取交集 ----
  // 一个可行的“放置”= 前缀可达 reach[s][j] + 块 j 放在 [s, s+L) 合法 + 后缀可完成。
  // 对每个可行放置：它覆盖到的格子一定可以涂黑；块后面的分隔格一定可以留白。
  // 用差分数组一次性标记，避免 O(n·m·L) 的逐格扫描，也避免漏掉“块中间的格子”。
  const fillDiff = ws.diff
  const whiteDiff = ws.whiteDiff
  fillDiff.fill(0, 0, len + 1)
  whiteDiff.fill(0, 0, len + 1)
  for (let s = 0; s < len; s++) {
    const rowOff = s * stride
    for (let j = 0; j < m; j++) {
      if (!start[rowOff + j]) continue
      const end = s + ws.clue[j]
      const ni = end === len ? len : end + 1
      if (!suffix[ni * stride + j + 1]) continue
      fillDiff[s]++
      fillDiff[end]--
      if (end < len) {
        whiteDiff[end]++
        whiteDiff[end + 1]--
      }
    }
  }

  let determined = 0
  let fillCover = 0
  let whiteCover = 0
  for (let i = 0; i < len; i++) {
    fillCover += fillDiff[i]
    whiteCover += whiteDiff[i]
    const known = line[i]
    if (known !== UNKNOWN) {
      out[i] = known
      continue
    }
    const rowOff = i * stride
    const nextOff = (i + 1) * stride
    const canFill = fillCover > 0 ? 1 : 0
    // 可以留白：要么它是某个可行块之后的分隔格，要么存在“前缀可达 + 后缀可完成”的自由留白
    let canEmpty = whiteCover > 0 ? 1 : 0
    for (let j = 0; j <= m; j++) {
      if (reach[rowOff + j] && suffix[nextOff + j]) {
        canEmpty = 1
        break
      }
    }
    if (canFill && canEmpty) {
      out[i] = UNKNOWN
    } else if (canFill) {
      out[i] = FILLED
      determined++
    } else if (canEmpty) {
      out[i] = EMPTY
      determined++
    } else {
      // 该格既不能涂黑也不能留白 ⇒ 这一行无解
      return { contradiction: true, determined: 0 }
    }
  }

  return { contradiction: false, determined }
}

// ---------------------------------------------------------------------------
// 全盘约束传播
// ---------------------------------------------------------------------------

export interface SolverContext {
  width: number
  height: number
  rowClues: readonly number[][]
  colClues: readonly number[][]
  ws: LineWorkspace
  /** 复用的取行/取列缓冲 */
  line: Uint8Array
  /** 变更轨迹：只记录被确定为 FILLED/EMPTY 的格子下标（旧值一定是 UNKNOWN） */
  trail: number[]
  /** 可选的推理顺序日志：[index, value, ...] */
  log: number[] | null
  /**
   * 可选的逐格推理回调（「自动解题」页面的推理轨迹用）。
   * 为 null 时每次确定格子只多一次判空，正常游戏侧求解不受影响。
   */
  record: DeductionHook | null
  stats: PropagateStats
}

/**
 * 逐格推理回调：某个格子被**逻辑强制**为黑/白时触发一次。
 *
 * @param index 格子下标（行优先）
 * @param value FILLED（必为黑）或 EMPTY（必为白）
 * @param axis  该结论由行推理（row）还是列推理（col）得出
 * @param line  行号 / 列号（0 基）
 * @param clues 该行 / 该列的线索
 */
export type DeductionHook = (
  index: number,
  value: number,
  axis: 'row' | 'col',
  line: number,
  clues: readonly number[],
) => void

export interface PropagateStats {
  rounds: number
  deduced: number
}

export function createSolverContext(puzzle: Puzzle): SolverContext {
  const maxLen = Math.max(puzzle.width, puzzle.height)
  return {
    width: puzzle.width,
    height: puzzle.height,
    rowClues: puzzle.rowClues,
    colClues: puzzle.colClues,
    ws: createLineWorkspace(maxLen),
    line: new Uint8Array(maxLen),
    trail: [],
    log: null,
    record: null,
    stats: { rounds: 0, deduced: 0 },
  }
}

export function resetStats(ctx: SolverContext): void {
  ctx.stats.rounds = 0
  ctx.stats.deduced = 0
}

/** 撤销 trail 中 mark 之后的全部修改（把格子恢复为 UNKNOWN） */
export function revert(board: Uint8Array, ctx: SolverContext, mark: number): void {
  const trail = ctx.trail
  for (let i = trail.length - 1; i >= mark; i--) board[trail[i]] = UNKNOWN
  trail.length = mark
}

/** 一轮传播的结果：有推进 / 到不动点 / 出现矛盾 */
export type PropagateRoundResult =
  | { kind: 'changed' }
  | { kind: 'stable' }
  | { kind: 'contradiction'; axis: 'row' | 'col'; line: number; clues: readonly number[] }

/**
 * 跑**一轮**行列传播（先扫所有行，再扫所有列）。
 *
 * propagate() 会反复调用它直到不动点；「自动解题」页面则自己控制调用次数，
 * 把「每一轮新确定下来的格子」记录成一步推理轨迹。
 * 两条路径共用这一份实现，不存在第二套传播逻辑。
 */
export function propagateRound(ctx: SolverContext, board: Uint8Array, stats: PropagateStats): PropagateRoundResult {
  const { width, height, ws, line, trail, log, record } = ctx
  stats.rounds++
  let changed = false

  // 行
  for (let y = 0; y < height; y++) {
    const off = y * width
    for (let x = 0; x < width; x++) line[x] = board[off + x]
    const clues = ctx.rowClues[y]
    const res = solveLine(clues, line, width, ws)
    if (res.contradiction) return { kind: 'contradiction', axis: 'row', line: y, clues }
    const out = ws.out
    for (let x = 0; x < width; x++) {
      const value = out[x]
      if (value !== UNKNOWN && board[off + x] === UNKNOWN) {
        board[off + x] = value
        trail.push(off + x)
        if (log) log.push(off + x, value)
        if (record) record(off + x, value, 'row', y, clues)
        stats.deduced++
        changed = true
      }
    }
  }

  // 列
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) line[y] = board[y * width + x]
    const clues = ctx.colClues[x]
    const res = solveLine(clues, line, height, ws)
    if (res.contradiction) return { kind: 'contradiction', axis: 'col', line: x, clues }
    const out = ws.out
    for (let y = 0; y < height; y++) {
      const value = out[y]
      if (value !== UNKNOWN && board[y * width + x] === UNKNOWN) {
        board[y * width + x] = value
        trail.push(y * width + x)
        if (log) log.push(y * width + x, value)
        if (record) record(y * width + x, value, 'col', x, clues)
        stats.deduced++
        changed = true
      }
    }
  }

  return changed ? { kind: 'changed' } : { kind: 'stable' }
}

/**
 * 行列约束传播到不动点（= propagateRound 反复执行）。
 * @returns false 表示出现矛盾（该分支无解）
 */
export function propagate(ctx: SolverContext, board: Uint8Array, stats?: PropagateStats): boolean {
  const s = stats ?? ctx.stats
  for (;;) {
    const round = propagateRound(ctx, board, s)
    if (round.kind === 'contradiction') return false
    if (round.kind === 'stable') return true
  }
}

function firstUnknown(board: Uint8Array): number {
  for (let i = 0; i < board.length; i++) if (board[i] === UNKNOWN) return i
  return -1
}

/**
 * 分支启发式：挑选「未知格最少的那条线」里的第一个未知格。
 * 这样的线信息量最大，一次假设往往能引发大量连带确定，从而快速收敛或产生矛盾。
 */
export function chooseBranchCell(ctx: SolverContext, board: Uint8Array): number {
  const { width, height } = ctx
  let bestLine = -1
  let bestCount = Number.MAX_SAFE_INTEGER
  let bestIsRow = true

  for (let y = 0; y < height; y++) {
    const off = y * width
    let count = 0
    for (let x = 0; x < width; x++) if (board[off + x] === UNKNOWN) count++
    if (count > 0 && count < bestCount) {
      bestCount = count
      bestLine = y
      bestIsRow = true
      if (count === 1) break
    }
  }
  if (bestCount > 1) {
    for (let x = 0; x < width; x++) {
      let count = 0
      for (let y = 0; y < height; y++) if (board[y * width + x] === UNKNOWN) count++
      if (count > 0 && count < bestCount) {
        bestCount = count
        bestLine = x
        bestIsRow = false
        if (count === 1) break
      }
    }
  }

  if (bestLine < 0) return firstUnknown(board)
  if (bestIsRow) {
    const off = bestLine * width
    for (let x = 0; x < width; x++) if (board[off + x] === UNKNOWN) return off + x
  } else {
    for (let y = 0; y < height; y++) if (board[y * width + bestLine] === UNKNOWN) return y * width + bestLine
  }
  return firstUnknown(board)
}

// ---------------------------------------------------------------------------
// 带预算的搜索
// ---------------------------------------------------------------------------

export interface SearchLimits {
  nodeLimit: number
  /** 绝对时间戳（clock() 单位），<= 该时间视为超时 */
  deadline: number
  nodes: number
  timedOut: boolean
  nodeLimitHit: boolean
}

export interface LimitOptions {
  nodeLimit?: number
  timeLimitMs?: number
}

export function createLimits(opts: LimitOptions = {}): SearchLimits {
  return {
    nodeLimit: opts.nodeLimit ?? 60_000,
    deadline: clock() + (opts.timeLimitMs ?? 1_000),
    nodes: 0,
    timedOut: false,
    nodeLimitHit: false,
  }
}

function budgetExceeded(limits: SearchLimits): boolean {
  if (limits.timedOut || limits.nodeLimitHit) return true
  if (limits.nodes >= limits.nodeLimit) {
    limits.nodeLimitHit = true
    return true
  }
  if ((limits.nodes & 127) === 0 && clock() > limits.deadline) {
    limits.timedOut = true
    return true
  }
  return false
}

export interface SolveStats {
  /** 尝试过的假设次数（含失败分支） —— 即"回溯次数" */
  guesses: number
  /** 落入矛盾的假设次数 */
  failedGuesses: number
  /** 得到解时所在的假设链深度（0 = 纯传播） */
  solutionDepth: number
  /** 搜索过程中到达过的最大假设链深度 */
  maxDepth: number
  /** 传播轮数（取搜索路径上的最大值） */
  rounds: number
  /** 传播过程中被确定的格子总数 */
  deduced: number
  nodes: number
  truncated: boolean
}

function emptyStats(): SolveStats {
  return {
    guesses: 0,
    failedGuesses: 0,
    solutionDepth: 0,
    maxDepth: 0,
    rounds: 0,
    deduced: 0,
    nodes: 0,
    truncated: false,
  }
}

export interface SolveOutcome {
  solution: Uint8Array | null
  stats: SolveStats
  /** 被外部取消（AbortSignal）时为 true */
  cancelled?: boolean
}

/**
 * 求出**一个**解，同时统计人类解题所需的推理成本。
 * 假设顺序固定（先黑后白）+ 固定启发式 ⇒ 同一谜题的指标完全可复现。
 *
 * 传入 `trace` 时会额外把「每一轮传播 / 每次假设 / 每次回退 / 矛盾」记成推理轨迹，
 * 供「自动解题」页面逐步演示。记录逻辑与求解共用同一趟搜索，不会重复计算。
 */
export function solveFirst(
  ctx: SolverContext,
  board: Uint8Array,
  limits: SearchLimits,
  trace?: SolveTrace | null,
): SolveOutcome {
  const stats = emptyStats()
  resetStats(ctx)
  let cancelled = false
  const limited = (): boolean => trace?.truncated === true

  const dfs = (depth: number): Uint8Array | null => {
    if (trace?.signal?.aborted) {
      cancelled = true
      stats.truncated = true
      return null
    }
    if (budgetExceeded(limits)) {
      stats.truncated = true
      return null
    }
    limits.nodes++
    stats.nodes++
    if (depth > stats.maxDepth) stats.maxDepth = depth
    const mark = ctx.trail.length

    // 一轮一轮传播：每轮结束后记录一步（这样演示里能看到推理是"逐层收敛"的）
    for (;;) {
      const roundCells: SolveStepCell[] | null = trace && !limited() ? [] : null
      if (roundCells) {
        let reasonBudget = MAX_REASONS_PER_STEP
        ctx.record = (index, value, axis, line, clues) => {
          // 只给前 MAX_REASONS_PER_STEP 格生成理由文本，但每一格都要记录下来：
          // 逐步演示把 cells 折叠回棋盘，漏记就会让演示结果与真实解不符。
          roundCells.push({
            index,
            state: value === FILLED ? 'filled' : 'marked',
            reason: reasonBudget-- > 0 ? reasonForCell(ctx.width, axis, line, clues, index, value) : undefined,
          })
        }
      }
      const round = propagateRound(ctx, board, ctx.stats)
      ctx.record = null

      if (round.kind === 'contradiction') {
        if (trace) {
          trace.push({
            type: 'contradiction',
            depth,
            description: `第 ${round.line + 1} ${round.axis === 'row' ? '行' : '列'}线索 [${round.clues.join(' ')}] 与已知格冲突，此路不通`,
          })
        }
        revert(board, ctx, mark)
        return null
      }
      if (roundCells && roundCells.length > 0) {
        trace!.push({
          type: 'propagate',
          depth,
          cells: roundCells,
          description: `第 ${ctx.stats.rounds} 轮行列推理：新确定 ${roundCells.length} 格（${describeCells(roundCells)}）`,
        })
      }
      if (round.kind === 'stable') break
    }

    if (ctx.stats.rounds > stats.rounds) stats.rounds = ctx.stats.rounds
    if (ctx.stats.deduced > stats.deduced) stats.deduced = ctx.stats.deduced

    const idx = firstUnknown(board)
    if (idx === -1) {
      const solution = new Uint8Array(board.length)
      for (let i = 0; i < board.length; i++) solution[i] = board[i] === FILLED ? 1 : 0
      stats.solutionDepth = depth
      trace?.push({ type: 'done', depth, description: '所有格子都已确定，得到一个完整解' })
      revert(board, ctx, mark)
      return solution
    }

    const cell = chooseBranchCell(ctx, board)
    for (const value of [FILLED, EMPTY]) {
      const pos = positionText(ctx.width, cell, value)
      board[cell] = value
      ctx.trail.push(cell)
      stats.guesses++
      trace?.push({
        type: 'assume',
        depth: depth + 1,
        cells: [
          {
            index: cell,
            state: value === FILLED ? 'filled' : 'marked',
            reason: `线索推不动了，假设它为${value === FILLED ? '黑' : '白'}`,
          },
        ],
        description: `推理停滞，尝试假设：${pos}`,
      })
      const found = dfs(depth + 1)
      revert(board, ctx, mark)
      if (found) return found
      if (!stats.truncated) {
        stats.failedGuesses++
        trace?.push({ type: 'backtrack', depth: depth + 1, description: `假设「${pos}」导致矛盾，回退并换一种试法` })
      } else {
        return null
      }
    }
    return null
  }

  const solution = dfs(0)
  return { solution, stats, cancelled }
}

export interface CountOutcome {
  /** 找到的解的个数（最多 maxSolutions 个） */
  count: number
  solutions: Uint8Array[]
  truncated: boolean
}

/**
 * 统计解的个数（最多数到 maxSolutions 个就停）。
 * 用于唯一性校验：count === 1 表示唯一解。
 */
export function countSolutions(
  ctx: SolverContext,
  board: Uint8Array,
  maxSolutions: number,
  limits: SearchLimits,
): CountOutcome {
  const solutions: Uint8Array[] = []
  let truncated = false

  const dfs = (depth: number): void => {
    if (solutions.length >= maxSolutions) return
    if (budgetExceeded(limits)) {
      truncated = true
      return
    }
    limits.nodes++
    const mark = ctx.trail.length
    if (!propagate(ctx, board)) {
      revert(board, ctx, mark)
      return
    }
    const idx = firstUnknown(board)
    if (idx === -1) {
      const solution = new Uint8Array(board.length)
      for (let i = 0; i < board.length; i++) solution[i] = board[i] === FILLED ? 1 : 0
      solutions.push(solution)
      revert(board, ctx, mark)
      return
    }
    if (depth >= 96) {
      // 理论上不可能到达（每次假设至少确定一个格子），仅作保险
      truncated = true
      revert(board, ctx, mark)
      return
    }
    const cell = chooseBranchCell(ctx, board)
    for (const value of [FILLED, EMPTY]) {
      board[cell] = value
      ctx.trail.push(cell)
      dfs(depth + 1)
      revert(board, ctx, mark)
      if (solutions.length >= maxSolutions || truncated) return
    }
  }

  dfs(0)
  return { count: solutions.length, solutions, truncated }
}

/** 新建一块全 UNKNOWN 的棋盘 */
export function createBoard(size: number): Uint8Array {
  return new Uint8Array(size)
}

// ---------------------------------------------------------------------------
// 提示：挑出“逻辑上下一步最该确定”的格子
// ---------------------------------------------------------------------------

export interface Hint {
  index: number
  value: typeof FILLED | typeof EMPTY
  /** true 表示这一格是靠假设才能确定的（传播推不出来） */
  isGuess: boolean
}

/**
 * 计算提示。策略：
 *   1. 用求解器对谜题做行列传播，记录**推理顺序**；
 *   2. 按顺序找出第一个“玩家还没弄对”的格子 ⇒ 这就是逻辑上下一步最该确定的格子；
 *   3. 如果所有可推导的格子玩家都对了，说明后续必须靠假设，则退化为
 *      在“未知格最少的线”里揭示一格（标记为猜测提示）。
 */
export function computeHint(puzzle: Puzzle, playerBoard: Uint8Array): Hint | null {
  const ctx = createSolverContext(puzzle)
  const board = createBoard(puzzle.width * puzzle.height)
  const log: number[] = []
  ctx.log = log
  const ok = propagate(ctx, board, { rounds: 0, deduced: 0 })
  ctx.log = null

  if (ok) {
    for (let i = 0; i < log.length; i += 2) {
      const index = log[i]
      const value = log[i + 1] as typeof FILLED | typeof EMPTY
      const current = playerBoard[index]
      const satisfied = value === FILLED ? current === FILLED : current === EMPTY
      if (!satisfied) return { index, value, isGuess: false }
    }
  }

  // 传播无法继续：挑一条未知格最少的线，揭示其中一格
  const cell = chooseBranchCell(ctx, board)
  if (cell < 0) return null
  const value = puzzle.solution[cell] ? FILLED : EMPTY
  return { index: cell, value, isGuess: true }
}

// ---------------------------------------------------------------------------
// 对外统一接口：SolveResult / SolveStep（「自动解题」页面用）
// ---------------------------------------------------------------------------
//
// 上面的 propagate / solveFirst / countSolutions 是阶段 1 就有的引擎能力，
// 游戏侧（难度评估、提示、生成器）一直在用，接口保持不变。
// 这里只做两件事：
//   1. 把同一趟搜索过程**记录**成人类可读的推理轨迹（SolveStep[]）；
//   2. 把「找到解 + 数解 + 统计」打包成一个 SolveResult 返回。
// 没有第二套求解逻辑 —— 轨迹来自 solveFirst 内部，唯一性来自 countSolutions。

/** 一步推理的类型 */
export type SolveStepType = 'propagate' | 'assume' | 'contradiction' | 'backtrack' | 'done'

export interface SolveStepCell {
  /** 格子下标（行优先） */
  index: number
  /**
   * 该格被确定成什么。
   * 注意：'marked' 表示"逻辑上必为白"（等价于游戏里画 X 的含义），
   * 但自动解题页面按需求**不画 X**，只把它渲染成空白/淡色。
   */
  state: CellState
  /** 人类可读的推导理由（一步里格子很多时，只有前若干格带理由） */
  reason?: string
}

export interface SolveStep {
  type: SolveStepType
  /** 该步所处的假设链层级（0 = 纯传播得出的结论） */
  depth: number
  /** 本步**新确定**的格子（回退/矛盾步为空） */
  cells?: SolveStepCell[]
  description: string
}

export type SolveStatus = 'unique' | 'multiple' | 'none' | 'timeout' | 'unknown'

export interface SolveResult {
  status: SolveStatus
  /** unique 时返回唯一解；multiple / unknown 时返回找到的第一个解 */
  solution?: Uint8Array
  /** multiple 时返回第二个解，用于对照展示 */
  alternativeSolution?: Uint8Array
  /** 在限制内数到的解的个数 */
  solutionCount?: number
  /** true 表示解的个数达到统计上限（即"至少这么多"） */
  solutionCountCapped?: boolean
  steps: SolveStep[]
  /** true 表示推理轨迹因超出步数上限被截断 */
  stepsTruncated?: boolean
  stats: {
    propagationRounds: number
    backtrackCount: number
    elapsedMs: number
  }
  /** 附加统计（界面上展开显示） */
  details?: {
    nodes: number
    failedGuesses: number
    deducedCells: number
    maxDepth: number
  }
  /** status === 'none' 是的矛盾说明 */
  contradiction?: string
  /** 是否被调用方取消 */
  cancelled?: boolean
}

/** 求解请求：只有尺寸与线索，不依赖 Puzzle / 存档 / 计时 */
export interface SolvePuzzleRequest {
  width: number
  height: number
  rowClues: readonly number[][]
  colClues: readonly number[][]
}

/** 可取消信号：浏览器的 AbortSignal 结构上满足它（也便于测试里传一个假对象） */
export interface CancelSignal {
  readonly aborted: boolean
}

export interface SolvePuzzleOptions {
  /** 解的个数统计上限（默认 10，超过即认为"多解"并标记 capped） */
  maxSolutions?: number
  /** 时间上限（毫秒），默认 10 秒 */
  timeLimitMs?: number
  /** 搜索节点上限 */
  nodeLimit?: number
  /** 中途取消 */
  signal?: CancelSignal
  /** 是否记录推理轨迹（默认 true；只要结论不要轨迹时关掉可省内存） */
  recordSteps?: boolean
  /** 推理轨迹的最大步数（默认 800，超出后只在结尾标记截断） */
  maxSteps?: number
}

export const DEFAULT_SOLVE_TIME_LIMIT_MS = 10_000
export const DEFAULT_SOLVE_NODE_LIMIT = 400_000
export const DEFAULT_MAX_SOLUTIONS = 10
export const DEFAULT_MAX_STEPS = 800

/**
 * 单步里最多为多少格生成「详细理由」文本。
 *
 * 理由字符串是整条轨迹里最占内存的东西，所以只给每步前若干格生成；
 * **其余格子照样记录**（只是 reason 为 undefined）—— 逐步演示靠
 * 「把每一步的 cells 依次折叠回棋盘」还原画面（见 core/solverSteps.ts），
 * 少记一格就会让演示出来的棋盘与真实解不一致。
 */
const MAX_REASONS_PER_STEP = 300

/**
 * 整条轨迹最多记录多少格（安全阀）。
 *
 * 一轮传播最多确定 size 个格子，而 50×50 的一步就有 2500 格；不设上限时，
 * 一次深度回溯的长搜索可能累积到上百万个格子对象，把内存吃光。超出后停在
 * 第一个完整的步骤前缀上，并置 truncated 让界面提示「轨迹已截断」——
 * 结论（唯一解 / 多解 / 无解）不受影响，它由求解本身给出。
 */
export const MAX_TRACE_CELLS = 150_000

/** 推理轨迹收集器：带步数 / 总格数上限与取消信号 */
export interface SolveTrace {
  steps: SolveStep[]
  maxSteps: number
  maxCells: number
  /** 已经记录的格子总数（用于判断是否超出 maxCells） */
  cellCount: number
  truncated: boolean
  signal?: CancelSignal
  push(step: SolveStep): void
}

export function createTrace(maxSteps: number, signal?: CancelSignal, maxCells = MAX_TRACE_CELLS): SolveTrace {
  const steps: SolveStep[] = []
  const trace: SolveTrace = {
    steps,
    maxSteps,
    maxCells,
    cellCount: 0,
    truncated: false,
    signal,
    push(step) {
      if (steps.length >= maxSteps) {
        trace.truncated = true
        return
      }
      const cells = step.cells?.length ?? 0
      // cellCount > 0 时才判预算：一步最多 size 格，第一步永远放得下
      if (trace.cellCount > 0 && trace.cellCount + cells > maxCells) {
        trace.truncated = true
        return
      }
      trace.cellCount += cells
      steps.push(step)
    },
  }
  return trace
}

function reasonForCell(
  width: number,
  axis: 'row' | 'col',
  line: number,
  clues: readonly number[],
  index: number,
  value: number,
): string {
  const kind = value === FILLED ? '黑' : '白'
  const clueText = `[${clues.join(' ')}]`
  if (axis === 'row') return `第 ${line + 1} 行线索 ${clueText} ⇒ 第 ${(index % width) + 1} 格必为${kind}`
  return `第 ${line + 1} 列线索 ${clueText} ⇒ 第 ${Math.floor(index / width) + 1} 格必为${kind}`
}

function positionText(width: number, index: number, value: number): string {
  return `第 ${Math.floor(index / width) + 1} 行第 ${(index % width) + 1} 格为${value === FILLED ? '黑' : '白'}`
}

function describeCells(cells: readonly SolveStepCell[]): string {
  let filled = 0
  for (const cell of cells) if (cell.state === 'filled') filled++
  const empty = cells.length - filled
  if (empty === 0) return `全部为黑`
  if (filled === 0) return `全部为白`
  return `${filled} 格为黑、${empty} 格为白`
}

/**
 * 「自动解题」的完整入口：输入尺寸 + 线索，输出结论 + 推理轨迹 + 统计。
 *
 * 流程：
 *   阶段 1  solveFirst（带轨迹）—— 找第一个解，同时记录"人是怎么想出来的"；
 *   阶段 2  countSolutions        —— 数解，判定唯一解 / 多解。
 * 若阶段 1 纯行列传播就填满整盘（guesses === 0），由文件顶部的论证可知必然唯一解，
 * 直接跳过阶段 2（与难度评估 analyzePuzzle 用的是同一条判据）。
 */
export function solvePuzzle(request: SolvePuzzleRequest, options: SolvePuzzleOptions = {}): SolveResult {
  const t0 = clock()
  const { width, height } = request
  const size = width * height
  const maxSolutions = Math.max(2, options.maxSolutions ?? DEFAULT_MAX_SOLUTIONS)
  const timeLimitMs = options.timeLimitMs ?? DEFAULT_SOLVE_TIME_LIMIT_MS
  const nodeLimit = options.nodeLimit ?? DEFAULT_SOLVE_NODE_LIMIT
  const recordSteps = options.recordSteps !== false

  // 求解只需要线索；solution 字段留空（引擎从不读它）
  const puzzle: Puzzle = {
    id: 'solver',
    width,
    height,
    solution: new Uint8Array(size),
    rowClues: request.rowClues as number[][],
    colClues: request.colClues as number[][],
    difficulty: 'medium',
    seed: 'solver',
  }

  const trace = recordSteps ? createTrace(options.maxSteps ?? DEFAULT_MAX_STEPS, options.signal) : null
  const limits = createLimits({ nodeLimit, timeLimitMs })
  const first = solveFirst(createSolverContext(puzzle), createBoard(size), limits, trace)

  const base = () => ({
    steps: trace?.steps ?? [],
    stepsTruncated: trace?.truncated ?? false,
    stats: {
      propagationRounds: first.stats.rounds,
      backtrackCount: first.stats.guesses,
      elapsedMs: Math.round(clock() - t0),
    },
    details: {
      nodes: first.stats.nodes,
      failedGuesses: first.stats.failedGuesses,
      deducedCells: first.stats.deduced,
      maxDepth: first.stats.maxDepth,
    },
  })

  if (first.cancelled || options.signal?.aborted) {
    return { ...base(), status: 'timeout', cancelled: true }
  }

  if (!first.solution) {
    if (first.stats.truncated) {
      return { ...base(), status: limits.timedOut ? 'timeout' : 'unknown' }
    }
    // 搜索空间被穷尽仍无解：挑一条最有说服力的矛盾说明（优先取不依赖假设的那条）
    const atRoot = trace?.steps.filter((s) => s.type === 'contradiction' && s.depth === 0)
    const anyContradiction = trace?.steps.find((s) => s.type === 'contradiction')
    const best = atRoot && atRoot.length > 0 ? atRoot[atRoot.length - 1] : anyContradiction
    return { ...base(), status: 'none', contradiction: best?.description }
  }

  // 纯传播即解出 ⇒ 唯一解（见文件顶部说明），不必再数解
  if (first.stats.guesses === 0) {
    return { ...base(), status: 'unique', solution: first.solution, solutionCount: 1, solutionCountCapped: false }
  }

  const remaining = Math.max(1, timeLimitMs - (clock() - t0))
  const counted = countSolutions(
    createSolverContext(puzzle),
    createBoard(size),
    maxSolutions,
    createLimits({ nodeLimit, timeLimitMs: remaining }),
  )

  if (counted.truncated) {
    // 已经数到 2 个以上 ⇒ 多解是确定结论；否则只能说"未能确认唯一性"
    if (counted.count >= 2) {
      return {
        ...base(),
        status: 'multiple',
        solution: counted.solutions[0],
        alternativeSolution: counted.solutions[1],
        solutionCount: counted.count,
        solutionCountCapped: true,
      }
    }
    return { ...base(), status: 'unknown', solution: first.solution, solutionCount: counted.count || undefined }
  }

  if (counted.count <= 1) {
    return {
      ...base(),
      status: counted.count === 1 ? 'unique' : 'none',
      solution: counted.solutions[0],
      solutionCount: counted.count,
      solutionCountCapped: false,
    }
  }

  return {
    ...base(),
    status: 'multiple',
    solution: counted.solutions[0],
    alternativeSolution: counted.solutions[1],
    solutionCount: counted.count,
    solutionCountCapped: counted.count >= maxSolutions,
  }
}
