import { ipcMain } from 'electron'
import { getDatabase } from './db'

export function registerStudiosHandlers(): void {
  const db = () => getDatabase()

  ipcMain.handle('studios:list', (_e, withCount?: boolean) => {
    if (withCount) {
      return db().prepare(`
        SELECT s.*, COUNT(w.id) AS work_count, m.id AS maker_id, m.name AS maker_name, m.color AS maker_color, m.created_at AS maker_created_at
        FROM studios s
        LEFT JOIN works w ON w.studio_id = s.id
        LEFT JOIN makers m ON m.id = s.maker_id
        GROUP BY s.id
        ORDER BY s.name
      `).all()
    }
    return db().prepare(`
      SELECT s.*, m.id AS maker_id, m.name AS maker_name, m.color AS maker_color, m.created_at AS maker_created_at
      FROM studios s
      LEFT JOIN makers m ON m.id = s.maker_id
      ORDER BY s.name
    `).all()
  })

  ipcMain.handle('studios:create', (_e, name: string, makerId?: number | null, color?: string | null) => {
    try {
      const result = db().prepare('INSERT INTO studios (name, maker_id, color, created_at) VALUES (?, ?, ?, datetime(\'now\'))').run(name.trim(), makerId ?? null, color ?? null)
      return result.lastInsertRowid
    } catch {
      // 미분류 중복 시 기존 ID 반환
      const existing = db().prepare('SELECT id FROM studios WHERE name = ? AND maker_id IS NULL').get(name.trim()) as { id: number } | undefined
      return existing?.id ?? 0
    }
  })

  ipcMain.handle('studios:update', (_e, id: number, name: string, color?: string | null) => {
    try {
      if (color !== undefined) {
        db().prepare('UPDATE studios SET name = ?, color = ? WHERE id = ?').run(name.trim(), color, id)
      } else {
        db().prepare('UPDATE studios SET name = ? WHERE id = ?').run(name.trim(), id)
      }
      return { ok: true }
    } catch {
      return { ok: false, error: 'duplicate' }
    }
  })

  ipcMain.handle('studios:delete', (_e, id: number) => {
    db().prepare('UPDATE works SET studio_id = NULL WHERE studio_id = ?').run(id)
    db().prepare('DELETE FROM studios WHERE id = ?').run(id)
    return true
  })

  // ========== 제작사 CRUD ==========

  ipcMain.handle('makers:list', (_e, withCount?: boolean) => {
    if (withCount) {
      return db().prepare(`
        SELECT m.*, COUNT(s.id) AS studio_count
        FROM makers m LEFT JOIN studios s ON s.maker_id = m.id
        GROUP BY m.id ORDER BY m.name
      `).all()
    }
    return db().prepare('SELECT * FROM makers ORDER BY name').all()
  })

  ipcMain.handle('makers:create', (_e, name: string, color?: string | null) => {
    const result = db().prepare('INSERT OR IGNORE INTO makers (name, color) VALUES (?, ?)').run(name.trim(), color ?? null)
    if (result.changes > 0) return result.lastInsertRowid
    const existing = db().prepare('SELECT id FROM makers WHERE name = ?').get(name.trim()) as { id: number } | undefined
    return existing?.id ?? 0
  })

  ipcMain.handle('makers:update', (_e, id: number, name: string, color?: string | null) => {
    if (color !== undefined) {
      db().prepare('UPDATE makers SET name = ?, color = ? WHERE id = ?').run(name.trim(), color, id)
    } else {
      db().prepare('UPDATE makers SET name = ? WHERE id = ?').run(name.trim(), id)
    }
    return true
  })

  ipcMain.handle('makers:delete', (_e, id: number) => {
    db().prepare('UPDATE studios SET maker_id = NULL WHERE maker_id = ?').run(id)
    db().prepare('DELETE FROM makers WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('makers:assignStudio', (_e, studioId: number, makerId: number | null) => {
    db().prepare('UPDATE studios SET maker_id = ? WHERE id = ?').run(makerId, studioId)
    return true
  })

  // ========== 레이블 코드 CRUD ==========

  ipcMain.handle('studio-codes:list', (_e, studioId: number) => {
    return db().prepare('SELECT * FROM studio_codes WHERE studio_id = ? ORDER BY code').all(studioId)
  })

  ipcMain.handle('studio-codes:create', (_e, studioId: number, code: string) => {
    const result = db().prepare('INSERT OR IGNORE INTO studio_codes (studio_id, code) VALUES (?, ?)').run(studioId, code.trim().toUpperCase())
    return result.lastInsertRowid
  })

  ipcMain.handle('studio-codes:update', (_e, id: number, code: string) => {
    db().prepare('UPDATE studio_codes SET code = ? WHERE id = ?').run(code.trim().toUpperCase(), id)
    return true
  })

  ipcMain.handle('studio-codes:delete', (_e, id: number) => {
    db().prepare('DELETE FROM studio_codes WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('studio-codes:lookup', (_e, code: string) => {
    const row = db().prepare('SELECT studio_id FROM studio_codes WHERE code = ?').get(code.trim().toUpperCase()) as { studio_id: number } | undefined
    return row?.studio_id ?? null
  })

  ipcMain.handle('studio-codes:applyToWorks', (_e, studioId: number, code: string) => {
    const upper = code.trim().toUpperCase()
    const works = db().prepare('SELECT id, product_number FROM works WHERE studio_id IS NULL AND product_number IS NOT NULL').all() as { id: number; product_number: string }[]
    const matched = works.filter(w => { const m = w.product_number.match(/^(.+)-\d/); return m && m[1].toUpperCase() === upper })
    if (matched.length === 0) return 0
    const updateStmt = db().prepare('UPDATE works SET studio_id = ? WHERE id = ?')
    db().transaction(() => { for (const w of matched) updateStmt.run(studioId, w.id) })()
    return matched.length
  })

}
