/**
 * 配额满时的降级（审查报告 L-03）。
 *
 * localStorage 存在、但不是「写不进去」（配额满 / 受限存储）时，此前是**静默**退化成内存存储：
 * 玩家以为进度已保存，其实刷新就丢。现在要求：
 *   · 游戏照常能玩（读写都不抛异常）；
 *   · storageDegraded() 为 true，界面能如实提示；
 *   · 本次会话内刚写入的数据要读得回来（不能写进内存却又去读 localStorage 的旧值）。
 *
 * 单独一个文件：storage.ts 会缓存「是否可用」的探测结果，必须独占模块实例。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { loadProgress, saveProgress, storageAvailable, storageDegraded, type StoredProgress } from '../src/core/storage'

let quotaFull = false

function createQuotaStorage() {
  const map = new Map<string, string>()
  return {
    map,
    get length(): number {
      return map.size
    },
    key: (index: number): string | null => Array.from(map.keys())[index] ?? null,
    getItem: (key: string): string | null => map.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      if (quotaFull) throw new Error('QuotaExceededError: 存储配额已满')
      map.set(key, String(value))
    },
    removeItem: (key: string): void => {
      map.delete(key)
    },
    clear: (): void => map.clear(),
  }
}

const fake = createQuotaStorage()
Object.defineProperty(globalThis, 'window', {
  value: { localStorage: fake },
  configurable: true,
  writable: true,
})

function fixture(elapsedMs: number): StoredProgress {
  return {
    puzzleId: 'easy-5x5-quota',
    difficulty: 'easy',
    width: 5,
    height: 5,
    seed: 'quota',
    board: '00000',
    solution: '01100',
    elapsedMs,
    mistakes: 0,
    hintsUsed: 0,
    penaltyMs: 0,
    pauseCount: 0,
    judgeMode: 'lenient',
    completed: false,
    updatedAt: 0,
  }
}

beforeEach(() => {
  quotaFull = false
  fake.clear()
})

describe('localStorage 配额满', () => {
  it('写入失败不抛异常、不崩，但会被标记为「无法保存」', () => {
    expect(storageAvailable()).toBe(true)
    expect(storageDegraded()).toBe(false)

    saveProgress(fixture(0))
    expect(loadProgress()?.elapsedMs).toBe(0)

    quotaFull = true
    expect(() => saveProgress(fixture(6_000))).not.toThrow()
    expect(storageDegraded()).toBe(true)
    // 本次会话仍然读得回来（内存兜底），只是刷新后会丢
    expect(loadProgress()?.elapsedMs).toBe(6_000)
  })

  it('标记一旦置位就保持（提示不会在数据可能没落盘时中途消失）', () => {
    quotaFull = true
    saveProgress(fixture(1_000))
    quotaFull = false
    saveProgress(fixture(2_000))
    // 仍然为 true：宁可多提示一次，也不要在数据可能没落盘时假装一切正常
    expect(storageDegraded()).toBe(true)
    expect(loadProgress()?.elapsedMs).toBe(2_000)
  })
})
