import { memo } from 'react'

interface ClueStripProps {
  clues: number[][]
  cell: number
  numFont: number
  clueLine: number
  /** 每条线索是否已完成（true 表示可以划线），长度与 clues[i] 一致 */
  progress: boolean[][]
  /**
   * 高亮某一行/列。
   * 传数字 = 普通对局的鼠标悬停；传数组 = 教程里的「高亮整行/整列」。
   * -1 表示没有高亮。
   */
  active: number | readonly number[]
}

function isActive(active: number | readonly number[], index: number): boolean {
  return typeof active === 'number' ? active === index : active.includes(index)
}

/** 顶部：列线索（竖向排列，底部对齐） */
export const ColumnClues = memo(function ColumnClues({
  clues,
  cell,
  numFont,
  clueLine,
  progress,
  active,
}: ClueStripProps) {
  return (
    <div className="flex" aria-hidden="true">
      {clues.map((clue, x) => (
        <div
          key={x}
          className="nb-clue flex-col items-center justify-end"
          data-active={isActive(active, x) ? 1 : 0}
          style={{ width: cell }}
        >
          {clue.map((n, i) => (
            <span
              key={i}
              className="nb-clue-num"
              data-done={progress[x]?.[i] ? 1 : 0}
              style={{ fontSize: numFont, height: clueLine, minWidth: cell }}
            >
              {n}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
})

/** 左侧：行线索（横向排列，右对齐） */
export const RowClues = memo(function RowClues({
  clues,
  cell,
  numFont,
  progress,
  active,
}: Omit<ClueStripProps, 'clueLine'>) {
  return (
    <div className="flex flex-col" aria-hidden="true">
      {clues.map((clue, y) => (
        <div
          key={y}
          className="nb-clue flex-row items-center justify-end"
          data-active={isActive(active, y) ? 1 : 0}
          style={{ height: cell, gap: Math.max(2, Math.round(numFont * 0.4)) }}
        >
          {clue.map((n, i) => (
            <span key={i} className="nb-clue-num" data-done={progress[y]?.[i] ? 1 : 0} style={{ fontSize: numFont }}>
              {n}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
})
