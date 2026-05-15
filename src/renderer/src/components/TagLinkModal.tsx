import { useState, useEffect } from 'react'
import type { Tag } from '../types'
import { workTagsApi, actorTagsApi, workTagLinksApi, actorTagLinksApi } from '../api'

interface Props {
  type: 'work' | 'actor'
  onClose: () => void
}

type TagLink = { parent_tag_id: number; child_tag_id: number }

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

export default function TagLinkModal({ type, onClose }: Props) {
  const [tags, setTags] = useState<Tag[]>([])
  const [links, setLinks] = useState<TagLink[]>([])
  const [selectedParentId, setSelectedParentId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [rightSearch, setRightSearch] = useState('')

  const tagsApi = type === 'work' ? workTagsApi : actorTagsApi
  const linksApi = type === 'work' ? workTagLinksApi : actorTagLinksApi

  useEffect(() => {
    tagsApi.list().then(t => setTags(t as Tag[]))
    linksApi.list().then(l => setLinks(l as TagLink[]))
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const childrenOf = (parentId: number) =>
    links.filter(l => l.parent_tag_id === parentId).map(l => l.child_tag_id)

  const hasChildren = (tagId: number) =>
    links.some(l => l.parent_tag_id === tagId)

  const toggleChild = async (childId: number) => {
    if (selectedParentId == null) return
    const current = childrenOf(selectedParentId)
    const next = current.includes(childId)
      ? current.filter(id => id !== childId)
      : [...current, childId]
    await linksApi.set(selectedParentId, next)
    const updated = await linksApi.list()
    setLinks(updated as TagLink[])
  }

  const filteredTags = search
    ? tags.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    : tags

  const leftGroups = groupTags(filteredTags)
  const rightFiltered = tags.filter(t =>
    t.id !== selectedParentId &&
    (!rightSearch || t.name.toLowerCase().includes(rightSearch.toLowerCase()))
  )
  const rightGroups = groupTags(rightFiltered)
  const selectedChildren = selectedParentId != null ? childrenOf(selectedParentId) : []
  const selectedParentName = tags.find(t => t.id === selectedParentId)?.name ?? ''

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg w-[1000px] h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
          <h2 className="text-white font-bold text-base">
            태그 연결 ({type === 'work' ? '작품' : '배우'})
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* 좌측: 부모 태그 선택 */}
          <div className="w-[220px] flex flex-col border-r border-gray-700 shrink-0">
            <div className="p-2 border-b border-gray-700">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="태그 검색"
                className="bg-gray-700 text-white text-xs px-2 py-1 rounded w-full"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-3">
              {leftGroups.map(g => (
                <div key={g.catId ?? 'none'}>
                  <p className="text-xs text-gray-500 mb-1">{g.catName ?? '미분류'}</p>
                  <div className="space-y-0.5">
                    {g.tags.map(tag => (
                      <button
                        key={tag.id}
                        onClick={() => setSelectedParentId(tag.id)}
                        className={`w-full text-left px-2 py-1 rounded text-xs flex items-center justify-between gap-1 ${
                          selectedParentId === tag.id
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-300 hover:bg-gray-700'
                        }`}
                      >
                        <span className="truncate">{tag.name}</span>
                        {hasChildren(tag.id) && (
                          <span className="text-yellow-400 shrink-0 text-[10px]">●</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 우측: 자식 태그 선택 */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedParentId == null ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-gray-500 text-sm">왼쪽에서 부모 태그를 선택하세요</p>
              </div>
            ) : (
              <>
                <div className="px-3 py-2 border-b border-gray-700 shrink-0 flex items-center gap-3">
                  <p className="text-xs text-gray-400 shrink-0">
                    부모: <span className="text-white font-bold">{selectedParentName}</span>
                    <span className="ml-2 text-gray-500">({selectedChildren.length}개 연결됨)</span>
                  </p>
                  <input
                    type="text"
                    value={rightSearch}
                    onChange={e => setRightSearch(e.target.value)}
                    placeholder="자식 태그 검색"
                    className="bg-gray-700 text-white text-xs px-2 py-1 rounded flex-1"
                  />
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-3">
                  {rightGroups.map(g => (
                    <div key={g.catId ?? 'none'}>
                      <p className="text-xs text-gray-500 mb-1 border-b border-gray-700 pb-0.5">
                        {g.catName ?? '미분류'}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {g.tags.map(tag => {
                          const isChild = selectedChildren.includes(tag.id)
                          return (
                            <button
                              key={tag.id}
                              onClick={() => toggleChild(tag.id)}
                              className={`px-2 py-0.5 rounded text-xs ${
                                isChild
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                              }`}
                            >
                              {tag.name}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
