/**
 * 游戏状态（Zustand）。
 *
 * 为什么用 Zustand 而不是 Context + reducer：
 *   1. 棋盘是 900 格的高频更新对象，Zustand 的选择器订阅可以让「计时器 / 线索 / 单元格」
 *      各自只订阅自己关心的切片，避免一次涂格就重渲染整个页面；
 *   2. 拖拽绘制、rAF 计时、localStorage 存档都需要在 React 之外读写状态，
 *      Zustand 的 store.getState()/setState() 让这些逻辑不需要包在组件里；
 *   3. 不需要 Provider 嵌套，页面切换时状态天然保留。
 */

import { create } from 'zustand'
import { computeHint, type Hint } from '../core/solver'
import { FILLED, UNKNOWN } from '../core/types'
import type { JudgeMode, Puzzle } from '../core/types'
import {
  clearProgress,
  encodeBoard,
  loadDailyRecords,
  loadHistory,
  pushHistory,
  saveDailyRecord,
  saveProgress,
  submitRecord,
  unlockAchievements,
  type StoredProgress,
} from '../core/storage'
import { achievementContext, evaluateAchievements } from '../core/achievements'
import { utcDateKey } from '../core/dailyChallenge'
import { useSettingsStore } from './settingsStore'

/** 使用一次提示的时间惩罚 */
export const HINT_PENALTY_MS = 15_000
/** 极限模式每涂错一格的时间惩罚 */
export const EXTREME_PENALTY_MS = 10_000
/** 撤销栈深度 */
const HISTORY_LIMIT = 200

export interface StrokeChange {
  index: number
  value: number
}

export interface StrokeOutcome {
  changed: number
  wrongAdded: number
  completed: boolean
}

export interface RestoredGame {
  board: Uint8Array
  elapsedMs: number
  mistakes: number
  hintsUsed: number
  penaltyMs: number
  pauseCount: number
}

interface GameStore {
  puzzle: Puzzle | null
  board: Uint8Array
  /** 0 = 正常，1 = 当前错误（严格模式），2 = 永久红痕（极限模式） */
  wrong: Uint8Array
  judgeMode: JudgeMode

  // 计时：elapsed = accumulatedMs + (runningSince ? now - runningSince : 0)
  accumulatedMs: number
  runningSince: number | null
  paused: boolean
  started: boolean
  completed: boolean
  completedMs: number

  // 统计
  mistakes: number
  hintsUsed: number
  penaltyMs: number
  pauseCount: number
  checks: number

  // 撤销 / 重做
  past: Uint8Array[]
  future: Uint8Array[]

  // 交互
  hoverRow: number
  hoverCol: number
  cursor: number
  notice: string | null
  newRecord: boolean
  /** 本局是否刷新了「零提示」最佳成绩 */
  newNoHintRecord: boolean
  /** 本局新解锁的成就 id（用于结果页与弹窗） */
  unlockedAchievements: string[]

  /**
   * 教程模式（需求 14「不要让教程污染正常游戏数据」）。
   * true 时：不写对局存档、不写成绩 / 历史 / 每日挑战 / 成就，也不会自动判胜。
   */
  tutorial: boolean

  startPuzzle(puzzle: Puzzle, judgeMode: JudgeMode, restored?: RestoredGame | null): void
  /** 用固定教程谜题接管棋盘（教程页调用；不会碰普通对局的存档） */
  beginTutorial(puzzle: Puzzle, board: Uint8Array): void
  /** 退出教程：把教程棋盘从 store 里摘掉，让普通流程重新可用 */
  endTutorial(): void
  restart(): void
  applyStroke(changes: StrokeChange[]): StrokeOutcome
  undo(): void
  redo(): void
  /**
   * 揭示一格提示。
   * 命名成 revealHint 而不是 useHint：它虽然返回提示信息，但**不是** React Hook，
   * 叫 use* 会让 ESLint 的 rules-of-hooks 误判（组件里在事件回调中调用会直接报错）。
   */
  revealHint(): Hint | null
  check(): number
  setPaused(paused: boolean): void
  setHover(row: number, col: number): void
  setCursor(index: number): void
  setNotice(notice: string | null): void
  markWin(nowMs: number): void
  /** 关闭「新解锁成就」的浮动提示 */
  dismissAchievements(): void
}

export function elapsedOf(state: Pick<GameStore, 'accumulatedMs' | 'runningSince'>, now = Date.now()): number {
  return state.accumulatedMs + (state.runningSince ? Math.max(0, now - state.runningSince) : 0)
}

function isBoardComplete(board: Uint8Array, solution: Uint8Array): boolean {
  for (let i = 0; i < board.length; i++) {
    const filled = board[i] === FILLED
    const shouldFill = solution[i] === 1
    if (filled !== shouldFill) return false
  }
  return true
}

/** 依据棋盘与判定模式，重算错误标记（撤销/重做后使用） */
function refreshWrong(board: Uint8Array, prev: Uint8Array, solution: Uint8Array, judgeMode: JudgeMode): Uint8Array {
  if (judgeMode === 'lenient') return new Uint8Array(board.length)
  const next = new Uint8Array(board.length)
  for (let i = 0; i < board.length; i++) {
    if (judgeMode === 'extreme' && prev[i] === 2) {
      next[i] = 2
      continue
    }
    const shouldFill = solution[i] === 1
    const value = board[i]
    const wrong = value !== UNKNOWN && (value === FILLED) !== shouldFill
    next[i] = wrong ? 1 : 0
  }
  return next
}

function persist(state: GameStore): void {
  const puzzle = state.puzzle
  if (!puzzle) return
  // 教程对局不写存档：否则会把玩家「继续上一局」的普通进度覆盖掉（需求 14）
  if (state.tutorial) return
  const snapshot: StoredProgress = {
    puzzleId: puzzle.id,
    difficulty: puzzle.difficulty,
    width: puzzle.width,
    height: puzzle.height,
    seed: puzzle.seed,
    title: puzzle.title,
    source: puzzle.source,
    board: encodeBoard(state.board),
    solution: encodeBoard(puzzle.solution),
    elapsedMs: elapsedOf(state),
    mistakes: state.mistakes,
    hintsUsed: state.hintsUsed,
    penaltyMs: state.penaltyMs,
    pauseCount: state.pauseCount,
    judgeMode: state.judgeMode,
    completed: state.completed,
    updatedAt: Date.now(),
  }
  saveProgress(snapshot)
}

const EMPTY_BOARD = new Uint8Array(0)

export const useGameStore = create<GameStore>()((set, get) => ({
  puzzle: null,
  board: EMPTY_BOARD,
  wrong: EMPTY_BOARD,
  judgeMode: 'lenient',
  tutorial: false,
  accumulatedMs: 0,
  runningSince: null,
  paused: false,
  started: false,
  completed: false,
  completedMs: 0,
  mistakes: 0,
  hintsUsed: 0,
  penaltyMs: 0,
  pauseCount: 0,
  checks: 0,
  past: [],
  future: [],
  hoverRow: -1,
  hoverCol: -1,
  cursor: 0,
  notice: null,
  newRecord: false,
  newNoHintRecord: false,
  unlockedAchievements: [],

  startPuzzle(puzzle, judgeMode, restored) {
    const size = puzzle.width * puzzle.height
    const board = restored?.board?.length === size ? restored.board : new Uint8Array(size)
    set({
      puzzle,
      board,
      wrong: new Uint8Array(size),
      judgeMode,
      accumulatedMs: restored?.elapsedMs ?? 0,
      // 恢复未完成的对局时立刻继续计时：否则「刷新页面」就等于免费暂停，
      // 计时与成绩就不可比了（真正暂停请用暂停按钮，暂停期间遮住棋盘）。
      runningSince: (restored?.elapsedMs ?? 0) > 0 ? Date.now() : null,
      paused: false,
      started: (restored?.elapsedMs ?? 0) > 0,
      completed: false,
      completedMs: 0,
      mistakes: restored?.mistakes ?? 0,
      hintsUsed: restored?.hintsUsed ?? 0,
      penaltyMs: restored?.penaltyMs ?? 0,
      pauseCount: restored?.pauseCount ?? 0,
      checks: 0,
      past: [],
      future: [],
      hoverRow: -1,
      hoverCol: -1,
      cursor: 0,
      notice: null,
      newRecord: false,
      newNoHintRecord: false,
      unlockedAchievements: [],
      tutorial: false,
    })
  },

  beginTutorial(puzzle, board) {
    const size = puzzle.width * puzzle.height
    const restored: RestoredGame = {
      board: board.length === size ? board : new Uint8Array(size),
      elapsedMs: 0,
      mistakes: 0,
      hintsUsed: 0,
      penaltyMs: 0,
      pauseCount: 0,
    }
    // 教程固定用宽松判定：点错不标红（反馈由教程自己给，语气是「还差一点」而不是判错）
    get().startPuzzle(puzzle, 'lenient', restored)
    set({ tutorial: true })
  },

  endTutorial() {
    /*
     * 只清内存状态，**不动 localStorage**：
     * 玩家未完成的普通对局还躺在存档里，什么时候恢复由调用方决定
     * （TutorialPage 会在退出时按需 restoreFromStored 回来）。
     */
    set({
      tutorial: false,
      puzzle: null,
      board: new Uint8Array(0),
      wrong: new Uint8Array(0),
      past: [],
      future: [],
      started: false,
      completed: false,
      completedMs: 0,
      runningSince: null,
      paused: false,
      notice: null,
      hoverRow: -1,
      hoverCol: -1,
      cursor: 0,
      newRecord: false,
      newNoHintRecord: false,
      unlockedAchievements: [],
    })
  },

  restart() {
    const { puzzle, judgeMode } = get()
    if (!puzzle) return
    // 必须同时清掉本地存档：否则「重开后先刷新一次」会把重开前的棋盘恢复回来
    clearProgress()
    get().startPuzzle(puzzle, judgeMode, null)
  },

  applyStroke(changes) {
    const state = get()
    const { puzzle, board, judgeMode, completed, paused } = state
    if (!puzzle || completed || paused) return { changed: 0, wrongAdded: 0, completed: false }

    const effective = changes.filter((c) => c.index >= 0 && c.index < board.length && board[c.index] !== c.value)
    if (effective.length === 0) return { changed: 0, wrongAdded: 0, completed: false }

    const nextBoard = board.slice()
    const nextWrong = state.wrong.slice()
    let wrongAdded = 0
    let mistakes = state.mistakes
    let penalty = 0

    for (const { index, value } of effective) {
      nextBoard[index] = value
      if (judgeMode === 'lenient') continue
      const shouldFill = puzzle.solution[index] === 1
      const mistaken = value !== UNKNOWN && (value === FILLED) !== shouldFill
      if (mistaken) {
        if (nextWrong[index] !== 2) {
          wrongAdded++
          mistakes++
          if (judgeMode === 'extreme') penalty += EXTREME_PENALTY_MS
        }
        nextWrong[index] = judgeMode === 'extreme' ? 2 : 1
      } else if (nextWrong[index] === 1) {
        nextWrong[index] = 0
      }
    }

    const now = Date.now()
    const next = {
      board: nextBoard,
      wrong: nextWrong,
      mistakes,
      penaltyMs: state.penaltyMs + penalty,
      accumulatedMs: state.accumulatedMs + penalty,
      started: true,
      runningSince: state.runningSince ?? now,
      past: [...state.past, board].slice(-HISTORY_LIMIT),
      future: [],
      cursor: effective[effective.length - 1].index,
      notice: null,
    }
    set(next)

    const done = isBoardComplete(nextBoard, puzzle.solution)
    // 教程模式不让引擎自动判胜：什么时候算「通关」由教程自己决定（见 store/tutorialStore.ts）
    if (done && !state.tutorial) {
      get().markWin(now)
    } else {
      persist({ ...state, ...next })
    }
    return { changed: effective.length, wrongAdded, completed: done }
  },

  markWin(nowMs) {
    const state = get()
    const { puzzle, mistakes, hintsUsed, judgeMode } = state
    if (!puzzle || state.completed) return
    const finalMs = elapsedOf(state, nowMs)
    /*
     * 教程模式：只把棋盘切到「已完成」用于展示动画，
     * 不写最佳成绩 / 历史成绩 / 每日挑战记录 / 成就，也不清掉普通对局的存档（需求 14）。
     */
    if (state.tutorial) {
      set({ completed: true, completedMs: finalMs, runningSince: null, paused: false })
      return
    }
    /** 本局是否暂停过：暂停过的成绩不能算「纯净成绩」（需求 29 的公平性要求） */
    const paused = state.pauseCount > 0
    set({ completed: true, completedMs: finalMs, runningSince: null, paused: false })

    const outcome = submitRecord(puzzle.difficulty, puzzle.seed, {
      timeMs: finalMs,
      mistakes,
      hintsUsed,
      paused,
      judgeMode,
      at: nowMs,
    })

    const isDaily = puzzle.source === 'daily'
    pushHistory({
      puzzleId: puzzle.id,
      difficulty: puzzle.difficulty,
      width: puzzle.width,
      height: puzzle.height,
      seed: puzzle.seed,
      title: puzzle.title,
      timeMs: finalMs,
      mistakes,
      hintsUsed,
      paused,
      judgeMode,
      daily: isDaily,
      completedAt: nowMs,
    })

    // 每日挑战要单独留一份记录：统计页的「连续天数」和每日挑战成就都只看它
    if (isDaily) {
      saveDailyRecord({
        date: utcDateKey(new Date(nowMs)),
        seed: puzzle.seed,
        difficulty: puzzle.difficulty,
        width: puzzle.width,
        height: puzzle.height,
        timeMs: finalMs,
        mistakes,
        hintsUsed,
        paused,
        completedAt: nowMs,
      })
    }

    // 成就从「累计数据」推导，再把本次新达成的写进存档（必须在 daily 记录之后算）
    const fresh = unlockAchievements(evaluateAchievements(achievementContext(loadHistory(), loadDailyRecords())))

    clearProgress()
    set({
      newRecord: outcome.isBest,
      newNoHintRecord: outcome.isBestNoHints,
      unlockedAchievements: fresh,
      notice: null,
    })
  },

  undo() {
    const state = get()
    const { puzzle, past, board } = state
    if (!puzzle || past.length === 0 || state.completed) return
    const prev = past[past.length - 1]
    const next = {
      board: prev,
      wrong: refreshWrong(prev, state.wrong, puzzle.solution, state.judgeMode),
      past: past.slice(0, -1),
      future: [board, ...state.future].slice(0, HISTORY_LIMIT),
    }
    set(next)
    persist({ ...state, ...next })
  },

  redo() {
    const state = get()
    const { puzzle, future, board } = state
    if (!puzzle || future.length === 0 || state.completed) return
    const nextBoard = future[0]
    const next = {
      board: nextBoard,
      wrong: refreshWrong(nextBoard, state.wrong, puzzle.solution, state.judgeMode),
      past: [...state.past, board].slice(-HISTORY_LIMIT),
      future: future.slice(1),
    }
    set(next)
    persist({ ...state, ...next })
  },

  revealHint() {
    const state = get()
    const { puzzle, board, completed } = state
    if (!puzzle || completed) return null
    const hint = computeHint(puzzle, board)
    if (!hint) return null

    const nextBoard = board.slice()
    nextBoard[hint.index] = hint.value
    const now = Date.now()
    // 提示罚时可以在设置里关掉（默认开启）
    const penalty = useSettingsStore.getState().hintPenalty ? HINT_PENALTY_MS : 0
    const next = {
      board: nextBoard,
      wrong: state.wrong.slice(),
      hintsUsed: state.hintsUsed + 1,
      penaltyMs: state.penaltyMs + penalty,
      accumulatedMs: state.accumulatedMs + penalty,
      started: true,
      runningSince: state.runningSince ?? now,
      past: [...state.past, board].slice(-HISTORY_LIMIT),
      future: [],
      cursor: hint.index,
      notice: `${hint.isGuess ? '这一步无法用逻辑推出，已揭示一格（属于猜测提示）' : '已按逻辑推理揭示下一格'}${
        penalty > 0 ? ` · +${penalty / 1000}s` : ''
      }`,
    }
    set(next)
    if (isBoardComplete(nextBoard, puzzle.solution)) get().markWin(now)
    else persist({ ...state, ...next })
    return hint
  },

  check() {
    const state = get()
    const { puzzle, board, judgeMode } = state
    if (!puzzle) return 0
    if (judgeMode !== 'lenient') {
      const count = state.wrong.reduce((acc, v) => acc + (v ? 1 : 0), 0)
      set({ notice: count ? `当前有 ${count} 处标红错误` : '目前没有错误', checks: state.checks + 1 })
      return count
    }
    const nextWrong = state.wrong.slice()
    let found = 0
    for (let i = 0; i < board.length; i++) {
      const shouldFill = puzzle.solution[i] === 1
      const value = board[i]
      if (value === UNKNOWN) continue
      const mistaken = (value === FILLED) !== shouldFill
      if (mistaken && nextWrong[i] !== 1) {
        nextWrong[i] = 1
        found++
      } else if (!mistaken && nextWrong[i] === 1) {
        nextWrong[i] = 0
      }
    }
    set({
      wrong: nextWrong,
      mistakes: state.mistakes + found,
      checks: state.checks + 1,
      notice: found ? `检查发现 ${found} 处错误，已标红` : '检查通过，目前没有错误',
    })
    return found
  },

  setPaused(paused) {
    const state = get()
    if (state.completed) return
    const now = Date.now()
    if (paused) {
      set({
        paused: true,
        accumulatedMs: elapsedOf(state, now),
        runningSince: null,
        // 暂停次数用于区分「纯净成绩」：暂停过就不算零暂停通关
        pauseCount: state.pauseCount + 1,
      })
    } else {
      set({ paused: false, runningSince: state.started ? now : state.runningSince })
    }
    persist(get())
  },

  setHover(row, col) {
    const state = get()
    if (state.hoverRow === row && state.hoverCol === col) return
    set({ hoverRow: row, hoverCol: col })
  },

  setCursor(index) {
    set({ cursor: index })
  },

  setNotice(notice) {
    set({ notice })
  },

  dismissAchievements() {
    if (get().unlockedAchievements.length === 0) return
    set({ unlockedAchievements: [] })
  },
}))
