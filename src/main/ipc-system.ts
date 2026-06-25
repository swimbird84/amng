import { ipcMain, dialog, app, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { getDatabase } from './db'

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
      (db.prepare('SELECT id FROM actors').all() as { id: number }[]).map(r => r.id)
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

    async function scanDir(dir: string) {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          await scanDir(fullPath)
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
    return { newFiles, duplicates }
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
}
