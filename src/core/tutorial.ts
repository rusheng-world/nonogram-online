/**
 * 新手教程的题目、阶段定义与纯逻辑（需求 5 / 16 / 17 / 18）。
 *
 * 设计要点
 * ---------------------------------------------------------------------------
 * · **固定谜题**：教程不使用 generatePuzzle()，而是写死一个 5×5 图案。
 *   这样每一步教什么完全可控，测试也稳定（需求 17）。
 * · **必须唯一解**：固定题一样要过求解器。tests/tutorial.test.ts 里用
 *   solvePuzzle() 断言 status === 'unique'，并且额外断言「每一步的目标格子
 *   在当时的棋盘上确实能被行列传播推出来」——保证教程说的每一句话都是真的。
 * · **复用游戏引擎**：这里的 Puzzle 直接交给 gameStore / GameBoard 使用，
 *   没有第二套棋盘组件（需求 4「不要新建 TutorialBoard」）。
 * · **教学顺序**：7 个阶段的图案是同一个「星芒」，玩家一路把同一张图拼出来，
 *   而不是做 7 道无关的小题 —— 这样最后一步真的能「完成整张图」。
 */

import { computeClues } from './clues'
import { EMPTY, FILLED } from './types'
import type { Puzzle } from './types'
import { TUTORIAL_FEEDBACK, TUTORIAL_STEP_TEXT } from './tutorialContent'

/** 教程图案边长（5×5，需求里建议的尺寸） */
export const TUTORIAL_SIZE = 5

/** 教程图案（需求 6）：中间两行 + 中间一列 + 下方三组单格，像一个星芒 */
export const TUTORIAL_ROWS: readonly string[] = ['..#..', '#####', '#####', '#.#.#', '..#..']

/** 教程谜题的固定种子（成绩不落库，仅用于 id 可读） */
export const TUTORIAL_SEED = 'tutorial-star'

/** 0/1 数组形态的答案 */
export function tutorialSolution(): Uint8Array {
  const solution = new Uint8Array(TUTORIAL_SIZE * TUTORIAL_SIZE)
  for (let y = 0; y < TUTORIAL_SIZE; y++) {
    const row = TUTORIAL_ROWS[y] ?? ''
    for (let x = 0; x < TUTORIAL_SIZE; x++) if (row[x] === '#') solution[y * TUTORIAL_SIZE + x] = 1
  }
  return solution
}

/** 固定的教程谜题（source = 'tutorial'，游戏侧见到它就不会写任何成绩） */
export function tutorialPuzzle(): Puzzle {
  const solution = tutorialSolution()
  const { rowClues, colClues } = computeClues(solution, TUTORIAL_SIZE, TUTORIAL_SIZE)
  return {
    id: `tutorial-${TUTORIAL_SIZE}x${TUTORIAL_SIZE}`,
    width: TUTORIAL_SIZE,
    height: TUTORIAL_SIZE,
    solution,
    rowClues,
    colClues,
    difficulty: 'easy',
    seed: TUTORIAL_SEED,
    title: '新手教程 · 星芒',
    source: 'tutorial',
  }
}

/** 某个阶段要在棋盘上新完成的格子 */
export interface TutorialGoal {
  /** 必须涂黑的格子下标（行优先） */
  fills: number[]
  /** 必须标记为空的格子下标 */
  marks: number[]
}

/** 教学高亮：其余区域降低视觉权重，帮助新手「只看这一部分」 */
export interface TutorialHighlight {
  /** 高亮的行（0 基） */
  rows?: number[]
  /** 高亮的列（0 基） */
  cols?: number[]
}

/** 一个教学阶段 */
export interface TutorialStep {
  id: string
  /** 1 起的阶段序号（0 是欢迎页，8 是完成页） */
  index: number
  title: string
  body: string[]
  hint: string
  success: string
  /** 本阶段新增的目标（相对上一阶段） */
  goal: TutorialGoal
  highlight?: TutorialHighlight
  /** 本阶段推荐的笔尖：进入阶段时自动切换，并高亮对应的模式按钮 */
  preferAction: 'fill' | 'mark'
}

/** 把 (行, 列) 换成行优先下标，避免手写魔数写错 */
function at(row: number, col: number): number {
  return row * TUTORIAL_SIZE + col
}

function step(
  id: string,
  index: number,
  goal: TutorialGoal,
  preferAction: 'fill' | 'mark',
  highlight?: TutorialHighlight,
): TutorialStep {
  const text = TUTORIAL_STEP_TEXT[id]
  return {
    id,
    index,
    title: text.title,
    body: text.body,
    hint: text.hint,
    success: text.success,
    goal,
    highlight,
    preferAction,
  }
}

/**
 * 7 个教学阶段（需求 7 的 Stage 1 ~ Stage 7）。
 *
 * 每一步的「目标格子」都是在**上一步完成后的棋盘**上能被行列约束传播唯一确定的格子，
 * 所以教程不会要求玩家去猜（tests/tutorial.test.ts 会逐条验证这一点）。
 */
export const TUTORIAL_STEPS: TutorialStep[] = [
  // Stage 1：数字 = 连续黑格。第 2 行线索 [5] → 整行涂黑。
  step('numbers', 1, { fills: [5, 6, 7, 8, 9].map((i) => i), marks: [] }, 'fill', { rows: [1] }),
  // Stage 2：同一个数字出现在第 3 行 —— 数字不指定位置。
  step('position', 2, { fills: [10, 11, 12, 13, 14], marks: [] }, 'fill', { rows: [2] }),
  // Stage 3：多组数字 1 1 1；中间那格由第 3 列的 [5] 决定。
  step('groups', 3, { fills: [at(3, 0), at(3, 2), at(3, 4)], marks: [] }, 'fill', { rows: [3], cols: [2] }),
  // Stage 4：列线索 —— 第 3 列（[5]）还差最上、最下两格。
  step('crossing', 4, { fills: [at(0, 2), at(4, 2)], marks: [] }, 'fill', { cols: [2] }),
  // Stage 5：学会用 × 标记确定为空的位置（第 1 行只剩一个黑格）。
  step('marks', 5, { fills: [], marks: [at(0, 0), at(0, 1), at(0, 3), at(0, 4)] }, 'mark', { rows: [0] }),
  // Stage 6：组合推理 —— 第 5 行 [1] 与第 3 列 [5] 的交叉点。
  step('deduction', 6, { fills: [], marks: [at(4, 0), at(4, 1), at(4, 3), at(4, 4)] }, 'mark', {
    rows: [4],
    cols: [2],
  }),
  // Stage 7：最后两格，完成整张图。
  step('finish', 7, { fills: [], marks: [at(3, 1), at(3, 3)] }, 'mark', { rows: [3] }),
]

/** 教学阶段总数（进度显示用） */
export const TUTORIAL_STEP_COUNT = TUTORIAL_STEPS.length

/** 完成第 stepIndex 步（含）之前的所有目标之后，棋盘应该长什么样 */
export function tutorialBoardAtStep(stepIndex: number): Uint8Array {
  const board = new Uint8Array(TUTORIAL_SIZE * TUTORIAL_SIZE)
  for (let i = 1; i < stepIndex; i++) {
    const goal = TUTORIAL_STEPS[i - 1]?.goal
    if (!goal) continue
    for (const cell of goal.fills) board[cell] = FILLED
    for (const cell of goal.marks) board[cell] = EMPTY
  }
  return board
}

/** 第 stepIndex 步（含）之前的所有目标是否都已达成（回头改坏了也不会误判通过） */
export function isStepComplete(stepIndex: number, board: ArrayLike<number>): boolean {
  for (let i = 1; i <= stepIndex; i++) {
    const goal = TUTORIAL_STEPS[i - 1]?.goal
    if (!goal) continue
    for (const cell of goal.fills) if (board[cell] !== FILLED) return false
    for (const cell of goal.marks) if (board[cell] !== EMPTY) return false
  }
  return true
}

/** 整张图是否已经完成（判定口径与游戏一致：只看「涂黑」的格子） */
export function isTutorialSolved(board: ArrayLike<number>): boolean {
  const solution = tutorialSolution()
  for (let i = 0; i < solution.length; i++) {
    if ((board[i] === FILLED) !== (solution[i] === 1)) return false
  }
  return true
}

/** 教程棋盘要拦截的一次落笔（与 gameStore.StrokeChange 同构，避免 core 反向依赖 store） */
export interface TutorialStrokeChange {
  index: number
  value: number
}

export interface StrokeVerdict {
  /** true = 放行这次落笔 */
  ok: boolean
  /** 被拒绝时给玩家的鼓励式说明 */
  message?: string
  /** 被拒绝的格子（界面用柔和描边指出来，不判错、不扣分） */
  softCells?: number[]
}

/**
 * 落笔校验（需求 8「强制操作约束」+ 需求 9「鼓励式反馈」）。
 *
 * 只拦「和答案矛盾」的操作，并且把整个笔触退回去（由 GameBoard 负责回滚视觉）：
 *   · 涂黑一个答案里是空白的格子 -> 拦下，说明「这一格是空的」
 *   · 把答案里要涂黑的格子标成空 -> 拦下，说明「这一格要涂黑」
 * 其余情况（取消涂格、在空白格上打 ×）一律放行 —— 打 × 本身是正确的逻辑动作，
 * 拦它只会让人觉得被惩罚。
 */
export function evaluateStroke(changes: readonly TutorialStrokeChange[], step: TutorialStep): StrokeVerdict {
  const solution = tutorialSolution()
  const bad: number[] = []
  let message: string | undefined

  for (const change of changes) {
    if (change.index < 0 || change.index >= solution.length) {
      bad.push(change.index)
      message ??= TUTORIAL_FEEDBACK.fillWrong
      continue
    }
    const shouldFill = solution[change.index] === 1
    if (change.value === FILLED && !shouldFill) {
      bad.push(change.index)
      message ??= step.preferAction === 'mark' ? TUTORIAL_FEEDBACK.markInstead : TUTORIAL_FEEDBACK.fillWrong
    } else if (change.value === EMPTY && shouldFill) {
      bad.push(change.index)
      message ??= TUTORIAL_FEEDBACK.eraseFilled
    }
  }

  if (bad.length === 0) return { ok: true }
  return { ok: false, message, softCells: bad }
}
