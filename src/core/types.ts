/**
 * 全局共享类型与常量。
 *
 * 棋盘/解题网格统一使用数字编码（性能考虑，全程使用 TypedArray）：
 *   0 = UNKNOWN 未知（玩家棋盘上的“空格”）
 *   1 = FILLED  填充（黑格）
 *   2 = EMPTY   已知为空（玩家棋盘上的 X 标记）
 *
 * 这个统一编码让「求解器棋盘」与「玩家棋盘」可以共用同一套数据结构：
 * 对求解器来说 2 表示“已知必须为白”，对玩家来说 2 表示“我标记它为空”。
 */

export const UNKNOWN = 0
export const FILLED = 1
export const EMPTY = 2

export type CellState = 'empty' | 'filled' | 'marked'
export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert'
export type JudgeMode = 'lenient' | 'strict' | 'extreme'
export type ThemeMode = 'light' | 'dark' | 'system'

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard', 'expert']

/** 数字编码 ↔ 字符串状态 互转 */
export const CELL_TO_STATE: readonly CellState[] = ['empty', 'filled', 'marked']
export const STATE_TO_CELL: Record<CellState, number> = { empty: UNKNOWN, filled: FILLED, marked: EMPTY }

export function cellToState(value: number): CellState {
  return CELL_TO_STATE[value] ?? 'empty'
}

export function stateToCell(state: CellState): number {
  return STATE_TO_CELL[state]
}

export interface Puzzle {
  id: string
  width: number
  height: number
  /** 0/1 数组，长度 width*height，行优先 */
  solution: Uint8Array
  /** 每行线索；空行用 [0] 表示 */
  rowClues: number[][]
  colClues: number[][]
  difficulty: Difficulty
  /** 生成用种子，保证可复现 */
  seed: string
  /** 可选标题（自定义谜题/每日一题用） */
  title?: string
}

/** 求解器在解题过程中统计出来的“人类推理成本”指标 */
export interface DifficultyMetrics {
  /** 直到求出第一个解为止，尝试过的假设（猜测）总次数 —— 对应“回溯次数” */
  guesses: number
  /** 落入矛盾而失败的假设次数（越多说明需要付出试错成本） */
  failedGuesses: number
  /** 求出第一个解时的假设链深度（>1 表示需要“深层假设”） */
  solutionDepth: number
  /** 求解第一个解时，整盘行列约束传播的轮数 */
  propagationRounds: number
  /** 传播过程中被确定的格子数（反映推理强度） */
  deducedCells: number
  /** 求解过程中访问的搜索节点数（性能指标，也反映复杂度） */
  nodes: number
  /** 棋盘填充率 */
  fillRatio: number
  /** 最长单条线索长度 */
  maxClue: number
  /** 线索数量（行+列），越多说明图案越碎 */
  clueCount: number
  /** “长线索交叉”的格子数量：该格所在行、列的最长线索都 >= 该方向长度的 50% */
  longCrossings: number
  /** 分析耗时（毫秒） */
  timeMs: number
  /** 是否因为节点/时间上限而提前终止（此时指标不可信） */
  truncated: boolean
}

export interface DifficultyAssessment {
  difficulty: Difficulty
  /** 0~100 的连续难度分，便于展示与排序（分级本身用规则判定，见 difficulty.ts） */
  score: number
  metrics: DifficultyMetrics
  /** 是否唯一解：true=唯一 / false=多解 / 'unknown'=超出预算无法判定 */
  unique: boolean | 'unknown'
}

export const DIFFICULTY_META: Record<
  Difficulty,
  {
    label: string
    /**
     * 自动生成时该档固定使用的**盘面边长**（正方形，且一定是 5 的倍数）。
     * 需求要求生成出来的题目只能是 5×5 / 10×10 / 15×15 / 20×20 这类盘面，
     * 因此每档只对应一个尺寸，而不是在区间里随机取（随机取会产出 11×12、15×10 这种盘面）。
     */
    boardSize: number
    /** 需求难度表里该档的尺寸区间（含端点）：用于对外说明 / 文档，生成时不再随机取值 */
    minSize: number
    maxSize: number
    /** 生成时的目标填充率区间 */
    fillMin: number
    fillMax: number
    description: string
    accent: string
  }
> = {
  easy: {
    label: '简单',
    boardSize: 5,
    minSize: 5,
    maxSize: 10,
    fillMin: 0.4,
    fillMax: 0.6,
    description: '纯行列约束传播即可解出，无需任何猜测',
    accent: 'emerald',
  },
  medium: {
    label: '中等',
    boardSize: 10,
    minSize: 10,
    maxSize: 15,
    fillMin: 0.45,
    fillMax: 0.62,
    description: '需要多轮行列交叉传播，回溯 0~2 次',
    accent: 'sky',
  },
  hard: {
    label: '困难',
    boardSize: 15,
    minSize: 15,
    maxSize: 20,
    fillMin: 0.5,
    fillMax: 0.68,
    description: '需要 3~10 次回溯，或存在长线索交叉',
    accent: 'amber',
  },
  expert: {
    label: '专家',
    boardSize: 20,
    minSize: 20,
    maxSize: 25,
    fillMin: 0.52,
    fillMax: 0.7,
    description: '回溯超过 10 次，或需要深层假设链',
    accent: 'rose',
  },
}

/** 编辑器允许的尺寸范围 */
export const MIN_EDITOR_SIZE = 5
export const MAX_EDITOR_SIZE = 50

/** 游戏内允许的最大棋盘边长（超过此值仅编辑器可用） */
export const MAX_PLAY_SIZE = 25

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && (DIFFICULTIES as readonly string[]).includes(value)
}
