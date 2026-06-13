import { useState, useEffect } from 'react'
import { actorTagsApi, workTagsApi, studiosApi, actorsApi } from '../api'
import type { Tag, Studio, Actor } from '../types'

export type ActorFilter = {
  actorIds?: number[]
  actorMode?: 'include' | 'exclude'
  tagIds?: number[]
  tagMode?: 'and' | 'or'
  tagInclude?: 'include' | 'exclude'
  ratingFrom?: number
  ratingTo?: number
  heightFrom?: number; heightTo?: number
  bustFrom?: number; bustTo?: number
  waistFrom?: number; waistTo?: number
  hipFrom?: number; hipTo?: number
  cupFrom?: string; cupTo?: string
  scoreExcluded?: boolean
}

export type WorkFilter = {
  actorIds?: number[]
  actorMode?: 'include' | 'exclude'
  tagIds?: number[]
  tagMode?: 'and' | 'or'
  tagInclude?: 'include' | 'exclude'
  ratingFrom?: number
  ratingTo?: number
  studioIds?: number[]
}

export type WcFilter = ActorFilter | WorkFilter

const CUP_OPTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M']

export function countActiveFilters(filter: WcFilter | null): number {
  if (!filter) return 0
  let count = 0
  const af = filter as ActorFilter
  const wf = filter as WorkFilter
  if ((filter.actorIds?.length ?? 0) > 0) count++
  if ((filter.tagIds?.length ?? 0) > 0) count++
  if (filter.ratingFrom !== undefined || filter.ratingTo !== undefined) count++
  if (af.heightFrom !== undefined || af.heightTo !== undefined) count++
  if (af.bustFrom !== undefined || af.bustTo !== undefined) count++
  if (af.waistFrom !== undefined || af.waistTo !== undefined) count++
  if (af.hipFrom !== undefined || af.hipTo !== undefined) count++
  if (af.cupFrom || af.cupTo) count++
  if (af.scoreExcluded) count++
  if ((wf.studioIds?.length ?? 0) > 0) count++
  return count
}

interface Props {
  type: 'actor' | 'work'
  filter: WcFilter | null
  onSave: (filter: WcFilter | null) => void
  onClose: () => void
}

export default function WorldcupFilterModal({ type, filter, onSave, onClose }: Props) {
  const [tags, setTags] = useState<Tag[]>([])
  const [studios, setStudios] = useState<Studio[]>([])
  const [allActors, setAllActors] = useState<Actor[]>([])
  const [actorSearch, setActorSearch] = useState('')
  const [actorListOpen, setActorListOpen] = useState(false)
  const [tagListOpen, setTagListOpen] = useState(false)
  const [tagSearch, setTagSearch] = useState('')
  const [studioListOpen, setStudioListOpen] = useState(false)
  const [studioSearch, setStudioSearch] = useState('')

  const af = filter as ActorFilter | null
  const wf = filter as WorkFilter | null

  const [actorIds, setActorIds] = useState<number[]>(af?.actorIds ?? wf?.actorIds ?? [])
  const [actorMode, setActorMode] = useState<'include' | 'exclude'>(af?.actorMode ?? wf?.actorMode ?? 'include')
  const [tagIds, setTagIds] = useState<number[]>(filter?.tagIds ?? [])
  const [tagMode, setTagMode] = useState<'and' | 'or'>(filter?.tagMode ?? 'or')
  const [tagInclude, setTagInclude] = useState<'include' | 'exclude'>(filter?.tagInclude ?? 'include')
  const [ratingFrom, setRatingFrom] = useState(filter?.ratingFrom !== undefined ? String(filter.ratingFrom) : '')
  const [ratingTo, setRatingTo] = useState(filter?.ratingTo !== undefined ? String(filter.ratingTo) : '')

  // Actor-only
  const [heightFrom, setHeightFrom] = useState(af?.heightFrom !== undefined ? String(af.heightFrom) : '')
  const [heightTo, setHeightTo] = useState(af?.heightTo !== undefined ? String(af.heightTo) : '')
  const [bustFrom, setBustFrom] = useState(af?.bustFrom !== undefined ? String(af.bustFrom) : '')
  const [bustTo, setBustTo] = useState(af?.bustTo !== undefined ? String(af.bustTo) : '')
  const [waistFrom, setWaistFrom] = useState(af?.waistFrom !== undefined ? String(af.waistFrom) : '')
  const [waistTo, setWaistTo] = useState(af?.waistTo !== undefined ? String(af.waistTo) : '')
  const [hipFrom, setHipFrom] = useState(af?.hipFrom !== undefined ? String(af.hipFrom) : '')
  const [hipTo, setHipTo] = useState(af?.hipTo !== undefined ? String(af.hipTo) : '')
  const [cupFrom, setCupFrom] = useState(af?.cupFrom ?? '')
  const [cupTo, setCupTo] = useState(af?.cupTo ?? '')
  const [scoreExcluded, setScoreExcluded] = useState<boolean>(af?.scoreExcluded ?? false)

  // Work-only
  const [studioIds, setStudioIds] = useState<number[]>(wf?.studioIds ?? [])

  useEffect(() => {
    actorsApi.list().then(d => setAllActors(d as Actor[]))
    if (type === 'actor') {
      actorTagsApi.list().then(d => setTags(d as Tag[]))
    } else {
      workTagsApi.list().then(d => setTags(d as Tag[]))
      studiosApi.list().then(d => setStudios(d as Studio[]))
    }
  }, [type])

  const toggleActor = (id: number) => {
    setActorIds(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id])
  }

  const toggleTag = (id: number) => {
    setTagIds(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])
  }

  const toggleStudio = (id: number) => {
    setStudioIds(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id])
  }

  const toggleMakerStudios = (makerId: number) => {
    const makerStudioIds = studios.filter(s => s.maker_id === makerId).map(s => s.id)
    const allSelected = makerStudioIds.every(id => studioIds.includes(id))
    if (allSelected) {
      setStudioIds(prev => prev.filter(id => !makerStudioIds.includes(id)))
    } else {
      setStudioIds(prev => [...new Set([...prev, ...makerStudioIds])])
    }
  }

  const handleSave = () => {
    const base: Record<string, unknown> = {}
    if (tagIds.length > 0) {
      base.tagIds = tagIds
      base.tagMode = tagMode
      base.tagInclude = tagInclude
    }
    if (ratingFrom !== '') base.ratingFrom = parseFloat(ratingFrom)
    if (ratingTo !== '') base.ratingTo = parseFloat(ratingTo)
    if (actorIds.length > 0) {
      base.actorIds = actorIds
      base.actorMode = actorMode
    }

    if (type === 'actor') {
      if (heightFrom !== '') base.heightFrom = parseInt(heightFrom)
      if (heightTo !== '') base.heightTo = parseInt(heightTo)
      if (bustFrom !== '') base.bustFrom = parseInt(bustFrom)
      if (bustTo !== '') base.bustTo = parseInt(bustTo)
      if (waistFrom !== '') base.waistFrom = parseInt(waistFrom)
      if (waistTo !== '') base.waistTo = parseInt(waistTo)
      if (hipFrom !== '') base.hipFrom = parseInt(hipFrom)
      if (hipTo !== '') base.hipTo = parseInt(hipTo)
      if (cupFrom) base.cupFrom = cupFrom
      if (cupTo) base.cupTo = cupTo
      if (scoreExcluded) base.scoreExcluded = true
    } else {
      if (studioIds.length > 0) base.studioIds = studioIds
    }

    onSave(Object.keys(base).length > 0 ? base as WcFilter : null)
  }

  const inputCls = 'bg-gray-700 text-white text-sm px-2 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500'
  const numInputCls = `${inputCls} w-20`

  const filteredActors = allActors.filter(a =>
    !actorSearch || a.name.toLowerCase().includes(actorSearch.toLowerCase())
  )
  const selectedActors = allActors.filter(a => actorIds.includes(a.id))

  type TagGroup = { catId: number | null; catName: string | null; sortOrder: number; tags: Tag[] }
  const buildTagGroups = (list: Tag[]): TagGroup[] => {
    const catMap = new Map<number | null, TagGroup>()
    const groups: TagGroup[] = []
    for (const tag of list) {
      const key = tag.category_id ?? null
      if (!catMap.has(key)) {
        const g: TagGroup = { catId: key, catName: tag.category_name ?? null, sortOrder: tag.category_sort_order ?? 999999, tags: [] }
        catMap.set(key, g)
        groups.push(g)
      }
      catMap.get(key)!.tags.push(tag)
    }
    groups.sort((a, b) => {
      if (a.catId === null) return 1
      if (b.catId === null) return -1
      return a.sortOrder - b.sortOrder
    })
    return groups
  }

  const IncludeExcludeToggle = ({
    value,
    onChange,
  }: {
    value: 'include' | 'exclude'
    onChange: (v: 'include' | 'exclude') => void
  }) => (
    <div className="flex ml-auto">
      {(['include', 'exclude'] as const).map((m, i) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`text-xs px-2 py-1 ${i === 0 ? 'rounded-l border-r border-gray-600' : 'rounded-r'} ${value === m ? (m === 'exclude' ? 'bg-red-700 text-white' : 'bg-blue-600 text-white') : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
        >
          {m === 'include' ? '포함' : '제외'}
        </button>
      ))}
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-lg p-6 w-[620px] max-h-[85vh] overflow-y-auto border border-gray-700 flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-white font-bold">대회 필터 설정</p>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">✕</button>
        </div>

        {/* 태그 */}
        {tags.length > 0 && (() => {
          const selectedTagObjs = tags.filter(t => tagIds.includes(t.id))
          const filteredTagList = tags.filter(t => !tagSearch || t.name.toLowerCase().includes(tagSearch.toLowerCase()))
          const allGroups = buildTagGroups(filteredTagList)
          return (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <button onClick={() => setTagListOpen(o => !o)}
                  className="flex items-center gap-1.5 text-gray-400 hover:text-gray-200 text-xs">
                  <span className="font-black text-base leading-none">{tagListOpen ? '−' : '+'}</span>
                  태그
                  {tagIds.length > 0 && <span className="ml-1 text-blue-400">{tagIds.length}개 선택됨</span>}
                </button>
                {tagIds.length > 0 && <IncludeExcludeToggle value={tagInclude} onChange={setTagInclude} />}
                {tagIds.length > 1 && tagInclude === 'include' && (
                  <div className="flex">
                    {(['or', 'and'] as const).map((m, i) => (
                      <button key={m} onClick={() => setTagMode(m)}
                        className={`text-xs px-2 py-1 ${i === 0 ? 'rounded-l border-r border-gray-600' : 'rounded-r'} ${tagMode === m ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                      >{m === 'or' ? 'OR' : 'AND'}</button>
                    ))}
                  </div>
                )}
              </div>

              {selectedTagObjs.length > 0 && (
                <div className="space-y-1 p-2 bg-gray-900/50 rounded border border-gray-600">
                  {buildTagGroups(selectedTagObjs).map(g => (
                    <div key={g.catId ?? 'none'}>
                      <p className="text-xs text-gray-600 mb-0.5">{g.catName ?? '미분류'}</p>
                      <div className="flex flex-wrap gap-1">
                        {g.tags.map(t => (
                          <button key={t.id} onClick={() => toggleTag(t.id)}
                            className={`text-xs px-2 py-0.5 rounded transition ${tagInclude === 'exclude' ? 'bg-red-700 text-white hover:bg-red-600' : 'bg-blue-600 text-white hover:bg-blue-500'}`}>
                            {t.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {tagListOpen && (
                <div className="border border-gray-700 rounded-lg p-2 space-y-2">
                  <input type="text" value={tagSearch} onChange={e => setTagSearch(e.target.value)}
                    placeholder="태그 검색" className="bg-gray-700 text-white text-xs px-2 py-1 rounded w-full focus:outline-none" />
                  <div className="border-t border-gray-700" />
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {allGroups.map(g => (
                      <div key={g.catId ?? 'none'}>
                        <p className="text-xs text-gray-500 mb-1">{g.catName ?? '미분류'}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {g.tags.map(tag => (
                            <button key={tag.id} onClick={() => toggleTag(tag.id)}
                              className={`text-xs px-2 py-0.5 rounded transition ${tagIds.includes(tag.id) ? (tagInclude === 'exclude' ? 'bg-red-700 text-white' : 'bg-blue-600 text-white') : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                              {tag.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {allGroups.length === 0 && <span className="text-xs text-gray-500">검색 결과 없음</span>}
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {/* 배우 선택 */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActorListOpen(o => !o)}
              className="flex items-center gap-1.5 text-gray-400 hover:text-gray-200 text-xs"
            >
              <span className="font-black text-base leading-none">{actorListOpen ? '−' : '+'}</span>
              배우 선택
              {actorIds.length > 0 && <span className="ml-1 text-purple-400">{actorIds.length}명 선택됨</span>}
            </button>
            {actorIds.length > 0 && <IncludeExcludeToggle value={actorMode} onChange={setActorMode} />}
          </div>

          {selectedActors.length > 0 && (
            <div className="flex flex-wrap gap-1.5 p-2 bg-gray-900/50 rounded border border-gray-600">
              {selectedActors.map(a => (
                <button key={a.id} onClick={() => toggleActor(a.id)}
                  className={`text-xs px-2 py-1 rounded-full transition ${actorMode === 'exclude' ? 'bg-red-700 text-white hover:bg-red-600' : 'bg-purple-600 text-white hover:bg-purple-500'}`}
                >{a.name}</button>
              ))}
            </div>
          )}

          {actorListOpen && (
            <>
              <input type="text" value={actorSearch} onChange={e => setActorSearch(e.target.value)}
                placeholder="배우 이름 검색" className={`${inputCls} w-full`} />
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-1 border border-gray-700 rounded">
                {filteredActors.length === 0
                  ? <span className="text-gray-500 text-xs p-1">검색 결과 없음</span>
                  : filteredActors.map(a => (
                    <button key={a.id} onClick={() => toggleActor(a.id)}
                      className={`text-xs px-2 py-1 rounded-full transition ${actorIds.includes(a.id) ? (actorMode === 'exclude' ? 'bg-red-700 text-white' : 'bg-purple-600 text-white') : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                    >{a.name}</button>
                  ))
                }
              </div>
            </>
          )}
        </div>

        {/* 배우 전용 필터 */}
        {type === 'actor' && (
          <>
            {/* 평점 */}
            <div className="flex flex-col gap-1">
              <label className="text-gray-400 text-xs">평점</label>
              <div className="flex items-center gap-2">
                <input type="number" value={ratingFrom} onChange={e => setRatingFrom(e.target.value)} placeholder="최소" min="0" max="10" step="0.1" className={numInputCls} />
                <span className="text-gray-500 text-sm">~</span>
                <input type="number" value={ratingTo} onChange={e => setRatingTo(e.target.value)} placeholder="최대" min="0" max="10" step="0.1" className={numInputCls} />
              </div>
            </div>

            {/* 키 */}
            <div className="flex flex-col gap-1">
              <label className="text-gray-400 text-xs">키 (cm)</label>
              <div className="flex items-center gap-2">
                <input type="number" value={heightFrom} onChange={e => setHeightFrom(e.target.value)} placeholder="최소" className={numInputCls} />
                <span className="text-gray-500 text-sm">~</span>
                <input type="number" value={heightTo} onChange={e => setHeightTo(e.target.value)} placeholder="최대" className={numInputCls} />
              </div>
            </div>

            {/* 바스트/웨이스트/힙 */}
            <div className="grid grid-cols-3 gap-3">
              {([
                { label: '바스트 (cm)', from: bustFrom, to: bustTo, setFrom: setBustFrom, setTo: setBustTo },
                { label: '웨이스트 (cm)', from: waistFrom, to: waistTo, setFrom: setWaistFrom, setTo: setWaistTo },
                { label: '힙 (cm)', from: hipFrom, to: hipTo, setFrom: setHipFrom, setTo: setHipTo },
              ] as const).map(({ label, from, to, setFrom, setTo }) => (
                <div key={label} className="flex flex-col gap-1">
                  <label className="text-gray-400 text-xs">{label}</label>
                  <div className="flex items-center gap-1">
                    <input type="number" value={from} onChange={e => setFrom(e.target.value)} placeholder="최소"
                      className="bg-gray-700 text-white text-xs px-2 py-1.5 rounded focus:outline-none w-full" />
                    <span className="text-gray-500 text-xs shrink-0">~</span>
                    <input type="number" value={to} onChange={e => setTo(e.target.value)} placeholder="최대"
                      className="bg-gray-700 text-white text-xs px-2 py-1.5 rounded focus:outline-none w-full" />
                  </div>
                </div>
              ))}
            </div>

            {/* 컵 */}
            <div className="flex flex-col gap-1">
              <label className="text-gray-400 text-xs">컵</label>
              <div className="flex items-center gap-2">
                <select value={cupFrom} onChange={e => setCupFrom(e.target.value)}
                  className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded focus:outline-none">
                  <option value="">최소 미설정</option>
                  {CUP_OPTIONS.map(c => <option key={c} value={c}>{c}컵</option>)}
                </select>
                <span className="text-gray-500 text-sm">~</span>
                <select value={cupTo} onChange={e => setCupTo(e.target.value)}
                  className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded focus:outline-none">
                  <option value="">최대 미설정</option>
                  {CUP_OPTIONS.map(c => <option key={c} value={c}>{c}컵</option>)}
                </select>
              </div>
            </div>

            {/* 점수제외 배우 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-gray-400 text-xs">점수제외 배우</label>
              <div className="flex">
                {([
                  { value: false, label: '포함' },
                  { value: true, label: '제외' },
                ] as const).map((opt, i) => (
                  <button
                    key={String(opt.value)}
                    onClick={() => setScoreExcluded(opt.value)}
                    className={`flex-1 text-sm py-1.5 border-gray-600 ${i === 0 ? 'rounded-l border-r' : 'rounded-r'} ${scoreExcluded === opt.value ? (opt.value ? 'bg-red-700 text-white' : 'bg-blue-600 text-white') : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                  >{opt.label}</button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* 작품 전용 필터 */}
        {type === 'work' && (
          <>
            {/* 별점 */}
            <div className="flex flex-col gap-1">
              <label className="text-gray-400 text-xs">별점</label>
              <div className="flex items-center gap-2">
                <input type="number" value={ratingFrom} onChange={e => setRatingFrom(e.target.value)} placeholder="최소" min="0" max="5" step="0.5" className={numInputCls} />
                <span className="text-gray-500 text-sm">~</span>
                <input type="number" value={ratingTo} onChange={e => setRatingTo(e.target.value)} placeholder="최대" min="0" max="5" step="0.5" className={numInputCls} />
              </div>
            </div>

            {/* 레이블 */}
            {(() => {
              type MakerGroup = { makerId: number | null; makerName: string | null; makerColor: string | null; studios: Studio[] }
              const buildMakerGroups = (): MakerGroup[] => {
                const map = new Map<number | null, MakerGroup>()
                const groups: MakerGroup[] = []
                const search = studioSearch.toLowerCase()
                for (const s of studios) {
                  if (search && !s.name.toLowerCase().includes(search)) continue
                  const key = s.maker_id ?? null
                  if (!map.has(key)) {
                    const g: MakerGroup = { makerId: key, makerName: s.maker_name ?? null, makerColor: s.maker_color ?? null, studios: [] }
                    map.set(key, g)
                    groups.push(g)
                  }
                  map.get(key)!.studios.push(s)
                }
                groups.sort((a, b) => { if (a.makerId === null) return 1; if (b.makerId === null) return -1; return 0 })
                return groups
              }
              const selectedStudioObjs = studios.filter(s => studioIds.includes(s.id))
              const allGroups = buildMakerGroups()
              return (
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => setStudioListOpen(o => !o)}
                    className="flex items-center gap-1.5 text-gray-400 hover:text-gray-200 text-xs self-start"
                  >
                    <span className="font-black text-base leading-none">{studioListOpen ? '−' : '+'}</span>
                    레이블
                    {studioIds.length > 0 && <span className="ml-1 text-green-400">{studioIds.length}개 선택됨</span>}
                  </button>
                  {selectedStudioObjs.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 p-2 bg-gray-900/50 rounded border border-gray-600">
                      {selectedStudioObjs.map(s => (
                        <button key={s.id} onClick={() => toggleStudio(s.id)}
                          style={s.color ? { backgroundColor: s.color } : undefined}
                          className={`text-xs px-2 py-1 rounded transition hover:opacity-75 ${s.color ? 'text-white' : 'bg-gray-600 text-gray-200'}`}
                        >{s.name}</button>
                      ))}
                    </div>
                  )}
                  {studioListOpen && (
                    <div className="border border-gray-700 rounded-lg p-2 space-y-2">
                      <input type="text" value={studioSearch} onChange={e => setStudioSearch(e.target.value)}
                        placeholder="레이블 검색" className="bg-gray-700 text-white text-xs px-2 py-1 rounded w-full focus:outline-none" />
                      <div className="border-t border-gray-700" />
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {allGroups.map(g => (
                          <div key={g.makerId ?? 'none'}>
                            {g.makerId !== null ? (
                              <button onClick={() => toggleMakerStudios(g.makerId!)} className="text-xs mb-1 hover:opacity-75 transition">
                                <span
                                  style={g.makerColor ? { backgroundColor: g.makerColor } : undefined}
                                  className={`px-1.5 py-0.5 rounded font-medium ${g.makerColor ? 'text-white' : 'bg-gray-600 text-gray-300'}`}
                                >{g.makerName}</span>
                              </button>
                            ) : (
                              <p className="text-xs text-gray-500 mb-1">미분류</p>
                            )}
                            <div className="flex flex-wrap gap-1.5 ml-1">
                              {g.studios.map(s => (
                                <button key={s.id} onClick={() => toggleStudio(s.id)}
                                  style={studioIds.includes(s.id) && s.color ? { backgroundColor: s.color } : undefined}
                                  className={`text-xs px-2 py-0.5 rounded transition ${studioIds.includes(s.id) ? (s.color ? 'text-white' : 'bg-green-700 text-white') : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                                >{s.name}</button>
                              ))}
                            </div>
                          </div>
                        ))}
                        {allGroups.length === 0 && <span className="text-xs text-gray-500">검색 결과 없음</span>}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
          </>
        )}

        {/* 버튼 */}
        <div className="flex gap-2 pt-2 border-t border-gray-700">
          <button onClick={() => onSave(null)} className="text-sm px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded">
            필터 초기화
          </button>
          <div className="flex-1" />
          <button onClick={onClose} className="text-sm px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded">취소</button>
          <button onClick={handleSave} className="text-sm px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded">저장</button>
        </div>
      </div>
    </div>
  )
}
