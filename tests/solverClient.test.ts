/**
 * 求解调度层（src/core/solverClient.ts）的回归测试（审查报告 L-07）。
 *
 * node 环境下没有 Worker，runSolve 会走「非 Worker 兜底」分支：用 setTimeout 让 loading
 * 先画出来，再在主线程同步求解。这里要确保：
 *   · 求解正常时 resolve；
 *   · 求解器抛异常时 **reject**，而不是让 promise 永远 pending（旧实现会把页面卡在「求解中…」）；
 *   · 取消后 resolve 成 cancelled 结果，不 reject。
 */
import { describe, expect, it, vi } from 'vitest'
import { solverRuntimeAvailable } from '../src/core/solverClient'

const solvePuzzleMock = vi.fn()

vi.mock('../src/core/solver', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/core/solver')>()
  return { ...actual, solvePuzzle: (...args: unknown[]) => solvePuzzleMock(...args) }
})

const { runSolve } = await import('../src/core/solverClient')

const REQUEST = { width: 5, height: 5, rowClues: [[1]], colClues: [[1]] }

describe('runSolve：非 Worker 兜底路径', () => {
  it('本环境（node）确实走的是兜底分支', () => {
    expect(solverRuntimeAvailable()).toBe(false)
  })

  it('求解成功时 resolve 出结果', async () => {
    const outcome = {
      status: 'unique' as const,
      steps: [],
      stats: { propagationRounds: 0, backtrackCount: 0, elapsedMs: 1 },
      solution: new Uint8Array(25),
    }
    solvePuzzleMock.mockReturnValueOnce(outcome)
    const handle = runSolve(REQUEST)
    await expect(handle.promise).resolves.toBe(outcome)
  })

  it('求解器抛异常时 reject（而不是永远 pending）', async () => {
    solvePuzzleMock.mockImplementationOnce(() => {
      throw new Error('求解器内部错误')
    })
    const handle = runSolve(REQUEST)
    await expect(handle.promise).rejects.toThrow('求解器内部错误')
  })

  it('取消后 resolve 成 cancelled 结果，且不会 reject', async () => {
    solvePuzzleMock.mockClear()
    const handle = runSolve(REQUEST)
    handle.cancel()
    const outcome = await handle.promise
    expect(outcome.cancelled).toBe(true)
    expect(solvePuzzleMock).not.toHaveBeenCalled()
  })
})
