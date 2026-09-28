/**
 * 「自动解题」页面的输入解析与校验
 * ============================================================================
 * 这一层只做**纯文本 -> 线索数组**的转换与合法性检查，不碰求解器：
 *   · 解析：容忍空格 / 半角逗号 / 全角逗号 / 顿号 / 分号 / 竖线等多种分隔符
 *   · 校验：把"物理上不可能"和"行列总数不匹配"这两类错误在求解之前拦下来
 *
 * 求解前的校验规则（对应需求 9.4）：
 *   1. 每个线索数字必须是非负整数（0 等价于空）
 *   2. 线索内 `数字之和 + 数字个数 - 1 <= 该方向长度`（否则这一行/列根本放不下）
 *   3. 所有行线索之和必须等于所有列线索之和（否则一定无解）
 *   4. 尺寸与线索条数一致
 */

/** 自动解题页面允许的尺寸范围 */
export const MIN_SOLVER_SIZE = 5
export const MAX_SOLVER_SIZE = 50
/** 超过这个尺寸会提示"计算量较大"（不禁止，只是提醒） */
export const SOLVER_SIZE_HINT = 20

export interface SolverInput {
  width: number
  height: number
  /** 只读：校验过程不会修改调用方的线索 */
  rowClues: readonly number[][]
  colClues: readonly number[][]
}

export interface ClueParseResult {
  clues: number[]
  /** 非法时给出人类可读的原因（含出错片段），合法时为 null */
  error: string | null
}

/** 一行线索里允许的分隔符：空格（含全角）、制表、逗号（半/全角）、顿号、分号、竖线 */
const SEPARATORS = /[\s\u3000,，、;；|]+/

/**
 * 解析单行线索文本，例如 `2 1 1`、`2,1,1`、`2，1，1`、`2、1` 都得到 [2,1,1]。
 * 空输入（或只有 0）表示该行/列没有任何块。
 */
export function parseClueLine(text: string): ClueParseResult {
  const trimmed = text.trim()
  if (trimmed === '') return { clues: [], error: null }

  const tokens = trimmed.split(SEPARATORS).filter((token) => token !== '')
  const clues: number[] = []
  for (const token of tokens) {
    if (!/^\d+$/.test(token)) {
      return { clues: [], error: `“${token}” 不是合法的数字（只能填非负整数）` }
    }
    const value = Number(token)
    if (!Number.isSafeInteger(value)) return { clues: [], error: `“${token}” 太大了` }
    if (value > 0) clues.push(value)
  }
  return { clues, error: null }
}

/**
 * 解析多行线索文本（一行一条线索），textarea 批量输入用。
 * 结尾的空行会被忽略，中间的空行同样按"该行无线索"处理。
 */
export function parseClueLines(text: string): { clues: number[][]; error: string | null } {
  const rows = text.split(/\r?\n/)
  // 去掉末尾连续空行（粘贴时很常见），保留下来的空行按"无线索"处理
  while (rows.length > 0 && rows[rows.length - 1].trim() === '') rows.pop()
  const clues: number[][] = []
  for (let i = 0; i < rows.length; i++) {
    const parsed = parseClueLine(rows[i])
    if (parsed.error) return { clues: [], error: `第 ${i + 1} 行：${parsed.error}` }
    clues.push(parsed.clues)
  }
  return { clues, error: null }
}

export interface BulkParseResult {
  rowClues: number[][] | null
  colClues: number[][] | null
  /** 解析失败的原因；成功时为 null */
  error: string | null
}

const ROW_LABEL = /^\s*(?:rows?|行|r)\s*[:：]\s*(.*)$/i
const COL_LABEL = /^\s*(?:cols?|columns?|列|c)\s*[:：]\s*(.*)$/i

/**
 * 解析「rows: …  cols: …」这种批量格式：
 *
 *   rows: 2 1 / 3 / 1 1
 *   cols: 1 1 / 2 / 3
 *
 * 每条线索之间用 `/` 或换行分隔；两个标签也可以各带一段多行内容。
 */
export function parseBulkClues(text: string): BulkParseResult {
  const lines = text.split(/\r?\n/)
  const buckets: { rows: string[]; cols: string[] } = { rows: [], cols: [] }
  let current: 'rows' | 'cols' | null = null
  let seenLabel = false

  for (const line of lines) {
    const rowMatch = ROW_LABEL.exec(line)
    const colMatch = COL_LABEL.exec(line)
    if (rowMatch) {
      seenLabel = true
      current = 'rows'
      if (rowMatch[1].trim() !== '') buckets.rows.push(rowMatch[1])
      continue
    }
    if (colMatch) {
      seenLabel = true
      current = 'cols'
      if (colMatch[1].trim() !== '') buckets.cols.push(colMatch[1])
      continue
    }
    if (current === null) {
      // 标签之前的内容忽略（允许用户写注释）
      continue
    }
    if (line.trim() === '') continue
    buckets[current].push(line)
  }

  if (!seenLabel) {
    return { rowClues: null, colClues: null, error: '没有找到 rows: / cols: 标签，请按示例格式填写' }
  }
  if (buckets.rows.length === 0 || buckets.cols.length === 0) {
    return { rowClues: null, colClues: null, error: '行线索或列线索为空，两者都要填写' }
  }

  const rows = parseClueLines(buckets.rows.join('\n').replace(/\s*\/\s*/g, '\n'))
  if (rows.error) return { rowClues: null, colClues: null, error: `行线索：${rows.error}` }
  const cols = parseClueLines(buckets.cols.join('\n').replace(/\s*\/\s*/g, '\n'))
  if (cols.error) return { rowClues: null, colClues: null, error: `列线索：${cols.error}` }

  return { rowClues: rows.clues, colClues: cols.clues, error: null }
}

export interface SolverIssue {
  scope: 'size' | 'rows' | 'cols' | 'total'
  /** scope 为 rows / cols 时的行号或列号（0 基） */
  index?: number
  message: string
}

export interface SolverValidation {
  ok: boolean
  issues: SolverIssue[]
  /** 与行数等长的错误文案数组，便于表单逐项标红（无错为 null） */
  rowIssues: (string | null)[]
  colIssues: (string | null)[]
  sizeIssue: string | null
  totalIssue: string | null
  rowSum: number
  colSum: number
}

function lineSum(clues: readonly number[]): number {
  let sum = 0
  for (const c of clues) sum += c
  return sum
}

/** 线索是否放得进长度为 len 的一行/列：Σ块长 + (块数 - 1) <= len */
export function clueFitsLine(clues: readonly number[], len: number): boolean {
  const blocks = clues.filter((c) => c > 0)
  if (blocks.length === 0) return true
  return lineSum(blocks) + blocks.length - 1 <= len
}

/**
 * 求解前的完整校验。返回的问题列表按"先尺寸、再逐行/逐列、最后总数"排序，
 * 界面可以直接按 scope + index 定位到具体输入框。
 */
export function validateSolverInput(input: SolverInput): SolverValidation {
  const issues: SolverIssue[] = []
  const { width, height } = input

  let sizeIssue: string | null = null
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    sizeIssue = '宽和高必须是整数'
  } else if (width < MIN_SOLVER_SIZE || height < MIN_SOLVER_SIZE) {
    sizeIssue = `最小 ${MIN_SOLVER_SIZE}×${MIN_SOLVER_SIZE}`
  } else if (width > MAX_SOLVER_SIZE || height > MAX_SOLVER_SIZE) {
    sizeIssue = `最大 ${MAX_SOLVER_SIZE}×${MAX_SOLVER_SIZE}`
  }
  if (sizeIssue) issues.push({ scope: 'size', message: sizeIssue })

  const rowIssues: (string | null)[] = input.rowClues.map(() => null)
  const colIssues: (string | null)[] = input.colClues.map(() => null)

  // 尺寸与线索条数必须一致（批量输入时最容易出错的地方）
  if (input.rowClues.length !== height) {
    issues.push({ scope: 'rows', message: `行线索条数（${input.rowClues.length}）应等于高（${height}）` })
  }
  if (input.colClues.length !== width) {
    issues.push({ scope: 'cols', message: `列线索条数（${input.colClues.length}）应等于宽（${width}）` })
  }

  for (let y = 0; y < input.rowClues.length; y++) {
    const clues = input.rowClues[y]
    for (const c of clues) {
      if (!Number.isInteger(c) || c < 0) {
        const message = '线索只能是非负整数'
        rowIssues[y] = message
        issues.push({ scope: 'rows', index: y, message: `第 ${y + 1} 行：${message}` })
        break
      }
    }
    if (rowIssues[y]) continue
    if (!clueFitsLine(clues, width)) {
      const message = `线索 [${clues.join(' ')}] 放不进 ${width} 格`
      rowIssues[y] = message
      issues.push({ scope: 'rows', index: y, message: `第 ${y + 1} 行：${message}` })
    }
  }

  for (let x = 0; x < input.colClues.length; x++) {
    const clues = input.colClues[x]
    for (const c of clues) {
      if (!Number.isInteger(c) || c < 0) {
        const message = '线索只能是非负整数'
        colIssues[x] = message
        issues.push({ scope: 'cols', index: x, message: `第 ${x + 1} 列：${message}` })
        break
      }
    }
    if (colIssues[x]) continue
    if (!clueFitsLine(clues, height)) {
      const message = `线索 [${clues.join(' ')}] 放不进 ${height} 格`
      colIssues[x] = message
      issues.push({ scope: 'cols', index: x, message: `第 ${x + 1} 列：${message}` })
    }
  }

  let rowSum = 0
  for (const clues of input.rowClues) rowSum += lineSum(clues)
  let colSum = 0
  for (const clues of input.colClues) colSum += lineSum(clues)

  let totalIssue: string | null = null
  if (rowSum !== colSum) {
    totalIssue = `行线索总和 ${rowSum} 与列线索总和 ${colSum} 不匹配，这样的题目一定无解`
    issues.push({ scope: 'total', message: totalIssue })
  }

  return {
    ok: issues.length === 0,
    issues,
    rowIssues,
    colIssues,
    sizeIssue,
    totalIssue,
    rowSum,
    colSum,
  }
}

/** 线索的规范文本（回填到输入框 / 展示用） */
export function formatClueInput(clues: readonly number[]): string {
  return clues.filter((c) => c > 0).join(' ')
}

/** 空线索矩阵 */
export function emptyClues(count: number): number[][] {
  return Array.from({ length: count }, () => [])
}

/**
 * 内置示例（5×5 的菱形/爱心图案）：
 * 用来一键填表，也用来向用户解释输入格式。已由单元测试保证它是**唯一解**。
 */
export const SOLVER_SAMPLE: {
  width: number
  height: number
  rowClues: number[][]
  colClues: number[][]
  bulk: string
} = {
  width: 5,
  height: 5,
  rowClues: [[3], [5], [5], [3], [1]],
  colClues: [[2], [4], [5], [4], [2]],
  bulk: 'rows: 3 / 5 / 5 / 3 / 1\ncols: 2 / 4 / 5 / 4 / 2',
}

/** 调整线索矩阵的行数，保留已有内容（用户改尺寸时不至于全丢） */
export function resizeClues(clues: number[][], count: number): number[][] {
  const next: number[][] = []
  for (let i = 0; i < count; i++) next.push(clues[i] ? clues[i].slice() : [])
  return next
}
