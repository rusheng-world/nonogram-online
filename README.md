# Nonogram Online（数织工坊）

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF.svg)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-70%20passed-brightgreen.svg)](./tests)

> **在线试玩：[https://rusheng-world.github.io/nonogram-online/](https://rusheng-world.github.io/nonogram-online/)**
> （GitHub Pages 静态托管，打开即玩，无需安装任何东西）

纯前端的在线数织（Nonogram / Picross）游戏：**自动生成谜题 + 算法难度分级 + 自定义编辑器 + 成绩存档**。
零后端、零网络请求，构建后是纯静态站点，可以直接部署到 GitHub Pages / Vercel / Netlify / Cloudflare Pages。

- 自动生成的盘面固定为 **5 的倍数正方形**：简单 5×5、中等 10×10、困难 15×15、专家 20×20
- 每道自动生成的题目都经过求解器验证：**有解且唯一解**（多解的题目直接丢弃）
- 难度由**求解器的推理成本**（回溯次数 / 假设链深度 / 长线索交叉）评估，而不是只看尺寸
- 桌面 + 移动端完整可用：鼠标、触摸、键盘全覆盖

### 项目信息

| 项目 | 内容 |
| --- | --- |
| 项目名称 | **Nonogram Online**（中文别名：数织工坊） |
| 仓库 | <https://github.com/rusheng-world/nonogram-online> |
| 在线地址 | <https://rusheng-world.github.io/nonogram-online/> |
| 开源协议 | **MIT**（见 [`LICENSE`](./LICENSE)） |
| 版权 | Copyright (c) 2026 rusheng-world |
| 技术栈 | Vite 5 + React 18 + TypeScript（strict）+ Tailwind CSS 3 + Zustand 4 + Vitest 2 |
| 生成方式 | **本项目由 `deepseek-v4.1-flash` 生成**（含代码、测试与本文档） |

> **关于作者与生成方式**：本项目的全部代码、单元测试、构建脚本与文档均由 AI 模型
> **deepseek-v4.1-flash** 生成，由 [rusheng-world](https://github.com/rusheng-world) 提出需求、
> 复核与发布。项目以 MIT 协议开源，欢迎自由使用、修改与二次分发。

---

## 一、本地运行

### 1.1 环境要求

| 依赖 | 版本要求 | 说明 |
| --- | --- | --- |
| Node.js | **18 LTS 或更高**（推荐 20 / 22 LTS） | 必须；`node -v` 能看到版本号即可 |
| 包管理器 | pnpm（推荐）或 npm | npm 随 Node.js 一起安装；pnpm 见下方 |

还没装 Node.js：到 <https://nodejs.org/> 下载 **LTS** 版本，安装时保持默认选项（会自动加入 PATH），
装完**重新打开一个终端**再执行下面的命令。

pnpm 是可选的。想用 pnpm（推荐，安装更快、磁盘占用更小）：

```bash
npm i -g pnpm        # 或：corepack enable && corepack prepare pnpm@latest --activate
pnpm -v              # 能打印版本号就成功了
```

### 1.2 方式 A：一键脚本（Windows，双击即可）

不需要敲任何命令，双击项目根目录下的脚本：

| 脚本 | 作用 | 适合场景 |
| --- | --- | --- |
| `start.bat` | 检查 Node.js → 首次运行自动安装依赖 → **检查 5173 端口占用（被占用时可一键结束占用进程）** → 启动开发服务器 → **自动打开浏览器** | 日常开发、本地试玩 |
| `build.bat` | 检查环境 → 按需安装依赖 → 类型检查 + 生产构建（产物 `dist/`）→ 本地预览生产版本 | 部署前验证构建产物 |
| `share.bat` | 生产构建 → 用 **5173 端口**把构建产物开放出去（配合 frp / 局域网，见 1.5） | 把游戏分享给别人玩 |

用法：

1. 双击 `start.bat`；
2. 第一次运行会安装依赖（约 1~2 分钟，取决于网速），之后启动很快；
3. 浏览器会自动打开 `http://localhost:5173/`，直接开始玩；
4. 结束：关闭那个黑色窗口，或在窗口里按 `Ctrl+C`。

脚本内置的容错与提示：

- 找不到 Node.js / 找不到 pnpm 与 npm / 依赖安装失败 → 都会打印中文原因和下一步怎么做，窗口不会一闪而过；
- 依赖已安装（存在 `node_modules/vite`）时自动跳过安装；
- 优先用 pnpm，没有 pnpm 时自动回退到 npm；
- **启动前会检查 5173 端口**：如果被占用（最常见的是上一次的运行窗口没关干净、残留着 `node.exe`），
  会打印出占用进程名与 PID，并问你「是否结束该进程并继续启动」——
  按 `Y` 自动清理后继续，按 `N` 则打印手动处理的几种办法。
  这样就不会再直接抛出 `Port 5173 is already in use` 让人一头雾水；
- 启动 Vite 用的是本地入口 `node_modules/vite/bin/vite.js`，不依赖 `pnpm exec`
  （后者在没有全局 shim 的机器上会报 `'vite' is not recognized`）；
- 支持 `start.bat --no-open`：只起服务、不自动打开浏览器（脚本自测时很方便）。

> 想用手机（同一局域网）试玩：不用额外加参数 —— `vite.config.ts` 里已经设了 `server.host: true`，
> 启动后终端会打印一行 `Network: http://192.168.x.x:5173/`，手机浏览器直接访问这个地址即可。
> 首次启动可能会弹一次 Windows 防火墙提示，允许「专用网络」即可。
> 想让公网也能访问（frp / 内网穿透），见 1.5 节。

### 1.3 方式 B：命令行（任何系统）

```bash
pnpm install        # 安装依赖（npm 用户：npm install）
pnpm dev            # 开发服务器：http://localhost:5173/，改代码即时热更新
pnpm share          # 生产构建 + 在 5173 端口开放构建产物（分享给别人玩时用这个）
pnpm build          # 类型检查（tsc -b）+ 生产构建，产物在 dist/
pnpm preview        # 用本地静态服务器预览 dist/（默认 http://localhost:4173/）
pnpm test           # 运行单元测试 / 验收测试（Vitest）
pnpm test:watch     # 监听模式跑测试
```

各命令的作用与常见疑问：

- `pnpm dev`：**只在开发时用**。它自带热更新（HMR）；端口固定 5173（方便 frp / 局域网映射），
  被占用时会直接报错而不是偷偷换端口。
- `pnpm share`：先构建、再把 `dist/` 挂在 5173 端口上（`vite preview`）。适合临时分享给别人玩：
  只发构建产物，不暴露源码，也没有热更新开销。端口固定 5173，若被占用会直接报错（先关掉开发服务器）。
- `pnpm build`：先跑 TypeScript 类型检查，任何类型错误都会让构建失败；通过后才产出 `dist/`。
- `pnpm preview`：**验证生产版本**必须用它（或任意静态服务器），不要直接双击 `dist/index.html`。
  浏览器对 `file://` 下的 ES Module 有 CORS 限制，直接打开会白屏。
- `pnpm test`：纯 Node 环境跑（不需要浏览器），约 10 秒，覆盖线索计算、求解器、生成器、可复现性、验收标准。

### 1.4 常见问题（本地运行）

| 现象 | 原因与解决办法 |
| --- | --- |
| 双击 `start.bat` 一闪而过 | 用「右键 → 以管理员身份运行」看不到效果的话，改为在该目录打开 PowerShell 执行 `.\start.bat`，就能看到报错信息 |
| `'pnpm' 不是内部或外部命令` | 没装 pnpm。执行 `npm i -g pnpm`，或直接用 npm：`npm install` + `npm run dev`（`build.bat` 会自动回退到 npm） |
| 端口 5173 被占用（`Port 5173 is already in use`） | 端口是**固定**的（公网映射需要稳定端口），不会自动换端口。九成情况是**上一次的运行窗口没关干净**：再双击一次 `start.bat`，它会列出占用进程（通常是 `node.exe`）并问你是否结束它，按 `Y` 即可；也可以手动结束：先 `netstat -ano | findstr :5173` 查到 PID，再 `taskkill /f /pid <PID>`。想临时换端口：`pnpm dev -- --port 5199` |
| `EPERM ... esbuild.exe` / 安装依赖时 esbuild 报错 | pnpm 默认不执行依赖的构建脚本。本项目已在 `pnpm-workspace.yaml` 里允许 esbuild（`onlyBuiltDependencies: [esbuild]`）；若仍报错，执行 `pnpm approve-builds` 选择 esbuild |
| 依赖装了一半、报各种模块找不到 | 删掉 `node_modules` 目录与 `pnpm-lock.yaml`（npm 是 `package-lock.json`）后重新 `pnpm install` |
| 页面白屏 / 样式全丢 | 99% 是直接打开了 `dist/index.html`（file:// 协议），改用 `pnpm preview` |
| 改了代码但页面没变 | 硬刷新一次（`Ctrl+F5`）；本地存档在 localStorage 里，清缓存会同时清掉存档 |

### 1.5 开放到公网（frp / 内网穿透 / 局域网分享）

`vite.config.ts` 里已经为公网访问配好了，**不需要额外改代码**：

| 配置 | 作用（都是实测踩过的坑） |
| --- | --- |
| `server.host: true` | 监听 `0.0.0.0`。Vite 默认只监听 localhost，而 Windows 上 localhost 通常解析成 IPv6 的 `::1` —— 结果 frp 连 `127.0.0.1:5173` 会被「积极拒绝」，隧道看起来建好了却打不开页面 |
| `server.strictPort: true` | 端口固定 5173。否则端口被占用时 Vite 会悄悄换成 5174，公网映射就指向空气了 |
| `server.allowedHosts: true` | 放行任意 Host 头。Vite 5.4.12+ 默认拦截未知 Host（DNS rebinding 防护），公网域名访问会直接返回 `403 Blocked request` |
| `preview.host / strictPort / allowedHosts` | 同上，供 `pnpm share`（生产版本分享）使用 |

#### 操作步骤（以 frp 为例）

1. 双击 `share.bat`（推荐：生产构建 + 5173 端口静态服务，速度快、不暴露源码）；
   想边改边看就改用 `start.bat`（开发服务器，带热更新）。
2. **保持那个窗口开着**，然后在 frpc 配置里把 5173 映射出去：

   ```toml
   # frpc.toml（frp 0.52+ 的 TOML 写法）
   serverAddr = "你的 frps 地址"
   serverPort = 7000
   auth.token = "你的 token"

   [[proxies]]
   name = "nonogram"
   type = "tcp"
   localIP = "127.0.0.1"    # 本机就是 127.0.0.1
   localPort = 5173
   remotePort = 5173        # 公网端口，可改成别的（如 8080）
   ```

   旧版 INI 写法等价：

   ```ini
   [nonogram]
   type = tcp
   local_ip = 127.0.0.1
   local_port = 5173
   remote_port = 5173
   ```

   想用域名 + HTTPS，改成 `type = "https"` + `customDomains = ["game.example.com"]` 并按 frp 文档配好证书即可；
   本项目用 Hash 路由 + 相对路径，域名、子路径、非 80 端口都能直接跑，不需要额外配置。

3. 别人访问 `http://你的公网地址:端口/`（或你的域名）就能玩。刷新续玩、分享链接、本地存档都照常工作。

#### 自测通过的表现（本次已在机器上实测）

- `curl http://127.0.0.1:5173/` → `200`：IPv4 通了，frp 才连得上。
- `curl -H "Host: game.example.com" http://127.0.0.1:5173/` → `200`：不再是 `403 Blocked request`。
- 用「外部端口 8080 → 本地 5173」的 TCP 中继（等价于 frp 的 tcp 代理）在浏览器里打开：
  首页四档难度正常、开局 5×5 棋盘可点击、URL 变成 `#/play?p=easy-5x5-…`；
  开发模式下控制台还打印 `[vite] connected.` —— 说明热更新的 WebSocket 也能穿过中继。

#### 安全提醒（重要）

- **开发服务器会把源码和 source map 一起发出去**。`start.bat` 的模式适合自己开发；
  给别人玩请用 `share.bat` / `pnpm share`，它只发构建产物。
- 端口一旦映射到公网，任何知道地址的人都能打开，**没有任何登录或密码**。不要把这个端口和别的服务混用，
  敏感项目不要开放；演示完记得关掉窗口。
- 想收紧访问范围：把 `vite.config.ts` 里的 `allowedHosts: true` 改成白名单，例如
  `allowedHosts: ['game.example.com']`，改完重启服务。
- 对外长期开放建议走 HTTPS（frp 的 https 代理 / Nginx 反代），并用高位 `remotePort` 减少被扫到的概率。

#### 如果热更新连不上

页面能打开、但控制台一直在重连，通常是中间多了一层 HTTPS 终结（Nginx / frp 的 https 代理），
WebSocket 的协议与端口对不上。在 `vite.config.ts` 的 `server` 里补一行即可：

```ts
server: {
  host: true,
  port: 5173,
  strictPort: true,
  allowedHosts: true,
  hmr: { protocol: 'wss', clientPort: 443 }, // 页面走 https 时才需要
},
```

---

## 二、在线部署

生产构建产物是**纯静态文件**（`dist/` 里只有 `index.html` + `assets/*.js` + `assets/*.css`），没有任何服务端依赖。

> 只是想临时分享给朋友玩？不必真的部署：按 1.5 的方式配好 frp / 内网穿透，双击 `share.bat`，把地址发出去就行。

两个让它「换托管环境也不用改代码」的设计：

1. `vite.config.ts` 里 `base: './'`：资源引用是相对路径，所以既能放在域名根路径（Vercel），
   也能放在子路径（GitHub Pages 的 `https://用户名.github.io/仓库名/`）。
2. 路由用 **URL hash**（`#/play?p=hard-15x15-xxx`）：不需要服务器 rewrite / 404 回退规则，
   刷新任何页面、把分享链接发给别人，打开都是同一道题。

构建命令统一是 `pnpm run build`，输出目录统一是 `dist`。

### 2.1 GitHub Pages

> **本仓库已经部署好了**：线上地址 <https://rusheng-world.github.io/nonogram-online/>，
> 部署方式是下面的「方式一（GitHub Actions）」，工作流文件就在
> [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)。
> 之后每次 `git push` 到 `main` 都会自动重新构建并发布（约 1 分钟生效）。

#### 方式一：GitHub Actions（推荐，推代码即自动部署）

仓库里已经放好了工作流文件 `.github/workflows/deploy.yml`。你只需要：

1. 新建一个公开仓库（本项目叫 `nonogram-online`），把代码推到 `main` 分支：

   ```bash
   git init -b main
   git add -A
   git commit -m "feat: Nonogram Online"
   git remote add origin https://github.com/<用户名>/nonogram-online.git
   git push -u origin main
   ```

   用 [GitHub CLI](https://cli.github.com/) 的话一条命令就够：

   ```bash
   gh repo create nonogram-online --public --source . --remote origin --push
   ```

2. 打开仓库 **Settings → Pages**，把 **Source** 选成 **GitHub Actions**
   （也可以用 `gh api -X POST repos/<用户名>/<仓库名>/pages -f build_type=workflow` 直接开）；
3. 等一次 Actions 跑完（约 1 分钟），访问 `https://<用户名>.github.io/<仓库名>/`。
   在仓库的 **Actions** 标签页里能看到 `Deploy to GitHub Pages` 这次运行；绿色的对勾就代表发布成功
   （部署任务输出的 `page_url` 就是最终地址）。

工作流内容（如需自己建，可复制）：

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

#### 方式二：手动把 `dist/` 推到 `gh-pages` 分支

```bash
pnpm install
pnpm run build

# 在 dist 目录里初始化一个只含构建产物的仓库，推到 gh-pages 分支
cd dist
git init -b gh-pages
git add -A
git commit -m "deploy"
git remote add origin https://github.com/<用户名>/<仓库名>.git
git push -f origin gh-pages
```

然后到 **Settings → Pages**，把 **Source** 选成 **Deploy from a branch**，分支选 `gh-pages`、目录选 `/ (root)`。

> 两种方式都**不需要**为子路径额外配置：`base: './'` 生成的是 `./assets/...` 这样的相对路径。

### 2.2 Vercel

1. 登录 <https://vercel.com/> → **Add New → Project** → 选 **Import Git Repository**，授权并选中本仓库；
2. 构建配置（Vercel 通常能自动识别 Vite，若没有就手动填）：
   - **Framework Preset**: `Vite`
   - **Install Command**: `pnpm install`（或 `npm install`）
   - **Build Command**: `pnpm run build`（或 `npm run build`）
   - **Output Directory**: `dist`
3. 点 **Deploy**，几十秒后拿到 `https://<项目名>.vercel.app`。

不需要配置 rewrites / redirects：页面用 hash 路由，任何路径都由 `index.html` 承载。
以后每次 `git push` 都会自动重新部署，PR 还会生成独立的预览地址。

### 2.3 Netlify / Cloudflare Pages

- **Netlify**：`Add new site → Import an existing project`，Build command 填 `pnpm run build`，Publish directory 填 `dist`。
  只想快速试一下的话，本地 `pnpm run build` 后把 `dist` 文件夹直接拖到 <https://app.netlify.com/drop> 也能上线。
- **Cloudflare Pages**：`Create a project → Connect to Git`，Framework preset 选 `Vite`，
  Build command `pnpm run build`，Build output directory `dist`。

### 2.4 自定义域名与 HTTPS

上面几家都自带免费的 `*.vercel.app` / `*.netlify.app` / `*.pages.dev` 域名和自动 HTTPS 证书。
想绑自己的域名，在对应平台的 **Domains / Custom domain** 里添加域名，然后按提示在域名服务商处添加
`CNAME`（子域名）或 `A` 记录（根域名），证书会自动签发，无需额外配置。

> 因为全部逻辑都在浏览器里，本项目没有任何环境变量、密钥或后端接口需要配置。

---

## 三、功能一览

| 模块 | 说明 |
| --- | --- |
| 谜题生成 | 可复现种子、图案有结构（非噪声）、**必定唯一解**、固定 5 的倍数正方形尺寸、**主动消除全空 / 全满的行列**、超预算自动降级 |
| 难度分级 | 求解器的推理成本评估（回溯次数 / 假设链深度 / 长线索交叉），不是只看尺寸 |
| 游戏交互 | 鼠标、触摸、键盘全覆盖；拖拽连续涂、右键标记、长按切笔尖、行列高亮、线索自动划线（可在设置里关闭） |
| 判定模式 | 宽松（手动检查）/ 严格（即时标红 + 抖动）/ 极限（永久红痕 + 每次 +10 秒） |
| 计时 | 第一次操作开始计时；暂停遮罩；切标签页自动暂停；最佳成绩与历史记录存本地 |
| 辅助 | 撤销/重做 200 步、逻辑提示（含「猜不出来」兜底提示）、重置、分享链接 |
| 自定义 | 画布编辑器（铅笔/橡皮/矩形/直线/油漆桶/翻转/旋转/对称）、文本导入导出、实时线索与唯一性检查 |
| 存档 | 当前进度、最佳成绩、历史成绩、设置全部存 localStorage；刷新后继续 |

### 难度与盘面尺寸对照

| 难度 | 自动生成的盘面 | 判定标准（求解器） | 实测生成耗时（平均 / 最慢） |
| --- | --- | --- | --- |
| 简单 | **5×5** | 纯行列约束传播即可解出，无需回溯 | 0.3 ms / 3 ms |
| 中等 | **10×10** | 需要多轮交叉传播，回溯 0~2 次 | 16 ms / 100 ms |
| 困难 | **15×15** | 需要 3~10 次回溯，或存在长线索交叉 | 280 ms / 1.2 s |
| 专家 | **20×20** | 回溯超过 10 次，或需要深层假设链（≥20 的盘面一律专家） | 2 ms / 7 ms |

> 困难档的最慢耗时包含「为了找一条没有退化线的候选而多搜一段时间」的开销（最多 250 ms，见第六章第 5 节），
> 换来的是困难 / 专家档生成出来的题**一行全空或全满都不会出现**。

### 快捷键

| 按键 | 作用 |
| --- | --- |
| 方向键 | 移动键盘光标 |
| 空格 | 涂黑 / 取消 |
| X | 标记 X / 取消 |
| Delete / Backspace | 清空该格 |
| Ctrl+Z / Ctrl+Shift+Z（或 Ctrl+Y） | 撤销 / 重做 |
| H | 提示 |
| P | 暂停 / 继续 |

---

## 四、技术栈与选型

- **Vite 5 + React 18 + TypeScript（strict）+ Tailwind CSS**，构建产物约 239 kB JS（gzip 约 80 kB）。
- **状态管理用 Zustand**，理由：
  1. 棋盘最多 625 格且高频更新，Zustand 的选择器订阅让「计时器 / 线索 / 单元格」各自只订阅自己的切片，
     一次涂格不会重渲染整页；Context + reducer 会让订阅者只能是整棵树。
  2. 拖拽绘制、rAF 计时、localStorage 存档都需要在 React 之外读写状态（`store.getState()`），
     Zustand 天然支持，Context + reducer 做不到。
  3. 无需 Provider 嵌套，页面切换时状态自然保留（游戏页 ↔ 设置页往返不会丢对局）。
- 求解器与生成器是**纯 TypeScript、零依赖**的独立模块（`src/core/`），可以直接被单测调用。

## 五、目录结构

```
start.bat          一键运行（双击：装依赖 + 启动开发服务器 + 开浏览器）
build.bat          一键构建 + 预览生产版本
share.bat          一键分享（生产构建 + 5173 端口开放给公网 / 局域网）
.github/workflows/deploy.yml   GitHub Pages 自动部署
src/
  core/            纯逻辑（无 React 依赖，全部有单测）
    types.ts       编码常量、类型、难度元信息（含每档固定盘面尺寸 boardSize）
    rng.ts         mulberry32 可复现随机数
    clues.ts       线索计算
    solver.ts      DP 线索传播求解器 + 唯一性 + 难度指标 + 提示
    difficulty.ts  难度分级与评分 + 尺寸下限
    generator.ts   图案生成 / 消除退化线 / 唯一性修形 / 尺寸与预算 / 降级
    replay.ts      谜题 id <-> 谜题（可复现）
    encoding.ts    位压缩 + base64url 分享码
    text.ts        #/. 文本导入导出
    storage.ts     localStorage 读写
    progress.ts    线索自动划线（以解为准，逐条线索）
  store/           zustand：gameStore / editorStore / settingsStore
  components/      GameBoard / ClueStrips / ui / icons
  pages/           HomePage / GamePage / EditorPage / SettingsPage
  game/            bootstrap（开局引导）、newGame（可复现生成）
  hooks/           useElapsed（计时）、useBoardMetrics（自适应尺寸）
  tests/             Vitest：线索、求解器、编码、生成器、划线、可复现性、验收
```

## 六、核心算法

### 1. 数据结构

格子统一用数字编码，全程 `Uint8Array`（性能 + 求解器与玩家棋盘共用一套结构）：
`0 = UNKNOWN`（未知）/ `1 = FILLED`（黑格）/ `2 = EMPTY`（确定为白，玩家看到的是 X）。

### 2. 线索计算

`computeLineClues` 扫描连续段；**空行返回 `[0]`**，渲染与解题逻辑都按「单个 0」处理，
这样全空行、单行全满、1×N / N×1 等极端情况都能正确显示。

### 3. 求解器（`solver.ts`，自己实现，不做暴力枚举）

- **单行推理（核心）**：给定一行长度、线索、已知格子，用 DP 计算
  「第 i 格能否为黑 / 能否为白」，两者取交集得出**必然确定**的格子。
  实现方式是可达性表 + 差分数组：先算后缀可达性与「从前面能否放下某个块」，
  再把「某个块可以覆盖的区间」「块后面的强制空格」标进差分数组，最后得到每格的可能性。
  复杂度 O(长度 × 块数)，25 长度下是几百次操作 —— 直接枚举所有排列会爆炸，这正是需求里禁止的做法。
- **传播**：行、列交替推理直到不动点（`propagate`），返回本轮确定的格子数。
- **假设分支**：卡住时选「未知格最少的线」上的一格做黑/白假设，递归；用于
  ① 证明唯一性（数到第 2 个解立刻返回）② 统计难度指标。
- **预算保护**：节点数上限 + 时间上限（`createLimits`），超限时返回 `truncated`，
  ★不会死循环★；调用方看到 `truncated` 会拒绝采用该谜题。
- **正确性论据**：单行 DP 的结论对**任意**满足线索的染色都成立，所以
  「纯传播就确定了全部格子」⇒ 数学上唯一解，无需再跑第二次搜索（`analyzePuzzle` 据此优化）。
  单测里用 3000 条随机线把 DP 结果与暴力枚举逐一比对。
- **提示**：复用推理过程日志，优先给「逻辑上最该确定」的格子；确实推不动时退化为
  猜测提示并在界面上明确告知（`isGuess`）。

### 4. 难度评估（`difficulty.ts`）

难度 = **解出这道题需要的最高级技巧 + 回溯次数**，而不是棋盘大小。
需求表的尺寸列是「该档适合的盘面范围」，本项目自动生成的盘面就落在这些范围的交叠点上：

| 难度 | 尺寸（需求表） | 生成尺寸 | 判定标准 |
| --- | --- | --- | --- |
| 简单 | 5×5 ~ 10×10 | 5×5 | 纯行列约束传播即可解出，无需回溯 |
| 中等 | 10×10 ~ 15×15 | 10×10 | 需要多轮交叉传播，回溯 0~2 次 |
| 困难 | 15×15 ~ 20×20 | 15×15 | 需要 3~10 次回溯，或存在长线索交叉 |
| 专家 | 20×20 ~ 25×25 | 20×20 | 回溯 > 10 次，或需要深层假设链 |

实现上是让同一个求解器「像人一样」解题，并记录：

| 指标 | 含义 |
| --- | --- |
| `guesses` | 需要的假设次数（= 回溯次数），主要判据 |
| `solutionDepth` | 假设链深度（≥3 / ≥4 抬高档位） |
| `failedGuesses` | 走进死路的次数（试错成本） |
| `longCrossings` | 长线索交叉的格子数（横竖都超过一半盘面的长块相交，人工极易看漏） |
| `propagationRounds` / `deducedCells` / `nodes` | 推理强度与搜索规模 |

分级规则（`classifyDifficulty`，代码注释里也写了依据）：

1. 推理成本：`guesses === 0` → 简单；≤2 → 中等；≤10 → 困难；>10 → 专家；
2. 深层假设链：`solutionDepth ≥ 4` → 专家，`≥ 3` → 困难；
3. **尺寸地板**：≤10 简单 / ≤15 中等 / ≤19 困难 / ≥20 专家 —— 尺寸**只能抬高**难度；
4. 长线索交叉：`longCrossings ≥ 4` 且盘面 ≥16 → 至少困难。

另外给出 0~100 的连续分 `difficultyScore`，用于界面展示「同档里哪个更难」。
指标由固定启发式 + 固定假设顺序得到，因此对同一谜题**完全可复现**。

### 5. 生成流程（`generator.ts`）

1. **尺寸**：每档固定一个尺寸（`boardSizeFor`）—— 5×5 / 10×10 / 15×15 / 20×20。
   需求要求自动生成的盘面必须是**正方形且边长是 5 的倍数**，所以不再在区间里随机取边长
   （随机取会产出 11×12、15×10 这类盘面）。四档尺寸同时满足难度判定的「尺寸地板」。
2. **图案生成**：`mulberry32(seed)` 派生随机数，混合三种策略让图案「像有意义的图形」而不是噪声：
   随机游走团块生长（带方向惯性 + 随机膨胀）、对称镜像（左右/上下/四向）、少量碎块与噪声，
   再跑几轮细胞自动机平滑（去孤立点、补小洞），最后把填充率调到该难度区间（简单 40~60%，高难 50~70%）。
   还会用 `isInteresting` 剔除退化图案（整行全满、线索重复度过低等）。
3. **消除退化线** `reduceDegenerateLines`：整行/整列**全空**（线索 `[0]`）或**全满**（线索 `[长度]`）
   是最没意思的两类线 —— 一眼就能涂完，等于白送。生成器把「退化线数量」当成质量指标主动修：
   全空的线补一格、全满的线减一格，补/减都挑「补完 / 减完不会把垂直方向那条线也变退化」的位置
   （补格永远不会制造全空线、减格永远不会制造全满线，避开「只差一格就满 / 就空」的位置即可），
   并按 8 邻域黑格数挑看起来最自然的位置，让图案仍然像「有意义的图形」。
   容忍上限见 `DEGENERATE_LINE_CAP`：**困难 / 专家要求 0 条**，简单 / 中等允许 1 条
   （小盘面本来就容易出，而且对新手算个提示）。达不到上限不会让生成失败：
   达标候选会先拿在手里，再多花最多 250 ms 找一个更干净的（`cleanDeadline`），实在找不到就用手上这个。
4. **唯一性修形** `repairToUnique`：随机图案大多数是**多解**的。这里不是直接丢弃，
   而是「数到第 2 个解 → 翻转两者的一个差异格 → 再数」；验证唯一之后再检查退化线，
   有退化线就消掉并**回头重新验证唯一性**（修形会改线索），最多 16 轮。
   既提高了高难题的产出率，又保留了那些真正需要试错的结构。
5. **评分与预算**：用求解器打分，落在目标难度区间才采用；否则换下一个候选种子（候选序列固定可复现）。
   候选次数上限 `defaultMaxAttempts(难度)`：困难档给 1200 次（它能达标的图案最稀有，
   15×15 必须**恰好**落在「3~10 次回溯」这个很窄的窗口里），中等比 600 次，简单/专家 200 次。
6. **降级保护**：预算内没达标时降到相邻的更简单档位（盘面尺寸也随之换成该档的固定尺寸），
   最后还有一个必定唯一、必定可解、且**不含退化线**的兜底图案；降级会通过 `notice` 如实告知玩家。
   若请求的难度低于该尺寸的难度下限（例如在 20×20 上要「简单」），会**快速失败**（只跑少量候选）。

### 6. 可复现性（刷新 / 分享链接为什么一定回到同一题）

谜题 id 形如 `hard-15x15-afnhtfvt8s`（难度 + 尺寸 + **基准种子**）。
`regenerateFromId` 用同一套参数（时间预算 `GENERATION_TIME_BUDGET_MS`、候选次数 `defaultMaxAttempts(难度)`，
候选顺序都是确定的）重跑一遍生成，因此 `regenerateFromId(generatePuzzle(...).puzzle.id)` 得到的是**同一个图案**。
id 里刻意**不包含**生成器内部的候选序号，否则重放时会再追加一次序号而得到另一个候选
（这个坑由 `tests/replay.test.ts` 覆盖）。
生成新题时还会再验证一次可复现性，验证失败就换策略 —— 所以「刷新继续玩」和「分享链接」不会串题。

### 7. 线索自动划线（`progress.ts`）

某条线索对应的方块**在正确位置上涂满**之后，线索数字会变灰并加删除线，方便一眼看出「这行/列还差哪几段」。
判定规则（同一行/列内）：

1. **这一行/列没有涂错的格子** —— 不存在「解里是白格、玩家却涂黑了」的位置；
2. **解里第 j 段方块（连续黑格）的每一格都已经涂黑**。

两条同时成立，第 j 条线索才划线。这样设计的原因：

- **永远以「解」为准**，所以不会出现「没找出来却划掉」：位置涂错、多涂一格、少涂一格都不会划线。
  （早期版本只看「玩家涂的格子能不能摆得下线索」，会出现「线索 `[1]`、玩家涂在错误位置却照样划线」的误判。）
- **逐段判断**而不是整行一起判断，保留进度感：线索 `[2,3]` 里先把 3 那一段做对了，
  就只有「3」被划掉，「2」还得继续找 —— 这正是需求里「所需格子被找出来，对应的数字就被划掉」的意思。
- 一旦这一行出现涂错的格子，条件 1 不成立，整行的划线会暂时消失（涂法已经和线索矛盾，继续划线只会误导），
  改正之后会自动恢复。
- 空线索 `[0]` 不划线：否则开局满屏的空白行/列会被立刻全部划掉，反而看不出进度。
- X 标记不影响判定（只比较「涂黑」的格子），和胜负判定保持一致。

**可以关掉**：设置 → 外观 → 「线索自动划线」。关掉之后完全不计算
（`GameBoard` 直接把进度数组置空），也不会有任何划线；对不想被「这行对不对」提示到手的玩家、或者想纯靠
「检查」按钮判定的宽松模式玩家更友好。

实现上每条线只扫一遍（行：`step = 1`、起点 `y × width`；列：`step = width`、起点 `x`），
20×20 盘面 40 条线合计约 800 次比较，每步重算的开销可以忽略。

> 这里曾经有一个真实的 bug：列线索用的是行方向的读取方式（把 `height` 当线长、步长取 1），
> 读到的是「第一行的前几格」而不是那一列，于是出现「明明涂对了却不划线」。
> 现在列一律用 `step = width`、`offset = x`，并回归测试覆盖（`tests/progress.test.ts`）。

## 七、性能设计

- **渲染**：≤30×30 直接用 DOM + CSS Grid（20×20 = 400 个格子，实测无压力）。
  外观由 CSS 变量 + `data-state` 属性驱动，格子里没有条件样式计算。
  编辑器支持到 50×50，用缩放 + 滚动容器处理（并说明大尺寸只影响编辑，游戏页建议 ≤25）。
- **拖拽不触发全量重渲染**：拖拽期间**完全不碰 React 状态**，直接写 `el.dataset.state`，
  把变更累积在一个 Map 里，抬手时一次性提交（一次 `set()` = 一次渲染）。
- **棋盘自适应**：`useBoardMetrics` 用 ResizeObserver 测量可用空间，迭代 3 次收敛
  （线索区宽度依赖字号、字号又依赖格子大小），保证在 375px 宽的手机上也能**完整显示、无横向滚动**。
  实测 375×667 视口下 20×20 棋盘外框 361px 宽（含行/列线索区）、格子 14px，`scrollWidth === innerWidth`（无横向滚动）。
- **计时**：`accumulatedMs + (now - runningSince)` 时间戳差值，`requestAnimationFrame` 只以约 5Hz 刷新显示，
  后台标签页被节流也不会漂移；暂停/恢复只是移动 `runningSince`。
- **生成性能**（本机 Node 24，`tests/acceptance.test.ts` 实测）：见上方「难度与盘面尺寸对照」表。
  简单/中等/专家都在毫秒级；**困难档平均约 0.26 秒、最慢约 0.75 秒**（要筛出「恰好需要 3~10 次回溯」的图案），
  仍然远低于需求里的 1 秒 / 2 秒上限，因此生成完全放在主线程同步完成，不需要 Web Worker
  （界面上先画一层 loading 遮罩，避免长任务看起来卡住）。

### 移动端布局与滚动（本轮修复的 bug）

**症状**：手机上打开后页面上下滑不动 —— 首页底部的难度卡片、历史成绩，游戏页底部的状态栏都看不到。

**根因**：外层布局把整个应用锁死在「一屏」高度里，而且没有任何一层真正负责滚动。

- `html / body / #root` 全部 `height: 100%`，`App.tsx` 最外层又是 `h-full overflow-hidden`，
  多出来的内容被**直接裁掉**；
- 首页 / 设置页的 `min-h-full overflow-y-auto` 看着像滚动容器，其实**永远不会滚动**：
  `height: auto` 的盒子只会随内容一起长高，必须有父级给出确定高度才会出现滚动条；
- 游戏页 `<main>` 完全没有滚动容器，棋盘区还被 `overflow-hidden` 裁切；
- `body { overscroll-behavior-y: none }` 把下拉刷新和滚动链一起吃掉，滑起来更「死」。

实测（375×667 视口）：首页内容高 1251px，却被塞进 667px 的容器，`documentElement.scrollHeight === clientHeight`
—— **整个文档根本不可滚动**，底部 584px 永久看不到。

**修复**：

| 位置 | 改动 |
| --- | --- |
| `src/index.css` | `#root` 改为 `min-height` + `dvh`（老浏览器回退 `vh`），允许内容把页面撑高；删掉 `body` 的 `overscroll-behavior-y: none`；新增 `.app-screen`（锁一屏高）/ `.app-flow`（文档滚动）两个外壳类 |
| `src/App.tsx` | 外壳去掉 `h-full overflow-hidden`，改为 `flex flex-1 flex-col`：内容超出一屏时交给**文档滚动** |
| 首页 / 设置页 | 删掉假的滚动容器，改回普通流式布局（`sticky` 吸顶头部照常生效） |
| 游戏页 / 编辑器页 | 用 `.app-screen` 锁一屏高度（内部 flex 才算得出棋盘可用空间），`<main>` 加 `overflow-y-auto overscroll-contain`：装不下时**内部滚动**，顶部工具栏始终可见 |
| `useBoardMetrics` / `GameBoard` | 抽出格子下限常量 `MIN_CELL = 11`，棋盘区带 `min-height` 下限：空间真的不够时不再把棋盘压到看不清、也不再裁掉，而是让 `<main>` 出现滚动条 |
| 安全区 | 用 `env(safe-area-inset-bottom)` 扣掉 iOS 手势条高度，底部按钮不会被系统手势区盖住 |

关键点：**滚动交给「文档」而不是固定高度的盒子**，是移动端最不容易出问题的模型；
只有确实需要「棋盘按可用空间自适应」的页面才锁一屏高度，并各自带内部滚动兜底。

实测对比（改前 → 改后）：

| 视口 | 首页可滚动 | 游戏页棋盘完整 | 底部状态栏 | 横向滚动 |
| --- | --- | --- | --- | --- |
| 375×667 | 否 → 是 | 是（格子 14px） | 可见 | 无 |
| 390×844 | 否 → 是 | 是（格子 15px） | 可见 | 无 |
| 320×568 | 否 → 是 | 是（格子 12px） | 可见 | 无 |
| 667×375（横屏） | 否 → 是 | 是（格子 11px，改前被裁 36px） | 页面内滚动 67px 后可见 | 无 |
| 1280×800（桌面） | 不需要滚动 | 是（格子 26px） | 可见 | 无 |
## 八、测试

```bash
pnpm test        # 70 个用例，约 20 秒
```

覆盖内容：

- `clues.test.ts`：全空行 / 全满行 / 单格行 / 1×N / N×1 等线索边界。
- `solver.test.ts`：**DP 与暴力枚举 3000 条随机线逐一比对**（含矛盾已知信息）、矛盾检测、纯传播可解、
  多解（3×3 全 `[1]` 有 6 个解）、无解。
- `progress.test.ts`：线索自动划线的判定 —— 涂错位置不划线、多涂一格不划线、逐条线索的进度、
  列必须按 `step = width` 读取（旧 bug 的回归用例）、空线索 `[0]` 不划线、X 标记不影响判定、矩形盘面。
- `encoding.test.ts`：位压缩与分享码往返、非法输入、文本导入导出、棋盘编解码。
- `replay.test.ts`：谜题 id 解析边界、四档各 8 题按 id 重放图案完全一致、带降级的结果同样可重放。
- `generator.test.ts`：可复现性、四档各 20 题全部唯一解且达标、`classifyDifficulty` 规则。
- `acceptance.test.ts`：验收标准里可自动化的部分 —— 四档各 20 题全部唯一解且难度达标、
  **盘面是 5 的倍数正方形**、线索与图案一致、专家档 20×20 生成 < 1 秒、困难档 15×15 在预算内、
  同种子结果一致、不可达难度快速返回、**退化线（全空 / 全满行列）数量在容忍上限内**、
  `countDegenerateLines` 在各种盘面下的边界。

## 九、已知限制

1. **难度分级是启发式的**：指标来自一套固定的假设顺序与启发式，因此是「用固定策略解题所需的推理成本」，
   不等价于人类直觉难度；同一档内不同题的体感仍会有差异（连续分可用来排序）。
2. **尺寸与难度互相约束**（由尺寸地板决定，属于数学上的硬约束）：
   5×5 只可能是「简单」（勉强能出「中等」），10×10 只可能是「简单」或「中等」，
   20×20 一定是「专家」（回溯再多也不会变成困难）。因此每档固定尺寸后，难度只能靠推理成本来达标，
   这也是困难档生成耗时明显高于其他档的原因。
3. 随机图案天然偏向「纯传播可解」，因此高难题依赖 `repairToUnique` 保留碎块 / 噪声结构；
   困难档为了筛出「3~10 次回溯」的图案，图案会比低难度更碎一些（这是难度的代价）。
   极端情况下仍可能降级（会明确提示实际难度），但绝不会返回多解题。
   退化线是「尽量消除」而不是「数学上保证」：简单 / 中等档允许残留 1 条，
   全部候选都失败时的最后兜底图案（「隔行全填」，保证唯一解优先）也仍会含有退化线，
   只是这条路径几乎不会走到（实测四档各 30~60 题都没有触发过）。
4. 编辑器画布上限 50×50；**游戏页建议 ≤25×25**（超过只给警告不阻止），
   因为 25 格以上在 375px 手机上格子会接近 12~13px，手指精度吃紧。
5. 大画布（>30×30）会跳过唯一性校验（求解器开销过大），界面上会明确说明。
6. 棋盘存档用 `0|1|2` 字符串（3 种状态无法位压缩），20×20 约 400 字符，未做压缩。
7. 判定模式在开局时固定，设置里改的是「下一局开始生效」—— 为了让成绩可比。
8. 长按切笔尖的手感依赖设备；它只是辅助手段，移动端主要靠「涂黑 / 标记」模式按钮（未做真机实测）。
9. 音效使用 WebAudio 合成，需要一次用户交互后才能播放（浏览器自动播放策略）。
10. **线索自动划线是「这一行/列对不对」的提示**（判定完全以「解」为准）。
    不想要这种提示的玩家（尤其是宽松模式想完全靠「检查」按钮判定的）可以在
    **设置 → 外观 → 线索自动划线** 里关掉，关掉后不会有任何划线。

11. **手机横屏（高度很矮）时**棋盘会保持 11px 的最小格子，多出来的内容靠游戏页内部滚动查看
    （不会被裁掉，但格子偏小）。竖屏是主要适配方向；平板上无此问题。
## 十、文档

- 设计取舍、算法原理与验收自测逐条结果见 [`DECISIONS.md`](./DECISIONS.md)。
- 开源协议见 [`LICENSE`](./LICENSE)。

## 十一、开源协议（MIT）

本项目以 **MIT License** 开源，全文见 [`LICENSE`](./LICENSE)：

```
MIT License

Copyright (c) 2026 rusheng-world

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**你可以**：自由使用、复制、修改、合并、发布、分发、再授权、销售本软件；
**条件是**：保留上述版权声明与许可声明；
**不提供担保**：软件按「原样」提供，作者不对任何索赔或损失负责。

## 十二、如何参与 / 联系

- 发现问题或有建议：在仓库开一个 [Issue](https://github.com/rusheng-world/nonogram-online/issues)；
- 想改代码：Fork → 新建分支 → 改完跑 `pnpm test && pnpm run build` → 提 Pull Request；
- 项目由 AI 模型 **deepseek-v4.1-flash** 生成，后续维护与发布由 [rusheng-world](https://github.com/rusheng-world) 负责。
