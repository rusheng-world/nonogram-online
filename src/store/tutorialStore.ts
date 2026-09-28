/**
 * 新手教程的状态机（需求 16 / 28）。
 *
 * 为什么不把教程状态塞进 gameStore：
 *   · 教程的「阶段 / 提示 / 鼓励文案」和游戏引擎（棋盘 / 计时 / 成绩）是两件事，
 *     混在一起会让 gameStore 变成第二个教程模块；
 *   · 这个 store 不依赖 React、也不依赖 gameStore，可以直接当纯状态机驱动来写单测
 *     （tests/tutorial.test.ts 就是这么做的）；
 *   · 页面负责把两者接起来：棋盘状态在 gameStore，教学阶段在这里。
 *
 * 持久化只写 `nonogram-tutorial-v1` 一个 key（tutorialCompleted / tutorialCurrentStep），
 * 教程的用时 / 错误 / 提示不会进入统计（需求 14）。
 */

import { create } from 'zustand'
import { TUTORIAL_STEPS, TUTORIAL_STEP_COUNT } from '../core/tutorial'
import { loadTutorialProgress, saveTutorialProgress } from '../core/storage'
import type { PaintMode } from './settingsStore'

export interface TutorialFeedback {
  text: string
  /** gentle = 「还差一点」的软提示；good = 完成一步的鼓励 */
  tone: 'gentle' | 'good'
}

interface TutorialStore {
  /** 教程页面是否已经接管（false 时 TutorialPage 还在做初始化） */
  active: boolean
  /** 0 = 欢迎页，1..TUTORIAL_STEP_COUNT = 教学阶段 */
  stepIndex: number
  /** 是否完整学完过一遍 */
  completed: boolean
  feedback: TutorialFeedback | null
  hintVisible: boolean
  /** 被拦下的格子：柔和描边指出来，不判错也不扣分 */
  softCells: number[]
  /** 进入教程之前用户自己的画笔模式，退出时还原 */
  savedPaintMode: PaintMode | null
  /** 本次是不是从存档断点续玩 */
  resumed: boolean

  /** 进入教程（startStep 由页面从存档里算出来） */
  begin(startStep: number, resumed: boolean): void
  /** 欢迎页 -> 第 1 阶段 */
  next(): void
  /** 当前阶段完成：展示鼓励语并进入下一阶段；越过最后一阶段即通关 */
  advance(): void
  /** 某次落笔被拒绝 */
  reject(text: string, softCells: number[]): void
  /** 展开 / 收起本阶段的引导 */
  toggleHint(): void
  clearSoft(): void
  rememberPaintMode(mode: PaintMode): void
  markCompleted(): void
  restart(): void
  /** 离开教程页：只清内存状态，进度在每次切换阶段时已经写好了 */
  reset(): void
}

const IDLE = {
  active: false,
  stepIndex: 0,
  completed: false,
  feedback: null as TutorialFeedback | null,
  hintVisible: false,
  softCells: [] as number[],
  resumed: false,
}

/**
 * 写进度。
 * `completed` 一旦拿到就**只会被显式设为 true**：重新进教程、重新走一遍流程
 * 都不会把「已学完」这个标记抹掉（首页/设置页靠它决定入口文案）。
 */
function persist(step: number, completed?: boolean): void {
  const earned = completed ?? loadTutorialProgress()?.completed === true
  saveTutorialProgress({ step, completed: earned })
}

export const useTutorialStore = create<TutorialStore>()((set, get) => ({
  ...IDLE,
  savedPaintMode: null,

  begin(startStep, resumed) {
    const step = Math.max(0, Math.min(TUTORIAL_STEP_COUNT, Math.floor(startStep)))
    set({ ...IDLE, active: true, stepIndex: step, resumed })
    persist(step)
  },

  next() {
    if (get().stepIndex !== 0) return
    set({ ...IDLE, active: true, stepIndex: 1 })
    persist(1)
  },

  advance() {
    const state = get()
    if (!state.active || state.completed || state.stepIndex < 1) return
    const finished = TUTORIAL_STEPS[state.stepIndex - 1]
    if (state.stepIndex >= TUTORIAL_STEP_COUNT) {
      get().markCompleted()
      return
    }
    const nextStep = state.stepIndex + 1
    set({
      stepIndex: nextStep,
      hintVisible: false,
      softCells: [],
      // 上一步的鼓励语留在面板上，接着读新阶段的正文
      feedback: finished ? { text: finished.success, tone: 'good' } : null,
    })
    persist(nextStep)
  },

  reject(text, softCells) {
    set({ feedback: { text, tone: 'gentle' }, softCells, hintVisible: false })
  },

  toggleHint() {
    const state = get()
    set({
      hintVisible: !state.hintVisible,
      // 展开提示时把「还差一点」收起来，避免两条信息打架
      feedback: state.feedback && state.feedback.tone === 'gentle' ? null : state.feedback,
      softCells: [],
    })
  },

  clearSoft() {
    if (get().softCells.length === 0) return
    set({ softCells: [] })
  },

  rememberPaintMode(mode) {
    set({ savedPaintMode: mode })
  },

  markCompleted() {
    set({ completed: true, feedback: null, hintVisible: false, softCells: [] })
    persist(TUTORIAL_STEP_COUNT, true)
  },

  restart() {
    set({ ...IDLE, active: true, stepIndex: 0 })
    persist(0)
  },

  reset() {
    set({ ...IDLE, savedPaintMode: null })
  },
}))

/** 是否已经学完过一遍（首页用它决定入口文案） */
export function hasCompletedTutorial(): boolean {
  return loadTutorialProgress()?.completed === true
}

/**
 * 从存档里读出上次学到哪一步。
 *
 * 只在「已经完全学完、且没有重新开始过」时返回 0（让老玩家从欢迎页重新看一遍），
 * 其余情况一律回到上次的阶段 —— 包括「学完之后又从头学一遍，中途离开」这种情况，
 * 否则刷新一次就会把人踢回欢迎页。
 */
export function resumeStep(): number {
  const saved = loadTutorialProgress()
  if (!saved) return 0
  if (saved.completed && saved.step >= TUTORIAL_STEP_COUNT) return 0
  return Math.max(0, Math.min(TUTORIAL_STEP_COUNT, saved.step))
}
