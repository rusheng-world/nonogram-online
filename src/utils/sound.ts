/**
 * 极简音效（WebAudio，无外部资源文件）。
 * 用户可在设置里关闭。
 */

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) ctx = new Ctor()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function beep(frequency: number, durationMs: number, gain = 0.05, type: OscillatorType = 'sine', delayMs = 0): void {
  const audio = getCtx()
  if (!audio) return
  const start = audio.currentTime + delayMs / 1000
  const osc = audio.createOscillator()
  const vol = audio.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(frequency, start)
  vol.gain.setValueAtTime(0.0001, start)
  vol.gain.exponentialRampToValueAtTime(gain, start + 0.01)
  vol.gain.exponentialRampToValueAtTime(0.0001, start + durationMs / 1000)
  osc.connect(vol).connect(audio.destination)
  osc.start(start)
  osc.stop(start + durationMs / 1000 + 0.02)
}

export type SoundName = 'fill' | 'mark' | 'erase' | 'error' | 'win' | 'hint' | 'click'

export function playSound(name: SoundName): void {
  switch (name) {
    case 'fill':
      beep(660, 45, 0.045, 'triangle')
      break
    case 'mark':
      beep(420, 40, 0.035, 'square')
      break
    case 'erase':
      beep(300, 35, 0.03, 'sine')
      break
    case 'error':
      beep(180, 120, 0.06, 'sawtooth')
      break
    case 'hint':
      beep(880, 60, 0.05, 'sine')
      beep(1180, 80, 0.05, 'sine', 70)
      break
    case 'win':
      beep(660, 110, 0.06, 'sine')
      beep(880, 110, 0.06, 'sine', 120)
      beep(1320, 220, 0.06, 'sine', 240)
      break
    case 'click':
      beep(520, 25, 0.025, 'triangle')
      break
  }
}
