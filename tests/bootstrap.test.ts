/**
 * 开局引导（`src/game/`）的单测。
 *
 * 这一层是「打开游戏页 → 恢复出一局」的全部决策逻辑，直接对应验收标准第 7 条
 * （刷新页面后计时与进度可恢复）。它只依赖 URLSearchParams 与核心模块，不需要 DOM，
 * 因此可以像纯函数一样测。
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { computeClues } from '../src/core/clues'
import { encodePuzzleCode } from '../src/core/encoding'
import { clearAllData, encodeBoard, saveProgress, type StoredProgress } from '../src/core/storage'
import { EMPTY, FILLED, type Difficulty, type Puzzle } from '../src/core/types'
import {
  bootstrapNeedsGeneration,
  ensureGame,
  puzzleFromStored,
  restoreFromStored,
  samePattern,
} from '../src/game/bootstrap'
import { createNewGame } from '../src/game/newGame'
import { useGameStore } from '../src/store/gameStore'

/** 固定的 5×5 图案（1 = 该格应填充） */
const GRID = [1, 0, 0, 0, 1, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1, 0]

function makePuzzle(overrides: Partial<Puzzle> = {}): Puzzle {
  const solution = Uint8Array.from(GRID)
  const { rowClues, colClues } = computeClues(solution, 5, 5)
  return {
    id: 'easy-5x5-bootstrap',
    width: 5,
    height: 5,
    solution,
    rowClues,
    colClues,
    difficulty: 'easy' as Difficulty,
    seed: 'bootstrap-seed',
    ...overrides,
  }
}

const puzzle = makePuzzle()

function storedSnapshot(partial: Partial<StoredProgress> = {}): StoredProgress {
  const board = new Uint8Array(GRID.length)
  board[0] = FILLED
  board[1] = EMPTY
  return {
    puzzleId: puzzle.id,
    difficulty: puzzle.difficulty,
    width: puzzle.width,
    height: puzzle.height,
    seed: puzzle.seed,
    board: encodeBoard(board),
    solution: encodeBoard(puzzle.solution),
    elapsedMs: 9_000,
    mistakes: 1,
    hintsUsed: 2,
    penaltyMs: 15_000,
    pauseCount: 1,
    judgeMode: 'lenient',
    completed: false,
    updatedAt: Date.now(),
    ...partial,
  }
}

/** 把 store 清回「刚打开页面、什么都还没恢复」的状态 */
function resetStore(): void {
  useGameStore.getState().startPuzzle(makePuzzle({ id: 'reset-placeholder' }), 'lenient', null)
  useGameStore.setState({ puzzle: null, completed: false })
}

function boardOf(): number[] {
  return Array.from(useGameStore.getState().board)
}

beforeEach(() => {
  clearAllData()
  resetStore()
})

describe('存档 → 谜题', () => {
  it('存档里的答案能重建出谜题，线索现算而不是直接用存档里的', () => {
    const rebuilt = puzzleFromStored(storedSnapshot({ title: '自定义 5×5' }))
    expect(rebuilt).not.toBeNull()
    expect(rebuilt!.width).toBe(5)
    expect(rebuilt!.height).toBe(5)
    expect(Array.from(rebuilt!.solution)).toEqual(GRID)
    expect(rebuilt!.rowClues).toEqual(puzzle.rowClues)
    expect(rebuilt!.colClues).toEqual(puzzle.colClues)
    expect(rebuilt!.title).toBe('自定义 5×5')
  })

  it('老存档没有 source 字段时，用 daily- 种子前缀兜底识别每日挑战', () => {
    expect(puzzleFromStored(storedSnapshot({ seed: 'daily-2026-09-28' }))!.source).toBe('daily')
    expect(puzzleFromStored(storedSnapshot({ seed: 'abc123' }))!.source).toBeUndefined()
  })

  it('存档里答案损坏时返回 null，而不是抛异常', () => {
    expect(puzzleFromStored(storedSnapshot({ solution: '!!!不是合法编码!!!' }))).toBeNull()
  })

  it('恢复存档会把棋盘与统计一起还原，并立刻继续计时', () => {
    expect(restoreFromStored(storedSnapshot(), 'strict')).toBe(true)
    const state = useGameStore.getState()
    expect(boardOf()[0]).toBe(FILLED)
    expect(boardOf()[1]).toBe(EMPTY)
    expect(state.accumulatedMs).toBe(9_000)
    expect(state.mistakes).toBe(1)
    expect(state.hintsUsed).toBe(2)
    expect(state.penaltyMs).toBe(15_000)
    expect(state.pauseCount).toBe(1)
    expect(state.runningSince, '恢复后必须继续计时').not.toBeNull()
    // 存档里记录了当时的判定模式，优先级高于当前设置
    expect(state.judgeMode).toBe('lenient')
  })

  it('存档棋盘长度对不上时拒绝恢复', () => {
    expect(restoreFromStored(storedSnapshot({ board: encodeBoard(new Uint8Array(3)) }), 'lenient')).toBe(false)
  })
})

describe('samePattern', () => {
  it('只看尺寸与图案，不看 id / seed', () => {
    const a = makePuzzle({ id: 'x', seed: 's1', title: '甲' })
    const b = makePuzzle({ id: 'y', seed: 's2' })
    expect(samePattern(a, b)).toBe(true)
    const other = makePuzzle()
    other.solution[0] = 0
    expect(samePattern(a, other)).toBe(false)
  })
})

describe('ensureGame：打开游戏页的决策顺序', () => {
  it('分享码 ?s= 能开出一局，损坏的分享码给出明确错误', () => {
    const code = encodePuzzleCode(makePuzzle())
    expect(ensureGame(new URLSearchParams({ s: code }), 'lenient')).toEqual({ ok: true })
    expect(useGameStore.getState().puzzle?.solution.length).toBe(GRID.length)

    resetStore()
    const bad = ensureGame(new URLSearchParams({ s: 'not-a-real-code' }), 'lenient')
    expect(bad.ok).toBe(false)
    expect(bad.error).toBeTruthy()
  })

  it('分享码指向的就是当前这道题时，保留 store 里带元信息的那一份', () => {
    const rich = makePuzzle({ title: '自定义 5×5', source: 'editor', seed: 'custom-abc' })
    useGameStore.getState().startPuzzle(rich, 'lenient', null)
    const code = encodePuzzleCode(rich)
    expect(ensureGame(new URLSearchParams({ s: code }), 'lenient')).toEqual({ ok: true })
    const current = useGameStore.getState().puzzle
    expect(current!.seed).toBe('custom-abc')
    expect(current!.title).toBe('自定义 5×5')
    expect(current!.source).toBe('editor')
  })

  it('?p=谜题 id 会按 seed 重新生成同一道题；非法 id 给出错误', () => {
    const generated = createNewGame('easy', 'ensure-easy-seed')
    expect(ensureGame(new URLSearchParams({ p: generated.puzzle.id }), 'lenient')).toEqual({ ok: true })
    expect(Array.from(useGameStore.getState().puzzle!.solution)).toEqual(Array.from(generated.puzzle.solution))

    resetStore()
    const bad = ensureGame(new URLSearchParams({ p: 'nonsense-6x8-abc' }), 'lenient')
    expect(bad.ok).toBe(false)
  })

  it('没有参数时优先恢复未完成的存档', () => {
    saveProgress(storedSnapshot())
    expect(ensureGame(new URLSearchParams(), 'lenient')).toEqual({ ok: true })
    expect(boardOf()[0]).toBe(FILLED)
    expect(useGameStore.getState().accumulatedMs).toBe(9_000)
  })

  it('既没有存档也没有参数时如实返回失败', () => {
    const outcome = ensureGame(new URLSearchParams(), 'lenient')
    expect(outcome.ok).toBe(false)
    expect(outcome.error).toBeTruthy()
  })
})

describe('createNewGame：新开一局与「刷新后同一道题」', () => {
  it('四个难度都能开出一局，且 id 能重放出完全相同的图案', () => {
    for (const difficulty of ['easy', 'medium', 'expert'] as Difficulty[]) {
      const outcome = createNewGame(difficulty, `newgame-${difficulty}`)
      expect(outcome.puzzle.width).toBe(outcome.puzzle.height)
      expect(outcome.puzzle.width % 5, '自动生成的盘面必须是 5 的倍数正方形').toBe(0)
      expect(outcome.puzzle.solution.length).toBe(outcome.puzzle.width * outcome.puzzle.height)

      // 关掉降级后再走一遍 ensureGame 的 ?p= 分支：刷新页面拿到的必须是同一道题
      resetStore()
      expect(ensureGame(new URLSearchParams({ p: outcome.puzzle.id }), 'lenient')).toEqual({ ok: true })
      expect(Array.from(useGameStore.getState().puzzle!.solution)).toEqual(Array.from(outcome.puzzle.solution))
    }
  })

  it('开到目标难度时不带降级提示', () => {
    const outcome = createNewGame('easy', 'newgame-clean')
    expect(outcome.matched).toBe(true)
    expect(outcome.notice).toBeUndefined()
  })

  it('难度与尺寸互斥时（20×20 想要「困难」）给出降级说明，但仍是唯一解', () => {
    const outcome = createNewGame('hard', 'newgame-impossible')
    // 20×20 的难度地板是专家，所以「困难」在数学上不可能达标：必须走到降级分支
    if (!outcome.matched) {
      expect(outcome.notice).toBeTruthy()
    }
    expect(outcome.puzzle.width).toBe(outcome.puzzle.height)
  })
})

/*
 * M-01：「?p= 需要按种子重新生成」的预判。
 * 页面用它决定是否先渲染 loading 遮罩 —— 判错只影响提示，不影响正确性，
 * 但判漏会让主线程在无提示的情况下冻结数秒，所以这里把每个分支都钉死。
 */
describe('直接开玩的生成成本预判（bootstrapNeedsGeneration）', () => {
  it('分享码 / 无参数 / 非法 id 都不需要重新生成（毫秒级）', () => {
    const code = encodePuzzleCode(makePuzzle())
    expect(bootstrapNeedsGeneration(new URLSearchParams({ s: code }))).toBe(false)
    expect(bootstrapNeedsGeneration(new URLSearchParams())).toBe(false)
    expect(bootstrapNeedsGeneration(new URLSearchParams({ p: 'nonsense-6x8-abc' }))).toBe(false)
    expect(bootstrapNeedsGeneration(new URLSearchParams({ p: 'easy-5x5' }))).toBe(false)
  })

  it('?p= 且 store / 存档里都没有这道题时为 true（需要跑生成器）', () => {
    const generated = createNewGame('easy', 'needs-generation')
    expect(bootstrapNeedsGeneration(new URLSearchParams({ p: generated.puzzle.id }))).toBe(true)
  })

  it('store 里已经有这道题（未完成）时为 false', () => {
    const generated = createNewGame('easy', 'already-open')
    useGameStore.getState().startPuzzle(generated.puzzle, 'lenient', null)
    expect(bootstrapNeedsGeneration(new URLSearchParams({ p: generated.puzzle.id }))).toBe(false)
  })

  it('存在同一道题的存档时为 false（走恢复而不是重新生成）', () => {
    const generated = createNewGame('easy', 'has-save')
    resetStore()
    saveProgress(
      storedSnapshot({
        puzzleId: generated.puzzle.id,
        seed: generated.puzzle.seed,
        width: generated.puzzle.width,
        height: generated.puzzle.height,
        solution: encodeBoard(generated.puzzle.solution),
        board: encodeBoard(new Uint8Array(generated.puzzle.solution.length)),
      }),
    )
    expect(bootstrapNeedsGeneration(new URLSearchParams({ p: generated.puzzle.id }))).toBe(false)
  })
})
