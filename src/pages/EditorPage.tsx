import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ColumnClues, RowClues } from '../components/ClueStrips'
import {
  IconBack,
  IconBucket,
  IconDownload,
  IconEraser,
  IconFlipH,
  IconFlipV,
  IconLine,
  IconPencil,
  IconPlay,
  IconRedo,
  IconRotate,
  IconShare,
  IconSquare,
  IconTrash,
  IconUndo,
  IconUpload,
  IconZoomIn,
  IconZoomOut,
} from '../components/icons'
import { Button, Card, Modal, Pill, Segmented } from '../components/ui'
import { computeClues } from '../core/clues'
import { analyzePuzzle } from '../core/difficulty'
import { buildShareUrl, encodePuzzleCode, puzzleFromCode, shortHash } from '../core/encoding'
import {
  DIFFICULTY_META,
  MAX_EDITOR_SIZE,
  MAX_PLAY_SIZE,
  MIN_EDITOR_SIZE,
  exceedsComfortablePlaySize,
  type Difficulty,
  type Puzzle,
} from '../core/types'
import { navigate } from '../router'
import {
  floodFillCells,
  lineCells,
  mirrorIndices,
  rectangleCells,
  useEditorStore,
  type EditorSymmetry,
  type EditorTool,
} from '../store/editorStore'
import { useGameStore } from '../store/gameStore'
import { useSettingsStore } from '../store/settingsStore'
import { playSound } from '../utils/sound'

/** 超过这个格子数就不做唯一性校验（求解器开销会明显变大） */
const UNIQUENESS_CELL_LIMIT = 30 * 30

/** 编辑器里线索不需要划线，传空数组即可（类型与 ClueStrips 的 progress 一致） */
const NO_PROGRESS: boolean[][] = []

const TOOLS: { tool: EditorTool; label: string; icon: JSX.Element }[] = [
  { tool: 'pencil', label: '铅笔', icon: <IconPencil size={16} /> },
  { tool: 'eraser', label: '橡皮', icon: <IconEraser size={16} /> },
  { tool: 'rect', label: '矩形', icon: <IconSquare size={16} /> },
  { tool: 'line', label: '直线', icon: <IconLine size={16} /> },
  { tool: 'bucket', label: '油漆桶', icon: <IconBucket size={16} /> },
]

const SYMMETRY_OPTIONS: { value: EditorSymmetry; label: string; hint: string }[] = [
  { value: 'none', label: '无', hint: '不使用对称绘制' },
  { value: 'vertical', label: '左右', hint: '左右镜像' },
  { value: 'horizontal', label: '上下', hint: '上下镜像' },
  { value: 'quad', label: '四向', hint: '上下左右同时镜像' },
]

/**
 * 把编辑器图案变成可开玩的谜题。
 *
 * 刻意绕一圈「编码 -> 解码」：这样得到的 id / seed 与 GamePage 解析分享链接时
 * 生成的完全一致，刷新页面或把链接发给别人都会是同一道题。
 */
function buildEditorPuzzle(grid: Uint8Array, width: number, height: number, difficulty: Difficulty): Puzzle {
  const solution = grid.slice()
  const { rowClues, colClues } = computeClues(solution, width, height)
  const raw: Puzzle = {
    id: `${difficulty}-${width}x${height}-custom`,
    width,
    height,
    solution,
    rowClues,
    colClues,
    difficulty,
    seed: `custom-${shortHash(solution)}`,
    source: 'editor',
  }
  const puzzle = puzzleFromCode(encodePuzzleCode(raw))
  if (!puzzle) return raw
  puzzle.title = `自定义 ${width}×${height}`
  // puzzleFromCode 只还原「尺寸 + 图案 + 难度」，这里把「自定义」的身份补回去：
  // seed 用图案指纹（同一图案永远同一个 key，成绩不会互相覆盖），
  // source 让游戏页知道它来自编辑器（不影响分享链接 —— 别人打开链接时仍按分享码还原）。
  puzzle.seed = raw.seed
  puzzle.source = 'editor'
  return puzzle
}

/** 把对称设置作用到一组格子上 */
function withSymmetry(indices: number[], width: number, height: number, symmetry: EditorSymmetry): number[] {
  if (symmetry === 'none') return indices
  const seen = new Set<number>()
  const out: number[] = []
  for (const index of indices) {
    const x = index % width
    const y = (index - x) / width
    for (const mirrored of mirrorIndices(width, height, x, y, symmetry)) {
      if (!seen.has(mirrored)) {
        seen.add(mirrored)
        out.push(mirrored)
      }
    }
  }
  return out
}

const EditorCell = ({
  index,
  value,
  registerRef,
}: {
  index: number
  value: number
  registerRef: (index: number, el: HTMLDivElement | null) => void
}): JSX.Element => (
  <div ref={(el) => registerRef(index, el)} className="nb-cell nb-edit-cell" data-state={value ? 'filled' : 'empty'} />
)

interface DragState {
  tool: EditorTool
  value: number
  base: Uint8Array
  pending: Map<number, number>
  preview: Set<number>
  last: number
  start: number
}

export function EditorPage({ params }: { params: URLSearchParams }): JSX.Element {
  const width = useEditorStore((s) => s.width)
  const height = useEditorStore((s) => s.height)
  const grid = useEditorStore((s) => s.grid)
  const tool = useEditorStore((s) => s.tool)
  const symmetry = useEditorStore((s) => s.symmetry)
  const zoom = useEditorStore((s) => s.zoom)
  const past = useEditorStore((s) => s.past)
  const future = useEditorStore((s) => s.future)
  const notice = useEditorStore((s) => s.notice)
  const setTool = useEditorStore((s) => s.setTool)
  const setSymmetry = useEditorStore((s) => s.setSymmetry)
  const setZoom = useEditorStore((s) => s.setZoom)
  const setSize = useEditorStore((s) => s.setSize)
  const applyCells = useEditorStore((s) => s.applyCells)
  const setNotice = useEditorStore((s) => s.setNotice)
  const clearAll = useEditorStore((s) => s.clearAll)
  const invert = useEditorStore((s) => s.invert)
  const flipHorizontal = useEditorStore((s) => s.flipHorizontal)
  const flipVertical = useEditorStore((s) => s.flipVertical)
  const rotateClockwise = useEditorStore((s) => s.rotateClockwise)
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)
  const importText = useEditorStore((s) => s.importText)
  const exportText = useEditorStore((s) => s.exportText)
  const loadGrid = useEditorStore((s) => s.loadGrid)

  const judgeMode = useSettingsStore((s) => s.judgeMode)
  const gridGuides = useSettingsStore((s) => s.gridGuides)
  const soundOn = useSettingsStore((s) => s.sound)
  const startPuzzle = useGameStore((s) => s.startPuzzle)

  const [sizeInput, setSizeInput] = useState({ w: String(width), h: String(height) })
  const [uploadText, setUploadText] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [confirmStart, setConfirmStart] = useState<{ puzzle: Puzzle; warnings: string[] } | null>(null)
  /** 剪贴板不可用时的兜底：把分享链接放进只读文本框让用户手动复制（与 GamePage 同一套） */
  const [shareText, setShareText] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<{
    unique: boolean | 'unknown'
    difficulty: Difficulty
    score: number
    timeMs: number
  } | null>(null)
  const [analysing, setAnalysing] = useState(false)
  const [skipped, setSkipped] = useState(false)

  const cellRefs = useRef<(HTMLDivElement | null)[]>([])
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const outerRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const dragRef = useRef<DragState | null>(null)

  const clues = useMemo(() => computeClues(grid, width, height), [grid, width, height])
  const filled = useMemo(() => {
    let count = 0
    for (let i = 0; i < grid.length; i++) if (grid[i]) count++
    return count
  }, [grid])

  useEffect(() => {
    setSizeInput({ w: String(width), h: String(height) })
  }, [width, height])

  // 从 ？s=分享码 载入图案（例如“在编辑器里打开这道题”）
  const loadedShareRef = useRef(false)
  useEffect(() => {
    const code = params.get('s')
    if (!code || loadedShareRef.current) return
    loadedShareRef.current = true
    const puzzle = puzzleFromCode(code)
    if (!puzzle) {
      setNotice('分享链接无法解析')
      return
    }
    loadGrid(puzzle.solution.slice(), puzzle.width, puzzle.height)
    setNotice(`已载入分享的 ${puzzle.width}×${puzzle.height} 图案`)
  }, [params, loadGrid, setNotice])

  // 实时唯一性 / 难度检查（防抖，避免每次拖动都跑求解器）
  const cellCount = width * height
  useEffect(() => {
    if (filled === 0 || cellCount > UNIQUENESS_CELL_LIMIT) {
      setAnalysis(null)
      setSkipped(filled > 0 && cellCount > UNIQUENESS_CELL_LIMIT)
      return
    }
    setAnalysing(true)
    let cancelled = false
    const timer = window.setTimeout(() => {
      const puzzle = buildEditorPuzzle(grid, width, height, 'medium')
      const result = analyzePuzzle(puzzle, {
        checkUniqueness: true,
        nodeLimit: 40_000,
        timeLimitMs: cellCount <= 400 ? 300 : 700,
      })
      if (cancelled) return
      setAnalysis({
        unique: result.unique,
        difficulty: result.difficulty,
        score: result.score,
        timeMs: result.metrics.timeMs,
      })
      setAnalysing(false)
      setSkipped(false)
    }, 320)
    return () => {
      cancelled = true
      setAnalysing(false)
      window.clearTimeout(timer)
    }
  }, [grid, width, height, filled, cellCount])

  // ---------------- 画布交互（拖拽期间直接改 DOM，结束时一次性提交） ----------------
  const numFont = Math.min(16, Math.max(8, Math.round(zoom * 0.6)))
  const clueLine = Math.min(22, Math.max(10, Math.round(zoom * 0.9)))
  const rowClueWeight = useMemo(() => {
    let max = 1
    for (const line of clues.rowClues) {
      let weight = 0
      for (const n of line) weight += String(n).length + 0.6
      if (weight > max) max = weight
    }
    return max
  }, [clues.rowClues])
  const maxColLines = useMemo(
    () => clues.colClues.reduce((acc, line) => Math.max(acc, line.length), 1),
    [clues.colClues],
  )
  const gutterX = Math.ceil(rowClueWeight * numFont * 0.6) + 8
  const gutterY = maxColLines * clueLine + 8

  const registerRef = useCallback((index: number, el: HTMLDivElement | null) => {
    cellRefs.current[index] = el
  }, [])

  const indexFromPoint = (clientX: number, clientY: number): number => {
    const node = wrapRef.current
    if (!node) return -1
    const rect = node.getBoundingClientRect()
    const x = Math.floor((clientX - rect.left) / zoom)
    const y = Math.floor((clientY - rect.top) / zoom)
    if (x < 0 || y < 0 || x >= width || y >= height) return -1
    return y * width + x
  }

  /** 直接把某一格的外观与待提交内容写好（不触发 React 渲染） */
  const stageCell = (drag: DragState, index: number, value: number): void => {
    if (index < 0 || index >= grid.length) return
    const el = cellRefs.current[index]
    if (el) el.dataset.state = value ? 'filled' : 'empty'
    if (value === drag.base[index]) drag.pending.delete(index)
    else drag.pending.set(index, value)
    drag.preview.add(index)
  }

  const clearPreview = (drag: DragState): void => {
    for (const index of drag.preview) {
      const el = cellRefs.current[index]
      if (el) el.dataset.state = drag.base[index] ? 'filled' : 'empty'
    }
    drag.preview.clear()
    drag.pending.clear()
  }

  const paintPath = (drag: DragState, from: number, to: number, oneShot: boolean): void => {
    const fromX = from % width
    const fromY = (from - fromX) / width
    const toX = to % width
    const toY = (to - toX) / width
    let cells: number[]
    if (oneShot) {
      cells =
        drag.tool === 'rect' ? rectangleCells(fromX, fromY, toX, toY, width) : lineCells(fromX, fromY, toX, toY, width)
      cells = withSymmetry(cells, width, height, symmetry)
    } else {
      cells = withSymmetry(lineCells(fromX, fromY, toX, toY, width), width, height, symmetry)
    }
    for (const index of cells) stageCell(drag, index, drag.value)
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (width * height === 0) return
    const index = indexFromPoint(event.clientX, event.clientY)
    if (index < 0) return
    event.preventDefault()

    // 右键视为橡皮
    const effectiveTool: EditorTool = event.button === 2 ? 'eraser' : tool
    const value = effectiveTool === 'eraser' ? 0 : 1

    if (effectiveTool === 'bucket') {
      const target = grid[index]
      const cells = withSymmetry(
        floodFillCells(grid, width, height, index % width, Math.floor(index / width), value),
        width,
        height,
        symmetry,
      )
      const changes: { index: number; value: number }[] = []
      for (const cell of cells) {
        const el = cellRefs.current[cell]
        if (el) el.dataset.state = value ? 'filled' : 'empty'
        changes.push({ index: cell, value })
      }
      applyCells(changes)
      setNotice(target === value ? '这一片已经是目标颜色' : '已用油漆桶填充连通区域')
      return
    }

    const drag: DragState = {
      tool: effectiveTool,
      value,
      base: grid.slice(),
      pending: new Map(),
      preview: new Set(),
      last: index,
      start: index,
    }
    dragRef.current = drag
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* 指针已释放时部分浏览器会抛错，忽略即可 */
    }
    if (effectiveTool === 'rect' || effectiveTool === 'line') {
      // 起点也走 paintPath：矩形 / 直线工具在「还没拖动」时同样遵守对称设置
      paintPath(drag, index, index, true)
    } else {
      paintPath(drag, index, index, false)
    }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const index = indexFromPoint(event.clientX, event.clientY)
    if (index < 0) return
    if (drag.tool === 'rect' || drag.tool === 'line') {
      clearPreview(drag)
      paintPath(drag, drag.start, index, true)
    } else {
      if (index === drag.last) return
      paintPath(drag, drag.last, index, false)
      drag.last = index
    }
  }

  const onPointerUp = () => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return
    if (drag.pending.size === 0) return
    const changes: { index: number; value: number }[] = []
    for (const [index, value] of drag.pending) changes.push({ index, value })
    // 一次性提交：push 撤销栈 + 触发一次 React 渲染
    applyCells(changes)
    if (soundOn) playSound(drag.value ? 'fill' : 'erase')
  }

  // 快捷键：撤销 / 重做
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      const meta = event.ctrlKey || event.metaKey
      if (meta && event.key.toLowerCase() === 'z') {
        if (event.shiftKey) redo()
        else undo()
        event.preventDefault()
      } else if (meta && event.key.toLowerCase() === 'y') {
        redo()
        event.preventDefault()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  const applySize = (nextW: number, nextH: number) => {
    const w = Math.round(nextW)
    const h = Math.round(nextH)
    if (
      !Number.isFinite(w) ||
      !Number.isFinite(h) ||
      w < MIN_EDITOR_SIZE ||
      h < MIN_EDITOR_SIZE ||
      w > MAX_EDITOR_SIZE ||
      h > MAX_EDITOR_SIZE
    ) {
      setNotice(`尺寸需在 ${MIN_EDITOR_SIZE}~${MAX_EDITOR_SIZE} 之间`)
      setSizeInput({ w: String(width), h: String(height) })
      return
    }
    setSize(w, h)
  }

  const fitZoom = () => {
    const node = outerRef.current
    if (!node) return
    const available = node.getBoundingClientRect().width - gutterX - 16
    const next = Math.floor(Math.min(available / width, (window.innerHeight - 260) / height))
    setZoom(Number.isFinite(next) && next > 0 ? Math.min(48, next) : zoom)
  }

  const doImport = (text: string) => {
    const result = importText(text)
    if (!result.ok) {
      setUploadError(result.error ?? '导入失败')
      return
    }
    setUploadError(null)
    if (result.warnings?.length) setNotice(result.warnings[0])
  }

  /** 开始游戏：先做一次最新的唯一性校验，必要时弹出警告 */
  const onStart = () => {
    if (filled === 0) {
      setNotice('画布还是空的，先画点内容吧')
      return
    }
    const warnings: string[] = []
    let difficulty: Difficulty = analysis?.difficulty ?? 'medium'
    if (cellCount <= UNIQUENESS_CELL_LIMIT) {
      const puzzle = buildEditorPuzzle(grid, width, height, difficulty)
      const result = analyzePuzzle(puzzle, {
        checkUniqueness: true,
        nodeLimit: 40_000,
        timeLimitMs: cellCount <= 400 ? 300 : 700,
      })
      difficulty = result.difficulty
      if (result.unique === false) {
        warnings.push('这个图案有多个解：逻辑推理会出现分叉，提示和判定可能都不太理想（仍然可以开局）。')
      } else if (result.unique === 'unknown') {
        warnings.push('求解器没能在预算内确认唯一性，这道题可能存在多解。')
      }
      if (result.metrics.truncated) warnings.push('本次分析达到了步数/时间上限，结论仅供参考。')
    } else {
      warnings.push(`画布 ${width}×${height} 较大，已跳过唯一性校验（求解器开销过高）。`)
    }
    if (exceedsComfortablePlaySize(width, height)) {
      warnings.push(`尺寸超过 ${MAX_PLAY_SIZE}×${MAX_PLAY_SIZE}：游戏页格子会很小，手机端可能需要横向滚动。`)
    }

    const puzzle = buildEditorPuzzle(grid, width, height, difficulty)
    if (warnings.length === 0) {
      launch(puzzle)
      return
    }
    setConfirmStart({ puzzle, warnings })
  }

  const launch = (puzzle: Puzzle) => {
    startPuzzle(puzzle, judgeMode)
    setConfirmStart(null)
    navigate(`/play?s=${encodePuzzleCode(puzzle)}`)
  }

  const onShare = async () => {
    if (filled === 0) {
      setNotice('画布是空的，没有可分享的图案')
      return
    }
    const puzzle = buildEditorPuzzle(grid, width, height, analysis?.difficulty ?? 'medium')
    const url = buildShareUrl(puzzle)
    try {
      await navigator.clipboard.writeText(url)
      setNotice('分享链接已复制（图案已编码进链接）')
    } catch {
      /*
       * 剪贴板不可用（http 非安全上下文、权限被拒、老浏览器）：
       * 链接有 400+ 字符，塞进自动消失的提示条里用户根本没法复制，
       * 所以改成「弹窗 + 只读文本框（聚焦即全选）」，与 GamePage 的分享弹窗保持一致。
       */
      setNotice('浏览器不允许自动复制，请在弹窗里手动复制')
      setShareText(url)
    }
  }

  const guideLinesX: number[] = []
  const guideLinesY: number[] = []
  if (gridGuides) {
    for (let x = 5; x < width; x += 5) guideLinesX.push(x)
    for (let y = 5; y < height; y += 5) guideLinesY.push(y)
  }

  const uniqueTone = analysis?.unique === true ? 'success' : analysis?.unique === false ? 'danger' : 'warn'
  const uniqueLabel =
    analysis === null
      ? filled === 0
        ? '画布为空'
        : skipped
          ? '未校验（尺寸较大）'
          : analysing
            ? '校验中…'
            : '待校验'
      : analysis.unique === true
        ? '唯一解'
        : analysis.unique === false
          ? '多解'
          : '未能确认'

  return (
    <div className="app-screen flex min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-1.5 border-b border-ink-200/70 px-2 py-2 dark:border-ink-800 sm:gap-2 sm:px-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/')} aria-label="返回首页">
          <IconBack />
          <span className="hidden sm:inline">首页</span>
        </Button>
        <h1 className="text-sm font-semibold text-ink-900 dark:text-white">自定义数织</h1>
        <Pill>
          {width}×{height}
        </Pill>
        <Pill tone={uniqueTone}>{uniqueLabel}</Pill>
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="secondary" size="sm" onClick={() => textareaRef.current?.focus()}>
            <IconUpload />
            <span className="hidden sm:inline">导入文本</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={onShare}>
            <IconShare />
            <span className="hidden sm:inline">分享链接</span>
          </Button>
          <Button variant="primary" size="sm" onClick={onStart} disabled={filled === 0}>
            <IconPlay />
            开始游戏
          </Button>
        </div>
      </header>

      {/*
        窄屏（手机 / 竖屏）时整个编辑器可以纵向滚动，否则工具栏会把画布挤出可视区域；
        宽屏时改成左右两栏、各自滚动。
      */}
      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-2 sm:p-3 lg:flex-row lg:overflow-hidden">
        {/* 左侧：工具栏 */}
        <div className="flex shrink-0 flex-col gap-2 lg:w-64 lg:overflow-y-auto">
          <Card className="space-y-2 p-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">工具</h2>
            <div className="flex flex-wrap gap-1.5">
              {TOOLS.map((item) => (
                <Button
                  key={item.tool}
                  size="sm"
                  variant={tool === item.tool ? 'primary' : 'secondary'}
                  onClick={() => setTool(item.tool)}
                >
                  {item.icon}
                  {item.label}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" onClick={undo} disabled={past.length === 0} title="撤销 (Ctrl+Z)">
                <IconUndo size={16} />
              </Button>
              <Button size="sm" onClick={redo} disabled={future.length === 0} title="重做 (Ctrl+Shift+Z)">
                <IconRedo size={16} />
              </Button>
              <Button size="sm" onClick={flipHorizontal} title="水平翻转">
                <IconFlipH size={16} />
              </Button>
              <Button size="sm" onClick={flipVertical} title="垂直翻转">
                <IconFlipV size={16} />
              </Button>
              <Button size="sm" onClick={rotateClockwise} title="顺时针旋转 90°">
                <IconRotate size={16} />
              </Button>
              <Button size="sm" onClick={invert} title="反色">
                反色
              </Button>
              <Button size="sm" variant="danger" onClick={clearAll} title="清空画布">
                <IconTrash size={16} />
              </Button>
            </div>
            <div className="space-y-1">
              <span className="text-[11px] text-ink-500 dark:text-ink-400">对称绘制</span>
              <Segmented value={symmetry} options={SYMMETRY_OPTIONS} onChange={setSymmetry} />
            </div>
          </Card>

          <Card className="space-y-2 p-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">画布</h2>
            <div className="flex items-end gap-2">
              <label className="flex-1">
                <span className="block text-[11px] text-ink-500 dark:text-ink-400">
                  宽 ({MIN_EDITOR_SIZE}-{MAX_EDITOR_SIZE})
                </span>
                <input
                  type="number"
                  min={MIN_EDITOR_SIZE}
                  max={MAX_EDITOR_SIZE}
                  value={sizeInput.w}
                  onChange={(event) => setSizeInput((prev) => ({ ...prev, w: event.target.value }))}
                  onBlur={() => applySize(Number(sizeInput.w), height)}
                  className="w-full rounded-lg border border-ink-200 bg-white px-2 py-1 text-sm dark:border-ink-700 dark:bg-ink-800"
                />
              </label>
              <label className="flex-1">
                <span className="block text-[11px] text-ink-500 dark:text-ink-400">高</span>
                <input
                  type="number"
                  min={MIN_EDITOR_SIZE}
                  max={MAX_EDITOR_SIZE}
                  value={sizeInput.h}
                  onChange={(event) => setSizeInput((prev) => ({ ...prev, h: event.target.value }))}
                  onBlur={() => applySize(Number(sizeInput.w), Number(sizeInput.h))}
                  className="w-full rounded-lg border border-ink-200 bg-white px-2 py-1 text-sm dark:border-ink-700 dark:bg-ink-800"
                />
              </label>
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" onClick={() => setZoom(zoom - 4)} title="缩小">
                <IconZoomOut size={16} />
              </Button>
              <span className="text-[11px] text-ink-500 dark:text-ink-400">{zoom}px</span>
              <Button size="sm" onClick={() => setZoom(zoom + 4)} title="放大">
                <IconZoomIn size={16} />
              </Button>
              <Button size="sm" onClick={fitZoom} title="缩放到适合窗口">
                适应
              </Button>
            </div>
            <p className="text-[11px] leading-snug text-ink-400">
              拖拽连续绘制；矩形/直线会实时预览；右键当作橡皮。改尺寸会保留左上角重叠区域。
            </p>
          </Card>

          <Card className="space-y-2 p-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">求解器检查</h2>
            {filled === 0 ? (
              <p className="text-[11px] text-ink-500 dark:text-ink-400">画布为空。画好图案后这里会实时检查唯一解。</p>
            ) : skipped ? (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                画布超过 {UNIQUENESS_CELL_LIMIT} 格，已跳过唯一性校验（不影响开局）。
              </p>
            ) : analysis ? (
              <div className="space-y-1 text-[11px] text-ink-500 dark:text-ink-400">
                <p>
                  唯一性：<span className="font-medium text-ink-700 dark:text-ink-200">{uniqueLabel}</span>
                </p>
                <p>
                  难度评估：
                  <span className="font-medium text-ink-700 dark:text-ink-200">
                    {DIFFICULTY_META[analysis.difficulty].label}
                  </span>
                  （{analysis.score} 分）
                </p>
                <p>
                  填充率：{Math.round((filled / cellCount) * 100)}% · 求解耗时 {analysis.timeMs.toFixed(0)}ms
                </p>
                {analysis.unique === false ? (
                  <p className="text-rose-600 dark:text-rose-400">存在多个解，开局后可能出现逻辑分叉。</p>
                ) : null}
              </div>
            ) : (
              <p className="text-[11px] text-ink-500 dark:text-ink-400">{analysing ? '正在检查…' : '等待检查'}</p>
            )}
          </Card>

          <Card className="space-y-2 p-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">
              文本导入 / 导出
            </h2>
            <textarea
              ref={textareaRef}
              value={uploadText}
              onChange={(event) => setUploadText(event.target.value)}
              rows={6}
              spellCheck={false}
              placeholder={'#.#\n.#.\n#.#'}
              className="w-full resize-y rounded-xl border border-ink-200 bg-ink-50 p-2 font-mono text-[11px] dark:border-ink-700 dark:bg-ink-800"
            />
            {uploadError ? <p className="text-[11px] text-rose-600 dark:text-rose-400">{uploadError}</p> : null}
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" onClick={() => doImport(uploadText)}>
                <IconUpload size={15} />
                导入
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setUploadText(exportText())
                  setUploadError(null)
                }}
              >
                <IconDownload size={15} />
                导出当前
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(uploadText)
                    setNotice('文本已复制')
                  } catch {
                    setNotice('复制失败，请手动选择文本')
                  }
                }}
              >
                复制文本
              </Button>
            </div>
            <p className="text-[11px] leading-snug text-ink-400">支持 # / . / 1 / 0 / █ / ·，也支持空格或逗号分隔。</p>
          </Card>
        </div>

        {/* 右侧：画布 + 实时线索 */}
        <div
          ref={outerRef}
          className="nb-scroll flex min-h-[320px] flex-1 flex-col items-center justify-start overflow-auto lg:min-h-0"
        >
          <div
            className="nb-frame"
            style={
              {
                display: 'grid',
                gridTemplateColumns: `${gutterX}px auto`,
                gridTemplateRows: `${gutterY}px auto`,
                '--nb-cell-size': `${zoom}px`,
                margin: 'auto',
              } as React.CSSProperties
            }
          >
            <div />
            <ColumnClues
              clues={clues.colClues}
              cell={zoom}
              numFont={numFont}
              clueLine={clueLine}
              progress={NO_PROGRESS}
              active={-1}
            />
            <RowClues clues={clues.rowClues} cell={zoom} numFont={numFont} progress={NO_PROGRESS} active={-1} />

            <div
              ref={wrapRef}
              className="relative touch-none select-none"
              style={{ width: zoom * width, height: zoom * height }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onContextMenu={(event) => event.preventDefault()}
            >
              <div
                className="nb-board"
                style={{
                  gridTemplateColumns: `repeat(${width}, ${zoom}px)`,
                  gridTemplateRows: `repeat(${height}, ${zoom}px)`,
                }}
              >
                {Array.from({ length: width * height }, (_, index) => (
                  <EditorCell key={index} index={index} value={grid[index]} registerRef={registerRef} />
                ))}
              </div>
              {guideLinesX.map((x) => (
                <div
                  key={`gx-${x}`}
                  className="pointer-events-none absolute top-0"
                  style={{
                    left: x * zoom - 1,
                    width: 2,
                    height: zoom * height,
                    backgroundColor: 'var(--nb-grid-strong)',
                  }}
                />
              ))}
              {guideLinesY.map((y) => (
                <div
                  key={`gy-${y}`}
                  className="pointer-events-none absolute left-0"
                  style={{
                    top: y * zoom - 1,
                    height: 2,
                    width: zoom * width,
                    backgroundColor: 'var(--nb-grid-strong)',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </main>

      {notice ? (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 max-w-[92vw] -translate-x-1/2 animate-fadeIn rounded-xl bg-ink-900/90 px-3 py-1.5 text-xs text-white shadow-lg dark:bg-ink-100/95 dark:text-ink-900">
          {notice}
        </div>
      ) : null}

      <Modal
        open={confirmStart !== null}
        title="开始游戏前请注意"
        onClose={() => setConfirmStart(null)}
        footer={
          <>
            <Button onClick={() => setConfirmStart(null)}>返回修改</Button>
            <Button variant="primary" onClick={() => confirmStart && launch(confirmStart.puzzle)}>
              仍然开始
            </Button>
          </>
        }
      >
        <ul className="list-disc space-y-1 pl-5">
          {confirmStart?.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </Modal>

      {/* 剪贴板不可用时的兜底：只读文本框，聚焦即全选，手动复制即可（与 GamePage 一致） */}
      <Modal
        open={shareText !== null}
        title="分享链接"
        onClose={() => setShareText(null)}
        footer={
          <Button variant="primary" onClick={() => setShareText(null)}>
            好
          </Button>
        }
      >
        <p className="text-xs text-ink-500 dark:text-ink-400">
          浏览器不允许自动写入剪贴板，请点进下面的文本框（会自动全选）后按 Ctrl+C 复制。
        </p>
        <textarea
          readOnly
          value={shareText ?? ''}
          rows={3}
          onFocus={(event) => event.currentTarget.select()}
          className="w-full resize-none rounded-xl border border-ink-200 bg-ink-50 p-2 font-mono text-[11px] text-ink-700 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-200"
        />
      </Modal>
    </div>
  )
}
