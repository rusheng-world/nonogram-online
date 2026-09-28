import { describe, expect, it } from 'vitest'
import {
  buildShareUrl,
  decodePuzzleCode,
  decodeSolution,
  encodePuzzleCode,
  encodeSolution,
  MAX_SHARE_CODE_LENGTH,
  packBits,
  puzzleFromCode,
  shortHash,
  unpackBits,
} from '../src/core/encoding'
import { computeClues } from '../src/core/clues'
import { exportTextGrid, parseTextGrid } from '../src/core/text'
import { decodeBoard, encodeBoard } from '../src/core/storage'
import type { Puzzle } from '../src/core/types'

function makePuzzle(width: number, height: number, seedBits: number): Puzzle {
  const solution = new Uint8Array(width * height)
  let x = seedBits
  for (let i = 0; i < solution.length; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    solution[i] = x % 3 === 0 ? 1 : 0
  }
  const { rowClues, colClues } = computeClues(solution, width, height)
  return { id: 'x', width, height, solution, rowClues, colClues, difficulty: 'medium', seed: 'x' }
}

describe('位压缩与分享码', () => {
  it('位压缩可逆', () => {
    const bits = new Uint8Array([1, 0, 1, 1, 0, 0, 0, 1, 1, 1, 1])
    const packed = packBits(bits)
    expect(Array.from(unpackBits(packed, bits.length))).toEqual(Array.from(bits))
  })

  it('图案编码可逆', () => {
    const solution = new Uint8Array(23 * 17)
    for (let i = 0; i < solution.length; i++) solution[i] = i % 5 === 0 ? 1 : 0
    const token = encodeSolution(solution)
    expect(Array.from(decodeSolution(token, solution.length) ?? [])).toEqual(Array.from(solution))
  })

  it('分享码往返：尺寸/难度/图案完全一致', () => {
    const puzzle = makePuzzle(20, 15, 987654)
    const code = encodePuzzleCode(puzzle)
    const restored = puzzleFromCode(code)
    expect(restored).not.toBeNull()
    expect(restored!.width).toBe(20)
    expect(restored!.height).toBe(15)
    expect(restored!.difficulty).toBe('medium')
    expect(Array.from(restored!.solution)).toEqual(Array.from(puzzle.solution))
    expect(restored!.rowClues).toEqual(puzzle.rowClues)
    expect(restored!.colClues).toEqual(puzzle.colClues)
  })

  it('非法分享码返回 null（边界校验）', () => {
    expect(decodePuzzleCode('')).toBeNull()
    expect(decodePuzzleCode('v1.4.4.e.AAAA')).toBeNull() // 尺寸过小
    expect(decodePuzzleCode('v1.999.999.e.AAAA')).toBeNull() // 尺寸过大
    expect(decodePuzzleCode('v2.10.10.e.AAAA')).toBeNull() // 版本不对
    expect(decodePuzzleCode('v1.10.10.e.!!!!')).toBeNull() // 非法 base64
    expect(puzzleFromCode('garbage')).toBeNull()
  })

  it('分享链接带上 hash 路由', () => {
    const url = buildShareUrl(makePuzzle(5, 5, 42), 'https://example.com/game/')
    expect(url.startsWith('https://example.com/game/#/play?s=v1.5.5.')).toBe(true)
    const token = url.split('?s=')[1]
    expect(puzzleFromCode(token)?.width).toBe(5)
  })

  it('shortHash 稳定', () => {
    expect(shortHash('abc')).toBe(shortHash('abc'))
    expect(shortHash('abc')).not.toBe(shortHash('abd'))
  })
})

describe('分享码输入边界（长度上限 / 难度回退）', () => {
  it('50×50 的最大合法分享码仍在长度上限内，且能正常还原', () => {
    const puzzle = makePuzzle(50, 50, 20260928)
    const code = encodePuzzleCode(puzzle)
    // 313 字节 -> 418 字符 base64 + 11 字符头部 = 429（与 README 的说明一致）
    expect(code.length).toBe(429)
    expect(code.length).toBeLessThanOrEqual(MAX_SHARE_CODE_LENGTH)
    const restored = puzzleFromCode(code)
    expect(restored?.width).toBe(50)
    expect(restored?.height).toBe(50)
    expect(Array.from(restored!.solution)).toEqual(Array.from(puzzle.solution))
  })

  it('长度上限是硬门槛：超出 1 个字符就拒绝，且不做解码', () => {
    const over = 'v1.50.50.h.' + 'A'.repeat(MAX_SHARE_CODE_LENGTH - 10)
    expect(over.length).toBe(MAX_SHARE_CODE_LENGTH + 1)
    expect(decodePuzzleCode(over)).toBeNull()
  })

  it('几百 KB 的异常分享码被直接拒绝（不会做无意义的 base64 解码）', () => {
    expect(decodePuzzleCode('v1.5.5.e.' + 'A'.repeat(500_000))).toBeNull()
    expect(puzzleFromCode('v1.50.50.h.' + 'A'.repeat(500_000))).toBeNull()
  })

  it('难度段非法（未知 / 空 / 大写）时回退成 medium，而不是让链接作废', () => {
    const parts = encodePuzzleCode(makePuzzle(5, 5, 7)).split('.')
    const withTag = (tag: string) => [parts[0], parts[1], parts[2], tag, parts[4]].join('.')

    expect(decodePuzzleCode(withTag('z'))?.difficulty).toBe('medium')
    expect(decodePuzzleCode(withTag(''))?.difficulty).toBe('medium')
    expect(decodePuzzleCode(withTag('EASY'))?.difficulty).toBe('medium')
    // 合法标签仍然被尊重
    expect(decodePuzzleCode(withTag('e'))?.difficulty).toBe('easy')
    expect(decodePuzzleCode(withTag('x'))?.difficulty).toBe('expert')
    // 回退后的难度会一路传到谜题上
    expect(puzzleFromCode(withTag('z'))?.difficulty).toBe('medium')
  })

  it('段数过少 / 过多一律拒绝', () => {
    expect(decodePuzzleCode('v1.5.5')).toBeNull()
    expect(decodePuzzleCode('v1.5.5.m')).toBeNull()
    const code = encodePuzzleCode(makePuzzle(5, 5, 7))
    expect(decodePuzzleCode(code + '.extra')).toBeNull()
    expect(decodePuzzleCode('v1.5.5.m')).toBeNull()
  })
})

describe('文本导入导出', () => {
  it('解析 # 与 . 网格', () => {
    const result = parseTextGrid('#.#\n.#.\n##.')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.width).toBe(3)
    expect(result.data.height).toBe(3)
    expect(Array.from(result.data.grid)).toEqual([1, 0, 1, 0, 1, 0, 1, 1, 0])
  })

  it('支持 1/0、方块字符与分隔符', () => {
    const a = parseTextGrid('1 0 1\n0 1 0')
    const b = parseTextGrid('█·█\n·█·')
    const c = parseTextGrid('1,0,1\n0,1,0')
    for (const r of [a, b, c]) {
      expect(r.ok).toBe(true)
      if (r.ok) expect(Array.from(r.data.grid)).toEqual([1, 0, 1, 0, 1, 0])
    }
  })

  it('行长不一致时报错并指出行号', () => {
    const result = parseTextGrid('###\n##')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('第 2 行')
  })

  it('出现非法字符时报错', () => {
    const result = parseTextGrid('##?\n###')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('无法识别')
  })

  it('导出与解析互为逆运算', () => {
    const puzzle = makePuzzle(8, 6, 13579)
    const text = exportTextGrid(puzzle.solution, 8, 6)
    const parsed = parseTextGrid(text)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(Array.from(parsed.data.grid)).toEqual(Array.from(puzzle.solution))
  })
})

describe('进度存档编解码', () => {
  it('棋盘（含 X 标记）往返一致', () => {
    const board = Uint8Array.from([0, 1, 2, 1, 0, 2, 2, 1, 0, 0, 1, 2])
    const token = encodeBoard(board)
    expect(Array.from(decodeBoard(token, board.length) ?? [])).toEqual(Array.from(board))
  })

  it('长度不符或非法字符返回 null', () => {
    expect(decodeBoard('012', 4)).toBeNull()
    expect(decodeBoard('0120', 4)).not.toBeNull()
    expect(decodeBoard('0129', 4)).toBeNull()
  })
})
