import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react'
import type { Tag, Actor } from '../types'
import { pushEscHandler, popEscHandler } from '../escManager'

type TagMode = 'and' | 'or'

interface WorkSearchParams {
  keyword: string
  tagIds: number[]
  tagMode: TagMode
  actorId: number | ''
  studioId: number | ''
  releaseDateFrom: string
  releaseDateTo: string
  releaseDateNull: boolean
  ratingFrom: number | ''
  ratingTo: number | ''
  titleSearch: string
  titleNull: boolean
  commentSearch: string
  commentNull: boolean
  actorCountFrom: number | ''
  actorCountTo: number | ''
  actorCountNull: boolean
}

interface ActorSearchParams {
  keyword: string
  tagIds: number[]
  tagMode: TagMode
  ageFrom: number | ''
  ageTo: number | ''
  debutDateFrom: string
  debutDateTo: string
  workCountFrom: number | ''
  workCountTo: number | ''
  avgRatingFrom: number | ''
  avgRatingTo: number | ''
  faceFrom: number | ''; faceTo: number | ''
  bustScoreFrom: number | ''; bustScoreTo: number | ''
  hipScoreFrom: number | ''; hipScoreTo: number | ''
  physicalScoreFrom: number | ''; physicalScoreTo: number | ''
  skinFrom: number | ''; skinTo: number | ''
  actingFrom: number | ''; actingTo: number | ''
  sexyFrom: number | ''; sexyTo: number | ''
  charmFrom: number | ''; charmTo: number | ''
  techniqueFrom: number | ''; techniqueTo: number | ''
  proportionsFrom: number | ''; proportionsTo: number | ''
  ratioScoreFrom: number | ''; ratioScoreTo: number | ''
  heightFrom: number | ''; heightTo: number | ''
  bustFrom: number | ''; bustTo: number | ''
  waistFrom: number | ''; waistTo: number | ''
  hipFrom: number | ''; hipTo: number | ''
  cupFrom: string; cupTo: string
  ageNull: boolean
  debutDateNull: boolean
  workCountNull: boolean
  heightNull: boolean
  bustNull: boolean
  waistNull: boolean
  hipNull: boolean
  cupNull: boolean
}

export const DEFAULT_WORK_SEARCH: WorkSearchParams = {
  keyword: '', tagIds: [], tagMode: 'and', actorId: '', studioId: '',
  releaseDateFrom: '', releaseDateTo: '', releaseDateNull: false, ratingFrom: '', ratingTo: '',
  titleSearch: '', titleNull: false, commentSearch: '', commentNull: false,
  actorCountFrom: '', actorCountTo: '', actorCountNull: false,
}

export const DEFAULT_ACTOR_SEARCH: ActorSearchParams = {
  keyword: '', tagIds: [], tagMode: 'and',
  ageFrom: '', ageTo: '', ageNull: false, debutDateFrom: '', debutDateTo: '', debutDateNull: false,
  workCountFrom: '', workCountTo: '', workCountNull: false, avgRatingFrom: '', avgRatingTo: '',
  faceFrom: '', faceTo: '', bustScoreFrom: '', bustScoreTo: '',
  hipScoreFrom: '', hipScoreTo: '', physicalScoreFrom: '', physicalScoreTo: '',
  skinFrom: '', skinTo: '', actingFrom: '', actingTo: '',
  sexyFrom: '', sexyTo: '', charmFrom: '', charmTo: '',
  techniqueFrom: '', techniqueTo: '', proportionsFrom: '', proportionsTo: '',
  ratioScoreFrom: '', ratioScoreTo: '',
  heightFrom: '', heightTo: '', bustFrom: '', bustTo: '',
  waistFrom: '', waistTo: '', hipFrom: '', hipTo: '',
  cupFrom: '', cupTo: '',
  heightNull: false, bustNull: false, waistNull: false, hipNull: false, cupNull: false,
}

export type { WorkSearchParams, ActorSearchParams, TagMode }

// ── helpers ──────────────────────────────────────────────────────────────────

const KO_TO_CUP: Record<string, string> = { ㅁ:'A',ㅠ:'B',ㅊ:'C',ㅇ:'D',ㄷ:'E',ㄹ:'F',ㅎ:'G',ㅗ:'H',ㅑ:'I',ㅓ:'J',ㅏ:'K',ㅣ:'L',ㅡ:'M' }
const STAR_OPTIONS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]

function renderStars(v: number): string {
  let s = ''
  for (let i = 1; i <= 5; i++) {
    if (v >= i) s += '★'
    else if (v >= i - 0.5) s += '½'
    else s += '☆'
  }
  return s
}

function subtractDate(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return d.toISOString().slice(0, 10)
}

function normalizeDateRaw(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 8) return `${digits.slice(0,4)}-${digits.slice(4,6)}-${digits.slice(6,8)}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  return raw
}

// ── sub-components ────────────────────────────────────────────────────────────

function DatePickerInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const dateRef = useRef<HTMLInputElement>(null)
  const displayVal = value ? value.replace(/-/g, '') : ''
  return (
    <div className="flex items-center gap-0.5">
      <input
        type="text"
        value={displayVal}
        onChange={e => onChange(normalizeDateRaw(e.target.value))}
        placeholder="YYYYMMDD"
        maxLength={10}
        className="bg-gray-700 text-white text-xs px-1.5 py-1 rounded w-20"
      />
      <button
        type="button"
        title="달력"
        onClick={() => (dateRef.current as any)?.showPicker?.()}
        className="text-gray-400 hover:text-white text-xs px-1 py-1 rounded hover:bg-gray-700"
      >
        🗓
      </button>
      <input
        type="date"
        ref={dateRef}
        value={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''}
        onChange={e => onChange(e.target.value)}
        className="sr-only"
        tabIndex={-1}
      />
    </div>
  )
}

function StarDisplay({ value }: { value: number }) {
  return (
    <div className="flex" style={{ gap: 1 }}>
      {[1, 2, 3, 4, 5].map(star => {
        const full = value >= star
        const half = !full && value >= star - 0.5
        return (
          <div key={star} className="relative" style={{ width: 12, height: 12, fontSize: 12, lineHeight: '12px' }}>
            <span className="text-gray-600">★</span>
            {(full || half) && (
              <span className="absolute inset-0 text-yellow-400 overflow-hidden whitespace-nowrap" style={{ width: full ? '100%' : '50%' }}>★</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function StarSelect({ value, onChange }: { value: number | ''; onChange: (v: number | '') => void }) {
  const [open, setOpen] = useState(false)
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node))
        setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = () => setOpen(false)
    pushEscHandler(handler)
    return () => popEscHandler(handler)
  }, [open])

  const handleOpen = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setDropPos({ top: r.bottom + 2, left: r.left })
    }
    setOpen(v => !v)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        className="bg-gray-700 text-white text-xs px-2 py-1 rounded flex items-center gap-1.5 w-24"
      >
        {value === '' ? <span className="text-gray-400">-</span> : <StarDisplay value={value as number} />}
        <span className="text-gray-500 text-xs ml-auto">▼</span>
      </button>
      {open && (
        <div ref={dropRef} className="fixed z-50 bg-gray-900 border border-gray-700 rounded shadow-xl py-0.5" style={{ top: dropPos.top, left: dropPos.left }}>
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false) }}
            className={`w-full px-2 py-1 text-left flex items-center hover:bg-gray-700 ${value === '' ? 'bg-gray-700' : ''}`}
          >
            <span className="text-gray-400 text-xs">-</span>
          </button>
          {STAR_OPTIONS.map(v => (
            <button
              key={v}
              type="button"
              onClick={() => { onChange(v); setOpen(false) }}
              className={`w-full px-2 py-1 flex items-center hover:bg-gray-700 ${value === v ? 'bg-gray-700' : ''}`}
            >
              <StarDisplay value={v} />
            </button>
          ))}
        </div>
      )}
    </>
  )
}

function NumInput({ value, onChange, className = '' }: { value: number | ''; onChange: (v: number | '') => void; className?: string }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value === '' ? '' : String(value)}
      onChange={e => {
        const v = e.target.value.trim()
        if (v === '') { onChange(''); return }
        const n = Number(v)
        if (!isNaN(n)) onChange(n)
      }}
      className={`bg-gray-700 text-white text-xs px-1.5 py-1 rounded w-12 text-center ${className}`}
    />
  )
}

function CupInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => {
        const converted = e.target.value.split('').map(c => KO_TO_CUP[c] ?? c).join('')
        onChange(converted.toUpperCase())
      }}
      placeholder="A"
      className="bg-gray-700 text-white text-xs px-1.5 py-1 rounded w-10 text-center"
    />
  )
}

// ── props ─────────────────────────────────────────────────────────────────────

interface WorkSearchProps {
  type: 'works'
  params: WorkSearchParams
  onChange: (params: WorkSearchParams) => void
  tags: Tag[]
  actors: Actor[]
  studios: { id: number; name: string; maker_id?: number | null; maker_name?: string | null }[]
  resultCount?: number
}

interface ActorSearchProps {
  type: 'actors'
  params: ActorSearchParams
  onChange: (params: ActorSearchParams) => void
  tags: Tag[]
  resultCount?: number
}

type Props = WorkSearchProps | ActorSearchProps

const SCORE_FIELDS_ADV = [
  { fromKey: 'faceFrom', toKey: 'faceTo', label: '얼굴' },
  { fromKey: 'bustScoreFrom', toKey: 'bustScoreTo', label: '가슴' },
  { fromKey: 'hipScoreFrom', toKey: 'hipScoreTo', label: '엉덩이' },
  { fromKey: 'physicalScoreFrom', toKey: 'physicalScoreTo', label: '몸매' },
  { fromKey: 'skinFrom', toKey: 'skinTo', label: '피부' },
  { fromKey: 'actingFrom', toKey: 'actingTo', label: '연기력' },
  { fromKey: 'sexyFrom', toKey: 'sexyTo', label: '섹기' },
  { fromKey: 'charmFrom', toKey: 'charmTo', label: '매력' },
  { fromKey: 'techniqueFrom', toKey: 'techniqueTo', label: '테크닉' },
  { fromKey: 'proportionsFrom', toKey: 'proportionsTo', label: '비율' },
] as const

// ── main component ────────────────────────────────────────────────────────────

export default function SearchBar(props: Props) {
  const { type, params, onChange, tags, resultCount } = props
  const actors = type === 'works' ? (props as WorkSearchProps).actors : []
  const studios = type === 'works' ? (props as WorkSearchProps).studios : []
  const wParams = type === 'works' ? params as WorkSearchParams : null
  const aParams = type === 'actors' ? params as ActorSearchParams : null

  // ── advanced panel ───────────────────────────────────────────────
  const [advancedOpen, setAdvancedOpen] = useState(() =>
    localStorage.getItem(`${type}:advancedOpen`) === 'true'
  )
  const [advancedPos, setAdvancedPos] = useState({ top: 0, left: 0 })
  const advancedToggleRef = useRef<HTMLButtonElement>(null)
  const advancedPanelRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!advancedOpen) return
    const handler = (e: MouseEvent) => {
      if (
        advancedPanelRef.current && !advancedPanelRef.current.contains(e.target as Node) &&
        advancedToggleRef.current && !advancedToggleRef.current.contains(e.target as Node)
      ) {
        setAdvancedOpen(false)
        localStorage.setItem(`${type}:advancedOpen`, 'false')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [advancedOpen, type])

  useEffect(() => {
    if (!advancedOpen) return
    const handler = () => {
      setAdvancedOpen(false)
      localStorage.setItem(`${type}:advancedOpen`, 'false')
    }
    pushEscHandler(handler)
    return () => popEscHandler(handler)
  }, [advancedOpen, type])

  const toggleAdvanced = () => {
    const next = !advancedOpen
    if (next && advancedToggleRef.current && wrapperRef.current) {
      const container = wrapperRef.current.parentElement ?? wrapperRef.current
      const cr = container.getBoundingClientRect()
      setAdvancedPos({ top: cr.bottom + 3, left: cr.left })
    }
    setAdvancedOpen(next)
    localStorage.setItem(`${type}:advancedOpen`, String(next))
  }

  useEffect(() => {
    if (!advancedOpen || !advancedToggleRef.current || !wrapperRef.current) return
    const container = wrapperRef.current.parentElement ?? wrapperRef.current
    const cr = container.getBoundingClientRect()
    setAdvancedPos({ top: cr.bottom + 3, left: cr.left })
  }, [advancedOpen])

  // ── studio dropdown ──────────────────────────────────────────────
  const [studioDropOpen, setStudioDropOpen] = useState(false)
  const [studioFilter, setStudioFilter] = useState('')
  const [studioDropPos, setStudioDropPos] = useState({ top: 0, left: 0, width: 0 })
  const studioButtonRef = useRef<HTMLButtonElement>(null)
  const studioDropRef = useRef<HTMLDivElement>(null)
  const [studioHoverIdx, setStudioHoverIdx] = useState(-1)
  const closeStudioDrop = useCallback(() => { setStudioDropOpen(false); setStudioFilter(''); setStudioHoverIdx(-1) }, [])

  useEffect(() => { setStudioHoverIdx(-1) }, [studioFilter])

  useEffect(() => {
    if (studioHoverIdx < 0) return
    studioDropRef.current?.querySelector('[data-studio-hover]')?.scrollIntoView({ block: 'nearest' })
  }, [studioHoverIdx])

  useEffect(() => {
    if (!studioDropOpen) return
    pushEscHandler(closeStudioDrop)
    return () => popEscHandler(closeStudioDrop)
  }, [studioDropOpen, closeStudioDrop])

  useEffect(() => {
    if (!studioDropOpen) return
    const handler = (e: MouseEvent) => {
      if (studioDropRef.current && !studioDropRef.current.contains(e.target as Node) &&
          studioButtonRef.current && !studioButtonRef.current.contains(e.target as Node))
        closeStudioDrop()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [studioDropOpen, closeStudioDrop])

  // ── actor dropdown ───────────────────────────────────────────────
  const [actorDropOpen, setActorDropOpen] = useState(false)
  const [actorFilter, setActorFilter] = useState('')
  const [actorDropPos, setActorDropPos] = useState({ top: 0, left: 0, width: 0 })
  const [actorHoverIdx, setActorHoverIdx] = useState(-1)
  const actorButtonRef = useRef<HTMLButtonElement>(null)
  const actorDropRef = useRef<HTMLDivElement>(null)
  const closeActorDrop = useCallback(() => { setActorDropOpen(false); setActorFilter(''); setActorHoverIdx(-1) }, [])

  useEffect(() => { setActorHoverIdx(-1) }, [actorFilter])

  useEffect(() => {
    if (!actorDropOpen) return
    pushEscHandler(closeActorDrop)
    return () => popEscHandler(closeActorDrop)
  }, [actorDropOpen, closeActorDrop])

  useEffect(() => {
    if (actorHoverIdx < 0) return
    actorDropRef.current?.querySelector('[data-actor-hover]')?.scrollIntoView({ block: 'nearest' })
  }, [actorHoverIdx])

  useEffect(() => {
    if (!actorDropOpen) return
    setTimeout(() => {
      actorDropRef.current?.querySelector('[data-actor-selected]')?.scrollIntoView({ block: 'start' })
    }, 0)
  }, [actorDropOpen])

  useEffect(() => {
    if (!studioDropOpen) return
    setTimeout(() => {
      studioDropRef.current?.querySelector('[data-studio-selected]')?.scrollIntoView({ block: 'start' })
    }, 0)
  }, [studioDropOpen])

  useEffect(() => {
    if (!actorDropOpen) return
    const handler = (e: MouseEvent) => {
      if (actorDropRef.current && !actorDropRef.current.contains(e.target as Node) &&
          actorButtonRef.current && !actorButtonRef.current.contains(e.target as Node))
        closeActorDrop()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [actorDropOpen, closeActorDrop])

  // ── tag dropdown ─────────────────────────────────────────────────
  const [tagOpen, setTagOpen] = useState(false)
  const [tagFilter, setTagFilter] = useState('')
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })
  const [savedTagIds, setSavedTagIds] = useState<number[] | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const isNoTag = params.tagIds.length === 1 && params.tagIds[0] === -1

  const toggleNoTag = () => {
    if (isNoTag) {
      onChange({ ...params, tagIds: savedTagIds ?? [] } as never)
      setSavedTagIds(null)
    } else {
      setSavedTagIds(params.tagIds)
      onChange({ ...params, tagIds: [-1] } as never)
    }
  }

  useEffect(() => {
    if (!tagOpen) return
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(e.target as Node))
        setTagOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [tagOpen])

  useEffect(() => {
    if (!tagOpen) return
    const handler = () => setTagOpen(false)
    pushEscHandler(handler)
    return () => popEscHandler(handler)
  }, [tagOpen])

  const handleToggleTagDropdown = () => {
    if (!tagOpen && wrapperRef.current) {
      const container = wrapperRef.current.parentElement ?? wrapperRef.current
      const cr = container.getBoundingClientRect()
      setDropdownPos({ top: cr.bottom + 4, left: cr.left })
    }
    setTagOpen(v => !v)
  }

  const filteredTags = tagFilter ? tags.filter(t => t.name.toLowerCase().includes(tagFilter.toLowerCase())) : tags

  const toggleTag = (id: number) => {
    const active = params.tagIds.includes(id)
    const tagIds = active ? params.tagIds.filter(x => x !== id) : [...params.tagIds, id]
    onChange({ ...params, tagIds } as never)
  }

  // ── reset ────────────────────────────────────────────────────────
  const handleReset = () => {
    if (type === 'works') onChange(DEFAULT_WORK_SEARCH as never)
    else onChange(DEFAULT_ACTOR_SEARCH as never)
    setSavedTagIds(null)
  }

  // ── sorted studios ───────────────────────────────────────────────
  const sortedStudios = [...studios].sort((a, b) => {
    const mc = (a.maker_name ?? '').localeCompare(b.maker_name ?? '', 'ko-KR', { sensitivity: 'base' })
    if (mc !== 0) return mc
    return a.name.localeCompare(b.name, 'ko-KR', { sensitivity: 'base' })
  })

  const studioId = wParams?.studioId ?? ''
  const actorId = wParams?.actorId ?? ''

  const filteredStudios = studioFilter
    ? sortedStudios.filter(s => {
        const full = s.maker_name && s.maker_name !== s.name ? `${s.maker_name} ${s.name}` : s.name
        return full.toLowerCase().includes(studioFilter.toLowerCase())
      })
    : sortedStudios

  const filteredActors = actorFilter
    ? actors.filter(a => a.name.toLowerCase().includes(actorFilter.toLowerCase()))
    : actors

  const selectedStudio = studios.find(s => s.id === studioId)
  const studioLabel = studioId === '' ? '레이블 전체'
    : studioId === -1 ? '레이블 없음'
    : selectedStudio ? (selectedStudio.maker_name && selectedStudio.maker_name !== selectedStudio.name
        ? `${selectedStudio.maker_name} ${selectedStudio.name}` : selectedStudio.name)
    : '레이블 전체'

  const selectedActor = actors.find(a => a.id === actorId)
  const actorLabel = actorId === '' ? '배우 전체' : actorId === -1 ? '배우 없음' : selectedActor?.name ?? '배우 전체'

  // ── status bar conditions ────────────────────────────────────────
  const selectedTagObjs = tags.filter(t => params.tagIds.includes(t.id))
  const conditions: { label: ReactNode; onClear: () => void }[] = []

  if (type === 'works' && wParams) {
    const wp = wParams
    if (wp.keyword) conditions.push({ label: `품번: ${wp.keyword}`, onClear: () => onChange({ ...wp, keyword: '' } as never) })
    if (studioId !== '') {
      if (studioId === -1) conditions.push({ label: '레이블: 없음', onClear: () => onChange({ ...wp, studioId: '' } as never) })
      else if (selectedStudio) conditions.push({ label: `레이블: ${selectedStudio.maker_name && selectedStudio.maker_name !== selectedStudio.name ? `${selectedStudio.maker_name} ${selectedStudio.name}` : selectedStudio.name}`, onClear: () => onChange({ ...wp, studioId: '' } as never) })
    }
    if (actorId !== '') {
      if (actorId === -1) conditions.push({ label: '배우: 없음', onClear: () => onChange({ ...wp, actorId: '' } as never) })
      else if (selectedActor) conditions.push({ label: `배우: ${selectedActor.name}`, onClear: () => onChange({ ...wp, actorId: '' } as never) })
    }
    if (wp.releaseDateFrom || wp.releaseDateTo)
      conditions.push({ label: `발매일: ${wp.releaseDateFrom || '?'} ~ ${wp.releaseDateTo || '?'}`, onClear: () => onChange({ ...wp, releaseDateFrom: '', releaseDateTo: '' } as never) })
    if (wp.ratingFrom !== '' || wp.ratingTo !== '')
      conditions.push({
        label: (
          <span className="flex items-center gap-1">
            별점
            {wp.ratingFrom !== '' ? <StarDisplay value={wp.ratingFrom as number} /> : <span className="text-gray-400">?</span>}
            <span>~</span>
            {wp.ratingTo !== '' ? <StarDisplay value={wp.ratingTo as number} /> : <span className="text-gray-400">?</span>}
          </span>
        ),
        onClear: () => onChange({ ...wp, ratingFrom: '', ratingTo: '' } as never),
      })
    if (wp.actorCountFrom !== '' || wp.actorCountTo !== '')
      conditions.push({ label: `배우수: ${wp.actorCountFrom !== '' ? wp.actorCountFrom : '?'}~${wp.actorCountTo !== '' ? wp.actorCountTo : '?'}`, onClear: () => onChange({ ...wp, actorCountFrom: '', actorCountTo: '' } as never) })
    if (wp.actorCountNull) conditions.push({ label: '배우없음', onClear: () => onChange({ ...wp, actorCountNull: false } as never) })
    if (wp.titleSearch) conditions.push({ label: `타이틀: ${wp.titleSearch}`, onClear: () => onChange({ ...wp, titleSearch: '' } as never) })
    if (wp.titleNull) conditions.push({ label: '타이틀없음', onClear: () => onChange({ ...wp, titleNull: false } as never) })
    if (wp.releaseDateNull) conditions.push({ label: '발매일없음', onClear: () => onChange({ ...wp, releaseDateNull: false } as never) })
    if (wp.commentSearch) conditions.push({ label: `코멘트: ${wp.commentSearch}`, onClear: () => onChange({ ...wp, commentSearch: '' } as never) })
    if (wp.commentNull) conditions.push({ label: '코멘트없음', onClear: () => onChange({ ...wp, commentNull: false } as never) })
  }

  if (type === 'actors' && aParams) {
    const ap = aParams
    if (ap.keyword) conditions.push({ label: `이름: ${ap.keyword}`, onClear: () => onChange({ ...ap, keyword: '' } as never) })
    if (ap.ageNull) conditions.push({ label: '나이없음', onClear: () => onChange({ ...ap, ageNull: false } as never) })
    if (ap.ageFrom !== '' || ap.ageTo !== '')
      conditions.push({ label: `나이: ${ap.ageFrom !== '' ? ap.ageFrom : '?'}~${ap.ageTo !== '' ? ap.ageTo : '?'}`, onClear: () => onChange({ ...ap, ageFrom: '', ageTo: '' } as never) })
    if (ap.debutDateNull) conditions.push({ label: '데뷔일없음', onClear: () => onChange({ ...ap, debutDateNull: false } as never) })
    if (ap.debutDateFrom || ap.debutDateTo)
      conditions.push({ label: `데뷔일: ${ap.debutDateFrom || '?'} ~ ${ap.debutDateTo || '?'}`, onClear: () => onChange({ ...ap, debutDateFrom: '', debutDateTo: '' } as never) })
    if (ap.workCountNull) conditions.push({ label: '작품수없음', onClear: () => onChange({ ...ap, workCountNull: false } as never) })
    if (ap.workCountFrom !== '' || ap.workCountTo !== '')
      conditions.push({ label: `작품수: ${ap.workCountFrom !== '' ? ap.workCountFrom : '?'}~${ap.workCountTo !== '' ? ap.workCountTo : '?'}`, onClear: () => onChange({ ...ap, workCountFrom: '', workCountTo: '' } as never) })
    if (ap.avgRatingFrom !== '' || ap.avgRatingTo !== '')
      conditions.push({ label: `평점: ${ap.avgRatingFrom !== '' ? ap.avgRatingFrom : '?'}~${ap.avgRatingTo !== '' ? ap.avgRatingTo : '?'}`, onClear: () => onChange({ ...ap, avgRatingFrom: '', avgRatingTo: '' } as never) })
    for (const { fromKey, toKey, label } of SCORE_FIELDS_ADV) {
      const f = ap[fromKey as keyof ActorSearchParams]
      const t = ap[toKey as keyof ActorSearchParams]
      if (f !== '' || t !== '') conditions.push({ label: `${label}: ${f !== '' ? f : '?'}~${t !== '' ? t : '?'}`, onClear: () => onChange({ ...ap, [fromKey]: '', [toKey]: '' } as never) })
    }
    if (ap.ratioScoreFrom !== '' || ap.ratioScoreTo !== '')
      conditions.push({ label: `피지컬: ${ap.ratioScoreFrom !== '' ? ap.ratioScoreFrom : '?'}~${ap.ratioScoreTo !== '' ? ap.ratioScoreTo : '?'}`, onClear: () => onChange({ ...ap, ratioScoreFrom: '', ratioScoreTo: '' } as never) })
    if (ap.heightNull) conditions.push({ label: '키없음', onClear: () => onChange({ ...ap, heightNull: false } as never) })
    if (ap.heightFrom !== '' || ap.heightTo !== '') conditions.push({ label: `키: ${ap.heightFrom !== '' ? ap.heightFrom : '?'}~${ap.heightTo !== '' ? ap.heightTo : '?'}`, onClear: () => onChange({ ...ap, heightFrom: '', heightTo: '' } as never) })
    if (ap.bustNull) conditions.push({ label: '바스트없음', onClear: () => onChange({ ...ap, bustNull: false } as never) })
    if (ap.bustFrom !== '' || ap.bustTo !== '') conditions.push({ label: `바스트: ${ap.bustFrom !== '' ? ap.bustFrom : '?'}~${ap.bustTo !== '' ? ap.bustTo : '?'}`, onClear: () => onChange({ ...ap, bustFrom: '', bustTo: '' } as never) })
    if (ap.waistNull) conditions.push({ label: '웨이스트없음', onClear: () => onChange({ ...ap, waistNull: false } as never) })
    if (ap.waistFrom !== '' || ap.waistTo !== '') conditions.push({ label: `웨이스트: ${ap.waistFrom !== '' ? ap.waistFrom : '?'}~${ap.waistTo !== '' ? ap.waistTo : '?'}`, onClear: () => onChange({ ...ap, waistFrom: '', waistTo: '' } as never) })
    if (ap.hipNull) conditions.push({ label: '힙없음', onClear: () => onChange({ ...ap, hipNull: false } as never) })
    if (ap.hipFrom !== '' || ap.hipTo !== '') conditions.push({ label: `힙: ${ap.hipFrom !== '' ? ap.hipFrom : '?'}~${ap.hipTo !== '' ? ap.hipTo : '?'}`, onClear: () => onChange({ ...ap, hipFrom: '', hipTo: '' } as never) })
    if (ap.cupNull) conditions.push({ label: '컵없음', onClear: () => onChange({ ...ap, cupNull: false } as never) })
    if (ap.cupFrom || ap.cupTo) conditions.push({ label: `컵: ${ap.cupFrom || '?'}~${ap.cupTo || '?'}`, onClear: () => onChange({ ...ap, cupFrom: '', cupTo: '' } as never) })
  }

  // ── render ────────────────────────────────────────────────────────
  return (
    <div ref={wrapperRef} className="flex items-center gap-2 flex-1 min-w-0">
      {/* keyword */}
      <input
        type="text"
        value={params.keyword}
        onChange={e => onChange({ ...params, keyword: e.target.value } as never)}
        placeholder={type === 'works' ? '품번 검색' : '이름 검색'}
        className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded flex-1 min-w-0"
      />

      {/* actor dropdown (works only) */}
      {type === 'works' && wParams && (
        <div className="relative">
          <button
            ref={actorButtonRef}
            type="button"
            onClick={() => {
              if (!actorDropOpen && actorButtonRef.current) {
                const r = actorButtonRef.current.getBoundingClientRect()
                setActorDropPos({ top: r.bottom + 2, left: r.left, width: Math.max(r.width, 180) })
              }
              setActorDropOpen(v => !v)
            }}
            className={`bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-[120px] text-left flex items-center justify-between gap-1 shrink-0 ${actorId !== '' ? 'ring-1 ring-blue-500' : ''}`}
          >
            <span className="truncate">{actorLabel}</span>
            <span className="text-gray-400 text-xs shrink-0">▼</span>
          </button>
          {actorDropOpen && (
            <div ref={actorDropRef} className="fixed z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-xl flex flex-col" style={{ top: actorDropPos.top, left: actorDropPos.left, width: actorDropPos.width, maxHeight: '600px' }}>
              <div className="p-1.5 border-b border-gray-700">
                <input
                  type="text"
                  value={actorFilter}
                  onChange={e => setActorFilter(e.target.value)}
                  placeholder="배우 검색"
                  autoFocus
                  className="bg-gray-700 text-white text-xs px-2 py-1 rounded w-full"
                  onKeyDown={e => {
                    const total = 2 + filteredActors.length
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setActorHoverIdx(prev => prev >= total - 1 ? 0 : prev + 1)
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setActorHoverIdx(prev => prev <= 0 ? total - 1 : prev - 1)
                    } else if (e.key === 'Enter' && actorHoverIdx >= 0) {
                      e.preventDefault()
                      if (actorHoverIdx === 0) { onChange({ ...wParams, actorId: '' } as never); closeActorDrop() }
                      else if (actorHoverIdx === 1) { onChange({ ...wParams, actorId: -1 } as never); closeActorDrop() }
                      else { const a = filteredActors[actorHoverIdx - 2]; if (a) { onChange({ ...wParams, actorId: a.id } as never); closeActorDrop() } }
                    }
                  }}
                />
              </div>
              <div className="overflow-y-auto">
                <button type="button" onClick={() => { onChange({ ...wParams, actorId: '' } as never); closeActorDrop() }} {...(actorHoverIdx === 0 ? { 'data-actor-hover': '' } : {})} className={`w-full text-left px-2 py-1.5 text-sm hover:bg-gray-700 ${actorHoverIdx === 0 ? 'bg-gray-700' : ''} ${actorId === '' ? 'text-white font-bold' : 'text-gray-300'}`}>배우 전체</button>
                <button type="button" onClick={() => { onChange({ ...wParams, actorId: -1 } as never); closeActorDrop() }} {...(actorHoverIdx === 1 ? { 'data-actor-hover': '' } : {})} className={`w-full text-left px-2 py-1.5 text-sm hover:bg-gray-700 ${actorHoverIdx === 1 ? 'bg-gray-700' : ''} ${actorId === -1 ? 'text-white font-bold' : 'text-gray-300'}`}>배우 없음</button>
                {filteredActors.length === 0 && <p className="text-xs text-gray-500 text-center py-2">결과 없음</p>}
                {filteredActors.map((a, i) => {
                  const isHover = actorHoverIdx === i + 2
                  return (
                    <button key={a.id} type="button" onClick={() => { onChange({ ...wParams, actorId: a.id } as never); closeActorDrop() }} {...(actorId === a.id ? { 'data-actor-selected': '' } : {})} {...(isHover ? { 'data-actor-hover': '' } : {})} className={`w-full text-left px-2 py-1.5 text-sm hover:bg-gray-700 truncate ${isHover ? 'bg-gray-700' : ''} ${actorId === a.id ? 'text-white font-bold' : 'text-gray-300'}`}>{a.name}</button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* tag button */}
      <div className="relative">
        <button
          ref={buttonRef}
          onClick={handleToggleTagDropdown}
          className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-sm ${tagOpen ? 'bg-gray-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'} ${params.tagIds.length > 0 ? 'ring-1 ring-blue-500' : ''}`}
        >
          태그 <span className="text-gray-500 text-xs">▼</span>
        </button>
        {tagOpen && (
          <div ref={popoverRef} className="fixed z-50 border border-gray-700 rounded-lg shadow-xl w-[min(63rem,90vw)]" style={{ top: dropdownPos.top, left: dropdownPos.left, backgroundColor: 'rgba(26, 35, 50, 0.9)', backdropFilter: 'blur(8px)' }}>
            <div className="p-2 border-b border-gray-700 space-y-1.5">
              <div className="flex gap-1">
                <input type="text" value={tagFilter} onChange={e => setTagFilter(e.target.value)} placeholder="태그 검색" className="bg-gray-700 text-white text-xs px-2 py-1 rounded min-w-0" style={{ flex: '6' }} autoFocus />
                <button onClick={() => { setSavedTagIds(null); onChange({ ...params, tagIds: [] } as never) }} className="text-xs py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600" style={{ flex: '2' }}>선택초기화</button>
                <button onClick={toggleNoTag} className={`text-xs py-1 rounded ${isNoTag ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`} style={{ flex: '2' }}>태그 없음</button>
              </div>
              {params.tagIds.length > 1 && !isNoTag && (
                <div className="flex gap-1">
                  <button onClick={() => onChange({ ...params, tagMode: 'and' } as never)} className={`flex-1 text-xs py-0.5 rounded ${params.tagMode === 'and' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}>AND</button>
                  <button onClick={() => onChange({ ...params, tagMode: 'or' } as never)} className={`flex-1 text-xs py-0.5 rounded ${params.tagMode === 'or' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}>OR</button>
                </div>
              )}
            </div>
            <div className={`max-h-[39rem] overflow-y-auto p-2 ${isNoTag ? 'opacity-40 pointer-events-none' : ''}`}>
              {filteredTags.length === 0 && <p className="text-xs text-gray-500 w-full text-center py-2">태그 없음</p>}
              {filteredTags.length > 0 && (tagFilter ? (
                <div className="flex flex-wrap gap-1">
                  {filteredTags.map(t => {
                    const active = params.tagIds.includes(t.id)
                    return <button key={t.id} onClick={() => toggleTag(t.id)} className={`px-2 py-0.5 rounded text-xs ${active ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>{t.name}</button>
                  })}
                </div>
              ) : (() => {
                type Group = { catId: number | null; catName: string | null; sortOrder: number; tags: Tag[] }
                const catMap = new Map<number | null, Group>()
                const groups: Group[] = []
                for (const tag of tags) {
                  const key = tag.category_id ?? null
                  if (!catMap.has(key)) {
                    const g: Group = { catId: key, catName: tag.category_name ?? null, sortOrder: tag.category_sort_order ?? 999999, tags: [] }
                    catMap.set(key, g); groups.push(g)
                  }
                  catMap.get(key)!.tags.push(tag)
                }
                groups.sort((a, b) => a.catId === null ? 1 : b.catId === null ? -1 : a.sortOrder - b.sortOrder)
                return (
                  <div className="space-y-2">
                    {groups.map(g => (
                      <div key={g.catId ?? 'none'}>
                        <p className="text-xs text-gray-500 mb-1 border-b border-gray-700 pb-0.5">{g.catName ?? '미분류'}</p>
                        <div className="flex flex-wrap gap-1">
                          {g.tags.map(t => {
                            const active = params.tagIds.includes(t.id)
                            return <button key={t.id} onClick={() => toggleTag(t.id)} className={`px-2 py-0.5 rounded text-xs ${active ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>{t.name}</button>
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })())}
            </div>
          </div>
        )}
      </div>

      {/* result count */}
      {resultCount !== undefined && (
        <div className="w-25 shrink-0 bg-gray-700 rounded px-2 py-1.5 text-sm text-gray-300 whitespace-nowrap">
          결과: {resultCount}
        </div>
      )}

      {/* reset */}
      <button onClick={handleReset} className="px-3 py-1.5 rounded text-sm bg-gray-600 hover:bg-gray-500 text-gray-300 shrink-0">
        초기화
      </button>

      {/* advanced toggle */}
      <button
        ref={advancedToggleRef}
        type="button"
        onClick={toggleAdvanced}
        className={`px-2 py-1.5 rounded text-sm shrink-0 ${advancedOpen ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
      >
        {advancedOpen ? '▲' : '▼'}
      </button>

      {/* ── advanced panel ──────────────────────────────────────────── */}
      {advancedOpen && (
        <div
          ref={advancedPanelRef}
          className="fixed z-40 border border-gray-700 rounded-lg shadow-2xl overflow-y-auto"
          style={{
            top: advancedPos.top,
            left: advancedPos.left,
            maxHeight: 'calc(100vh - 80px)',
            width: type === 'works' ? '680px' : '680px',
          }}
        >
          <div className="absolute inset-0 rounded-lg -z-10" style={{ backgroundColor: 'rgba(26, 35, 50, 0.9)', backdropFilter: 'blur(8px)' }} />
          <div className="p-3 space-y-3">
            {/* ── works ─────────────────────────────────────────── */}
            {type === 'works' && wParams && (
              <>
                <div className="flex gap-2 flex-wrap">
                  {/* studio dropdown */}
                  <div className="relative">
                    <button
                      ref={studioButtonRef}
                      type="button"
                      onClick={() => {
                        if (!studioDropOpen && studioButtonRef.current) {
                          const r = studioButtonRef.current.getBoundingClientRect()
                          setStudioDropPos({ top: r.bottom + 2, left: r.left, width: Math.max(r.width, 180) })
                        }
                        setStudioDropOpen(v => !v)
                      }}
                      className={`bg-gray-700 text-white text-xs px-2 py-1.5 rounded w-[250px] text-left flex items-center justify-between gap-1 ${studioId !== '' ? 'ring-1 ring-blue-500' : ''}`}
                    >
                      <span className="truncate">{studioLabel}</span>
                      <span className="text-gray-400 text-xs shrink-0">▼</span>
                    </button>
                    {studioDropOpen && (
                      <div ref={studioDropRef} className="fixed z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-xl flex flex-col" style={{ top: studioDropPos.top, left: studioDropPos.left, width: studioDropPos.width, maxHeight: '600px' }}>
                        <div className="p-1.5 border-b border-gray-700">
                          <input type="text" value={studioFilter} onChange={e => setStudioFilter(e.target.value)} placeholder="레이블 검색" autoFocus
                            onKeyDown={e => {
                              const total = 2 + filteredStudios.length
                              if (e.key === 'ArrowDown') { e.preventDefault(); setStudioHoverIdx(prev => prev >= total - 1 ? 0 : prev + 1) }
                              else if (e.key === 'ArrowUp') { e.preventDefault(); setStudioHoverIdx(prev => prev <= 0 ? total - 1 : prev - 1) }
                              else if (e.key === 'Enter' && studioHoverIdx >= 0) {
                                e.preventDefault()
                                if (studioHoverIdx === 0) { onChange({ ...wParams!, studioId: '' } as never); closeStudioDrop() }
                                else if (studioHoverIdx === 1) { onChange({ ...wParams!, studioId: -1 } as never); closeStudioDrop() }
                                else { const s = filteredStudios[studioHoverIdx - 2]; if (s) { onChange({ ...wParams!, studioId: s.id } as never); closeStudioDrop() } }
                              }
                            }}
                            className="bg-gray-700 text-white text-xs px-2 py-1 rounded w-full" />
                        </div>
                        <div className="overflow-y-auto">
                          <button type="button" onClick={() => { onChange({ ...wParams, studioId: '' } as never); closeStudioDrop() }} {...(studioHoverIdx === 0 ? { 'data-studio-hover': '' } : {})} className={`w-full text-left px-2 py-1.5 text-sm hover:bg-gray-700 ${studioHoverIdx === 0 ? 'bg-gray-700' : ''} ${studioId === '' ? 'text-white font-bold' : 'text-gray-300'}`}>레이블 전체</button>
                          <button type="button" onClick={() => { onChange({ ...wParams, studioId: -1 } as never); closeStudioDrop() }} {...(studioHoverIdx === 1 ? { 'data-studio-hover': '' } : {})} className={`w-full text-left px-2 py-1.5 text-sm hover:bg-gray-700 ${studioHoverIdx === 1 ? 'bg-gray-700' : ''} ${studioId === -1 ? 'text-white font-bold' : 'text-gray-300'}`}>레이블 없음</button>
                          {filteredStudios.length === 0 && <p className="text-xs text-gray-500 text-center py-2">결과 없음</p>}
                          {filteredStudios.map((s, i) => {
                            const label = s.maker_name && s.maker_name !== s.name ? `${s.maker_name} ${s.name}` : s.name
                            const isHover = studioHoverIdx === i + 2
                            return <button key={s.id} type="button" onClick={() => { onChange({ ...wParams, studioId: s.id } as never); closeStudioDrop() }} {...(studioId === s.id ? { 'data-studio-selected': '' } : {})} {...(isHover ? { 'data-studio-hover': '' } : {})} className={`w-full text-left px-2 py-1.5 text-sm hover:bg-gray-700 truncate ${isHover ? 'bg-gray-700' : ''} ${studioId === s.id ? 'text-white font-bold' : 'text-gray-300'}`}>{label}</button>
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                </div>

                {/* 발매일 */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-400 w-12 shrink-0">발매일</span>
                  <DatePickerInput value={wParams.releaseDateFrom} onChange={v => {
                    if (wParams.releaseDateTo && v && v > wParams.releaseDateTo) { alert('시작 날짜는 끝 날짜보다 이후일 수 없습니다'); onChange({ ...wParams, releaseDateFrom: wParams.releaseDateTo, releaseDateNull: false } as never); return }
                    onChange({ ...wParams, releaseDateFrom: v, releaseDateNull: false } as never)
                  }} />
                  <span className="text-gray-400 text-xs">~</span>
                  <DatePickerInput value={wParams.releaseDateTo} onChange={v => {
                    if (wParams.releaseDateFrom && v && v < wParams.releaseDateFrom) { alert('끝 날짜는 시작 날짜보다 이전일 수 없습니다'); onChange({ ...wParams, releaseDateTo: wParams.releaseDateFrom, releaseDateNull: false } as never); return }
                    onChange({ ...wParams, releaseDateTo: v, releaseDateNull: false } as never)
                  }} />
                  <button type="button" onClick={() => onChange({ ...wParams, releaseDateNull: !wParams.releaseDateNull, releaseDateFrom: '', releaseDateTo: '' } as never)} className={`text-xs px-2 py-1 rounded shrink-0 ${wParams.releaseDateNull ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>발매일없음</button>
                  {([{ label: '1달', months: 1 }, { label: '2달', months: 2 }, { label: '3달', months: 3 }, { label: '반년', months: 6 }, { label: '1년', months: 12 }] as const).map(({ label, months }) => (
                    <button key={label} type="button" onClick={() => onChange({ ...wParams, releaseDateFrom: subtractDate(months), releaseDateNull: false } as never)} className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 shrink-0">{label}</button>
                  ))}
                </div>

                {/* 별점 */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-12 shrink-0">별점</span>
                  <StarSelect value={wParams.ratingFrom} onChange={v => onChange({ ...wParams, ratingFrom: v } as never)} />
                  <span className="text-gray-400 text-xs">~</span>
                  <StarSelect value={wParams.ratingTo} onChange={v => onChange({ ...wParams, ratingTo: v } as never)} />
                  <button type="button" onClick={() => onChange({ ...wParams, ratingFrom: 0, ratingTo: 0 } as never)} className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 shrink-0">별점 0점</button>
                </div>

                {/* 배우수 */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-12 shrink-0">배우수</span>
                  <NumInput value={wParams.actorCountFrom} onChange={v => onChange({ ...wParams, actorCountFrom: v, actorCountNull: false } as never)} />
                  <span className="text-gray-400 text-xs">~</span>
                  <NumInput value={wParams.actorCountTo} onChange={v => onChange({ ...wParams, actorCountTo: v, actorCountNull: false } as never)} />
                  <button type="button" onClick={() => onChange({ ...wParams, actorCountNull: !wParams.actorCountNull, actorCountFrom: '', actorCountTo: '' } as never)} className={`text-xs px-2 py-1 rounded shrink-0 ${wParams.actorCountNull ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>배우없음</button>
                </div>

                {/* 타이틀 */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-12 shrink-0">타이틀</span>
                  <input
                    type="text"
                    value={wParams.titleSearch}
                    disabled={wParams.titleNull}
                    onChange={e => onChange({ ...wParams, titleSearch: e.target.value } as never)}
                    placeholder="타이틀 검색"
                    className="bg-gray-700 text-white text-xs px-2 py-1 rounded flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    onClick={() => onChange({ ...wParams, titleNull: !wParams.titleNull, titleSearch: '' } as never)}
                    className={`text-xs px-2 py-1 rounded shrink-0 ${wParams.titleNull ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                  >
                    타이틀없음
                  </button>
                </div>

                {/* 코멘트 */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-12 shrink-0">코멘트</span>
                  <input
                    type="text"
                    value={wParams.commentSearch}
                    disabled={wParams.commentNull}
                    onChange={e => onChange({ ...wParams, commentSearch: e.target.value } as never)}
                    placeholder="코멘트 검색"
                    className="bg-gray-700 text-white text-xs px-2 py-1 rounded flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    onClick={() => onChange({ ...wParams, commentNull: !wParams.commentNull, commentSearch: '' } as never)}
                    className={`text-xs px-2 py-1 rounded shrink-0 ${wParams.commentNull ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                  >
                    코멘트없음
                  </button>
                </div>
              </>
            )}

            {/* ── actors ────────────────────────────────────────── */}
            {type === 'actors' && aParams && (
              <>
                {/* 나이 */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-14 shrink-0">나이</span>
                  <NumInput value={aParams.ageFrom} onChange={v => onChange({ ...aParams, ageFrom: v, ageNull: false } as never)} />
                  <span className="text-gray-400 text-xs">~</span>
                  <NumInput value={aParams.ageTo} onChange={v => onChange({ ...aParams, ageTo: v, ageNull: false } as never)} />
                  <button type="button" onClick={() => onChange({ ...aParams, ageNull: !aParams.ageNull, ageFrom: '', ageTo: '' } as never)} className={`text-xs px-2 py-1 rounded shrink-0 ${aParams.ageNull ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>나이없음</button>
                </div>

                {/* 데뷔일 */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-400 w-14 shrink-0">데뷔일</span>
                  <DatePickerInput value={aParams.debutDateFrom} onChange={v => {
                    if (aParams.debutDateTo && v && v > aParams.debutDateTo) { alert('시작 날짜는 끝 날짜보다 이후일 수 없습니다'); onChange({ ...aParams, debutDateFrom: aParams.debutDateTo, debutDateNull: false } as never); return }
                    onChange({ ...aParams, debutDateFrom: v, debutDateNull: false } as never)
                  }} />
                  <span className="text-gray-400 text-xs">~</span>
                  <DatePickerInput value={aParams.debutDateTo} onChange={v => {
                    if (aParams.debutDateFrom && v && v < aParams.debutDateFrom) { alert('끝 날짜는 시작 날짜보다 이전일 수 없습니다'); onChange({ ...aParams, debutDateTo: aParams.debutDateFrom, debutDateNull: false } as never); return }
                    onChange({ ...aParams, debutDateTo: v, debutDateNull: false } as never)
                  }} />
                  <button type="button" onClick={() => onChange({ ...aParams, debutDateNull: !aParams.debutDateNull, debutDateFrom: '', debutDateTo: '' } as never)} className={`text-xs px-2 py-1 rounded shrink-0 ${aParams.debutDateNull ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>데뷔일없음</button>
                  {([{ label: '1달', months: 1 }, { label: '반년', months: 6 }, { label: '1년', months: 12 }, { label: '2년', months: 24 }, { label: '3년', months: 36 }] as const).map(({ label, months }) => (
                    <button key={label} type="button" onClick={() => onChange({ ...aParams, debutDateFrom: subtractDate(months), debutDateNull: false } as never)} className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 shrink-0">{label}</button>
                  ))}
                </div>

                {/* 작품수 */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-14 shrink-0">작품수</span>
                  <NumInput value={aParams.workCountFrom} onChange={v => onChange({ ...aParams, workCountFrom: v, workCountNull: false } as never)} />
                  <span className="text-gray-400 text-xs">~</span>
                  <NumInput value={aParams.workCountTo} onChange={v => onChange({ ...aParams, workCountTo: v, workCountNull: false } as never)} />
                  <button type="button" onClick={() => onChange({ ...aParams, workCountNull: !aParams.workCountNull, workCountFrom: '', workCountTo: '' } as never)} className={`text-xs px-2 py-1 rounded shrink-0 ${aParams.workCountNull ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>작품수없음</button>
                </div>

                {/* 평점 */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-14 shrink-0">평점</span>
                    <NumInput value={aParams.avgRatingFrom} onChange={v => onChange({ ...aParams, avgRatingFrom: v } as never)} />
                    <span className="text-gray-400 text-xs">~</span>
                    <NumInput value={aParams.avgRatingTo} onChange={v => onChange({ ...aParams, avgRatingTo: v } as never)} />
                    <button type="button" onClick={() => onChange({ ...aParams, avgRatingFrom: 0, avgRatingTo: 0 } as never)} className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 shrink-0">평점 0점</button>
                  </div>
                  <div className="grid grid-cols-[repeat(5,auto)] gap-x-6 gap-y-1.5 w-fit">
                    {SCORE_FIELDS_ADV.map(({ fromKey, toKey, label }) => (
                      <div key={label}>
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <p className="text-xs text-gray-500">{label}</p>
                          <button type="button" onClick={() => onChange({ ...aParams, [fromKey]: 0, [toKey]: 0 } as never)} className="text-xs px-1 py-0 rounded bg-gray-700 text-gray-400 hover:bg-gray-600 leading-4">0점</button>
                        </div>
                        <div className="flex items-center gap-0.5 justify-center">
                          <NumInput value={aParams[fromKey as keyof ActorSearchParams] as number | ''} onChange={v => onChange({ ...aParams, [fromKey]: v } as never)} />
                          <span className="text-gray-500 text-xs">~</span>
                          <NumInput value={aParams[toKey as keyof ActorSearchParams] as number | ''} onChange={v => onChange({ ...aParams, [toKey]: v } as never)} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 피지컬 */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-14 shrink-0">피지컬</span>
                    <NumInput value={aParams.ratioScoreFrom} onChange={v => onChange({ ...aParams, ratioScoreFrom: v } as never)} />
                    <span className="text-gray-400 text-xs">~</span>
                    <NumInput value={aParams.ratioScoreTo} onChange={v => onChange({ ...aParams, ratioScoreTo: v } as never)} />
                    <button type="button" onClick={() => onChange({ ...aParams, ratioScoreFrom: 0, ratioScoreTo: 0 } as never)} className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 shrink-0">피지컬 0점</button>
                  </div>
                  <div className="grid grid-cols-[repeat(5,auto)] gap-x-6 gap-y-1.5 w-fit">
                    {[
                      { label: '키', from: aParams.heightFrom, to: aParams.heightTo, fk: 'heightFrom', tk: 'heightTo', cup: false },
                      { label: '바스트', from: aParams.bustFrom, to: aParams.bustTo, fk: 'bustFrom', tk: 'bustTo', cup: false },
                      { label: '웨이스트', from: aParams.waistFrom, to: aParams.waistTo, fk: 'waistFrom', tk: 'waistTo', cup: false },
                      { label: '힙', from: aParams.hipFrom, to: aParams.hipTo, fk: 'hipFrom', tk: 'hipTo', cup: false },
                      { label: '컵', from: aParams.cupFrom, to: aParams.cupTo, fk: 'cupFrom', tk: 'cupTo', cup: true },
                    ].map(({ label, from, to, fk, tk, cup }) => {
                      const nullKey = `${fk.replace('From', '')}Null` as keyof ActorSearchParams
                      const isNull = aParams[nullKey] as boolean
                      return (
                        <div key={label}>
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <p className="text-xs text-gray-500">{label}</p>
                            <button
                              type="button"
                              onClick={() => onChange({ ...aParams, [nullKey]: !isNull, [fk]: '', [tk]: '' } as never)}
                              className={`text-xs px-1 py-0 rounded leading-4 ${isNull ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                            >없음</button>
                          </div>
                          <div className="flex items-center gap-0.5 justify-center">
                            {cup
                              ? <CupInput value={from as string} onChange={v => onChange({ ...aParams, [fk]: v, [nullKey]: false } as never)} />
                              : <NumInput value={from as number | ''} onChange={v => onChange({ ...aParams, [fk]: v, [nullKey]: false } as never)} />
                            }
                            <span className="text-gray-500 text-xs">~</span>
                            {cup
                              ? <CupInput value={to as string} onChange={v => onChange({ ...aParams, [tk]: v, [nullKey]: false } as never)} />
                              : <NumInput value={to as number | ''} onChange={v => onChange({ ...aParams, [tk]: v, [nullKey]: false } as never)} />
                            }
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            )}

            {/* ── status bar (bottom) ───────────────────────────── */}
            {(conditions.length > 0 || params.tagIds.length > 0) && (
              <div className="pt-2 border-t border-gray-700/50 space-y-1">
                {conditions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    {conditions.map((c, i) => (
                      <span key={i} className="text-xs pl-2 pr-1 py-0.5 rounded bg-gray-600 text-gray-200 flex items-center gap-1">
                        {c.label}
                        <button type="button" onClick={c.onClear} className="text-gray-400 hover:text-white leading-none">×</button>
                      </span>
                    ))}
                  </div>
                )}
                {params.tagIds.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    {!isNoTag && params.tagIds.length > 1 && (
                      <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${params.tagMode === 'and' ? 'bg-blue-700 text-blue-200' : 'bg-orange-700 text-orange-200'}`}>
                        {params.tagMode.toUpperCase()}
                      </span>
                    )}
                    {isNoTag
                      ? (
                        <span className="text-xs pl-2 pr-1 py-0.5 rounded bg-gray-600 text-gray-300 flex items-center gap-1">
                          태그없음
                          <button type="button" onClick={toggleNoTag} className="text-gray-400 hover:text-white leading-none">×</button>
                        </span>
                      )
                      : selectedTagObjs.map(t => (
                        <span key={t.id} className="text-xs pl-2 pr-1 py-0.5 rounded bg-blue-600 text-white flex items-center gap-1">
                          {t.name}
                          <button type="button" onClick={() => toggleTag(t.id)} className="text-blue-200 hover:text-white leading-none">×</button>
                        </span>
                      ))
                    }
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
