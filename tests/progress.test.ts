/**
 * 线索自动划线（core/progress.ts）的回归测试。
 *
 * 重点覆盖两类历史 bug：
 *   1. 列线索读错格子：棋盘是**行优先展平**的数组，读第 x 列必须用
 *      step = width、offset = x，早期实现直接传 height 当线长，读的其实是第一行。
 *   2. 误划线：判定必须以「解」为准，涂错位置的格子绝不能被划掉
 *      （早期版本只看“涂的格子能不能摆得下线索”，会出现涂错却划线）。
 */

import { describe, expect, it } from 'vitest'
import { computeLineDone } from '../src/core/progress'
import { EMPTY, FILLED, UNKNOWN } from '../src/core/types'

/** 用文本描述一条线：'#' = 解里有黑格 / 玩家涂黑，'.' = 没有 */
function cells(text: string): Uint8Array {
  return new Uint8Array([...text].map((ch) => (ch === '#' ? FILLED : UNKNOWN)))
}

/** 解（0/1 数组） */
function solution(text: string): Uint8Array {
  return new Uint8Array([...text].map((ch) => (ch === '#' ? 1 : 0)))
}

describe('computeLineDone：行（step = 1）', () => {
  it('整行涂对 => 划掉', () => {
    expect(computeLineDone([5], cells('#####'), solution('#####'), 5)).toEqual([true])
  })

  it('只涂了一部分 => 不划掉', () => {
    expect(computeLineDone([5], cells('###..'), solution('#####'), 5)).toEqual([false])
  })

  it('位置涂错（涂错格子）=> 不划掉，哪怕长度对得上', () => {
    // 解是 ..###，玩家涂成 ###..
    expect(computeLineDone([3], cells('###..'), solution('..###'), 5)).toEqual([false])
  })

  it('多涂一格 => 整行都不划（涂法已经和线索矛盾）', () => {
    expect(computeLineDone([2], cells('###..'), solution('##...'), 5)).toEqual([false])
  })

  it('线索 [2,3]：先做对 3 那段 => 只有「3」被划掉', () => {
    // 解 = ##.###..（0-1 与 3-5），玩家只涂了 3-5
    expect(computeLineDone([2, 3], cells('...###..'), solution('##.###..'), 8)).toEqual([false, true])
  })

  it('线索 [2,3]：整行涂对 => 两条都划掉', () => {
    expect(computeLineDone([2, 3], cells('##.###..'), solution('##.###..'), 8)).toEqual([true, true])
  })

  it('线索 [2,2]：涂的位置既不是第 1 段也不是第 2 段 => 一段都不划', () => {
    expect(computeLineDone([2, 2], cells('..##....'), solution('##.##...'), 8)).toEqual([false, false])
  })

  it('线索 [2,2]：涂对的正好是解里的第 2 段 => 只划第 2 条', () => {
    expect(computeLineDone([2, 2], cells('...##...'), solution('##.##...'), 8)).toEqual([false, true])
  })

  it('线索 [2,2]：第一段涂对 => 第一条划掉，第二条不划', () => {
    expect(computeLineDone([2, 2], cells('##......'), solution('##.##...'), 8)).toEqual([true, false])
  })

  it('空线索 [0]：永远不划线（免得开局所有空白行列都被划掉）', () => {
    expect(computeLineDone([0], cells('....'), solution('....'), 4)).toEqual([false])
  })

  it('X 标记不影响划线：解里的黑格全部涂黑即可', () => {
    const board = cells('##....')
    board[2] = EMPTY
    board[3] = EMPTY
    expect(computeLineDone([2], board, solution('##....'), 6)).toEqual([true])
  })

  it('1x1 盘面', () => {
    expect(computeLineDone([1], cells('#'), solution('#'), 1)).toEqual([true])
    expect(computeLineDone([1], cells('.'), solution('#'), 1)).toEqual([false])
  })
})

describe('computeLineDone：列（step = width / offset = x）', () => {
  // 5x5 棋盘，第 0 列整列涂满，解也是第 0 列整列 —— 这就是那个 bug 的复现用例
  const width = 5
  const height = 5
  const board = new Uint8Array(25)
  const sol = new Uint8Array(25)
  for (let y = 0; y < height; y++) {
    board[y * width + 0] = FILLED
    sol[y * width + 0] = 1
  }

  it('第 0 列线索 [5] => 划掉（旧实现读错格子会得到 false）', () => {
    expect(computeLineDone([5], board, sol, height, width, 0)).toEqual([true])
  })

  it('第 1 列是空列 => 空线索不划线', () => {
    expect(computeLineDone([0], board, sol, height, width, 1)).toEqual([false])
  })

  it('列必须用 step = width 读取，否则读到的是别的格子', () => {
    // 解：第 0 列整列黑；另外 (0,1) 也是黑格（所以第 0 行线索是 [2]）
    const sol2 = new Uint8Array(25)
    for (let y = 0; y < 5; y++) sol2[y * 5 + 0] = 1
    sol2[1] = 1
    // 玩家只把第 0 列涂对了
    const painted = new Uint8Array(25)
    for (let y = 0; y < 5; y++) painted[y * 5 + 0] = FILLED

    // 正确读第 0 列：整列涂对 => 划线
    expect(computeLineDone([5], painted, sol2, 5, 5, 0)).toEqual([true])
    // 若把列当成行来读（step = 1 / offset = 0），读到的是第 0 行：解里是 2 连块而只涂了 1 格 => 不划线
    expect(computeLineDone([5], painted, sol2, 5, 1, 0)).toEqual([false])
  })
})

describe('computeLineDone：矩形盘面', () => {
  it('3 宽 5 高：列长度取棋盘高度', () => {
    const width = 3
    const height = 5
    const board = new Uint8Array(width * height)
    const sol = new Uint8Array(width * height)
    for (let y = 0; y < height; y++) {
      board[y * width + 1] = FILLED
      sol[y * width + 1] = 1
    }
    expect(computeLineDone([5], board, sol, height, width, 1)).toEqual([true])
    expect(computeLineDone([0], board, sol, height, width, 0)).toEqual([false])
    expect(computeLineDone([5], board, sol, height, width, 0)).toEqual([false])
  })
})
