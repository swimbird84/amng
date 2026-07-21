import { useState, useEffect, useCallback, useRef } from 'react'
import { pushEscHandler, popEscHandler } from '../escManager'
import type { Work, Tag, Studio } from '../types'
import { worksApi, workFilesApi, workTagsApi, studiosApi, shellApi, masterRankingApi } from '../api'
import SearchBar, { type WorkSearchParams, DEFAULT_WORK_SEARCH } from './SearchBar'
import WorkCard from './WorkCard'
import WorkDetailModal from './WorkDetailModal'
import CardTooltip, { type TooltipState } from './CardTooltip'

const BATCH_SIZE = 100

interface Props {
  actorId: number
  actorName: string
  onClose: () => void
  onNavigateToActor?: (id: number) => void
}

export default function ActorWorksModal({ actorId, actorName, onClose, onNavigateToActor }: Props) {
  const [works, setWorks] = useState<Work[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [studioList, setStudioList] = useState<Studio[]>([])
  const [search, setSearch] = useState<WorkSearchParams>(DEFAULT_WORK_SEARCH)
  const [sortBy, setSortBy] = useState<'product_number' | 'rating' | 'release_date' | 'created_at' | 'title' | 'actor' | 'studio' | 'master_points'>('release_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [selected, setSelected] = useState<Work | null>(null)
  const [masterPointsMap, setMasterPointsMap] = useState<Map<number, { rank: number; total_points: number; master_run_count: number }>>(new Map())
  const [hasMore, setHasMore] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const hasMoreRef = useRef(true)
  const isLoadingMoreRef = useRef(false)
  const worksCountRef = useRef(0)

  // file play status
  const [playFiles, setPlayFiles] = useState<Record<number, { file_path: string; type: string }>>({})
  const [playable, setPlayable] = useState<Record<number, boolean>>({})
  const checkedRef = useRef(new Set<number>())

  useEffect(() => {
    const handler = () => onClose()
    pushEscHandler(handler)
    return () => popEscHandler(handler)
  }, [onClose])

  const fetchWorks = useCallback(async (offset: number, replace: boolean, limit = BATCH_SIZE) => {
    const params: Record<string, unknown> = { actorId }
    if (search.keyword) params.keyword = search.keyword
    if (search.tagIds.length) { params.tagIds = search.tagIds; params.tagMode = search.tagMode }
    if (search.studioId) params.studioId = Number(search.studioId)
    if (search.releaseDateFrom) params.releaseDateFrom = search.releaseDateFrom
    if (search.releaseDateTo) params.releaseDateTo = search.releaseDateTo
    if (search.ratingFrom !== '') params.ratingFrom = Number(search.ratingFrom)
    if (search.ratingTo !== '') params.ratingTo = Number(search.ratingTo)
    if (search.titleSearch) params.titleSearch = search.titleSearch
    if (search.titleNull) params.titleNull = true
    if (search.commentSearch) params.commentSearch = search.commentSearch
    if (search.commentNull) params.commentNull = true
    if (search.releaseDateNull) params.releaseDateNull = true
    if (search.actorCountFrom !== '') params.actorCountFrom = Number(search.actorCountFrom)
    if (search.actorCountTo !== '') params.actorCountTo = Number(search.actorCountTo)
    if (search.actorCountNull) params.actorCountNull = true
    params.sortBy = sortBy
    params.sortDir = sortDir
    if (search.favoriteOnly) params.favoriteOnly = true
    if (search.deletePending) params.deletePending = true
    params.limit = limit
    params.offset = offset
    const result = await worksApi.list(params) as { items: Work[]; total: number }
    if (replace) {
      setWorks(result.items)
      worksCountRef.current = result.items.length
    } else {
      setWorks(prev => { const next = [...prev, ...result.items]; worksCountRef.current = next.length; return next })
    }
    setTotalCount(result.total)
    const more = result.items.length === limit
    setHasMore(more)
    hasMoreRef.current = more
    setIsLoadingMore(false)
    isLoadingMoreRef.current = false
  }, [actorId, search, sortBy, sortDir])

  useEffect(() => {
    setHasMore(true)
    hasMoreRef.current = true
    setIsLoadingMore(true)
    isLoadingMoreRef.current = true
    checkedRef.current.clear()
    setPlayFiles({})
    setPlayable({})
    fetchWorks(0, true)
  }, [fetchWorks])

  useEffect(() => { worksCountRef.current = works.length }, [works.length])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMoreRef.current && !isLoadingMoreRef.current) {
        isLoadingMoreRef.current = true
        setIsLoadingMore(true)
        fetchWorks(worksCountRef.current, false)
      }
    }, { rootMargin: '200px' })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [fetchWorks])

  // check file play status
  useEffect(() => {
    const newIds = works.map(w => w.id).filter(id => !checkedRef.current.has(id))
    if (newIds.length === 0) return
    newIds.forEach(id => checkedRef.current.add(id))
    workFilesApi.firstByWorkIds(newIds).then(async (files) => {
      const newPF: Record<number, { file_path: string; type: string }> = {}
      const newP: Record<number, boolean> = {}
      for (const f of files) {
        newPF[f.work_id] = { file_path: f.file_path, type: f.type }
        if (f.type === 'url') newP[f.work_id] = true
      }
      for (const id of newIds) { if (!(id in newPF)) newP[id] = false }
      const localFiles = files.filter(f => f.type === 'local')
      if (localFiles.length > 0) {
        const results = await Promise.all(localFiles.map(f => shellApi.fileExists(f.file_path)))
        localFiles.forEach((f, i) => { newP[f.work_id] = results[i] })
      }
      setPlayFiles(prev => ({ ...prev, ...newPF }))
      setPlayable(prev => ({ ...prev, ...newP }))
    })
  }, [works])

  useEffect(() => {
    workTagsApi.list().then(d => setTags(d as Tag[]))
    studiosApi.list().then(d => setStudioList(d as Studio[]))
    masterRankingApi.list({ type: 'work', limit: 99999 }).then((res: any) => {
      const map = new Map<number, { rank: number; total_points: number; master_run_count: number }>()
      for (const r of res.rows) map.set(r.id, { rank: r.rank, total_points: r.total_points, master_run_count: r.master_run_count })
      setMasterPointsMap(map)
    })
  }, [])

  const handleSelect = async (id: number) => {
    const detail = await worksApi.get(id) as Work
    setSelected(detail)
  }

  const handleToggleFavorite = async (id: number, current: number, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const next = current ? 0 : 1
    await worksApi.update(id, { is_favorite: next })
    setWorks(prev => prev.map(w => w.id === id ? { ...w, is_favorite: next } : w))
  }

  const handlePlay = (workId: number) => {
    const f = playFiles[workId]
    if (!f) return
    if (f.type === 'url') shellApi.openExternal(f.file_path)
    else shellApi.openPath(f.file_path)
  }

  const refreshWorks = useCallback(() => {
    const count = Math.max(worksCountRef.current, BATCH_SIZE)
    return fetchWorks(0, true, count)
  }, [fetchWorks])

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <div className="bg-gray-900 rounded-xl w-[calc(100vw-40px)] h-[calc(100vh-40px)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center">
            <h2 className="text-white font-bold text-lg mr-4 shrink-0">{actorName}</h2>
            <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-28"
              >
                <option value="release_date">발매일</option>
                <option value="created_at">등록일</option>
                <option value="master_points">마스터랭킹</option>
                <option value="actor">배우</option>
                <option value="studio">레이블</option>
                <option value="rating">별점</option>
                <option value="product_number">품번</option>
                <option value="title">타이틀</option>
              </select>
              <button
                onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-2 py-1.5 rounded"
              >
                {sortDir === 'asc' ? '\u2191' : '\u2193'}
              </button>
            </div>
            <div className="w-[38rem] shrink-0 flex items-center bg-gray-800 rounded-lg px-3 py-1.5 ml-2">
              <SearchBar type="works" params={search} onChange={setSearch} tags={tags} actors={[]} studios={studioList} resultCount={totalCount ?? works.length} hideActorDropdown />
            </div>
            <div className="ml-auto">
              <button onClick={onClose} className="text-gray-400 hover:text-white text-xl px-2">&times;</button>
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-5 gap-3">
            {works.map((w) => (
              <WorkCard
                key={w.id}
                work={w}
                refreshKey={refreshKey}
                selected={selected?.id === w.id}
                filePlayable={playable[w.id]}
                masterPoints={masterPointsMap.get(w.id)}
                onClick={() => handleSelect(w.id)}
                onTooltipMove={(e) => setTooltip({ type: 'work', id: w.id, x: e.clientX, y: e.clientY })}
                onTooltipLeave={() => setTooltip(null)}
                onToggleFavorite={(e) => handleToggleFavorite(w.id, w.is_favorite, e)}
                onPlay={() => handlePlay(w.id)}
              />
            ))}
          </div>
          {works.length === 0 && !isLoadingMore && (
            <p className="text-gray-500 text-center mt-10">작품이 없습니다</p>
          )}
          <div ref={sentinelRef} className="h-4" />
          {isLoadingMore && (
            <div className="text-center text-gray-500 text-sm py-4">로딩 중...</div>
          )}
          {!hasMore && works.length > 0 && (
            <div className="text-center text-gray-600 text-xs py-2">전체 {works.length}개</div>
          )}
        </div>
      </div>

      {selected && (
        <WorkDetailModal
          workId={selected.id}
          onClose={() => { setSelected(null); refreshWorks() }}
          onViewActor={(id) => onNavigateToActor?.(id)}
        />
      )}

      {tooltip && <CardTooltip tooltip={tooltip} />}
    </div>
  )
}
