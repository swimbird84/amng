import { useState, useEffect } from 'react'
import { useEscHandler } from '../escManager'
import type { Tag } from '../types'
import {
  workTagsApi, actorTagsApi,
  workTagAliasesApi, actorTagAliasesApi,
} from '../api'

interface Props {
  type: 'work' | 'actor'
  onClose: () => void
  focusTagId?: number
}

type Alias = { id: number; tag_id: number; alias: string }
type Group = { catId: number | null; catName: string | null; sortOrder: number; tags: Tag[] }

function groupTags(tagList: Tag[]): Group[] {
  const catMap = new Map<number | null, Group>()
  const groups: Group[] = []
  for (const tag of tagList) {
    const key = tag.category_id ?? null
    if (!catMap.has(key)) {
      const g: Group = { catId: key, catName: tag.category_name ?? null, sortOrder: tag.category_sort_order ?? 999999, tags: [] }
      catMap.set(key, g)
      groups.push(g)
    }
    catMap.get(key)!.tags.push(tag)
  }
  groups.sort((a, b) => a.catId === null ? 1 : b.catId === null ? -1 : a.sortOrder - b.sortOrder)
  return groups
}

export default function TagAliasModal({ type, onClose, focusTagId }: Props) {
  const [tags, setTags] = useState<Tag[]>([])
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null)
  const [aliases, setAliases] = useState<Alias[]>([])
  const [tagIdsWithAliases, setTagIdsWithAliases] = useState<Set<number>>(new Set())
  const [searchFilter, setSearchFilter] = useState('')
  const [newAlias, setNewAlias] = useState('')

  const tagsApi = type === 'work' ? workTagsApi : actorTagsApi
  const aliasesApi = type === 'work' ? workTagAliasesApi : actorTagAliasesApi

  const reloadTags = async () => {
    const t = await tagsApi.list()
    setTags(t as Tag[])
  }

  const reloadHasAny = async () => {
    const set = await aliasesApi.hasAny()
    setTagIdsWithAliases(set instanceof Set ? set : new Set(Object.values(set)))
  }

  const reloadAliases = async (tagId: number) => {
    const list = await aliasesApi.list(tagId)
    setAliases(list)
  }

  useEffect(() => {
    reloadTags()
    reloadHasAny()
    if (focusTagId != null) setSelectedTagId(focusTagId)
  }, [])

  useEffect(() => {
    if (selectedTagId != null) reloadAliases(selectedTagId)
    else setAliases([])
  }, [selectedTagId])

  useEscHandler(() => onClose(), [onClose])

  const handleAddAlias = async () => {
    if (selectedTagId == null) return
    const parts = newAlias.split(',').map(s => s.trim()).filter(Boolean)
    if (parts.length === 0) return
    for (const part of parts) {
      await aliasesApi.create(selectedTagId, part)
    }
    setNewAlias('')
    await reloadAliases(selectedTagId)
    await reloadHasAny()
  }

  const handleDeleteAlias = async (id: number) => {
    await aliasesApi.delete(id)
    if (selectedTagId != null) await reloadAliases(selectedTagId)
    await reloadHasAny()
  }

  const filtered = searchFilter
    ? tags.filter(t => t.name.toLowerCase().includes(searchFilter.toLowerCase()))
    : tags
  const groups = groupTags(filtered)

  const selectedTagName = tags.find(t => t.id === selectedTagId)?.name ?? ''

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg w-[900px] h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
          <h2 className="text-white font-bold text-base">
            태그 별칭 ({type === 'work' ? '작품' : '배우'})
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* 좌측: 태그 목록 */}
          <div className="w-[320px] flex flex-col border-r border-gray-700 shrink-0">
            <div className="p-2 border-b border-gray-700">
              <input
                type="text"
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                placeholder="태그 검색"
                className="bg-gray-700 text-white text-xs px-2 py-1 rounded w-full"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-3">
              {groups.map(g => (
                <div key={g.catId ?? 'none'}>
                  <div className="text-xs text-gray-500 mb-1">{g.catName ?? '미분류'}</div>
                  <div className="flex flex-wrap gap-1">
                    {g.tags.map(tag => (
                      <button
                        key={tag.id}
                        onClick={() => setSelectedTagId(tag.id)}
                        className={`px-2 py-0.5 rounded text-xs ${
                          selectedTagId === tag.id
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {tag.name}
                        {tagIdsWithAliases.has(tag.id) && (
                          <span className="text-yellow-400 ml-0.5 text-[10px]">●</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 우측: 별칭 관리 */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedTagId == null ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-gray-500 text-sm">왼쪽에서 태그를 선택하세요</p>
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-gray-700 shrink-0 space-y-2">
                  <p className="text-xs text-gray-400">
                    태그: <span className="text-white font-bold">{selectedTagName}</span>
                    <span className="ml-2 text-gray-500">({aliases.length}개 별칭)</span>
                  </p>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={newAlias}
                      onChange={e => setNewAlias(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddAlias()}
                      placeholder="별칭 입력 (쉼표로 여러 개)"
                      className="bg-gray-700 text-white text-xs px-2 py-1.5 rounded flex-1 min-w-0"
                    />
                    <button
                      onClick={handleAddAlias}
                      className="bg-gray-600 hover:bg-gray-500 text-white text-xs px-3 py-1.5 rounded shrink-0"
                    >
                      추가
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {aliases.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center mt-8">등록된 별칭이 없습니다</p>
                  ) : (
                    <div className="space-y-1">
                      {aliases.map(a => (
                        <div key={a.id} className="flex items-center justify-between bg-gray-700 rounded px-3 py-1.5">
                          <span className="text-sm text-white">{a.alias}</span>
                          <button
                            onClick={() => handleDeleteAlias(a.id)}
                            className="text-gray-400 hover:text-red-400 text-xs ml-2"
                          >✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
