import React, { useState, useEffect, useCallback, useRef } from 'react'
import { cupApi, masterRankingApi, rankingSettingsApi, actorsApi, worksApi, shellApi } from '../api'
import ImagePreview from '../components/ImagePreview'
import CardTooltip, { type TooltipState } from '../components/CardTooltip'
import WorldcupFilterModal, { type WcFilter, countActiveFilters } from '../components/WorldcupFilterModal'
import MasterFilterModal, { type MasterFilter, countActiveMasterFilters } from '../components/MasterFilterModal'
import Rating from '../components/Rating'
import type { ActorScores } from '../types'
import { useScoreDemote, ScoreDemoteModal, SCORE_GRADE_LIMITS, type ActorScoreSnapshot, type PendingDemotion } from '../components/ScoreDemoteModal'

// ── Types ──────────────────────────────────────────────────────────────────
type CupTournament = {
  id: number
  type: 'actor' | 'work'
  name: string
  is_master: number
  format: 'tournament' | 'league' | 'worldcup'
  division_range: string | null
  filter_json: string | null
  created_at: string
  // latest run (LEFT JOIN)
  latest_run_id: number | null
  latest_run_status: 'in_progress' | 'completed' | null
  round_total: number | null
  winner_id: number | null
  started_at: string | null
  completed_at: string | null
  winner_name: string | null
  winner_photo: string | null
}

type CupRun = {
  id: number
  tournament_id: number
  status: 'in_progress' | 'completed'
  round_total: number | null
  winner_id: number | null
  settings_snapshot: string | null
  started_at: string
  completed_at: string | null
}

type CupMatch = {
  id: number
  tournament_id: number
  phase: 'group' | 'tiebreak' | 'main'
  group_id: number | null
  block_id: number | null
  round: number
  match_index: number
  item1_id: number
  item2_id: number | null
  winner_id: number | null
  is_bye: number
  is_draw: number
}

type ItemInfo = {
  id: number
  name?: string
  photo_path?: string | null
  title?: string | null
  product_number?: string | null
  cover_path?: string | null
  rating?: number | null
  comment?: string | null
  files?: { id: number; file_path: string; type: string }[]
}

type StandingsRow = { item_id: number; pts: number; w: number; d: number; l: number }

type TournamentRankRow = {
  item_id: number
  total_runs: number
  run_wins: number
  total_matches: number
  match_wins: number
  win_rate: number
  match_win_rate: number
  total_pts: number
  name?: string
  photo_path?: string | null
  title?: string | null
  product_number?: string | null
  cover_path?: string | null
}

type LastRunRankRow = {
  rank: number
  item_id: number
  elim_round: number | null
  pts: number | null
  run_pts: number | null
  name?: string
  photo_path?: string | null
  title?: string | null
  product_number?: string | null
  cover_path?: string | null
}

// ── Constants ──────────────────────────────────────────────────────────────
const SCORE_FIELDS: { key: keyof ActorScores; label: string }[] = [
  { key: 'face', label: '얼굴' },
  { key: 'bust', label: '가슴' },
  { key: 'hip', label: '엉덩이' },
  { key: 'physical', label: '몸매' },
  { key: 'skin', label: '피부' },
  { key: 'acting', label: '연기력' },
  { key: 'sexy', label: '섹기' },
  { key: 'charm', label: '매력' },
  { key: 'technique', label: '테크닉' },
  { key: 'proportions', label: '비율' },
]
const SCORE_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]

const ROUND_OPTIONS = [
  { value: 16, label: '16강' }, { value: 32, label: '32강' },
  { value: 64, label: '64강' }, { value: 128, label: '128강' },
  { value: 256, label: '256강' }, { value: 512, label: '512강' },
  { value: 0, label: '전체' },
]

const FORMAT_LABEL: Record<string, string> = { tournament: '토너먼트', league: '리그전', worldcup: '월드컵' }
const FORMAT_COLOR: Record<string, string> = {
  tournament: 'bg-blue-900/60 text-blue-300',
  league: 'bg-green-900/60 text-green-300',
  worldcup: 'bg-purple-900/60 text-purple-300',
}
const STATUS_LABEL: Record<string, string> = { in_progress: '진행중', completed: '완료' }
const STATUS_COLOR: Record<string, string> = {
  in_progress: 'text-yellow-400',
  completed: 'text-green-400',
}

// ── Pagination ─────────────────────────────────────────────────────────────
function Pagination({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (p: number) => void }) {
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

// ── Helpers ────────────────────────────────────────────────────────────────
function roundLabel(round: number): string {
  if (round === 2) return '결승'
  if (round === 4) return '준결승'
  return `${round}강`
}

function blockRoundLabel(round: number, roundTotal: number, itemType: string): string {
  const unit = itemType === 'actor' ? '인' : '작품'
  return `${roundTotal / (32 / round)}강(${round}${unit})`
}

function finalRoundLabel(round: number): string {
  if (round === 2) return '결승'
  if (round === 4) return '준결승'
  return `${round}강`
}

function calcPoolSize(totalItems: number, roundTotal: number): number {
  const multiplier = Math.max(2, Math.sqrt(totalItems / roundTotal))
  return Math.min(totalItems, Math.round(roundTotal * multiplier))
}

function itemLabel(item: ItemInfo): string {
  return item.name ?? item.title ?? item.product_number ?? `#${item.id}`
}

function itemImagePath(item: ItemInfo): string | null | undefined {
  return item.photo_path ?? item.cover_path
}

// ── CreateModal ────────────────────────────────────────────────────────────
function CreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (t: CupTournament) => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<'actor' | 'work'>('actor')
  const [format, setFormat] = useState<'tournament' | 'league' | 'worldcup'>('tournament')
  const [isMaster, setIsMaster] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filterJson, setFilterJson] = useState<WcFilter | null>(null)
  const [masterFilter, setMasterFilter] = useState<MasterFilter | null>(null)
  const [showFilterModal, setShowFilterModal] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      const effectiveFilter = isMaster ? (masterFilter ?? null) : (filterJson ?? null)
      const t = await cupApi.create({ type, name: name.trim(), isMaster, format, filterJson: effectiveFilter }) as CupTournament
      onCreated(t)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl p-6 w-[420px] shadow-2xl">
        <h2 className="text-lg font-bold text-white mb-4">대회 등록</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">대회명</label>
            <input
              autoFocus
              className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="대회 이름 입력"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
          </div>

          <label className={`flex items-center gap-3 select-none ${format === 'worldcup' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
            <div
              onClick={() => format !== 'worldcup' && setIsMaster(v => !v)}
              className={`w-10 h-5 rounded-full transition-colors ${isMaster ? 'bg-yellow-500' : 'bg-gray-600'} relative`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isMaster ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm text-gray-200">마스터 대회 <span className="text-yellow-400 text-xs">(랭킹 반영)</span>{format === 'worldcup' && <span className="text-gray-500 text-xs ml-1">(월드컵 고정)</span>}</span>
          </label>

          <div className="flex gap-2">
            {(['actor', 'work'] as const).map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`flex-1 py-2 rounded text-sm font-medium transition ${type === t ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              >
                {t === 'actor' ? '배우' : '작품'}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            {(['tournament', 'league', 'worldcup'] as const).map(f => (
              <button
                key={f}
                onClick={() => { setFormat(f); if (f === 'worldcup') setIsMaster(true) }}
                className={`flex-1 py-2 rounded text-sm font-medium transition ${format === f ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              >
                {FORMAT_LABEL[f]}
              </button>
            ))}
          </div>

          {format !== 'worldcup' && (
            <button
              className={`w-full py-2 rounded text-sm ${
                (isMaster ? countActiveMasterFilters(masterFilter) : countActiveFilters(filterJson)) > 0
                  ? 'bg-blue-700 hover:bg-blue-600 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
              onClick={() => setShowFilterModal(true)}
            >
              필터 설정
            </button>
          )}
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={handleCreate}
            disabled={!name.trim() || saving}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded text-sm font-semibold"
          >
            등록
          </button>
          <button onClick={onClose} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">취소</button>
        </div>
      </div>
    </div>
    {showFilterModal && (isMaster ? (
      <MasterFilterModal
        type={type}
        filter={masterFilter}
        onSave={f => { setMasterFilter(f); setShowFilterModal(false) }}
        onClose={() => setShowFilterModal(false)}
      />
    ) : (
      <WorldcupFilterModal
        type={type}
        filter={filterJson}
        onSave={f => { setFilterJson(f); setShowFilterModal(false) }}
        onClose={() => setShowFilterModal(false)}
      />
    ))}
    </>
  )
}


// ── RunDistChart ───────────────────────────────────────────────────────────
function RunDistChart({ data }: { data: { run_count: number; count: number }[] }) {
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

// ── TournamentCard ─────────────────────────────────────────────────────────
function TournamentCard({
  t,
  onPlay,
  onRankings,
  onStats,
  onDelete,
  onUpdate,
}: {
  t: CupTournament
  onPlay: (runId?: number, tab?: 'match' | 'standings') => void
  onRankings: (id: number) => void
  onStats: (id: number) => void
  onDelete: () => void
  onUpdate: () => void
}) {
  const [showEditName, setShowEditName] = useState(false)
  const [editName, setEditName] = useState(t.name)
  const [showConfirmDel, setShowConfirmDel] = useState(false)
  const [delConfirmInput, setDelConfirmInput] = useState('')
  const [showInProgress, setShowInProgress] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('')
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [clearConfirmInput, setClearConfirmInput] = useState('')
  const [showFilterModal, setShowFilterModal] = useState(false)
  const [cardFilter, setCardFilter] = useState<WcFilter | MasterFilter | null>(t.filter_json ? JSON.parse(t.filter_json) : null)
  const [itemCount, setItemCount] = useState(0)
  const [roundValue, setRoundValue] = useState(0)
  const [starting, setStarting] = useState(false)
  const [runProgress, setRunProgress] = useState<{ match: { round: number; match_index: number; phase: string; group_id: number | null; block_id: number | null } | null; total: number; done: number; groupMatchDone: number | null; groupMatchTotal: number | null } | null>(null)

  useEffect(() => {
    cupApi.itemCount(t.id).then(count => {
      setItemCount(count as number)
      const allValid = ROUND_OPTIONS.filter(o => {
        if (o.value === 0) return t.format === 'tournament'
        if (t.format === 'worldcup') return (count as number) >= o.value * 2
        if (t.format === 'league') return (count as number) >= o.value * 2
        return o.value <= (count as number)
      })
      const validOptions = t.format === 'worldcup'
        ? (() => { const nonZero = allValid.filter(o => o.value !== 0); return nonZero.length > 0 ? [nonZero[nonZero.length - 1]] : allValid })()
        : allValid
      if (t.latest_run_status === 'in_progress' && t.round_total !== undefined && t.round_total !== null) {
        setRoundValue(t.round_total)
      } else {
        const saved = Number(localStorage.getItem(`cup:roundValue:${t.id}`) ?? '')
        const savedValid = validOptions.some(o => o.value === saved)
        if (savedValid) {
          setRoundValue(saved)
        } else {
          const best = validOptions.find(o => o.value !== 0 && o.value >= (count as number))
            ?? validOptions.find(o => o.value !== 0)
            ?? validOptions[0]
          if (best) setRoundValue(best.value)
        }
      }
    })
  }, [t.id, t.latest_run_status, t.round_total, t.filter_json])

  useEffect(() => {
    if (t.latest_run_status === 'in_progress' && t.latest_run_id) {
      cupApi.runProgress(t.latest_run_id).then(setRunProgress)
    } else {
      setRunProgress(null)
    }
  }, [t.latest_run_id, t.latest_run_status])

  const validOptions = (() => {
    const allValid = ROUND_OPTIONS.filter(o => {
      if (o.value === 0) return t.format === 'tournament'
      if (t.format === 'worldcup') return itemCount >= o.value * 2
      if (t.format === 'league') return itemCount >= o.value * 2
      return o.value <= itemCount
    })
    if (t.format === 'worldcup') {
      const nonZero = allValid.filter(o => o.value !== 0)
      return nonZero.length > 0 ? [nonZero[nonZero.length - 1]] : allValid
    }
    return allValid
  })()

  const doStart = async (force = false) => {
    setStarting(true)
    try {
      const result = await cupApi.start(t.id, roundValue, force) as { run: CupRun }
      onPlay(result.run.id, 'match')
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setStarting(false)
    }
  }

  const handleClearRun = async () => {
    await cupApi.clearRun(t.id)
    onUpdate()
  }

  const handleStartClick = () => {
    if (t.latest_run_status === 'in_progress') {
      setShowInProgress(true)
    } else {
      doStart()
    }
  }

  const handleSaveName = async () => {
    if (!editName.trim()) return
    await cupApi.update({ id: t.id, name: editName.trim() })
    onUpdate()
    setShowEditName(false)
  }

  const runStatus = t.latest_run_status
  const hasRun = t.latest_run_id !== null

  return (
    <>
      <div className="relative cursor-pointer rounded-lg border border-gray-700 ring-2 ring-transparent hover:border-gray-500 flex flex-col">
        {/* 썸네일 */}
        <div className="relative rounded-t-lg overflow-hidden">
          <ImagePreview path={t.winner_photo ?? null} alt={t.name} className="w-full h-40" objectPosition="center 10%" />
          {/* 진행 상황 칩 */}
          {runStatus === 'in_progress' && (() => {
            const m = runProgress?.match
            let label = '진행중'
            if (m) {
              if (t.format === 'tournament') {
                label = `${roundLabel(m.round)} ${m.match_index + 1}/${Math.ceil(m.round / 2)}경기`
              } else if (t.format === 'league') {
                const gDone = runProgress?.groupMatchDone ?? 0
                const gTotal = runProgress?.groupMatchTotal ?? '?'
                const mDone = runProgress?.mainRoundDone ?? 0
                const mTotal = runProgress?.mainRoundTotal ?? Math.ceil(m.round / 2)
                if (m.phase === 'group') label = `${m.group_id}조 조별리그 — ${gDone + 1}/${gTotal}경기`
                else if (m.phase === 'tiebreak') label = `${m.group_id}조 동점처리 — ${gDone + 1}/${gTotal}경기`
                else label = `본선 ${roundLabel(m.round)} — ${mDone + 1}/${mTotal}경기`
              } else if (t.format === 'worldcup') {
                const gDone = runProgress?.groupMatchDone ?? 0
                const gTotal = runProgress?.groupMatchTotal ?? '?'
                const blkLabel = m.group_id != null ? String.fromCharCode(65 + Math.floor((m.group_id - 1) / 16)) : ''
                if (m.phase === 'group') label = `${blkLabel}블록 ${m.group_id}조 예선 — ${gDone + 1}/${gTotal}경기`
                else if (m.phase === 'tiebreak') label = `${blkLabel}블록 ${m.group_id}조 동점처리 — ${gDone + 1}/${gTotal}경기`
                else if (m.phase === 'main' && m.block_id != null) {
                  const rt = t.round_total ?? 0
                  const unit = t.type === 'actor' ? '인' : '작품'
                  const blk2 = String.fromCharCode(65 + m.block_id)
                  const roundStr = rt > 0 ? `${rt / (32 / m.round)}강(${m.round}${unit})` : `${m.round}강`
                  label = `${blk2}블록 본선 ${roundStr} — ${m.match_index + 1}/${m.round / 2}경기`
                } else label = `결승 라운드 ${m.match_index + 1}/${m.round / 2}경기`
              }
            }
            return (
              <span className="absolute top-1 left-1 px-1.5 py-0.5 text-xs rounded font-semibold text-green-300 bg-gray-900/80">
                {label}
              </span>
            )
          })()}
          {/* M / F / C / X 버튼 */}
          <div className="absolute bottom-1 right-1 flex gap-1">
            <button
              onClick={e => { e.stopPropagation(); setEditName(t.name); setShowEditName(true) }}
              className="w-6 h-6 rounded bg-gray-900/70 hover:bg-gray-700 text-white text-xs font-bold flex items-center justify-center"
            >M</button>
            {t.format !== 'worldcup' && (
              <button
                onClick={e => { e.stopPropagation(); setShowFilterModal(true) }}
                className={`w-6 h-6 rounded text-xs font-bold flex items-center justify-center ${
                  (t.is_master === 1 ? countActiveMasterFilters(cardFilter as MasterFilter) : countActiveFilters(cardFilter as WcFilter)) > 0
                    ? 'bg-blue-600 hover:bg-blue-500 text-white'
                    : 'bg-gray-900/70 hover:bg-gray-700 text-white'
                }`}
              >F</button>
            )}
            {t.latest_run_status === 'in_progress' && (
              <button
                onClick={e => { e.stopPropagation(); setClearConfirmInput(''); setShowClearConfirm(true) }}
                className="w-6 h-6 rounded bg-gray-900/70 hover:bg-blue-700 text-blue-400 hover:text-white text-xs font-bold flex items-center justify-center"
              >C</button>
            )}
            <button
              onClick={e => { e.stopPropagation(); setDelConfirmInput(''); setShowConfirmDel(true) }}
              className="w-6 h-6 rounded bg-gray-900/70 hover:bg-red-700 text-red-400 hover:text-white text-xs font-bold flex items-center justify-center"
            >X</button>
          </div>
        </div>

        {/* 정보 */}
        <div className="p-2 bg-gray-800 flex-1 flex flex-col gap-1">
          <p className="text-sm font-bold text-white truncate">{t.name}</p>

          <div className="flex items-center gap-1 flex-wrap">
            {t.is_master === 1 && (
              <span className="px-1.5 py-0.5 bg-yellow-900/60 text-yellow-300 text-xs rounded font-semibold">★</span>
            )}
            <span className={`px-1.5 py-0.5 text-xs rounded ${FORMAT_COLOR[t.format] ?? 'bg-gray-700 text-gray-300'}`}>
              {FORMAT_LABEL[t.format] ?? t.format}
            </span>
            <span className="px-1.5 py-0.5 text-xs rounded bg-gray-700 text-gray-300">
              {t.type === 'actor' ? '배우' : '작품'}
            </span>
          </div>


          <div className="flex flex-col gap-1 mt-auto pt-1">
            {/* 강수 selectbox: 진행중일 때만 disabled */}
            <select
              value={roundValue}
              onChange={e => { const v = Number(e.target.value); setRoundValue(v); localStorage.setItem(`cup:roundValue:${t.id}`, String(v)) }}
              className="w-full bg-gray-700 text-white text-xs px-2 py-1.5 rounded"
            >
              {validOptions.map(o => (
                <option key={o.value} value={o.value}>
                  {o.value === 0
                    ? `전체 (${itemCount}${t.type === 'actor' ? '명' : '작품'})`
                    : t.format === 'worldcup'
                      ? `${o.label} (${o.value / 2}조)`
                      : t.format === 'league'
                        ? `${o.label} (풀${calcPoolSize(itemCount, o.value * 2)}${t.type === 'actor' ? '명' : '작품'})`
                        : `${o.label} (풀${calcPoolSize(itemCount, o.value)}${t.type === 'actor' ? '명' : '작품'})`
                  }
                </option>
              ))}
            </select>
            {/* 대회시작 / 순위보기 / 통계보기 */}
            <div className="flex gap-1">
              <button
                onClick={handleStartClick}
                disabled={starting}
                className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs rounded font-semibold"
              >
                {starting ? '시작 중...' : '대회시작'}
              </button>
              <button
                onClick={() => onRankings(t.id)}
                disabled={!hasRun}
                className="flex-1 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-xs rounded"
              >
                순위보기
              </button>
              <button
                onClick={() => onStats(t.id)}
                disabled={!hasRun}
                className="flex-1 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-xs rounded"
              >
                통계보기
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 진행중 대회 모달 */}
      {showInProgress && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-[380px] shadow-2xl">
            <h2 className="text-base font-bold text-white mb-2">이미 진행 중인 대회가 있습니다</h2>
            <p className="text-sm text-gray-400 mb-6">이어하시겠습니까?</p>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowInProgress(false); onPlay(t.latest_run_id!, 'match') }}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-semibold"
              >예</button>
              <button
                onClick={() => { setShowInProgress(false); setDeleteConfirmInput(''); setShowDeleteConfirm(true) }}
                className="flex-1 py-2 bg-red-700 hover:bg-red-600 text-white rounded text-sm font-semibold"
              >아니오</button>
              <button
                onClick={() => setShowInProgress(false)}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
              >취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 새 런 시작 삭제 확인 모달 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-[380px] shadow-2xl">
            <h2 className="text-base font-bold text-white mb-2">진행하던 대회가 삭제됩니다</h2>
            <p className="text-sm text-gray-400 mb-3">정말 새로 시작하시겠습니까?</p>
            <p className="text-xs text-red-400 mb-2">확인하려면 아래에 <span className="font-bold">지금 삭제</span>를 입력하세요.</p>
            <input
              autoFocus
              className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500 mb-4"
              placeholder="지금 삭제"
              value={deleteConfirmInput}
              onChange={e => setDeleteConfirmInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && deleteConfirmInput === '지금 삭제') { setShowDeleteConfirm(false); doStart(true) } }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowDeleteConfirm(false); doStart(true) }}
                disabled={deleteConfirmInput !== '지금 삭제'}
                className="flex-1 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded text-sm font-semibold"
              >확인</button>
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmInput('') }}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
              >취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 대회명 수정 모달 */}
      {showEditName && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowEditName(false)}>
          <div className="bg-gray-800 rounded-xl p-6 w-[360px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold text-white mb-4">대회명 수정</h2>
            <input
              autoFocus
              className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 mb-4"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveName()}
            />
            <div className="flex gap-2">
              <button onClick={handleSaveName} disabled={!editName.trim()} className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded text-sm font-semibold">저장</button>
              <button onClick={() => setShowEditName(false)} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 confirm 모달 */}
      {showConfirmDel && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowConfirmDel(false)}>
          <div className="bg-gray-800 rounded-xl p-6 w-[380px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold text-white mb-2">대회 삭제</h2>
            <p className="text-sm text-gray-400 mb-3">「{t.name}」을 삭제하시겠습니까?<br />이 작업은 되돌릴 수 없습니다.</p>
            <p className="text-xs text-red-400 mb-2">확인하려면 아래에 <span className="font-bold">지금 삭제</span>를 입력하세요.</p>
            <input
              autoFocus
              className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500 mb-4"
              placeholder="지금 삭제"
              value={delConfirmInput}
              onChange={e => setDelConfirmInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && delConfirmInput === '지금 삭제') { setShowConfirmDel(false); onDelete() } }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowConfirmDel(false); onDelete() }}
                disabled={delConfirmInput !== '지금 삭제'}
                className="flex-1 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded text-sm font-semibold"
              >삭제</button>
              <button onClick={() => { setShowConfirmDel(false); setDelConfirmInput('') }} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">취소</button>
            </div>
          </div>
        </div>
      )}

      {/* C 버튼: 진행중 런 클리어 모달 */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowClearConfirm(false)}>
          <div className="bg-gray-800 rounded-xl p-6 w-[380px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold text-white mb-2">진행중 대회 데이터 삭제</h2>
            <p className="text-sm text-gray-400 mb-3">「{t.name}」의 진행중인 대회 데이터를 삭제합니다.<br />이 작업은 되돌릴 수 없습니다.</p>
            <p className="text-xs text-red-400 mb-2">확인하려면 아래에 <span className="font-bold">지금 삭제</span>를 입력하세요.</p>
            <input
              autoFocus
              className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500 mb-4"
              placeholder="지금 삭제"
              value={clearConfirmInput}
              onChange={e => setClearConfirmInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && clearConfirmInput === '지금 삭제') { setShowClearConfirm(false); handleClearRun() } }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowClearConfirm(false); handleClearRun() }}
                disabled={clearConfirmInput !== '지금 삭제'}
                className="flex-1 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded text-sm font-semibold"
              >확인</button>
              <button onClick={() => { setShowClearConfirm(false); setClearConfirmInput('') }} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 필터 모달 */}
      {showFilterModal && (t.is_master === 1 ? (
        <MasterFilterModal
          type={t.type}
          filter={cardFilter as MasterFilter}
          onSave={async f => {
            await cupApi.update({ id: t.id, filterJson: f })
            setCardFilter(f)
            setShowFilterModal(false)
            onUpdate()
          }}
          onClose={() => setShowFilterModal(false)}
        />
      ) : (
        <WorldcupFilterModal
          type={t.type}
          filter={cardFilter as WcFilter}
          onSave={async f => {
            await cupApi.update({ id: t.id, filterJson: f })
            setCardFilter(f)
            setShowFilterModal(false)
            onUpdate()
          }}
          onClose={() => setShowFilterModal(false)}
        />
      ))}
    </>
  )
}

// ── MatchCard ──────────────────────────────────────────────────────────────
function MatchCard({
  item, type, tournamentId, onClick, onNavigate, disabled, division, isMaster,
}: {
  item: ItemInfo
  type: 'actor' | 'work'
  tournamentId: number
  onClick: () => void
  onNavigate: () => void
  disabled: boolean
  division?: number
  isMaster?: boolean
}) {
  const imgPath = itemImagePath(item)
  const [stats, setStats] = useState<{ total_cups?: number; run_wins?: number; total_runs?: number; total_matches: number; match_wins: number; win_rate: number; match_win_rate: number; rank: number; total_points?: number } | null>(null)
  const [fileExists, setFileExists] = useState(false)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [showMemo, setShowMemo] = useState(false)
  const [memoText, setMemoText] = useState(item.comment ?? '')
  const [localComment, setLocalComment] = useState(item.comment ?? '')
  const [saving, setSaving] = useState(false)
  const [scores, setScores] = useState<ActorScores>({ face: 0, bust: 0, hip: 0, physical: 0, skin: 0, acting: 0, sexy: 0, charm: 0, technique: 0, proportions: 0 })
  const [scoreExcluded, setScoreExcluded] = useState(false)
  const [workRating, setWorkRating] = useState<number>(item.rating ?? 0)
  const [deletePending, setDeletePending] = useState(false)
  const demote = useScoreDemote()

  const handleScoreChange = async (key: keyof ActorScores, value: number) => {
    if (value >= 11) {
      const physData = await actorsApi.physicalData() as ActorScoreSnapshot[]
      const actorsAtTier = physData.filter(a => a.id !== item.id && (
        key === 'bust' ? a.score_bust : key === 'hip' ? a.score_hip : a[key as keyof ActorScoreSnapshot]
      ) === value)
      if ((actorsAtTier.length as number) >= SCORE_GRADE_LIMITS[value]) {
        demote.start(
          key,
          value,
          { id: item.id, name: item.name ?? `#${item.id}`, photo_path: item.photo_path ?? null },
          physData,
          async (changes: PendingDemotion[]) => {
            for (const change of changes) {
              const a = physData.find(x => x.id === change.actorId)!
              const updatedScores: ActorScores = {
                face: a.face, bust: a.score_bust, hip: a.score_hip,
                physical: a.physical, skin: a.skin, acting: a.acting,
                sexy: a.sexy, charm: a.charm, technique: a.technique, proportions: a.proportions,
                [change.field]: change.newScore,
              }
              await actorsApi.update(change.actorId, { scores: updatedScores })
            }
            setScores(prev => ({ ...prev, [key]: value }))
          }
        )
        return
      }
    }
    setScores(prev => ({ ...prev, [key]: value }))
  }

  useEffect(() => {
    setLocalComment(item.comment ?? '')
    setMemoText(item.comment ?? '')
    setWorkRating(item.rating ?? 0)
  }, [item.id])

  useEffect(() => {
    if (isMaster) {
      masterRankingApi.itemStats(type, item.id).then(s => setStats({ ...s, total_cups: s.total_cups, run_wins: s.cup_wins }))
    } else {
      cupApi.itemTournamentStats(tournamentId, item.id).then(s => setStats({ ...s, total_cups: s.total_runs, run_wins: s.run_wins }))
    }
  }, [tournamentId, item.id, isMaster, type])

  useEffect(() => {
    const first = item.files?.[0]
    if (!first) { setFileExists(false); return }
    if (first.type === 'url') { setFileExists(true); return }
    shellApi.fileExists(first.file_path).then(setFileExists)
  }, [item.files])

  const firstFile = item.files?.[0]

  const handlePlay = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!firstFile) return
    if (firstFile.type === 'url') shellApi.openExternal(firstFile.file_path)
    else shellApi.openPath(firstFile.file_path)
  }

  const handleOpenMemo = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (type === 'actor') {
      const actor = await actorsApi.get(item.id) as { comment?: string | null; scores?: ActorScores; score_excluded?: number; delete_pending?: number }
      setMemoText(actor.comment ?? '')
      setScores(actor.scores ?? { face: 0, bust: 0, hip: 0, physical: 0, skin: 0, acting: 0, sexy: 0, charm: 0, technique: 0, proportions: 0 })
      setScoreExcluded(!!(actor.score_excluded))
      setDeletePending(!!(actor.delete_pending))
    } else {
      const work = await worksApi.get(item.id) as { comment?: string | null; rating?: number; delete_pending?: number }
      setMemoText(work.comment ?? '')
      setWorkRating(work.rating ?? item.rating ?? 0)
      setDeletePending(!!(work.delete_pending))
    }
    setShowMemo(true)
  }

  const handleSaveMemo = async (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation()
    setSaving(true)
    try {
      if (type === 'actor') {
        await actorsApi.update(item.id, { comment: memoText, scores, score_excluded: scoreExcluded ? 1 : 0, delete_pending: deletePending ? 1 : 0 })
      } else {
        await worksApi.update(item.id, { comment: memoText, rating: workRating, delete_pending: deletePending ? 1 : 0 })
      }
      setLocalComment(memoText)
      setShowMemo(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col rounded-xl overflow-hidden border-[5px] border-gray-700 hover:border-blue-500 bg-gray-800 w-full transition-colors">
      {/* 썸네일 — 클릭 시 승리 선택 */}
      <button
        onClick={onClick}
        disabled={disabled}
        className={`relative overflow-hidden cursor-pointer disabled:cursor-not-allowed block w-full ${
          type === 'actor' ? 'aspect-square' : 'aspect-[800/540]'
        }`}
      >
        {imgPath
          ? <ImagePreview path={imgPath} alt="" className="w-full h-full object-cover" objectPosition="center 10%" />
          : <div className="w-full h-full bg-gray-700 flex items-center justify-center"><span className="text-gray-500 text-4xl">?</span></div>
        }
      </button>

      {/* 정보 섹션 */}
      <div
        className={`p-3 bg-gray-800 border-t border-gray-700 cursor-default overflow-hidden${type === 'work' ? ' h-[168px]' : ''}`}
        onMouseMove={e => setTooltip({ type, id: item.id, x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* 통계 행 */}
        {stats && (stats.total_cups ?? stats.total_runs ?? 0) > 0 ? (
          <p className="text-[0.85rem] text-gray-400 mb-1.5 text-center whitespace-nowrap flex items-center justify-center gap-1.5 flex-wrap">
            {division !== undefined && (
              <span className={`text-xs px-1.5 py-0.5 rounded border font-bold shrink-0 ${DIV_COLOR[division] ?? DIV_COLOR[0]}`}>
                {division === 0 ? '미지정' : `${division}부`}
              </span>
            )}
            {isMaster && stats.total_points !== undefined && (
              <span className="text-yellow-400 font-semibold">{Number(stats.total_points).toFixed(1)}pt</span>
            )}
            <span>
              {stats.rank}위&nbsp;&nbsp;
              우승률: {stats.win_rate}%({stats.run_wins ?? 0}/{stats.total_cups ?? stats.total_runs ?? 0})&nbsp;&nbsp;
              승률: {stats.match_win_rate}%({stats.match_wins}/{stats.total_matches})
            </span>
          </p>
        ) : (
          <p className="text-[0.85rem] text-gray-600 mb-1.5 text-center flex items-center justify-center gap-1.5">
            {division !== undefined && (
              <span className={`text-xs px-1.5 py-0.5 rounded border font-bold shrink-0 ${DIV_COLOR[division] ?? DIV_COLOR[0]}`}>
                {division === 0 ? '미지정' : `${division}부`}
              </span>
            )}
            <span>-</span>
          </p>
        )}
        {/* 이름 / 작품 정보 */}
        {type === 'actor' ? (
          <div className="flex items-center gap-1">
            <p
              className="flex-1 text-[1.47rem] font-bold text-white text-center truncate cursor-pointer hover:underline"
              onClick={onNavigate}
            >{item.name ?? '...'}</p>
            <button
              onClick={handleOpenMemo}
              className="shrink-0 w-7 h-7 rounded flex items-center justify-center cursor-pointer hover:border hover:border-gray-500 transition"
              title="코멘트 편집"
            >
              💬
            </button>
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-400 truncate">{item.product_number ?? ''}</p>
              <p
                className="text-base font-bold text-white mt-0.5 line-clamp-4 cursor-pointer hover:underline"
                onClick={onNavigate}
              >{item.title ?? item.product_number ?? '...'}</p>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              {firstFile && (
                <button
                  onClick={handlePlay}
                  disabled={!fileExists}
                  className={`w-8 h-8 rounded flex items-center justify-center transition ${fileExists ? 'bg-red-600 hover:bg-red-500' : 'bg-gray-600 opacity-50 cursor-not-allowed'}`}
                  title="재생"
                >
                  <span className="text-white text-sm">▶</span>
                </button>
              )}
              <button
                onClick={handleOpenMemo}
                className="w-8 h-8 rounded flex items-center justify-center cursor-pointer hover:border hover:border-gray-500 transition"
                title="코멘트 편집"
              >
                💬
              </button>
            </div>
          </div>
        )}
      </div>
      {tooltip && <CardTooltip tooltip={tooltip} />}

      {/* 코멘트 편집 모달 */}
      {showMemo && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-gray-800 rounded-xl p-5 w-[480px] shadow-2xl">
            <h2 className="text-sm font-bold text-white mb-3 truncate">
              {type === 'actor' ? item.name : (item.title ?? item.product_number ?? `#${item.id}`)}
            </h2>

            {/* 배우: 평점 세부항목 + 제외 체크박스 */}
            {type === 'actor' && (
              <>
                <div className="grid grid-cols-5 gap-1 mb-2">
                  {SCORE_FIELDS.map(({ key, label }) => (
                    <div key={key} className="flex flex-col gap-0.5">
                      <span className="text-xs text-gray-400 text-center truncate">{label}</span>
                      <select
                        value={scores[key]}
                        onChange={e => handleScoreChange(key, Number(e.target.value))}
                        className="bg-gray-700 text-white text-xs py-1 rounded text-center w-full"
                      >
                        {SCORE_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <label className="flex items-center gap-2 mb-3 cursor-pointer select-none w-fit">
                  <input
                    type="checkbox"
                    checked={scoreExcluded}
                    onChange={e => setScoreExcluded(e.target.checked)}
                    className="w-3.5 h-3.5 cursor-pointer"
                  />
                  <span className="text-xs text-gray-400">평점 제외</span>
                </label>
              </>
            )}

            {/* 작품: 별점 */}
            {type === 'work' && (
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs text-gray-400">별점</span>
                <Rating value={workRating} onChange={setWorkRating} />
                <span className="text-xs text-gray-400">{workRating}</span>
              </div>
            )}

            <textarea
              className="w-full bg-gray-900 text-white text-sm rounded p-2 resize-none border border-gray-600 focus:outline-none focus:border-blue-500"
              rows={4}
              value={memoText}
              onChange={e => setMemoText(e.target.value)}
              onKeyDown={e => { if (e.ctrlKey && e.key === 's') { e.preventDefault(); handleSaveMemo(e) } }}
              placeholder="코멘트를 입력하세요..."
              autoFocus
            />
            <label className="flex items-center gap-1.5 mt-2 cursor-pointer select-none w-fit">
              <input
                type="checkbox"
                checked={deletePending}
                onChange={e => setDeletePending(e.target.checked)}
                className="accent-red-500"
              />
              <span className="text-xs text-red-400">삭제예정</span>
            </label>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleSaveMemo}
                disabled={saving}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-sm font-semibold transition"
              >저장</button>
              <button
                onClick={() => setShowMemo(false)}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition"
              >취소</button>
            </div>
          </div>
        </div>
      )}
      {demote.step && demote.field && (
        <ScoreDemoteModal
          step={demote.step}
          field={demote.field}
          onSelect={demote.handleSelect}
          onCancel={demote.cancel}
        />
      )}
    </div>
  )
}

// ── PlayView ───────────────────────────────────────────────────────────────
function PlayView({
  tournamentId,
  runId: initialRunId,
  initialTab = 'match',
  onBack,
  onRankings,
  onNavigateToActor,
  onNavigateToWork,
}: {
  tournamentId: number
  runId?: number
  initialTab?: 'match' | 'standings'
  onBack: () => void
  onRankings: (id: number) => void
  onNavigateToActor: (id: number) => void
  onNavigateToWork: (id: number) => void
}) {
  const [tab, setTab] = useState<'match' | 'standings' | 'rank'>(initialTab)
  const [tournament, setTournament] = useState<CupTournament | null>(null)
  const [run, setRun] = useState<CupRun | null>(null)
  const [currentMatch, setCurrentMatch] = useState<CupMatch | null | 'done'>(null)
  const [progress, setProgress] = useState<{ total: number; done: number; groupDone: number | null; groupTotal: number | null; mainRoundDone: number | null; mainRoundTotal: number | null }>({ total: 0, done: 0, groupDone: null, groupTotal: null, mainRoundDone: null, mainRoundTotal: null })
  const [items, setItems] = useState<Map<number, ItemInfo>>(new Map())
  const [liveScores, setLiveScores] = useState<{ item_id: number; pts: number; rank: number }[]>([])
  const [divisionMap, setDivisionMap] = useState<Record<number, number>>({})
  const [standings, setStandings] = useState<{
    type: string
    standings?: StandingsRow[]
    matches?: CupMatch[]
    groupStandings?: { group_id: number; standings: StandingsRow[]; matches?: CupMatch[]; tiebreakMatches?: CupMatch[] }[]
    mainMatches?: CupMatch[]
    // worldcup 전용
    groupPhase?: {
      completed: boolean
      blocks: { block_id: number; label: string; groups: { group_id: number; standings: StandingsRow[]; matches: CupMatch[]; tiebreakMatches: CupMatch[] }[] }[]
    }
    blockTournaments?: { block_id: number; label: string; status: 'pending' | 'in_progress' | 'completed'; rounds: { round: number; matches: CupMatch[] }[] }[]
    finalRound?: { status: 'pending' | 'in_progress' | 'completed'; rounds: { round: number; matches: CupMatch[] }[] } | null
    divisionMap?: Record<number, number>
  } | null>(null)
  const [picking, setPicking] = useState<{ winnerId: number | null; loserId: number | null; fadeOut?: boolean } | null>(null)
  const [cardsVisible, setCardsVisible] = useState(true)
  const [hoveredCard, setHoveredCard] = useState<'item1' | 'item2' | 'draw' | null>(null)
  const [commentDraft, setCommentDraft] = useState('')
  const [commentSaved, setCommentSaved] = useState(false)
  const itemFetchQueue = useRef(new Set<number>())

  const fetchItemInfo = useCallback(async (id: number, type: 'actor' | 'work') => {
    if (items.has(id) || itemFetchQueue.current.has(id)) return
    itemFetchQueue.current.add(id)
    try {
      const data = type === 'actor'
        ? await actorsApi.get(id) as ItemInfo
        : await worksApi.get(id) as ItemInfo
      if (data) setItems(prev => new Map(prev).set(id, data))
    } catch { /* ignore */ }
  }, [items])

  const load = useCallback(async () => {
    const result = await cupApi.get(tournamentId) as {
      tournament: CupTournament; run: CupRun | null; currentMatch: CupMatch | null
      totalMatches: number; completedMatches: number; divisionMap?: Record<number, number>
    } | null
    if (!result) return
    setTournament(result.tournament)
    setRun(result.run)
    if (result.divisionMap) setDivisionMap(result.divisionMap)
    setProgress({ total: result.totalMatches, done: result.completedMatches, groupDone: (result as any).groupMatchDone ?? null, groupTotal: (result as any).groupMatchTotal ?? null, mainRoundDone: (result as any).mainRoundDone ?? null, mainRoundTotal: (result as any).mainRoundTotal ?? null })
    const cm = result.currentMatch
    const runStatus = result.run?.status
    const isDone = runStatus === 'completed' || cm === null
    setCurrentMatch(isDone ? 'done' : cm)
    if (isDone) setTab('match')
    if (cm) {
      fetchItemInfo(cm.item1_id, result.tournament.type)
      if (cm.item2_id) fetchItemInfo(cm.item2_id, result.tournament.type)
    }
    if (result.run?.winner_id) {
      fetchItemInfo(result.run.winner_id, result.tournament.type)
    }
    if (result.run?.status === 'completed' && result.run?.winner_id) {
      const type = result.tournament.type
      const wid = result.run.winner_id
      if (type === 'actor') {
        actorsApi.get(wid).then((a: any) => { setCommentDraft(a?.comment ?? ''); setCommentSaved(false) })
      } else {
        worksApi.get(wid).then((w: any) => { setCommentDraft(w?.comment ?? ''); setCommentSaved(false) })
      }
    }
  }, [tournamentId, fetchItemInfo])

  const loadStandings = useCallback(async () => {
    const runId = run?.id
    if (!runId) return
    const s = await cupApi.standings(runId) as typeof standings & { divisionMap?: Record<number, number> }
    setStandings(s)
    if (s?.divisionMap) setDivisionMap(prev => ({ ...prev, ...s.divisionMap }))
    if (s && tournament) {
      const ids = new Set<number>()
      s.standings?.forEach(r => ids.add(r.item_id))
      s.matches?.forEach(m => { ids.add(m.item1_id); if (m.item2_id) ids.add(m.item2_id) })
      s.groupStandings?.forEach(g => {
        g.standings.forEach(r => ids.add(r.item_id))
        g.matches?.forEach(m => { ids.add(m.item1_id); if (m.item2_id) ids.add(m.item2_id) })
        g.tiebreakMatches?.forEach(m => { ids.add(m.item1_id); if (m.item2_id) ids.add(m.item2_id) })
      })
      s.mainMatches?.forEach(m => { ids.add(m.item1_id); if (m.item2_id) ids.add(m.item2_id) })
      // worldcup 신규 구조
      s.groupPhase?.blocks.forEach(b => b.groups.forEach(g => {
        g.standings.forEach(r => ids.add(r.item_id))
        g.matches?.forEach(m => { ids.add(m.item1_id); if (m.item2_id) ids.add(m.item2_id) })
        g.tiebreakMatches?.forEach(m => { ids.add(m.item1_id); if (m.item2_id) ids.add(m.item2_id) })
      }))
      s.blockTournaments?.forEach(bt => bt.rounds.forEach(r => r.matches.forEach(m => { ids.add(m.item1_id); if (m.item2_id) ids.add(m.item2_id) })))
      s.finalRound?.rounds.forEach(r => r.matches.forEach(m => { ids.add(m.item1_id); if (m.item2_id) ids.add(m.item2_id) }))
      for (const id of ids) fetchItemInfo(id, tournament.type)
    }
  }, [run?.id, tournament, fetchItemInfo])

  const loadLiveScores = useCallback(async () => {
    const runId = run?.id
    if (!runId || !tournament) return
    const scores = await cupApi.runLiveScores(runId)
    setLiveScores(scores)
    for (const s of scores) fetchItemInfo(s.item_id, tournament.type)
  }, [run?.id, tournament, fetchItemInfo])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (tab === 'standings') loadStandings() }, [tab, loadStandings])
  useEffect(() => { if (tab === 'rank') loadLiveScores() }, [tab, loadLiveScores])

  const doPickApi = async (matchId: number, winnerId: number | null, isDraw = false) => {
    try {
      const next = await cupApi.pick(matchId, winnerId, isDraw) as CupMatch | { done: boolean }
      setProgress(p => ({ ...p, done: p.done + 1 }))
      if ('done' in next && next.done) {
        setCurrentMatch('done')
        load()
        if (tab === 'rank') loadLiveScores()
      } else {
        const m = next as CupMatch
        setCurrentMatch(m)
        if (tournament) {
          fetchItemInfo(m.item1_id, tournament.type)
          if (m.item2_id) fetchItemInfo(m.item2_id, tournament.type)
        }
        if (m.phase === 'group' || m.phase === 'tiebreak') {
          if (run) {
            cupApi.runProgress(run.id).then(prog => {
              setProgress(p => ({ ...p, groupDone: prog.groupMatchDone ?? null, groupTotal: prog.groupMatchTotal ?? null, mainRoundDone: null, mainRoundTotal: null }))
            })
          }
        } else if (m.phase === 'main') {
          if (run) {
            cupApi.runProgress(run.id).then(prog => {
              setProgress(p => ({ ...p, groupDone: null, groupTotal: null, mainRoundDone: prog.mainRoundDone ?? null, mainRoundTotal: prog.mainRoundTotal ?? null }))
            })
          }
        } else {
          setProgress(p => ({ ...p, groupDone: null, groupTotal: null, mainRoundDone: null, mainRoundTotal: null }))
        }
        if (tab === 'rank') loadLiveScores()
      }
    } catch (e) {
      alert((e as Error).message)
    }
  }

  const handlePick = async (winnerId: number | null, loserId: number | null = null, isDraw = false) => {
    if (!currentMatch || currentMatch === 'done' || picking) return
    const match = currentMatch as CupMatch
    setPicking({ winnerId, loserId })
    await new Promise(r => setTimeout(r, 300))         // 패자 축소
    await new Promise(r => setTimeout(r, 150))         // 가운데 정지
    setPicking({ winnerId, loserId, fadeOut: true })
    await new Promise(r => setTimeout(r, 200))         // 승자 페이드아웃
    setCardsVisible(false)
    await doPickApi(match.id, winnerId, isDraw)        // 새 매치 로드
    await new Promise(r => setTimeout(r, 50))          // 렌더 대기
    setPicking(null)
    await new Promise(r => setTimeout(r, 16))          // picking 리셋 렌더 확정 후 트랜지션 시작
    setCardsVisible(true)
  }

  const item1 = currentMatch && currentMatch !== 'done' ? items.get((currentMatch as CupMatch).item1_id) : null
  const item2 = currentMatch && currentMatch !== 'done' ? (items.get((currentMatch as CupMatch).item2_id!) ?? null) : null
  const match = currentMatch !== 'done' && currentMatch ? currentMatch as CupMatch : null

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || tab !== 'match' || picking || !match) return
      if (hoveredCard === 'item1') handlePick(match.item1_id, match.item2_id ?? null)
      else if (hoveredCard === 'item2' && match.item2_id != null) handlePick(match.item2_id, match.item1_id)
      else if (hoveredCard === 'draw' && match.phase === 'group') handlePick(null, null, true)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [tab, picking, match, hoveredCard])
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  const winnerItem = run?.winner_id ? items.get(run.winner_id) : null
  const runStatus = run?.status ?? null

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 상단 바 */}
      <div className="shrink-0 border-b border-gray-700/50">
        <div className="p-4 pb-3">
          <div className="flex items-center gap-3">
            {/* 대회명 */}
            {tournament && (
                <div className="flex items-center gap-1.5 shrink-0">
                  {tournament.is_master === 1 && <span className="text-yellow-400 text-xs font-semibold">★</span>}
                  <span className="text-white text-sm font-semibold">{tournament.name}</span>
                </div>
            )}

            {/* 탭 */}
            <div className="ml-auto flex items-center gap-1 bg-gray-800 rounded-lg px-2 py-1 shrink-0">
              {(['match', 'standings', 'rank'] as const).map(key => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`px-3 py-1 rounded text-xs font-medium transition ${tab === key ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  {key === 'match' ? '매치' : key === 'standings' ? '현황' : '순위'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'match' && (
          <div className="flex flex-col items-center justify-center min-h-full py-8 px-4">
            {!tournament && <p className="text-gray-500">로딩 중...</p>}

            {tournament && currentMatch === 'done' && (
              <div className="flex flex-col items-center gap-6">
                {runStatus === 'completed' ? (
                  <>
                    <p className="text-yellow-400 font-bold text-xl">🏆 우승!</p>
                    {winnerItem && (
                      <>
                        <div
                          className="cursor-pointer"
                          onClick={() => tournament.type === 'actor' ? onNavigateToActor(winnerItem.id) : onNavigateToWork(winnerItem.id)}
                        >
                          <ImagePreview
                            path={itemImagePath(winnerItem)}
                            alt={itemLabel(winnerItem)}
                            className={`h-64 rounded-xl border-2 border-yellow-500 hover:border-yellow-400 transition ${tournament.type === 'actor' ? 'w-64' : 'w-[379px]'}`}
                            objectPosition="center 10%"
                          />
                        </div>
                        <p className="text-white font-bold text-lg">{itemLabel(winnerItem)}</p>
                        <div className="w-full max-w-2xl flex flex-col gap-2">
                          <p className="text-gray-400 text-sm">코멘트 편집</p>
                          <textarea
                            value={commentDraft}
                            onChange={e => { setCommentDraft(e.target.value); setCommentSaved(false) }}
                            rows={4}
                            className="w-full bg-gray-800 text-white text-sm rounded-lg border border-gray-600 p-3 resize-none focus:outline-none focus:border-blue-500"
                          />
                          <button
                            onClick={async () => {
                              if (tournament.type === 'actor') await actorsApi.update(winnerItem.id, { comment: commentDraft })
                              else await worksApi.update(winnerItem.id, { comment: commentDraft })
                              setCommentSaved(true)
                            }}
                            className="self-end bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-1.5 rounded"
                          >
                            {commentSaved ? '저장됨 ✓' : '저장'}
                          </button>
                        </div>
                      </>
                    )}
                    <button
                      onClick={() => onRankings(tournamentId)}
                      className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm"
                    >
                      순위 보기
                    </button>
                  </>
                ) : (
                  <p className="text-gray-400">처리 중...</p>
                )}
              </div>
            )}

            {tournament && match && (
              <div className="w-full">
                {/* 라운드/진행 정보 */}
                <div className="text-center mb-6">
                  {match.item2_id === null && (
                    <p className="text-gray-400 text-sm mb-1">부전승 — 클릭하여 다음 라운드로 진출</p>
                  )}
                  {tournament.format === 'tournament' && (
                    <p className="text-yellow-400 font-bold text-lg">
                      {roundLabel(match.round)} — {match.match_index + 1}/{Math.ceil(match.round / 2)}경기
                    </p>
                  )}
                  {tournament.format === 'league' && (
                    <p className={`font-bold text-lg ${match.phase === 'main' ? 'text-yellow-400' : match.phase === 'tiebreak' ? 'text-orange-400' : 'text-green-400'}`}>
                      {match.phase === 'group'
                        ? `${match.group_id}조 조별리그 — ${(progress.groupDone ?? 0) + 1}/${progress.groupTotal ?? '?'}경기`
                        : match.phase === 'tiebreak'
                          ? `${match.group_id}조 동점처리 — ${(progress.groupDone ?? 0) + 1}/${progress.groupTotal ?? '?'}경기`
                          : `본선 ${roundLabel(match.round)} — ${(progress.mainRoundDone ?? 0) + 1}/${progress.mainRoundTotal ?? Math.ceil(match.round / 2)}경기`
                      }
                    </p>
                  )}
                  {tournament.format === 'worldcup' && (() => {
                    const blkLabel = match.group_id != null ? String.fromCharCode(65 + Math.floor((match.group_id - 1) / 16)) : ''
                    const rt = tournament.round_total ?? 0
                    const unit = tournament.type === 'actor' ? '인' : '작품'
                    return (
                      <p className={`font-bold text-lg ${match.phase === 'group' || match.phase === 'tiebreak' ? 'text-purple-400' : 'text-yellow-400'}`}>
                        {match.phase === 'group'
                          ? `${blkLabel}블록 ${match.group_id}조 예선 — ${(progress.groupDone ?? 0) + 1}/${progress.groupTotal ?? '?'}경기`
                          : match.phase === 'tiebreak'
                            ? `${blkLabel}블록 ${match.group_id}조 동점처리 — ${(progress.groupDone ?? 0) + 1}/${progress.groupTotal ?? '?'}경기`
                            : match.block_id != null
                              ? (() => {
                                  const blk2 = String.fromCharCode(65 + match.block_id)
                                  const roundStr = rt > 0 ? `${rt / (32 / match.round)}강(${match.round}${unit})` : `${match.round}강`
                                  return `${blk2}블록 본선 ${roundStr} — ${match.match_index + 1}/${match.round / 2}경기`
                                })()
                              : `결승 라운드 — ${match.match_index + 1}/${match.round / 2}경기`
                        }
                      </p>
                    )
                  })()}
                </div>

                {/* 매치 카드 */}
                <div className={`flex gap-6 justify-center items-center transition-opacity duration-300 ${cardsVisible ? 'opacity-100' : 'opacity-0'}`}>
                  {/* 카드 1 */}
                  <div
                    className={`overflow-hidden shrink-0 ${cardsVisible ? 'transition-all duration-300' : 'transition-none'} ${
                      picking?.loserId === match.item1_id ? 'w-0 opacity-0'
                      : picking?.fadeOut && picking?.winnerId === match.item1_id ? 'w-[40%] opacity-0'
                      : 'w-[40%] opacity-100'
                    }`}
                    onMouseEnter={() => setHoveredCard('item1')}
                    onMouseLeave={() => setHoveredCard(null)}
                  >
                    {item1
                      ? <MatchCard item={item1} type={tournament.type} tournamentId={tournament.id} onClick={() => handlePick(match.item1_id, match.item2_id ?? null)} onNavigate={() => tournament.type === 'actor' ? onNavigateToActor(item1.id) : onNavigateToWork(item1.id)} disabled={!!picking} division={tournament.is_master ? (divisionMap[match.item1_id] ?? 0) : undefined} isMaster={!!tournament.is_master} />
                      : <div className="h-64 bg-gray-800 rounded-xl flex items-center justify-center text-gray-500">로딩 중...</div>
                    }
                  </div>

                  {/* VS / 무승부 (부전승이면 숨김) */}
                  {match.item2_id !== null && (
                    <div className={`flex flex-col items-center gap-2 shrink-0 overflow-hidden ${cardsVisible ? 'transition-all duration-300' : 'transition-none'} ${picking ? 'w-0 opacity-0' : 'w-16 opacity-100'}`}>
                      <span className="text-gray-500 font-bold text-xl">VS</span>
                      {match.phase === 'group' && (
                        <button
                          onClick={() => handlePick(null, null, true)}
                          disabled={!!picking}
                          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-gray-300 rounded-lg text-xs whitespace-nowrap"
                          onMouseEnter={() => setHoveredCard('draw')}
                          onMouseLeave={() => setHoveredCard(null)}
                        >
                          무승부
                        </button>
                      )}
                    </div>
                  )}

                  {/* 카드 2 (부전승이면 표시 안 함) */}
                  {match.item2_id !== null && (
                    <div
                      className={`overflow-hidden shrink-0 ${cardsVisible ? 'transition-all duration-300' : 'transition-none'} ${
                        picking?.loserId === match.item2_id ? 'w-0 opacity-0'
                        : picking?.fadeOut && picking?.winnerId === match.item2_id ? 'w-[40%] opacity-0'
                        : 'w-[40%] opacity-100'
                      }`}
                      onMouseEnter={() => setHoveredCard('item2')}
                      onMouseLeave={() => setHoveredCard(null)}
                    >
                      {item2
                        ? <MatchCard item={item2} type={tournament.type} tournamentId={tournament.id} onClick={() => handlePick(match.item2_id!, match.item1_id)} onNavigate={() => tournament.type === 'actor' ? onNavigateToActor(item2.id) : onNavigateToWork(item2.id)} disabled={!!picking} division={tournament.is_master ? (divisionMap[match.item2_id!] ?? 0) : undefined} isMaster={!!tournament.is_master} />
                        : <div className="h-64 bg-gray-800 rounded-xl flex items-center justify-center text-gray-500">로딩 중...</div>
                      }
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'standings' && (
          <div className="p-4 space-y-4">
            {!standings && <p className="text-gray-500 text-center py-8">로딩 중...</p>}

            {/* ── 리그전 현황 ── */}
            {standings?.type === 'league' && (
              <div className="space-y-6">
                {/* 본선 토너먼트 — 조별리그 완료 후 위로 */}
                {standings.mainMatches && standings.mainMatches.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">본선 토너먼트</h3>
                    <div className="space-y-3">
                      {Object.entries(
                        (standings.mainMatches as CupMatch[]).reduce<Record<string, CupMatch[]>>((acc, m) => {
                          const key = String(m.round)
                          if (!acc[key]) acc[key] = []
                          acc[key].push(m)
                          return acc
                        }, {})
                      )
                      .sort(([a], [b]) => Number(a) - Number(b))
                      .map(([round, roundMatches]) => (
                        <div key={round} className="bg-gray-800 rounded-xl overflow-hidden">
                          <div className="px-4 py-2 border-b border-gray-700 bg-gray-700/40">
                            <span className="text-xs font-semibold text-yellow-400">{roundLabel(Number(round))}</span>
                          </div>
                          <div className="divide-y divide-gray-700/50">
                            {(roundMatches as CupMatch[]).map(m => {
                              const i1 = items.get(m.item1_id)
                              const i2 = m.item2_id ? items.get(m.item2_id) : null
                              return (
                                <div key={m.id} className="px-4 py-2 flex items-center gap-2 text-sm">
                                  <span className={`flex-1 text-right truncate ${m.winner_id === m.item1_id ? 'text-white font-semibold' : m.winner_id !== null ? 'text-gray-500 line-through' : 'text-gray-300'}`}>
                                    {i1 ? itemLabel(i1) : `#${m.item1_id}`}
                                  </span>
                                  <span className="text-gray-600 text-xs w-6 text-center shrink-0">vs</span>
                                  <span className={`flex-1 truncate ${m.winner_id === m.item2_id ? 'text-white font-semibold' : m.winner_id !== null ? 'text-gray-500 line-through' : 'text-gray-300'}`}>
                                    {i2 ? itemLabel(i2) : m.item2_id ? `#${m.item2_id}` : '-'}
                                  </span>
                                  {m.winner_id === null && <span className="text-gray-600 text-xs shrink-0">대기 중</span>}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 조별 순위표 */}
                {standings.groupStandings && standings.groupStandings.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">조별 리그</h3>
                    <div className="grid grid-cols-4 gap-3">
                      {[...standings.groupStandings].sort((a, b) => {
                        const activeGroupId = (currentMatch !== 'done' && currentMatch != null && (currentMatch.phase === 'group' || currentMatch.phase === 'tiebreak')) ? currentMatch.group_id : null
                        if (activeGroupId !== null) {
                          if (a.group_id === activeGroupId) return -1
                          if (b.group_id === activeGroupId) return 1
                        }
                        return a.group_id - b.group_id
                      }).map(({ group_id, standings: gs, matches: gms, tiebreakMatches: tbms }) => {
                        const groupDone = gms && gms.length > 0 && gms.every(m => m.winner_id !== null || m.is_draw) && (!tbms || tbms.length === 0 || tbms.every(m => m.winner_id !== null || m.is_draw))
                        const groupActive = !groupDone && (currentMatch !== 'done') && currentMatch != null && currentMatch.group_id === group_id && (currentMatch.phase === 'group' || currentMatch.phase === 'tiebreak')
                        return (
                        <div key={group_id} className="bg-gray-800 rounded-xl overflow-hidden">
                          <div className="px-3 py-1.5 border-b border-gray-700 bg-gray-700/40 flex items-center gap-2">
                            <span className="text-xs font-semibold text-white">{group_id}조</span>
                            {groupDone && <span className="text-xs text-red-400">종료됨</span>}
                            {groupActive && <span className="text-xs text-green-400">진행중</span>}
                          </div>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-gray-700/50 text-gray-500">
                                <th className="px-3 py-1 text-left w-6">#</th>
                                {tournament.is_master ? <th className="px-1 py-1 text-center w-8">리그</th> : null}
                                <th className="px-3 py-1 text-left">이름</th>
                                <th className="px-1 py-1 text-center w-5">승</th>
                                <th className="px-1 py-1 text-center w-5">무</th>
                                <th className="px-1 py-1 text-center w-5">패</th>
                                <th className="px-1 py-1 text-center w-5 font-bold">점</th>
                              </tr>
                            </thead>
                            <tbody>
                              {gs.map((row, idx) => {
                                const item = items.get(row.item_id)
                                const div = divisionMap[row.item_id] ?? 0
                                return (
                                  <tr key={row.item_id} className={`border-b border-gray-700/30 ${idx < 2 ? 'bg-green-900/10' : ''}`}>
                                    <td className="px-3 py-1.5 text-gray-500">{idx + 1}</td>
                                    {tournament.is_master ? (
                                      <td className={`px-1 py-1.5 text-center text-xs font-bold ${DIV_TEXT_COLOR[div] ?? DIV_TEXT_COLOR[0]}`}>
                                        {div === 0 ? '미' : `${div}부`}
                                      </td>
                                    ) : null}
                                    <td className="px-3 py-1.5 text-white truncate max-w-[80px]">
                                      {item ? itemLabel(item) : `#${row.item_id}`}
                                      {idx < 2 && <span className="ml-1 text-green-400 text-xs">↑</span>}
                                    </td>
                                    <td className="px-1 py-1.5 text-center text-green-400">{row.w}</td>
                                    <td className="px-1 py-1.5 text-center text-gray-400">{row.d}</td>
                                    <td className="px-1 py-1.5 text-center text-red-400">{row.l}</td>
                                    <td className="px-1 py-1.5 text-center text-white font-bold">{row.pts}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                          {/* 조별 매치 */}
                          {gms && gms.length > 0 && (
                            <div className="border-t border-gray-700/50 divide-y divide-gray-700/30 max-h-40 overflow-y-auto">
                              {gms.map(m => {
                                const i1 = items.get(m.item1_id)
                                const i2 = m.item2_id ? items.get(m.item2_id) : null
                                const done = m.winner_id !== null
                                return (
                                  <div key={m.id} className={`px-2 py-1 flex items-center gap-1 text-xs ${done ? '' : 'opacity-40'}`}>
                                    <span className={`flex-1 text-right truncate ${m.winner_id === m.item1_id ? 'text-white font-semibold' : 'text-gray-400'}`}>
                                      {i1 ? itemLabel(i1) : `#${m.item1_id}`}
                                    </span>
                                    <span className="text-gray-600 w-4 text-center shrink-0">
                                      {m.winner_id ? (m.winner_id === m.item1_id ? '>' : '<') : 'vs'}
                                    </span>
                                    <span className={`flex-1 truncate ${m.winner_id === m.item2_id ? 'text-white font-semibold' : 'text-gray-400'}`}>
                                      {i2 ? itemLabel(i2) : m.item2_id ? `#${m.item2_id}` : '-'}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                          {/* 동점처리 매치 */}
                          {tbms && tbms.length > 0 && (
                            <div className="border-t border-orange-800/40">
                              <div className="px-2 py-0.5 bg-orange-900/20">
                                <span className="text-xs text-orange-400 font-semibold">동점처리</span>
                              </div>
                              <div className="divide-y divide-gray-700/30">
                                {tbms.map(m => {
                                  const i1 = items.get(m.item1_id)
                                  const i2 = m.item2_id ? items.get(m.item2_id) : null
                                  const done = m.winner_id !== null
                                  return (
                                    <div key={m.id} className={`px-2 py-1 flex items-center gap-1 text-xs ${done ? '' : 'opacity-40'}`}>
                                      <span className={`flex-1 text-right truncate ${m.winner_id === m.item1_id ? 'text-white font-semibold' : 'text-gray-400'}`}>
                                        {i1 ? itemLabel(i1) : `#${m.item1_id}`}
                                      </span>
                                      <span className="text-gray-600 w-4 text-center shrink-0">
                                        {m.winner_id ? (m.winner_id === m.item1_id ? '>' : '<') : 'vs'}
                                      </span>
                                      <span className={`flex-1 truncate ${m.winner_id === m.item2_id ? 'text-white font-semibold' : 'text-gray-400'}`}>
                                        {i2 ? itemLabel(i2) : m.item2_id ? `#${m.item2_id}` : '-'}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                        )
                      })}
                    </div>
                  </div>
                )}

              </div>
            )}

            {/* ── 토너먼트 대진표 ── */}
            {standings?.type === 'tournament' && standings.matches && (
              <div className="space-y-3">
                {Object.entries(
                  (standings.matches as CupMatch[]).reduce<Record<string, CupMatch[]>>((acc, m) => {
                    const key = String(m.round)
                    if (!acc[key]) acc[key] = []
                    acc[key].push(m)
                    return acc
                  }, {})
                )
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([round, roundMatches]) => (
                  <div key={round} className="bg-gray-800 rounded-xl overflow-hidden">
                    <div className="px-4 py-2 border-b border-gray-700 bg-gray-700/40">
                      <span className="text-xs font-semibold text-yellow-400">{roundLabel(Number(round))}</span>
                    </div>
                    <div className="divide-y divide-gray-700/50">
                      {(roundMatches as CupMatch[]).map(m => {
                        const i1 = items.get(m.item1_id)
                        const i2 = m.item2_id ? items.get(m.item2_id) : null
                        return (
                          <div key={m.id} className="px-4 py-2 flex items-center gap-2 text-sm">
                            <span className={`flex-1 text-right truncate ${m.winner_id === m.item1_id ? 'text-white font-semibold' : m.winner_id !== null ? 'text-gray-500 line-through' : 'text-gray-300'}`}>
                              {i1 ? itemLabel(i1) : `#${m.item1_id}`}
                            </span>
                            <span className="text-gray-600 text-xs w-6 text-center shrink-0">
                              {m.winner_id ? 'vs' : 'vs'}
                            </span>
                            <span className={`flex-1 truncate ${m.winner_id === m.item2_id ? 'text-white font-semibold' : m.winner_id !== null ? 'text-gray-500 line-through' : 'text-gray-300'}`}>
                              {i2 ? itemLabel(i2) : m.item2_id ? `#${m.item2_id}` : '-'}
                            </span>
                            {m.winner_id === null && (
                              <span className="text-gray-600 text-xs shrink-0">대기 중</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── 월드컵 현황 ── */}
            {standings?.type === 'worldcup' && (() => {
              const activeGroupId = (currentMatch !== 'done' && currentMatch != null && (currentMatch.phase === 'group' || currentMatch.phase === 'tiebreak')) ? currentMatch.group_id : null
              const activeBlockId = (currentMatch !== 'done' && currentMatch != null && currentMatch.phase === 'main' && currentMatch.block_id != null) ? currentMatch.block_id : null

              // 블록 토너먼트 / 결승 라운드 + 조별 예선 (항상 하단)
              const roundTotal = run?.round_total ?? 0
              const itemType = tournament?.type ?? 'actor'
              const SLOT_H = 28
              const TOTAL_SLOTS = 32

              // item_id → { group_id, rank, division } 맵
              const divisionMap = standings.divisionMap ?? {}
              const itemOriginMap = new Map<number, { group_id: number; rank: number }>()
              standings.groupPhase?.blocks.forEach(b => b.groups.forEach(g => {
                const gqs = (g as any).qualifiers as number[] | null | undefined
                g.standings.forEach((row, idx) => {
                  const qIdx = gqs ? gqs.indexOf(row.item_id) : -1
                  itemOriginMap.set(row.item_id, { group_id: g.group_id, rank: qIdx !== -1 ? qIdx + 1 : idx + 1 })
                })
              }))
              const DIV_TEXT: Record<number, string> = {
                1: 'text-yellow-300', 2: 'text-orange-300', 3: 'text-blue-300',
                4: 'text-green-300', 5: 'text-purple-300', 6: 'text-gray-400', 0: 'text-gray-500'
              }
              const originLabel = (itemId: number) => {
                const origin = itemOriginMap.get(itemId)
                const div = divisionMap[itemId] ?? 0
                const divText = div === 0 ? '미지정' : `${div}부`
                if (!origin) return null
                return { text: `${divText}/${origin.group_id}조/${origin.rank}위`, color: DIV_TEXT[div] ?? 'text-gray-500' }
              }

              const sortedBlocks = [...(standings.blockTournaments ?? [])].sort((a, b) => {
                if (a.status === 'in_progress' && b.status !== 'in_progress') return -1
                if (b.status === 'in_progress' && a.status !== 'in_progress') return 1
                return a.block_id - b.block_id
              })

              const groupPhaseEl = standings.groupPhase ? (
                <div className={standings.groupPhase.completed ? 'border-t border-gray-700/50 pt-4 space-y-6' : 'space-y-6'}>
                  {standings.groupPhase.completed && (
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">조별 예선 결과</h3>
                  )}
                  {[...standings.groupPhase.blocks].sort((a, b) => {
                    if (activeGroupId !== null) {
                      const aHas = a.groups.some(g => g.group_id === activeGroupId)
                      const bHas = b.groups.some(g => g.group_id === activeGroupId)
                      if (aHas && !bHas) return -1
                      if (bHas && !aHas) return 1
                    }
                    return a.block_id - b.block_id
                  }).map(block => (
                    <div key={block.block_id}>
                      <h3 className="text-xs font-semibold text-purple-400 mb-2 uppercase tracking-wide">블록 {block.label}</h3>
                      <div className="grid grid-cols-4 gap-3">
                        {[...block.groups].sort((a, b) => {
                          if (activeGroupId !== null) {
                            if (a.group_id === activeGroupId) return -1
                            if (b.group_id === activeGroupId) return 1
                          }
                          return a.group_id - b.group_id
                        }).map(({ group_id, standings: gs, matches: gms, tiebreakMatches: tbms, qualifiers: gqs }) => {
                          const groupDone = gms && gms.length > 0 && gms.every(m => m.winner_id !== null || m.is_draw) && (!tbms || tbms.length === 0 || tbms.every(m => m.winner_id !== null || m.is_draw))
                          const groupActive = !groupDone && activeGroupId === group_id
                          return (
                            <div key={group_id} className="bg-gray-800 rounded-xl overflow-hidden">
                              <div className="px-3 py-1.5 border-b border-gray-700 bg-gray-700/40 flex items-center gap-2">
                                <span className="text-xs font-semibold text-white">{group_id}조</span>
                                {groupDone && <span className="text-xs text-red-400">종료됨</span>}
                                {groupActive && <span className="text-xs text-green-400 animate-pulse">진행중</span>}
                              </div>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-gray-700/50 text-gray-500">
                                    <th className="px-3 py-1 text-left w-6">#</th>
                                    {tournament.is_master ? <th className="px-1 py-1 text-center w-8">리그</th> : null}
                                    <th className="px-3 py-1 text-left">이름</th>
                                    <th className="px-1 py-1 text-center w-5">승</th>
                                    <th className="px-1 py-1 text-center w-5">무</th>
                                    <th className="px-1 py-1 text-center w-5">패</th>
                                    <th className="px-1 py-1 text-center w-5 font-bold">점</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {gs.map((row, idx) => {
                                    const item = items.get(row.item_id)
                                    const div = divisionMap[row.item_id] ?? 0
                                    return (
                                      <tr key={row.item_id} className={`border-b border-gray-700/30 ${(gqs ? gqs.includes(row.item_id) : idx < 2) ? 'bg-purple-900/10' : ''}`}>
                                        <td className="px-3 py-1.5 text-gray-500">{gs.findIndex(s => s.pts === row.pts && s.w === row.w) + 1}</td>
                                        {tournament.is_master ? (
                                          <td className={`px-1 py-1.5 text-center text-xs font-bold ${DIV_TEXT_COLOR[div] ?? DIV_TEXT_COLOR[0]}`}>
                                            {div === 0 ? '미' : `${div}부`}
                                          </td>
                                        ) : null}
                                        <td className="px-3 py-1.5 text-white truncate max-w-[80px]">
                                          {item ? itemLabel(item) : `#${row.item_id}`}
                                          {(gqs ? gqs.includes(row.item_id) : idx < 2) && <span className="ml-1 text-purple-400 text-xs">↑</span>}
                                        </td>
                                        <td className="px-1 py-1.5 text-center text-green-400">{row.w}</td>
                                        <td className="px-1 py-1.5 text-center text-gray-400">{row.d}</td>
                                        <td className="px-1 py-1.5 text-center text-red-400">{row.l}</td>
                                        <td className="px-1 py-1.5 text-center text-white font-bold">{row.pts}</td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                              {gms && gms.length > 0 && (
                                <div className="border-t border-gray-700/50 divide-y divide-gray-700/30 max-h-40 overflow-y-auto">
                                  {gms.map(m => {
                                    const i1 = items.get(m.item1_id)
                                    const i2 = m.item2_id ? items.get(m.item2_id) : null
                                    const done = m.winner_id !== null
                                    return (
                                      <div key={m.id} className={`px-2 py-1 flex items-center gap-1 text-xs ${done ? '' : 'opacity-40'}`}>
                                        <span className={`flex-1 text-right truncate ${m.winner_id === m.item1_id ? 'text-white font-semibold' : 'text-gray-400'}`}>
                                          {i1 ? itemLabel(i1) : `#${m.item1_id}`}
                                        </span>
                                        <span className="text-gray-600 w-4 text-center shrink-0">
                                          {m.winner_id ? (m.winner_id === m.item1_id ? '>' : '<') : 'vs'}
                                        </span>
                                        <span className={`flex-1 truncate ${m.winner_id === m.item2_id ? 'text-white font-semibold' : 'text-gray-400'}`}>
                                          {i2 ? itemLabel(i2) : m.item2_id ? `#${m.item2_id}` : '-'}
                                        </span>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                              {tbms && tbms.length > 0 && (
                                <div className="border-t border-orange-800/40">
                                  <div className="px-2 py-0.5 bg-orange-900/20">
                                    <span className="text-xs text-orange-400 font-semibold">동점처리</span>
                                  </div>
                                  <div className="divide-y divide-gray-700/30">
                                    {tbms.map(m => {
                                      const i1 = items.get(m.item1_id)
                                      const i2 = m.item2_id ? items.get(m.item2_id) : null
                                      const done = m.winner_id !== null
                                      return (
                                        <div key={m.id} className={`px-2 py-1 flex items-center gap-1 text-xs ${done ? '' : 'opacity-40'}`}>
                                          <span className={`flex-1 text-right truncate ${m.winner_id === m.item1_id ? 'text-white font-semibold' : 'text-gray-400'}`}>
                                            {i1 ? itemLabel(i1) : `#${m.item1_id}`}
                                          </span>
                                          <span className="text-gray-600 w-4 text-center shrink-0">
                                            {m.winner_id ? (m.winner_id === m.item1_id ? '>' : '<') : 'vs'}
                                          </span>
                                          <span className={`flex-1 truncate ${m.winner_id === m.item2_id ? 'text-white font-semibold' : 'text-gray-400'}`}>
                                            {i2 ? itemLabel(i2) : m.item2_id ? `#${m.item2_id}` : '-'}
                                          </span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null

              const finalRoundActive = currentMatch !== 'done' && currentMatch != null && currentMatch.phase === 'main' && (currentMatch as any).block_id == null
              const finalRoundEl = (() => {
                if (!standings.finalRound) return null
                const fr = standings.finalRound
                const isCompleted = fr.status === 'completed'
                const frRoundsSorted = [...fr.rounds].sort((a, b) => b.round - a.round)
                const FINAL_SLOTS = frRoundsSorted.length > 0 ? frRoundsSorted[0].matches.length * 2 : 8
                const CONN_W = 24
                return (
                  <div className={`bg-gray-800 rounded-xl overflow-hidden border ${finalRoundActive ? 'border-yellow-500/60' : 'border-yellow-500/30'}`}>
                    <div className="px-4 py-2 border-b border-gray-700 bg-gray-700/40 flex items-center gap-2">
                      <span className="text-sm font-bold text-yellow-400">결승 라운드</span>
                      {finalRoundActive && <span className="text-xs text-yellow-400 animate-pulse">진행중</span>}
                      {isCompleted && <span className="text-xs text-green-400">완료</span>}
                    </div>
                    <div className="overflow-x-auto p-2">
                      <div className="flex gap-0 min-w-max">
                        {frRoundsSorted.map((rd, rdIdx) => {
                          const matchCount = rd.matches.length
                          const slotsPerMatch = FINAL_SLOTS / matchCount
                          const isLastRound = rdIdx === frRoundsSorted.length - 1
                          return (
                            <React.Fragment key={rd.round}>
                              <div className="flex flex-col" style={{ width: 200 }}>
                                <div className="text-center text-xs text-yellow-500/70 py-1 border-b border-gray-700/40 mb-1">
                                  {finalRoundLabel(rd.round)}
                                </div>
                                <div className="relative" style={{ height: FINAL_SLOTS * SLOT_H }}>
                                  {rd.matches.map((m, matchIdx) => {
                                    const topPx = matchIdx * slotsPerMatch * SLOT_H + (slotsPerMatch / 2 - 1) * SLOT_H
                                    const i1 = items.get(m.item1_id)
                                    const i2 = m.item2_id ? items.get(m.item2_id) : null
                                    const o1 = originLabel(m.item1_id)
                                    const o2 = m.item2_id ? originLabel(m.item2_id) : null
                                    return (
                                      <div key={m.id} className="absolute left-1 right-1" style={{ top: topPx }}>
                                        <div className={`text-xs px-2 py-0.5 rounded-t border-l-2 ${m.winner_id === m.item1_id ? 'border-yellow-400 bg-yellow-900/20' : m.winner_id !== null ? 'border-gray-700' : 'border-gray-600'}`}>
                                          {o1 ? (
                                            <span className={`flex items-center gap-1 ${m.winner_id !== null && m.winner_id !== m.item1_id ? 'opacity-40 line-through' : ''}`}>
                                              <span className={`w-[68px] shrink-0 font-bold text-[10px] truncate ${o1.color}`}>{o1.text}</span>
                                              <span className={`w-[120px] shrink-0 truncate ${m.winner_id === m.item1_id ? 'text-white font-semibold' : 'text-gray-300'}`}>{i1 ? itemLabel(i1) : `#${m.item1_id}`}</span>
                                            </span>
                                          ) : (
                                            <span className={`truncate block ${m.winner_id === m.item1_id ? 'text-white font-semibold' : m.winner_id !== null ? 'text-gray-600 line-through' : 'text-gray-300'}`}>{i1 ? itemLabel(i1) : `#${m.item1_id}`}</span>
                                          )}
                                        </div>
                                        <div className={`text-xs px-2 py-0.5 rounded-b border-l-2 border-t border-gray-700/30 ${m.winner_id === m.item2_id ? 'border-yellow-400 bg-yellow-900/20' : m.winner_id !== null ? 'border-gray-700' : 'border-gray-600'}`}>
                                          {o2 ? (
                                            <span className={`flex items-center gap-1 ${m.winner_id !== null && m.winner_id !== m.item2_id ? 'opacity-40 line-through' : ''}`}>
                                              <span className={`w-[68px] shrink-0 font-bold text-[10px] truncate ${o2.color}`}>{o2.text}</span>
                                              <span className={`w-[120px] shrink-0 truncate ${m.winner_id === m.item2_id ? 'text-white font-semibold' : 'text-gray-300'}`}>{i2 ? itemLabel(i2) : `#${m.item2_id}`}</span>
                                            </span>
                                          ) : (
                                            <span className={`truncate block ${m.winner_id === m.item2_id ? 'text-white font-semibold' : m.winner_id !== null ? 'text-gray-600 line-through' : 'text-gray-300'}`}>{i2 ? itemLabel(i2) : m.item2_id ? `#${m.item2_id}` : '-'}</span>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                              {!isLastRound && (
                                <div className="flex flex-col shrink-0" style={{ width: CONN_W }}>
                                  <div className="text-xs py-1 border-b border-transparent mb-1" style={{ visibility: 'hidden' }}>x</div>
                                  <svg width={CONN_W} height={FINAL_SLOTS * SLOT_H} style={{ display: 'block' }}>
                                    {Array.from({ length: matchCount / 2 }, (_, i) => {
                                      const topY = (2 * i * slotsPerMatch + slotsPerMatch / 2) * SLOT_H
                                      const botY = ((2 * i + 1) * slotsPerMatch + slotsPerMatch / 2) * SLOT_H
                                      const midY = (topY + botY) / 2
                                      const m0 = rd.matches[2 * i]
                                      const m1 = rd.matches[2 * i + 1]
                                      const m0done = m0?.winner_id != null
                                      const m1done = m1?.winner_id != null
                                      const bothDone = m0done && m1done
                                      const nextRound = frRoundsSorted[rdIdx + 1]
                                      const nextM = nextRound?.matches[i]
                                      const nextDecided = nextM?.winner_id != null
                                      const topActive = m0done && (!nextDecided || nextM?.winner_id === nextM?.item1_id)
                                      const botActive = m1done && (!nextDecided || nextM?.winner_id === nextM?.item2_id)
                                      const C_ACTIVE = '#e5e7eb'
                                      const C_IDLE = '#374151'
                                      return (
                                        <g key={i}>
                                          <line x1={0} y1={topY} x2={CONN_W / 2} y2={topY} stroke={topActive ? C_ACTIVE : C_IDLE} strokeWidth={1} />
                                          <line x1={CONN_W / 2} y1={topY} x2={CONN_W / 2} y2={midY} stroke={topActive ? C_ACTIVE : C_IDLE} strokeWidth={1} />
                                          <line x1={CONN_W / 2} y1={midY} x2={CONN_W / 2} y2={botY} stroke={botActive ? C_ACTIVE : C_IDLE} strokeWidth={1} />
                                          <line x1={0} y1={botY} x2={CONN_W / 2} y2={botY} stroke={botActive ? C_ACTIVE : C_IDLE} strokeWidth={1} />
                                          <line x1={CONN_W / 2} y1={midY} x2={CONN_W} y2={midY} stroke={bothDone ? C_ACTIVE : C_IDLE} strokeWidth={1} />
                                        </g>
                                      )
                                    })}
                                  </svg>
                                </div>
                              )}
                            </React.Fragment>
                          )
                        })}
                        {isCompleted && (() => {
                          const lastRound = frRoundsSorted[frRoundsSorted.length - 1]
                          const champion = lastRound?.matches[0]?.winner_id
                          if (!champion) return null
                          const item = items.get(champion)
                          const o = originLabel(champion)
                          const topPx = (FINAL_SLOTS / 2 - 1) * SLOT_H
                          return (
                            <div className="flex flex-col" style={{ width: 200 }}>
                              <div className="text-center text-xs text-yellow-400 py-1 border-b border-gray-700/40 mb-1">🏆 우승</div>
                              <div className="relative" style={{ height: FINAL_SLOTS * SLOT_H }}>
                                <div className="absolute left-1 right-1" style={{ top: topPx }}>
                                  <div className="text-xs px-2 py-0.5 rounded border-l-2 border-yellow-400 bg-yellow-900/30 font-semibold">
                                    {o ? (
                                      <span className="flex items-center gap-1">
                                        <span className={`w-[68px] shrink-0 font-bold text-[10px] truncate ${o.color}`}>{o.text}</span>
                                        <span className="w-[120px] shrink-0 truncate text-yellow-200">{item ? itemLabel(item) : `#${champion}`}</span>
                                      </span>
                                    ) : <span className="text-yellow-200">{item ? itemLabel(item) : `#${champion}`}</span>}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  </div>
                )
              })()

              return (
                <div className="space-y-4">
                  {/* 결승 라운드: 항상 최상단 */}
                  {finalRoundEl}
                  {/* 조별 예선 진행 중: 상단 표시 */}
                  {!standings.groupPhase?.completed && groupPhaseEl}
                  {sortedBlocks.map(block => {
                    const isActive = activeBlockId === block.block_id
                    const isCompleted = block.status === 'completed'
                    const isPending = block.status === 'pending'
                    const roundsSorted = [...block.rounds].sort((a, b) => b.round - a.round)

                    return (
                      <div key={block.block_id} className={`bg-gray-800 rounded-xl overflow-hidden border ${isActive ? 'border-purple-500/60' : 'border-gray-700/30'}`}>
                        <div className="px-4 py-2 border-b border-gray-700 bg-gray-700/40 flex items-center gap-2">
                          <span className="text-sm font-bold text-white">블록 {block.label}</span>
                          {isActive && <span className="text-xs text-purple-400 animate-pulse">진행중</span>}
                          {isCompleted && <span className="text-xs text-green-400">완료</span>}
                          {isPending && <span className="text-xs text-gray-500">대기 중</span>}
                        </div>
                        {isPending ? (
                          <div className="overflow-x-auto p-2">
                            {(() => {
                              const phaseBlock = standings.groupPhase?.blocks.find(b => b.block_id === block.block_id)
                              const blockGroups = phaseBlock?.groups ?? []
                              if (blockGroups.length === 0) return <div className="py-4 text-center text-gray-600 text-sm">이전 블록 완료 후 시작됩니다</div>

                              const isGDone = (g: typeof blockGroups[0]) =>
                                g.matches.length > 0 &&
                                g.matches.every((m: CupMatch) => m.winner_id !== null || m.is_draw) &&
                                (!g.tiebreakMatches || g.tiebreakMatches.length === 0 || g.tiebreakMatches.every((m: CupMatch) => m.winner_id !== null || m.is_draw))

                              // 크로스 시딩: startBlock과 동일하게 topHalf/bottomHalf 분리
                              // → 같은 조 진출자가 블록 파이널 전까지 만나지 않도록 보장
                              type BSlot = { group_id: number; rank: number; item_id: number | null }
                              const topBracket: [BSlot, BSlot][] = []
                              const bottomBracket: [BSlot, BSlot][] = []
                              for (let i = 0; i < blockGroups.length; i += 2) {
                                const g0 = blockGroups[i]
                                const g1 = blockGroups[i + 1]
                                if (!g0 || !g1) continue
                                const d0 = isGDone(g0), d1 = isGDone(g1)
                                const g0q = (g0 as any).qualifiers as number[] | null | undefined
                                const g1q = (g1 as any).qualifiers as number[] | null | undefined
                                topBracket.push([
                                  { group_id: g0.group_id, rank: 1, item_id: d0 ? (g0q?.[0] ?? g0.standings[0]?.item_id ?? null) : null },
                                  { group_id: g1.group_id, rank: 2, item_id: d1 ? (g1q?.[1] ?? g1.standings[1]?.item_id ?? null) : null },
                                ])
                                bottomBracket.push([
                                  { group_id: g1.group_id, rank: 1, item_id: d1 ? (g1q?.[0] ?? g1.standings[0]?.item_id ?? null) : null },
                                  { group_id: g0.group_id, rank: 2, item_id: d0 ? (g0q?.[1] ?? g0.standings[1]?.item_id ?? null) : null },
                                ])
                              }
                              const bracketMatches = [...topBracket, ...bottomBracket]

                              const confirmedCount = bracketMatches.reduce((n, [s1, s2]) => n + (s1.item_id !== null ? 1 : 0) + (s2.item_id !== null ? 1 : 0), 0)

                              return (
                                <div className="flex gap-0 min-w-max">
                                  <div className="flex flex-col" style={{ width: 208 }}>
                                    <div className="text-center text-xs text-gray-500 py-1 border-b border-gray-700/40 mb-1">
                                      {blockRoundLabel(32, roundTotal, itemType)}
                                      <span className="ml-1 text-gray-600">({confirmedCount}/32)</span>
                                    </div>
                                    <div className="relative" style={{ height: TOTAL_SLOTS * SLOT_H }}>
                                      {bracketMatches.map(([s1, s2], mi) => {
                                        const topPx = mi * 2 * SLOT_H
                                        const it1 = s1.item_id ? items.get(s1.item_id) : null
                                        const it2 = s2.item_id ? items.get(s2.item_id) : null
                                        const o1 = s1.item_id ? originLabel(s1.item_id) : null
                                        const o2 = s2.item_id ? originLabel(s2.item_id) : null
                                        return (
                                          <div key={mi} className="absolute left-1 right-1" style={{ top: topPx }}>
                                            <div className={`text-xs px-2 py-0.5 rounded-t border-l-2 ${s1.item_id !== null ? 'border-purple-400 bg-purple-900/20' : 'border-gray-700/40 text-gray-600'}`}>
                                              {s1.item_id !== null ? (
                                                <span className="flex items-center gap-1">
                                                  {o1 && <span className={`w-[68px] shrink-0 font-bold text-[10px] truncate ${o1.color}`}>{o1.text}</span>}
                                                  <span className="w-[120px] shrink-0 truncate text-purple-200">{it1 ? itemLabel(it1) : `#${s1.item_id}`}</span>
                                                </span>
                                              ) : `${s1.group_id}조 ${s1.rank}위`}
                                            </div>
                                            <div className={`text-xs px-2 py-0.5 rounded-b border-l-2 border-t border-gray-700/30 ${s2.item_id !== null ? 'border-purple-400 bg-purple-900/20' : 'border-gray-700/40 text-gray-600'}`}>
                                              {s2.item_id !== null ? (
                                                <span className="flex items-center gap-1">
                                                  {o2 && <span className={`w-[68px] shrink-0 font-bold text-[10px] truncate ${o2.color}`}>{o2.text}</span>}
                                                  <span className="w-[120px] shrink-0 truncate text-purple-200">{it2 ? itemLabel(it2) : `#${s2.item_id}`}</span>
                                                </span>
                                              ) : `${s2.group_id}조 ${s2.rank}위`}
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                </div>
                              )
                            })()}
                          </div>
                        ) : (
                          <div className="overflow-x-auto p-2">
                            <div className="flex gap-0 min-w-max">
                              {roundsSorted.map((rd, rdIdx) => {
                                const matchCount = rd.matches.length
                                const slotsPerMatch = TOTAL_SLOTS / matchCount
                                const isFirstRound = rd.round === roundsSorted[0].round
                                const isLastRound = rdIdx === roundsSorted.length - 1
                                const CONN_W = 24
                                return (
                                  <React.Fragment key={rd.round}>
                                  <div className="flex flex-col" style={{ width: 200 }}>
                                    <div className="text-center text-xs text-gray-500 py-1 border-b border-gray-700/40 mb-1">
                                      {blockRoundLabel(rd.round, roundTotal, itemType)}
                                    </div>
                                    <div className="relative" style={{ height: TOTAL_SLOTS * SLOT_H }}>
                                      {rd.matches.map((m, matchIdx) => {
                                        const topPx = matchIdx * slotsPerMatch * SLOT_H + (slotsPerMatch / 2 - 1) * SLOT_H
                                        const i1 = items.get(m.item1_id)
                                        const i2 = m.item2_id ? items.get(m.item2_id) : null
                                        const o1 = originLabel(m.item1_id)
                                        const o2 = m.item2_id ? originLabel(m.item2_id) : null
                                        return (
                                          <div key={m.id} className="absolute left-1 right-1" style={{ top: topPx }}>
                                            <div className={`text-xs px-2 py-0.5 rounded-t border-l-2 ${m.winner_id === m.item1_id ? 'border-purple-400 bg-purple-900/20' : m.winner_id !== null ? 'border-gray-700' : 'border-gray-600'}`}>
                                              {o1 ? (
                                                <span className={`flex items-center gap-1 ${m.winner_id !== null && m.winner_id !== m.item1_id ? 'opacity-40 line-through' : ''}`}>
                                                  <span className={`w-[68px] shrink-0 font-bold text-[10px] truncate ${o1.color}`}>{o1.text}</span>
                                                  <span className={`w-[120px] shrink-0 truncate ${m.winner_id === m.item1_id ? 'text-white font-semibold' : 'text-gray-300'}`}>{i1 ? itemLabel(i1) : `#${m.item1_id}`}</span>
                                                </span>
                                              ) : (
                                                <span className={`truncate block ${m.winner_id === m.item1_id ? 'text-white font-semibold' : m.winner_id !== null ? 'text-gray-600 line-through' : 'text-gray-300'}`}>{i1 ? itemLabel(i1) : `#${m.item1_id}`}</span>
                                              )}
                                            </div>
                                            <div className={`text-xs px-2 py-0.5 rounded-b border-l-2 border-t border-gray-700/30 ${m.winner_id === m.item2_id ? 'border-purple-400 bg-purple-900/20' : m.winner_id !== null ? 'border-gray-700' : 'border-gray-600'}`}>
                                              {o2 ? (
                                                <span className={`flex items-center gap-1 ${m.winner_id !== null && m.winner_id !== m.item2_id ? 'opacity-40 line-through' : ''}`}>
                                                  <span className={`w-[68px] shrink-0 font-bold text-[10px] truncate ${o2.color}`}>{o2.text}</span>
                                                  <span className={`w-[120px] shrink-0 truncate ${m.winner_id === m.item2_id ? 'text-white font-semibold' : 'text-gray-300'}`}>{i2 ? itemLabel(i2) : `#${m.item2_id}`}</span>
                                                </span>
                                              ) : (
                                                <span className={`truncate block ${m.winner_id === m.item2_id ? 'text-white font-semibold' : m.winner_id !== null ? 'text-gray-600 line-through' : 'text-gray-300'}`}>{i2 ? itemLabel(i2) : m.item2_id ? `#${m.item2_id}` : '-'}</span>
                                              )}
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                  {!isLastRound && (
                                    <div className="flex flex-col shrink-0" style={{ width: CONN_W }}>
                                      <div className="text-xs py-1 border-b border-transparent mb-1" style={{ visibility: 'hidden' }}>x</div>
                                      <svg width={CONN_W} height={TOTAL_SLOTS * SLOT_H} style={{ display: 'block' }}>
                                        {Array.from({ length: matchCount / 2 }, (_, i) => {
                                          const topY = (2 * i * slotsPerMatch + slotsPerMatch / 2) * SLOT_H
                                          const botY = ((2 * i + 1) * slotsPerMatch + slotsPerMatch / 2) * SLOT_H
                                          const midY = (topY + botY) / 2
                                          const m0 = rd.matches[2 * i]
                                          const m1 = rd.matches[2 * i + 1]
                                          const m0done = m0?.winner_id != null
                                          const m1done = m1?.winner_id != null
                                          const bothDone = m0done && m1done
                                          const nextRound = roundsSorted[rdIdx + 1]
                                          const nextM = nextRound?.matches[i]
                                          const nextDecided = nextM?.winner_id != null
                                          const topActive = m0done && (!nextDecided || nextM?.winner_id === nextM?.item1_id)
                                          const botActive = m1done && (!nextDecided || nextM?.winner_id === nextM?.item2_id)
                                          const C_ACTIVE = '#e5e7eb'
                                          const C_IDLE = '#374151'
                                          return (
                                            <g key={i}>
                                              <line x1={0} y1={topY} x2={CONN_W / 2} y2={topY} stroke={topActive ? C_ACTIVE : C_IDLE} strokeWidth={1} />
                                              <line x1={CONN_W / 2} y1={topY} x2={CONN_W / 2} y2={midY} stroke={topActive ? C_ACTIVE : C_IDLE} strokeWidth={1} />
                                              <line x1={CONN_W / 2} y1={midY} x2={CONN_W / 2} y2={botY} stroke={botActive ? C_ACTIVE : C_IDLE} strokeWidth={1} />
                                              <line x1={0} y1={botY} x2={CONN_W / 2} y2={botY} stroke={botActive ? C_ACTIVE : C_IDLE} strokeWidth={1} />
                                              <line x1={CONN_W / 2} y1={midY} x2={CONN_W} y2={midY} stroke={bothDone ? C_ACTIVE : C_IDLE} strokeWidth={1} />
                                            </g>
                                          )
                                        })}
                                      </svg>
                                    </div>
                                  )}
                                  </React.Fragment>
                                )
                              })}
                              {isCompleted && (() => {
                                const lastRound = roundsSorted[roundsSorted.length - 1]
                                const finalists = (lastRound?.matches ?? []).map(m => m.winner_id).filter((id): id is number => id !== null)
                                const unit = itemType === 'actor' ? '인' : '작품'
                                return (
                                  <div className="flex flex-col" style={{ width: 200 }}>
                                    <div className="text-center text-xs text-gray-500 py-1 border-b border-gray-700/40 mb-1">
                                      {`${roundTotal / 8}강(2${unit})`}
                                    </div>
                                    <div className="relative" style={{ height: TOTAL_SLOTS * SLOT_H }}>
                                      {finalists.map((fid, fi) => {
                                        const item = items.get(fid)
                                        const o = originLabel(fid)
                                        const topPx = (fi === 0 ? TOTAL_SLOTS / 4 - 1 : TOTAL_SLOTS * 3 / 4 - 1) * SLOT_H
                                        return (
                                          <div key={fid} className="absolute left-1 right-1" style={{ top: topPx }}>
                                            <div className="text-xs px-2 py-0.5 rounded border-l-2 border-green-500 bg-green-900/20 text-green-300 font-semibold">
                                              {o ? (
                                                <span className="flex items-center gap-1">
                                                  <span className={`w-[68px] shrink-0 font-bold text-[10px] truncate ${o.color}`}>{o.text}</span>
                                                  <span className="w-[120px] shrink-0 truncate">{item ? itemLabel(item) : `#${fid}`}</span>
                                                </span>
                                              ) : (item ? itemLabel(item) : `#${fid}`)}
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* 조별 예선 완료 후 하단 표시 */}
                  {standings.groupPhase?.completed && groupPhaseEl}
                </div>
              )
            })()}
          </div>
        )}

        {tab === 'rank' && (
          <div className="p-4">
            {liveScores.length === 0 ? (
              <p className="text-gray-500 text-center py-8 text-sm">아직 진행된 매치가 없습니다.</p>
            ) : (
              <>
                {tournament && (tournament.format === 'tournament' || tournament.format === 'worldcup') && (
                  <p className="text-xs text-gray-500 mb-3">
                    진출 중인 참가자는 보장된 최소 순위 기준 예상 점수로 표시됩니다.
                  </p>
                )}
                {tournament && tournament.format === 'league' && (
                  <p className="text-xs text-gray-500 mb-3">
                    순위 보너스는 대회 완료 후 최종 반영됩니다.
                  </p>
                )}
                <div className="bg-gray-800 rounded-xl overflow-hidden">
                  <table className="w-full text-sm table-fixed">
                    <thead>
                      <tr className="border-b border-gray-700 text-gray-400 text-xs">
                        <th className="px-3 py-2 text-center w-12">순위</th>
                        <th className="px-3 py-2 text-left">이름</th>
                        <th className="px-3 py-2 text-right w-16">점수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liveScores.map((row, idx) => {
                        const item = items.get(row.item_id)
                        const imgPath = item ? itemImagePath(item) : null
                        const prevPts = idx > 0 ? liveScores[idx - 1].pts : null
                        const isTied = prevPts !== null && prevPts === row.pts
                        return (
                          <tr
                            key={row.item_id}
                            className="border-b border-gray-700/50 hover:bg-gray-700/30 transition"
                          >
                            <td className="px-3 py-2 text-center">
                              <span className={`font-bold text-sm ${row.rank === 1 ? 'text-yellow-400' : row.rank === 2 ? 'text-gray-300' : row.rank === 3 ? 'text-amber-600' : 'text-gray-500'}`}>
                                {isTied ? '=' : row.rank}
                              </span>
                            </td>
                            <td className="px-3 py-2 overflow-hidden">
                              <div className="flex items-center gap-2 min-w-0">
                                {imgPath && (
                                  <div className="w-7 h-7 rounded overflow-hidden shrink-0">
                                    <ImagePreview path={imgPath} alt="" className="w-full h-full" objectPosition="center 10%" />
                                  </div>
                                )}
                                <span
                                  className="text-gray-200 truncate cursor-pointer hover:text-blue-400"
                                  onClick={() => item && (tournament?.type === 'actor' ? onNavigateToActor(item.id) : onNavigateToWork(item.id))}
                                >
                                  {item ? itemLabel(item) : `#${row.item_id}`}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <span className="text-green-400 font-semibold">{row.pts.toFixed(1)}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── RankingSettingsModal ───────────────────────────────────────────────────
type RankingSettings = {
  basePoints: { win: number; draw: number; loss: number }
  divisionWeights: number[]
  opponentWeights: number[]
  worldcupMainMultiplier: number
  rankBonus: Record<string, Record<string, number>>
}

const POOL_SIZES = ['32', '64', '128', '256', '512']
const RANK_THRESHOLDS = ['1', '2', '4', '8', '16', '32']
const DIV_LABELS = ['1부', '2부', '3부', '4부', '5부', '6부']

function NumInput({ value, onChange, min = 0, step = 1, className = '' }: {
  value: number; onChange: (v: number) => void; min?: number; step?: number; className?: string
}) {
  return (
    <input
      type="number"
      min={min}
      step={step}
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      className={`bg-gray-700 text-white text-center rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-500 w-16 ${className}`}
    />
  )
}

function RankingSettingsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'actor' | 'work'>('actor')
  const [settings, setSettings] = useState<Record<'actor' | 'work', RankingSettings | null>>({ actor: null, work: null })
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const load = async (t: 'actor' | 'work') => {
      const s = await rankingSettingsApi.get(t) as RankingSettings | null
      if (s) setSettings(prev => ({ ...prev, [t]: s }))
    }
    load('actor')
    load('work')
  }, [])

  const cur = settings[tab]

  const update = (fn: (s: RankingSettings) => RankingSettings) => {
    setSettings(prev => {
      const s = prev[tab]
      if (!s) return prev
      return { ...prev, [tab]: fn(s) }
    })
  }

  const setWeight = (key: 'divisionWeights' | 'opponentWeights', idx: number, val: number) => {
    update(s => {
      const arr = [...s[key]]
      arr[idx] = val
      return { ...s, [key]: arr }
    })
  }

  const setBonus = (pool: string, rank: string, val: number) => {
    update(s => ({
      ...s,
      rankBonus: {
        ...s.rankBonus,
        [pool]: { ...s.rankBonus[pool], [rank]: val }
      }
    }))
  }

  const handleSave = async () => {
    const s = settings[tab]
    if (!s) return
    setSaving(true)
    setErrorMsg('')
    try {
      await rankingSettingsApi.update(tab, s)
      onClose()
    } catch (e) {
      setErrorMsg((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const tabBtn = (t: 'actor' | 'work') => (
    <button
      onClick={() => setTab(t)}
      className={`px-4 py-1.5 rounded text-sm font-medium transition ${tab === t ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
    >
      {t === 'actor' ? '배우' : '작품'}
    </button>
  )

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0">
          <h2 className="text-white font-bold text-base">랭킹 설정</h2>
          <div className="flex gap-2">
            {tabBtn('actor')}
            {tabBtn('work')}
          </div>
        </div>

        {!cur ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">로딩 중...</div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

            {/* 기본 승점 */}
            <section>
              <h3 className="text-gray-300 font-semibold text-sm mb-3">기본 승점</h3>
              <div className="flex gap-6">
                {(['win', 'draw', 'loss'] as const).map(k => (
                  <div key={k} className="flex flex-col items-center gap-1">
                    <label className="text-xs text-gray-400">{k === 'win' ? '승' : k === 'draw' ? '무' : '패'}</label>
                    <NumInput
                      value={cur.basePoints[k]}
                      onChange={v => update(s => ({ ...s, basePoints: { ...s.basePoints, [k]: v } }))}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* 부별 가중치 */}
            <section>
              <h3 className="text-gray-300 font-semibold text-sm mb-1">부별 가중치 <span className="text-gray-500 font-normal text-xs">(부별 대회: 자기 부 기준)</span></h3>
              <div className="flex gap-3 flex-wrap mt-2">
                {DIV_LABELS.map((label, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <label className="text-xs text-gray-400">{label}</label>
                    <NumInput
                      value={cur.divisionWeights[i] ?? 0}
                      onChange={v => setWeight('divisionWeights', i, v)}
                      step={0.5}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* 섞인 대회 가중치 */}
            <section>
              <h3 className="text-gray-300 font-semibold text-sm mb-1">섞인 대회 가중치 <span className="text-gray-500 font-normal text-xs">(복수 부: 상대방 부 기준)</span></h3>
              <div className="flex gap-3 flex-wrap mt-2">
                {DIV_LABELS.map((label, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <label className="text-xs text-gray-400">{label}</label>
                    <NumInput
                      value={cur.opponentWeights[i] ?? 0}
                      onChange={v => setWeight('opponentWeights', i, v)}
                      step={0.5}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* 월드컵 전용 */}
            <section>
              <h3 className="text-gray-300 font-semibold text-sm mb-1">월드컵 전용 <span className="text-gray-500 font-normal text-xs">(블록/결승 매치 승점 배율)</span></h3>
              <div className="flex items-center gap-3 mt-2">
                <label className="text-xs text-gray-400">블록/결승 배율</label>
                <NumInput
                  value={cur.worldcupMainMultiplier ?? 2.0}
                  onChange={v => update(s => ({ ...s, worldcupMainMultiplier: v }))}
                  step={0.5}
                  min={1}
                />
                <span className="text-xs text-gray-500">× (기본 승 {cur.basePoints.win}점 → {(cur.basePoints.win * (cur.worldcupMainMultiplier ?? 2.0)).toFixed(1)}점)</span>
              </div>
              <p className="text-xs text-gray-600 mt-1">순위 보너스는 본인 부 가중치(divisionWeights)가 곱해집니다.</p>
            </section>

            {/* 순위 보너스 */}
            <section>
              <h3 className="text-gray-300 font-semibold text-sm mb-3">순위 보너스</h3>
              <div className="overflow-x-auto">
                <table className="text-sm">
                  <thead>
                    <tr>
                      <th className="text-gray-400 text-xs text-left pr-4 pb-2 font-normal">순위 \ 참가수</th>
                      {POOL_SIZES.map(p => (
                        <th key={p} className="text-gray-400 text-xs text-center px-2 pb-2 font-normal">{p}강</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {RANK_THRESHOLDS.map(rank => (
                      <tr key={rank}>
                        <td className="text-gray-400 text-xs pr-4 py-1">{rank}위 이내</td>
                        {POOL_SIZES.map(pool => {
                          const poolNum = parseInt(pool)
                          const rankNum = parseInt(rank)
                          const disabled = rankNum >= poolNum
                          return (
                            <td key={pool} className="px-2 py-1 text-center">
                              {disabled ? (
                                <span className="text-gray-700 text-xs">-</span>
                              ) : (
                                <NumInput
                                  value={cur.rankBonus[pool]?.[rank] ?? 0}
                                  onChange={v => setBonus(pool, rank, v)}
                                  className="w-14"
                                />
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* 푸터 */}
        <div className="px-5 py-4 border-t border-gray-700 shrink-0">
          {errorMsg && <p className="text-red-400 text-xs mb-2">{errorMsg}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">취소</button>
            <button
              onClick={handleSave}
              disabled={saving || !cur}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded text-sm font-semibold"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── TournamentRankingsView ─────────────────────────────────────────────────
const RANK_PAGE_SIZE = 50
// ── RankTrendChart ─────────────────────────────────────────────────────────
function RankTrendChart({ history }: { history: { rank: number }[] }) {
  if (history.length < 2) return <span className="text-gray-600 text-xs">-</span>
  const W = 160, H = 28, P = 3
  const ranks = history.map(h => h.rank)
  const minR = Math.min(...ranks), maxR = Math.max(...ranks)
  const range = maxR - minR || 1
  const pts = history.map((h, i) => {
    const x = P + (i / (history.length - 1)) * (W - P * 2)
    const y = P + ((h.rank - minR) / range) * (H - P * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const last = ranks[ranks.length - 1], prev = ranks[ranks.length - 2]
  const color = last < prev ? '#4ade80' : last > prev ? '#f87171' : '#9ca3af'
  const [lx, ly] = pts[pts.length - 1].split(',')
  return (
    <svg width={W} height={H} className="shrink-0">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="2.5" fill={color} />
    </svg>
  )
}

const RANK_LIMIT_OPTIONS = [100, 200, 500, 1000]

function TournamentRankingsView({
  tournamentId,
  onBack,
  onPlay,
  onNavigateToActor,
  onNavigateToWork,
}: {
  tournamentId: number
  onBack: () => void
  onPlay: (runId: number, tab: 'standings') => void
  onNavigateToActor: (id: number) => void
  onNavigateToWork: (id: number) => void
}) {
  const [tournament, setTournament] = useState<CupTournament | null>(null)
  const [rankMode, setRankMode] = useState<'overall' | 'last'>('overall')
  const [lastRunId, setLastRunId] = useState<number | null>(null)
  const [rows, setRows] = useState<TournamentRankRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [limit, setLimit] = useState(() => Number(localStorage.getItem('tournamentRank:limit') || '100'))
  const [sortBy, setSortBy] = useState('win_rate')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')
  const [lastRows, setLastRows] = useState<LastRunRankRow[]>([])
  const [lastTotal, setLastTotal] = useState(0)
  const [lastPage, setLastPage] = useState(0)
  const [lastFormat, setLastFormat] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [rankHistories, setRankHistories] = useState<Record<number, { rank: number }[]>>({})
  const [trendModal, setTrendModal] = useState<{ item_id: number; label: string; img: string | null } | null>(null)
  const [imgOverlay, setImgOverlay] = useState<{ path: string } | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  useEffect(() => {
    cupApi.list({ sortBy: 'created_at' }).then(list => {
      const found = (list as CupTournament[]).find(t => t.id === tournamentId)
      if (found) setTournament(found)
    })
  }, [tournamentId])

  const loadOverall = useCallback(async (p: number, lb: number, sb: string, sd: string, s: string) => {
    setLoading(true)
    try {
      const res = await cupApi.tournamentRankings(tournamentId, { limit: lb, offset: p * lb, sortBy: sb, sortDir: sd, search: s || undefined })
      const rankRows = res.rows as TournamentRankRow[]
      setRows(rankRows)
      setTotal(res.total)
      const histories: Record<number, { rank: number }[]> = {}
      await Promise.all(rankRows.map(async row => {
        histories[row.item_id] = await cupApi.rankHistory(tournamentId, row.item_id)
      }))
      setRankHistories(prev => ({ ...prev, ...histories }))
    } finally {
      setLoading(false)
    }
  }, [tournamentId])

  const loadLast = useCallback(async (p: number, lb: number) => {
    setLoading(true)
    try {
      const res = await cupApi.lastRunRankings(tournamentId, { limit: lb, offset: p * lb })
      setLastRows(res.rows as LastRunRankRow[])
      setLastTotal(res.total)
      if (res.format) setLastFormat(res.format)
      if (res.runId) setLastRunId(res.runId)
    } finally {
      setLoading(false)
    }
  }, [tournamentId])

  useEffect(() => { setPage(0) }, [sortBy, sortDir, search, limit])
  useEffect(() => { if (rankMode === 'overall') loadOverall(page, limit, sortBy, sortDir, search) }, [rankMode, page, limit, sortBy, sortDir, search, loadOverall])
  useEffect(() => { if (rankMode === 'last') loadLast(lastPage, limit) }, [rankMode, lastPage, limit, loadLast])

  const totalPages = Math.ceil(total / limit)
  const lastTotalPages = Math.ceil(lastTotal / limit)
  const type = tournament?.type ?? 'actor'

  const imgPath = (row: TournamentRankRow | LastRunRankRow) =>
    (row as TournamentRankRow).photo_path ?? (row as TournamentRankRow).cover_path ?? null
  const label = (row: TournamentRankRow | LastRunRankRow) =>
    (row as any).name ?? (row as any).title ?? (row as any).product_number ?? `#${(row as any).item_id}`

  const sortTh = (col: string, colLabel: string, sub?: string) => {
    const active = sortBy === col
    const nextDir: 'asc' | 'desc' = active ? (sortDir === 'desc' ? 'asc' : 'desc') : 'desc'
    return (
      <th
        className={`px-2 text-right cursor-pointer select-none hover:text-white whitespace-nowrap ${active ? 'text-white' : 'text-gray-400'}`}
        onClick={() => { setSortBy(col); setSortDir(nextDir) }}
      >
        <div className="text-xs">{colLabel}{active ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}</div>
        {sub && <div className="text-[10px] text-gray-500 font-normal">{sub}</div>}
      </th>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 상단 바 */}
      <div className="shrink-0 px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={onBack} className="text-gray-400 hover:text-white text-sm transition">← 목록</button>
          <h2 className="text-white font-bold truncate">{tournament?.name ?? '...'} 순위</h2>
          <span className="text-gray-500 text-xs">
            ({rankMode === 'overall' ? total : lastTotal}{type === 'work' ? '작품' : '명'})
          </span>

          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {rankMode === 'overall' && (
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0) }}
                placeholder={type === 'actor' ? '이름 검색' : '제목/품번 검색'}
                className="bg-gray-700 text-white text-xs px-2 py-1 rounded w-36 placeholder-gray-500 outline-none"
              />
            )}
            {rankMode === 'last' && lastRunId && (
              <button
                onClick={() => onPlay(lastRunId, 'standings')}
                className="text-xs px-2 py-1 bg-gray-700 text-gray-300 hover:bg-gray-600 rounded"
              >매치결과</button>
            )}
            <select
              value={limit}
              onChange={e => { const v = Number(e.target.value); setLimit(v); localStorage.setItem('tournamentRank:limit', String(v)); setPage(0); setLastPage(0) }}
              className="bg-gray-700 text-white text-xs px-2 py-1 rounded"
            >
              {RANK_LIMIT_OPTIONS.map(l => <option key={l} value={l}>{l}개</option>)}
            </select>
            <div className="flex">
              <button
                onClick={() => { setRankMode('overall'); setPage(0) }}
                className={`text-sm px-3 py-1.5 rounded-l border-r border-gray-600 ${rankMode === 'overall' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              >전체 순위</button>
              <button
                onClick={() => { setRankMode('last'); setLastPage(0) }}
                className={`text-sm px-3 py-1.5 rounded-r ${rankMode === 'last' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              >마지막 순위</button>
            </div>
          </div>
        </div>
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto">
        {loading && rows.length === 0 && lastRows.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-500">로딩 중...</div>
        ) : rankMode === 'overall' ? (
          rows.length === 0 ? (
            <p className="text-gray-500 text-sm mt-8 text-center">순위 데이터가 없습니다.<br />대회를 완료하면 순위가 집계됩니다.</p>
          ) : (
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col style={{ width: '3rem' }} />
                <col style={{ width: '4rem' }} />
                {type === 'work' && <col style={{ width: '7rem' }} />}
                <col />
                <col style={{ width: '5.5rem' }} />
                <col style={{ width: '5.5rem' }} />
                <col style={{ width: '6rem' }} />
                <col style={{ width: '11rem' }} />
              </colgroup>
              <thead className="sticky top-0 bg-gray-900 z-10">
                <tr className="text-gray-400 text-xs border-b border-gray-700 h-12">
                  <th className="px-2 text-left">#</th>
                  <th className="px-2 text-left">썸네일</th>
                  {type === 'work' && <th className="px-2 text-left text-xs">품번</th>}
                  <th className="px-2 text-left">{type === 'work' ? '제목' : '이름'}</th>
                  {sortTh('win_rate', '우승률', '(우승/참가)')}
                  {sortTh('match_win_rate', '매치승률', '(승/경기)')}
                  {sortTh('total_pts', '누적승점')}
                  <th className="px-2 text-center text-xs text-gray-400">순위추이</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const img = imgPath(row)
                  const lbl = label(row)
                  const recentHistory = (rankHistories[row.item_id] ?? []).slice(-10)
                  return (
                    <tr key={row.item_id} className="border-b border-gray-800 hover:bg-gray-800 h-14">
                      <td className="px-2 text-gray-400 text-xs text-center">{page * limit + idx + 1}</td>
                      <td className="p-0 h-14" onMouseEnter={() => img && setImgOverlay({ path: img })} onMouseLeave={() => setImgOverlay(null)}>
                        <ImagePreview path={img} alt={lbl} className="w-full h-14 object-cover" objectPosition="center 10%" />
                      </td>
                      {type === 'work' && (
                        <td className="px-2 overflow-hidden">
                          <div className="truncate text-gray-400 text-xs">{row.product_number}</div>
                        </td>
                      )}
                      <td className="px-2 overflow-hidden">
                        <span
                          className="text-white font-medium hover:underline cursor-pointer truncate block"
                          onClick={() => type === 'actor' ? onNavigateToActor(row.item_id) : onNavigateToWork(row.item_id)}
                          onMouseMove={e => setTooltip({ type, id: row.item_id, x: e.clientX, y: e.clientY })}
                          onMouseLeave={() => setTooltip(null)}
                        >{lbl}</span>
                      </td>
                      <td className="px-2 text-right text-yellow-400">
                        <div>{row.win_rate.toFixed(1)}%</div>
                        <div className="text-[11px] text-gray-500">({row.run_wins}/{row.total_runs})</div>
                      </td>
                      <td className="px-2 text-right text-blue-400">
                        <div>{row.match_win_rate.toFixed(1)}%</div>
                        <div className="text-[11px] text-gray-500">({row.match_wins}/{row.total_matches})</div>
                      </td>
                      <td className="px-2 text-right text-green-400">{row.total_pts > 0 ? row.total_pts.toFixed(1) : '—'}</td>
                      <td
                        className="px-2 cursor-pointer"
                        onClick={() => setTrendModal({ item_id: row.item_id, label: lbl, img })}
                      >
                        <div className="flex justify-center">
                          <RankTrendChart history={recentHistory} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )
        ) : (
          lastRows.length === 0 ? (
            <p className="text-gray-500 text-sm mt-8 text-center">마지막 순위 데이터가 없습니다.</p>
          ) : (
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col style={{ width: '3rem' }} />
                <col style={{ width: '4rem' }} />
                {type === 'work' && <col style={{ width: '7rem' }} />}
                <col />
                <col style={{ width: '7rem' }} />
                <col style={{ width: '6rem' }} />
              </colgroup>
              <thead className="sticky top-0 bg-gray-900 z-10">
                <tr className="text-gray-400 text-xs border-b border-gray-700 h-12">
                  <th className="px-2 text-left">#</th>
                  <th className="px-2 text-left">썸네일</th>
                  {type === 'work' && <th className="px-2 text-left text-xs">품번</th>}
                  <th className="px-2 text-left">{type === 'work' ? '제목' : '이름'}</th>
                  <th className="px-2 text-left text-xs">
                    {lastFormat === 'league' ? '최종점수' : '탈락라운드'}
                  </th>
                  <th className="px-2 text-right text-xs">획득 승점</th>
                </tr>
              </thead>
              <tbody>
                {lastRows.map(row => {
                  const img = imgPath(row)
                  const lbl = label(row)
                  return (
                    <tr key={row.item_id} className="border-b border-gray-800 hover:bg-gray-800 h-14">
                      <td className="px-2 text-gray-400 font-bold text-center">{row.rank}</td>
                      <td className="p-0 h-14" onMouseEnter={() => img && setImgOverlay({ path: img })} onMouseLeave={() => setImgOverlay(null)}>
                        <ImagePreview path={img} alt={lbl} className="w-full h-14 object-cover" objectPosition="center 10%" />
                      </td>
                      {type === 'work' && (
                        <td className="px-2 overflow-hidden">
                          <div className="truncate text-gray-400 text-xs">{row.product_number}</div>
                        </td>
                      )}
                      <td className="px-2 overflow-hidden">
                        <span
                          className="text-white font-medium hover:underline cursor-pointer truncate block"
                          onClick={() => type === 'actor' ? onNavigateToActor(row.item_id) : onNavigateToWork(row.item_id)}
                          onMouseMove={e => setTooltip({ type, id: row.item_id, x: e.clientX, y: e.clientY })}
                          onMouseLeave={() => setTooltip(null)}
                        >{lbl}</span>
                      </td>
                      <td className="px-2 text-gray-300 text-xs">
                        {lastFormat === 'league'
                          ? <span className="text-blue-400 font-semibold">{row.pts}pt</span>
                          : row.elim_round === null
                            ? <span className="text-yellow-400 font-semibold">🏆 우승</span>
                            : roundLabel(row.elim_round)
                        }
                      </td>
                      <td className="px-2 text-right text-green-400 text-xs">
                        {row.run_pts != null ? row.run_pts.toFixed(1) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )
        )}
      </div>

      {/* 페이지네이션 */}
      {rankMode === 'overall' && totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      )}
      {rankMode === 'last' && lastTotalPages > 1 && (
        <Pagination page={lastPage} totalPages={lastTotalPages} onPageChange={setLastPage} />
      )}

      {/* 순위 추이 모달 */}
      {trendModal && (() => {
        const history = rankHistories[trendModal.item_id] ?? []
        const W = 420, H = 180, PX = 36, PY = 16
        const ranks = history.map(h => h.rank)
        const minR = ranks.length ? Math.min(...ranks) : 1
        const maxR = ranks.length ? Math.max(...ranks) : 1
        const range = maxR - minR || 1
        const pts = history.map((h, i) => {
          const x = PX + (history.length > 1 ? i / (history.length - 1) : 0.5) * (W - PX * 2)
          const y = PY + ((h.rank - minR) / range) * (H - PY * 2)
          return { x, y, rank: h.rank }
        })
        const polyPts = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
        const last = ranks[ranks.length - 1] ?? 0
        const prev = ranks[ranks.length - 2] ?? last
        const color = last < prev ? '#4ade80' : last > prev ? '#f87171' : '#9ca3af'
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setTrendModal(null)}>
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700" style={{ width: W + 80 }} onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4">
                <ImagePreview path={trendModal.img} alt={trendModal.label} className="w-10 h-10 rounded object-cover shrink-0" objectPosition="center 10%" />
                <p className="text-white font-bold flex-1 truncate">{trendModal.label} 순위 추이</p>
                <button onClick={() => setTrendModal(null)} className="text-gray-400 hover:text-white text-sm ml-2 shrink-0">✕</button>
              </div>
              {history.length < 2 ? (
                <p className="text-gray-500 text-sm text-center py-8">추이 데이터가 부족합니다.</p>
              ) : (
                <svg width={W} height={H} className="overflow-visible">
                  {Array.from(new Set([minR, maxR])).map(r => {
                    const y = PY + ((r - minR) / range) * (H - PY * 2)
                    return (
                      <g key={r}>
                        <line x1={PX} y1={y} x2={W - PX} y2={y} stroke="#374151" strokeDasharray="3,3" />
                        <text x={PX - 6} y={y + 4} fill="#9ca3af" fontSize="11" textAnchor="end">{r}위</text>
                      </g>
                    )
                  })}
                  <polyline points={polyPts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
                  {pts.map((p, i) => (
                    <g key={i}>
                      <circle cx={p.x} cy={p.y} r="4" fill={color} />
                      <text x={p.x} y={p.y - 8} fill="#e5e7eb" fontSize="11" textAnchor="middle">{p.rank}위</text>
                    </g>
                  ))}
                </svg>
              )}
              <p className="text-gray-500 text-xs mt-3 text-right">최근 {history.length}회 기록</p>
            </div>
          </div>
        )
      })()}

      {/* 썸네일 확대 오버레이 */}
      {imgOverlay && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          {type === 'actor' ? (
            <div className="w-[400px] h-[400px] rounded-lg overflow-hidden shadow-2xl border border-gray-600">
              <ImagePreview path={imgOverlay.path} alt="" className="w-full h-full object-cover" objectPosition="center 10%" />
            </div>
          ) : (
            <div className="rounded-lg overflow-hidden shadow-2xl border border-gray-600" style={{ width: 650 }}>
              <ImagePreview path={imgOverlay.path} alt="" className="w-full object-contain" />
            </div>
          )}
        </div>
      )}

      {tooltip && <CardTooltip tooltip={tooltip} />}
    </div>
  )
}

// ── MasterRankingView ──────────────────────────────────────────────────────
type MasterRankRow = {
  rank: number
  id: number
  name?: string
  photo_path?: string | null
  title?: string | null
  product_number?: string | null
  cover_path?: string | null
  total_points: number
  total_cups: number
  cup_wins: number
  total_matches: number
  match_wins: number
}

type FormatStat = {
  format: 'worldcup' | 'tournament' | 'league'
  total_cups: number
  cup_wins: number
  total_matches: number
  match_wins: number
}

type H2HRow = {
  opp_id: number; total: number; wins: number; losses: number; draws: number; opp_rank?: number | null
  name?: string; title?: string; product_number?: string; photo_path?: string; cover_path?: string
}

type DivHistEntry = { recorded_at: string; rank: number; total_points: number }

type RateTooltip = {
  itemId: number
  statType: 'win' | 'match'
  top: number
  left: number
}

const RANK_MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }
const MASTER_PAGE_SIZES = [100, 200, 500, 1000]
const DIV_BOUNDARIES = [32, 96, 224, 480, 992, 2016]
const DIV_LABEL: Record<number, string> = { 1: '1부', 2: '2부', 3: '3부', 4: '4부', 5: '5부', 6: '6부', 0: '미분류' }
const DIV_STD_SIZES: Record<number, number> = { 1: 32, 2: 64, 3: 128, 4: 256, 5: 512, 6: 1024 }
const DIV_COLOR: Record<number, string> = {
  1: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  2: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  3: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  4: 'bg-green-500/20 text-green-300 border-green-500/30',
  5: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  6: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  0: 'bg-gray-700/50 text-gray-500 border-gray-600/30',
}
const DIV_TEXT_COLOR: Record<number, string> = {
  1: 'text-yellow-300', 2: 'text-orange-300', 3: 'text-blue-300',
  4: 'text-green-300', 5: 'text-purple-300', 6: 'text-gray-400', 0: 'text-gray-600',
}

function getDivision(rank: number, masterRunCount: number): number {
  if (masterRunCount === 0) return 0
  for (let d = 0; d < DIV_BOUNDARIES.length; d++) {
    if (rank <= DIV_BOUNDARIES[d]) return d + 1
  }
  return 6
}

function MasterRankingView({
  onBack,
  onNavigateToActor,
  onNavigateToWork,
}: {
  onBack: () => void
  onNavigateToActor: (id: number) => void
  onNavigateToWork: (id: number) => void
}) {
  const [type, setType] = useState<'actor' | 'work'>(() =>
    (localStorage.getItem('masterRank:type') as 'actor' | 'work') || 'actor'
  )
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [divFilter, setDivFilter] = useState<number | null>(null)
  const [sortBy, setSortBy] = useState<string>(() => localStorage.getItem('masterRank:sortBy') || 'total_points')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => (localStorage.getItem('masterRank:sortDir') as 'asc' | 'desc') || 'desc')
  const [rows, setRows] = useState<MasterRankRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [pageSize, setPageSize] = useState<number>(() => {
    const saved = parseInt(localStorage.getItem('masterRank:pageSize') ?? '', 10)
    return MASTER_PAGE_SIZES.includes(saved) ? saved : MASTER_PAGE_SIZES[0]
  })
  const [divisionCounts, setDivisionCounts] = useState<{ division: number; count: number }[]>([])
  const [rankTrends, setRankTrends] = useState<Map<number, number | null>>(new Map())
  const [rateTooltip, setRateTooltip] = useState<RateTooltip | null>(null)
  const formatStatsCache = useRef<Map<number, FormatStat[]>>(new Map())
  const [imgOverlay, setImgOverlay] = useState<{ path: string } | null>(null)
  const [nameTooltip, setNameTooltip] = useState<TooltipState | null>(null)
  const [trendModal, setTrendModal] = useState<{ itemId: number; lbl: string; img: string | null } | null>(null)
  const [trendHistory, setTrendHistory] = useState<{ rank: number; recorded_at: string }[] | null>(null)
  const rankHistCache = useRef<Map<number, { rank: number; recorded_at: string }[]>>(new Map())
  const [analysisModal, setAnalysisModal] = useState<{ itemId: number; lbl: string; img: string | null } | null>(null)
  const [analysisTab, setAnalysisTab] = useState<'h2h' | 'divhist'>('h2h')
  const [h2hData, setH2hData] = useState<H2HRow[] | null>(null)
  const [divHistData, setDivHistData] = useState<DivHistEntry[] | null>(null)
  const [h2hLoading, setH2hLoading] = useState(false)
  const [divHistLoading, setDivHistLoading] = useState(false)
  const [h2hSort, setH2hSort] = useState<{ col: 'name' | 'total' | 'wins' | 'losses' | 'rate' | 'div'; dir: 'asc' | 'desc' }>({ col: 'total', dir: 'desc' })
  const [h2hDivFilter, setH2hDivFilter] = useState<number | null>(null)
  const [h2hDivDropdown, setH2hDivDropdown] = useState(false)

  const load = useCallback(async (t: 'actor' | 'work', s: string, p: number, div: number | null, ps: number, sb: string, sd: 'asc' | 'desc') => {
    setLoading(true)
    try {
      const data = await masterRankingApi.list({
        type: t, limit: ps, offset: p * ps,
        search: s || undefined,
        ...(div !== null ? { division: div } : {}),
        sortBy: sb, sortDir: sd,
      })
      setRows(data.rows as MasterRankRow[])
      setTotal(data.total)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadTrends = useCallback(async (t: 'actor' | 'work') => {
    const trends = await masterRankingApi.rankTrends(t)
    setRankTrends(new Map(trends.map(r => [r.item_id, r.prev_rank])))
  }, [])

  useEffect(() => { setPage(0); setDivFilter(null) }, [type])
  useEffect(() => { setPage(0) }, [search, divFilter, pageSize, sortBy, sortDir])
  useEffect(() => { load(type, search, page, divFilter, pageSize, sortBy, sortDir) }, [type, search, page, divFilter, pageSize, sortBy, sortDir, load])
  useEffect(() => { loadTrends(type) }, [type, loadTrends])
  useEffect(() => { localStorage.setItem('masterRank:type', type) }, [type])
  useEffect(() => { localStorage.setItem('masterRank:pageSize', String(pageSize)) }, [pageSize])
  useEffect(() => { localStorage.setItem('masterRank:sortBy', sortBy) }, [sortBy])
  useEffect(() => { localStorage.setItem('masterRank:sortDir', sortDir) }, [sortDir])
  useEffect(() => {
    cupApi.divisionCounts(type).then(setDivisionCounts).catch(() => setDivisionCounts([]))
  }, [type])

  const imgPath = (row: MasterRankRow) => row.photo_path ?? row.cover_path ?? null
  const label = (row: MasterRankRow) => row.name ?? row.title ?? row.product_number ?? `#${row.id}`

  const handleRateHover = async (e: React.MouseEvent, row: MasterRankRow, statType: 'win' | 'match') => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setRateTooltip({ itemId: row.id, statType, top: rect.bottom + 4, left: rect.left + rect.width / 2 })
    if (!formatStatsCache.current.has(row.id)) {
      const data = await masterRankingApi.itemFormatStats(type, row.id)
      formatStatsCache.current.set(row.id, data)
      setRateTooltip(prev => prev?.itemId === row.id ? { ...prev } : prev)
    }
  }

  const handleSort = (col: string) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(col); setSortDir('desc') }
  }

  const SortTh = ({ col, label, subLabel, subLabelClass, className }: { col: string; label: string; subLabel?: React.ReactNode; subLabelClass?: string; className?: string }) => {
    const active = sortBy === col
    return (
      <th
        className={`px-3 py-2.5 cursor-pointer select-none hover:text-white transition ${active ? 'text-white' : 'text-gray-400'} ${className ?? ''}`}
        onClick={() => handleSort(col)}
      >
        <div className="flex items-center justify-end gap-1">
          <span>{label}{subLabel && <><br/><span className={subLabelClass ?? 'text-gray-600 font-normal'}>{subLabel}</span></>}</span>
          <span className="text-[10px]">{active ? (sortDir === 'desc' ? '▼' : '▲') : <span className="text-gray-700">▼</span>}</span>
        </div>
      </th>
    )
  }

  const openTrendModal = async (row: MasterRankRow) => {
    const lbl = label(row)
    const img = imgPath(row)
    setTrendModal({ itemId: row.id, lbl, img })
    if (rankHistCache.current.has(row.id)) {
      setTrendHistory(rankHistCache.current.get(row.id)!)
    } else {
      setTrendHistory(null)
      const h = await masterRankingApi.rankHistory(type, row.id)
      rankHistCache.current.set(row.id, h)
      setTrendHistory(h)
    }
  }

  const openAnalysisModal = async (row: MasterRankRow) => {
    const lbl = label(row)
    const img = imgPath(row)
    setAnalysisModal({ itemId: row.id, lbl, img })
    setAnalysisTab('h2h')
    setH2hData(null)
    setDivHistData(null)
    setH2hLoading(true)
    try {
      const data = await cupApi.headToHead(type, row.id)
      setH2hData(data)
    } catch (err) {
      console.error('[h2h] error:', err)
      setH2hData([])
    } finally {
      setH2hLoading(false)
    }
  }

  const switchAnalysisTab = async (tab: 'h2h' | 'divhist') => {
    setAnalysisTab(tab)
    if (tab === 'divhist' && divHistData === null && analysisModal) {
      setDivHistLoading(true)
      try {
        const data = await masterRankingApi.divisionHistory(type, analysisModal.itemId)
        setDivHistData(data)
      } finally {
        setDivHistLoading(false)
      }
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 상단 */}
      <div className="p-4 border-b border-gray-700/50 shrink-0">
        <div className="flex items-center gap-2">
          {/* 뒤로 + 타이틀 */}
          <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5">
            <button onClick={onBack} className="text-gray-400 hover:text-white text-sm transition">← 목록</button>
            <span className="text-gray-600 text-xs">|</span>
            <span className="text-yellow-400 font-semibold text-sm">★ 마스터 랭킹</span>
          </div>

          {/* 유형 토글 */}
          <div className="flex items-center gap-1 bg-gray-800 rounded-lg px-2 py-1">
            {(['actor', 'work'] as const).map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`px-3 py-1 rounded text-xs font-medium transition ${type === t ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                {t === 'actor' ? '배우' : '작품'}
              </button>
            ))}
          </div>

          {/* 검색 */}
          <div className="flex-1 flex items-center bg-gray-800 rounded-lg px-3 py-1.5">
            <input
              className="flex-1 bg-transparent text-white text-sm outline-none placeholder-gray-500"
              placeholder={type === 'actor' ? '배우명 검색' : '작품명 / 품번 검색'}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-gray-500 hover:text-gray-300 text-xs ml-2">✕</button>
            )}
          </div>

          {/* 페이지 크기 */}
          <select
            value={pageSize}
            onChange={e => setPageSize(Number(e.target.value))}
            className="bg-gray-800 text-gray-300 text-xs rounded-lg px-2 py-1.5 border-none outline-none cursor-pointer hover:text-white"
          >
            {MASTER_PAGE_SIZES.map(s => (
              <option key={s} value={s}>{s}개</option>
            ))}
          </select>

          {/* 설정 */}
          <button
            onClick={() => setShowSettings(true)}
            className="bg-gray-800 rounded-lg px-3 py-1.5 text-gray-400 hover:text-gray-200 text-sm transition"
          >
            ⚙ 설정
          </button>
          {/* 리셋 */}
          <button
            onClick={() => setShowResetConfirm(true)}
            className="bg-gray-800 rounded-lg px-3 py-1.5 text-gray-600 hover:text-gray-400 text-xs transition"
          >
            리셋
          </button>
        </div>

        {/* 부별 필터 */}
        {divisionCounts.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
            <button
              onClick={() => setDivFilter(null)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition ${divFilter === null ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}
            >
              전체
            </button>
            {divisionCounts.map(({ division, count }) => (
              <button
                key={division}
                onClick={() => setDivFilter(divFilter === division ? null : division)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition border ${
                  divFilter === division
                    ? 'bg-blue-600 text-white border-blue-500'
                    : `${DIV_COLOR[division] ?? 'bg-gray-800 text-gray-400 border-gray-700'} hover:opacity-80`
                }`}
              >
                {DIV_LABEL[division] ?? `${division}부`} <span className="opacity-70">{DIV_STD_SIZES[division] != null ? `${DIV_STD_SIZES[division]}(${count})` : count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {showSettings && <RankingSettingsModal onClose={() => setShowSettings(false)} />}

      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowResetConfirm(false)}>
          <div className="bg-gray-800 rounded-xl p-6 w-[360px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold text-white mb-2">마스터 랭킹 리셋</h2>
            <p className="text-sm text-gray-400 mb-6">
              {type === 'actor' ? '배우' : '작품'} 마스터 랭킹 이력을 전부 삭제합니다.<br />
              이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  await masterRankingApi.reset(type)
                  setShowResetConfirm(false)
                  load(type, search, page, divFilter, pageSize, sortBy, sortDir)
                  loadTrends(type)
                  cupApi.divisionCounts(type).then(setDivisionCounts).catch(() => setDivisionCounts([]))
                }}
                className="flex-1 py-2 bg-red-700 hover:bg-red-600 text-white rounded text-sm font-semibold"
              >삭제</button>
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
              >취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 랭킹 테이블 */}
      <div className="flex-1 overflow-y-auto" onMouseLeave={() => { setImgOverlay(null); setNameTooltip(null) }}>
        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-500">로딩 중...</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500">
            <p>아직 마스터 랭킹 데이터가 없습니다.</p>
            <p className="text-sm mt-1">마스터 대회를 완료하면 자동으로 집계됩니다.</p>
          </div>
        ) : (
          <>
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col style={{ width: '2.5rem' }} />
                <col style={{ width: '3rem' }} />
                <col style={{ width: '3.5rem' }} />
                <col style={{ width: '4rem' }} />
                <col />
                <col style={{ width: '5.5rem' }} />
                <col style={{ width: '5.5rem' }} />
                <col style={{ width: '5.5rem' }} />
                <col style={{ width: '5rem' }} />
                <col style={{ width: '5.5rem' }} />
              </colgroup>
              <thead className="sticky top-0 bg-gray-900 z-10">
                <tr className="border-b border-gray-700 text-gray-400 text-xs">
                  <th className="px-2 py-2.5 text-center text-gray-400">#</th>
                  <th className="px-2 py-2.5 text-center text-gray-400">순위</th>
                  <th className="px-2 py-2.5 text-center text-gray-400">리그</th>
                  <th className="px-2 py-2.5 text-left text-gray-400">썸네일</th>
                  <th className="px-3 py-2.5 text-left text-gray-400">이름</th>
                  <SortTh col="total_points" label="마스터" subLabel="포인트" subLabelClass="font-normal" />
                  <SortTh col="win_rate" label="우승률" subLabel="(우승/런)" subLabelClass="text-[9px] text-gray-600 font-normal" />
                  <SortTh col="match_win_rate" label="승률" subLabel="(승리/매치)" subLabelClass="text-[9px] text-gray-600 font-normal" />
                  <th className="px-3 py-2.5 text-right text-gray-400 text-xs">
                    <div className="leading-tight">갭<br /><span className="text-[9px] text-gray-600 font-normal">(승-우승)</span></div>
                  </th>
                  <th className="px-3 py-2.5 text-center text-gray-400">추이</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const img = imgPath(row)
                  const lbl = label(row)
                  const medal = RANK_MEDAL[row.rank]
                  const division = getDivision(row.rank, (row as any).master_run_count ?? 0)
                  const prevRank = rankTrends.get(row.id)
                  const winRate = row.total_cups > 0 ? row.cup_wins / row.total_cups * 100 : null
                  const matchWinRate = row.total_matches > 0 ? row.match_wins / row.total_matches * 100 : null
                  let trendBadge: React.ReactNode = <span className="text-gray-700 text-xs">—</span>
                  if (prevRank !== undefined && prevRank !== null) {
                    const delta = prevRank - row.rank
                    if (delta > 0) trendBadge = <span className="text-green-400 text-xs font-medium">▲{delta}</span>
                    else if (delta < 0) trendBadge = <span className="text-red-400 text-xs font-medium">▼{Math.abs(delta)}</span>
                    else trendBadge = <span className="text-gray-500 text-xs">=</span>
                  } else if (prevRank === null && row.total_points > 0) {
                    trendBadge = <span className="text-blue-400 text-xs">NEW</span>
                  }
                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-gray-800 hover:bg-gray-800/40 transition ${row.rank <= 3 ? 'bg-yellow-950/10' : ''}`}
                    >
                      {/* # */}
                      <td className="px-2 py-2 text-center text-gray-600 text-xs">{page * pageSize + idx + 1}</td>
                      {/* 순위 */}
                      <td className="px-2 py-2 text-center">
                        {medal
                          ? <span className="text-base">{medal}</span>
                          : <span className="text-gray-300 text-xs font-medium">{row.rank}</span>
                        }
                      </td>
                      {/* 리그 */}
                      <td className="px-2 py-2 text-center">
                        <span className={`inline-block px-1.5 py-0.5 rounded border text-xs font-medium ${DIV_COLOR[division] ?? ''}`}>
                          {DIV_LABEL[division] ?? `${division}부`}
                        </span>
                      </td>
                      {/* 썸네일 */}
                      <td className="p-0 h-14" onMouseEnter={() => img && setImgOverlay({ path: img })} onMouseLeave={() => setImgOverlay(null)}>
                        {img
                          ? <ImagePreview path={img} alt={lbl} className="w-full h-14 object-cover" objectPosition="center 10%" />
                          : <div className="w-full h-14 bg-gray-700 flex items-center justify-center text-gray-600 text-xs">?</div>
                        }
                      </td>
                      {/* 이름 */}
                      <td className="px-3 py-2 max-w-[160px]">
                        <div className="flex items-start gap-1">
                          <div
                            className="cursor-pointer flex-1 min-w-0"
                            onMouseEnter={e => setNameTooltip({ type: type === 'actor' ? 'actor' : 'work', id: row.id, x: e.clientX, y: e.clientY })}
                            onMouseMove={e => setNameTooltip({ type: type === 'actor' ? 'actor' : 'work', id: row.id, x: e.clientX, y: e.clientY })}
                            onMouseLeave={() => setNameTooltip(null)}
                            onClick={() => type === 'actor' ? onNavigateToActor(row.id) : onNavigateToWork(row.id)}
                          >
                            <p className="text-white font-medium leading-tight truncate hover:underline">{lbl}</p>
                            {row.product_number && row.title && (
                              <p className="text-gray-500 text-xs truncate">{row.product_number}</p>
                            )}
                          </div>
                          <button
                            onClick={e => { e.stopPropagation(); openAnalysisModal(row) }}
                            className="text-gray-600 hover:text-blue-400 text-xs transition shrink-0 mt-0.5 cursor-pointer"
                            title="분석"
                          >📈</button>
                        </div>
                      </td>
                      {/* 마스터 점수 */}
                      <td className="px-3 py-2 text-right">
                        <span className={`font-bold ${row.total_points > 0 ? 'text-green-400' : 'text-gray-600'}`}>
                          {row.total_points.toFixed(1)}
                        </span>
                      </td>
                      {/* 우승률 */}
                      <td
                        className="px-3 py-2 text-right cursor-default"
                        onMouseEnter={e => handleRateHover(e, row, 'win')}
                        onMouseLeave={() => setRateTooltip(null)}
                      >
                        {winRate !== null
                          ? <>
                              <div className="text-yellow-400">{winRate.toFixed(1)}%</div>
                              <div className="text-[11px] text-gray-500">({row.cup_wins}/{row.total_cups})</div>
                            </>
                          : <span className="text-gray-600">—</span>
                        }
                      </td>
                      {/* 승률 */}
                      <td
                        className="px-3 py-2 text-right cursor-default"
                        onMouseEnter={e => handleRateHover(e, row, 'match')}
                        onMouseLeave={() => setRateTooltip(null)}
                      >
                        {matchWinRate !== null
                          ? <>
                              <div className="text-blue-400">{matchWinRate.toFixed(1)}%</div>
                              <div className="text-[11px] text-gray-500">({row.match_wins}/{row.total_matches})</div>
                            </>
                          : <span className="text-gray-600">—</span>
                        }
                      </td>
                      {/* 갭 */}
                      <td className="px-3 py-2 text-right">
                        {winRate !== null && matchWinRate !== null
                          ? (() => {
                              const gap = matchWinRate - winRate
                              return <span className={`font-medium text-xs ${gap >= 10 ? 'text-green-400' : gap <= -10 ? 'text-red-400' : 'text-gray-400'}`}>{gap >= 0 ? '+' : ''}{gap.toFixed(1)}%</span>
                            })()
                          : <span className="text-gray-600">—</span>
                        }
                      </td>
                      {/* 추이 */}
                      <td
                        className="px-3 py-2 text-center cursor-pointer hover:bg-gray-700/50 transition"
                        onClick={e => { e.stopPropagation(); openTrendModal(row) }}
                      >
                        {trendBadge}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* 페이지네이션 */}
            {Math.ceil(total / pageSize) > 1 && (
              <Pagination page={page} totalPages={Math.ceil(total / pageSize)} onPageChange={setPage} />
            )}
          </>
        )}
      </div>

      {/* 썸네일 확대 오버레이 */}
      {imgOverlay && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          {type === 'actor' ? (
            <div className="w-[400px] h-[400px] rounded-lg overflow-hidden shadow-2xl border border-gray-600">
              <ImagePreview path={imgOverlay.path} alt="" className="w-full h-full object-cover" objectPosition="center 10%" />
            </div>
          ) : (
            <div className="rounded-lg overflow-hidden shadow-2xl border border-gray-600" style={{ width: 650 }}>
              <ImagePreview path={imgOverlay.path} alt="" className="w-full object-contain" />
            </div>
          )}
        </div>
      )}

      {/* 이름 CardTooltip */}
      {nameTooltip && <CardTooltip tooltip={nameTooltip} />}

      {/* 포맷별 통계 툴팁 */}
      {rateTooltip && formatStatsCache.current.has(rateTooltip.itemId) && (() => {
        const stats = formatStatsCache.current.get(rateTooltip.itemId)!
        const FORMAT_LABEL: Record<string, string> = { worldcup: '월드컵', tournament: '토너먼트', league: '리그전' }
        const formats = (['worldcup', 'tournament', 'league'] as const).filter(f => stats.some(s => s.format === f))
        if (formats.length === 0) return null
        return (
          <div
            className="fixed z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-xl pointer-events-none"
            style={{ top: rateTooltip.top, left: rateTooltip.left, transform: 'translateX(-50%)' }}
          >
            <div className="grid gap-px bg-gray-600 rounded-lg overflow-hidden" style={{ gridTemplateColumns: `repeat(${formats.length}, minmax(80px, 1fr))` }}>
              {formats.map((fmt) => {
                const s = stats.find(x => x.format === fmt)!
                const rate = rateTooltip.statType === 'win'
                  ? (s.total_cups > 0 ? s.cup_wins / s.total_cups * 100 : null)
                  : (s.total_matches > 0 ? s.match_wins / s.total_matches * 100 : null)
                const wins = rateTooltip.statType === 'win' ? s.cup_wins : s.match_wins
                const tot = rateTooltip.statType === 'win' ? s.total_cups : s.total_matches
                return (
                  <div key={fmt} className="bg-gray-800 px-3 py-2 text-center">
                    <div className="text-gray-400 text-xs mb-1">{FORMAT_LABEL[fmt]}</div>
                    <div className={`text-sm font-semibold ${rateTooltip.statType === 'win' ? 'text-yellow-400' : 'text-blue-400'}`}>
                      {rate !== null ? `${rate.toFixed(1)}%` : '—'}
                    </div>
                    <div className="text-gray-500 text-xs">({wins}/{tot})</div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* 순위 추이 모달 */}
      {trendModal && (() => {
        const history = trendHistory ?? []
        const W = 420, H = 180, PX = 36, PY = 16
        const ranks = history.map(h => h.rank)
        const minR = ranks.length ? Math.min(...ranks) : 1
        const maxR = ranks.length ? Math.max(...ranks) : 1
        const range = maxR - minR || 1
        const pts = history.map((h, i) => {
          const x = PX + (history.length > 1 ? i / (history.length - 1) : 0.5) * (W - PX * 2)
          const y = PY + ((h.rank - minR) / range) * (H - PY * 2)
          return { x, y, rank: h.rank }
        })
        const polyPts = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
        const last = ranks[ranks.length - 1] ?? 0
        const prev = ranks[ranks.length - 2] ?? last
        const color = last < prev ? '#4ade80' : last > prev ? '#f87171' : '#9ca3af'
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setTrendModal(null)}>
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700" style={{ width: W + 80 }} onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4">
                {trendModal.img && (
                  <div className="w-10 h-10 rounded overflow-hidden shrink-0">
                    <ImagePreview path={trendModal.img} alt={trendModal.lbl} className="w-full h-full object-cover" objectPosition="center 10%" />
                  </div>
                )}
                <p className="text-white font-bold flex-1 truncate">{trendModal.lbl} 마스터 순위 추이</p>
                <button onClick={() => setTrendModal(null)} className="text-gray-400 hover:text-white text-sm ml-2 shrink-0">✕</button>
              </div>
              {trendHistory === null ? (
                <p className="text-gray-500 text-sm text-center py-8">로딩 중...</p>
              ) : history.length < 2 ? (
                <p className="text-gray-500 text-sm text-center py-8">추이 데이터가 부족합니다.</p>
              ) : (
                <svg width={W} height={H} className="overflow-visible">
                  {Array.from(new Set([minR, maxR])).map(r => {
                    const y = PY + ((r - minR) / range) * (H - PY * 2)
                    return (
                      <g key={r}>
                        <line x1={PX} y1={y} x2={W - PX} y2={y} stroke="#374151" strokeDasharray="3,3" />
                        <text x={PX - 6} y={y + 4} fill="#9ca3af" fontSize="11" textAnchor="end">{r}위</text>
                      </g>
                    )
                  })}
                  <polyline points={polyPts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
                  {pts.map((p, i) => (
                    <g key={i}>
                      <circle cx={p.x} cy={p.y} r="4" fill={color} />
                      <text x={p.x} y={p.y - 8} fill="#e5e7eb" fontSize="11" textAnchor="middle">{p.rank}위</text>
                    </g>
                  ))}
                </svg>
              )}
              <p className="text-gray-500 text-xs mt-3 text-right">최근 {history.length}회 기록</p>
            </div>
          </div>
        )
      })()}
      {/* 분석 모달 */}
      {analysisModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => { setAnalysisModal(null); setH2hDivDropdown(false) }}>
          <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-2xl flex flex-col" style={{ width: 560, maxHeight: '80vh' }} onClick={e => e.stopPropagation()}>
            {/* 헤더 */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-700 shrink-0">
              {analysisModal.img && (
                <div className="w-9 h-9 rounded overflow-hidden shrink-0">
                  <ImagePreview path={analysisModal.img} alt={analysisModal.lbl} className="w-full h-full object-cover" objectPosition="center 10%" />
                </div>
              )}
              <p className="text-white font-bold flex-1 truncate">{analysisModal.lbl}</p>
              <button onClick={() => setAnalysisModal(null)} className="text-gray-400 hover:text-white text-sm transition shrink-0">✕</button>
            </div>
            {/* 탭 */}
            <div className="flex border-b border-gray-700 shrink-0">
              {(['h2h', 'divhist'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => switchAnalysisTab(tab)}
                  className={`px-5 py-2.5 text-sm font-medium transition border-b-2 ${analysisTab === tab ? 'border-blue-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
                >
                  {tab === 'h2h' ? '상대 전적' : '리그 이력'}
                </button>
              ))}
            </div>
            {/* 탭 내용 */}
            <div className="flex-1 overflow-y-auto">
              {analysisTab === 'h2h' && (() => {
                if (h2hLoading) return <div className="p-4"><p className="text-gray-500 text-sm text-center py-8">로딩 중...</p></div>
                if (!h2hData || h2hData.length === 0) return <div className="p-4"><p className="text-gray-500 text-sm text-center py-8">상대 전적 데이터가 없습니다.</p></div>

                const getWinRateColor = (rate: number, total: number) => {
                  if (total < 5) return 'text-gray-500'
                  if (rate >= 80) return 'text-emerald-400'
                  if (rate >= 60) return 'text-blue-400'
                  if (rate >= 40) return 'text-gray-200'
                  if (rate >= 20) return 'text-orange-400'
                  return 'text-red-400'
                }
                const getWinRateLabel = (rate: number, total: number) => {
                  if (total < 5) return null
                  if (rate >= 80) return '초강세'
                  if (rate >= 60) return '강세'
                  if (rate >= 40) return '비등'
                  if (rate >= 20) return '약세'
                  return '초약세'
                }

                const handleH2hSort = (col: typeof h2hSort.col) => {
                  setH2hSort(prev => prev.col === col ? { col, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { col, dir: col === 'name' || col === 'div' ? 'asc' : 'desc' })
                }

                // 존재하는 부 목록
                const existingDivs = [...new Set(
                  h2hData.map(r => r.opp_rank != null ? getDivision(r.opp_rank, 1) : 0)
                )].sort((a, b) => a - b)

                const filtered = h2hDivFilter !== null
                  ? h2hData.filter(r => getDivision(r.opp_rank ?? 9999, r.opp_rank != null ? 1 : 0) === h2hDivFilter)
                  : h2hData

                const sorted = [...filtered].sort((a, b) => {
                  const dir = h2hSort.dir === 'asc' ? 1 : -1
                  if (h2hSort.col === 'name') {
                    const na = a.name ?? a.title ?? a.product_number ?? ''
                    const nb = b.name ?? b.title ?? b.product_number ?? ''
                    return na.localeCompare(nb) * dir
                  }
                  if (h2hSort.col === 'div') {
                    const da = getDivision(a.opp_rank ?? 9999, a.opp_rank != null ? 1 : 0)
                    const db = getDivision(b.opp_rank ?? 9999, b.opp_rank != null ? 1 : 0)
                    return (da - db) * dir
                  }
                  if (h2hSort.col === 'total') return (a.total - b.total) * dir
                  if (h2hSort.col === 'wins') return (a.wins - b.wins) * dir
                  if (h2hSort.col === 'losses') return (a.losses - b.losses) * dir
                  if (h2hSort.col === 'rate') {
                    const ra = a.total > 0 ? a.wins / a.total : -1
                    const rb = b.total > 0 ? b.wins / b.total : -1
                    return (ra - rb) * dir
                  }
                  return 0
                })

                const SortIcon = ({ col }: { col: typeof h2hSort.col }) =>
                  h2hSort.col === col
                    ? <span className="text-[9px]">{h2hSort.dir === 'desc' ? '▼' : '▲'}</span>
                    : <span className="text-[9px] text-gray-700">▼</span>

                return (
                  <table className="w-full table-fixed text-xs">
                    <colgroup>
                      <col style={{ width: '2.5rem' }} />
                      <col style={{ width: '3.5rem' }} />
                      <col />
                      <col style={{ width: '2.8rem' }} />
                      <col style={{ width: '2.8rem' }} />
                      <col style={{ width: '2.8rem' }} />
                      <col style={{ width: '5rem' }} />
                    </colgroup>
                    <thead className="sticky top-0 bg-gray-800 z-10">
                      <tr className="border-b border-gray-700 text-gray-400">
                        <th className="px-1 py-2 text-center"></th>
                        <th className="px-1 py-2 text-center relative">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              className={`hover:text-white transition text-xs ${h2hDivFilter !== null ? 'text-blue-400' : ''}`}
                              onClick={() => setH2hDivDropdown(v => !v)}
                            >
                              리그{h2hDivFilter !== null ? `(${h2hDivFilter}부)` : ''}
                            </button>
                            <button
                              className="hover:text-white transition"
                              onClick={() => handleH2hSort('div')}
                            >
                              <SortIcon col="div" />
                            </button>
                          </div>
                          {h2hDivDropdown && (
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-gray-900 border border-gray-600 rounded-lg shadow-xl z-20 py-1 min-w-20" onClick={e => e.stopPropagation()}>
                              <button
                                className={`w-full px-3 py-1.5 text-left text-xs hover:bg-gray-700 transition ${h2hDivFilter === null ? 'text-blue-400' : 'text-gray-300'}`}
                                onClick={() => { setH2hDivFilter(null); setH2hDivDropdown(false) }}
                              >전체</button>
                              {existingDivs.map(d => (
                                <button
                                  key={d}
                                  className={`w-full px-3 py-1.5 text-left text-xs hover:bg-gray-700 transition ${h2hDivFilter === d ? 'text-blue-400' : 'text-gray-300'}`}
                                  onClick={() => { setH2hDivFilter(d); setH2hDivDropdown(false) }}
                                >
                                  {DIV_LABEL[d] ?? `${d}부`}
                                </button>
                              ))}
                            </div>
                          )}
                        </th>
                        <th className="px-2 py-2 text-left cursor-pointer hover:text-white select-none" onClick={() => handleH2hSort('name')}>
                          <span className="flex items-center gap-0.5">이름 <SortIcon col="name" /></span>
                        </th>
                        <th className="px-1 py-2 text-right cursor-pointer hover:text-white select-none" onClick={() => handleH2hSort('total')}>
                          <span className="flex items-center justify-end gap-0.5">전 <SortIcon col="total" /></span>
                        </th>
                        <th className="px-1 py-2 text-right cursor-pointer hover:text-white select-none" onClick={() => handleH2hSort('wins')}>
                          <span className="flex items-center justify-end gap-0.5">승 <SortIcon col="wins" /></span>
                        </th>
                        <th className="px-1 py-2 text-right cursor-pointer hover:text-white select-none" onClick={() => handleH2hSort('losses')}>
                          <span className="flex items-center justify-end gap-0.5">패 <SortIcon col="losses" /></span>
                        </th>
                        <th className="px-2 py-2 text-right cursor-pointer hover:text-white select-none" onClick={() => handleH2hSort('rate')}>
                          <span className="flex items-center justify-end gap-0.5">승률 <SortIcon col="rate" /></span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map(row => {
                        const oppName = row.name ?? row.title ?? row.product_number ?? `#${row.opp_id}`
                        const oppImg = row.photo_path ?? row.cover_path ?? null
                        const winRate = row.total > 0 ? row.wins / row.total * 100 : 0
                        const division = row.opp_rank != null ? getDivision(row.opp_rank, 1) : 0
                        return (
                          <tr key={row.opp_id} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition">
                            <td className="p-0 h-10">
                              {oppImg
                                ? <ImagePreview path={oppImg} alt={oppName} className="w-full h-10 object-cover" objectPosition="center 10%" />
                                : <div className="w-full h-10 bg-gray-700 flex items-center justify-center text-gray-600">?</div>
                              }
                            </td>
                            <td className="px-1 py-1 text-center">
                              <span className={`inline-block px-1 py-0.5 rounded border text-[10px] font-medium ${DIV_COLOR[division] ?? ''}`}>
                                {DIV_LABEL[division] ?? '—'}
                              </span>
                            </td>
                            <td className="px-2 py-1 text-white truncate max-w-0">{oppName}</td>
                            <td className="px-1 py-1 text-right text-gray-300">{row.total}</td>
                            <td className="px-1 py-1 text-right text-green-400">{row.wins}</td>
                            <td className="px-1 py-1 text-right text-red-400">{row.losses}</td>
                            <td className="px-2 py-1 text-right">
                              <span className={`font-medium ${getWinRateColor(winRate, row.total)}`}>
                                {winRate.toFixed(1)}%
                              </span>
                              {getWinRateLabel(winRate, row.total) && (
                                <span className={`ml-1 text-[9px] ${getWinRateColor(winRate, row.total)}`}>
                                  {getWinRateLabel(winRate, row.total)}
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )
              })()}
              {analysisTab === 'divhist' && (() => {
                if (divHistLoading) return <div className="p-4"><p className="text-gray-500 text-sm text-center py-8">로딩 중...</p></div>
                if (!divHistData || divHistData.length === 0) return <div className="p-4"><p className="text-gray-500 text-sm text-center py-8">리그 이력 데이터가 없습니다.</p></div>
                const W = 480, H = 200, PX = 40, PY = 20
                const maxDiv = 6
                const pts = divHistData.map((h, i) => {
                  const divRank = getDivision(h.rank, divHistData.length)
                  const x = PX + (divHistData.length > 1 ? i / (divHistData.length - 1) : 0.5) * (W - PX * 2)
                  const y = PY + ((divRank - 1) / (maxDiv - 1)) * (H - PY * 2)
                  return { x, y, div: divRank, rank: h.rank, pts: h.total_points, date: h.recorded_at }
                })
                const polyPts = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
                const first = pts[0]?.div ?? 1
                const last = pts[pts.length - 1]?.div ?? 1
                const lineColor = last < first ? '#4ade80' : last > first ? '#f87171' : '#60a5fa'
                return (
                  <div className="p-4">
                    <p className="text-gray-400 text-xs mb-3 text-center">1부(최상위) → 6부(최하위) 기준 리그 이력 ({divHistData.length}회)</p>
                    <svg width={W} height={H} className="overflow-visible">
                      {[1,2,3,4,5,6].map(d => {
                        const y = PY + ((d - 1) / (maxDiv - 1)) * (H - PY * 2)
                        return (
                          <g key={d}>
                            <line x1={PX} y1={y} x2={W - PX} y2={y} stroke="#374151" strokeDasharray="3,3" />
                            <text x={PX - 6} y={y + 4} fill="#9ca3af" fontSize="10" textAnchor="end">{d}부</text>
                          </g>
                        )
                      })}
                      <polyline points={polyPts} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" />
                      {pts.map((p, i) => {
                        const prev = pts[i - 1]?.div
                        const promoted = prev !== undefined && p.div < prev
                        const relegated = prev !== undefined && p.div > prev
                        return (
                          <g key={i}>
                            <circle cx={p.x} cy={p.y} r={promoted || relegated ? 5 : 3}
                              fill={promoted ? '#4ade80' : relegated ? '#f87171' : lineColor}
                              stroke={promoted || relegated ? '#1f2937' : 'none'} strokeWidth="1.5"
                            />
                            {(promoted || relegated) && (
                              <text x={p.x} y={p.y - 10} fill={promoted ? '#4ade80' : '#f87171'} fontSize="10" textAnchor="middle">
                                {promoted ? '▲' : '▼'}
                              </text>
                            )}
                          </g>
                        )
                      })}
                    </svg>
                    <div className="mt-3 flex items-center gap-4 text-xs text-gray-500 justify-center">
                      <span><span className="text-green-400">▲</span> 승격</span>
                      <span><span className="text-red-400">▼</span> 강등</span>
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function Worldcup({
  onNavigateToActor,
  onNavigateToWork,
}: {
  onNavigateToActor: (id: number) => void
  onNavigateToWork: (id: number) => void
}) {
  const [view, setView] = useState<'list' | 'play' | 'ranking' | 'tournament-rankings'>('list')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedRunId, setSelectedRunId] = useState<number | undefined>(undefined)
  const [selectedTab, setSelectedTab] = useState<'match' | 'standings'>('match')
  const [selectedRankId, setSelectedRankId] = useState<number | null>(null)
  const [tournaments, setTournaments] = useState<CupTournament[]>([])
  const [typeFilter, setTypeFilter] = useState<'all' | 'actor' | 'work'>(() => (localStorage.getItem('cup:typeFilter') as 'all' | 'actor' | 'work') || 'all')
  const [formatFilter, setFormatFilter] = useState<'all' | 'tournament' | 'league' | 'worldcup'>(() => (localStorage.getItem('cup:formatFilter') as 'all' | 'tournament' | 'league' | 'worldcup') || 'all')
  const [masterFilter, setMasterFilter] = useState<'all' | 'master' | 'normal'>(() => (localStorage.getItem('cup:masterFilter') as 'all' | 'master' | 'normal') || 'all')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'created_at' | 'name'>(() => (localStorage.getItem('cup:sortBy') as 'created_at' | 'name') || 'created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => (localStorage.getItem('cup:sortDir') as 'asc' | 'desc') || 'desc')
  const [showCreate, setShowCreate] = useState(false)
  const [statsModalId, setStatsModalId] = useState<number | null>(null)
  const [statsData, setStatsData] = useState<{ total_runs: number; completed_runs: number; last_run_at: string | null; participated_items: number; run_dist: { run_count: number; count: number }[] } | null>(null)
  const [statsName, setStatsName] = useState('')

  const loadList = useCallback(async () => {
    const params: Record<string, unknown> = { sortBy, sortDir }
    if (typeFilter !== 'all') params.type = typeFilter
    if (formatFilter !== 'all') params.format = formatFilter
    if (masterFilter === 'master') params.isMaster = true
    if (masterFilter === 'normal') params.isMaster = false
    if (search) params.search = search
    const list = await cupApi.list(params) as CupTournament[]
    setTournaments(list)
  }, [typeFilter, formatFilter, masterFilter, search, sortBy, sortDir])

  useEffect(() => { loadList() }, [loadList])

  useEffect(() => { localStorage.setItem('cup:typeFilter', typeFilter) }, [typeFilter])
  useEffect(() => { localStorage.setItem('cup:formatFilter', formatFilter) }, [formatFilter])
  useEffect(() => { localStorage.setItem('cup:masterFilter', masterFilter) }, [masterFilter])
  useEffect(() => { localStorage.setItem('cup:sortBy', sortBy) }, [sortBy])
  useEffect(() => { localStorage.setItem('cup:sortDir', sortDir) }, [sortDir])

  const handleDelete = async (id: number) => {
    await cupApi.delete(id)
    loadList()
  }

  const handlePlay = (id: number, runId?: number, tab: 'match' | 'standings' = 'match') => {
    setSelectedId(id)
    setSelectedRunId(runId)
    setSelectedTab(tab)
    setView('play')
  }

  const handleRankings = (id: number) => {
    setSelectedRankId(id)
    setView('tournament-rankings')
  }

  const handleStats = (id: number) => {
    const t = tournaments.find(x => x.id === id)
    setStatsName(t?.name ?? '')
    setStatsModalId(id)
    setStatsData(null)
    cupApi.tournamentStats(id).then(data => setStatsData(data))
  }

  if (view === 'play' && selectedId !== null) {
    return (
      <PlayView
        tournamentId={selectedId}
        runId={selectedRunId}
        initialTab={selectedTab}
        onBack={() => { setView('list'); loadList() }}
        onRankings={(id) => { setSelectedRankId(id); setView('tournament-rankings') }}
        onNavigateToActor={onNavigateToActor}
        onNavigateToWork={onNavigateToWork}
      />
    )
  }

  if (view === 'ranking') {
    return (
      <MasterRankingView
        onBack={() => setView('list')}
        onNavigateToActor={onNavigateToActor}
        onNavigateToWork={onNavigateToWork}
      />
    )
  }

  if (view === 'tournament-rankings' && selectedRankId !== null) {
    return (
      <TournamentRankingsView
        tournamentId={selectedRankId}
        onBack={() => { setView('list'); loadList() }}
        onPlay={(runId, tab) => { setSelectedId(selectedRankId); setSelectedRunId(runId); setSelectedTab(tab); setView('play') }}
        onNavigateToActor={onNavigateToActor}
        onNavigateToWork={onNavigateToWork}
      />
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 상단 바 */}
      <div className="p-4 shrink-0">
        <div className="flex items-center">
          {/* 정렬박스 */}
          <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5">
            <select
              value={sortBy}
              onChange={e => { const v = e.target.value as typeof sortBy; setSortBy(v); localStorage.setItem('cup:sortBy', v) }}
              className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-28"
            >
              <option value="created_at">등록순</option>
              <option value="name">대회명</option>
            </select>
            <button
              onClick={() => { const next = sortDir === 'asc' ? 'desc' : 'asc'; setSortDir(next); localStorage.setItem('cup:sortDir', next) }}
              className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-2 py-1.5 rounded"
            >
              {sortDir === 'asc' ? '↑' : '↓'}
            </button>
          </div>

          {/* 검색박스 */}
          <div className="w-[38rem] shrink-0 flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5 ml-2">
            <input
              className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded flex-1 min-w-0 outline-none placeholder-gray-500"
              placeholder="대회명 검색"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as 'all' | 'actor' | 'work')}
              className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-26"
            >
              <option value="all">배우+작품</option>
              <option value="actor">배우</option>
              <option value="work">작품</option>
            </select>
            <select
              value={formatFilter}
              onChange={e => setFormatFilter(e.target.value as 'all' | 'tournament' | 'league' | 'worldcup')}
              className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-26"
            >
              <option value="all">대회 전체</option>
              <option value="tournament">토너먼트</option>
              <option value="league">리그전</option>
              <option value="worldcup">월드컵</option>
            </select>
            <select
              value={masterFilter}
              onChange={e => setMasterFilter(e.target.value as 'all' | 'master' | 'normal')}
              className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-30"
            >
              <option value="all">마스터+일반</option>
              <option value="master">마스터</option>
              <option value="normal">일반</option>
            </select>
            <button
              onClick={() => { setSearch(''); setTypeFilter('all'); setFormatFilter('all'); setMasterFilter('all') }}
              className="px-3 py-1.5 rounded text-sm bg-gray-600 hover:bg-gray-500 text-gray-300 shrink-0"
            >
              초기화
            </button>
          </div>

          {/* 액션 그룹 */}
          <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5 ml-2">
            <button
              onClick={() => setShowCreate(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-sm"
            >
              + 대회 등록
            </button>
            <button
              onClick={() => setView('ranking')}
              className="bg-yellow-600 hover:bg-yellow-500 text-white px-3 py-1.5 rounded text-sm"
            >
              ★ 마스터 랭킹
            </button>
          </div>
        </div>
      </div>

      {/* 대회 목록 */}
      <div className="flex-1 overflow-y-auto p-4 pt-0">
        {tournaments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-500">
            <p className="text-lg mb-1">대회가 없습니다</p>
            <p className="text-sm">새 대회를 만들어 시작하세요</p>
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-3">
            {tournaments.map(t => (
              <TournamentCard
                key={t.id}
                t={t}
                onPlay={(runId, tab) => handlePlay(t.id, runId, tab)}
                onRankings={handleRankings}
                onStats={handleStats}
                onDelete={() => handleDelete(t.id)}
                onUpdate={loadList}
              />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={t => {
            setShowCreate(false)
            loadList()
          }}
        />
      )}

      {statsModalId !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setStatsModalId(null)}>
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 w-[640px] max-w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-bold text-base">{statsName} 통계</h3>
              <button onClick={() => setStatsModalId(null)} className="text-gray-400 hover:text-white text-lg leading-none">✕</button>
            </div>

            {statsData === null ? (
              <div className="flex items-center justify-center h-32 text-gray-500 text-sm">로딩 중...</div>
            ) : (
              <>
                {/* 런 통계 */}
                <div className="mb-4">
                  <p className="text-gray-400 text-xs mb-2 font-semibold uppercase tracking-wide">대회 현황</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-gray-700 rounded-lg p-3 text-center">
                      <p className="text-gray-400 text-xs mb-1">전체 런</p>
                      <p className="text-white text-xl font-bold">{statsData.total_runs}</p>
                    </div>
                    <div className="bg-gray-700 rounded-lg p-3 text-center">
                      <p className="text-gray-400 text-xs mb-1">완료</p>
                      <p className="text-white text-xl font-bold">{statsData.completed_runs}</p>
                    </div>
                    <div className="bg-gray-700 rounded-lg p-3 text-center">
                      <p className="text-gray-400 text-xs mb-1">마지막 런</p>
                      <p className="text-white text-sm font-bold">{statsData.last_run_at ? statsData.last_run_at.slice(0, 10) : '-'}</p>
                    </div>
                  </div>
                </div>

                {/* 참가자 통계 */}
                <div className="mb-5">
                  <p className="text-gray-400 text-xs mb-2 font-semibold uppercase tracking-wide">참가자 통계</p>
                  <div className="grid grid-cols-1 gap-3">
                    <div className="bg-gray-700 rounded-lg p-3 text-center">
                      <p className="text-gray-400 text-xs mb-1">참가 고유 항목</p>
                      <p className="text-white text-xl font-bold">{statsData.participated_items}</p>
                    </div>
                  </div>
                </div>

                {/* 참가 횟수 분포 차트 */}
                <div>
                  <p className="text-gray-400 text-xs mb-2 font-semibold uppercase tracking-wide">
                    참가 횟수 분포 <span className="text-gray-600 normal-case">(X: 참가 횟수, Y: 항목 수)</span>
                  </p>
                  <div className="bg-gray-700 rounded-lg p-3">
                    <RunDistChart data={statsData.run_dist} />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
