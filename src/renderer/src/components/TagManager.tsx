import { useState, useEffect, useRef } from 'react'
import type { TagCategory } from '../types'
import { workTagCategoriesApi, actorTagCategoriesApi, workTagsApi, actorTagsApi } from '../api'

interface TagItem {
  id: number
  name: string
  category_id: number | null
}

interface Props {
  type: 'works' | 'actors'
  onClose: () => void
}

export default function TagCategoryManager({ type, onClose }: Props) {
  const catApi = type === 'works' ? workTagCategoriesApi : actorTagCategoriesApi
  const tagApi = type === 'works' ? workTagsApi : actorTagsApi

  const [categories, setCategories] = useState<TagCategory[]>([])
  const [allTags, setAllTags] = useState<TagItem[]>([])
  const [newCatName, setNewCatName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [openTagsCatId, setOpenTagsCatId] = useState<number | null>(null)
  const [dragOverId, setDragOverId] = useState<number | null>(null)
  const dragItemRef = useRef<number | null>(null)

  const load = async () => {
    const [cats, tags] = await Promise.all([
      catApi.list() as Promise<TagCategory[]>,
      tagApi.list() as Promise<TagItem[]>,
    ])
    setCategories(cats)
    setAllTags(tags)
  }

  useEffect(() => { load() }, [type])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleAddCategory = async () => {
    const name = newCatName.trim()
    if (!name) return
    await catApi.create(name)
    setNewCatName('')
    load()
  }

  const handleSaveEdit = async (id: number) => {
    const name = editingName.trim()
    if (!name) return
    await catApi.update(id, name)
    setEditingId(null)
    load()
  }

  const handleDelete = async (id: number) => {
    await catApi.delete(id)
    setDeletingId(null)
    if (openTagsCatId === id) setOpenTagsCatId(null)
    load()
  }

  const handleDragStart = (id: number) => { dragItemRef.current = id }
  const handleDragOver = (e: React.DragEvent, id: number) => { e.preventDefault(); setDragOverId(id) }
  const handleDragLeave = () => setDragOverId(null)
  const handleDragEnd = () => { dragItemRef.current = null; setDragOverId(null) }

  const handleDrop = async (targetId: number) => {
    const fromId = dragItemRef.current
    if (!fromId || fromId === targetId) { setDragOverId(null); return }
    const ids = categories.map(c => c.id)
    const fromIdx = ids.indexOf(fromId)
    const toIdx = ids.indexOf(targetId)
    const reordered = [...ids]
    reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, fromId)
    await catApi.reorder(reordered)
    dragItemRef.current = null
    setDragOverId(null)
    load()
  }

  const handleToggleTags = (catId: number) => {
    setOpenTagsCatId(prev => prev === catId ? null : catId)
    setEditingId(null)
    setDeletingId(null)
  }

  const handleAssignTag = async (tagId: number, catId: number) => {
    await catApi.setTagCategory(tagId, catId)
    load()
  }

  const handleUnassignTag = async (tagId: number) => {
    await catApi.setTagCategory(tagId, null)
    load()
  }

  const accentBg = type === 'works' ? 'bg-green-600 hover:bg-green-500' : 'bg-purple-600 hover:bg-purple-500'
  const accentAssigned = type === 'works' ? 'bg-green-700 text-green-200 hover:bg-green-600' : 'bg-purple-700 text-purple-200 hover:bg-purple-600'
  const accentOpen = type === 'works' ? 'bg-green-700 text-green-200 border-green-600' : 'bg-purple-700 text-purple-200 border-purple-600'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg w-[1000px] h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
          <h2 className="text-white font-bold text-base">{type === 'works' ? '작품' : '배우'} 태그 카테고리 관리</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        {/* 새 카테고리 추가 */}
        <div className="flex gap-2 px-5 py-3 border-b border-gray-700 shrink-0">
          <input
            type="text"
            value={newCatName}
            onChange={e => setNewCatName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
            placeholder="새 카테고리명 입력..."
            className="flex-1 bg-gray-700 text-white text-sm px-3 py-1.5 rounded"
          />
          <button onClick={handleAddCategory} className={`${accentBg} text-white text-sm px-3 py-1.5 rounded`}>추가</button>
        </div>

        {/* 카테고리 목록 */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1 [scrollbar-gutter:stable]">
          {categories.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-6">카테고리가 없습니다</p>
          )}
          {categories.map(cat => {
            const assignedTags = allTags.filter(t => t.category_id === cat.id)
            const unassignedTags = allTags.filter(t => t.category_id == null)
            const isOpen = openTagsCatId === cat.id
            const isDragOver = dragOverId === cat.id

            return (
              <div key={cat.id}>
                <div
                  draggable
                  onDragStart={() => handleDragStart(cat.id)}
                  onDragOver={e => handleDragOver(e, cat.id)}
                  onDragLeave={handleDragLeave}
                  onDragEnd={handleDragEnd}
                  onDrop={() => handleDrop(cat.id)}
                  className={`flex items-center gap-2 px-2 py-2 rounded transition-colors ${isDragOver ? 'bg-gray-600 border border-gray-500' : 'bg-gray-700/60 hover:bg-gray-700'}`}
                >
                  <span className="text-gray-500 cursor-grab select-none text-base shrink-0">⠿</span>

                  {editingId === cat.id ? (
                    <>
                      <input
                        autoFocus
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(cat.id); if (e.key === 'Escape') setEditingId(null) }}
                        className="flex-1 bg-gray-600 text-white text-sm px-2 py-0.5 rounded"
                      />
                      <button onClick={() => handleSaveEdit(cat.id)} className="text-blue-400 text-xs px-2 py-0.5 rounded border border-blue-600 hover:text-blue-300 shrink-0">저장</button>
                      <button onClick={() => setEditingId(null)} className="text-gray-400 text-xs px-2 py-0.5 rounded border border-gray-600 hover:text-white shrink-0">취소</button>
                    </>
                  ) : deletingId === cat.id ? (
                    <>
                      <span className="flex-1 text-white text-sm">{cat.name} <span className="text-gray-400 text-xs">({cat.tag_count})</span></span>
                      <span className="text-red-400 text-xs shrink-0">삭제?</span>
                      <button onClick={() => handleDelete(cat.id)} className="text-red-400 text-xs px-2 py-0.5 rounded border border-red-700 hover:text-red-300 shrink-0">확인</button>
                      <button onClick={() => setDeletingId(null)} className="text-gray-400 text-xs px-2 py-0.5 rounded border border-gray-600 hover:text-white shrink-0">취소</button>
                    </>
                  ) : (
                    <>
                      <span onClick={() => handleToggleTags(cat.id)} className="flex-1 text-white text-sm cursor-pointer hover:text-gray-300">{cat.name} <span className="text-gray-400 text-xs">({cat.tag_count})</span></span>
                      <button onClick={() => { setEditingId(cat.id); setEditingName(cat.name); setDeletingId(null); setOpenTagsCatId(null) }} className="text-gray-400 text-xs px-2 py-0.5 rounded border border-gray-600 hover:text-white shrink-0">수정</button>
                      <button onClick={() => { setDeletingId(cat.id); setEditingId(null); setOpenTagsCatId(null) }} className="text-red-400 text-xs px-2 py-0.5 rounded border border-red-800 hover:text-red-300 shrink-0">삭제</button>
                      <button
                        onClick={() => handleToggleTags(cat.id)}
                        className={`text-xs px-2 py-0.5 rounded border shrink-0 ${isOpen ? accentOpen : 'text-gray-400 border-gray-600 hover:text-white'}`}
                      >태그지정</button>
                    </>
                  )}
                </div>

                {/* 태그 지정 패널 */}
                {isOpen && (
                  <div className="ml-7 mt-1 mb-2 bg-gray-900/50 border border-gray-600 rounded p-3 space-y-2">
                    <div>
                      <p className="text-xs text-gray-400 mb-1.5">지정 태그</p>
                      <div className="flex flex-wrap gap-1 min-h-[22px]">
                        {assignedTags.length === 0 && <span className="text-xs text-gray-600">없음</span>}
                        {assignedTags.map(t => (
                          <button key={t.id} onClick={() => handleUnassignTag(t.id)} className={`text-xs px-2 py-0.5 rounded ${accentAssigned}`}>{t.name}</button>
                        ))}
                      </div>
                    </div>
                    <div className="border-t border-gray-700" />
                    <div>
                      <p className="text-xs text-gray-400 mb-1.5">미분류 태그</p>
                      <div className="flex flex-wrap gap-1 min-h-[22px]">
                        {unassignedTags.length === 0 && <span className="text-xs text-gray-600">없음</span>}
                        {unassignedTags.map(t => (
                          <button key={t.id} onClick={() => handleAssignTag(t.id, cat.id)} className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300 hover:bg-gray-600">{t.name}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {/* 미분류 태그 현황 */}
          {allTags.filter(t => t.category_id == null).length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-700">
              <p className="text-xs text-gray-500 mb-1.5">
                미분류 태그 현황
              </p>
              <div className="flex flex-wrap gap-1">
                {allTags.filter(t => t.category_id == null).map(t => (
                  <span key={t.id} className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-400">{t.name}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
