import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/*
 * base: './' 让构建产物既能在 GitHub Pages 的子路径部署，也能在 Vercel 根路径部署。
 *
 * ⚠️ 开发 / 预览服务器默认**只监听本机**，也只放行 localhost 与本机 IP 的 Host 头。
 *
 * 为什么不默认对外：Vite dev server 不是生产服务器 —— 它能读项目源码，且当前版本存在
 * 若干 dev/preview-only 的安全公告（server.fs.deny 绕过、launch-editor 参数注入等）。
 * 「随手 pnpm dev 就把开发服务器暴露到公网」风险远大于收益，因此改成显式开启：
 *
 *   NONOGRAM_EXPOSE=1                     监听 0.0.0.0（局域网 / 内网穿透可访问）
 *   NONOGRAM_ALLOWED_HOSTS=a.com,b.com    额外放行的域名（frp / ngrok 的自定义域名）
 *
 * share.bat 会自动设好这两个变量（并打印安全警告）；只想把游戏给别人玩时，
 * 优先用生产产物（`pnpm build` + 任意静态托管，如 GitHub Pages / Vercel / Netlify）。
 *
 * 注：项目没有装 @types/node（保持依赖最小），所以这里从 globalThis 取 process.env。
 */
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const exposeToNetwork = env.NONOGRAM_EXPOSE === '1'
/** 只放行显式列出的域名；localhost 与 IP 由 Vite 自身默认放行 */
const extraAllowedHosts = (env.NONOGRAM_ALLOWED_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean)

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
    host: exposeToNetwork ? true : 'localhost',
    port: 5173,
    strictPort: true,
    allowedHosts: extraAllowedHosts,
  },
  // 生产预览：`pnpm share` 用它把 dist/ 挂出来（静态文件，不暴露源码）。同样默认只监听本机，
  // 需要局域网 / 公网访问时先设 NONOGRAM_EXPOSE=1（share.bat 已内置）。
  preview: {
    host: exposeToNetwork ? true : 'localhost',
    port: 4173,
    strictPort: true,
    allowedHosts: extraAllowedHosts,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    reporters: ['default'],
  },
})
