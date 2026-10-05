import { useState, useEffect, useCallback } from 'react'
import { folderApi } from '../api'

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
}

function countAllFolders(nodes: FolderNode[]): number {
  let count = nodes.length
  for (const n of nodes) count += countAllFolders(n.children)
  return count
}

function FolderItem({ node, depth, onRefresh }: { node: FolderNode; depth: number; onRefresh: () => void }) {
  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(node.name)
  const [fileRenaming, setFileRenaming] = useState<number | null>(null)
  const [fileNewName, setFileNewName] = useState('')

  const hasChildren = node.children.length > 0 || node.files.length > 0

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
          onClick={() => setOpen(!open)}
          className="text-gray-400 text-xs w-4 shrink-0"
        >
          {hasChildren ? (open ? '▼' : '▶') : ' '}
        </button>
        <span className={`text-sm ${node.exists ? 'text-gray-300' : 'text-red-400'}`}>
          {node.exists ? '📁' : '📁⚠️'} {node.name}
        </span>
        <span className="text-gray-500 text-xs ml-1">({node.fileCount})</span>
        <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 transition pr-2">
          {node.exists ? (
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
            <FolderItem key={child.path} node={child} depth={depth + 1} onRefresh={onRefresh} />
          ))}
          {node.files.map(file => (
            <div key={file.id}>
              <div
                className="flex items-center gap-1 py-0.5 hover:bg-gray-800/50 rounded group"
                style={{ paddingLeft: (depth + 1) * 20 + 12 }}
              >
                <span className={`text-sm ${file.exists ? 'text-gray-400' : 'text-red-400'}`}>
                  {file.fileName}
                </span>
                <span className="text-gray-600 text-xs mx-1">←</span>
                <span className="text-gray-500 text-xs">{file.workLabel}</span>
                <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 transition pr-2">
                  {file.exists ? (
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

export default function Files() {
  const [tree, setTree] = useState<FolderNode[]>([])
  const [loading, setLoading] = useState(true)

  const loadTree = useCallback(async () => {
    setLoading(true)
    const data = await folderApi.tree() as FolderNode[]
    setTree(data)
    setLoading(false)
  }, [])

  useEffect(() => { loadTree() }, [loadTree])

  const totalFolders = countAllFolders(tree)

  return (
    <div className="h-full flex flex-col p-4 overflow-hidden">
      <div className="flex items-center gap-3 mb-3 shrink-0">
        <button
          onClick={loadTree}
          className="text-sm text-gray-300 bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded"
        >새로고침</button>
        <span className="text-gray-500 text-sm">총 {totalFolders}개 폴더</span>
      </div>
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {loading ? (
          <p className="text-gray-500 text-sm">로딩 중...</p>
        ) : tree.length === 0 ? (
          <p className="text-gray-500 text-sm">등록된 로컬 파일이 없습니다</p>
        ) : (
          tree.map(node => (
            <FolderItem key={node.path} node={node} depth={0} onRefresh={loadTree} />
          ))
        )}
      </div>
    </div>
  )
}
