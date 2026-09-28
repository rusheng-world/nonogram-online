import { useEffect, useMemo, useRef, useState } from 'react'
import { SolverGrid, type CellHighlightKind } from './SolverGrid'
import { Button, Pill } from './ui'
import { boardAfter, keyStepIndexes } from '../core/solverSteps'
import type { SolveStep, SolveStepType } from '../core/solver'

interface SolverStepPlayerProps {
  steps: SolveStep[]
  width: number
  height: number
  rowClues: number[][]
  colClues: number[][]
  /** 轨迹是否因超出上限被截断 */
  truncated?: boolean
}

const SPEEDS: { label: string; ms: number }[] = [
  { label: '慢', ms: 800 },
  { label: '中', ms: 420 },
  { label: '快', ms: 180 },
]

const TYPE_META: Record<SolveStepType, { label: string; tone: 'default' | 'success' | 'warn' | 'danger' }> = {
  propagate: { label: '行列推理', tone: 'default' },
  assume: { label: '假设', tone: 'warn' },
  contradiction: { label: '矛盾', tone: 'danger' },
  backtrack: { label: '回退', tone: 'warn' },
  done: { label: '得解', tone: 'success' },
}

/**
 * 推理步骤演示（需求 9.6）。
 *
 * 播放的粒度不是「每一步原始推理」，而是「值得看的节点」：
 * 轨迹超过 500 步时只停在一层传播收敛后的稳定态、以及每次假设 / 回退 / 得解，
 * 否则一个 20×20 的题会刷出上千个瞬间闪过的画面，反而看不清。
 */
export function SolverStepPlayer({ steps, width, height, rowClues, colClues, truncated }: SolverStepPlayerProps) {
  const sequence = useMemo(() => keyStepIndexes(steps), [steps])
  const [pos, setPos] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(SPEEDS[1].ms)
  const timerRef = useRef<number | null>(null)

  // 换了题目 / 重新求解后，回到「未开始」
  useEffect(() => {
    setPos(-1)
    setPlaying(false)
  }, [steps])

  useEffect(() => {
    if (!playing) {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
      return
    }
    timerRef.current = window.setInterval(() => {
      setPos((current) => {
        if (current + 1 >= sequence.length) {
          setPlaying(false)
          return current
        }
        return current + 1
      })
    }, speed)
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [playing, speed, sequence.length])

  const stepIndex = pos >= 0 ? sequence[pos] : -1
  const step = stepIndex >= 0 ? steps[stepIndex] : null
  const size = width * height

  const board = useMemo(() => boardAfter(steps, size, stepIndex), [steps, size, stepIndex])

  const highlight = useMemo(() => {
    if (!step?.cells || step.cells.length === 0) return null
    const kind: CellHighlightKind = step.type === 'assume' ? 'assume' : 'step'
    const map = new Map<number, CellHighlightKind>()
    for (const cell of step.cells) map.set(cell.index, kind)
    return map
  }, [step])

  // 当前步的第一条理由：既解释了"为什么"，也让用户能对上棋盘
  const firstReason = step?.cells?.find((cell) => cell.reason)?.reason ?? null

  const goto = (next: number) => {
    setPlaying(false)
    setPos(Math.max(-1, Math.min(sequence.length - 1, next)))
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => goto(-1)} disabled={pos < 0}>
          回到开头
        </Button>
        <Button size="sm" variant="secondary" onClick={() => goto(pos - 1)} disabled={pos < 0}>
          上一步
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={() => {
            if (pos + 1 >= sequence.length) setPos(-1)
            setPlaying((value) => !value)
          }}
        >
          {playing ? '暂停' : pos + 1 >= sequence.length ? '重新播放' : '播放'}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => goto(pos + 1)} disabled={pos + 1 >= sequence.length}>
          下一步
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-[11px] text-ink-500 dark:text-ink-400">速度</span>
          {SPEEDS.map((option) => (
            <Button
              key={option.label}
              size="sm"
              variant={speed === option.ms ? 'primary' : 'ghost'}
              onClick={() => setSpeed(option.ms)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-500 dark:text-ink-400">
        <span className="tabular-nums">
          第 {Math.max(0, pos + 1)} / {sequence.length} 步
        </span>
        {step ? <Pill tone={TYPE_META[step.type].tone}>{TYPE_META[step.type].label}</Pill> : null}
        {step && step.depth > 0 ? <Pill tone="warn">{`假设深度 ${step.depth}`}</Pill> : null}
        {steps.length > sequence.length ? <span>（轨迹较长，只展示 {sequence.length} 个关键节点）</span> : null}
        {truncated ? <span className="text-amber-600 dark:text-amber-400">（轨迹已截断）</span> : null}
      </div>

      <input
        type="range"
        min={-1}
        max={sequence.length - 1}
        value={pos}
        onChange={(event) => goto(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer accent-indigo-600"
        aria-label="推理进度"
      />

      <div className="min-h-[42px] rounded-xl bg-ink-50 px-3 py-2 text-xs leading-relaxed text-ink-700 dark:bg-ink-800/60 dark:text-ink-200">
        {step ? (
          <>
            <div>{step.description}</div>
            {firstReason ? <div className="mt-0.5 text-ink-500 dark:text-ink-400">{firstReason}</div> : null}
          </>
        ) : (
          <div className="text-ink-500 dark:text-ink-400">点「播放」或「下一步」开始逐步演示求解过程。</div>
        )}
      </div>

      <div className="flex min-h-0 justify-center">
        <SolverGrid
          width={width}
          height={height}
          rowClues={rowClues}
          colClues={colClues}
          board={board}
          showDeduced
          highlight={highlight}
        />
      </div>
    </div>
  )
}
