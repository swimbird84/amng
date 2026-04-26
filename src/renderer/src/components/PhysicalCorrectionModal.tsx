import { useState, useEffect, useMemo } from 'react'
import { actorsApi } from '../api'
import ImagePreview from './ImagePreview'

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
  },
}

const CUP_ORDER = ['A','B','C','D','E','F','G','H','I','J','K']

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
    if (p.height.enabled && actor.height != null) {
      let v = norm(actor.height, stats.minH, stats.maxH)
      if (p.height.dir === 'N') v = 10 - v
      items.push(v)
    }
    if (p.bust.enabled && actor.bust != null) {
      let v = norm(actor.bust, stats.minB, stats.maxB)
      if (p.bust.dir === 'N') v = 10 - v
      items.push(v)
    }
    if (p.waist.enabled && actor.waist != null) {
      let v = norm(actor.waist, stats.minW, stats.maxW)
      if (p.waist.dir === 'N') v = 10 - v
      items.push(v)
    }
    if (p.hip.enabled && actor.hip != null) {
      let v = norm(actor.hip, stats.minHip, stats.maxHip)
      if (p.hip.dir === 'N') v = 10 - v
      items.push(v)
    }
    if (p.cup.enabled && actor.cup) {
      const cn = cupToNum(actor.cup)
      if (cn > 0 && stats.maxCup > stats.minCup) {
        let v = norm(cn, stats.minCup, stats.maxCup)
        if (p.cup.dir === 'N') v = 10 - v
        items.push(v)
      }
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
  { key: 'face',        label: '외모'  },
  { key: 'bust',        label: '바스트' },
  { key: 'hip',         label: '힙'    },
  { key: 'physical',    label: '피지컬' },
  { key: 'skin',        label: '피부'  },
  { key: 'proportions', label: '비율'  },
]

export default function PhysicalCorrectionModal({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<PhysicalSettings>(loadSettings)
  const [actors, setActors] = useState<ActorPhysicalData[]>([])
  const [rankSortDir, setRankSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    actorsApi.physicalData().then(d => setActors(d as ActorPhysicalData[]))
  }, [])

  const stats = useMemo(() => computeStats(actors), [actors])

  const ranked = useMemo(() => {
    return actors
      .map(a => ({ ...a, physScore: calcPhysicalScore(a, settings, stats) }))
      .filter((a): a is typeof a & { physScore: number } => a.physScore !== null)
      .sort((a, b) => rankSortDir === 'desc' ? b.physScore - a.physScore : a.physScore - b.physScore)
  }, [actors, settings, stats, rankSortDir])

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
          <h2 className="text-white font-bold text-base">피지컬 계산기</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="flex-1 flex gap-4 overflow-hidden p-4">
          {/* 좌측: 설정 패널 */}
          <div className="w-52 flex flex-col gap-3 overflow-y-auto shrink-0">

            {/* 가중치 */}
            <div className="bg-gray-700 rounded-lg p-3 space-y-2">
              <p className="text-xs text-gray-400 font-bold">가중치 (합계 10)</p>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-300 w-12">프로필</label>
                <input
                  type="number" min={0} max={10} step={0.5}
                  value={settings.profileWeight}
                  onChange={e => setProfileWeight(parseFloat(e.target.value))}
                  className="bg-gray-800 text-white text-sm px-2 py-1 rounded w-14 text-center"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-300 w-12">평점</label>
                <input
                  type="number" min={0} max={10} step={0.5}
                  value={settings.scoreWeight}
                  onChange={e => setScoreWeight(parseFloat(e.target.value))}
                  className="bg-gray-800 text-white text-sm px-2 py-1 rounded w-14 text-center"
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
              <p className="text-sm text-gray-300 font-bold">피지컬 점수 랭킹</p>
              <span className="text-xs text-gray-500">{ranked.length}명</span>
              <button
                onClick={() => setRankSortDir(d => d === 'desc' ? 'asc' : 'desc')}
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
                const scoreParts = [
                  `외모:${a.face.toFixed(1)}`,
                  `바스트:${a.score_bust.toFixed(1)}`,
                  `힙:${a.score_hip.toFixed(1)}`,
                  `피지컬:${a.physical.toFixed(1)}`,
                  `피부:${a.skin.toFixed(1)}`,
                  `비율:${a.proportions.toFixed(1)}`,
                ].join('  ')
                return (
                  <div key={a.id} className="flex items-stretch gap-3 bg-gray-700/60 rounded px-3 py-2">
                    <span className="text-gray-400 text-sm w-6 text-right shrink-0 self-center">{i + 1}</span>
                    <ImagePreview path={a.photo_path} alt={a.name} className="w-14 h-20 rounded shrink-0 object-cover" />
                    <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                      <p className="text-white text-sm font-bold truncate">{a.name}</p>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-gray-400 text-xs truncate">{profileParts || '-'}</p>
                        <p className="text-blue-400 text-xs font-bold shrink-0">{a.physScore.toFixed(2)}점</p>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-gray-500 text-xs truncate">{scoreParts}</p>
                        <p className="text-yellow-400 text-xs font-bold shrink-0">{avgScore.toFixed(2)}점</p>
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
