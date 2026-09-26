import { describe, expect, it } from 'vitest'
import { clueSum, computeClues, computeLineClues, formatClue } from '../src/core/clues'

describe('computeLineClues', () => {
  it('全空行返回 [0]', () => {
    expect(computeLineClues([0, 0, 0, 0])).toEqual([0])
    expect(computeLineClues(new Uint8Array(0))).toEqual([0])
  })

  it('全满行返回 [长度]', () => {
    expect(computeLineClues([1, 1, 1, 1, 1])).toEqual([5])
    expect(computeLineClues(new Uint8Array([1]))).toEqual([1])
  })

  it('单格行', () => {
    expect(computeLineClues([1])).toEqual([1])
    expect(computeLineClues([0])).toEqual([0])
  })

  it('混合图案按从左到右的顺序输出', () => {
    expect(computeLineClues([1, 1, 0, 1, 0, 0, 1, 1, 1])).toEqual([2, 1, 3])
    expect(computeLineClues([0, 0, 1, 1, 1, 0])).toEqual([3])
    expect(computeLineClues([1, 0, 0, 0])).toEqual([1])
  })

  it('末尾连续块不会丢失', () => {
    expect(computeLineClues([0, 1, 0, 1, 1])).toEqual([1, 2])
  })
})

describe('computeClues', () => {
  it('同时算出行列线索', () => {
    const solution = new Uint8Array([
      1, 0, 1,
      1, 1, 0,
      0, 0, 1,
    ])
    const { rowClues, colClues } = computeClues(solution, 3, 3)
    expect(rowClues).toEqual([[1, 1], [2], [1]])
    expect(colClues).toEqual([[2], [1], [1, 1]])
  })

  it('1xN 与 Nx1 极端情况', () => {
    const row = computeClues(new Uint8Array([0, 1, 1, 0, 1]), 5, 1)
    expect(row.rowClues).toEqual([[2, 1]])
    expect(row.colClues).toEqual([[0], [1], [1], [0], [1]])

    const col = computeClues(new Uint8Array([0, 1, 1, 0, 1]), 1, 5)
    expect(col.colClues).toEqual([[2, 1]])
    expect(col.rowClues).toEqual([[0], [1], [1], [0], [1]])
  })

  it('全空棋盘的行列线索都是 [0]', () => {
    const { rowClues, colClues } = computeClues(new Uint8Array(6), 3, 2)
    expect(rowClues).toEqual([[0], [0]])
    expect(colClues).toEqual([[0], [0], [0]])
  })

  it('线索总和等于填充数', () => {
    const solution = new Uint8Array([1, 1, 0, 0, 1, 1, 1, 0, 1])
    const { rowClues, colClues } = computeClues(solution, 3, 3)
    expect(rowClues.reduce((a, c) => a + clueSum(c), 0)).toBe(6)
    expect(colClues.reduce((a, c) => a + clueSum(c), 0)).toBe(6)
  })

  it('formatClue 对空线索输出 0', () => {
    expect(formatClue([0])).toBe('0')
    expect(formatClue([])).toBe('0')
    expect(formatClue([3, 1])).toBe('3 1')
  })
})
