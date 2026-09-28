/**
 * 开局引导：从 URL / 本地存档恢复出一局游戏。
 */

import { computeClues } from '../core/clues'
import { decodeBoard, loadProgress, type StoredProgress } from '../core/storage'
import type { JudgeMode, Puzzle } from '../core/types'
import { puzzleFromCode } from '../core/encoding'
import { useGameStore } from '../store/gameStore'
import { parsePuzzleId, regenerateFromId } from '../core/replay'

// 纯逻辑放在 core/replay（不依赖 store，可单测），这里统一对外导出
export { parsePuzzleId, regenerateFromId }

export function puzzleFromStored(saved: StoredProgress): Puzzle | null {
  const size = saved.width * saved.height
  const solution = decodeBoard(saved.solution, size)
  if (!solution) return null
  const bits = new Uint8Array(size)
  for (let i = 0; i < size; i++) bits[i] = solution[i] ? 1 : 0
  const { rowClues, colClues } = computeClues(bits, saved.width, saved.height)
  return {
    id: saved.puzzleId,
    width: saved.width,
    height: saved.height,
    solution: bits,
    rowClues,
    colClues,
    difficulty: saved.difficulty,
    seed: saved.seed,
    title: saved.title,
    // 老存档没有 source 字段：用种子前缀兜底识别每日挑战
    source: saved.source ?? (saved.seed.startsWith('daily-') ? 'daily' : undefined),
  }
}

export function restoreFromStored(saved: StoredProgress, judgeMode: JudgeMode): boolean {
  const puzzle = puzzleFromStored(saved)
  if (!puzzle) return false
  const board = decodeBoard(saved.board, puzzle.width * puzzle.height)
  if (!board) return false
  useGameStore.getState().startPuzzle(puzzle, saved.judgeMode ?? judgeMode, {
    board,
    elapsedMs: saved.elapsedMs,
    mistakes: saved.mistakes,
    hintsUsed: saved.hintsUsed,
    penaltyMs: saved.penaltyMs,
    pauseCount: saved.pauseCount ?? 0,
  })
  return true
}

export interface LoadOutcome {
  ok: boolean
  error?: string
}

/**
 * 「直接开玩」的载入成本预判：这次打开游戏页是否需要**按种子重新生成**谜题？
 *
 * 只有 `#/play?p=<id>` 这条路可能很贵：
 *   · 分享码 `?s=` 自带图案，只做解码 + 算线索（毫秒级）；
 *   · 恢复存档 / store 里已有这道题同样是毫秒级；
 *   · 只有「既不在 store、又没有对应存档、且 id 合法」时才真的要跑生成器 ——
 *     尺寸越大越慢（实测 50×50 困难档约 4 秒，且全部发生在主线程）。
 *
 * 页面据此在**开跑之前**先渲染 loading 遮罩（见 GamePage 的载入态），
 * 避免「点开链接 → 页面无响应数秒 → 突然出现游戏」。
 * 这个函数只做判断、不做任何计算，所以可以放心在 render / effect 里调用。
 */
export function bootstrapNeedsGeneration(params: URLSearchParams): boolean {
  // `?s=` 分支自带图案，永远不需要重新生成
  if (params.get('s')) return false
  const id = params.get('p')
  if (!id) return false
  // 非法 id 会立刻返回错误（毫秒级），不必为它显示 loading
  if (!parsePuzzleId(id)) return false
  const store = useGameStore.getState()
  if (store.puzzle?.id === id && !store.completed) return false
  const saved = loadProgress()
  if (saved && saved.puzzleId === id) return false
  return true
}

/**
 * 两个谜题是否「同一道题」：尺寸相同 + 图案逐格相同。
 * 用于「分享码指向的题就是当前正在玩的题」这种情况，避免重复 startPuzzle。
 */
export function samePattern(a: Puzzle, b: Puzzle): boolean {
  if (a.width !== b.width || a.height !== b.height) return false
  if (a.solution.length !== b.solution.length) return false
  for (let i = 0; i < a.solution.length; i++) if (a.solution[i] !== b.solution[i]) return false
  return true
}

/**
 * 打开游戏页时的加载顺序：
 *   1. 分享码 ?s=  （自包含，优先级最高）
 *   2. 上一次没下完的存档（同一个谜题）
 *   3. 谜题 id ?p=  （按 seed 重新生成）
 *   4. 都没有则返回错误，由页面决定回首页还是随机开一局
 */
export function ensureGame(params: URLSearchParams, judgeMode: JudgeMode): LoadOutcome {
  const store = useGameStore.getState()
  const share = params.get('s')
  if (share) {
    const puzzle = puzzleFromCode(share)
    if (!puzzle) return { ok: false, error: '分享链接无法解析，请检查是否被截断' }
    // 分享码里的题就是当前这局（典型场景：从「自定义编辑器」「自动解题」跳过来，
    // 跳转前已经 startPuzzle 过一次）。这时保留 store 里那一个 —— 它带着更完整的
    // 元信息（seed / title / source），而分享码还原出来的那个只有尺寸和图案。
    const current = store.puzzle
    if (current && !store.completed && samePattern(current, puzzle)) return { ok: true }
    if (store.puzzle?.id !== puzzle.id || store.completed) {
      const saved = loadProgress()
      if (saved && saved.puzzleId === puzzle.id && restoreFromStored(saved, judgeMode)) return { ok: true }
      store.startPuzzle(puzzle, judgeMode)
    }
    return { ok: true }
  }

  const id = params.get('p')
  if (id) {
    if (store.puzzle?.id === id && !store.completed) return { ok: true }
    const saved = loadProgress()
    if (saved && saved.puzzleId === id && restoreFromStored(saved, judgeMode)) return { ok: true }
    const puzzle = regenerateFromId(id)
    if (!puzzle) return { ok: false, error: '这个谜题链接已失效' }
    store.startPuzzle(puzzle, judgeMode)
    return { ok: true }
  }

  if (store.puzzle && !store.completed) return { ok: true }
  const saved = loadProgress()
  if (saved && restoreFromStored(saved, judgeMode)) return { ok: true }
  return { ok: false, error: '没有可以继续的对局' }
}
