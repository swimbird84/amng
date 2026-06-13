import { useState, useEffect } from 'react'
import { actorTagsApi, workTagsApi, studiosApi, actorsApi } from '../api'
import type { Tag, Studio, Actor } from '../types'

export type ActorFilter = {
  actorIds?: number[]
  tagIds?: number[]
  tagMode?: 'and' | 'or'
  ratingFrom?: number
  ratingTo?: number
  favoriteOnly?: boolean
  workCountFrom?: number
  workCountTo?: number
  heightFrom?: number; heightTo?: number
  bustFrom?: number; bustTo?: number
  waistFrom?: number; waistTo?: number
  hipFrom?: number; hipTo?: number
  cupFrom?: string; cupTo?: string
  poolMode?: 'normal' | 'champion' | 'loser'
}

export type WorkFilter = {
  actorIds?: number[]
  tagIds?: number[]
  tagMode?: 'and' | 'or'
  ratingFrom?: number
  ratingTo?: number
  favoriteOnly?: boolean
  releaseDateFrom?: string
  releaseDateTo?: string
  studioIds?: number[]
  actorCountFrom?: number
  actorCountTo?: number
  poolMode?: 'normal' | 'champion' | 'loser'
}

export type WcFilter = ActorFilter | WorkFilter

const CUP_OPTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M']

export function countActiveFilters(filter: WcFilter | null): number {
  if (!filter) return 0
  let count = 0
  const af = filter as ActorFilter
  const wf = filter as WorkFilter
  if ((af.actorIds?.length ?? 0) > 0) count++
  if ((wf.actorIds?.length ?? 0) > 0) count++
  if ((filter.tagIds?.length ?? 0) > 0) count++
  if (filter.ratingFrom !== undefined || filter.ratingTo !== undefined) count++
  if (filter.favoriteOnly) count++
  if (af.workCountFrom !== undefined || af.workCountTo !== undefined) count++
  if (af.heightFrom !== undefined || af.heightTo !== undefined) count++
  if (af.bustFrom !== undefined || af.bustTo !== undefined) count++
  if (af.waistFrom !== undefined || af.waistTo !== undefined) count++
  if (af.hipFrom !== undefined || af.hipTo !== undefined) count++
  if (af.cupFrom || af.cupTo) count++
  if ((wf.studioIds?.length ?? 0) > 0) count++
  if (wf.releaseDateFrom || wf.releaseDateTo) count++
  if (wf.actorCountFrom !== undefined || wf.actorCountTo !== undefined) count++
  if (filter.poolMode && filter.poolMode !== 'normal') count++
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

  const [poolMode, setPoolMode] = useState<'normal' | 'champion' | 'loser'>(filter?.poolMode ?? 'normal')
  const [actorIds, setActorIds] = useState<number[]>(af?.actorIds ?? wf?.actorIds ?? [])
  const [tagIds, setTagIds] = useState<number[]>(filter?.tagIds ?? [])
  const [tagMode, setTagMode] = useState<'and' | 'or'>(filter?.tagMode ?? 'or')
  const [ratingFrom, setRatingFrom] = useState(filter?.ratingFrom !== undefined ? String(filter.ratingFrom) : '')
  const [ratingTo, setRatingTo] = useState(filter?.ratingTo !== undefined ? String(filter.ratingTo) : '')
  const [favoriteOnly, setFavoriteOnly] = useState(filter?.favoriteOnly ?? false)

  // Actor-only
  const [workCountFrom, setWorkCountFrom] = useState(af?.workCountFrom !== undefined ? String(af.workCountFrom) : '')
  const [workCountTo, setWorkCountTo] = useState(af?.workCountTo !== undefined ? String(af.workCountTo) : '')
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

  // Work-only
  const [releaseDateFrom, setReleaseDateFrom] = useState(wf?.releaseDateFrom ?? '')
  const [releaseDateTo, setReleaseDateTo] = useState(wf?.releaseDateTo ?? '')
  const [studioIds, setStudioIds] = useState<number[]>(wf?.studioIds ?? [])
  const [actorCountFrom, setActorCountFrom] = useState(wf?.actorCountFrom !== undefined ? String(wf.actorCountFrom) : '')
  const [actorCountTo, setActorCountTo] = useState(wf?.actorCountTo !== undefined ? String(wf.actorCountTo) : '')

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
    if (tagIds.length > 0) { base.tagIds = tagIds; base.tagMode = tagMode }
    if (ratingFrom !== '') base.ratingFrom = parseFloat(ratingFrom)
    if (ratingTo !== '') base.ratingTo = parseFloat(ratingTo)
    if (favoriteOnly) base.favoriteOnly = true

    if (actorIds.length > 0) base.actorIds = actorIds
    if (poolMode !== 'normal') base.poolMode = poolMode

    if (type === 'actor') {
      if (workCountFrom !== '') base.workCountFrom = parseInt(workCountFrom)
      if (workCountTo !== '') base.workCountTo = parseInt(workCountTo)
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
    } else {
      if (releaseDateFrom) base.releaseDateFrom = releaseDateFrom
      if (releaseDateTo) base.releaseDateTo = releaseDateTo
      if (studioIds.length > 0) base.studioIds = studioIds
      if (actorCountFrom !== '') base.actorCountFrom = parseInt(actorCountFrom)
      if (actorCountTo !== '') base.actorCountTo = parseInt(actorCountTo)
    }

    onSave(Object.keys(base).length > 0 ? base as WcFilter : null)
  }

  const inputCls = 'bg-gray-700 text-white text-sm px-2 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500'
  const numInputCls = `${inputCls} w-20`

  const filteredActors = allActors.filter(a =>
    !actorSearch || a.name.toLowerCase().includes(actorSearch.toLowerCase())
  )
  const selectedActors = allActors.filter(a => actorIds.includes(a.id))

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-lg p-6 w-[620px] max-h-[85vh] overflow-y-auto border border-gray-700 flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-white font-bold">월드컵 필터 설정</p>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">✕</button>
        </div>

        {/* 풀 선택 방식 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-gray-400 text-xs">풀 선택 방식</label>
          <div className="flex">
            {([
              { value: 'normal', label: '일반' },
              { value: 'champion', label: '👑 왕중왕전' },
              { value: 'loser', label: '💀 꼴지대전' },
            ] as const).map((opt, i) => (
              <button
                key={opt.value}
                onClick={() => setPoolMode(opt.value)}
                className={`flex-1 text-sm py-1.5 border-gray-600 ${i === 0 ? 'rounded-l border-r' : i === 2 ? 'rounded-r' : 'border-r'} ${poolMode === opt.value ? (opt.value === 'champion' ? 'bg-yellow-600 text-white' : opt.value === 'loser' ? 'bg-red-700 text-white' : 'bg-blue-600 text-white') : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              >{opt.label}</button>
            ))}
          </div>
          {poolMode === 'champion' && <p className="text-xs text-yellow-400">우승률 상위 항목 중심으로 풀 구성</p>}
          {poolMode === 'loser' && <p className="text-xs text-red-400">우승률 하위 항목 중심으로 풀 구성</p>}
        </div>

        {/* 즐겨찾기 */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={favoriteOnly} onChange={e => setFavoriteOnly(e.target.checked)} className="accent-blue-500 w-4 h-4" />
          <span className="text-gray-300 text-sm">즐겨찾기만</span>
        </label>

        {/* 평점 */}
        <div className="flex flex-col gap-1">
          <label className="text-gray-400 text-xs">평점</label>
          <div className="flex items-center gap-2">
            <input type="number" value={ratingFrom} onChange={e => setRatingFrom(e.target.value)} placeholder="최소" min="0" max="10" step="0.1" className={numInputCls} />
            <span className="text-gray-500 text-sm">~</span>
            <input type="number" value={ratingTo} onChange={e => setRatingTo(e.target.value)} placeholder="최대" min="0" max="10" step="0.1" className={numInputCls} />
          </div>
        </div>

        {type === 'actor' && (
          <>
            {/* 작품수 */}
            <div className="flex flex-col gap-1">
              <label className="text-gray-400 text-xs">작품수</label>
              <div className="flex items-center gap-2">
                <input type="number" value={workCountFrom} onChange={e => setWorkCountFrom(e.target.value)} placeholder="최소" min="0" className={numInputCls} />
                <span className="text-gray-500 text-sm">~</span>
                <input type="number" value={workCountTo} onChange={e => setWorkCountTo(e.target.value)} placeholder="최대" min="0" className={numInputCls} />
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
          </>
        )}

        {type === 'work' && (
          <>
            {/* 발매일 */}
            <div className="flex flex-col gap-1">
              <label className="text-gray-400 text-xs">발매일</label>
              <div className="flex items-center gap-2">
                <input type="date" value={releaseDateFrom} onChange={e => setReleaseDateFrom(e.target.value)} className={inputCls} />
                <span className="text-gray-500 text-sm">~</span>
                <input type="date" value={releaseDateTo} onChange={e => setReleaseDateTo(e.target.value)} className={inputCls} />
              </div>
            </div>

            {/* 배우수 */}
            <div className="flex flex-col gap-1">
              <label className="text-gray-400 text-xs">배우수</label>
              <div className="flex items-center gap-2">
                <input type="number" value={actorCountFrom} onChange={e => setActorCountFrom(e.target.value)} placeholder="최소" min="0" className={numInputCls} />
                <span className="text-gray-500 text-sm">~</span>
                <input type="number" value={actorCountTo} onChange={e => setActorCountTo(e.target.value)} placeholder="최대" min="0" className={numInputCls} />
              </div>
            </div>
          </>
        )}

        {/* 배우 선택 (actor type) */}
        {type === 'actor' && (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setActorListOpen(o => !o)}
              className="flex items-center gap-1.5 text-gray-400 hover:text-gray-200 text-xs self-start"
            >
              <span className="font-black text-base leading-none">{actorListOpen ? '−' : '+'}</span>
              배우 선택 (선택한 배우만 포함)
              {actorIds.length > 0 && <span className="ml-1 text-purple-400">{actorIds.length}명 선택됨</span>}
            </button>
            {selectedActors.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2 bg-gray-900/50 rounded border border-gray-600">
                {selectedActors.map(a => (
                  <button key={a.id} onClick={() => toggleActor(a.id)}
                    className="text-xs px-2 py-1 rounded-full bg-purple-600 text-white hover:bg-purple-500 transition"
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
                        className={`text-xs px-2 py-1 rounded-full transition ${actorIds.includes(a.id) ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                      >{a.name}</button>
                    ))
                  }
                </div>
              </>
            )}
          </div>
        )}

        {/* 배우 선택 (work type) */}
        {type === 'work' && (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setActorListOpen(o => !o)}
              className="flex items-center gap-1.5 text-gray-400 hover:text-gray-200 text-xs self-start"
            >
              <span className="font-black text-base leading-none">{actorListOpen ? '−' : '+'}</span>
              배우 선택 (선택한 배우의 작품만 포함)
              {actorIds.length > 0 && <span className="ml-1 text-purple-400">{actorIds.length}명 선택됨</span>}
            </button>
            {selectedActors.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2 bg-gray-900/50 rounded border border-gray-600">
                {selectedActors.map(a => (
                  <button key={a.id} onClick={() => toggleActor(a.id)}
                    className="text-xs px-2 py-1 rounded-full bg-purple-600 text-white hover:bg-purple-500 transition"
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
                        className={`text-xs px-2 py-1 rounded-full transition ${actorIds.includes(a.id) ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                      >{a.name}</button>
                    ))
                  }
                </div>
              </>
            )}
          </div>
        )}

        {/* 레이블 (work type) */}
        {type === 'work' && (() => {
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

        {/* 태그 */}
        {tags.length > 0 && (() => {
          type Group = { catId: number | null; catName: string | null; sortOrder: number; tags: Tag[] }
          const buildGroups = (list: Tag[]): Group[] => {
            const catMap = new Map<number | null, Group>()
            const groups: Group[] = []
            for (const tag of list) {
              const key = tag.category_id ?? null
              if (!catMap.has(key)) {
                const g: Group = { catId: key, catName: tag.category_name ?? null, sortOrder: tag.category_sort_order ?? 999999, tags: [] }
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
          const selectedTagObjs = tags.filter(t => tagIds.includes(t.id))
          const filteredTagList = tags.filter(t => !tagSearch || t.name.toLowerCase().includes(tagSearch.toLowerCase()))
          const allGroups = buildGroups(filteredTagList)
          return (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <button onClick={() => setTagListOpen(o => !o)}
                  className="flex items-center gap-1.5 text-gray-400 hover:text-gray-200 text-xs">
                  <span className="font-black text-base leading-none">{tagListOpen ? '−' : '+'}</span>
                  태그
                  {tagIds.length > 0 && <span className="ml-1 text-blue-400">{tagIds.length}개 선택됨</span>}
                </button>
                {tagIds.length > 1 && (
                  <div className="flex ml-auto">
                    {(['or', 'and'] as const).map((m, i) => (
                      <button key={m} onClick={() => setTagMode(m)}
                        className={`text-xs px-2 py-1 ${i === 0 ? 'rounded-l border-r border-gray-600' : 'rounded-r'} ${tagMode === m ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                      >{m === 'or' ? 'OR' : 'AND'}</button>
                    ))}
                  </div>
                )}
              </div>

              {/* 선택된 태그 — 카테고리 그룹, 항상 표시 */}
              {selectedTagObjs.length > 0 && (
                <div className="space-y-1 p-2 bg-gray-900/50 rounded border border-gray-600">
                  {buildGroups(selectedTagObjs).map(g => (
                    <div key={g.catId ?? 'none'}>
                      <p className="text-xs text-gray-600 mb-0.5">{g.catName ?? '미분류'}</p>
                      <div className="flex flex-wrap gap-1">
                        {g.tags.map(t => (
                          <button key={t.id} onClick={() => toggleTag(t.id)}
                            className="text-xs px-2 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-500 transition">
                            {t.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 펼쳐지는 전체 목록 */}
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
                              className={`text-xs px-2 py-0.5 rounded transition ${tagIds.includes(tag.id) ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
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
