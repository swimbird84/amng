import { useState, useEffect, useMemo } from 'react'
import { studiosApi, makersApi } from '../api'

interface StudioItem {
  id: number
  name: string
  maker_id: number | null
}

interface MakerWithCount {
  id: number
  name: string
  color: string | null
  studio_count: number
}

interface Props {
  onClose: () => void
}

function hashColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return `hsl(${Math.abs(hash) % 360}, 65%, 45%)`
}

function resolvedColor(name: string, color?: string | null): string {
  return color || hashColor(name)
}

const COLOR_PALETTE = [
  ...Array.from({ length: 100 }, (_, i) => `hsl(${i * 3.6}, 65%, 45%)`),
  ...Array.from({ length: 10 }, (_, i) => `hsl(0, 0%, ${60 - i * 6}%)`),
]

export default function MakerManager({ onClose }: Props) {
  const [makers, setMakers] = useState<MakerWithCount[]>([])
  const [studios, setStudios] = useState<StudioItem[]>([])

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [newName, setNewName] = useState('')
  const [openAssignId, setOpenAssignId] = useState<number | null>(null)

  const [sortBy, setSortBy] = useState<'name' | 'count' | 'id'>(
    (localStorage.getItem('makermanager:sortBy') as 'name' | 'count' | 'id') || 'count'
  )
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(
    (localStorage.getItem('makermanager:sortDir') as 'asc' | 'desc') || 'desc'
  )

  const [colorPickerId, setColorPickerId] = useState<number | null>(null)
  const [colorPickerPos, setColorPickerPos] = useState<{ top: number; left: number } | null>(null)

  const loadAll = async () => {
    const [m, s] = await Promise.all([
      makersApi.list(true) as Promise<MakerWithCount[]>,
      studiosApi.list() as Promise<StudioItem[]>,
    ])
    setMakers(m)
    setStudios(s)
  }

  useEffect(() => { loadAll() }, [])

  const sortedMakers = useMemo(() => [...makers].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    if (sortBy === 'name') return a.name.localeCompare(b.name, 'en-US') * dir
    if (sortBy === 'id') return (a.id - b.id) * dir
    return (a.studio_count - b.studio_count) * dir
  }), [makers, sortBy, sortDir])

  const handleSaveEdit = async (maker: MakerWithCount) => {
    const name = editingName.trim()
    if (!name) return
    await makersApi.update(maker.id, name, maker.color ?? undefined)
    setEditingId(null)
    loadAll()
  }

  const handleDelete = async (id: number) => {
    await makersApi.delete(id)
    setDeletingId(null)
    if (openAssignId === id) setOpenAssignId(null)
    loadAll()
  }

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    await makersApi.create(name)
    setNewName('')
    loadAll()
  }

  const handleSort = (s: 'name' | 'count' | 'id') => {
    const defaultDir = s === 'count' ? 'desc' : 'asc'
    if (sortBy === s) {
      const next = sortDir === 'asc' ? 'desc' : 'asc'
      setSortDir(next)
      localStorage.setItem('makermanager:sortDir', next)
    } else {
      setSortBy(s)
      setSortDir(defaultDir)
      localStorage.setItem('makermanager:sortBy', s)
      localStorage.setItem('makermanager:sortDir', defaultDir)
    }
  }

  const handleOpenColorPicker = (e: React.MouseEvent<HTMLButtonElement>, id: number) => {
    if (colorPickerId === id) {
      setColorPickerId(null)
      setColorPickerPos(null)
      return
    }
    const r = e.currentTarget.getBoundingClientRect()
    const panelH = 250
    const top = r.bottom + 4 + panelH > window.innerHeight ? r.top - panelH - 4 : r.bottom + 4
    setColorPickerId(id)
    setColorPickerPos({ top, left: r.left })
  }

  const handleSelectColor = async (color: string) => {
    if (colorPickerId === null) return
    const maker = makers.find(m => m.id === colorPickerId)
    if (maker) await makersApi.update(maker.id, maker.name, color)
    setColorPickerId(null)
    setColorPickerPos(null)
    loadAll()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-[500px] h-[95vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">제작사 관리</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="flex gap-1.5 mb-3">
          {(['name', 'count', 'id'] as const).map((s) => {
            const label = s === 'name' ? '이름' : s === 'count' ? '레이블' : '등록'
            const isActive = sortBy === s
            return (
              <button key={s} onClick={() => handleSort(s)}
                className={`px-2.5 py-1 rounded text-xs ${isActive ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                {label}{isActive ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
              </button>
            )
          })}
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 min-h-0 [scrollbar-gutter:stable]">
          {sortedMakers.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-4">제작사가 없습니다</p>
          )}
          {sortedMakers.map((maker) => {
            const assignedStudios = studios.filter(s => s.maker_id === maker.id)
            const unassignedStudios = studios.filter(s => s.maker_id == null)
            const isOpen = openAssignId === maker.id
            return (
              <div key={maker.id}>
                <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-700/50">
                  <button
                    onClick={(e) => handleOpenColorPicker(e, maker.id)}
                    className="shrink-0 w-6 h-6 rounded border-2 border-gray-600 hover:border-gray-400"
                    style={{ backgroundColor: resolvedColor(maker.name, maker.color) }}
                  />
                  {editingId === maker.id ? (
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(maker); if (e.key === 'Escape') setEditingId(null) }}
                      className="bg-gray-700 text-white text-sm px-2 py-0.5 rounded flex-1"
                    />
                  ) : (
                    <button
                      onClick={() => setOpenAssignId(isOpen ? null : maker.id)}
                      className="text-white text-sm flex-1 text-left hover:text-blue-300"
                    >
                      {maker.name}
                    </button>
                  )}
                  <span className="text-gray-500 text-xs w-12 text-right">{maker.studio_count}개</span>
                  {deletingId === maker.id ? (
                    <>
                      <span className="text-red-400 text-xs">삭제?</span>
                      <button onClick={() => handleDelete(maker.id)} className="text-red-400 hover:text-red-300 text-xs px-2 py-0.5 rounded border border-red-800">확인</button>
                      <button onClick={() => setDeletingId(null)} className="text-gray-400 hover:text-gray-300 text-xs px-2 py-0.5 rounded border border-gray-600">취소</button>
                    </>
                  ) : editingId === maker.id ? (
                    <>
                      <button onClick={() => handleSaveEdit(maker)} className="text-blue-400 hover:text-blue-300 text-xs px-2 py-0.5 rounded border border-blue-400">저장</button>
                      <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-300 text-xs px-2 py-0.5 rounded border border-gray-600">취소</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setEditingId(maker.id); setEditingName(maker.name); setDeletingId(null) }} className="text-gray-400 hover:text-white text-xs px-2 py-0.5 rounded border border-gray-600">수정</button>
                      <button onClick={() => { setDeletingId(maker.id); setEditingId(null) }} className="text-red-400 hover:text-red-300 text-xs px-2 py-0.5 rounded border border-red-800">삭제</button>
                    </>
                  )}
                </div>

                {isOpen && (
                  <div className="ml-8 mb-1 bg-gray-900/50 border border-gray-700 rounded p-2 space-y-2">
                    <div>
                      <p className="text-xs text-gray-400 mb-1">지정 레이블</p>
                      <div className="flex flex-wrap gap-1 min-h-5">
                        {assignedStudios.length === 0 && <span className="text-xs text-gray-600">없음</span>}
                        {assignedStudios.map(s => (
                          <button key={s.id} onClick={() => makersApi.assignStudio(s.id, null).then(loadAll)}
                            className="text-xs px-2 py-0.5 rounded bg-blue-700 text-blue-200 hover:bg-blue-600">{s.name}</button>
                        ))}
                      </div>
                    </div>
                    <div className="border-t border-gray-700" />
                    <div>
                      <p className="text-xs text-gray-400 mb-1">미분류 레이블</p>
                      <div className="flex flex-wrap gap-1 min-h-5">
                        {unassignedStudios.length === 0 && <span className="text-xs text-gray-600">없음</span>}
                        {unassignedStudios.map(s => (
                          <button key={s.id} onClick={() => makersApi.assignStudio(s.id, maker.id).then(loadAll)}
                            className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300 hover:bg-gray-600">{s.name}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-700">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="제작사 이름"
            className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded flex-1"
          />
          <button onClick={handleCreate} className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-3 py-1.5 rounded">추가</button>
        </div>
      </div>

      {colorPickerId !== null && colorPickerPos && (
        <div
          className="fixed z-[200] p-1.5 bg-gray-900 rounded border border-gray-700 shadow-xl"
          style={{ top: colorPickerPos.top, left: colorPickerPos.left, width: 250, height: 250 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-10 gap-px h-full">
            {COLOR_PALETTE.map((color, i) => (
              <button key={i} onClick={() => handleSelectColor(color)}
                className="rounded-sm hover:scale-110 transition-transform"
                style={{ backgroundColor: color, outline: makers.find(m => m.id === colorPickerId)?.color === color ? '2px solid white' : 'none' }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
