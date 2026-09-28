/**
 * 本地持久化层（唯一的 localStorage 出入口）
 * ============================================================================
 * 设计要点（对应需求 21「Storage 层优化」）：
 *
 * 1. **统一 API**：所有读写都走 readJson / writeJson / removeJson 三个私有原语，
 *    业务函数只描述「存什么」，不再各自 try/catch。
 * 2. **schema version**：每条数据都包成 `{ v, data }` 信封。当前版本写在
 *    STORAGE_SCHEMA_VERSION 里；读取时
 *      · 信封版本 > 当前版本（用户装过更新的版本又回退）=> 不解析，回退到默认值，
 *        避免用旧代码解释新结构导致崩溃；
 *      · 裸数据（没有 v/data 字段）= 1.1.0 之前的旧格式 => 就地当成 payload 接受，
 *        下次写入时自动升级成信封格式（这就是「数据迁移」，不需要用户做任何事）。
 * 3. **损坏恢复**：JSON 解析失败或结构不合法 => 删掉这一条并回退到默认值，
 *    绝不让一条坏数据把整个应用打死。
 * 4. **localStorage 不可用**（隐私模式 / 配额满 / 无 window）：自动降级为内存存储，
 *    当次会话仍然能正常玩，只是刷新后不保留。可用性通过 storageAvailable() 暴露给 UI。
 *
 * 存储键一览：
 *   nonogram-settings-v1      设置（由 zustand/persist 自己管理，见 store/settingsStore.ts）
 *   nonogram-schema           存储层元信息（当前 schema 版本 + 最近写入时间）
 *   nonogram-progress-v1      当前对局进度（棋盘 / 计时 / 错误 / 提示）
 *   nonogram-records-v1       最佳成绩（按 difficulty:seed 分组，区分「不限提示」/「无提示」）
 *   nonogram-history-v1       历史成绩（最近 N 局）
 *   nonogram-daily-v1         每日挑战完成记录（按 UTC 日期）
 *   nonogram-achievements-v1  成就解锁状态
 */

import type { Difficulty, JudgeMode, PuzzleSource } from './types'

/** 当前存储结构版本。改变任何 payload 结构时都要 +1 并在 readJson 里写迁移。 */
export const STORAGE_SCHEMA_VERSION = 2

const SCHEMA_KEY = 'nonogram-schema'
const PROGRESS_KEY = 'nonogram-progress-v1'
const RECORDS_KEY = 'nonogram-records-v1'
const HISTORY_KEY = 'nonogram-history-v1'
const DAILY_KEY = 'nonogram-daily-v1'
const ACHIEVEMENTS_KEY = 'nonogram-achievements-v1'

/**
 * 「自动解题」输入历史。它由 core/solverHistory.ts 拥有，但 key 与清理逻辑收在这里，
 * 保证「清空全部数据」不会漏掉任何一条（见 clearAllData）。
 */
export const SOLVER_HISTORY_KEY = 'nonogram-solver-history-v1'

/**
 * 新手教程进度（需求 12 / 13）：只存「学到第几阶段」与「是否学完」。
 * 教程对局不会走到任何成绩写入逻辑（见 store/gameStore.ts 的 tutorial 分支），
 * 所以这个 key 是教程在本地留下的唯一痕迹。
 */
export const TUTORIAL_KEY = 'nonogram-tutorial-v1'

/** 历史成绩最多保留多少条（统计页要按它算平均 / 连续天数，所以别太小） */
export const HISTORY_LIMIT = 200

interface Envelope<T> {
  v: number
  data: T
}

// ---------------------------------------------------------------------------
// 底层原语
// ---------------------------------------------------------------------------

/** localStorage 是否真的可用（隐私模式下 getItem 会直接抛异常） */
let available: boolean | null = null
export function storageAvailable(): boolean {
  if (available !== null) return available
  try {
    const probe = '__nonogram_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    available = true
  } catch {
    available = false
  }
  return available
}

/** 不可用时的内存兜底，保证功能不崩 */
const memory = new Map<string, string>()

function rawGet(key: string): string | null {
  if (storageAvailable()) {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  }
  return memory.get(key) ?? null
}

function rawSet(key: string, value: string): void {
  if (storageAvailable()) {
    try {
      window.localStorage.setItem(key, value)
      return
    } catch {
      /* 配额满：退化成内存存储 */
    }
  }
  memory.set(key, value)
}

function rawRemove(key: string): void {
  if (storageAvailable()) {
    try {
      window.localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  }
  memory.delete(key)
}

function isEnvelope(value: unknown): value is Envelope<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { v?: unknown }).v === 'number' &&
    'data' in (value as object)
  )
}

/**
 * 读取一条数据。
 *
 * @param validate 可选的形状校验；不通过就当作「损坏」处理（删除 + 回退默认值）
 */
function readJson<T>(key: string, fallback: T, validate?: (value: unknown) => boolean): T {
  const raw = rawGet(key)
  if (raw === null) return fallback

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    // 损坏恢复：解析不了的条目直接删掉，不影响其它数据
    rawRemove(key)
    return fallback
  }

  let payload: unknown = parsed
  if (isEnvelope(parsed)) {
    if (parsed.v > STORAGE_SCHEMA_VERSION) {
      // 未来版本写下的数据：不猜它的结构，安全回退
      return fallback
    }
    payload = parsed.data
  }
  // 没有信封 = 1.1.0 之前的裸数据，直接当 payload 用（下次写入时自动升级）

  if (validate && !validate(payload)) {
    rawRemove(key)
    return fallback
  }
  return payload as T
}

function writeJson(key: string, value: unknown): void {
  const envelope: Envelope<unknown> = { v: STORAGE_SCHEMA_VERSION, data: value }
  try {
    rawSet(key, JSON.stringify(envelope))
  } catch {
    /* 循环引用等异常：静默丢弃，绝不让存档写入把游戏搞崩 */
  }
}

function removeJson(key: string): void {
  rawRemove(key)
}

// ---------------------------------------------------------------------------
// 通用信封读写（storage.ts 之外的模块复用同一套 schema / 迁移 / 损坏恢复逻辑）
// ---------------------------------------------------------------------------

/**
 * 读取任意 key 下的数据：自动处理 `{v,data}` 信封、1.1.0 之前的裸数据、以及
 * JSON 损坏时的回退。`nonogram-solver-history-v1` 这类独立存储走这里，
 * 不必各自重复实现 try/catch（需求 21「统一 Storage API」）。
 */
export function readStored<T>(key: string, fallback: T, validate?: (value: unknown) => boolean): T {
  return readJson(key, fallback, validate)
}

/** 写入任意 key 下的数据（自动套上当前 schema 版本的信封） */
export function writeStored(key: string, value: unknown): void {
  writeJson(key, value)
}

/** 删除某个 key */
export function removeStored(key: string): void {
  removeJson(key)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 存储层自检 + 迁移。应用启动时调用一次。
 *
 * 这里不做破坏性操作：只是确认各项数据能被解析、并写下当前 schema 版本。
 * 真正的「旧格式 -> 新格式」升级发生在各自的 load 函数里（读到裸数据就接受，
 * 下次 write 时自动套上信封），因此升级过程对用户完全透明。
 */
export function migrateStorage(): { version: number; issues: string[] } {
  const issues: string[] = []
  const checks: [string, (value: unknown) => boolean][] = [
    [PROGRESS_KEY, (value) => isObject(value) && typeof value.puzzleId === 'string'],
    [RECORDS_KEY, isObject],
    [HISTORY_KEY, Array.isArray],
    [DAILY_KEY, isObject],
    [ACHIEVEMENTS_KEY, isObject],
    [SOLVER_HISTORY_KEY, Array.isArray],
    [TUTORIAL_KEY, (value) => isObject(value) && typeof (value as { step?: unknown }).step === 'number'],
  ]
  for (const [key, validate] of checks) {
    const raw = rawGet(key)
    if (raw === null) continue
    try {
      const parsed: unknown = JSON.parse(raw)
      const payload = isEnvelope(parsed) ? parsed.data : parsed
      if (!validate(payload)) {
        issues.push(key)
        rawRemove(key)
      }
    } catch {
      issues.push(key)
      rawRemove(key)
    }
  }

  writeJson(SCHEMA_KEY, { version: STORAGE_SCHEMA_VERSION, updatedAt: Date.now() })
  return { version: STORAGE_SCHEMA_VERSION, issues }
}

// ---------------------------------------------------------------------------
// 对局进度
// ---------------------------------------------------------------------------

export interface StoredProgress {
  puzzleId: string
  difficulty: Difficulty
  width: number
  height: number
  seed: string
  title?: string
  /** 谜题来源（每日挑战 / 编辑器 / 自动解题），恢复时要还原 */
  source?: PuzzleSource
  /** 玩家棋盘（每格 1 字节） */
  board: string
  /** 谜题答案（自定义/分享谜题刷新后需要它重建线索） */
  solution: string
  elapsedMs: number
  mistakes: number
  hintsUsed: number
  penaltyMs: number
  pauseCount: number
  judgeMode: JudgeMode
  completed: boolean
  updatedAt: number
}

export function saveProgress(progress: StoredProgress): void {
  writeJson(PROGRESS_KEY, progress)
}

export function loadProgress(): StoredProgress | null {
  return readJson<StoredProgress | null>(
    PROGRESS_KEY,
    null,
    (value) =>
      isObject(value) &&
      typeof value.puzzleId === 'string' &&
      typeof value.width === 'number' &&
      typeof value.height === 'number',
  )
}

export function clearProgress(): void {
  removeJson(PROGRESS_KEY)
}

// ---------------------------------------------------------------------------
// 最佳成绩（区分「不限提示」与「无提示」）
// ---------------------------------------------------------------------------

export interface BestRecord {
  timeMs: number
  mistakes: number
  hintsUsed: number
  /** 本局是否曾经暂停过（暂停过就不算「无提示纯净成绩」） */
  paused: boolean
  judgeMode: JudgeMode
  at: number
}

/**
 * 一个谜题的两条最佳成绩。
 * 需求 29：使用大量提示的成绩不能和「零提示通关」混为一谈，所以要分开记。
 */
export interface PuzzleRecords {
  /** 不限条件的最佳成绩 */
  best: BestRecord | null
  /** 零提示且全程未暂停的最佳成绩 */
  bestNoHints: BestRecord | null
  /** 各判定模式各自的最佳成绩（成绩可比性更强） */
  byJudge: Partial<Record<JudgeMode, BestRecord>>
}

export type RecordMap = Record<string, PuzzleRecords>

export function recordKey(difficulty: Difficulty, seed: string): string {
  return `${difficulty}:${seed}`
}

function emptyRecords(): PuzzleRecords {
  return { best: null, bestNoHints: null, byJudge: {} }
}

function isBestRecord(value: unknown): value is BestRecord {
  return isObject(value) && typeof value.timeMs === 'number'
}

/** 1.1.0 之前的 records 是 `{ key: BestRecord }`，这里就地升级成 PuzzleRecords */
function normalizeRecordMap(value: unknown): RecordMap {
  if (!isObject(value)) return {}
  const next: RecordMap = {}
  for (const [key, raw] of Object.entries(value)) {
    if (isBestRecord(raw)) {
      // 旧格式：一条记录同时充当 best；没有暂停信息，保守当作「暂停过」
      next[key] = { best: { ...raw, paused: true, judgeMode: 'lenient' }, bestNoHints: null, byJudge: {} }
      continue
    }
    if (isObject(raw)) {
      const best = isBestRecord(raw.best) ? raw.best : null
      const bestNoHints = isBestRecord(raw.bestNoHints) ? raw.bestNoHints : null
      const byJudge: Partial<Record<JudgeMode, BestRecord>> = {}
      if (isObject(raw.byJudge)) {
        for (const mode of ['lenient', 'strict', 'extreme'] as const) {
          const entry = raw.byJudge[mode]
          if (isBestRecord(entry)) byJudge[mode] = entry
        }
      }
      next[key] = { best, bestNoHints, byJudge }
    }
  }
  return next
}

export function loadRecords(): RecordMap {
  return normalizeRecordMap(readJson<unknown>(RECORDS_KEY, {}))
}

export function saveRecords(records: RecordMap): void {
  writeJson(RECORDS_KEY, records)
}

export function getBest(difficulty: Difficulty, seed: string): PuzzleRecords | null {
  return loadRecords()[recordKey(difficulty, seed)] ?? null
}

export interface SubmitOutcome {
  /** 刷新了「不限条件」的最佳成绩 */
  isBest: boolean
  /** 刷新了「零提示」的最佳成绩 */
  isBestNoHints: boolean
}

function isBetter(candidate: BestRecord, previous: BestRecord | null | undefined): boolean {
  if (!previous) return true
  if (candidate.timeMs !== previous.timeMs) return candidate.timeMs < previous.timeMs
  return candidate.mistakes < previous.mistakes
}

/** 写入成绩，返回是否刷新了记录（用于「新纪录」提示） */
export function submitRecord(difficulty: Difficulty, seed: string, record: BestRecord): SubmitOutcome {
  const records = loadRecords()
  const key = recordKey(difficulty, seed)
  const entry = records[key] ?? emptyRecords()

  const isBest = isBetter(record, entry.best)
  if (isBest) entry.best = record

  // 「零提示」成绩：没用过提示、没暂停过
  const qualifiesNoHints = record.hintsUsed === 0 && !record.paused
  const isBestNoHints = qualifiesNoHints && isBetter(record, entry.bestNoHints)
  if (isBestNoHints) entry.bestNoHints = record

  const previousSameMode = entry.byJudge[record.judgeMode]
  if (isBetter(record, previousSameMode)) entry.byJudge[record.judgeMode] = record

  records[key] = entry
  saveRecords(records)
  return { isBest, isBestNoHints }
}

// ---------------------------------------------------------------------------
// 历史成绩
// ---------------------------------------------------------------------------

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
  paused: boolean
  judgeMode: JudgeMode
  /** 是否每日挑战（统计页与成就都要用） */
  daily?: boolean
  completedAt: number
}

export function loadHistory(): HistoryEntry[] {
  const list = readJson<unknown>(HISTORY_KEY, [], Array.isArray)
  if (!Array.isArray(list)) return []
  return list.filter(
    (entry): entry is HistoryEntry =>
      isObject(entry) && typeof entry.puzzleId === 'string' && typeof entry.timeMs === 'number',
  )
}

export function pushHistory(entry: HistoryEntry, limit = HISTORY_LIMIT): HistoryEntry[] {
  const list = loadHistory().filter((e) => e.puzzleId !== entry.puzzleId || e.completedAt !== entry.completedAt)
  list.unshift(entry)
  const trimmed = list.slice(0, limit)
  writeJson(HISTORY_KEY, trimmed)
  return trimmed
}

export function clearHistory(): void {
  writeJson(HISTORY_KEY, [])
}

// ---------------------------------------------------------------------------
// 每日挑战记录
// ---------------------------------------------------------------------------

export interface DailyRecord {
  /** UTC 日期键 YYYY-MM-DD */
  date: string
  seed: string
  difficulty: Difficulty
  width: number
  height: number
  timeMs: number
  mistakes: number
  hintsUsed: number
  paused: boolean
  completedAt: number
}

export type DailyMap = Record<string, DailyRecord>

export function loadDailyRecords(): DailyMap {
  const value = readJson<unknown>(DAILY_KEY, {})
  if (!isObject(value)) return {}
  const next: DailyMap = {}
  for (const [key, raw] of Object.entries(value)) {
    if (isObject(raw) && typeof raw.timeMs === 'number' && typeof raw.date === 'string') {
      next[key] = raw as unknown as DailyRecord
    }
  }
  return next
}

export function saveDailyRecord(record: DailyRecord): DailyMap {
  const all = loadDailyRecords()
  const previous = all[record.date]
  // 同一天多次挑战只保留更快的一次
  if (!previous || record.timeMs < previous.timeMs) all[record.date] = record
  writeJson(DAILY_KEY, all)
  return all
}

export function clearDailyRecords(): void {
  writeJson(DAILY_KEY, {})
}

// ---------------------------------------------------------------------------
// 成就
// ---------------------------------------------------------------------------

export type AchievementMap = Record<string, number>

export function loadAchievements(): AchievementMap {
  const value = readJson<unknown>(ACHIEVEMENTS_KEY, {})
  if (!isObject(value)) return {}
  const next: AchievementMap = {}
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'number') next[key] = raw
  }
  return next
}

/** 记录解锁时间；返回本次**新解锁**的成就 id 列表（用于弹窗提示） */
export function unlockAchievements(ids: readonly string[]): string[] {
  const all = loadAchievements()
  const fresh: string[] = []
  const now = Date.now()
  for (const id of ids) {
    if (all[id] === undefined) {
      all[id] = now
      fresh.push(id)
    }
  }
  if (fresh.length > 0) writeJson(ACHIEVEMENTS_KEY, all)
  return fresh
}

// ---------------------------------------------------------------------------
// 棋盘编解码
// ---------------------------------------------------------------------------

/**
 * 棋盘有 3 种状态（空 / 填充 / X 标记），不能按位压缩，因此用 '0'|'1'|'2' 字符串存储：
 * 可读、无歧义、体积可接受（50×50 也才 2500 个字符）。
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

// ---------------------------------------------------------------------------
// 新手教程进度
// ---------------------------------------------------------------------------

/**
 * 教程进度。
 * `step` 的口径：0 = 欢迎页，1..7 = 教学阶段（与 core/tutorial.ts 的阶段号一致）。
 */
export interface TutorialProgress {
  step: number
  completed: boolean
  updatedAt: number
}

export function loadTutorialProgress(): TutorialProgress | null {
  return readJson<TutorialProgress | null>(
    TUTORIAL_KEY,
    null,
    (value) => isObject(value) && typeof value.step === 'number' && typeof value.completed === 'boolean',
  )
}

export function saveTutorialProgress(progress: { step: number; completed: boolean }): void {
  writeJson(TUTORIAL_KEY, { ...progress, updatedAt: Date.now() })
}

/** 清空全部本地数据（设置页的「清除所有数据」用） */
export function clearAllData(): void {
  for (const key of [
    SCHEMA_KEY,
    PROGRESS_KEY,
    RECORDS_KEY,
    HISTORY_KEY,
    DAILY_KEY,
    ACHIEVEMENTS_KEY,
    SOLVER_HISTORY_KEY,
    TUTORIAL_KEY,
  ]) {
    removeJson(key)
  }
}
