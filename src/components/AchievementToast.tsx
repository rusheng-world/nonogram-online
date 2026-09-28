import { useEffect, useMemo } from 'react'
import { achievementById } from '../core/achievements'

/**
 * 「新解锁成就」的浮动提示。
 *
 * 设计约束（需求 8）：解锁动画要轻量、**不能遮挡游戏** ——
 * 因此固定在底部居中、半透明、`pointer-events-none`（除关闭按钮外不拦截点击），
 * 6 秒后自动消失，玩家也可以手动关掉。
 */
export function AchievementToast({
  ids,
  onDismiss,
}: {
  ids: readonly string[]
  onDismiss: () => void
}): JSX.Element | null {
  const items = useMemo(() => ids.map((id) => achievementById(id)).filter((def) => def !== null), [ids])

  useEffect(() => {
    if (items.length === 0) return
    const timer = window.setTimeout(onDismiss, 6000)
    return () => window.clearTimeout(timer)
  }, [items, onDismiss])

  if (items.length === 0) return null

  return (
    <div
      className="animate-fadeIn pointer-events-none fixed bottom-4 left-1/2 z-40 flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {items.map((def) => (
        <div
          key={def.id}
          className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-ink-900/95 px-3 py-2.5 text-white shadow-xl ring-1 ring-white/10 dark:bg-ink-800"
        >
          <span className="text-xl" aria-hidden="true">
            {def.icon}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium text-amber-300">成就解锁</div>
            <div className="truncate text-sm font-semibold">{def.name}</div>
            <div className="truncate text-[11px] text-white/70">{def.description}</div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="关闭成就提示"
            className="rounded-lg p-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
