/**
 * 每日挑战
 * ============================================================================
 * 规则（需求 6）：
 *   · 每天固定一道题，所有人当天拿到的是同一道（同一个 seed => 同一道题）；
 *   · 纯前端、无后端、无登录：日期 -> seed 是确定性映射，刷新不会换题；
 *   · 记录完成时间 / 是否用提示 / 错误次数 / 是否完成。
 *
 * **时区策略**：统一使用 **UTC 日期**（YYYY-MM-DD）。
 *   理由：本地日期会让「同一天」在不同时区漂移 —— 东八区玩家 08:00 换题、西五区玩家
 *   20:00 才换题，而「所有人当天拿到同一道题」是这个功能的核心卖点。
 *   用 UTC 就意味着北京时间早上 8 点换题；界面上会直接写明「以 UTC 日期为准」，
 *   并提供距离下一题的倒计时，避免玩家困惑。
 */

import { boardSizeFor, generatePuzzle, type GenerateResult } from './generator'
import { DEFAULT_DAILY_ROTATION, type Difficulty } from './types'
import type { DailyMap, DailyRecord } from './storage'

/** 每日挑战的难度轮换表（索引 = UTC 星期几，0 = 周日） */
export const DAILY_ROTATION: readonly Difficulty[] = DEFAULT_DAILY_ROTATION

/** UTC 日期键：YYYY-MM-DD */
export function utcDateKey(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** 每日挑战的种子：只由 UTC 日期决定，因此可复现、可分享 */
export function dailySeed(dateKey: string): string {
  return `daily-${dateKey}`
}

/** 当天的难度：按 UTC 星期几轮换，保证一周内不会连续 7 天同一档 */
export function dailyDifficulty(date: Date = new Date()): Difficulty {
  return DAILY_ROTATION[date.getUTCDay()] ?? 'medium'
}

export interface DailyChallengeInfo {
  /** UTC 日期 YYYY-MM-DD */
  date: string
  seed: string
  difficulty: Difficulty
  width: number
  height: number
  title: string
}

export function getDailyChallenge(date: Date = new Date()): DailyChallengeInfo {
  const key = utcDateKey(date)
  const difficulty = dailyDifficulty(date)
  const { width, height } = boardSizeFor(difficulty)
  return { date: key, seed: dailySeed(key), difficulty, width, height, title: `每日挑战 ${key}` }
}

/** 生成当天的谜题（用与普通对局完全相同的生成参数，保证可复现） */
export function createDailyPuzzle(date: Date = new Date()): GenerateResult {
  const info = getDailyChallenge(date)
  return generatePuzzle({
    width: info.width,
    height: info.height,
    difficulty: info.difficulty,
    seed: info.seed,
    allowDowngrade: true,
    allowResize: false,
  })
}

/** 距离下一个 UTC 零点还有多少毫秒（用于「下一题倒计时」） */
export function msUntilNextDaily(date: Date = new Date()): number {
  const next = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1, 0, 0, 0, 0)
  return Math.max(0, next - date.getTime())
}

export interface Streaks {
  /** 以「今天或昨天」为终点的连续完成天数（今天还没做不会立刻断掉） */
  current: number
  longest: number
}

/** 日期键加减天数（用 UTC 计算，避免夏令时带来的 23/25 小时误差） */
function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const base = Date.UTC(y, (m ?? 1) - 1, d ?? 1)
  return utcDateKey(new Date(base + days * 86_400_000))
}

/**
 * 连续完成天数。
 * 当前连击允许「今天还没做」（此时从昨天往前数），这样白天打开网站不会显示 0。
 */
export function computeStreaks(daily: DailyMap, today: Date = new Date()): Streaks {
  const done = new Set(Object.keys(daily).filter((key) => daily[key] !== undefined))
  if (done.size === 0) return { current: 0, longest: 0 }

  const todayKey = utcDateKey(today)
  let cursor = done.has(todayKey) ? todayKey : shiftDateKey(todayKey, -1)
  let current = 0
  while (done.has(cursor)) {
    current++
    cursor = shiftDateKey(cursor, -1)
  }

  const sorted = [...done].sort()
  let longest = 0
  let run = 0
  let previous: string | null = null
  for (const key of sorted) {
    run = previous !== null && shiftDateKey(previous, 1) === key ? run + 1 : 1
    longest = Math.max(longest, run)
    previous = key
  }
  return { current, longest }
}

/** 最近 N 天的每日挑战记录（从新到旧） */
export function recentDailyRecords(daily: DailyMap, limit = 7): { date: string; record: DailyRecord | null }[] {
  const today = new Date()
  const list: { date: string; record: DailyRecord | null }[] = []
  for (let i = 0; i < limit; i++) {
    const key = shiftDateKey(utcDateKey(today), -i)
    list.push({ date: key, record: daily[key] ?? null })
  }
  return list
}
