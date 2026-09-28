import { memo } from 'react'
import { ColumnClues, RowClues } from './ClueStrips'
import { clueWeightOf, maxClueLines, useBoardMetrics } from '../hooks/useBoardMetrics'
import { EMPTY, FILLED, UNKNOWN } from '../core/types'

/** 单元格高亮类型：本步推论 / 本步假设 / 两个解的差异格 / 矛盾所在 */
export type CellHighlightKind = 'step' | 'assume' | 'diff' | 'contradiction'

interface SolverGridProps {
  width: number
  height: number
  rowClues: number[][]
  colClues: number[][]
  /** 每格状态，取值 UNKNOWN / FILLED / EMPTY */
  board: Uint8Array
  /**
   * 是否把「逻辑上必为白」(EMPTY) 的格子用淡底色区分出来。
   * 答案展示时关闭 —— 需求要求答案棋盘只表现「填充 / 空」，不画 X。
   */
  showDeduced?: boolean
  /** 需要高亮的格子及其高亮类型 */
  highlight?: Map<number, CellHighlightKind> | null
  /** 每 5 格加深辅助线 */
  guides?: boolean
  /** 单元格上限（默认 30px，避免小盘面格子过大） */
  maxCell?: number
}

const NO_PROGRESS: boolean[][] = []

/**
 * 只读棋盘（自动解题页面用）。
 *
 * 视觉与游戏页一致（复用 .nb-frame / .nb-cell / 线索条），但没有交互、
 * 没有 X 标记、没有错误态 —— 它只负责"把一版答案画出来"。
 */
export const SolverGrid = memo(function SolverGrid({
  width,
  height,
  rowClues,
  colClues,
  board,
  showDeduced = false,
  highlight = null,
  guides = true,
  maxCell = 30,
}: SolverGridProps) {
  const { containerRef, metrics } = useBoardMetrics({
    width,
    height,
    rowClueWeight: clueWeightOf(rowClues),
    colClueLines: maxClueLines(colClues),
    maxCell,
  })
  const { cell, numFont, clueLine, gutterX, gutterY } = metrics

  const guideLinesX: number[] = []
  const guideLinesY: number[] = []
  if (guides) {
    for (let x = 5; x < width; x += 5) guideLinesX.push(x)
    for (let y = 5; y < height; y += 5) guideLinesY.push(y)
  }

  return (
    <div ref={containerRef} className="flex min-h-[160px] min-w-0 flex-1 items-center justify-center">
      <div
        className="nb-frame"
        style={
          {
            display: 'grid',
            gridTemplateColumns: `${gutterX}px auto`,
            gridTemplateRows: `${gutterY}px auto`,
            '--nb-cell-size': `${cell}px`,
          } as React.CSSProperties
        }
      >
        <div />
        <ColumnClues
          clues={colClues}
          cell={cell}
          numFont={numFont}
          clueLine={clueLine}
          progress={NO_PROGRESS}
          active={-1}
        />
        <RowClues clues={rowClues} cell={cell} numFont={numFont} progress={NO_PROGRESS} active={-1} />

        <div className="relative" style={{ width: cell * width, height: cell * height }}>
          <div
            className="nb-board"
            style={{
              gridTemplateColumns: `repeat(${width}, ${cell}px)`,
              gridTemplateRows: `repeat(${height}, ${cell}px)`,
            }}
          >
            {Array.from({ length: width * height }, (_, index) => {
              const value = board[index] ?? UNKNOWN
              const kind = highlight?.get(index)
              return (
                <div
                  key={index}
                  className="nb-cell"
                  data-state={value === FILLED ? 'filled' : 'empty'}
                  data-deduced={showDeduced && value === EMPTY ? 1 : 0}
                  data-step={kind ?? 'none'}
                />
              )
            })}
          </div>

          {guideLinesX.map((x) => (
            <div
              key={`gx-${x}`}
              className="pointer-events-none absolute top-0"
              style={{ left: x * cell - 1, width: 2, height: cell * height, backgroundColor: 'var(--nb-grid-strong)' }}
            />
          ))}
          {guideLinesY.map((y) => (
            <div
              key={`gy-${y}`}
              className="pointer-events-none absolute left-0"
              style={{ top: y * cell - 1, height: 2, width: cell * width, backgroundColor: 'var(--nb-grid-strong)' }}
            />
          ))}
        </div>
      </div>
    </div>
  )
})
