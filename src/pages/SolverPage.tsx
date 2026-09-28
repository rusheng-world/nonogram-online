import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SolverGrid, type CellHighlightKind } from '../components/SolverGrid'
import { SolverStepPlayer } from '../components/SolverStepPlayer'
import { IconBack, IconBulb, IconPlay, IconTrash } from '../components/icons'
import { Button, Card, Pill, Segmented, Stat } from '../components/ui'
import { downloadBoardPng } from '../core/boardImage'
import { computeClues } from '../core/clues'
import { assessPuzzle, sizeFloorFor } from '../core/difficulty'
import { encodePuzzleCode, shortHash } from '../core/encoding'
import { DEFAULT_SOLVE_TIME_LIMIT_MS, type SolveResult, type SolveStatus } from '../core/solver'
import { runSolve, solverRuntimeAvailable, type SolverHandle } from '../core/solverClient'
import {
  clearSolverHistory,
  loadSolverHistory,
  pushSolverHistory,
  describeHistoryEntry,
  type SolverHistoryEntry,
} from '../core/solverHistory'
import {
  MAX_SOLVER_SIZE,
  MIN_SOLVER_SIZE,
  SOLVER_SAMPLE,
  SOLVER_SIZE_HINT,
  emptyClues,
  formatClueInput,
  parseBulkClues,
  parseClueLine,
  parseClueLines,
  validateSolverInput,
} from '../core/solverInput'
import type { Puzzle } from '../core/types'
import { navigate } from '../router'
import { useGameStore } from '../store/gameStore'
import { useSettingsStore } from '../store/settingsStore'

/** 求解超时上限（需求 9.8：默认 10 秒，这里直接暴露给用户选择） */
const TIME_LIMITS = [5_000, 10_000, 20_000]

const STATUS_META: Record<
  SolveStatus,
  { label: string; tone: 'success' | 'warn' | 'danger' | 'default'; bar: string }
> = {
  unique: {
    label: '唯一解',
    tone: 'success',
    bar: 'bg-emerald-500/10 text-emerald-800 ring-emerald-500/30 dark:text-emerald-200',
  },
  multiple: {
    label: '存在多个解',
    tone: 'warn',
    bar: 'bg-amber-500/10 text-amber-800 ring-amber-500/30 dark:text-amber-200',
  },
  none: { label: '无解', tone: 'danger', bar: 'bg-rose-500/10 text-rose-800 ring-rose-500/30 dark:text-rose-200' },
  timeout: {
    label: '计算超时',
    tone: 'warn',
    bar: 'bg-orange-500/10 text-orange-800 ring-orange-500/30 dark:text-orange-200',
  },
  unknown: {
    label: '未能确认唯一性',
    tone: 'default',
    bar: 'bg-ink-500/10 text-ink-700 ring-ink-500/20 dark:text-ink-200',
  },
}

/** 用户点了「取消」时的状态条（不是超时，也不是算不出来） */
const CANCELLED_META = {
  label: '已取消',
  tone: 'default' as const,
  bar: 'bg-ink-500/10 text-ink-700 ring-ink-500/20 dark:text-ink-200',
}

function clampSize(value: number): number {
  if (!Number.isFinite(value)) return MIN_SOLVER_SIZE
  return Math.min(MAX_SOLVER_SIZE, Math.max(MIN_SOLVER_SIZE, Math.round(value)))
}

/** 调整字符串数组长度（改尺寸时保留已填内容） */
function resizeStrings(list: string[], count: number): string[] {
  const next: string[] = []
  for (let i = 0; i < count; i++) next.push(list[i] ?? '')
  return next
}

function cluesToText(clues: number[][]): string {
  return clues.map((line) => formatClueInput(line)).join('\n')
}

/** 两个解的差异格 */
function diffIndexes(a: Uint8Array, b: Uint8Array): number[] {
  const list: number[] = []
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) list.push(i)
  return list
}

/**
 * 历史条目的 React key。
 * 只用 `at` 是不够的：同一毫秒内连点两次求解（不同题目）会撞 key，
 * 所以把尺寸与线索内容一起编进去。
 */
function historyKey(entry: SolverHistoryEntry): string {
  const rows = entry.rowClues.map((line) => line.join('.')).join('_')
  const cols = entry.colClues.map((line) => line.join('.')).join('_')
  return `${entry.at}-${entry.width}x${entry.height}-${rows}|${cols}`
}

export function SolverPage(): JSX.Element {
  const judgeMode = useSettingsStore((s) => s.judgeMode)
  const startPuzzle = useGameStore((s) => s.startPuzzle)

  // ---------------- 输入状态 ----------------
  const [width, setWidth] = useState(SOLVER_SAMPLE.width)
  const [height, setHeight] = useState(SOLVER_SAMPLE.height)
  const [mode, setMode] = useState<'form' | 'text'>('form')
  const [rowInputs, setRowInputs] = useState<string[]>(() =>
    SOLVER_SAMPLE.rowClues.map((line) => formatClueInput(line)),
  )
  const [colInputs, setColInputs] = useState<string[]>(() =>
    SOLVER_SAMPLE.colClues.map((line) => formatClueInput(line)),
  )
  const [bulkRows, setBulkRows] = useState(() => cluesToText(SOLVER_SAMPLE.rowClues))
  const [bulkCols, setBulkCols] = useState(() => cluesToText(SOLVER_SAMPLE.colClues))
  const [bulkNotice, setBulkNotice] = useState<string | null>(null)
  const [timeLimitMs, setTimeLimitMs] = useState(DEFAULT_SOLVE_TIME_LIMIT_MS)

  // ---------------- 求解状态 ----------------
  const [running, setRunning] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [result, setResult] = useState<SolveResult | null>(null)
  /** 求解器本身抛异常时的提示（正常情况下永远不会出现，见 L-07） */
  const [solveError, setSolveError] = useState<string | null>(null)
  const [showSteps, setShowSteps] = useState(false)
  // 惰性初始化直接读一次历史（此前放在 effect 里 setState，会多走一轮渲染；
  // 读的是同一份 localStorage，行为不变）
  const [history, setHistory] = useState<SolverHistoryEntry[]>(() => loadSolverHistory())
  const handleRef = useRef<SolverHandle | null>(null)
  const startedAtRef = useRef(0)

  // ---------------- 解析 + 校验 ----------------
  const formRows = useMemo(() => rowInputs.map(parseClueLine), [rowInputs])
  const formCols = useMemo(() => colInputs.map(parseClueLine), [colInputs])
  const textRows = useMemo(() => parseClueLines(bulkRows), [bulkRows])
  const textCols = useMemo(() => parseClueLines(bulkCols), [bulkCols])

  // 包一层 useMemo：这两个数组会进 validateSolverInput 的依赖，直接现算会让校验每帧都重算
  const rowClues = useMemo(
    () => (mode === 'form' ? formRows.map((item) => item.clues) : (textRows.clues ?? [])),
    [mode, formRows, textRows],
  )
  const colClues = useMemo(
    () => (mode === 'form' ? formCols.map((item) => item.clues) : (textCols.clues ?? [])),
    [mode, formCols, textCols],
  )
  const parseError =
    mode === 'form'
      ? (formRows.find((item) => item.error)?.error ?? formCols.find((item) => item.error)?.error ?? null)
      : (textRows.error ?? textCols.error)

  const validation = useMemo(
    () => validateSolverInput({ width, height, rowClues, colClues }),
    [width, height, rowClues, colClues],
  )

  const canSolve = !parseError && validation.ok && !running
  const requestKey = `${width}x${height}|${rowClues.map((l) => l.join(',')).join('/')}|${colClues.map((l) => l.join(',')).join('/')}`

  // 需求 9.8：尺寸 / 线索被改动后，自动取消正在跑的任务
  const cancel = useCallback(() => {
    handleRef.current?.cancel()
    handleRef.current = null
    setRunning(false)
  }, [])

  // 卸载时取消正在跑的求解（L-06）：Worker 环境直接 terminate；
  // 非 Worker 环境至少保证结果不再回填到已经卸载的组件上。
  useEffect(() => {
    return () => {
      handleRef.current?.cancel()
      handleRef.current = null
    }
  }, [])

  /**
   * 用户主动点「取消」。
   * 与上面的静默 cancel() 不同：这里**保留** handle，让 promise 回填成
   * 「已取消」的结果，界面才能给出明确反馈（此前直接清空 handle，回填被跳过，
   * 于是取消后什么都不显示）。
   */
  const onCancelClick = () => {
    handleRef.current?.cancel()
  }

  useEffect(() => {
    cancel()
    setResult(null)
    setSolveError(null)
    setShowSteps(false)
    // 只在输入指纹变化时重置；cancel 是稳定引用
  }, [requestKey, cancel])

  // 已耗时（只在运行时刷新，避免无谓渲染）
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setElapsedMs(performance.now() - startedAtRef.current), 100)
    return () => window.clearInterval(id)
  }, [running])

  // ---------------- 操作 ----------------
  const applySize = (nextWidth: number, nextHeight: number) => {
    const w = clampSize(nextWidth)
    const h = clampSize(nextHeight)
    setWidth(w)
    setHeight(h)
    setRowInputs((prev) => resizeStrings(prev, h))
    setColInputs((prev) => resizeStrings(prev, w))
  }

  const onSolve = () => {
    if (!canSolve) return
    setResult(null)
    setSolveError(null)
    setShowSteps(false)
    setElapsedMs(0)
    startedAtRef.current = performance.now()
    setRunning(true)
    const handle = runSolve({ width, height, rowClues, colClues }, { timeLimitMs, maxSolutions: 10 })
    handleRef.current = handle
    void handle.promise
      .then((outcome) => {
        if (handleRef.current !== handle) return
        handleRef.current = null
        setRunning(false)
        setElapsedMs(outcome.stats.elapsedMs)
        setResult(outcome)
        // 被取消的这次不记历史：它没有得出任何结论，记进去只会污染列表
        if (!outcome.cancelled)
          setHistory(pushSolverHistory({ width, height, rowClues, colClues, status: outcome.status }))
      })
      .catch((error: unknown) => {
        // 非 Worker 环境（或环境异常）下求解器抛错：如实告知，不留在「求解中…」（L-07）
        if (handleRef.current !== handle) return
        handleRef.current = null
        setRunning(false)
        setResult(null)
        setSolveError(error instanceof Error ? error.message : String(error))
      })
  }

  const loadSample = () => {
    setMode('form')
    setWidth(SOLVER_SAMPLE.width)
    setHeight(SOLVER_SAMPLE.height)
    setRowInputs(SOLVER_SAMPLE.rowClues.map((line) => formatClueInput(line)))
    setColInputs(SOLVER_SAMPLE.colClues.map((line) => formatClueInput(line)))
    setBulkRows(cluesToText(SOLVER_SAMPLE.rowClues))
    setBulkCols(cluesToText(SOLVER_SAMPLE.colClues))
    setBulkNotice(null)
  }

  const clearAll = () => {
    setRowInputs(emptyClues(height).map(() => ''))
    setColInputs(emptyClues(width).map(() => ''))
    setBulkRows('')
    setBulkCols('')
    setBulkNotice(null)
  }

  const alignSizeToClues = () => {
    const rows = rowClues.length
    const cols = colClues.length
    if (rows >= MIN_SOLVER_SIZE && cols >= MIN_SOLVER_SIZE && rows <= MAX_SOLVER_SIZE && cols <= MAX_SOLVER_SIZE) {
      applySize(cols, rows)
      setRowInputs((prev) => resizeStrings(prev, rows))
      setColInputs((prev) => resizeStrings(prev, cols))
    }
  }

  /** 粘贴 rows:/cols: 整段时自动拆到两个输入框（需求 9.3 的批量格式） */
  const onBulkRowsChange = (value: string) => {
    if (/(^|\n)\s*(rows?|行|r)\s*[:：]/i.test(value)) {
      const parsed = parseBulkClues(value)
      if (!parsed.error && parsed.rowClues && parsed.colClues) {
        setBulkRows(cluesToText(parsed.rowClues))
        setBulkCols(cluesToText(parsed.colClues))
        setBulkNotice(`已识别 rows:/cols: 格式 —— 行 ${parsed.rowClues.length} 条、列 ${parsed.colClues.length} 条`)
        return
      }
    }
    setBulkNotice(null)
    setBulkRows(value)
  }

  const loadHistoryEntry = (entry: SolverHistoryEntry) => {
    setMode('form')
    setWidth(entry.width)
    setHeight(entry.height)
    setRowInputs(entry.rowClues.map((line) => formatClueInput(line)))
    setColInputs(entry.colClues.map((line) => formatClueInput(line)))
  }

  /** 唯一解 -> 变成一道可以开玩的谜题（需求 9.7） */
  const startGameFromResult = () => {
    const solution = result?.solution
    if (!solution || result?.status !== 'unique') return
    const clues = computeClues(solution, width, height)
    // 图案指纹：同一个答案 -> 同一个 id / seed。成绩按 seed 分组，
    // 所以这里不能留空字符串（否则自动解题出来的所有题会共用一条成绩记录）。
    const fingerprint = shortHash(solution)
    let difficulty = sizeFloorFor(width, height)
    const draft: Puzzle = {
      id: `solver-${width}x${height}-${fingerprint}`,
      width,
      height,
      solution,
      rowClues: clues.rowClues,
      colClues: clues.colClues,
      difficulty,
      seed: `solver-${fingerprint}`,
      title: '来自自动解题',
      source: 'solver',
    }
    try {
      difficulty = assessPuzzle(draft, { assumeUnique: true, timeLimitMs: 1200, nodeLimit: 40_000 }).difficulty
    } catch {
      /* 预算内没算完就退回尺寸下限，不影响开玩 */
    }
    const puzzle: Puzzle = {
      ...draft,
      difficulty,
      id: `solver-${width}x${height}-${difficulty}-${fingerprint}`,
    }
    startPuzzle(puzzle, judgeMode)
    navigate(`/play?s=${encodePuzzleCode(puzzle)}`)
  }

  const exportImage = () => {
    const solution = result?.solution
    if (!solution) return
    downloadBoardPng(solution, width, height, `nonogram-${width}x${height}.png`, { cell: 28 })
  }

  const meta = result ? (result.cancelled ? CANCELLED_META : STATUS_META[result.status]) : null
  const sizeHint =
    Math.max(width, height) > SOLVER_SIZE_HINT
      ? `${width}×${height} 超过 ${SOLVER_SIZE_HINT}×${SOLVER_SIZE_HINT}，计算量较大，会自动放到后台线程求解（可随时取消）。`
      : null

  return (
    <div className="app-flow flex flex-1 flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-ink-200/70 bg-ink-50/85 px-3 py-2.5 backdrop-blur dark:border-ink-800 dark:bg-ink-950/85 sm:px-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/')} aria-label="返回首页">
          <IconBack />
          <span className="hidden sm:inline">首页</span>
        </Button>
        <div className="leading-tight">
          <h1 className="text-sm font-semibold text-ink-900 dark:text-white">自动解题 · Solver Playground</h1>
          <p className="text-[11px] text-ink-500 dark:text-ink-400">输入尺寸与线索，让求解器算出答案并演示推理过程</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => navigate('/settings')} aria-label="设置">
            设置
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-3 sm:p-6">
        {/* ---------------- 输入 ---------------- */}
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink-900 dark:text-white">① 输入题目</h2>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="ghost" onClick={loadSample}>
                填示例
              </Button>
              <Button size="sm" variant="ghost" onClick={clearAll}>
                清空
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex items-center gap-2 text-xs text-ink-600 dark:text-ink-300">
              宽
              <input
                type="number"
                min={MIN_SOLVER_SIZE}
                max={MAX_SOLVER_SIZE}
                value={width}
                onChange={(event) => applySize(Number(event.target.value), height)}
                className="w-16 rounded-lg border border-ink-200 bg-white px-2 py-1 text-sm tabular-nums text-ink-900 dark:border-ink-700 dark:bg-ink-800 dark:text-white"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-ink-600 dark:text-ink-300">
              高
              <input
                type="number"
                min={MIN_SOLVER_SIZE}
                max={MAX_SOLVER_SIZE}
                value={height}
                onChange={(event) => applySize(width, Number(event.target.value))}
                className="w-16 rounded-lg border border-ink-200 bg-white px-2 py-1 text-sm tabular-nums text-ink-900 dark:border-ink-700 dark:bg-ink-800 dark:text-white"
              />
            </label>
            <div className="flex items-center gap-1">
              {[5, 10, 15, 20].map((size) => (
                <Button
                  key={size}
                  size="sm"
                  variant={width === size && height === size ? 'primary' : 'secondary'}
                  onClick={() => applySize(size, size)}
                >
                  {size}
                </Button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-1">
              <span className="text-[11px] text-ink-500 dark:text-ink-400">超时上限</span>
              {TIME_LIMITS.map((limit) => (
                <Button
                  key={limit}
                  size="sm"
                  variant={timeLimitMs === limit ? 'primary' : 'ghost'}
                  onClick={() => setTimeLimitMs(limit)}
                >
                  {limit / 1000}s
                </Button>
              ))}
            </div>
          </div>

          <Segmented
            value={mode}
            onChange={(value) => setMode(value)}
            options={[
              { value: 'form', label: '表单输入', hint: '一行/一列一个输入框' },
              { value: 'text', label: '文本批量', hint: '整段粘贴，一行一条线索' },
            ]}
          />

          {mode === 'form' ? (
            <div className="space-y-3">
              <ClueField
                title={`行线索（共 ${height} 行）`}
                prefix="行"
                values={rowInputs}
                errors={formRows.map((item) => item.error)}
                invalid={validation.rowIssues}
                onChange={(index, value) => setRowInputs((prev) => prev.map((item, i) => (i === index ? value : item)))}
              />
              <ClueField
                title={`列线索（共 ${width} 列）`}
                prefix="列"
                values={colInputs}
                errors={formCols.map((item) => item.error)}
                invalid={validation.colIssues}
                onChange={(index, value) => setColInputs((prev) => prev.map((item, i) => (i === index ? value : item)))}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">
                一行一条线索，空行表示该行/列为空。数字之间可用空格或逗号分隔。也可以直接把
                <code className="mx-1 rounded bg-ink-100 px-1 dark:bg-ink-800">rows: 2 1 / 3 / 1 1</code>
                整段粘进左边的框，会自动拆分。
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <BulkArea
                  label={`行线索（${textRows.clues?.length ?? 0} 条，应为 ${height}）`}
                  value={bulkRows}
                  onChange={onBulkRowsChange}
                />
                <BulkArea
                  label={`列线索（${textCols.clues?.length ?? 0} 条，应为 ${width}）`}
                  value={bulkCols}
                  onChange={(value) => {
                    setBulkNotice(null)
                    setBulkCols(value)
                  }}
                />
              </div>
              {bulkNotice ? <p className="text-[11px] text-emerald-600 dark:text-emerald-400">{bulkNotice}</p> : null}
            </div>
          )}

          {/* ---------------- 校验结果 ---------------- */}
          <div className="space-y-1.5">
            {sizeHint ? <p className="text-[11px] text-amber-600 dark:text-amber-400">{sizeHint}</p> : null}
            {parseError ? <p className="text-[11px] text-rose-600 dark:text-rose-400">格式有误：{parseError}</p> : null}
            {!parseError && !validation.ok ? (
              <ul className="space-y-0.5 text-[11px] text-rose-600 dark:text-rose-400">
                {validation.issues.slice(0, 6).map((issue, index) => (
                  <li key={index}>· {issue.message}</li>
                ))}
                {validation.issues.length > 6 ? <li>· 还有 {validation.issues.length - 6} 处问题…</li> : null}
              </ul>
            ) : null}
            {!parseError && validation.ok ? (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                校验通过：行 {height} 条、列 {width} 条，行总数 {validation.rowSum} = 列总数 {validation.colSum}。
              </p>
            ) : null}
          </div>

          {validation.issues.some((issue) => issue.message.includes('条数')) ? (
            <Button size="sm" variant="secondary" onClick={alignSizeToClues}>
              按线索条数自动调整尺寸
            </Button>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button variant="primary" onClick={onSolve} disabled={!canSolve}>
              <IconPlay />
              {running ? '求解中…' : '开始求解'}
            </Button>
            {running ? (
              <>
                <Button variant="secondary" onClick={onCancelClick}>
                  取消
                </Button>
                <span className="text-[11px] tabular-nums text-ink-500 dark:text-ink-400">
                  已耗时 {(elapsedMs / 1000).toFixed(1)}s{elapsedMs > 3000 ? ' · 仍在计算…' : ''}
                  {solverRuntimeAvailable() ? '' : ' · 当前环境不支持后台线程，取消会在算完后生效'}
                </span>
              </>
            ) : null}
          </div>

          {solveError ? (
            <p className="text-[11px] text-rose-600 dark:text-rose-400">
              求解器出错，没能给出结果：{solveError}。可以先调整线索或刷新页面再试。
            </p>
          ) : null}
        </Card>

        {/* ---------------- 结果 ---------------- */}
        {result && meta ? (
          <Card className="space-y-3">
            <div className={`flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 ring-1 ${meta.bar}`}>
              <span className="text-sm font-semibold">{meta.label}</span>
              {result.status === 'multiple' && result.solutionCount ? (
                <span className="text-xs">
                  至少 {result.solutionCount} 个解{result.solutionCountCapped ? '（达到统计上限 10）' : ''}
                </span>
              ) : null}
              {result.cancelled ? <span className="text-xs">（已取消）</span> : null}
            </div>

            <ResultSummary result={result} elapsedMs={elapsedMs} />

            {result.status === 'none' ? (
              <p className="text-xs leading-relaxed text-ink-600 dark:text-ink-300">
                {result.contradiction
                  ? `求解过程中出现矛盾：${result.contradiction}`
                  : '穷尽了所有可能组合都没有找到解，说明这组线索本身自相矛盾。'}
                请检查是否抄错了某个数字，或行/列线索是否对应反了。
              </p>
            ) : null}

            {result.cancelled ? (
              <p className="text-xs leading-relaxed text-ink-600 dark:text-ink-300">
                这次计算已经中止，没有得出结论（已用 {(result.stats.elapsedMs / 1000).toFixed(1)} 秒）。
                可以直接再点一次「开始求解」，或先调整线索。
              </p>
            ) : null}

            {result.status === 'timeout' && !result.cancelled ? (
              <p className="text-xs leading-relaxed text-ink-600 dark:text-ink-300">
                在 {timeLimitMs / 1000} 秒内没能得出结论（已用 {(result.stats.elapsedMs / 1000).toFixed(1)} 秒）。
                可以放宽超时上限、减小尺寸，或检查线索是否有笔误。
              </p>
            ) : null}

            {result.status === 'unknown' ? (
              <p className="text-xs leading-relaxed text-ink-600 dark:text-ink-300">
                找到了一个解，但没能在限定时间内确认它是否唯一。下面的棋盘仅供参考，不保证是唯一答案。
              </p>
            ) : null}

            {result.status === 'unique' && result.solution ? (
              <>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => setShowSteps((value) => !value)}>
                    <IconBulb />
                    {showSteps ? '收起推理步骤' : `查看推理步骤（${result.steps.length} 步）`}
                  </Button>
                  <Button size="sm" variant="primary" onClick={startGameFromResult}>
                    用此题开始游戏
                  </Button>
                  <Button size="sm" variant="secondary" onClick={exportImage}>
                    导出为图片
                  </Button>
                </div>
                {Math.max(width, height) > 25 ? (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    尺寸超过 25×25，游戏页的格子会缩到接近最小值，手机上操作会比较吃力。
                  </p>
                ) : null}
              </>
            ) : null}

            {result.status === 'multiple' ? (
              <p className="text-xs leading-relaxed text-ink-600 dark:text-ink-300">
                多解题目无法进行正误判定，所以不能用它开始游戏。可以补一条线索（比如某一格的黑白），再求解一次。
              </p>
            ) : null}

            {/* 棋盘 */}
            {result.status === 'multiple' && result.solution && result.alternativeSolution ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <SolutionPane
                  title="解 1"
                  width={width}
                  height={height}
                  rowClues={rowClues}
                  colClues={colClues}
                  solution={result.solution}
                  highlight={diffIndexes(result.solution, result.alternativeSolution)}
                />
                <SolutionPane
                  title="解 2"
                  width={width}
                  height={height}
                  rowClues={rowClues}
                  colClues={colClues}
                  solution={result.alternativeSolution}
                  highlight={diffIndexes(result.solution, result.alternativeSolution)}
                />
              </div>
            ) : null}

            {result.status === 'multiple' && result.solution && result.alternativeSolution ? (
              <p className="text-[11px] text-ink-500 dark:text-ink-400">
                红框格子就是两个解不一致的位置（共 {diffIndexes(result.solution, result.alternativeSolution).length}{' '}
                格）。
              </p>
            ) : null}

            {result.solution && result.status !== 'multiple' && !showSteps ? (
              <div className="flex justify-center">
                <SolverGrid
                  width={width}
                  height={height}
                  rowClues={rowClues}
                  colClues={colClues}
                  board={result.solution}
                />
              </div>
            ) : null}

            {showSteps && result.steps.length > 0 && result.status === 'unique' ? (
              <SolverStepPlayer
                steps={result.steps}
                width={width}
                height={height}
                rowClues={rowClues}
                colClues={colClues}
                truncated={result.stepsTruncated}
              />
            ) : null}
          </Card>
        ) : null}

        {/* ---------------- 历史 ---------------- */}
        <Card className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink-900 dark:text-white">最近求解（最多 10 条）</h2>
            {history.length > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  clearSolverHistory()
                  setHistory([])
                }}
              >
                <IconTrash />
                清空历史
              </Button>
            ) : null}
          </div>
          {history.length === 0 ? (
            <p className="text-[11px] text-ink-500 dark:text-ink-400">
              还没有记录。求解成功后，这里会保存你输入过的题目，方便再算一次。
            </p>
          ) : (
            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
              {history.map((entry) => (
                <li key={historyKey(entry)} className="flex items-center gap-2 py-1.5">
                  <span className="shrink-0 text-[11px] text-ink-400 tabular-nums">
                    {new Date(entry.at).toLocaleDateString()}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-ink-600 dark:text-ink-300">
                    {describeHistoryEntry(entry)}
                  </span>
                  {entry.status ? (
                    <Pill tone={STATUS_META[entry.status].tone}>{STATUS_META[entry.status].label}</Pill>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={() => loadHistoryEntry(entry)}>
                    填入
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <p className="pb-4 text-[11px] leading-relaxed text-ink-400">
          说明：自动解题与游戏存档、计时、成绩完全无关，不会写入任何游戏记录。求解用的是游戏里同一份 DP
          线索传播求解器（含假设分支），因此结果与游戏判定一致。
        </p>
      </main>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 子组件                                                              */
/* ------------------------------------------------------------------ */

function ClueField({
  title,
  prefix,
  values,
  errors,
  invalid,
  onChange,
}: {
  title: string
  prefix: string
  values: string[]
  errors: (string | null)[]
  invalid: (string | null)[]
  onChange: (index: number, value: string) => void
}): JSX.Element {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-medium text-ink-600 dark:text-ink-300">{title}</div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4">
        {values.map((value, index) => {
          const error = errors[index] ?? invalid[index]
          return (
            <label key={index} className="flex items-center gap-1.5">
              <span className="w-8 shrink-0 text-right text-[11px] text-ink-400 tabular-nums">
                {prefix}
                {index + 1}
              </span>
              <input
                value={value}
                onChange={(event) => onChange(index, event.target.value)}
                placeholder="如 2 1"
                inputMode="numeric"
                title={error ?? undefined}
                className={`min-w-0 flex-1 rounded-lg border px-2 py-1 text-sm text-ink-900 dark:bg-ink-800 dark:text-white ${
                  error
                    ? 'border-rose-400 bg-rose-50 dark:border-rose-500/60 dark:bg-rose-500/10'
                    : 'border-ink-200 bg-white dark:border-ink-700'
                }`}
              />
            </label>
          )
        })}
      </div>
    </div>
  )
}

function BulkArea({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}): JSX.Element {
  return (
    <label className="space-y-1">
      <span className="block text-[11px] font-medium text-ink-600 dark:text-ink-300">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={6}
        spellCheck={false}
        className="w-full rounded-lg border border-ink-200 bg-white p-2 font-mono text-xs text-ink-900 dark:border-ink-700 dark:bg-ink-800 dark:text-white"
      />
    </label>
  )
}

function SolutionPane({
  title,
  width,
  height,
  rowClues,
  colClues,
  solution,
  highlight,
}: {
  title: string
  width: number
  height: number
  rowClues: number[][]
  colClues: number[][]
  solution: Uint8Array
  highlight: number[]
}): JSX.Element {
  const map = useMemo(() => {
    const result = new Map<number, CellHighlightKind>()
    for (const index of highlight) result.set(index, 'diff')
    return result
  }, [highlight])
  return (
    <div className="space-y-1">
      <div className="text-center text-[11px] font-medium text-ink-600 dark:text-ink-300">
        {title}（差异 {highlight.length} 格）
      </div>
      <SolverGrid
        width={width}
        height={height}
        rowClues={rowClues}
        colClues={colClues}
        board={solution}
        highlight={map}
      />
    </div>
  )
}

function ResultSummary({ result, elapsedMs }: { result: SolveResult; elapsedMs: number }): JSX.Element {
  const details = result.details
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label="传播轮次" value={result.stats.propagationRounds} />
      <Stat label="回溯次数" value={result.stats.backtrackCount} />
      <Stat label="耗时" value={`${((result.cancelled ? elapsedMs : result.stats.elapsedMs) / 1000).toFixed(2)}s`} />
      <Stat
        label="搜索节点"
        value={details?.nodes ?? '—'}
        hint={details ? `失败分支 ${details.failedGuesses} · 最大假设深度 ${details.maxDepth}` : undefined}
      />
    </div>
  )
}
