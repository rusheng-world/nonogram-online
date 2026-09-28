import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { migrateStorage } from './core/storage'
import './index.css'

// 启动自检：确认本地存档能被解析，必要时就地迁移 / 丢弃损坏条目。
// 放在 render 之前，保证首屏读到的数据一定已经是「校验过」的。
migrateStorage()

const container = document.getElementById('root')
if (!container) throw new Error('找不到 #root 挂载点')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
