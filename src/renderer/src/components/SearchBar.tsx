import { useState, useRef, useEffect } from 'react'
import type { Tag, Actor } from '../types'

type TagMode = 'and' | 'or'

interface WorkSearchParams {
  keyword: string
  tagIds: number[]
  tagMode: TagMode
  releaseDateFrom: string
  releaseDateTo: string
  ratingFrom: string
  ratingTo: string
  actorId: number | ''
}

interface ActorSearchParams {
  keyword: string
  tagIds: number[]
  tagMode: TagMode
  ageFrom: string
  ageTo: string
  ratingFrom: string
  ratingTo: string
}

interface WorkSearchProps {
  type: 'works'
  params: WorkSearchParams
  onChange: (params: WorkSearchParams) => void
  tags: Tag[]
  actors: Actor[]
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

  const [tagOpen, setTagOpen] = useState(false)
  const [tagFilter, setTagFilter] = useState('')
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!tagOpen) return
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setTagOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [tagOpen])

  const filteredTags = tagFilter
    ? tags.filter((t) => t.name.toLowerCase().includes(tagFilter.toLowerCase()))
    : tags

  const toggleTag = (id: number) => {
    const active = params.tagIds.includes(id)
    const tagIds = active ? params.tagIds.filter((x) => x !== id) : [...params.tagIds, id]
    onChange({ ...params, tagIds } as never)
  }

  return (
    <div className="flex flex-wrap gap-3 items-end bg-gray-800 p-3 rounded-lg">
      <label className="flex flex-col gap-1 text-sm text-gray-400">
        {type === 'works' ? '품번' : '이름'}
        <input
          type="text"
          value={params.keyword}
          onChange={(e) => onChange({ ...params, keyword: e.target.value } as never)}
          placeholder="검색..."
          className="bg-gray-700 text-white text-sm px-2 py-1 rounded w-40"
        />
      </label>

      {/* 태그 드롭다운 */}
      <div className="flex flex-col gap-1 text-sm text-gray-400" ref={popoverRef}>
        <span>태그</span>
        <div className="relative">
          <button
            onClick={() => setTagOpen((v) => !v)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-sm ${
              tagOpen ? 'bg-gray-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {params.tagIds.length > 0 ? (
              <span className="text-blue-400">{params.tagIds.length}개 선택</span>
            ) : (
              <span>선택 없음</span>
            )}
            <span className="text-gray-500 text-xs">{tagOpen ? '▲' : '▼'}</span>
          </button>

          {tagOpen && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-[63rem] max-w-[90vw]">
              {/* 검색 + AND/OR */}
              <div className="p-2 border-b border-gray-700 space-y-1.5">
                <input
                  type="text"
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                  placeholder="태그 검색..."
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

              {/* 태그 목록 */}
              <div className="max-h-[39rem] overflow-y-auto p-2 flex flex-wrap gap-1">
                {filteredTags.length === 0 && (
                  <p className="text-xs text-gray-500 w-full text-center py-2">태그 없음</p>
                )}
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

              {/* 선택 초기화 */}
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

        {/* 선택된 태그 칩 (팝오버 외부 표시) */}
        {params.tagIds.length > 0 && (
          <div className="flex flex-wrap gap-1 max-w-xs">
            {tags.filter((t) => params.tagIds.includes(t.id)).map((t) => (
              <span
                key={t.id}
                className="flex items-center gap-0.5 bg-blue-900/60 text-blue-300 text-xs px-1.5 py-0.5 rounded"
              >
                {t.name}
                <button onClick={() => toggleTag(t.id)} className="hover:text-white leading-none">×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {type === 'works' ? (
        <>
          <label className="flex flex-col gap-1 text-sm text-gray-400">
            배우
            <select
              value={(params as WorkSearchParams).actorId}
              onChange={(e) => onChange({ ...params, actorId: e.target.value ? Number(e.target.value) : '' } as never)}
              className="bg-gray-700 text-white text-sm px-2 py-1 rounded w-36"
            >
              <option value="">전체</option>
              {actors.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-400">
            발매일 (시작)
            <input
              type="date"
              value={(params as WorkSearchParams).releaseDateFrom}
              onChange={(e) => onChange({ ...params, releaseDateFrom: e.target.value } as never)}
              className="bg-gray-700 text-white text-sm px-2 py-1 rounded"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-400">
            발매일 (끝)
            <input
              type="date"
              value={(params as WorkSearchParams).releaseDateTo}
              onChange={(e) => onChange({ ...params, releaseDateTo: e.target.value } as never)}
              className="bg-gray-700 text-white text-sm px-2 py-1 rounded"
            />
          </label>
        </>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-sm text-gray-400">
            나이 (최소)
            <input
              type="number"
              value={(params as ActorSearchParams).ageFrom}
              onChange={(e) => onChange({ ...params, ageFrom: e.target.value } as never)}
              className="bg-gray-700 text-white text-sm px-2 py-1 rounded w-20"
              min={0}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-400">
            나이 (최대)
            <input
              type="number"
              value={(params as ActorSearchParams).ageTo}
              onChange={(e) => onChange({ ...params, ageTo: e.target.value } as never)}
              className="bg-gray-700 text-white text-sm px-2 py-1 rounded w-20"
              min={0}
            />
          </label>
        </>
      )}

      {type === 'works' ? (
        <>
          <label className="flex flex-col gap-1 text-sm text-gray-400">
            별점 (최소)
            <select
              value={params.ratingFrom}
              onChange={(e) => onChange({ ...params, ratingFrom: e.target.value } as never)}
              className="bg-gray-700 text-white text-sm px-2 py-1 rounded"
            >
              <option value="">-</option>
              {[0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-400">
            별점 (최대)
            <select
              value={params.ratingTo}
              onChange={(e) => onChange({ ...params, ratingTo: e.target.value } as never)}
              className="bg-gray-700 text-white text-sm px-2 py-1 rounded"
            >
              <option value="">-</option>
              {[0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-sm text-gray-400">
            평균점수 (최소)
            <select
              value={params.ratingFrom}
              onChange={(e) => onChange({ ...params, ratingFrom: e.target.value } as never)}
              className="bg-gray-700 text-white text-sm px-2 py-1 rounded"
            >
              <option value="">-</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-400">
            평균점수 (최대)
            <select
              value={params.ratingTo}
              onChange={(e) => onChange({ ...params, ratingTo: e.target.value } as never)}
              className="bg-gray-700 text-white text-sm px-2 py-1 rounded"
            >
              <option value="">-</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
        </>
      )}

      <div className="self-end order-last">
        <button
          onClick={() => {
            if (type === 'works') {
              onChange({ keyword: '', tagIds: [], tagMode: 'and', releaseDateFrom: '', releaseDateTo: '', ratingFrom: '', ratingTo: '', actorId: '' } as never)
            } else {
              onChange({ keyword: '', tagIds: [], tagMode: 'and', ageFrom: '', ageTo: '', ratingFrom: '', ratingTo: '' } as never)
            }
          }}
          className="px-3 py-1 rounded text-sm bg-gray-600 hover:bg-gray-500 text-gray-300"
        >
          초기화
        </button>
      </div>
    </div>
  )
}
