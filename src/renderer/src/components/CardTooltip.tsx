import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import type { Actor, Work } from '../types'
import { actorsApi, worksApi } from '../api'
import { calcPhysicalScore, computeStats, loadSettings, type ActorPhysicalData, type PhysicalStats } from './PhysicalCorrectionModal'

// ---------- Module-level physics stats cache ----------
let physStatsCache: PhysicalStats | null = null
let physFetching: Promise<void> | null = null

function ensurePhysStats(): Promise<void> {
  if (physStatsCache) return Promise.resolve()
  if (!physFetching) {
    physFetching = (actorsApi.physicalData() as Promise<ActorPhysicalData[]>).then((data) => {
      physStatsCache = computeStats(data)
    })
  }
  return physFetching
}

export function invalidatePhysCache() {
  physStatsCache = null
  physFetching = null
}

// ---------- Helpers ----------
function actorToPhysData(actor: Actor): ActorPhysicalData {
  return {
    id: actor.id,
    name: actor.name,
    photo_path: actor.photo_path,
    height: actor.height,
    bust: actor.bust,
    waist: actor.waist,
    hip: actor.hip,
    cup: actor.cup,
    face: actor.scores?.face ?? 0,
    score_bust: actor.scores?.bust ?? 0,
    score_hip: actor.scores?.hip ?? 0,
    physical: actor.scores?.physical ?? 0,
    skin: actor.scores?.skin ?? 0,
    acting: actor.scores?.acting ?? 0,
    sexy: actor.scores?.sexy ?? 0,
    charm: actor.scores?.charm ?? 0,
    technique: actor.scores?.technique ?? 0,
    proportions: actor.scores?.proportions ?? 0,
    work_count: actor.work_count ?? 0,
  }
}

function getAge(birthday: string | null): string {
  if (!birthday) return '-'
  return `${Math.floor((Date.now() - new Date(birthday).getTime()) / (365.25 * 24 * 60 * 60 * 1000))}세`
}

function getDebutAge(birthday: string | null, debutDate: string | null): string {
  if (!birthday || !debutDate) return '-'
  return `${Math.floor((new Date(debutDate).getTime() - new Date(birthday).getTime()) / (365.25 * 24 * 60 * 60 * 1000))}세`
}

// ---------- Content components ----------
function WorkContent({ work }: { work: Work }) {
  const repActors = work.rep_actors ?? []
  const repIds = new Set(repActors.map((a) => a.id))
  const otherActors = (work.actors ?? [])
    .filter((a) => !repIds.has(a.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'))
  const allActors = [...repActors, ...otherActors]
  const hasComment = !!(work.comment && work.comment.trim())
  const hasActors = allActors.length > 0
  if (!hasComment && !hasActors) return <p className="text-gray-500">-</p>
  return (
    <div>
      {hasComment && <p className="whitespace-pre-wrap leading-relaxed">{work.comment}</p>}
      {hasComment && hasActors && <div className="h-2" />}
      {hasActors && <p className="text-gray-400 leading-relaxed">{allActors.map((a) => a.name).join(', ')}</p>}
    </div>
  )
}

function ActorContent({ actor, physScore }: { actor: Actor; physScore: number | null }) {
  const s = actor.scores
  const body = [
    actor.height ? `${actor.height}cm` : null,
    (actor.bust || actor.waist || actor.hip)
      ? `B${actor.bust ?? '?'}-W${actor.waist ?? '?'}-H${actor.hip ?? '?'}`
      : null,
    actor.cup ? `${actor.cup}컵` : null,
  ].filter(Boolean).join('  ')
  const hasBody = !!(actor.height || actor.bust || actor.waist || actor.hip || actor.cup)

  return (
    <div className="space-y-0.5 leading-tight">
      <p className="font-bold text-white text-[11px]">
        {actor.name}{' '}
        <span className="text-gray-400 font-normal">(총작품 ; {actor.work_count ?? 0}편)</span>
      </p>
      <p className="text-[10px]">
        <span className="text-gray-500">생년월일 </span>
        {actor.birthday || '-'}
        {actor.birthday ? ` (${getAge(actor.birthday)})` : ''}
      </p>
      <p className="text-[10px]">
        <span className="text-gray-500">데뷔일   </span>
        {actor.debut_date || '-'}
        {actor.debut_date ? ` (${getDebutAge(actor.birthday, actor.debut_date)})` : ''}
      </p>
      <p className="text-[10px]">
        <span className="text-gray-500">신체</span>
        {physScore !== null ? `(${physScore.toFixed(2)})` : ''}
      </p>
      {hasBody && <p className="text-[10px]">{body}</p>}
      <p className="text-[10px]">
        <span className="text-gray-500">평점</span>({(actor.avg_score ?? 0).toFixed(2)})
      </p>
      {s && (
        <div className="grid grid-cols-5 text-center text-[10px] mt-1 leading-tight">
          {['얼굴', '가슴', '엉덩이', '몸매', '피부'].map((l) => (
            <p key={l} className="text-gray-500">{l}</p>
          ))}
          {[s.face, s.bust, s.hip, s.physical, s.skin].map((v, i) => (
            <p key={i}>{v}</p>
          ))}
          {['연기력', '섹기', '매력', '테크닉', '비율'].map((l) => (
            <p key={l} className="text-gray-500 mt-0.5">{l}</p>
          ))}
          {[s.acting, s.sexy, s.charm, s.technique, s.proportions].map((v, i) => (
            <p key={i}>{v}</p>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- Public interface ----------
export interface TooltipState {
  type: 'work' | 'actor'
  id: number
  x: number
  y: number
}

interface Props {
  tooltip: TooltipState
}

export default function CardTooltip({ tooltip }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [work, setWork] = useState<Work | null>(null)
  const [actor, setActor] = useState<Actor | null>(null)
  const [physScore, setPhysScore] = useState<number | null>(null)

  useEffect(() => {
    setWork(null)
    setActor(null)
    setPhysScore(null)
    if (tooltip.type === 'work') {
      worksApi.get(tooltip.id).then((d) => setWork(d as Work))
    } else {
      Promise.all([
        actorsApi.get(tooltip.id) as Promise<Actor>,
        ensurePhysStats(),
      ]).then(([a]) => {
        setActor(a)
        if (physStatsCache) {
          const settings = loadSettings()
          const score = calcPhysicalScore(actorToPhysData(a), settings, physStatsCache)
          setPhysScore(score ?? null)
        }
      })
    }
  }, [tooltip.type, tooltip.id])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth || 220
    const h = el.offsetHeight || 20
    let left = tooltip.x + 14
    let top = tooltip.y + 14
    if (left + w > window.innerWidth - 8) left = tooltip.x - w - 14
    if (top + h > window.innerHeight - 8) top = tooltip.y - h - 14
    el.style.left = `${left}px`
    el.style.top = `${top}px`
    el.style.opacity = '1'
  })

  const loading = tooltip.type === 'work' ? !work : !actor

  return (
    <div
      ref={ref}
      className="fixed pointer-events-none z-[200] bg-gray-900 border border-gray-700 rounded shadow-xl text-xs text-gray-300 p-2 w-[220px]"
      style={{ left: tooltip.x + 14, top: tooltip.y + 14, opacity: 0 }}
    >
      {loading ? (
        <p className="text-gray-500 text-[10px]">로딩중...</p>
      ) : tooltip.type === 'work' ? (
        <WorkContent work={work!} />
      ) : (
        <ActorContent actor={actor!} physScore={physScore} />
      )}
    </div>
  )
}
