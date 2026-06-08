import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { actorsApi } from '../api'
import ImagePreview from '../components/ImagePreview'
import { calcPhysicalScore, computeStats, loadSettings, type ActorPhysicalData, type PhysicalSettings } from '../components/PhysicalCorrectionModal'
import CardTooltip, { type TooltipState } from '../components/CardTooltip'

type RankBy =
  | 'work_count' | 'fav_work_count' | 'avg_score' | 'physScore'
  | 'height' | 'bust' | 'waist' | 'hip' | 'cup'
  | 'face' | 'score_bust' | 'score_hip' | 'physical' | 'skin'
  | 'acting' | 'sexy' | 'charm' | 'technique' | 'proportions'

type ExcludeMode = 'include' | 'exclude'

const RANK_ITEMS: { value: RankBy; label: string }[] = [
  { value: 'work_count',     label: '작품수' },
  { value: 'fav_work_count', label: '찜' },
  { value: 'avg_score',      label: '평점' },
  { value: 'physScore',      label: '피지컬' },
  { value: 'height',         label: '키' },
  { value: 'bust',           label: '바스트' },
  { value: 'waist',          label: '웨이스트' },
  { value: 'hip',            label: '힙' },
  { value: 'cup',            label: '컵' },
  { value: 'face',           label: '얼굴' },
  { value: 'score_bust',     label: '가슴' },
  { value: 'score_hip',      label: '엉덩이' },
  { value: 'physical',       label: '몸매' },
  { value: 'skin',           label: '피부' },
  { value: 'acting',         label: '연기력' },
  { value: 'sexy',           label: '섹기' },
  { value: 'charm',          label: '매력' },
  { value: 'technique',      label: '테크닉' },
  { value: 'proportions',    label: '비율' },
]

const CUP_ORDER = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z']
function cupToNum(cup: string): number { return CUP_ORDER.indexOf(cup.toUpperCase()) }

const profileKeyMap: Partial<Record<RankBy, keyof PhysicalSettings['profile']>> = {
  height: 'height', bust: 'bust', waist: 'waist', hip: 'hip', cup: 'cup',
}
const scoreKeyMap: Partial<Record<RankBy, keyof PhysicalSettings['score']>> = {
  face: 'face', score_bust: 'bust', score_hip: 'hip', physical: 'physical',
  skin: 'skin', acting: 'acting', sexy: 'sexy', charm: 'charm',
  technique: 'technique', proportions: 'proportions',
}

function avgScore(a: ActorPhysicalData): number {
  return (a.face + a.score_bust + a.score_hip + a.physical + a.skin + a.acting + a.sexy + a.charm + a.technique + a.proportions) / 13
}

interface Props {
  onNavigateToActor: (id: number) => void
}

type ScoredActor = ActorPhysicalData & { physScore: number | null }

function ActorRankCard({ actor, rank, subtitle, imgClassName = 'w-full h-20', onClick, onMouseMove, onMouseLeave }: {
  actor: ScoredActor
  rank: number
  subtitle: string
  imgClassName?: string
  onClick: () => void
  onMouseMove?: (e: React.MouseEvent) => void
  onMouseLeave?: () => void
}) {
  return (
    <div onClick={onClick} className="cursor-pointer rounded-lg overflow-hidden border border-gray-700 hover:border-gray-500">
      <div className="relative" onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
        <span className="absolute top-0.5 left-0.5 bg-black/70 text-white text-sm px-1.5 py-0.5 rounded z-10 leading-tight font-bold">{rank}</span>
        <ImagePreview path={actor.photo_path} alt={actor.name} className={imgClassName} objectPosition="center 10%" />
      </div>
      <div className="p-1 bg-gray-800">
        <p className="text-xs font-bold text-white truncate">{actor.name}</p>
        <p className="text-xs text-yellow-400 truncate">{subtitle}</p>
      </div>
    </div>
  )
}

export default function Ranking({ onNavigateToActor }: Props) {
  const [actors, setActors] = useState<ActorPhysicalData[]>([])
  const [settings, setSettings] = useState<PhysicalSettings>(loadSettings())
  const [rankBy, setRankBy] = useState<RankBy>(() => {
    const idx = parseInt(sessionStorage.getItem('ranking:rotateIndex') ?? '-1')
    const next = (idx + 1) % RANK_ITEMS.length
    sessionStorage.setItem('ranking:rotateIndex', String(next))
    return RANK_ITEMS[next].value
  })
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(
    () => (localStorage.getItem('ranking:sortDir') as 'asc' | 'desc') || 'desc'
  )
  const [excludeMode, setExcludeMode] = useState<ExcludeMode>(
    () => (localStorage.getItem('ranking:excludeMode') as ExcludeMode) || 'include'
  )
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const loadData = useCallback(async () => {
    const data = await actorsApi.physicalData() as ActorPhysicalData[]
    setActors(data)
  }, [])

  useEffect(() => {
    loadData()
    const handler = () => setSettings(loadSettings())
    window.addEventListener('physicalSettingsChange', handler)
    return () => window.removeEventListener('physicalSettingsChange', handler)
  }, [loadData])

  const stats = useMemo(() => computeStats(actors), [actors])

  const ranked = useMemo((): ScoredActor[] => {
    const isNeg = profileKeyMap[rankBy]
      ? settings.profile[profileKeyMap[rankBy]!].dir === 'N'
      : scoreKeyMap[rankBy]
        ? settings.score[scoreKeyMap[rankBy]!].dir === 'N'
        : false
    const effectiveDir = isNeg ? (sortDir === 'desc' ? 'asc' : 'desc') : sortDir

    const getVal = (a: ScoredActor): number | null => {
      if (rankBy === 'work_count')     return a.work_count
      if (rankBy === 'fav_work_count') return a.fav_work_count
      if (rankBy === 'avg_score')      return avgScore(a)
      if (rankBy === 'physScore')      return a.physScore
      if (rankBy === 'height')         return a.height
      if (rankBy === 'bust')           return a.bust
      if (rankBy === 'waist')          return a.waist
      if (rankBy === 'hip')            return a.hip
      if (rankBy === 'cup')            return a.cup ? cupToNum(a.cup) : null
      return a[rankBy as keyof ActorPhysicalData] as number
    }

    return actors
      .map(a => ({ ...a, physScore: calcPhysicalScore(a, settings, stats) }))
      .filter(a => rankBy !== 'physScore' || a.physScore != null)
      .filter(a => excludeMode === 'include' || !a.score_excluded)
      .sort((a, b) => {
        const av = getVal(a)
        const bv = getVal(b)
        if (av == null && bv == null) return 0
        if (av == null) return 1
        if (bv == null) return -1
        const primary = effectiveDir === 'desc' ? bv - av : av - bv
        if (primary !== 0) return primary
        const secondary = sortDir === 'desc' ? avgScore(b) - avgScore(a) : avgScore(a) - avgScore(b)
        if (secondary !== 0) return secondary
        return sortDir === 'desc' ? b.work_count - a.work_count : a.work_count - b.work_count
      })
  }, [actors, settings, stats, rankBy, sortDir, excludeMode])

  const getSubtitle = (a: ScoredActor): string => {
    if (rankBy === 'work_count')     return `${a.work_count}편`
    if (rankBy === 'fav_work_count') return `♥ ${a.fav_work_count}편`
    if (rankBy === 'avg_score')      return `${avgScore(a).toFixed(2)}점`
    if (rankBy === 'physScore')      return `${(a.physScore ?? 0).toFixed(2)}점`
    if (rankBy === 'height')         return `${a.height ?? '-'}cm`
    if (rankBy === 'bust')           return `${a.bust ?? '-'}cm`
    if (rankBy === 'waist')          return `${a.waist ?? '-'}cm`
    if (rankBy === 'hip')            return `${a.hip ?? '-'}cm`
    if (rankBy === 'cup')            return `${a.cup ?? '-'}`
    return `${(a[rankBy as keyof ActorPhysicalData] as number) ?? '-'}점`
  }

  const currentLabel = RANK_ITEMS.find(i => i.value === rankBy)?.label ?? ''
  const title = `${currentLabel} 랭킹`
  const top5 = ranked.slice(0, 5)
  const rest = ranked.slice(5)

  return (
    <div className="h-full flex flex-col">
      {/* 정렬바 */}
      <div className="p-4 pb-2">
        <div className="flex items-center">
        <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5">
          <select
            value={rankBy}
            onChange={e => {
              const v = e.target.value as RankBy
              setRankBy(v)
              localStorage.setItem('ranking:rankBy', v)
            }}
            className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded"
          >
            {RANK_ITEMS.map(item => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
          <div className="flex">
            <button
              onClick={() => { setExcludeMode('include'); localStorage.setItem('ranking:excludeMode', 'include') }}
              className={`text-sm px-3 py-1.5 rounded-l border-r border-gray-600 ${excludeMode === 'include' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >포함</button>
            <button
              onClick={() => { setExcludeMode('exclude'); localStorage.setItem('ranking:excludeMode', 'exclude') }}
              className={`text-sm px-3 py-1.5 rounded-r ${excludeMode === 'exclude' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >제외</button>
          </div>
          <button
            onClick={() => {
              const next = sortDir === 'desc' ? 'asc' : 'desc'
              setSortDir(next)
              localStorage.setItem('ranking:sortDir', next)
            }}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-2 py-1.5 rounded"
          >
            {sortDir === 'desc' ? '↓정순' : '↑역순'}
          </button>
        </div>
        </div>
      </div>

      {/* 타이틀 */}
      <div className="px-4 pb-3 flex items-center gap-2">
        <h2 className="text-white font-bold text-base">{title}</h2>
        <span className="text-xs text-gray-500">{ranked.length}명</span>
      </div>

      {/* 랭킹 목록 */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {ranked.length === 0 && (
          <p className="text-gray-500 text-sm">데이터가 없습니다</p>
        )}
        {/* 1~5위: 5-grid */}
        {top5.length > 0 && (
          <div className="grid grid-cols-5 gap-2">
            {top5.map((a, i) => (
              <ActorRankCard
                key={a.id}
                actor={a}
                rank={i + 1}
                subtitle={getSubtitle(a)}
                imgClassName="w-full h-40"
                onClick={() => onNavigateToActor(a.id)}
                onMouseMove={e => setTooltip({ type: 'actor', id: a.id, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setTooltip(null)}
              />
            ))}
          </div>
        )}
        {/* 6위~: 10-grid */}
        {rest.length > 0 && (
          <div className="grid grid-cols-10 gap-2">
            {rest.map((a, i) => (
              <ActorRankCard
                key={a.id}
                actor={a}
                rank={i + 6}
                subtitle={getSubtitle(a)}
                onClick={() => onNavigateToActor(a.id)}
                onMouseMove={e => setTooltip({ type: 'actor', id: a.id, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setTooltip(null)}
              />
            ))}
          </div>
        )}
      </div>

      {tooltip && <CardTooltip tooltip={tooltip} />}
    </div>
  )
}
