/**
 * 求解 Worker
 * ============================================================================
 * 只做一件事：把主线程发来的请求丢给**同一份** solvePuzzle 求解，再把 SolveResult 发回去。
 * 求解器代码通过 import 共享，没有第二份实现。
 *
 * 关于取消：solvePuzzle 内部是同步循环，Worker 在它跑的时候收不到新的 message，
 * 所以"取消"由主线程 terminate() 掉这个 Worker 完成（见 core/solverClient.ts）。
 */

import { solvePuzzle } from '../core/solver'
import type { SolverWorkerRequest, SolverWorkerResponse } from '../core/solverProtocol'

interface WorkerScope {
  onmessage: ((event: MessageEvent<SolverWorkerRequest>) => void) | null
  postMessage(message: SolverWorkerResponse): void
}

const scope = self as unknown as WorkerScope

scope.onmessage = (event: MessageEvent<SolverWorkerRequest>) => {
  const message = event.data
  if (!message || message.type !== 'solve') return
  try {
    const result = solvePuzzle(message.request, message.options)
    scope.postMessage({ type: 'result', id: message.id, result })
  } catch (error) {
    scope.postMessage({
      type: 'error',
      id: message.id,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
