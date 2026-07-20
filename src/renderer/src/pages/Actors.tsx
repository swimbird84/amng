import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { pushEscHandler, popEscHandler } from '../escManager'
import type { Actor, Tag, Work } from '../types'
import { actorsApi, actorTagsApi, shellApi, masterRankingApi } from '../api'
import SearchBar, { type ActorSearchParams, DEFAULT_ACTOR_SEARCH } from '../components/SearchBar'
import ActorForm from '../components/ActorForm'
import ImagePreview from '../components/ImagePreview'
import Rating from '../components/Rating'
import RadarChart from '../components/RadarChart'
import ActorDetailModal from '../components/ActorDetailModal'
import PhysicalCorrectionModal, { calcPhysicalScore, computeStats, loadSettings, type ActorPhysicalData } from '../components/PhysicalCorrectionModal'
import CardTooltip, { type TooltipState } from '../components/CardTooltip'
import { getDivision, DIV_LABEL, DIV_COLOR } from '../components/cup/cupConstants'
import { getAge, getDebutAge } from '../utils/dateHelpers'

interface ActorsProps {
  onNavigateToWork?: (id: number) => void
  onNavigateToActor?: (id: number) => void
}

export default function Actors({ onNavigateToWork, onNavigateToActor }: ActorsProps) {
  const [actors, setActors] = useState<Actor[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [selected, setSelected] = useState<(Actor & { works?: Work[]; tags?: Tag[] }) | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editActor, setEditActor] = useState<(Actor & { tags?: Tag[] }) | undefined>(undefined)
  const [search, setSearch] = useState<ActorSearchParams>(() => {
    try {
      const saved = localStorage.getItem('actors:search')
      return saved ? { ...DEFAULT_ACTOR_SEARCH, ...JSON.parse(saved) } : DEFAULT_ACTOR_SEARCH
    } catch {
      return DEFAULT_ACTOR_SEARCH
    }
  })
  const [sortBy, setSortBy] = useState<'name' | 'avg_score' | 'birthday' | 'work_count' | 'created_at' | 'debut_date' | 'ratio_score' | 'work_release_date' | 'work_created_at' | 'master_points'>(
    (localStorage.getItem('actors:sortBy') as 'name' | 'avg_score' | 'birthday' | 'work_count' | 'created_at' | 'debut_date' | 'ratio_score' | 'work_release_date' | 'work_created_at' | 'master_points') || 'avg_score'
  )
  const [showPhysical, setShowPhysical] = useState(false)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(
    (localStorage.getItem('actors:sortDir') as 'asc' | 'desc') || 'desc'
  )
  const [workSort, setWorkSort] = useState<'release_date' | 'rating'>('release_date')
  const [workSortDir, setWorkSortDir] = useState<'desc' | 'asc'>('desc')
  const [hoverCover, setHoverCover] = useState<string | null>(null)
  const [hoverActorPhoto, setHoverActorPhoto] = useState<string | null>(null)
  const [physScoreMap, setPhysScoreMap] = useState<Map<number, number>>(new Map())
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [fileStatuses, setFileStatuses] = useState<Record<number, boolean>>({})
  const [refreshKey, setRefreshKey] = useState(0)
  const [masterPointsMap, setMasterPointsMap] = useState<Map<number, { rank: number; total_points: number; master_run_count: number }>>(new Map())
  const [deleteMode, setDeleteMode] = useState(false)
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<Set<number>>(new Set())
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [tagCloud, setTagCloud] = useState<{ category_id: number | null; category_name: string | null; category_sort_order: number | null; tag_id: number; tag_name: string; count: number }[] | null>(null)
  const isDragging = useRef(false)
  const dragAction = useRef<'add' | 'remove'>('add')

  const computePhysScores = useCallback(async () => {
    const data = await actorsApi.physicalData() as ActorPhysicalData[]
    const settings = loadSettings()
    const stats = computeStats(data)
    const map = new Map<number, number>()
    for (const a of data) {
      const score = calcPhysicalScore(a, settings, stats)
      if (score !== null) map.set(a.id, score)
    }
    setPhysScoreMap(map)
  }, [])

  const loadMasterPoints = useCallback(async () => {
    const res = await masterRankingApi.list({ type: 'actor', limit: 99999 }) as { rows: { id: number; rank: number; total_points: number; master_run_count: number }[] }
    const map = new Map<number, { rank: number; total_points: number; master_run_count: number }>()
    for (const r of res.rows) {
      map.set(r.id, { rank: r.rank, total_points: r.total_points, master_run_count: r.master_run_count })
    }
    setMasterPointsMap(map)
  }, [])

  const loadActors = useCallback(async () => {
    const params: Record<string, unknown> = {}
    if (search.keyword) params.keyword = search.keyword
    if (search.tagIds.length) { params.tagIds = search.tagIds; params.tagMode = search.tagMode }
    if (search.ageFrom !== '') params.ageFrom = Number(search.ageFrom)
    if (search.ageTo !== '') params.ageTo = Number(search.ageTo)
    if (search.debutDateFrom) params.debutDateFrom = search.debutDateFrom
    if (search.debutDateTo) params.debutDateTo = search.debutDateTo
    if (search.workCountFrom !== '') params.workCountFrom = Number(search.workCountFrom)
    if (search.workCountTo !== '') params.workCountTo = Number(search.workCountTo)
    if (search.avgRatingFrom !== '') params.ratingFrom = Number(search.avgRatingFrom)
    if (search.avgRatingTo !== '') params.ratingTo = Number(search.avgRatingTo)
    if (search.faceFrom !== '') params.faceFrom = Number(search.faceFrom)
    if (search.faceTo !== '') params.faceTo = Number(search.faceTo)
    if (search.bustScoreFrom !== '') params.bustScoreFrom = Number(search.bustScoreFrom)
    if (search.bustScoreTo !== '') params.bustScoreTo = Number(search.bustScoreTo)
    if (search.hipScoreFrom !== '') params.hipScoreFrom = Number(search.hipScoreFrom)
    if (search.hipScoreTo !== '') params.hipScoreTo = Number(search.hipScoreTo)
    if (search.physicalScoreFrom !== '') params.physicalScoreFrom = Number(search.physicalScoreFrom)
    if (search.physicalScoreTo !== '') params.physicalScoreTo = Number(search.physicalScoreTo)
    if (search.skinFrom !== '') params.skinFrom = Number(search.skinFrom)
    if (search.skinTo !== '') params.skinTo = Number(search.skinTo)
    if (search.actingFrom !== '') params.actingFrom = Number(search.actingFrom)
    if (search.actingTo !== '') params.actingTo = Number(search.actingTo)
    if (search.sexyFrom !== '') params.sexyFrom = Number(search.sexyFrom)
    if (search.sexyTo !== '') params.sexyTo = Number(search.sexyTo)
    if (search.charmFrom !== '') params.charmFrom = Number(search.charmFrom)
    if (search.charmTo !== '') params.charmTo = Number(search.charmTo)
    if (search.techniqueFrom !== '') params.techniqueFrom = Number(search.techniqueFrom)
    if (search.techniqueTo !== '') params.techniqueTo = Number(search.techniqueTo)
    if (search.proportionsFrom !== '') params.proportionsFrom = Number(search.proportionsFrom)
    if (search.proportionsTo !== '') params.proportionsTo = Number(search.proportionsTo)
    if (search.ratioScoreFrom !== '') params.ratioScoreFrom = Number(search.ratioScoreFrom)
    if (search.ratioScoreTo !== '') params.ratioScoreTo = Number(search.ratioScoreTo)
    if (search.heightFrom !== '') params.heightFrom = Number(search.heightFrom)
    if (search.heightTo !== '') params.heightTo = Number(search.heightTo)
    if (search.bustFrom !== '') params.bustFrom = Number(search.bustFrom)
    if (search.bustTo !== '') params.bustTo = Number(search.bustTo)
    if (search.waistFrom !== '') params.waistFrom = Number(search.waistFrom)
    if (search.waistTo !== '') params.waistTo = Number(search.waistTo)
    if (search.hipFrom !== '') params.hipFrom = Number(search.hipFrom)
    if (search.hipTo !== '') params.hipTo = Number(search.hipTo)
    if (search.cupFrom) params.cupFrom = search.cupFrom
    if (search.cupTo) params.cupTo = search.cupTo
    if (search.ageNull) params.ageNull = true
    if (search.debutDateNull) params.debutDateNull = true
    if (search.workCountNull) params.workCountNull = true
    if (search.heightNull) params.heightNull = true
    if (search.bustNull) params.bustNull = true
    if (search.waistNull) params.waistNull = true
    if (search.hipNull) params.hipNull = true
    if (search.cupNull) params.cupNull = true
    if (sortBy !== 'ratio_score' && sortBy !== 'master_points') {
      params.sortBy = sortBy
      params.sortDir = sortDir
    }
    if (search.favoriteOnly) params.favoriteOnly = true
    if (search.scoreExcluded) params.scoreExcluded = true
    if (search.commentSearch) params.commentSearch = search.commentSearch
    if (search.commentNull) params.commentNull = true
    if (search.deletePending) params.deletePending = true
    const list = await actorsApi.list(params) as Actor[]
    setActors(list)
  }, [search, sortBy, sortDir])

  const displayActors = useMemo(() => {
    const ratioFrom = search.ratioScoreFrom !== '' ? Number(search.ratioScoreFrom) : null
    const ratioTo   = search.ratioScoreTo   !== '' ? Number(search.ratioScoreTo)   : null
    const filtered = (ratioFrom !== null || ratioTo !== null)
      ? actors.filter(a => {
          const score = physScoreMap.get(a.id) ?? null
          if (score === null) return false
          if (ratioFrom !== null && score < ratioFrom) return false
          if (ratioTo   !== null && score > ratioTo)   return false
          return true
        })
      : actors
    if (sortBy === 'master_points') {
      return [...filtered].sort((a, b) => {
        const ma = masterPointsMap.get(a.id)
        const mb = masterPointsMap.get(b.id)
        const pa = ma ? ma.total_points : -1
        const pb = mb ? mb.total_points : -1
        const diff = sortDir === 'desc' ? pb - pa : pa - pb
        if (diff !== 0) return diff
        return (b.avg_score ?? 0) - (a.avg_score ?? 0)
      })
    }
    if (sortBy !== 'ratio_score') return filtered
    return [...filtered].sort((a, b) => {
      const sa = physScoreMap.get(a.id) ?? -1
      const sb = physScoreMap.get(b.id) ?? -1
      return sortDir === 'desc' ? sb - sa : sa - sb
    })
  }, [actors, sortBy, sortDir, physScoreMap, masterPointsMap])

  const loadTags = async () => {
    setTags(await actorTagsApi.list() as Tag[])
  }

  useEffect(() => { loadActors() }, [loadActors])
  useEffect(() => { loadMasterPoints() }, [loadMasterPoints])
  useEffect(() => { loadTags() }, [])
  useEffect(() => {
    const onMouseUp = () => { isDragging.current = false }
    document.addEventListener('mouseup', onMouseUp)
    return () => document.removeEventListener('mouseup', onMouseUp)
  }, [])
  useEffect(() => {
    if (!selected) return
    const handler = () => { if (tagCloud) setTagCloud(null); else setSelected(null) }
    pushEscHandler(handler)
    return () => popEscHandler(handler)
  }, [selected, tagCloud])
  useEffect(() => {
    computePhysScores()
    window.addEventListener('physicalSettingsChange', computePhysScores)
    return () => window.removeEventListener('physicalSettingsChange', computePhysScores)
  }, [computePhysScores])
  useEffect(() => {
    const handler = () => { loadActors(); computePhysScores(); loadMasterPoints() }
    window.addEventListener('actorScoresUpdated', handler)
    return () => window.removeEventListener('actorScoresUpdated', handler)
  }, [loadActors, computePhysScores, loadMasterPoints])
  useEffect(() => { localStorage.setItem('actors:search', JSON.stringify(search)) }, [search])

  const handleSelect = async (id: number) => {
    const detail = await actorsApi.get(id) as Actor & { works?: Work[]; tags?: Tag[] }
    setSelected(detail)
    const allFiles = (detail.works ?? []).flatMap((w) => w.files ?? [])
    const results = await Promise.all(allFiles.map((f) => f.type === 'url' ? Promise.resolve(true) : shellApi.fileExists(f.file_path)))
    setFileStatuses(Object.fromEntries(allFiles.map((f, i) => [f.id, results[i]])))
  }

  const handleEdit = () => {
    if (selected) {
      setEditActor(selected)
      setShowForm(true)
    }
  }

  const handleDelete = async () => {
    if (selected && confirm('정말 삭제하시겠습니까?')) {
      const res = await actorsApi.delete(selected.id) as { blocked: boolean }
      if (res?.blocked) { alert('진행 중인 월드컵에 참가 중인 배우는 삭제할 수 없습니다.'); return }
      setSelected(null)
      loadActors()
      loadMasterPoints()
    }
  }

  const defaultScores = { face: 0, bust: 0, hip: 0, physical: 0, skin: 0, acting: 0, sexy: 0, charm: 0, technique: 0, proportions: 0 }

  const sortedWorks = useMemo(() => {
    const list = [...(selected?.works ?? [])]
    list.sort((a, b) => {
      let v = 0
      if (workSort === 'rating') {
        v = a.rating - b.rating
      } else {
        const da = a.release_date ?? ''
        const db = b.release_date ?? ''
        v = da < db ? -1 : da > db ? 1 : 0
      }
      return workSortDir === 'desc' ? -v : v
    })
    return list
  }, [selected?.works, workSort, workSortDir])

  const handleToggleRepTag = async (tagId: number) => {
    if (!selected) return
    const currentRepIds = selected.rep_tags?.map((t) => t.id) ?? []
    const newRepIds = currentRepIds.includes(tagId)
      ? currentRepIds.filter((id) => id !== tagId)
      : [...currentRepIds, tagId]
    await actorsApi.update(selected.id, { rep_tag_ids: newRepIds })
    const newRepTags = (selected.tags ?? []).filter((t) => newRepIds.includes(t.id))
    setSelected({ ...selected, rep_tags: newRepTags })
    loadActors()
  }

  const exitDeleteMode = () => {
    setDeleteMode(false)
    setSelectedDeleteIds(new Set())
    setDeleteConfirm(false)
  }

  const handleBulkDelete = async () => {
    let blockedCount = 0
    for (const id of selectedDeleteIds) {
      const res = await actorsApi.delete(id) as { blocked: boolean }
      if (res?.blocked) blockedCount++
    }
    if (blockedCount > 0) alert(`진행 중인 월드컵에 참가 중인 배우 ${blockedCount}명은 삭제할 수 없습니다.`)
    setSelected(null)
    exitDeleteMode()
    loadActors()
    loadMasterPoints()
  }

  const handleToggleFavorite = async (id: number, current: number, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const next = current ? 0 : 1
    await actorsApi.update(id, { is_favorite: next })
    loadActors()
    if (selected?.id === id) {
      setSelected({ ...selected, is_favorite: next })
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* 목록 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4">
          <div className="flex items-center">
            <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5">
              <select
                value={sortBy}
                onChange={(e) => { const v = e.target.value as typeof sortBy; setSortBy(v); localStorage.setItem('actors:sortBy', v) }}
                className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-28"
              >
                <option value="created_at">등록일</option>
                <option value="avg_score">평점</option>
                <option value="ratio_score">피지컬</option>
                <option value="master_points">마스터랭킹</option>
                <option value="birthday">생년월일</option>
                <option value="debut_date">데뷔일</option>
                <option value="work_count">작품수</option>
                <option value="work_release_date">작품발매일</option>
                <option value="work_created_at">작품등록일</option>
                <option value="name">이름</option>
              </select>
              <button
                onClick={() => setSortDir((d) => { const next = d === 'asc' ? 'desc' : 'asc'; localStorage.setItem('actors:sortDir', next); return next })}
                className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-2 py-1.5 rounded"
              >
                {sortDir === 'asc' ? '↑' : '↓'}
              </button>
            </div>
            <div className="w-[38rem] shrink-0 flex items-center bg-gray-800 rounded-lg px-3 py-1.5 ml-2">
              <SearchBar type="actors" params={search} onChange={setSearch} tags={tags} resultCount={displayActors.length} />
            </div>
            <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5 ml-2">
              <button
                onClick={() => { setEditActor(undefined); setShowForm(true) }}
                className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-sm"
              >
                + 배우 등록
              </button>
              <button
                onClick={() => setShowPhysical(true)}
                className="bg-fuchsia-700 hover:bg-fuchsia-600 text-white px-3 py-1.5 rounded text-sm"
              >
                평점 계산기
              </button>
              {deleteMode ? (
                <>
                  <button onClick={() => selectedDeleteIds.size > 0 && setDeleteConfirm(true)} className="bg-gray-600 hover:bg-gray-500 text-white px-3 py-1.5 rounded text-sm flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg></button>
                  <button onClick={exitDeleteMode} className="bg-gray-600 hover:bg-gray-500 text-white px-3 py-1.5 rounded text-sm">✕</button>
                </>
              ) : (
                <button onClick={() => setDeleteMode(true)} className="bg-gray-600 hover:bg-gray-500 text-white px-3 py-1.5 rounded text-sm flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg></button>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pt-0">
          <div className="grid grid-cols-5 gap-3">
            {displayActors.map((a) => (
              <div
                key={a.id}
                onMouseDown={(e) => {
                  if (!deleteMode) return
                  e.preventDefault()
                  isDragging.current = true
                  const willAdd = !selectedDeleteIds.has(a.id)
                  dragAction.current = willAdd ? 'add' : 'remove'
                  setSelectedDeleteIds((prev) => {
                    const next = new Set(prev)
                    if (willAdd) next.add(a.id); else next.delete(a.id)
                    return next
                  })
                }}
                onMouseEnter={() => {
                  if (!deleteMode || !isDragging.current) return
                  setSelectedDeleteIds((prev) => {
                    const next = new Set(prev)
                    if (dragAction.current === 'add') next.add(a.id); else next.delete(a.id)
                    return next
                  })
                }}
                onClick={() => { if (!deleteMode) handleSelect(a.id) }}
                className={`relative cursor-pointer rounded-lg border ring-2 flex flex-col ${
                  deleteMode
                    ? selectedDeleteIds.has(a.id)
                      ? 'border-red-500 ring-red-500'
                      : 'border-gray-700 ring-transparent hover:border-red-400'
                    : selected?.id === a.id
                      ? 'border-blue-500 ring-blue-500'
                      : 'border-gray-700 ring-transparent hover:border-gray-500'
                }`}
              >
                <div className="relative rounded-t-lg overflow-hidden" onMouseMove={(e) => !deleteMode && setTooltip({ type: 'actor', id: a.id, x: e.clientX, y: e.clientY })} onMouseLeave={() => setTooltip(null)}>
                  <ImagePreview path={a.photo_path} alt={a.name} className="w-full h-40" objectPosition="center 10%" version={refreshKey} reobserve={masterPointsMap.size} />
                  {deleteMode && selectedDeleteIds.has(a.id) && (
                    <div className="absolute inset-0 bg-red-500/30 flex items-center justify-center pointer-events-none">
                      <span className="text-white text-4xl font-bold drop-shadow">✓</span>
                    </div>
                  )}
                  <button
                    onClick={(e) => handleToggleFavorite(a.id, a.is_favorite, e)}
                    className="absolute top-1 right-1 text-lg leading-none drop-shadow"
                  >
                    {a.is_favorite ? '♥' : '♡'}
                  </button>
                </div>
                <div className="p-2 bg-gray-800 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-sm font-bold text-white truncate flex-1">{a.name}</p>
                    <p className="text-sm font-bold text-yellow-400 flex-shrink-0">{(a.avg_score ?? 0).toFixed(2)}점</p>
                  </div>
                  {(() => {
                    const mp = masterPointsMap.get(a.id)
                    if (!mp) return null
                    const div = getDivision(mp.rank, mp.master_run_count, 'actor')
                    const isUnranked = mp.master_run_count === 0
                    return (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <span className={`text-[10px] px-1 py-0.5 rounded ${DIV_COLOR[div]}`}>{DIV_LABEL[div]}</span>
                          <span className={`text-xs ${isUnranked ? 'text-gray-500' : 'text-green-400'}`}>#{isUnranked ? '-' : `${mp.rank}위`}</span>
                        </div>
                        <span className={`text-xs ${isUnranked ? 'text-gray-500' : 'text-green-400'}`}>{isUnranked ? '-' : mp.total_points.toFixed(1)}pt</span>
                      </div>
                    )
                  })()}
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400">{a.birthday || '-'} ({getAge(a.birthday)})</p>
                    <p className="text-xs text-gray-400">총{a.work_count ?? 0}편</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400">
                      {[
                        a.height ? `${a.height}cm` : '',
                        (a.bust || a.waist || a.hip) ? `B${a.bust ?? '?'}-W${a.waist ?? '?'}-H${a.hip ?? '?'}` : '',
                        a.cup ? `${a.cup}컵` : '',
                      ].filter(Boolean).join(' ') || '-'}
                    </p>
                    {(physScoreMap.get(a.id) != null || a.ratio_score != null) && (
                      <p className="text-xs text-blue-400 shrink-0">{(physScoreMap.get(a.id) ?? a.ratio_score!).toFixed(2)}점</p>
                    )}
                  </div>
                  {a.rep_tags && a.rep_tags.length > 0 && (
                    <div className="flex flex-wrap gap-0.5 mt-0.5">
                      {a.rep_tags.map((t) => (
                        <span key={t.id} className="bg-blue-900/50 text-blue-300 text-xs px-1.5 py-0.5 rounded">
                          {t.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {actors.length === 0 && (
            <p className="text-gray-500 text-center mt-10">등록된 배우가 없습니다</p>
          )}
        </div>
      </div>

      {/* 상세 모달 */}
      {selected && (
        <ActorDetailModal
          actorId={selected.id}
          onClose={() => { setSelected(null); loadActors(); computePhysScores() }}
          onViewWork={(id) => onNavigateToWork?.(id)}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 flex flex-col gap-4 min-w-[280px]" onClick={(e) => e.stopPropagation()}>
            <p className="text-white">선택된 {selectedDeleteIds.size}개 배우를 삭제하시겠습니까?</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteConfirm(false)} className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded text-sm">취소</button>
              <button onClick={handleBulkDelete} className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded text-sm">삭제</button>
            </div>
          </div>
        </div>
      )}

      {tooltip && <CardTooltip tooltip={tooltip} />}

      {showForm && (
        <ActorForm
          actor={editActor}
          onSave={() => { setShowForm(false); loadActors(); computePhysScores(); setRefreshKey((k) => k + 1); if (selected) handleSelect(selected.id) }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {tagCloud && (() => {
        const sizeClass = (count: number, catMax: number) => {
          const tier = catMax < 5 ? count : Math.ceil((count / catMax) * 5)
          if (tier >= 5) return 'text-base font-bold text-white'
          if (tier >= 4) return 'text-sm font-semibold text-gray-200'
          if (tier >= 3) return 'text-sm text-gray-200'
          if (tier >= 2) return 'text-xs text-gray-300'
          return 'text-xs text-gray-400'
        }
        type Group = { catId: number | null; catName: string | null; sortOrder: number; tags: typeof tagCloud }
        const catMap = new Map<number | null, Group>()
        const groups: Group[] = []
        for (const t of tagCloud) {
          const key = t.category_id ?? null
          if (!catMap.has(key)) {
            const g: Group = { catId: key, catName: t.category_name ?? null, sortOrder: t.category_sort_order ?? 999999, tags: [] }
            catMap.set(key, g); groups.push(g)
          }
          catMap.get(key)!.tags.push(t)
        }
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setTagCloud(null)}>
            <div className="bg-gray-800 rounded-lg w-[600px] max-h-[80vh] flex flex-col relative" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
                <span className="text-white font-semibold">출연작 태그</span>
                <button onClick={() => setTagCloud(null)} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
              </div>
              <div className="overflow-y-auto p-4 space-y-3">
                {groups.map(g => (
                  <div key={g.catId ?? 'none'}>
                    <p className="text-xs text-gray-500 mb-1.5 border-b border-gray-700 pb-0.5">{g.catName ?? '미분류'}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(() => {
                        const catMax = Math.max(...g.tags.map(t => t.count), 1)
                        return g.tags.map(t => (
                          <span key={t.tag_id} className={`px-2 py-0.5 rounded bg-gray-700 ${sizeClass(t.count, catMax)}`}>
                            {t.tag_name} {t.count}
                          </span>
                        ))
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      {showPhysical && (
        <PhysicalCorrectionModal onClose={() => setShowPhysical(false)} onViewActor={onNavigateToActor} />
      )}
    </div>
  )
}
