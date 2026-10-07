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

function buildTree(
  rows: { id: number; work_id: number; file_path: string; product_number: string | null; title: string | null }[],
  actors: { id: number; name: string; aliases: string | null; birthday: string | null }[],
  worksMap: Map<string, { id: number; label: string }>
): FolderNode[] {
  const allNodes = new Map<string, FolderNode>()

  const getOrCreateNode = (folderPath: string): FolderNode => {
    const normalized = normalizePath(folderPath)
    if (allNodes.has(normalized)) return allNodes.get(normalized)!
    const node: FolderNode = {
      name: path.basename(folderPath) || folderPath,
      path: folderPath,
      fileCount: 0,
      exists: false,
      files: [],
      children: [],
    }
    allNodes.set(normalized, node)
    return node
  }

  // Collect all file dirs + ensure ancestors up to common root
  const allDirs = new Set<string>()
  for (const row of rows) {
    const dir = normalizePath(path.dirname(row.file_path))
    allDirs.add(dir)
  }

  // Find common prefix depth to avoid creating nodes all the way to drive root
  const dirList = [...allDirs]
  let commonPrefix = ''
  if (dirList.length > 0) {
    const parts0 = dirList[0].split('/')
    outer:
    for (let i = 0; i < parts0.length; i++) {
      const segment = parts0[i]
      for (let j = 1; j < dirList.length; j++) {
        const partsJ = dirList[j].split('/')
        if (i >= partsJ.length || partsJ[i] !== segment) break outer
      }
      commonPrefix += (i > 0 ? '/' : '') + segment
    }
  }
  // Go one level up from common prefix so the common folder itself is visible
  const stopAt = commonPrefix ? normalizePath(path.dirname(commonPrefix.replace(/\//g, path.sep))) : ''

  for (const row of rows) {
    const dir = path.dirname(row.file_path)
    const node = getOrCreateNode(dir)
    node.fileCount++
    node.files.push({
      id: row.id,
      workId: row.work_id,
      fileName: path.basename(row.file_path),
      filePath: row.file_path,
      workLabel: row.product_number || row.title || `#${row.work_id}`,
      exists: false,
    })
    // Create ancestors up to stopAt (not all the way to root)
    let current = normalizePath(dir)
    let parent = normalizePath(path.dirname(dir))
    while (parent !== current && parent !== stopAt) {
      getOrCreateNode(parent.replace(/\//g, path.sep))
      current = parent
      parent = normalizePath(path.dirname(current.replace(/\//g, path.sep)))
    }
    if (parent !== current) {
      getOrCreateNode(parent.replace(/\//g, path.sep))
    }
  }

  // Existence check is deferred — default to true, check lazily via folder:checkExists
  for (const node of allNodes.values()) {
    node.exists = true
    for (const f of node.files) f.exists = true
  }

  // Match folders to actors/works
  const actorPattern = /^(.+)\s+(\d{4}-\d{2}-\d{2})$/
  const workPattern = /^(\d{4}-\d{2}-\d{2})\s+(.+)$/

  for (const node of allNodes.values()) {
    const folderName = node.name
    // Actor match
    const am = folderName.match(actorPattern)
    if (am) {
      const nameInFolder = am[1].trim()
      const birthday = am[2]
      const actor = actors.find(a => {
        if (a.birthday !== birthday) return false
        if (a.name === nameInFolder) return true
        if (a.aliases) {
          return a.aliases.split(',').map(s => s.trim()).includes(nameInFolder)
        }
        return false
      })
      if (actor) {
        node.matchedActorId = actor.id
        node.matchedActorName = actor.name
      }
    }
    // Work match (from pre-loaded map)
    const wm = folderName.match(workPattern)
    if (wm) {
      const productNumber = wm[2].trim()
      const work = worksMap.get(productNumber)
      if (work) {
        node.matchedWorkId = work.id
        node.matchedWorkLabel = work.label
      }
    }
  }

  // Build hierarchy
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

  // Sort
  const sortNodes = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name))
    for (const n of nodes) {
      n.files.sort((a, b) => a.fileName.localeCompare(b.fileName))
      sortNodes(n.children)
    }
  }
  sortNodes(rootNodes)

  return rootNodes
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

    const actors = db().prepare('SELECT id, name, aliases, birthday FROM actors WHERE is_deleted = 0').all() as { id: number; name: string; aliases: string | null; birthday: string | null }[]

    // Pre-load all works into a map for O(1) lookup
    const allWorks = db().prepare('SELECT id, product_number, title FROM works WHERE product_number IS NOT NULL').all() as { id: number; product_number: string; title: string | null }[]
    const worksMap = new Map<string, { id: number; label: string }>()
    for (const w of allWorks) {
      worksMap.set(w.product_number, { id: w.id, label: w.product_number || w.title || `#${w.id}` })
    }

    return buildTree(rows, actors, worksMap)
  })

  ipcMain.handle('folder:checkExists', (_e, paths: string[]) => {
    const result: Record<string, boolean> = {}
    for (const p of paths) {
      try { result[p] = fs.existsSync(p) } catch { result[p] = false }
    }
    return result
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
    const normalizedFolder = folderPath.replace(/\\/g, '/')
    const fileRows = db().prepare(`
      SELECT DISTINCT wf.work_id FROM work_files wf
      WHERE wf.type = 'local' AND REPLACE(wf.file_path, '\\', '/') LIKE ? || '%'
    `).all(normalizedFolder) as { work_id: number }[]
    const workIds = fileRows.map(r => r.work_id)

    if (workIds.length === 0) return { ok: false, error: '해당 폴더에 등록된 작품이 없습니다' }

    const ph = workIds.map(() => '?').join(',')
    const blocked = db().prepare(`
      SELECT 1 FROM cup_entries e
      JOIN cup_runs r ON r.id = e.run_id
      JOIN cup_tournaments t ON t.id = r.tournament_id AND t.type = 'work'
      WHERE r.status = 'in_progress' AND e.item_id IN (${ph})
      LIMIT 1
    `).get(...workIds)
    if (blocked) return { ok: false, error: '진행 중인 대회에 참가한 작품이 포함되어 있습니다', blocked: true }

    try {
      if (fs.existsSync(folderPath)) {
        await shell.trashItem(folderPath)
      }
    } catch (err: unknown) {
      return { ok: false, error: (err as Error).message }
    }

    for (const workId of workIds) {
      deleteImagesByPattern('works', workId)
      db().prepare('DELETE FROM works WHERE id = ?').run(workId)
      db().prepare(`DELETE FROM master_ranking_history WHERE type = 'work' AND item_id = ?`).run(workId)
      db().prepare(`DELETE FROM cup_entries WHERE item_id = ? AND run_id IN (SELECT r.id FROM cup_runs r JOIN cup_tournaments t ON t.id = r.tournament_id WHERE t.type = 'work')`).run(workId)
      db().prepare(`DELETE FROM cup_stats WHERE type = 'work' AND item_id = ?`).run(workId)
      db().prepare(`DELETE FROM cup_rank_snapshots WHERE item_id = ? AND tournament_id IN (SELECT id FROM cup_tournaments WHERE type = 'work')`).run(workId)
    }

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

  // ========== 임시 폴더 핸들러 ==========

  const VIDEO_EXTS = new Set(['.mp4', '.avi', '.mkv', '.wmv', '.mov', '.flv', '.webm', '.m4v', '.ts', '.rmvb'])
  const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'])

  ipcMain.handle('temp:listFiles', async (_e, folderPath: string) => {
    try {
      const entries = await fs.promises.readdir(folderPath, { withFileTypes: true })
      const fileNames = entries.filter(e => e.isFile()).map(e => e.name)

      const imageMap = new Map<string, string>()
      for (const name of fileNames) {
        const ext = path.extname(name).toLowerCase()
        if (IMAGE_EXTS.has(ext)) {
          const base = path.basename(name, ext)
          imageMap.set(base.toLowerCase(), path.join(folderPath, name))
        }
      }

      const result: { fileName: string; baseName: string; videoPath: string; thumbPath: string | null; fileSize: number }[] = []
      for (const name of fileNames) {
        const ext = path.extname(name).toLowerCase()
        if (!VIDEO_EXTS.has(ext)) continue
        const base = path.basename(name, ext)
        // Image matching: exact match first, then _prefix match
        let thumb = imageMap.get(base.toLowerCase()) ?? null
        if (!thumb) {
          const prefixMatch = base.match(/^(.+?)_\d+$/)
          if (prefixMatch) thumb = imageMap.get(prefixMatch[1].toLowerCase()) ?? null
        }
        let fileSize = 0
        try { fileSize = (await fs.promises.stat(path.join(folderPath, name))).size } catch { /* skip */ }
        result.push({ fileName: name, baseName: base, videoPath: path.join(folderPath, name), thumbPath: thumb, fileSize })
      }
      result.sort((a, b) => a.fileName.localeCompare(b.fileName))
      return { ok: true, files: result }
    } catch (err: unknown) {
      return { ok: false, error: (err as Error).message, files: [] }
    }
  })

  ipcMain.handle('temp:renameFile', async (_e, folderPath: string, oldName: string, newName: string) => {
    const oldBase = path.basename(oldName, path.extname(oldName))
    const newBase = path.basename(newName, path.extname(newName))
    try {
      // Rename video
      await fs.promises.rename(path.join(folderPath, oldName), path.join(folderPath, newName))
      // Rename matching image if exists
      const entries = await fs.promises.readdir(folderPath)
      for (const entry of entries) {
        const ext = path.extname(entry).toLowerCase()
        if (IMAGE_EXTS.has(ext) && path.basename(entry, ext).toLowerCase() === oldBase.toLowerCase()) {
          await fs.promises.rename(path.join(folderPath, entry), path.join(folderPath, newBase + ext))
          break
        }
      }
      return { ok: true }
    } catch (err: unknown) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('temp:deleteFile', async (_e, folderPath: string, fileNames: string[]) => {
    let deleted = 0
    for (const fileName of fileNames) {
      const base = path.basename(fileName, path.extname(fileName))
      try {
        // Delete video
        const videoPath = path.join(folderPath, fileName)
        if (fs.existsSync(videoPath)) { await shell.trashItem(videoPath); deleted++ }
        // Delete matching image
        const entries = await fs.promises.readdir(folderPath).catch(() => [] as string[])
        for (const entry of (entries as unknown as string[])) {
          const ext = path.extname(entry).toLowerCase()
          if (IMAGE_EXTS.has(ext) && path.basename(entry, ext).toLowerCase() === base.toLowerCase()) {
            await shell.trashItem(path.join(folderPath, entry))
            break
          }
        }
      } catch { /* skip */ }
    }
    return { ok: true, deleted }
  })

  // Extract product number from filename (strip _N suffix)
  function getProductNumber(baseName: string): string {
    const m = baseName.match(/^(.+?)_\d+$/)
    return m ? m[1] : baseName
  }

  // Move files to actor folder, grouping _N suffixed files under same product number
  async function moveFilesToActorFolder(srcFolder: string, fileNames: string[], targetActorFolder: string, releaseDate: string, actorId: number | null): Promise<string[]> {
    const moved: string[] = []

    // Group files by product number
    const groups = new Map<string, string[]>()
    for (const fileName of fileNames) {
      const base = path.basename(fileName, path.extname(fileName))
      const pn = getProductNumber(base)
      if (!groups.has(pn)) groups.set(pn, [])
      groups.get(pn)!.push(fileName)
    }

    for (const [productNumber, groupFiles] of groups) {
      const workFolderName = `${releaseDate} ${productNumber}`
      const workFolderPath = path.join(targetActorFolder, workFolderName)
      try {
        await fs.promises.mkdir(workFolderPath, { recursive: true })

        let firstVideoPath: string | null = null
        let coverPath: string | null = null
        const movedVideoPaths: string[] = []

        for (let i = 0; i < groupFiles.length; i++) {
          const fileName = groupFiles[i]
          const base = path.basename(fileName, path.extname(fileName))
          const videoDestPath = path.join(workFolderPath, fileName)
          await fs.promises.rename(path.join(srcFolder, fileName), videoDestPath)
          movedVideoPaths.push(videoDestPath)
          if (i === 0) firstVideoPath = videoDestPath

          // Move matching images (exact match + prefix match)
          const entries = await fs.promises.readdir(srcFolder).catch(() => [] as string[])
          for (const entry of (entries as unknown as string[])) {
            const ext = path.extname(entry).toLowerCase()
            if (!IMAGE_EXTS.has(ext)) continue
            const imgBase = path.basename(entry, ext).toLowerCase()
            if (imgBase === base.toLowerCase() || imgBase === productNumber.toLowerCase()) {
              const imgDest = path.join(workFolderPath, entry)
              try {
                await fs.promises.rename(path.join(srcFolder, entry), imgDest)
                if (!coverPath) coverPath = imgDest
              } catch { /* already moved */ }
            }
          }
          moved.push(fileName)
        }

        // Lookup studio
        const codeMatch = productNumber.match(/^(.+)-\d/)
        const suffixMatch = !codeMatch ? null : productNumber.match(/^\d[\d-]*-([A-Za-z]+)$/)
        const studioCode = suffixMatch ? suffixMatch[1] : codeMatch ? codeMatch[1] : null
        let studioId: number | null = null
        if (studioCode) {
          const studioRow = db().prepare('SELECT studio_id FROM studio_codes WHERE code = ?').get(studioCode.toUpperCase()) as { studio_id: number } | undefined
          studioId = studioRow?.studio_id ?? null
        }

        // Register work
        const result = db().prepare(`
          INSERT INTO works (file_path, cover_path, product_number, release_date, rating, comment, studio_id)
          VALUES (?, ?, ?, ?, 0, NULL, ?)
        `).run(firstVideoPath, coverPath, productNumber, releaseDate, studioId)
        const workId = result.lastInsertRowid as number

        // Register work files
        for (let i = 0; i < movedVideoPaths.length; i++) {
          db().prepare('INSERT INTO work_files (work_id, file_path, type, sort_order) VALUES (?, ?, ?, ?)').run(workId, movedVideoPaths[i], 'local', i)
        }

        // Link actor
        if (actorId) {
          db().prepare('INSERT OR IGNORE INTO work_actors (work_id, actor_id, is_rep) VALUES (?, ?, 1)').run(workId, actorId)
        }
      } catch { /* skip */ }
    }
    return moved
  }

  ipcMain.handle('temp:moveToTree', async (_e, srcFolder: string, fileNames: string[], targetActorFolder: string, releaseDate: string) => {
    // Find actor from folder name
    const actorFolderName = path.basename(targetActorFolder)
    const actorMatch = actorFolderName.match(/^(.+)\s+(\d{4}-\d{2}-\d{2})$/)
    let actorId: number | null = null
    if (actorMatch) {
      const actorName = actorMatch[1].trim()
      const actorBirthday = actorMatch[2]
      const actors = db().prepare('SELECT id, name, aliases, birthday FROM actors WHERE is_deleted = 0').all() as { id: number; name: string; aliases: string | null; birthday: string | null }[]
      const actor = actors.find(a => {
        if (a.birthday !== actorBirthday) return false
        if (a.name === actorName) return true
        if (a.aliases) return a.aliases.split(',').map(s => s.trim()).includes(actorName)
        return false
      })
      actorId = actor?.id ?? null
    }

    const moved = await moveFilesToActorFolder(srcFolder, fileNames, targetActorFolder, releaseDate, actorId)
    return { ok: true, moved }
  })

  ipcMain.handle('temp:removeString', async (_e, folderPath: string, str: string) => {
    if (!str) return { ok: false, error: '제거할 문자열이 없습니다' }
    try {
      const entries = await fs.promises.readdir(folderPath)
      let count = 0
      for (const entry of entries) {
        if (!entry.includes(str)) continue
        const newName = entry.replaceAll(str, '')
        if (!newName || newName === entry) continue
        await fs.promises.rename(path.join(folderPath, entry), path.join(folderPath, newName))
        count++
      }
      return { ok: true, count }
    } catch (err: unknown) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('temp:moveWithNewActor', async (_e, srcFolder: string, fileNames: string[], parentFolder: string, actorName: string, actorBirthday: string, releaseDate: string) => {
    const existingActor = db().prepare('SELECT id FROM actors WHERE name = ? AND birthday = ? AND is_deleted = 0').get(actorName, actorBirthday) as { id: number } | undefined
    let actorId: number
    if (existingActor) {
      actorId = existingActor.id
    } else {
      const actorResult = db().prepare('INSERT INTO actors (name, birthday) VALUES (?, ?)').run(actorName, actorBirthday)
      actorId = actorResult.lastInsertRowid as number
      db().prepare('INSERT OR REPLACE INTO actor_scores (actor_id, face, bust, hip, physical, skin, acting, sexy, charm, technique, proportions) VALUES (?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)').run(actorId)
    }

    // Find existing actor folder under parentFolder or any known path
    const actorFolderName = `${actorName} ${actorBirthday}`
    let actorFolderPath = path.join(parentFolder, actorFolderName)
    if (existingActor) {
      // Check if actor folder already exists somewhere in DB
      const existingFile = db().prepare(`
        SELECT wf.file_path FROM work_files wf
        JOIN work_actors wa ON wa.work_id = wf.work_id
        WHERE wa.actor_id = ? AND wf.type = 'local'
        LIMIT 1
      `).get(existingActor.id) as { file_path: string } | undefined
      if (existingFile) {
        // Extract actor folder: go up 2 levels (file -> work folder -> actor folder)
        const workFolder = path.dirname(existingFile.file_path)
        const candidateActorFolder = path.dirname(workFolder)
        if (fs.existsSync(candidateActorFolder)) {
          actorFolderPath = candidateActorFolder
        }
      }
    }
    await fs.promises.mkdir(actorFolderPath, { recursive: true })

    const moved = await moveFilesToActorFolder(srcFolder, fileNames, actorFolderPath, releaseDate, actorId)
    return { ok: true, moved, actorId }
  })
}
