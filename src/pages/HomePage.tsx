import { useCallback, useEffect, useRef, useState } from 'react'
import {
  IconCalendar,
  IconChart,
  IconGithub,
  IconPencil,
  IconPlay,
  IconRefresh,
  IconSettings,
  IconSolver,
  IconTrash,
  IconTrophy,
} from '../components/icons'
import { Button, Card, Modal, Pill } from '../components/ui'
import { getDailyChallenge, msUntilNextDaily, type DailyChallengeInfo } from '../core/dailyChallenge'
import { safeDifficulty } from '../core/generator'
import { randomSeed } from '../core/rng'
import { loadDailyRecords, type DailyRecord } from '../core/storage'
import {
  clearHistory,
  loadHistory,
  loadProgress,
  loadRecords,
  type HistoryEntry,
  type StoredProgress,
} from '../core/storage'
import { DIFFICULTIES, DIFFICULTY_META, type Difficulty } from '../core/types'
import { createNewGame } from '../game/newGame'
import { formatDuration } from '../hooks/useElapsed'
import { REPO_URL, SITE_URL } from '../project'
import { navigate } from '../router'
import { useGameStore } from '../store/gameStore'
import { applyTheme, useSettingsStore } from '../store/settingsStore'
import { hasCompletedTutorial } from '../store/tutorialStore'

const ACCENT: Record<string, string> = {
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  sky: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  rose: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
}

function countRecordsByDifficulty(): Record<Difficulty, number> {
  const counts: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0, expert: 0 }
  const records = loadRecords()
  for (const key of Object.keys(records)) {
    const difficulty = key.slice(0, key.indexOf(':')) as Difficulty
    if (difficulty in counts) counts[difficulty] += 1
  }
  return counts
}

export function HomePage({ params }: { params: URLSearchParams }): JSX.Element {
  const judgeMode = useSettingsStore((s) => s.judgeMode)
  const theme = useSettingsStore((s) => s.theme)
  const setSetting = useSettingsStore((s) => s.set)
  const startPuzzle = useGameStore((s) => s.startPuzzle)

  const [busy, setBusy] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(() => params.get('error'))
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory())
  const [saved, setSaved] = useState<StoredProgress | null>(() => loadProgress())
  const [showClear, setShowClear] = useState(false)
  const busyRef = useRef(false)
  const launchedRef = useRef(false)

  // 「每档已有几个最佳成绩」独立存 state：它读的是 records（与 history 不是同一份数据）
  const [recordCounts, setRecordCounts] = useState(() => countRecordsByDifficulty())
  /** 教程是否已经学完一遍（只影响入口文案，不影响任何成绩） */
  const [tutorialDone, setTutorialDone] = useState(() => hasCompletedTutorial())
  /** 每日挑战：难度 / 种子 / 尺寸全部由 UTC 日期决定（见 core/dailyChallenge.ts） */
  const [daily, setDaily] = useState<DailyChallengeInfo>(() => getDailyChallenge())
  const [dailyRecord, setDailyRecord] = useState<DailyRecord | null>(null)
  const countdown = formatCountdown(msUntilNextDaily())

  /**
   * 生成并开始一局。
   * 生成是同步的（20×20 约几毫秒），这里先切到 loading 遮罩、让浏览器完成一次绘制，
   * 再把主线程交给生成函数，避免长任务期间界面完全冻结。
   */
  const launch = useCallback(
    (difficulty: Difficulty, seed: string, label: string) => {
      if (busyRef.current) return
      busyRef.current = true
      setBanner(null)
      setBusy(label)
      window.setTimeout(() => {
        const outcome = createNewGame(difficulty, seed)
        const puzzle = outcome.puzzle
        startPuzzle(puzzle, judgeMode)
        if (outcome.notice) useGameStore.getState().setNotice(outcome.notice)
        busyRef.current = false
        setBusy(null)
        navigate(`/play?p=${encodeURIComponent(puzzle.id)}`)
      }, 32)
    },
    [judgeMode, startPuzzle],
  )

  // 「再来一局」：GamePage 完成后跳回首页并带上 ?start=<难度>&seed=<种子>
  useEffect(() => {
    const start = params.get('start')
    if (!start || launchedRef.current) return
    launchedRef.current = true
    const difficulty = safeDifficulty(start)
    launch(difficulty, params.get('seed') ?? randomSeed(), `正在生成「${DIFFICULTY_META[difficulty].label}」…`)
  }, [params, launch])

  // 从游戏页返回时刷新存档 / 历史 / 每日挑战记录。
  // 每 60 秒重新取一次「今天是哪一天」，这样跨过 UTC 零点后页面会自动换题。
  useEffect(() => {
    const sync = () => {
      const info = getDailyChallenge()
      setDaily(info)
      setDailyRecord(loadDailyRecords()[info.date] ?? null)
    }
    sync()
    setSaved(loadProgress())
    setHistory(loadHistory())
    setRecordCounts(countRecordsByDifficulty())
    setTutorialDone(hasCompletedTutorial())
    const timer = window.setInterval(sync, 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const onToggleTheme = () => {
    const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark'
    setSetting('theme', next)
    applyTheme(next)
  }

  const onClearHistory = () => {
    clearHistory()
    setHistory([])
    setShowClear(false)
  }

  return (
    /*
     * 首页内容通常比手机屏幕高，这里不再自己当滚动容器
     * （min-height:100% + overflow-y:auto 在高度 auto 的盒子上永远不会滚动），
     * 交给文档滚动即可，sticky 头部依然生效。
     */
    <div className="app-flow flex flex-1 flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-ink-200/70 bg-ink-50/85 px-3 py-2.5 backdrop-blur dark:border-ink-800 dark:bg-ink-950/85 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-indigo-600 text-sm font-bold text-white">
            数
          </span>
          <div className="leading-tight">
            <h1 className="text-sm font-semibold text-ink-900 dark:text-white">Nonogram Online</h1>
            <p className="text-[11px] text-ink-500 dark:text-ink-400">数织工坊 · 在线数织游戏</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={onToggleTheme} title="切换明暗主题">
            {theme === 'dark' ? '深色' : '浅色'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate('/editor')} aria-label="自定义编辑器">
            <IconPencil />
            <span className="hidden sm:inline">编辑器</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate('/solver')} aria-label="自动解题">
            <IconSolver />
            <span className="hidden sm:inline">自动解题</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate('/settings')} aria-label="设置">
            <IconSettings />
            <span className="hidden sm:inline">设置</span>
          </Button>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="项目仓库（GitHub）"
            title={`项目仓库：${REPO_URL}`}
            className="inline-flex select-none items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-700 transition-colors hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800"
          >
            <IconGithub />
            <span className="hidden sm:inline">GitHub</span>
          </a>
        </div>
      </header>

      <main className="mx-auto flex max-w-4xl flex-col gap-4 p-3 sm:p-6">
        {banner ? (
          <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30">
            <span className="flex-1">{banner}</span>
            <button type="button" className="shrink-0 underline" onClick={() => setBanner(null)}>
              知道了
            </button>
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2">
          {/* 继续上一局 */}
          {saved && !saved.completed ? (
            <Card className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <IconRefresh size={16} className="text-indigo-500" />
                <h2 className="text-sm font-semibold text-ink-900 dark:text-white">继续上一局</h2>
              </div>
              <p className="text-xs text-ink-500 dark:text-ink-400">
                {DIFFICULTY_META[saved.difficulty].label} · {saved.width}×{saved.height} · 已用时{' '}
                {formatDuration(saved.elapsedMs)} · 错误 {saved.mistakes}
              </p>
              <Button variant="primary" onClick={() => navigate('/play')} className="self-start">
                <IconPlay />
                继续游戏
              </Button>
            </Card>
          ) : null}

          {/* 每日挑战：所有人当天拿到同一道题 */}
          <Card className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <IconCalendar size={16} className="text-sky-500" />
              <h2 className="text-sm font-semibold text-ink-900 dark:text-white">每日挑战</h2>
              <Pill tone={dailyRecord ? 'success' : 'default'}>{daily.date}</Pill>
              <span className="text-[11px] text-ink-400">
                {DIFFICULTY_META[daily.difficulty].label} · {daily.width}×{daily.height}
              </span>
            </div>
            {dailyRecord ? (
              <div className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/25">
                <div className="font-semibold">今天已完成 ✓</div>
                <div className="mt-0.5 tabular-nums">
                  ⏱ {formatDuration(dailyRecord.timeMs)} · 错误 {dailyRecord.mistakes} · 提示 {dailyRecord.hintsUsed}
                </div>
              </div>
            ) : (
              <p className="text-xs text-ink-500 dark:text-ink-400">
                每天一道固定题目，全世界同一个种子，刷新不会换题。日期按 UTC 计算，{countdown}后换新题。
              </p>
            )}
            <Button
              variant={dailyRecord ? 'secondary' : 'primary'}
              className="self-start"
              onClick={() => launch(daily.difficulty, daily.seed, '正在生成今日题目…')}
            >
              <IconPlay />
              {dailyRecord ? '再挑战一次（只保留更快的成绩）' : '开始今日挑战'}
            </Button>
          </Card>
        </section>

        {/* 难度选择 */}
        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-ink-900 dark:text-white">选择难度</h2>
            <span className="text-[11px] text-ink-500 dark:text-ink-400">难度由求解器的推理成本评估，不只看尺寸</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {DIFFICULTIES.map((difficulty) => {
              const meta = DIFFICULTY_META[difficulty]
              return (
                <Card key={difficulty} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ACCENT[meta.accent]}`}>
                      {meta.label}
                    </span>
                    <span className="text-[11px] text-ink-400">
                      {meta.boardSize}×{meta.boardSize}
                    </span>
                  </div>
                  <p className="min-h-[32px] text-[11px] leading-snug text-ink-500 dark:text-ink-400">
                    {meta.description}
                  </p>
                  <p className="text-[11px] text-ink-400">
                    预计 {meta.estimatedMinutes[0]}–{meta.estimatedMinutes[1]} 分钟
                  </p>
                  <div className="flex items-center gap-1 text-[11px] text-ink-400">
                    <IconTrophy size={13} />
                    已有 {recordCounts[difficulty]} 个最佳成绩
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    className="mt-auto"
                    onClick={() => launch(difficulty, randomSeed(), `正在生成「${meta.label}」题目…`)}
                  >
                    <IconPlay />
                    开始
                  </Button>
                </Card>
              )
            })}
          </div>
        </section>

        {/* 新手教程（需求 25：入口要显眼但不要抢首页最大的位置） */}
        <Card className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink-900 dark:text-white">
              🧩 新手教程
              {tutorialDone ? <Pill tone="success">✓ 已完成教程</Pill> : null}
            </h2>
            <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
              第一次玩数织？跟着一个 5×5 的小图案边玩边学：数字怎么读、行列怎么看、× 什么时候用得上，三分钟上手。
            </p>
          </div>
          <Button variant={tutorialDone ? 'secondary' : 'primary'} onClick={() => navigate('/tutorial')}>
            {tutorialDone ? '重新学习' : '开始教程'}
          </Button>
        </Card>

        {/* 自定义入口 */}
        <Card className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-ink-900 dark:text-white">自定义数织</h2>
            <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
              自己画图案，或用「#」/「.」文本导入，系统实时计算线索、检查是否唯一解，并可生成分享链接。
            </p>
          </div>
          <Button variant="primary" onClick={() => navigate('/editor')}>
            <IconPencil />
            打开编辑器
          </Button>
        </Card>

        {/* 自动解题入口 */}
        <Card className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-ink-900 dark:text-white">自动解题 · Solver Playground</h2>
            <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
              输入尺寸和行/列线索，让求解器算出答案，并逐步演示「行列推理 → 假设 → 回退」的完整推理过程。
            </p>
          </div>
          <Button variant="primary" onClick={() => navigate('/solver')}>
            <IconSolver />
            打开自动解题
          </Button>
        </Card>

        {/* 统计与成就入口 */}
        <Card className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink-900 dark:text-white">
              <IconChart size={16} className="text-indigo-500" />
              统计与成就
            </h2>
            <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
              完成题数、连续挑战天数、各难度最快成绩、最近对局，以及 10 项成就的解锁进度。
            </p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/stats')}>
            查看统计
          </Button>
        </Card>

        {/* 历史成绩 */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink-900 dark:text-white">
              <IconTrophy size={16} className="text-amber-500" />
              历史成绩
              <span className="text-[11px] font-normal text-ink-400">（最近 {history.length} 条）</span>
            </h2>
            {history.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => setShowClear(true)}>
                <IconTrash size={15} />
                清空
              </Button>
            ) : null}
          </div>
          <Card className="p-0">
            {history.length === 0 ? (
              <p className="p-4 text-xs text-ink-500 dark:text-ink-400">还没有完成的记录，挑一个难度开始吧。</p>
            ) : (
              <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                {history.slice(0, 12).map((entry) => (
                  <li
                    key={`${entry.puzzleId}-${entry.completedAt}`}
                    className="flex items-center gap-3 px-3 py-2 text-xs"
                  >
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ACCENT[DIFFICULTY_META[entry.difficulty].accent]}`}
                    >
                      {DIFFICULTY_META[entry.difficulty].label}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-ink-500 dark:text-ink-400">
                      {entry.title ?? `${entry.width}×${entry.height}`}
                    </span>
                    <span className="font-mono tabular-nums text-ink-700 dark:text-ink-200">
                      {formatDuration(entry.timeMs)}
                    </span>
                    <span className="w-16 text-right text-ink-400">
                      错 {entry.mistakes} · 提示 {entry.hintsUsed}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        <footer className="space-y-1 pb-6 text-[11px] leading-relaxed text-ink-400">
          <p>
            操作：点击涂黑 / 右键（或长按）标记 X / 拖拽连续涂 / 方向键移动光标、空格涂黑、X 标记、Delete 清除、Ctrl+Z
            撤销。 进度与成绩保存在浏览器本地，关闭页面后可以继续。
          </p>
          <p>
            项目仓库：
            <a
              className="underline underline-offset-2 hover:text-ink-600 dark:hover:text-ink-200"
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
            >
              {REPO_URL}
            </a>
            <span className="mx-1.5">·</span>
            在线试玩：
            <a
              className="underline underline-offset-2 hover:text-ink-600 dark:hover:text-ink-200"
              href={SITE_URL}
              target="_blank"
              rel="noreferrer"
            >
              {SITE_URL}
            </a>
          </p>
        </footer>
      </main>

      {busy ? (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-ink-50/90 backdrop-blur-sm dark:bg-ink-950/90">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-ink-300 border-t-indigo-500 dark:border-ink-700 dark:border-t-indigo-400" />
          <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{busy}</p>
          <p className="text-[11px] text-ink-500 dark:text-ink-400">求解器正在校验唯一解，通常只需几毫秒</p>
        </div>
      ) : null}

      <Modal
        open={showClear}
        title="清空历史成绩？"
        onClose={() => setShowClear(false)}
        footer={
          <>
            <Button onClick={() => setShowClear(false)}>取消</Button>
            <Button variant="danger" onClick={onClearHistory}>
              确认清空
            </Button>
          </>
        }
      >
        <p>历史成绩会被删除；每个谜题的最佳成绩记录不受影响，可在设置里单独清除。</p>
      </Modal>
    </div>
  )
}
/** 距离下一次换题（UTC 零点）的可读倒计时 */
function formatCountdown(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `${hours} 小时 ${minutes} 分`
  return `${Math.max(1, minutes)} 分钟`
}
