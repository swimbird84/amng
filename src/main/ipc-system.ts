import { ipcMain, dialog, app, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { getDatabase } from './db'

// ========== 커버 경로 마이그레이션 (roaming → 원본, 1회성) ==========

export function migrateCoverPaths(): void {
  const worksImgDir = path.join(app.getPath('userData'), 'images', 'works')
  if (!fs.existsSync(worksImgDir)) return

  const db = getDatabase()
  const roamingPrefix = worksImgDir.replace(/\\/g, '/')
  const rows = db.prepare(
    `SELECT w.id, w.product_number, w.cover_path
     FROM works w
     WHERE w.cover_path IS NOT NULL
       AND REPLACE(w.cover_path, '\\', '/') LIKE ?`
  ).all(roamingPrefix + '%') as { id: number; product_number: string | null; cover_path: string }[]

  if (rows.length === 0) return

  const imageExts = ['.jpg', '.jpeg', '.png', '.webp']
  let migrated = 0
  const updateStmt = db.prepare('UPDATE works SET cover_path = ? WHERE id = ?')

  for (const row of rows) {
    if (!row.product_number) continue

    const files = db.prepare(
      "SELECT file_path FROM work_files WHERE work_id = ? AND type = 'local' LIMIT 1"
    ).all(row.id) as { file_path: string }[]

    const fileDir = files.length > 0 ? path.dirname(files[0].file_path.replace(/\\/g, '/')) : null
    let found: string | null = null

    // 패턴 1: 작품 폴더 내 품번.{ext}
    if (fileDir) {
      for (const ext of imageExts) {
        const candidate = path.join(fileDir, `${row.product_number}${ext}`)
        if (fs.existsSync(candidate)) { found = candidate; break }
      }
    }

    // 패턴 2: 배우 폴더/cover images/날짜 품번.{ext}
    if (!found && fileDir) {
      const actorDir = path.dirname(fileDir)
      const coverImagesDir = path.join(actorDir, 'cover images')
      if (fs.existsSync(coverImagesDir)) {
        for (const file of fs.readdirSync(coverImagesDir)) {
          const nameNoExt = path.parse(file).name
          if (nameNoExt.endsWith(row.product_number) && imageExts.includes(path.extname(file).toLowerCase())) {
            found = path.join(coverImagesDir, file); break
          }
        }
      }
    }

    if (found) {
      updateStmt.run(found, row.id)
      migrated++
    }
  }

  // roaming works 이미지 폴더 정리
  for (const file of fs.readdirSync(worksImgDir)) {
    fs.rmSync(path.join(worksImgDir, file), { force: true })
  }
  try { fs.rmdirSync(worksImgDir) } catch { /* 비어있지 않으면 무시 */ }

  console.log(`[migrate-covers] ${migrated}/${rows.length} migrated`)
}

// ========== 이미지 삭제 헬퍼 (외부에서도 사용) ==========

/** 특정 ID 패턴의 이미지 파일을 삭제한다 */
export function deleteImagesByPattern(type: 'works' | 'actors' | 'actor-photos', id: number): number {
  const imagesDir = path.join(app.getPath('userData'), 'images', type)
  if (!fs.existsSync(imagesDir)) return 0
  let deleted = 0
  for (const file of fs.readdirSync(imagesDir)) {
    const match = type === 'actor-photos'
      ? file.startsWith(`${id}_`)
      : file.match(/^(\d+)\./) && file.match(/^(\d+)\./)?.[1] === String(id)
    if (match) {
      fs.rmSync(path.join(imagesDir, file), { force: true })
      deleted++
    }
  }
  return deleted
}

/** 특정 파일 경로의 이미지를 삭제한다 */
export function deleteImageFile(filePath: string | null | undefined): boolean {
  if (!filePath || !fs.existsSync(filePath)) return false
  fs.rmSync(filePath, { force: true })
  return true
}

/** DB와 대조하여 고아 이미지를 일괄 삭제한다 */
export function cleanupOrphanImages(): { works: number; actors: number; actorPhotos: number } {
  const db = getDatabase()
  const result = { works: 0, actors: 0, actorPhotos: 0 }

  // works
  const worksDir = path.join(app.getPath('userData'), 'images', 'works')
  if (fs.existsSync(worksDir)) {
    const workIds = new Set(
      (db.prepare('SELECT id FROM works').all() as { id: number }[]).map(r => r.id)
    )
    for (const file of fs.readdirSync(worksDir)) {
      const m = file.match(/^(\d+)\./)
      if (m && !workIds.has(Number(m[1]))) {
        fs.rmSync(path.join(worksDir, file), { force: true })
        result.works++
      }
    }
  }

  // actors
  const actorsDir = path.join(app.getPath('userData'), 'images', 'actors')
  if (fs.existsSync(actorsDir)) {
    const actorIds = new Set(
      (db.prepare('SELECT id FROM actors WHERE is_deleted = 0').all() as { id: number }[]).map(r => r.id)
    )
    for (const file of fs.readdirSync(actorsDir)) {
      const m = file.match(/^(\d+)\./)
      if (m && !actorIds.has(Number(m[1]))) {
        fs.rmSync(path.join(actorsDir, file), { force: true })
        result.actors++
      }
    }
  }

  // actor-photos
  const photosDir = path.join(app.getPath('userData'), 'images', 'actor-photos')
  if (fs.existsSync(photosDir)) {
    const photoPaths = new Set(
      (db.prepare('SELECT photo_path FROM actor_photos').all() as { photo_path: string }[]).map(r => r.photo_path)
    )
    for (const file of fs.readdirSync(photosDir)) {
      const fullPath = path.join(photosDir, file)
      if (!photoPaths.has(fullPath)) {
        fs.rmSync(fullPath, { force: true })
        result.actorPhotos++
      }
    }
  }

  return result
}

export function registerSystemHandlers(): void {
  const db = () => getDatabase()

  // ========== 파일/이미지 다이얼로그 ==========

  ipcMain.handle('dialog:open-files', async (_e, options?: { filters?: Electron.FileFilter[] }) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: options?.filters || [
        { name: 'Video Files', extensions: ['mp4', 'mkv', 'avi', 'wmv', 'mov', 'flv', 'm2ts'] }
      ]
    })
    return result.filePaths
  })

  ipcMain.handle('dialog:open-image', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Image Files', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }
      ]
    })
    return result.filePaths[0] || null
  })

  ipcMain.handle('dialog:open-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    return result.filePaths[0] || null
  })

  // ========== 폴더 스캔 ==========

  ipcMain.handle('scan:folder', async (e, folderPath: string) => {
    const videoExtensions = ['.mp4', '.mkv', '.avi', '.wmv', '.mov', '.flv', '.m2ts']
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp']
    const files: string[] = []
    const coverImageFiles: { imagePath: string; parentDir: string; releaseDate: string | null; productNumber: string }[] = []

    async function scanDir(dir: string) {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (entry.name === 'cover images') {
            // Scan cover images folder
            const imgEntries = await fs.promises.readdir(fullPath, { withFileTypes: true })
            for (const imgEntry of imgEntries) {
              if (!imgEntry.isFile()) continue
              const ext = path.extname(imgEntry.name).toLowerCase()
              if (!imageExtensions.includes(ext)) continue
              const baseName = path.basename(imgEntry.name, ext)
              const dateMatch = baseName.match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/)
              if (dateMatch) {
                coverImageFiles.push({
                  imagePath: path.join(fullPath, imgEntry.name),
                  parentDir: dir,
                  releaseDate: dateMatch[1],
                  productNumber: dateMatch[2],
                })
              }
            }
          } else {
            await scanDir(fullPath)
          }
        } else if (videoExtensions.includes(path.extname(entry.name).toLowerCase())) {
          files.push(fullPath)
          e.sender.send('scan:progress', files.length)
        }
      }
    }

    await scanDir(folderPath)

    const existingPaths = new Set(
      (db().prepare('SELECT file_path FROM work_files').all() as { file_path: string }[]).map(r => r.file_path)
    )
    const newFiles = files.filter(f => !existingPaths.has(f)).map(videoPath => {
      const basePath = videoPath.replace(/\.[^.]+$/, '')
      const imagePath = imageExtensions.map(ext => basePath + ext).find(p => fs.existsSync(p)) ?? null
      return { videoPath, imagePath }
    })
    const duplicates = files.filter(f => existingPaths.has(f))

    // Check cover images against existing works
    const existingPNs = new Map<string, { id: number; cover_path: string | null }>(
      (db().prepare('SELECT id, product_number, cover_path FROM works WHERE product_number IS NOT NULL').all() as { id: number; product_number: string; cover_path: string | null }[])
        .map(r => [r.product_number.toUpperCase(), { id: r.id, cover_path: r.cover_path }])
    )
    const coverNew: typeof coverImageFiles = []
    const coverRestore: (typeof coverImageFiles[0] & { workId: number })[] = []
    const coverConflict: (typeof coverImageFiles[0] & { workId: number; existingCoverPath: string })[] = []
    for (const ci of coverImageFiles) {
      const existing = existingPNs.get(ci.productNumber.toUpperCase())
      if (!existing) {
        coverNew.push(ci)
      } else if (!existing.cover_path || !fs.existsSync(existing.cover_path)) {
        coverRestore.push({ ...ci, workId: existing.id })
      } else {
        coverConflict.push({ ...ci, workId: existing.id, existingCoverPath: existing.cover_path })
      }
    }

    return { newFiles, duplicates, coverNew, coverRestore, coverConflict }
  })

  // ========== 파일 실행 (기본 프로그램) ==========

  ipcMain.handle('shell:openPath', (_e, filePath: string) => {
    if (!fs.existsSync(filePath)) return 'FILE_NOT_FOUND'
    return shell.openPath(filePath)
  })

  ipcMain.handle('shell:showItemInFolder', (_e, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    shell.openExternal(url)
    return true
  })

  ipcMain.handle('shell:fileExists', (_e, filePath: string) => {
    return fs.promises.access(filePath).then(() => true).catch(() => false)
  })

  ipcMain.handle('shell:trashFolders', async (_e, filePaths: string[]) => {
    const folders = [...new Set(filePaths.filter(Boolean).map((p) => path.dirname(p)))]
    let deleted = 0
    for (const folder of folders) {
      if (fs.existsSync(folder)) {
        await shell.trashItem(folder)
        deleted++
      }
    }
    return deleted
  })

  ipcMain.handle('shell:deleteFiles', async (_e, paths: string[]) => {
    let deleted = 0
    for (const p of paths) {
      if (p && fs.existsSync(p)) {
        await shell.trashItem(p)
        deleted++
      }
    }
    return deleted
  })

  // ========== 이미지 복사 ==========

  ipcMain.handle('image:copy', (_e, sourcePath: string, type: 'works' | 'actors' | 'actor-photos', id: number) => {
    const ext = path.extname(sourcePath)
    const imagesDir = path.join(app.getPath('userData'), 'images', type)
    fs.mkdirSync(imagesDir, { recursive: true })
    // 기존 파일 삭제 (확장자 변경 시 고아 방지)
    if (type !== 'actor-photos') {
      deleteImagesByPattern(type, id)
    }
    const fileName = type === 'actor-photos' ? `${id}_${Date.now()}` : `${id}`
    const destPath = path.join(imagesDir, `${fileName}${ext}`)
    fs.copyFileSync(sourcePath, destPath)
    return destPath
  })

  // ========== 이미지 읽기 (file:// 프로토콜 대신) ==========

  ipcMain.handle('image:read', (_e, filePath: string) => {
    if (!filePath || !fs.existsSync(filePath)) return null
    const data = fs.readFileSync(filePath)
    const ext = path.extname(filePath).slice(1).toLowerCase()
    const mime = ext === 'jpg' ? 'jpeg' : ext
    return `data:image/${mime};base64,${data.toString('base64')}`
  })

  // ========== 검색 URL ==========

  ipcMain.handle('search-url:list', () => {
    return db().prepare('SELECT * FROM search_urls ORDER BY created_at DESC').all()
  })

  ipcMain.handle('search-url:add', (_e, url: string) => {
    try {
      db().prepare('INSERT OR IGNORE INTO search_urls (url) VALUES (?)').run(url.trim())
      return { ok: true }
    } catch { return { ok: false } }
  })

  ipcMain.handle('search-url:delete', (_e, id: number) => {
    db().prepare('DELETE FROM search_urls WHERE id = ?').run(id)
    return { ok: true }
  })

  ipcMain.handle('search-url:setActive', (_e, id: number) => {
    db().prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('active_search_url_id', ?)").run(String(id))
    return { ok: true }
  })

  ipcMain.handle('search-url:getActive', () => {
    const setting = db().prepare("SELECT value FROM app_settings WHERE key = 'active_search_url_id'").get() as { value: string } | undefined
    if (!setting) return null
    const row = db().prepare('SELECT id, url FROM search_urls WHERE id = ?').get(Number(setting.value)) as { id: number; url: string } | undefined
    return row?.url ?? null
  })
}
