/**
 * localStorage 不可用时的降级（隐私模式 / 配额满 / 受限 WebView）。
 *
 * 这个文件单独放，因为它需要让 localStorage 的每个方法都抛异常 ——
 * 而 storage.ts 会缓存「是否可用」的探测结果，必须独占一个模块实例。
 */
import { describe, expect, it } from 'vitest'
import { clearProgress, loadProgress, saveProgress, storageAvailable, type StoredProgress } from '../src/core/storage'

const denied = (): never => {
  throw new Error('localStorage is not available')
}

Object.defineProperty(globalThis, 'window', {
  value: {
    localStorage: {
      getItem: denied,
      setItem: denied,
      removeItem: denied,
      clear: denied,
      key: denied,
      length: 0,
    },
  },
  configurable: true,
  writable: true,
})

const fixture: StoredProgress = {
  puzzleId: 'easy-5x5-denied',
  difficulty: 'easy',
  width: 5,
  height: 5,
  seed: 'denied',
  board: '00000',
  solution: '01100',
  elapsedMs: 0,
  mistakes: 0,
  hintsUsed: 0,
  penaltyMs: 0,
  pauseCount: 0,
  judgeMode: 'lenient',
  completed: false,
  updatedAt: 0,
}

describe('localStorage 不可用', () => {
  it('storageAvailable() 返回 false，读写自动降级到内存且不抛异常', () => {
    expect(storageAvailable()).toBe(false)
    expect(loadProgress()).toBeNull()

    saveProgress(fixture)
    // 本次会话内依然可读（内存兜底），只是刷新后不会保留
    expect(loadProgress()?.puzzleId).toBe('easy-5x5-denied')

    clearProgress()
    expect(loadProgress()).toBeNull()
  })
})
