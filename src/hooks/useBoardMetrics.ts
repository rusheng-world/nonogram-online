import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface BoardMetrics {
  /** 单元格边长（整数 CSS 像素，保证点击命中精确） */
  cell: number
  /** 左侧行线索区宽度 */
  gutterX: number
  /** 顶部列线索区高度 */
  gutterY: number
  /** 线索数字字号 */
  numFont: number
  /** 列线索每行高度 */
  clueLine: number
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * 格子最小边长。
 * 再小手指就点不准了，所以自适应到 11px 就不再压缩：
 * 屏幕真的太矮（手机横屏等）时，让外层容器出现滚动条，而不是把棋盘裁掉。
 */
export const MIN_CELL = 11

/** 线索数字行高：随格子缩放，最小 10px（棋盘尺寸迭代与最小高度下限共用，避免两处公式走偏） */
export const clueLineOf = (cell: number) => clamp(Math.round(cell * 0.95), 10, 24)

/**
 * 棋盘尺寸计算。
 *
 * 目标：在可用空间内**完整显示**整个棋盘（含线索区），不出现横向滚动。
 * 因为线索区的宽度本身也依赖字号、字号又依赖格子大小，这里用 3 次迭代收敛。
 */
export function useBoardMetrics(params: {
  width: number
  height: number
  /** 行线索的文字宽度权重（约等于字符数） */
  rowClueWeight: number
  /** 列线索最多几条 */
  colClueLines: number
  minCell?: number
  maxCell?: number
  /** 固定格子大小（编辑器缩放）：给了就跳过自适应 */
  fixedCell?: number | null
}): { containerRef: React.RefObject<HTMLDivElement>; metrics: BoardMetrics } {
  const { width, height, rowClueWeight, colClueLines, minCell = MIN_CELL, maxCell = 34, fixedCell = null } = params
  const containerRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const node = containerRef.current
    if (!node) return
    const measure = () => {
      const rect = node.getBoundingClientRect()
      setBox((prev) =>
        Math.abs(prev.width - rect.width) < 0.5 && Math.abs(prev.height - rect.height) < 0.5
          ? prev
          : { width: rect.width, height: rect.height },
      )
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const [, force] = useState(0)
  useEffect(() => {
    const id = window.setTimeout(() => force((n) => n + 1), 60)
    return () => window.clearTimeout(id)
  }, [box.width, box.height])

  const availW = box.width > 0 ? box.width : Math.min(360, typeof window === 'undefined' ? 360 : window.innerWidth - 24)
  const availH = box.height > 0 ? box.height : Math.max(220, (typeof window === 'undefined' ? 700 : window.innerHeight) - 260)

  if (fixedCell) {
    const cell = clamp(Math.round(fixedCell), 5, 48)
    const numFont = clamp(Math.round(cell * 0.62), 8, 18)
    const clueLine = clamp(Math.round(cell * 0.95), 10, 24)
    return {
      containerRef,
      metrics: {
        cell,
        numFont,
        clueLine,
        gutterX: Math.ceil(rowClueWeight * numFont * 0.6) + 8,
        gutterY: colClueLines * clueLine + 8,
      },
    }
  }

  let cell = maxCell
  let numFont = 16
  let clueLine = 20
  for (let i = 0; i < 3; i++) {
    numFont = clamp(Math.round(cell * 0.62), 8, 18)
    clueLine = clueLineOf(cell)
    const gutterX = Math.ceil(rowClueWeight * numFont * 0.6) + 8
    const gutterY = colClueLines * clueLine + 8
    cell = clamp(
      Math.floor(Math.min((availW - gutterX) / Math.max(1, width), (availH - gutterY) / Math.max(1, height))),
      minCell,
      maxCell,
    )
  }
  numFont = clamp(Math.round(cell * 0.62), 8, 18)
  clueLine = clueLineOf(cell)

  return {
    containerRef,
    metrics: {
      cell,
      numFont,
      clueLine,
      gutterX: Math.ceil(rowClueWeight * numFont * 0.6) + 8,
      gutterY: colClueLines * clueLine + 8,
    },
  }
}

/** 行线索的“文字宽度权重”：每个数字按字符数计，数字之间留 0.6 字宽间隙 */
export function clueWeightOf(clues: readonly number[][]): number {
  let max = 1
  for (const line of clues) {
    let weight = 0
    for (const n of line) weight += String(n).length + 0.6
    if (weight > max) max = weight
  }
  return max
}

export function maxClueLines(clues: readonly number[][]): number {
  let max = 1
  for (const line of clues) max = Math.max(max, line.length)
  return max
}
