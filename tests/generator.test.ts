import { describe, expect, it } from 'vitest'
import { boardSizeFor, generatePuzzle, generatePattern, defaultTimeBudget } from '../src/core/generator'
import { analyzePuzzle, classifyDifficulty } from '../src/core/difficulty'
import { computeClues } from '../src/core/clues'
import { DIFFICULTIES } from '../src/core/types'
import type { DifficultyMetrics } from '../src/core/types'

describe('图案生成', () => {
  it('同一个种子生成完全一样的图案', () => {
    const a = generatePattern(12, 12, 'medium', 'seed-a')
    const b = generatePattern(12, 12, 'medium', 'seed-a')
    const c = generatePattern(12, 12, 'medium', 'seed-b')
    expect(Array.from(a)).toEqual(Array.from(b))
    expect(Array.from(a)).not.toEqual(Array.from(c))
  })

  it('图案不是纯噪声：线索不会过度碎片化', () => {
    for (const difficulty of DIFFICULTIES) {
      const solution = generatePattern(15, 15, difficulty, `noise-check-${difficulty}`)
      const { rowClues, colClues } = computeClues(solution, 15, 15)
      const total = [...rowClues, ...colClues].reduce((acc, c) => acc + c.filter((v) => v > 0).length, 0)
      // 15x15 的图案平均每行/列线索数不应超过 4.2 个（纯噪声会接近 7 个）
      expect(total / 30).toBeLessThan(4.2)
    }
  })
})

describe('谜题生成', () => {
  it('同 seed 生成结果一致（可复现）', () => {
    const a = generatePuzzle({ width: 10, height: 10, difficulty: 'medium', seed: 'repro-1', timeBudgetMs: 800 })
    const b = generatePuzzle({ width: 10, height: 10, difficulty: 'medium', seed: 'repro-1', timeBudgetMs: 800 })
    expect(a.puzzle.id).toBe(b.puzzle.id)
    expect(Array.from(a.puzzle.solution)).toEqual(Array.from(b.puzzle.solution))
    expect(a.puzzle.rowClues).toEqual(b.puzzle.rowClues)
    expect(a.puzzle.colClues).toEqual(b.puzzle.colClues)
  })

  it('生成的谜题一定有且只有一个解', () => {
    let checked = 0
    for (const difficulty of DIFFICULTIES) {
      for (let i = 0; i < 6; i++) {
        const { width, height } = boardSizeFor(difficulty)
        const result = generatePuzzle({
          width,
          height,
          difficulty,
          seed: `unique-${difficulty}-${i}`,
        })
        const analysis = analyzePuzzle(result.puzzle, { nodeLimit: 120_000, timeLimitMs: 4000 })
        expect(analysis.unique, `${difficulty} ${width}x${height} seed=${result.puzzle.seed}`).toBe(true)
        // 求解出来的解必须与图案一致
        expect(Array.from(analysis.solution ?? [])).toEqual(Array.from(result.puzzle.solution))
        checked++
      }
    }
    expect(checked).toBe(24)
  })

  it('线索与图案一致（生成器不写错线索）', () => {
    const result = generatePuzzle({ width: 12, height: 12, difficulty: 'medium', seed: 'clue-check' })
    const recomputed = computeClues(result.puzzle.solution, 12, 12)
    expect(result.puzzle.rowClues).toEqual(recomputed.rowClues)
    expect(result.puzzle.colClues).toEqual(recomputed.colClues)
  })

  it('时间预算随面积自适应，20x20 不超过 1 秒', () => {
    expect(defaultTimeBudget(20, 20)).toBeLessThanOrEqual(900)
  })
})

describe('难度分级', () => {
  it('四种难度各 20 个谜题：全部唯一解且落在目标难度区间', () => {
    const report: string[] = []
    for (const target of DIFFICULTIES) {
      let matched = 0
      let unique = 0
      let totalMs = 0
      let slowest = 0
      for (let i = 0; i < 20; i++) {
        const seed = `accept-${target}-${i}`
        const { width, height } = boardSizeFor(target)
        const t0 = performance.now()
        const result = generatePuzzle({ width, height, difficulty: target, seed })
        const ms = performance.now() - t0
        totalMs += ms
        slowest = Math.max(slowest, ms)
        if (result.matched) matched++
        if (result.unique === true) unique++
        expect(result.unique, `${seed} 必须唯一解`).toBe(true)
      }
      report.push(
        `${target}: 达标 ${matched}/20, 唯一解 ${unique}/20, 平均 ${(totalMs / 20).toFixed(0)}ms, 最慢 ${slowest.toFixed(0)}ms`,
      )
      expect(matched, `${target} 难度达标率`).toBe(20)
    }
    console.log('\n' + report.join('\n'))
  })

  it('难度分级规则：尺寸给出地板，推理成本可以继续抬高难度', () => {
    const base: DifficultyMetrics = {
      guesses: 0,
      failedGuesses: 0,
      solutionDepth: 0,
      propagationRounds: 4,
      deducedCells: 0,
      nodes: 1,
      fillRatio: 0.5,
      maxClue: 5,
      clueCount: 20,
      longCrossings: 0,
      timeMs: 1,
      truncated: false,
    }
    // 尺寸地板
    expect(classifyDifficulty(base, 5, 5)).toBe('easy')
    expect(classifyDifficulty(base, 10, 10)).toBe('easy')
    expect(classifyDifficulty(base, 12, 12)).toBe('medium')
    expect(classifyDifficulty(base, 15, 15)).toBe('medium')
    expect(classifyDifficulty(base, 17, 17)).toBe('hard')
    expect(classifyDifficulty(base, 20, 20)).toBe('expert')
    expect(classifyDifficulty(base, 25, 25)).toBe('expert')

    // 推理成本抬高难度：小盘面也能是困难/专家
    expect(classifyDifficulty({ ...base, guesses: 1 }, 8, 8)).toBe('medium')
    expect(classifyDifficulty({ ...base, guesses: 4 }, 12, 12)).toBe('hard')
    expect(classifyDifficulty({ ...base, guesses: 4 }, 8, 8)).toBe('hard')
    expect(classifyDifficulty({ ...base, guesses: 20 }, 8, 8)).toBe('expert')
    // 深层假设链（深度 >= 4）直接判专家
    expect(classifyDifficulty({ ...base, guesses: 3, solutionDepth: 4 }, 10, 10)).toBe('expert')
    expect(classifyDifficulty({ ...base, guesses: 3, solutionDepth: 3 }, 10, 10)).toBe('hard')
    // 长线索交叉
    expect(classifyDifficulty({ ...base, longCrossings: 8 }, 18, 18)).toBe('hard')
  })
})
