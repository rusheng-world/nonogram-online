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
  })
  return true
}

export interface LoadOutcome {
  ok: boolean
  error?: string
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
