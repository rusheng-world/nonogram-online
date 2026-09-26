import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// base: './' 让构建产物既能在 GitHub Pages 的子路径部署，也能在 Vercel 根路径部署
//
// server / preview 段是给「公网访问」用的（frp / nps / ngrok 等内网穿透，或局域网分享）：
//   host: true        监听 0.0.0.0（IPv4 全接口）。Vite 默认只监听 localhost，且在 Windows 上
//                     通常解析成 IPv6 的 ::1，于是 frp 连 127.0.0.1 会被「积极拒绝」。
//   strictPort: true  端口固定，避免端口被占用时自动换端口导致公网映射指向空气。
//   allowedHosts: true 放行任意 Host 头。Vite 5.4.12+ 默认会拦截未知 Host（DNS rebinding 防护），
//                     公网域名访问会直接 403 Blocked request。想更严格可以写成域名白名单数组，
//                     例如 allowedHosts: ['game.example.com']。
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
  },
  worker: {
    format: 'es',
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  // 生产预览：`pnpm share` 会用它在同一台机器上把构建产物开放出去（公网分享推荐这种方式）
  preview: {
    host: true,
    port: 4173,
    strictPort: true,
    allowedHosts: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    reporters: ['default'],
  },
})
