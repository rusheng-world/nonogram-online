import { describe, expect, it } from 'vitest'
import { UNKNOWN, FILLED, EMPTY } from '../src/core/types'
import type { Puzzle } from '../src/core/types'
import { computeClues, computeLineClues } from '../src/core/clues'
import { createRng, randInt } from '../src/core/rng'
import {
  chooseBranchCell,
  createBoard,
  createLimits,
  createLineWorkspace,
  createSolverContext,
  countSolutions,
  propagate,
  solveFirst,
  solveLine,
} from '../src/core/solver'

/** 暴力枚举一条线的所有可行染色（仅用于测试小尺寸正确性） */
function bruteForceLine(clues: number[], n: number): number[][] {
  const solutions: number[][] = []
  const wanted = clues.filter((c) => c > 0)
  for (let mask = 0; mask < 1 << n; mask++) {
    const cells: number[] = []
    for (let i = 0; i < n; i++) cells.push((mask >> i) & 1)
    const runs: number[] = []
    let run = 0
    for (const c of cells) {
      if (c) run++
      else if (run) {
        runs.push(run)
        run = 0
      }
    }
    if (run) runs.push(run)
    if (runs.length === wanted.length && runs.every((v, i) => v === wanted[i])) {
      solutions.push(cells)
    }
  }
  return solutions
}

function makePuzzle(grid: number[], width: number, height: number, difficulty: Puzzle['difficulty'] = 'easy'): Puzzle {
  const solution = new Uint8Array(grid)
  const { rowClues, colClues } = computeClues(solution, width, height)
  return {
    id: 'test',
    width,
    height,
    solution,
    rowClues,
    colClues,
    difficulty,
    seed: 'test',
  }
}

describe('solveLine（DP 单行推理）', () => {
  it('与暴力枚举结果完全一致（随机 3000 条线，含矛盾的已知信息）', () => {
    const rng = createRng('line-dp-vs-bruteforce')
    for (let iter = 0; iter < 3000; iter++) {
      const n = randInt(rng, 1, 10)
      const cells: number[] = []
      for (let i = 0; i < n; i++) cells.push(rng() < 0.5 ? 1 : 0)
      // 已知信息故意与真实解无关（有一半概率制造矛盾），用暴力枚举做基准
      const known = cells.map(() => (rng() < 0.3 ? UNKNOWN : rng() < 0.5 ? FILLED : EMPTY))
      const clues = computeLineClues(cells)

      const all = bruteForceLine(clues, n).filter((sol) => known.every((k, i) => k === UNKNOWN || (k === FILLED) === (sol[i] === 1)))
      const ws = createLineWorkspace(Math.max(1, n))
      const res = solveLine(clues, Uint8Array.from(known), n, ws)

      expect(res.contradiction).toBe(all.length === 0)
      if (all.length === 0) continue
      for (let i = 0; i < n; i++) {
        const alwaysFilled = all.every((sol) => sol[i] === 1)
        const alwaysEmpty = all.every((sol) => sol[i] === 0)
        const expected = alwaysFilled ? FILLED : alwaysEmpty ? EMPTY : UNKNOWN
        expect(ws.out[i], `line=${cells.join('')} clue=${clues.join(',')} idx=${i}`).toBe(expected)
      }
    }
  })

  it('线索总和超过行长时直接判定矛盾', () => {
    const ws = createLineWorkspace(3)
    expect(solveLine([2, 2], new Uint8Array(3), 3, ws).contradiction).toBe(true)
    expect(solveLine([4], new Uint8Array(3), 3, ws).contradiction).toBe(true)
  })

  it('空行线索遇到已填格时判定矛盾', () => {
    const ws = createLineWorkspace(3)
    expect(solveLine([0], Uint8Array.from([UNKNOWN, FILLED, UNKNOWN]), 3, ws).contradiction).toBe(true)
  })
})

describe('propagate / solveFirst', () => {
  it('简单谜题可以纯传播解出（0 次假设）', () => {
    // 3x3 全满/全空行，线索完全确定
    const puzzle = makePuzzle([1, 1, 1, 0, 0, 0, 1, 1, 1], 3, 3)
    const ctx = createSolverContext(puzzle)
    const board = createBoard(9)
    const limits = createLimits({ nodeLimit: 1000, timeLimitMs: 500 })
    const { solution, stats } = solveFirst(ctx, board, limits)
    expect(solution).not.toBeNull()
    expect(stats.guesses).toBe(0)
    expect(stats.truncated).toBe(false)
    expect(Array.from(solution!)).toEqual([1, 1, 1, 0, 0, 0, 1, 1, 1])
  })

  it('传播能直接确定唯一解', () => {
    const puzzle = makePuzzle([1, 1, 1, 0, 0, 0, 1, 1, 1], 3, 3)
    const ctx = createSolverContext(puzzle)
    const board = createBoard(9)
    const ok = propagate(ctx, board)
    expect(ok).toBe(true)
    expect(Array.from(board)).toEqual([FILLED, FILLED, FILLED, EMPTY, EMPTY, EMPTY, FILLED, FILLED, FILLED])
  })

  it('线索矛盾时传播返回 false', () => {
    const puzzle = makePuzzle([1, 1, 1, 0, 0, 0, 1, 1, 1], 3, 3)
    puzzle.rowClues[0] = [2, 2]
    const ctx = createSolverContext(puzzle)
    const board = createBoard(9)
    expect(propagate(ctx, board)).toBe(false)
  })

  it('chooseBranchCell 只返回未知格', () => {
    const puzzle = makePuzzle([1, 0, 1, 0, 1, 0, 1, 0, 1], 3, 3)
    const ctx = createSolverContext(puzzle)
    const board = createBoard(9)
    board[0] = FILLED
    const cell = chooseBranchCell(ctx, board)
    expect(board[cell]).toBe(UNKNOWN)
    expect(cell).toBeGreaterThanOrEqual(0)
  })
})

describe('唯一性判定', () => {
  it('唯一解：2x2 行线索 [2],[0]', () => {
    const puzzle = makePuzzle([1, 1, 0, 0], 2, 2)
    const ctx = createSolverContext(puzzle)
    const board = createBoard(4)
    const limits = createLimits({ nodeLimit: 5000, timeLimitMs: 500 })
    const first = solveFirst(ctx, board, limits)
    expect(first.stats.guesses).toBe(0)
    expect(first.stats.solutionDepth).toBe(0)

    const counter = countSolutions(createSolverContext(puzzle), createBoard(4), 2, createLimits({ nodeLimit: 5000, timeLimitMs: 500 }))
    expect(counter.count).toBe(1)
  })

  it('多解：2x2 行列线索全为 [1]（两条对角线都成立）', () => {
    const puzzle = makePuzzle([1, 0, 0, 1], 2, 2)
    expect(puzzle.rowClues).toEqual([[1], [1]])
    expect(puzzle.colClues).toEqual([[1], [1]])
    const counter = countSolutions(createSolverContext(puzzle), createBoard(4), 2, createLimits({ nodeLimit: 5000, timeLimitMs: 500 }))
    expect(counter.count).toBe(2)
    expect(counter.truncated).toBe(false)
  })

  it('多解：3x3 行列线索全为 [1]（排列矩阵，共 6 个解）', () => {
    // 直接构造线索（不通过图案）：每行每列恰好一个黑格 => 6 种排列
    const puzzle: Puzzle = {
      id: 'multi',
      width: 3,
      height: 3,
      solution: Uint8Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]),
      rowClues: [[1], [1], [1]],
      colClues: [[1], [1], [1]],
      difficulty: 'easy',
      seed: 'multi',
    }
    const all = countSolutions(createSolverContext(puzzle), createBoard(9), 10, createLimits({ nodeLimit: 20_000, timeLimitMs: 1000 }))
    expect(all.count).toBe(6)
    expect(all.truncated).toBe(false)
    // 找到第 2 个解就停：足够判定“多解”
    const two = countSolutions(createSolverContext(puzzle), createBoard(9), 2, createLimits({ nodeLimit: 20_000, timeLimitMs: 1000 }))
    expect(two.count).toBe(2)
  })

  it('无解棋盘返回 count = 0', () => {
    const puzzle = makePuzzle([1, 0, 1], 3, 1)
    puzzle.rowClues[0] = [3]
    const counter = countSolutions(createSolverContext(puzzle), createBoard(3), 2, createLimits({ nodeLimit: 5000, timeLimitMs: 500 }))
    expect(counter.count).toBe(0)
  })
})
