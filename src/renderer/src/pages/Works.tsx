import { useState, useEffect, useCallback, useRef } from 'react'
import type { Work, Tag, Actor, Studio } from '../types'
import { worksApi, workTagsApi, actorsApi, studiosApi, studioCodesApi, dialogApi, scanApi, shellApi, imageApi } from '../api'
import SearchBar, { type WorkSearchParams } from '../components/SearchBar'
import WorkForm from '../components/WorkForm'
import ImagePreview from '../components/ImagePreview'
import Rating from '../components/Rating'
import CardTooltip, { type TooltipState } from '../components/CardTooltip'

function hashColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return `hsl(${Math.abs(hash) % 360}, 65%, 45%)`
}

function studioColor(name: string, color?: string | null): string {
  return color || hashColor(name)
}

interface WorksProps {
  onNavigateToActor?: (id: number) => void
  openEditId?: number | null
  onEditHandled?: () => void
}

export default function Works({ onNavigateToActor, openEditId, onEditHandled }: WorksProps) {
  const [works, setWorks] = useState<Work[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [actorList, setActorList] = useState<Actor[]>([])
  const [studioList, setStudioList] = useState<Studio[]>([])
  const [selected, setSelected] = useState<(Work & { actors?: Actor[]; tags?: Tag[] }) | null>(null)
  const [fileStatuses, setFileStatuses] = useState<Record<number, boolean>>({})
  const [showForm, setShowForm] = useState(false)
const [favoriteOnly, setFavoriteOnly] = useState(false)
  const [editWork, setEditWork] = useState<(Work & { actors?: Actor[]; tags?: Tag[] }) | undefined>(undefined)
  const [search, setSearch] = useState<WorkSearchParams>(() => {
    try {
      const saved = localStorage.getItem('works:search')
      return saved ? JSON.parse(saved) : { keyword: '', tagIds: [], tagMode: 'and', actorId: '', studioId: '' }
    } catch {
      return { keyword: '', tagIds: [], tagMode: 'and', actorId: '', studioId: '' }
    }
  })
  const [sortBy, setSortBy] = useState<'product_number' | 'rating' | 'release_date' | 'created_at' | 'title'>(
    (localStorage.getItem('works:sortBy') as 'product_number' | 'rating' | 'release_date' | 'created_at' | 'title') || 'release_date'
  )
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(
    (localStorage.getItem('works:sortDir') as 'asc' | 'desc') || 'desc'
  )
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [deleteMode, setDeleteMode] = useState(false)
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<Set<number>>(new Set())
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const isDragging = useRef(false)
  const dragAction = useRef<'add' | 'remove'>('add')

  const loadWorks = useCallback(async () => {
    const params: Record<string, unknown> = {}
    if (search.keyword) params.keyword = search.keyword
    if (search.tagIds.length) { params.tagIds = search.tagIds; params.tagMode = search.tagMode }
    if (search.actorId) params.actorId = Number(search.actorId)
    if (search.studioId) params.studioId = Number(search.studioId)
    params.sortBy = sortBy
    params.sortDir = sortDir
    if (favoriteOnly) params.favoriteOnly = true
    const list = await worksApi.list(params) as Work[]
    setWorks(list)
  }, [search, sortBy, sortDir, favoriteOnly])

  const loadTags = async () => {
    setTags(await workTagsApi.list() as Tag[])
  }

  const loadActorList = async () => {
    setActorList(await actorsApi.list({ sortBy: 'name', sortDir: 'asc' }) as Actor[])
  }

  useEffect(() => { loadWorks() }, [loadWorks])
  useEffect(() => {
    const onMouseUp = () => { isDragging.current = false }
    document.addEventListener('mouseup', onMouseUp)
    return () => document.removeEventListener('mouseup', onMouseUp)
  }, [])
  useEffect(() => {
    if (!selected) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [selected])
  useEffect(() => {
    loadTags()
    loadActorList()
    studiosApi.list().then((d) => setStudioList(d as Studio[]))
  }, [])
  useEffect(() => { localStorage.setItem('works:search', JSON.stringify(search)) }, [search])
  useEffect(() => {
    if (!openEditId) return
    worksApi.get(openEditId).then((w) => {
      setEditWork(w as Work & { actors?: Actor[]; tags?: Tag[] })
      setShowForm(true)
      onEditHandled?.()
    })
  }, [openEditId])

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
      await worksApi.delete(selected.id)
      setSelected(null)
      loadWorks()
    }
  }

  const handleScan = async () => {
    const folder = await dialogApi.openFolder() as string | null
    if (!folder) return
    const { newFiles, duplicates } = await scanApi.folder(folder) as { newFiles: { videoPath: string, imagePath: string | null }[], duplicates: string[] }
    if (newFiles.length === 0 && duplicates.length === 0) return alert('동영상 파일이 없습니다')

    let added = 0
    for (const { videoPath, imagePath } of newFiles) {
      try {
        const parts = videoPath.replace(/\\/g, '/').split('/')
        const fileName = parts[parts.length - 1] ?? ''
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

    const dupMsg = duplicates.length > 0 ? ` (${duplicates.length}개는 이미 등록된 파일)` : ''
    alert(`${added}개 파일 등록 완료${dupMsg}`)
    loadWorks()
  }

  const handleRating = async (id: number, rating: number) => {
    await worksApi.update(id, { rating })
    loadWorks()
    if (selected?.id === id) {
      setSelected({ ...selected, rating })
    }
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
    loadWorks()
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
    loadWorks()
  }

  const exitDeleteMode = () => {
    setDeleteMode(false)
    setSelectedDeleteIds(new Set())
    setDeleteConfirm(false)
  }

  const handleBulkDelete = async () => {
    for (const id of selectedDeleteIds) {
      await worksApi.delete(id)
    }
    setSelected(null)
    exitDeleteMode()
    loadWorks()
  }

  const handleToggleFavorite = async (id: number, current: number, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const next = current ? 0 : 1
    await worksApi.update(id, { is_favorite: next })
    loadWorks()
    if (selected?.id === id) {
      setSelected({ ...selected, is_favorite: next })
    }
  }

  return (
    <div className="h-full flex flex-col">
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
                <option value="created_at">등록일</option>
                <option value="product_number">품번</option>
                <option value="rating">별점</option>
                <option value="release_date">발매일</option>
                <option value="title">타이틀</option>
              </select>
              <button
                onClick={() => setSortDir((d) => { const next = d === 'asc' ? 'desc' : 'asc'; localStorage.setItem('works:sortDir', next); return next })}
                className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-2 py-1.5 rounded"
              >
                {sortDir === 'asc' ? '↑' : '↓'}
              </button>
            </div>
            <div className="w-[38rem] shrink-0 flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5 ml-2">
              <SearchBar type="works" params={search} onChange={setSearch} tags={tags} actors={actorList} studios={studioList} resultCount={works.length} />
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
<button
                onClick={() => setFavoriteOnly((v) => !v)}
                className="bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded text-sm"
              >
                {favoriteOnly ? '♥' : '♡'}
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
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
                onMouseMove={(e) => !deleteMode && setTooltip({ type: 'work', id: w.id, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setTooltip(null)}
                className={`relative cursor-pointer rounded-lg border ring-2 ${
                  deleteMode
                    ? selectedDeleteIds.has(w.id)
                      ? 'border-red-500 ring-red-500'
                      : 'border-gray-700 ring-transparent hover:border-red-400'
                    : selected?.id === w.id
                      ? 'border-blue-500 ring-blue-500'
                      : 'border-gray-700 ring-transparent hover:border-gray-500'
                }`}
              >
                <div className="relative rounded-t-lg overflow-hidden">
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
                <div className="p-2 bg-gray-800">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-sm font-bold text-white truncate flex-1">{w.product_number || '-'}</p>
                    <div className="flex-shrink-0">
                      <Rating value={w.rating} readonly small />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">{w.release_date || '-'}</p>
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
          {works.length === 0 && (
            <p className="text-gray-500 text-center mt-10">등록된 작품이 없습니다</p>
          )}
        </div>
      </div>

      {/* 상세 모달 */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40" onClick={() => setSelected(null)}>
          <div className="bg-gray-800 rounded-lg w-[840px] h-[95vh] flex flex-row relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setSelected(null)}
              className="absolute top-3 right-3 text-gray-400 hover:text-white text-xl leading-none z-10"
            >
              ✕
            </button>

            {/* 좌측 */}
            <div className="flex flex-col flex-1 min-w-0">
              <div className="relative rounded-tl-lg overflow-hidden flex-shrink-0" style={{ aspectRatio: '800 / 540' }}>
                <ImagePreview path={selected.cover_path} alt="표지" className="w-full h-full" version={refreshKey} />
                {(() => {
                  const firstAvailable = selected.files?.find((f) => fileStatuses[f.id])
                  return (
                    <button
                      onClick={async () => {
                        if (!firstAvailable) return alert('파일을 찾을 수 없습니다')
                        if (firstAvailable.type === 'url') {
                          shellApi.openExternal(firstAvailable.file_path)
                        } else {
                          await shellApi.openPath(firstAvailable.file_path)
                        }
                      }}
                      className={`absolute inset-0 m-auto w-14 h-14 rounded-full flex items-center justify-center ${
                        firstAvailable
                          ? 'bg-red-600 hover:bg-red-500 cursor-pointer'
                          : 'bg-gray-600 cursor-not-allowed opacity-50'
                      }`}
                    >
                      <svg viewBox="0 0 24 24" className="w-7 h-7 ml-0.5" fill="white">
                        <polygon points="8,5 20,12 8,19" />
                      </svg>
                    </button>
                  )
                })()}
              </div>
              <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <h3 className="text-white font-bold text-lg">{selected.product_number || '-'}</h3>
                  <button
                    onClick={() => handleToggleFavorite(selected.id, selected.is_favorite)}
                    className={`text-2xl leading-none ml-2 ${selected.is_favorite ? 'text-red-500' : 'text-gray-500 hover:text-red-400'}`}
                  >
                    {selected.is_favorite ? '♥' : '♡'}
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    {selected.studio_name && (
                      <span
                        className="inline-block text-white text-sm px-2 py-0.5 rounded"
                        style={{ backgroundColor: studioColor(selected.studio_name, selected.studio_color) }}
                      >
                        {selected.studio_maker_name && selected.studio_maker_name !== selected.studio_name ? `${selected.studio_maker_name} ${selected.studio_name}` : selected.studio_name}
                      </span>
                    )}
                  </div>
                  <Rating value={selected.rating} onChange={(v) => handleRating(selected.id, v)} />
                </div>
                <p className="text-sm text-gray-400">{selected.release_date || '-'}</p>

                {selected.actors && selected.actors.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">배우</p>
                    <div className="flex flex-wrap gap-1">
                      {[
                        ...(selected.actors.filter((a) => selected.rep_actors?.some((r) => r.id === a.id))),
                        ...(selected.actors.filter((a) => !selected.rep_actors?.some((r) => r.id === a.id))),
                      ].map((a) => {
                        const isRep = selected.rep_actors?.some((r) => r.id === a.id)
                        return (
                          <span
                            key={a.id}
                            onClick={() => onNavigateToActor?.(a.id)}
                            className={`text-xs px-2 py-0.5 rounded cursor-pointer ${
                              isRep
                                ? 'bg-fuchsia-700 text-fuchsia-200 hover:bg-fuchsia-600'
                                : 'bg-purple-900/50 text-purple-300 hover:bg-purple-800/50'
                            }`}
                          >
                            {a.name}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-xs text-gray-500 mb-1">재생 경로</p>
                  <div className="space-y-1">
                    {(selected.files ?? []).map((f) => (
                      <div key={f.id} className="flex items-center gap-2 bg-gray-700/50 rounded px-2 py-1.5">
                        <button
                          onClick={async () => {
                            if (!fileStatuses[f.id]) return
                            if (f.type === 'url') {
                              shellApi.openExternal(f.file_path)
                            } else {
                              await shellApi.openPath(f.file_path)
                            }
                          }}
                          className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                            fileStatuses[f.id] ? 'bg-red-600 hover:bg-red-500' : 'bg-gray-600 opacity-50 cursor-not-allowed'
                          }`}
                        >
                          <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 ml-0.5" fill="white">
                            <polygon points="8,5 20,12 8,19" />
                          </svg>
                        </button>
                        {f.type === 'url' ? (
                          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 flex-shrink-0 text-blue-400" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                        )}
                        <button
                          type="button"
                          title={f.file_path}
                          onClick={() => {
                            if (f.type === 'url') shellApi.openExternal(f.file_path)
                            else if (fileStatuses[f.id]) shellApi.showItemInFolder(f.file_path)
                          }}
                          className={`text-xs flex-1 truncate text-left hover:underline ${
                            fileStatuses[f.id] ? 'text-gray-300 cursor-pointer' : 'text-gray-500 cursor-default'
                          }`}
                        >
                          {f.type === 'url' ? f.file_path : f.file_path.replace(/\\/g, '/').split('/').slice(3).join('/')}
                        </button>
                        {f.type === 'local' && (
                          <span className={`text-xs flex-shrink-0 ${fileStatuses[f.id] ? 'text-green-400' : 'text-red-400'}`}>
                            {fileStatuses[f.id] ? '●' : '✗'}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button onClick={handleEdit} className="bg-gray-600 hover:bg-gray-500 text-white text-sm px-3 py-1.5 rounded flex-1">
                    수정
                  </button>
                  <button onClick={handleDelete} className="bg-red-700 hover:bg-red-600 text-white text-sm px-3 py-1.5 rounded flex-1">
                    삭제
                  </button>
                </div>
                <button
                  onClick={async () => {
                    if (!confirm('파일이 있는 폴더를 휴지통으로 보내시겠습니까?')) return
                    const filePaths = (selected.files ?? []).filter((f) => f.type === 'local').map((f) => f.file_path)
                    const deleted = await shellApi.trashFolders(filePaths)
                    alert(`${deleted}개 폴더를 휴지통으로 이동했습니다`)
                    handleSelect(selected.id)
                  }}
                  className="w-full bg-orange-700 hover:bg-orange-600 text-white text-sm px-3 py-1.5 rounded"
                >
                  폴더 삭제
                </button>
              </div>
            </div>

            {/* 우측 - 타이틀 + 태그 */}
            <div className="w-[330px] border-l border-gray-700 overflow-y-auto [scrollbar-gutter:stable] p-4 space-y-3">
              {selected.comment && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">타이틀</p>
                  <p className="text-sm text-gray-300 whitespace-pre-wrap">{selected.comment}</p>
                </div>
              )}

              {selected.tags && selected.tags.length > 0 && (() => {
                type Group = { catId: number | null; catName: string | null; sortOrder: number; tags: typeof selected.tags }
                const catMap = new Map<number | null, Group>()
                const groups: Group[] = []
                const sorted = [...selected.tags!].sort((a, b) => {
                  const ao = a.category_sort_order ?? 999999
                  const bo = b.category_sort_order ?? 999999
                  if (ao !== bo) return ao - bo
                  const ar = selected.rep_tags?.some((r) => r.id === a.id) ? 0 : 1
                  const br = selected.rep_tags?.some((r) => r.id === b.id) ? 0 : 1
                  if (ar !== br) return ar - br
                  return a.name.localeCompare(b.name)
                })
                for (const tag of sorted) {
                  const key = tag.category_id ?? null
                  if (!catMap.has(key)) {
                    const g: Group = { catId: key, catName: tag.category_name ?? null, sortOrder: tag.category_sort_order ?? 999999, tags: [] }
                    catMap.set(key, g)
                    groups.push(g)
                  }
                  catMap.get(key)!.tags.push(tag)
                }
                return (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">태그</p>
                    <div className="space-y-1">
                      {groups.map((g) => (
                        <div key={g.catId ?? 'none'}>
                          <p className="text-xs text-gray-600 mb-0.5">{g.catName ?? '미분류'}</p>
                          <div className="flex flex-wrap gap-1">
                            {g.tags.map((t) => {
                              const isRep = selected.rep_tags?.some((r) => r.id === t.id)
                              return (
                                <span
                                  key={t.id}
                                  onClick={() => handleToggleRepTag(t.id)}
                                  title={isRep ? '대표 태그 해제' : '대표 태그로 설정'}
                                  className={`text-xs px-2 py-0.5 rounded cursor-pointer ${
                                    isRep ? 'bg-green-600 text-white hover:bg-green-500' : 'bg-blue-600 text-white hover:bg-blue-500'
                                  }`}
                                >
                                  {t.name}
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 flex flex-col gap-4 min-w-[280px]" onClick={(e) => e.stopPropagation()}>
            <p className="text-white">선택된 {selectedDeleteIds.size}개 작품을 삭제하시겠습니까?</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteConfirm(false)} className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded text-sm">취소</button>
              <button onClick={handleBulkDelete} className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded text-sm">삭제</button>
            </div>
          </div>
        </div>
      )}

      {tooltip && <CardTooltip tooltip={tooltip} />}

      {showForm && (
        <WorkForm
          work={editWork}
          onSave={() => { setShowForm(false); loadWorks(); setRefreshKey((k) => k + 1); if (selected) handleSelect(selected.id) }}
          onCancel={() => setShowForm(false)}
        />
      )}

    </div>
  )
}
