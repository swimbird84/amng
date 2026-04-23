import { useState } from 'react'
import type { Tag } from '../types'

interface Props {
  allTags: Tag[]
  selectedIds: number[]
  onChange: (ids: number[]) => void
  onCreateTag: (name: string) => Promise<number>
  repTagIds?: number[]
  onChangeRep?: (ids: number[]) => void
}

export default function TagSelector({ allTags, selectedIds, onChange, onCreateTag, repTagIds, onChangeRep }: Props) {
  const [open, setOpen] = useState(false)
  const [newTag, setNewTag] = useState('')

  const toggle = (id: number) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((t) => t !== id))
      // 대표 태그에서도 제거
      if (onChangeRep && repTagIds?.includes(id)) {
        onChangeRep(repTagIds.filter((t) => t !== id))
      }
    } else {
      onChange([...selectedIds, id])
    }
  }

  const toggleRep = (id: number) => {
    if (!onChangeRep || !repTagIds) return
    if (repTagIds.includes(id)) {
      onChangeRep(repTagIds.filter((t) => t !== id))
    } else {
      onChangeRep([...repTagIds, id])
    }
  }

  const handleCreate = async () => {
    const name = newTag.trim()
    if (!name) return
    const tagId = await onCreateTag(name)
    if (tagId && !selectedIds.includes(tagId)) {
      onChange([...selectedIds, tagId])
    }
    setNewTag('')
  }

  const selectedTags = allTags.filter((t) => selectedIds.includes(t.id))

  return (
    <div>
      {/* 헤더 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 mb-1.5 cursor-pointer"
      >
        <span className="text-sm text-gray-400 hover:text-gray-200">태그</span>
        <span className="text-white font-black text-base leading-none hover:text-gray-300">
          {open ? '−' : '+'}
        </span>
      </button>

      {/* 선택된 태그 칩 (항상 표시) - 클릭시 대표 태그 토글 */}
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {selectedTags.map((t) => {
            const isRep = repTagIds?.includes(t.id)
            return (
              <span
                key={t.id}
                onClick={() => toggleRep(t.id)}
                title={onChangeRep ? (isRep ? '대표 태그 해제' : '대표 태그로 설정') : undefined}
                className={`text-xs px-2 py-0.5 rounded ${onChangeRep ? 'cursor-pointer' : ''} ${
                  isRep
                    ? 'bg-green-700 text-green-200'
                    : 'bg-blue-900/60 text-blue-300'
                }`}
              >
                {t.name}
              </span>
            )
          })}
        </div>
      )}

      {/* 펼쳐지는 전체 목록 */}
      {open && (
        <div className="border border-gray-700 rounded-lg p-2 space-y-2">
          {/* 새 태그 입력 - 박스 최상단 */}
          <div className="flex gap-1">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="새 태그 입력 (이미 있으면 선택됨)"
              className="bg-gray-700 text-white text-sm px-2 py-1 rounded flex-1"
            />
            <button
              type="button"
              onClick={handleCreate}
              className="bg-gray-600 hover:bg-gray-500 text-white text-sm px-2 py-1 rounded"
            >
              추가
            </button>
          </div>
          <div className="border-t border-gray-700" />
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((tag) => {
              const isSelected = selectedIds.includes(tag.id)
              const isRep = repTagIds?.includes(tag.id)
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggle(tag.id)}
                  className={`px-2 py-0.5 rounded text-sm ${
                    isRep
                      ? 'bg-green-600 text-white'
                      : isSelected
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {tag.name}
                </button>
              )
            })}
            {allTags.length === 0 && (
              <span className="text-xs text-gray-500">등록된 태그가 없습니다</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
