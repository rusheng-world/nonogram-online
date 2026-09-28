/**
 * ESLint 9 扁平配置（flat config）。
 *
 * 组成：
 *   · js.configs.recommended          —— ESLint 官方推荐规则
 *   · typescript-eslint recommended   —— TS 类型感知规则
 *   · eslint-plugin-react-hooks       —— Hooks 规则（本项目的状态全部由 Hooks 驱动）
 *   · eslint-plugin-react-refresh     —— 保证组件文件只导出组件（HMR 稳定性）
 *
 * 说明：react-hooks v7 附带了一批 React Compiler 专用规则（immutability / purity / refs …）。
 * 这些规则对新代码很有价值，但会产生大量与既有成熟实现风格相关的提示，
 * 因此这里把它们降级为 warning：CI 只对 error 失败，`pnpm lint` 依然保持有意义。
 */
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

/** @type {import('eslint').Linter.Config['rules']} */
const reactHooksRules = Object.fromEntries(
  Object.entries(reactHooks.configs.flat.recommended.rules).map(([rule, level]) => [
    rule,
    // 保留 rules-of-hooks / exhaustive-deps 的原始级别，其余全部降级为 warn
    rule === 'react-hooks/rules-of-hooks' || rule === 'react-hooks/exhaustive-deps' ? level : 'warn',
  ]),
)

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'work/**', 'node_modules/**', '*.config.js', 'postcss.config.js'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.worker },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooksRules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['tests/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
)
