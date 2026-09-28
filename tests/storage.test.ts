/**
 * 本地存储层测试（需求 21）。
 *
 * 在 node 环境下用一个小巧的 localStorage 替身，专门验证那些「平时看不见、
 * 一旦出问题就会让玩家存档报废」的逻辑：
 *   · schema 信封版本
 *   · 1.1.0 之前的裸数据迁移
 *   · JSON 损坏 / 结构不合法的自愈
 *   · 来自未来版本的数据不回读
 *   · 成绩公平性（best / bestNoHints / byJudge 三条记录互不污染）
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  HISTORY_LIMIT,
  SOLVER_HISTORY_KEY,
  STORAGE_SCHEMA_VERSION,
  clearAllData,
  decodeBoard,
  encodeBoard,
  getBest,
  loadAchievements,
  loadDailyRecords,
  loadHistory,
  loadProgress,
  loadRecords,
  migrateStorage,
  pushHistory,
  readStored,
  removeStored,
  saveDailyRecord,
  saveProgress,
  saveRecords,
  storageAvailable,
  submitRecord,
  unlockAchievements,
  writeStored,
  type BestRecord,
  type DailyRecord,
  type HistoryEntry,
  type StoredProgress,
} from '../src/core/storage'

// ---------------------------------------------------------------------------
// 测试替身：一个最小的 localStorage
// ---------------------------------------------------------------------------

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

const PROGRESS_KEY = 'nonogram-progress-v1'
const RECORDS_KEY = 'nonogram-records-v1'
const SCHEMA_KEY = 'nonogram-schema'

function progressFixture(overrides: Partial<StoredProgress> = {}): StoredProgress {
  return {
    puzzleId: 'easy-5x5-abc',
    difficulty: 'easy',
    width: 5,
    height: 5,
    seed: 'abc',
    board: '00110',
    solution: '01100',
    elapsedMs: 0,
    mistakes: 0,
    hintsUsed: 0,
    penaltyMs: 0,
    pauseCount: 0,
    judgeMode: 'lenient',
    completed: false,
    updatedAt: 1,
    ...overrides,
  }
}

function historyFixture(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    puzzleId: 'easy-5x5-abc',
    difficulty: 'easy',
    width: 5,
    height: 5,
    seed: 'abc',
    timeMs: 1000,
    mistakes: 0,
    hintsUsed: 0,
    paused: false,
    judgeMode: 'lenient',
    completedAt: 1,
    ...overrides,
  }
}

function dailyFixture(overrides: Partial<DailyRecord> = {}): DailyRecord {
  return {
    date: '2026-09-28',
    seed: 'daily-2026-09-28',
    difficulty: 'easy',
    width: 5,
    height: 5,
    timeMs: 5000,
    mistakes: 0,
    hintsUsed: 0,
    paused: false,
    completedAt: 0,
    ...overrides,
  }
}

function recordFixture(overrides: Partial<BestRecord> = {}): BestRecord {
  return { timeMs: 5000, mistakes: 0, hintsUsed: 0, paused: false, judgeMode: 'lenient', at: 1, ...overrides }
}

beforeEach(() => {
  fake.clear()
})

describe('存储层：schema 信封与迁移', () => {
  it('本环境下 localStorage 可用（替身生效）', () => {
    expect(storageAvailable()).toBe(true)
  })

  it('写入的数据自动套上 { v, data } 信封', () => {
    saveProgress(progressFixture())
    const parsed = JSON.parse(fake.getItem(PROGRESS_KEY) as string) as { v: number; data: StoredProgress }
    expect(parsed.v).toBe(STORAGE_SCHEMA_VERSION)
    expect(parsed.data.puzzleId).toBe('easy-5x5-abc')
    expect(loadProgress()?.puzzleId).toBe('easy-5x5-abc')
  })

  it('1.1.0 之前的裸数据能读出来，并在下次写入时升级成信封', () => {
    fake.setItem(RECORDS_KEY, JSON.stringify({ 'easy:legacy': { timeMs: 900, mistakes: 2, hintsUsed: 1, at: 1 } }))
    const records = loadRecords()
    expect(records['easy:legacy']?.best?.timeMs).toBe(900)
    // 旧数据没有暂停/判定模式信息：保守当作「暂停过」，避免被误当成纯净成绩
    expect(records['easy:legacy']?.best?.paused).toBe(true)
    expect(records['easy:legacy']?.best?.judgeMode).toBe('lenient')
    expect(records['easy:legacy']?.bestNoHints).toBeNull()

    saveRecords(records)
    const upgraded = JSON.parse(fake.getItem(RECORDS_KEY) as string) as { v: number }
    expect(upgraded.v).toBe(STORAGE_SCHEMA_VERSION)
  })

  it('JSON 损坏：回退默认值并删掉坏数据，不影响其它条目', () => {
    saveProgress(progressFixture())
    fake.setItem(RECORDS_KEY, '{ 这不是 JSON')
    expect(loadRecords()).toEqual({})
    expect(fake.getItem(RECORDS_KEY)).toBeNull()
    expect(loadProgress()?.puzzleId).toBe('easy-5x5-abc')
  })

  it('结构不合法（信封正确但内容不对）也算损坏', () => {
    fake.setItem(PROGRESS_KEY, JSON.stringify({ v: STORAGE_SCHEMA_VERSION, data: { nope: true } }))
    expect(loadProgress()).toBeNull()
    expect(fake.getItem(PROGRESS_KEY)).toBeNull()
  })

  it('来自未来版本的数据不回读，也不会被删除（用户可能只是临时回退版本）', () => {
    fake.setItem(RECORDS_KEY, JSON.stringify({ v: STORAGE_SCHEMA_VERSION + 5, data: { 'easy:x': { timeMs: 1 } } }))
    expect(loadRecords()).toEqual({})
    expect(fake.getItem(RECORDS_KEY)).not.toBeNull()
  })

  it('migrateStorage 记录问题条目、清掉损坏数据并写下当前版本', () => {
    fake.setItem(PROGRESS_KEY, JSON.stringify({ broken: true }))
    fake.setItem('nonogram-history-v1', 'not json')
    saveRecords({ 'easy:ok': { best: recordFixture(), bestNoHints: null, byJudge: {} } })

    const report = migrateStorage()
    expect(report.version).toBe(STORAGE_SCHEMA_VERSION)
    expect(report.issues.sort()).toEqual(['nonogram-history-v1', 'nonogram-progress-v1'])
    expect(fake.getItem(PROGRESS_KEY)).toBeNull()
    expect(loadRecords()['easy:ok']).toBeTruthy()
    const schema = JSON.parse(fake.getItem(SCHEMA_KEY) as string) as { v: number; data: { version: number } }
    expect(schema.data.version).toBe(STORAGE_SCHEMA_VERSION)
  })

  it('通用读写原语 readStored / writeStored / removeStored 走同一套逻辑', () => {
    writeStored('custom-key', { hello: 1 })
    expect((JSON.parse(fake.getItem('custom-key') as string) as { v: number }).v).toBe(STORAGE_SCHEMA_VERSION)
    expect(readStored('custom-key', null)).toEqual({ hello: 1 })
    // 校验不通过 => 回退默认值
    expect(readStored('custom-key', 'fallback', (value) => typeof value === 'string')).toBe('fallback')
    removeStored('custom-key')
    expect(readStored('custom-key', null)).toBeNull()
  })
})

describe('存储层：成绩公平性', () => {
  it('best / bestNoHints / byJudge 三条记录互不污染', () => {
    expect(submitRecord('easy', 's1', recordFixture())).toEqual({ isBest: true, isBestNoHints: true })
    // 更慢且用了提示：什么都不刷新
    expect(submitRecord('easy', 's1', recordFixture({ timeMs: 9000, hintsUsed: 2 }))).toEqual({
      isBest: false,
      isBestNoHints: false,
    })
    // 更快但用了提示：只刷新「不限条件」的最佳成绩
    expect(submitRecord('easy', 's1', recordFixture({ timeMs: 4000, hintsUsed: 1 }))).toEqual({
      isBest: true,
      isBestNoHints: false,
    })
    // 零提示但暂停过：不算「纯净成绩」
    expect(submitRecord('easy', 's1', recordFixture({ timeMs: 3000, paused: true }))).toEqual({
      isBest: true,
      isBestNoHints: false,
    })
    // 更快且零提示且没暂停：两条都刷新
    expect(submitRecord('easy', 's1', recordFixture({ timeMs: 2000 }))).toEqual({
      isBest: true,
      isBestNoHints: true,
    })

    const best = getBest('easy', 's1')
    expect(best?.best?.timeMs).toBe(2000)
    expect(best?.bestNoHints?.timeMs).toBe(2000)
    expect(best?.byJudge.lenient?.timeMs).toBe(2000)
  })

  it('不同判定模式的成绩分别记录', () => {
    submitRecord('easy', 's2', recordFixture({ timeMs: 5000, judgeMode: 'lenient' }))
    submitRecord('easy', 's2', recordFixture({ timeMs: 8000, judgeMode: 'strict' }))
    const best = getBest('easy', 's2')
    expect(best?.byJudge.lenient?.timeMs).toBe(5000)
    expect(best?.byJudge.strict?.timeMs).toBe(8000)
    // 总体最佳取更快的那次
    expect(best?.best?.timeMs).toBe(5000)
  })
})

describe('存储层：历史成绩', () => {
  it('按 (puzzleId, completedAt) 去重，并按上限裁剪', () => {
    expect(loadHistory()).toEqual([])
    pushHistory(historyFixture({ completedAt: 1 }))
    pushHistory(historyFixture({ completedAt: 2 }))
    expect(loadHistory()).toHaveLength(2)
    // 完全重复的一条不再写入
    pushHistory(historyFixture({ completedAt: 2 }))
    expect(loadHistory()).toHaveLength(2)
    // 最新的在最前
    expect(loadHistory()[0].completedAt).toBe(2)

    for (let i = 0; i < HISTORY_LIMIT + 20; i++) {
      pushHistory(historyFixture({ puzzleId: `p${i}`, completedAt: 100 + i }))
    }
    expect(loadHistory()).toHaveLength(HISTORY_LIMIT)
  })
})

describe('存储层：每日挑战与成就', () => {
  it('同一天多次挑战只保留更快的一次', () => {
    saveDailyRecord(dailyFixture({ timeMs: 5000 }))
    saveDailyRecord(dailyFixture({ timeMs: 7000 }))
    expect(loadDailyRecords()['2026-09-28']?.timeMs).toBe(5000)
    saveDailyRecord(dailyFixture({ timeMs: 3000 }))
    expect(loadDailyRecords()['2026-09-28']?.timeMs).toBe(3000)
    // 不同日期互不影响
    saveDailyRecord(dailyFixture({ date: '2026-09-27', timeMs: 9000 }))
    expect(Object.keys(loadDailyRecords()).sort()).toEqual(['2026-09-27', '2026-09-28'])
  })

  it('unlockAchievements 只返回本次新增的成就', () => {
    expect(unlockAchievements(['a', 'b'])).toEqual(['a', 'b'])
    expect(unlockAchievements(['b', 'c'])).toEqual(['c'])
    expect(unlockAchievements(['a', 'b', 'c'])).toEqual([])
    expect(Object.keys(loadAchievements()).sort()).toEqual(['a', 'b', 'c'])
  })
})

describe('存储层：棋盘编解码与清空', () => {
  it('encodeBoard / decodeBoard 覆盖三种状态与非法输入', () => {
    const board = Uint8Array.from([0, 1, 2, 1, 0])
    expect(encodeBoard(board)).toBe('01210')
    expect(Array.from(decodeBoard('01210', 5) as Uint8Array)).toEqual([0, 1, 2, 1, 0])
    expect(decodeBoard('01210', 4)).toBeNull()
    expect(decodeBoard('012', 4)).toBeNull()
    expect(decodeBoard('0129', 4)).toBeNull()
    expect(decodeBoard('', 0)).toEqual(new Uint8Array(0))
  })

  it('clearAllData 清掉包括自动解题历史在内的全部条目', () => {
    saveProgress(progressFixture())
    pushHistory(historyFixture())
    saveRecords({ 'easy:s1': { best: recordFixture(), bestNoHints: null, byJudge: {} } })
    saveDailyRecord(dailyFixture())
    unlockAchievements(['first-solve'])
    writeStored(SOLVER_HISTORY_KEY, [{ width: 5, height: 5, rowClues: [], colClues: [], at: 1 }])

    clearAllData()

    expect(loadProgress()).toBeNull()
    expect(loadHistory()).toEqual([])
    expect(loadRecords()).toEqual({})
    expect(loadDailyRecords()).toEqual({})
    expect(loadAchievements()).toEqual({})
    expect(fake.getItem(SOLVER_HISTORY_KEY)).toBeNull()
  })
})
