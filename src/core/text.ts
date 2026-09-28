/**
 * 文本导入 / 导出
 * ============================================================================
 * 支持格式（自动识别，行内用空白/逗号/竖线分隔也可以）：
 *   # . #        |  1 0 1      |  █ · █
 *   . # .        |  0 1 0      |  · █ ·
 * 要求所有行等长；非法字符会给出带行号的错误提示。
 */

const FILLED_CHARS = new Set(['#', '1', 'x', 'X', '█', '■', '●', '*', 'o', 'O'])
const EMPTY_CHARS = new Set(['.', '0', '-', '_', ' ', '□', '·', ','])
const SEPARATORS = /[\s,，、|/;]+/

export interface ParsedGrid {
  width: number
  height: number
  grid: Uint8Array
}

export type ParseOutcome = { ok: true; data: ParsedGrid; warnings: string[] } | { ok: false; error: string }

export function parseTextGrid(text: string): ParseOutcome {
  const rawLines = text.replace(/\r\n?/g, '\n').split('\n')
  const rows: number[][] = []
  const warnings: string[] = []

  for (let li = 0; li < rawLines.length; li++) {
    const line = rawLines[li]
    if (line.trim().length === 0) continue
    const trimmed = line.trim()
    let tokens: string[]
    if (SEPARATORS.test(trimmed)) {
      tokens = trimmed.split(SEPARATORS).filter((t) => t.length > 0)
    } else {
      tokens = Array.from(trimmed)
    }

    const row: number[] = []
    for (const token of tokens) {
      const ch = token.length === 1 ? token : token[0]
      if (!token.length) continue
      if (FILLED_CHARS.has(ch)) {
        row.push(1)
      } else if (EMPTY_CHARS.has(ch)) {
        row.push(0)
      } else {
        return { ok: false, error: `第 ${li + 1} 行出现无法识别的字符「${token}」（可用：# . 1 0 █ · ）` }
      }
    }
    if (row.length === 0) continue
    rows.push(row)
  }

  if (rows.length === 0) return { ok: false, error: '没有解析到任何有效行，请粘贴由 # 和 . 组成的网格' }
  const width = rows[0].length
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].length !== width) {
      return {
        ok: false,
        error: `第 ${i + 1} 行长度为 ${rows[i].length}，与第 1 行的 ${width} 不一致（所有行必须等长）`,
      }
    }
  }

  const height = rows.length
  const grid = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) grid[y * width + x] = rows[y][x]
  }
  /*
   * 这里曾经有一条「尺寸超出范围，已自动裁剪到 5~50」的警告 —— 既是错文案（代码从不裁剪），
   * 也是不可达代码：唯一的调用方 editorStore.importText 紧接着就会用
   * MIN_EDITOR_SIZE / MAX_EDITOR_SIZE 拒绝越界尺寸，警告永远走不到界面上（L-10）。
   * 尺寸范围校验因此只保留在 editorStore 那一处，作为唯一判定入口。
   */
  return { ok: true, data: { width, height, grid }, warnings }
}

export function exportTextGrid(grid: ArrayLike<number>, width: number, height: number): string {
  const lines: string[] = []
  for (let y = 0; y < height; y++) {
    let line = ''
    for (let x = 0; x < width; x++) line += grid[y * width + x] ? '#' : '.'
    lines.push(line)
  }
  return lines.join('\n')
}
