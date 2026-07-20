import { useState, useEffect, useCallback, useRef } from 'react'
import { pushEscHandler, popEscHandler } from '../escManager'
import type { Work, Tag, Actor, Studio } from '../types'
import { worksApi, workFilesApi, workTagsApi, actorsApi, studiosApi, studioCodesApi, dialogApi, scanApi, shellApi, imageApi, masterRankingApi } from '../api'
import SearchBar, { type WorkSearchParams, DEFAULT_WORK_SEARCH } from '../components/SearchBar'
import WorkForm from '../components/WorkForm'
import WorkDetailModal from '../components/WorkDetailModal'
import ImagePreview from '../components/ImagePreview'
import Rating from '../components/Rating'
import CardTooltip, { type TooltipState } from '../components/CardTooltip'
import { hashColor, studioColor } from '../utils/colorHelpers'
import { getDivision, DIV_LABEL, DIV_COLOR } from '../components/cup/cupConstants'

const BATCH_SIZE = 100

interface WorksProps {
  onNavigateToActor?: (id: number) => void
}

export default function Works({ onNavigateToActor }: WorksProps) {
  const [works, setWorks] = useState<Work[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [actorList, setActorList] = useState<Actor[]>([])
  const [studioList, setStudioList] = useState<Studio[]>([])
  const [selected, setSelected] = useState<(Work & { actors?: Actor[]; tags?: Tag[] }) | null>(null)
  const [fileStatuses, setFileStatuses] = useState<Record<number, boolean>>({})
  const [showForm, setShowForm] = useState(false)
  const [editWork, setEditWork] = useState<(Work & { actors?: Actor[]; tags?: Tag[] }) | undefined>(undefined)
  const [search, setSearch] = useState<WorkSearchParams>(() => {
    try {
      const saved = localStorage.getItem('works:search')
      return saved ? { ...DEFAULT_WORK_SEARCH, ...JSON.parse(saved) } : DEFAULT_WORK_SEARCH
    } catch {
      return DEFAULT_WORK_SEARCH
    }
  })
  const [sortBy, setSortBy] = useState<'product_number' | 'rating' | 'release_date' | 'created_at' | 'title' | 'actor' | 'studio' | 'master_points'>(
    (localStorage.getItem('works:sortBy') as 'product_number' | 'rating' | 'release_date' | 'created_at' | 'title' | 'actor' | 'studio' | 'master_points') || 'release_date'
  )
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(
    (localStorage.getItem('works:sortDir') as 'asc' | 'desc') || 'desc'
  )
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [masterPointsMap, setMasterPointsMap] = useState<Map<number, { rank: number; total_points: number; master_run_count: number }>>(new Map())
  const [deleteMode, setDeleteMode] = useState(false)
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<Set<number>>(new Set())
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [scanProgress, setScanProgress] = useState<{ phase: 'scanning' | 'registering' | 'done'; current: number; total: number; fileName: string; result?: { added: number; duplicates: number } } | null>(null)
  const isDragging = useRef(false)
  const dragAction = useRef<'add' | 'remove'>('add')
  const [hasMore, setHasMore] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const hasMoreRef = useRef(true)
  const isLoadingMoreRef = useRef(false)
  const worksCountRef = useRef(0)

  const fetchWorks = useCallback(async (offset: number, replace: boolean, limit = BATCH_SIZE) => {
    const params: Record<string, unknown> = {}
    if (search.keyword) params.keyword = search.keyword
    if (search.tagIds.length) { params.tagIds = search.tagIds; params.tagMode = search.tagMode }
    if (search.actorId) params.actorId = Number(search.actorId)
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
  }, [search, sortBy, sortDir])

  const loadMasterPoints = useCallback(async () => {
    const res = await masterRankingApi.list({ type: 'work', limit: 99999 }) as { rows: { id: number; rank: number; total_points: number; master_run_count: number }[] }
    const map = new Map<number, { rank: number; total_points: number; master_run_count: number }>()
    for (const r of res.rows) {
      map.set(r.id, { rank: r.rank, total_points: r.total_points, master_run_count: r.master_run_count })
    }
    setMasterPointsMap(map)
  }, [])

  const refreshWorks = useCallback((extraCount = 0) => {
    const count = Math.max(worksCountRef.current + extraCount, BATCH_SIZE)
    return fetchWorks(0, true, count)
  }, [fetchWorks])

  const loadTags = async () => {
    setTags(await workTagsApi.list() as Tag[])
  }

  const loadActorList = async () => {
    setActorList(await actorsApi.list({ sortBy: 'name', sortDir: 'asc' }) as Actor[])
  }

  useEffect(() => {
    setHasMore(true)
    hasMoreRef.current = true
    setIsLoadingMore(true)
    isLoadingMoreRef.current = true
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
  useEffect(() => {
    const onMouseUp = () => { isDragging.current = false }
    document.addEventListener('mouseup', onMouseUp)
    return () => document.removeEventListener('mouseup', onMouseUp)
  }, [])
  useEffect(() => {
    if (!selected) return
    const handler = () => setSelected(null)
    pushEscHandler(handler)
    return () => popEscHandler(handler)
  }, [selected])
  useEffect(() => {
    loadTags()
    loadActorList()
    loadMasterPoints()
    studiosApi.list().then((d) => setStudioList(d as Studio[]))
  }, [])
  useEffect(() => { localStorage.setItem('works:search', JSON.stringify(search)) }, [search])

  const handleSelect = async (id: number) => {
    const detail = await worksApi.get(id) as Work & { actors?: Actor[]; tags?: Tag[] }
    setSelected(detail)
    const files = detail.files ?? []
    const results = await Promise.all(files.map((f) => f.type === 'url' ? Promise.resolve(true) : shellApi.fileExists(f.file_path)))
    setFileStatuses(Object.fromEntries(files.map((f, i) => [f.id, results[i]])))
  }


  const handleEdit = () => {
    if (selected) {
      setEditWork(selected)
      setShowForm(true)
    }
  }

  const handleDelete = async () => {
    if (selected && confirm('정말 삭제하시겠습니까?')) {
      const res = await worksApi.delete(selected.id) as { blocked: boolean }
      if (res?.blocked) { alert('진행 중인 월드컵에 참가 중인 작품은 삭제할 수 없습니다.'); return }
      setSelected(null)
      refreshWorks(-1)
      loadMasterPoints()
    }
  }

  const handleScan = async () => {
    const folder = await dialogApi.openFolder() as string | null
    if (!folder) return

    setScanProgress({ phase: 'scanning', current: 0, total: 0, fileName: '' })
    const progressHandler = scanApi.onProgress((count: number) => {
      setScanProgress({ phase: 'scanning', current: count, total: 0, fileName: '' })
    })
    const { newFiles, duplicates } = await scanApi.folder(folder) as { newFiles: { videoPath: string, imagePath: string | null }[], duplicates: string[] }
    scanApi.offProgress(progressHandler)

    if (newFiles.length === 0 && duplicates.length === 0) {
      setScanProgress(null)
      return alert('동영상 파일이 없습니다')
    }

    let added = 0
    for (let i = 0; i < newFiles.length; i++) {
      const { videoPath, imagePath } = newFiles[i]
      const parts = videoPath.replace(/\\/g, '/').split('/')
      const fileName = parts[parts.length - 1] ?? ''
      setScanProgress({ phase: 'registering', current: i + 1, total: newFiles.length, fileName })
      try {
        const folderName = parts.length >= 2 ? parts[parts.length - 2] : ''
        const parentFolder = parts.length >= 3 ? parts[parts.length - 3] : ''
        const productNumber = fileName.replace(/\.[^.]+$/, '')
        const codeMatch = productNumber.match(/^(.+)-\d/)
        const studioId = codeMatch ? await studioCodesApi.lookup(codeMatch[1]) : null
        const dateMatch = folderName.match(/^(\d{4}-\d{2}-\d{2})[\s_]/)
        const releaseDate = dateMatch ? dateMatch[1] : undefined
        const actorMatch = parentFolder.match(/^(.+)\s+(\d{4}-\d{2}-\d{2})$/)
        const actorId = actorMatch ? await actorsApi.findOrCreate(actorMatch[1], actorMatch[2]) : null
        const workId = await worksApi.create({ file_path: videoPath, product_number: productNumber, studio_id: studioId, release_date: releaseDate, actor_ids: actorId ? [actorId] : undefined, rep_actor_ids: actorId ? [actorId] : undefined }) as number
        if (imagePath) {
          const newCoverPath = await imageApi.copy(imagePath, 'works', workId) as string
          await worksApi.update(workId, { cover_path: newCoverPath })
        }
        added++
      } catch {
        // 무시
      }
    }

    setScanProgress({ phase: 'done', current: 0, total: 0, fileName: '', result: { added, duplicates: duplicates.length } })
    refreshWorks(added)
  }

  const handleRating = async (id: number, rating: number) => {
    await worksApi.update(id, { rating })
    setWorks(prev => prev.map(w => w.id === id ? { ...w, rating } : w))
    if (selected?.id === id) setSelected({ ...selected, rating })
  }

  const handleToggleRepTag = async (tagId: number) => {
    if (!selected) return
    const currentRepIds = selected.rep_tags?.map((t) => t.id) ?? []
    const newRepIds = currentRepIds.includes(tagId)
      ? currentRepIds.filter((id) => id !== tagId)
      : [...currentRepIds, tagId]
    await worksApi.update(selected.id, { rep_tag_ids: newRepIds })
    const newRepTags = (selected.tags ?? []).filter((t) => newRepIds.includes(t.id))
    setSelected({ ...selected, rep_tags: newRepTags })
    refreshWorks()
  }

  const handleToggleRepActor = async (actorId: number) => {
    if (!selected) return
    const currentRepIds = selected.rep_actors?.map((a) => a.id) ?? []
    const newRepIds = currentRepIds.includes(actorId)
      ? currentRepIds.filter((id) => id !== actorId)
      : [...currentRepIds, actorId]
    await worksApi.update(selected.id, { rep_actor_ids: newRepIds })
    const newRepActors = (selected.actors ?? [])
      .filter((a) => newRepIds.includes(a.id))
      .map((a) => ({ id: a.id, name: a.name }))
    setSelected({ ...selected, rep_actors: newRepActors })
    refreshWorks()
  }

  const exitDeleteMode = () => {
    setDeleteMode(false)
    setSelectedDeleteIds(new Set())
    setDeleteConfirm(false)
  }

  const handleBulkDelete = async () => {
    let blockedCount = 0
    for (const id of selectedDeleteIds) {
      const res = await worksApi.delete(id) as { blocked: boolean }
      if (res?.blocked) blockedCount++
    }
    const deletedCount = selectedDeleteIds.size - blockedCount
    if (blockedCount > 0) alert(`진행 중인 월드컵에 참가 중인 작품 ${blockedCount}개는 삭제할 수 없습니다.`)
    setSelected(null)
    exitDeleteMode()
    refreshWorks(-deletedCount)
    loadMasterPoints()
  }

  const handleBulkTrashFolders = async () => {
    const ids = [...selectedDeleteIds]
    const files = await workFilesApi.listByWorkIds(ids)
    const filePaths = files.map(f => f.file_path)
    if (filePaths.length > 0) {
      const deleted = await shellApi.trashFolders(filePaths)
      if (deleted > 0) alert(`${deleted}개 폴더를 휴지통으로 이동했습니다`)
    }
    setDeleteConfirm(false)
  }

  const handleToggleFavorite = async (id: number, current: number, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const next = current ? 0 : 1
    await worksApi.update(id, { is_favorite: next })
    setWorks(prev => prev.map(w => w.id === id ? { ...w, is_favorite: next } : w))
    if (selected?.id === id) setSelected({ ...selected, is_favorite: next })
  }

  return (
    <div className="h-full flex flex-col">
      {/* 스캔 진행 오버레이 */}
      {scanProgress && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-gray-800 rounded-xl p-8 w-[480px] flex flex-col gap-4">
            <div className="text-white font-semibold text-lg">
              {scanProgress.phase === 'scanning' ? '폴더 스캔 중...' : scanProgress.phase === 'registering' ? '파일 등록 중...' : '등록 완료'}
            </div>
            {scanProgress.phase === 'registering' && (
              <>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${Math.round((scanProgress.current / scanProgress.total) * 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-sm text-gray-400">
                  <span className="truncate max-w-[340px]">{scanProgress.fileName}</span>
                  <span className="shrink-0 ml-2">{scanProgress.current} / {scanProgress.total}</span>
                </div>
              </>
            )}
            {scanProgress.phase === 'scanning' && (
              <div className="text-sm text-gray-400">
                {scanProgress.current > 0 ? `${scanProgress.current}개 발견 중...` : '파일 목록을 읽는 중입니다...'}
              </div>
            )}
            {scanProgress.phase === 'done' && scanProgress.result && (
              <>
                <div className="text-gray-300">
                  <span className="text-white font-medium">{scanProgress.result.added}개</span> 작품이 등록되었습니다.
                  {scanProgress.result.duplicates > 0 && (
                    <span className="text-gray-400 text-sm ml-2">({scanProgress.result.duplicates}개는 이미 등록된 파일)</span>
                  )}
                </div>
                <button
                  className="mt-2 self-end px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium"
                  onClick={() => setScanProgress(null)}
                >
                  확인
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {/* 목록 영역 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4">
          <div className="flex items-center">
            <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5">
              <select
                value={sortBy}
                onChange={(e) => { const v = e.target.value as typeof sortBy; setSortBy(v); localStorage.setItem('works:sortBy', v) }}
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
                onClick={() => setSortDir((d) => { const next = d === 'asc' ? 'desc' : 'asc'; localStorage.setItem('works:sortDir', next); return next })}
                className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-2 py-1.5 rounded"
              >
                {sortDir === 'asc' ? '↑' : '↓'}
              </button>
            </div>
            <div className="w-[38rem] shrink-0 flex items-center bg-gray-800 rounded-lg px-3 py-1.5 ml-2">
              <SearchBar type="works" params={search} onChange={setSearch} tags={tags} actors={actorList} studios={studioList} resultCount={totalCount ?? works.length} />
            </div>
            <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5 ml-2">
              <button
                onClick={() => { setEditWork(undefined); setShowForm(true) }}
                className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-sm"
              >
                + 작품 등록
              </button>
              <button
                onClick={handleScan}
                className="bg-green-700 hover:bg-green-600 text-white px-3 py-1.5 rounded text-sm"
              >
                폴더 스캔
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
            {works.map((w) => (
              <div
                key={w.id}
                onMouseDown={(e) => {
                  if (!deleteMode) return
                  e.preventDefault()
                  isDragging.current = true
                  const willAdd = !selectedDeleteIds.has(w.id)
                  dragAction.current = willAdd ? 'add' : 'remove'
                  setSelectedDeleteIds((prev) => {
                    const next = new Set(prev)
                    if (willAdd) next.add(w.id); else next.delete(w.id)
                    return next
                  })
                }}
                onMouseEnter={() => {
                  if (!deleteMode || !isDragging.current) return
                  setSelectedDeleteIds((prev) => {
                    const next = new Set(prev)
                    if (dragAction.current === 'add') next.add(w.id); else next.delete(w.id)
                    return next
                  })
                }}
                onClick={() => { if (!deleteMode) handleSelect(w.id) }}
                className={`relative cursor-pointer rounded-lg border ring-2 flex flex-col ${
                  deleteMode
                    ? selectedDeleteIds.has(w.id)
                      ? 'border-red-500 ring-red-500'
                      : 'border-gray-700 ring-transparent hover:border-red-400'
                    : selected?.id === w.id
                      ? 'border-blue-500 ring-blue-500'
                      : 'border-gray-700 ring-transparent hover:border-gray-500'
                }`}
              >
                <div className="relative rounded-t-lg overflow-hidden" onMouseMove={(e) => !deleteMode && setTooltip({ type: 'work', id: w.id, x: e.clientX, y: e.clientY })} onMouseLeave={() => setTooltip(null)}>
                  <ImagePreview path={w.cover_path} alt={w.title || '표지'} className="w-full h-40" version={refreshKey} />
                  {deleteMode && selectedDeleteIds.has(w.id) && (
                    <div className="absolute inset-0 bg-red-500/30 flex items-center justify-center pointer-events-none">
                      <span className="text-white text-4xl font-bold drop-shadow">✓</span>
                    </div>
                  )}
                  {w.studio_name && (
                    <div className="absolute top-1 left-1 max-w-[70%]" style={{ lineHeight: 0 }}>
                      <span
                        className="text-white text-xs px-1.5 rounded"
                        style={{ backgroundColor: studioColor(w.studio_name, w.studio_color), display: 'inline', WebkitBoxDecorationBreak: 'clone', boxDecorationBreak: 'clone', lineHeight: '1.5', verticalAlign: 'top' } as any}
                      >
                        {w.studio_maker_name && w.studio_maker_name !== w.studio_name
                          ? <><span style={{ whiteSpace: 'nowrap' }}>{w.studio_maker_name}</span>{' '}<span style={{ whiteSpace: 'nowrap' }}>{w.studio_name}</span></>
                          : w.studio_name}
                      </span>
                    </div>
                  )}
                  <button
                    onClick={(e) => handleToggleFavorite(w.id, w.is_favorite, e)}
                    className="absolute top-1 right-1 text-lg leading-none drop-shadow"
                  >
                    {w.is_favorite ? '♥' : '♡'}
                  </button>
                </div>
                <div className="p-2 bg-gray-800 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-sm font-bold text-white truncate flex-1">{w.product_number || '-'}</p>
                    <div className="flex-shrink-0">
                      <Rating value={w.rating} readonly small />
                    </div>
                  </div>
                  {(() => {
                    const mp = masterPointsMap.get(w.id)
                    if (!mp) return null
                    const div = getDivision(mp.rank, mp.master_run_count, 'work')
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
                  <p className="text-xs text-gray-500">발매일:{w.release_date || '-'} 등록일:{w.created_at?.slice(0, 10) || '-'}</p>
                  {w.rep_actors && w.rep_actors.length > 0 && (
                    <div className="flex flex-wrap gap-0.5 mt-0.5">
                      {w.rep_actors.map((a) => (
                        <span key={a.id} className="bg-purple-900/50 text-purple-300 text-xs px-1.5 py-0.5 rounded">
                          {a.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {w.rep_tags && w.rep_tags.length > 0 && (
                    <div className="flex flex-wrap gap-0.5 mt-0.5">
                      {w.rep_tags.map((t) => (
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
          {works.length === 0 && !isLoadingMore && (
            <p className="text-gray-500 text-center mt-10">등록된 작품이 없습니다</p>
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

      {/* 상세 모달 */}
      {selected && (
        <WorkDetailModal
          workId={selected.id}
          onClose={() => { setSelected(null); refreshWorks() }}
          onViewActor={(id) => onNavigateToActor?.(id)}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 flex flex-col gap-4 min-w-[280px]" onClick={(e) => e.stopPropagation()}>
            <p className="text-white">선택된 {selectedDeleteIds.size}개 작품을 삭제하시겠습니까?</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteConfirm(false)} className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded text-sm">취소</button>
              <button onClick={handleBulkDelete} className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded text-sm">삭제</button>
              <button onClick={handleBulkTrashFolders} className="bg-orange-700 hover:bg-orange-600 text-white px-4 py-2 rounded text-sm">폴더 삭제</button>
            </div>
          </div>
        </div>
      )}

      {tooltip && <CardTooltip tooltip={tooltip} />}

      {showForm && (
        <WorkForm
          work={editWork}
          onSave={() => { setShowForm(false); refreshWorks(); setRefreshKey((k) => k + 1); if (selected) handleSelect(selected.id) }}
          onCancel={() => setShowForm(false)}
        />
      )}

    </div>
  )
}
