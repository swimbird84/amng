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
  studios: { id: number; name: string; maker_id?: number | null; maker_name?: string | null }[]
  resultCount?: number
}

interface ActorSearchProps {
  type: 'actors'
  params: ActorSearchParams
  onChange: (params: ActorSearchParams) => void
  tags: Tag[]
  resultCount?: number
}

type Props = WorkSearchProps | ActorSearchProps

export type { WorkSearchParams, ActorSearchParams, TagMode }

export default function SearchBar(props: Props) {
  const { type, params, onChange, tags, resultCount } = props
  const actors = type === 'works' ? (props as WorkSearchProps).actors : []
  const studios = type === 'works' ? (props as WorkSearchProps).studios : []

  const [tagOpen, setTagOpen] = useState(false)
  const [tagFilter, setTagFilter] = useState('')
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })
  const [savedTagIds, setSavedTagIds] = useState<number[] | null>(null)

  const isNoTag = params.tagIds.length === 1 && params.tagIds[0] === -1

  const toggleNoTag = () => {
    if (isNoTag) {
      onChange({ ...params, tagIds: savedTagIds ?? [] } as never)
      setSavedTagIds(null)
    } else {
      setSavedTagIds(params.tagIds)
      onChange({ ...params, tagIds: [-1] } as never)
    }
  }
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
        className={`bg-gray-700 text-white text-sm px-2 py-1.5 rounded ${type === 'works' ? 'w-24 shrink-0' : 'flex-1'}`}
      />

      {type === 'works' && (() => {
        const sorted = [...studios].sort((a, b) => {
          const ma = a.maker_name ?? ''
          const mb = b.maker_name ?? ''
          const mc = ma.localeCompare(mb, 'ko-KR', { sensitivity: 'base' })
          if (mc !== 0) return mc
          return a.name.localeCompare(b.name, 'ko-KR', { sensitivity: 'base' })
        })
        return (
          <select
            value={(params as WorkSearchParams).studioId}
            onChange={(e) => onChange({ ...params, studioId: e.target.value ? Number(e.target.value) : '' } as never)}
            className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-28 shrink-0"
          >
            <option value="">레이블 전체</option>
            <option value="-1">레이블 없음</option>
            {sorted.map((s) => (
              <option key={s.id} value={s.id}>
                {s.maker_name && s.maker_name !== s.name ? `${s.maker_name} ${s.name}` : s.name}
              </option>
            ))}
          </select>
        )
      })()}

      {type === 'works' && (
        <select
          value={(params as WorkSearchParams).actorId}
          onChange={(e) => onChange({ ...params, actorId: e.target.value ? Number(e.target.value) : '' } as never)}
          className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-24 shrink-0"
        >
          <option value="">배우 전체</option>
          <option value="-1">배우 없음</option>
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
          <span className="text-gray-500 text-xs">▼</span>
        </button>

        {tagOpen && (
          <div
            ref={popoverRef}
            className="fixed z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-[min(63rem,90vw)]"
            style={{ top: dropdownPos.top, left: dropdownPos.left }}
          >
            <div className="p-2 border-b border-gray-700 space-y-1.5">
              <div className="flex gap-1">
                <input
                  type="text"
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                  placeholder="태그 검색"
                  className="bg-gray-700 text-white text-xs px-2 py-1 rounded min-w-0"
                  style={{ flex: '6' }}
                  autoFocus
                />
                <button
                  onClick={() => { setSavedTagIds(null); onChange({ ...params, tagIds: [] } as never) }}
                  className="text-xs py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600"
                  style={{ flex: '2' }}
                >
                  선택초기화
                </button>
                <button
                  onClick={toggleNoTag}
                  className={`text-xs py-1 rounded ${isNoTag ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                  style={{ flex: '2' }}
                >
                  태그 없음
                </button>
              </div>
              {params.tagIds.length > 1 && !(isNoTag) && (
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
            <div className={`max-h-[39rem] overflow-y-auto p-2 ${isNoTag ? 'opacity-40 pointer-events-none' : ''}`}>
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
          </div>
        )}
      </div>
      {resultCount !== undefined && (
          <div className="w-28 shrink-0 bg-gray-700 rounded px-2 py-1.5 text-sm text-gray-300 text-left">
            결과 : {resultCount}
          </div>
      )}
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
