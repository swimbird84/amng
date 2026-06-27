import React, { useState } from 'react'
import type { ItemInfo } from './cupTypes'

// ── Round Options ──
export const ROUND_OPTIONS = [
  { value: 16, label: '16강' }, { value: 32, label: '32강' },
  { value: 64, label: '64강' }, { value: 128, label: '128강' },
  { value: 256, label: '256강' }, { value: 512, label: '512강' },
  { value: 0, label: '전체' },
]

// ── Format / Status Labels ──
export const FORMAT_LABEL: Record<string, string> = { tournament: '토너먼트', league: '리그전', worldcup: '월드컵' }
export const FORMAT_COLOR: Record<string, string> = {
  tournament: 'bg-blue-900/60 text-blue-300',
  league: 'bg-green-900/60 text-green-300',
  worldcup: 'bg-purple-900/60 text-purple-300',
}
export const STATUS_LABEL: Record<string, string> = { in_progress: '진행중', completed: '완료' }
export const STATUS_COLOR: Record<string, string> = {
  in_progress: 'text-yellow-400',
  completed: 'text-green-400',
}

// ── Ranking / Division ──
export const RANK_PAGE_SIZE = 50
export const POOL_SIZES = ['32', '64', '128', '256', '512']
export const RANK_THRESHOLDS = ['1', '2', '4', '8', '16', '32']
export const DIV_LABELS = ['1부', '2부', '3부', '4부', '5부', '6부']
export const RANK_LIMIT_OPTIONS = [100, 200, 500, 1000]

export const RANK_MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }
export const MASTER_PAGE_SIZES = [100, 200, 500, 1000]
export const DIV_BOUNDARIES = [32, 96, 224, 480, 992, 2016]
export const DIV_LABEL: Record<number, string> = { 1: '1부', 2: '2부', 3: '3부', 4: '4부', 5: '5부', 6: '6부', 0: '미분류' }
export const DIV_STD_SIZES: Record<number, number> = { 1: 32, 2: 64, 3: 128, 4: 256, 5: 512, 6: 1024 }
export const DIV_COLOR: Record<number, string> = {
  1: 'bg-yellow-900/60 text-yellow-300',
  2: 'bg-gray-700/60 text-gray-300',
  3: 'bg-amber-900/60 text-amber-400',
  4: 'bg-cyan-900/60 text-cyan-300',
  5: 'bg-purple-900/60 text-purple-300',
  6: 'bg-gray-800/60 text-gray-400',
  0: 'bg-gray-800/60 text-gray-500',
}
export const DIV_TEXT_COLOR: Record<number, string> = {
  1: 'text-yellow-300', 2: 'text-gray-300', 3: 'text-amber-400',
  4: 'text-cyan-300', 5: 'text-purple-300', 6: 'text-gray-400', 0: 'text-gray-500',
}

// ── Helper Functions ──
export function roundLabel(round: number): string {
  if (round === 2) return '결승'
  if (round === 4) return '준결승'
  return `${round}강`
}

export function blockRoundLabel(round: number, roundTotal: number, itemType: string): string {
  const unit = itemType === 'actor' ? '인' : '작품'
  return `${roundTotal / (32 / round)}강(${round}${unit})`
}

export function finalRoundLabel(round: number): string {
  if (round === 2) return '결승'
  if (round === 4) return '준결승'
  return `${round}강`
}

export function calcPoolSize(totalItems: number, roundTotal: number): number {
  const multiplier = Math.max(2, Math.sqrt(totalItems / roundTotal))
  return Math.min(totalItems, Math.round(roundTotal * multiplier))
}

export function itemLabel(item: ItemInfo): string {
  return item.name ?? item.title ?? item.product_number ?? `#${item.id}`
}

export function itemShortLabel(item: ItemInfo): string {
  if (item.name) return item.name
  const pn = item.product_number ?? ''
  const title = item.title ?? ''
  const truncTitle = title.length > 35 ? title.slice(0, 35) + '…' : title
  if (pn && truncTitle) return `${pn} ${truncTitle}`
  return pn || truncTitle || `#${item.id}`
}

export function itemPnLabel(item: ItemInfo): string {
  return item.name ?? item.product_number ?? `#${item.id}`
}

export function itemImagePath(item: ItemInfo): string | null | undefined {
  return item.photo_path ?? item.cover_path
}

export function getDivision(rank: number, masterRunCount: number): number {
  if (masterRunCount === 0) return 0
  for (let d = 0; d < DIV_BOUNDARIES.length; d++) {
    if (rank <= DIV_BOUNDARIES[d]) return d + 1
  }
  return 6
}

// ── Pagination Component ──
export function Pagination({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (p: number) => void }) {
  const CHUNK = 10
  const chunk = Math.floor(page / CHUNK)
  const start = chunk * CHUNK
  const end = Math.min(start + CHUNK, totalPages)
  const btn = 'px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded disabled:opacity-40 disabled:cursor-not-allowed'
  const active = 'px-2.5 py-1 bg-blue-600 text-white text-sm rounded'
  return (
    <div className="flex items-center justify-center gap-1 py-3 border-t border-gray-700 shrink-0 flex-wrap">
      <button onClick={() => onPageChange(0)} disabled={page === 0} className={btn}>«</button>
      <button onClick={() => onPageChange((chunk - 1) * CHUNK)} disabled={chunk === 0} className={btn}>‹</button>
      {Array.from({ length: end - start }, (_, i) => start + i).map(p => (
        <button key={p} onClick={() => onPageChange(p)} className={p === page ? active : btn}>{p + 1}</button>
      ))}
      {end < totalPages && <span className="text-gray-500 text-sm px-1">...</span>}
      <button onClick={() => onPageChange((chunk + 1) * CHUNK)} disabled={end >= totalPages} className={btn}>›</button>
      <button onClick={() => onPageChange(totalPages - 1)} disabled={page === totalPages - 1} className={btn}>»</button>
    </div>
  )
}

// ── Chart Components ──
export function RunDistChart({ data }: { data: { run_count: number; count: number }[] }) {
  const [hovered, setHovered] = useState<number | null>(null)
  if (data.length === 0) return <p className="text-gray-500 text-sm text-center py-4">데이터 없음</p>
  const W = 580, H = 180, PL = 44, PR = 12, PT = 18, PB = 32
  const cW = W - PL - PR, cH = H - PT - PB
  const maxCount = Math.max(...data.map(d => d.count))
  const barW = cW / data.length
  const showEvery = data.length > 30 ? Math.ceil(data.length / 30) : 1
  const yTicks = [0, 0.25, 0.5, 0.75, 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 180 }}>
      {yTicks.map(r => {
        const y = PT + cH * (1 - r)
        const val = Math.round(maxCount * r)
        return (
          <g key={r}>
            <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#374151" strokeWidth="1" />
            <text x={PL - 4} y={y + 3.5} textAnchor="end" fontSize="9" fill="#9ca3af">{val}</text>
          </g>
        )
      })}
      {data.map((d, i) => {
        const x = PL + i * barW
        const bH = maxCount > 0 ? (d.count / maxCount) * cH : 0
        const y = PT + cH - bH
        const isH = hovered === i
        return (
          <g key={i} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} style={{ cursor: 'default' }}>
            <rect x={x + 1} y={y} width={Math.max(barW - 2, 1)} height={bH} fill={isH ? '#60a5fa' : '#3b82f6'} rx="2" />
            {i % showEvery === 0 && bH > 0 && (
              <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize="10" fill="white">{d.count}</text>
            )}
            {i % showEvery === 0 && (
              <text x={x + barW / 2} y={H - 4} textAnchor="middle" fontSize="9" fill="#9ca3af">{d.run_count}</text>
            )}
          </g>
        )
      })}
      <line x1={PL} y1={PT} x2={PL} y2={PT + cH} stroke="#4b5563" strokeWidth="1.5" />
      <line x1={PL} y1={PT + cH} x2={W - PR} y2={PT + cH} stroke="#4b5563" strokeWidth="1.5" />
    </svg>
  )
}

export function RankTrendChart({ history }: { history: { rank: number }[] }) {
  if (history.length < 2) return null
  const maxR = Math.max(...history.map(h => h.rank))
  const minR = Math.min(...history.map(h => h.rank))
  const range = maxR - minR || 1
  const w = 160, h = 28, pad = 2
  const pts = history.map((p, i) => {
    const x = pad + (i / (history.length - 1)) * (w - pad * 2)
    const y = pad + ((p.rank - minR) / range) * (h - pad * 2)
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={w} height={h} className="inline-block align-middle">
      <polyline points={pts} fill="none" stroke="#60a5fa" strokeWidth={1.5} />
    </svg>
  )
}
