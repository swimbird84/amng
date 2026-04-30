import { useEffect, useRef, useState } from 'react'
import type { ActorScores } from '../types'

interface Props {
  scores: ActorScores
  size?: number
}

const LABELS = ['얼굴', '가슴', '엉덩이', '몸매', '피부', '연기력', '섹기', '매력', '테크닉', '비율']
const KEYS: (keyof ActorScores)[] = ['face', 'bust', 'hip', 'physical', 'skin', 'acting', 'sexy', 'charm', 'technique', 'proportions']

export default function RadarChart({ scores, size = 220 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)

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
    ctx.font = `14px sans-serif`
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

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const cx = size / 2
    const cy = size / 2
    const r = size / 2 - 36
    const n = 10
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2
      // 레이블 근접 체크
      const lx = cx + (r + 20) * Math.cos(angle)
      const ly = cy + (r + 20) * Math.sin(angle)
      if (Math.hypot(mx - lx, my - ly) < 28) {
        setTooltip({ text: `${LABELS[i]}: ${scores[KEYS[i]] ?? 0}`, x: e.clientX, y: e.clientY })
        return
      }
      // 축 라인 근접 체크 (점-선분 거리)
      const ex = cx + r * Math.cos(angle)
      const ey = cy + r * Math.sin(angle)
      const dx = ex - cx; const dy = ey - cy
      const len2 = dx * dx + dy * dy
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((mx - cx) * dx + (my - cy) * dy) / len2)) : 0
      const dist = Math.hypot(mx - (cx + t * dx), my - (cy + t * dy))
      if (dist < 12) {
        setTooltip({ text: `${LABELS[i]}: ${scores[KEYS[i]] ?? 0}`, x: e.clientX, y: e.clientY })
        return
      }
    }
    setTooltip(null)
  }

  return (
    <div className="relative inline-block">
      <canvas ref={canvasRef} width={size} height={size} onMouseMove={handleMouseMove} onMouseLeave={() => setTooltip(null)} />
      {tooltip && (
        <div
          className="fixed pointer-events-none z-[300] bg-gray-900 border border-gray-700 rounded shadow-lg text-sm text-gray-200 px-3 py-1.5"
          style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  )
}
