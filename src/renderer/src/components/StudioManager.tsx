import { useState, useEffect, useMemo } from 'react'
import { studiosApi } from '../api'

interface StudioWithCount {
  id: number
  name: string
  color: string | null
  work_count: number
}

interface Props {
  onClose: () => void
}

function hashColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return `hsl(${Math.abs(hash) % 360}, 65%, 45%)`
}

function resolvedColor(studio: StudioWithCount): string {
  return studio.color || hashColor(studio.name)
}

const COLOR_PALETTE = Array.from({ length: 100 }, (_, i) => `hsl(${i * 3.6}, 65%, 45%)`)

export default function StudioManager({ onClose }: Props) {
  const [studios, setStudios] = useState<StudioWithCount[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [colorPickerId, setColorPickerId] = useState<number | null>(null)
  const [newName, setNewName] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'count'>(
    (localStorage.getItem('studiomanager:sortBy') as 'name' | 'count') || 'count'
  )
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(
    (localStorage.getItem('studiomanager:sortDir') as 'asc' | 'desc') || 'desc'
  )

  const sortedStudios = useMemo(() => [...studios].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    if (sortBy === 'name') return a.name.localeCompare(b.name, 'ko') * dir
    return (a.work_count - b.work_count) * dir
  }), [studios, sortBy, sortDir])

  const load = async () => {
    setStudios(await studiosApi.list(true) as StudioWithCount[])
  }

  useEffect(() => { load() }, [])

  const handleStartEdit = (studio: StudioWithCount) => {
    setEditingId(studio.id)
    setEditingName(studio.name)
    setDeletingId(null)
    setColorPickerId(null)
  }

  const handleSaveEdit = async (studio: StudioWithCount) => {
    const name = editingName.trim()
    if (!name) return
    try {
      await studiosApi.update(studio.id, name, studio.color)
      setEditingId(null)
      await load()
    } catch (err) {
      console.error('레이블 수정 실패:', err)
    }
  }

  const handleSelectColor = async (studio: StudioWithCount, color: string) => {
    try {
      await studiosApi.update(studio.id, studio.name, color)
      setColorPickerId(null)
      await load()
    } catch (err) {
      console.error('레이블 색상 저장 실패:', err)
    }
  }

  const handleDelete = async (studio: StudioWithCount) => {
    try {
      await studiosApi.delete(studio.id)
      setDeletingId(null)
      await load()
    } catch (err) {
      console.error('레이블 삭제 실패:', err)
    }
  }

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    try {
      await studiosApi.create(name)
      setNewName('')
      await load()
    } catch (err) {
      console.error('레이블 생성 실패:', err)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg p-6 w-[440px] h-[95vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">레이블 관리</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="flex gap-1.5 mb-3">
          {(['name', 'count'] as const).map((s) => (
            <button
              key={s}
              onClick={() => {
                if (sortBy === s) {
                  const next = sortDir === 'asc' ? 'desc' : 'asc'
                  setSortDir(next)
                  localStorage.setItem('studiomanager:sortDir', next)
                } else {
                  const nextDir = s === 'name' ? 'asc' : 'desc'
                  setSortBy(s)
                  setSortDir(nextDir)
                  localStorage.setItem('studiomanager:sortBy', s)
                  localStorage.setItem('studiomanager:sortDir', nextDir)
                }
              }}
              className={`px-2.5 py-1 rounded text-xs ${sortBy === s ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >
              {s === 'name' ? '이름' : '참조'}{sortBy === s ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
          {studios.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-4">레이블이 없습니다</p>
          )}
          {sortedStudios.map((studio) => (
            <div key={studio.id}>
              <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-700/50">
                {/* 색상 버튼 */}
                <button
                  onClick={() => setColorPickerId(colorPickerId === studio.id ? null : studio.id)}
                  className="flex-shrink-0 w-6 h-6 rounded border-2 border-gray-600 hover:border-gray-400"
                  style={{ backgroundColor: resolvedColor(studio) }}
                />
                {editingId === studio.id ? (
                  <input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit(studio)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    className="bg-gray-700 text-white text-sm px-2 py-0.5 rounded flex-1"
                  />
                ) : (
                  <span className="text-white text-sm flex-1">{studio.name}</span>
                )}
                <span className="text-gray-500 text-xs w-12 text-right">{studio.work_count}편</span>
                {deletingId === studio.id ? (
                  <>
                    <span className="text-red-400 text-xs">삭제?</span>
                    <button
                      onClick={() => handleDelete(studio)}
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
                ) : editingId === studio.id ? (
                  <>
                    <button
                      onClick={() => handleSaveEdit(studio)}
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
                      onClick={() => handleStartEdit(studio)}
                      className="text-gray-400 hover:text-white text-xs px-2 py-0.5 rounded border border-gray-600"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => { setDeletingId(studio.id); setEditingId(null) }}
                      className="text-red-400 hover:text-red-300 text-xs px-2 py-0.5 rounded border border-red-800"
                    >
                      삭제
                    </button>
                  </>
                )}
              </div>

              {/* 10×10 색상 패널 */}
              {colorPickerId === studio.id && (
                <div className="mx-2 mb-1 p-2 bg-gray-900 rounded border border-gray-700">
                  <div className="grid grid-cols-10 gap-0.5">
                    {COLOR_PALETTE.map((color, i) => (
                      <button
                        key={i}
                        onClick={() => handleSelectColor(studio, color)}
                        className="w-full aspect-square rounded-sm hover:scale-110 transition-transform"
                        style={{ backgroundColor: color, outline: studio.color === color ? '2px solid white' : 'none' }}
                      />
                    ))}
                  </div>
                </div>
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
            placeholder="새 레이블 이름"
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
