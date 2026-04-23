import { useState, useEffect, useCallback } from 'react'
import type { Work, Tag, Actor } from '../types'
import { worksApi, workTagsApi, actorsApi, dialogApi, scanApi, shellApi } from '../api'
import SearchBar, { type WorkSearchParams } from '../components/SearchBar'
import WorkForm from '../components/WorkForm'
import ImagePreview from '../components/ImagePreview'
import Rating from '../components/Rating'
import TagManager from '../components/TagManager'
import StudioManager from '../components/StudioManager'

function hashColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return `hsl(${Math.abs(hash) % 360}, 65%, 45%)`
}

function studioColor(name: string, color?: string | null): string {
  return color || hashColor(name)
}

interface WorksProps {
  navigateToId?: number | null
  onNavigateConsumed?: () => void
  onNavigateToActor?: (id: number) => void
}

export default function Works({ navigateToId, onNavigateConsumed, onNavigateToActor }: WorksProps) {
  const [works, setWorks] = useState<Work[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [actorList, setActorList] = useState<Actor[]>([])
  const [selected, setSelected] = useState<(Work & { actors?: Actor[]; tags?: Tag[] }) | null>(null)
  const [fileStatuses, setFileStatuses] = useState<Record<number, boolean>>({})
  const [showForm, setShowForm] = useState(false)
  const [showTagManager, setShowTagManager] = useState(false)
  const [showStudioManager, setShowStudioManager] = useState(false)
  const [favoriteOnly, setFavoriteOnly] = useState(false)
  const [editWork, setEditWork] = useState<(Work & { actors?: Actor[]; tags?: Tag[] }) | undefined>(undefined)
  const [search, setSearch] = useState<WorkSearchParams>(() => {
    try {
      const saved = localStorage.getItem('works:search')
      return saved ? JSON.parse(saved) : { keyword: '', tagIds: [], tagMode: 'and', releaseDateFrom: '', releaseDateTo: '', ratingFrom: '', ratingTo: '', actorId: '' }
    } catch {
      return { keyword: '', tagIds: [], tagMode: 'and', releaseDateFrom: '', releaseDateTo: '', ratingFrom: '', ratingTo: '', actorId: '' }
    }
  })
  const [sortBy, setSortBy] = useState<'product_number' | 'rating' | 'release_date' | 'created_at'>(
    (localStorage.getItem('works:sortBy') as 'product_number' | 'rating' | 'release_date' | 'created_at') || 'release_date'
  )
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(
    (localStorage.getItem('works:sortDir') as 'asc' | 'desc') || 'desc'
  )

  const loadWorks = useCallback(async () => {
    const params: Record<string, unknown> = {}
    if (search.keyword) params.keyword = search.keyword
    if (search.tagIds.length) { params.tagIds = search.tagIds; params.tagMode = search.tagMode }
    if (search.releaseDateFrom) params.releaseDateFrom = search.releaseDateFrom
    if (search.releaseDateTo) params.releaseDateTo = search.releaseDateTo
    if (search.ratingFrom) params.ratingFrom = Number(search.ratingFrom)
    if (search.ratingTo) params.ratingTo = Number(search.ratingTo)
    if (search.actorId) params.actorId = Number(search.actorId)
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
  useEffect(() => { loadTags(); loadActorList() }, [])
  useEffect(() => { localStorage.setItem('works:search', JSON.stringify(search)) }, [search])

  useEffect(() => {
    if (navigateToId != null) {
      handleSelect(navigateToId)
      onNavigateConsumed?.()
    }
  }, [navigateToId])

  const handleSelect = async (id: number) => {
    const detail = await worksApi.get(id) as Work & { actors?: Actor[]; tags?: Tag[] }
    setSelected(detail)
    const statuses: Record<number, boolean> = {}
    for (const f of detail.files ?? []) {
      statuses[f.id] = f.type === 'url' ? true : await shellApi.fileExists(f.file_path)
    }
    setFileStatuses(statuses)
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
    const files = await scanApi.folder(folder) as string[]
    if (files.length === 0) return alert('동영상 파일이 없습니다')

    let added = 0
    for (const file of files) {
      try {
        await worksApi.create({ file_path: file })
        added++
      } catch {
        // 중복 등 무시
      }
    }
    alert(`${added}개 파일 등록 완료`)
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
        <div className="p-4 space-y-3">
          <div className="flex gap-2">
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
              onClick={() => setShowTagManager(true)}
              className="bg-gray-600 hover:bg-gray-500 text-white px-3 py-1.5 rounded text-sm"
            >
              태그 관리
            </button>
            <button
              onClick={() => setShowStudioManager(true)}
              className="bg-gray-600 hover:bg-gray-500 text-white px-3 py-1.5 rounded text-sm"
            >
              레이블 관리
            </button>
            <button
              onClick={() => setFavoriteOnly((v) => !v)}
              className={`px-3 py-1.5 rounded text-sm ${favoriteOnly ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-gray-600 hover:bg-gray-500 text-white'}`}
            >
              {favoriteOnly ? '♥' : '♡'}
            </button>
          </div>
          <SearchBar type="works" params={search} onChange={setSearch} tags={tags} actors={actorList} />
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={(e) => { const v = e.target.value as typeof sortBy; setSortBy(v); localStorage.setItem('works:sortBy', v) }}
              className="bg-gray-700 text-white text-sm px-2 py-1 rounded"
            >
              <option value="created_at">등록일</option>
              <option value="product_number">품번</option>
              <option value="rating">별점</option>
              <option value="release_date">발매일</option>
            </select>
            <button
              onClick={() => setSortDir((d) => { const next = d === 'asc' ? 'desc' : 'asc'; localStorage.setItem('works:sortDir', next); return next })}
              className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-2 py-1 rounded"
            >
              {sortDir === 'asc' ? '↑ 오름차순' : '↓ 내림차순'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pt-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {works.map((w) => (
              <div
                key={w.id}
                onClick={() => handleSelect(w.id)}
                className={`cursor-pointer rounded-lg overflow-hidden border ring-2 ${
                  selected?.id === w.id
                    ? 'border-blue-500 ring-blue-500'
                    : 'border-gray-700 ring-transparent hover:border-gray-500'
                }`}
              >
                <div className="relative">
                  <ImagePreview path={w.cover_path} alt={w.title || '표지'} className="w-full h-40" />
                  {w.studio_name && (
                    <span
                      className="absolute top-1 left-1 text-white text-xs px-1.5 py-0.5 rounded leading-tight max-w-[70%] truncate"
                      style={{ backgroundColor: studioColor(w.studio_name, w.studio_color) }}
                    >
                      {w.studio_name}
                    </span>
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
          <div className="bg-gray-800 rounded-lg w-[560px] h-[95vh] flex flex-col relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setSelected(null)}
              className="absolute top-3 right-3 text-gray-400 hover:text-white text-xl leading-none z-10"
            >
              ✕
            </button>
            <div className="relative rounded-t-lg overflow-hidden flex-shrink-0" style={{ aspectRatio: '800 / 540' }}>
              <ImagePreview path={selected.cover_path} alt="표지" className="w-full h-full" />
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
              {selected.studio_name && (
                <p className="text-sm font-medium" style={{ color: studioColor(selected.studio_name, selected.studio_color) }}>{selected.studio_name}</p>
              )}
              <p className="text-sm text-gray-400">{selected.release_date || '-'}</p>
              <Rating value={selected.rating} onChange={(v) => handleRating(selected.id, v)} />

              {selected.comment && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">한줄평</p>
                  <p className="text-sm text-gray-300 whitespace-pre-wrap">{selected.comment}</p>
                </div>
              )}

              {selected.actors && selected.actors.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">배우</p>
                  <div className="flex flex-wrap gap-1">
                    {selected.actors.map((a) => (
                      <span
                        key={a.id}
                        onClick={() => onNavigateToActor?.(a.id)}
                        className="bg-purple-900/50 text-purple-300 text-xs px-2 py-0.5 rounded cursor-pointer hover:bg-purple-800/50"
                      >
                        {a.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selected.tags && selected.tags.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">태그</p>
                  <div className="flex flex-wrap gap-1">
                    {[
                      ...(selected.tags.filter((t) => selected.rep_tags?.some((r) => r.id === t.id))),
                      ...(selected.tags.filter((t) => !selected.rep_tags?.some((r) => r.id === t.id))),
                    ].map((t) => {
                      const isRep = selected.rep_tags?.some((r) => r.id === t.id)
                      return (
                        <span
                          key={t.id}
                          onClick={() => handleToggleRepTag(t.id)}
                          title={isRep ? '대표 태그 해제' : '대표 태그로 설정'}
                          className={`text-xs px-2 py-0.5 rounded cursor-pointer ${
                            isRep ? 'bg-green-700 text-green-200 hover:bg-green-600' : 'bg-blue-900/50 text-blue-300 hover:bg-blue-800/60'
                          }`}
                        >
                          {t.name}
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
                      <span
                        className="text-xs flex-1 truncate text-gray-300"
                        title={f.file_path}
                      >
                        {f.type === 'url' ? f.file_path : f.file_path.split(/[\\/]/).pop()}
                      </span>
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
                  if (!confirm('영상 파일과 이미지 파일을 디스크에서 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) return
                  const filePaths = (selected.files ?? []).map((f) => f.file_path)
                  const paths = [...filePaths, selected.cover_path].filter(Boolean) as string[]
                  const deleted = await shellApi.deleteFiles(paths)
                  alert(`${deleted}개 파일 삭제 완료`)
                  handleSelect(selected.id)
                }}
                className="w-full bg-orange-700 hover:bg-orange-600 text-white text-sm px-3 py-1.5 rounded"
              >
                파일 삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <WorkForm
          work={editWork}
          onSave={() => { setShowForm(false); loadWorks(); if (selected) handleSelect(selected.id) }}
          onCancel={() => setShowForm(false)}
        />
      )}
      {showTagManager && (
        <TagManager onClose={() => { setShowTagManager(false); loadTags(); loadWorks() }} />
      )}
      {showStudioManager && (
        <StudioManager onClose={() => { setShowStudioManager(false); loadWorks() }} />
      )}
    </div>
  )
}
