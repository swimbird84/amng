import { ipcMain } from 'electron'
import { getDatabase } from './db'

export function registerWorksHandlers(): void {
  const db = () => getDatabase()

  // ========== 작품 CRUD ==========

  ipcMain.handle('works:list', (_e, params?: {
    keyword?: string
    tagIds?: number[]
    tagMode?: 'and' | 'or'
    releaseDateFrom?: string
    releaseDateTo?: string
    ratingFrom?: number
    ratingTo?: number
    actorId?: number
    studioId?: number
    sortBy?: 'product_number' | 'rating' | 'release_date' | 'created_at' | 'title'
    sortDir?: 'asc' | 'desc'
    favoriteOnly?: boolean
    titleSearch?: string
    titleNull?: boolean
    commentSearch?: string
    commentNull?: boolean
    releaseDateNull?: boolean
    deletePending?: boolean
    actorCountFrom?: number
    actorCountTo?: number
    actorCountNull?: boolean
    limit?: number
    offset?: number
  }) => {
    let sql = `
      SELECT DISTINCT w.*, s.name AS studio_name, s.color AS studio_color, m.name AS studio_maker_name, m.color AS studio_maker_color FROM works w
      LEFT JOIN studios s ON s.id = w.studio_id
      LEFT JOIN makers m ON m.id = s.maker_id
    `
    const conditions: string[] = []
    const bindings: unknown[] = []

    if (params?.actorId) {
      if (params.actorId === -1) {
        conditions.push('NOT EXISTS (SELECT 1 FROM work_actors WHERE work_id = w.id)')
      } else {
        sql += ` JOIN work_actors wa_filter ON wa_filter.work_id = w.id`
        conditions.push('wa_filter.actor_id = ?')
        bindings.push(params.actorId)
      }
    }

    if (params?.tagIds?.length) {
      if (params.tagIds[0] === -1) {
        conditions.push('NOT EXISTS (SELECT 1 FROM work_tags WHERE work_id = w.id)')
      } else {
        const placeholders = params.tagIds.map(() => '?').join(',')
        sql += ` JOIN work_tags wt ON wt.work_id = w.id`
        conditions.push(`wt.tag_id IN (${placeholders})`)
        bindings.push(...params.tagIds)
        if (params.tagMode === 'and') {
          conditions.push(`(SELECT COUNT(DISTINCT wt2.tag_id) FROM work_tags wt2 WHERE wt2.work_id = w.id AND wt2.tag_id IN (${placeholders})) = ?`)
          bindings.push(...params.tagIds, params.tagIds.length)
        }
      }
    }

    if (params?.keyword) {
      conditions.push('w.product_number LIKE ?')
      bindings.push(`%${params.keyword}%`)
    }
    if (params?.releaseDateFrom) {
      conditions.push('w.release_date >= ?')
      bindings.push(params.releaseDateFrom)
    }
    if (params?.releaseDateTo) {
      conditions.push('w.release_date <= ?')
      bindings.push(params.releaseDateTo)
    }
    if (params?.ratingFrom !== undefined) {
      conditions.push('w.rating >= ?')
      bindings.push(params.ratingFrom)
    }
    if (params?.ratingTo !== undefined) {
      conditions.push('w.rating <= ?')
      bindings.push(params.ratingTo)
    }
    if (params?.favoriteOnly) {
      conditions.push('w.is_favorite = 1')
    }
    if (params?.studioId) {
      if (params.studioId === -1) {
        conditions.push('w.studio_id IS NULL')
      } else {
        conditions.push('w.studio_id = ?')
        bindings.push(params.studioId)
      }
    }

    if (params?.titleSearch) {
      conditions.push('w.title LIKE ?')
      bindings.push(`%${params.titleSearch}%`)
    }
    if (params?.titleNull) {
      conditions.push("(w.title IS NULL OR TRIM(w.title) = '')")
    }
    if (params?.commentSearch) {
      conditions.push('w.comment LIKE ?')
      bindings.push(`%${params.commentSearch}%`)
    }
    if (params?.commentNull) {
      conditions.push("(w.comment IS NULL OR TRIM(w.comment) = '')")
    }
    if (params?.deletePending) {
      conditions.push('COALESCE(w.delete_pending, 0) = 1')
    }
    if (params?.releaseDateNull) {
      conditions.push("(w.release_date IS NULL OR TRIM(w.release_date) = '')")
    }
    if (params?.actorCountFrom !== undefined) {
      conditions.push('(SELECT COUNT(*) FROM work_actors wa2 WHERE wa2.work_id = w.id) >= ?')
      bindings.push(params.actorCountFrom)
    }
    if (params?.actorCountTo !== undefined) {
      conditions.push('(SELECT COUNT(*) FROM work_actors wa2 WHERE wa2.work_id = w.id) <= ?')
      bindings.push(params.actorCountTo)
    }
    if (params?.actorCountNull) {
      conditions.push('NOT EXISTS (SELECT 1 FROM work_actors wa2 WHERE wa2.work_id = w.id)')
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ')
    }

    const sortDir = params?.sortDir === 'asc' ? 'ASC' : 'DESC'
    if (params?.sortBy === 'title') {
      sql += ` ORDER BY w.title IS NULL ASC, w.title ${sortDir}`
    } else {
      const validWorkSortCols = ['product_number', 'rating', 'release_date', 'created_at']
      const sortCol = validWorkSortCols.includes(params?.sortBy ?? '') ? params!.sortBy : 'created_at'
      sql += ` ORDER BY w.${sortCol} ${sortDir}`
    }

    let total: number | undefined
    if (params?.limit !== undefined) {
      const countResult = db().prepare(`SELECT COUNT(*) AS cnt FROM (${sql}) t`).get(...bindings) as { cnt: number }
      total = countResult.cnt
      sql += ' LIMIT ?'
      bindings.push(params.limit)
      sql += ' OFFSET ?'
      bindings.push(params.offset ?? 0)
    }

    const rawList = db().prepare(sql).all(...bindings) as Array<Record<string, unknown>>
    if (rawList.length === 0) return total !== undefined ? { items: [], total } : []
    const workIds = rawList.map(w => w.id as number)
    const ph = workIds.map(() => '?').join(',')
    const repRows = db().prepare(`
      SELECT wt.work_id, t.id, t.name, COALESCE(c.sort_order, 999999) AS category_sort_order
      FROM work_tags wt
      JOIN work_tags_master t ON t.id = wt.tag_id
      LEFT JOIN work_tag_categories c ON c.id = t.category_id
      WHERE wt.is_rep = 1 AND wt.work_id IN (${ph})
      ORDER BY COALESCE(c.sort_order, 999999), t.name
    `).all(...workIds) as Array<{ work_id: number; id: number; name: string; category_sort_order: number }>
    const repTagMap = new Map<number, Array<{ id: number; name: string; category_sort_order: number }>>()
    for (const row of repRows) {
      if (!repTagMap.has(row.work_id)) repTagMap.set(row.work_id, [])
      repTagMap.get(row.work_id)!.push({ id: row.id, name: row.name })
    }
    const repActorRows = db().prepare(`
      SELECT wa.work_id, a.id, a.name
      FROM work_actors wa
      JOIN actors a ON a.id = wa.actor_id
      WHERE wa.is_rep = 1 AND wa.work_id IN (${ph})
      ORDER BY a.name
    `).all(...workIds) as Array<{ work_id: number; id: number; name: string }>
    const repActorMap = new Map<number, Array<{ id: number; name: string }>>()
    for (const row of repActorRows) {
      if (!repActorMap.has(row.work_id)) repActorMap.set(row.work_id, [])
      repActorMap.get(row.work_id)!.push({ id: row.id, name: row.name })
    }
    const items = rawList.map(w => ({ ...w, rep_tags: repTagMap.get(w.id as number) ?? [], rep_actors: repActorMap.get(w.id as number) ?? [] }))
    return total !== undefined ? { items, total } : items
  })

  ipcMain.handle('works:get', (_e, id: number) => {
    const work = db().prepare(`
      SELECT w.*, s.name AS studio_name, s.color AS studio_color, m.name AS studio_maker_name, m.color AS studio_maker_color
      FROM works w
      LEFT JOIN studios s ON s.id = w.studio_id
      LEFT JOIN makers m ON m.id = s.maker_id
      WHERE w.id = ?
    `).get(id)
    if (!work) return null

    const actors = db().prepare(`
      SELECT a.* FROM actors a
      JOIN work_actors wa ON wa.actor_id = a.id
      WHERE wa.work_id = ?
    `).all(id)

    const tags = db().prepare(`
      SELECT t.id, t.name, t.category_id, c.name AS category_name, c.sort_order AS category_sort_order
      FROM work_tags_master t
      JOIN work_tags wt ON wt.tag_id = t.id
      LEFT JOIN work_tag_categories c ON c.id = t.category_id
      WHERE wt.work_id = ?
      ORDER BY COALESCE(c.sort_order, 999999), t.name
    `).all(id)

    const rep_tags = db().prepare(`
      SELECT t.id, t.name, t.category_id, c.name AS category_name, c.sort_order AS category_sort_order
      FROM work_tags_master t
      JOIN work_tags wt ON wt.tag_id = t.id
      LEFT JOIN work_tag_categories c ON c.id = t.category_id
      WHERE wt.work_id = ? AND wt.is_rep = 1
      ORDER BY COALESCE(c.sort_order, 999999), t.name
    `).all(id)

    const rep_actors = db().prepare(`
      SELECT a.id, a.name FROM actors a
      JOIN work_actors wa ON wa.actor_id = a.id
      WHERE wa.work_id = ? AND wa.is_rep = 1
      ORDER BY a.name
    `).all(id) as Array<{ id: number; name: string }>

    const files = db().prepare('SELECT * FROM work_files WHERE work_id = ? ORDER BY sort_order, id').all(id)

    return { ...work as object, actors, tags, rep_tags, rep_actors, files }
  })

  ipcMain.handle('works:create', (_e, data: {
    file_path?: string
    extra_file_paths?: string[]
    file_entries?: { path: string; type: 'local' | 'url' }[]
    cover_path?: string
    product_number?: string
    title?: string
    release_date?: string
    rating?: number
    comment?: string | null
    studio_id?: number | null
    actor_ids?: number[]
    rep_actor_ids?: number[]
    tag_ids?: number[]
    rep_tag_ids?: number[]
  }) => {
    const entries: { path: string; type: 'local' | 'url' }[] = data.file_entries ?? [
      ...(data.file_path ? [{ path: data.file_path, type: 'local' as const }] : []),
      ...(data.extra_file_paths ?? []).map(p => ({ path: p, type: 'local' as const }))
    ]

    const insert = db().prepare(`
      INSERT INTO works (file_path, cover_path, product_number, title, release_date, rating, comment, studio_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const result = insert.run(
      entries[0]?.path ?? '', data.cover_path || null, data.product_number || null,
      data.title || null, data.release_date || null, data.rating || 0, data.comment || null,
      data.studio_id ?? null
    )
    const workId = result.lastInsertRowid

    const insertFile = db().prepare('INSERT INTO work_files (work_id, file_path, type, sort_order) VALUES (?, ?, ?, ?)')
    entries.forEach((e, i) => insertFile.run(workId, e.path, e.type, i))

    if (data.actor_ids?.length) {
      const linkActor = db().prepare('INSERT OR IGNORE INTO work_actors (work_id, actor_id, is_rep) VALUES (?, ?, ?)')
      for (const actorId of data.actor_ids) linkActor.run(workId, actorId, data.rep_actor_ids?.includes(actorId) ? 1 : 0)
    }
    if (data.tag_ids?.length) {
      const linkTag = db().prepare('INSERT OR IGNORE INTO work_tags (work_id, tag_id, is_rep) VALUES (?, ?, ?)')
      for (const tagId of data.tag_ids) {
        linkTag.run(workId, tagId, data.rep_tag_ids?.includes(tagId) ? 1 : 0)
      }
    }

    return workId
  })

  ipcMain.handle('works:update', (_e, id: number, data: {
    file_path?: string
    file_paths?: string[]
    file_entries?: { path: string; type: 'local' | 'url' }[]
    cover_path?: string
    product_number?: string
    title?: string
    release_date?: string
    rating?: number
    is_favorite?: number
    comment?: string | null
    studio_id?: number | null
    delete_pending?: number
    actor_ids?: number[]
    rep_actor_ids?: number[]
    tag_ids?: number[]
    rep_tag_ids?: number[]
  }) => {
    const fields: string[] = []
    const values: unknown[] = []

    if (data.file_entries !== undefined && data.file_entries.length > 0) {
      fields.push('file_path = ?')
      values.push(data.file_entries[0].path)
      db().prepare('DELETE FROM work_files WHERE work_id = ?').run(id)
      const insertFile = db().prepare('INSERT INTO work_files (work_id, file_path, type, sort_order) VALUES (?, ?, ?, ?)')
      data.file_entries.forEach((e, i) => insertFile.run(id, e.path, e.type, i))
    } else if (data.file_paths !== undefined && data.file_paths.length > 0) {
      fields.push('file_path = ?')
      values.push(data.file_paths[0])
      db().prepare('DELETE FROM work_files WHERE work_id = ?').run(id)
      const insertFile = db().prepare('INSERT INTO work_files (work_id, file_path, type, sort_order) VALUES (?, ?, ?, ?)')
      data.file_paths.forEach((fp, i) => insertFile.run(id, fp, 'local', i))
    } else if (data.file_path !== undefined) { fields.push('file_path = ?'); values.push(data.file_path) }
    if (data.cover_path !== undefined) { fields.push('cover_path = ?'); values.push(data.cover_path) }
    if (data.product_number !== undefined) { fields.push('product_number = ?'); values.push(data.product_number) }
    if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title) }
    if (data.release_date !== undefined) { fields.push('release_date = ?'); values.push(data.release_date) }
    if (data.rating !== undefined) { fields.push('rating = ?'); values.push(data.rating) }
    if (data.is_favorite !== undefined) { fields.push('is_favorite = ?'); values.push(data.is_favorite) }
    if (data.comment !== undefined) { fields.push('comment = ?'); values.push(data.comment) }
    if (data.studio_id !== undefined) { fields.push('studio_id = ?'); values.push(data.studio_id) }
    if (data.delete_pending !== undefined) { fields.push('delete_pending = ?'); values.push(data.delete_pending) }

    if (fields.length > 0) {
      values.push(id)
      db().prepare(`UPDATE works SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }

    if (data.actor_ids !== undefined) {
      db().prepare('DELETE FROM work_actors WHERE work_id = ?').run(id)
      const linkActor = db().prepare('INSERT OR IGNORE INTO work_actors (work_id, actor_id, is_rep) VALUES (?, ?, ?)')
      for (const actorId of data.actor_ids) linkActor.run(id, actorId, data.rep_actor_ids?.includes(actorId) ? 1 : 0)
    } else if (data.rep_actor_ids !== undefined) {
      db().prepare('UPDATE work_actors SET is_rep = 0 WHERE work_id = ?').run(id)
      if (data.rep_actor_ids.length > 0) {
        const ph = data.rep_actor_ids.map(() => '?').join(',')
        db().prepare(`UPDATE work_actors SET is_rep = 1 WHERE work_id = ? AND actor_id IN (${ph})`).run(id, ...data.rep_actor_ids)
      }
    }
    if (data.tag_ids !== undefined) {
      db().prepare('DELETE FROM work_tags WHERE work_id = ?').run(id)
      const linkTag = db().prepare('INSERT OR IGNORE INTO work_tags (work_id, tag_id, is_rep) VALUES (?, ?, ?)')
      for (const tagId of data.tag_ids) {
        linkTag.run(id, tagId, data.rep_tag_ids?.includes(tagId) ? 1 : 0)
      }
    } else if (data.rep_tag_ids !== undefined) {
      db().prepare('UPDATE work_tags SET is_rep = 0 WHERE work_id = ?').run(id)
      if (data.rep_tag_ids.length > 0) {
        const ph = data.rep_tag_ids.map(() => '?').join(',')
        db().prepare(`UPDATE work_tags SET is_rep = 1 WHERE work_id = ? AND tag_id IN (${ph})`).run(id, ...data.rep_tag_ids)
      }
    }

    return true
  })

  ipcMain.handle('works:delete', (_e, id: number) => {
    const blocked = db().prepare(`
      SELECT 1 FROM cup_entries e
      JOIN cup_runs r ON r.id = e.run_id
      WHERE r.status = 'in_progress' AND e.item_id = ?
      LIMIT 1
    `).get(id)
    if (blocked) return { blocked: true }
    db().prepare('DELETE FROM works WHERE id = ?').run(id)
    db().prepare(`DELETE FROM master_ranking_history WHERE type = 'work' AND item_id = ?`).run(id)
    db().prepare(`DELETE FROM cup_entries WHERE item_id = ?`).run(id)
    db().prepare(`DELETE FROM cup_stats WHERE type = 'work' AND item_id = ?`).run(id)
    db().prepare(`DELETE FROM cup_match_points WHERE item_id = ?`).run(id)
    db().prepare(`DELETE FROM cup_rank_snapshots WHERE item_id = ?`).run(id)
    return { blocked: false }
  })

  ipcMain.handle('work-files:add', (_e, workId: number, filePath: string, type: 'local' | 'url' = 'local') => {
    const row = db().prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM work_files WHERE work_id = ?').get(workId) as { m: number }
    const result = db().prepare('INSERT INTO work_files (work_id, file_path, type, sort_order) VALUES (?, ?, ?, ?)').run(workId, filePath, type, row.m + 1)
    return result.lastInsertRowid
  })

  ipcMain.handle('work-files:delete', (_e, fileId: number) => {
    db().prepare('DELETE FROM work_files WHERE id = ?').run(fileId)
    return true
  })
}
