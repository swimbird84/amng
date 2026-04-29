import { useState, useRef, useEffect } from 'react'
import type { Tag, Actor } from '../types'

type TagMode = 'and' | 'or'

interface WorkSearchParams {
  keyword: string
  tagIds: number[]
  tagMode: TagMode
  actorId: number | ''
  studioId: number | ''
}

interface ActorSearchParams {
  keyword: string
  tagIds: number[]
  tagMode: TagMode
}

interface WorkSearchProps {
  type: 'works'
  params: WorkSearchParams
  onChange: (params: WorkSearchParams) => void
  tags: Tag[]
  actors: Actor[]
  studios: { id: number; name: string }[]
}

interface ActorSearchProps {
  type: 'actors'
  params: ActorSearchParams
  onChange: (params: ActorSearchParams) => void
  tags: Tag[]
}

type Props = WorkSearchProps | ActorSearchProps

export type { WorkSearchParams, ActorSearchParams, TagMode }

export default function SearchBar(props: Props) {
  const { type, params, onChange, tags } = props
  const actors = type === 'works' ? (props as WorkSearchProps).actors : []
  const studios = type === 'works' ? (props as WorkSearchProps).studios : []

  const [tagOpen, setTagOpen] = useState(false)
  const [tagFilter, setTagFilter] = useState('')
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!tagOpen) return
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setTagOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [tagOpen])

  const handleToggleDropdown = () => {
    if (!tagOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const dropdownWidth = Math.min(window.innerWidth * 0.9, 63 * 16)
      const left = Math.min(rect.left, window.innerWidth - dropdownWidth - 8)
      setDropdownPos({ top: rect.bottom + 4, left: Math.max(8, left) })
    }
    setTagOpen((v) => !v)
  }

  const filteredTags = tagFilter
    ? tags.filter((t) => t.name.toLowerCase().includes(tagFilter.toLowerCase()))
    : tags

  const toggleTag = (id: number) => {
    const active = params.tagIds.includes(id)
    const tagIds = active ? params.tagIds.filter((x) => x !== id) : [...params.tagIds, id]
    onChange({ ...params, tagIds } as never)
  }

  return (
    <>
      <input
        type="text"
        value={params.keyword}
        onChange={(e) => onChange({ ...params, keyword: e.target.value } as never)}
        placeholder={type === 'works' ? '품번 검색' : '이름 검색'}
        className={`bg-gray-700 text-white text-sm px-2 py-1.5 rounded ${type === 'works' ? 'w-20 shrink-0' : 'flex-1'}`}
      />

      {type === 'works' && (
          <select
              value={(params as WorkSearchParams).studioId}
              onChange={(e) => onChange({ ...params, studioId: e.target.value ? Number(e.target.value) : '' } as never)}
              className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-28 shrink-0"
          >
            <option value="">레이블 전체</option>
            {studios.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
      )}

      {type === 'works' && (
        <select
          value={(params as WorkSearchParams).actorId}
          onChange={(e) => onChange({ ...params, actorId: e.target.value ? Number(e.target.value) : '' } as never)}
          className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-24 shrink-0"
        >
          <option value="">배우 전체</option>
          {actors.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      )}

      {/* 태그 드롭다운 */}
      <div className="relative">
        <button
          ref={buttonRef}
          onClick={handleToggleDropdown}
          className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-sm ${
            tagOpen ? 'bg-gray-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          태그
          {params.tagIds.length > 0 ? (
            <span className="text-blue-400 text-xs">{params.tagIds.length}</span>
          ) : (
            <span className="text-gray-500 text-xs">▼</span>
          )}
        </button>

        {tagOpen && (
          <div
            ref={popoverRef}
            className="fixed z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-[min(63rem,90vw)]"
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
          >
            <div className="p-2 border-b border-gray-700 space-y-1.5">
              <input
                type="text"
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                placeholder="태그 검색"
                className="w-full bg-gray-700 text-white text-xs px-2 py-1 rounded"
                autoFocus
              />
              {params.tagIds.length > 1 && (
                <div className="flex gap-1">
                  <button
                    onClick={() => onChange({ ...params, tagMode: 'and' } as never)}
                    className={`flex-1 text-xs py-0.5 rounded ${params.tagMode === 'and' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                  >
                    AND
                  </button>
                  <button
                    onClick={() => onChange({ ...params, tagMode: 'or' } as never)}
                    className={`flex-1 text-xs py-0.5 rounded ${params.tagMode === 'or' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}
                  >
                    OR
                  </button>
                </div>
              )}
            </div>
            <div className="max-h-[39rem] overflow-y-auto p-2">
              {filteredTags.length === 0 && (
                <p className="text-xs text-gray-500 w-full text-center py-2">태그 없음</p>
              )}
              {filteredTags.length > 0 && (tagFilter ? (
                <div className="flex flex-wrap gap-1">
                  {filteredTags.map((t) => {
                    const active = params.tagIds.includes(t.id)
                    return (
                      <button
                        key={t.id}
                        onClick={() => toggleTag(t.id)}
                        className={`px-2 py-0.5 rounded text-xs ${
                          active ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {t.name}
                      </button>
                    )
                  })}
                </div>
              ) : (() => {
                type Group = { catId: number | null; catName: string | null; sortOrder: number; tags: Tag[] }
                const catMap = new Map<number | null, Group>()
                const groups: Group[] = []
                for (const tag of tags) {
                  const key = tag.category_id ?? null
                  if (!catMap.has(key)) {
                    const g: Group = { catId: key, catName: tag.category_name ?? null, sortOrder: tag.category_sort_order ?? 999999, tags: [] }
                    catMap.set(key, g)
                    groups.push(g)
                  }
                  catMap.get(key)!.tags.push(tag)
                }
                groups.sort((a, b) => {
                  if (a.catId === null) return 1
                  if (b.catId === null) return -1
                  return a.sortOrder - b.sortOrder
                })
                return (
                  <div className="space-y-2">
                    {groups.map((g) => (
                      <div key={g.catId ?? 'none'}>
                        <p className="text-xs text-gray-500 mb-1 border-b border-gray-700 pb-0.5">{g.catName ?? '미분류'}</p>
                        <div className="flex flex-wrap gap-1">
                          {g.tags.map((t) => {
                            const active = params.tagIds.includes(t.id)
                            return (
                              <button
                                key={t.id}
                                onClick={() => toggleTag(t.id)}
                                className={`px-2 py-0.5 rounded text-xs ${
                                  active ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                }`}
                              >
                                {t.name}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })())}
            </div>
            {params.tagIds.length > 0 && (
              <div className="p-2 border-t border-gray-700">
                <button
                  onClick={() => onChange({ ...params, tagIds: [] } as never)}
                  className="w-full text-xs text-gray-400 hover:text-white py-0.5"
                >
                  선택 초기화
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <button
        onClick={() => {
          if (type === 'works') {
            onChange({ keyword: '', tagIds: [], tagMode: 'and', actorId: '', studioId: '' } as never)
          } else {
            onChange({ keyword: '', tagIds: [], tagMode: 'and' } as never)
          }
        }}
        className="px-3 py-1.5 rounded text-sm bg-gray-600 hover:bg-gray-500 text-gray-300"
      >
        초기화
      </button>
    </>
  )
}
