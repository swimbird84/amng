import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { tempApi, dialogApi, shellApi, imageApi } from '../api'
import SearchUrlModal from './SearchUrlModal'
import QuickSearchButton from './QuickSearchButton'

function copyText(text: string) {
  const ta = document.createElement('textarea')
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
  document.body.appendChild(ta); ta.select(); document.execCommand('copy')
  document.body.removeChild(ta)
}

function getProductNumber(baseName: string, allBaseNames?: string[]): string {
  const m = baseName.match(/^(.+?)_(\d+)$/)
  if (!m) return baseName
  if (!allBaseNames) return m[1]
  // Only strip suffix if there are consecutive numbered files with same prefix
  const prefix = m[1]
  const count = allBaseNames.filter(n => {
    const m2 = n.match(/^(.+?)_\d+$/)
    return m2 && m2[1] === prefix
  }).length
  return count >= 2 ? prefix : baseName
}

interface TempFile {
  fileName: string
  baseName: string
  videoPath: string
  thumbPath: string | null
  fileSize: number
  mtime: number
}

type SortBy = 'name' | 'thumb' | 'size' | 'date'

function formatFileSize(bytes: number | undefined): string {
  if (!bytes || isNaN(bytes)) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

interface Props {
  onDragFiles: (files: TempFile[]) => void
  refreshRef?: React.MutableRefObject<(() => void) | null>
  onTreeRefresh?: () => void
}

const TEMP_FOLDER_KEY = 'files:tempFolder'

export default function TempFolder({ onDragFiles, refreshRef, onTreeRefresh }: Props) {
  const [folderPath, setFolderPath] = useState(() => localStorage.getItem(TEMP_FOLDER_KEY) || '')
  const [files, setFiles] = useState<TempFile[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [lastClicked, setLastClicked] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = (msg: string, persistent = false) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    if (!persistent) {
      toastTimer.current = setTimeout(() => setToast(null), 1500)
    }
  }
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; fileName: string } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [showUrlModal, setShowUrlModal] = useState(false)
  const [removeStr, setRemoveStr] = useState(() => localStorage.getItem('files:removeString') || '')
  const [viewMode, setViewMode] = useState<'icon' | 'list'>(() => (localStorage.getItem('files:viewMode') as 'icon' | 'list') || 'icon')
  const [sortBy, setSortBy] = useState<SortBy>(() => (localStorage.getItem('files:sortBy') as SortBy) || 'name')
  const [sortAsc, setSortAsc] = useState(() => localStorage.getItem('files:sortAsc') !== 'false')
  const [newName, setNewName] = useState('')
  const [thumbCache, setThumbCache] = useState<Map<string, string>>(new Map())
  const [previewImage, setPreviewImage] = useState<{ path: string; fileName: string } | null>(null)
  const [previewBase64, setPreviewBase64] = useState<string | null>(null)

  useEffect(() => {
    if (!previewImage) { setPreviewBase64(null); return }
    imageApi.read(previewImage.path).then(b64 => setPreviewBase64(b64 as string | null)).catch(() => setPreviewBase64(null))
  }, [previewImage])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selected.size > 0 && !renaming) handleDelete()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selected, renaming])

  // Drag selection state
  const [dragSelecting, setDragSelecting] = useState(false)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const loadFiles = useCallback(async () => {
    if (!folderPath) return
    const scrollTop = gridRef.current?.scrollTop ?? 0
    setLoading(true)
    setError(null)
    const res = await tempApi.listFiles(folderPath)
    if (res.ok) {
      setFiles(res.files)
      setThumbCache(new Map())
      setLoading(false)
      requestAnimationFrame(() => { if (gridRef.current) gridRef.current.scrollTop = scrollTop })
      // Load thumbnails in background
      for (const f of res.files) {
        if (f.thumbPath) {
          imageApi.read(f.thumbPath).then(base64 => {
            if (base64) setThumbCache(prev => new Map(prev).set(f.fileName, base64 as string))
          }).catch(() => {})
        }
      }
    } else {
      setError(res.error || '폴더를 읽을 수 없습니다')
      setFiles([])
      setLoading(false)
    }
  }, [folderPath])

  useEffect(() => { if (folderPath) loadFiles() }, [folderPath, loadFiles])


  useEffect(() => {
    if (refreshRef) refreshRef.current = loadFiles
  }, [refreshRef, loadFiles])

  const handleSelectFolder = async () => {
    const result = await dialogApi.openFolder() as string | null
    if (result) {
      setFolderPath(result)
      localStorage.setItem(TEMP_FOLDER_KEY, result)
    }
  }

  // Selection logic
  const handleClick = (index: number, e: React.MouseEvent) => {
    const fileName = files[index].fileName
    if (e.shiftKey && lastClicked !== null) {
      const start = Math.min(lastClicked, index)
      const end = Math.max(lastClicked, index)
      const newSet = new Set(selected)
      for (let i = start; i <= end; i++) newSet.add(files[i].fileName)
      setSelected(newSet)
    } else if (e.ctrlKey || e.metaKey) {
      const newSet = new Set(selected)
      if (newSet.has(fileName)) newSet.delete(fileName); else newSet.add(fileName)
      setSelected(newSet)
    } else {
      setSelected(new Set([fileName]))
    }
    setLastClicked(index)
  }

  const handleDoubleClick = (file: TempFile) => {
    shellApi.openPath(file.videoPath)
  }

  const CONTEXT_MENU_W = 192
  const CONTEXT_MENU_H = 120
  const handleContextMenu = (e: React.MouseEvent, fileName: string) => {
    e.preventDefault()
    if (!selected.has(fileName)) setSelected(new Set([fileName]))
    let x = e.clientX
    let y = e.clientY
    if (x + CONTEXT_MENU_W > window.innerWidth) x = e.clientX - CONTEXT_MENU_W
    if (y + CONTEXT_MENU_H > window.innerHeight) y = e.clientY - CONTEXT_MENU_H
    setContextMenu({ x, y, fileName })
  }

  const handleRename = async () => {
    if (!renaming || !newName.trim()) { setRenaming(null); return }
    const ext = renaming.substring(renaming.lastIndexOf('.'))
    const fullNewName = newName.trim().endsWith(ext) ? newName.trim() : newName.trim() + ext
    const res = await tempApi.renameFile(folderPath, renaming, fullNewName)
    if (res.ok) {
      loadFiles()
    } else {
      alert(res.error || '이름 변경 실패')
    }
    setRenaming(null)
  }

  const handleDelete = async () => {
    const targets = [...selected]
    if (targets.length === 0) return
    if (!confirm(`${targets.length}개 파일을 삭제하시겠습니까?`)) return
    await tempApi.deleteFile(folderPath, targets)
    setSelected(new Set())
    loadFiles()
  }

  // Drag selection
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || e.target !== gridRef.current) return
    setDragSelecting(true)
    setDragStart({ x: e.clientX, y: e.clientY })
    setDragCurrent({ x: e.clientX, y: e.clientY })
    if (!e.ctrlKey && !e.shiftKey) setSelected(new Set())
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragSelecting) return
    setDragCurrent({ x: e.clientX, y: e.clientY })
    // Check which items intersect drag rect
    if (!dragStart) return
    const rect = {
      left: Math.min(dragStart.x, e.clientX),
      top: Math.min(dragStart.y, e.clientY),
      right: Math.max(dragStart.x, e.clientX),
      bottom: Math.max(dragStart.y, e.clientY),
    }
    const newSet = new Set<string>()
    itemRefs.current.forEach((el, fileName) => {
      const r = el.getBoundingClientRect()
      if (r.right > rect.left && r.left < rect.right && r.bottom > rect.top && r.top < rect.bottom) {
        newSet.add(fileName)
      }
    })
    setSelected(newSet)
  }

  const handleMouseUp = () => {
    setDragSelecting(false)
    setDragStart(null)
    setDragCurrent(null)
  }

  // Drag to tree
  const handleDragStart = (e: React.DragEvent, file: TempFile) => {
    // Auto-select if not already selected
    if (!selected.has(file.fileName)) {
      setSelected(new Set([file.fileName]))
    }
    const dragSet = selected.has(file.fileName) ? selected : new Set([file.fileName])
    const dragItems = files.filter(f => dragSet.has(f.fileName))
    e.dataTransfer.setData('text/plain', JSON.stringify(dragItems.map(f => f.fileName)))
    e.dataTransfer.effectAllowed = 'move'
    onDragFiles(dragItems)
  }

  const dragRect = dragSelecting && dragStart && dragCurrent ? {
    left: Math.min(dragStart.x, dragCurrent.x),
    top: Math.min(dragStart.y, dragCurrent.y),
    width: Math.abs(dragCurrent.x - dragStart.x),
    height: Math.abs(dragCurrent.y - dragStart.y),
  } : null

  const toggleSort = (col: SortBy) => {
    if (sortBy === col) {
      const next = !sortAsc
      setSortAsc(next); localStorage.setItem('files:sortAsc', String(next))
    } else {
      setSortBy(col); localStorage.setItem('files:sortBy', col)
      setSortAsc(true); localStorage.setItem('files:sortAsc', 'true')
    }
  }
  const sortArrow = (col: SortBy) => sortBy === col ? (sortAsc ? ' ↑' : ' ↓') : ''

  const sortedFiles = useMemo(() => {
    const m = sortAsc ? 1 : -1
    return [...files].sort((a, b) => {
      switch (sortBy) {
        case 'thumb': {
          const at = a.thumbPath ? 1 : 0, bt = b.thumbPath ? 1 : 0
          return at !== bt ? m * (bt - at) : a.fileName.localeCompare(b.fileName)
        }
        case 'size': return m * (b.fileSize - a.fileSize) || a.fileName.localeCompare(b.fileName)
        case 'date': return m * (b.mtime - a.mtime) || a.fileName.localeCompare(b.fileName)
        default: return m * a.fileName.localeCompare(b.fileName)
      }
    })
  }, [files, sortBy, sortAsc])

  const origIndexMap = useMemo(() => new Map(files.map((f, i) => [f.fileName, i])), [files])

  const formatDate = (ms: number) => {
    if (!ms) return ''
    const d = new Date(ms)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }

  return (
    <div className="h-full flex flex-col" onClick={() => setContextMenu(null)}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2 shrink-0">
        <button
          onClick={() => { const next = viewMode === 'icon' ? 'list' : 'icon'; setViewMode(next); localStorage.setItem('files:viewMode', next) }}
          className="text-gray-300 bg-gray-700 hover:bg-gray-600 p-1.5 rounded"
        >{viewMode === 'icon'
          ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        }</button>
        <button onClick={() => setShowUrlModal(true)} className="text-gray-300 bg-gray-700 hover:bg-gray-600 p-1.5 rounded"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg></button>
        {folderPath && <button
          onClick={async () => {
            const noThumb = files.filter(f => !f.thumbPath)
            if (noThumb.length === 0) { showToast('다운로드할 파일이 없습니다'); return }
            let count = 0
            for (let i = 0; i < noThumb.length; i++) {
              showToast(`${i + 1}/${noThumb.length} 다운로드 중... (${noThumb[i].baseName})`, true)
              const res = await tempApi.fetchCover(noThumb[i].baseName, folderPath)
              if (res.ok) count++
            }
            showToast(`${count}/${noThumb.length}개 커버 다운로드 완료`)
            loadFiles()
          }}
          className="text-gray-300 bg-gray-700 hover:bg-gray-600 p-1.5 rounded"
        ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>}
        {folderPath && <button
          onClick={async () => {
            const hasThumb = files.filter(f => f.thumbPath)
            if (hasThumb.length === 0) { showToast('배치할 파일이 없습니다'); return }
            let placedCount = 0
            for (let i = 0; i < hasThumb.length; i++) {
              showToast(`${i + 1}/${hasThumb.length} 배치 중... (${hasThumb[i].baseName})`, true)
              const res = await tempApi.fetchCover(hasThumb[i].baseName, folderPath, true)
              if (res.ok && res.autoPlaced) placedCount++
              else if (res.debug) console.log('[autoPlace]', hasThumb[i].baseName, res.debug)
            }
            showToast(placedCount > 0 ? `${placedCount}/${hasThumb.length}개 자동 배치 완료` : '배치 대상이 없습니다')
            loadFiles()
            if (placedCount > 0) onTreeRefresh?.()
          }}
          className="text-gray-300 bg-gray-700 hover:bg-gray-600 p-1.5 rounded"
          title="자동 배치"
        ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg></button>}
        {folderPath && <button onClick={loadFiles} className="text-gray-300 bg-gray-700 hover:bg-gray-600 p-1.5 rounded"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0115-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 01-15 6.7L3 16"/></svg></button>}
        {folderPath && <button onClick={() => shellApi.openPath(folderPath)} className="text-gray-300 bg-gray-700 hover:bg-gray-600 p-1.5 rounded"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg></button>}
        <button onClick={handleSelectFolder} className="text-gray-300 bg-gray-700 hover:bg-gray-600 p-1.5 rounded" title="폴더 선택"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><circle cx="14.5" cy="14.5" r="3"/><path d="M18.5 18.5l-2-2"/></svg></button>
        {folderPath && <span className="text-gray-500 text-xs truncate min-w-0">{folderPath}</span>}
        <div className="flex items-center gap-1 ml-auto">
          <input
            value={removeStr}
            onChange={e => { setRemoveStr(e.target.value); localStorage.setItem('files:removeString', e.target.value) }}
            placeholder="제거할 문자열"
            className="bg-gray-700 text-white text-xs px-2 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 w-24"
          />
          <button
            onClick={async () => {
              if (!folderPath) return
              if (removeStr.trim()) {
                if (!confirm(`모든 파일명에서 "${removeStr}"를 제거하시겠습니까?`)) return
                const res = await tempApi.removeString(folderPath, removeStr.trim())
                if (res.ok) { loadFiles() }
                else alert(res.error || '제거 실패')
              } else {
                const atFiles = files.filter(f => f.fileName.includes('@'))
                if (atFiles.length === 0) { showToast('@가 포함된 파일이 없습니다'); return }
                if (!confirm(`${atFiles.length}개 파일에서 @ 앞 문자열을 제거하시겠습니까?`)) return
                let count = 0
                for (const f of atFiles) {
                  const idx = f.fileName.indexOf('@')
                  const newName = f.fileName.substring(idx + 1)
                  if (newName) {
                    const res = await tempApi.renameFile(folderPath, f.fileName, newName)
                    if (res.ok) count++
                  }
                }
                showToast(`${count}/${atFiles.length}개 파일 @ 제거 완료`)
                loadFiles()
              }
            }}
            className="text-gray-300 bg-gray-700 hover:bg-gray-600 p-1.5 rounded" title="문자열 제거"
          ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          <select
            value={sortBy}
            onChange={e => { const v = e.target.value as SortBy; setSortBy(v); localStorage.setItem('files:sortBy', v) }}
            className="bg-gray-700 text-gray-300 text-xs px-1.5 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            <option value="name">파일명</option>
            <option value="thumb">썸네일</option>
            <option value="size">크기</option>
            <option value="date">등록일</option>
          </select>
          <button
            onClick={() => { const next = !sortAsc; setSortAsc(next); localStorage.setItem('files:sortAsc', String(next)) }}
            className="text-gray-300 bg-gray-700 hover:bg-gray-600 p-1.5 rounded text-xs font-bold w-7 text-center"
          >{sortAsc ? '↑' : '↓'}</button>
        </div>
      </div>

      {/* File grid */}
      {!folderPath ? (
        <p className="text-gray-500 text-sm">임시 폴더를 선택하세요</p>
      ) : loading ? (
        <p className="text-gray-500 text-sm">로딩 중...</p>
      ) : error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : files.length === 0 ? (
        <p className="text-gray-500 text-sm">동영상 파일이 없습니다</p>
      ) : (
        <div
          ref={gridRef}
          className="flex-1 overflow-y-auto [scrollbar-gutter:stable] relative select-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {viewMode === 'icon' ? (
            <div className="grid grid-cols-4 gap-2 p-1">
              {sortedFiles.map((file) => {
                const origIdx = origIndexMap.get(file.fileName) ?? 0
                return (
                <div
                  key={file.fileName}
                  ref={el => { if (el) itemRefs.current.set(file.fileName, el); else itemRefs.current.delete(file.fileName) }}
                  className={`flex flex-col items-center p-2 rounded cursor-pointer transition ${selected.has(file.fileName) ? 'bg-blue-600/30 ring-1 ring-blue-500' : 'hover:bg-gray-800'}`}
                  onClick={e => { e.stopPropagation(); handleClick(origIdx, e) }}
                  onDoubleClick={() => handleDoubleClick(file)}
                  onContextMenu={e => handleContextMenu(e, file.fileName)}
                  draggable
                  onDragStart={e => handleDragStart(e, file)}
                >
                  <div className="w-full aspect-[4/3] rounded overflow-hidden bg-gray-800 flex items-center justify-center mb-1 relative group/thumb">
                    {thumbCache.has(file.fileName) ? (
                      <img src={thumbCache.get(file.fileName)} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-3xl">📹</span>
                    )}
                    <div className="absolute bottom-1 left-1 flex gap-1 opacity-0 group-hover/thumb:opacity-100 transition">
                      <button
                        onClick={e => { e.stopPropagation(); copyText(file.baseName); showToast(`${file.baseName} 복사됨`) }}
                        className="bg-black/60 hover:bg-black/80 text-white px-1 py-0.5 rounded"
                      ><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>
                      <QuickSearchButton productNumber={getProductNumber(file.baseName, files.map(f => f.baseName))} className="bg-black/60 hover:bg-black/80 text-white px-1 py-0.5 rounded" />
                      {!file.thumbPath ? <button
                        onClick={async e => { e.stopPropagation(); showToast(`${file.baseName} 다운로드 중...`); const res = await tempApi.fetchCover(file.baseName, folderPath); if (res.ok) { showToast(`${file.baseName} 커버 다운로드 완료`); loadFiles() } else { console.error('[fetchCover]', file.baseName, res.error); showToast('다운로드 실패') } }}
                        className="bg-black/60 hover:bg-black/80 text-white px-1 py-0.5 rounded"
                      ><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
                      : <button
                        onClick={async e => { e.stopPropagation(); showToast(`${file.baseName} 배치 중...`); const res = await tempApi.fetchCover(file.baseName, folderPath, true); if (res.ok && res.autoPlaced) { showToast(`"${file.baseName}" → ${res.actorName} 폴더로 이동`); loadFiles(); onTreeRefresh?.() } else { if (res.debug) console.log('[autoPlace]', file.baseName, res.debug); showToast('배치 대상이 없습니다') } }}
                        className="bg-black/60 hover:bg-black/80 text-white px-1 py-0.5 rounded"
                      ><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg></button>}
                      {file.thumbPath && <button
                        onClick={e => { e.stopPropagation(); setPreviewImage({ path: file.thumbPath!, fileName: file.fileName }) }}
                        className="bg-black/60 hover:bg-black/80 text-white px-1 py-0.5 rounded"
                      ><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>}
                    </div>
                  </div>
                  <span className="text-xs text-gray-300 text-center truncate w-full" title={file.baseName}>{file.baseName}</span>
                </div>
              )})}
            </div>
          ) : (
              <div className="p-1">
                <div className="flex items-center gap-2 px-2 py-1 border-b border-gray-700 text-xs text-gray-400">
                  <span className="w-6 text-center shrink-0 cursor-pointer hover:text-white" onClick={() => toggleSort('thumb')}>썸{sortArrow('thumb')}</span>
                  <span className="flex-1 min-w-0 cursor-pointer hover:text-white" onClick={() => toggleSort('name')}>파일명{sortArrow('name')}</span>
                  <span className="w-16 text-right cursor-pointer hover:text-white shrink-0" onClick={() => toggleSort('size')}>용량{sortArrow('size')}</span>
                  <span className="w-24 text-center shrink-0">기능</span>
                  <span className="w-36 text-center cursor-pointer hover:text-white shrink-0" onClick={() => toggleSort('date')}>등록일{sortArrow('date')}</span>
                </div>
                {sortedFiles.map(file => {
                  const origIdx = origIndexMap.get(file.fileName) ?? 0
                  return (
                    <div
                      key={file.fileName}
                      ref={el => { if (el) itemRefs.current.set(file.fileName, el); else itemRefs.current.delete(file.fileName) }}
                      className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition ${selected.has(file.fileName) ? 'bg-blue-600/30 ring-1 ring-blue-500' : 'hover:bg-gray-800'}`}
                      onClick={e => { e.stopPropagation(); handleClick(origIdx, e) }}
                      onDoubleClick={() => handleDoubleClick(file)}
                      onContextMenu={e => handleContextMenu(e, file.fileName)}
                      draggable
                      onDragStart={e => handleDragStart(e, file)}
                    >
                      <span className="w-6 text-center shrink-0">{file.thumbPath ? <span className="text-green-400 text-xs">●</span> : <span className="text-gray-600 text-xs">○</span>}</span>
                      <span className="text-sm text-gray-300 truncate flex-1 min-w-0" title={file.baseName}>{file.baseName}</span>
                      <span className="text-xs text-gray-500 w-16 text-right shrink-0">{formatFileSize(file.fileSize)}</span>
                      <span className="w-24 flex items-center justify-center gap-1.5 shrink-0">
                        <button onClick={e => { e.stopPropagation(); copyText(file.baseName); showToast(`${file.baseName} 복사됨`) }} className="text-gray-400 hover:text-white"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button>
                        <QuickSearchButton productNumber={getProductNumber(file.baseName, files.map(f => f.baseName))} className="text-gray-400 hover:text-white" />
                        <button onClick={async e => { e.stopPropagation(); showToast(`${file.baseName} 다운로드 중...`); const res = await tempApi.fetchCover(file.baseName, folderPath); if (res.ok) { showToast(`${file.baseName} 커버 다운로드 완료`); loadFiles() } else { showToast('다운로드 실패') } }} className="text-gray-400 hover:text-white"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
                        <button onClick={async e => { e.stopPropagation(); if (!file.thumbPath) return; showToast(`${file.baseName} 배치 중...`); const res = await tempApi.fetchCover(file.baseName, folderPath, true); if (res.ok && res.autoPlaced) { showToast(`"${file.baseName}" → ${res.actorName} 폴더로 이동`); loadFiles(); onTreeRefresh?.() } else { if (res.debug) console.log('[autoPlace]', file.baseName, res.debug); showToast('배치 대상이 없습니다') } }} className={file.thumbPath ? 'text-white hover:text-blue-400' : 'text-gray-600 cursor-default'}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg></button>
                        <button onClick={e => { e.stopPropagation(); if (!file.thumbPath) return; setPreviewImage({ path: file.thumbPath, fileName: file.fileName }) }} className={file.thumbPath ? 'text-white hover:text-blue-400' : 'text-gray-600 cursor-default'}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
                      </span>
                      <span className="text-xs text-gray-500 w-36 text-center shrink-0">{formatDate(file.mtime)}</span>
                    </div>
                  )
                })}
              </div>
          )}
          {/* Drag selection rectangle */}
          {dragRect && (
            <div
              className="fixed border border-blue-400 bg-blue-400/10 pointer-events-none z-50"
              style={{ left: dragRect.left, top: dragRect.top, width: dragRect.width, height: dragRect.height }}
            />
          )}
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed bg-gray-800 border border-gray-600 rounded shadow-lg py-1 z-50 w-48"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => {
              const names = files.filter(f => selected.has(f.fileName)).map(f => f.baseName).join('\n')
              copyText(names)
              setContextMenu(null)
            }}
            className="w-full text-left text-sm text-gray-300 hover:bg-gray-700 px-4 py-1.5"
          >복사 ({selected.size}개)</button>
          {selected.size === 1 && (
            <button
              onClick={() => { setRenaming(contextMenu.fileName); setNewName(contextMenu.fileName.replace(/\.[^.]+$/, '')); setContextMenu(null) }}
              className="w-full text-left text-sm text-gray-300 hover:bg-gray-700 px-4 py-1.5"
            >수정</button>
          )}
          <button
            onClick={() => { handleDelete(); setContextMenu(null) }}
            className="w-full text-left text-sm text-red-400 hover:bg-gray-700 px-4 py-1.5"
          >삭제 ({selected.size}개)</button>
        </div>
      )}

      {/* Rename modal */}
      {renaming && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setRenaming(null)}>
          <div className="bg-gray-800 rounded-lg p-4 w-80" onClick={e => e.stopPropagation()}>
            <p className="text-white text-sm mb-3">파일명 변경</p>
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenaming(null) }}
              className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 mb-3"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setRenaming(null)} className="text-sm text-gray-300 bg-gray-600 hover:bg-gray-500 px-3 py-1.5 rounded">취소</button>
              <button onClick={handleRename} className="text-sm text-white bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded">변경</button>
            </div>
          </div>
        </div>
      )}

      {/* URL modal */}
      {showUrlModal && (
        <SearchUrlModal onClose={() => setShowUrlModal(false)} />
      )}

      {/* Image preview modal */}
      {previewImage && previewBase64 && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <img src={previewBase64} className="max-w-full max-h-[90vh] object-contain rounded" />
            <div className="absolute top-2 right-2 flex gap-1">
              <button
                onClick={async () => {
                  if (!confirm(`${previewImage.fileName}의 커버 이미지를 삭제하시겠습니까?`)) return
                  await shellApi.deleteFiles([previewImage.path])
                  setPreviewImage(null)
                  loadFiles()
                }}
                className="bg-black/60 hover:bg-red-600 text-white p-1.5 rounded"
              ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
              <button
                onClick={() => setPreviewImage(null)}
                className="bg-black/60 hover:bg-black/80 text-white p-1.5 rounded"
              ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-700 text-white text-sm px-4 py-2 rounded shadow-lg z-50 pointer-events-none animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  )
}
