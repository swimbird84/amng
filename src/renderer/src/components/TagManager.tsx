import { useState, useEffect, useMemo } from 'react'
import { workTagsApi, actorTagsApi } from '../api'

interface TagWithCount {
  id: number
  name: string
  count: number
}

interface Props {
  defaultTab?: 'works' | 'actors'
  onClose: () => void
}

export default function TagManager({ defaultTab = 'works', onClose }: Props) {
  const [tab, setTab] = useState<'works' | 'actors'>(defaultTab)
  const [tags, setTags] = useState<TagWithCount[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [newName, setNewName] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'count'>('count')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const api = tab === 'works' ? workTagsApi : actorTagsApi

  const sortedTags = useMemo(() => [...tags].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    if (sortBy === 'name') return a.name.localeCompare(b.name, 'ko') * dir
    return (a.count - b.count) * dir
  }), [tags, sortBy, sortDir])

  const load = async () => {
    const list = await api.list(true) as TagWithCount[]
    setTags(list)
  }

  useEffect(() => {
    load()
    setEditingId(null)
    setDeletingId(null)
    setNewName('')
  }, [tab])

  const handleStartEdit = (tag: TagWithCount) => {
    setEditingId(tag.id)
    setEditingName(tag.name)
    setDeletingId(null)
  }

  const handleSaveEdit = async (id: number) => {
    const name = editingName.trim()
    if (!name) return
    try {
      await api.update(id, name)
      setEditingId(null)
      await load()
    } catch (err) {
      console.error('태그 수정 실패:', err)
    }
  }

  const handleDelete = async (tag: TagWithCount) => {
    try {
      await api.delete(tag.id)
      setDeletingId(null)
      await load()
    } catch (err) {
      console.error('태그 삭제 실패:', err)
    }
  }

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    try {
      await api.create(name)
      setNewName('')
      await load()
    } catch (err) {
      console.error('태그 생성 실패:', err)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg p-6 w-[440px] h-[95vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">태그 관리</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="flex gap-2 mb-4">
          {(['works', 'actors'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded text-sm font-medium ${
                tab === t ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {t === 'works' ? '작품 태그' : '배우 태그'}
            </button>
          ))}
        </div>

        <div className="flex gap-1.5 mb-3">
          {(['name', 'count'] as const).map((s) => (
            <button
              key={s}
              onClick={() => {
                if (sortBy === s) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
                else { setSortBy(s); setSortDir(s === 'name' ? 'asc' : 'desc') }
              }}
              className={`px-2.5 py-1 rounded text-xs ${sortBy === s ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >
              {s === 'name' ? '이름순' : '참조순'}{sortBy === s ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
          {tags.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-4">태그가 없습니다</p>
          )}
          {sortedTags.map((tag) => (
            <div key={tag.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-700/50">
              {editingId === tag.id ? (
                <input
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveEdit(tag.id)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  className="bg-gray-700 text-white text-sm px-2 py-0.5 rounded flex-1"
                />
              ) : (
                <span className="text-white text-sm flex-1">{tag.name}</span>
              )}
              <span className="text-gray-500 text-xs w-12 text-right">{tag.count}개</span>
              {deletingId === tag.id ? (
                <>
                  <span className="text-red-400 text-xs">삭제?</span>
                  <button
                    onClick={() => handleDelete(tag)}
                    className="text-red-400 hover:text-red-300 text-xs px-2 py-0.5 rounded border border-red-800"
                  >
                    확인
                  </button>
                  <button
                    onClick={() => setDeletingId(null)}
                    className="text-gray-400 hover:text-gray-300 text-xs px-2 py-0.5 rounded border border-gray-600"
                  >
                    취소
                  </button>
                </>
              ) : editingId === tag.id ? (
                <>
                  <button
                    onClick={() => handleSaveEdit(tag.id)}
                    className="text-blue-400 hover:text-blue-300 text-xs px-2 py-0.5 rounded border border-blue-400"
                  >
                    저장
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-gray-400 hover:text-gray-300 text-xs px-2 py-0.5 rounded border border-gray-600"
                  >
                    취소
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => handleStartEdit(tag)}
                    className="text-gray-400 hover:text-white text-xs px-2 py-0.5 rounded border border-gray-600"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => { setDeletingId(tag.id); setEditingId(null) }}
                    className="text-red-400 hover:text-red-300 text-xs px-2 py-0.5 rounded border border-red-800"
                  >
                    삭제
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-700">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="새 태그 이름"
            className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded flex-1"
          />
          <button
            onClick={handleCreate}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-3 py-1.5 rounded"
          >
            추가
          </button>
        </div>

      </div>
    </div>
  )
}
