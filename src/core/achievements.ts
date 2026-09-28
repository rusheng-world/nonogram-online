/**
 * 成就系统（需求 8）
 * ============================================================================
 * 设计原则：
 *   · **纯函数 + 累计数据**：成就只从「历史成绩 + 每日挑战记录」推导，
 *     所以任何时刻重新算一遍都能得到同样的结论，不需要在游戏流程里到处埋点。
 *   · **只增不减**：一旦达成过就永久解锁（解锁状态存在 localStorage），
 *     不会因为后来清空历史而丢失 —— 这对玩家更友好，也避免「成就闪烁」。
 *   · **带进度**：每个成就都返回 current / target，成就页面可以直接画进度条。
 */

import { computeStreaks, type Streaks } from './dailyChallenge'
import type { DailyMap, HistoryEntry } from './storage'
import { DIFFICULTIES, type Difficulty } from './types'

export interface AchievementProgress {
  done: boolean
  current: number
  target: number
}

export interface AchievementContext {
  history: readonly HistoryEntry[]
  daily: DailyMap
  /** 连续完成天数（外部算好可复用，避免重复计算） */
  streak?: Streaks
}

export interface AchievementDef {
  id: string
  name: string
  description: string
  /** 展示用 emoji（不引入图标依赖） */
  icon: string
  progress: (ctx: Required<AchievementContext>) => AchievementProgress
}

/** 四项都完成过 —— 「全难度制霸」 */
function solvedDifficulties(history: readonly HistoryEntry[]): Set<Difficulty> {
  const set = new Set<Difficulty>()
  for (const entry of history) set.add(entry.difficulty)
  return set
}

function count(history: readonly HistoryEntry[], predicate: (entry: HistoryEntry) => boolean): number {
  let n = 0
  for (const entry of history) if (predicate(entry)) n++
  return n
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: 'first-solve',
    name: 'First Solve',
    description: '完成第一道谜题',
    icon: '🎯',
    progress: ({ history }) => ({ done: history.length >= 1, current: Math.min(history.length, 1), target: 1 }),
  },
  {
    id: 'daily-first',
    name: 'Daily Opener',
    description: '完成第一次每日挑战',
    icon: '📅',
    progress: ({ daily }) => {
      const done = Object.keys(daily).length
      return { done: done >= 1, current: Math.min(done, 1), target: 1 }
    },
  },
  {
    id: 'streak-7',
    name: '7 Day Streak',
    description: '连续 7 天完成每日挑战',
    icon: '🔥',
    progress: ({ streak }) => ({
      done: streak.longest >= 7,
      current: Math.min(streak.longest, 7),
      target: 7,
    }),
  },
  {
    id: 'streak-30',
    name: 'Monthly Habit',
    description: '连续 30 天完成每日挑战',
    icon: '🗓️',
    progress: ({ streak }) => ({
      done: streak.longest >= 30,
      current: Math.min(streak.longest, 30),
      target: 30,
    }),
  },
  {
    id: 'speed-10',
    name: 'Speed Runner',
    description: '10×10 在 2 分钟内完成',
    icon: '⚡',
    progress: ({ history }) => {
      const hits = count(history, (e) => e.width === 10 && e.height === 10 && e.timeMs > 0 && e.timeMs <= 120_000)
      return { done: hits >= 1, current: Math.min(hits, 1), target: 1 }
    },
  },
  {
    id: 'perfect',
    name: 'Perfect Solve',
    description: '不犯任何错误完成一道谜题',
    icon: '🧠',
    progress: ({ history }) => {
      const hits = count(history, (e) => e.mistakes === 0)
      return { done: hits >= 1, current: Math.min(hits, 1), target: 1 }
    },
  },
  {
    id: 'no-hints',
    name: 'Unaided',
    description: '零提示、不暂停完成一道谜题',
    icon: '🛡️',
    progress: ({ history }) => {
      const hits = count(history, (e) => e.hintsUsed === 0 && !e.paused)
      return { done: hits >= 1, current: Math.min(hits, 1), target: 1 }
    },
  },
  {
    id: 'expert-20',
    name: 'Expert',
    description: '完成一道 20×20 专家题',
    icon: '🧩',
    progress: ({ history }) => {
      const hits = count(history, (e) => e.difficulty === 'expert')
      return { done: hits >= 1, current: Math.min(hits, 1), target: 1 }
    },
  },
  {
    id: 'all-difficulties',
    name: 'All Rounder',
    description: '四种难度各完成过至少一题',
    icon: '🏅',
    progress: ({ history }) => {
      const solved = solvedDifficulties(history)
      return { done: solved.size >= DIFFICULTIES.length, current: solved.size, target: DIFFICULTIES.length }
    },
  },
  {
    id: 'master-100',
    name: 'Master',
    description: '累计完成 100 道谜题',
    icon: '💯',
    progress: ({ history }) => ({
      done: history.length >= 100,
      current: Math.min(history.length, 100),
      target: 100,
    }),
  },
]

/** 补齐默认值，方便调用方只传部分上下文 */
function normalize(ctx: AchievementContext): Required<AchievementContext> {
  return {
    history: ctx.history,
    daily: ctx.daily,
    streak: ctx.streak ?? computeStreaks(ctx.daily),
  }
}

export function achievementContext(history: readonly HistoryEntry[], daily: DailyMap): Required<AchievementContext> {
  return normalize({ history, daily })
}

/** 当前「满足条件」的全部成就 id（包含已解锁的） */
export function evaluateAchievements(ctx: AchievementContext): string[] {
  const full = normalize(ctx)
  const ids: string[] = []
  for (const def of ACHIEVEMENTS) {
    if (def.progress(full).done) ids.push(def.id)
  }
  return ids
}

export function achievementById(id: string): AchievementDef | null {
  return ACHIEVEMENTS.find((def) => def.id === id) ?? null
}
