import { useState, useEffect, useMemo } from 'react'
import type React from 'react'
import { studiosApi, studioCodesApi, makersApi } from '../api'

interface StudioWithCount {
  id: number
  name: string
  color: string | null
  work_count: number
  maker_id: number | null
  maker_name: string | null
  maker_color: string | null
  created_at: string | null
  maker_created_at: string | null
}

interface StudioCode {
  id: number
  studio_id: number
  code: string
}

interface Props {
  onClose: () => void
}

type SortBy = 'name' | 'count' | 'maker_created' | 'label_created'

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

  // Label-level state
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [codesMap, setCodesMap] = useState<Record<number, StudioCode[]>>({})
  const [editingCodeId, setEditingCodeId] = useState<number | null>(null)
  const [editingCodeValue, setEditingCodeValue] = useState('')
  const [deletingCodeId, setDeletingCodeId] = useState<number | null>(null)
  const [newCodeMap, setNewCodeMap] = useState<Record<number, string>>({})

  // Maker-level state
  const [editingMakerId, setEditingMakerId] = useState<number | null>(null)
  const [editingMakerName, setEditingMakerName] = useState('')
  const [deletingMakerId, setDeletingMakerId] = useState<number | null>(null)
  const [openAssignMakerId, setOpenAssignMakerId] = useState<number | null>(null)
  const [openAddMakerId, setOpenAddMakerId] = useState<string | null>(null)
  const [addingName, setAddingName] = useState('')
  const [newName, setNewName] = useState('')

  // Label color picker
  const [labelColorPickerId, setLabelColorPickerId] = useState<number | null>(null)
  const [labelColorPickerPos, setLabelColorPickerPos] = useState<{ top: number; left: number } | null>(null)

  // Maker color picker
  const [makerColorPickerId, setMakerColorPickerId] = useState<number | null>(null)
  const [makerColorPickerPos, setMakerColorPickerPos] = useState<{ top: number; left: number } | null>(null)

  const [sortBy, setSortBy] = useState<SortBy>(
    (localStorage.getItem('studiomanager:sortBy') as SortBy) || 'count'
  )
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(
    (localStorage.getItem('studiomanager:sortDir') as 'asc' | 'desc') || 'desc'
  )

  const load = async () => {
    setStudios(await studiosApi.list(true) as StudioWithCount[])
  }

  useEffect(() => { load() }, [])

  const makerGroups = useMemo(() => {
    type MakerGroup = {
      makerId: string
      makerNumId: number | null
      makerName: string
      makerColor: string | null
      makerCreatedAt: string | null
      studios: StudioWithCount[]
      totalWorks: number
    }
    const groups: MakerGroup[] = []
    const groupMap = new Map<string, MakerGroup>()

    for (const s of studios) {
      const key = s.maker_id != null ? String(s.maker_id) : '__none__'
      if (!groupMap.has(key)) {
        const g: MakerGroup = {
          makerId: key,
          makerNumId: s.maker_id,
          makerName: s.maker_name ?? 'UNDEFINED',
          makerColor: s.maker_color ?? null,
          makerCreatedAt: s.maker_created_at ?? null,
          studios: [],
          totalWorks: 0,
        }
        groupMap.set(key, g)
        if (key !== '__none__') groups.push(g)
      }
      groupMap.get(key)!.studios.push(s)
      groupMap.get(key)!.totalWorks += s.work_count
    }

    const dir = sortDir === 'asc' ? 1 : -1

    // Sort internal labels per group
    for (const g of groupMap.values()) {
      if (sortBy === 'name') {
        g.studios.sort((a, b) => a.name.localeCompare(b.name, 'ko-KR', { sensitivity: 'base' }) * dir)
      } else if (sortBy === 'count') {
        g.studios.sort((a, b) => (a.work_count - b.work_count) * dir)
      } else if (sortBy === 'maker_created') {
        g.studios.sort((a, b) => ((a.maker_created_at ?? '') < (b.maker_created_at ?? '') ? -1 : 1) * dir)
      } else {
        g.studios.sort((a, b) => ((a.created_at ?? '') < (b.created_at ?? '') ? -1 : 1) * dir)
      }
    }

    // Sort maker groups
    if (sortBy === 'name') {
      groups.sort((a, b) => a.makerName.localeCompare(b.makerName, 'ko-KR', { sensitivity: 'base' }) * dir)
    } else if (sortBy === 'count') {
      groups.sort((a, b) => (a.totalWorks - b.totalWorks) * dir)
    } else if (sortBy === 'maker_created') {
      groups.sort((a, b) => ((a.makerCreatedAt ?? '') < (b.makerCreatedAt ?? '') ? -1 : 1) * dir)
    } else {
      // label_created: sort makers by max/min studio created_at in their group
      groups.sort((a, b) => {
        const aTs = a.studios.map(s => s.created_at ? new Date(s.created_at).getTime() : 0)
        const bTs = b.studios.map(s => s.created_at ? new Date(s.created_at).getTime() : 0)
        const aVal = sortDir === 'desc' ? Math.max(...aTs) : Math.min(...aTs)
        const bVal = sortDir === 'desc' ? Math.max(...bTs) : Math.min(...bTs)
        return (aVal - bVal) * dir
      })
    }

    // UNDEFINED always last
    const noneGroup = groupMap.get('__none__')
    if (noneGroup && noneGroup.studios.length > 0) groups.push(noneGroup)

    return groups
  }, [studios, sortBy, sortDir])

  const handleSort = (s: SortBy) => {
    const defaultDir = s === 'name' ? 'asc' : 'desc'
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

  // Label operations
  const handleAddLabel = async (makerId: string, makerColor: string | null) => {
    const name = addingName.trim()
    if (!name) return
    const numId = makerId === '__none__' ? null : parseInt(makerId)
    await studiosApi.create(name, numId, makerColor)
    setAddingName('')
    setOpenAddMakerId(null)
    load()
  }

  const handleSaveLabelEdit = async (studio: StudioWithCount) => {
    const name = editingName.trim()
    if (!name) return
    await studiosApi.update(studio.id, name, studio.color ?? hashColor(studio.name))
    setEditingId(null)
    load()
  }

  const handleDeleteLabel = async (id: number) => {
    await studiosApi.delete(id)
    setDeletingId(null)
    load()
  }

  const handleCreateUnassigned = async () => {
    const name = newName.trim()
    if (!name) return
    await studiosApi.create(name)
    setNewName('')
    load()
  }

  // Maker operations
  const handleSaveMakerEdit = async (makerNumId: number, makerColor: string | null) => {
    const name = editingMakerName.trim()
    if (!name) return
    await makersApi.update(makerNumId, name, makerColor)
    setEditingMakerId(null)
    load()
  }

  const handleDeleteMaker = async (id: number) => {
    await makersApi.delete(id)
    setDeletingMakerId(null)
    if (openAssignMakerId === id) setOpenAssignMakerId(null)
    load()
  }

  // Code operations
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
    await studioCodesApi.applyToWorks(studioId, code)
    setNewCodeMap((prev) => ({ ...prev, [studioId]: '' }))
    await loadCodes(studioId)
    load()
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

  // Color pickers
  const handleOpenLabelColorPicker = (e: React.MouseEvent<HTMLButtonElement>, id: number) => {
    if (labelColorPickerId === id) { setLabelColorPickerId(null); setLabelColorPickerPos(null); return }
    setMakerColorPickerId(null); setMakerColorPickerPos(null)
    const r = e.currentTarget.getBoundingClientRect()
    const panelH = 250
    const top = r.bottom + 4 + panelH > window.innerHeight ? r.top - panelH - 4 : r.bottom + 4
    setLabelColorPickerId(id)
    setLabelColorPickerPos({ top, left: r.left })
  }

  const handleSelectLabelColor = async (color: string) => {
    if (labelColorPickerId === null) return
    const studio = studios.find(s => s.id === labelColorPickerId)
    if (studio) await studiosApi.update(studio.id, studio.name, color)
    setLabelColorPickerId(null); setLabelColorPickerPos(null)
    load()
  }

  const handleOpenMakerColorPicker = (e: React.MouseEvent<HTMLButtonElement>, id: number) => {
    if (makerColorPickerId === id) { setMakerColorPickerId(null); setMakerColorPickerPos(null); return }
    setLabelColorPickerId(null); setLabelColorPickerPos(null)
    const r = e.currentTarget.getBoundingClientRect()
    const panelH = 250
    const top = r.bottom + 4 + panelH > window.innerHeight ? r.top - panelH - 4 : r.bottom + 4
    setMakerColorPickerId(id)
    setMakerColorPickerPos({ top, left: r.left })
  }

  const handleSelectMakerColor = async (color: string) => {
    if (makerColorPickerId === null) return
    const assignedStudios = studios.filter(s => s.maker_id === makerColorPickerId)
    const maker = assignedStudios[0]
    if (maker) {
      await makersApi.update(makerColorPickerId, maker.maker_name!, color)
      const allSameColor = assignedStudios.length > 0 &&
        assignedStudios.every(s => s.color === assignedStudios[0].color)
      if (allSameColor || assignedStudios.length <= 1) {
        await Promise.all(assignedStudios.map(s => studiosApi.update(s.id, s.name, color)))
      }
    }
    setMakerColorPickerId(null); setMakerColorPickerPos(null)
    load()
  }

  const renderStudioRow = (studio: StudioWithCount) => (
    <div key={studio.id}>
      <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-700/50 ml-4">
        <button
          onClick={(e) => handleOpenLabelColorPicker(e, studio.id)}
          className="shrink-0 w-5 h-5 rounded border-2 border-gray-600 hover:border-gray-400"
          style={{ backgroundColor: resolvedColor(studio.name, studio.color) }}
        />
        {editingId === studio.id ? (
          <input
            autoFocus
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveLabelEdit(studio); if (e.key === 'Escape') setEditingId(null) }}
            className="bg-gray-700 text-white text-sm px-2 py-0.5 rounded flex-1"
          />
        ) : (
          <button onClick={() => handleToggleExpand(studio.id)} className="text-white text-sm flex-1 text-left hover:text-blue-300">
            {studio.name}
          </button>
        )}
        <span className="text-gray-500 text-xs w-10 text-right shrink-0">{studio.work_count}편</span>
        {deletingId === studio.id ? (
          <>
            <span className="text-red-400 text-xs">삭제?</span>
            <button onClick={() => handleDeleteLabel(studio.id)} className="text-red-400 hover:text-red-300 text-xs px-2 py-0.5 rounded border border-red-800">확인</button>
            <button onClick={() => setDeletingId(null)} className="text-gray-400 hover:text-gray-300 text-xs px-2 py-0.5 rounded border border-gray-600">취소</button>
          </>
        ) : editingId === studio.id ? (
          <>
            <button onClick={() => handleSaveLabelEdit(studio)} className="text-blue-400 hover:text-blue-300 text-xs px-2 py-0.5 rounded border border-blue-400">저장</button>
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
        <div className="ml-12 mb-1 space-y-0.5">
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-[540px] h-[95vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">제작사/레이블 관리</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="flex gap-1.5 mb-3">
          {([
            { key: 'name' as const, label: '이름' },
            { key: 'count' as const, label: '작품' },
            { key: 'maker_created' as const, label: '제작사등록' },
            { key: 'label_created' as const, label: '레이블등록' },
          ]).map(({ key, label }) => {
            const isActive = sortBy === key
            return (
              <button key={key} onClick={() => handleSort(key)}
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
            const isNone = g.makerId === '__none__'
            const makerColor = resolvedColor(g.makerName, g.makerColor)
            const assignedStudios = isNone ? [] : studios.filter(s => s.maker_id === g.makerNumId)
            const unassignedStudios = studios.filter(s => s.maker_id == null)
            const isAssignOpen = !isNone && openAssignMakerId === g.makerNumId
            const isEditing = !isNone && editingMakerId === g.makerNumId
            const isDeleting = !isNone && deletingMakerId === g.makerNumId

            return (
              <div key={g.makerId}>
                {/* Maker row */}
                <div className="flex items-center gap-2 px-2 py-1.5">
                  {!isNone ? (
                    <button
                      onClick={(e) => handleOpenMakerColorPicker(e, g.makerNumId!)}
                      className="shrink-0 w-6 h-6 rounded border-2 border-gray-600 hover:border-gray-400"
                      style={{ backgroundColor: makerColor }}
                    />
                  ) : (
                    <div className="shrink-0 w-6 h-6" />
                  )}

                  {isEditing ? (
                    <>
                      <input
                        autoFocus
                        value={editingMakerName}
                        onChange={(e) => setEditingMakerName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveMakerEdit(g.makerNumId!, g.makerColor)
                          if (e.key === 'Escape') setEditingMakerId(null)
                        }}
                        className="bg-gray-700 text-white text-sm px-2 py-0.5 rounded flex-1"
                      />
                      <button onClick={() => handleSaveMakerEdit(g.makerNumId!, g.makerColor)} className="text-blue-400 hover:text-blue-300 text-xs px-2 py-0.5 rounded border border-blue-400 shrink-0">저장</button>
                      <button onClick={() => setEditingMakerId(null)} className="text-gray-400 hover:text-gray-300 text-xs px-2 py-0.5 rounded border border-gray-600 shrink-0">취소</button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-bold shrink-0" style={{ color: isNone ? '#9ca3af' : makerColor }}>
                        {g.makerName}
                      </span>
                      <span className="flex-1 border-t border-gray-700 min-w-0" />
                      <span className="text-xs text-gray-400 shrink-0">작품:{g.totalWorks}편</span>
                      {!isNone && (
                        isDeleting ? (
                          <>
                            <span className="text-red-400 text-xs shrink-0">삭제?</span>
                            <button onClick={() => handleDeleteMaker(g.makerNumId!)} className="text-red-400 hover:text-red-300 text-xs px-2 py-0.5 rounded border border-red-800 shrink-0">확인</button>
                            <button onClick={() => setDeletingMakerId(null)} className="text-gray-400 hover:text-gray-300 text-xs px-2 py-0.5 rounded border border-gray-600 shrink-0">취소</button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => { setOpenAssignMakerId(isAssignOpen ? null : g.makerNumId!); setOpenAddMakerId(null) }}
                              className={`text-xs px-2 py-0.5 rounded border shrink-0 ${isAssignOpen ? 'bg-blue-700 text-blue-200 border-blue-700' : 'border-gray-600 text-gray-400 hover:text-white'}`}
                            >지정</button>
                            <button
                              onClick={() => { setOpenAddMakerId(openAddMakerId === g.makerId ? null : g.makerId); setAddingName(''); setOpenAssignMakerId(null) }}
                              className={`text-xs px-2 py-0.5 rounded border shrink-0 ${openAddMakerId === g.makerId ? 'bg-green-700 text-green-200 border-green-700' : 'border-gray-600 text-gray-400 hover:text-white'}`}
                            >추가</button>
                            <button onClick={() => { setEditingMakerId(g.makerNumId!); setEditingMakerName(g.makerName); setDeletingMakerId(null) }} className="text-gray-400 hover:text-white text-xs px-2 py-0.5 rounded border border-gray-600 shrink-0">수정</button>
                            <button onClick={() => { setDeletingMakerId(g.makerNumId!); setEditingMakerId(null) }} className="text-red-400 hover:text-red-300 text-xs px-2 py-0.5 rounded border border-red-800 shrink-0">삭제</button>
                          </>
                        )
                      )}
                    </>
                  )}
                </div>

                {/* Assign panel (full width, no indent) */}
                {isAssignOpen && (
                  <div className="mb-1 bg-gray-900/50 border border-gray-700 rounded p-2 space-y-2">
                    <div>
                      <p className="text-xs text-gray-400 mb-1">지정 레이블</p>
                      <div className="flex flex-wrap gap-1 min-h-5">
                        {assignedStudios.length === 0 && <span className="text-xs text-gray-600">없음</span>}
                        {assignedStudios.map(s => (
                          <button key={s.id} onClick={() => makersApi.assignStudio(s.id, null).then(load)}
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
                          <button key={s.id} onClick={async () => {
                            await makersApi.assignStudio(s.id, g.makerNumId!)
                            await studiosApi.update(s.id, s.name, resolvedColor(g.makerName, g.makerColor))
                            load()
                          }}
                            className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300 hover:bg-gray-600">{s.name}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Add label form */}
                {openAddMakerId === g.makerId && (
                  <div className="flex gap-1.5 px-2 pb-1.5 ml-4">
                    <input
                      autoFocus
                      type="text"
                      value={addingName}
                      onChange={(e) => setAddingName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddLabel(g.makerId, g.makerColor); if (e.key === 'Escape') setOpenAddMakerId(null) }}
                      placeholder="레이블 이름"
                      className="bg-gray-700 text-white text-sm px-2 py-1 rounded flex-1"
                    />
                    <button
                      onClick={() => handleAddLabel(g.makerId, g.makerColor)}
                      className="text-white text-xs px-3 py-1 rounded shrink-0"
                      style={{ backgroundColor: isNone ? '#374151' : makerColor }}
                    >추가</button>
                  </div>
                )}

                {/* Label rows */}
                <div className="space-y-0.5">
                  {g.studios.map(renderStudioRow)}
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-700">
          <input type="text" value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateUnassigned()}
            placeholder="레이블 이름 (미분류)"
            className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded flex-1"
          />
          <button onClick={handleCreateUnassigned} className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-3 py-1.5 rounded">추가</button>
        </div>
      </div>

      {/* Label color picker */}
      {labelColorPickerId !== null && labelColorPickerPos && (
        <div
          className="fixed z-[200] p-1.5 bg-gray-900 rounded border border-gray-700 shadow-xl"
          style={{ top: labelColorPickerPos.top, left: labelColorPickerPos.left, width: 250, height: 250 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-10 gap-px h-full">
            {COLOR_PALETTE.map((color, i) => (
              <button key={i} onClick={() => handleSelectLabelColor(color)}
                className="rounded-sm hover:scale-110 transition-transform"
                style={{ backgroundColor: color, outline: studios.find(s => s.id === labelColorPickerId)?.color === color ? '2px solid white' : 'none' }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Maker color picker */}
      {makerColorPickerId !== null && makerColorPickerPos && (
        <div
          className="fixed z-[200] p-1.5 bg-gray-900 rounded border border-gray-700 shadow-xl"
          style={{ top: makerColorPickerPos.top, left: makerColorPickerPos.left, width: 250, height: 250 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-10 gap-px h-full">
            {COLOR_PALETTE.map((color, i) => (
              <button key={i} onClick={() => handleSelectMakerColor(color)}
                className="rounded-sm hover:scale-110 transition-transform"
                style={{ backgroundColor: color, outline: studios.find(s => s.maker_id === makerColorPickerId)?.maker_color === color ? '2px solid white' : 'none' }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
