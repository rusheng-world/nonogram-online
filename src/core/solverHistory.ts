/**
 * 自动解题的输入历史
 * ============================================================================
 * 只存「尺寸 + 线索 + 结论 + 时间」，最多 10 条，纯本地（localStorage）。
 * 与游戏存档 / 计时 / 成绩完全无关，不写入任何游戏记录（需求 9.1 / 9.9）。
 */

import { SOLVER_HISTORY_KEY, readStored, removeStored, writeStored } from './storage'
import { MAX_SOLVER_SIZE, MIN_SOLVER_SIZE } from './solverInput'
import type { SolveStatus } from './solver'

export const SOLVER_HISTORY_LIMIT = 10

export interface SolverHistoryEntry {
  width: number
  height: number
  rowClues: number[][]
  colClues: number[][]
  /** 上一次这道输入算出来的结论（可能没有） */
  status?: SolveStatus
  at: number
}

function isClueMatrix(value: unknown): value is number[][] {
  return (
    Array.isArray(value) &&
    value.every(
      (line) => Array.isArray(line) && line.every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0),
    )
  )
}

/** 反序列化时做一次结构校验，避免手改过 localStorage 之后页面崩掉 */
function sanitize(value: unknown): SolverHistoryEntry | null {
  if (!value || typeof value !== 'object') return null
  const entry = value as Partial<SolverHistoryEntry>
  const { width, height } = entry
  if (typeof width !== 'number' || typeof height !== 'number') return null
  if (!Number.isInteger(width) || !Number.isInteger(height)) return null
  if (width < MIN_SOLVER_SIZE || height < MIN_SOLVER_SIZE) return null
  if (width > MAX_SOLVER_SIZE || height > MAX_SOLVER_SIZE) return null
  if (!isClueMatrix(entry.rowClues) || !isClueMatrix(entry.colClues)) return null
  if (entry.rowClues.length !== height || entry.colClues.length !== width) return null
  return {
    width,
    height,
    rowClues: entry.rowClues.map((line) => line.slice()),
    colClues: entry.colClues.map((line) => line.slice()),
    status: entry.status,
    at: typeof entry.at === 'number' ? entry.at : Date.now(),
  }
}

export function loadSolverHistory(): SolverHistoryEntry[] {
  // 走统一的存储层：自动处理 schema 信封、旧格式裸数据与损坏回退
  const parsed = readStored<unknown>(SOLVER_HISTORY_KEY, [])
  if (!Array.isArray(parsed)) return []
  const list: SolverHistoryEntry[] = []
  for (const item of parsed) {
    const entry = sanitize(item)
    if (entry) list.push(entry)
    if (list.length >= SOLVER_HISTORY_LIMIT) break
  }
  return list
}

function write(list: SolverHistoryEntry[]): void {
  // 隐私模式 / 配额满时存储层会自动降级为内存，这里不需要额外处理
  writeStored(SOLVER_HISTORY_KEY, list)
}

/** 线索指纹：同一组输入重复求解只保留最新一条 */
function fingerprint(entry: SolverHistoryEntry): string {
  return `${entry.width}x${entry.height}|${entry.rowClues.map((l) => l.join(',')).join('/')}|${entry.colClues
    .map((l) => l.join(','))
    .join('/')}`
}

export function pushSolverHistory(entry: Omit<SolverHistoryEntry, 'at'> & { at?: number }): SolverHistoryEntry[] {
  const record: SolverHistoryEntry = { ...entry, at: entry.at ?? Date.now() }
  const key = fingerprint(record)
  const list = loadSolverHistory().filter((item) => fingerprint(item) !== key)
  list.unshift(record)
  const trimmed = list.slice(0, SOLVER_HISTORY_LIMIT)
  write(trimmed)
  return trimmed
}

export function clearSolverHistory(): void {
  removeStored(SOLVER_HISTORY_KEY)
}

/** 历史条目的简短展示文本，例如 "10×10 · 行 3/4/5…" */
export function describeHistoryEntry(entry: SolverHistoryEntry): string {
  const rowText = entry.rowClues.map((line) => (line.length === 0 ? '0' : line.join(' '))).join(' / ')
  return `${entry.width}×${entry.height} · ${rowText}`
}
