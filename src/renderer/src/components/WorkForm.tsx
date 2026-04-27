import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { Work, Tag, Actor, Studio } from '../types'
import { worksApi, workTagsApi, actorsApi, studiosApi, dialogApi, imageApi, shellApi } from '../api'
import Rating from './Rating'
import TagSelector from './TagSelector'
import ImagePreview from './ImagePreview'
import DateInput from './DateInput'

interface Props {
  work?: Work & { actors?: Actor[]; tags?: Tag[] }
  onSave: () => void
  onCancel: () => void
}

type FileEntry = { path: string; type: 'local' | 'url' }

export default function WorkForm({ work, onSave, onCancel }: Props) {
  const [comment, setComment] = useState(work?.comment || '')
  const [fileEntries, setFileEntries] = useState<FileEntry[]>(
    work?.files?.map((f) => ({ path: f.file_path, type: f.type || 'local' })) ??
    (work?.file_path ? [{ path: work.file_path, type: 'local' }] : [])
  )
  const [coverPath, setCoverPath] = useState(work?.cover_path || '')
  const [productNumber, setProductNumber] = useState(work?.product_number || '')
  const [releaseDate, setReleaseDate] = useState(work?.release_date || '')
  const [rating, setRating] = useState(work?.rating || 0)
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>(work?.tags?.map((t) => t.id) || [])
  const [repTagIds, setRepTagIds] = useState<number[]>(work?.rep_tags?.map((t) => t.id) || [])
  const [selectedActorIds, setSelectedActorIds] = useState<number[]>(work?.actors?.map((a) => a.id) || [])
  const [repActorIds, setRepActorIds] = useState<number[]>(work?.rep_actors?.map((a) => a.id) || [])
  const [fileStatuses, setFileStatuses] = useState<Record<string, boolean>>({})
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [allActors, setAllActors] = useState<Actor[]>([])
  const [allStudios, setAllStudios] = useState<Studio[]>([])
  const [studioId, setStudioId] = useState<number | null>(() => {
    if (work?.studio_id != null) return work.studio_id
    const saved = localStorage.getItem('workform:lastStudioId')
    return saved ? Number(saved) : null
  })
  const [actorOpen, setActorOpen] = useState(false)
  const [newActor, setNewActor] = useState('')
  const [urlInputOpen, setUrlInputOpen] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [labelAddMode, setLabelAddMode] = useState(false)
  const [newLabelName, setNewLabelName] = useState('')
  const [studioDropOpen, setStudioDropOpen] = useState(false)
  const studioDropRef = useRef<HTMLDivElement>(null)
  const studioTriggerRef = useRef<HTMLButtonElement>(null)
  const [studioDropRect, setStudioDropRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const [studioSortBy, setStudioSortBy] = useState<'name' | 'id'>(
    (localStorage.getItem('workform:studioSortBy') as 'name' | 'id') || 'id'
  )
  const [studioSortDir, setStudioSortDir] = useState<'asc' | 'desc'>(
    (localStorage.getItem('workform:studioSortDir') as 'asc' | 'desc') || 'asc'
  )

  const sortedStudios = useMemo(() => [...allStudios].sort((a, b) => {
    const dir = studioSortDir === 'asc' ? 1 : -1
    if (studioSortBy === 'name') return a.name.localeCompare(b.name, 'en-US') * dir
    return (a.id - b.id) * dir
  }), [allStudios, studioSortBy, studioSortDir])

  const handleStudioDropClose = useCallback(() => setStudioDropOpen(false), [])
  useEffect(() => {
    if (!studioDropOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        studioDropRef.current && !studioDropRef.current.contains(target) &&
        studioTriggerRef.current && !studioTriggerRef.current.contains(target)
      ) {
        handleStudioDropClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [studioDropOpen, handleStudioDropClose])

  useEffect(() => {
    workTagsApi.list().then((t) => setAllTags(t as Tag[]))
    actorsApi.list().then((a) => setAllActors(a as Actor[]))
    studiosApi.list().then((s) => setAllStudios(s as Studio[]))
  }, [])

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      const statuses: Record<string, boolean> = {}
      for (const entry of fileEntries) {
        if (entry.type === 'url') {
          statuses[entry.path] = true
        } else {
          statuses[entry.path] = await shellApi.fileExists(entry.path)
        }
      }
      if (!cancelled) setFileStatuses(statuses)
    }
    check()
    return () => { cancelled = true }
  }, [fileEntries])

  const handleSelectFiles = async () => {
    const paths = await dialogApi.openFiles() as string[]
    if (paths.length > 0) {
      setFileEntries((prev) => [
        ...prev,
        ...paths
          .filter((p) => !prev.some((e) => e.path === p))
          .map((p) => ({ path: p, type: 'local' as const }))
      ])
    }
  }

  const handleAddUrl = () => {
    const url = urlInput.trim()
    if (!url) return
    if (!url.startsWith('http://') && !url.startsWith('https://')) return alert('URL은 http:// 또는 https://로 시작해야 합니다')
    if (fileEntries.some((e) => e.path === url)) return
    setFileEntries((prev) => [...prev, { path: url, type: 'url' }])
    setUrlInput('')
    setUrlInputOpen(false)
  }

  const handleRemoveFile = (index: number) => {
    setFileEntries((prev) => prev.filter((_, i) => i !== index))
  }

  const handlePlay = (entry: FileEntry) => {
    if (entry.type === 'url') {
      shellApi.openExternal(entry.path)
    } else if (fileStatuses[entry.path]) {
      shellApi.openPath(entry.path)
    }
  }

  const handleSelectCover = async () => {
    const path = await dialogApi.openImage() as string | null
    if (path) setCoverPath(path)
  }

  const handleSaveRef = useRef(handleSave)
  handleSaveRef.current = handleSave

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSaveRef.current()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  async function handleSave() {
    if (fileEntries.length === 0) return alert('파일 경로 또는 URL을 추가하세요')

    if (work) {
      await worksApi.update(work.id, {
        file_entries: fileEntries,
        cover_path: coverPath || undefined,
        product_number: productNumber.trim() || undefined,
        release_date: releaseDate || undefined,
        rating,
        comment: comment.trim() || null,
        studio_id: studioId,
        actor_ids: selectedActorIds,
        rep_actor_ids: repActorIds,
        tag_ids: selectedTagIds,
        rep_tag_ids: repTagIds,
      })
      if (coverPath && coverPath !== work.cover_path) {
        const newPath = await imageApi.copy(coverPath, 'works', work.id) as string
        await worksApi.update(work.id, { cover_path: newPath })
      }
    } else {
      const id = await worksApi.create({
        file_entries: fileEntries,
        cover_path: coverPath || undefined,
        product_number: productNumber.trim() || undefined,
        release_date: releaseDate || undefined,
        rating,
        comment: comment.trim() || null,
        studio_id: studioId,
        actor_ids: selectedActorIds,
        rep_actor_ids: repActorIds,
        tag_ids: selectedTagIds,
        rep_tag_ids: repTagIds,
      }) as number
      if (coverPath) {
        const newPath = await imageApi.copy(coverPath, 'works', id) as string
        await worksApi.update(id, { cover_path: newPath })
      }
    }

    onSave()
  }

  const handleCreateLabel = async () => {
    const name = newLabelName.trim()
    if (!name) return
    const id = await studiosApi.create(name) as number
    const updated = await studiosApi.list() as Studio[]
    setAllStudios(updated)
    setStudioId(id)
    setNewLabelName('')
    setLabelAddMode(false)
  }

  const handleCreateTag = async (name: string): Promise<number> => {
    const id = await workTagsApi.create(name) as number
    const tags = await workTagsApi.list() as Tag[]
    setAllTags(tags)
    return id
  }

  const toggleActor = (id: number) => {
    if (selectedActorIds.includes(id)) {
      const nextSelected = selectedActorIds.filter((a) => a !== id)
      const nextRep = repActorIds.filter((a) => a !== id)
      setSelectedActorIds(nextSelected)
      // 대표 배우가 제거된 경우 남은 첫 번째 배우를 자동 대표로
      if (repActorIds.includes(id) && nextSelected.length > 0) {
        setRepActorIds([nextSelected[0]])
      } else {
        setRepActorIds(nextRep)
      }
    } else {
      setSelectedActorIds((prev) => [...prev, id])
      // 대표 배우가 없으면 자동 대표로
      if (repActorIds.length === 0) setRepActorIds([id])
    }
  }

  const toggleRepActor = (id: number) => {
    setRepActorIds((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    )
  }

  const handleAddActor = async () => {
    const name = newActor.trim()
    if (!name) return
    const existing = allActors.find((a) => a.name === name)
    if (existing) {
      if (!selectedActorIds.includes(existing.id)) {
        setSelectedActorIds((prev) => [...prev, existing.id])
        if (repActorIds.length === 0) setRepActorIds([existing.id])
      }
    } else {
      const id = await actorsApi.create({ name, scores: { face: 5, bust: 5, hip: 5, physical: 5, skin: 5, acting: 5, sexy: 5, charm: 5, technique: 5, proportions: 5 } }) as number
      const updated = await actorsApi.list() as Actor[]
      setAllActors(updated)
      setSelectedActorIds((prev) => [...prev, id])
      if (repActorIds.length === 0) setRepActorIds([id])
    }
    setNewActor('')
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg w-[600px] h-[95vh] flex flex-col relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl leading-none"
        >
          ✕
        </button>
        <div className="flex-shrink-0 px-6 pt-6 pb-3 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">
            {work ? '작품 수정' : '작품 등록'}
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-6 py-4 space-y-3">
          <div>
            <label className="text-sm text-gray-400 block mb-1">재생 경로</label>
            <div className="space-y-1">
              {fileEntries.map((entry, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-700/50 rounded px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => handlePlay(entry)}
                    className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                      fileStatuses[entry.path] ? 'bg-red-600 hover:bg-red-500' : 'bg-gray-600 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 ml-0.5" fill="white">
                      <polygon points="8,5 20,12 8,19" />
                    </svg>
                  </button>
                  {entry.type === 'url' ? (
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
                    title={entry.path}
                    onClick={() => {
                      if (entry.type === 'url') shellApi.openExternal(entry.path)
                      else if (fileStatuses[entry.path]) shellApi.showItemInFolder(entry.path)
                    }}
                    className={`text-xs flex-1 truncate text-left hover:underline ${
                      fileStatuses[entry.path] ? 'text-gray-300 cursor-pointer' : 'text-gray-500 cursor-default'
                    }`}
                  >
                    {entry.type === 'url' ? entry.path : entry.path.replace(/^[A-Za-z]:[/\\]/, '')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(i)}
                    className="text-gray-500 hover:text-red-400 text-xs flex-shrink-0"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {urlInputOpen && (
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddUrl(); if (e.key === 'Escape') { setUrlInputOpen(false); setUrlInput('') } }}
                    placeholder="https://..."
                    autoFocus
                    className="bg-gray-700 text-white text-xs px-2 py-1.5 rounded flex-1"
                  />
                  <button
                    type="button"
                    onClick={handleAddUrl}
                    className="bg-blue-700 hover:bg-blue-600 text-white text-xs px-2 py-1.5 rounded"
                  >
                    추가
                  </button>
                  <button
                    type="button"
                    onClick={() => { setUrlInputOpen(false); setUrlInput('') }}
                    className="text-gray-500 hover:text-gray-300 text-xs px-1.5"
                  >
                    ✕
                  </button>
                </div>
              )}
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={handleSelectFiles}
                  className="flex-1 text-xs text-gray-400 hover:text-gray-200 bg-gray-700/30 hover:bg-gray-700/60 rounded px-2 py-1.5 text-left"
                >
                  + 파일 추가
                </button>
                <button
                  type="button"
                  onClick={() => { setUrlInputOpen(true); setUrlInput('') }}
                  className="flex-1 text-xs text-blue-400 hover:text-blue-200 bg-gray-700/30 hover:bg-gray-700/60 rounded px-2 py-1.5 text-left"
                >
                  + URL 추가
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-400 block mb-1">표지</label>
            <div className="flex gap-3 items-start">
              <ImagePreview path={coverPath} alt="표지" className="w-24 h-32 rounded" />
              <button onClick={handleSelectCover} className="bg-gray-600 hover:bg-gray-500 text-white text-sm px-3 py-1.5 rounded">
                이미지 선택
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm text-gray-400 block mb-1">품번</label>
              <input
                value={productNumber}
                onChange={(e) => setProductNumber(e.target.value)}
                className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-full"
              />
            </div>
            <div>
              <label className="text-sm text-gray-400 block mb-1">발매일</label>
              <DateInput
                value={releaseDate}
                onChange={setReleaseDate}
                className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-full"
              />
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-sm text-gray-400">레이블</span>
                <button
                  type="button"
                  onClick={() => { setLabelAddMode(true); setNewLabelName('') }}
                  className="text-white font-black text-base leading-none hover:text-gray-300"
                >
                  +
                </button>
                {(['name', 'id'] as const).map((s) => {
                  const isActive = studioSortBy === s
                  const label = s === 'name' ? '이름' : '등록'
                  const handleClick = () => {
                    if (isActive) {
                      const next = studioSortDir === 'asc' ? 'desc' : 'asc'
                      setStudioSortDir(next)
                      localStorage.setItem('workform:studioSortDir', next)
                    } else {
                      setStudioSortBy(s)
                      setStudioSortDir('asc')
                      localStorage.setItem('workform:studioSortBy', s)
                      localStorage.setItem('workform:studioSortDir', 'asc')
                    }
                  }
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={handleClick}
                      className={`px-1.5 py-0.5 rounded text-xs ${isActive ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                    >
                      {label}{isActive ? (studioSortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                    </button>
                  )
                })}
              </div>
              {labelAddMode ? (
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateLabel()
                      if (e.key === 'Escape') { setLabelAddMode(false); setNewLabelName('') }
                    }}
                    placeholder="레이블 이름"
                    autoFocus
                    className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded flex-1 min-w-0"
                  />
                  <button
                    type="button"
                    onClick={handleCreateLabel}
                    className="bg-green-600 hover:bg-green-500 text-white text-xs px-2 py-1.5 rounded"
                  >
                    S
                  </button>
                  <button
                    type="button"
                    onClick={() => { setLabelAddMode(false); setNewLabelName('') }}
                    className="bg-red-600 hover:bg-red-500 text-white text-xs px-2 py-1.5 rounded"
                  >
                    X
                  </button>
                </div>
              ) : (
                <div className="relative w-full">
                  <button
                    ref={studioTriggerRef}
                    type="button"
                    onClick={() => {
                      if (studioTriggerRef.current) {
                        const r = studioTriggerRef.current.getBoundingClientRect()
                        setStudioDropRect({ top: r.bottom + 2, left: r.left, width: r.width })
                      }
                      setStudioDropOpen((v) => !v)
                    }}
                    className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-full text-left flex items-center justify-between"
                  >
                    <span className="truncate">{allStudios.find((s) => s.id === studioId)?.name ?? '없음'}</span>
                    <span className="text-gray-400 text-xs ml-1">▼</span>
                  </button>
                  {studioDropOpen && studioDropRect && (
                    <div
                      ref={studioDropRef}
                      className="fixed z-50 bg-gray-800 rounded shadow-lg overflow-y-scroll"
                      style={{
                        top: studioDropRect.top,
                        left: studioDropRect.left,
                        width: studioDropRect.width,
                        maxHeight: `calc(95vh - ${studioDropRect.top}px - 8px)`,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => { setStudioId(null); localStorage.removeItem('workform:lastStudioId'); setStudioDropOpen(false) }}
                        className={`w-full text-left px-2 py-1.5 text-sm hover:bg-gray-700 ${studioId === null ? 'text-white font-bold' : 'text-gray-300'}`}
                      >
                        없음
                      </button>
                      {sortedStudios.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => { setStudioId(s.id); localStorage.setItem('workform:lastStudioId', String(s.id)); setStudioDropOpen(false) }}
                          className={`w-full text-left px-2 py-1.5 text-sm hover:bg-gray-700 ${studioId === s.id ? 'text-white font-bold' : 'text-gray-300'}`}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-400 block mb-1">별점</label>
            <Rating value={rating} onChange={setRating} />
          </div>

          <div>
            <label className="text-sm text-gray-400 block mb-1">코멘트</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-full resize-none"
            />
          </div>

          <div>
            <TagSelector
              allTags={allTags}
              selectedIds={selectedTagIds}
              onChange={setSelectedTagIds}
              onCreateTag={handleCreateTag}
              repTagIds={repTagIds}
              onChangeRep={setRepTagIds}
            />
          </div>

          <div>
            {/* 헤더 */}
            <button
              type="button"
              onClick={() => setActorOpen((v) => !v)}
              className="flex items-center gap-1.5 mb-1.5 cursor-pointer"
            >
              <span className="text-sm text-gray-400 hover:text-gray-200">배우</span>
              <span className="text-white font-black text-base leading-none hover:text-gray-300">
                {actorOpen ? '−' : '+'}
              </span>
            </button>
            {/* 선택된 배우 칩 - 클릭 시 대표 배우 토글 */}
            {selectedActorIds.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {allActors.filter((a) => selectedActorIds.includes(a.id)).map((a) => {
                  const isRep = repActorIds.includes(a.id)
                  return (
                    <span
                      key={a.id}
                      onClick={() => toggleRepActor(a.id)}
                      title={isRep ? '대표 배우 해제' : '대표 배우로 설정'}
                      className={`text-xs px-2 py-0.5 rounded cursor-pointer ${
                        isRep ? 'bg-fuchsia-700 text-fuchsia-200' : 'bg-purple-900/60 text-purple-300'
                      }`}
                    >
                      {a.name}
                    </span>
                  )
                })}
              </div>
            )}
            {/* 펼쳐지는 전체 목록 */}
            {actorOpen && (
              <div className="border border-gray-700 rounded-lg p-2 space-y-2">
                {/* 새 배우 입력 - 박스 최상단 */}
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={newActor}
                    onChange={(e) => setNewActor(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddActor()}
                    placeholder="새 배우 이름 (이미 있으면 선택됨)"
                    className="bg-gray-700 text-white text-sm px-2 py-1 rounded flex-1"
                  />
                  <button
                    type="button"
                    onClick={handleAddActor}
                    className="bg-gray-600 hover:bg-gray-500 text-white text-sm px-2 py-1 rounded"
                  >
                    추가
                  </button>
                </div>
                <div className="border-t border-gray-700" />
                <div className="flex flex-wrap gap-1.5">
                  {allActors.map((actor) => {
                    const isRep = repActorIds.includes(actor.id)
                    return (<button
                      key={actor.id}
                      type="button"
                      onClick={() => toggleActor(actor.id)}
                      className={`px-2 py-0.5 rounded text-sm ${
                        isRep
                          ? 'bg-fuchsia-600 text-white'
                          : selectedActorIds.includes(actor.id)
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {actor.name}
                    </button>)
                  })}
                  {allActors.length === 0 && (
                    <span className="text-sm text-gray-500">등록된 배우가 없습니다</span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2 pb-2">
            <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded">
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
