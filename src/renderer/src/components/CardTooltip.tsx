import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import type { Actor, Work } from '../types'
import ImagePreview from './ImagePreview'
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

import { getAge, getDebutAge } from '../utils/dateHelpers'

// ---------- Content components ----------
function ratingStars(rating: number): string {
  const full = Math.floor(rating)
  const half = rating - full >= 0.5
  return '★'.repeat(full) + (half ? '☆' : '')
}

function WorkContent({ work, showCover }: { work: Work; showCover?: boolean }) {
  const repActors = work.rep_actors ?? []
  const repIds = new Set(repActors.map((a) => a.id))
  const otherActors = (work.actors ?? [])
    .filter((a) => !repIds.has(a.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'))
  const allActors = [...repActors, ...otherActors]
  const hasComment = !!(work.title && work.title.trim())
  const hasActors = allActors.length > 0
  return (
    <div className="space-y-1.5 text-[13px]">
      {(work.studio_maker_name || work.studio_name) && (
        <div>
          {work.studio_maker_name && <p className="text-gray-300 font-bold">{work.studio_maker_name}</p>}
          {work.studio_name && <p className="text-gray-300">{work.studio_name}</p>}
        </div>
      )}
      {(work.release_date || work.rating != null) && (
        <div className="flex items-center justify-between">
          <span className="text-gray-400">{work.release_date || '-'}</span>
          <span className="text-yellow-400">{ratingStars(work.rating ?? 0)}</span>
        </div>
      )}
      {work.product_number && <p className="font-bold text-gray-300">{work.product_number}</p>}
      {hasComment && <p className="whitespace-pre-wrap leading-relaxed text-gray-300">{work.title}</p>}
      {hasActors && <p className="font-bold text-gray-300 leading-relaxed">{allActors.map((a) => a.name).join(', ')}</p>}
      {work.comment && <p className="whitespace-pre-wrap leading-relaxed text-gray-400 text-[12px]">{work.comment}</p>}
      {showCover && work.cover_path && <ImagePreview path={work.cover_path} alt="" className="w-full rounded mt-1" />}
    </div>
  )
}

function ActorContent({ actor, physScore, showCover }: { actor: Actor; physScore: number | null; showCover?: boolean }) {
  const s = actor.scores
  const hasBody = !!(actor.height || actor.bust || actor.waist || actor.hip || actor.cup)
  const ar = new Set((actor.phys_arbitrary ?? '').split('|').filter(Boolean))
  const body = hasBody ? (
    <>
      {actor.height && <span>{actor.height}cm{ar.has('height') && <span className="text-gray-500">(ar)</span>}{'  '}</span>}
      {(actor.bust || actor.waist || actor.hip) && <span>
        B{actor.bust ?? '?'}{ar.has('bust') && <span className="text-gray-500">(ar)</span>}
        {'-'}W{actor.waist ?? '?'}{ar.has('waist') && <span className="text-gray-500">(ar)</span>}
        {'-'}H{actor.hip ?? '?'}{ar.has('hip') && <span className="text-gray-500">(ar)</span>}
        {'  '}
      </span>}
      {actor.cup && <span>{actor.cup}컵{ar.has('cup') && <span className="text-gray-500">(ar)</span>}</span>}
    </>
  ) : null

  return (
    <div className="space-y-1 leading-relaxed">
      <p className="font-bold text-white text-[13px]">
        {actor.name}{' '}
        <span className="text-gray-400 font-normal">(총작품 : {actor.work_count ?? 0}편)</span>
      </p>
      <div>
        <p className="text-[13px]">
          <span className="text-gray-500">생년월일 </span>
          {actor.birthday || '-'}
          {actor.birthday ? ` (${getAge(actor.birthday)})` : ''}
        </p>
        <p className="text-[13px]">
          <span className="text-gray-500">데뷔일   </span>
          {actor.debut_date || '-'}
          {actor.debut_date ? ` (${getDebutAge(actor.birthday, actor.debut_date)})` : ''}
        </p>
      </div>
      <div>
        <p className="text-[13px]">
          <span className="text-gray-500">신체</span>
          {physScore !== null ? ` ${physScore.toFixed(2)}` : ''}
        </p>
        {hasBody && <p className="text-[13px]">{body}</p>}
      </div>
      <p className="text-[13px]">
        <span className="text-gray-500">평점</span>{` ${(actor.avg_score ?? 0).toFixed(2)}`}
      </p>
      {s && (
        <div className="grid grid-cols-5 text-center text-[13px] mt-1 leading-tight">
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
      {actor.comment && (
        <div>
          <p className="text-[13px]"><span className="text-gray-500">코멘트</span></p>
          <p className="text-[12px] text-gray-300 whitespace-pre-wrap leading-relaxed">{actor.comment}</p>
        </div>
      )}
      {showCover && actor.photo_path && <ImagePreview path={actor.photo_path} alt="" className="w-full rounded mt-1" />}
    </div>
  )
}

// ---------- Public interface ----------
export interface TooltipState {
  type: 'work' | 'actor'
  id: number
  x: number
  y: number
  showCover?: boolean
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
        if (!a) return
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
    const w = el.offsetWidth || 300
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
      className="fixed pointer-events-none z-[200] bg-gray-900 border border-gray-700 rounded shadow-xl text-xs text-gray-300 p-2 w-[300px]"
      style={{ left: tooltip.x + 14, top: tooltip.y + 14, opacity: 0 }}
    >
      {loading ? (
        <p className="text-gray-500 text-[10px]">로딩중...</p>
      ) : tooltip.type === 'work' ? (
        <WorkContent work={work!} showCover={tooltip.showCover} />
      ) : (
        <ActorContent actor={actor!} physScore={physScore} showCover={tooltip.showCover} />
      )}
    </div>
  )
}
