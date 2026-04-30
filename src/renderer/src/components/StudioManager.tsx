import { useState, useEffect, useMemo } from 'react'
import { studiosApi, studioCodesApi } from '../api'

interface StudioWithCount {
  id: number
  name: string
  color: string | null
  work_count: number
  maker_id: number | null
  maker_name: string | null
}

interface StudioCode {
  id: number
  studio_id: number
  code: string
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

export default function StudioManager({ onClose }: Props) {
  const [studios, setStudios] = useState<StudioWithCount[]>([])

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [newName, setNewName] = useState('')

  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [codesMap, setCodesMap] = useState<Record<number, StudioCode[]>>({})
  const [editingCodeId, setEditingCodeId] = useState<number | null>(null)
  const [editingCodeValue, setEditingCodeValue] = useState('')
  const [deletingCodeId, setDeletingCodeId] = useState<number | null>(null)
  const [newCodeMap, setNewCodeMap] = useState<Record<number, string>>({})

  const [sortBy, setSortBy] = useState<'name' | 'count'>(
    (localStorage.getItem('studiomanager:sortBy') as 'name' | 'count') || 'count'
  )
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(
    (localStorage.getItem('studiomanager:sortDir') as 'asc' | 'desc') || 'desc'
  )
  const [collapsedMakerGroups, setCollapsedMakerGroups] = useState<Set<string>>(new Set())

  const [colorPickerId, setColorPickerId] = useState<number | null>(null)
  const [colorPickerPos, setColorPickerPos] = useState<{ top: number; left: number } | null>(null)

  const load = async () => {
    setStudios(await studiosApi.list(true) as StudioWithCount[])
  }

  useEffect(() => { load() }, [])

  // 제작사별 그룹 (정렬 기준: 제작사 이름 or 제작사 작품총합)
  const makerGroups = useMemo(() => {
    type MakerGroup = { makerId: string; makerName: string; studios: StudioWithCount[]; totalWorks: number }
    const groups: MakerGroup[] = []
    const groupMap = new Map<string, MakerGroup>()

    for (const s of studios) {
      const key = s.maker_id != null ? String(s.maker_id) : '__none__'
      if (!groupMap.has(key)) {
        const g: MakerGroup = { makerId: key, makerName: s.maker_name ?? 'UNDEFINED', studios: [], totalWorks: 0 }
        groupMap.set(key, g)
        if (key !== '__none__') groups.push(g)
      }
      groupMap.get(key)!.studios.push(s)
      groupMap.get(key)!.totalWorks += s.work_count
    }

    // 레이블 내부는 이름순
    for (const g of groupMap.values()) g.studios.sort((a, b) => a.name.localeCompare(b.name, 'en-US'))

    const dir = sortDir === 'asc' ? 1 : -1
    if (sortBy === 'name') groups.sort((a, b) => a.makerName.localeCompare(b.makerName, 'en-US') * dir)
    else groups.sort((a, b) => (a.totalWorks - b.totalWorks) * dir)

    // UNDEFINED 항상 맨 아래
    const noneGroup = groupMap.get('__none__')
    if (noneGroup && noneGroup.studios.length > 0) groups.push(noneGroup)

    return groups
  }, [studios, sortBy, sortDir])

  const handleSaveEdit = async (studio: StudioWithCount) => {
    const name = editingName.trim()
    if (!name) return
    await studiosApi.update(studio.id, name, studio.color ?? hashColor(studio.name))
    setEditingId(null)
    load()
  }

  const handleDelete = async (id: number) => {
    await studiosApi.delete(id)
    setDeletingId(null)
    load()
  }

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    await studiosApi.create(name)
    setNewName('')
    load()
  }

  const loadCodes = async (studioId: number) => {
    const codes = await studioCodesApi.list(studioId)
    setCodesMap((prev) => ({ ...prev, [studioId]: codes }))
  }

  const handleToggleExpand = async (studioId: number) => {
    if (expandedId === studioId) {
      setExpandedId(null)
    } else {
      setExpandedId(studioId)
      await loadCodes(studioId)
    }
    setEditingCodeId(null)
    setDeletingCodeId(null)
  }

  const handleCreateCode = async (studioId: number) => {
    const code = (newCodeMap[studioId] || '').trim()
    if (!code) return
    await studioCodesApi.create(studioId, code)
    setNewCodeMap((prev) => ({ ...prev, [studioId]: '' }))
    await loadCodes(studioId)
  }

  const handleUpdateCode = async (id: number, studioId: number) => {
    const code = editingCodeValue.trim()
    if (!code) return
    await studioCodesApi.update(id, code)
    setEditingCodeId(null)
    await loadCodes(studioId)
  }

  const handleDeleteCode = async (id: number, studioId: number) => {
    await studioCodesApi.delete(id)
    setDeletingCodeId(null)
    await loadCodes(studioId)
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
    const studio = studios.find(s => s.id === colorPickerId)
    if (studio) await studiosApi.update(studio.id, studio.name, color)
    setColorPickerId(null)
    setColorPickerPos(null)
    load()
  }

  const handleStudioSort = (s: 'name' | 'count') => {
    const defaultDir = s === 'count' ? 'desc' : 'asc'
    if (sortBy === s) {
      const next = sortDir === 'asc' ? 'desc' : 'asc'
      setSortDir(next)
      localStorage.setItem('studiomanager:sortDir', next)
    } else {
      setSortBy(s)
      setSortDir(defaultDir)
      localStorage.setItem('studiomanager:sortBy', s)
      localStorage.setItem('studiomanager:sortDir', defaultDir)
    }
  }

  const toggleMakerGroup = (key: string) => {
    setCollapsedMakerGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const renderStudioRow = (studio: StudioWithCount) => (
    <div key={studio.id}>
      <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-700/50">
        <button
          onClick={(e) => handleOpenColorPicker(e, studio.id)}
          className="shrink-0 w-6 h-6 rounded border-2 border-gray-600 hover:border-gray-400"
          style={{ backgroundColor: resolvedColor(studio.name, studio.color) }}
        />
        {editingId === studio.id ? (
          <input
            autoFocus
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(studio); if (e.key === 'Escape') setEditingId(null) }}
            className="bg-gray-700 text-white text-sm px-2 py-0.5 rounded flex-1"
          />
        ) : (
          <button onClick={() => handleToggleExpand(studio.id)} className="text-white text-sm flex-1 text-left hover:text-blue-300">
            {studio.name}
          </button>
        )}
        <span className="text-gray-500 text-xs w-12 text-right">{studio.work_count}편</span>
        {deletingId === studio.id ? (
          <>
            <span className="text-red-400 text-xs">삭제?</span>
            <button onClick={() => handleDelete(studio.id)} className="text-red-400 hover:text-red-300 text-xs px-2 py-0.5 rounded border border-red-800">확인</button>
            <button onClick={() => setDeletingId(null)} className="text-gray-400 hover:text-gray-300 text-xs px-2 py-0.5 rounded border border-gray-600">취소</button>
          </>
        ) : editingId === studio.id ? (
          <>
            <button onClick={() => handleSaveEdit(studio)} className="text-blue-400 hover:text-blue-300 text-xs px-2 py-0.5 rounded border border-blue-400">저장</button>
            <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-300 text-xs px-2 py-0.5 rounded border border-gray-600">취소</button>
          </>
        ) : (
          <>
            <button onClick={() => { setEditingId(studio.id); setEditingName(studio.name); setDeletingId(null) }} className="text-gray-400 hover:text-white text-xs px-2 py-0.5 rounded border border-gray-600">수정</button>
            <button onClick={() => { setDeletingId(studio.id); setEditingId(null) }} className="text-red-400 hover:text-red-300 text-xs px-2 py-0.5 rounded border border-red-800">삭제</button>
          </>
        )}
      </div>

      {expandedId === studio.id && (
        <div className="ml-8 mb-1 space-y-0.5">
          {(codesMap[studio.id] ?? []).map((sc) => (
            <div key={sc.id} className="flex items-center gap-1.5 px-2 py-1 rounded bg-gray-700/40">
              <span className="text-gray-400 text-xs">└</span>
              {editingCodeId === sc.id ? (
                <input autoFocus value={editingCodeValue}
                  onChange={(e) => setEditingCodeValue(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateCode(sc.id, studio.id); if (e.key === 'Escape') setEditingCodeId(null) }}
                  className="bg-gray-600 text-white text-xs px-1.5 py-0.5 rounded flex-1 font-mono"
                />
              ) : (
                <span className="text-gray-200 text-xs font-mono flex-1">{sc.code}</span>
              )}
              {deletingCodeId === sc.id ? (
                <>
                  <span className="text-red-400 text-xs">삭제?</span>
                  <button onClick={() => handleDeleteCode(sc.id, studio.id)} className="text-red-400 hover:text-red-300 text-xs px-1.5 py-0.5 rounded border border-red-800">확인</button>
                  <button onClick={() => setDeletingCodeId(null)} className="text-gray-400 hover:text-gray-300 text-xs px-1.5 py-0.5 rounded border border-gray-600">취소</button>
                </>
              ) : editingCodeId === sc.id ? (
                <>
                  <button onClick={() => handleUpdateCode(sc.id, studio.id)} className="text-blue-400 hover:text-blue-300 text-xs px-1.5 py-0.5 rounded border border-blue-400">저장</button>
                  <button onClick={() => setEditingCodeId(null)} className="text-gray-400 hover:text-gray-300 text-xs px-1.5 py-0.5 rounded border border-gray-600">취소</button>
                </>
              ) : (
                <>
                  <button onClick={() => { setEditingCodeId(sc.id); setEditingCodeValue(sc.code); setDeletingCodeId(null) }} className="text-gray-400 hover:text-white text-xs px-1.5 py-0.5 rounded border border-gray-600">수정</button>
                  <button onClick={() => { setDeletingCodeId(sc.id); setEditingCodeId(null) }} className="text-red-400 hover:text-red-300 text-xs px-1.5 py-0.5 rounded border border-red-800">삭제</button>
                </>
              )}
            </div>
          ))}
          <div className="flex items-center gap-1.5 px-2 py-1">
            <span className="text-gray-400 text-xs">└</span>
            <input type="text" value={newCodeMap[studio.id] || ''}
              onChange={(e) => setNewCodeMap((prev) => ({ ...prev, [studio.id]: e.target.value.toUpperCase() }))}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateCode(studio.id)}
              placeholder="코드 입력"
              className="bg-gray-700 text-white text-xs px-1.5 py-0.5 rounded flex-1 font-mono placeholder-gray-500"
            />
            <button onClick={() => handleCreateCode(studio.id)} className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-2 py-0.5 rounded">추가</button>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg p-6 w-[500px] h-[95vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">레이블 관리</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="flex gap-1.5 mb-3">
          {(['name', 'count'] as const).map((s) => {
            const label = s === 'name' ? '이름' : '작품'
            const isActive = sortBy === s
            return (
              <button key={s} onClick={() => handleStudioSort(s)}
                className={`px-2.5 py-1 rounded text-xs ${isActive ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                {label}{isActive ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
              </button>
            )
          })}
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 min-h-0 [scrollbar-gutter:stable]">
          {studios.length === 0 && (
            <p className="text-gray-500 text-sm text-center py-4">레이블이 없습니다</p>
          )}
          {makerGroups.map(g => {
            const isCollapsed = collapsedMakerGroups.has(g.makerId)
            return (
              <div key={g.makerId}>
                <button onClick={() => toggleMakerGroup(g.makerId)} className="flex items-center gap-2 w-full px-2 py-1.5">
                  <span className="text-xs text-gray-500">{g.makerName}</span>
                  <span className="text-xs text-gray-600">({g.studios.length}개 {g.totalWorks}편)</span>
                  <span className="flex-1 border-t border-gray-700" />
                </button>
                {!isCollapsed && g.studios.map(renderStudioRow)}
              </div>
            )
          })}
        </div>

        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-700">
          <input type="text" value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="레이블 이름"
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
                style={{ backgroundColor: color, outline: studios.find(s => s.id === colorPickerId)?.color === color ? '2px solid white' : 'none' }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
