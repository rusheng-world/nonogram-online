/**
 * 新手教程页（#/tutorial）。
 *
 * 架构（需求 4 / 15 / 27）：**复用现有游戏引擎，不新建棋盘组件**。
 *   · 棋盘渲染 / 涂格 / 拖动 / 长按 / 悬停高亮 / 线索划线 —— 全部是 GameBoard；
 *   · 棋盘状态（board / cursor / undo 栈）在 gameStore，用 `tutorial` 标记隔离开：
 *     不写存档、不写成绩、不写成就、不自动判胜（见 store/gameStore.ts）；
 *   · 「现在教到第几步 / 该说什么 / 这一步该点哪里」在 tutorialStore + core/tutorial.ts；
 *   · 本页只负责把两者接起来：落笔校验（guard）、完成检测（subscribe）、退出清理。
 *
 * 三处发给 GameBoard 的额外信息：
 *   highlight —— 教学高亮（只看这几行/列）；
 *   guard     —— 落笔前的强制校验，被拒绝就整笔回滚（需求 8）；
 *   其余一律走默认值，普通对局的行为完全不受影响。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { GameBoard } from '../components/GameBoard'
import { Button, Card, Modal, Pill } from '../components/ui'
import { IconBack, IconBulb, IconPlay, IconRefresh } from '../components/icons'
import {
  TUTORIAL_STEPS,
  TUTORIAL_STEP_COUNT,
  evaluateStroke,
  isStepComplete,
  isTutorialSolved,
  tutorialBoardAtStep,
  tutorialPuzzle,
} from '../core/tutorial'
import { TUTORIAL_DONE, TUTORIAL_SHELL, TUTORIAL_WELCOME } from '../core/tutorialContent'
import { FILLED, EMPTY, UNKNOWN } from '../core/types'
import { loadProgress } from '../core/storage'
import { restoreFromStored } from '../game/bootstrap'
import { navigate } from '../router'
import { useGameStore, type StrokeChange } from '../store/gameStore'
import { useSettingsStore } from '../store/settingsStore'
import { resumeStep, useTutorialStore } from '../store/tutorialStore'

export function TutorialPage(): JSX.Element {
  const stepIndex = useTutorialStore((s) => s.stepIndex)
  const completed = useTutorialStore((s) => s.completed)
  const feedback = useTutorialStore((s) => s.feedback)
  const hintVisible = useTutorialStore((s) => s.hintVisible)
  const softCells = useTutorialStore((s) => s.softCells)
  const resumed = useTutorialStore((s) => s.resumed)
  const active = useTutorialStore((s) => s.active)
  const toggleHint = useTutorialStore((s) => s.toggleHint)
  const [showExit, setShowExit] = useState(false)

  const paintMode = useSettingsStore((s) => s.paintMode)
  const setSetting = useSettingsStore((s) => s.set)
  const board = useGameStore((s) => s.board)

  const step = stepIndex >= 1 ? (TUTORIAL_STEPS[stepIndex - 1] ?? null) : null

  // -------------------------------------------------------------------------
  // 进入 / 离开
  // -------------------------------------------------------------------------
  const setup = useCallback(() => {
    const tutorial = useTutorialStore.getState()
    // 记下玩家自己的笔尖，退出时还原（教程会按阶段临时改成涂黑 / 标记）
    tutorial.rememberPaintMode(useSettingsStore.getState().paintMode)
    const start = resumeStep()
    tutorial.begin(start, start > 0)
    // 断点续玩：把前面几个阶段的成果直接铺回棋盘（纯函数，见 core/tutorial.ts）
    useGameStore.getState().beginTutorial(tutorialPuzzle(), tutorialBoardAtStep(Math.max(1, start)))
  }, [])

  const teardown = useCallback(() => {
    const tutorial = useTutorialStore.getState()
    if (tutorial.savedPaintMode) useSettingsStore.getState().set('paintMode', tutorial.savedPaintMode)
    tutorial.reset()
    // 摘掉教程棋盘，再把玩家没下完的普通对局恢复回来（没存档就保持空状态）
    useGameStore.getState().endTutorial()
    const saved = loadProgress()
    if (saved && !saved.completed) {
      const restored = restoreFromStored(saved, useSettingsStore.getState().judgeMode)
      if (!restored) useGameStore.getState().endTutorial()
    }
  }, [])

  useEffect(() => {
    setup()
    return teardown
  }, [setup, teardown])

  // 进入每个阶段就把笔尖切到该阶段推荐的模式（需求 21：不能只靠 hover 才能完成）
  useEffect(() => {
    if (!step) return
    if (useSettingsStore.getState().paintMode !== step.preferAction) setSetting('paintMode', step.preferAction)
  }, [step, setSetting])

  // 柔和提示（点错了）自动淡出，避免一直停在棋盘上
  useEffect(() => {
    if (softCells.length === 0) return
    const id = window.setTimeout(() => useTutorialStore.getState().clearSoft(), 2600)
    return () => window.clearTimeout(id)
  }, [softCells])

  // -------------------------------------------------------------------------
  // 落笔校验（需求 8：强制操作约束）
  // -------------------------------------------------------------------------
  const check = useCallback((changes: StrokeChange[]): boolean => {
    const tutorial = useTutorialStore.getState()
    if (!tutorial.active || tutorial.completed) return true
    const current = TUTORIAL_STEPS[tutorial.stepIndex - 1]
    if (!current) return true
    const verdict = evaluateStroke(changes, current)
    if (verdict.ok) {
      if (tutorial.softCells.length > 0) tutorial.clearSoft()
      return true
    }
    tutorial.reject(verdict.message ?? '还差一点，再看看这一行和这一列的数字。', verdict.softCells ?? [])
    return false
  }, [])

  // 指针落笔走 GameBoard 的 guard；键盘落笔在这里手动走一遍同样的校验
  const applyStroke = useCallback(
    (changes: StrokeChange[]) => {
      if (!check(changes)) return
      useGameStore.getState().applyStroke(changes)
    },
    [check],
  )

  // -------------------------------------------------------------------------
  // 阶段完成检测：棋盘一变就看看这一步的目标是不是达成了
  // -------------------------------------------------------------------------
  useEffect(() => {
    return useGameStore.subscribe((state, prev) => {
      if (state.board === prev.board) return
      const tutorial = useTutorialStore.getState()
      if (!tutorial.active || tutorial.completed || tutorial.stepIndex < 1) return
      if (!isStepComplete(tutorial.stepIndex, state.board)) return
      const wasLast = tutorial.stepIndex >= TUTORIAL_STEP_COUNT
      tutorial.advance()
      // 最后一阶段完成 = 整张图拼好；让引擎切到「已完成」触发收尾动画。
      // 教程模式下 markWin 不会写任何成绩（见 gameStore）。
      if (wasLast && isTutorialSolved(state.board)) useGameStore.getState().markWin(Date.now())
    })
  }, [])

  // -------------------------------------------------------------------------
  // 键盘操作（需求 21：桌面端键盘也能完成教程）
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!step || completed) return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      const state = useGameStore.getState()
      const puzzle = state.puzzle
      if (!puzzle) return
      const { width, height } = puzzle
      const index = state.cursor
      const x = index % width
      const y = Math.floor(index / width)
      const move = (nx: number, ny: number) => {
        state.setCursor(Math.min(height - 1, Math.max(0, ny)) * width + Math.min(width - 1, Math.max(0, nx)))
      }
      const paint = (value: number) => {
        applyStroke([{ index, value: state.board[index] === value ? UNKNOWN : value }])
      }
      switch (event.key) {
        case 'ArrowUp':
          move(x, y - 1)
          event.preventDefault()
          break
        case 'ArrowDown':
          move(x, y + 1)
          event.preventDefault()
          break
        case 'ArrowLeft':
          move(x - 1, y)
          event.preventDefault()
          break
        case 'ArrowRight':
          move(x + 1, y)
          event.preventDefault()
          break
        case ' ':
          paint(FILLED)
          event.preventDefault()
          break
        case 'x':
        case 'X':
          paint(EMPTY)
          event.preventDefault()
          break
        case 'Delete':
        case 'Backspace':
          applyStroke([{ index, value: UNKNOWN }])
          event.preventDefault()
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [step, completed, applyStroke])

  // -------------------------------------------------------------------------
  // 展示用派生值
  // -------------------------------------------------------------------------
  const filledCount = useMemo(() => {
    if (!step) return 0
    let count = 0
    for (let i = 0; i < board.length; i++) if (board[i] === FILLED) count++
    return count
  }, [board, step])
  const goalTotal = useMemo(() => {
    const solution = tutorialPuzzle().solution
    let count = 0
    for (let i = 0; i < solution.length; i++) if (solution[i]) count++
    return count
  }, [])

  const highlight = useMemo(
    () => ({
      rows: step?.highlight?.rows,
      cols: step?.highlight?.cols,
      soft: softCells,
    }),
    [step, softCells],
  )

  const exitTutorial = () => navigate('/')
  const startFirst = () => navigate('/?start=easy')

  return (
    <div className="app-screen flex min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-ink-200/70 px-2 py-2 dark:border-ink-800 sm:px-4">
        <Button variant="ghost" size="sm" onClick={() => setShowExit(true)} aria-label={TUTORIAL_SHELL.exit}>
          <IconBack />
          <span className="hidden sm:inline">{TUTORIAL_SHELL.leave}</span>
        </Button>
        <h1 className="text-sm font-semibold text-ink-900 dark:text-white">{TUTORIAL_SHELL.title}</h1>

        <div className="ml-auto flex items-center gap-2">
          {stepIndex >= 1 ? (
            <>
              <span className="text-[11px] tabular-nums text-ink-500 dark:text-ink-400">
                {TUTORIAL_SHELL.progressLabel(stepIndex, TUTORIAL_STEP_COUNT)}
              </span>
              {/* 轻量进度点（需求 11：不要大型进度条） */}
              <span className="hidden items-center gap-1 sm:flex" aria-hidden="true">
                {TUTORIAL_STEPS.map((item) => (
                  <span
                    key={item.id}
                    className={`h-1.5 w-1.5 rounded-full ${
                      item.index <= stepIndex ? 'bg-indigo-500' : 'bg-ink-300 dark:bg-ink-700'
                    }`}
                  />
                ))}
              </span>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => setShowExit(true)}
            aria-label={TUTORIAL_SHELL.exit}
            title={TUTORIAL_SHELL.exit}
            className="rounded-lg p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800 dark:hover:text-ink-100"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-2 sm:p-3">
        {!active ? (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-ink-500 dark:text-ink-400">
            正在准备教程…
          </div>
        ) : stepIndex === 0 ? (
          <Card className="mx-auto flex w-full max-w-md flex-col items-center gap-3 text-center">
            <h2 className="text-lg font-semibold text-ink-900 dark:text-white">{TUTORIAL_WELCOME.title}</h2>
            <div className="space-y-1 text-xs leading-relaxed text-ink-600 dark:text-ink-300">
              {TUTORIAL_WELCOME.body.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            <ul className="w-full space-y-1 rounded-xl bg-ink-50 p-3 text-left text-xs text-ink-600 dark:bg-ink-800/60 dark:text-ink-300">
              {TUTORIAL_WELCOME.bullets.map((line) => (
                <li key={line} className="flex items-start gap-1.5">
                  <span className="text-emerald-500">✓</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
              <Button variant="primary" onClick={() => useTutorialStore.getState().next()}>
                <IconPlay />
                {TUTORIAL_WELCOME.start}
              </Button>
              <Button onClick={exitTutorial}>{TUTORIAL_WELCOME.skip}</Button>
            </div>
          </Card>
        ) : (
          /* 桌面：教练面板在棋盘右侧；移动端：在棋盘下方（需求 10 / 22） */
          <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              {/* 教程只有 5×5，格子放大到 48px，桌面端不用眯着眼点 */}
              <GameBoard highlight={highlight} guard={check} maxCell={48} />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex rounded-xl bg-ink-100 p-0.5 dark:bg-ink-800">
                  {(['fill', 'mark'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={paintMode === mode}
                      onClick={() => setSetting('paintMode', mode)}
                      className={`rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors ${
                        paintMode === mode
                          ? 'bg-white shadow-sm dark:bg-ink-700 dark:text-white'
                          : 'text-ink-500 dark:text-ink-400'
                      }`}
                    >
                      {mode === 'fill' ? TUTORIAL_SHELL.toolFill : TUTORIAL_SHELL.toolMark}
                    </button>
                  ))}
                </div>
                <span className="text-xs tabular-nums text-ink-500 dark:text-ink-400">
                  已填 {filledCount} / {goalTotal}
                </span>
              </div>
              {paintMode !== step?.preferAction ? (
                <p className="text-[11px] text-ink-400">{TUTORIAL_SHELL.toolHint}</p>
              ) : null}
            </div>

            {/* Tutorial Coach：提示面板，不遮挡棋盘 */}
            <Card className="w-full shrink-0 space-y-2 lg:w-80 lg:self-start">
              <div className="flex items-center gap-1.5">
                <IconBulb size={16} className="text-amber-500" />
                <h2 className="text-sm font-semibold text-ink-900 dark:text-white">
                  {TUTORIAL_SHELL.progressLabel(stepIndex, TUTORIAL_STEP_COUNT)} · {step?.title}
                </h2>
              </div>

              {resumed ? <Pill tone="warn">{TUTORIAL_SHELL.resumed}</Pill> : null}

              <div className="space-y-1.5 text-xs leading-relaxed text-ink-600 dark:text-ink-300" aria-live="polite">
                {step?.body.map((line) => (
                  <p key={line}>{line}</p>
                ))}
                {feedback ? (
                  <p
                    className={
                      feedback.tone === 'good'
                        ? 'font-medium text-emerald-600 dark:text-emerald-400'
                        : 'font-medium text-amber-600 dark:text-amber-400'
                    }
                  >
                    {feedback.text}
                  </p>
                ) : null}
                {hintVisible && step ? (
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-500/25">
                    💡 {step.hint}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button variant="secondary" size="sm" onClick={toggleHint} aria-expanded={hintVisible}>
                  <IconBulb size={15} />
                  {hintVisible ? TUTORIAL_SHELL.hintAgain : TUTORIAL_SHELL.hint}
                </Button>
                <span className="text-[11px] text-ink-400">
                  第 {stepIndex} / {TUTORIAL_STEP_COUNT} 步
                </span>
              </div>
            </Card>
          </div>
        )}
      </main>

      {/* 退出确认（需求 12） */}
      <Modal
        open={showExit}
        title={TUTORIAL_SHELL.exitTitle}
        onClose={() => setShowExit(false)}
        footer={
          <>
            <Button variant="primary" onClick={() => setShowExit(false)}>
              {TUTORIAL_SHELL.exitStay}
            </Button>
            <Button onClick={exitTutorial}>{TUTORIAL_SHELL.exitLeave}</Button>
          </>
        }
      >
        <p>{TUTORIAL_SHELL.exitBody}</p>
      </Modal>

      {/* 完成页（需求 13） */}
      <Modal
        open={completed}
        title={TUTORIAL_DONE.title}
        onClose={exitTutorial}
        footer={
          <>
            <Button onClick={exitTutorial}>{TUTORIAL_DONE.backHome}</Button>
            <Button
              onClick={() => {
                useTutorialStore.getState().restart()
                useGameStore.getState().beginTutorial(tutorialPuzzle(), tutorialBoardAtStep(1))
              }}
            >
              <IconRefresh />
              {TUTORIAL_DONE.replay}
            </Button>
            <Button variant="primary" onClick={startFirst}>
              <IconPlay />
              {TUTORIAL_DONE.playFirst}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          {TUTORIAL_DONE.body.map((line) => (
            <p key={line} className="text-sm text-ink-700 dark:text-ink-200">
              {line}
            </p>
          ))}
          <ul className="space-y-1 rounded-xl bg-ink-50 p-3 text-xs text-ink-700 dark:bg-ink-800/60 dark:text-ink-200">
            {TUTORIAL_DONE.bullets.map((line) => (
              <li key={line} className="flex items-start gap-1.5">
                <span className="text-emerald-500">✓</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-500 dark:text-ink-400">{TUTORIAL_DONE.outro}</p>
        </div>
      </Modal>
    </div>
  )
}
