import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { boardToCanvas, downloadBoardPng } from '../src/core/boardImage'
import { EMPTY, FILLED, UNKNOWN } from '../src/core/types'

/**
 * boardImage 依赖浏览器 Canvas，这里用一个「记账式」的假 canvas 替代：
 * 不真的画像素，只记录 fillRect / toDataURL / 下载链接等调用，
 * 用来验证「哪些格子被画出来」「图片尺寸」「下载文件名」这些关键行为。
 */
interface Ctx2D {
  scale: ReturnType<typeof vi.fn>
  fillRect: ReturnType<typeof vi.fn>
  beginPath: ReturnType<typeof vi.fn>
  moveTo: ReturnType<typeof vi.fn>
  lineTo: ReturnType<typeof vi.fn>
  stroke: ReturnType<typeof vi.fn>
  fillStyle: string
  strokeStyle: string
  lineWidth: number
}

let ctx: Ctx2D
let createdCanvas: { width: number; height: number; getContext: () => Ctx2D; toDataURL: (t: string) => string }
let anchors: { href: string; download: string; click: ReturnType<typeof vi.fn> }[]

beforeEach(() => {
  ctx = {
    scale: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
  }
  anchors = []
  createdCanvas = { width: 0, height: 0, getContext: () => ctx, toDataURL: (t: string) => `data:${t};base64,STUB` }
  ;(globalThis as unknown as { document: unknown }).document = {
    createElement: (tag: string) => {
      if (tag === 'canvas') return createdCanvas
      const anchor = { href: '', download: '', click: vi.fn() }
      anchors.push(anchor)
      return anchor
    },
    body: { appendChild: vi.fn(), removeChild: vi.fn() },
  }
})

afterEach(() => {
  delete (globalThis as unknown as { document?: unknown }).document
})

describe('答案导出：boardToCanvas / downloadBoardPng', () => {
  it('像素尺寸按 2 倍密度放大，并留出内边距', () => {
    const canvas = boardToCanvas(new Uint8Array(9), 3, 3, { cell: 10, padding: 4 })
    expect(canvas.width).toBe((3 * 10 + 4 * 2) * 2)
    expect(canvas.height).toBe((3 * 10 + 4 * 2) * 2)
    expect(ctx.scale).toHaveBeenCalledWith(2, 2)
  })

  it('只画 FILLED 的格子，EMPTY / UNKNOWN 一律留白', () => {
    const board = new Uint8Array([FILLED, EMPTY, UNKNOWN, FILLED])
    boardToCanvas(board, 2, 2, { cell: 8, padding: 0, guides: false })
    const cellRects = ctx.fillRect.mock.calls.slice(1)
    expect(cellRects).toEqual([
      [0, 0, 8, 8],
      [8, 8, 8, 8],
    ])
  })

  it('全空棋盘不会画出任何格子，但网格线仍然绘制', () => {
    boardToCanvas(new Uint8Array(4), 2, 2, { guides: false })
    expect(ctx.fillRect.mock.calls).toHaveLength(1)
    expect(ctx.stroke).toHaveBeenCalledTimes(6)
  })

  it('开启辅助线时每 5 格多画一条粗线', () => {
    // 10x10：基础网格线 (10+1)*2 = 22 条，再在 x=5 / y=5 处各补 1 条，共 24 条
    ctx.stroke.mockClear()
    boardToCanvas(new Uint8Array(100), 10, 10, { guides: true })
    expect(ctx.stroke).toHaveBeenCalledTimes(24)
    // 关掉辅助线只剩基础网格
    ctx.stroke.mockClear()
    boardToCanvas(new Uint8Array(100), 10, 10, { guides: false })
    expect(ctx.stroke).toHaveBeenCalledTimes(22)
  })

  it('downloadBoardPng 生成 PNG 数据链接并带上下载文件名', () => {
    downloadBoardPng(new Uint8Array([FILLED]), 1, 1, '答案.png')
    expect(anchors).toHaveLength(1)
    expect(anchors[0].download).toBe('答案.png')
    expect(anchors[0].href).toBe('data:image/png;base64,STUB')
    expect(anchors[0].click).toHaveBeenCalledTimes(1)
  })
})
