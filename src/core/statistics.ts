/**
 * 统计（需求 7）
 * ============================================================================
 * 全部由本地数据现算，不额外存一份「统计快照」——
 * 这样无论存档怎么迁移，统计永远不会和明细对不上（不需要维护两份真相）。
 *
 * 数据来源：
 *   · 历史成绩（loadHistory，最多 200 条）
 *   · 每日挑战记录（loadDailyRecords）
 */

import { computeStreaks, recentDailyRecords, type Streaks } from './dailyChallenge'
import { loadDailyRecords, loadHistory, type DailyRecord, type HistoryEntry } from './storage'
import { DIFFICULTIES, type Difficulty } from './types'

export interface DifficultyBreakdown {
  solved: number
  /** 该档最快的一次（毫秒），没有则为 null */
  fastestMs: number | null
}

export interface Statistics {
  /** 完成题数（历史成绩条数） */
  totalSolved: number
  /** 其中每日挑战完成的天数 */
  dailySolved: number
  /** 连续完成天数 */
  streak: Streaks
  /** 平均完成时间（毫秒），没有记录则为 null */
  averageMs: number | null
  /** 最快完成时间（毫秒） */
  fastestMs: number | null
  /** 各难度完成数量与最快时间 */
  byDifficulty: Record<Difficulty, DifficultyBreakdown>
  /** 累计使用提示次数 */
  hintsUsed: number
  /** 累计错误次数 */
  mistakes: number
  /** 零提示通关次数 */
  noHintSolves: number
  /** 最近 10 局（从新到旧） */
  recent: HistoryEntry[]
  /** 最近 14 个 UTC 自然日的每日挑战记录（从新到旧，未完成的那天 record 为 null） */
  recentDaily: { date: string; record: DailyRecord | null }[]
}

function emptyBreakdown(): DifficultyBreakdown {
  return { solved: 0, fastestMs: null }
}

export function computeStatistics(history: HistoryEntry[] = loadHistory(), daily = loadDailyRecords()): Statistics {
  const byDifficulty = {} as Record<Difficulty, DifficultyBreakdown>
  for (const difficulty of DIFFICULTIES) byDifficulty[difficulty] = emptyBreakdown()

  let totalMs = 0
  /** 只统计真正计过时的对局（timeMs > 0），避免 0 值把平均时间拉低 */
  let timedCount = 0
  let fastestMs: number | null = null
  let hintsUsed = 0
  let mistakes = 0
  let noHintSolves = 0

  for (const entry of history) {
    const bucket = byDifficulty[entry.difficulty] ?? emptyBreakdown()
    byDifficulty[entry.difficulty] = bucket

    bucket.solved += 1
    if (entry.timeMs > 0) {
      totalMs += entry.timeMs
      timedCount += 1
      if (bucket.fastestMs === null || entry.timeMs < bucket.fastestMs) bucket.fastestMs = entry.timeMs
      if (fastestMs === null || entry.timeMs < fastestMs) fastestMs = entry.timeMs
    }
    hintsUsed += entry.hintsUsed ?? 0
    mistakes += entry.mistakes ?? 0
    if ((entry.hintsUsed ?? 0) === 0 && !entry.paused) noHintSolves += 1
  }

  const recentDaily = recentDailyRecords(daily, 14)

  return {
    totalSolved: history.length,
    dailySolved: Object.keys(daily).length,
    streak: computeStreaks(daily),
    averageMs: timedCount > 0 ? Math.round(totalMs / timedCount) : null,
    fastestMs,
    byDifficulty,
    hintsUsed,
    mistakes,
    noHintSolves,
    recent: history.slice(0, 10),
    recentDaily,
  }
}
