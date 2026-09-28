import { useEffect } from 'react'
import { Button } from './components/ui'
import { EditorPage } from './pages/EditorPage'
import { GamePage } from './pages/GamePage'
import { HomePage } from './pages/HomePage'
import { SettingsPage } from './pages/SettingsPage'
import { StatsPage } from './pages/StatsPage'
import { SolverPage } from './pages/SolverPage'
import { navigate, useRoute } from './router'
import { applyTheme, useSettingsStore } from './store/settingsStore'

function NotFound(): JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm text-ink-600 dark:text-ink-300">这个页面不存在（链接可能不完整）。</p>
      <Button variant="primary" onClick={() => navigate('/')}>
        回到首页
      </Button>
    </div>
  )
}

export function App(): JSX.Element {
  const route = useRoute()
  const theme = useSettingsStore((s) => s.theme)

  // 主题：跟随设置，并在「跟随系统」时监听系统配色变化
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    if (theme !== 'system' || typeof window === 'undefined' || !window.matchMedia) return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [theme])

  let page: JSX.Element
  switch (route.path) {
    case '/play':
      page = <GamePage params={route.params} />
      break
    case '/editor':
      page = <EditorPage params={route.params} />
      break
    case '/solver':
      page = <SolverPage />
      break
    case '/settings':
      page = <SettingsPage />
      break
    case '/stats':
      page = <StatsPage />
      break
    case '/':
      page = <HomePage params={route.params} />
      break
    default:
      page = <NotFound />
  }

  return (
    /*
     * 外壳：只保证「至少一屏高」（见 index.css 的 #root），不再 overflow:hidden。
     * 这样内容超出一屏时由文档滚动，手机上可以正常上下滑动。
     */
    <div className="flex min-h-0 flex-1 flex-col bg-ink-50 text-ink-900 antialiased dark:bg-ink-950 dark:text-ink-100">
      {page}
    </div>
  )
}
