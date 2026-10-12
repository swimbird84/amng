import { ipcMain } from 'electron'
import { getDatabase } from './db'

const DEFAULT_TIERS = [
  { name: 'S', color: '#ff4444' },
  { name: 'A', color: '#ff8c00' },
  { name: 'B', color: '#ffd700' },
  { name: 'C', color: '#44bb44' },
  { name: 'D', color: '#4488ff' },
  { name: 'F', color: '#888888' },
]

function createDefaultLevels(database: ReturnType<typeof getDatabase>, setId: number) {
  const insert = database.prepare('INSERT INTO tier_levels (set_id, name, color, sort_order) VALUES (?, ?, ?, ?)')
  DEFAULT_TIERS.forEach((t, i) => insert.run(setId, t.name, t.color, i))
}

export function registerTierHandlers(): void {
  const db = () => getDatabase()

  ipcMain.handle('tier:listSets', (_e, params?: { type?: 'actor' | 'work'; isMaster?: boolean; sortBy?: string; sortDir?: string }) => {
    const conditions: string[] = []
    const bindings: unknown[] = []
    if (params?.type) { conditions.push('ts.type = ?'); bindings.push(params.type) }
    if (params?.isMaster !== undefined) { conditions.push('ts.is_master = ?'); bindings.push(params.isMaster ? 1 : 0) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const sortBy = params?.sortBy === 'name' ? 'ts.name' : 'ts.created_at'
    const sortDir = params?.sortDir === 'asc' ? 'ASC' : 'DESC'

    const sets = db().prepare(`
      SELECT ts.*,
        (SELECT COUNT(*) FROM tier_items ti WHERE ti.set_id = ts.id) AS item_count,
        (SELECT COUNT(*) FROM tier_levels tl WHERE tl.set_id = ts.id) AS level_count
      FROM tier_sets ts
      ${where}
      ORDER BY ts.is_master DESC, ${sortBy} ${sortDir}
    `).all(...bindings) as any[]

    // Get thumbnail: top tier's first item
    for (const s of sets) {
      const topLevel = db().prepare('SELECT id FROM tier_levels WHERE set_id = ? ORDER BY sort_order ASC LIMIT 1').get(s.id) as { id: number } | undefined
      if (topLevel) {
        const firstItem = db().prepare('SELECT item_id FROM tier_items WHERE set_id = ? AND level_id = ? ORDER BY sort_order ASC LIMIT 1').get(s.id, topLevel.id) as { item_id: number } | undefined
        if (firstItem) {
          if (s.type === 'actor') {
            const actor = db().prepare('SELECT photo_path FROM actors WHERE id = ?').get(firstItem.item_id) as { photo_path: string | null } | undefined
            s.thumb_path = actor?.photo_path ?? null
          } else {
            const work = db().prepare('SELECT cover_path FROM works WHERE id = ?').get(firstItem.item_id) as { cover_path: string | null } | undefined
            s.thumb_path = work?.cover_path ?? null
          }
        }
      }
      if (!s.thumb_path) s.thumb_path = null

      // Total eligible items count
      if (s.type === 'actor') {
        s.total_items = (db().prepare('SELECT COUNT(*) AS cnt FROM actors WHERE is_deleted = 0 AND is_excluded = 0').get() as { cnt: number }).cnt
      } else {
        s.total_items = (db().prepare('SELECT COUNT(*) AS cnt FROM works').get() as { cnt: number }).cnt
      }
    }

    return sets
  })

  ipcMain.handle('tier:createSet', (_e, data: { name: string; type: 'actor' | 'work'; isMaster?: boolean; filter?: string }) => {
    if (data.isMaster) {
      // Unset existing master
      db().prepare('UPDATE tier_sets SET is_master = 0 WHERE type = ? AND is_master = 1').run(data.type)
    }
    const result = db().prepare('INSERT INTO tier_sets (name, type, is_master) VALUES (?, ?, ?)').run(data.name, data.type, data.isMaster ? 1 : 0)
    const setId = result.lastInsertRowid as number
    createDefaultLevels(db(), setId)
    return setId
  })

  ipcMain.handle('tier:updateSet', (_e, id: number, data: { name?: string }) => {
    if (data.name !== undefined) {
      db().prepare('UPDATE tier_sets SET name = ? WHERE id = ?').run(data.name, id)
    }
    return true
  })

  ipcMain.handle('tier:deleteSet', (_e, id: number) => {
    const set = db().prepare('SELECT is_master FROM tier_sets WHERE id = ?').get(id) as { is_master: number } | undefined
    if (set?.is_master) return { ok: false, error: '마스터 티어는 삭제할 수 없습니다' }
    db().prepare('DELETE FROM tier_sets WHERE id = ?').run(id)
    return { ok: true }
  })

  ipcMain.handle('tier:setMaster', (_e, id: number) => {
    const set = db().prepare('SELECT type FROM tier_sets WHERE id = ?').get(id) as { type: string } | undefined
    if (!set) return false
    db().prepare('UPDATE tier_sets SET is_master = 0 WHERE type = ? AND is_master = 1').run(set.type)
    db().prepare('UPDATE tier_sets SET is_master = 1 WHERE id = ?').run(id)
    return true
  })

  // ========== 티어 (레벨) ==========

  ipcMain.handle('tier:listLevels', (_e, setId: number) => {
    return db().prepare('SELECT * FROM tier_levels WHERE set_id = ? ORDER BY sort_order ASC').all(setId)
  })

  ipcMain.handle('tier:createLevel', (_e, setId: number, data: { name: string; color: string }) => {
    const maxOrder = db().prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM tier_levels WHERE set_id = ?').get(setId) as { m: number }
    const result = db().prepare('INSERT INTO tier_levels (set_id, name, color, sort_order) VALUES (?, ?, ?, ?)').run(setId, data.name, data.color, maxOrder.m + 1)
    return result.lastInsertRowid
  })

  ipcMain.handle('tier:updateLevel', (_e, levelId: number, data: { name?: string; color?: string; sort_order?: number }) => {
    const fields: string[] = []
    const values: unknown[] = []
    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
    if (data.color !== undefined) { fields.push('color = ?'); values.push(data.color) }
    if (data.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(data.sort_order) }
    if (fields.length > 0) {
      values.push(levelId)
      db().prepare(`UPDATE tier_levels SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }
    return true
  })

  ipcMain.handle('tier:deleteLevel', (_e, levelId: number) => {
    db().prepare('DELETE FROM tier_items WHERE level_id = ?').run(levelId)
    db().prepare('DELETE FROM tier_levels WHERE id = ?').run(levelId)
    return true
  })

  ipcMain.handle('tier:moveLevel', (_e, setId: number, levelId: number, direction: 'up' | 'down') => {
    const levels = db().prepare('SELECT id, sort_order FROM tier_levels WHERE set_id = ? ORDER BY sort_order ASC').all(setId) as { id: number; sort_order: number }[]
    const idx = levels.findIndex(l => l.id === levelId)
    if (idx < 0) return false
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= levels.length) return false
    const a = levels[idx], b = levels[swapIdx]
    db().prepare('UPDATE tier_levels SET sort_order = ? WHERE id = ?').run(b.sort_order, a.id)
    db().prepare('UPDATE tier_levels SET sort_order = ? WHERE id = ?').run(a.sort_order, b.id)
    return true
  })

  // ========== 아이템 배치 ==========

  ipcMain.handle('tier:listItems', (_e, setId: number) => {
    const set = db().prepare('SELECT type FROM tier_sets WHERE id = ?').get(setId) as { type: string } | undefined
    if (!set) return []
    if (set.type === 'actor') {
      return db().prepare(`
        SELECT ti.*, a.name, a.photo_path
        FROM tier_items ti
        JOIN actors a ON a.id = ti.item_id AND a.is_deleted = 0 AND is_excluded = 0
        WHERE ti.set_id = ?
        ORDER BY ti.level_id, ti.sort_order
      `).all(setId)
    } else {
      return db().prepare(`
        SELECT ti.*, COALESCE(w.product_number, w.title) AS name, w.cover_path AS photo_path
        FROM tier_items ti
        JOIN works w ON w.id = ti.item_id
        WHERE ti.set_id = ?
        ORDER BY ti.level_id, ti.sort_order
      `).all(setId)
    }
  })

  ipcMain.handle('tier:setItem', (_e, setId: number, levelId: number, itemId: number, sortOrder: number) => {
    // Remove existing placement if any
    db().prepare('DELETE FROM tier_items WHERE set_id = ? AND item_id = ?').run(setId, itemId)
    // Shift existing items at and after sortOrder
    db().prepare('UPDATE tier_items SET sort_order = sort_order + 1 WHERE set_id = ? AND level_id = ? AND sort_order >= ?').run(setId, levelId, sortOrder)
    // Insert
    db().prepare('INSERT INTO tier_items (set_id, level_id, item_id, sort_order) VALUES (?, ?, ?, ?)').run(setId, levelId, itemId, sortOrder)
    return true
  })

  ipcMain.handle('tier:removeItem', (_e, setId: number, itemId: number) => {
    db().prepare('DELETE FROM tier_items WHERE set_id = ? AND item_id = ?').run(setId, itemId)
    return true
  })

  ipcMain.handle('tier:getMasterTier', (_e, type: 'actor' | 'work', itemId: number) => {
    const set = db().prepare('SELECT id FROM tier_sets WHERE type = ? AND is_master = 1').get(type) as { id: number } | undefined
    if (!set) return null
    const item = db().prepare(`
      SELECT tl.name AS tier_name, tl.color AS tier_color
      FROM tier_items ti
      JOIN tier_levels tl ON tl.id = ti.level_id
      WHERE ti.set_id = ? AND ti.item_id = ?
    `).get(set.id, itemId) as { tier_name: string; tier_color: string } | undefined
    return item ?? null
  })

  ipcMain.handle('tier:getUnplacedItems', (_e, setId: number, offset: number, limit: number, sortBy?: string) => {
    const set = db().prepare('SELECT type FROM tier_sets WHERE id = ?').get(setId) as { type: string } | undefined
    if (!set) return { items: [], total: 0 }
    const notIn = `id NOT IN (SELECT item_id FROM tier_items WHERE set_id = ?)`
    if (set.type === 'actor') {
      const total = (db().prepare(`SELECT COUNT(*) AS cnt FROM actors WHERE is_deleted = 0 AND is_excluded = 0 AND ${notIn}`).get(setId) as { cnt: number }).cnt
      let orderBy = 'a.name'
      switch (sortBy) {
        case 'avg_score': orderBy = 'COALESCE((SELECT (s.face+s.bust+s.hip+s.physical+s.skin+s.acting+s.sexy+s.charm+s.technique+s.proportions)/13.0 FROM actor_scores s WHERE s.actor_id = a.id), 0) DESC'; break
        case 'work_count': orderBy = '(SELECT COUNT(*) FROM work_actors wa WHERE wa.actor_id = a.id) DESC'; break
        case 'birthday': orderBy = 'a.birthday DESC'; break
        case 'created_at': orderBy = 'a.created_at DESC'; break
        case 'debut_date': orderBy = 'a.debut_date DESC'; break
        case 'random': orderBy = 'RANDOM()'; break
      }
      const items = db().prepare(`
        SELECT a.id, a.name, a.photo_path
        FROM actors a
        WHERE a.is_deleted = 0 AND is_excluded = 0 AND a.${notIn}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `).all(setId, limit, offset)
      return { items, total }
    } else {
      const total = (db().prepare(`SELECT COUNT(*) AS cnt FROM works WHERE ${notIn}`).get(setId) as { cnt: number }).cnt
      let orderBy = 'w.product_number, w.title'
      switch (sortBy) {
        case 'release_date': orderBy = 'w.release_date DESC'; break
        case 'studio': orderBy = '(SELECT s.name FROM studios s WHERE s.id = w.studio_id) ASC, w.product_number'; break
        case 'created_at': orderBy = 'w.created_at DESC'; break
        case 'random': orderBy = 'RANDOM()'; break
      }
      const items = db().prepare(`
        SELECT w.id, COALESCE(w.product_number, w.title) AS name, w.cover_path AS photo_path
        FROM works w
        WHERE w.${notIn}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `).all(setId, limit, offset)
      return { items, total }
    }
  })

  ipcMain.handle('tier:getTopTierItems', (_e, type: 'actor' | 'work') => {
    const set = db().prepare('SELECT id FROM tier_sets WHERE type = ? AND is_master = 1').get(type) as { id: number } | undefined
    if (!set) return { tierName: null, items: [] }
    const topLevel = db().prepare('SELECT id, name, color FROM tier_levels WHERE set_id = ? ORDER BY sort_order ASC LIMIT 1').get(set.id) as { id: number; name: string; color: string } | undefined
    if (!topLevel) return { tierName: null, items: [] }
    if (type === 'actor') {
      const items = db().prepare(`
        SELECT ti.item_id AS id, a.name, a.photo_path, ti.sort_order
        FROM tier_items ti
        JOIN actors a ON a.id = ti.item_id AND a.is_deleted = 0 AND is_excluded = 0
        WHERE ti.set_id = ? AND ti.level_id = ?
        ORDER BY ti.sort_order ASC
      `).all(set.id, topLevel.id)
      return { tierName: topLevel.name, tierColor: topLevel.color, items }
    } else {
      const items = db().prepare(`
        SELECT ti.item_id AS id, COALESCE(w.product_number, w.title) AS name, w.cover_path AS photo_path, ti.sort_order
        FROM tier_items ti
        JOIN works w ON w.id = ti.item_id
        WHERE ti.set_id = ? AND ti.level_id = ?
        ORDER BY ti.sort_order ASC
      `).all(set.id, topLevel.id)
      return { tierName: topLevel.name, tierColor: topLevel.color, items }
    }
  })
}
