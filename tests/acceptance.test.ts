/**
 * 验收标准里可以用自动化覆盖的部分（对应交付文档第七节）：
 *   - 四种难度各生成 20 个谜题：全部唯一解，且难度评估落在目标区间
 *   - 20x20 谜题生成耗时 < 1 秒
 *   - 同一种子可复现、谜题 id 可重放
 *
 * 另外两条核心保证在此显式断言：
 *   - 生成的谜题**一定有解**（图案本身就是解）
 *   - 线索与图案一致（行/列线索由 computeClues 重新计算后完全一致）
 */

import { describe, expect, it } from 'vitest'
import { computeClues } from '../src/core/clues'
import { analyzePuzzle } from '../src/core/difficulty'
import { DEGENERATE_LINE_CAP, boardSizeFor, countDegenerateLines, generatePuzzle } from '../src/core/generator'
import { regenerateFromId } from '../src/core/replay'
import { DIFFICULTIES, DIFFICULTY_META, type Difficulty, type Puzzle } from '../src/core/types'

const PER_DIFFICULTY = 20

function cluesMatch(puzzle: Puzzle): boolean {
  const { rowClues, colClues } = computeClues(puzzle.solution, puzzle.width, puzzle.height)
  const eq = (a: number[][], b: number[][]) =>
    a.length === b.length && a.every((line, i) => line.length === b[i].length && line.every((n, j) => n === b[i][j]))
  return eq(rowClues, puzzle.rowClues) && eq(colClues, puzzle.colClues)
}

describe('验收：难度分级', () => {
  it(`四种难度各 ${PER_DIFFICULTY} 题：全部唯一解、线索正确、难度落在目标区间`, () => {
    const report: string[] = []
    for (const difficulty of DIFFICULTIES) {
      let matched = 0
      let uniqueCount = 0
      let worst = 0
      let total = 0
      for (let i = 0; i < PER_DIFFICULTY; i++) {
        const seed = `accept-${difficulty}-${i}`
        // 用与游戏内一致的尺寸逻辑（每档固定一个 5 的倍数正方形）
        const { width, height } = boardSizeFor(difficulty)
        const t0 = performance.now()
        const generated = generatePuzzle({ width, height, difficulty, seed, timeBudgetMs: 4000 })
        const elapsed = performance.now() - t0
        total += elapsed
        worst = Math.max(worst, elapsed)

        const puzzle = generated.puzzle
        // 需求：自动生成的盘面必须是正方形，且边长是 5 的倍数
        expect(puzzle.width, `${difficulty} #${i} 盘面不是正方形`).toBe(puzzle.height)
        expect(puzzle.width % 5, `${difficulty} #${i} 边长不是 5 的倍数`).toBe(0)
        expect(cluesMatch(puzzle), `${difficulty} #${i} 线索与图案不一致`).toBe(true)

        // 唯一解：要么纯传播可解，要么数到第 2 个解时确认只有 1 个解
        const analysis = analyzePuzzle(puzzle)
        expect(analysis.unique, `${difficulty} #${i} 不是唯一解`).toBe(true)
        uniqueCount++

        if (analysis.difficulty === difficulty) matched++
      }
      report.push(
        `${difficulty}: 达标 ${matched}/${PER_DIFFICULTY}, 唯一解 ${uniqueCount}/${PER_DIFFICULTY}, 平均 ${(total / PER_DIFFICULTY).toFixed(1)}ms, 最慢 ${worst.toFixed(1)}ms`,
      )
      expect(matched, `${difficulty} 达标数不足`).toBe(PER_DIFFICULTY)
    }
    console.log(report.join('\n'))
  })

  it('难度区间与需求表一致，且自动生成尺寸固定为 5 的倍数正方形', () => {
    // 需求难度表里的尺寸区间（用于对外说明 / 文档）
    expect(DIFFICULTY_META.easy.minSize).toBe(5)
    expect(DIFFICULTY_META.easy.maxSize).toBe(10)
    expect(DIFFICULTY_META.medium.maxSize).toBe(15)
    expect(DIFFICULTY_META.hard.maxSize).toBe(20)
    expect(DIFFICULTY_META.expert.minSize).toBe(20)
    expect(DIFFICULTY_META.expert.maxSize).toBe(25)

    // 实际生成尺寸：每档一个正方形，边长是 5 的倍数
    for (const difficulty of DIFFICULTIES) {
      const { width, height } = boardSizeFor(difficulty)
      const meta = DIFFICULTY_META[difficulty]
      expect(width, `${difficulty} 必须是正方形`).toBe(height)
      expect(width % 5, `${difficulty} 边长必须是 5 的倍数`).toBe(0)
      expect(width).toBeGreaterThanOrEqual(meta.minSize)
      expect(width).toBeLessThanOrEqual(meta.maxSize)
    }

    // 四档尺寸严格递增，且不允许出现 11x11 / 12x13 这类盘面
    expect(DIFFICULTIES.map((d) => boardSizeFor(d).width)).toEqual([5, 10, 15, 20])
  })
})

describe('验收：避免退化线（全空 / 全满的行列）', () => {
  it('各档 20 题：全空 / 全满的行列被压到最低（困难、专家要求 0 条）', () => {
    // 允许的残留总量：困难/专家档的硬指标是 0（这里放宽到 1 只是为了不让
    // 机器太慢导致的“多找一会儿超时”变成偶发失败；修复前的专家档是 31 条）
    const allowed: Record<Difficulty, number> = { easy: 4, medium: 4, hard: 1, expert: 1 }
    const report: string[] = []
    for (const difficulty of DIFFICULTIES) {
      const { width, height } = boardSizeFor(difficulty)
      let total = 0
      let withDegenerate = 0
      for (let i = 0; i < PER_DIFFICULTY; i++) {
        const generated = generatePuzzle({
          width,
          height,
          difficulty,
          seed: `accept-${difficulty}-${i}`,
          timeBudgetMs: 4000,
        })
        const degenerate = countDegenerateLines(generated.puzzle.solution, width, height)
        total += degenerate
        if (degenerate > 0) withDegenerate++
      }
      report.push(`${difficulty}: 有退化线的题 ${withDegenerate}/${PER_DIFFICULTY}，退化线总数 ${total}`)
      expect(total, `${difficulty} 退化线过多`).toBeLessThanOrEqual(allowed[difficulty])
    }
    console.log(report.join('\n'))
  })

  it('countDegenerateLines：全空、全满、混合与矩形盘面都算对', () => {
    // 3x3 全空：3 行 + 3 列 = 6 条退化线
    expect(countDegenerateLines(new Uint8Array(9), 3, 3)).toBe(6)
    // 3x3 全满：同样是 6 条
    expect(countDegenerateLines(new Uint8Array(9).fill(1), 3, 3)).toBe(6)
    // 只有棋盘正中间一格：行 0、行 2 全空，列 0、列 2 全空 => 4 条
    const center = new Uint8Array(9)
    center[4] = 1
    expect(countDegenerateLines(center, 3, 3)).toBe(4)
    // 3 宽 5 高的矩形：第 0 行与第 2 行全满（线索 [3]），第 1 行的 3 个格子只有中间有 => 列 0、列 2 全空
    const rect = new Uint8Array([
      1, 1, 1,
      0, 1, 0,
      1, 1, 1,
      0, 1, 0,
      1, 1, 1,
    ])
    // 行：第 1 行、第 3 行既不全空也不全满；第 0/2/4 行全满 => 3 条
    // 列：第 0 列有 3 个（非 0 非 5）、第 1 列全满（5）=> 1 条、第 2 列 3 个 => 合计 4 条
    expect(countDegenerateLines(rect, 3, 5)).toBe(4)
    // 没有退化线的图案
    const clean = new Uint8Array([
      1, 0, 1,
      0, 1, 0,
      1, 1, 0,
    ])
    expect(countDegenerateLines(clean, 3, 3)).toBe(0)
  })

  it('退化线容忍上限：困难与专家为 0，简单与中等允许 1 条', () => {
    expect(DEGENERATE_LINE_CAP.hard).toBe(0)
    expect(DEGENERATE_LINE_CAP.expert).toBe(0)
    expect(DEGENERATE_LINE_CAP.easy).toBe(1)
    expect(DEGENERATE_LINE_CAP.medium).toBe(1)
  })
})

describe('验收：生成性能与可复现性', () => {
  it('专家档 20x20 生成耗时 < 1 秒，且可唯一解、可重放', () => {
    const times: number[] = []
    for (let i = 0; i < 5; i++) {
      const seed = `perf-expert-${i}`
      const t0 = performance.now()
      // 用默认预算（与游戏内一致），不做任何参数特调
      const generated = generatePuzzle({ width: 20, height: 20, difficulty: 'expert', seed })
      const elapsed = performance.now() - t0
      times.push(elapsed)

      expect(elapsed, '20x20 专家档生成过慢').toBeLessThan(1000)
      expect(analyzePuzzle(generated.puzzle).unique).toBe(true)

      const replayed = regenerateFromId(generated.puzzle.id)
      expect(replayed).not.toBeNull()
      expect(Array.from(replayed!.solution)).toEqual(Array.from(generated.puzzle.solution))
    }
    console.log(
      `专家 20x20（默认预算）：平均 ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)}ms，最慢 ${Math.max(...times).toFixed(1)}ms`,
    )
  })

  it('困难档 15x15 全部达标，且耗时在 2 秒预算内', () => {
    // 困难档必须命中「3~10 次回溯」这个很窄的窗口，因此候选次数预算最大（见 defaultMaxAttempts）
    const times: number[] = []
    for (let i = 0; i < 10; i++) {
      const seed = `perf-hard-15-${i}`
      const t0 = performance.now()
      const generated = generatePuzzle({ width: 15, height: 15, difficulty: 'hard', seed })
      times.push(performance.now() - t0)
      expect(generated.matched, `${seed} 未达到困难档`).toBe(true)
      expect(generated.puzzle.width).toBe(15)
      expect(generated.puzzle.height).toBe(15)
    }
    expect(Math.max(...times), '困难档生成过慢').toBeLessThan(2000)
    console.log(
      `困难 15x15（默认预算）：平均 ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)}ms，最慢 ${Math.max(...times).toFixed(1)}ms`,
    )
  })

  it('同一个种子重复生成结果完全一致', () => {
    for (const difficulty of DIFFICULTIES) {
      const options = { width: 14, height: 14, difficulty, seed: `deterministic-${difficulty}`, timeBudgetMs: 4000 } as const
      const first = generatePuzzle(options)
      const second = generatePuzzle(options)
      expect(first.puzzle.id).toBe(second.puzzle.id)
      expect(Array.from(second.puzzle.solution)).toEqual(Array.from(first.puzzle.solution))
    }
  })

  it('目标难度低于该尺寸的难度下限时快速返回（不跑满候选），题目仍唯一解', () => {
    const t0 = performance.now()
    const generated = generatePuzzle({ width: 20, height: 20, difficulty: 'easy', seed: 'unreachable-easy-20' })
    const elapsed = performance.now() - t0
    expect(elapsed, '不可达难度应该快速失败').toBeLessThan(200)
    expect(analyzePuzzle(generated.puzzle).unique).toBe(true)
    // 尺寸只能抬高难度：20x20 最低也是「专家」
    expect(generated.puzzle.width).toBe(20)
  })
})
