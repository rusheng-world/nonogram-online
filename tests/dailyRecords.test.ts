/**
 * 每日挑战记录的严格校验（审查报告 L-04）。
 *
 * 每日记录的 key 直接决定「连续完成天数」与「已完成天数」两项统计，
 * 而这些数据全部来自可手改的 localStorage。所以：
 *   · key 必须是合法的 UTC 日期键（YYYY-MM-DD，且日期真实存在）；
 *   · 记录内的 date 必须与 key 一致；
 *   · 非法 / 空 / 恶意构造（`__proto__` 等）的条目一律丢弃，绝不影响其它正常记录。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { computeStreaks } from '../src/core/dailyChallenge'
import { loadDailyRecords, saveDailyRecord, writeStored, type DailyRecord } from '../src/core/storage'

const DAILY_KEY = 'nonogram-daily-v1'

function createFakeStorage() {
  const map = new Map<string, string>()
  return {
    map,
    get length(): number {
      return map.size
    },
    key: (index: number): string | null => Array.from(map.keys())[index] ?? null,
    getItem: (key: string): string | null => map.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      map.set(key, String(value))
    },
    removeItem: (key: string): void => {
      map.delete(key)
    },
    clear: (): void => map.clear(),
  }
}

const fake = createFakeStorage()
Object.defineProperty(globalThis, 'window', {
  value: { localStorage: fake },
  configurable: true,
  writable: true,
})

function record(date: string, overrides: Partial<DailyRecord> = {}): DailyRecord {
  return {
    date,
    seed: `daily-${date}`,
    difficulty: 'easy',
    width: 5,
    height: 5,
    timeMs: 5_000,
    mistakes: 0,
    hintsUsed: 0,
    paused: false,
    completedAt: 0,
    ...overrides,
  }
}

/** 直接往存储里塞一份「手工构造」的每日记录表（模拟手改 / 损坏的存档） */
function writeRawJson(json: string): void {
  fake.setItem(DAILY_KEY, json)
}

beforeEach(() => {
  fake.clear()
})

describe('每日挑战记录：合法条目', () => {
  it('正常日期会被保留，且能参与连续天数统计', () => {
    saveDailyRecord(record('2026-09-26'))
    saveDailyRecord(record('2026-09-27'))
    saveDailyRecord(record('2026-09-28'))

    const daily = loadDailyRecords()
    expect(Object.keys(daily).sort()).toEqual(['2026-09-26', '2026-09-27', '2026-09-28'])
    expect(daily['2026-09-28'].timeMs).toBe(5_000)
    expect(computeStreaks(daily, new Date('2026-09-28T12:00:00Z'))).toEqual({ current: 3, longest: 3 })
  })

  it('同一天重复挑战只保留更快的一次', () => {
    saveDailyRecord(record('2026-09-28', { timeMs: 9_000 }))
    const after = saveDailyRecord(record('2026-09-28', { timeMs: 4_000 }))
    expect(after['2026-09-28'].timeMs).toBe(4_000)
    expect(Object.keys(after)).toEqual(['2026-09-28'])
  })
})

describe('每日挑战记录：非法条目被丢弃', () => {
  it('非法日期（形状不对 / 日期不存在）全部丢弃', () => {
    writeRawJson(
      JSON.stringify({
        v: 2,
        data: {
          '2026-9-8': record('2026-9-8'),
          '2026/09/28': record('2026/09/28'),
          '2026-13-45': record('2026-13-45'),
          '2026-02-30': record('2026-02-30'),
          '0000-00-00': record('0000-00-00'),
          '2026-09-28': record('2026-09-28'),
        },
      }),
    )
    expect(Object.keys(loadDailyRecords())).toEqual(['2026-09-28'])
  })

  it('非法 key（不是日期）全部丢弃', () => {
    writeRawJson(
      JSON.stringify({
        v: 2,
        data: {
          abc: record('abc'),
          '2026-09': record('2026-09'),
          '2026-09-28x': record('2026-09-28x'),
          'x2026-09-28': record('x2026-09-28'),
          '2026-09-28': record('2026-09-28'),
        },
      }),
    )
    expect(Object.keys(loadDailyRecords())).toEqual(['2026-09-28'])
  })

  it('空 key 会被丢弃', () => {
    writeRawJson(JSON.stringify({ v: 2, data: { '': record('') } }))
    expect(loadDailyRecords()).toEqual({})
  })

  it('恶意构造的 key 会被丢弃，且不会污染原型链', () => {
    writeRawJson(
      '{"v":2,"data":{' +
        '"__proto__":{"date":"__proto__","timeMs":1,"polluted":"yes"},' +
        '"constructor":{"date":"constructor","timeMs":1},' +
        '"prototype":{"date":"prototype","timeMs":1},' +
        '"toString":{"date":"toString","timeMs":1}}}',
    )

    const daily = loadDailyRecords()
    expect(Object.keys(daily)).toEqual([])
    expect(Object.getPrototypeOf(daily)).toBe(Object.prototype)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect((daily as Record<string, unknown>).polluted).toBeUndefined()
    expect(computeStreaks(daily, new Date('2026-09-28T12:00:00Z'))).toEqual({ current: 0, longest: 0 })
  })

  it('记录内的 date 与 key 不一致时丢弃（防止伪造其它日期的成绩）', () => {
    writeStored(DAILY_KEY, {
      '2026-09-28': record('2026-01-01'),
      '2026-09-27': record('2026-09-27'),
    })
    expect(Object.keys(loadDailyRecords())).toEqual(['2026-09-27'])
  })

  it('timeMs 不是有限数字时丢弃', () => {
    writeRawJson(
      '{"v":2,"data":{' +
        '"2026-09-28":{"date":"2026-09-28","timeMs":"1"},' +
        '"2026-09-27":{"date":"2026-09-27","timeMs":null},' +
        '"2026-09-26":{"date":"2026-09-26","timeMs":4000}}}',
    )
    expect(Object.keys(loadDailyRecords())).toEqual(['2026-09-26'])
  })

  it('坏条目不会影响好条目，也不会撑破统计', () => {
    writeRawJson(
      JSON.stringify({
        v: 2,
        data: {
          '2026-09-28': record('2026-09-28'),
          '2026-09-27': record('2026-09-27'),
          garbage: record('garbage'),
          '2026-09-26': record('2026-09-26', { timeMs: 3_000 }),
        },
      }),
    )
    const daily = loadDailyRecords()
    expect(Object.keys(daily).sort()).toEqual(['2026-09-26', '2026-09-27', '2026-09-28'])
    expect(computeStreaks(daily, new Date('2026-09-28T12:00:00Z'))).toEqual({ current: 3, longest: 3 })

    // 再次写入时也不会把坏条目带回去
    saveDailyRecord(record('2026-09-25', { timeMs: 1_000 }))
    expect(Object.keys(loadDailyRecords()).sort()).toEqual(['2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28'])
  })
})
