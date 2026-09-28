/**
 * 新手教程（`core/tutorial.ts` + `store/tutorialStore.ts` + gameStore 的教程隔离）单测。
 *
 * 覆盖需求 28 要求的五类：
 *   · 阶段状态流转（欢迎 -> 1 -> ... -> 7 -> 完成）
 *   · 错误操作不会把教程卡死
 *   · 退出教程不影响普通游戏
 *   · tutorialCompleted 正确持久化
 *   · 教程对局不写普通游戏统计
 *
 * 另外还验证一条**教学正确性**（需求 18）：每一步要求玩家点的格子，
 * 在当时的棋盘上都确实能被行列约束传播推出来 —— 教程不会让玩家去猜。
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { computeClues } from '../src/core/clues'
import { createSolverContext, propagate, solvePuzzle } from '../src/core/solver'
import { FILLED, EMPTY, UNKNOWN, type Puzzle } from '../src/core/types'
import {
  TUTORIAL_STEPS,
  TUTORIAL_STEP_COUNT,
  evaluateStroke,
  isStepComplete,
  isTutorialSolved,
  tutorialBoardAtStep,
  tutorialPuzzle,
  tutorialSolution,
} from '../src/core/tutorial'
import {
  clearAllData,
  encodeBoard,
  loadHistory,
  loadProgress,
  loadRecords,
  loadTutorialProgress,
  saveProgress,
} from '../src/core/storage'
import { restoreFromStored } from '../src/game/bootstrap'
import { useGameStore } from '../src/store/gameStore'
import { useSettingsStore } from '../src/store/settingsStore'
import { hasCompletedTutorial, resumeStep, useTutorialStore } from '../src/store/tutorialStore'

const puzzle = tutorialPuzzle()
const solution = tutorialSolution()

/** 普通对局用的固定 5×5 谜题（跟教程那张完全不同的图案） */
const NORMAL_GRID = [1, 0, 0, 0, 1, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1, 0]

function normalPuzzle(): Puzzle {
  const bits = Uint8Array.from(NORMAL_GRID)
  const { rowClues, colClues } = computeClues(bits, 5, 5)
  return {
    id: 'easy-5x5-normal',
    width: 5,
    height: 5,
    solution: bits,
    rowClues,
    colClues,
    difficulty: 'easy',
    seed: 'normal-seed',
    source: 'generated',
  }
}

/** 把某个阶段的全部目标格子在棋盘上完成（模拟玩家正确操作） */
function completeStep(board: Uint8Array, stepIndex: number): Uint8Array {
  const next = board.slice()
  const goal = TUTORIAL_STEPS[stepIndex - 1].goal
  for (const cell of goal.fills) next[cell] = FILLED
  for (const cell of goal.marks) next[cell] = EMPTY
  return next
}

function startTutorialAt(stepIndex: number): void {
  const tutorial = useTutorialStore.getState()
  tutorial.begin(stepIndex, false)
  useGameStore.getState().beginTutorial(puzzle, tutorialBoardAtStep(Math.max(1, stepIndex)))
}

beforeEach(() => {
  clearAllData()
  useSettingsStore.setState({ paintMode: 'fill' })
  useGameStore.getState().endTutorial()
  useTutorialStore.getState().reset()
})

describe('教程谜题：固定题 + 唯一解（需求 17 / 18）', () => {
  it('图案固定为 5×5，且线索与图案一致', () => {
    expect(puzzle.width).toBe(5)
    expect(puzzle.height).toBe(5)
    expect(puzzle.source).toBe('tutorial')
    const { rowClues, colClues } = computeClues(solution, 5, 5)
    expect(puzzle.rowClues).toEqual(rowClues)
    expect(puzzle.colClues).toEqual(colClues)
    // 教程画面里没有空行/空列，不会出现「0」这种对新手不友好的线索
    for (const line of [...rowClues, ...colClues]) expect(line.every((n) => n > 0)).toBe(true)
  })

  it('求解器判定为唯一解，且解就是这张图', () => {
    const result = solvePuzzle(
      { width: 5, height: 5, rowClues: puzzle.rowClues, colClues: puzzle.colClues },
      { timeLimitMs: 5_000 },
    )
    expect(result.status).toBe('unique')
    expect(result.solution).toBeDefined()
    expect(Array.from(result.solution as Uint8Array)).toEqual(Array.from(solution))
  })

  it('七个阶段的名字与顺序符合教学规划', () => {
    expect(TUTORIAL_STEP_COUNT).toBe(7)
    expect(TUTORIAL_STEPS.map((s) => s.id)).toEqual([
      'numbers',
      'position',
      'groups',
      'crossing',
      'marks',
      'deduction',
      'finish',
    ])
    expect(TUTORIAL_STEPS.map((s) => s.index)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('每一步的目标格子都能被行列传播推出来（教程不让玩家去猜）', () => {
    for (const step of TUTORIAL_STEPS) {
      const ctx = createSolverContext(puzzle)
      const board = tutorialBoardAtStep(step.index)
      propagate(ctx, board)
      for (const cell of step.goal.fills) expect(board[cell], `第 ${step.index} 步的涂黑格 ${cell}`).toBe(FILLED)
      for (const cell of step.goal.marks) expect(board[cell], `第 ${step.index} 步的标记格 ${cell}`).toBe(EMPTY)
    }
  })

  it('把七步走完，棋盘正好等于答案；此前每一步都不算完成', () => {
    let board = tutorialBoardAtStep(1)
    for (let i = 1; i <= TUTORIAL_STEP_COUNT; i++) {
      expect(isStepComplete(i, board), `第 ${i} 步之前不应通过`).toBe(false)
      board = completeStep(board, i)
      expect(isStepComplete(i, board), `第 ${i} 步之后应当通过`).toBe(true)
    }
    expect(isTutorialSolved(board)).toBe(true)
  })
})

describe('落笔校验：鼓励式反馈 + 整笔回滚（需求 8 / 9）', () => {
  it('在答案里是空白的格子上涂黑会被拒绝', () => {
    const step = TUTORIAL_STEPS[0]
    const verdict = evaluateStroke([{ index: 0, value: FILLED }], step)
    expect(verdict.ok).toBe(false)
    expect(verdict.message).toBeTruthy()
    expect(verdict.softCells).toEqual([0])
  })

  it('把答案里要涂黑的格子标成空会被拒绝', () => {
    const step = TUTORIAL_STEPS[0]
    const verdict = evaluateStroke([{ index: 5, value: EMPTY }], step)
    expect(verdict.ok).toBe(false)
  })

  it('正确目标 + 无害操作（取消涂格、给空白格打 ×）都放行', () => {
    const step = TUTORIAL_STEPS[0]
    expect(evaluateStroke([{ index: 5, value: FILLED }], step).ok).toBe(true)
    expect(evaluateStroke([{ index: 5, value: UNKNOWN }], step).ok).toBe(true)
    expect(evaluateStroke([{ index: 0, value: EMPTY }], step).ok).toBe(true)
  })

  it('标记阶段的反馈文案会提示改用「标记」', () => {
    const markStep = TUTORIAL_STEPS[4]
    const verdict = evaluateStroke([{ index: 0, value: FILLED }], markStep)
    expect(verdict.ok).toBe(false)
    expect(verdict.message).toContain('标记')
  })
})

describe('状态机：欢迎 -> 7 个阶段 -> 完成（需求 28）', () => {
  it('初始是欢迎页，点「开始教程」进入第 1 阶段', () => {
    const tutorial = useTutorialStore.getState()
    tutorial.begin(0, false)
    expect(useTutorialStore.getState().stepIndex).toBe(0)
    useTutorialStore.getState().next()
    expect(useTutorialStore.getState().stepIndex).toBe(1)
  })

  it('逐步完成后停在完成态，并把 tutorialCompleted 写进存档', () => {
    startTutorialAt(1)
    let board = useGameStore.getState().board
    for (let i = 1; i <= TUTORIAL_STEP_COUNT; i++) {
      board = completeStep(board, i)
      useGameStore
        .getState()
        .applyStroke(
          TUTORIAL_STEPS[i - 1].goal.fills
            .map((index) => ({ index, value: FILLED }))
            .concat(TUTORIAL_STEPS[i - 1].goal.marks.map((index) => ({ index, value: EMPTY }))),
        )
      // 教程模式不让引擎自动判胜，需要页面（这里模拟）逐阶段推进
      if (isStepComplete(useTutorialStore.getState().stepIndex, useGameStore.getState().board)) {
        const wasLast = useTutorialStore.getState().stepIndex >= TUTORIAL_STEP_COUNT
        useTutorialStore.getState().advance()
        if (wasLast) useGameStore.getState().markWin(Date.now())
      }
    }
    expect(useTutorialStore.getState().completed).toBe(true)
    expect(useGameStore.getState().completed).toBe(true)
    expect(loadTutorialProgress()?.completed).toBe(true)
    expect(hasCompletedTutorial()).toBe(true)
  })

  it('错误操作只是给提示，不会推进阶段、也不会卡死', () => {
    startTutorialAt(1)
    const tutorial = useTutorialStore.getState()
    const verdict = evaluateStroke([{ index: 0, value: FILLED }], TUTORIAL_STEPS[0])
    expect(verdict.ok).toBe(false)
    tutorial.reject(verdict.message ?? '', verdict.softCells ?? [])
    const after = useTutorialStore.getState()
    expect(after.stepIndex).toBe(1)
    expect(after.feedback?.tone).toBe('gentle')
    expect(after.softCells).toEqual([0])
    // 之后仍然能正常走完这一步
    useGameStore.getState().applyStroke(TUTORIAL_STEPS[0].goal.fills.map((index) => ({ index, value: FILLED })))
    expect(isStepComplete(1, useGameStore.getState().board)).toBe(true)
  })

  it('学完之后重新进入教程，不会抹掉「已完成」标记', () => {
    startTutorialAt(1)
    useTutorialStore.getState().markCompleted()
    expect(loadTutorialProgress()?.completed).toBe(true)
    useTutorialStore.getState().restart()
    useTutorialStore.getState().next()
    expect(loadTutorialProgress()?.completed).toBe(true)
  })

  it('断点续玩：读到上次的阶段号，并铺好之前的成果', () => {
    startTutorialAt(1)
    useTutorialStore.getState().advance()
    useTutorialStore.getState().advance()
    expect(resumeStep()).toBe(3)
    const board = tutorialBoardAtStep(3)
    expect(isStepComplete(2, board)).toBe(true)
    expect(isStepComplete(3, board)).toBe(false)
  })

  it('学完之后重新开始又中途离开，刷新仍然回到上次的阶段（不会被踢回欢迎页）', () => {
    startTutorialAt(1)
    useTutorialStore.getState().markCompleted()
    // 已经学完且停在最后一阶段：从欢迎页重新看一遍
    expect(resumeStep()).toBe(0)
    useTutorialStore.getState().restart()
    expect(resumeStep()).toBe(0)
    useTutorialStore.getState().next()
    useTutorialStore.getState().advance()
    expect(resumeStep()).toBe(2)
    expect(hasCompletedTutorial()).toBe(true)
  })
})

describe('隔离普通游戏（需求 14 / 27）', () => {
  it('教程通关不写历史成绩 / 最佳成绩 / 每日挑战', () => {
    startTutorialAt(1)
    for (let i = 1; i <= TUTORIAL_STEP_COUNT; i++) {
      const goal = TUTORIAL_STEPS[i - 1].goal
      useGameStore
        .getState()
        .applyStroke([
          ...goal.fills.map((index) => ({ index, value: FILLED })),
          ...goal.marks.map((index) => ({ index, value: EMPTY })),
        ])
      if (i === TUTORIAL_STEP_COUNT) useGameStore.getState().markWin(Date.now())
    }
    expect(useGameStore.getState().completed).toBe(true)
    expect(loadHistory()).toEqual([])
    expect(loadRecords()).toEqual({})
  })

  it('教程对局不覆盖普通对局的存档', () => {
    const normal = normalPuzzle()
    useGameStore.getState().startPuzzle(normal, 'lenient')
    useGameStore.getState().applyStroke([{ index: 0, value: FILLED }])
    const savedBefore = loadProgress()
    expect(savedBefore?.puzzleId).toBe(normal.id)

    startTutorialAt(1)
    useGameStore.getState().applyStroke([{ index: 5, value: FILLED }])

    const savedAfter = loadProgress()
    expect(savedAfter?.puzzleId).toBe(normal.id)
    expect(savedAfter?.board).toBe(savedBefore?.board)
  })

  it('退出教程后能把普通对局恢复回来（继续玩自己的进度）', () => {
    const normal = normalPuzzle()
    useGameStore.getState().startPuzzle(normal, 'lenient')
    useGameStore.getState().applyStroke([{ index: 0, value: FILLED }])
    const boardBefore = encodeBoard(useGameStore.getState().board)

    startTutorialAt(1)
    expect(useGameStore.getState().tutorial).toBe(true)
    expect(useGameStore.getState().puzzle?.source).toBe('tutorial')

    // 模拟 TutorialPage 的 teardown
    useGameStore.getState().endTutorial()
    const saved = loadProgress()
    expect(saved).not.toBeNull()
    restoreFromStored(saved as NonNullable<typeof saved>, 'lenient')

    expect(useGameStore.getState().tutorial).toBe(false)
    expect(useGameStore.getState().puzzle?.id).toBe(normal.id)
    expect(encodeBoard(useGameStore.getState().board)).toBe(boardBefore)
  })

  it('存档里写着的普通对局不会因为教程而被清掉', () => {
    const normal = normalPuzzle()
    const bits = new Uint8Array(25)
    bits[0] = FILLED
    const board = new Uint8Array(25)
    board[0] = FILLED
    // 直接按存档格式写一份（模拟「刷新页面」）
    saveProgress({
      puzzleId: normal.id,
      difficulty: 'easy',
      width: 5,
      height: 5,
      seed: normal.seed,
      board: encodeBoard(board),
      solution: encodeBoard(bits),
      elapsedMs: 12_000,
      mistakes: 0,
      hintsUsed: 0,
      penaltyMs: 0,
      pauseCount: 0,
      judgeMode: 'lenient',
      completed: false,
      updatedAt: Date.now(),
    })
    startTutorialAt(2)
    expect(loadProgress()?.puzzleId).toBe(normal.id)
  })
})
