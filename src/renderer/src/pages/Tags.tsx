import { useState, useEffect, useMemo } from 'react'
import type { Work, Actor } from '../types'
import { workTagsApi, actorTagsApi, worksApi, actorsApi } from '../api'
import ImagePreview from '../components/ImagePreview'
import Rating from '../components/Rating'
import WorkViewModal from '../components/WorkViewModal'
import ActorViewModal from '../components/ActorViewModal'
import TagCategoryManager from '../components/TagManager'

interface Props {
  onNavigateToWork: (id: number) => void
  onNavigateToActor: (id: number) => void
  onEditWork?: (id: number) => void
  onEditActor?: (id: number) => void
}

interface TagItem {
  id: number
  name: string
  total_count: number
  rep_count: number
  created_at: string
  category_id: number | null
  category_name: string | null
  category_sort_order: number | null
}

type SortBy = 'name' | 'total_count' | 'created_at'

function WorkCard({ work, onClick }: { work: Work & { rep_tags?: { id: number; name: string }[] }; onClick: () => void }) {
  return (
    <div onClick={onClick} className="cursor-pointer rounded-lg overflow-hidden border border-gray-700 hover:border-gray-500">
      <ImagePreview path={work.cover_path} alt={work.title || '표지'} className="w-full h-40" />
      <div className="p-2 bg-gray-800">
        <div className="flex items-center justify-between gap-1">
          <p className="text-sm font-bold text-white truncate flex-1">{work.product_number || '-'}</p>
          <div className="shrink-0"><Rating value={work.rating} readonly small /></div>
        </div>
        <p className="text-xs text-gray-500">{work.release_date || '-'}</p>
      </div>
    </div>
  )
}

function ActorListCard({ actor, onClick }: { actor: Actor & { avg_score?: number; work_count?: number }; onClick: () => void }) {
  const age = actor.birthday
    ? `${Math.floor((Date.now() - new Date(actor.birthday).getTime()) / (365.25 * 24 * 60 * 60 * 1000))}세`
    : '-'
  return (
    <div onClick={onClick} className="cursor-pointer rounded-lg overflow-hidden border border-gray-700 hover:border-gray-500">
      <ImagePreview path={actor.photo_path} alt={actor.name} className="w-full h-40" />
      <div className="p-2 bg-gray-800">
        <div className="flex items-center justify-between gap-1">
          <p className="text-sm font-bold text-white truncate flex-1">{actor.name}</p>
          <p className="text-sm font-bold text-yellow-400 shrink-0">{(actor.avg_score ?? 0).toFixed(2)}점</p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-400">{actor.birthday || '-'} ({age})</p>
          <p className="text-xs text-gray-400">총{actor.work_count ?? 0}편</p>
        </div>
      </div>
    </div>
  )
}

function TagPanel({
  type,
  tags,
  onRefresh,
  onCreate,
  onUpdate,
  onDelete,
  onTagClick,
}: {
  type: 'works' | 'actors'
  tags: TagItem[]
  onRefresh: () => void
  onCreate: (name: string) => Promise<void>
  onUpdate: (id: number, name: string) => Promise<void>
  onDelete: (id: number) => Promise<void>
  onTagClick: (id: number, name: string) => void
}) {
  const title = type === 'works' ? '작품 태그' : '배우 태그'
  const [search, setSearch] = useState(() => localStorage.getItem(`tags:${title}:search`) ?? '')
  const [sortBy, setSortBy] = useState<SortBy>(() => (localStorage.getItem(`tags:${title}:sortBy`) as SortBy) ?? 'name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => (localStorage.getItem(`tags:${title}:sortDir`) as 'asc' | 'desc') ?? 'asc')
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [showCategoryManager, setShowCategoryManager] = useState(false)

  const handleSearchChange = (v: string) => { setSearch(v); localStorage.setItem(`tags:${title}:search`, v) }
  const handleSortByChange = (s: SortBy) => { setSortBy(s); localStorage.setItem(`tags:${title}:sortBy`, s) }
  const handleSortDirToggle = () => {
    const next = sortDir === 'asc' ? 'desc' : 'asc'
    setSortDir(next)
    localStorage.setItem(`tags:${title}:sortDir`, next)
  }

  const toggleCollapse = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  // 카테고리별 그룹핑
  const displayGroups = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1

    // 카테고리 목록 수집 (sort_order 기준)
    const catMap = new Map<string, { catId: number | null; name: string | null; sort_order: number; tags: TagItem[] }>()

    for (const tag of tags) {
      const key = tag.category_id != null ? String(tag.category_id) : '__uncategorized__'
      if (!catMap.has(key)) {
        catMap.set(key, {
          catId: tag.category_id ?? null,
          name: tag.category_name ?? null,
          sort_order: tag.category_sort_order ?? 999999,
          tags: [],
        })
      }
      catMap.get(key)!.tags.push(tag)
    }

    // 미분류 없으면 추가
    if (!catMap.has('__uncategorized__')) {
      catMap.set('__uncategorized__', { catId: null, name: null, sort_order: 999999, tags: [] })
    }

    return [...catMap.values()]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(group => ({
        ...group,
        tags: (() => {
          let result = group.tags.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
          if (sortBy === 'name') result = [...result].sort((a, b) => a.name.localeCompare(b.name, 'en-US') * dir)
          if (sortBy === 'total_count') result = [...result].sort((a, b) => (a.total_count - b.total_count) * dir)
          if (sortBy === 'created_at') result = [...result].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') * dir)
          return result
        })(),
      }))
  }, [tags, search, sortBy, sortDir])

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    await onCreate(name)
    setNewName('')
    onRefresh()
  }

  const handleUpdate = async (id: number) => {
    const name = editValue.trim()
    if (!name) return
    await onUpdate(id, name)
    setEditingId(null)
    onRefresh()
  }

  const handleDelete = async (id: number) => {
    await onDelete(id)
    setDeletingId(null)
    onRefresh()
  }

  const accentBtn = type === 'works' ? 'bg-green-700 hover:bg-green-600 text-white' : 'bg-purple-700 hover:bg-purple-600 text-white'

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-white font-bold text-base">{title}</h2>
          <span className="text-xs text-gray-500">{tags.length}개</span>
        </div>
        <button
          onClick={() => setShowCategoryManager(true)}
          className={`text-xs px-2.5 py-1 rounded ${accentBtn}`}
        >
          카테고리 관리
        </button>
      </div>

      {/* 툴바 */}
      <div className="flex gap-2 mb-3">
        <div className="flex gap-1 min-w-0" style={{ flex: '3 1 0' }}>
          <select
            value={sortBy}
            onChange={(e) => handleSortByChange(e.target.value as SortBy)}
            className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded shrink-0"
          >
            <option value="name">이름</option>
            <option value="total_count">참조</option>
            <option value="created_at">최신</option>
          </select>
          <button
            onClick={handleSortDirToggle}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-2 py-1.5 rounded shrink-0"
          >
            {sortDir === 'asc' ? '↑' : '↓'}
          </button>
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="태그 검색"
            className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={() => handleSearchChange('')}
            className="px-3 py-1.5 rounded text-sm bg-gray-600 hover:bg-gray-500 text-gray-300 shrink-0"
          >
            초기화
          </button>
        </div>
        <div className="flex gap-1 min-w-0" style={{ flex: '2 1 0' }}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
            placeholder="새 태그명 입력..."
            className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <button onClick={handleCreate} className="px-3 py-1.5 rounded text-xs bg-blue-600 text-white hover:bg-blue-500 shrink-0">추가</button>
        </div>
      </div>

      {/* 카테고리별 태그 목록 */}
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] space-y-3">
        {displayGroups.map(group => {
          const key = group.catId != null ? String(group.catId) : '__uncategorized__'
          const isCollapsed = collapsed.has(key)
          const label = group.name ?? '미분류'
          const count = group.tags.length

          return (
            <div key={key}>
              {/* 카테고리 헤더 */}
              <button
                type="button"
                onClick={() => toggleCollapse(key)}
                className="flex items-center gap-2 w-full mb-1.5 group"
              >
                <span className="text-gray-300 text-xs font-bold">{label}</span>
                <span className="text-gray-400 text-xs font-bold">{isCollapsed ? '+' : '−'}</span>
                <span className="text-gray-600 text-xs">({count})</span>
                <span className="flex-1 border-t border-gray-700 ml-1" />
              </button>

              {/* 태그 칩 */}
              {!isCollapsed && (
                <div className="flex flex-wrap gap-2">
                  {group.tags.map(tag => {
                    if (editingId === tag.id) return (
                      <div key={tag.id} className="flex gap-1 items-center">
                        <input
                          type="text" value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleUpdate(tag.id); if (e.key === 'Escape') setEditingId(null) }}
                          autoFocus
                          className="bg-gray-800 border border-blue-500 rounded px-2 py-1 text-sm text-white focus:outline-none w-28"
                        />
                        <button onClick={() => handleUpdate(tag.id)} className="px-2 py-1 rounded text-xs bg-blue-600 text-white hover:bg-blue-500">저장</button>
                        <button onClick={() => setEditingId(null)} className="px-2 py-1 rounded text-xs bg-gray-700 text-gray-300 hover:bg-gray-600">취소</button>
                      </div>
                    )
                    if (deletingId === tag.id) return (
                      <div key={tag.id} className="flex items-center gap-1.5 bg-red-900/30 border border-red-700 rounded px-2 py-0.5">
                        <span className="text-xs text-red-300">삭제?</span>
                        <button onClick={() => handleDelete(tag.id)} className="text-xs text-red-400 hover:text-red-200 font-bold">확인</button>
                        <button onClick={() => setDeletingId(null)} className="text-xs text-gray-400 hover:text-gray-200">취소</button>
                      </div>
                    )
                    return (
                      <div
                        key={tag.id}
                        className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 hover:border-gray-500 rounded px-2 py-0.5 transition-colors"
                      >
                        <span
                          className="text-sm text-blue-300 cursor-pointer hover:text-blue-100"
                          onClick={() => onTagClick(tag.id, tag.name)}
                        >
                          {tag.name}
                        </span>
                        <span className="text-xs">
                          {tag.rep_count > 0 && <span className="text-yellow-500">{tag.rep_count}·</span>}
                          <span className="text-gray-500">{tag.total_count}</span>
                        </span>
                        <button
                          onClick={() => { setEditingId(tag.id); setEditValue(tag.name); setDeletingId(null) }}
                          className="text-xs text-gray-400 hover:text-white leading-none"
                          title="수정"
                        >m</button>
                        <button
                          onClick={() => { setDeletingId(tag.id); setEditingId(null) }}
                          className="text-xs text-gray-400 hover:text-red-400 leading-none"
                          title="삭제"
                        >✕</button>
                      </div>
                    )
                  })}
                  {group.tags.length === 0 && (
                    <p className="text-gray-600 text-xs">{search ? '검색 결과 없음' : '태그 없음'}</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {showCategoryManager && (
        <TagCategoryManager
          type={type}
          onClose={() => { setShowCategoryManager(false); onRefresh() }}
        />
      )}
    </div>
  )
}

export default function Tags({ onNavigateToWork, onNavigateToActor, onEditWork, onEditActor }: Props) {
  const [workTags, setWorkTags] = useState<TagItem[]>([])
  const [actorTags, setActorTags] = useState<TagItem[]>([])
  const [workTagModal, setWorkTagModal] = useState<{ tagName: string; works: Work[] } | null>(null)
  const [actorTagModal, setActorTagModal] = useState<{ tagName: string; actors: Actor[] } | null>(null)
  const [viewWorkId, setViewWorkId] = useState<number | null>(null)
  const [viewActorId, setViewActorId] = useState<number | null>(null)

  const loadWorkTags = () => workTagsApi.list(true).then((d) => setWorkTags(d as TagItem[]))
  const loadActorTags = () => actorTagsApi.list(true).then((d) => setActorTags(d as TagItem[]))

  useEffect(() => { loadWorkTags(); loadActorTags() }, [])

  const handleWorkTagClick = async (tagId: number, tagName: string) => {
    const works = await worksApi.list({ tagIds: [tagId] }) as Work[]
    setWorkTagModal({ tagName, works })
  }

  const handleActorTagClick = async (tagId: number, tagName: string) => {
    const actors = await actorsApi.list({ tagIds: [tagId] }) as Actor[]
    setActorTagModal({ tagName, actors })
  }

  return (
    <>
      <div className="h-full flex flex-col p-4 min-h-0">
        <div className="grid grid-cols-2 gap-8 flex-1 min-h-0">
          <TagPanel
            type="works"
            tags={workTags}
            onRefresh={loadWorkTags}
            onCreate={(name) => workTagsApi.create(name).then(() => {})}
            onUpdate={(id, name) => workTagsApi.update(id, name).then(() => {})}
            onDelete={(id) => workTagsApi.delete(id).then(() => {})}
            onTagClick={handleWorkTagClick}
          />
          <TagPanel
            type="actors"
            tags={actorTags}
            onRefresh={loadActorTags}
            onCreate={(name) => actorTagsApi.create(name).then(() => {})}
            onUpdate={(id, name) => actorTagsApi.update(id, name).then(() => {})}
            onDelete={(id) => actorTagsApi.delete(id).then(() => {})}
            onTagClick={handleActorTagClick}
          />
        </div>
      </div>

      {/* 작품 태그 모달 */}
      {workTagModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setWorkTagModal(null)}>
          <div className="bg-gray-800 rounded-lg w-[95vw] h-[95vh] flex flex-col relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setWorkTagModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl leading-none z-10">✕</button>
            <div className="shrink-0 px-6 pt-6 pb-3 border-b border-gray-700">
              <h2 className="text-lg font-bold text-white">#{workTagModal.tagName}</h2>
              <p className="text-sm text-gray-400 mt-0.5">{workTagModal.works.length}편</p>
            </div>
            <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-6 py-4">
              {workTagModal.works.length > 0 ? (
                <div className="grid grid-cols-5 gap-3">
                  {workTagModal.works.map((w) => (
                    <WorkCard key={w.id} work={w} onClick={() => setViewWorkId(w.id)} />
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">작품이 없습니다</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 배우 태그 모달 */}
      {actorTagModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setActorTagModal(null)}>
          <div className="bg-gray-800 rounded-lg w-[95vw] h-[95vh] flex flex-col relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setActorTagModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl leading-none z-10">✕</button>
            <div className="shrink-0 px-6 pt-6 pb-3 border-b border-gray-700">
              <h2 className="text-lg font-bold text-white">#{actorTagModal.tagName}</h2>
              <p className="text-sm text-gray-400 mt-0.5">{actorTagModal.actors.length}명</p>
            </div>
            <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-6 py-4">
              {actorTagModal.actors.length > 0 ? (
                <div className="grid grid-cols-5 gap-3">
                  {actorTagModal.actors.map((a) => (
                    <ActorListCard key={a.id} actor={a} onClick={() => setViewActorId(a.id)} />
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">배우가 없습니다</p>
              )}
            </div>
          </div>
        </div>
      )}

      {viewWorkId !== null && (
        <>
          <div className="fixed inset-0 bg-black/60" style={{ zIndex: 69 }} onClick={() => setViewWorkId(null)} />
          <WorkViewModal
            workId={viewWorkId}
            onClose={() => setViewWorkId(null)}
            onViewActor={(id) => { setViewWorkId(null); setViewActorId(id) }}
            onEdit={onEditWork ? () => { const id = viewWorkId; setViewWorkId(null); setWorkTagModal(null); onEditWork(id) } : undefined}
            zIndex={70}
          />
        </>
      )}
      {viewActorId !== null && (
        <>
          <div className="fixed inset-0 bg-black/60" style={{ zIndex: 69 }} onClick={() => setViewActorId(null)} />
          <ActorViewModal
            actorId={viewActorId}
            onClose={() => setViewActorId(null)}
            onViewWork={(id) => { setViewActorId(null); setViewWorkId(id) }}
            onEdit={onEditActor ? () => { const id = viewActorId; setViewActorId(null); setActorTagModal(null); onEditActor(id) } : undefined}
            zIndex={70}
          />
        </>
      )}
    </>
  )
}
