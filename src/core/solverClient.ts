/**
 * 求解任务的调度层
 * ============================================================================
 * 对页面只暴露一个 `runSolve()`：给请求、拿结果、随时取消。
 *
 * 什么时候用 Worker（需求 9.8）：
 *   · 大棋盘（任一维 > LARGE_BOARD）或预计回溯很多（线索很长）时**必须**用 Worker，
 *     否则同步求解会把主线程卡住、页面转圈也点不动；
 *   · 小棋盘也走 Worker —— 一个 Worker 的启动开销只有几毫秒，换来的是
 *     "点了取消就真的立刻停"，值得；
 *   · 环境不支持 Worker（老浏览器 / 测试环境）时退化成主线程同步求解，
 *     这时"取消"只能在算完之后生效，所以界面上会说明。
 *
 * 取消策略：Worker 里跑的是同步循环，收不到消息，因此直接 terminate()。
 * Worker 很轻，下一次求解重新建一个即可。
 */

import { solvePuzzle, type SolvePuzzleOptions, type SolvePuzzleRequest, type SolveResult } from './solver'
import type { SolverWorkerRequest, SolverWorkerResponse } from './solverProtocol'

/** 超过这个尺寸就明确走 Worker（需求里的 30×30 门槛） */
export const LARGE_BOARD_SIZE = 30

export interface SolverHandle {
  /** 求解结果（被取消时 resolve 成 cancelled 的结果，不 reject） */
  promise: Promise<SolveResult>
  /** 立刻中止这次求解 */
  cancel(): void
  /** 这次求解是否跑在 Worker 里 */
  readonly onWorker: boolean
}

export function solverRuntimeAvailable(): boolean {
  return typeof Worker !== 'undefined'
}

/** 取消后返回的结果：语义上等价于"用户中止了计算" */
function cancelledResult(): SolveResult {
  return {
    status: 'timeout',
    cancelled: true,
    steps: [],
    stats: { propagationRounds: 0, backtrackCount: 0, elapsedMs: 0 },
    details: { nodes: 0, failedGuesses: 0, deducedCells: 0, maxDepth: 0 },
  }
}

let nextRunId = 1

function createWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  try {
    return new Worker(new URL('../workers/solver.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    return null
  }
}

/**
 * 启动一次求解。返回的 handle 可以随时 cancel。
 */
export function runSolve(request: SolvePuzzleRequest, options: SolvePuzzleOptions = {}): SolverHandle {
  const worker = createWorker()

  if (worker) {
    const id = nextRunId++
    let settled = false
    let resolvePromise!: (value: SolveResult) => void
    const promise = new Promise<SolveResult>((resolve) => {
      resolvePromise = resolve
    })

    const finish = (value: SolveResult) => {
      if (settled) return
      settled = true
      worker.terminate()
      resolvePromise(value)
    }

    worker.onmessage = (event: MessageEvent<SolverWorkerResponse>) => {
      const message = event.data
      if (!message || message.id !== id) return
      if (message.type === 'result') {
        finish(message.result)
        return
      }
      finish({
        status: 'unknown',
        steps: [],
        stats: { propagationRounds: 0, backtrackCount: 0, elapsedMs: 0 },
        contradiction: `求解进程出错：${message.message}`,
      })
    }
    worker.onerror = () => {
      // Worker 起不来（极少数环境）：退化成主线程同步求解，保证功能可用
      finish({ ...solveInline(request, options), steps: [] })
    }

    // signal 不可结构化克隆：Worker 侧不接收它，取消直接 terminate
    const { signal: _signal, ...workerOptions } = options
    void _signal
    const message: SolverWorkerRequest = { type: 'solve', id, request, options: workerOptions }
    worker.postMessage(message)

    return {
      promise,
      onWorker: true,
      cancel: () => finish(cancelledResult()),
    }
  }

  // 无 Worker：用 setTimeout 让 loading 先画出来，再同步求解
  const signal = { aborted: false }
  let resolvePromise!: (value: SolveResult) => void
  const promise = new Promise<SolveResult>((resolve) => {
    resolvePromise = resolve
  })
  const timer = setTimeout(() => {
    resolvePromise(solvePuzzle(request, { ...options, signal }))
  }, 16)

  return {
    promise,
    onWorker: false,
    cancel: () => {
      signal.aborted = true
      clearTimeout(timer)
      resolvePromise(cancelledResult())
    },
  }
}

function solveInline(request: SolvePuzzleRequest, options: SolvePuzzleOptions): SolveResult {
  try {
    return solvePuzzle(request, options)
  } catch (error) {
    return {
      status: 'unknown',
      steps: [],
      stats: { propagationRounds: 0, backtrackCount: 0, elapsedMs: 0 },
      contradiction: error instanceof Error ? error.message : String(error),
    }
  }
}
