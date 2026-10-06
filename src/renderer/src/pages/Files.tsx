import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { folderApi } from '../api'
import CardTooltip, { type TooltipState } from '../components/CardTooltip'

interface FileInfo {
  id: number
  workId: number
  fileName: string
  filePath: string
  workLabel: string
  exists: boolean
}

interface FolderNode {
  name: string
  path: string
  fileCount: number
  exists: boolean
  files: FileInfo[]
  children: FolderNode[]
  matchedActorId?: number
  matchedActorName?: string
  matchedWorkId?: number
  matchedWorkLabel?: string
}

function countAllFolders(nodes: FolderNode[]): number {
  let count = nodes.length
  for (const n of nodes) count += countAllFolders(n.children)
  return count
}

function collectAllPaths(nodes: FolderNode[]): string[] {
  const paths: string[] = []
  for (const n of nodes) { paths.push(n.path); paths.push(...collectAllPaths(n.children)) }
  return paths
}

const OPEN_FOLDERS_KEY = 'files:openFolders'

function getOpenFolders(): Set<string> {
  try {
    const saved = localStorage.getItem(OPEN_FOLDERS_KEY)
    return saved ? new Set(JSON.parse(saved)) : new Set()
  } catch { return new Set() }
}

function saveOpenFolders(set: Set<string>) {
  localStorage.setItem(OPEN_FOLDERS_KEY, JSON.stringify([...set]))
}

function FolderItem({ node, depth, onRefresh, onNavigateToActor, onNavigateToWork }: { node: FolderNode; depth: number; onRefresh: () => void; onNavigateToActor: (id: number) => void; onNavigateToWork: (id: number) => void }) {
  const [open, setOpen] = useState(() => getOpenFolders().has(node.path))
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(node.name)
  const [fileRenaming, setFileRenaming] = useState<number | null>(null)
  const [fileNewName, setFileNewName] = useState('')
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [existsMap, setExistsMap] = useState<Record<string, boolean> | null>(null)
  const checkedRef = useRef(false)

  const hasChildren = node.children.length > 0 || node.files.length > 0
  const matchedId = node.matchedActorId ?? node.matchedWorkId
  const matchedType = node.matchedActorId ? 'actor' as const : node.matchedWorkId ? 'work' as const : null

  const folderExists = existsMap ? (existsMap[node.path] ?? true) : true

  const handleToggle = async () => {
    const willOpen = !open
    setOpen(willOpen)
    const openSet = getOpenFolders()
    if (willOpen) openSet.add(node.path); else openSet.delete(node.path)
    saveOpenFolders(openSet)
    if (willOpen && !checkedRef.current) {
      checkedRef.current = true
      const paths = [node.path, ...node.files.map(f => f.filePath)]
      const result = await folderApi.checkExists(paths)
      setExistsMap(result)
    }
  }

  const handleMouseEnter = (e: React.MouseEvent) => {
    if (!matchedType || !matchedId) return
    hoverTimer.current = setTimeout(() => {
      setTooltip({ type: matchedType, id: matchedId, x: e.clientX, y: e.clientY, showCover: true })
    }, 400)
  }
  const handleMouseLeave = () => {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null }
    setTooltip(null)
  }

  const handleRenameFolder = async () => {
    if (!newName.trim() || newName === node.name) { setRenaming(false); return }
    const parentDir = node.path.replace(/[/\\][^/\\]*$/, '')
    const newPath = parentDir + '/' + newName.trim()
    const res = await folderApi.renameFolder(node.path, newPath) as { ok: boolean; error?: string }
    if (res.ok) {
      onRefresh()
    } else {
      alert(res.error || '폴더명 변경 실패')
    }
    setRenaming(false)
  }

  const handleRenameFile = async (file: FileInfo) => {
    if (!fileNewName.trim() || fileNewName === file.fileName) { setFileRenaming(null); return }
    const dir = file.filePath.replace(/[/\\][^/\\]*$/, '')
    const newPath = dir + '/' + fileNewName.trim()
    const res = await folderApi.renameFile(file.filePath, newPath) as { ok: boolean; error?: string }
    if (res.ok) {
      onRefresh()
    } else {
      alert(res.error || '파일명 변경 실패')
    }
    setFileRenaming(null)
  }

  const handleDeleteFolder = async () => {
    const workCount = node.fileCount
    const childCount = countAllFolders(node.children)
    let msg = `"${node.name}" 폴더를 삭제하시겠습니까?\n`
    if (childCount > 0) {
      msg += `하위 ${childCount}개 폴더와 관련 작품이 모두 삭제됩니다.`
    } else {
      msg += `${workCount}개 파일과 관련 작품이 삭제됩니다.`
    }
    if (!confirm(msg)) return

    const res = await folderApi.deleteFolder(node.path) as { ok: boolean; error?: string; blocked?: boolean; deletedWorks?: number }
    if (res.ok) {
      alert(`${res.deletedWorks ?? 0}개 작품이 삭제되었습니다`)
      onRefresh()
    } else {
      alert(res.error || '삭제 실패')
    }
  }

  return (
    <div>
      {/* Folder row */}
      <div
        className="flex items-center gap-1 py-1 hover:bg-gray-800/50 rounded group"
        style={{ paddingLeft: depth * 20 + 8 }}
      >
        <button
          onClick={handleToggle}
          className="text-gray-400 text-xs w-4 shrink-0"
        >
          {hasChildren ? (open ? '▼' : '▶') : ' '}
        </button>
        <span className={`text-sm ${folderExists ? 'text-gray-300' : 'text-red-400'}`}>
          {folderExists ? '📁' : '📁⚠️'} {node.name}
        </span>
        <span className="text-gray-500 text-xs ml-1">({node.children.length + node.files.length})</span>
        {node.matchedActorName && <span className="text-blue-400 text-xs ml-2 cursor-pointer hover:underline" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} onClick={(e) => { e.stopPropagation(); onNavigateToActor(node.matchedActorId!) }}>배우: {node.matchedActorName}</span>}
        {node.matchedWorkLabel && <span className="text-green-400 text-xs ml-2 cursor-pointer hover:underline" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} onClick={(e) => { e.stopPropagation(); onNavigateToWork(node.matchedWorkId!) }}>작품: {node.matchedWorkLabel}</span>}
        <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 transition pr-2">
          {folderExists ? (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setRenaming(true); setNewName(node.name) }}
                className="text-xs text-gray-400 hover:text-white px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600"
              >수정</button>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteFolder() }}
                className="text-xs text-gray-400 hover:text-red-400 px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600"
              >삭제</button>
            </>
          ) : (
            <span className="text-xs text-red-400">경로 없음</span>
          )}
        </div>
      </div>
      {tooltip && <CardTooltip tooltip={tooltip} />}

      {/* Rename input */}
      {renaming && (
        <div className="flex items-center gap-2 py-1" style={{ paddingLeft: depth * 20 + 32 }}>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleRenameFolder(); if (e.key === 'Escape') setRenaming(false) }}
            className="bg-gray-700 text-white text-sm px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 flex-1"
          />
          <button onClick={handleRenameFolder} className="text-xs text-white bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded">변경</button>
          <button onClick={() => setRenaming(false)} className="text-xs text-gray-300 bg-gray-600 hover:bg-gray-500 px-2 py-1 rounded">취소</button>
        </div>
      )}

      {/* Children + files */}
      {open && (
        <>
          {node.children.map(child => (
            <FolderItem key={child.path} node={child} depth={depth + 1} onRefresh={onRefresh} onNavigateToActor={onNavigateToActor} onNavigateToWork={onNavigateToWork} />
          ))}
          {node.files.map(file => (
            <div key={file.id}>
              <div
                className="flex items-center gap-1 py-0.5 hover:bg-gray-800/50 rounded group"
                style={{ paddingLeft: (depth + 1) * 20 + 12 }}
              >
                <span className={`text-sm ${(existsMap ? (existsMap[file.filePath] ?? true) : true) ? 'text-gray-400' : 'text-red-400'}`}>
                  {file.fileName}
                </span>
                <span className="text-gray-600 text-xs mx-1">←</span>
                <span className="text-gray-500 text-xs">{file.workLabel}</span>
                <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 transition pr-2">
                  {(existsMap ? (existsMap[file.filePath] ?? true) : true) ? (
                    <button
                      onClick={() => { setFileRenaming(file.id); setFileNewName(file.fileName) }}
                      className="text-xs text-gray-400 hover:text-white px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600"
                    >수정</button>
                  ) : (
                    <span className="text-xs text-red-400">파일 없음</span>
                  )}
                </div>
              </div>
              {fileRenaming === file.id && (
                <div className="flex items-center gap-2 py-1" style={{ paddingLeft: (depth + 1) * 20 + 32 }}>
                  <input
                    autoFocus
                    value={fileNewName}
                    onChange={e => setFileNewName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleRenameFile(file); if (e.key === 'Escape') setFileRenaming(null) }}
                    className="bg-gray-700 text-white text-sm px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 flex-1"
                  />
                  <button onClick={() => handleRenameFile(file)} className="text-xs text-white bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded">변경</button>
                  <button onClick={() => setFileRenaming(null)} className="text-xs text-gray-300 bg-gray-600 hover:bg-gray-500 px-2 py-1 rounded">취소</button>
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  )
}

const SCROLL_KEY = 'files:scrollTop'
const SORT_KEY = 'files:sortBy'

type SortBy = 'name_asc' | 'name_desc' | 'count_desc' | 'count_asc'
const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'name_asc', label: '이름 ▲' },
  { value: 'name_desc', label: '이름 ▼' },
  { value: 'count_desc', label: '항목 수 ▼' },
  { value: 'count_asc', label: '항목 수 ▲' },
]

function filterTree(nodes: FolderNode[], query: string): FolderNode[] {
  const q = query.toLowerCase()
  const matches = (node: FolderNode): boolean => {
    if (node.name.toLowerCase().includes(q)) return true
    if (node.matchedActorName?.toLowerCase().includes(q)) return true
    if (node.matchedWorkLabel?.toLowerCase().includes(q)) return true
    if (node.files.some(f => f.fileName.toLowerCase().includes(q) || f.workLabel.toLowerCase().includes(q))) return true
    return false
  }
  const filter = (nodes: FolderNode[]): FolderNode[] => {
    const result: FolderNode[] = []
    for (const node of nodes) {
      const filteredChildren = filter(node.children)
      if (matches(node) || filteredChildren.length > 0) {
        result.push({ ...node, children: filteredChildren })
      }
    }
    return result
  }
  return filter(nodes)
}

function sortTree(nodes: FolderNode[], sortBy: SortBy): FolderNode[] {
  const comparator = (a: FolderNode, b: FolderNode): number => {
    switch (sortBy) {
      case 'name_asc': return a.name.localeCompare(b.name)
      case 'name_desc': return b.name.localeCompare(a.name)
      case 'count_desc': return (b.children.length + b.files.length) - (a.children.length + a.files.length)
      case 'count_asc': return (a.children.length + a.files.length) - (b.children.length + b.files.length)
    }
  }
  return [...nodes].sort(comparator).map(n => ({ ...n, children: sortTree(n.children, sortBy) }))
}

export default function Files({ onNavigateToActor, onNavigateToWork }: { onNavigateToActor: (id: number) => void; onNavigateToWork: (id: number) => void }) {
  const [tree, setTree] = useState<FolderNode[]>([])
  const [loading, setLoading] = useState(true)
  const [toggleKey, setToggleKey] = useState(0)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>(() => (localStorage.getItem(SORT_KEY) as SortBy) || 'name_asc')
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadTree = useCallback(async () => {
    setLoading(true)
    const data = await folderApi.tree() as FolderNode[]
    setTree(data)
    setLoading(false)
  }, [])

  useEffect(() => { loadTree() }, [loadTree])

  // Restore scroll position after tree loads
  useEffect(() => {
    if (!loading && scrollRef.current) {
      const saved = localStorage.getItem(SCROLL_KEY)
      if (saved) scrollRef.current.scrollTop = Number(saved)
    }
  }, [loading])

  const handleScroll = () => {
    if (scrollTimer.current) clearTimeout(scrollTimer.current)
    scrollTimer.current = setTimeout(() => {
      if (scrollRef.current) localStorage.setItem(SCROLL_KEY, String(scrollRef.current.scrollTop))
    }, 200)
  }

  const handleSortChange = (value: SortBy) => {
    setSortBy(value)
    localStorage.setItem(SORT_KEY, value)
  }

  const displayTree = useMemo(() => {
    let result = tree
    if (search.trim()) result = filterTree(result, search.trim())
    result = sortTree(result, sortBy)
    return result
  }, [tree, search, sortBy])

  const totalFolders = countAllFolders(tree)

  const handleExpandAll = () => {
    const allPaths = collectAllPaths(displayTree)
    saveOpenFolders(new Set(allPaths))
    setToggleKey(k => k + 1)
  }

  const handleCollapseAll = () => {
    saveOpenFolders(new Set())
    setToggleKey(k => k + 1)
  }

  return (
    <div className="h-full flex flex-col p-4 overflow-hidden cursor-default">
      <div className="flex items-center gap-3 mb-3 shrink-0 flex-wrap">
        <button
          onClick={loadTree}
          className="text-sm text-gray-300 bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded"
        >새로고침</button>
        <button onClick={handleExpandAll} className="text-sm text-gray-300 bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded">전체 펼치기</button>
        <button onClick={handleCollapseAll} className="text-sm text-gray-300 bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded">전체 접기</button>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="검색 (폴더명, 파일명, 배우, 작품)"
          className="bg-gray-700 text-white text-sm px-3 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 w-64"
        />
        <select
          value={sortBy}
          onChange={e => handleSortChange(e.target.value as SortBy)}
          className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded focus:outline-none"
        >
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span className="text-gray-500 text-sm">총 {totalFolders}개 폴더{search.trim() && ` (검색 결과: ${countAllFolders(displayTree)}개)`}</span>
      </div>
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {loading ? (
          <p className="text-gray-500 text-sm">로딩 중...</p>
        ) : displayTree.length === 0 ? (
          <p className="text-gray-500 text-sm">{search.trim() ? '검색 결과가 없습니다' : '등록된 로컬 파일이 없습니다'}</p>
        ) : (
          displayTree.map(node => (
            <FolderItem key={`${node.path}_${toggleKey}`} node={node} depth={0} onRefresh={loadTree} onNavigateToActor={onNavigateToActor} onNavigateToWork={onNavigateToWork} />
          ))
        )}
      </div>
    </div>
  )
}
