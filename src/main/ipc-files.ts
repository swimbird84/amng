import { ipcMain, shell } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { getDatabase } from './db'
import { deleteImagesByPattern } from './ipc-system'

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

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/')
}

function buildTree(rows: { id: number; work_id: number; file_path: string; product_number: string | null; title: string | null }[]): FolderNode[] {
  const root = new Map<string, FolderNode>()

  const getOrCreateNode = (folderPath: string, nodeMap: Map<string, FolderNode>): FolderNode => {
    const normalized = normalizePath(folderPath)
    if (nodeMap.has(normalized)) return nodeMap.get(normalized)!
    const node: FolderNode = {
      name: path.basename(folderPath) || folderPath,
      path: folderPath,
      fileCount: 0,
      exists: false,
      files: [],
      children: [],
    }
    nodeMap.set(normalized, node)
    return node
  }

  // Collect all unique folder paths and build flat map
  const allNodes = new Map<string, FolderNode>()

  for (const row of rows) {
    const dir = path.dirname(row.file_path)
    const node = getOrCreateNode(dir, allNodes)
    node.fileCount++
    node.files.push({
      id: row.id,
      workId: row.work_id,
      fileName: path.basename(row.file_path),
      filePath: row.file_path,
      workLabel: row.product_number || row.title || `#${row.work_id}`,
      exists: false,
    })
    // Ensure all ancestor folders exist in allNodes
    let ancestor = path.dirname(dir)
    while (ancestor !== dir && ancestor !== path.dirname(ancestor)) {
      getOrCreateNode(ancestor, allNodes)
      const next = path.dirname(ancestor)
      if (next === ancestor) break
      ancestor = next
    }
  }

  // Check existence
  for (const node of allNodes.values()) {
    try { node.exists = fs.existsSync(node.path) } catch { node.exists = false }
    for (const f of node.files) {
      try { f.exists = fs.existsSync(f.filePath) } catch { f.exists = false }
    }
  }

  // Build hierarchy: link children to parents
  const rootNodes: FolderNode[] = []
  for (const node of allNodes.values()) {
    const parentPath = path.dirname(node.path)
    const normalizedParent = normalizePath(parentPath)
    const normalizedSelf = normalizePath(node.path)
    if (normalizedParent === normalizedSelf || !allNodes.has(normalizedParent)) {
      rootNodes.push(node)
    } else {
      allNodes.get(normalizedParent)!.children.push(node)
    }
  }

  // Sort children and files
  const sortNodes = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name))
    for (const n of nodes) {
      n.files.sort((a, b) => a.fileName.localeCompare(b.fileName))
      sortNodes(n.children)
    }
  }
  sortNodes(rootNodes)

  // Fill in missing intermediate folders for display
  // (e.g., if we have D:/a/b/c but not D:/a/b, create D:/a/b as empty node)
  // Already handled by getOrCreateNode — intermediate folders without files just won't exist
  // We need to create them if there are gaps
  const ensureIntermediates = (nodes: FolderNode[]): FolderNode[] => {
    // Group by common prefixes and create intermediate nodes as needed
    // For simplicity, we rely on the fact that parent dirs are included if they have files
    // Missing intermediates are handled by re-rooting orphan nodes
    return nodes
  }

  return ensureIntermediates(rootNodes)
}

export function registerFilesHandlers(): void {
  const db = () => getDatabase()

  ipcMain.handle('folder:tree', () => {
    const rows = db().prepare(`
      SELECT wf.id, wf.work_id, wf.file_path, w.product_number, w.title
      FROM work_files wf
      JOIN works w ON w.id = wf.work_id
      WHERE wf.type = 'local'
    `).all() as { id: number; work_id: number; file_path: string; product_number: string | null; title: string | null }[]
    const tree = buildTree(rows)

    // Match folders to actors/works
    const actors = db().prepare('SELECT id, name, aliases, birthday FROM actors WHERE is_deleted = 0').all() as { id: number; name: string; aliases: string | null; birthday: string | null }[]
    const actorPattern = /^(.+)\s+(\d{4}-\d{2}-\d{2})$/
    const workPattern = /^(\d{4}-\d{2}-\d{2})\s+(.+)$/

    const matchFolder = (node: FolderNode) => {
      const folderName = node.name
      // Try actor match
      const am = folderName.match(actorPattern)
      if (am) {
        const nameInFolder = am[1].trim()
        const birthday = am[2]
        const actor = actors.find(a => {
          if (a.birthday !== birthday) return false
          if (a.name === nameInFolder) return true
          if (a.aliases) {
            const aliasList = a.aliases.split(',').map(s => s.trim())
            return aliasList.includes(nameInFolder)
          }
          return false
        })
        if (actor) {
          node.matchedActorId = actor.id
          node.matchedActorName = actor.name
        }
      }
      // Try work match
      const wm = folderName.match(workPattern)
      if (wm) {
        const productNumber = wm[2].trim()
        const work = db().prepare('SELECT id, product_number, title FROM works WHERE product_number = ?').get(productNumber) as { id: number; product_number: string | null; title: string | null } | undefined
        if (work) {
          node.matchedWorkId = work.id
          node.matchedWorkLabel = work.product_number || work.title || `#${work.id}`
        }
      }
      for (const child of node.children) matchFolder(child)
    }
    for (const node of tree) matchFolder(node)

    return tree
  })

  ipcMain.handle('folder:rename', (_e, oldPath: string, newPath: string) => {
    try {
      fs.renameSync(oldPath, newPath)
    } catch (err: unknown) {
      return { ok: false, error: (err as Error).message }
    }
    const oldPrefix = oldPath.replace(/\\/g, '/')
    const newPrefix = newPath.replace(/\\/g, '/')
    db().prepare(`UPDATE work_files SET file_path = REPLACE(REPLACE(file_path, '\\', '/'), ?, ?) WHERE REPLACE(file_path, '\\', '/') LIKE ? || '%'`).run(oldPrefix, newPrefix, oldPrefix)
    db().prepare(`UPDATE works SET file_path = REPLACE(REPLACE(file_path, '\\', '/'), ?, ?) WHERE REPLACE(file_path, '\\', '/') LIKE ? || '%'`).run(oldPrefix, newPrefix, oldPrefix)
    db().prepare(`UPDATE works SET cover_path = REPLACE(REPLACE(cover_path, '\\', '/'), ?, ?) WHERE cover_path IS NOT NULL AND REPLACE(cover_path, '\\', '/') LIKE ? || '%'`).run(oldPrefix, newPrefix, oldPrefix)
    return { ok: true }
  })

  ipcMain.handle('file:rename', (_e, oldPath: string, newPath: string) => {
    try {
      fs.renameSync(oldPath, newPath)
    } catch (err: unknown) {
      return { ok: false, error: (err as Error).message }
    }
    db().prepare(`UPDATE work_files SET file_path = ? WHERE file_path = ?`).run(newPath, oldPath)
    db().prepare(`UPDATE works SET file_path = ? WHERE file_path = ?`).run(newPath, oldPath)
    return { ok: true }
  })

  ipcMain.handle('folder:delete', async (_e, folderPath: string) => {
    // Find all work_ids that have files under this folder
    const normalizedFolder = folderPath.replace(/\\/g, '/')
    const fileRows = db().prepare(`
      SELECT DISTINCT wf.work_id FROM work_files wf
      WHERE wf.type = 'local' AND REPLACE(wf.file_path, '\\', '/') LIKE ? || '%'
    `).all(normalizedFolder) as { work_id: number }[]
    const workIds = fileRows.map(r => r.work_id)

    if (workIds.length === 0) return { ok: false, error: '해당 폴더에 등록된 작품이 없습니다' }

    // Check if any work is in an in-progress tournament
    const ph = workIds.map(() => '?').join(',')
    const blocked = db().prepare(`
      SELECT 1 FROM cup_entries e
      JOIN cup_runs r ON r.id = e.run_id
      JOIN cup_tournaments t ON t.id = r.tournament_id AND t.type = 'work'
      WHERE r.status = 'in_progress' AND e.item_id IN (${ph})
      LIMIT 1
    `).get(...workIds)
    if (blocked) return { ok: false, error: '진행 중인 대회에 참가한 작품이 포함되어 있습니다', blocked: true }

    // Trash the folder
    try {
      if (fs.existsSync(folderPath)) {
        await shell.trashItem(folderPath)
      }
    } catch (err: unknown) {
      return { ok: false, error: (err as Error).message }
    }

    // Delete works and related data
    for (const workId of workIds) {
      deleteImagesByPattern('works', workId)
      db().prepare('DELETE FROM works WHERE id = ?').run(workId)
      db().prepare(`DELETE FROM master_ranking_history WHERE type = 'work' AND item_id = ?`).run(workId)
      db().prepare(`DELETE FROM cup_entries WHERE item_id = ? AND run_id IN (SELECT r.id FROM cup_runs r JOIN cup_tournaments t ON t.id = r.tournament_id WHERE t.type = 'work')`).run(workId)
      db().prepare(`DELETE FROM cup_stats WHERE type = 'work' AND item_id = ?`).run(workId)
      db().prepare(`DELETE FROM cup_rank_snapshots WHERE item_id = ? AND tournament_id IN (SELECT id FROM cup_tournaments WHERE type = 'work')`).run(workId)
    }

    // Check if this is an actor folder (parent of work folders) — soft delete actor if name matches pattern
    // Actor folder detection: check if folder name matches "이름 YYYY-MM-DD" pattern
    const folderName = path.basename(folderPath)
    const actorMatch = folderName.match(/^(.+)\s+(\d{4}-\d{2}-\d{2})$/)
    if (actorMatch) {
      const actorName = actorMatch[1].trim()
      const actorBirthday = actorMatch[2]
      const actor = db().prepare('SELECT id FROM actors WHERE name = ? AND birthday = ? AND is_deleted = 0').get(actorName, actorBirthday) as { id: number } | undefined
      if (actor) {
        db().prepare('UPDATE actors SET is_deleted = 1 WHERE id = ?').run(actor.id)
      }
    }

    return { ok: true, deletedWorks: workIds.length }
  })
}
