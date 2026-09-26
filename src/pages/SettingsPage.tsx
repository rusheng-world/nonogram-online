import { useState } from 'react'
import { IconBack, IconTrash } from '../components/icons'
import { Button, Card, Modal, Segmented, Toggle } from '../components/ui'
import { clearHistory, clearProgress, loadHistory, loadProgress, saveRecords } from '../core/storage'
import type { JudgeMode, ThemeMode } from '../core/types'
import { navigate } from '../router'
import { HINT_PENALTY_MS } from '../store/gameStore'
import { applyTheme, useSettingsStore, type PaintMode } from '../store/settingsStore'

const APP_VERSION = '1.0.0'

const JUDGE_OPTIONS: { value: JudgeMode; label: string; hint: string }[] = [
  { value: 'lenient', label: '宽松', hint: '不实时提示，点“检查”或完成时校验' },
  { value: 'strict', label: '严格', hint: '涂错立刻闪红并计一次错误' },
  { value: 'extreme', label: '极限', hint: '错误永久标红并累加 10 秒罚时' },
]

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
]

const PAINT_OPTIONS: { value: PaintMode; label: string }[] = [
  { value: 'fill', label: '涂黑' },
  { value: 'mark', label: '标记 X' },
]

interface ConfirmState {
  title: string
  body: string
  confirmLabel: string
  action: () => void
}

export function SettingsPage(): JSX.Element {
  const settings = useSettingsStore()
  const setSetting = settings.set
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [stats, setStats] = useState(() => ({
    historyCount: loadHistory().length,
    hasProgress: loadProgress() !== null,
  }))
  const refreshStats = () => setStats({ historyCount: loadHistory().length, hasProgress: loadProgress() !== null })

  const judgeHint = JUDGE_OPTIONS.find((option) => option.value === settings.judgeMode)?.hint ?? ''

  return (
    /* 同首页：内容超出一屏时交给文档滚动，保证手机上能上下滑动 */
    <div className="app-flow flex flex-1 flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-ink-200/70 bg-ink-50/85 px-3 py-2.5 backdrop-blur dark:border-ink-800 dark:bg-ink-950/85 sm:px-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
          <IconBack />
          返回
        </Button>
        <h1 className="text-sm font-semibold text-ink-900 dark:text-white">设置</h1>
      </header>

      <main className="mx-auto flex max-w-2xl flex-col gap-4 p-3 sm:p-6">
        <Card className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-ink-900 dark:text-white">判定模式</h2>
            <p className="mt-0.5 text-[11px] text-ink-500 dark:text-ink-400">
              决定「涂错」的反馈方式。为了让成绩可比，判定模式在开局时固定，修改后从下一局开始生效。
            </p>
          </div>
          <Segmented value={settings.judgeMode} options={JUDGE_OPTIONS} onChange={(value) => setSetting('judgeMode', value)} />
          <p className="text-[11px] text-ink-500 dark:text-ink-400">{judgeHint}</p>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-semibold text-ink-900 dark:text-white">外观</h2>
          <Segmented
            value={settings.theme}
            options={THEME_OPTIONS}
            onChange={(value) => {
              setSetting('theme', value)
              applyTheme(value)
            }}
          />
          <div className="divide-y divide-ink-100 dark:divide-ink-800">
            <Toggle
              label="网格辅助线"
              description="每 5 格加深一条线，方便数格子"
              checked={settings.gridGuides}
              onChange={(value) => setSetting('gridGuides', value)}
            />
            <Toggle
              label="线索自动划线"
              description="当某条线索的位置已经能唯一确定、且已填满时，把对应的数字划掉"
              checked={settings.strikeClues}
              onChange={(value) => setSetting('strikeClues', value)}
            />
            <Toggle
              label="显示计时器"
              description="关闭后仍会计时与记录成绩，只是不显示"
              checked={settings.showTimer}
              onChange={(value) => setSetting('showTimer', value)}
            />
          </div>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-semibold text-ink-900 dark:text-white">操作</h2>
          <div className="divide-y divide-ink-100 dark:divide-ink-800">
            <Toggle
              label="音效"
              description="填格、标记、错误与胜利的提示音"
              checked={settings.sound}
              onChange={(value) => setSetting('sound', value)}
            />
            <Toggle
              label="提示罚时"
              description={`使用一次提示加 ${HINT_PENALTY_MS / 1000} 秒（关闭后提示不计罚时）`}
              checked={settings.hintPenalty}
              onChange={(value) => setSetting('hintPenalty', value)}
            />
            <Toggle
              label="切换标签页自动暂停"
              description="离开页面时自动暂停计时并遮住棋盘"
              checked={settings.autoPause}
              onChange={(value) => setSetting('autoPause', value)}
            />
          </div>
          <div className="space-y-1">
            <span className="text-[11px] text-ink-500 dark:text-ink-400">触屏模式默认动作</span>
            <Segmented value={settings.paintMode} options={PAINT_OPTIONS} onChange={(value) => setSetting('paintMode', value)} />
          </div>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-semibold text-ink-900 dark:text-white">数据</h2>
          <p className="text-[11px] text-ink-500 dark:text-ink-400">
            所有进度、成绩都保存在这台设备的浏览器本地（localStorage），不会上传到任何服务器。
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={stats.historyCount === 0}
              onClick={() =>
                setConfirm({
                  title: '清空历史成绩？',
                  body: `将删除 ${stats.historyCount} 条完成记录，最佳成绩不受影响。`,
                  confirmLabel: '清空历史',
                  action: () => {
                    clearHistory()
                    setMessage('历史成绩已清空')
                    refreshStats()
                  },
                })
              }
            >
              <IconTrash size={15} />
              清空历史成绩
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setConfirm({
                  title: '清空最佳成绩？',
                  body: '所有谜题的最佳用时记录都会被删除。',
                  confirmLabel: '清空记录',
                  action: () => {
                    saveRecords({})
                    setMessage('最佳成绩已清空')
                    refreshStats()
                  },
                })
              }
            >
              <IconTrash size={15} />
              清空最佳成绩
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!stats.hasProgress}
              onClick={() =>
                setConfirm({
                  title: '放弃当前对局？',
                  body: '未完成的进度会被删除，之后无法「继续上一局」。',
                  confirmLabel: '放弃进度',
                  action: () => {
                    clearProgress()
                    setMessage('当前进度已清除')
                    refreshStats()
                  },
                })
              }
            >
              <IconTrash size={15} />
              清除当前进度
            </Button>
          </div>
          {message ? <p className="text-[11px] text-emerald-600 dark:text-emerald-400">{message}</p> : null}
        </Card>

        <Card className="space-y-2">
          <h2 className="text-sm font-semibold text-ink-900 dark:text-white">关于</h2>
          <p className="text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">
            Nonogram Online（数织工坊）v{APP_VERSION} · 纯前端实现，无后端、无账号、无网络请求。
            谜题由「随机团块生长 + 对称镜像 + 噪声」生成图案，再用 DP 线索传播求解器验证唯一解，
            并按解出该题所需的回溯次数与假设链深度评定难度。
          </p>
          <p className="text-[11px] leading-relaxed text-ink-500 dark:text-ink-400">
            快捷键：方向键移动光标，空格涂黑，X 标记，Delete 清除，Ctrl+Z / Ctrl+Shift+Z 撤销重做，H 提示，P 暂停。
          </p>
          <p className="text-[11px] leading-relaxed text-ink-400">
            开源协议 MIT · 本项目由 deepseek-v4.1-flash 生成。
          </p>
        </Card>
      </main>

      <Modal
        open={confirm !== null}
        title={confirm?.title ?? ''}
        onClose={() => setConfirm(null)}
        footer={
          <>
            <Button onClick={() => setConfirm(null)}>取消</Button>
            <Button
              variant="danger"
              onClick={() => {
                confirm?.action()
                setConfirm(null)
              }}
            >
              {confirm?.confirmLabel ?? '确认'}
            </Button>
          </>
        }
      >
        <p>{confirm?.body}</p>
      </Modal>
    </div>
  )
}
