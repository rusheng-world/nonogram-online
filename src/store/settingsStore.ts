import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { SETTINGS_KEY } from '../core/storage'
import type { JudgeMode, ThemeMode } from '../core/types'

export type PaintMode = 'fill' | 'mark'

export interface SettingsState {
  /** 判定模式：宽松 / 严格 / 极限 */
  judgeMode: JudgeMode
  theme: ThemeMode
  showTimer: boolean
  /** 每 5 格加深辅助线 */
  gridGuides: boolean
  /** 线索自动划线：某条线索确定后把对应数字划掉 */
  strikeClues: boolean
  sound: boolean
  /** 使用提示是否加罚时 */
  hintPenalty: boolean
  /** 页面失焦自动暂停 */
  autoPause: boolean
  /** 移动端：默认画笔模式 */
  paintMode: PaintMode
  /** 开局前显示「难度 / 预计用时」信息页（计时从第一次操作才开始，所以不影响成绩） */
  showStartScreen: boolean
  set<K extends keyof SettingsState>(key: K, value: SettingsState[K]): void
  reset(): void
}

const DEFAULTS = {
  judgeMode: 'lenient' as JudgeMode,
  theme: 'system' as ThemeMode,
  showTimer: true,
  gridGuides: true,
  strikeClues: true,
  sound: true,
  hintPenalty: true,
  autoPause: true,
  paintMode: 'fill' as PaintMode,
  showStartScreen: true,
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      set: (key, value) => set({ [key]: value } as unknown as Partial<SettingsState>),
      reset: () => set({ ...DEFAULTS }),
    }),
    {
      name: SETTINGS_KEY,
      /*
       * 设置损坏时（JSON 坏了 / 结构不对）persist 会**静默**回退到默认值：
       * 玩家看到的是「设置莫名被重置」，而开发者拿不到任何线索（L-02）。
       * 这里补一条 warn —— 行为不变（仍然安全回退到默认值，不会白屏），只是可观测。
       */
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn('[nonogram] 本地设置读取失败，已回退到默认设置：', error)
      },
    },
  ),
)

export function currentThemeIsDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true
  if (mode === 'light') return false
  // 老浏览器 / 测试环境可能没有 matchMedia：不能因为「跟随系统」就把页面搞崩
  // （App.tsx 的监听侧一直有这个判断，这里此前漏了，见审查报告 M-03）
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', currentThemeIsDark(mode))
}
