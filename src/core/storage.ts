/**
 * localStorage 持久化层
 * ============================================================================
 * 全部数据都存 localStorage（无后端）：
 *   nonogram-settings-v1  设置（由 zustand/persist 管理，见 store/settingsStore.ts）
 *   nonogram-progress-v1  当前谜题进度（棋盘 / 计时 / 错误数），刷新后可恢复
 *   nonogram-records-v1   最佳成绩（按 difficulty + seed 分组）
 *   nonogram-history-v1   历史成绩
 */

import type { Difficulty, JudgeMode } from './types'

const PROGRESS_KEY = 'nonogram-progress-v1'
const RECORDS_KEY = 'nonogram-records-v1'
const HISTORY_KEY = 'nonogram-history-v1'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 隐私模式 / 配额满：静默降级为无存档 */
  }
}

export interface StoredProgress {
  puzzleId: string
  difficulty: Difficulty
  width: number
  height: number
  seed: string
  title?: string
  /** 玩家棋盘（每格 1 字节） */
  board: string
  /** 谜题答案（自定义/分享谜题刷新后需要它重建线索） */
  solution: string
  elapsedMs: number
  mistakes: number
  hintsUsed: number
  penaltyMs: number
  judgeMode: JudgeMode
  completed: boolean
  updatedAt: number
}

export function saveProgress(progress: StoredProgress): void {
  writeJson(PROGRESS_KEY, progress)
}

export function loadProgress(): StoredProgress | null {
  const raw = readJson<StoredProgress | null>(PROGRESS_KEY, null)
  if (!raw || typeof raw.puzzleId !== 'string') return null
  return raw
}

export function clearProgress(): void {
  try {
    localStorage.removeItem(PROGRESS_KEY)
  } catch {
    /* ignore */
  }
}

export interface BestRecord {
  timeMs: number
  mistakes: number
  hintsUsed: number
  at: number
}

type RecordMap = Record<string, BestRecord>

export function recordKey(difficulty: Difficulty, seed: string): string {
  return `${difficulty}:${seed}`
}

export function loadRecords(): RecordMap {
  return readJson<RecordMap>(RECORDS_KEY, {})
}

export function saveRecords(records: RecordMap): void {
  writeJson(RECORDS_KEY, records)
}

export function getBest(difficulty: Difficulty, seed: string): BestRecord | null {
  const records = loadRecords()
  return records[recordKey(difficulty, seed)] ?? null
}

/** 写入最佳成绩；返回 true 表示刷新了记录 */
export function submitRecord(difficulty: Difficulty, seed: string, record: BestRecord): boolean {
  const records = loadRecords()
  const key = recordKey(difficulty, seed)
  const prev = records[key]
  const better = !prev || record.timeMs < prev.timeMs || (record.timeMs === prev.timeMs && record.mistakes < prev.mistakes)
  if (better) {
    records[key] = record
    saveRecords(records)
  }
  return better
}

export interface HistoryEntry {
  puzzleId: string
  difficulty: Difficulty
  width: number
  height: number
  seed: string
  title?: string
  timeMs: number
  mistakes: number
  hintsUsed: number
  completedAt: number
}

export function loadHistory(): HistoryEntry[] {
  const list = readJson<HistoryEntry[]>(HISTORY_KEY, [])
  return Array.isArray(list) ? list : []
}

export function pushHistory(entry: HistoryEntry, limit = 50): HistoryEntry[] {
  const list = loadHistory().filter((e) => e.puzzleId !== entry.puzzleId || e.completedAt !== entry.completedAt)
  list.unshift(entry)
  const trimmed = list.slice(0, limit)
  writeJson(HISTORY_KEY, trimmed)
  return trimmed
}

export function clearHistory(): void {
  writeJson(HISTORY_KEY, [])
}

/**
 * 棋盘编解码。
 * 棋盘有 3 种状态（空 / 填充 / X 标记），不能按位压缩，因此用 '0'|'1'|'2' 字符串存储：
 * 可读、无歧义、体积可接受（25x25 也才 625 个字符）。
 */
export function encodeBoard(board: Uint8Array): string {
  let out = ''
  for (let i = 0; i < board.length; i++) out += board[i] > 2 ? '0' : String(board[i])
  return out
}

export function decodeBoard(token: string, length: number): Uint8Array | null {
  if (typeof token !== 'string' || token.length !== length) return null
  const board = new Uint8Array(length)
  for (let i = 0; i < length; i++) {
    const ch = token.charCodeAt(i) - 48
    if (ch < 0 || ch > 2) return null
    board[i] = ch
  }
  return board
}
