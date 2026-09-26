/**
 * 极简 hash 路由（静态部署友好：GitHub Pages / Vercel 都不需要额外 rewrite 规则）。
 *
 *   #/                首页
 *   #/play?p=<id>     按谜题 id 开始（id 里带 seed，可复现）
 *   #/play?s=<code>   打开分享链接
 *   #/editor          自定义编辑器
 *   #/settings        设置
 */

import { useEffect, useState } from 'react'

export interface RouteInfo {
  path: string
  params: URLSearchParams
  raw: string
}

export function parseHash(hash: string): RouteInfo {
  const raw = hash.replace(/^#/, '') || '/'
  const [path, query = ''] = raw.split('?')
  return { path: path || '/', params: new URLSearchParams(query), raw }
}

export function useRoute(): RouteInfo {
  const [route, setRoute] = useState<RouteInfo>(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function navigate(to: string): void {
  const next = to.startsWith('#') ? to : `#${to}`
  if (window.location.hash === next) return
  window.location.hash = next
}

export function goHome(): void {
  navigate('/')
}
