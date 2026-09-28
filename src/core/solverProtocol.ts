/**
 * 主线程 <-> 求解 Worker 的消息协议
 * ============================================================================
 * 单独放一个模块，避免「UI 想 import Worker 里的类型」时把 worker 入口也一起拉进主包。
 */

import type { SolvePuzzleOptions, SolvePuzzleRequest, SolveResult } from './solver'

/** Worker 里可以安全结构化克隆的选项（signal 不可克隆，取消改走 terminate） */
export type SolverWorkerOptions = Omit<SolvePuzzleOptions, 'signal'>

export interface SolverWorkerRequest {
  type: 'solve'
  id: number
  request: SolvePuzzleRequest
  options: SolverWorkerOptions
}

export type SolverWorkerResponse =
  { type: 'result'; id: number; result: SolveResult } | { type: 'error'; id: number; message: string }
