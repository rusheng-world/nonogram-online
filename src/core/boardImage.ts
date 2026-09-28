/**
 * 把一版答案导出成 PNG（纯 Canvas，不引第三方库）。
 *
 * 只在用户点「导出为图片」时执行，不参与渲染热路径。
 */

import { FILLED } from './types'

export interface BoardImageOptions {
  /** 每格像素（默认 28） */
  cell?: number
  /** 四周留白（默认 16） */
  padding?: number
  /** 每 5 格画一条加深的辅助线（默认 true） */
  guides?: boolean
  /** 深色底（默认 false） */
  dark?: boolean
}

/** 生成答案棋盘图片。返回 2 倍像素密度的 canvas，保证在高分屏上不糊。 */
export function boardToCanvas(
  solution: ArrayLike<number>,
  width: number,
  height: number,
  options: BoardImageOptions = {},
): HTMLCanvasElement {
  const cell = options.cell ?? 28
  const padding = options.padding ?? 16
  const guides = options.guides !== false
  const dark = options.dark === true
  const ratio = 2

  const canvas = document.createElement('canvas')
  canvas.width = (width * cell + padding * 2) * ratio
  canvas.height = (height * cell + padding * 2) * ratio
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.scale(ratio, ratio)

  const bg = dark ? '#12151f' : '#ffffff'
  const line = dark ? 'rgba(226,232,240,0.22)' : 'rgba(30,34,51,0.18)'
  const strong = dark ? 'rgba(226,232,240,0.5)' : 'rgba(30,34,51,0.45)'
  const filled = dark ? '#93c5fd' : '#232a41'

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width * cell + padding * 2, height * cell + padding * 2)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (solution[y * width + x] !== FILLED) continue
      ctx.fillStyle = filled
      ctx.fillRect(padding + x * cell, padding + y * cell, cell, cell)
    }
  }

  ctx.lineWidth = 1
  ctx.strokeStyle = line
  for (let x = 0; x <= width; x++) {
    const px = Math.round(padding + x * cell) + 0.5
    ctx.beginPath()
    ctx.moveTo(px, padding)
    ctx.lineTo(px, padding + height * cell)
    ctx.stroke()
  }
  for (let y = 0; y <= height; y++) {
    const py = Math.round(padding + y * cell) + 0.5
    ctx.beginPath()
    ctx.moveTo(padding, py)
    ctx.lineTo(padding + width * cell, py)
    ctx.stroke()
  }

  if (guides) {
    ctx.lineWidth = 2
    ctx.strokeStyle = strong
    for (let x = 5; x < width; x += 5) {
      const px = Math.round(padding + x * cell)
      ctx.beginPath()
      ctx.moveTo(px, padding)
      ctx.lineTo(px, padding + height * cell)
      ctx.stroke()
    }
    for (let y = 5; y < height; y += 5) {
      const py = Math.round(padding + y * cell)
      ctx.beginPath()
      ctx.moveTo(padding, py)
      ctx.lineTo(padding + width * cell, py)
      ctx.stroke()
    }
  }

  return canvas
}

/** 触发浏览器下载一张 PNG */
export function downloadBoardPng(
  solution: ArrayLike<number>,
  width: number,
  height: number,
  filename: string,
  options: BoardImageOptions = {},
): void {
  const canvas = boardToCanvas(solution, width, height, options)
  const url = canvas.toDataURL('image/png')
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
