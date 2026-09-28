import { useEffect, useMemo, useRef, useState } from 'react'
import { AchievementToast } from '../components/AchievementToast'
import { GameBoard } from '../components/GameBoard'
import {
  IconBack,
  IconBulb,
  IconCheck,
  IconPause,
  IconPlay,
  IconRedo,
  IconRefresh,
  IconShare,
  IconSettings,
  IconSolver,
  IconUndo,
  IconTrophy,
} from '../components/icons'
import { Button, Modal, Pill, Stat } from '../components/ui'
import { DIFFICULTY_META, EMPTY, FILLED, UNKNOWN } from '../core/types'
import { achievementById } from '../core/achievements'
import { buildShareUrl } from '../core/encoding'
import { getBest } from '../core/storage'
import { ensureGame } from '../game/bootstrap'
import { formatDuration, useElapsedMs } from '../hooks/useElapsed'
import { HINT_PENALTY_MS, useGameStore } from '../store/gameStore'
import { useSettingsStore } from '../store/settingsStore'
import { SITE_URL } from '../project'
import { navigate } from '../router'
import { playSound } from '../utils/sound'

export function GamePage({ params }: { params: URLSearchParams }): JSX.Element {
  const puzzle = useGameStore((s) => s.puzzle)
  const completed = useGameStore((s) => s.completed)
  const paused = useGameStore((s) => s.paused)
  const mistakes = useGameStore((s) => s.mistakes)
  const hintsUsed = useGameStore((s) => s.hintsUsed)
  const checks = useGameStore((s) => s.checks)
  const newRecord = useGameStore((s) => s.newRecord)
  const newNoHintRecord = useGameStore((s) => s.newNoHintRecord)
  const unlockedAchievements = useGameStore((s) => s.unlockedAchievements)
  const dismissAchievements = useGameStore((s) => s.dismissAchievements)
  const started = useGameStore((s) => s.started)
  const completedMs = useGameStore((s) => s.completedMs)
  const pauseCount = useGameStore((s) => s.pauseCount)
  const notice = useGameStore((s) => s.notice)
  const past = useGameStore((s) => s.past)
  const future = useGameStore((s) => s.future)
  const judgeMode = useGameStore((s) => s.judgeMode)
  const board = useGameStore((s) => s.board)
  const undo = useGameStore((s) => s.undo)
  const redo = useGameStore((s) => s.redo)
  const revealHint = useGameStore((s) => s.revealHint)
  const check = useGameStore((s) => s.check)
  const setPaused = useGameStore((s) => s.setPaused)
  const restart = useGameStore((s) => s.restart)
  const setNotice = useGameStore((s) => s.setNotice)

  const showTimer = useSettingsStore((s) => s.showTimer)
  const autoPause = useSettingsStore((s) => s.autoPause)
  const soundOn = useSettingsStore((s) => s.sound)
  const paintMode = useSettingsStore((s) => s.paintMode)
  const showStartScreen = useSettingsStore((s) => s.showStartScreen)
  const setSetting = useSettingsStore((s) => s.set)
  const judgeSetting = useSettingsStore((s) => s.judgeMode)

  const [loadError, setLoadError] = useState<string | null>(null)
  const [showReset, setShowReset] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [shareText, setShareText] = useState('')
  const [startDismissed, setStartDismissed] = useState(false)
  const elapsed = useElapsedMs()
  const keyRef = useRef(params)

  // 加载/恢复对局
  useEffect(() => {
    if (keyRef.current.toString() === params.toString() && useGameStore.getState().puzzle) return
    keyRef.current = params
    const outcome = ensureGame(params, judgeSetting)
    if (!outcome.ok) {
      setLoadError(outcome.error ?? '无法开始游戏')
      // 没有指定谜题时，直接在首页随机开一局（见 HomePage）
      navigate('/?error=' + encodeURIComponent(outcome.error ?? ''))
    }
  }, [params, judgeSetting])

  // 键盘操作
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // 在输入框 / 文本域里打字时不要触发棋盘快捷键（分享链接要能正常选中复制）
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      const state = useGameStore.getState()
      const current = state.puzzle
      if (!current) return
      const { width, height } = current
      const index = state.cursor
      const x = index % width
      const y = Math.floor(index / width)
      const move = (nx: number, ny: number) => {
        const cx = Math.min(width - 1, Math.max(0, nx))
        const cy = Math.min(height - 1, Math.max(0, ny))
        state.setCursor(cy * width + cx)
      }
      const paint = (value: number) => {
        const currentValue = state.board[index]
        const next = currentValue === value ? UNKNOWN : value
        const outcome = state.applyStroke([{ index, value: next }])
        if (soundOn && outcome.wrongAdded > 0) playSound('error')
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
        case 'Spacebar':
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
          if (state.board[index] !== UNKNOWN) state.applyStroke([{ index, value: UNKNOWN }])
          event.preventDefault()
          break
        case 'z':
        case 'Z':
          if (event.ctrlKey || event.metaKey) {
            if (event.shiftKey) state.redo()
            else state.undo()
            event.preventDefault()
          }
          break
        case 'y':
        case 'Y':
          if (event.ctrlKey || event.metaKey) {
            state.redo()
            event.preventDefault()
          }
          break
        case 'h':
        case 'H':
          state.revealHint()
          if (soundOn) playSound('hint')
          event.preventDefault()
          break
        case 'p':
        case 'P':
          state.setPaused(!state.paused)
          event.preventDefault()
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [soundOn])

  // 失焦自动暂停
  useEffect(() => {
    if (!autoPause) return
    const onVisibility = () => {
      const state = useGameStore.getState()
      if (document.hidden && state.started && !state.completed && !state.paused) state.setPaused(true)
    }
    window.addEventListener('visibilitychange', onVisibility)
    return () => window.removeEventListener('visibilitychange', onVisibility)
  }, [autoPause])

  // 最佳成绩现在分「不限条件」与「零提示」两条，展示值取前者
  const records = useMemo(() => {
    if (!puzzle) return null
    return getBest(puzzle.difficulty, puzzle.seed)
  }, [puzzle, completed])
  const best = records?.best ?? null

  const remaining = useMemo(() => {
    if (!puzzle) return 0
    let count = 0
    for (let i = 0; i < board.length; i++) if (board[i] === FILLED) count++
    return count
  }, [board, puzzle])

  const totalFilled = useMemo(() => {
    if (!puzzle) return 0
    let count = 0
    for (let i = 0; i < puzzle.solution.length; i++) if (puzzle.solution[i]) count++
    return count
  }, [puzzle])

  if (loadError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-rose-600 dark:text-rose-400">{loadError}</p>
        <Button variant="primary" onClick={() => navigate('/')}>
          返回首页
        </Button>
      </div>
    )
  }

  if (!puzzle) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-ink-500 dark:text-ink-400">
        正在载入题目…
      </div>
    )
  }

  const meta = DIFFICULTY_META[puzzle.difficulty]
  const judgeLabel = judgeMode === 'lenient' ? '宽松' : judgeMode === 'strict' ? '严格' : '极限'

  const onHint = () => {
    const hint = revealHint()
    if (hint && soundOn) playSound('hint')
  }

  const onCheck = () => {
    check()
    if (soundOn) playSound('click')
  }

  const onShare = async () => {
    const url = buildShareUrl(puzzle)
    setShareText(url)
    setShowShare(true)
    try {
      await navigator.clipboard.writeText(url)
      setNotice('分享链接已复制到剪贴板')
    } catch {
      setNotice('请手动复制下面的链接')
    }
  }

  const goNext = () => {
    const seed = Math.random().toString(36).slice(2, 10)
    navigate(`/?start=${puzzle.difficulty}&seed=${seed}`)
  }

  /**
   * 分享成绩（需求 10）。
   * 优先调起系统分享面板（Web Share API，手机浏览器基本都支持）；
   * 不支持时退化成「复制到剪贴板」，两条路都不成功就什么都不做（用户取消分享也会走 catch）。
   */
  const onShareScore = async () => {
    const text = [
      `我刚刚完成了《数织工坊》的${meta.label}谜题！`,
      '',
      `${puzzle.width} × ${puzzle.height}`,
      `⏱ 用时 ${formatDuration(completedMs)}`,
      `❌ 错误 ${mistakes} 次`,
      `💡 提示 ${hintsUsed} 次`,
      '',
      '你能超过我吗？',
      SITE_URL,
    ].join('\n')
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: '数织工坊 · 在线数织游戏', text, url: SITE_URL })
        return
      }
      await navigator.clipboard.writeText(text)
      setNotice('成绩已复制到剪贴板，粘贴给朋友即可')
    } catch {
      /* 用户取消分享：静默处理 */
    }
  }

  // 开局信息页（需求 9.1）：只在「全新开的一局」显示一次。
  // 计时从第一次操作才开始，所以先看一眼难度说明不会影响成绩。
  const estimate = DIFFICULTY_META[puzzle.difficulty].estimatedMinutes
  const showStartOverlay = showStartScreen && !startDismissed && !completed && !paused && !started && !loadError

  return (
    /* 锁一屏高度：棋盘可用空间由 flex 计算，装不下时由下面 <main> 滚动，见 .app-screen */
    <div className="app-screen flex min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-1.5 border-b border-ink-200/70 px-2 py-2 dark:border-ink-800 sm:gap-2 sm:px-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/')} aria-label="返回首页">
          <IconBack />
          <span className="hidden sm:inline">首页</span>
        </Button>

        <div className="flex min-w-0 items-center gap-1.5">
          <Pill>{`${meta.label} · ${puzzle.width}×${puzzle.height}`}</Pill>
          <Pill tone={judgeMode === 'lenient' ? 'default' : judgeMode === 'strict' ? 'warn' : 'danger'}>
            {judgeLabel}
          </Pill>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {showTimer ? (
            <span className="rounded-lg bg-ink-100 px-2.5 py-1 font-mono text-sm font-semibold tabular-nums text-ink-800 dark:bg-ink-800 dark:text-ink-100">
              {formatDuration(elapsed)}
            </span>
          ) : null}
          <Button
            variant={paused ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setPaused(!paused)}
            aria-label={paused ? '继续' : '暂停'}
          >
            {paused ? <IconPlay /> : <IconPause />}
            <span className="hidden sm:inline">{paused ? '继续' : '暂停'}</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate('/settings')} aria-label="设置">
            <IconSettings />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate('/solver')} aria-label="自动解题">
            <IconSolver />
          </Button>
        </div>

        <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
          <Button
            variant="secondary"
            size="sm"
            onClick={undo}
            disabled={past.length === 0 || completed}
            title="撤销 (Ctrl+Z)"
          >
            <IconUndo />
            <span className="hidden md:inline">撤销</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={redo}
            disabled={future.length === 0 || completed}
            title="重做 (Ctrl+Shift+Z)"
          >
            <IconRedo />
            <span className="hidden md:inline">重做</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={onHint} disabled={completed} title="提示 (H)">
            <IconBulb />
            <span className="hidden md:inline">提示</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={onCheck} disabled={completed} title="检查当前填涂">
            <IconCheck />
            <span className="hidden md:inline">检查</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowReset(true)}
            disabled={completed}
            title="重开本题"
          >
            <IconRefresh />
            <span className="hidden md:inline">重置</span>
          </Button>
          <Button variant="secondary" size="sm" onClick={onShare} title="复制分享链接">
            <IconShare />
            <span className="hidden md:inline">分享</span>
          </Button>
        </div>
      </header>

      {/*
        棋盘区在空间足够时会自己缩放塞进一屏（见 useBoardMetrics）；
        空间实在不够（小屏 / 横屏）时棋盘会保持最小可点尺寸，多出来的部分由这里滚动，
        底部状态栏因此一定能滑出来 —— 以前这里没有滚动容器，底部会被直接裁掉。
      */}
      <main className="relative flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-2 sm:p-3">
        <GameBoard />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {/* 移动端模式切换：填充 / 标记 */}
            <div className="inline-flex rounded-xl bg-ink-100 p-0.5 dark:bg-ink-800 sm:hidden">
              {(['fill', 'mark'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSetting('paintMode', mode)}
                  className={`rounded-[10px] px-3 py-1.5 text-xs font-medium ${
                    paintMode === mode ? 'bg-white shadow-sm dark:bg-ink-700' : 'text-ink-500 dark:text-ink-400'
                  }`}
                >
                  {mode === 'fill' ? '涂黑模式' : '标记模式'}
                </button>
              ))}
            </div>
            <span className="text-xs text-ink-500 dark:text-ink-400">
              已填 {remaining} / {totalFilled}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-ink-500 dark:text-ink-400">
            <span>错误 {mistakes}</span>
            <span>提示 {hintsUsed}</span>
            {checks > 0 ? <span>检查 {checks}</span> : null}
            {best ? <span className="font-mono">最佳 {formatDuration(best.timeMs)}</span> : null}
          </div>
        </div>

        {notice ? (
          <div className="animate-fadeIn pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 rounded-xl bg-ink-900/90 px-3 py-1.5 text-xs text-white shadow-lg dark:bg-ink-100/95 dark:text-ink-900">
            {notice}
          </div>
        ) : null}

        {paused && !completed ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="已暂停"
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-2xl bg-ink-50/95 backdrop-blur-sm dark:bg-ink-950/95"
          >
            <IconPause size={28} className="text-ink-400" />
            <p className="text-sm text-ink-600 dark:text-ink-300">已暂停 · 用时 {formatDuration(elapsed)}</p>
            <p className="text-xs text-ink-400">棋盘已遮住，避免偷看</p>
            <Button variant="primary" onClick={() => setPaused(false)}>
              <IconPlay />
              继续游戏
            </Button>
          </div>
        ) : null}

        {showStartOverlay ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="开局信息"
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-2xl bg-ink-50/95 p-4 text-center backdrop-blur-sm dark:bg-ink-950/95"
          >
            <Pill>
              {meta.label} · {puzzle.width}×{puzzle.height}
            </Pill>
            <h2 className="text-base font-semibold text-ink-900 dark:text-white">准备好了吗？</h2>
            <p className="text-xs text-ink-600 dark:text-ink-300">
              预计用时 {estimate[0]}–{estimate[1]} 分钟
              {typeof puzzle.score === 'number' ? ` · 难度 ${puzzle.score} / 100` : ''}
            </p>
            {puzzle.title ? <p className="text-xs text-ink-500 dark:text-ink-400">{puzzle.title}</p> : null}
            <p className="max-w-xs text-[11px] leading-relaxed text-ink-400">
              计时从第一次涂格开始，现在想看多久都不影响成绩。可以使用 {judgeLabel}
              判定模式；点右上角「暂停」会遮住棋盘。
            </p>
            <Button variant="primary" onClick={() => setStartDismissed(true)}>
              <IconPlay />
              开始游戏
            </Button>
          </div>
        ) : null}
      </main>

      <Modal
        open={showReset}
        title="重新开始本题？"
        onClose={() => setShowReset(false)}
        footer={
          <>
            <Button onClick={() => setShowReset(false)}>取消</Button>
            <Button
              variant="danger"
              onClick={() => {
                restart()
                setShowReset(false)
              }}
            >
              确认重开
            </Button>
          </>
        }
      >
        <p>当前的填涂、计时与错误记录都会被清空，确定要重新开始吗？</p>
      </Modal>

      <Modal
        open={showShare}
        title="分享这道题"
        onClose={() => setShowShare(false)}
        footer={
          <Button variant="primary" onClick={() => setShowShare(false)}>
            好
          </Button>
        }
      >
        <p className="text-xs text-ink-500 dark:text-ink-400">
          链接内已包含图案与尺寸（位压缩 + base64url），对方打开即可开局，题面唯一解。
        </p>
        <textarea
          readOnly
          value={shareText}
          rows={3}
          onFocus={(event) => event.currentTarget.select()}
          className="w-full resize-none rounded-xl border border-ink-200 bg-ink-50 p-2 font-mono text-[11px] text-ink-700 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-200"
        />
      </Modal>

      {/* 完成结果页（需求 9.2）：不只是弹一句 Congratulations */}
      <Modal
        open={completed}
        title="🎉 Puzzle Complete!"
        wide
        onClose={() => navigate('/')}
        footer={
          <>
            <Button onClick={onShareScore}>
              <IconShare />
              分享成绩
            </Button>
            <Button onClick={() => navigate('/')}>返回首页</Button>
            <Button variant="primary" onClick={goNext}>
              再来一题（{meta.label}）
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="用时" value={formatDuration(completedMs)} />
          <Stat label="错误" value={mistakes} />
          <Stat label="提示" value={hintsUsed} />
          <Stat label="难度" value={`${meta.label} ${puzzle.width}×${puzzle.height}`} />
        </div>

        {newRecord ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-amber-600 dark:text-amber-400">
            <IconTrophy size={16} /> New Record! 刷新了本题最佳成绩
          </p>
        ) : best ? (
          <p className="text-xs text-ink-500 dark:text-ink-400">本题最佳成绩：{formatDuration(best.timeMs)}</p>
        ) : null}

        {newNoHintRecord ? (
          <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <IconTrophy size={14} /> 同时也刷新了「零提示 · 未暂停」最佳成绩
          </p>
        ) : records?.bestNoHints ? (
          <p className="text-xs text-ink-500 dark:text-ink-400">
            零提示最佳：{formatDuration(records.bestNoHints.timeMs)}
          </p>
        ) : null}

        {unlockedAchievements.length > 0 ? (
          <div className="rounded-xl bg-amber-50 px-3 py-2 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-500/25">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
              新解锁 {unlockedAchievements.length} 个成就
            </p>
            <p className="mt-0.5 text-xs text-amber-700/80 dark:text-amber-200/80">
              {unlockedAchievements
                .map((id) => achievementById(id))
                .filter((def) => def !== null)
                .map((def) => `${def.icon} ${def.name}`)
                .join(' · ')}
            </p>
          </div>
        ) : null}

        <p className="text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">
          {judgeMode === 'lenient'
            ? '宽松模式：没有即时判错，全靠你自己核对'
            : judgeMode === 'strict'
              ? '严格模式：涂错会立刻标红'
              : '极限模式：错误会永久留下红痕并累计 +10 秒罚时'}
          {hintsUsed > 0 ? ` · 提示 ${hintsUsed} 次（每次 +${HINT_PENALTY_MS / 1000}s）` : ''}
          {pauseCount > 0 ? ' · 本局暂停过（不计入「零提示 · 未暂停」成绩）' : ''}
        </p>
      </Modal>

      <AchievementToast ids={unlockedAchievements} onDismiss={dismissAchievements} />
    </div>
  )
}
