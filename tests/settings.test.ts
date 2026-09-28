/**
 * 设置存储（zustand/persist）与主题判定的回归测试。
 *
 * 重点覆盖审查报告 M-03 的兼容性缺口：`currentThemeIsDark` 此前直接调用
 * `window.matchMedia(...)`，在没有 matchMedia 的环境（老浏览器 / 受限 WebView）
 * 且主题为「跟随系统」时会抛 TypeError —— 而它是在 effect 里被调用的，
 * 一抛就把整棵 React 树干掉（白屏）。这里把这个行为钉死。
 */
import { afterEach, describe, expect, it } from 'vitest'

type Mql = { matches: boolean; addEventListener?: () => void; removeEventListener?: () => void }

function setWindow(value: unknown): void {
  Object.defineProperty(globalThis, 'window', { value, configurable: true, writable: true })
}

afterEach(() => {
  // 不留下全局污染：删掉本文件装上去的 window
  delete (globalThis as { window?: unknown }).window
})

describe('主题判定：currentThemeIsDark', () => {
  it('dark / light 是确定的，不需要任何浏览器 API', async () => {
    const { currentThemeIsDark } = await import('../src/store/settingsStore')
    expect(currentThemeIsDark('dark')).toBe(true)
    expect(currentThemeIsDark('light')).toBe(false)
  })

  it('跟随系统但没有 matchMedia 时返回 false，而不是抛异常', async () => {
    setWindow({})
    const { currentThemeIsDark } = await import('../src/store/settingsStore')
    expect(() => currentThemeIsDark('system')).not.toThrow()
    expect(currentThemeIsDark('system')).toBe(false)
  })

  it('没有 window 时（SSR / 测试环境）也不抛异常', async () => {
    const { currentThemeIsDark } = await import('../src/store/settingsStore')
    expect(() => currentThemeIsDark('system')).not.toThrow()
    expect(currentThemeIsDark('system')).toBe(false)
  })

  it('跟随系统且有 matchMedia 时读取系统偏好', async () => {
    const { currentThemeIsDark } = await import('../src/store/settingsStore')
    setWindow({ matchMedia: (query: string): Mql => ({ matches: query.includes('dark') }) })
    expect(currentThemeIsDark('system')).toBe(true)
    setWindow({ matchMedia: (): Mql => ({ matches: false }) })
    expect(currentThemeIsDark('system')).toBe(false)
  })
})
