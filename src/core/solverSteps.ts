/**
 * 推理轨迹回放
 * ============================================================================
 * SolveStep 只记录"这一步新确定了哪些格子"，因此回放时按顺序折叠即可还原出
 * 每一步结束时棋盘长什么样 —— 不需要给每步都存一份整盘快照（大棋盘会非常占内存）。
 *
 * 折叠规则：
 *   propagate / assume  把 cells 写进棋盘，并记到「当前假设层级」名下
 *   contradiction       不改棋盘（这一分支已经死了，紧接着会回退）
 *   backtrack           撤销 depth 及更深层级的全部改动，回到假设之前
 *   done                不改棋盘
 */

import { EMPTY, FILLED, UNKNOWN } from './types'
import type { SolveStep, SolveStepCell } from './solver'

export interface StepPlayback {
  size: number
  board: Uint8Array
  /** applied[depth] = 该假设层级自己引入的格子（回退时按层撤销） */
  applied: { index: number; value: number }[][]
}

export function createPlayback(size: number): StepPlayback {
  return { size, board: new Uint8Array(size), applied: [] }
}

/** 步骤里的 CellState -> 求解器数字编码（'marked' 表示"逻辑上必为白"） */
export function stepCellValue(state: SolveStepCell['state']): number {
  return state === 'filled' ? FILLED : EMPTY
}

export function playbackApply(state: StepPlayback, step: SolveStep): void {
  switch (step.type) {
    case 'contradiction':
    case 'done':
      return
    case 'backtrack': {
      for (let depth = state.applied.length - 1; depth >= step.depth; depth--) {
        const list = state.applied[depth]
        if (!list) continue
        for (const cell of list) state.board[cell.index] = UNKNOWN
        state.applied[depth] = []
      }
      return
    }
    default: {
      // propagate / assume：写入本层
      let list = state.applied[step.depth]
      if (!list) {
        list = []
        state.applied[step.depth] = list
      }
      for (const cell of step.cells ?? []) {
        const value = stepCellValue(cell.state)
        state.board[cell.index] = value
        list.push({ index: cell.index, value })
      }
    }
  }
}

/**
 * 折叠出「执行完第 upto 步（含）」时的棋盘。
 * upto < 0 表示还没开始，返回全 UNKNOWN。
 */
export function boardAfter(steps: readonly SolveStep[], size: number, upto: number): Uint8Array {
  const state = createPlayback(size)
  const last = Math.min(upto, steps.length - 1)
  for (let i = 0; i <= last; i++) playbackApply(state, steps[i])
  return state.board
}

/**
 * 找出「值得停下来的节点」。
 * 轨迹很长（> 500 步）时默认只看关键节点：某层传播的最后一轮，
 * 以及每次假设 / 回退 / 矛盾 / 结论 —— 跳过大量中间轮次。
 */
export function keyStepIndexes(steps: readonly SolveStep[], limit = 500): number[] {
  if (steps.length <= limit) return steps.map((_, i) => i)
  const keys: number[] = []
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    const next = steps[i + 1]
    const isRoundEnd = step.type !== 'propagate' || !next || next.type !== 'propagate' || next.depth < step.depth
    if (isRoundEnd) keys.push(i)
  }
  return keys.length > 0 ? keys : steps.map((_, i) => i)
}

/**
 * 一次性算出「每个关键节点的棋盘快照」，供逐步演示使用。
 *
 * 为什么不是「每次翻页都调一次 boardAfter()」：boardAfter 每次都从第 0 步
 * 重新折叠，播放 n 个节点就是 O(n²) 的重复计算 —— 大棋盘长轨迹下会明显卡顿。
 * 这里只做**一趟**正向折叠，在关键节点处存一份棋盘副本，翻页就是 O(1) 取数组。
 *
 * @param indexes 关键节点下标（必须递增，来自 keyStepIndexes）
 */
export function frameSequence(steps: readonly SolveStep[], size: number, indexes: readonly number[]): Uint8Array[] {
  const frames: Uint8Array[] = new Array(indexes.length)
  const state = createPlayback(size)
  let cursor = 0
  for (let i = 0; i < indexes.length; i++) {
    const target = Math.min(indexes[i], steps.length - 1)
    for (let s = cursor; s <= target; s++) playbackApply(state, steps[s])
    cursor = target + 1
    frames[i] = state.board.slice()
  }
  return frames
}
