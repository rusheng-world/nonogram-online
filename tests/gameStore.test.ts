/**
 * 棋盘状态机（`gameStore`）的单测。
 *
 * 这是全项目状态最复杂的一块：判定模式、罚时、撤销栈、提示、暂停、胜利判定，
 * 以及成绩 / 成就的落库。它内部没有 React，所以可以当纯状态机直接驱动，
 * 正好覆盖验收标准里第 4、5 条（拖拽涂格与撤销、严格模式涂错反馈）的逻辑层。
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { computeClues } from '../src/core/clues'
import { clearAllData, loadProgress, loadRecords } from '../src/core/storage'
import { EMPTY, FILLED, type Difficulty, type JudgeMode, type Puzzle } from '../src/core/types'
import { EXTREME_PENALTY_MS, HINT_PENALTY_MS, useGameStore } from '../src/store/gameStore'
import { useSettingsStore } from '../src/store/settingsStore'

/**
 * 固定的 4×4 图案（1 = 该格应填充，0 = 该格应为空）：
 *   # . . .
 *   . # # .
 *   . # . .
 *   . . . #
 */
const GRID = [1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1]
const SIZE = GRID.length
/** 一个「本该为空」的格子（涂成填充就是错的） */
const WRONG_INDEX = 1
/** 一个「本该填充」的格子 */
const RIGHT_INDEX = 0

function makePuzzle(overrides: Partial<Puzzle> = {}): Puzzle {
  const solution = Uint8Array.from(GRID)
  const { rowClues, colClues } = computeClues(solution, 4, 4)
  return {
    id: 'easy-4x4-store-test',
    width: 4,
    height: 4,
    solution,
    rowClues,
    colClues,
    difficulty: 'easy' as Difficulty,
    seed: 'store-test',
    ...overrides,
  }
}

function start(mode: JudgeMode = 'lenient', puzzle = makePuzzle()): Puzzle {
  useGameStore.getState().startPuzzle(puzzle, mode, null)
  return puzzle
}

const board = () => Array.from(useGameStore.getState().board)
const zeros = (n: number) => new Array(n).fill(0)

beforeEach(() => {
  // 成绩 / 历史 / 成就都会写 localStorage，逐个用例清干净，避免互相污染
  clearAllData()
  useSettingsStore.setState({ hintPenalty: true })
})

describe('涂格：填充 / 标记 / 拖拽', () => {
  it('只有真正发生变化的格子才计入 changed，也不会重复压撤销栈', () => {
    start()
    expect(useGameStore.getState().applyStroke([{ index: RIGHT_INDEX, value: FILLED }]).changed).toBe(1)
    // 再涂一次同样的状态：不算变化
    expect(useGameStore.getState().applyStroke([{ index: RIGHT_INDEX, value: FILLED }]).changed).toBe(0)
    expect(useGameStore.getState().past.length).toBe(1)
  })

  it('一次拖拽涂多格只压一次撤销栈，并把光标停在最后一格', () => {
    start()
    const out = useGameStore.getState().applyStroke([
      { index: 0, value: FILLED },
      { index: 5, value: FILLED },
      { index: 6, value: FILLED },
    ])
    expect(out.changed).toBe(3)
    expect(useGameStore.getState().past.length).toBe(1)
    expect(useGameStore.getState().cursor).toBe(6)
  })

  it('越界索引会被忽略', () => {
    start()
    const out = useGameStore.getState().applyStroke([
      { index: -1, value: FILLED },
      { index: SIZE, value: FILLED },
    ])
    expect(out.changed).toBe(0)
    expect(useGameStore.getState().past.length).toBe(0)
  })

  it('第一次涂格才开始计时', () => {
    start()
    expect(useGameStore.getState().started).toBe(false)
    expect(useGameStore.getState().runningSince).toBeNull()
    useGameStore.getState().applyStroke([{ index: RIGHT_INDEX, value: FILLED }])
    expect(useGameStore.getState().started).toBe(true)
    expect(useGameStore.getState().runningSince).not.toBeNull()
  })

  it('X 标记不影响胜利判定（只比较"是否填充"）', () => {
    const puzzle = start()
    const marks = GRID.flatMap((v, i) => (v ? [] : [{ index: i, value: EMPTY }]))
    const fills = GRID.flatMap((v, i) => (v ? [{ index: i, value: FILLED }] : []))
    useGameStore.getState().applyStroke(marks)
    expect(useGameStore.getState().completed).toBe(false)
    expect(useGameStore.getState().applyStroke(fills).completed).toBe(true)
    expect(useGameStore.getState().completedMs).toBeGreaterThanOrEqual(0)
    expect(loadProgress(), '完成后存档应被清掉').toBeNull()
    expect(loadRecords()[`easy:${puzzle.seed}`], '完成后应写入成绩').toBeTruthy()
  })
})

describe('撤销 / 重做', () => {
  it('撤销与重做能完整往返棋盘', () => {
    start()
    useGameStore.getState().applyStroke([{ index: 0, value: FILLED }])
    useGameStore.getState().applyStroke([{ index: 9, value: EMPTY }])
    expect(board()[9]).toBe(EMPTY)

    useGameStore.getState().undo()
    expect(board()[9]).toBe(0)
    expect(board()[0]).toBe(FILLED)
    expect(useGameStore.getState().future.length).toBe(1)

    useGameStore.getState().redo()
    expect(board()[9]).toBe(EMPTY)
    expect(useGameStore.getState().future.length).toBe(0)
  })

  it('撤销栈最多保留 200 步，一路撤销到底不会出错', () => {
    start()
    // 每次翻转同一格，保证每一步都是"真实变化"，都会压栈
    for (let i = 0; i < 260; i++) {
      const current = useGameStore.getState().board[0]
      const value = current === FILLED ? 0 : FILLED
      useGameStore.getState().applyStroke([{ index: 0, value }])
    }
    expect(useGameStore.getState().past.length).toBe(200)
    for (let i = 0; i < 400; i++) useGameStore.getState().undo()
    expect(useGameStore.getState().past.length).toBe(0)
    expect(useGameStore.getState().future.length).toBe(200)
  })

  it('新的涂格会清空重做栈', () => {
    start()
    useGameStore.getState().applyStroke([{ index: 0, value: FILLED }])
    useGameStore.getState().undo()
    expect(useGameStore.getState().future.length).toBe(1)
    useGameStore.getState().applyStroke([{ index: 5, value: FILLED }])
    expect(useGameStore.getState().future.length).toBe(0)
  })

  it('撤销后棋盘会写回存档', () => {
    start()
    useGameStore.getState().applyStroke([{ index: 0, value: FILLED }])
    useGameStore.getState().applyStroke([{ index: 5, value: FILLED }])
    useGameStore.getState().undo()
    expect(loadProgress()?.board).toBeDefined()
    expect(useGameStore.getState().past.length).toBe(1)
  })
})

describe('判定模式', () => {
  it('宽松：涂错不标红、不计错误，只有「检查」才判定', () => {
    start('lenient')
    const out = useGameStore.getState().applyStroke([{ index: WRONG_INDEX, value: FILLED }])
    expect(out.wrongAdded).toBe(0)
    expect(useGameStore.getState().wrong[WRONG_INDEX]).toBe(0)
    expect(useGameStore.getState().mistakes).toBe(0)

    // 检查发现两处错误：把该填的标成空、把该空的涂成实心
    useGameStore.getState().applyStroke([{ index: RIGHT_INDEX, value: EMPTY }])
    expect(useGameStore.getState().check()).toBe(2)
    expect(useGameStore.getState().wrong[WRONG_INDEX]).toBe(1)
    expect(useGameStore.getState().mistakes).toBe(2)
    expect(useGameStore.getState().checks).toBe(1)
  })

  it('严格：涂错立刻标红并计数，改回正确状态后红标消失但错误次数保留', () => {
    start('strict')
    const out = useGameStore.getState().applyStroke([{ index: WRONG_INDEX, value: FILLED }])
    expect(out.wrongAdded).toBe(1)
    expect(useGameStore.getState().wrong[WRONG_INDEX]).toBe(1)
    expect(useGameStore.getState().mistakes).toBe(1)

    useGameStore.getState().applyStroke([{ index: WRONG_INDEX, value: 0 }])
    expect(useGameStore.getState().wrong[WRONG_INDEX]).toBe(0)
    expect(useGameStore.getState().mistakes, '错误次数是累计值，不清零').toBe(1)
  })

  it('严格：检查直接汇报当前标红数量', () => {
    start('strict')
    useGameStore.getState().applyStroke([{ index: WRONG_INDEX, value: FILLED }])
    expect(useGameStore.getState().check()).toBe(1)
    expect(useGameStore.getState().notice).toContain('1')
  })

  it('极限：错误格永久标红、累加时间惩罚，且撤销也擦不掉', () => {
    start('extreme')
    useGameStore.getState().applyStroke([{ index: WRONG_INDEX, value: FILLED }])
    expect(useGameStore.getState().wrong[WRONG_INDEX]).toBe(2)
    expect(useGameStore.getState().penaltyMs).toBe(EXTREME_PENALTY_MS)
    expect(useGameStore.getState().accumulatedMs).toBeGreaterThanOrEqual(EXTREME_PENALTY_MS)

    useGameStore.getState().undo()
    expect(useGameStore.getState().wrong[WRONG_INDEX]).toBe(2)

    // 同一格反复涂错不会再叠加惩罚
    useGameStore.getState().applyStroke([{ index: WRONG_INDEX, value: FILLED }])
    expect(useGameStore.getState().penaltyMs).toBe(EXTREME_PENALTY_MS)
  })

  it('暂停或已完成时拒绝涂格', () => {
    start()
    useGameStore.getState().setPaused(true)
    expect(useGameStore.getState().applyStroke([{ index: 0, value: FILLED }]).changed).toBe(0)
    useGameStore.getState().setPaused(false)

    const fills = GRID.flatMap((v, i) => (v ? [{ index: i, value: FILLED }] : []))
    useGameStore.getState().applyStroke(fills)
    expect(useGameStore.getState().completed).toBe(true)
    expect(useGameStore.getState().applyStroke([{ index: WRONG_INDEX, value: FILLED }]).changed).toBe(0)
  })
})

describe('提示', () => {
  it('揭示一格与答案一致的格子，计入提示次数与罚时', () => {
    const puzzle = start()
    const hint = useGameStore.getState().revealHint()
    expect(hint).not.toBeNull()
    expect(hint!.value).toBe(puzzle.solution[hint!.index] ? FILLED : EMPTY)
    expect(useGameStore.getState().board[hint!.index]).toBe(hint!.value)
    expect(useGameStore.getState().hintsUsed).toBe(1)
    expect(useGameStore.getState().penaltyMs).toBe(HINT_PENALTY_MS)
    expect(useGameStore.getState().notice).toBeTruthy()
  })

  it('关掉「提示罚时」后不再累加时间', () => {
    start()
    useSettingsStore.setState({ hintPenalty: false })
    useGameStore.getState().revealHint()
    useGameStore.getState().revealHint()
    expect(useGameStore.getState().hintsUsed).toBe(2)
    expect(useGameStore.getState().penaltyMs).toBe(0)
  })
})

describe('计时 / 暂停 / 存档恢复', () => {
  it('暂停冻结计时并计入暂停次数', () => {
    start()
    useGameStore.getState().applyStroke([{ index: 0, value: FILLED }])
    useGameStore.getState().setPaused(true)
    expect(useGameStore.getState().paused).toBe(true)
    expect(useGameStore.getState().pauseCount).toBe(1)
    expect(useGameStore.getState().runningSince).toBeNull()
    useGameStore.getState().setPaused(false)
    expect(useGameStore.getState().paused).toBe(false)
    expect(useGameStore.getState().runningSince).not.toBeNull()
    useGameStore.getState().setPaused(true)
    expect(useGameStore.getState().pauseCount).toBe(2)
  })

  it('恢复存档后立刻继续计时（刷新页面不等于免费暂停）', () => {
    const puzzle = makePuzzle()
    const restored = Uint8Array.from([FILLED, ...zeros(SIZE - 1)])
    useGameStore.getState().startPuzzle(puzzle, 'lenient', {
      board: restored,
      elapsedMs: 12_000,
      mistakes: 2,
      hintsUsed: 1,
      penaltyMs: 15_000,
      pauseCount: 3,
    })
    const state = useGameStore.getState()
    expect(state.accumulatedMs).toBe(12_000)
    expect(state.started).toBe(true)
    expect(state.runningSince).not.toBeNull()
    expect(state.mistakes).toBe(2)
    expect(state.hintsUsed).toBe(1)
    expect(state.penaltyMs).toBe(15_000)
    expect(state.pauseCount).toBe(3)
    expect(Array.from(state.board)).toEqual(Array.from(restored))
  })

  it('存档尺寸对不上时退回到空棋盘，不会把两局混在一起', () => {
    const puzzle = makePuzzle()
    useGameStore.getState().startPuzzle(puzzle, 'lenient', {
      board: new Uint8Array(4),
      elapsedMs: 5_000,
      mistakes: 0,
      hintsUsed: 0,
      penaltyMs: 0,
      pauseCount: 0,
    })
    expect(Array.from(useGameStore.getState().board)).toEqual(zeros(SIZE))
  })

  it('重开一局会清掉存档', () => {
    start()
    useGameStore.getState().applyStroke([{ index: 0, value: FILLED }])
    expect(loadProgress()).not.toBeNull()
    useGameStore.getState().restart()
    expect(loadProgress()).toBeNull()
    expect(Array.from(useGameStore.getState().board)).toEqual(zeros(SIZE))
    expect(useGameStore.getState().completed).toBe(false)
  })
})

describe('交互辅助状态', () => {
  it('悬停行列会记录，移到同一格不触发多余更新', () => {
    start()
    useGameStore.getState().setHover(2, 3)
    expect(useGameStore.getState().hoverRow).toBe(2)
    expect(useGameStore.getState().hoverCol).toBe(3)
    const before = useGameStore.getState()
    useGameStore.getState().setHover(2, 3)
    expect(useGameStore.getState()).toBe(before)
  })

  it('光标与提示文案可单独设置', () => {
    start()
    useGameStore.getState().setCursor(7)
    expect(useGameStore.getState().cursor).toBe(7)
    useGameStore.getState().setNotice('测试文案')
    expect(useGameStore.getState().notice).toBe('测试文案')
  })

  it('没有新成就时关闭提示是空操作', () => {
    start()
    const before = useGameStore.getState()
    useGameStore.getState().dismissAchievements()
    expect(useGameStore.getState()).toBe(before)
  })
})
