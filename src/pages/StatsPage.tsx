import { useState } from 'react'
import { IconBack, IconCalendar, IconMedal, IconTrash, IconTrophy } from '../components/icons'
import { Button, Card, Modal, Pill, Stat } from '../components/ui'
import { ACHIEVEMENTS, achievementContext } from '../core/achievements'
import { computeStatistics } from '../core/statistics'
import { clearDailyRecords, clearHistory, loadAchievements, loadDailyRecords, loadHistory } from '../core/storage'
import { DIFFICULTIES, DIFFICULTY_META } from '../core/types'
import { formatDuration } from '../hooks/useElapsed'
import { navigate } from '../router'

const ACCENT: Record<string, string> = {
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  sky: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  rose: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
}

/**
 * 统计页（需求 7）。
 *
 * 数据全部现算（历史成绩 + 每日挑战记录），所以不存在「统计与明细对不上」的问题。
 * 页面刻意做成「只读 + 一个清空按钮」，没有别的可操作项。
 */
/** 进页面（或点「清空统计」后）一次性读完所需数据，避免散落的 useMemo 依赖。 */
function readStatsSnapshot() {
  const stats = computeStatistics()
  const unlocked = loadAchievements()
  // 成就判定要看完整历史（不能只用 stats 里截断过的前 10 条），所以单独读一次
  const ctx = achievementContext(loadHistory(), loadDailyRecords())
  const achievements = ACHIEVEMENTS.map((def) => ({ def, progress: def.progress(ctx) }))
  return { stats, unlocked, achievements }
}

export function StatsPage(): JSX.Element {
  const [snapshot, setSnapshot] = useState(readStatsSnapshot)
  const [showClear, setShowClear] = useState(false)
  const { stats, unlocked, achievements } = snapshot

  const refresh = () => setSnapshot(readStatsSnapshot())

  return (
    /* 内容可能很长：交给文档滚动，手机上可以正常上下滑动 */
    <div className="app-flow flex flex-1 flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-ink-200/70 bg-ink-50/85 px-3 py-2.5 backdrop-blur dark:border-ink-800 dark:bg-ink-950/85 sm:px-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
          <IconBack />
          返回
        </Button>
        <h1 className="text-sm font-semibold text-ink-900 dark:text-white">统计与成就</h1>
        {(stats.totalSolved > 0 || stats.dailySolved > 0) && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setShowClear(true)}>
            <IconTrash size={15} />
            清空统计
          </Button>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-3 sm:p-6">
        <Card className="space-y-3">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink-900 dark:text-white">
            <IconTrophy size={16} className="text-amber-500" />
            总览
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="完成题数" value={stats.totalSolved} />
            <Stat label="每日挑战" value={`${stats.dailySolved} 天`} hint="以 UTC 日期计算" />
            <Stat label="连续完成" value={`${stats.streak.current} 天`} hint={`最长 ${stats.streak.longest} 天`} />
            <Stat label="平均用时" value={stats.averageMs === null ? '—' : formatDuration(stats.averageMs)} />
            <Stat label="最快一次" value={stats.fastestMs === null ? '—' : formatDuration(stats.fastestMs)} />
            <Stat label="零提示通关" value={`${stats.noHintSolves} 次`} hint="未使用提示且未暂停" />
            <Stat label="累计提示" value={`${stats.hintsUsed} 次`} />
            <Stat label="累计错误" value={`${stats.mistakes} 次`} />
          </div>
        </Card>

        <Card className="space-y-2">
          <h2 className="text-sm font-semibold text-ink-900 dark:text-white">各难度完成情况</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DIFFICULTIES.map((difficulty) => {
              const meta = DIFFICULTY_META[difficulty]
              const bucket = stats.byDifficulty[difficulty]
              return (
                <div key={difficulty} className="rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-800/60">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ACCENT[meta.accent]}`}>
                    {meta.label}
                  </span>
                  <div className="mt-1.5 text-sm font-semibold tabular-nums text-ink-900 dark:text-white">
                    {bucket.solved} 题
                  </div>
                  <div className="text-[11px] text-ink-500 dark:text-ink-400">
                    最快 {bucket.fastestMs === null ? '—' : formatDuration(bucket.fastestMs)}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        <Card className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink-900 dark:text-white">
            <IconCalendar size={16} className="text-sky-500" />
            每日挑战（最近 14 个 UTC 日）
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {stats.recentDaily.map((item) => {
              const record = item.record
              return (
                <div
                  key={item.date}
                  title={
                    record
                      ? `${item.date} · ${DIFFICULTY_META[record.difficulty].label} · ${formatDuration(record.timeMs)}`
                      : `${item.date} · 未完成`
                  }
                  className={`flex h-14 w-14 flex-col items-center justify-center rounded-xl text-[10px] leading-tight ${
                    record
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                      : 'bg-ink-100 text-ink-400 dark:bg-ink-800'
                  }`}
                >
                  <span className="tabular-nums">{item.date.slice(5)}</span>
                  <span className="mt-0.5 font-semibold">{record ? '✓' : '—'}</span>
                </div>
              )
            })}
          </div>
        </Card>

        <Card className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink-900 dark:text-white">
            <IconMedal size={16} className="text-indigo-500" />
            成就
            <span className="text-[11px] font-normal text-ink-400">
              （{Object.keys(unlocked).length} / {ACHIEVEMENTS.length}）
            </span>
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {achievements.map(({ def, progress }) => {
              const isUnlocked = unlocked[def.id] !== undefined
              return (
                <li
                  key={def.id}
                  className={`rounded-xl px-3 py-2 ring-1 ${
                    isUnlocked
                      ? 'bg-amber-50 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-500/25'
                      : 'bg-ink-50 ring-ink-200/60 dark:bg-ink-800/50 dark:ring-ink-700/60'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-lg ${isUnlocked ? '' : 'opacity-40 grayscale'}`} aria-hidden="true">
                      {def.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-semibold text-ink-800 dark:text-ink-100">
                          {def.name}
                        </span>
                        {isUnlocked ? <Pill tone="success">已解锁</Pill> : null}
                      </div>
                      <div className="truncate text-[11px] text-ink-500 dark:text-ink-400">{def.description}</div>
                    </div>
                    {!isUnlocked && progress.target > 1 ? (
                      <span className="shrink-0 text-[11px] tabular-nums text-ink-400">
                        {progress.current}/{progress.target}
                      </span>
                    ) : null}
                  </div>
                  {!isUnlocked && progress.target > 1 ? (
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-ink-200 dark:bg-ink-700">
                      <div
                        className="h-full rounded-full bg-indigo-500"
                        style={{ width: `${Math.round((progress.current / progress.target) * 100)}%` }}
                      />
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </Card>

        <Card className="space-y-2">
          <h2 className="text-sm font-semibold text-ink-900 dark:text-white">最近 10 局</h2>
          {stats.recent.length === 0 ? (
            <p className="text-xs text-ink-500 dark:text-ink-400">还没有完成的记录。</p>
          ) : (
            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
              {stats.recent.map((entry) => (
                <li key={`${entry.puzzleId}-${entry.completedAt}`} className="flex items-center gap-2 py-1.5 text-xs">
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      ACCENT[DIFFICULTY_META[entry.difficulty].accent]
                    }`}
                  >
                    {DIFFICULTY_META[entry.difficulty].label}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink-500 dark:text-ink-400">
                    {entry.daily ? '每日挑战 · ' : ''}
                    {entry.title ?? `${entry.width}×${entry.height}`}
                  </span>
                  <span className="font-mono tabular-nums text-ink-700 dark:text-ink-200">
                    {formatDuration(entry.timeMs)}
                  </span>
                  <span className="hidden w-24 text-right text-ink-400 sm:block">
                    错 {entry.mistakes} · 提示 {entry.hintsUsed}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <p className="pb-6 text-[11px] leading-relaxed text-ink-400">
          统计只存在这台设备的浏览器里（localStorage），不会上传到任何服务器。每日挑战与连续天数一律按 UTC
          日期计算，避免不同时区下「同一天」不一致。
        </p>
      </main>

      <Modal
        open={showClear}
        title="清空统计数据？"
        onClose={() => setShowClear(false)}
        footer={
          <>
            <Button onClick={() => setShowClear(false)}>取消</Button>
            <Button
              variant="danger"
              onClick={() => {
                clearHistory()
                clearDailyRecords()
                setShowClear(false)
                refresh()
              }}
            >
              确认清空
            </Button>
          </>
        }
      >
        <p>历史成绩与每日挑战记录会被删除；已解锁的成就与最佳成绩不受影响。</p>
      </Modal>
    </div>
  )
}
