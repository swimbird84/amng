import { useState, useEffect, useCallback, useRef } from 'react'
import { tierApi } from '../api'
import ImagePreview from './ImagePreview'
import CardTooltip, { type TooltipState } from './CardTooltip'

interface TierLevel {
  id: number
  set_id: number
  name: string
  color: string
  sort_order: number
}

interface TierItem {
  id: number
  set_id: number
  level_id: number
  item_id: number
  sort_order: number
  name: string
  photo_path: string | null
}

interface UnplacedItem {
  id: number
  name: string
  photo_path: string | null
}

interface Props {
  setId: number
  setName: string
  setType: 'actor' | 'work'
  onBack: () => void
  onNavigateToActor: (id: number) => void
  onNavigateToWork: (id: number) => void
}

const DEFAULT_COLORS = ['#ff7f7f', '#ffbf7f', '#ffdf7f', '#ffff7f', '#bfff7f', '#7fffff', '#7fbfff', '#bf7fff']

export default function TierEditor({ setId, setName, setType, onBack, onNavigateToActor, onNavigateToWork }: Props) {
  const [levels, setLevels] = useState<TierLevel[]>([])
  const [items, setItems] = useState<TierItem[]>([])
  const [unplaced, setUnplaced] = useState<UnplacedItem[]>([])
  const [unplacedTotal, setUnplacedTotal] = useState(0)
  const [unplacedOffset, setUnplacedOffset] = useState(0)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [editLevel, setEditLevel] = useState<TierLevel | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [showAddLevel, setShowAddLevel] = useState(false)
  const [newLevelName, setNewLevelName] = useState('')
  const [newLevelColor, setNewLevelColor] = useState(DEFAULT_COLORS[0])
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dropIndicator, setDropIndicator] = useState<{ levelId: number; index: number } | null>(null)

  const POOL_LIMIT = 100

  const loadLevels = useCallback(async () => {
    const data = await tierApi.listLevels(setId) as TierLevel[]
    setLevels(data)
  }, [setId])

  const loadItems = useCallback(async () => {
    const data = await tierApi.listItems(setId) as TierItem[]
    setItems(data)
  }, [setId])

  const loadUnplaced = useCallback(async (offset: number) => {
    const data = await tierApi.getUnplacedItems(setId, offset, POOL_LIMIT)
    setUnplaced(data.items)
    setUnplacedTotal(data.total)
    setUnplacedOffset(offset)
  }, [setId])

  useEffect(() => {
    loadLevels()
    loadItems()
    loadUnplaced(0)
  }, [loadLevels, loadItems, loadUnplaced])

  const getItemsForLevel = (levelId: number) => items.filter(i => i.level_id === levelId).sort((a, b) => a.sort_order - b.sort_order)

  // Tier level actions
  const handleAddLevel = async () => {
    if (!newLevelName.trim()) return
    await tierApi.createLevel(setId, { name: newLevelName.trim(), color: newLevelColor })
    setNewLevelName('')
    setNewLevelColor(DEFAULT_COLORS[(levels.length + 1) % DEFAULT_COLORS.length])
    setShowAddLevel(false)
    loadLevels()
  }

  const handleUpdateLevel = async () => {
    if (!editLevel || !editName.trim()) return
    await tierApi.updateLevel(editLevel.id, { name: editName.trim(), color: editColor })
    setEditLevel(null)
    loadLevels()
  }

  const handleDeleteLevel = async () => {
    if (!editLevel) return
    if (!confirm(`"${editLevel.name}" 티어를 삭제하시겠습니까? 배치된 아이템도 해제됩니다.`)) return
    await tierApi.deleteLevel(editLevel.id)
    setEditLevel(null)
    loadLevels()
    loadItems()
    loadUnplaced(0)
  }

  const handleMoveLevel = async (levelId: number, dir: 'up' | 'down') => {
    await tierApi.moveLevel(setId, levelId, dir)
    loadLevels()
  }

  // Drag & drop
  const handleDragStart = (e: React.DragEvent, itemId: number) => {
    e.dataTransfer.setData('text/plain', String(itemId))
    e.dataTransfer.effectAllowed = 'move'
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null }
    setTooltip(null)
    setDraggingId(itemId)
    // Semi-transparent drag image
    const el = e.currentTarget as HTMLElement
    if (el) { e.dataTransfer.setDragImage(el, 28, 28) }
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDropIndicator(null)
  }

  const calcDropIndex = (e: React.DragEvent, levelId: number) => {
    const container = e.currentTarget as HTMLElement
    const children = Array.from(container.querySelectorAll('[data-tier-item]')) as HTMLElement[]
    for (let i = 0; i < children.length; i++) {
      const rect = children[i].getBoundingClientRect()
      if (e.clientX < rect.left + rect.width / 2) return i
    }
    return children.length
  }

  const handleDragOverLevel = (e: React.DragEvent, levelId: number) => {
    e.preventDefault()
    const idx = calcDropIndex(e, levelId)
    setDropIndicator({ levelId, index: idx })
  }

  const handleDragLeaveLevel = () => {
    setDropIndicator(null)
  }

  const handleDropOnLevel = async (e: React.DragEvent, levelId: number) => {
    e.preventDefault()
    const itemId = parseInt(e.dataTransfer.getData('text/plain'))
    if (isNaN(itemId)) return
    const idx = calcDropIndex(e, levelId)
    await tierApi.setItem(setId, levelId, itemId, idx)
    setDraggingId(null)
    setDropIndicator(null)
    loadItems()
    loadUnplaced(unplacedOffset)
  }

  const handleDropOnPool = async (e: React.DragEvent) => {
    e.preventDefault()
    const itemId = parseInt(e.dataTransfer.getData('text/plain'))
    if (isNaN(itemId)) return
    await tierApi.removeItem(setId, itemId)
    setDraggingId(null)
    setDropIndicator(null)
    loadItems()
    loadUnplaced(unplacedOffset)
  }

  const handleItemClick = (itemId: number) => {
    if (setType === 'actor') onNavigateToActor(itemId)
    else onNavigateToWork(itemId)
  }

  const handleMouseEnter = (e: React.MouseEvent, itemId: number) => {
    hoverTimer.current = setTimeout(() => {
      setTooltip({ type: setType, id: itemId, x: e.clientX, y: e.clientY, showCover: true })
    }, 400)
  }

  const handleMouseLeave = () => {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null }
    setTooltip(null)
  }

  const handleFillPool = () => {
    const newOffset = unplacedOffset + POOL_LIMIT
    if (newOffset < unplacedTotal) loadUnplaced(newOffset)
  }

  const poolDisplayCount = unplaced.length
  const canFill = unplacedOffset + POOL_LIMIT < unplacedTotal

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 shrink-0 flex items-center gap-3 border-b border-gray-700">
        <button onClick={onBack} className="text-gray-400 hover:text-white text-sm">← 목록</button>
        <span className="text-white font-bold text-base">{setName}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded ${setType === 'actor' ? 'bg-purple-600 text-white' : 'bg-green-600 text-white'}`}>
          {setType === 'actor' ? '배우' : '작품'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Tier rows */}
        {levels.map(level => {
          const levelItems = getItemsForLevel(level.id)
          return (
            <div key={level.id} className="flex mb-1" style={{ minHeight: 80 }}>
              {/* Label */}
              <div
                className="w-16 shrink-0 flex items-center justify-center cursor-pointer font-bold text-sm text-white rounded-l"
                style={{ backgroundColor: level.color }}
                onClick={() => { setEditLevel(level); setEditName(level.name); setEditColor(level.color) }}
              >
                {level.name}
              </div>

              {/* Items area */}
              <div
                className="flex-1 flex flex-wrap gap-1 p-1 bg-gray-800 border border-gray-700 min-h-[64px] items-stretch content-start"
                onDragOver={e => handleDragOverLevel(e, level.id)}
                onDragLeave={handleDragLeaveLevel}
                onDrop={e => handleDropOnLevel(e, level.id)}
              >
                {levelItems.map((item, idx) => (
                  <div key={item.item_id} className="flex items-center">
                    {dropIndicator?.levelId === level.id && dropIndicator.index === idx && (
                      <div className="w-1 h-full bg-blue-500 rounded shrink-0 mr-0.5" />
                    )}
                    <div
                      data-tier-item
                      className={`h-full ${setType === 'actor' ? 'aspect-square' : 'aspect-[800/540]'} rounded overflow-hidden cursor-pointer border border-gray-600 hover:border-gray-400 transition ${draggingId === item.item_id ? 'opacity-30' : ''} relative`}
                      draggable
                      onDragStart={e => handleDragStart(e, item.item_id)}
                      onDragEnd={handleDragEnd}
                      onClick={() => handleItemClick(item.item_id)}
                      onMouseEnter={e => handleMouseEnter(e, item.item_id)}
                      onMouseLeave={handleMouseLeave}
                    >
                      <ImagePreview path={item.photo_path} alt={item.name} className="w-full h-full" />
                      {!item.photo_path && <span className="absolute inset-0 flex items-center justify-center text-gray-400 text-[10px] leading-tight text-center px-0.5">{item.name}</span>}
                    </div>
                  </div>
                ))}
                {dropIndicator?.levelId === level.id && dropIndicator.index === levelItems.length && (
                  <div className="w-1 h-full bg-blue-500 rounded shrink-0" />
                )}
              </div>

              {/* Move buttons */}
              <div className="w-8 shrink-0 flex flex-col items-center justify-center bg-gray-800 border-r border-y border-gray-700 rounded-r">
                <button onClick={() => handleMoveLevel(level.id, 'up')} className="text-gray-400 hover:text-white text-xs py-1">∧</button>
                <button onClick={() => handleMoveLevel(level.id, 'down')} className="text-gray-400 hover:text-white text-xs py-1">∨</button>
              </div>
            </div>
          )
        })}

        {/* Add tier button */}
        {showAddLevel ? (
          <div className="flex items-center gap-2 mb-4">
            <input
              autoFocus
              value={newLevelName}
              onChange={e => setNewLevelName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddLevel(); if (e.key === 'Escape') setShowAddLevel(false) }}
              placeholder="티어 이름"
              className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 w-24"
            />
            <input
              type="color"
              value={newLevelColor}
              onChange={e => setNewLevelColor(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
            />
            <button onClick={handleAddLevel} className="text-xs text-white bg-blue-600 hover:bg-blue-500 px-2 py-1.5 rounded">추가</button>
            <button onClick={() => setShowAddLevel(false)} className="text-xs text-gray-300 bg-gray-600 hover:bg-gray-500 px-2 py-1.5 rounded">취소</button>
          </div>
        ) : (
          <button
            onClick={() => { setShowAddLevel(true); setNewLevelColor(DEFAULT_COLORS[levels.length % DEFAULT_COLORS.length]) }}
            className="text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded mb-4"
          >+ 티어 추가</button>
        )}

        {/* Unplaced pool */}
        <div className="mt-4 border-t border-gray-700 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-gray-300 text-sm font-bold">미배치<span className="font-normal text-gray-500">({unplacedTotal})</span></span>
            <button
              onClick={handleFillPool}
              disabled={!canFill}
              className={`text-xs px-3 py-1 rounded ml-auto ${canFill ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-800 text-gray-600 cursor-not-allowed'}`}
            >채움</button>
          </div>
          <div
            className="grid grid-cols-10 gap-1"
            onDragOver={e => e.preventDefault()}
            onDrop={handleDropOnPool}
          >
            {unplaced.map(item => (
              <div
                key={item.id}
                className={`${setType === 'actor' ? 'aspect-square' : 'aspect-[800/540]'} rounded overflow-hidden cursor-pointer border border-gray-700 hover:border-gray-500 transition ${draggingId === item.id ? 'opacity-30' : ''} relative`}
                draggable
                onDragStart={e => handleDragStart(e, item.id)}
                onDragEnd={handleDragEnd}
                onClick={() => handleItemClick(item.id)}
                onMouseEnter={e => handleMouseEnter(e, item.id)}
                onMouseLeave={handleMouseLeave}
              >
                <ImagePreview path={item.photo_path} alt={item.name} className="w-full h-full" />
                {!item.photo_path && <span className="absolute inset-0 flex items-center justify-center text-gray-400 text-[10px] leading-tight text-center px-0.5">{item.name}</span>}
              </div>
            ))}
          </div>
          {poolDisplayCount === 0 && unplacedTotal === 0 && (
            <p className="text-gray-500 text-sm text-center py-4">모든 아이템이 배치되었습니다</p>
          )}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && <CardTooltip tooltip={tooltip} />}

      {/* Edit level modal */}
      {editLevel && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setEditLevel(null)}>
          <div className="bg-gray-800 rounded-lg p-5 w-72" onClick={e => e.stopPropagation()}>
            <p className="text-white text-sm font-bold mb-4">티어 편집</p>
            <div className="flex items-center gap-2 mb-3">
              <input
                autoFocus
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleUpdateLevel() }}
                className="flex-1 bg-gray-700 text-white text-sm px-3 py-2 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <input
                type="color"
                value={editColor}
                onChange={e => setEditColor(e.target.value)}
                className="w-10 h-10 rounded cursor-pointer border-0 bg-transparent"
              />
            </div>
            <div className="flex justify-between">
              <button onClick={handleDeleteLevel} className="text-sm text-red-400 hover:text-red-300 px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600">삭제</button>
              <div className="flex gap-2">
                <button onClick={() => setEditLevel(null)} className="text-sm text-gray-300 bg-gray-600 hover:bg-gray-500 px-3 py-1.5 rounded">취소</button>
                <button onClick={handleUpdateLevel} className="text-sm text-white bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded">저장</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
