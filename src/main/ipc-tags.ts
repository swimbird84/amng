import { ipcMain } from 'electron'
import { getDatabase } from './db'

export function registerTagsHandlers(): void {
  const db = () => getDatabase()

  // ========== 태그 CRUD ==========

  // ========== 작품 태그 카테고리 ==========

  ipcMain.handle('work-tag-categories:list', () => {
    return db().prepare(`
      SELECT c.*, COUNT(t.id) AS tag_count
      FROM work_tag_categories c
      LEFT JOIN work_tags_master t ON t.category_id = c.id
      GROUP BY c.id ORDER BY c.sort_order ASC, c.id ASC
    `).all()
  })

  ipcMain.handle('work-tag-categories:create', (_e, name: string) => {
    const maxOrder = (db().prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM work_tag_categories').get() as { m: number }).m
    const result = db().prepare('INSERT INTO work_tag_categories (name, sort_order) VALUES (?, ?)').run(name, maxOrder + 1)
    return result.lastInsertRowid
  })

  ipcMain.handle('work-tag-categories:update', (_e, id: number, name: string) => {
    db().prepare('UPDATE work_tag_categories SET name = ? WHERE id = ?').run(name, id)
    return true
  })

  ipcMain.handle('work-tag-categories:delete', (_e, id: number) => {
    db().prepare('UPDATE work_tags_master SET category_id = NULL WHERE category_id = ?').run(id)
    db().prepare('DELETE FROM work_tag_categories WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('work-tag-categories:reorder', (_e, ids: number[]) => {
    const stmt = db().prepare('UPDATE work_tag_categories SET sort_order = ? WHERE id = ?')
    const update = db().transaction((list: number[]) => list.forEach((id, i) => stmt.run(i, id)))
    update(ids)
    return true
  })

  ipcMain.handle('work-tag-categories:setTagCategory', (_e, tagId: number, categoryId: number | null) => {
    db().prepare('UPDATE work_tags_master SET category_id = ? WHERE id = ?').run(categoryId, tagId)
    return true
  })

  // ========== 배우 태그 카테고리 ==========

  ipcMain.handle('actor-tag-categories:list', () => {
    return db().prepare(`
      SELECT c.*, COUNT(t.id) AS tag_count
      FROM actor_tag_categories c
      LEFT JOIN actor_tags_master t ON t.category_id = c.id
      GROUP BY c.id ORDER BY c.sort_order ASC, c.id ASC
    `).all()
  })

  ipcMain.handle('actor-tag-categories:create', (_e, name: string) => {
    const maxOrder = (db().prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM actor_tag_categories').get() as { m: number }).m
    const result = db().prepare('INSERT INTO actor_tag_categories (name, sort_order) VALUES (?, ?)').run(name, maxOrder + 1)
    return result.lastInsertRowid
  })

  ipcMain.handle('actor-tag-categories:update', (_e, id: number, name: string) => {
    db().prepare('UPDATE actor_tag_categories SET name = ? WHERE id = ?').run(name, id)
    return true
  })

  ipcMain.handle('actor-tag-categories:delete', (_e, id: number) => {
    db().prepare('UPDATE actor_tags_master SET category_id = NULL WHERE category_id = ?').run(id)
    db().prepare('DELETE FROM actor_tag_categories WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('actor-tag-categories:reorder', (_e, ids: number[]) => {
    const stmt = db().prepare('UPDATE actor_tag_categories SET sort_order = ? WHERE id = ?')
    const update = db().transaction((list: number[]) => list.forEach((id, i) => stmt.run(i, id)))
    update(ids)
    return true
  })

  ipcMain.handle('actor-tag-categories:setTagCategory', (_e, tagId: number, categoryId: number | null) => {
    db().prepare('UPDATE actor_tags_master SET category_id = ? WHERE id = ?').run(categoryId, tagId)
    return true
  })

  // ========== 태그 ==========

  ipcMain.handle('work-tags:list', (_e, withCount?: boolean) => {
    if (withCount) {
      return db().prepare(`
        SELECT t.*,
          COUNT(wt.work_id) AS total_count,
          SUM(CASE WHEN wt.is_rep = 1 THEN 1 ELSE 0 END) AS rep_count,
          c.name AS category_name, COALESCE(c.sort_order, 999999) AS category_sort_order
        FROM work_tags_master t
        LEFT JOIN work_tags wt ON wt.tag_id = t.id
        LEFT JOIN work_tag_categories c ON c.id = t.category_id
        GROUP BY t.id ORDER BY t.name
      `).all()
    }
    return db().prepare(`
      SELECT t.*, c.name AS category_name, COALESCE(c.sort_order, 999999) AS category_sort_order
      FROM work_tags_master t
      LEFT JOIN work_tag_categories c ON c.id = t.category_id
      ORDER BY t.name
    `).all()
  })

  ipcMain.handle('work-tags:create', (_e, name: string) => {
    const result = db().prepare("INSERT OR IGNORE INTO work_tags_master (name, created_at) VALUES (?, datetime('now'))").run(name)
    if (result.changes > 0) return result.lastInsertRowid
    const existing = db().prepare('SELECT id FROM work_tags_master WHERE name = ?').get(name) as { id: number } | undefined
    return existing?.id ?? 0
  })

  ipcMain.handle('work-tags:update', (_e, id: number, name: string) => {
    db().prepare('UPDATE work_tags_master SET name = ? WHERE id = ?').run(name, id)
    return true
  })

  ipcMain.handle('work-tags:delete', (_e, id: number) => {
    db().prepare('DELETE FROM work_tags_master WHERE id = ?').run(id)
    return true
  })

  ipcMain.handle('actor-tags:list', (_e, withCount?: boolean) => {
    if (withCount) {
      return db().prepare(`
        SELECT t.*,
          COUNT(at2.actor_id) AS total_count,
          SUM(CASE WHEN at2.is_rep = 1 THEN 1 ELSE 0 END) AS rep_count,
          c.name AS category_name, COALESCE(c.sort_order, 999999) AS category_sort_order
        FROM actor_tags_master t
        LEFT JOIN actor_tags at2 ON at2.tag_id = t.id
        LEFT JOIN actor_tag_categories c ON c.id = t.category_id
        GROUP BY t.id ORDER BY t.name
      `).all()
    }
    return db().prepare(`
      SELECT t.*, c.name AS category_name, COALESCE(c.sort_order, 999999) AS category_sort_order
      FROM actor_tags_master t
      LEFT JOIN actor_tag_categories c ON c.id = t.category_id
      ORDER BY t.name
    `).all()
  })

  ipcMain.handle('actor-tags:create', (_e, name: string) => {
    const result = db().prepare("INSERT OR IGNORE INTO actor_tags_master (name, created_at) VALUES (?, datetime('now'))").run(name)
    if (result.changes > 0) return result.lastInsertRowid
    const existing = db().prepare('SELECT id FROM actor_tags_master WHERE name = ?').get(name) as { id: number } | undefined
    return existing?.id ?? 0
  })

  ipcMain.handle('actor-tags:update', (_e, id: number, name: string) => {
    db().prepare('UPDATE actor_tags_master SET name = ? WHERE id = ?').run(name, id)
    return true
  })

  ipcMain.handle('actor-tags:delete', (_e, id: number) => {
    db().prepare('DELETE FROM actor_tags_master WHERE id = ?').run(id)
    return true
  })

  // ========== 태그 연결 ==========

  ipcMain.handle('work-tag-links:list', () => {
    return db().prepare('SELECT parent_tag_id, child_tag_id FROM work_tag_links').all()
  })

  ipcMain.handle('work-tag-links:set', (_e, parentId: number, childIds: number[]) => {
    const d = db()
    const del = d.prepare('DELETE FROM work_tag_links WHERE parent_tag_id = ?')
    const ins = d.prepare('INSERT OR IGNORE INTO work_tag_links (parent_tag_id, child_tag_id) VALUES (?, ?)')
    d.transaction(() => {
      del.run(parentId)
      for (const cid of childIds) {
        if (cid !== parentId) ins.run(parentId, cid)
      }
    })()
    return true
  })

  ipcMain.handle('actor-tag-links:list', () => {
    return db().prepare('SELECT parent_tag_id, child_tag_id FROM actor_tag_links').all()
  })

  ipcMain.handle('actor-tag-links:set', (_e, parentId: number, childIds: number[]) => {
    const d = db()
    const del = d.prepare('DELETE FROM actor_tag_links WHERE parent_tag_id = ?')
    const ins = d.prepare('INSERT OR IGNORE INTO actor_tag_links (parent_tag_id, child_tag_id) VALUES (?, ?)')
    d.transaction(() => {
      del.run(parentId)
      for (const cid of childIds) {
        if (cid !== parentId) ins.run(parentId, cid)
      }
    })()
    return true
  })
}
