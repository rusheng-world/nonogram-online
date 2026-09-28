/**
 * 最薄的页面级 Error Boundary。
 *
 * 目的只有一个：**别让一次未捕获的渲染异常把整个应用变成白屏**。
 * 在此之前，任何一个组件抛错都会让 React 卸载整棵树，#root 里什么都不剩，
 * 玩家只能自己刷新页面，也不知道发生了什么（见审查报告 M-03）。
 *
 * 刻意保持很小：
 *   · 只用 React 自带的 class 生命周期，不引入任何第三方库；
 *   · 界面只提供「重新加载 / 返回首页」，**不显示 stack、不显示源码路径**；
 *   · 没有异常时它是个透明容器，不参与正常渲染逻辑。
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { navigate } from '../router'
import { Button } from './ui'

interface Props {
  children: ReactNode
}

interface State {
  failed: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown, _info: ErrorInfo): void {
    // 控制台留一条线索给开发者；界面上绝不显示 stack / 源码路径
    console.error('[nonogram] 渲染时发生未捕获的错误：', error)
  }

  private reload = (): void => {
    window.location.reload()
  }

  private goHome = (): void => {
    // 先清掉错误状态让子树重新挂载，再把地址切回首页
    this.setState({ failed: false })
    navigate('/')
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-ink-50 p-6 text-center text-ink-900 antialiased dark:bg-ink-950 dark:text-ink-100">
        <p className="text-base font-semibold">发生了一点问题</p>
        <p className="max-w-sm text-xs leading-relaxed text-ink-500 dark:text-ink-400">
          页面遇到了一个没有预料到的错误。你的进度与成绩都保存在本机浏览器里，重新加载后可以继续。
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="primary" onClick={this.reload}>
            重新加载
          </Button>
          <Button onClick={this.goHome}>返回首页</Button>
        </div>
      </div>
    )
  }
}
