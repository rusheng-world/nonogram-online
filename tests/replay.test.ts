/**
 * 「刷新 / 分享链接能回到同一道题」的回归测试。
 *
 * 这是验收标准里「刷新页面后计时与进度可恢复」和「分享链接可开局」的前提：
 * 谜题 id 必须能**精确**重放出同一个图案。
 */

import { describe, expect, it } from 'vitest'
import { GENERATION_TIME_BUDGET_MS, boardSizeFor, generatePuzzle } from '../src/core/generator'
import { parsePuzzleId, puzzleIdFor, regenerateFromId } from '../src/core/replay'
import { DIFFICULTIES } from '../src/core/types'

function sameSolution(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

describe('谜题 id 重放', () => {
  it('parsePuzzleId 解析各种 id', () => {
    expect(parsePuzzleId(puzzleIdFor('hard', 17, 19, 'ab12cd34'))).toEqual({
      difficulty: 'hard',
      width: 17,
      height: 19,
      seed: 'ab12cd34',
    })
    // 种子内部可以再出现 `-`
    expect(parsePuzzleId('medium-10x15-daily-2026-09-21')?.seed).toBe('daily-2026-09-21')
    expect(parsePuzzleId('daily-2026-09-21')).toBeNull()
    expect(parsePuzzleId('easy-6x8')).toBeNull()
    expect(parsePuzzleId('nonsense-6x8-abc')).toBeNull()
    expect(parsePuzzleId('easy-1x8-abc')).toBeNull()
    expect(parsePuzzleId('easy-60x8-abc')).toBeNull()
    expect(parsePuzzleId('easy-6x8-')).toBeNull()
  })

  it('每个难度 8 题：按 id 重新生成得到完全相同的图案', () => {
    for (const difficulty of DIFFICULTIES) {
      for (let i = 0; i < 8; i++) {
        const seed = `replay-${difficulty}-${i}`
        const { width, height } = boardSizeFor(difficulty)
        // 刻意不传 maxAttempts：候选次数必须和 regenerateFromId 一样走默认值，
        // 否则「候选预算更小」的那一侧可能在没命中时返回兜底题，导致重放不出同一题。
        const generated = generatePuzzle({
          width,
          height,
          difficulty,
          seed,
          timeBudgetMs: GENERATION_TIME_BUDGET_MS,
          allowDowngrade: false,
          allowResize: false,
        })
        const replayed = regenerateFromId(generated.puzzle.id)
        expect(replayed, `${difficulty} #${i} 无法按 id 重放`).not.toBeNull()
        expect(replayed!.width).toBe(generated.puzzle.width)
        expect(replayed!.height).toBe(generated.puzzle.height)
        expect(replayed!.difficulty).toBe(generated.puzzle.difficulty)
        expect(sameSolution(replayed!.solution, generated.puzzle.solution), `${difficulty} #${i} 图案不一致`).toBe(true)
      }
    }
  })

  it('带降级的生成结果同样可以按 id 重放', () => {
    // 20×20 的难度地板就是「专家」，请求「困难」在数学上不可能达标，
    // 因此必定走降级分支：降到「中等」档的固定尺寸 10×10。
    const generated = generatePuzzle({
      width: 20,
      height: 20,
      difficulty: 'hard',
      seed: 'replay-flex-hard-20',
      timeBudgetMs: GENERATION_TIME_BUDGET_MS,
      allowDowngrade: true,
      allowResize: true,
    })
    expect(generated.matched).toBe(false)
    expect(generated.puzzle.width).toBe(10)
    expect(generated.puzzle.height).toBe(10)
    expect(generated.puzzle.difficulty).toBe('medium')

    const replayed = regenerateFromId(generated.puzzle.id)
    expect(replayed, '降级结果无法重放').not.toBeNull()
    expect(sameSolution(replayed!.solution, generated.puzzle.solution)).toBe(true)
  })
})
