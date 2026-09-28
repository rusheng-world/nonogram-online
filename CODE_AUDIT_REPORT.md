# Code Audit Report

> 项目：Nonogram Online（`C:\Users\Lenovo\Documents\Codex\2026-09-21\prompt-cursor-claude-code-codex-agent`）
> 版本：v1.2.0 · 提交：`3423b35`
> 审查性质：**第一阶段只读审查**。本次不修改任何源码 / 测试 / 配置，仅交付本报告。
> 审查日期：2026-09-28 · 审查范围：仓库全部源码、测试、CI、构建与文档（不含 `node_modules`、`dist`、`coverage`）

---

## 0. 审查范围与依据

实际阅读并逐行核对的内容：

- 配置：`package.json`、`vite.config.ts`、`tsconfig*.json`、`eslint.config.js`、`.prettierrc.json`、`tailwind.config.js`、`postcss.config.js`、`.npmrc`、`pnpm-workspace.yaml`、`.gitignore`、`index.html`
- `src/core/`（18 个文件）：`types` `rng` `clues` `encoding` `storage` `progress` `statistics` `achievements` `replay` `text` `boardImage` `difficulty` `dailyChallenge` `generator` `solver` `solverInput` `solverSteps` `solverHistory` `solverClient` `solverProtocol`
- `src/store/`：`gameStore` `editorStore` `settingsStore` `tutorialStore`
- `src/hooks/`：`useElapsed` `useBoardMetrics`
- `src/components/`：`GameBoard` `ClueStrips` `SolverGrid` `SolverStepPlayer` `AchievementToast` `ui` `icons`
- `src/pages/`：`HomePage` `GamePage` `EditorPage` `SolverPage` `TutorialPage` `StatsPage` `SettingsPage`
- `src/game/`：`bootstrap` `newGame`；`src/workers/solver.worker.ts`；`src/router.ts`、`src/main.tsx`、`src/App.tsx`、`src/project.ts`、`src/index.css`
- 测试：`tests/` 全部 15 个文件；`scripts/puzzle-qa.ts`；`.github/workflows/{ci,deploy}.yml`；`README.md`、`CHANGELOG.md`
- 全局检索：危险 DOM/执行 API、密钥与敏感字符串、`localStorage`、网络 API、`addEventListener` / 定时器 / rAF / Observer / Worker、正则、类型断言、`catch` 吞错
- 实际执行：`pnpm lint` / `pnpm test` / `pnpm build` / `pnpm audit`，另加一段只读探针脚本（写在系统临时目录，未落进仓库）验证 URL 触发型计算的耗时

**本轮未修改任何代码**（`git status` 审查前后均为 clean；本报告是唯一新增文件）。

---

## 1. 项目架构图（依据真实代码，不靠文件名猜测）

```text
index.html               内联主题脚本（读 nonogram-settings-v1，避免首屏闪烁）
 └─ src/main.tsx          migrateStorage() 自检 → createRoot(<StrictMode><App/>)
     └─ src/App.tsx       主题应用 + matchMedia 监听 + hash 路由分发 + NotFound
         └─ src/router.ts useRoute()（hashchange）/ navigate() / goHome()

Pages（页面，各自直接读写 store 与 core）
 ├─ HomePage        难度选择 / 每日挑战 / 继续上一局 / 历史成绩 / 清空历史
 │                  URL 参数：?error= ?start= ?seed=
 ├─ GamePage        棋盘 + 键盘 + 撤销重做 + 提示 + 暂停 + 分享 + 结算页
 │                  URL 参数：?p=<puzzleId> ?s=<shareCode>
 ├─ EditorPage      自定义画布（矩形/直线/油漆桶/对称/旋转/文本导入导出）
 ├─ SolverPage      线索输入（表单 + 批量）→ solvePuzzle → 轨迹播放 → 转成可玩谜题
 ├─ TutorialPage    7 阶段教程（复用 GameBoard + tutorialStore 状态机）
 ├─ StatsPage       统计 / 成就进度 / 最近十局（只读 + 清空）
 └─ SettingsPage    判定模式 / 外观 / 计时 / 音效 / 数据清理 / 关于

Components
 ├─ GameBoard       交互棋盘（memo 单元格、拖拽直写 DOM、长按切换笔尖、键盘光标）
 ├─ ClueStrips      行/列线索条（含自动划线 data-done、行/列高亮）
 ├─ SolverGrid      只读棋盘（自动解题页）
 ├─ SolverStepPlayer 轨迹播放器（interval 播放 + 关键节点快照）
 ├─ AchievementToast 成就浮层（6s 自动消失）
 └─ ui              Button / Card / Segmented / Toggle / Modal / Stat / Pill

Hooks
 ├─ useElapsedMs        rAF ~5Hz 刷新显示，真实时长用时间戳差值
 └─ useBoardMetrics     容器测量 → 3 次迭代收敛格子尺寸（ResizeObserver）

Stores（Zustand）
 ├─ gameStore       谜题/棋盘/wrong/计时/暂停/撤销重做/提示/结算与落库/tutorial 隔离
 ├─ editorStore     画布/工具/对称/缩放/撤销重做(60)/导入导出/flood fill
 ├─ settingsStore   persist 到 localStorage（判定模式/主题/辅助线/划线/音效/罚时/自动暂停/画笔/开局信息页）
 └─ tutorialStore   教程状态机（阶段/反馈/柔和提示/断点续玩）+ 只写 nonogram-tutorial-v1

Core（纯逻辑，可脱离 React 单测）
 ├─ 谜题生成 Puzzle Generator   rng(可复现) → 团块/对称/噪声 → 平滑 → 填充率调整
 │                              → 退化线清理 → repairToUnique（用第 2 个解破坏歧义）
 │                              → analyzePuzzle 复核 → 候选循环（次数 + 时间双预算）→ 降级 → 兜底图案
 ├─ Solver                      DP 单行可达性（suffix/reach/start + 差分覆盖）→ 行列传播到不动点
 │                              → 假设分支 DFS（nodeLimit + deadline + depth 保险）→ 数解 / 轨迹 / 提示
 ├─ Difficulty                  classifyDifficulty（回溯次数 + 假设链深度 + 尺寸地板 + 长线索交叉）
 │                              + solverDifficultyScore（0~100，展示与排序）
 ├─ Game Logic                  clues / progress（线索划线）/ replay（id 重放）/ boardImage / text
 └─ Data                        storage（唯一 localStorage 出入口）/ achievements / statistics / dailyChallenge

Persistence / Browser APIs
 ├─ localStorage（唯一入口 core/storage.ts，信封 {v,data} + 迁移 + 损坏自愈 + 内存降级）
 │   nonogram-schema / -progress-v1 / -records-v1 / -history-v1 / -daily-v1 / -achievements-v1
 │   -solver-history-v1 / -tutorial-v1 / -settings-v1（zustand/persist 自己管）
 ├─ Web Worker（core/solverClient.ts：求解一律走 Worker，取消=terminate）
 ├─ Clipboard（分享 / 复制文本）/ Web Share（成绩分享，带剪贴板兜底）
 ├─ Canvas（导出答案 PNG）/ WebAudio（音效，无外部资源）/ ResizeObserver / matchMedia / vibrate
 └─ 无 fetch / XHR / WebSocket / cookie / analytics / 第三方 CDN
```

---

## 2. Executive Summary

```text
项目整体状态：工程质量明显高于同类个人项目（分层清晰、纯逻辑可测、生成器/求解器有硬预算、存储层统一且有自愈）。
              本轮未发现可确认的安全漏洞（无 XSS、无密钥、无隐私外泄、无网络请求）。
              主要问题集中在：一条 URL 参数可造成约 4 秒主线程冻结、开发服务器公网暴露的配置风险、
              缺少 Error Boundary、以及若干生命周期清理 / 文档与代码不一致 / CI 门禁缺口。

Critical : 0
High     : 0
Medium   : 3
Low      : 12
Info     : 6
```

结论口径说明：Critical / High 的判定标准按任务书 §74 严格执行（XSS、密钥泄漏、任意代码执行、隐私泄漏、
无限 CPU/内存、普通用户易触发的崩溃/数据损坏/存档丢失、核心逻辑错误）。本轮**没有**达到这些标准的问题；
`Medium` 的三项都是「特定条件下」的问题，且均有代码或实测证据。

---

## 3. Critical Issues

| ID | Severity | Category | File | Issue | Evidence | Impact |
| -- | -------- | -------- | ---- | ----- | -------- | ------ |
| —  | —        | —        | —    | 未发现符合 Critical 标准的问题 | 见 §5 Security 的三项否定性结论（XSS / Secrets / Privacy） | — |

---

## 4. High Issues

| ID | Severity | Category | File | Issue | Evidence | Impact |
| -- | -------- | -------- | ---- | ----- | -------- | ------ |
| —  | —        | —        | —    | 未发现符合 High 标准的问题 | 见 §8 未触发项与 §7 的实测数据（URL 冻结是可上界 4.1s，非无限；无崩溃、无数据损坏路径） | — |

---

## 5. Medium Issues

| ID | Severity | Category | File | Issue | Evidence | Impact |
| -- | -------- | -------- | ---- | ----- | -------- | ------ |
| M-01 | Medium | 性能 / 输入边界（DoS） | `src/game/bootstrap.ts:95-102`、`src/core/replay.ts:49-58`、`src/core/generator.ts:71` | `#/play?p=<puzzleId>` 会**在主线程同步**按种子重新生成谜题，时间预算固定 4000ms；`parsePuzzleId` 只校验 5..50 的尺寸，不校验「这个尺寸+难度是否可能生成」，任何访客都能构造一条链接让页面同步跑满预算 | 实测探针（只读）：`regenerateFromId('hard-50x50-audit')` = **4114.6ms**；`easy-50x50-audit` = 813.4ms；对照 `easy-5x5` = 0.2ms、`hard-20x20` = 37.4ms。代码：`replay.ts:56 timeBudgetMs: GENERATION_TIME_BUDGET_MS`（=4000）、`bootstrap.ts:100` 直接调用。该路径**没有** loading 遮罩（首页 `launch()` 有 `busy` 遮罩，`?p=` 路径没有） | 打开恶意/误传链接时页面冻结约 4 秒（无响应、无提示），可被批量用来自动化刷 CPU。**不会**死循环、不会 OOM、不丢数据 |
| M-02 | Medium | 供应链 / 部署配置 | `vite.config.ts:24-37`、`README.md:305-310`、`share.bat` | 项目文档明确鼓励「用 `pnpm share` / `share.bat` 把 5173 端口经 frp/ngrok 暴露到公网」，而 `vite.config.ts` 同时设置 `server.host:true` + `server.allowedHosts:true`（后者按注释即关闭 Vite 的 DNS-rebinding 防护）与 `preview.host:true` + `allowedHosts:true`；所用 Vite 5.4.21 存在已知 dev-server 漏洞 | `pnpm audit`：vite **high**「`server.fs.deny` bypass on Windows alternate paths」(`GHSA-67mh-4wv8-2f99`，vulnerable `<=6.4.2`，patched `>=6.4.3`)、moderate「launch-editor NTLMv2 hash disclosure via UNC path handling on Windows」、moderate「Path Traversal in Optimized Deps `.map` handling」；esbuild moderate「dev server 可被任意站点请求并读取响应」 | 在 Windows 上以该推荐方式把**开发/预览服务器**暴露到公网时，远端可读取项目根目录之外的文件 / 触发 NTLMv2 哈希外泄。纯静态部署（GitHub Pages / `dist` 挂任何静态托管）**不受影响**。若维护者继续推荐该用法，应把它提升为 High 并先做缓解 |
| M-03 | Medium | React 稳定性 / 错误处理 | `src/App.tsx`、`src/main.tsx`（全仓无 Error Boundary）、关联 `src/store/settingsStore.ts:56` | 整个应用没有任何 Error Boundary（任务书 §45）。任一组件渲染或 effect 抛错 → React 卸载整棵树 → **空白页且无法恢复**（`#root` 内无内容，用户只能手动刷新/改 URL） | 全仓检索 `ErrorBoundary / componentDidCatch / getDerivedStateFromError` 无结果；`index.html` 只有 `<div id="root"></div>`；`main.tsx` 直接 `createRoot(...).render(<StrictMode><App/></StrictMode>)`。具体可触发点示例：`settingsStore.ts:56` 的 `window.matchMedia(...)` 未做存在性判断（`App.tsx:34` 的监听侧做了判断，`applyTheme → currentThemeIsDark` 侧没有），在老浏览器 + `theme='system'` 时会在 effect 中抛 `TypeError` | 罕见但真实存在：一次未预期异常 = 白屏，玩家丢失当前对局上下文（存档仍在，但玩家不知道该怎么办） |

---

## 6. Low Issues

| ID | Severity | Category | File | Issue | Evidence | Impact |
| -- | -------- | -------- | ---- | ----- | -------- | ------ |
| L-01 | Low | 功能回退路径 | `src/pages/EditorPage.tsx:497-509`、`818-822` | 编辑器「分享链接」在 `navigator.clipboard` 失败时走 `setNotice(url)` 兜底，但提示条是 `pointer-events-none` 且会被下一条提示覆盖，链接又很长（50×50 约 429 字符），用户实际**无法复制** | 对比 `GamePage.tsx:239-249`：游戏页会打开带只读 `textarea`（`onFocus` 全选）的分享弹窗，回退可用 | 复制失败（http 非安全上下文、权限被拒）时分享功能不可用 |
| L-02 | Low | 数据持久化 / 可观测性 | `src/core/storage.ts:78-90`、`src/store/settingsStore.ts:44`、`src/main.tsx` | 设置项 `nonogram-settings-v1` 既不参与 `migrateStorage()` 自检，zustand `persist` 也没配 `onRehydrateStorage` → 该 key 损坏时被**静默吞掉**（无 console 警告、无 UI 提示），设置回退默认值 | `migrateStorage()` 的 `checks` 列表不含 settings key；`settingsStore.ts:44` 只写了 `{ name: 'nonogram-settings-v1' }`；已核对 `node_modules/zustand/esm/middleware.mjs:533`：`.catch(e => postRehydrationCallback?.(undefined, e))`，无回调时错误被丢弃。**结论：不会白屏，行为是安全的，但缺可观测性** | 用户会感到「设置莫名被重置」，且开发者拿不到任何线索 |
| L-03 | Low | 数据持久化 / 存档 | `src/core/storage.ts:95-107`、`68-76` | localStorage 不可用或配额满时静默降级为内存存储（设计如此，值得肯定），但 `storageAvailable()` 从未被 UI 使用；`available` 还是一次性缓存（永久） | `storageAvailable` 在 `src/` 内零调用（只有 `tests/storage.test.ts`、`tests/storageFallback.test.ts` 引用）；`rawSet` 的 `catch { /* 配额满：退化成内存存储 */ }` 不告知调用方 | 隐私模式/配额满时玩家以为进度已保存（首页文案宣称「进度与成绩保存在浏览器本地，关闭页面后可以继续」），刷新即丢；无崩溃 |
| L-04 | Low | 数据完整性（本地数据） | `src/core/storage.ts:463-471`、`494-501` | `loadDailyRecords` 只校验 `typeof raw.date === 'string'`、不校验 key/日期格式；`loadAchievements` 只校验值是数字。手改或损坏的 localStorage 可以虚增统计 | `next[key] = raw as unknown as DailyRecord`（469 行）→ `dailySolved = Object.keys(daily).length`（`statistics.ts:77`）、`computeStreaks` 会把垃圾 key 算进 `longest`（`dailyChallenge.ts:95-108`），从而可能解锁 `streak-7` / `streak-30`；`StatsPage` 的「(X / 10)」也可被撑破 | 仅影响本人本机数据；无崩溃、无越权、不影响他人 |
| L-05 | Low | 输入边界一致性 | `src/core/types.ts:218`、`src/core/encoding.ts:114-117`、`src/pages/EditorPage.tsx:479-481` | `MAX_PLAY_SIZE = 25` 只在编辑器里作为「警告」出现，真正的开玩路径（分享码 `?s=`、`?p=`）允许到 `MAX_EDITOR_SIZE = 50`，所以 50×50 可以直接开玩 | 编码解码用的是 `MAX_EDITOR_SIZE`（`encoding.ts:116`）而非 `MAX_PLAY_SIZE`；`MAX_PLAY_SIZE` 唯一出现处是 `EditorPage.tsx:479` 的 `warnings.push` | 玩家可能打开一个自己手机上几乎点不动的 50×50 盘面（格子被压到 11px、线索区很窄），体验差但不崩 |
| L-06 | Low | 内存 / 生命周期 | `src/components/GameBoard.tsx:334-345`、`src/pages/HomePage.tsx:87`、`src/pages/SolverPage.tsx:184-196`、`131-133` | 三处「延迟任务未在卸载时清理」：① 棋盘长按切换笔尖的 450ms `setTimeout` 没有卸载清理；② 首页 `launch()` 的 32ms `setTimeout` 没有清理；③ 自动解题页卸载时不 cancel 正在跑的求解（非 Worker 环境会同步跑完） | `GameBoard.tsx:334` 只由 `clearLongPress()` 在指针事件里清理，组件无卸载 effect；`HomePage.tsx:87` 直接 `window.setTimeout(..., 32)`；`SolverPage.tsx:184` 的清理只在 `requestKey` 变化时触发，没有卸载时 `handleRef.current?.cancel()` | 逐项核实**均无**监听器/Observer/Worker 泄漏：长按回调在卸载后只会写回 `cellRefs`（此时为 `null`，有 `if (el)` 保护）；Worker 在结果返回或 `cancel()` 时 `terminate()`（`solverClient.ts:76`）。属「不够干净」，非泄漏 |
| L-07 | Low | 异步健壮性 | `src/core/solverClient.ts:113-126`（对照 `104-108`） | 非 Worker 回退路径把求解放进 `setTimeout` 回调里直接调用，**没有 try/catch**；Worker 出错路径反而有 `solveInline()` 兜底 | `solverClient.ts:119-121`：`const timer = setTimeout(() => { resolvePromise(solvePuzzle(request, {...})) }, 16)` 无捕获；`worker.onerror → finish(solveInline(...))` 有捕获 | 万一求解抛异常，promise 永不落地 → 界面永久停在「计算中 / running=true」。属防御性缺口（未找到可复现的抛错输入） |
| L-08 | Low | 无障碍 | `src/components/GameBoard.tsx:92`（`role="gridcell"`）与 `443`（`role="grid"`）；`src/components/ui.tsx:131-180` | ① 棋盘把 2500 个（最多）`role="gridcell"` 直接放在 `role="grid"` 下的普通 `div.nb-board` 里，缺少 `role="row"` 中间层，ARIA 结构不合法；② `Modal` 没有 Esc 关闭、没有焦点陷阱、没有背景点击关闭、没有滚动锁定、没有 portal | 网格结构：`role="grid"` → `div.nb-board` → `role="gridcell"`（无 `role="row"`）；`Modal` 全文只有 `onClose` 的关闭按钮，无 `keydown` 处理 | 读屏软件可能无法正确播报行/列；纯键盘用户在弹窗里 `Tab` 会跑到背景内容。**已确认**格子本身有 `aria-label="第 X 行，第 Y 列，状态"`，状态不只靠颜色表达（含 X 图形与角色文案），这部分做得不错 |
| L-09 | Low | 工程质量 | `src/pages/SolverPage.tsx:136,185`、`src/pages/GamePage.tsx:80`、`src/pages/EditorPage.tsx:200,222`、`src/pages/HomePage.tsx:118`、`src/pages/TutorialPage.tsx:47`、`src/pages/GamePage.tsx:192` | `pnpm lint` 8 条 warning（0 error）：7 条 `react-hooks/set-state-in-effect`、1 条 `react-hooks/exhaustive-deps`（`GamePage.tsx:192` 的 `useMemo` 依赖里多写了 `completed`） | 见 §9 Testing 的原始输出 | CI 只对 error 失败（`eslint.config.js` 明确把 React Compiler 系列规则降级为 warn），因此不阻塞，但会掩盖真实问题 |
| L-10 | Low | 死代码 / 注释与代码不一致 | `src/core/solverClient.ts:21-22`、`src/core/solver.ts:734,752`、`src/core/text.ts:40-41,71`、`README.md:269` | ① `LARGE_BOARD_SIZE = 30` 全仓只此一处（未使用），其注释描述的「任一维 > 30 必须用 Worker」策略并未实现（实际是「能用 Worker 就用」）；② `computeHint` 里 `const limits = createLimits(...)` 之后 `void limits` —— 白算白丢弃；③ `text.ts:41` 的 `if (!token.length) continue` 不可达，且第 40 行对多字符 token 只取首字符（如 `"01"` 被当成「空」而不是报错）；④ `text.ts:71` 文案「已自动裁剪到 5~50」与实现不符（不裁剪，越界由 `editorStore.importText:205-211` 直接拒绝）；⑤ `README.md:269` 写「全空行记为 `[]`」，代码是 `[0]`（`clues.ts:11-16`） | 见对应行号 | 维护者会被注释/文档误导；不影响运行 |
| L-11 | Low | 依赖治理 / CI 门禁 | `.github/workflows/ci.yml`、`deploy.yml`、仓库无 `.github/dependabot.yml` | CI 只跑 `install / lint / format:check / test / build`，**没有 `pnpm audit`**，也没有 Dependabot 等自动依赖更新；`actions/checkout@v4` 等按大版本 tag 固定（非 commit SHA） | `ci.yml:24-36` 步骤列表；`.github/` 下只有两个 workflow；`pnpm audit` 实测有 7 条（见 §9） | 已知漏洞不会被门禁拦下（本轮 7 条全是 devDependencies，见 L-12）；供应链加固建议见 §11 的 P3 |
| L-12 | Low | 依赖安全 | `pnpm-lock.yaml` / `pnpm audit` | 7 条 advisory（1 critical / 1 high / 5 moderate）**全部位于 devDependencies**，不进生产产物 | critical：`vitest <3.2.6`「Vitest UI 服务在监听时可任意读写并执行文件」——本仓库从不运行 `vitest --ui`（`test`/`test:watch`/`test:coverage` 均为 CLI），故不可利用；其余见 M-02 与 §9 | 当前运行时无风险；若将来把 vitest UI / dev server 对外暴露，则风险立刻变成可被利用（与 M-02 同源） |

---

## 7. Info Issues

| ID | Severity | Category | File | Issue | Evidence | Impact |
| -- | -------- | -------- | ---- | ----- | -------- | ------ |
| I-01 | Info | 加固建议（原型污染） | `src/core/storage.ts:469,499,357` | 三处 `next[key] = ...`（key 来自 `JSON.parse` 后的 `Object.entries`）在形态上属于原型污染写法 | 已逐项验证：`next` 是**新建的对象字面量**，`next['__proto__'] = x` 只改变 `next` 自身的原型，**无法**触及 `Object.prototype`；且 `writeJson` 走 `JSON.stringify`（只序列化自有可枚举属性），污染不会被持久化。`records` 的 key 恒带 `difficulty:` 前缀（`storage.ts:recordKey`），`__proto__` 无法成为完整 key | 无可利用路径；若想彻底消除形态隐患，可改 `Object.create(null)` 或显式跳过 `__proto__` |
| I-02 | Info | 隐私 / 部署 | `index.html`、`vite.config.ts`、全仓检索 | 零第三方资源、零网络请求（无 fetch/XHR/WebSocket/analytics/字体/CDN）、零 cookie、零账号 —— 隐私面已经是最小；但没有 CSP / `frame-ancestors`（GitHub Pages 无法设置响应头） | 检索结果：`fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|document.cookie` 在 `src/` 与 `index.html` 中 **0 命中**；`index.html` 只有本地 `./favicon.svg` 与 `og-cover.png` | 若要在静态托管上补 CSP，需使用 `<meta http-equiv>`，且因 `index.html` 有内联主题脚本、React 大量使用内联 `style`，必须放开 `'unsafe-inline'`（收益有限）；点击劫持只能靠托管平台响应头，属部署平台限制 |
| I-03 | Info | 工作区卫生 | `work/`、`dist/`、`coverage/` | 工作区存在开发脚手架与构建产物 | `.gitignore` 已忽略 `work/`、`dist/`、`coverage/`，`git status` 为 clean | 无影响；注意 `work/` 里是开发者临时脚本，别误当作产品代码 
| I-04 | Info | 数据说明 | `src/store/gameStore.ts:persist()` | 存档里以明文字符串保存了谜题答案（`solution`） | `solution: encodeBoard(puzzle.solution)`；`bootstrap.puzzleFromStored` 用它重建线索（自定义/分享谜题刷新后必需） | 单机游戏可接受；仅需知晓「玩家可从 localStorage 直接读出答案」。分享链接本身也携带答案（`encodePuzzleCode`），这是零后端分享的必然取舍 |
| I-05 | Info | 性能 | `dist/` | 产物体积：主 JS 314.37 kB（gzip 105.65 kB）、CSS 33.86 kB（gzip 6.97 kB）、solver worker 8.85 kB | `pnpm build` 输出（§9） | 对「无路由懒加载的单页游戏」属可接受范围；如需继续优化可考虑 `SolverPage`/`TutorialPage` 懒加载（收益中等，复杂度上升） |
| I-06 | Info | 本地脚本安全 | `start.bat:60-86` | 端口 5173 被占用时会 `taskkill /f /pid` 结束该进程 | 脚本先 `tasklist` 取出进程名并打印，再用 `choice /c YN` 请用户确认（`start.bat:78-83`） | 若该端口被**无关程序**占用，用户确认后会误杀。建议默认只提示、把强杀留给用户手动操作 |

---

## 8. Security

### XSS

- 将全仓检索加入审查范围：`dangerouslySetInnerHTML` / `innerHTML` / `outerHTML` / `insertAdjacentHTML` / `document.write` / `eval(` / `new Function` / `setTimeout("字符串")` —— **`src/`、`tests/`、`scripts/`、`index.html` 全部 0 命中**。
- 所有用户可控输入的渲染路径都经过 React 文本插值（等价 HTML 转义）：`HomePage` 的 `?error=` 横幅、`GamePage` 的 `notice`、`EditorPage` 的 `notice`/`uploadError`、`SolverPage` 的解析错误文案、分享链接 `textarea` 的 `value`。
- 分享码的解析链是 **字符串 → base64url 字节 → `Uint8Array` → 格子状态 → `data-state` 属性**，全程不拼 HTML；`decodeSolution` 非法字符直接 `throw` 并被 `catch` 成 `null`。
- 结论：**在本次审查范围内未发现可利用的 XSS 路径。**

### Secrets

- 检索 `API_KEY|apiKey|secret|password|token|bearer|private key|client secret|sk-…|AKIA…`（排除 `pnpm-lock.yaml`/`node_modules`/`dist`）：命中项全部是无关内容（`tokens=5 delims=` 的批处理写法、CSS Design Token、`base64 token` 变量名）。
- 仓库无 `.env` / `.env.local` / `.env.production`；源码中**完全没有** `import.meta.env` / `VITE_*` 的读取（即不存在「把密钥塞进 `VITE_*` 再随 bundle 发货」的经典问题）。
- `git log` 抽查 9 个提交的提交信息，未出现密钥类内容；本轮未做全历史 `log -p` 逐行扫描（如需，建议单独执行 `git log -p -S 'sk-'` 之类检索，且**未经确认不要改写历史**）。
- 结论：**未发现前端硬编码密钥 / 凭据。**

### Privacy

- 无账号、无注册、无遥测、无分析、无指纹采集、无 IP 采集、无 cookie；无第三方请求（见 I-02）。
- `localStorage` 中只有游戏自身数据（进度/成绩/历史/每日/成就/教程进度/设置），不含任何个人信息 —— 逐键核对见 §10 Storage。
- 唯一的外部交互是 `<a target="_blank" rel="noreferrer">` 打开的仓库/站点链接（需用户主动点击）与 `navigator.share`（用户主动触发）。
- 结论：**在本次审查范围内未发现隐私泄漏。**

### URL Security

| 输入 | 处理 | 结论 |
| ---- | ---- | ---- |
| `#/play?s=<code>` | `decodePuzzleCode` 严格校验：5 段、版本号 `v1`、尺寸 5..50 且为整数、base64 非法字符即失败、长度不足即失败；失败返回 null → 页面显示「分享链接无法解析」 | 安全。实测：27012 字符的构造码 → **0.0ms 返回 null**；50×50 合法码 → 0.6ms |
| `#/play?p=<id>` | `parsePuzzleId` 用 `^(\\d{1,2})x(\\d{1,2})$` + 5..50 校验；随后 `regenerateFromId` 同步重新生成 | 不崩溃、无注入，但存在**有界**的 CPU 占用（M-01，实测最长 4114.6ms） |
| `#/?start=<difficulty>&seed=<seed>` | `safeDifficulty()` 白名单化；`seed` 仅作为哈希输入与 id 文本 | 安全（有 loading 遮罩） |
| `#/?error=<text>` | 作为文本渲染 | 安全（React 转义） |
| `location.href = / assign / replace / window.open` | **0 命中**；`navigate()` 只写 `window.location.hash`，目标字符串由代码内部构造 | 无 Open Redirect |
| 正则 | 全部为线性模式（`^(\\d{1,2})x(\\d{1,2})$`、`[\\s,，、|/;]+`、`^\\s*(?:rows?|行|r)\\s*[:：]\\s*(.*)$`），无嵌套量词 | 无 ReDoS |

### Storage

逐键核对（`core/storage.ts`）：

| Key | 内容 | 是否含敏感信息 |
| --- | ---- | -------------- |
| `nonogram-settings-v1` | 判定模式/主题/显示开关/画笔/罚时等偏好 | 否 |
| `nonogram-schema` | 存储层版本 + 写入时间 | 否 |
| `nonogram-progress-v1` | 谜题元信息 + 棋盘 + 答案 + 计时/错误/提示 | 否（见 I-04 说明） |
| `nonogram-records-v1` | 最佳成绩（分「不限条件 / 零提示 / 按判定模式」三档） | 否 |
| `nonogram-history-v1` | 最近 200 局成绩 | 否 |
| `nonogram-daily-v1` | 每日挑战完成记录 | 否 |
| `nonogram-achievements-v1` | 成就解锁时间戳 | 否 |
| `nonogram-solver-history-v1` | 自动解题输入历史（≤10 条） | 否 |
| `nonogram-tutorial-v1` | 教程阶段 + 是否学完 | 否 |

- **无** `API_KEY / SECRET / PASSWORD / ACCESS_TOKEN / AUTH_TOKEN / PRIVATE_KEY` 类内容写入 localStorage。
- 统一封装：所有读写走 `readJson/writeJson/removeJson`（schema 信封 + 未来版本不回读 + 校验失败即删 + JSON 损坏即删 + `localStorage` 不可用降级内存 + `JSON.stringify` 循环引用兜底）。
- 写失败（配额满）不会崩溃；但不会告知用户（L-03）。

### Dependencies

`pnpm audit` 实测 7 条，**全部是 devDependencies（不进产物）**：

| Severity | Package | Vulnerable | Advisory |
| -------- | ------- | ---------- | -------- |
| critical | vitest | `<3.2.6` | Vitest UI 服务监听时可任意读写并执行文件（`GHSA-5xrq-8626-4rwp`） |
| high | vite | `<=6.4.2` | `server.fs.deny` bypass on Windows alternate paths（`GHSA-67mh-4wv8-2f99`） |
| moderate | vite | `<=6.4.2` | launch-editor：UNC 路径导致 NTLMv2 哈希外泄（Windows） |
| moderate | vite | `<=6.4.1` | Optimized Deps `.map` 处理中的路径穿越（`GHSA-4w7w-66w2-5vf9`） |
| moderate | esbuild | `<=0.24.2` | dev server 可被任意站点请求并读取响应 |
| moderate | vitest | `>=2.1.0 <4.1.11` | `@vitest/mocker` 重定向 mock 造成的路径穿越 / 任意文件读取（`GHSA-82fw-gwwq-j7x9`） |
| moderate | @vitest/mocker | `>=2.1.0 <4.1.11` | 同上 |

判断（不盲目升级）：生产运行时依赖只有 `react` / `react-dom` / `zustand`（3 个，均无 advisory）。
`vitest` critical 需要「Vitest UI 服务对外监听 + 访问者可控」，本仓库从不使用 `--ui`；`vite` 的 high/moderate 均针对 **dev/preview 服务器**，
而项目**恰好**在文档里鼓励把该服务器暴露到公网（M-02）—— 这是唯一需要真正决策的地方：要么停止公网暴露 dev server（推荐），
要么升到 `vite >=6.4.3`（属于跨大版本升级，需单独评估与回归）。

供应链卫生（加分项，已核对）：`pnpm-workspace.yaml` 限定 `onlyBuiltDependencies: [esbuild]`，`package.json` 无 `preinstall/postinstall/prepare`，
项目自身没有安装期脚本。

### CI/CD

- `ci.yml`：`permissions: contents: read`（最小权限，好），步骤 = install(frozen-lockfile) → lint → format:check → test → build；**缺 `pnpm audit`**。
- `deploy.yml`：`permissions: contents: read + pages: write + id-token: write`（符合 Pages 部署必需，无多余权限），部署前重复跑 lint/test/build（防「测试挂了照发」，好）；`concurrency` 有 `cancel-in-progress`（好）。
- 缺口：无 Dependabot；actions 按大版本 tag 固定（非 commit SHA）（L-11）。

### Third-party resources

- 零第三方运行时资源：无 CDN、无 Google Fonts、无 analytics、无 Sentry、无广告、无外部 API（字体用系统 `ui-monospace`，图标是内联 SVG，音效用 WebAudio 振荡器，favicon/og 图是仓库内文件）。
- 结论：**未发现第三方隐私/供应链风险。**

---

## 9. Memory / Lifecycle

| 类别 | 结论 |
| ---- | ---- |
| Timers | 已检查全部 12 处 `setTimeout/setInterval`。**清理正确**：`AchievementToast`（6s，有 cleanup）、`useBoardMetrics`（60ms 重测量，有 cleanup）、`EditorPage` 防抖分析（有 `cancelled` + `clearTimeout`）、`SolverPage` 计时 interval（有 cleanup）、`SolverStepPlayer` 播放 interval（有 cleanup）、`TutorialPage` 柔和提示（有 cleanup）、`HomePage` 每分钟同步（有 cleanup）、`solverClient` 非 Worker 路径（cancel 时 `clearTimeout`）。**不干净 3 处**：`GameBoard` 长按、`HomePage.launch`、`SolverPage` 卸载不取消（L-06） |
| Listeners | 逐处核对「注册 → 反注册 handler 引用一致性」，全部通过：`router.ts`(`hashchange`)、`App.tsx`(`matchMedia change`)、`GamePage`(`keydown` + `visibilitychange`)、`EditorPage`(`keydown`)、`TutorialPage`(`keydown`)，均为具名 handler + 同一引用移除。**无** `window.addEventListener('resize', () => {})` 型不可移除写法 |
| Observers | 唯一 `ResizeObserver` 在 `useBoardMetrics`，`useLayoutEffect` 内 `observer.disconnect()`；无 MutationObserver / IntersectionObserver |
| RAF | 唯一 `requestAnimationFrame` 在 `useElapsedMs`，cleanup 调用 `cancelAnimationFrame`；循环以约 5Hz 触发重渲染（真实时长仍用时间戳差值，切后台不累积误差） |
| Workers | `solverClient` 每次求解新建 Worker，`finish()` 内**先** `terminate()` 再 resolve（结果返回、出错、用户取消三条路径都走 `finish`）；`solverPuzzle` 是同步循环，取消靠 terminate 的设计已在注释中说明。Worker 通过 `import` 复用同一份 solver，无第二套实现 |
| Subscriptions | Zustand 无手动 `subscribe`；唯一 `useGameStore.subscribe` 在 `TutorialPage`，effect 的返回值即 unsubscribe（正确）。`persist` 中间件由库管理。StrictMode 双执行已核实：加载/订阅/清理都是幂等的（`GamePage` 用 `keyRef` + `store.puzzle` 双重短路，避免重复生成） |
| Async tasks | 无 fetch/await 型竞态；有两条「异步结果回填」路径，都做了身份校验：`SolverPage` 的 `if (handleRef.current !== handle) return`、`EditorPage` 的 `if (cancelled) return`。切换谜题/改输入时会先取消旧任务（`SolverPage` 的 `requestKey` effect） |
| 副作用一致性 | 拖拽绘制期间只改 DOM（`dataset`），抬手才写 store 并压一次撤销栈 —— 既避免每格一次渲染，也让「一次拖拽 = 一步撤销」语义正确 |

---

## 10. Performance

| 方向 | 结论 |
| ---- | ---- |
| React rendering | 单元格 `memo` + 只传原始值；`applyStroke` 只在提交时 set 一次；`setHover` 同格短路；线索划线 `useMemo` 依赖 `board`。每次涂格会重建 `Array.from({length: w*h})` 元素对象（20×20=400 个，可接受），未发现「一次点击导致整页重渲染」的结构性问题 |
| Solver | 单行推理是 O(n·m) 的 DP（`suffix/reach/start` + 差分覆盖），不是排列枚举；搜索带 `nodeLimit`（默认 60k/400k 视入口）+ 墙钟 `deadline`（每 128 个节点检查一次）+ `depth >= 96` 保险；轨迹另有 800 步 / 15 万格上限。**无 `while(true)`、无无限回溯**。实测：`pnpm test` 中 30 个求解器用例（含 3 档尺寸随机图案、无解、多解、极端 1×N）1.7s 内全部完成 |
| Generator | `maxAttempts`（easy/expert 200、medium 600、hard 1200）+ 时间预算（默认 320~900ms，hard ≥1500ms；应用层 4000ms）+ `isDifficultyReachable` 提前放弃 + `fallbackPattern` 必定终止。实测：专家 20×20 平均 2.3ms / 最慢 5.7ms；困难 15×15 平均 195ms / 最慢 554ms；四档各 20 题 **20/20 达标、20/20 唯一解** |
| Storage | 每次「提交一次笔触」写一次进度（≤2×格数字符串，50×50 约 5KB）→ 同步写 <1ms；历史上限 200 条；撤销栈 200（游戏）/60（编辑器），单帧内存约 200×2500B ≈ 0.5MB 量级，**有界**。无 `JSON.parse(JSON.stringify())` 深拷贝热路径 |
| DOM | 网格线用少量绝对定位 `div`（每 5 格一条）而非逐格边框；hover 行/列用两个 `div` 平移复用（不触发 React 渲染）；`overflow` 由 `<main>` 承担（移动端可滚动） |
| Bundle | 314.37 kB / gzip 105.65 kB（含 React 18 + Zustand 4）；worker 单独 8.85 kB。`base: './'` 同时兼容 Pages 子路径与根路径 |
| Mobile | `touch-action: none` 阻止拖动时页面滚动；长按 450ms 切换笔尖（带 `navigator.vibrate` 容错）；`MIN_CELL = 11px` 保证可点，空间不足时改为容器滚动；`prefers-reduced-motion` 下关闭动画/过渡（`index.css:370`）。**无** `backdrop-filter` 大面积滥用（仅顶栏/遮罩局部） |

实测性能证据（`pnpm test` / `pnpm puzzle:qa` 同源断言）：

```text
easy   达标 20/20, 唯一解 20/20, 平均 0.7ms,  最慢 5.7ms
medium 达标 20/20, 唯一解 20/20, 平均 23.6ms, 最慢 138.6ms
hard   达标 20/20, 唯一解 20/20, 平均 276.5ms,最慢 648.1ms
expert 达标 20/20, 唯一解 20/20, 平均 2.1ms,  最慢 8.9ms
退化线：四档 20 题全部为 0 条（困难/专家的硬指标 0 达成）
```

---

## 11. Data Integrity

| 数据 | 结论 |
| ---- | ---- |
| Puzzle | 生成路径保证 `width === height` 且为 5 的倍数、`solution.length === w*h`、线索由 `computeClues` 现算并与 `Puzzle` 中一致（`acceptance.test.ts` 对四档各 20 题断言）；`?s=`/`?p=` 入口分别经 `decodePuzzleCode` / `parsePuzzleId` 严格校验。**未发现不一致路径** |
| Game State | `board/wrong/past/future` 长度均等于 `w*h`；越界索引在 `applyStroke` 中被过滤；`refreshWrong` 在撤销/重做后按判定模式重算（极限模式的永久红痕 `2` 被保留）；`isBoardComplete` 只比较「是否填充」，与游戏胜利判定一致 |
| Save Data | 信封 + 版本 + 校验（`loadProgress` 校验 `puzzleId/width/height`）+ `decodeBoard` 严格校验字符与长度；损坏 → 返回 `null` → 拒绝恢复而不是抛出；`migrateStorage()` 在 `render` 之前跑完，首屏读到的数据一定已校验。测试覆盖「JSON 损坏 / 结构不合法 / 未来版本数据 / 长度不符」四种情形 |
| Share Data | 编码自包含（尺寸 + 难度 + 位压缩图案），解析严格（见 §8 URL Security）；实测 27k 字符垃圾输入 0.0ms 返回 null；`samePattern()` 避免「分享当前正在玩的同一道题」时重复 `startPuzzle` 丢失元信息 |
| Undo / Redo | 有界（200 / 60）且语义正确：新笔触清空 redo 栈、撤销写回存档、重做后重新计算错误标记；测试覆盖「往返一致 / 触底不出错 / 新涂格清空 redo」 |
| Tutorial | 与正常数据完全隔离：`tutorial=true` 时 `persist()` 直接 return（不写存档），`markWin` 只切完成态不写成绩/历史/每日/成就；退出时恢复玩家自己的对局；进度只写 `nonogram-tutorial-v1`。测试有专门的「隔离普通游戏」四例 |
| Statistics | 全部现算（历史 + 每日），不存快照 → 不会出现「统计与明细对不上」；无数据时返回 `null` 而不是 `NaN`（有测试）。已知小瑕疵：每日记录的 key 未做格式校验（L-04） |
| 边界与数值 | 已检查 `NaN/Infinity/负值/0/越界索引`：`formatDuration` 夹到 ≥0；`computeStreaks` 用 UTC 计算避免夏令时误差；`msUntilNextDaily` 用 `Date.UTC(y, m, d+1)` 自动跨月/跨年；`useBoardMetrics` 对 `width/height` 做 `Math.max(1, ...)` 保护；`elapsedOf` 用 `Math.max(0, now - runningSince)` |
| 时间口径 | 每日挑战统一 UTC（`utcDateKey`），界面明确写出「日期按 UTC 计算」并给倒计时；计时是「墙上时间 - 暂停时长 + 罚时」，切后台自动暂停（可关），刷新后继续计时（不允许免费暂停）。**口径一致，未发现午夜/时区错题** |

---

## 12. Testing

实际执行（在仓库根目录，`pnpm`）：

| 命令 | 结果 | 备注 |
| ---- | ---- | ---- |
| `pnpm lint` | **PASS**（0 error / 8 warning） | 8 条 warning 见 L-09；`eslint.config.js` 有意把 React Compiler 系列降级为 warn |
| `pnpm test` | **PASS**（15 files / 200 tests，15.90s） | 首次在沙箱内运行失败（esbuild 读取沙箱外目录「Access is denied」），属环境限制；在沙箱外重跑即通过。**不是项目缺陷** |
| `pnpm build` | **PASS** | `tsc -b && vite build`；`dist/index.html` 2.34 kB、CSS 33.86 kB(gzip 6.97)、JS 314.37 kB(gzip 105.65)、worker 8.85 kB，1.48s |
| `pnpm audit` | **FAIL（预期内）** | 7 条 advisory：1 critical / 1 high / 5 moderate，全部 devDependencies（§8 Dependencies 已逐条定性） |
| `pnpm format:check`（CI 有跑） | 未单独执行 | `pnpm lint` 与 `pnpm build` 均通过；如需完整回归建议补跑一次 |

测试覆盖分布（15 个文件，200 例）：`solverPlayground`(30) `gameStore`(23) `challenge`(22) `tutorial`(19) `progress`(16) `storage`(15) `bootstrap`(14) `encoding`(13) `solver`(11) `clues`(10) `generator`(9) `acceptance`(9) `boardImage`(5) `replay`(3) `storageFallback`(1)。

已确认的测试优点（不是缺陷，供后续回归参考）：
- 核心不变量被显式断言：四档各 20 题「唯一解 + 线索一致 + 盘面合法」。
- 与机器快慢有关的性能断言**不作为门禁**（用 `UNLIMITED_TIME_BUDGET_MS` 隔离墙钟），避免 flaky。
- 存储层四种损坏形态（JSON 坏 / 结构坏 / 未来版本 / 长度不符）都有用例。
- 教程「每一步都能被行列传播推出来」被断言 —— 教程不会教玩家去猜。
- 明确未引入 E2E/Playwright（README 已如实说明，交互靠人工在多尺寸下验证）。

---

## 13. 未发现问题的区域（审查范围内）

```text
XSS                                 未发现可利用路径（危险 API 全仓 0 命中，全部经 React 转义）
Secrets                             未发现前端硬编码密钥 / 凭据；无 .env；无 import.meta.env 读取
Privacy                             未发现数据外泄；零网络请求、零 cookie、零第三方资源、零遥测
API Key 写进 localStorage           未发现（逐键核对 9 个 key）
Open Redirect                       未发现（无 location.href/assign/replace/window.open）
ReDoS                               未发现（所有正则线性，无嵌套量词）
Prototype Pollution                 未发现可利用路径（仅临时对象原型，无法触达 Object.prototype）
无限 CPU / 无限内存                  未发现（solver/generator/trace 全部有硬上限；最长同步耗时实测 4.11s 且有界）
死循环                              未发现（生成器有 maxAttempts + 预算，传播在不动点终止）
Worker 生命周期                     已检查，无泄漏（三条结束路径都 terminate）
ResizeObserver / RAF / interval     已检查，cleanup 齐全
核心游戏逻辑                         未发现错误（胜负判定、划线、撤销重做、提示、计时口径均有测试与实码核对）
数据损坏导致白屏                     未出现（存储层已自愈；损坏设置也不崩，只是静默）
每日挑战时区一致性                   已检查，统一 UTC 且有倒计时与文档说明
第三方资源                          未发现（无 CDN / 字体 / 分析 / 广告 / 外部 API）
点击劫持                            GitHub Pages 无法设置响应头，属部署平台限制（I-02），未伪造解决方案
```

避免绝对化表述：以上均为「**在本次审查范围内未发现**」，不代表系统绝对安全。

---

## 14. 第二阶段：修复计划（P0 → P3）

本轮**不实施**修改，仅给出计划；每项都标注「最小修改原则」下的落点。

```text
P0（先做，风险/收益比最高）
  P0-1  M-01 给 ?p= 路径加输入边界 + 反馈：
        · parsePuzzleId 之后增加「尺寸/难度预算上限」判定（例如 maxDim > MAX_PLAY_SIZE 或 !isDifficultyReachable 时直接拒绝并提示），
          或在 ensureGame 前先渲染 loading 遮罩（与 HomePage.launch 一致），把 4 秒冻结变成「可见的等待 + 可取消」。
        · 不建议为它引入 Worker（生成路径改动面太大），最小改动是「边界 + 遮罩」。
  P0-2  M-03 加一个最薄的 AppErrorBoundary（页面级，不用第三方库）：
        · 捕获后显示「发生了一点问题 / [重新加载] [返回首页]」，不展示 stack；
        · 顺手在 settingsStore.currentThemeIsDark 里给 window.matchMedia 加存在性判断。
  P0-3  M-02 决策并落地「开发服务器不暴露公网」：
        · 方案 A（推荐，零依赖变更）：vite.config.ts 把 allowedHosts 改为显式域名白名单、README/share.bat 增加安全告警；
        · 方案 B：升级 vite 到 >=6.4.3（跨大版本，需单独回归）。

P1（正确性 / 数据完整性）
  P1-1  L-02 settings key 纳入 migrateStorage 校验 + 给 persist 配 onRehydrateStorage 打一条 warn。
  P1-2  L-03 用 storageAvailable() 驱动一条首页/设置页提示（“当前浏览器无法保存进度”），并把 available 由「永久缓存」改为「每次探测或按会话失效」。
  P1-3  L-04 loadDailyRecords 增加 date/key 格式校验（^\d{4}-\d{2}-\d{2}$），无效条目直接丢弃（与现有「损坏即删」一致）。
  P1-4  L-07 非 Worker 路径补 try/catch（复用 solveInline 的写法），保证 promise 一定落地。
  P1-5  L-01 编辑器分享回退改为复用 GamePage 的「弹窗 + 只读 textarea」模式（或去掉提示条的 pointer-events-none）。

P2（可用性 / 工程质量）
  P2-1  L-06 三处生命周期清理补齐（GameBoard 长按 unmount 清理、HomePage timeout 清理、SolverPage 卸载 cancel）。
  P2-2  L-05 统一「开玩尺寸」口径：要么把 MAX_PLAY_SIZE 用在 decodePuzzleCode/parsePuzzleId 上，要么删掉误导性的常量/文案。
  P2-3  L-08 网格补 role="row" 中间层；Modal 补 Esc 关闭 + 焦点陷阱 + 滚动锁定。
  P2-4  L-09 清掉 8 条 lint warning（主要是在 effect 里避免同步 setState、修 GamePage 的依赖数组）。
  P2-5  L-11 CI 增加 `pnpm audit --prod`（只对生产依赖设门禁，避免 dev 依赖噪音导致天天红）+ Dependabot 配置。

P3（架构 / 长期）
  P3-1  L-10 清理死代码与文档不一致（LARGE_BOARD_SIZE / void limits / text.ts 裁剪文案 / README 的 [] 与 [0]）。
  P3-2  I-01 存储层用 Object.create(null) 或显式跳过 __proto__ 作为形态加固（无实际漏洞，纯加固）。
  P3-3  I-02 评估 meta CSP 与托管平台响应头的可行性（需先确认内联脚本/内联样式的处理方式）。
  P3-4  I-05 评估 Solver / Tutorial 页面懒加载，压低首屏 JS（收益中等）。
  P3-5  I-06 start.bat 默认改为「只提示、不强杀」。
```

---

## 15. Security Summary

```text
Security Summary

Critical: 0
High:     0
Medium:   3
Low:      12
Info:     6

本次审查范围内：
- 未发现可确认的 XSS（危险 DOM/执行 API 全仓 0 命中，所有用户输入经 React 转义）
- 未发现前端硬编码 API Secret（无 .env、无 import.meta.env / VITE_* 读取）
- 未发现明确的 Timer / EventListener / ResizeObserver / RAF / Worker 泄漏（仅 3 处清理不干净，且经核实无实际泄漏）
- 未发现无限 CPU / 无限内存路径（solver / generator / trace 均有硬上限）
- 未发现原型污染可利用路径、ReDoS、Open Redirect、点击劫持缓解缺失以外的跳转问题
- 未发现隐私外泄：零网络请求、零 cookie、零第三方资源、零遥测、零账号
- 已发现（需处理）：1 条 URL 参数可造成约 4.1 秒主线程同步冻结；开发/预览服务器被文档鼓励公网暴露且所用 Vite 存在
  dev-server advisory；缺少 Error Boundary；以及 12 条 Low 级工程/一致性/清理问题

依赖：pnpm audit 7 条（1 critical / 1 high / 5 moderate），全部位于 devDependencies，不进生产产物；
      唯一需要决策的是「是否继续把 dev server 暴露公网」（与 M-02 同源）。
```

本次审查未做、也不建议在未经确认时做的事：不改写 Git 历史、不盲目升级跨大版本依赖、不为「消 lint」改业务逻辑、
不为「更高级」重写 solver / generator / 存储层。
