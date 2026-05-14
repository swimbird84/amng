import { useState, useEffect, useMemo } from 'react'
import { actorsApi } from '../api'
import ImagePreview from './ImagePreview'

const SCORE_GRADE_LIMITS: Record<number, number> = { 11: 5, 12: 3, 13: 1 }
const SCORE_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
import type { ActorScores } from '../types'
import CardTooltip, { type TooltipState } from './CardTooltip'

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
  phys_arbitrary?: string | null
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
  minFace: number; maxFace: number
  minSBust: number; maxSBust: number
  minSHip: number; maxSHip: number
  minPhysical: number; maxPhysical: number
  minSkin: number; maxSkin: number
  minActing: number; maxActing: number
  minSexy: number; maxSexy: number
  minCharm: number; maxCharm: number
  minTechnique: number; maxTechnique: number
  minProportions: number; maxProportions: number
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
  const sc = (arr: number[]) => arr.length ? [Math.min(...arr), Math.max(...arr)] : [0, 13]
  const faces  = actors.map(a => a.face)
  const sBusts = actors.map(a => a.score_bust)
  const sHips  = actors.map(a => a.score_hip)
  const phys   = actors.map(a => a.physical)
  const skins  = actors.map(a => a.skin)
  const acts   = actors.map(a => a.acting)
  const sexys  = actors.map(a => a.sexy)
  const charms = actors.map(a => a.charm)
  const techs  = actors.map(a => a.technique)
  const props  = actors.map(a => a.proportions)
  return {
    minH:   hs.length   ? Math.min(...hs)   : 0,  maxH:   hs.length   ? Math.max(...hs)   : 10,
    minB:   bs.length   ? Math.min(...bs)   : 0,  maxB:   bs.length   ? Math.max(...bs)   : 10,
    minW:   ws.length   ? Math.min(...ws)   : 0,  maxW:   ws.length   ? Math.max(...ws)   : 10,
    minHip: hips.length ? Math.min(...hips) : 0,  maxHip: hips.length ? Math.max(...hips) : 10,
    minCup: cups.length ? Math.min(...cups) : 1,  maxCup: cups.length ? Math.max(...cups) : 11,
    minFace: sc(faces)[0],        maxFace: sc(faces)[1],
    minSBust: sc(sBusts)[0],      maxSBust: sc(sBusts)[1],
    minSHip: sc(sHips)[0],        maxSHip: sc(sHips)[1],
    minPhysical: sc(phys)[0],     maxPhysical: sc(phys)[1],
    minSkin: sc(skins)[0],        maxSkin: sc(skins)[1],
    minActing: sc(acts)[0],       maxActing: sc(acts)[1],
    minSexy: sc(sexys)[0],        maxSexy: sc(sexys)[1],
    minCharm: sc(charms)[0],      maxCharm: sc(charms)[1],
    minTechnique: sc(techs)[0],   maxTechnique: sc(techs)[1],
    minProportions: sc(props)[0], maxProportions: sc(props)[1],
  }
}

function norm(value: number, min: number, max: number): number {
  if (max === min) return 5
  return (value - min) / (max - min) * 5 + 5
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
      if (actor.height != null) { let v = norm(actor.height, stats.minH, stats.maxH); if (p.height.dir === 'N') v = 15 - v; items.push(v) }
      else items.push(5)
    }
    if (p.bust.enabled) {
      if (actor.bust != null) { let v = norm(actor.bust, stats.minB, stats.maxB); if (p.bust.dir === 'N') v = 15 - v; items.push(v) }
      else items.push(5)
    }
    if (p.waist.enabled) {
      if (actor.waist != null) { let v = norm(actor.waist, stats.minW, stats.maxW); if (p.waist.dir === 'N') v = 15 - v; items.push(v) }
      else items.push(5)
    }
    if (p.hip.enabled) {
      if (actor.hip != null) { let v = norm(actor.hip, stats.minHip, stats.maxHip); if (p.hip.dir === 'N') v = 15 - v; items.push(v) }
      else items.push(5)
    }
    if (p.cup.enabled) {
      if (actor.cup) {
        const cn = cupToNum(actor.cup)
        let v = (cn > 0 && stats.maxCup > stats.minCup) ? norm(cn, stats.minCup, stats.maxCup) : 5
        if (p.cup.dir === 'N') v = 15 - v
        items.push(v)
      } else items.push(5)
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

const KO_TO_CUP: Record<string, string> = { ㅁ:'A',ㅠ:'B',ㅊ:'C',ㅇ:'D',ㄷ:'E',ㄹ:'F',ㅎ:'G',ㅗ:'H',ㅑ:'I',ㅓ:'J',ㅏ:'K',ㅣ:'L',ㅡ:'M' }

type ProfileField = 'height' | 'bust' | 'waist' | 'hip' | 'cup'

const PROFILE_EDIT_FIELDS: { key: ProfileField; label: string; getValue: (a: ActorPhysicalData) => string | number | null }[] = [
  { key: 'height', label: '키', getValue: a => a.height },
  { key: 'bust',   label: 'B',  getValue: a => a.bust   },
  { key: 'waist',  label: 'W',  getValue: a => a.waist  },
  { key: 'hip',    label: 'H',  getValue: a => a.hip    },
  { key: 'cup',    label: '컵', getValue: a => a.cup    },
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

export default function PhysicalCorrectionModal({ onClose, onViewActor }: { onClose: () => void; onViewActor?: (id: number) => void }) {
  const [settings, setSettings] = useState<PhysicalSettings>(loadSettings)
  const [actors, setActors] = useState<ActorPhysicalData[]>([])
  const [rankSortDir, setRankSortDir] = useState<'asc' | 'desc'>(
    (localStorage.getItem('ratingCalc:rankSortDir') as 'asc' | 'desc') || 'desc'
  )
  const [rankBy, setRankBy] = useState<'avg_score' | 'physScore' | 'height' | 'bust' | 'waist' | 'hip' | 'cup' | 'face' | 'score_bust' | 'score_hip' | 'physical' | 'skin' | 'acting' | 'sexy' | 'charm' | 'technique' | 'proportions'>(
    (localStorage.getItem('ratingCalc:rankBy') as 'avg_score' | 'physScore' | 'height' | 'bust' | 'waist' | 'hip' | 'cup' | 'face' | 'score_bust' | 'score_hip' | 'physical' | 'skin' | 'acting' | 'sexy' | 'charm' | 'technique' | 'proportions') || 'physScore'
  )
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [editingCell, setEditingCell] = useState<{ actorId: number; key: keyof ActorScores } | null>(null)
  const [editingProfile, setEditingProfile] = useState<{ actorId: number; key: ProfileField } | null>(null)
  const [profileInputValue, setProfileInputValue] = useState('')
  const [nameSearch, setNameSearch] = useState('')

  useEffect(() => {
    actorsApi.physicalData().then(d => setActors(d as ActorPhysicalData[]))
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleScoreChange = async (actorId: number, key: keyof ActorScores, value: number) => {
    setEditingCell(null)
    if (value >= 11) {
      const counts = await actorsApi.scoreGradeCounts(actorId)
      const itemCounts = counts[key]
      const limit = SCORE_GRADE_LIMITS[value]
      if ((itemCounts?.[value]?.count ?? 0) >= limit) {
        const label = EDIT_SCORE_FIELDS.find(f => f.apiKey === key)?.label ?? key
        alert(`[${label}] ${value}점 정원이 가득 찼습니다 (한도: ${limit}명)\n현재 ${value}점 배우: ${itemCounts?.[value]?.names || '-'}`)
        return
      }
    }
    const actor = actors.find(a => a.id === actorId)
    if (!actor) return
    const scores: ActorScores = {
      face: actor.face, bust: actor.score_bust, hip: actor.score_hip,
      physical: actor.physical, skin: actor.skin, acting: actor.acting,
      sexy: actor.sexy, charm: actor.charm, technique: actor.technique, proportions: actor.proportions,
      [key]: value,
    }
    await actorsApi.update(actorId, { scores })
    const data = await actorsApi.physicalData()
    setActors(data as ActorPhysicalData[])
    window.dispatchEvent(new Event('actorScoresUpdated'))
  }

  const handleProfileChange = async (actorId: number, key: ProfileField, rawValue: string) => {
    setEditingProfile(null)
    const trimmed = rawValue.trim()
    let value: string | number | null
    if (key === 'cup') {
      value = trimmed.toUpperCase() || null
      if (value && !CUP_ORDER.includes(value as string)) return
    } else {
      value = trimmed === '' ? null : parseFloat(trimmed)
      if (value !== null && isNaN(value as number)) return
    }
    const actor = actors.find(a => a.id === actorId)
    if (!actor) return
    const updateData: Record<string, unknown> = { [key]: value }
    if (actor[key] == null && value !== null) {
      const arSet = new Set((actor.phys_arbitrary ?? '').split('|').filter(Boolean))
      arSet.add(key)
      updateData.phys_arbitrary = [...arSet].join('|')
    }
    await actorsApi.update(actorId, updateData)
    const data = await actorsApi.physicalData()
    setActors(data as ActorPhysicalData[])
  }

  const stats = useMemo(() => computeStats(actors), [actors])

  const ranked = useMemo(() => {
    const avgScore = (a: ActorPhysicalData) =>
      (a.face + a.score_bust + a.score_hip + a.physical + a.skin + a.acting + a.sexy + a.charm + a.technique + a.proportions) / 13

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

    const profileKeyMap: Partial<Record<typeof rankBy, keyof PhysicalSettings['profile']>> = {
      height: 'height', bust: 'bust', waist: 'waist', hip: 'hip', cup: 'cup',
    }
    const scoreKeyMap: Partial<Record<typeof rankBy, keyof PhysicalSettings['score']>> = {
      face: 'face', score_bust: 'bust', score_hip: 'hip', physical: 'physical',
      skin: 'skin', acting: 'acting', sexy: 'sexy', charm: 'charm',
      technique: 'technique', proportions: 'proportions',
    }
    const isNeg = profileKeyMap[rankBy]
      ? settings.profile[profileKeyMap[rankBy]!].dir === 'N'
      : scoreKeyMap[rankBy]
        ? settings.score[scoreKeyMap[rankBy]!].dir === 'N'
        : false
    const effectiveDir = isNeg ? (rankSortDir === 'desc' ? 'asc' : 'desc') : rankSortDir

    return actors
      .map(a => ({ ...a, physScore: calcPhysicalScore(a, settings, stats) }))
      .filter(a => a.physScore != null && getVal(a) != null)
      .sort((a, b) => {
        const av = getVal(a)!
        const bv = getVal(b)!
        const primary = effectiveDir === 'desc' ? bv - av : av - bv
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
          <div className="w-44 flex flex-col gap-3 overflow-y-auto shrink-0">

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
              <input
                type="text"
                value={nameSearch}
                onChange={e => setNameSearch(e.target.value)}
                placeholder="배우 이름"
                className="ml-auto bg-gray-700 text-white text-xs px-2 py-0.5 rounded w-56 placeholder-gray-500"
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 [scrollbar-gutter:stable]">
              {ranked
                .map((a, i) => ({ ...a, _rank: i }))
                .filter(a => !nameSearch || a.name.toLowerCase().includes(nameSearch.toLowerCase()))
                .map((a) => {
                const avgScore = (a.face + a.score_bust + a.score_hip + a.physical + a.skin + a.acting + a.sexy + a.charm + a.technique + a.proportions) / 13
                const _ar = new Set((a.phys_arbitrary ?? '').split('|').filter(Boolean))
                return (
                  <div key={a.id} className="flex items-stretch gap-2 bg-gray-700/60 rounded pl-1 pr-3 py-2">
                    <span className="text-gray-400 text-sm w-5 text-right shrink-0 self-center">{rankSortDir === 'desc' ? a._rank + 1 : ranked.length - a._rank}</span>
                    <div onClick={() => onViewActor?.(a.id)} onMouseMove={(e) => setTooltip({ type: 'actor', id: a.id, x: e.clientX, y: e.clientY })} onMouseLeave={() => setTooltip(null)} className={`w-[90px] h-[90px] shrink-0 rounded overflow-hidden ${onViewActor ? 'cursor-pointer' : ''}`}>
                      <ImagePreview path={a.photo_path} alt={a.name} className="w-full h-full" objectPosition="center 10%" />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col gap-0.5 py-0.5">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-white text-sm font-bold truncate pl-1.5">{a.name}</p>
                        <p className="text-yellow-400 text-xs font-bold shrink-0 leading-tight">{avgScore.toFixed(2)}점</p>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex gap-1 flex-wrap">
                          {PROFILE_EDIT_FIELDS.map(({ key, label, getValue }) => {
                            const isEditing = editingProfile?.actorId === a.id && editingProfile?.key === key
                            const val = getValue(a)
                            const isGray = val == null || _ar.has(key)
                            return isEditing ? (
                              <input
                                key={label}
                                autoFocus
                                value={profileInputValue}
                                onChange={e => {
                                  if (key === 'cup') {
                                    const converted = e.target.value.split('').map(c => KO_TO_CUP[c] ?? c).join('')
                                    setProfileInputValue(converted.toUpperCase())
                                  } else {
                                    setProfileInputValue(e.target.value)
                                  }
                                }}
                                onBlur={() => handleProfileChange(a.id, key, profileInputValue)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleProfileChange(a.id, key, profileInputValue)
                                  if (e.key === 'Escape') setEditingProfile(null)
                                }}
                                className="w-14 h-5 text-center bg-gray-600 text-white text-xs leading-tight rounded px-1"
                              />
                            ) : (
                              <button
                                key={label}
                                onClick={() => {
                                  setProfileInputValue(val != null ? String(val) : '')
                                  setEditingProfile({ actorId: a.id, key })
                                }}
                                className={`w-14 h-5 text-center text-white text-xs leading-tight rounded ${isGray ? 'bg-gray-600 hover:bg-gray-500' : 'bg-blue-700 hover:bg-blue-600'}`}
                              >
                                {label}:{val ?? '-'}
                              </button>
                            )
                          })}
                        </div>
                        <p className="text-blue-400 text-xs font-bold shrink-0">{(a.physScore ?? 0).toFixed(2)}점</p>
                      </div>
                      <div className="flex flex-col gap-0 shrink-0">
                        <div className="flex gap-0.5">
                          {EDIT_SCORE_FIELDS.map(({ label }) => (
                            <div key={label} className="w-9 text-center text-gray-500 text-xs leading-tight">{label}</div>
                          ))}
                        </div>
                        <div className="flex gap-0.5">
                          {EDIT_SCORE_FIELDS.map(({ label, getValue, apiKey }) => {
                            const isEditing = editingCell?.actorId === a.id && editingCell?.key === apiKey
                            const currentVal = getValue(a)
                            return isEditing ? (
                              <select
                                key={label}
                                autoFocus
                                defaultValue={currentVal}
                                onChange={e => handleScoreChange(a.id, apiKey, Number(e.target.value))}
                                onBlur={() => setEditingCell(null)}
                                className="w-9 h-5 text-center bg-gray-600 text-white text-xs leading-tight rounded px-0 py-0"
                              >
                                {SCORE_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                              </select>
                            ) : (
                              <button
                                key={label}
                                onClick={() => setEditingCell({ actorId: a.id, key: apiKey })}
                                className="w-9 h-5 text-center bg-gray-600 hover:bg-gray-500 text-white text-xs leading-tight rounded px-0 py-0"
                              >
                                {currentVal}
                              </button>
                            )
                          })}
                        </div>
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
      {tooltip && <CardTooltip tooltip={tooltip} />}
    </div>
  )
}
