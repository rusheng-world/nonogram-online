/**
 * 每日挑战 / 统计 / 成就（需求 6、7、8）的纯逻辑测试。
 *
 * 这几块最容易出的问题是「时间口径」和「公平性口径」：
 *   · 每日挑战必须按 UTC 日期换题，否则不同时区的玩家当天拿到的题不一样；
 *   · 连续天数要能容忍「今天还没做」，也要正确断掉；
 *   · 平均用时不能把没计时的对局算进去；
 *   · 成就的进度必须是「幂等」的，重算不会把已完成变成未完成。
 */
import { describe, expect, it } from 'vitest'
import {
  computeStreaks,
  createDailyPuzzle,
  DAILY_ROTATION,
  dailyDifficulty,
  dailySeed,
  getDailyChallenge,
  msUntilNextDaily,
  recentDailyRecords,
  utcDateKey,
} from '../src/core/dailyChallenge'
import { ACHIEVEMENTS, achievementById, achievementContext, evaluateAchievements } from '../src/core/achievements'
import { computeStatistics } from '../src/core/statistics'
import { computeClues } from '../src/core/clues'
import { analyzePuzzle } from '../src/core/difficulty'
import { boardSizeFor } from '../src/core/generator'
import { DIFFICULTIES } from '../src/core/types'
import type { DailyMap, DailyRecord, HistoryEntry } from '../src/core/storage'

function dailyRecord(date: string, overrides: Partial<DailyRecord> = {}): DailyRecord {
  return {
    date,
    seed: `daily-${date}`,
    difficulty: 'easy',
    width: 5,
    height: 5,
    timeMs: 1000,
    mistakes: 0,
    hintsUsed: 0,
    paused: false,
    completedAt: 0,
    ...overrides,
  }
}

function dailyMapOf(...dates: string[]): DailyMap {
  const map: DailyMap = {}
  for (const date of dates) map[date] = dailyRecord(date)
  return map
}

function historyOf(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    puzzleId: 'easy-5x5-abc',
    difficulty: 'easy',
    width: 5,
    height: 5,
    seed: 'abc',
    timeMs: 60_000,
    mistakes: 0,
    hintsUsed: 0,
    paused: false,
    judgeMode: 'lenient',
    completedAt: 0,
    ...overrides,
  }
}

describe('每日挑战：UTC 日期口径', () => {
  it('日期键按 UTC 计算，不受本地时区影响', () => {
    expect(utcDateKey(new Date('2026-09-28T00:00:00Z'))).toBe('2026-09-28')
    expect(utcDateKey(new Date('2026-09-28T23:59:59Z'))).toBe('2026-09-28')
    // 东八区的 09-28 00:30 其实是 UTC 的 09-27 16:30 —— 统一按 UTC，避免时区漂移
    expect(utcDateKey(new Date('2026-09-28T00:30:00+08:00'))).toBe('2026-09-27')
  })

  it('seed / 难度 / 尺寸都由日期唯一决定，同一天对所有人生效', () => {
    expect(dailySeed('2026-09-28')).toBe('daily-2026-09-28')
    const early = getDailyChallenge(new Date('2026-09-28T00:00:01Z'))
    const late = getDailyChallenge(new Date('2026-09-28T23:59:59Z'))
    expect(early).toEqual(late)
    expect(early.date).toBe('2026-09-28')
    expect(early.seed).toBe('daily-2026-09-28')
    expect(early.difficulty).toBe(dailyDifficulty(new Date('2026-09-28T12:00:00Z')))
    expect(DAILY_ROTATION[new Date('2026-09-28T12:00:00Z').getUTCDay()]).toBe(early.difficulty)
    expect(early.width).toBe(boardSizeFor(early.difficulty).width)
    expect(early.height).toBe(boardSizeFor(early.difficulty).height)
  })

  it('换题倒计时在 UTC 零点归零', () => {
    expect(msUntilNextDaily(new Date('2026-09-28T00:00:00Z'))).toBe(86_400_000)
    expect(msUntilNextDaily(new Date('2026-09-28T12:00:00Z'))).toBe(43_200_000)
    expect(msUntilNextDaily(new Date('2026-09-28T23:59:59.500Z'))).toBe(500)
  })

  it('生成出来的每日谜题可复现、线索自洽、且不是多解', () => {
    const morning = createDailyPuzzle(new Date('2026-09-28T01:00:00Z'))
    const night = createDailyPuzzle(new Date('2026-09-28T22:00:00Z'))
    expect(morning.puzzle.id).toBe(night.puzzle.id)
    expect(Array.from(morning.puzzle.solution)).toEqual(Array.from(night.puzzle.solution))
    expect(morning.puzzle.seed).toBe('daily-2026-09-28')
    expect(morning.puzzle.source).toBe('daily')
    expect(morning.puzzle.difficulty).toBe(getDailyChallenge(new Date('2026-09-28T01:00:00Z')).difficulty)

    const clues = computeClues(morning.puzzle.solution, morning.puzzle.width, morning.puzzle.height)
    expect(morning.puzzle.rowClues).toEqual(clues.rowClues)
    expect(morning.puzzle.colClues).toEqual(clues.colClues)
    // 多解的题不适合做每日挑战（无法判定正误）
    expect(analyzePuzzle(morning.puzzle).unique).not.toBe(false)
  })
})

describe('每日挑战：连续天数', () => {
  const today = new Date('2026-09-28T10:00:00Z')

  it('空数据是 0', () => {
    expect(computeStreaks({}, today)).toEqual({ current: 0, longest: 0 })
  })

  it('今天 + 昨天 + 前天 = 连续 3 天', () => {
    expect(computeStreaks(dailyMapOf('2026-09-28', '2026-09-27', '2026-09-26'), today)).toEqual({
      current: 3,
      longest: 3,
    })
  })

  it('今天还没做时从昨天往前数，白天打开网站不会显示 0', () => {
    expect(computeStreaks(dailyMapOf('2026-09-27', '2026-09-26'), today)).toEqual({ current: 2, longest: 2 })
  })

  it('昨天也没做就断掉，但仍保留历史最长纪录', () => {
    expect(computeStreaks(dailyMapOf('2026-09-26', '2026-09-25'), today)).toEqual({ current: 0, longest: 2 })
  })

  it('跨月与跨年也能正确连续', () => {
    expect(computeStreaks(dailyMapOf('2026-12-31', '2027-01-01'), new Date('2027-01-01T05:00:00Z'))).toEqual({
      current: 2,
      longest: 2,
    })
    expect(computeStreaks(dailyMapOf('2026-02-28', '2026-03-01'), new Date('2026-03-01T05:00:00Z'))).toEqual({
      current: 2,
      longest: 2,
    })
  })
})

describe('每日挑战：最近记录', () => {
  it('按自然日倒序返回，未完成的那天是 null', () => {
    const todayKey = utcDateKey(new Date())
    const list = recentDailyRecords({ [todayKey]: dailyRecord(todayKey) }, 3)
    expect(list).toHaveLength(3)
    expect(list[0].date).toBe(todayKey)
    expect(list[0].record?.timeMs).toBe(1000)
    expect(list[1].record).toBeNull()
    expect(list[2].record).toBeNull()
    // 日期严格递减且相邻相差一天
    const diff = new Date(`${list[1].date}T00:00:00Z`).getTime() - new Date(`${list[2].date}T00:00:00Z`).getTime()
    expect(diff).toBe(86_400_000)
  })
})

describe('统计', () => {
  const history: HistoryEntry[] = [
    historyOf({ puzzleId: 'e1', timeMs: 60_000, mistakes: 0, hintsUsed: 0, paused: false }),
    historyOf({
      puzzleId: 'm1',
      difficulty: 'medium',
      width: 10,
      height: 10,
      timeMs: 150_000,
      mistakes: 2,
      hintsUsed: 1,
    }),
    historyOf({ puzzleId: 'e2', timeMs: 30_000, mistakes: 0, hintsUsed: 0, paused: true }),
    historyOf({ puzzleId: 'h1', difficulty: 'hard', width: 15, height: 15, timeMs: 300_000, mistakes: 1, daily: true }),
    // 没有计时（timeMs = 0）的一局：不应该拉低平均用时
    historyOf({ puzzleId: 'x1', difficulty: 'expert', width: 20, height: 20, timeMs: 0 }),
  ]
  const daily = dailyMapOf('2026-09-28', '2026-09-27')

  it('总计 / 平均 / 最快', () => {
    const stats = computeStatistics(history, daily)
    expect(stats.totalSolved).toBe(5)
    expect(stats.dailySolved).toBe(2)
    expect(stats.averageMs).toBe(Math.round((60_000 + 150_000 + 30_000 + 300_000) / 4))
    expect(stats.fastestMs).toBe(30_000)
  })

  it('各难度分别统计完成数与最快时间', () => {
    const { byDifficulty } = computeStatistics(history, daily)
    expect(byDifficulty.easy).toEqual({ solved: 2, fastestMs: 30_000 })
    expect(byDifficulty.medium).toEqual({ solved: 1, fastestMs: 150_000 })
    expect(byDifficulty.hard).toEqual({ solved: 1, fastestMs: 300_000 })
    expect(byDifficulty.expert).toEqual({ solved: 1, fastestMs: null })
  })

  it('提示与错误累计、零提示通关只认「没用提示也没暂停」', () => {
    const stats = computeStatistics(history, daily)
    expect(stats.hintsUsed).toBe(1)
    expect(stats.mistakes).toBe(3)
    // e1、h1、x1 符合；e2 暂停过；m1 用过提示
    expect(stats.noHintSolves).toBe(3)
  })

  it('没有历史成绩时所有指标为空而不是 NaN', () => {
    const stats = computeStatistics([], {})
    expect(stats.totalSolved).toBe(0)
    expect(stats.averageMs).toBeNull()
    expect(stats.fastestMs).toBeNull()
    expect(stats.streak).toEqual({ current: 0, longest: 0 })
    expect(stats.recent).toEqual([])
    expect(stats.recentDaily).toHaveLength(14)
  })
})

describe('成就', () => {
  it('成就定义完整且 id 唯一', () => {
    const ids = ACHIEVEMENTS.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBeGreaterThanOrEqual(10)
    for (const def of ACHIEVEMENTS) {
      expect(def.name.length).toBeGreaterThan(0)
      expect(def.description.length).toBeGreaterThan(0)
      expect(def.icon.length).toBeGreaterThan(0)
    }
    expect(achievementById('first-solve')?.name).toBe('First Solve')
    expect(achievementById('not-a-real-id')).toBeNull()
  })

  it('空进度下没有任何成就是「已完成」，且进度不会超过目标', () => {
    const ctx = achievementContext([], {})
    expect(evaluateAchievements(ctx)).toEqual([])
    for (const def of ACHIEVEMENTS) {
      const progress = def.progress(ctx)
      expect(progress.done).toBe(false)
      expect(progress.current).toBeLessThanOrEqual(progress.target)
    }
  })

  it('第一局就能拿到 First Solve / Perfect Solve / Unslaved', () => {
    const ids = evaluateAchievements(achievementContext([historyOf({ puzzleId: 'e1' })], {}))
    expect(ids).toContain('first-solve')
    expect(ids).toContain('perfect')
    expect(ids).toContain('no-hints')
    expect(ids).not.toContain('daily-first')
    expect(ids).not.toContain('master-100')
  })

  it('Speed Runner 只认 10×10 且 2 分钟内', () => {
    const fast = achievementContext([historyOf({ width: 10, height: 10, timeMs: 119_999 })], {})
    expect(evaluateAchievements(fast)).toContain('speed-10')
    const slow = achievementContext([historyOf({ width: 10, height: 10, timeMs: 120_001 })], {})
    expect(evaluateAchievements(slow)).not.toContain('speed-10')
    const big = achievementContext([historyOf({ width: 15, height: 15, timeMs: 1000 })], {})
    expect(evaluateAchievements(big)).not.toContain('speed-10')
  })

  it('四种难度各完成一题才算 All Rounder', () => {
    const three = DIFFICULTIES.slice(0, 3).map((difficulty) => historyOf({ puzzleId: difficulty, difficulty }))
    expect(evaluateAchievements(achievementContext(three, {}))).not.toContain('all-difficulties')
    const four = DIFFICULTIES.map((difficulty) => historyOf({ puzzleId: difficulty, difficulty }))
    expect(evaluateAchievements(achievementContext(four, {}))).toContain('all-difficulties')
  })

  it('Expert 成就认专家难度，Master 需要累计 100 局', () => {
    expect(evaluateAchievements(achievementContext([historyOf({ difficulty: 'expert' })], {}))).toContain('expert-20')
    const hundred = Array.from({ length: 100 }, (_, i) => historyOf({ puzzleId: `p${i}` }))
    expect(evaluateAchievements(achievementContext(hundred, {}))).toContain('master-100')
    const ninetyNine = hundred.slice(0, 99)
    expect(evaluateAchievements(achievementContext(ninetyNine, {}))).not.toContain('master-100')
  })

  it('连续天数成就按历史最长连击判定', () => {
    const seven = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(Date.UTC(2026, 0, i + 1))
      return utcDateKey(date)
    })
    const week = achievementContext([], dailyMapOf(...seven))
    expect(evaluateAchievements(week)).toContain('streak-7')
    expect(evaluateAchievements(week)).not.toContain('streak-30')

    const thirty = Array.from({ length: 30 }, (_, i) => utcDateKey(new Date(Date.UTC(2026, 0, i + 1))))
    expect(evaluateAchievements(achievementContext([], dailyMapOf(...thirty)))).toContain('streak-30')
  })

  it('重复评估结果是稳定的（幂等）', () => {
    const ctx = achievementContext([historyOf()], dailyMapOf('2026-09-28'))
    expect(evaluateAchievements(ctx)).toEqual(evaluateAchievements(ctx))
  })
})
