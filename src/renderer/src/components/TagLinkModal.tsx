import { useState, useEffect } from 'react'
import { pushEscHandler, popEscHandler } from '../escManager'
import type { Tag } from '../types'
import {
  workTagsApi, actorTagsApi,
  workTagLinksApi, actorTagLinksApi,
  workTagCategoriesApi, actorTagCategoriesApi,
} from '../api'

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

  // 좌측 상태
  const [newParentTag, setNewParentTag] = useState('')
  const [addingParentCatKey, setAddingParentCatKey] = useState<string | null>(null)
  const [inlineParentName, setInlineParentName] = useState('')

  // 우측 상태
  const [newChildTag, setNewChildTag] = useState('')
  const [addingChildCatKey, setAddingChildCatKey] = useState<string | null>(null)
  const [inlineChildName, setInlineChildName] = useState('')

  const tagsApi = type === 'work' ? workTagsApi : actorTagsApi
  const linksApi = type === 'work' ? workTagLinksApi : actorTagLinksApi
  const tagCatApi = type === 'work' ? workTagCategoriesApi : actorTagCategoriesApi

  const reloadTags = async () => {
    const t = await tagsApi.list()
    setTags(t as Tag[])
  }

  const reloadLinks = async () => {
    const l = await linksApi.list()
    setLinks(l as TagLink[])
  }

  useEffect(() => {
    reloadTags()
    reloadLinks()
  }, [])

  useEffect(() => {
    const handler = () => onClose()
    pushEscHandler(handler)
    return () => popEscHandler(handler)
  }, [onClose])

  const childrenOf = (parentId: number) =>
    links.filter(l => l.parent_tag_id === parentId).map(l => l.child_tag_id)

  const hasChildren = (tagId: number) =>
    links.some(l => l.parent_tag_id === tagId)

  // ── 부모 태그 생성/선택 ─────────────────────────────────────────

  const handleCreateParent = async () => {
    const name = newParentTag.trim()
    if (!name) return
    const id = await tagsApi.create(name) as number
    await reloadTags()
    setSelectedParentId(id)
    setNewParentTag('')
  }

  const handleCreateParentInCategory = async (catId: number | null) => {
    const name = inlineParentName.trim()
    if (!name) return
    const id = await tagsApi.create(name) as number
    if (catId !== null) await tagCatApi.setTagCategory(id, catId)
    await reloadTags()
    setSelectedParentId(id)
    setInlineParentName('')
    setAddingParentCatKey(null)
  }

  // ── 자식 태그 토글/생성 ─────────────────────────────────────────

  const toggleChild = async (childId: number) => {
    if (selectedParentId == null) return
    const current = childrenOf(selectedParentId)
    const next = current.includes(childId)
      ? current.filter(id => id !== childId)
      : [...current, childId]
    await linksApi.set(selectedParentId, next)
    await reloadLinks()
  }

  const handleCreateChild = async () => {
    if (selectedParentId == null) return
    const name = newChildTag.trim()
    if (!name) return
    const id = await tagsApi.create(name) as number
    await reloadTags()
    const current = childrenOf(selectedParentId)
    if (!current.includes(id)) {
      await linksApi.set(selectedParentId, [...current, id])
      await reloadLinks()
    }
    setNewChildTag('')
  }

  const handleCreateChildInCategory = async (catId: number | null) => {
    if (selectedParentId == null) return
    const name = inlineChildName.trim()
    if (!name) return
    const id = await tagsApi.create(name) as number
    if (catId !== null) await tagCatApi.setTagCategory(id, catId)
    await reloadTags()
    const current = childrenOf(selectedParentId)
    if (!current.includes(id)) {
      await linksApi.set(selectedParentId, [...current, id])
      await reloadLinks()
    }
    setInlineChildName('')
    setAddingChildCatKey(null)
  }

  // ── 파생 값 ────────────────────────────────────────────────────

  const leftFiltered = newParentTag
    ? tags.filter(t => t.name.toLowerCase().includes(newParentTag.toLowerCase()))
    : tags
  const leftGroups = groupTags(leftFiltered)

  const rightFiltered = tags.filter(t => {
    if (t.id === selectedParentId) return false
    if (newChildTag && !t.name.toLowerCase().includes(newChildTag.toLowerCase())) return false
    return true
  })
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
          {/* 좌측: 부모 태그 */}
          <div className="w-[280px] flex flex-col border-r border-gray-700 shrink-0">
            <div className="p-2 border-b border-gray-700 flex gap-1">
              <input
                type="text"
                value={newParentTag}
                onChange={e => setNewParentTag(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateParent()}
                placeholder="태그 검색 또는 신규 입력"
                className="bg-gray-700 text-white text-xs px-2 py-1 rounded flex-1 min-w-0"
              />
              <button
                onClick={handleCreateParent}
                className="bg-gray-600 hover:bg-gray-500 text-white text-xs px-2 py-1 rounded shrink-0"
              >
                추가
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-3">
              {leftGroups.map(g => (
                <div key={g.catId ?? 'none'}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs text-gray-500">{g.catName ?? '미분류'}</span>
                    <button
                      onClick={() => {
                        setAddingParentCatKey(addingParentCatKey === String(g.catId) ? null : String(g.catId))
                        setInlineParentName('')
                      }}
                      className="text-xs text-gray-600 hover:text-white px-1 rounded hover:bg-gray-700"
                    >
                      추가
                    </button>
                  </div>
                  {addingParentCatKey === String(g.catId) && (
                    <div className="flex gap-1 mb-1.5">
                      <input
                        autoFocus
                        type="text"
                        value={inlineParentName}
                        onChange={e => setInlineParentName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleCreateParentInCategory(g.catId)
                          if (e.key === 'Escape') setAddingParentCatKey(null)
                        }}
                        placeholder="태그명 입력"
                        className="bg-gray-600 text-white text-xs px-2 py-1 rounded flex-1 focus:outline-none"
                      />
                      <button
                        onClick={() => handleCreateParentInCategory(g.catId)}
                        className="bg-gray-500 hover:bg-gray-400 text-white text-xs px-2 py-1 rounded"
                      >
                        추가
                      </button>
                    </div>
                  )}
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

          {/* 우측: 자식 태그 */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedParentId == null ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-gray-500 text-sm">왼쪽에서 부모 태그를 선택하세요</p>
              </div>
            ) : (
              <>
                <div className="px-3 py-2 border-b border-gray-700 shrink-0 space-y-1.5">
                  <p className="text-xs text-gray-400">
                    부모: <span className="text-white font-bold">{selectedParentName}</span>
                    <span className="ml-2 text-gray-500">({selectedChildren.length}개 연결됨)</span>
                  </p>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={newChildTag}
                      onChange={e => setNewChildTag(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleCreateChild()}
                      placeholder="태그 검색 또는 신규 입력"
                      className="bg-gray-700 text-white text-xs px-2 py-1 rounded flex-1 min-w-0"
                    />
                    <button
                      onClick={handleCreateChild}
                      className="bg-gray-600 hover:bg-gray-500 text-white text-xs px-2 py-1 rounded shrink-0"
                    >
                      추가
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-3">
                  {rightGroups.map(g => (
                    <div key={g.catId ?? 'none'}>
                      <div className="flex items-center gap-1 mb-1 border-b border-gray-700 pb-0.5">
                        <span className="text-xs text-gray-500">{g.catName ?? '미분류'}</span>
                        <button
                          onClick={() => {
                            setAddingChildCatKey(addingChildCatKey === String(g.catId) ? null : String(g.catId))
                            setInlineChildName('')
                          }}
                          className="text-xs text-gray-600 hover:text-white px-1 rounded hover:bg-gray-700"
                        >
                          추가
                        </button>
                      </div>
                      {addingChildCatKey === String(g.catId) && (
                        <div className="flex gap-1 mb-1.5">
                          <input
                            autoFocus
                            type="text"
                            value={inlineChildName}
                            onChange={e => setInlineChildName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleCreateChildInCategory(g.catId)
                              if (e.key === 'Escape') setAddingChildCatKey(null)
                            }}
                            placeholder="태그명 입력"
                            className="bg-gray-600 text-white text-xs px-2 py-1 rounded flex-1 focus:outline-none"
                          />
                          <button
                            onClick={() => handleCreateChildInCategory(g.catId)}
                            className="bg-gray-500 hover:bg-gray-400 text-white text-xs px-2 py-1 rounded"
                          >
                            추가
                          </button>
                        </div>
                      )}
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
