# 决策记录 + 验收标准逐条自测

项目：**Nonogram Online**（中文别名：数织工坊）· 纯前端在线数织 · MIT 开源
仓库：<https://github.com/rusheng-world/nonogram-online> ｜ 在线试玩：<https://rusheng-world.github.io/nonogram-online/>
技术栈：Vite 5 + React 18 + TypeScript（strict）+ Tailwind CSS 3 + Zustand 4
测试：Vitest 2（7 个文件 / 70 个用例）
生成方式：本项目（代码、测试、脚本与文档）由 **deepseek-v4.1-flash** 生成

---

## 一、决策记录

> 每条都写「选了什么 + 为什么这么选」，包括开发过程中发现并修掉的问题。

### D1. 状态管理用 Zustand（而不是 Context + reducer）

- 棋盘最多 900+ 格且是高频更新对象。Zustand 的选择器订阅让「计时器 / 线索条 / 单元格」各自只订阅自己关心的切片，一次涂格不会重渲染整页；Context + reducer 的订阅粒度只能是整棵子树。
- 拖拽绘制、requestAnimationFrame 计时、localStorage 存档都需要在 React 之外读写状态（useGameStore.getState()、直接写 DOM），Context 做不到。
- 不需要 Provider 嵌套，页面切换（游戏页 <-> 设置页）时状态天然保留。

### D2. 难度必须由算法评估，且不能只看尺寸

- 判据是「解出这道题所需的最高级技巧 + 回溯次数」，用**同一个求解器**像人一样解题，统计 guesses（回溯次数）、solutionDepth（假设链深度）、failedGuesses、longCrossings 等指标。
- 纯按推理指标分级会出现「15×15 被判成简单」，与需求表的尺寸列矛盾，因此补一条**尺寸地板**（≤10 简单 / ≤15 中等 / ≤19 困难 / ≥20 专家），并且**尺寸只能抬高难度不能降低**。这条规则抽成了 sizeFloorFor()，被分级逻辑与生成器共用，避免两处定义漂移。
- 指标来自固定启发式 + 固定假设顺序，所以对同一谜题完全可复现，可放心用于 UI 展示与成绩分组。

### D3. 生成器加「唯一性修形」，而不是只靠丢弃重试

- 实测：随机图案绝大多数是**多解**的，直接丢弃会让高难题产出率极低（调优阶段 16×16 采样 14 次里 guesses>0 只有 1~3 个）。
- 做法（repairToUnique）：「数到第 2 个解 -> 翻转两者的一个差异格 -> 再数」，最多 10 轮。既提高了产出率，又保留了那些真正需要试错的结构，因此高难题才稳定可达标。

### D4. 谜题 id 只能包含「基准种子」（开发中发现的真实 bug）

- 现象：分享/刷新时用 #/play?p=hard-17x19-xxx-2 重新生成，得到的却是**另一道题**。
- 原因：生成器内部按 seed-1、seed-2… 逐个试候选，胜出的候选种子被写进了谜题 id；重放时又在它后面追加一次序号，等于换了候选。
- 修复：对外统一只暴露基准种子（generator.attemptGenerate 在返回前重写 id/seed）。
- 保险：src/game/newGame.ts 生成新题后会**再验证一次**「按 id 重放 == 同一道题」，不通过就换策略，因此「刷新继续玩」和「分享链接」不可能串题。回归测试见 tests/replay.test.ts。

### D5. 渲染方案：DOM + CSS Grid，编辑器大画布用缩放 + 滚动，不上 Canvas

- 游戏页上限 25×25（625 个格子），DOM 完全无压力；格子外观由 CSS 变量 + data-state 驱动（拖拽期间直接写 dataset），没有逐格样式计算。
- 上 Canvas 会失去 DOM 的悬停高亮、无障碍命中、CSS 主题变量等便利，收益不成正比，故不做。
- 编辑器支持到 50×50：用 zoom(6~48px) + 滚动容器 + 「适应窗口」按钮处理；游戏页仍明确建议 ≤25×25。

### D6. 拖拽期间不碰 React 状态

- 拖拽中把变更累积在一个 Map 里，直接写 el.dataset.state 做视觉反馈，**抬手时一次性提交**（一次 set() = 一次渲染，撤销栈只压一条），因此不会逐帧全量重渲染。
- 拖拽开始时锁定动作类型（painted 集合防止重复经过时来回翻转），符合需求里的拖拽语义。
- 橡皮 / 铅笔 / 矩形 / 直线共用同一套提交流程；矩形与直线在拖拽中用「先还原上一帧预览，再画新预览」的方式实现实时预览。

### D7. 计时用时间戳差值，不用累加计数器

- elapsed = accumulatedMs + (now - runningSince)；requestAnimationFrame 只以约 5Hz 刷新显示。后台标签页被节流、暂停/恢复、切标签都不会累积漂移。暂停时停止累加并用不透明遮罩盖住棋盘。

### D8. 恢复对局时立刻继续计时（否则「刷新」等于免费暂停）

- 恢复时 started = true 且立刻设置 runningSince。若恢复后计时不跑，玩家刷新页面就能白拿暂停，成绩就不可比了；真正想暂停请用暂停按钮。

### D9. 判定模式在开局时固定，设置里改「下一局生效」

- 严格/极限模式会影响错误计数与罚时，中途切换会让同一条成绩失去可比性。设置页已明确写出这一点，避免玩家以为设置坏了。

### D10. 分享链接用位压缩 + base64url；本地棋盘存档用 0|1|2 字符串

- 分享码只含「图案 + 尺寸 + 难度」：每格 1 bit -> 字节 -> base64url（无填充）。15×15 只有 29 个字符，链接短、可自包含、无需后端。
- 本地进度保存的是**玩家棋盘**，有 3 种状态（空 / 填充 / X），无法位压缩，因此用 0|1|2 字符串（可读、无歧义，25×25 也才 625 字符）。
- 两种编码都手写实现（不依赖 btoa/atob/Buffer），保证浏览器与 Node（测试）结果一致。

### D11. 自定义谜题走分享码（?s=）开局，而不是谜题 id（?p=）

- 谜题 id 的前提是「用种子能重新生成同一图案」，而手画图案与种子无关。
- 因此编辑器把图案编码进 ?s= 开局；并且为了让 store 里的谜题 id 与解码结果完全一致，编辑器构造谜题时会刻意绕一圈「编码 -> 解码」（buildEditorPuzzle），这样「刷新页面恢复进度」依然能命中同一个 puzzleId。

### D12. 生成放主线程同步执行，不做 Web Worker

- 实测 20×20（专家）平均 1.7ms、最慢 4.8ms，比「20×20 < 1 秒」的要求低两三个数量级，起 Worker 的通信与打包成本反而更高。
- 界面先切到 loading 遮罩、yield 一帧再生成，避免长任务让界面看起来卡死；超预算时生成器自带降级（缩尺寸 / 降档）。

### D13. 不可达的难度请求要快速失败

- 「尺寸只能抬高难度」意味着「20×20 想判成简单」数学上不可能达标。生成器用 isDifficultyReachable() 判断，不可达时只跑少量候选（12 次）就返回最接近的备选：实测该场景从约 276ms 降到约 12~14ms，且题目仍然唯一解。

### D14. 用 URL hash 路由

- #/、#/play?p=…、#/play?s=…、#/editor、#/settings。GitHub Pages / Vercel 都不需要 rewrite 或 404 回退规则，刷新任意页面都能正确落回同一路由。

### D15. 移动端：模式按钮为主，长按为辅

- 需求要求「触摸操作必须完整」：填充 / 标记各有一个模式按钮（<sm 显示），长按 450ms 临时切换笔尖（带轻微震动反馈）。
- 长按只是辅助：即使浏览器对手势的处理有差异，模式按钮也能完成全部操作。

### D16. 提示与罚时

- 提示优先给「逻辑上最该确定」的格子（复用求解器推理顺序日志）；确实推不动时退化为猜测提示，并在界面上明确标注「属于猜测提示」，不假装是纯逻辑。
- 罚时默认每次 +15s，可在设置里关闭；极限模式每涂错一格 +10s。

### D17. 测试策略

- 求解器是全局正确性的根基，因此用「DP 与暴力枚举 3000 条随机线逐一比对」来钉死，而不是只测几个手写样例。
- 把验收标准里可自动化的部分直接写成 tests/acceptance.test.ts（唯一解、难度区间、线索一致、20×20 < 1 秒、快速失败、同种子一致），这样 `pnpm test` 就是验收的一部分，而不是人工看数字。

### D18. 环境/依赖配置修正

- pnpm 11 不再读 package.json 的 pnpm 字段，且 pnpm-workspace.yaml 里残留了 `allowBuilds: esbuild: set this to true or false` 这种占位内容，导致 `pnpm run …` 在运行前的依赖校验阶段直接失败（ERR_PNPM_IGNORED_BUILDS）。
- 已改为 allowBuilds: { esbuild: true } + onlyBuiltDependencies: [esbuild]，并加 .npmrc 的 verify-deps-before-run=false；现在 pnpm install / pnpm run build / pnpm test 均正常。

### D19. 自动生成的盘面固定为「5 的倍数正方形」（本轮新需求）

需求：自动生成的盘面必须是**正方形且边长是 5 的倍数**，不要出现 11×11、12×13、15×10 这类盘面。

- 做法：把「在难度尺寸带内随机取边长」改成「每档一个固定尺寸」——`boardSizeFor(difficulty)` 直接读
  `DIFFICULTY_META[difficulty].boardSize`（另导出返回边长的 `boardSideFor`）：简单 **5×5**、中等 **10×10**、
  困难 **15×15**、专家 **20×20**。
- 为什么四档只能这么分：难度判定的尺寸地板是「≤10 简单 / ≤15 中等 / ≤19 困难 / ≥20 专家」，
  而 5 的倍数正方形只有 5 / 10 / 15 / 20 / 25 五个候选，尺寸与难度几乎是硬绑定（5×5 不可能判成困难、
  20×20 一定判成专家）。要让四档各自命中一个尺寸，5 / 10 / 15 / 20 是唯一一组能覆盖四档的解；
  25×25 留给编辑器和自定义谜题（同时避免手机格子过小）。
- 决策前先做了实测采样（每个组合若干种子，看能否达到目标难度），结论与最终方案一致：

  | 目标难度 | 5×5 | 10×10 | 15×15 | 20×20 | 25×25 |
  | --- | --- | --- | --- | --- | --- |
  | 简单 | ✅ 100% | ✅ 100% | ❌ 0% | ❌ 0% | ❌ 0% |
  | 中等 | ⚠️ 约 80% | ✅ 100% | ✅ 100% | ❌ 0% | ❌ 0% |
  | 困难 | ❌ 0% | ⚠️ 约 60% | ⚠️ 改造前约 55% → 改造后 100% | ❌ 0% | ❌ 0% |
  | 专家 | ❌ 0% | ❌ 0% | ⚠️ 约 10% | ✅ 100% | ✅ 100% |

  （❌ = 数学上不可达或实测 0%，⚠️ = 可达但命中率不足，✅ = 稳定达标；改造细节见 D20。）
- `DIFFICULTY_META` 里保留了需求表的 `minSize/maxSize`（用于文档与展示），新增 `boardSize` 表示**实际生成尺寸**，
  两者都写在同一处，避免文档与代码漂移；首页难度卡片也从「5~10」改成显示真实的「5×5」。

### D20. 困难档加大候选预算，并把生成参数收敛到一份常量

- 数据：15×15 要判成「困难」，必须**恰好**落在「3~10 次回溯」这个很窄的窗口里（0~2 次是中等，>10 次是专家）。
  原来 200 次候选只能达标 11/20。把候选上限按难度改成函数（`defaultMaxAttempts`：困难 1200、中等 600、
  简单/专家 200），并让困难档的图案更碎（blobCount 11 / scatterCount 20 / noise 0.2 / smoothing 0）之后，
  40 个种子 **40/40 达标**，实测最多用到 560 次候选、平均 126 次、最慢 0.75 秒（仍远低于需求的 1~2 秒上限）。
- **同一道题必须用同一套参数**：`regenerateFromId`（刷新 / 分享链接）和 `createNewGame` 原来各自写死
  `timeBudgetMs: 4000, maxAttempts: 200`。本轮把候选上限改成「按难度取值」后，只改一处就会退化成
  「玩到一半刷新变成另一道题」。因此收敛为 generator 里的共享常量 `GENERATION_TIME_BUDGET_MS` +
  `defaultMaxAttempts(难度)`，两边都不再自带数字。
  这个坑在本轮**真实触发过一次**：`tests/replay.test.ts` 里测试自己传了 `maxAttempts: 200`，
  与重放端的默认值不一致，出现「hard #2 图案不一致」；改成两边共用默认值后通过，并在测试里写了注释说明原因。
- 降级路径重写：尺寸固定成 5 的倍数正方形后，已经没有「缩小尺寸但保持同档」这种操作（缩到下一个
  5 的倍数就直接跨档了），所以降级改为**直接换相邻的更简单档位**（尺寸随之切换），notice 里如实写出实际档位与尺寸。

### D21. 一键运行脚本（Windows 双击即用）

- `start.bat`：检查 Node.js → 按需安装依赖（存在 `node_modules/vite` 就跳过）→ 启动开发服务器并自动打开浏览器；
  优先 pnpm，没有 pnpm 自动回退 npm。`build.bat`：类型检查 + 生产构建 + `vite preview` 预览。
- 四条错误分支（没装 Node.js / 没有 pnpm 与 npm / 依赖安装失败 / 构建失败）都打印中文原因与下一步做法并 `pause`，
  不会「一闪而过」；并在提示里给出官网地址与修复命令。
- 开发中实测到两个 Windows 批处理的坑，都写进脚本注释了：
  1. **`chcp 65001` 必须在所有中文之前**：控制台代码页不是 65001 时，cmd 会按本地代码页（GBK）解码
     批处理文件里的 UTF-8 字节，中文乱码还会把行拆断（实测报出一堆 `'分钟...' is not recognized`）。
     所以它放在 `@echo off` 之后、任何中文注释之前（第二行）。
  2. **换行必须是 CRLF**：用 LF 存出来的 .bat，cmd 对 `:no_node` 这类标签会解析错位
     （实测报 `'no_node' is not recognized`，甚至把 `if (...)` 块拆断）。统一成 CRLF 后正常。
- 验证方式：把 `pnpm` 换成一个只打印参数的假命令，逐一跑通「正常启动」「没有 Node.js」「没有 pnpm/npm」
  「依赖安装失败」四条分支，中文输出与 `goto` 跳转都正确。

### D22. README 补齐本地运行与在线部署，并附上 Pages 工作流

- 本地运行：环境要求（Node 18+，推荐 20/22 LTS）、pnpm 的两种安装方式、一键脚本用法、五条命令各自的作用、
  以及 7 条常见问题（端口被占用、缺 pnpm、esbuild 构建脚本被 pnpm 忽略、依赖装坏重装、白屏原因等）。
  特别写明 **`pnpm preview` 才是验证生产版本的正确方式**：`file://` 下 ES Module 受 CORS 限制，
  直接双击 `dist/index.html` 会白屏。
- 在线部署：GitHub Pages（Actions 自动部署 + 手动推 `gh-pages` 两种，含完整 workflow）、Vercel、Netlify、
  Cloudflare Pages、自定义域名与 HTTPS；并解释两个「换托管不用改代码」的设计原因：
  `base: './'`（子路径也能用）与 hash 路由（不需要任何 rewrite / 404 回退规则）。
- 顺手把工作流落成仓库文件 `.github/workflows/deploy.yml`（Node 20 + pnpm 9，输出 `dist`），
  用户把仓库推到 GitHub 后，只要在 Settings → Pages 选「GitHub Actions」即可上线。

### D23. 支持 frp / 内网穿透把游戏开放到公网

需求：用户已用 frp 把 5173 端口映射到公网，要求游戏能被公网访问。

- **实测发现两个会让隧道「看起来通了但打不开」的坑**，都在 `vite.config.ts` 里一次解决：
  1. **监听地址**：Vite 默认只监听 localhost，而本机 `localhost` 解析到 IPv6 `::1`
     （`Get-NetTCPConnection` 显示 `LocalAddress = ::1`）。frp 默认连 `127.0.0.1:5173`（IPv4），
     实测直接 `Connection refused`（`curl` 返回 000），也就是**改代码前隧道根本连不上本地服务**。
     → `server.host: true`（监听 `0.0.0.0`，同时覆盖 IPv4/IPv6）。
  2. **Host 校验**：Vite 5.4.12+ 加了 DNS rebinding 防护，未知 Host 一律 `403 Blocked request`，
     公网域名访问必然被拦。→ `server.allowedHosts: true`（并保留 `allowedHosts: ['域名']` 白名单的写法在注释里）。
  3. 顺带把端口固定（`strictPort: true`）：端口漂移会让公网映射指向空气，这种情况报错比静默换端口更好。
- `preview` 段同样配置，并新增 `pnpm share` / `share.bat`：先生产构建、再用 5173 端口把 `dist/` 挂出去。
  公开分享**推荐用这个而不是开发服务器**——开发服务器会把源码与 source map 一起发出去，且没有任何鉴权。
- 验证（都在本机跑过，且不依赖用户的 frp 服务）：
  - `curl http://127.0.0.1:5173/` → 200（改前 000 / Connection refused）；
  - `curl -H "Host: game.example.com" http://127.0.0.1:5173/` → 200（改前会是 403）；
  - 写了一个 10 行 TCP 中继（外部 8080 → 本地 5173）**模拟 frp 的 tcp 代理**，用内置浏览器访问：
    首页四档难度正常、可开局、URL 变为 `#/play?p=easy-5x5-…`，且开发模式下控制台打印 `[vite] connected.`
    （说明 HMR 的 WebSocket 也能穿过中继）；生产预览模式下同样可玩（`./assets/…` 相对路径加载正常）。
- 文档侧：README 新增 1.5 节（配置表、frpc.toml / INI 示例、自测表现、安全提醒、HMR 连不上时的
  `server.hmr = { protocol: 'wss', clientPort: 443 }` 兜底写法），并在「在线部署」章节交叉引用。

---


### D24. 移动端「无法上下滑动」的根因与修复（第三轮）

需求：手机上运行游戏时页面无法上下滑动。

**排查方式**：用内置浏览器把视口设成 375×667 / 375×812 / 320×568 / 667×375 / 1280×800，
逐页读 `documentElement.scrollHeight`、`clientHeight` 与各层容器的 `overflow / min-height`。

| 页面 | 改前实测 |
| --- | --- |
| 首页 | 内容 `scrollHeight = 1251`，但 `documentElement.scrollHeight = clientHeight = 667` → **整个文档不可滚动**，底部 584px 永久看不到 |
| 设置页 | 内容 1155，同样被裁到 667 |
| 游戏页 | 375×812 恰好放得下；更矮 / 横屏时棋盘被 `overflow-hidden` 裁掉，且无处可滚 |

**根因（三层叠加）**：

1. `html / body / #root { height: 100% }`，`App.tsx` 外壳又是 `h-full overflow-hidden`：
   应用被钉死在「一屏」高度，超出的内容被**直接裁掉**而不是产生滚动条；
2. 首页 / 设置页写的 `min-h-full overflow-y-auto` 是**假滚动容器**：
   `height: auto` 的盒子即使写了 `overflow-y: auto` 也永远不会滚动（它只会随内容一起长高），
   必须由父级给出确定高度（`h-full`、或 `flex-1 + min-h-0`）才会出现滚动条；
3. `body { overscroll-behavior-y: none }` 全局吃掉了下拉刷新与滚动链，进一步加重了「滑不动」的手感。

**为什么不能只删掉 `overflow-hidden`**：`height: 100%` 在手机上取的是**大视口**（地址栏隐藏时的高度），
比当前可见区域高 60~120px，底部内容就算能滚也会被浏览器工具栏压住。

**修复原则**：滚动优先交给**文档**（移动端最不容易出问题的模型）；
只有确实需要「按可用空间自适应」的页面才锁一屏高度，并各自带内部滚动兜底。

- `#root`：`min-height: 100vh`，用 `@supports` 升级成 `100dvh` / `calc(100dvh - env(safe-area-inset-bottom))`；
- 外壳：去掉 `overflow-hidden`，改 `flex flex-1 flex-col`；
- 首页 / 设置页：删掉假滚动容器，改流式布局由文档滚动（`sticky` 吸顶头部照常生效）；
- 游戏页 / 编辑器页：新增 `.app-screen` 锁一屏高（内部 flex 需要确定高度才算得出棋盘可用空间），
  `<main>` 加 `overflow-y-auto overscroll-contain`，装不下时内部滚动、顶部工具栏固定可见；
- `GameBoard`：新增棋盘区 `min-height` 下限（按 `MIN_CELL = 11px` 反推整块棋盘需要的高度），
  空间真的不够时不再压缩 / 裁切棋盘，而是让 `<main>` 出现滚动条 —— 改前 667×375 横屏下棋盘会被裁掉约 36px；
- 删掉 `body` 的 `overscroll-behavior-y: none`（真正要禁止滚动的棋盘拖拽由 `.nb-cell` 的 `touch-action: none` 负责）；
- 补 `env(safe-area-inset-bottom)` 安全区，避免 iOS 手势条压住底部按钮。

**验证（改前 → 改后）**：

| 视口 | 首页可滚动 | 游戏页棋盘完整 | 游戏页底部状态栏 | 横向滚动 |
| --- | --- | --- | --- | --- |
| 375×667 | 否 → 是 | 是（格子 14px） | 可见 | 无 |
| 390×844 | 否 → 是 | 是（格子 15px） | 可见 | 无 |
| 320×568 | 否 → 是 | 是（格子 12px） | 可见 | 无 |
| 667×375（横屏） | 否 → 是 | 是（格子 11px；改前被裁 36px） | 内部滚动 67px 后可见 | 无 |
| 1280×800（桌面） | 不需要滚动 | 是（格子 26px） | 可见 | 无 |

交互回归：点击涂黑、拖拽连涂（一行 5 格一次成型）、右键标记、`Ctrl+Z` / `Ctrl+Shift+Z` 撤销重做全部正常。

---

### D25. 一键脚本自检端口占用（本轮：`Port 5173 is already in use`）

背景：上一轮为了验证公网访问，我在这台机器上留了一个开发服务器占着 5173，用户随后双击 `start.bat`
就撞上了 Vite 的 `Port 5173 is already in use`。端口固定是有意为之（frp 映射需要稳定端口），
但**报错方式对用户太不友好**：一个红字错误 + 栈，看不出「关掉上一个窗口就行」。

处理：把「端口占用」变成脚本内可自助解决的一步，而不是让 Vite 抛错。

- 启动前用 `netstat -ano | findstr LISTENING | findstr ":5173 "` 取监听进程 PID
  （只保留 LISTENING 行，避免把「本机作为客户端连别人 5173」也算进来）；
- 用 `tasklist /fi "PID eq <pid>" /nh /fo csv` 取进程名（`tokens=1 delims=,` + `%%~n` 去掉引号），
  打印成「端口 5173 已被占用：node.exe (PID 1234)」，并点明最常见原因是上次的运行窗口没关干净；
- `choice /c YN` 询问：`Y` → `taskkill /f /pid` 后等约 2 秒（`ping -n 3`）再启动，避免刚结束就 bind 失败；
  `N` → 打印三种手动处理办法（关窗口 / 任务管理器 / `taskkill`）后退出。
  `choice` 若不存在（极老的系统）会返回 9009，`if errorlevel 2` 判定为真，自动落到「N」的安全分支；
- 顺手修掉另一个坑：启动改用本地入口 `node node_modules/vite/bin/vite.js`，
  不再依赖 `pnpm exec vite`（本机实测 `pnpm exec vite` 会报 `'vite' is not recognized`，
  而直接跑本地入口稳定可用）；
- 新增 `--no-open` 参数，方便脚本自测时不弹浏览器。

实测（本机，用 5173 上放一个监听进程复现冲突）：

| 场景 | 结果 |
| --- | --- |
| 5173 空闲 | `[3/4] 端口 5173 可用` → `[4/4] 启动开发服务器...`，随后进入正常的 Vite 启动流程 |
| 5173 被占用 + 按 `N` | 打印「已被占用：<进程名> (PID xxxx)」与三种手动办法，脚本以退出码 1 结束，不会一闪而过 |
| 5173 被占用 + 按 `Y` | 走 `taskkill` → 提示端口已释放 → 继续启动 Vite |
| 输入非法（回车） | `choice` 报错被 `if errorlevel 2` 兜住，落到「N」分支，不崩 |

说明：`taskkill` 与 `tasklist` 在我的沙箱里被禁止（返回 `Access denied`），
所以「真正结束进程」这一步只在脚本逻辑层面验证过；在用户双击运行的普通环境里这两个都是标准命令。

### D26. 线索自动划线改成「以解为准 + 逐条线索」，并做成设置开关（本轮）

用户反馈：明明找对了数字却没划掉、没找出来却已经划掉了。实测复现出**两个独立原因**：

1. **列线索读错了格子**（「找对了不划掉」）：`GameBoard` 调划线函数时，行、列都传了
   「线长」参数 —— 列传的是 `height`、步长仍是 1，于是读的是「第一行的前 height 格」而不是第 x 列。
   5×5 棋盘第 0 列全填、线索 `[5]` 时，正确读法应得「已划线」，旧实现得 0（不划线）。
2. **旧算法太弱**（「没找出来却划掉」）：它只按顺序从左到右把玩家涂的段与线索配对、段长相等就划掉，
   完全没有「解的约束」概念。实测：解是 `00010` 的第 4 行（线索 `[1]`），玩家把第 4 格（解里是白格）涂黑，
   数字**照样被划掉**。

决策：判定标准改成完全以「解」为准，逐条线索给进度。

| 规则 | 说明 |
| --- | --- |
| 条件 1 | 这一行/列**没有涂错的格子**（不存在「解里是白、玩家却涂黑」的位置） |
| 条件 2 | 解里**第 j 段连续黑格**的每一格都已经涂黑 |
| 二者同时成立 | 第 j 条线索变灰 + 删除线（逐条判断，保留「先做对哪一段」的进度感） |
| 空线索 `[0]` | 永远不划线（否则开局满屏空白行列会被立刻划掉，反而看不出进度） |
| X 标记 | 不影响判定（只比较「涂黑」的格子，与胜负判定一致） |
| 涂错一格 | 该行/列的所有划线**暂时消失**（涂法已与线索矛盾），改正后自动恢复 |

取舍说明：用「解」判定，等于给玩家一个「这一行对不对」的粗略提示。这是这类划线功能的常规做法，
但对只想靠「检查」按钮判定的宽松模式玩家并不合适，所以**做成设置开关**（设置 → 外观 → 线索自动划线，
默认开启）；关掉后 `GameBoard` 直接把进度数组置空，连计算都省掉。

实现：每条线只扫一遍（行 `step = 1` / 起点 `y × width`，列 `step = width` / 起点 `x`），
不再需要早期的 DP 版本（那版只判断「位置是否唯一」，恰恰会导致上面第 2 类误判）。

验证：新增 `tests/progress.test.ts`（17 条，含上面两个 bug 的回归用例：列必须按 `step = width` 读、
涂错位置不得划线）；浏览器实测 7 组场景（见第三轮验收表下方）。

### D27. 生成器主动消除「全空 / 全满」的行列（本轮）

需求：尽量避免某一行/某一列为全空或全满，尤其是高难度。

修复前实测（各难度 30 题采样，退化线 = 全空行/列 + 全满行/列）：

| 难度 | 有退化线的题 | 退化线总数 | 单题最多 |
| --- | --- | --- | --- |
| 简单 | 26/30 | 54 | 3 |
| 中等 | 20/30 | 42 | 5 |
| 困难 | 2/30 | 2 | 1 |
| 专家 | 12/30 | 31 | **7** |

做法分四层（`generator.ts`）：

1. `countDegenerateLines()`：把「退化线数量」变成可度量的质量指标。
2. `reduceDegenerateLines()`：**主动修**。全空的线补一格、全满的线减一格；两条安全规则保证不会
   「按下葫芦浮起瓢」—— 补格永远不会制造新的全空线（但要避开「垂直方向只差这一格就满」的位置），
   减格永远不会制造新的全满线（但要求「垂直方向至少还有 2 个黑格」）。位置按 8 邻域黑格数挑，
   让图案仍像「有意义的图形」，而不是满天星。
3. 接进生成循环：候选图案生成后先补一遍（此时还没有唯一性可言，不必额外验证）；
   `repairToUnique` 在证明唯一之后检查退化线，有就消掉并**回头重新验证唯一性**（修形会改线索），
   循环上限从 10 提到 16 轮，并始终保留过程中「唯一且退化线最少」的那个候选。
4. 达标候选的取舍：`DEGENERATE_LINE_CAP = { easy: 1, medium: 1, hard: 0, expert: 0 }`。
   达标但还不干净的候选先拿在手里（`bestMatch`），再多花最多 250 ms 找更干净的版本
   （`cleanDeadline`）；找不到就用手上这个 —— **绝不会因为追求干净而丢掉一次达标**。
   兜底图案也从「隔行全填」换成「每行只放一段、段长严格大于半宽」的构造：
   这种行的线索是 `[L]`，而长度 L 在整行里只有唯一摆法 ⇒ 全盘被行线索钉死（唯一性不靠搜索证明），
   同时既不会全满也不会全空。

修复后实测（同样 30 题采样，另加验收用的 `accept-*` 种子 20 题）：

| 难度 | 修复前（30 题） | 修复后（30 题） | 验收种子（20 题） | 生成耗时变化 |
| --- | --- | --- | --- | --- |
| 简单 | 26 题 / 54 条 | **0 / 0** | 0 / 0 | 0.4 ms（不变） |
| 中等 | 20 题 / 42 条 | **1 题 / 1 条** | 0 / 0 | 12 → 16 ms |
| 困难 | 2 题 / 2 条 | **0 / 0** | 0 / 0 | 272 → 280 ms（最慢 1.2 s，含额外搜索） |
| 专家 | 12 题 / 31 条 | **0 / 0** | 0 / 0 | 2 ms（不变） |

新增验收断言：`tests/acceptance.test.ts` 里「各档 20 题退化线总数 ≤ 上限（困难/专家 ≤ 1，
实测 0）」+ `countDegenerateLines` 的边界用例（全空 / 全满 / 中心一格 / 3×5 矩形 / 无退化）。

### D28. 项目改名为 Nonogram Online，并以 MIT 开源 + 署名生成模型（本轮）

- 对外统一名称 **Nonogram Online**（中文别名保留「数织工坊」，英文名做标题、中文名做副标题，
  既有用户不会因为一次改名找不到项目）。改动点：`package.json` 的 `name`/`description`/`homepage`、
  `index.html` 的 `<title>` 与 `description`、首页头部、设置页「关于」、「start/build/share.bat」的窗口标题与横幅。
- **协议选 MIT**：本项目是纯前端小工具，希望别人能直接拿去改（甚至整段抄进自己的项目），
  MIT 是最短、最不需要解释、兼容性最好的选择（对比：GPL 会传染、Apache-2.0 多了专利与 NOTICE 负担）。
  版权行写 `Copyright (c) 2026 rusheng-world`（用 GitHub 账号名，和仓库/Pages 地址一致）。
- **README 显著位置注明「本项目由 `deepseek-v4.1-flash` 生成」**：包括首页信息表、正文引用块、
  设置页「关于」，以及 `package.json` 的 description。生成方式属于使用者需要知道的事实（影响信任与维护预期），
  藏在角落没有意义。
- 提交 `package.json` 时保留 `"private": true`：它的唯一作用是防止误 `npm publish`，
  和「是否开源」无关，留着更安全。

### D29. 发布走 GitHub Actions + Pages 的 workflow 模式（本轮）

- 选 `build_type=workflow`（Actions 构建后上传 artifact），而不是「把 `dist/` 推到 `gh-pages` 分支」：
  构建过程留在 CI 里、可复现（Node/pnpm 版本固定），仓库里也不必存构建产物。
- 用 `gh api -X POST repos/<owner>/<repo>/pages -f build_type=workflow` 先把 Pages 打开，
  再让 `actions/configure-pages@v5` 接手 —— 顺序反了的话第一次运行会在 configure-pages 这步失败。
- `vite.config.ts` 的 `base: './'` 不需要改成 `/nonogram-online/`：产物用相对路径引用资源，
  子路径（`https://<user>.github.io/<repo>/`）与根路径都能跑，换托管平台也不用改代码。
- 部署链路：`git push origin main` → `.github/workflows/deploy.yml` → 构建 `dist/` → 发布。
  实测一次运行约 35 秒。

### D30. 本机推不上 github.com 时的兜底：走 `ssh.github.com:443`（本轮踩到的真实环境问题）

- 现象：`git push` 走 HTTPS 时报 `Recv failure: Connection was reset`；但 `gh`（走 `api.github.com`）
  一切正常。实测 `github.com:443` 连不通、`ssh.github.com:443` 与 `api.github.com:443` 通。
- 处理：在 `~/.ssh/config` 写一个 `Host github.com` 段落（`HostName ssh.github.com` / `Port 443` /
  `User git` / `IdentityFile ~/.ssh/id_ed25519`），并把 remote 换成 `git@github.com:...`。
  本机已存在的 ed25519 key 直接可用（`ssh -T git@github.com` 返回 `Hi rusheng-world!`）。
- 这属于**本机网络环境**的限制，与项目代码无关；换网络/加代理后 HTTPS 也能用。
  写进文档是因为下一个人（或下一次部署）大概率会撞到同一堵墙。

### D31. 用 `.gitattributes` 固定 `.bat` / `.cmd` 为 CRLF（本轮）

- `start.bat` 里用了 `goto` + 标签，文件被检出成 LF 时 cmd 解析会错位（脚本开头注释里已经写了这条经验）。
- 仓库里统一存 LF（`* text=auto`），只在检出时对 `.bat` / `.cmd` 用 `eol=crlf`；
  二进制（png/ico/woff 等）标记为 `binary` 不做任何转换。
- 这样 Windows 用户 clone 下来双击脚本仍然正常，macOS / Linux 用户的源码也不会被塞满 CRLF。

### D32. 本轮代码复核发现并修掉的三个真实问题（本轮）

1. **「重新开始本题」没有清本地存档**（`gameStore.restart()`）：重开后如果**先刷新一次页面**，
   `loadProgress()` 会把重开前的棋盘恢复回来 —— 玩家会以为「重开没生效」。
   修法：`restart()` 里先 `clearProgress()` 再 `startPuzzle(puzzle, judgeMode, null)`。
2. **编辑器的矩形 / 直线工具，起点那一格不遵守对称设置**（`EditorPage.onPointerDown`）：
   起点直接调 `stageCell` 绕过了 `withSymmetry`，所以「四向对称 + 点一下不拖动」只画 1 格，
   而拖动时是 4 格。修法：起点改走 `paintPath(drag, index, index, true)`，与拖动路径同一条逻辑。
3. **两处 `void xxx` 掩盖的无用解构**（`applyStroke` 里的 `started`、`markWin` 里的 `penaltyMs`）：
   变量根本没用上，只是为了让 lint 闭嘴，已直接删除解构项。

复核方法：全文件通读 `src/**`（core / store / components / pages / hooks 一遍）、
静态扫描 `dangerouslySetInnerHTML|innerHTML|eval(|new Function|: any|as any|@ts-ignore|console.log|TODO|FIXME`
（**0 命中**）、`tsc -b`（strict）零报错、70 个用例全绿、线上站点实操（下一节 R6）。

### D33. CI 里 pnpm 版本只能指定一次，且 pnpm 11 要求 Node ≥ 22.13（本轮）

- 第一次 Actions 运行直接失败：`Error: Multiple versions of pnpm specified` —— 工作流写了
  `pnpm/action-setup@v4 with: version: 9`，而 `package.json` 里有 `packageManager: pnpm@11.19.0`，
  新版 action-setup 认为这是冲突并直接报错。
- 修法：**工作流里不写 version**，让 action 自己去读 `packageManager`（单一事实来源）。
  已确认 `pnpm@11.19.0` 在公共 registry 上存在，且 `lockfileVersion: '9.0'` 是 pnpm 9/10/11 通用格式，
  `--frozen-lockfile` 可以正常通过。
- 同时 `node-version: 20 → 22`：`pnpm@11.19.0` 的 `engines.node` 是 `>=22.13`，Node 20 上装不了。

---
## 二、分阶段实现说明

| 阶段 | 做了什么 | 怎么验证 | 遗留问题 |
| --- | --- | --- | --- |
| 1. 脚手架 + 数据结构 + 线索 + 求解器 | Vite/TS/Tailwind 工程、统一 3 态数字编码、computeLineClues、DP 线索传播求解器（含假设分支、唯一性、预算保护、提示） | clues.test.ts（10）、solver.test.ts（11，含 3000 条线与暴力枚举比对、多解、无解、矛盾） | 无 |
| 2. 生成器 + 难度评估 | 团块生长/对称/噪声混合图案、repairToUnique 修形、classifyDifficulty 规则 + 尺寸地板 + 连续分、降级与快速失败 | generator.test.ts（8，四档各 20 题全部唯一解且达标）、acceptance.test.ts | 高难题产出率依赖修形，极端情况下会降级（界面会提示实际难度） |
| 3. 棋盘渲染 + 基础交互 | GameBoard（DOM+CSS Grid、指针事件、拖拽锁定、直接写 DOM、行列高亮、每 5 格辅助线、键盘光标）、线索条与自动划线 | 浏览器实测：点击 / 右键 / 拖拽 / 撤销 / 重做 / 线索划线 | 长按切笔尖在真机上的手感未实测（见验收 #4） |
| 4. 判定 + 计时 + 撤销重做 + 提示 + 存档 | 三档判定（宽松检查 / 严格闪红抖动 / 极限永久红痕 + 罚时）、时间戳计时与暂停遮罩、200 步撤销、逻辑提示、localStorage 存档与最佳成绩 | 浏览器实测三档判定、暂停遮罩、提示完成一局并写入最佳成绩与历史、刷新恢复进度与计时 | 无 |
| 5. 自定义编辑器 + 导入导出 | 五种工具 + 对称绘制 + 翻转旋转 + 缩放/适应窗口、实时线索与唯一性检查、文本导入导出、分享链接、开始游戏 | 浏览器实测：拖拽绘图、导入多解图案（正确报「多解」并警告）、开始游戏进入 ?s= 对局、分享码往返一致 | >30×30 跳过唯一性校验（界面已说明） |
| 6. 首页 / 设置 / 成绩 + 响应式打磨 | 四档难度卡片、每日一题、继续上一局、历史成绩、编辑器入口、设置页（判定/主题/音效/罚时/自动暂停/数据清理）、哈希路由与主题预加载 | 浏览器实测：首页生成四种难度、每日一题、再来一局自动开局、设置项生效与数据清理、375px 无横向滚动 | 大棋盘在手机上格子偏小（见已知限制 3） |

### 第二轮（本轮）改动

需求：① 加可双击运行的本地一键脚本；② 自动生成的盘面改成「5 的倍数正方形」；③ README 补齐本地运行与在线部署。

| 阶段 | 做了什么 | 怎么验证 | 遗留问题 |
| --- | --- | --- | --- |
| A. 尺寸改造 | 每档固定尺寸（5×5 / 10×10 / 15×15 / 20×20），`boardSizeFor` 取代随机取边长；`DIFFICULTY_META` 增加 `boardSize`；首页难度卡片改成显示真实尺寸 | 先做采样确定可行的尺寸↔难度组合（见 D19 的表），再改代码；`pnpm test` 全绿 + 内置浏览器实测四档开局盘面分别为 25 / 100 / 225 / 400 格 | 5×5 只能出「简单/中等」、20×20 一定「专家」，属于尺寸地板的硬约束（已写进已知限制） |
| B. 困难档生成 | 提高困难档图案碎片度、候选上限按难度取值、预算常量收敛到 generator 共享；重写降级分支 | 40 个种子 40/40 达标（最多 560 次候选、最慢 0.75s）；新增「困难档 15×15 全部达标且 < 2 秒」用例；`replay.test.ts` 复现并修掉了参数不一致带来的串题隐患 | 困难档平均生成约 0.26 秒，明显慢于其他档（难度的代价，界面有 loading 遮罩） |
| C. 一键脚本 | `start.bat`（装依赖 + 起服务 + 开浏览器）、`build.bat`（构建 + 预览）、四条错误分支的中文提示 | 用假 pnpm 命令跑通四条分支；真实执行 `start.bat` 走到「启动服务器」这一步 | 仅 Windows；macOS / Linux 仍走命令行 |
| D. 文档 | README 重写「本地运行 / 在线部署」两章并更新尺寸与性能数据；`DECISIONS.md` 补本轮决策；新增 `.github/workflows/deploy.yml` | 按文档逐条核对命令与配置；部署章节与 workflow 内容一致 | 未在真实 GitHub 仓库 / Vercel 上实际部署一次（本环境无网络与远端仓库） |
| E. 公网访问 | `vite.config.ts` 配置 `host / strictPort / allowedHosts`（server + preview）；新增 `pnpm share` 与 `share.bat`（生产构建 + 5173 端口开放） | `curl` 验 IPv4 与伪造公网 Host 均 200；自建 TCP 中继（8080→5173，等价 frp tcp 代理）用浏览器实测可玩、HMR WebSocket 也能穿透；详见 D23 | 未使用用户真实的 frp 服务端验证（无法访问其 frps）；未覆盖 https 终结场景，已给出 `hmr.clientPort` 兜底写法 |

---

### 第三轮（本轮）改动

需求：修复「手机端运行时无法上下滑动」的 bug。

| 阶段 | 做了什么 | 怎么验证 | 遗留问题 |
| --- | --- | --- | --- |
| A. 定位根因 | 用内置浏览器把视口调成 375×667 / 320×568 / 667×375 等，逐页读 `scrollHeight / clientHeight / overflow / min-height`，定位到「外壳锁死一屏 + 没有真正的滚动容器 + `overscroll-behavior-y: none`」三层叠加（详见 D24） | 改前首页内容 1251px 被塞进 667px 容器，`documentElement.scrollHeight === clientHeight`，文档完全不可滚动 | 无 |
| B. 重构高度模型 | `#root` 改 `min-height` + `100dvh`（回退 `vh`）；外壳去掉 `overflow-hidden`；新增 `.app-screen` / `.app-flow`；首页与设置页删掉假滚动容器改成文档滚动 | 五个视口实测：改前首页均不可滚动，改后均可滚动；桌面 1280×800 行为不变 | 无 |
| C. 游戏页 / 编辑器页 | 用 `.app-screen` 锁一屏高，`<main>` 加 `overflow-y-auto overscroll-contain`；`GameBoard` 增加 `min-height` 下限（`MIN_CELL = 11px`） | 五个视口下棋盘均**不再被裁切**；极矮 / 横屏时 `<main>` 出现滚动条（67px）可看到底部状态栏；改前横屏会被裁掉约 36px | 横屏时格子只有 11px（见已知限制 10） |
| D. 安全区与手感 | 扣掉 `env(safe-area-inset-bottom)`；删掉全局 `overscroll-behavior-y: none`（棋盘拖拽仍由 `touch-action: none` 保证） | `pnpm run build` 产物里确认 `dvh` 与 `env()` 规则都在；`overscroll-contain` 已进入产物 CSS | 安全区在桌面浏览器里恒为 0，未能在真机（带手势条的 iPhone）上验证 |
| E. 回归 | 重新跑测试与构建；交互回归 | `pnpm test` 51/51；`pnpm run build` 通过（73 modules，CSS 27.07 kB / JS 239.04 kB）；浏览器实测点击涂黑、拖拽连涂 5 格、右键标记、`Ctrl+Z` / `Ctrl+Shift+Z` 全部正常 | 无 |

### 第四轮（本轮）改动

需求：① 优化生成逻辑，尽量避免出现全空 / 全满的行列（尤其高难度）；② 修掉「线索自动划线」的 bug，
并把这个功能做成设置里的开关。

| 阶段 | 做了什么 | 怎么验证 | 遗留问题 |
| --- | --- | --- | --- |
| A. 定位划线 bug | 先用探针用例复现两个问题：列线索把「第一行的前 height 格」当成那一列来读（找对了不划线）；旧算法只看「涂的格子能不能摆下线索」（涂错位置也划线）。再在浏览器里用真题目复核（见 D26 的场景表） | 探针：5×5 第 0 列全填 + 线索 `[5]`，正确读法 = 1，旧实现 = 0；浏览器：解 `00010` 的第 4 行涂错格后线索 `[1]` 仍被划掉 | 无 |
| B. 重写划线判定 | `progress.ts` 改成「以解为准 + 逐条线索」：本行无涂错格 + 解里第 j 段已涂满 ⇒ 第 j 条划线；空线索 `[0]` 不划线；X 标记不影响 | 新增 `tests/progress.test.ts`（17 条，覆盖列方向 `step = width` 的回归用例、涂错不划线、多涂不划线、逐条进度、矩形盘面）；浏览器实测 7 组场景 | 判定本质上是「这一行对不对」的提示，已用设置开关交给玩家决定（见 D26） |
| C. 设置开关 | `settingsStore` 新增 `strikeClues`（默认 true）+ 设置页「外观」卡片里的 Toggle + `GameBoard` 关掉时直接不计算进度 | 浏览器实测：设置里关闭后回到对局，格子上的黑格仍在但**一条划线都没有**；重新打开后划线按原状态恢复 | 无 |
| D. 生成器去退化线 | `countDegenerateLines` 指标 + `reduceDegenerateLines` 修补 + 接进 `repairToUnique` 的「修形 ⇒ 消退化 ⇒ 再验唯一」闭环 + 达标候选「最多多找 250 ms 的更干净版本」+ 兜底图案改成行线索天然唯一的构造（见 D27） | 四档各 30 题采样：退化线从 54 / 42 / 2 / 31 条降到 0 / 1 / 0 / 0 条；`accept-*` 种子四档各 20 题全部 0 条；新增验收断言 | 简单 / 中等仍允许 1 条（小盘面天然多，也算给新手的提示）；极端兜底路径理论上仍可能含退化线（几乎不会触发） |
| E. 回归 | 全量测试 + 构建 + 交互回归 | `pnpm test` 70/70（新增 19 条）；`pnpm run build` 通过；浏览器实测：涂对划线 / 涂错不划线 / 涂错后本行划线消失 / 改正后恢复 / 列涂满划线 / 逐条线索只划对应那条 / 开关生效 / 375px 无横向滚动 | 无 |

### 第五轮（本轮）改动

需求：① 补充完善 README 并注明「本项目由 deepseek-v4.1-flash 生成」；② 检查优化代码、确保没有低水平 bug；
③ 上传到 GitHub 仓库并做好本地 / 云端版本管理；④ 开源协议选 MIT；⑤ 项目名为 Nonogram Online；
⑥ 开启 GitHub Pages 并给出可正常游玩的 github.io 链接。

| 阶段 | 做了什么 | 怎么验证 | 遗留问题 |
| --- | --- | --- | --- |
| A. 品牌与许可 | 项目名统一为 **Nonogram Online**（中文别名数织工坊）；`package.json` 改名 + 加 `license: MIT` / `homepage`；`index.html` 标题与描述；首页头部、设置页「关于」、三个 `.bat` 的标题与横幅；新增 `LICENSE`（MIT，`Copyright (c) 2026 rusheng-world`） | `rg "数织工坊|Nonogram Studio"` 逐条确认只剩「别名」用法；构建后线上 `<title>` 实测为 `Nonogram Online · 数织工坊`；README 顶部徽章 + 信息表 + 许可章节 + LICENSE 全文 | 无 |
| B. 文档 | README 顶部加徽章、在线试玩链接、项目信息表与「由 deepseek-v4.1-flash 生成」说明；新增「十一、开源协议（MIT）」「十二、如何参与 / 联系」；2.1 节补上本仓库的真实 Pages 地址、Actions 部署步骤与 `gh api` 快捷命令；同步修正内嵌 workflow 片段 | 通读全文；`rg` 确认无残留旧名；README 里的命令逐条对照仓库实际配置 | 无 |
| C. 代码复核 | 通读 `src/**`；静态扫描危险 API / `any` / `console.log` / TODO（0 命中）；`tsc -b`（strict）通过；修掉 3 个真实问题（见 D32） | 每改一处跑 `pnpm test` + `pnpm run build`；最终 70/70 全绿、构建通过（73 modules，JS 241.85 kB / gzip 81.37 kB，CSS 27.14 kB） | 无 |
| D. 本地版本管理 | `git init -b main`（用 `rusheng-world` + GitHub noreply 邮箱作为提交身份）；`.gitattributes` 固定 `.bat` 为 CRLF（D31）；两次有意义的提交：`feat: Nonogram Online v1.0.0 …`（61 个文件）→ `fix(ci): 修复 GitHub Pages 工作流的 pnpm 版本冲突` | `git log --oneline` 两条；`git diff --cached --name-only` 确认 60 个文件里没有 `node_modules/` / `dist/` / `work/`；提交信息中文未乱码 | 无 |
| E. 推送到 GitHub | `gh repo create nonogram-online --public`；HTTPS 被网络重置 → 改走 `ssh.github.com:443`（D30）后推送成功 | `gh api …/git/trees/main?recursive=1` 确认远端有 `.github/workflows/deploy.yml`、`LICENSE`、`src/` 等；`git push` 输出 `main -> main` | 无 |
| F. 开启 Pages | `gh api -X POST …/pages -f build_type=workflow`；修复 workflow 的 pnpm 版本冲突（D33）后重新推送触发部署 | 第一次运行 `failure`（Multiple versions of pnpm specified）→ 修复后第二次运行 **success**（35 秒）；`gh api …/pages --jq .html_url` = `https://rusheng-world.github.io/nonogram-online/` | 无 |
| G. 线上验收 | 用 Codex 内置浏览器打开线上地址，实际玩一局 | 见下节 R6：首页 / 路由 / 棋盘 / 涂格 / 标记 / 撤销 / 提示 / 完成弹窗 / 划线 / 计时全部实测通过 | 内置浏览器本次无法投递鼠标事件，鼠标与触摸的回归只能在本地开发服务器上验证（代码与线上同一份构建产物） |

## 三、验收标准逐条自测

环境：Windows 11 · Node 20（Codex 运行时）· pnpm 11.19.0 · Codex 内置浏览器（Chrome 内核）
命令：pnpm run build、pnpm test（等价于需求里的 npm run build / npm run test；本机 PATH 无 npm）

| # | 验收标准 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | build 无错误，test 全绿 | 通过 | pnpm run build = tsc -b && vite build -> 73 modules；dist/index.html 1.14 kB、index-*.js 239.31 kB（gzip 80.28 kB）、index-*.css 26.66 kB；pnpm test -> 6 files / 50 tests 全通过（约 2.2s） |
| 2 | 四种难度各 20 题，全部唯一解，难度落在目标区间 | 通过 | tests/acceptance.test.ts 实测（盘面：简单 5×5、中等 10×10、困难 15×15、专家 20×20）：四档**达标 20/20、唯一解 20/20**，线索与图案一致，并且断言了「正方形 + 边长是 5 的倍数」；平均耗时 0.3 / 13 / 260 / 1.5 ms，最慢 2.2 / 53 / 754 / 3.7 ms |
| 3 | 20×20 谜题生成耗时 < 1 秒 | 通过 | 20×20 专家档（默认预算）平均 1.6 ms / 最慢 4.6 ms；另有用例固定检查候选预算最大的困难档 15×15：平均 258 ms / 最慢 690 ms，同样在 2 秒预算内 |
| 4 | 鼠标与触摸都能完成：填充、标记、拖拽、撤销 | 鼠标通过 / 触摸基本通过 | 鼠标：点击 -> filled、右键 -> marked、从 (0,1) 拖到 (4,1) -> 整行 5 格填充且计数变 7/15、撤销 4 次逐步回退（撤销/重做按钮可用状态同步正确）。触摸：375px 视口下「涂黑模式 / 标记模式」按钮实测分别产出 filled / marked；长按切笔尖走同一套 pointer 事件（pointerType==='touch' 触发 450ms 计时器），但本环境无法注入真实触摸，未在浏览器实测长按，仅代码审查 |
| 5 | 严格模式下涂错有明确视觉反馈 | 通过 | 严格模式点错格：data-wrong="1"、背景 rgb(239,68,68)、outline 2px solid rgb(239,68,68)、动画 nb-shake（抖动），错误计数立即 +1 |
| 6 | 自定义编辑器画出的图案能正确生成线索并开始游戏 | 通过 | 编辑器拖拽绘图后线索实时更新；导入多解图案时正确判定「多解」并弹警告（仍允许开局）；点开始游戏 -> #/play?s=v1.15.15.m.…，棋盘 225 格 / 31 个线索数字、空棋盘可玩；刷新后线索与图案完全一致（分享码往返） |
| 7 | 刷新页面后计时与进度可恢复 | 通过 | 填 3 格后计时到 00:03 -> 刷新 -> 棋盘状态与刷新前逐格一致，计时从 00:03 继续走（恢复即继续计时，避免刷新=免费暂停）；?p= 与 ?s= 两种开局都能恢复 |
| 8 | 移动端 375px 宽度下棋盘完整可操作、无横向滚动 | 通过 | 375×700 视口：documentElement.scrollWidth = 375 = innerWidth（无横向滚动）；5×5 棋盘 left/right = 73/345、22×23（506 格）棋盘 left/right = 76/362，都完整落在视口内且纵向也在视口内（268~567），格子 13px 可点击（点击/拖拽实测有效） |

### 额外自测（需求里提到但不在验收清单）

- 每日一题：首页显示当天日期与轮换难度，种子为 daily-YYYY-MM-DD，同一设备同一天固定；完成后历史里会出现「每日一题」记录。
- 再来一局：完成弹窗点「再来一局（难度）」-> 首页带 ?start=<难度>&seed=<新种子> 自动开局，新谜题 id 无候选序号（可复现）。
- 极限模式：错误格固定保留红痕（data-wrong="2"，修正后变半透明），每错一格 +10 秒。
- 主题：浅色 / 深色 / 跟随系统三档，切换即时生效（html.dark），首屏有内联脚本预置避免闪烁。
- 设置数据管理：清空历史 / 清空最佳成绩 / 清除当前进度都带二次确认，实测生效。
- 控制台：全部流程走完 console 无 error / warning。

---

### 第二轮（本轮）需求的验收

环境同上（Windows 11 · Node 24.19.0 · pnpm 11.19.0 · Codex 内置浏览器）。
命令：`pnpm run build`、`pnpm test`（本机 PATH 无 npm，pnpm 与 npm 的脚本内容一一对应）。

| # | 本轮需求 | 结果 | 证据 |
| --- | --- | --- | --- |
| R1 | 添加本地一键运行脚本，可双击直接运行 | 通过 | 根目录 `start.bat` / `build.bat`。四条分支实测：正常启动（输出 `[1/3] 已找到 Node.js v24.19.0` / `[2/3] 依赖已存在，跳过安装` / `[3/3] 启动开发服务器，浏览器会自动打开...` 并调用 `vite --open`）；无 Node.js；无 pnpm/npm；依赖安装失败（均打印中文原因 + pause）。中文无乱码、`goto` 跳转正确 |
| R2 | 自动生成的盘面为 5 的倍数且是正方形 | 通过 | `tests/acceptance.test.ts` 断言 `boardSizeFor(难度)` 四档为 5 / 10 / 15 / 20，且每个生成盘面 `width === height`、`width % 5 === 0`；内置浏览器实际开局四档：格数 25 / 100 / 225 / 400，顶栏分别为「简单 · 5×5」「中等 · 10×10」「困难 · 15×15」「专家 · 20×20」 |
| R3 | 丰富 README：详细本地运行教学 + 在线部署方式 | 通过 | README 重写为 10 个章节（431 行）：环境要求、一键脚本、命令行五条命令、7 条常见问题、GitHub Pages（Actions + 手动 gh-pages，含完整 workflow）、Vercel、Netlify、Cloudflare Pages、自定义域名与 HTTPS，并同步更新了尺寸表、性能数据与已知限制 |
| R4 | 既有功能不回归（尺寸改造的副作用检查） | 通过 | `pnpm test` 51/51；`pnpm run build` 通过（73 modules，JS 238.92 kB / gzip 80.13 kB，CSS 26.66 kB）；浏览器实测：20×20 棋盘点击→`filled`、右键→`marked`、撤销→`empty`；375px 视口下棋盘宽 300px、格子 15px、`scrollWidth === innerWidth`（无横向滚动） |
| R5 | 用 frp 把游戏开放到公网（追加需求） | 通过 | 改前：`127.0.0.1:5173` 连接被拒（服务只监听 `::1`），且公网 Host 会被 Vite 拦成 403；改后：`curl 127.0.0.1:5173` → 200、`curl -H "Host: game.example.com"` → 200、局域网 IP → 200；经 TCP 中继（8080→5173）浏览器实测首页与对局正常、开发模式控制台 `[vite] connected.`；`pnpm share` / `share.bat` 生产模式实测可玩 |

本轮修复的真实缺陷：`regenerateFromId` 与 `createNewGame` 的生成参数（候选次数）在改造后不再一致，
会导致「玩到一半刷新变成另一道题」；已收敛为共享常量并由 `tests/replay.test.ts` 覆盖（见 D20）。

### 第三轮（本轮）需求的验收

环境同上（Windows 11 · Node 24.19.0 · pnpm 11.19.0 · Codex 内置浏览器，视口用浏览器能力显式设定）。
命令：`pnpm run build`、`pnpm test`。

| # | 本轮需求 | 结果 | 证据 |
| --- | --- | --- | --- |
| R1 | 手机端可以正常上下滑动（首页） | 通过 | 改前：375×667 下 `documentElement.scrollHeight = clientHeight = 667`（内容实际 1251px），文档不可滚动，底部系统设置 / 历史成绩 / 编辑器入口全部看不到。改后：`scrollHeight = 1267 > clientHeight = 667`，实际滚动到 `scrollY = 599` 截图确认底部「自定义数织 / 历史成绩 / 操作说明」全部可见 |
| R2 | 手机端可以正常上下滑动（设置页） | 通过 | 375×667：改前内容 1155px 被裁到 667 且不可滚；改后文档可滚动（`scrollHeight 1155 > 667`） |
| R3 | 游戏页棋盘完整、底部状态栏可达 | 通过 | 375×667 / 390×844 / 320×568 / 667×375 / 1280×800 五个视口实测：最后一格底边始终 ≤ 棋盘容器底边（`boardClipped = false`，改前横屏被裁约 36px）；除极矮横屏外底部「涂黑/标记模式 + 已填 x/y + 错误/提示」均在视口内，横屏时 `<main>` 可滚动 67px 补足 |
| R4 | 无横向滚动（375px） | 通过 | 五个视口 `documentElement.scrollWidth === clientWidth`，均为 false 溢出 |
| R5 | 触摸 / 鼠标操作不回归 | 通过 | 点击 → `data-state="filled"`；按住拖拽一行 → 20~24 号格连续变 `filled`（一次成型的连续笔画）；右键 → `marked`；`Ctrl+Z` → 回到 `empty`，`Ctrl+Shift+Z` → 恢复 `filled` |
| R6 | 编辑器 / 设置页布局不回归 | 通过 | 375×667 下编辑器由自身滚动容器（`main` 与 `nb-scroll`）滚动，内容不裁切；桌面 1440×900 首页 / 游戏页 / 编辑器 / 设置页均无横向溢出、棋盘不受影响 |
| R7 | `npm run build` 无错误、`npm run test` 全绿 | 通过 | `pnpm run build`：73 modules，CSS 27.07 kB（gzip 5.89 kB）/ JS 239.04 kB（gzip 80.18 kB），无报错；`pnpm test`：6 个文件 51 个用例全部通过（含四档各 20 题唯一解与难度达标） |
### 第四轮（本轮）需求的验收

环境同上（Windows 11 · Node · pnpm 11.19.0 · Codex 内置浏览器，视口用浏览器能力显式设定）。
命令：`pnpm run build`、`pnpm test`。

浏览器实测用的题目：`easy-5x5-nbvfkkuk8p`（简单档 5×5，图案 `11101 / 10111 / 00001 / 00001 / 00010`，
行线索 `[3,1] [1,3] [1] [1] [1]`，列线索 `[2] [1] [2] [1,1] [4]`）。

| # | 本轮需求 | 结果 | 证据 |
| --- | --- | --- | --- |
| R1 | 优化生成逻辑，尽量避免出现全空 / 全满的行列（尤其高难度） | 通过 | 四档各 30 题采样，退化线总数 **54 / 42 / 2 / 31 → 0 / 1 / 0 / 0**（简单/中等/困难/专家）；`accept-*` 种子四档各 20 题全部 **0 条**；困难 / 专家档的上限就是 0（`DEGENERATE_LINE_CAP`），`tests/acceptance.test.ts` 已断言 |
| R2 | 修掉「明明找对了但数字没被划掉」 | 通过 | 根因是列线索按行方向的参数读取（`length = height`、步长 1）。浏览器实测：涂对第 2 行第 4 列 → `行[2] 的 1` 立刻变 `data-done="1"`（`text-decoration: line-through` + 变灰）；把第 4 列 4 格按解涂满 → `列[4] 的 4` 划线。单元测试覆盖「列必须按 `step = width` 读」的回归用例 |
| R3 | 修掉「没找出来却已经划掉」 | 通过 | 实测场景：①涂在解里是白格的位置（第 4 行第 4 列）→ 该行线索**不划线**；②把该行已划线的线索旁再涂错一格 → 划线**立刻消失**，取消后**自动恢复**；③线索 `[2,3]` 只做对 3 那一段 → 只有「3」划线、「2」保持未完成；④多涂一格 → 整行不划线。单元测试同样覆盖 |
| R4 | 把线索自动划线做成设置里的开关 | 通过 | 设置 → 外观里新增「线索自动划线」开关（`role="switch"`，默认开）。关闭后回到对局：棋盘黑格仍在，但**所有线索都是 `data-done="0"`**（无划线）；重新打开后划线按当前棋盘状态原样恢复 |
| R5 | 不回归：构建 / 测试 / 交互 / 移动端布局 | 通过 | `pnpm test` **70/70**（新增 `progress.test.ts` 17 条 + 验收里 3 条）；`pnpm run build` 通过（`tsc -b` + `vite build`，73 modules，CSS 27.14 kB（gzip 5.91 kB）/ JS 241.72 kB（gzip 81.30 kB））；375px 视口下设置页 `scrollWidth === clientWidth`（无横向滚动）、开关在视口内；对局中途刷新 / 再次打开链接，进度与划线状态都能恢复 |

本轮修复的真实缺陷（两个，都在 D26 / D27 里有完整记录）：

1. 列线索划线读错格子 —— 「找对了不划掉」；
2. 划线判定不看解、只看「能不能摆下」—— 「涂错也划掉」。

### 第五轮（本轮）需求的验收

环境：Windows 11 · Node 24.19.0 · pnpm 11.25.0 · Git 2.55.0 · gh CLI（账号 `rusheng-world`）
命令：`pnpm test`、`pnpm run build`、`git` / `gh` 系列；线上站点用 Codex 内置浏览器（iab）实操。

| # | 本轮需求 | 结果 | 证据 |
| --- | --- | --- | --- |
| R1 | 补充完善 README，并注明本项目由 deepseek-v4.1-flash 生成 | 通过 | README 新增「项目信息」表（含「生成方式：**本项目由 `deepseek-v4.1-flash` 生成**」）、顶部引用块署名、`LICENSE` 章节、参与/联系章节、真实 Pages 地址与 Actions 部署步骤；`package.json` description、`index.html` description、设置页「关于」也都写明了生成模型 |
| R2 | 检查并优化代码，确保没有低水平 bug | 通过 | 修掉 3 个真实问题（D32）：重开未清存档、矩形/直线起点不遵守对称、两处 `void` 掩盖的无用解构。静态扫描危险 API / `any` / `console.log` / TODO **0 命中**；`tsc -b`（strict）零报错；`pnpm test` **70/70**；`pnpm run build` 通过（73 modules，JS 241.85 kB / gzip 81.37 kB，CSS 27.14 kB） |
| R3 | 上传到我的 GitHub 仓库，并做好本地与云端版本管理 | 通过 | 仓库 <https://github.com/rusheng-world/nonogram-online>（public）。本地：两个提交（`a71264d` 全量 + `e244249` CI 修复），提交身份 `rusheng-world <186068141+rusheng-world@users.noreply.github.com>`；`.gitattributes` 固定换行；`node_modules/`、`dist/`、`work/` 未入库。云端：`main` 已推送，远端含源码、测试、工作流与文档 |
| R4 | 开源协议选 MIT，补充 MIT License | 通过 | 新增 [`LICENSE`](./LICENSE)：`MIT License / Copyright (c) 2026 rusheng-world` + 标准条款全文；`package.json` 增加 `"license": "MIT"`；README 有「开源协议（MIT）」章节（全文 + 通俗解释）；仓库首页会显示 MIT 徽章 |
| R5 | 项目名称为 Nonogram Online | 通过 | `package.json` 的 `name` = `nonogram-online`、仓库名 `nonogram-online`、`<title>` = `Nonogram Online · 数织工坊`（线上实测）、首页头部 `Nonogram Online` / 副标题「数织工坊 · 纯前端 · MIT 开源」、设置页与三个 `.bat` 同步；旧名 `Nonogram Studio` / `数织工坊` 仅作为中文别名保留 |
| R6 | 开启 GitHub Pages，给出可正常游玩的 github.io 链接 | 通过 | <https://rusheng-world.github.io/nonogram-online/>：Pages 为 `build_type=workflow` + `https_enforced`；部署运行 `36228306506` **success**（35 s）。HTTP 实测：首页 **200**（`<title>` 正确、资源引用为 `./assets/...` 相对路径）、JS **200**（240.7 KB）、CSS **200**（26.5 KB）、favicon **200**。浏览器实操：首页四档难度卡片与每日一题正常 → 直接开 `#/play?p=easy-5x5-livecheck1`，5×5 棋盘与线索渲染正确（已填 0/14）→ 空格涂格（已填 1/14，首格 `data-state="filled"`）→ 方向键移动再涂（2/14）→ `X` 标记（该格变 `marked`）→ `Ctrl+Z` 撤销（恢复 `filled`）→ `P` 暂停（遮罩 + 「已暂停 · 用时 00:00」出现，再按恢复）→ 连按 `H` 提示直至解出：**13/13 条线索全部 `data-done="1"`（自动划线生效）**、棋盘 `已填 11/11`、弹出「完成！🎉」成绩弹窗（用时 06:10 / 错误 0 / 提示 24 / 难度 简单 5×5）并提示「刷新了本题最佳成绩！」；计时器从第一次操作开始走（00:06 → 06:10） |

> R6 的说明：本次内置浏览器会话里**键盘输入可用、鼠标事件无法投递**（同一个页面上点设置里的开关也不生效），
> 因此鼠标 / 触摸的回归用本地开发服务器验证（`pnpm dev`，代码与线上是同一份源码与同一份构建产物），
> 线上用键盘把一局完整打完，覆盖了同一套 `applyStroke / undo / useHint / markWin` 路径。

## 四、已知限制（与 README 一致）

1. 难度分级是启发式的：指标 = 固定假设顺序与启发式下解题所需的推理成本，不等价于人类直觉难度。
2. **尺寸与难度互相约束**：尺寸地板决定了 5×5 只可能是「简单」（偶尔「中等」）、10×10 只可能是「简单/中等」、20×20 一定是「专家」。因此每档固定尺寸后，难度只能靠推理成本达标；这也是困难档（15×15 恰好 3~10 次回溯）生成耗时明显高于其他档的原因。
3. 随机图案天然偏向「纯传播可解」，高难题依赖唯一性修形保留结构；困难档为了筛出「3~10 次回溯」的图案，图案会比低难度更碎一些。极端情况下仍会降级并如实提示（但绝不会返回多解题）。
4. 编辑器支持 50×50，但游戏页建议 ≤25×25；25 格以上在 375px 手机上格子约 12~13px，手指精度吃紧。
5. 画布 >30×30 时跳过唯一性校验（求解器开销过大），界面明确说明。
6. 棋盘存档为 0|1|2 字符串，未做进一步压缩。
7. 判定模式开局固定，设置改动下一局生效（为成绩可比性）。
8. 触摸长按切笔尖未在真实触摸设备上实测（见验收 #4）。
9. WebAudio 音效受浏览器自动播放策略限制，需要一次用户交互后才发声。
10. 一键脚本只覆盖 Windows（.bat）；macOS / Linux 请用 README 里的命令行流程。
11. **线索自动划线是以「解」为准的提示**（划线 ⇔ 这一行/列的方块已经在正确位置涂满），
    因此它同时是一个粗略的「这行对不对」反馈；不想要的玩家可在 **设置 → 外观 → 线索自动划线** 关掉。
12. **退化线是「尽量消除」而不是数学保证**：简单 / 中等档允许残留 1 条（小盘面天然容易出，也算给新手的提示），
    只有在前面的候选全部失败时才会走到的极端兜底图案（隔行全填，唯一性优先）仍可能含退化线 ——
    实测四档各 20~60 题都没有触发过。
