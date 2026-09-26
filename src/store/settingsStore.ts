import { create } from 'zustand'
import { persist } from 'zustand/middleware'
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
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      set: (key, value) => set({ [key]: value } as unknown as Partial<SettingsState>),
      reset: () => set({ ...DEFAULTS }),
    }),
    { name: 'nonogram-settings-v1' },
  ),
)

export function currentThemeIsDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', currentThemeIsDark(mode))
}
