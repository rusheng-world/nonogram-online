/**
 * 分享链接 / 紧凑编码
 * ============================================================================
 * 把「图案 + 尺寸 (+ 难度)」编码进 URL hash，实现零后端的谜题分享：
 *   #/play?s=v1.12.10.h.AcRf...
 * 编码方式：位压缩（每格 1 bit，行优先，MSB 优先）-> 字节 -> base64url。
 * 12x10 的图案只有 15 个字节，链接非常短。
 */

import { computeClues } from './clues'
import { MAX_EDITOR_SIZE, MIN_EDITOR_SIZE, isDifficulty } from './types'
import type { Difficulty, Puzzle } from './types'

const DIFFICULTY_CODE: Record<Difficulty, string> = { easy: 'e', medium: 'm', hard: 'h', expert: 'x', }
const CODE_DIFFICULTY: Record<string, Difficulty> = { e: 'easy', m: 'medium', h: 'hard', x: 'expert' }

/* base64url 编解码。刻意不依赖 btoa/atob/Buffer：手写实现让同一份代码
 * 在浏览器、Node（vitest）与任何受限环境里都得到完全一致的结果。 */

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_LOOKUP: Int16Array = (() => {
  const table = new Int16Array(128).fill(-1)
  for (let i = 0; i < B64_ALPHABET.length; i++) table[B64_ALPHABET.charCodeAt(i)] = i
  return table
})()

function bytesToBase64Url(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const hasB1 = i + 1 < bytes.length
    const hasB2 = i + 2 < bytes.length
    const b1 = hasB1 ? bytes[i + 1] : 0
    const b2 = hasB2 ? bytes[i + 2] : 0
    out += B64_ALPHABET[b0 >> 2]
    out += B64_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)]
    if (hasB1) out += B64_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)]
    if (hasB2) out += B64_ALPHABET[b2 & 0x3f]
  }
  // 去掉填充并转成 url 安全字符（链接里可以直接用）
  return out.replace(/\+/g, '-').replace(/\//g, '_')
}

function base64UrlToBytes(text: string): Uint8Array {
  const clean = text.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '')
  const out = new Uint8Array(Math.floor((clean.length * 6) / 8))
  let acc = 0
  let bits = 0
  let written = 0
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i)
    const value = code < 128 ? B64_LOOKUP[code] : -1
    if (value < 0) throw new Error('非法 base64 字符')
    acc = (acc << 6) | value
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[written++] = (acc >> bits) & 0xff
    }
  }
  return written === out.length ? out : out.slice(0, written)
}

/** 位压缩：每格 1 bit */
export function packBits(solution: ArrayLike<number>): Uint8Array {
  const byteLength = Math.ceil(solution.length / 8)
  const bytes = new Uint8Array(byteLength)
  for (let i = 0; i < solution.length; i++) {
    if (solution[i]) bytes[i >> 3] |= 0x80 >> (i & 7)
  }
  return bytes
}

export function unpackBits(bytes: Uint8Array, length: number): Uint8Array {
  const out = new Uint8Array(length)
  for (let i = 0; i < length; i++) out[i] = bytes[i >> 3] & (0x80 >> (i & 7)) ? 1 : 0
  return out
}

export function encodeSolution(solution: ArrayLike<number>): string {
  return bytesToBase64Url(packBits(solution))
}

export function decodeSolution(token: string, length: number): Uint8Array | null {
  try {
    const bytes = base64UrlToBytes(token)
    if (bytes.length < Math.ceil(length / 8)) return null
    return unpackBits(bytes, length)
  } catch {
    return null
  }
}

/** 把谜题编码成分享码（不含 id/时间等无关信息） */
export function encodePuzzleCode(puzzle: Puzzle): string {
  return ['v1', puzzle.width, puzzle.height, DIFFICULTY_CODE[puzzle.difficulty], encodeSolution(puzzle.solution)].join('.')
}

export interface DecodedPuzzle {
  width: number
  height: number
  difficulty: Difficulty
  solution: Uint8Array
}

/** 解析分享码（严格校验，非法输入返回 null） */
export function decodePuzzleCode(code: string): DecodedPuzzle | null {
  const parts = code.split('.')
  if (parts.length !== 5 || parts[0] !== 'v1') return null
  const width = Number(parts[1])
  const height = Number(parts[2])
  if (!Number.isInteger(width) || !Number.isInteger(height)) return null
  if (width < MIN_EDITOR_SIZE || height < MIN_EDITOR_SIZE) return null
  if (width > MAX_EDITOR_SIZE || height > MAX_EDITOR_SIZE) return null
  const difficulty = CODE_DIFFICULTY[parts[3]] ?? 'medium'
  const solution = decodeSolution(parts[4], width * height)
  if (!solution) return null
  return { width, height, difficulty, solution }
}

/** 把分享码还原成可以开玩的谜题（线索现算） */
export function puzzleFromCode(code: string, fallbackDifficulty?: Difficulty): Puzzle | null {
  const decoded = decodePuzzleCode(code)
  if (!decoded) return null
  const { width, height, solution } = decoded
  const difficulty = isDifficulty(decoded.difficulty) ? decoded.difficulty : (fallbackDifficulty ?? 'medium')
  const { rowClues, colClues } = computeClues(solution, width, height)
  const seed = `shared-${shortHash(code)}`
  return {
    id: `${difficulty}-${width}x${height}-${seed}`,
    width,
    height,
    solution,
    rowClues,
    colClues,
    difficulty,
    seed,
  }
}

/** 图案指纹（用于给自定义谜题生成稳定的 id/seed） */
export function shortHash(input: string | Uint8Array): string {
  let h = 2166136261
  if (typeof input === 'string') {
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
  } else {
    for (let i = 0; i < input.length; i++) {
      h ^= input[i]
      h = Math.imul(h, 16777619)
    }
  }
  return (h >>> 0).toString(36)
}

/** 完整分享 URL（含 hash 路由） */
export function buildShareUrl(puzzle: Puzzle, baseUrl?: string): string {
  const origin = baseUrl ?? (typeof location !== 'undefined' ? `${location.origin}${location.pathname}` : '')
  return `${origin}#/play?s=${encodePuzzleCode(puzzle)}`
}
