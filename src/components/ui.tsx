import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-indigo-600 text-white hover:bg-indigo-500 active:bg-indigo-700 disabled:bg-indigo-600/40 dark:bg-indigo-500 dark:hover:bg-indigo-400',
  secondary:
    'bg-white text-ink-800 ring-1 ring-ink-200 hover:bg-ink-50 active:bg-ink-100 dark:bg-ink-800 dark:text-ink-100 dark:ring-ink-700 dark:hover:bg-ink-700',
  ghost: 'bg-transparent text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800',
  danger: 'bg-rose-600 text-white hover:bg-rose-500 active:bg-rose-700',
}

const SIZES: Record<Size, string> = {
  sm: 'px-2.5 py-1.5 text-xs rounded-lg gap-1',
  md: 'px-3.5 py-2 text-sm rounded-xl gap-1.5',
  lg: 'px-5 py-2.5 text-base rounded-xl gap-2',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }): JSX.Element {
  return (
    <button
      type="button"
      className={`inline-flex select-none items-center justify-center font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }): JSX.Element {
  return (
    <div
      className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-ink-200/70 dark:bg-ink-900 dark:ring-ink-800 ${className}`}
    >
      {children}
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className = '',
}: {
  value: T
  options: { value: T; label: string; hint?: string }[]
  onChange: (value: T) => void
  className?: string
}): JSX.Element {
  return (
    <div className={`inline-flex rounded-xl bg-ink-100 p-0.5 dark:bg-ink-800 ${className}`} role="tablist">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            title={option.hint}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={`rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? 'bg-white text-ink-900 shadow-sm dark:bg-ink-700 dark:text-white'
                : 'text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-100'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  description?: string
}): JSX.Element {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2">
      <span>
        <span className="block text-sm font-medium text-ink-800 dark:text-ink-100">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-ink-500 dark:text-ink-400">{description}</span>
        ) : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-indigo-600 dark:bg-indigo-500' : 'bg-ink-300 dark:bg-ink-700'
        }`}
      >
        {/*
         * 圆钮必须显式定位（left-0.5）。button 默认 text-align: center，
         * 只写 absolute 会让它按「静态位置」摆放 —— 也就是居中，
         * 于是圆钮整体右移约 11px，打开时还会溢出 44px 宽的轨道（这就是错位的根因）。
         * 轨道 44px、圆钮 20px，两侧各留 2px：关闭 translate-x-0（左侧），
         * 打开 translate-x-5（20px，贴右侧）。
         */}
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </label>
  )
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  open: boolean
  title: string
  onClose?: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}): JSX.Element | null {
  if (!open) return null
  // 打开时才挂载内部组件：焦点陷阱 / 滚动锁定这些副作用（hooks）必须无条件执行，
  // 所以把它们放进子组件，而不是写在会提前 return 的 Modal 本体里。
  return (
    <ModalDialog title={title} onClose={onClose} footer={footer} wide={wide}>
      {children}
    </ModalDialog>
  )
}

/** 可聚焦元素选择器（焦点陷阱用） */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function ModalDialog({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string
  onClose?: () => void
  children: ReactNode
  footer?: ReactNode
  wide: boolean
}): JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  // 打开时把焦点移进弹窗并锁住背景滚动，关闭时恢复（L-08）
  useEffect(() => {
    const panel = panelRef.current
    const previouslyFocused = document.activeElement as HTMLElement | null
    // 焦点给「面板容器」而不是第一个按钮：避免键盘用户一进来就被自动聚焦的
    // 危险按钮（例如「确认清空」）误触，Tab 之后自然进入第一个可聚焦元素
    panel?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
      // 焦点还给打开弹窗的那个元素，键盘用户不会「迷路」
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') previouslyFocused.focus()
    }
  }, [])

  // Esc 关闭 + Tab 焦点循环（基本焦点陷阱，L-08）
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (onClose) {
          event.preventDefault()
          onClose()
        }
        return
      }
      if (event.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      )
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`animate-fadeIn max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl ring-1 ring-ink-200 outline-none dark:bg-ink-900 dark:ring-ink-800 sm:rounded-2xl ${
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md'
        }`}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-base font-semibold text-ink-900 dark:text-white">
            {title}
          </h2>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="rounded-lg p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          ) : null}
        </div>
        <div className="space-y-3 text-sm text-ink-700 dark:text-ink-200">{children}</div>
        {footer ? <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  )
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }): JSX.Element {
  return (
    <div className="rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-800/60">
      <div className="text-[11px] uppercase tracking-wide text-ink-500 dark:text-ink-400">{label}</div>
      <div className="text-sm font-semibold text-ink-900 dark:text-white" title={hint}>
        {value}
      </div>
    </div>
  )
}

export function Pill({
  children,
  tone = 'default',
}: {
  children: ReactNode
  tone?: 'default' | 'success' | 'warn' | 'danger'
}): JSX.Element {
  const tones = {
    default: 'bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200',
    success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    warn: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    danger: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}
