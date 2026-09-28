# 安全策略

## 报告安全问题

Nonogram Online 是一个**纯前端静态站点**：没有后端、没有数据库、没有账号系统，
所有数据都只保存在玩家自己的浏览器里。如果你发现了安全问题，请**私下**报告，
先不要公开开 Issue（避免在修复前公开利用细节）：

1. 优先使用 GitHub 的私密漏洞报告：
   <https://github.com/rusheng-world/nonogram-online/security/advisories/new>
2. 如果该入口不可用，可以开一个**不含利用细节**的 Issue 说明「哪个页面、什么现象」：
   <https://github.com/rusheng-world/nonogram-online/issues>

## 适用范围

- 分享链接 / 分享码解析与 URL 参数处理（`src/core/encoding.ts`、`src/router.ts`）
- 谜题生成器与求解器的输入边界（`src/core/generator.ts`、`src/core/solver.ts`）
- `localStorage` 读写与数据迁移（`src/core/storage.ts`）
- 构建与部署配置（`vite.config.ts`、`.github/workflows/`、`.github/dependabot.yml`）

## 不在范围内（设计如此，不是缺陷）

- **存档里以明文保存谜题答案**：纯前端数织的正常设计，玩家在界面上本来就能看到答案。
- **分享链接携带图案（即答案）**：零后端分享的必然取舍。
- **玩家自行修改自己浏览器里的 `localStorage`**：只影响本机数据，不涉及其他用户。
- **未设置 CSP**：GitHub Pages 无法设置响应头，且页面含内联主题脚本与大量内联样式。
- **依赖的 devDependencies advisories**：不进生产产物；`pnpm audit --prod` 是 CI 的门禁，
  dev 依赖的升级交给 Dependabot 逐个开 PR。

## 支持范围

只对**最新发布版本**（见 `CHANGELOG.md` 与 GitHub Releases）提供安全修复。
历史版本的修复记录可在 `CHANGELOG.md` 中查阅。
