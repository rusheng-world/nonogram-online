import { useEffect, useState } from 'react'
import { elapsedOf, useGameStore } from '../store/gameStore'

/**
 * 显示用计时。
 *
 * 真正的时长永远用「时间戳差值」计算（accumulatedMs + now - runningSince），
 * requestAnimationFrame 只以约 5Hz 触发一次重渲染用于刷新显示：
 * 后台标签页被节流时不会累积误差，暂停/恢复也不会漂移。
 */
export function useElapsedMs(): number {
  const accumulatedMs = useGameStore((s) => s.accumulatedMs)
  const runningSince = useGameStore((s) => s.runningSince)
  const completed = useGameStore((s) => s.completed)
  const completedMs = useGameStore((s) => s.completedMs)
  const [, force] = useState(0)

  useEffect(() => {
    if (!runningSince || completed) return
    let raf = 0
    let last = 0
    const loop = (time: number) => {
      if (time - last > 200) {
        last = time
        force((n) => n + 1)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [runningSince, completed])

  if (completed) return completedMs
  return elapsedOf({ accumulatedMs, runningSince })
}

/** 毫秒 -> mm:ss（超过一小时显示 h:mm:ss） */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}
