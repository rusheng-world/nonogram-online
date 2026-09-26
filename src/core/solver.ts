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
import type { Puzzle } from './types'

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
  stats: PropagateStats
}

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

/**
 * 行列约束传播到不动点。
 * @returns false 表示出现矛盾（该分支无解）
 */
export function propagate(ctx: SolverContext, board: Uint8Array, stats?: PropagateStats): boolean {
  const { width, height, ws, line, trail, log } = ctx
  const s = stats ?? ctx.stats
  for (;;) {
    s.rounds++
    let changed = false

    // 行
    for (let y = 0; y < height; y++) {
      const off = y * width
      for (let x = 0; x < width; x++) line[x] = board[off + x]
      const res = solveLine(ctx.rowClues[y], line, width, ws)
      if (res.contradiction) return false
      const out = ws.out
      for (let x = 0; x < width; x++) {
        const value = out[x]
        if (value !== UNKNOWN && board[off + x] === UNKNOWN) {
          board[off + x] = value
          trail.push(off + x)
          if (log) log.push(off + x, value)
          s.deduced++
          changed = true
        }
      }
    }

    // 列
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) line[y] = board[y * width + x]
      const res = solveLine(ctx.colClues[x], line, height, ws)
      if (res.contradiction) return false
      const out = ws.out
      for (let y = 0; y < height; y++) {
        const value = out[y]
        if (value !== UNKNOWN && board[y * width + x] === UNKNOWN) {
          board[y * width + x] = value
          trail.push(y * width + x)
          if (log) log.push(y * width + x, value)
          s.deduced++
          changed = true
        }
      }
    }

    if (!changed) return true
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
  /** 尝试过的假设次数（含失败分支） —— 即“回溯次数” */
  guesses: number
  /** 落入矛盾的假设次数 */
  failedGuesses: number
  /** 得到解时所在的假设链深度（0 = 纯传播） */
  solutionDepth: number
  /** 传播轮数（取搜索路径上的最大值） */
  rounds: number
  /** 传播过程中被确定的格子总数 */
  deduced: number
  nodes: number
  truncated: boolean
}

function emptyStats(): SolveStats {
  return { guesses: 0, failedGuesses: 0, solutionDepth: 0, rounds: 0, deduced: 0, nodes: 0, truncated: false }
}

export interface SolveOutcome {
  solution: Uint8Array | null
  stats: SolveStats
}

/**
 * 求出**一个**解，同时统计人类解题所需的推理成本。
 * 假设顺序固定（先黑后白）+ 固定启发式 ⇒ 同一谜题的指标完全可复现。
 */
export function solveFirst(ctx: SolverContext, board: Uint8Array, limits: SearchLimits): SolveOutcome {
  const stats = emptyStats()
  resetStats(ctx)

  const dfs = (depth: number): Uint8Array | null => {
    if (budgetExceeded(limits)) {
      stats.truncated = true
      return null
    }
    limits.nodes++
    stats.nodes++
    const mark = ctx.trail.length
    if (!propagate(ctx, board)) {
      revert(board, ctx, mark)
      return null
    }
    if (ctx.stats.rounds > stats.rounds) stats.rounds = ctx.stats.rounds
    if (ctx.stats.deduced > stats.deduced) stats.deduced = ctx.stats.deduced

    const idx = firstUnknown(board)
    if (idx === -1) {
      const solution = new Uint8Array(board.length)
      for (let i = 0; i < board.length; i++) solution[i] = board[i] === FILLED ? 1 : 0
      stats.solutionDepth = depth
      revert(board, ctx, mark)
      return solution
    }

    const cell = chooseBranchCell(ctx, board)
    for (const value of [FILLED, EMPTY]) {
      board[cell] = value
      ctx.trail.push(cell)
      stats.guesses++
      const found = dfs(depth + 1)
      revert(board, ctx, mark)
      if (found) return found
      if (!stats.truncated) stats.failedGuesses++
      else return null
    }
    return null
  }

  const solution = dfs(0)
  return { solution, stats }
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
  const limits = createLimits({ nodeLimit: 20_000, timeLimitMs: 200 })
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
  void limits
  return { index: cell, value, isGuess: true }
}
