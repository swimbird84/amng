import { useState, useEffect, useMemo } from 'react'
import { actorsApi } from '../api'
import ImagePreview from './ImagePreview'
import type { ActorScores } from '../types'

export interface PhysicalSettings {
  profileWeight: number
  scoreWeight: number
  profileEnabled: boolean
  scoreEnabled: boolean
  profile: {
    height:  { enabled: boolean; dir: 'P' | 'N' }
    bust:    { enabled: boolean; dir: 'P' | 'N' }
    waist:   { enabled: boolean; dir: 'P' | 'N' }
    hip:     { enabled: boolean; dir: 'P' | 'N' }
    cup:     { enabled: boolean; dir: 'P' | 'N' }
  }
  score: {
    face:         { enabled: boolean; dir: 'P' | 'N' }
    bust:         { enabled: boolean; dir: 'P' | 'N' }
    hip:          { enabled: boolean; dir: 'P' | 'N' }
    physical:     { enabled: boolean; dir: 'P' | 'N' }
    skin:         { enabled: boolean; dir: 'P' | 'N' }
    proportions:  { enabled: boolean; dir: 'P' | 'N' }
    acting:       { enabled: boolean; dir: 'P' | 'N' }
    sexy:         { enabled: boolean; dir: 'P' | 'N' }
    charm:        { enabled: boolean; dir: 'P' | 'N' }
    technique:    { enabled: boolean; dir: 'P' | 'N' }
  }
}

export interface ActorPhysicalData {
  id: number
  name: string
  photo_path: string | null
  height: number | null
  bust: number | null
  waist: number | null
  hip: number | null
  cup: string | null
  face: number
  score_bust: number
  score_hip: number
  physical: number
  skin: number
  acting: number
  sexy: number
  charm: number
  technique: number
  proportions: number
  work_count: number
}

export interface PhysicalStats {
  minH: number; maxH: number
  minB: number; maxB: number
  minW: number; maxW: number
  minHip: number; maxHip: number
  minCup: number; maxCup: number
}

export const DEFAULT_SETTINGS: PhysicalSettings = {
  profileWeight: 3,
  scoreWeight: 7,
  profileEnabled: true,
  scoreEnabled: true,
  profile: {
    height: { enabled: true, dir: 'P' },
    bust:   { enabled: true, dir: 'P' },
    waist:  { enabled: true, dir: 'N' },
    hip:    { enabled: true, dir: 'P' },
    cup:    { enabled: true, dir: 'P' },
  },
  score: {
    face:        { enabled: true, dir: 'P' },
    bust:        { enabled: true, dir: 'P' },
    hip:         { enabled: true, dir: 'P' },
    physical:    { enabled: true, dir: 'P' },
    skin:        { enabled: true, dir: 'P' },
    proportions: { enabled: true, dir: 'P' },
    acting:      { enabled: false, dir: 'P' },
    sexy:        { enabled: false, dir: 'P' },
    charm:       { enabled: false, dir: 'P' },
    technique:   { enabled: false, dir: 'P' },
  },
}

const CUP_ORDER = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z']

export function cupToNum(cup: string): number {
  const idx = CUP_ORDER.indexOf(cup.toUpperCase())
  return idx >= 0 ? idx + 1 : 0
}

export function loadSettings(): PhysicalSettings {
  try {
    const saved = localStorage.getItem('physical:settings')
    if (saved) {
      const parsed = JSON.parse(saved)
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        profile: { ...DEFAULT_SETTINGS.profile, ...parsed.profile },
        score:   { ...DEFAULT_SETTINGS.score,   ...parsed.score   },
      }
    }
  } catch {}
  return { ...DEFAULT_SETTINGS }
}

function saveSettings(s: PhysicalSettings) {
  localStorage.setItem('physical:settings', JSON.stringify(s))
  window.dispatchEvent(new Event('physicalSettingsChange'))
}

export function computeStats(actors: ActorPhysicalData[]): PhysicalStats {
  const hs   = actors.map(a => a.height).filter((v): v is number => v != null)
  const bs   = actors.map(a => a.bust  ).filter((v): v is number => v != null)
  const ws   = actors.map(a => a.waist ).filter((v): v is number => v != null)
  const hips = actors.map(a => a.hip   ).filter((v): v is number => v != null)
  const cups = actors.map(a => a.cup ? cupToNum(a.cup) : 0).filter(v => v > 0)
  return {
    minH:   hs.length   ? Math.min(...hs)   : 0,  maxH:   hs.length   ? Math.max(...hs)   : 10,
    minB:   bs.length   ? Math.min(...bs)   : 0,  maxB:   bs.length   ? Math.max(...bs)   : 10,
    minW:   ws.length   ? Math.min(...ws)   : 0,  maxW:   ws.length   ? Math.max(...ws)   : 10,
    minHip: hips.length ? Math.min(...hips) : 0,  maxHip: hips.length ? Math.max(...hips) : 10,
    minCup: cups.length ? Math.min(...cups) : 1,  maxCup: cups.length ? Math.max(...cups) : 11,
  }
}

function norm(value: number, min: number, max: number): number {
  if (max === min) return 5
  return (value - min) / (max - min) * 10
}

export function calcPhysicalScore(
  actor: ActorPhysicalData,
  settings: PhysicalSettings,
  stats: PhysicalStats
): number | null {
  let profileScore: number | null = null
  let scoreScore: number | null = null

  if (settings.profileEnabled) {
    const items: number[] = []
    const p = settings.profile
    if (p.height.enabled) {
      let v = actor.height != null ? norm(actor.height, stats.minH, stats.maxH) : 5
      if (p.height.dir === 'N') v = 10 - v
      items.push(v)
    }
    if (p.bust.enabled) {
      let v = actor.bust != null ? norm(actor.bust, stats.minB, stats.maxB) : 5
      if (p.bust.dir === 'N') v = 10 - v
      items.push(v)
    }
    if (p.waist.enabled) {
      let v = actor.waist != null ? norm(actor.waist, stats.minW, stats.maxW) : 5
      if (p.waist.dir === 'N') v = 10 - v
      items.push(v)
    }
    if (p.hip.enabled) {
      let v = actor.hip != null ? norm(actor.hip, stats.minHip, stats.maxHip) : 5
      if (p.hip.dir === 'N') v = 10 - v
      items.push(v)
    }
    if (p.cup.enabled) {
      let v = 5
      if (actor.cup) {
        const cn = cupToNum(actor.cup)
        if (cn > 0 && stats.maxCup > stats.minCup) v = norm(cn, stats.minCup, stats.maxCup)
      }
      if (p.cup.dir === 'N') v = 10 - v
      items.push(v)
    }
    if (items.length > 0) profileScore = items.reduce((a, b) => a + b, 0) / items.length
  }

  if (settings.scoreEnabled) {
    const items: number[] = []
    const sc = settings.score
    if (sc.face.enabled)        { let v = actor.face;        if (sc.face.dir        === 'N') v = 10 - v; items.push(v) }
    if (sc.bust.enabled)        { let v = actor.score_bust;  if (sc.bust.dir        === 'N') v = 10 - v; items.push(v) }
    if (sc.hip.enabled)         { let v = actor.score_hip;   if (sc.hip.dir         === 'N') v = 10 - v; items.push(v) }
    if (sc.physical.enabled)    { let v = actor.physical;    if (sc.physical.dir    === 'N') v = 10 - v; items.push(v) }
    if (sc.skin.enabled)        { let v = actor.skin;        if (sc.skin.dir        === 'N') v = 10 - v; items.push(v) }
    if (sc.proportions.enabled) { let v = actor.proportions; if (sc.proportions.dir === 'N') v = 10 - v; items.push(v) }
    if (sc.acting.enabled)      { let v = actor.acting;      if (sc.acting.dir      === 'N') v = 10 - v; items.push(v) }
    if (sc.sexy.enabled)        { let v = actor.sexy;        if (sc.sexy.dir        === 'N') v = 10 - v; items.push(v) }
    if (sc.charm.enabled)       { let v = actor.charm;       if (sc.charm.dir       === 'N') v = 10 - v; items.push(v) }
    if (sc.technique.enabled)   { let v = actor.technique;   if (sc.technique.dir   === 'N') v = 10 - v; items.push(v) }
    if (items.length > 0) scoreScore = items.reduce((a, b) => a + b, 0) / items.length
  }

  if (profileScore === null && scoreScore === null) return null

  const profileW = (settings.profileEnabled && profileScore !== null) ? settings.profileWeight : 0
  const scoreW   = (settings.scoreEnabled   && scoreScore   !== null) ? settings.scoreWeight   : 0
  const totalW   = profileW + scoreW
  if (totalW === 0) return null

  return ((profileScore ?? 0) * profileW + (scoreScore ?? 0) * scoreW) / totalW
}

const PROFILE_ITEMS: { key: keyof PhysicalSettings['profile']; label: string }[] = [
  { key: 'height', label: '키' },
  { key: 'bust',   label: 'B'  },
  { key: 'waist',  label: 'W'  },
  { key: 'hip',    label: 'H'  },
  { key: 'cup',    label: '컵' },
]

const SCORE_ITEMS: { key: keyof PhysicalSettings['score']; label: string }[] = [
  { key: 'face',        label: '얼굴'   },
  { key: 'bust',        label: '가슴'   },
  { key: 'hip',         label: '엉덩이' },
  { key: 'physical',    label: '몸매'   },
  { key: 'skin',        label: '피부'   },
  { key: 'proportions', label: '비율'   },
  { key: 'acting',      label: '연기력' },
  { key: 'sexy',        label: '섹기'   },
  { key: 'charm',       label: '매력'   },
  { key: 'technique',   label: '테크닉' },
]

const EDIT_SCORE_FIELDS: { label: string; getValue: (a: ActorPhysicalData) => number; apiKey: keyof ActorScores }[] = [
  { label: '얼굴',   getValue: a => a.face,        apiKey: 'face'        },
  { label: '가슴',   getValue: a => a.score_bust,  apiKey: 'bust'        },
  { label: '엉덩이', getValue: a => a.score_hip,   apiKey: 'hip'         },
  { label: '몸매',   getValue: a => a.physical,    apiKey: 'physical'    },
  { label: '피부',   getValue: a => a.skin,        apiKey: 'skin'        },
  { label: '연기력', getValue: a => a.acting,      apiKey: 'acting'      },
  { label: '섹기',   getValue: a => a.sexy,        apiKey: 'sexy'        },
  { label: '매력',   getValue: a => a.charm,       apiKey: 'charm'       },
  { label: '테크닉', getValue: a => a.technique,   apiKey: 'technique'   },
  { label: '비율',   getValue: a => a.proportions, apiKey: 'proportions' },
]

export default function PhysicalCorrectionModal({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<PhysicalSettings>(loadSettings)
  const [actors, setActors] = useState<ActorPhysicalData[]>([])
  const [rankSortDir, setRankSortDir] = useState<'asc' | 'desc'>(
    (localStorage.getItem('ratingCalc:rankSortDir') as 'asc' | 'desc') || 'desc'
  )
  const [rankBy, setRankBy] = useState<'avg_score' | 'physScore' | 'height' | 'bust' | 'waist' | 'hip' | 'cup' | 'face' | 'score_bust' | 'score_hip' | 'physical' | 'skin' | 'acting' | 'sexy' | 'charm' | 'technique' | 'proportions'>(
    (localStorage.getItem('ratingCalc:rankBy') as 'avg_score' | 'physScore' | 'height' | 'bust' | 'waist' | 'hip' | 'cup' | 'face' | 'score_bust' | 'score_hip' | 'physical' | 'skin' | 'acting' | 'sexy' | 'charm' | 'technique' | 'proportions') || 'physScore'
  )
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editScores, setEditScores] = useState<ActorScores>({ face: 0, bust: 0, hip: 0, physical: 0, skin: 0, acting: 0, sexy: 0, charm: 0, technique: 0, proportions: 0 })

  useEffect(() => {
    actorsApi.physicalData().then(d => setActors(d as ActorPhysicalData[]))
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const startEdit = (a: ActorPhysicalData) => {
    setEditingId(a.id)
    setEditScores({ face: a.face, bust: a.score_bust, hip: a.score_hip, physical: a.physical, skin: a.skin, acting: a.acting, sexy: a.sexy, charm: a.charm, technique: a.technique, proportions: a.proportions })
  }

  const cancelEdit = () => setEditingId(null)

  const saveEdit = async (id: number) => {
    await actorsApi.update(id, { scores: editScores })
    const data = await actorsApi.physicalData()
    setActors(data as ActorPhysicalData[])
    setEditingId(null)
    window.dispatchEvent(new Event('actorScoresUpdated'))
  }

  const stats = useMemo(() => computeStats(actors), [actors])

  const ranked = useMemo(() => {
    const avgScore = (a: ActorPhysicalData) =>
      (a.face + a.score_bust + a.score_hip + a.physical + a.skin + a.acting + a.sexy + a.charm + a.technique + a.proportions) / 10

    const getVal = (a: ActorPhysicalData & { physScore: number | null }): number | null => {
      if (rankBy === 'avg_score') return avgScore(a)
      if (rankBy === 'physScore') return a.physScore
      if (rankBy === 'height')    return a.height
      if (rankBy === 'bust')      return a.bust
      if (rankBy === 'waist')     return a.waist
      if (rankBy === 'hip')       return a.hip
      if (rankBy === 'cup')       return a.cup ? cupToNum(a.cup) : null
      return a[rankBy as keyof ActorPhysicalData] as number
    }

    return actors
      .map(a => ({ ...a, physScore: calcPhysicalScore(a, settings, stats) }))
      .filter(a => getVal(a) != null)
      .sort((a, b) => {
        const av = getVal(a)!
        const bv = getVal(b)!
        const primary = rankSortDir === 'desc' ? bv - av : av - bv
        if (primary !== 0) return primary
        const secondary = rankSortDir === 'desc' ? avgScore(b) - avgScore(a) : avgScore(a) - avgScore(b)
        if (secondary !== 0) return secondary
        return rankSortDir === 'desc' ? b.work_count - a.work_count : a.work_count - b.work_count
      })
  }, [actors, settings, stats, rankSortDir, rankBy])

  const update = (s: PhysicalSettings) => {
    setSettings(s)
    saveSettings(s)
  }

  const setProfileWeight = (v: number) => {
    const c = Math.max(0, Math.min(10, isNaN(v) ? 0 : v))
    update({ ...settings, profileWeight: c, scoreWeight: 10 - c })
  }
  const setScoreWeight = (v: number) => {
    const c = Math.max(0, Math.min(10, isNaN(v) ? 0 : v))
    update({ ...settings, scoreWeight: c, profileWeight: 10 - c })
  }

  const toggleProfileItem = (key: keyof PhysicalSettings['profile']) =>
    update({ ...settings, profile: { ...settings.profile, [key]: { ...settings.profile[key], enabled: !settings.profile[key].enabled } } })

  const toggleProfileDir = (key: keyof PhysicalSettings['profile']) => {
    const cur = settings.profile[key].dir
    update({ ...settings, profile: { ...settings.profile, [key]: { ...settings.profile[key], dir: cur === 'P' ? 'N' : 'P' } } })
  }

  const toggleScoreItem = (key: keyof PhysicalSettings['score']) =>
    update({ ...settings, score: { ...settings.score, [key]: { ...settings.score[key], enabled: !settings.score[key].enabled } } })

  const toggleScoreDir = (key: keyof PhysicalSettings['score']) => {
    const cur = settings.score[key].dir
    update({ ...settings, score: { ...settings.score, [key]: { ...settings.score[key], dir: cur === 'P' ? 'N' : 'P' } } })
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg w-[820px] h-[95vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
          <h2 className="text-white font-bold text-base">평점 계산기</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="flex-1 flex gap-4 overflow-hidden p-4">
          {/* 좌측: 설정 패널 */}
          <div className="w-52 flex flex-col gap-3 overflow-y-auto shrink-0">

            <p className="text-sm text-gray-300 font-bold shrink-0">피지컬 계산기</p>

            {/* 가중치 */}
            <div className="bg-gray-700 rounded-lg p-3 space-y-2">
              <p className="text-xs text-gray-400 font-bold">가중치 (합계 10)</p>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-300 w-12">프로필</label>
                <input
                  type="number" min={0} max={10} step={0.5}
                  value={settings.profileWeight}
                  onChange={e => setProfileWeight(parseFloat(e.target.value))}
                  className="bg-gray-800 text-white text-sm px-2 py-1 rounded w-14 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-300 w-12">평점</label>
                <input
                  type="number" min={0} max={10} step={0.5}
                  value={settings.scoreWeight}
                  onChange={e => setScoreWeight(parseFloat(e.target.value))}
                  className="bg-gray-800 text-white text-sm px-2 py-1 rounded w-14 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden"
                />
              </div>
            </div>

            {/* 프로필 항목 */}
            <div className="bg-gray-700 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox" checked={settings.profileEnabled}
                  onChange={() => update({ ...settings, profileEnabled: !settings.profileEnabled })}
                  className="accent-blue-500"
                />
                <span className="text-sm text-white font-bold">프로필</span>
              </div>
              <div className="space-y-1.5">
                {PROFILE_ITEMS.map(({ key, label }) => {
                  const item = settings.profile[key]
                  const active = settings.profileEnabled && item.enabled
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <input
                        type="checkbox" checked={item.enabled}
                        onChange={() => toggleProfileItem(key)}
                        disabled={!settings.profileEnabled}
                        className="accent-blue-500 shrink-0"
                      />
                      <span className={`text-xs w-6 ${active ? 'text-gray-200' : 'text-gray-500'}`}>{label}</span>
                      <button
                        onClick={() => toggleProfileDir(key)}
                        disabled={!active}
                        className={`text-xs px-2 py-0.5 rounded font-bold ${
                          !active ? 'text-gray-600 bg-gray-800' :
                          item.dir === 'P' ? 'text-green-300 bg-green-900/50' : 'text-red-300 bg-red-900/50'
                        }`}
                      >
                        {item.dir}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 평점 항목 */}
            <div className="bg-gray-700 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox" checked={settings.scoreEnabled}
                  onChange={() => update({ ...settings, scoreEnabled: !settings.scoreEnabled })}
                  className="accent-blue-500"
                />
                <span className="text-sm text-white font-bold">평점 항목</span>
              </div>
              <div className="space-y-1.5">
                {SCORE_ITEMS.map(({ key, label }) => {
                  const item = settings.score[key]
                  const active = settings.scoreEnabled && item.enabled
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <input
                        type="checkbox" checked={item.enabled}
                        onChange={() => toggleScoreItem(key)}
                        disabled={!settings.scoreEnabled}
                        className="accent-blue-500 shrink-0"
                      />
                      <span className={`text-xs w-10 ${active ? 'text-gray-200' : 'text-gray-500'}`}>{label}</span>
                      <button
                        onClick={() => toggleScoreDir(key)}
                        disabled={!active}
                        className={`text-xs px-2 py-0.5 rounded font-bold ${
                          !active ? 'text-gray-600 bg-gray-800' :
                          item.dir === 'P' ? 'text-green-300 bg-green-900/50' : 'text-red-300 bg-red-900/50'
                        }`}
                      >
                        {item.dir}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            <button
              onClick={() => update({ ...DEFAULT_SETTINGS })}
              className="bg-gray-600 hover:bg-gray-500 text-gray-300 text-xs py-1.5 rounded"
            >
              기본값 초기화
            </button>
          </div>

          {/* 우측: 실시간 랭킹 미리보기 */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 mb-2 shrink-0">
              <p className="text-sm text-gray-300 font-bold">점수 랭킹</p>
              <span className="text-xs text-gray-500">{ranked.length}명</span>
              <select
                value={rankBy}
                onChange={e => { const v = e.target.value as typeof rankBy; setRankBy(v); localStorage.setItem('ratingCalc:rankBy', v) }}
                className="bg-gray-700 text-white text-xs px-1.5 py-0.5 rounded"
              >
                <option value="avg_score">평점</option>
                <option value="physScore">피지컬</option>
                <option value="height">키</option>
                <option value="bust">바스트</option>
                <option value="waist">웨이스트</option>
                <option value="hip">힙</option>
                <option value="cup">컵</option>
                <option value="face">얼굴</option>
                <option value="score_bust">가슴</option>
                <option value="score_hip">엉덩이</option>
                <option value="physical">몸매</option>
                <option value="skin">피부</option>
                <option value="acting">연기력</option>
                <option value="sexy">섹기</option>
                <option value="charm">매력</option>
                <option value="technique">테크닉</option>
                <option value="proportions">비율</option>
              </select>
              <button
                onClick={() => setRankSortDir(d => { const next = d === 'desc' ? 'asc' : 'desc'; localStorage.setItem('ratingCalc:rankSortDir', next); return next })}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-2 py-0.5 rounded"
              >
                {rankSortDir === 'desc' ? '↓' : '↑'}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 [scrollbar-gutter:stable]">
              {ranked.map((a, i) => {
                const avgScore = (a.face + a.score_bust + a.score_hip + a.physical + a.skin + a.acting + a.sexy + a.charm + a.technique + a.proportions) / 10
                const profileParts = [
                  a.height != null ? `키:${a.height}cm` : '',
                  a.bust != null   ? `B:${a.bust}`      : '',
                  a.waist != null  ? `W:${a.waist}`     : '',
                  a.hip != null    ? `H:${a.hip}`       : '',
                  a.cup            ? `컵:${a.cup}`       : '',
                ].filter(Boolean).join('  ')
                const isEditing = editingId === a.id
                return (
                  <div key={a.id} className="flex items-stretch gap-2 bg-gray-700/60 rounded pl-1 pr-3 py-2">
                    <span className="text-gray-400 text-sm w-5 text-right shrink-0 self-center">{rankSortDir === 'desc' ? i + 1 : ranked.length - i}</span>
                    <ImagePreview path={a.photo_path} alt={a.name} className="w-[74px] h-[74px] rounded shrink-0 object-cover" />
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5 py-0.5">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-white text-sm font-bold truncate pl-1.5">{a.name}</p>
                        {isEditing ? (
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => saveEdit(a.id)} className="bg-green-600 hover:bg-green-500 text-white text-xs px-2 py-0.5 rounded">저장</button>
                            <button onClick={cancelEdit} className="bg-red-600 hover:bg-red-500 text-white text-xs px-2 py-0.5 rounded">취소</button>
                          </div>
                        ) : (
                          <button onClick={() => startEdit(a)} className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-2 py-0.5 rounded shrink-0">수정</button>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-gray-400 text-xs truncate pl-1.5">{profileParts || '-'}</p>
                        <p className="text-blue-400 text-xs font-bold shrink-0">{a.physScore.toFixed(2)}점</p>
                      </div>
                      <div className="flex items-end justify-between gap-2">
                        <div className="flex flex-col gap-0 shrink-0">
                          <div className="flex gap-0.5">
                            {EDIT_SCORE_FIELDS.map(({ label }) => (
                              <div key={label} className="w-9 text-center text-gray-500 text-xs leading-tight">{label}</div>
                            ))}
                          </div>
                          <div className="flex gap-0.5">
                            {isEditing ? (
                              EDIT_SCORE_FIELDS.map(({ label, apiKey }) => (
                                <input
                                  key={label}
                                  type="number" min={0} max={10} step={1}
                                  value={editScores[apiKey]}
                                  onChange={e => setEditScores(prev => ({ ...prev, [apiKey]: Math.max(0, Math.min(10, parseFloat(e.target.value) || 0)) }))}
                                  className="w-9 text-center bg-gray-600 text-white text-xs leading-tight rounded px-0 py-0.5 [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden"
                                />
                              ))
                            ) : (
                              EDIT_SCORE_FIELDS.map(({ label, getValue }) => (
                                <div key={label} className="w-9 text-center text-gray-300 text-xs leading-tight">{Math.round(getValue(a))}</div>
                              ))
                            )}
                          </div>
                        </div>
                        <p className="text-yellow-400 text-xs font-bold shrink-0 leading-tight">{avgScore.toFixed(2)}점</p>
                      </div>
                    </div>
                  </div>
                )
              })}
              {ranked.length === 0 && (
                <p className="text-gray-500 text-sm text-center py-8">데이터가 없습니다</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
