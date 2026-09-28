/**
 * 自定义数织编辑器状态。
 * 网格只用 0/1 两种状态（画/不画），线索、唯一性都由页面实时计算。
 */

import { create } from 'zustand'
import { MAX_EDITOR_SIZE, MIN_EDITOR_SIZE } from '../core/types'
import { exportTextGrid, parseTextGrid } from '../core/text'

export type EditorTool = 'pencil' | 'eraser' | 'rect' | 'line' | 'bucket'
export type EditorSymmetry = 'none' | 'vertical' | 'horizontal' | 'quad'

const HISTORY_LIMIT = 60

interface EditorStore {
  width: number
  height: number
  grid: Uint8Array
  tool: EditorTool
  symmetry: EditorSymmetry
  zoom: number
  past: Uint8Array[]
  future: Uint8Array[]
  notice: string | null

  setTool(tool: EditorTool): void
  setSymmetry(symmetry: EditorSymmetry): void
  setZoom(zoom: number): void
  setSize(width: number, height: number): void
  setNotice(notice: string | null): void
  /**
   * 一次完整笔画：把 changes 应用到 grid，并把「本次改动前的快照」压入撤销栈。
   * 页面在拖拽期间只改 DOM、不调这里，抬手时才调用一次 —— 因此一次拖拽 = 一个撤销步。
   */
  applyCells(changes: { index: number; value: number }[]): void
  clearAll(): void
  fillAll(): void
  invert(): void
  flipHorizontal(): void
  flipVertical(): void
  rotateClockwise(): void
  importText(text: string): { ok: boolean; error?: string; warnings?: string[] }
  exportText(): string
  loadGrid(grid: Uint8Array, width: number, height: number): void
  undo(): void
  redo(): void
}

function clampSize(value: number): number {
  if (!Number.isFinite(value)) return MIN_EDITOR_SIZE
  return Math.min(MAX_EDITOR_SIZE, Math.max(MIN_EDITOR_SIZE, Math.round(value)))
}

function emptyGrid(width: number, height: number): Uint8Array {
  return new Uint8Array(width * height)
}

/** 与 (x,y) 镜像相关的所有格子下标（用于对称绘制） */
function mirrors(width: number, height: number, x: number, y: number, symmetry: EditorSymmetry): number[] {
  const out = [y * width + x]
  const push = (px: number, py: number) => {
    const idx = py * width + px
    if (!out.includes(idx)) out.push(idx)
  }
  if (symmetry === 'vertical' || symmetry === 'quad') push(width - 1 - x, y)
  if (symmetry === 'horizontal' || symmetry === 'quad') push(x, height - 1 - y)
  if (symmetry === 'quad') push(width - 1 - x, height - 1 - y)
  return out
}

export const useEditorStore = create<EditorStore>()((set, get) => ({
  width: 15,
  height: 15,
  grid: emptyGrid(15, 15),
  tool: 'pencil',
  symmetry: 'none',
  zoom: 24,
  past: [],
  future: [],
  notice: null,

  setTool(tool) {
    set({ tool })
  },

  setSymmetry(symmetry) {
    set({ symmetry })
  },

  setZoom(zoom) {
    set({ zoom: Math.min(48, Math.max(6, Math.round(zoom))) })
  },

  setSize(width, height) {
    const w = clampSize(width)
    const h = clampSize(height)
    const state = get()
    if (w === state.width && h === state.height) return
    const next = emptyGrid(w, h)
    // 保留原来重叠区域的内容
    const copyW = Math.min(w, state.width)
    const copyH = Math.min(h, state.height)
    for (let y = 0; y < copyH; y++) {
      for (let x = 0; x < copyW; x++) next[y * w + x] = state.grid[y * state.width + x]
    }
    set({
      width: w,
      height: h,
      grid: next,
      past: [...state.past, state.grid].slice(-HISTORY_LIMIT),
      future: [],
      notice: null,
    })
  },

  setNotice(notice) {
    set({ notice })
  },

  applyCells(changes) {
    const state = get()
    const next = state.grid.slice()
    let changed = false
    for (const { index, value } of changes) {
      if (index < 0 || index >= next.length) continue
      if (next[index] !== value) {
        next[index] = value
        changed = true
      }
    }
    if (!changed) return
    set({
      grid: next,
      past: [...state.past, state.grid].slice(-HISTORY_LIMIT),
      future: [],
    })
  },

  clearAll() {
    const state = get()
    set({
      grid: emptyGrid(state.width, state.height),
      past: [...state.past, state.grid].slice(-HISTORY_LIMIT),
      future: [],
      notice: '已清空画布',
    })
  },

  fillAll() {
    const state = get()
    const next = new Uint8Array(state.width * state.height).fill(1)
    set({ grid: next, past: [...state.past, state.grid].slice(-HISTORY_LIMIT), future: [] })
  },

  invert() {
    const state = get()
    const next = state.grid.slice()
    for (let i = 0; i < next.length; i++) next[i] = next[i] ? 0 : 1
    set({ grid: next, past: [...state.past, state.grid].slice(-HISTORY_LIMIT), future: [] })
  },

  flipHorizontal() {
    const { width, height, grid, past } = get()
    const next = emptyGrid(width, height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) next[y * width + x] = grid[y * width + (width - 1 - x)]
    }
    set({ grid: next, past: [...past, grid].slice(-HISTORY_LIMIT), future: [], notice: '已水平翻转' })
  },

  flipVertical() {
    const { width, height, grid, past } = get()
    const next = emptyGrid(width, height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) next[y * width + x] = grid[(height - 1 - y) * width + x]
    }
    set({ grid: next, past: [...past, grid].slice(-HISTORY_LIMIT), future: [], notice: '已垂直翻转' })
  },

  rotateClockwise() {
    const { width, height, grid, past } = get()
    const nextW = height
    const nextH = width
    const next = emptyGrid(nextW, nextH)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const nx = height - 1 - y
        const ny = x
        next[ny * nextW + nx] = grid[y * width + x]
      }
    }
    set({
      width: nextW,
      height: nextH,
      grid: next,
      past: [...past, grid].slice(-HISTORY_LIMIT),
      future: [],
      notice: '已顺时针旋转 90°',
    })
  },

  importText(text) {
    const parsed = parseTextGrid(text)
    if (!parsed.ok) return { ok: false, error: parsed.error }
    const { width, height, grid } = parsed.data
    if (width > MAX_EDITOR_SIZE || height > MAX_EDITOR_SIZE) {
      return { ok: false, error: `尺寸 ${width}x${height} 超出上限 ${MAX_EDITOR_SIZE}` }
    }
    if (width < MIN_EDITOR_SIZE || height < MIN_EDITOR_SIZE) {
      return { ok: false, error: `尺寸 ${width}x${height} 小于下限 ${MIN_EDITOR_SIZE}` }
    }
    const state = get()
    set({
      width,
      height,
      grid,
      past: [...state.past, state.grid].slice(-HISTORY_LIMIT),
      future: [],
      notice: `已导入 ${width}x${height} 图案`,
    })
    return { ok: true, warnings: parsed.warnings }
  },

  exportText() {
    const { grid, width, height } = get()
    return exportTextGrid(grid, width, height)
  },

  loadGrid(grid, width, height) {
    const w = clampSize(width)
    const h = clampSize(height)
    const state = get()
    set({
      width: w,
      height: h,
      grid: grid.length === w * h ? grid : emptyGrid(w, h),
      past: [...state.past, state.grid].slice(-HISTORY_LIMIT),
      future: [],
      notice: null,
    })
  },

  undo() {
    const { past, grid } = get()
    if (past.length === 0) return
    set({
      grid: past[past.length - 1],
      past: past.slice(0, -1),
      future: [grid, ...get().future].slice(0, HISTORY_LIMIT),
    })
  },

  redo() {
    const { future, grid } = get()
    if (future.length === 0) return
    set({ grid: future[0], past: [...get().past, grid].slice(-HISTORY_LIMIT), future: future.slice(1) })
  },
}))

/** 一次性工具的辅助：矩形 / 直线 / 油漆桶 */
export function rectangleCells(x0: number, y0: number, x1: number, y1: number, width: number): number[] {
  const cells: number[] = []
  const minX = Math.min(x0, x1)
  const maxX = Math.max(x0, x1)
  const minY = Math.min(y0, y1)
  const maxY = Math.max(y0, y1)
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) cells.push(y * width + x)
  }
  return cells
}

export function lineCells(x0: number, y0: number, x1: number, y1: number, width: number): number[] {
  const cells: number[] = []
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy
  let x = x0
  let y = y0
  for (let guard = 0; guard < 4096; guard++) {
    cells.push(y * width + x)
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x += sx
    }
    if (e2 < dx) {
      err += dx
      y += sy
    }
  }
  return cells
}

export function floodFillCells(
  grid: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  value: number,
): number[] {
  const startIndex = startY * width + startX
  const target = grid[startIndex]
  if (target === value) return [startIndex]
  const seen = new Uint8Array(grid.length)
  const stack = [startIndex]
  const out: number[] = []
  seen[startIndex] = 1
  while (stack.length) {
    const index = stack.pop() as number
    out.push(index)
    const x = index % width
    const y = (index - x) / width
    const neighbours = [
      x > 0 ? index - 1 : -1,
      x < width - 1 ? index + 1 : -1,
      y > 0 ? index - width : -1,
      y < height - 1 ? index + width : -1,
    ]
    for (const n of neighbours) {
      if (n < 0 || seen[n] || grid[n] !== target) continue
      seen[n] = 1
      stack.push(n)
    }
  }
  return out
}

export { mirrors as mirrorIndices }
