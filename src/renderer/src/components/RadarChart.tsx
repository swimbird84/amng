import { useEffect, useRef } from 'react'
import type { ActorScores } from '../types'

interface Props {
  scores: ActorScores
  size?: number
}

const LABELS = ['외모', '가슴', '엉덩이', '몸매', '피부', '연기력', '섹기', '매력', '테크닉', '비율']
const KEYS: (keyof ActorScores)[] = ['face', 'bust', 'hip', 'physical', 'skin', 'acting', 'sexy', 'charm', 'technique', 'proportions']

export default function RadarChart({ scores, size = 220 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const cx = size / 2
    const cy = size / 2
    const r = size / 2 - 36
    const n = 10

    ctx.clearRect(0, 0, size, size)

    // 격자 (5단계)
    for (let level = 1; level <= 5; level++) {
      const lr = (r * level) / 5
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2
        const x = cx + lr * Math.cos(angle)
        const y = cy + lr * Math.sin(angle)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // 축
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle))
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // 데이터 영역
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2
      const val = (scores[KEYS[i]] ?? 0) / 10
      const x = cx + r * val * Math.cos(angle)
      const y = cy + r * val * Math.sin(angle)
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.fillStyle = 'rgba(59,130,246,0.35)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(96,165,250,0.85)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    // 꼭짓점 점
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2
      const val = (scores[KEYS[i]] ?? 0) / 10
      const x = cx + r * val * Math.cos(angle)
      const y = cy + r * val * Math.sin(angle)
      ctx.beginPath()
      ctx.arc(x, y, 2.5, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(147,197,253,0.9)'
      ctx.fill()
    }

    // 레이블
    ctx.fillStyle = 'rgba(200,200,200,0.85)'
    ctx.font = `${Math.round(size * 0.062)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2
      const lr = r + 20
      const x = cx + lr * Math.cos(angle)
      const y = cy + lr * Math.sin(angle)
      ctx.fillText(LABELS[i], x, y)
    }
  }, [scores, size])

  return <canvas ref={canvasRef} width={size} height={size} />
}
