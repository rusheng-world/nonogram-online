import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { CELL_TO_STATE, EMPTY, FILLED, UNKNOWN, cellToState } from '../core/types'
import { computeLineDone } from '../core/progress'
import { useGameStore } from '../store/gameStore'
import { useSettingsStore, type PaintMode } from '../store/settingsStore'
import { MIN_CELL, clueLineOf, clueWeightOf, maxClueLines, useBoardMetrics } from '../hooks/useBoardMetrics'
import { ColumnClues, RowClues } from './ClueStrips'
import { playSound } from '../utils/sound'

const LONG_PRESS_MS = 450

/** 与 index.css 里 .nb-frame 的 padding 保持一致（棋盘外框内边距） */
const FRAME_PADDING = 6

interface CellProps {
  index: number
  /** 1 基行号 / 列号（accessibility 用，直接算好传进来避免在 memo 组件里重复计算） */
  row: number
  col: number
  state: number
  wrong: number
  guideX: boolean
  guideY: boolean
  registerRef: (index: number, el: HTMLDivElement | null) => void
}

/** 单元格状态的读屏文案。不依赖颜色，符合「不只靠颜色表达状态」的要求。 */
function stateText(state: number): string {
  if (state === FILLED) return '已填充'
  if (state === EMPTY) return '已标记为空'
  if (state === UNKNOWN) return '空'
  return '空'
}

/**
 * 单元格。
 * React.memo + 只传原始值：拖拽绘制时父组件不重渲染，单元格也几乎不会重渲染
 * （拖拽期间的可视反馈由 DOM 直接写入 dataset，见 paintCell）。
 *
 * 无障碍：每个格子是 gridcell 并带「第 X 行，第 Y 列，状态」的 aria-label。
 */
const Cell = memo(function Cell({ index, row, col, state, wrong, guideX, guideY, registerRef }: CellProps) {
  return (
    <div
      ref={(el) => registerRef(index, el)}
      role="gridcell"
      aria-rowindex={row}
      aria-colindex={col}
      aria-label={`第 ${row} 行，第 ${col} 列，${stateText(state)}`}
      className="nb-cell"
      data-state={cellToState(state)}
      data-wrong={wrong}
      data-gx={guideX ? 1 : 0}
      data-gy={guideY ? 1 : 0}
    />
  )
})

interface StrokeState {
  action: 'fill' | 'mark'
  painted: Set<number>
  pending: Map<number, number>
  original: Map<number, { state: number; wrong: number }>
}

export function GameBoard() {
  const puzzle = useGameStore((s) => s.puzzle)
  const board = useGameStore((s) => s.board)
  const wrong = useGameStore((s) => s.wrong)
  const judgeMode = useGameStore((s) => s.judgeMode)
  const paused = useGameStore((s) => s.paused)
  const completed = useGameStore((s) => s.completed)
  const cursor = useGameStore((s) => s.cursor)
  const hoverRow = useGameStore((s) => s.hoverRow)
  const hoverCol = useGameStore((s) => s.hoverCol)
  const setHover = useGameStore((s) => s.setHover)
  const applyStroke = useGameStore((s) => s.applyStroke)
  const gridGuides = useSettingsStore((s) => s.gridGuides)
  const strikeClues = useSettingsStore((s) => s.strikeClues)
  const soundOn = useSettingsStore((s) => s.sound)
  const paintMode = useSettingsStore((s) => s.paintMode)

  const width = puzzle?.width ?? 1
  const height = puzzle?.height ?? 1
  const rowClueWeight = useMemo(() => (puzzle ? clueWeightOf(puzzle.rowClues) : 1), [puzzle])
  const colClueLines = useMemo(() => (puzzle ? maxClueLines(puzzle.colClues) : 1), [puzzle])

  const { containerRef, metrics } = useBoardMetrics({ width, height, rowClueWeight, colClueLines })
  const { cell, gutterX, gutterY, numFont, clueLine } = metrics

  /*
   * 棋盘区的「最小高度下限」。
   * 取「格子按最小尺寸 11px 渲染时整块棋盘需要的高度」：行数 × 11 + 列线索区高度 + 外框内边距。
   * 父容器（GamePage 的 <main>）空间比它更小时，棋盘不再继续被压缩，
   * 而是让 <main> 产生滚动条 —— 这样在小屏 / 横屏手机上棋盘不会被裁掉、底部状态栏也能滑出来。
   */
  const minBoardHeight = Math.round(height * MIN_CELL + colClueLines * clueLineOf(MIN_CELL) + FRAME_PADDING * 2 + 8)

  const cellRefs = useRef<(HTMLDivElement | null)[]>([])
  const strokeRef = useRef<StrokeState | null>(null)
  const longPressRef = useRef<number | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const rowBandRef = useRef<HTMLDivElement>(null)
  const colBandRef = useRef<HTMLDivElement>(null)
  // 在 render 期间写 ref 会踩到 React 的并发渲染；改到提交之后再同步，供指针事件读取。
  const cellSizeRef = useRef(cell)
  useEffect(() => {
    cellSizeRef.current = cell
  }, [cell])

  const registerRef = useCallback((index: number, el: HTMLDivElement | null) => {
    cellRefs.current[index] = el
  }, [])

  /*
   * 线索自动划线：算出每条线索对应的方块是否已经**按正确位置**涂好。
   * 行方向步长 1、起点 y*width；列方向步长 width、起点 x。
   * 判定完全以「解」为准，所以涂错的地方绝不会被划掉；详见 core/progress.ts。
   * 关掉设置里的「线索自动划线」时直接不计算，省掉每步的开销。
   */
  const rowProgress = useMemo(() => {
    if (!puzzle || !strikeClues) return []
    return puzzle.rowClues.map((clue, y) =>
      computeLineDone(clue, board, puzzle.solution, puzzle.width, 1, y * puzzle.width),
    )
  }, [puzzle, board, strikeClues])

  const colProgress = useMemo(() => {
    if (!puzzle || !strikeClues) return []
    return puzzle.colClues.map((clue, x) =>
      computeLineDone(clue, board, puzzle.solution, puzzle.height, puzzle.width, x),
    )
  }, [puzzle, board, strikeClues])

  // ---------------- 指针交互 ----------------
  const clearLongPress = () => {
    if (longPressRef.current !== null) {
      window.clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
  }

  const indexFromEvent = (clientX: number, clientY: number): number => {
    const node = wrapRef.current
    if (!node) return -1
    const rect = node.getBoundingClientRect()
    const size = cellSizeRef.current
    const x = Math.floor((clientX - rect.left) / size)
    const y = Math.floor((clientY - rect.top) / size)
    if (x < 0 || y < 0 || x >= width || y >= height) return -1
    return y * width + x
  }

  /** 立即写入 DOM 的视觉反馈（严格/极限模式下涂错立刻标红） */
  const paintInstantFeedback = (el: HTMLDivElement, index: number, value: number) => {
    if (judgeMode === 'lenient') {
      el.dataset.wrong = '0'
      delete el.dataset.corrected
      return
    }
    const state = useGameStore.getState()
    const solution = state.puzzle?.solution
    if (!solution) return
    const shouldFill = solution[index] === 1
    if (value === UNKNOWN) {
      el.dataset.wrong = state.wrong[index] === 2 ? '2' : '0'
      delete el.dataset.corrected
      return
    }
    const mistaken = (value === FILLED) !== shouldFill
    if (mistaken) {
      el.dataset.wrong = judgeMode === 'extreme' ? '2' : '1'
      delete el.dataset.corrected
    } else {
      const permanent = state.wrong[index] === 2
      el.dataset.wrong = permanent ? '2' : '0'
      if (permanent) el.dataset.corrected = '1'
    }
  }

  const paintCell = (index: number) => {
    const stroke = strokeRef.current
    if (!stroke) return
    const storeBoard = useGameStore.getState().board
    const current = stroke.pending.has(index) ? (stroke.pending.get(index) as number) : storeBoard[index]
    const target: number =
      stroke.action === 'fill' ? (current === FILLED ? UNKNOWN : FILLED) : current === EMPTY ? UNKNOWN : EMPTY
    if (!stroke.painted.has(index)) {
      stroke.original.set(index, {
        state: storeBoard[index],
        wrong: useGameStore.getState().wrong[index],
      })
      stroke.painted.add(index)
    }
    stroke.pending.set(index, target)
    const el = cellRefs.current[index]
    if (el) {
      el.dataset.state = CELL_TO_STATE[target]
      paintInstantFeedback(el, index, target)
    }
  }

  const revertStroke = () => {
    const stroke = strokeRef.current
    if (!stroke) return
    for (const [index, original] of stroke.original) {
      const el = cellRefs.current[index]
      if (!el) continue
      el.dataset.state = CELL_TO_STATE[original.state]
      el.dataset.wrong = String(original.wrong)
      delete el.dataset.corrected
    }
  }

  const commitStroke = () => {
    const stroke = strokeRef.current
    strokeRef.current = null
    if (!stroke || stroke.pending.size === 0) return
    const changes = Array.from(stroke.pending.entries()).map(([index, value]) => ({ index, value }))
    const outcome = applyStroke(changes)
    if (soundOn) {
      if (outcome.completed) playSound('win')
      else if (outcome.wrongAdded > 0) playSound('error')
      else if (changes.some((c) => c.value === FILLED)) playSound('fill')
      else if (changes.some((c) => c.value === EMPTY)) playSound('mark')
      else playSound('erase')
    }
  }

  const leftAction = (mode: PaintMode): 'fill' | 'mark' => (mode === 'fill' ? 'fill' : 'mark')

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (paused || completed) return
    const index = indexFromEvent(event.clientX, event.clientY)
    if (index < 0) return
    event.preventDefault()
    const primary = event.button !== 2
    const action: 'fill' | 'mark' = primary ? leftAction(paintMode) : leftAction(paintMode) === 'fill' ? 'mark' : 'fill'
    strokeRef.current = { action, painted: new Set(), pending: new Map(), original: new Map() }
    paintCell(index)
    useGameStore.getState().setCursor(index)
    // 个别浏览器在指针已经释放时会抛错，捕获即可（不影响绘制）
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* ignore */
    }

    // 触摸：长按切换到另一种笔（填充 <-> X 标记）
    if (event.pointerType === 'touch') {
      clearLongPress()
      longPressRef.current = window.setTimeout(() => {
        longPressRef.current = null
        const stroke = strokeRef.current
        if (!stroke) return
        revertStroke()
        strokeRef.current = {
          action: stroke.action === 'fill' ? 'mark' : 'fill',
          painted: new Set(),
          pending: new Map(),
          original: new Map(),
        }
        paintCell(index)
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate(12)
          } catch {
            /* 某些浏览器不支持 */
          }
        }
      }, LONG_PRESS_MS)
    }
  }

  const updateHover = (event: React.PointerEvent<HTMLDivElement>) => {
    const index = indexFromEvent(event.clientX, event.clientY)
    if (index < 0) {
      setHover(-1, -1)
      if (rowBandRef.current) rowBandRef.current.style.opacity = '0'
      if (colBandRef.current) colBandRef.current.style.opacity = '0'
      return
    }
    const x = index % width
    const y = Math.floor(index / width)
    setHover(y, x)
    const size = cellSizeRef.current
    if (rowBandRef.current) {
      rowBandRef.current.style.opacity = '1'
      rowBandRef.current.style.transform = `translateY(${y * size}px)`
    }
    if (colBandRef.current) {
      colBandRef.current.style.opacity = '1'
      colBandRef.current.style.transform = `translateX(${x * size}px)`
    }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    updateHover(event)
    if (!strokeRef.current) return
    if (longPressRef.current !== null) clearLongPress()
    const index = indexFromEvent(event.clientX, event.clientY)
    if (index < 0 || strokeRef.current.painted.has(index)) return
    paintCell(index)
  }

  const onPointerUp = () => {
    clearLongPress()
    commitStroke()
  }

  const onPointerLeave = () => {
    if (!strokeRef.current) {
      setHover(-1, -1)
      if (rowBandRef.current) rowBandRef.current.style.opacity = '0'
      if (colBandRef.current) colBandRef.current.style.opacity = '0'
    }
  }

  if (!puzzle) return null

  const cursorX = cursor % width
  const cursorY = Math.floor(cursor / width)
  const guideLinesX: number[] = []
  const guideLinesY: number[] = []
  if (gridGuides) {
    for (let x = 5; x < width; x += 5) guideLinesX.push(x)
    for (let y = 5; y < height; y += 5) guideLinesY.push(y)
  }

  return (
    <div
      ref={containerRef}
      className="flex min-h-0 flex-1 items-center justify-center overflow-hidden"
      style={{ minHeight: minBoardHeight }}
    >
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
          clues={puzzle.colClues}
          cell={cell}
          numFont={numFont}
          clueLine={clueLine}
          progress={colProgress}
          active={hoverCol}
        />
        <RowClues clues={puzzle.rowClues} cell={cell} numFont={numFont} progress={rowProgress} active={hoverRow} />

        <div
          ref={wrapRef}
          // 无障碍：整体是一个 grid，焦点可达（键盘快捷键本身挂在 window 上）
          role="grid"
          aria-label={`数织棋盘，${height} 行 ${width} 列`}
          aria-rowcount={height}
          aria-colcount={width}
          aria-readonly
          tabIndex={0}
          className="relative touch-none select-none rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          style={{ width: cell * width, height: cell * height }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerLeave}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div
            className="nb-board"
            style={{
              gridTemplateColumns: `repeat(${width}, ${cell}px)`,
              gridTemplateRows: `repeat(${height}, ${cell}px)`,
            }}
          >
            {Array.from({ length: width * height }, (_, index) => (
              <Cell
                key={index}
                index={index}
                row={Math.floor(index / width) + 1}
                col={(index % width) + 1}
                state={board[index]}
                wrong={wrong[index]}
                guideX={(index % width) % 5 === 0}
                guideY={Math.floor(index / width) % 5 === 0}
                registerRef={registerRef}
              />
            ))}
          </div>

          {/* 高亮当前行 / 列 */}
          <div
            ref={rowBandRef}
            className="pointer-events-none absolute left-0 opacity-0"
            style={{
              top: 0,
              height: cell,
              width: cell * width,
              backgroundColor: 'var(--nb-hover-band)',
              transition: 'opacity .1s',
            }}
          />
          <div
            ref={colBandRef}
            className="pointer-events-none absolute top-0 opacity-0"
            style={{
              left: 0,
              width: cell,
              height: cell * height,
              backgroundColor: 'var(--nb-hover-band)',
              transition: 'opacity .1s',
            }}
          />

          {/* 每 5 格的辅助线 */}
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

          {/* 键盘光标 */}
          {!completed && !paused ? (
            <div
              className="nb-cursor-ring"
              style={{ left: cursorX * cell, top: cursorY * cell, width: cell, height: cell }}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
