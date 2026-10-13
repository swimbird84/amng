import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { folderApi, tempApi } from '../api'
import CardTooltip, { type TooltipState } from '../components/CardTooltip'
import TempFolder from '../components/TempFolder'

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
  matchedActorAliases?: string
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

function formatDateInput(value: string): string {
  const digits = value.replace(/[^0-9]/g, '').slice(0, 8)
  if (digits.length <= 4) return digits
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`
}

function DropInlineRow({ file, depth, onConfirm, onCancel }: { file: TempFileRef; depth: number; onConfirm: (fileName: string, date: string) => void; onCancel: (fileName: string) => void }) {
  const [dateValue, setDateValue] = useState(() => localStorage.getItem('files:lastReleaseDate') || '')
  const pickerRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex items-center gap-2 py-1" style={{ paddingLeft: depth * 20 + 12 }}>
      <div className="relative">
        <input
          value={dateValue}
          onChange={e => setDateValue(formatDateInput(e.target.value))}
          onKeyDown={e => { if (e.key === 'Enter') onConfirm(file.fileName, dateValue); if (e.key === 'Escape') onCancel(file.fileName) }}
          placeholder="YYYY-MM-DD"
          className="bg-gray-700 text-white text-sm px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 w-28"
          autoFocus
        />
        <input
          ref={pickerRef}
          type="date"
          className="absolute inset-0 opacity-0 pointer-events-none"
          onChange={e => setDateValue(e.target.value)}
        />
      </div>
      <button
        onClick={() => pickerRef.current?.showPicker()}
        className="text-sm px-1.5 py-1 rounded bg-gray-700 hover:bg-gray-600"
        title="달력"
      >📅</button>
      <span className="text-gray-300 text-sm">{file.baseName}</span>
      <div className="ml-auto flex gap-1 pr-2">
        <button onClick={() => onConfirm(file.fileName, dateValue)} className="text-xs text-white bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded">생성</button>
        <button onClick={() => onCancel(file.fileName)} className="text-xs text-gray-300 bg-gray-600 hover:bg-gray-500 px-2 py-1 rounded">취소</button>
      </div>
    </div>
  )
}

function DropInline({ files, depth, onConfirmOne, onCancelOne }: { files: TempFileRef[]; depth: number; onConfirmOne: (fileName: string, date: string) => void; onCancelOne: (fileName: string) => void }) {
  return (
    <div>
      {files.map(file => (
        <DropInlineRow key={file.fileName} file={file} depth={depth} onConfirm={onConfirmOne} onCancel={onCancelOne} />
      ))}
    </div>
  )
}

function NewActorDropInlineRow({ file, depth, onConfirm, onCancel }: { file: TempFileRef; depth: number; onConfirm: (fileName: string, actorName: string, actorBirthday: string, releaseDate: string) => void; onCancel: (fileName: string) => void }) {
  const [actorName, setActorName] = useState('')
  const [birthday, setBirthday] = useState('')
  const [releaseDate, setReleaseDate] = useState(() => localStorage.getItem('files:lastReleaseDate') || '')
  const bdPickerRef = useRef<HTMLInputElement>(null)
  const rdPickerRef = useRef<HTMLInputElement>(null)

  return (
    <div>
      <div className="flex items-center gap-2 py-1" style={{ paddingLeft: depth * 20 + 12 }}>
        <input
          value={actorName}
          onChange={e => setActorName(e.target.value)}
          placeholder="배우명"
          className="bg-gray-700 text-white text-sm px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 w-32"
          autoFocus
        />
        <div className="relative">
          <input
            value={birthday}
            onChange={e => setBirthday(formatDateInput(e.target.value))}
            placeholder="생년월일"
            className="bg-gray-700 text-white text-sm px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 w-28"
          />
          <input ref={bdPickerRef} type="date" className="absolute inset-0 opacity-0 pointer-events-none" onChange={e => setBirthday(e.target.value)} />
        </div>
        <button onClick={() => bdPickerRef.current?.showPicker()} className="text-sm px-1.5 py-1 rounded bg-gray-700 hover:bg-gray-600">📅</button>
      </div>
      <div className="flex items-center gap-2 py-1" style={{ paddingLeft: depth * 20 + 24 }}>
        <span className="text-gray-500 text-xs">ㄴ</span>
        <div className="relative">
          <input
            value={releaseDate}
            onChange={e => setReleaseDate(formatDateInput(e.target.value))}
            onKeyDown={e => { if (e.key === 'Enter') onConfirm(file.fileName, actorName, birthday, releaseDate); if (e.key === 'Escape') onCancel(file.fileName) }}
            placeholder="발매일"
            className="bg-gray-700 text-white text-sm px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 w-28"
          />
          <input ref={rdPickerRef} type="date" className="absolute inset-0 opacity-0 pointer-events-none" onChange={e => setReleaseDate(e.target.value)} />
        </div>
        <button onClick={() => rdPickerRef.current?.showPicker()} className="text-sm px-1.5 py-1 rounded bg-gray-700 hover:bg-gray-600">📅</button>
        <span className="text-gray-300 text-sm">{file.baseName}</span>
        <div className="ml-auto flex gap-1 pr-2">
          <button onClick={() => onConfirm(file.fileName, actorName, birthday, releaseDate)} className="text-xs text-white bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded">생성</button>
          <button onClick={() => onCancel(file.fileName)} className="text-xs text-gray-300 bg-gray-600 hover:bg-gray-500 px-2 py-1 rounded">취소</button>
        </div>
      </div>
    </div>
  )
}

function NewActorDropInline({ files, depth, onConfirmOne, onCancelOne }: { files: TempFileRef[]; depth: number; onConfirmOne: (fileName: string, actorName: string, actorBirthday: string, releaseDate: string) => void; onCancelOne: (fileName: string) => void }) {
  return (
    <div>
      {files.map(file => (
        <NewActorDropInlineRow key={file.fileName} file={file} depth={depth} onConfirm={onConfirmOne} onCancel={onCancelOne} />
      ))}
    </div>
  )
}

interface TempFileRef {
  fileName: string
  baseName: string
  videoPath: string
  thumbPath: string | null
}

function FolderItem({ node, depth, onRefresh, onNavigateToActor, onNavigateToWork, onDrop, dropTarget, dragFiles: dragFilesProp, onMoveConfirmOne, onMoveCancelOne, onNewActorConfirmOne }: {
  node: FolderNode; depth: number; onRefresh: () => void
  onNavigateToActor: (id: number) => void; onNavigateToWork: (id: number) => void
  onDrop?: (folderPath: string, folderLabel: string, isActorFolder: boolean) => void
  dropTarget?: { actorFolder: string; actorName: string } | null
  dragFiles?: TempFileRef[]
  onMoveConfirmOne?: (fileName: string, date: string) => void
  onMoveCancelOne?: (fileName: string) => void
  onNewActorConfirmOne?: (fileName: string, actorName: string, actorBirthday: string, releaseDate: string) => void
}) {
  const [open, setOpen] = useState(() => getOpenFolders().has(node.path))
  const [dragOver, setDragOver] = useState(false)
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
        className={`flex items-center gap-1 py-1 hover:bg-gray-800/50 rounded group ${dragOver ? 'bg-blue-900/30 ring-1 ring-blue-500' : ''}`}
        style={{ paddingLeft: depth * 20 + 8 }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); onDrop?.(node.path, node.matchedActorName ?? node.name, !!node.matchedActorId) }}
      >
        <button
          onClick={handleToggle}
          className="text-gray-400 text-xs w-4 shrink-0"
        >
          {hasChildren ? (open ? '▼' : '▶') : ' '}
        </button>
        <span className={`text-sm ${folderExists ? 'text-gray-300' : 'text-red-400'}`}>
          {folderExists ? '📁' : '📁⚠️'}
        </span>
        {renaming ? (
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleRenameFolder(); if (e.key === 'Escape') setRenaming(false) }}
            className="bg-gray-700 text-white text-sm px-2 py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 flex-1 min-w-0"
          />
        ) : (
          <>
            <span className={`text-sm ${folderExists ? 'text-gray-300' : 'text-red-400'}`}>{node.name}</span>
            <span className="text-gray-500 text-xs ml-1">({node.children.length + node.files.length})</span>
            {node.matchedActorName && <span className="text-blue-400 text-xs ml-2 cursor-pointer hover:underline" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} onClick={(e) => { e.stopPropagation(); onNavigateToActor(node.matchedActorId!) }}>배우: {node.matchedActorName}</span>}
            {node.matchedWorkLabel && <span className="text-green-400 text-xs ml-2 cursor-pointer hover:underline" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} onClick={(e) => { e.stopPropagation(); onNavigateToWork(node.matchedWorkId!) }}>작품: {node.matchedWorkLabel}</span>}
          </>
        )}
        <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 transition pr-2">
          {renaming ? (
            <>
              <button onClick={handleRenameFolder} className="text-xs text-white bg-blue-600 hover:bg-blue-500 px-1.5 py-0.5 rounded">변경</button>
              <button onClick={() => setRenaming(false)} className="text-xs text-gray-300 bg-gray-600 hover:bg-gray-500 px-1.5 py-0.5 rounded">취소</button>
            </>
          ) : folderExists ? (
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

      {/* Inline drop UI */}
      {dropTarget && dropTarget.folderPath === node.path && dragFilesProp && dragFilesProp.length > 0 && (
        dropTarget.isActorFolder ? (
          <DropInline
            files={dragFilesProp}
            depth={depth + 1}
            onConfirmOne={onMoveConfirmOne!}
            onCancelOne={onMoveCancelOne!}
          />
        ) : (
          <NewActorDropInline
            files={dragFilesProp}
            depth={depth + 1}
            onConfirmOne={onNewActorConfirmOne!}
            onCancelOne={onMoveCancelOne!}
          />
        )
      )}

      {/* Children + files */}
      {open && (
        <>
          {node.children.map(child => (
            <FolderItem key={child.path} node={child} depth={depth + 1} onRefresh={onRefresh} onNavigateToActor={onNavigateToActor} onNavigateToWork={onNavigateToWork} onDrop={onDrop} dropTarget={dropTarget} dragFiles={dragFilesProp} onMoveConfirmOne={onMoveConfirmOne} onMoveCancelOne={onMoveCancelOne} onNewActorConfirmOne={onNewActorConfirmOne} />
          ))}
          {node.files.map(file => {
            const fileExists = existsMap ? (existsMap[file.filePath] ?? true) : true
            const isEditing = fileRenaming === file.id
            return (
            <div
              key={file.id}
              className="flex items-center gap-1 py-0.5 hover:bg-gray-800/50 rounded group"
              style={{ paddingLeft: (depth + 1) * 20 + 12 }}
            >
              {isEditing ? (
                <input
                  autoFocus
                  value={fileNewName}
                  onChange={e => setFileNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRenameFile(file); if (e.key === 'Escape') setFileRenaming(null) }}
                  className="bg-gray-700 text-white text-sm px-2 py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 flex-1 min-w-0"
                />
              ) : (
                <>
                  <span className={`text-sm ${fileExists ? 'text-gray-400' : 'text-red-400'}`}>{file.fileName}</span>
                  <span className="text-gray-600 text-xs mx-1">←</span>
                  <span className="text-gray-500 text-xs">{file.workLabel}</span>
                </>
              )}
              <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 transition pr-2">
                {isEditing ? (
                  <>
                    <button onClick={() => handleRenameFile(file)} className="text-xs text-white bg-blue-600 hover:bg-blue-500 px-1.5 py-0.5 rounded">변경</button>
                    <button onClick={() => setFileRenaming(null)} className="text-xs text-gray-300 bg-gray-600 hover:bg-gray-500 px-1.5 py-0.5 rounded">취소</button>
                  </>
                ) : fileExists ? (
                  <button
                    onClick={() => { setFileRenaming(file.id); setFileNewName(file.fileName) }}
                    className="text-xs text-gray-400 hover:text-white px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600"
                  >수정</button>
                ) : (
                  <span className="text-xs text-red-400">파일 없음</span>
                )}
              </div>
            </div>
            )
          })}
        </>
      )}
    </div>
  )
}

const SCROLL_KEY = 'files:scrollTop'
const SORT_BY_KEY = 'files:sortBy'
const SORT_DIR_KEY = 'files:sortDir'

type SortField = 'name' | 'count'
type SearchField = 'actor' | 'folder'
const SEARCH_FIELD_KEY = 'files:searchField'

function filterTree(nodes: FolderNode[], query: string, field: SearchField): FolderNode[] {
  const q = query.toLowerCase()
  const matches = (node: FolderNode): boolean => {
    if (field === 'actor') return !!node.matchedActorName?.toLowerCase().includes(q) || !!node.matchedActorAliases?.toLowerCase().includes(q)
    return node.name.toLowerCase().includes(q)
  }
  const filter = (nodes: FolderNode[]): FolderNode[] => {
    const result: FolderNode[] = []
    for (const node of nodes) {
      if (matches(node)) {
        // 배우 매칭 시 하위 전체 보존
        if (field === 'actor') {
          result.push(node)
        } else {
          result.push({ ...node, children: filter(node.children) })
        }
      } else {
        const filteredChildren = filter(node.children)
        if (filteredChildren.length > 0) {
          result.push({ ...node, children: filteredChildren })
        }
      }
    }
    return result
  }
  return filter(nodes)
}

function sortTree(nodes: FolderNode[], field: SortField, dir: 'asc' | 'desc'): FolderNode[] {
  const m = dir === 'asc' ? 1 : -1
  const comparator = (a: FolderNode, b: FolderNode): number => {
    if (field === 'count') return m * ((a.children.length + a.files.length) - (b.children.length + b.files.length))
    return m * a.name.localeCompare(b.name)
  }
  return [...nodes].sort(comparator).map(n => ({ ...n, children: sortTree(n.children, field, dir) }))
}

export default function Files({ onNavigateToActor, onNavigateToWork }: { onNavigateToActor: (id: number) => void; onNavigateToWork: (id: number) => void }) {
  const [tree, setTree] = useState<FolderNode[]>([])
  const [loading, setLoading] = useState(true)
  const [toggleKey, setToggleKey] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [search, setSearch] = useState('')
  const [searchField, setSearchField] = useState<SearchField>(() => (localStorage.getItem(SEARCH_FIELD_KEY) as SearchField) || 'folder')
  const [sortField, setSortField] = useState<SortField>(() => (localStorage.getItem(SORT_BY_KEY) as SortField) || 'name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => (localStorage.getItem(SORT_DIR_KEY) as 'asc' | 'desc') || 'asc')
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [dragFiles, setDragFiles] = useState<TempFileRef[]>([])
  const [dropTarget, setDropTarget] = useState<{ folderPath: string; folderLabel: string; isActorFolder: boolean } | null>(null)

  const loadTree = useCallback(async () => {
    setLoading(true)
    const data = await folderApi.tree() as FolderNode[]
    setTree(data)
    setLoading(false)
  }, [])

  useEffect(() => { loadTree() }, [loadTree])

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

  const displayTree = useMemo(() => {
    let result = tree
    if (search.trim()) result = filterTree(result, search.trim(), searchField)
    result = sortTree(result, sortField, sortDir)
    return result
  }, [tree, search, searchField, sortField, sortDir])

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

  const handleDrop = (folderPath: string, folderLabel: string, isActorFolder: boolean) => {
    if (dragFiles.length === 0) return
    setDropTarget({ folderPath, folderLabel, isActorFolder })
  }

  const tempRefreshRef = useRef<(() => void) | null>(null)

  const handleMoveConfirmOne = async (fileName: string, releaseDate: string) => {
    if (!dropTarget) return
    let date = releaseDate.trim().replace(/[^0-9]/g, '')
    if (date.length === 8) date = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { alert('날짜 형식이 올바르지 않습니다'); return }

    const srcFolder = localStorage.getItem('files:tempFolder') || ''
    const res = await tempApi.moveToTree(srcFolder, [fileName], dropTarget.folderPath, date)
    if (res.ok) {
      localStorage.setItem('files:lastReleaseDate', date)
      loadTree()
      tempRefreshRef.current?.()
    }
    const remaining = dragFiles.filter(f => f.fileName !== fileName)
    setDragFiles(remaining)
    if (remaining.length === 0) setDropTarget(null)
  }

  const handleMoveCancelOne = (fileName: string) => {
    const remaining = dragFiles.filter(f => f.fileName !== fileName)
    setDragFiles(remaining)
    if (remaining.length === 0) setDropTarget(null)
  }

  const handleNewActorConfirmOne = async (fileName: string, actorName: string, actorBirthday: string, releaseDate: string) => {
    if (!dropTarget) return
    if (!actorName.trim()) { alert('배우명을 입력하세요'); return }
    let bd = actorBirthday.trim().replace(/[^0-9]/g, '')
    if (bd.length === 8) bd = `${bd.slice(0, 4)}-${bd.slice(4, 6)}-${bd.slice(6, 8)}`
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bd)) { alert('생년월일 형식이 올바르지 않습니다'); return }
    let rd = releaseDate.trim().replace(/[^0-9]/g, '')
    if (rd.length === 8) rd = `${rd.slice(0, 4)}-${rd.slice(4, 6)}-${rd.slice(6, 8)}`
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rd)) { alert('발매일 형식이 올바르지 않습니다'); return }

    const srcFolder = localStorage.getItem('files:tempFolder') || ''
    const res = await tempApi.moveWithNewActor(srcFolder, [fileName], dropTarget.folderPath, actorName.trim(), bd, rd)
    if (res.ok) {
      localStorage.setItem('files:lastReleaseDate', rd)
      loadTree()
      tempRefreshRef.current?.()
    }
    const remaining = dragFiles.filter(f => f.fileName !== fileName)
    setDragFiles(remaining)
    if (remaining.length === 0) setDropTarget(null)
  }

  return (
    <div className="h-full flex gap-2 p-4 overflow-hidden cursor-default">
      {/* Left: Folder Tree */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 mb-3 shrink-0">
          <button
            onClick={() => { if (expanded) handleCollapseAll(); else handleExpandAll(); setExpanded(!expanded) }}
            className="text-gray-300 bg-gray-700 hover:bg-gray-600 p-1.5 rounded"
          >{expanded
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
          }</button>
          <button
            onClick={loadTree}
            className="text-gray-300 bg-gray-700 hover:bg-gray-600 p-1.5 rounded"
          ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0115-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 01-15 6.7L3 16"/></svg></button>
          <div className="flex items-center gap-1">
            <select
              value={sortField}
              onChange={e => { const v = e.target.value as SortField; setSortField(v); localStorage.setItem(SORT_BY_KEY, v) }}
              className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded focus:outline-none"
            >
              <option value="name">이름</option>
              <option value="count">항목 수</option>
            </select>
            <button
              onClick={() => setSortDir(d => { const next = d === 'asc' ? 'desc' : 'asc'; localStorage.setItem(SORT_DIR_KEY, next); return next })}
              className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-2 py-1.5 rounded"
            >{sortDir === 'asc' ? '↑' : '↓'}</button>
          </div>
          <div className="flex items-center gap-1">
            <select
              value={searchField}
              onChange={e => { const v = e.target.value as SearchField; setSearchField(v); localStorage.setItem(SEARCH_FIELD_KEY, v) }}
              className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded-l focus:outline-none"
            >
              <option value="actor">배우</option>
              <option value="folder">폴더</option>
            </select>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="검색"
              className={`bg-gray-700 text-white text-sm px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 w-32 ${search ? '' : 'rounded-r'}`}
            />
            {search && (
              <button onClick={() => setSearch('')} className="bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white text-sm px-1.5 py-1.5 rounded-r">✕</button>
            )}
          </div>
          <span className="text-gray-500 text-sm">총 {totalFolders}개{search.trim() ? ` (${countAllFolders(displayTree)})` : ''}</span>
        </div>
        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          {loading ? (
            <p className="text-gray-500 text-sm">로딩 중...</p>
          ) : displayTree.length === 0 ? (
            <p className="text-gray-500 text-sm">{search.trim() ? '검색 결과가 없습니다' : '등록된 로컬 파일이 없습니다'}</p>
          ) : (
            displayTree.map(node => (
              <FolderItem key={`${node.path}_${toggleKey}`} node={node} depth={0} onRefresh={loadTree} onNavigateToActor={onNavigateToActor} onNavigateToWork={onNavigateToWork} onDrop={handleDrop} dropTarget={dropTarget} dragFiles={dragFiles} onMoveConfirmOne={handleMoveConfirmOne} onMoveCancelOne={handleMoveCancelOne} onNewActorConfirmOne={handleNewActorConfirmOne} />
            ))
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="w-px bg-gray-700 shrink-0" />

      {/* Right: Temp Folder */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <TempFolder onDragFiles={setDragFiles} refreshRef={tempRefreshRef} />
      </div>

    </div>
  )
}
