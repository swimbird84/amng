import { ipcMain, dialog, app, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { getDatabase } from './db'

export function registerIpcHandlers(): void {
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
    sortBy?: 'product_number' | 'rating' | 'release_date' | 'created_at'
    sortDir?: 'asc' | 'desc'
    favoriteOnly?: boolean
  }) => {
    let sql = `
      SELECT DISTINCT w.*, s.name AS studio_name, s.color AS studio_color FROM works w
      LEFT JOIN studios s ON s.id = w.studio_id
    `
    const conditions: string[] = []
    const bindings: unknown[] = []

    if (params?.actorId) {
      sql += ` JOIN work_actors wa_filter ON wa_filter.work_id = w.id`
      conditions.push('wa_filter.actor_id = ?')
      bindings.push(params.actorId)
    }

    if (params?.tagIds?.length) {
      const placeholders = params.tagIds.map(() => '?').join(',')
      sql += ` JOIN work_tags wt ON wt.work_id = w.id`
      conditions.push(`wt.tag_id IN (${placeholders})`)
      bindings.push(...params.tagIds)
      if (params.tagMode === 'and') {
        conditions.push(`(SELECT COUNT(DISTINCT wt2.tag_id) FROM work_tags wt2 WHERE wt2.work_id = w.id AND wt2.tag_id IN (${placeholders})) = ?`)
        bindings.push(...params.tagIds, params.tagIds.length)
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
      conditions.push('w.studio_id = ?')
      bindings.push(params.studioId)
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ')
    }

    const validWorkSortCols = ['product_number', 'rating', 'release_date', 'created_at']
    const sortCol = validWorkSortCols.includes(params?.sortBy ?? '') ? params!.sortBy : 'created_at'
    const sortDir = params?.sortDir === 'asc' ? 'ASC' : 'DESC'
    sql += ` ORDER BY w.${sortCol} ${sortDir}`

    const rawList = db().prepare(sql).all(...bindings) as Array<Record<string, unknown>>
    if (rawList.length === 0) return []
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
    return rawList.map(w => ({ ...w, rep_tags: repTagMap.get(w.id as number) ?? [], rep_actors: repActorMap.get(w.id as number) ?? [] }))
  })

  ipcMain.handle('works:get', (_e, id: number) => {
    const work = db().prepare(`
      SELECT w.*, s.name AS studio_name, s.color AS studio_color
      FROM works w
      LEFT JOIN studios s ON s.id = w.studio_id
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
    comment?: string
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
    db().prepare('DELETE FROM works WHERE id = ?').run(id)
    return true
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

  // ========== 배우 CRUD ==========

  ipcMain.handle('actors:list', (_e, params?: {
    keyword?: string
    tagIds?: number[]
    tagMode?: 'and' | 'or'
    ageFrom?: number
    ageTo?: number
    ratingFrom?: number
    ratingTo?: number
    sortBy?: 'name' | 'avg_score' | 'birthday' | 'work_count' | 'created_at' | 'debut_date' | 'ratio_score'
    sortDir?: 'asc' | 'desc'
    favoriteOnly?: boolean
  }) => {
    let sql = `
      WITH stats AS (
        SELECT
          MIN(height) AS min_h, MAX(height) AS max_h,
          MIN(bust)   AS min_b, MAX(bust)   AS max_b,
          MIN(waist)  AS min_w, MAX(waist)  AS max_w,
          MIN(hip)    AS min_hip, MAX(hip)  AS max_hip
        FROM actors
        WHERE height IS NOT NULL AND bust IS NOT NULL AND waist IS NOT NULL AND hip IS NOT NULL
      )
      SELECT DISTINCT a.*,
        (SELECT COUNT(*) FROM work_actors wa WHERE wa.actor_id = a.id) AS work_count,
        COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 10.0, 0) AS avg_score,
        CASE WHEN a.height IS NOT NULL AND a.bust IS NOT NULL AND a.waist IS NOT NULL AND a.hip IS NOT NULL
          THEN ROUND((
            (
              COALESCE(CAST(a.height - stats.min_h AS REAL) / NULLIF(stats.max_h - stats.min_h, 0) * 10, 5.0) +
              COALESCE(CAST(a.bust   - stats.min_b AS REAL) / NULLIF(stats.max_b - stats.min_b, 0) * 10, 5.0) +
              COALESCE(CAST(stats.max_w - a.waist  AS REAL) / NULLIF(stats.max_w - stats.min_w, 0) * 10, 5.0) +
              COALESCE(CAST(a.hip - stats.min_hip  AS REAL) / NULLIF(stats.max_hip - stats.min_hip, 0) * 10, 5.0)
            ) / 4.0 * 0.3 +
            (COALESCE(s.bust, 0) + COALESCE(s.hip, 0) + COALESCE(s.physical, 0) + COALESCE(s.skin, 0) + COALESCE(s.proportions, 0)) / 5.0 * 0.7
          ), 2)
          ELSE NULL
        END AS ratio_score
      FROM actors a
      CROSS JOIN stats
      LEFT JOIN actor_scores s ON s.actor_id = a.id
    `
    const conditions: string[] = []
    const bindings: unknown[] = []

    if (params?.tagIds?.length) {
      const placeholders = params.tagIds.map(() => '?').join(',')
      sql += ` JOIN actor_tags at2 ON at2.actor_id = a.id`
      conditions.push(`at2.tag_id IN (${placeholders})`)
      bindings.push(...params.tagIds)
      if (params.tagMode === 'and') {
        conditions.push(`(SELECT COUNT(DISTINCT at3.tag_id) FROM actor_tags at3 WHERE at3.actor_id = a.id AND at3.tag_id IN (${placeholders})) = ?`)
        bindings.push(...params.tagIds, params.tagIds.length)
      }
    }

    if (params?.keyword) {
      conditions.push('a.name LIKE ?')
      bindings.push(`%${params.keyword}%`)
    }
    if (params?.ageFrom !== undefined && params.ageFrom > 0) {
      conditions.push("(julianday('now') - julianday(a.birthday)) / 365.25 >= ?")
      bindings.push(params.ageFrom)
    }
    if (params?.ageTo !== undefined && params.ageTo > 0) {
      conditions.push("(julianday('now') - julianday(a.birthday)) / 365.25 <= ?")
      bindings.push(params.ageTo)
    }
    if (params?.ratingFrom !== undefined) {
      conditions.push('COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 10.0, 0) >= ?')
      bindings.push(params.ratingFrom)
    }
    if (params?.ratingTo !== undefined) {
      conditions.push('COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 10.0, 0) <= ?')
      bindings.push(params.ratingTo)
    }
    if (params?.favoriteOnly) {
      conditions.push('a.is_favorite = 1')
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ')
    }

    const sortDir = params?.sortDir === 'asc' ? 'ASC' : 'DESC'
    if (params?.sortBy === 'work_count') {
      sql += ` ORDER BY work_count ${sortDir}`
    } else if (params?.sortBy === 'avg_score') {
      sql += ` ORDER BY avg_score ${sortDir}`
    } else if (params?.sortBy === 'ratio_score') {
      sql += ` ORDER BY ratio_score IS NULL ASC, ratio_score ${sortDir}`
    } else {
      const validActorSortCols = ['name', 'birthday', 'created_at', 'debut_date']
      const sortCol = validActorSortCols.includes(params?.sortBy ?? '') ? params!.sortBy : 'created_at'
      sql += ` ORDER BY a.${sortCol} IS NULL ASC, a.${sortCol} ${sortDir}`
    }

    const rawActors = db().prepare(sql).all(...bindings) as Array<Record<string, unknown>>
    if (rawActors.length === 0) return []
    const actorIds = rawActors.map(a => a.id as number)
    const aph = actorIds.map(() => '?').join(',')
    const aRepRows = db().prepare(`
      SELECT at2.actor_id, t.id, t.name, COALESCE(c.sort_order, 999999) AS category_sort_order
      FROM actor_tags at2
      JOIN actor_tags_master t ON t.id = at2.tag_id
      LEFT JOIN actor_tag_categories c ON c.id = t.category_id
      WHERE at2.is_rep = 1 AND at2.actor_id IN (${aph})
      ORDER BY COALESCE(c.sort_order, 999999), t.name
    `).all(...actorIds) as Array<{ actor_id: number; id: number; name: string; category_sort_order: number }>
    const aRepTagMap = new Map<number, Array<{ id: number; name: string; category_sort_order: number }>>()
    for (const row of aRepRows) {
      if (!aRepTagMap.has(row.actor_id)) aRepTagMap.set(row.actor_id, [])
      aRepTagMap.get(row.actor_id)!.push({ id: row.id, name: row.name })
    }
    return rawActors.map(a => ({ ...a, rep_tags: aRepTagMap.get(a.id as number) ?? [] }))
  })

  ipcMain.handle('actors:get', (_e, id: number) => {
    const actor = db().prepare(`
      WITH stats AS (
        SELECT
          MIN(height) AS min_h, MAX(height) AS max_h,
          MIN(bust)   AS min_b, MAX(bust)   AS max_b,
          MIN(waist)  AS min_w, MAX(waist)  AS max_w,
          MIN(hip)    AS min_hip, MAX(hip)  AS max_hip
        FROM actors
        WHERE height IS NOT NULL AND bust IS NOT NULL AND waist IS NOT NULL AND hip IS NOT NULL
      )
      SELECT a.*,
        CASE WHEN a.height IS NOT NULL AND a.bust IS NOT NULL AND a.waist IS NOT NULL AND a.hip IS NOT NULL
          THEN ROUND((
            (
              COALESCE(CAST(a.height - stats.min_h AS REAL) / NULLIF(stats.max_h - stats.min_h, 0) * 10, 5.0) +
              COALESCE(CAST(a.bust   - stats.min_b AS REAL) / NULLIF(stats.max_b - stats.min_b, 0) * 10, 5.0) +
              COALESCE(CAST(stats.max_w - a.waist  AS REAL) / NULLIF(stats.max_w - stats.min_w, 0) * 10, 5.0) +
              COALESCE(CAST(a.hip - stats.min_hip  AS REAL) / NULLIF(stats.max_hip - stats.min_hip, 0) * 10, 5.0)
            ) / 4.0 * 0.3 +
            (COALESCE(s.bust, 0) + COALESCE(s.hip, 0) + COALESCE(s.physical, 0) + COALESCE(s.skin, 0) + COALESCE(s.proportions, 0)) / 5.0 * 0.7
          ), 2)
          ELSE NULL
        END AS ratio_score
      FROM actors a
      CROSS JOIN stats
      LEFT JOIN actor_scores s ON s.actor_id = a.id
      WHERE a.id = ?
    `).get(id)
    if (!actor) return null

    const works = db().prepare(`
      SELECT w.* FROM works w
      JOIN work_actors wa ON wa.work_id = w.id
      WHERE wa.actor_id = ?
    `).all(id) as Array<Record<string, unknown>>

    // 출연작별 대표 태그 + 첫 번째 파일
    if (works.length > 0) {
      const wIds = works.map(w => w.id as number)
      const wph = wIds.map(() => '?').join(',')
      const wRepRows = db().prepare(`
        SELECT wt.work_id, t.id, t.name, COALESCE(c.sort_order, 999999) AS category_sort_order
        FROM work_tags wt
        JOIN work_tags_master t ON t.id = wt.tag_id
        LEFT JOIN work_tag_categories c ON c.id = t.category_id
        WHERE wt.is_rep = 1 AND wt.work_id IN (${wph})
        ORDER BY COALESCE(c.sort_order, 999999), t.name
      `).all(...wIds) as Array<{ work_id: number; id: number; name: string; category_sort_order: number }>
      const wRepMap = new Map<number, Array<{ id: number; name: string; category_sort_order: number }>>()
      for (const row of wRepRows) {
        if (!wRepMap.has(row.work_id)) wRepMap.set(row.work_id, [])
        wRepMap.get(row.work_id)!.push({ id: row.id, name: row.name })
      }
      const wFirstFiles = db().prepare(`
        SELECT work_id, file_path, type FROM work_files
        WHERE work_id IN (${wph})
        ORDER BY sort_order ASC
      `).all(...wIds) as Array<{ work_id: number; file_path: string; type: string }>
      const wFirstFileMap = new Map<number, { file_path: string; type: string }>()
      for (const f of wFirstFiles) {
        if (!wFirstFileMap.has(f.work_id)) wFirstFileMap.set(f.work_id, f)
      }
      for (const w of works) {
        (w as Record<string, unknown>).rep_tags = wRepMap.get(w.id as number) ?? []
        const firstFile = wFirstFileMap.get(w.id as number)
        ;(w as Record<string, unknown>).files = firstFile ? [firstFile] : []
      }
    }

    const tags = db().prepare(`
      SELECT t.id, t.name, t.category_id, c.name AS category_name, c.sort_order AS category_sort_order
      FROM actor_tags_master t
      JOIN actor_tags at2 ON at2.tag_id = t.id
      LEFT JOIN actor_tag_categories c ON c.id = t.category_id
      WHERE at2.actor_id = ?
      ORDER BY COALESCE(c.sort_order, 999999), t.name
    `).all(id)

    const rep_tags = db().prepare(`
      SELECT t.id, t.name, t.category_id, c.name AS category_name, c.sort_order AS category_sort_order
      FROM actor_tags_master t
      JOIN actor_tags at2 ON at2.tag_id = t.id
      LEFT JOIN actor_tag_categories c ON c.id = t.category_id
      WHERE at2.actor_id = ? AND at2.is_rep = 1
      ORDER BY COALESCE(c.sort_order, 999999), t.name
    `).all(id)

    const scores = db().prepare('SELECT face, bust, hip, physical, skin, acting, sexy, charm, technique, proportions FROM actor_scores WHERE actor_id = ?').get(id) || {
      face: 0, bust: 0, hip: 0, physical: 0, skin: 0, acting: 0, sexy: 0, charm: 0, technique: 0, proportions: 0
    }

    return { ...actor as object, works, tags, rep_tags, scores }
  })

  ipcMain.handle('actors:create', (_e, data: {
    name: string
    photo_path?: string
    birthday?: string
    debut_date?: string | null
    height?: number | null
    bust?: number | null
    waist?: number | null
    hip?: number | null
    cup?: string | null
    comment?: string | null
    scores?: { face: number; bust: number; hip: number; physical: number; skin: number; acting: number; sexy: number; charm: number; technique: number; proportions: number }
    tag_ids?: number[]
    rep_tag_ids?: number[]
  }) => {
    const result = db().prepare(`
      INSERT INTO actors (name, photo_path, birthday, debut_date, height, bust, waist, hip, cup, comment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(data.name, data.photo_path || null, data.birthday || null, data.debut_date || null,
      data.height ?? null, data.bust ?? null, data.waist ?? null, data.hip ?? null, data.cup || null, data.comment || null)
    const actorId = result.lastInsertRowid

    const s = data.scores
    db().prepare(`
      INSERT OR REPLACE INTO actor_scores (actor_id, face, bust, hip, physical, skin, acting, sexy, charm, technique, proportions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(actorId, s?.face ?? 0, s?.bust ?? 0, s?.hip ?? 0, s?.physical ?? 0, s?.skin ?? 0, s?.acting ?? 0, s?.sexy ?? 0, s?.charm ?? 0, s?.technique ?? 0, s?.proportions ?? 0)

    if (data.tag_ids?.length) {
      const linkTag = db().prepare('INSERT OR IGNORE INTO actor_tags (actor_id, tag_id, is_rep) VALUES (?, ?, ?)')
      for (const tagId of data.tag_ids) {
        linkTag.run(actorId, tagId, data.rep_tag_ids?.includes(tagId) ? 1 : 0)
      }
    }

    return actorId
  })

  ipcMain.handle('actors:update', (_e, id: number, data: {
    name?: string
    photo_path?: string
    birthday?: string
    debut_date?: string | null
    is_favorite?: number
    height?: number | null
    bust?: number | null
    waist?: number | null
    hip?: number | null
    cup?: string | null
    comment?: string | null
    scores?: { face: number; bust: number; hip: number; physical: number; skin: number; acting: number; sexy: number; charm: number; technique: number; proportions: number }
    tag_ids?: number[]
    rep_tag_ids?: number[]
  }) => {
    const fields: string[] = []
    const values: unknown[] = []

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
    if (data.photo_path !== undefined) { fields.push('photo_path = ?'); values.push(data.photo_path) }
    if (data.birthday !== undefined) { fields.push('birthday = ?'); values.push(data.birthday) }
    if (data.debut_date !== undefined) { fields.push('debut_date = ?'); values.push(data.debut_date) }
    if (data.is_favorite !== undefined) { fields.push('is_favorite = ?'); values.push(data.is_favorite) }
    if (data.height !== undefined) { fields.push('height = ?'); values.push(data.height) }
    if (data.bust !== undefined) { fields.push('bust = ?'); values.push(data.bust) }
    if (data.waist !== undefined) { fields.push('waist = ?'); values.push(data.waist) }
    if (data.hip !== undefined) { fields.push('hip = ?'); values.push(data.hip) }
    if (data.cup !== undefined) { fields.push('cup = ?'); values.push(data.cup) }
    if (data.comment !== undefined) { fields.push('comment = ?'); values.push(data.comment) }

    if (fields.length > 0) {
      values.push(id)
      db().prepare(`UPDATE actors SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }

    if (data.scores !== undefined) {
      const s = data.scores
      db().prepare(`
        INSERT OR REPLACE INTO actor_scores (actor_id, face, bust, hip, physical, skin, acting, sexy, charm, technique, proportions)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, s.face, s.bust, s.hip, s.physical, s.skin, s.acting, s.sexy, s.charm ?? 0, s.technique ?? 0, s.proportions ?? 0)
    }

    if (data.tag_ids !== undefined) {
      db().prepare('DELETE FROM actor_tags WHERE actor_id = ?').run(id)
      const linkTag = db().prepare('INSERT OR IGNORE INTO actor_tags (actor_id, tag_id, is_rep) VALUES (?, ?, ?)')
      for (const tagId of data.tag_ids) {
        linkTag.run(id, tagId, data.rep_tag_ids?.includes(tagId) ? 1 : 0)
      }
    } else if (data.rep_tag_ids !== undefined) {
      db().prepare('UPDATE actor_tags SET is_rep = 0 WHERE actor_id = ?').run(id)
      if (data.rep_tag_ids.length > 0) {
        const ph = data.rep_tag_ids.map(() => '?').join(',')
        db().prepare(`UPDATE actor_tags SET is_rep = 1 WHERE actor_id = ? AND tag_id IN (${ph})`).run(id, ...data.rep_tag_ids)
      }
    }

    return true
  })

  ipcMain.handle('actors:delete', (_e, id: number) => {
    db().prepare('DELETE FROM actors WHERE id = ?').run(id)
    return true
  })

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

  // ========== 제작사 CRUD ==========

  ipcMain.handle('studios:list', (_e, withCount?: boolean) => {
    if (withCount) {
      return db().prepare(`
        SELECT s.*, COUNT(w.id) AS work_count, m.id AS maker_id, m.name AS maker_name, m.color AS maker_color
        FROM studios s
        LEFT JOIN works w ON w.studio_id = s.id
        LEFT JOIN makers m ON m.id = s.maker_id
        GROUP BY s.id
        ORDER BY s.name
      `).all()
    }
    return db().prepare(`
      SELECT s.*, m.id AS maker_id, m.name AS maker_name, m.color AS maker_color
      FROM studios s
      LEFT JOIN makers m ON m.id = s.maker_id
      ORDER BY s.name
    `).all()
  })

  ipcMain.handle('studios:create', (_e, name: string) => {
    const result = db().prepare('INSERT OR IGNORE INTO studios (name) VALUES (?)').run(name.trim())
    if (result.changes > 0) return result.lastInsertRowid
    const existing = db().prepare('SELECT id FROM studios WHERE name = ?').get(name.trim()) as { id: number } | undefined
    return existing?.id ?? 0
  })

  ipcMain.handle('studios:update', (_e, id: number, name: string, color?: string | null) => {
    if (color !== undefined) {
      db().prepare('UPDATE studios SET name = ?, color = ? WHERE id = ?').run(name.trim(), color, id)
    } else {
      db().prepare('UPDATE studios SET name = ? WHERE id = ?').run(name.trim(), id)
    }
    return true
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

  ipcMain.handle('makers:create', (_e, name: string) => {
    const result = db().prepare('INSERT OR IGNORE INTO makers (name) VALUES (?)').run(name.trim())
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

  ipcMain.handle('scan:folder', (_e, folderPath: string) => {
    const videoExtensions = ['.mp4', '.mkv', '.avi', '.wmv', '.mov', '.flv', '.m2ts']
    const files: string[] = []

    function scanDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          scanDir(fullPath)
        } else if (videoExtensions.includes(path.extname(entry.name).toLowerCase())) {
          files.push(fullPath)
        }
      }
    }

    scanDir(folderPath)

    const existingPaths = new Set(
      (db().prepare('SELECT file_path FROM work_files').all() as { file_path: string }[]).map(r => r.file_path)
    )
    const newFiles = files.filter(f => !existingPaths.has(f))
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

  ipcMain.handle('image:copy', (_e, sourcePath: string, type: 'works' | 'actors', id: number) => {
    const ext = path.extname(sourcePath)
    const imagesDir = path.join(app.getPath('userData'), 'images', type)
    fs.mkdirSync(imagesDir, { recursive: true })
    const destPath = path.join(imagesDir, `${id}${ext}`)
    fs.copyFileSync(sourcePath, destPath)
    return destPath
  })

  // ========== 대시보드 ==========

  ipcMain.handle('dashboard:new-works', () => {
    const works = db().prepare(`
      SELECT w.*,
        COALESCE((
          SELECT AVG((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 10.0)
          FROM work_actors wa2
          JOIN actor_scores s ON s.actor_id = wa2.actor_id
          WHERE wa2.work_id = w.id
        ), 0) AS actor_avg_score
      FROM works w
      WHERE w.release_date IS NOT NULL AND w.release_date != ''
        AND w.release_date >= date('now', '-2 months')
      ORDER BY w.release_date DESC, w.rating DESC, actor_avg_score DESC
    `).all() as Array<Record<string, unknown>>
    if (works.length === 0) return []
    const ids = works.map(w => w.id as number)
    const ph = ids.map(() => '?').join(',')
    const repRows = db().prepare(`
      SELECT wt.work_id, t.id, t.name FROM work_tags wt
      JOIN work_tags_master t ON t.id = wt.tag_id
      WHERE wt.is_rep = 1 AND wt.work_id IN (${ph})
    `).all(...ids) as Array<{ work_id: number; id: number; name: string }>
    const repMap = new Map<number, Array<{ id: number; name: string }>>()
    for (const r of repRows) {
      if (!repMap.has(r.work_id)) repMap.set(r.work_id, [])
      repMap.get(r.work_id)!.push({ id: r.id, name: r.name })
    }
    const repActorRows2 = db().prepare(`
      SELECT wa.work_id, a.id, a.name FROM work_actors wa
      JOIN actors a ON a.id = wa.actor_id
      WHERE wa.is_rep = 1 AND wa.work_id IN (${ph})
    `).all(...ids) as Array<{ work_id: number; id: number; name: string }>
    const repActorMap2 = new Map<number, Array<{ id: number; name: string }>>()
    for (const r of repActorRows2) {
      if (!repActorMap2.has(r.work_id)) repActorMap2.set(r.work_id, [])
      repActorMap2.get(r.work_id)!.push({ id: r.id, name: r.name })
    }
    return works.map(w => ({ ...w, rep_tags: repMap.get(w.id as number) ?? [], rep_actors: repActorMap2.get(w.id as number) ?? [] }))
  })

  ipcMain.handle('dashboard:release-years', () => {
    return db().prepare(`
      SELECT strftime('%Y', release_date) AS year, COUNT(*) AS count
      FROM works WHERE release_date IS NOT NULL AND release_date != ''
      GROUP BY year ORDER BY year DESC
    `).all()
  })

  ipcMain.handle('dashboard:release-months', (_e, year: string) => {
    const rows = db().prepare(`
      SELECT CAST(strftime('%m', release_date) AS INTEGER) AS month, COUNT(*) AS count
      FROM works WHERE release_date IS NOT NULL AND release_date != ''
      AND strftime('%Y', release_date) = ?
      GROUP BY month ORDER BY month
    `).all(year) as Array<{ month: number; count: number }>
    return Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      count: rows.find(r => r.month === i + 1)?.count ?? 0
    }))
  })

  ipcMain.handle('dashboard:release-works', (_e, year: string, month: number) => {
    const works = db().prepare(`
      SELECT * FROM works
      WHERE release_date IS NOT NULL AND release_date != ''
      AND strftime('%Y', release_date) = ?
      AND CAST(strftime('%m', release_date) AS INTEGER) = ?
      ORDER BY release_date DESC, rating DESC
    `).all(year, month) as Array<Record<string, unknown>>
    if (works.length === 0) return []
    const ids = works.map(w => w.id as number)
    const ph = ids.map(() => '?').join(',')
    const repRows = db().prepare(`
      SELECT wt.work_id, t.id, t.name, COALESCE(c.sort_order, 999999) AS category_sort_order FROM work_tags wt
      JOIN work_tags_master t ON t.id = wt.tag_id
      LEFT JOIN work_tag_categories c ON c.id = t.category_id
      WHERE wt.is_rep = 1 AND wt.work_id IN (${ph})
      ORDER BY COALESCE(c.sort_order, 999999), t.name
    `).all(...ids) as Array<{ work_id: number; id: number; name: string; category_sort_order: number }>
    const repMap = new Map<number, Array<{ id: number; name: string; category_sort_order: number }>>()
    for (const r of repRows) {
      if (!repMap.has(r.work_id)) repMap.set(r.work_id, [])
      repMap.get(r.work_id)!.push({ id: r.id, name: r.name })
    }
    const repActorRows3 = db().prepare(`
      SELECT wa.work_id, a.id, a.name FROM work_actors wa
      JOIN actors a ON a.id = wa.actor_id
      WHERE wa.is_rep = 1 AND wa.work_id IN (${ph})
    `).all(...ids) as Array<{ work_id: number; id: number; name: string }>
    const repActorMap3 = new Map<number, Array<{ id: number; name: string }>>()
    for (const r of repActorRows3) {
      if (!repActorMap3.has(r.work_id)) repActorMap3.set(r.work_id, [])
      repActorMap3.get(r.work_id)!.push({ id: r.id, name: r.name })
    }
    return works.map(w => ({ ...w, rep_tags: repMap.get(w.id as number) ?? [], rep_actors: repActorMap3.get(w.id as number) ?? [] }))
  })

  ipcMain.handle('dashboard:rating-dist', () => {
    const rows = db().prepare(`
      SELECT ROUND(rating * 2) / 2.0 AS bucket, COUNT(*) AS count
      FROM works GROUP BY bucket ORDER BY bucket
    `).all() as Array<{ bucket: number; count: number }>
    const map = new Map(rows.map(r => [r.bucket, r.count]))
    const buckets: number[] = []
    for (let i = 0.5; i <= 5; i += 0.5) buckets.push(i)
    return buckets.map(b => ({ bucket: b, count: map.get(b) ?? 0 }))
  })

  ipcMain.handle('dashboard:new-actors', () => {
    return db().prepare(`
      SELECT a.*,
        COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 10.0, 0) AS avg_score,
        (SELECT COUNT(*) FROM work_actors wa WHERE wa.actor_id = a.id) AS work_count
      FROM actors a LEFT JOIN actor_scores s ON s.actor_id = a.id
      WHERE a.debut_date IS NOT NULL AND a.debut_date != ''
        AND a.debut_date >= date('now', '-3 years')
      ORDER BY a.debut_date DESC, avg_score DESC
    `).all()
  })

  ipcMain.handle('dashboard:age-dist', () => {
    return db().prepare(`
      SELECT a.*,
        CAST((julianday('now') - julianday(a.birthday)) / 365.25 AS INTEGER) AS age,
        COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 10.0, 0) AS avg_score
      FROM actors a LEFT JOIN actor_scores s ON s.actor_id = a.id
      WHERE a.birthday IS NOT NULL AND a.birthday != ''
      ORDER BY age ASC, avg_score DESC
    `).all()
  })

  ipcMain.handle('dashboard:actor-score-ranking', (_e, limit?: number, reverse?: boolean) => {
    const lim = limit ? `LIMIT ${limit}` : ''
    const d = reverse ? 'ASC' : 'DESC'
    return db().prepare(`
      SELECT a.*, COUNT(wa.work_id) AS work_count,
        COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 10.0, 0) AS avg_score,
        COUNT(*) OVER () AS total_count
      FROM actors a
      LEFT JOIN work_actors wa ON wa.actor_id = a.id
      LEFT JOIN actor_scores s ON s.actor_id = a.id
      GROUP BY a.id ORDER BY avg_score ${d}, work_count ${d} ${lim}
    `).all()
  })

  ipcMain.handle('dashboard:actor-workcount-ranking', (_e, limit?: number, reverse?: boolean) => {
    const lim = limit ? `LIMIT ${limit}` : ''
    const d = reverse ? 'ASC' : 'DESC'
    return db().prepare(`
      SELECT a.*, COUNT(wa.work_id) AS work_count,
        COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 10.0, 0) AS avg_score,
        COUNT(*) OVER () AS total_count
      FROM actors a
      LEFT JOIN work_actors wa ON wa.actor_id = a.id
      LEFT JOIN actor_scores s ON s.actor_id = a.id
      GROUP BY a.id ORDER BY work_count ${d}, avg_score ${d} ${lim}
    `).all()
  })

  ipcMain.handle('dashboard:actor-bust-ranking', (_e, limit?: number, reverse?: boolean) => {
    const lim = limit ? `LIMIT ${limit}` : ''
    const d = reverse ? 'ASC' : 'DESC'
    return db().prepare(`
      SELECT a.*, COUNT(wa.work_id) AS work_count,
        COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 10.0, 0) AS avg_score,
        COUNT(*) OVER () AS total_count
      FROM actors a
      LEFT JOIN work_actors wa ON wa.actor_id = a.id
      LEFT JOIN actor_scores s ON s.actor_id = a.id
      WHERE a.bust IS NOT NULL
      GROUP BY a.id ORDER BY a.bust ${d}, avg_score ${d}, work_count ${d} ${lim}
    `).all()
  })

  ipcMain.handle('dashboard:actor-hip-ranking', (_e, limit?: number, reverse?: boolean) => {
    const lim = limit ? `LIMIT ${limit}` : ''
    const d = reverse ? 'ASC' : 'DESC'
    return db().prepare(`
      SELECT a.*, COUNT(wa.work_id) AS work_count,
        COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 10.0, 0) AS avg_score,
        COUNT(*) OVER () AS total_count
      FROM actors a
      LEFT JOIN work_actors wa ON wa.actor_id = a.id
      LEFT JOIN actor_scores s ON s.actor_id = a.id
      WHERE a.hip IS NOT NULL
      GROUP BY a.id ORDER BY a.hip ${d}, avg_score ${d}, work_count ${d} ${lim}
    `).all()
  })

  ipcMain.handle('dashboard:actor-waist-ranking', (_e, limit?: number, reverse?: boolean) => {
    const lim = limit ? `LIMIT ${limit}` : ''
    const primary = reverse ? 'DESC' : 'ASC'
    const secondary = reverse ? 'ASC' : 'DESC'
    return db().prepare(`
      SELECT a.*, COUNT(wa.work_id) AS work_count,
        COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 10.0, 0) AS avg_score,
        COUNT(*) OVER () AS total_count
      FROM actors a
      LEFT JOIN work_actors wa ON wa.actor_id = a.id
      LEFT JOIN actor_scores s ON s.actor_id = a.id
      WHERE a.waist IS NOT NULL
      GROUP BY a.id ORDER BY a.waist ${primary}, avg_score ${secondary}, work_count ${secondary} ${lim}
    `).all()
  })

  ipcMain.handle('dashboard:actor-height-ranking', (_e, limit?: number, reverse?: boolean) => {
    const lim = limit ? `LIMIT ${limit}` : ''
    const d = reverse ? 'ASC' : 'DESC'
    return db().prepare(`
      SELECT a.*, COUNT(wa.work_id) AS work_count,
        COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 10.0, 0) AS avg_score,
        COUNT(*) OVER () AS total_count
      FROM actors a
      LEFT JOIN work_actors wa ON wa.actor_id = a.id
      LEFT JOIN actor_scores s ON s.actor_id = a.id
      WHERE a.height IS NOT NULL
      GROUP BY a.id ORDER BY a.height ${d}, avg_score ${d}, work_count ${d} ${lim}
    `).all()
  })

  ipcMain.handle('dashboard:actor-ratio-ranking', (_e, limit?: number, reverse?: boolean) => {
    const lim = limit ? `LIMIT ${limit}` : ''
    const d = reverse ? 'ASC' : 'DESC'
    return db().prepare(`
      WITH stats AS (
        SELECT
          MIN(height) AS min_h, MAX(height) AS max_h,
          MIN(bust)   AS min_b, MAX(bust)   AS max_b,
          MIN(waist)  AS min_w, MAX(waist)  AS max_w,
          MIN(hip)    AS min_hip, MAX(hip)  AS max_hip
        FROM actors
        WHERE height IS NOT NULL AND bust IS NOT NULL AND waist IS NOT NULL AND hip IS NOT NULL
      )
      SELECT a.*, COUNT(wa.work_id) AS work_count,
        COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 10.0, 0) AS avg_score,
        ROUND((
          (
            COALESCE(CAST(a.height - stats.min_h AS REAL) / NULLIF(stats.max_h - stats.min_h, 0) * 10, 5.0) +
            COALESCE(CAST(a.bust   - stats.min_b AS REAL) / NULLIF(stats.max_b - stats.min_b, 0) * 10, 5.0) +
            COALESCE(CAST(stats.max_w - a.waist  AS REAL) / NULLIF(stats.max_w - stats.min_w, 0) * 10, 5.0) +
            COALESCE(CAST(a.hip - stats.min_hip  AS REAL) / NULLIF(stats.max_hip - stats.min_hip, 0) * 10, 5.0)
          ) / 4.0 * 0.3 +
          (COALESCE(s.bust, 0) + COALESCE(s.hip, 0) + COALESCE(s.physical, 0) + COALESCE(s.skin, 0) + COALESCE(s.proportions, 0)) / 5.0 * 0.7
        ), 2) AS ratio_score,
        COUNT(*) OVER () AS total_count
      FROM actors a, stats
      LEFT JOIN work_actors wa ON wa.actor_id = a.id
      LEFT JOIN actor_scores s ON s.actor_id = a.id
      WHERE a.height IS NOT NULL AND a.bust IS NOT NULL AND a.waist IS NOT NULL AND a.hip IS NOT NULL
      GROUP BY a.id ORDER BY ratio_score ${d}, avg_score ${d}, work_count ${d} ${lim}
    `).all()
  })

  ipcMain.handle('dashboard:actor-favorite-ranking', (_e, limit?: number, reverse?: boolean) => {
    const lim = limit ? `LIMIT ${limit}` : ''
    const d = reverse ? 'ASC' : 'DESC'
    return db().prepare(`
      SELECT a.*, COUNT(wa.work_id) AS fav_work_count,
        COALESCE((SELECT COUNT(*) FROM work_actors wa2 WHERE wa2.actor_id = a.id), 0) AS work_count,
        COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 10.0, 0) AS avg_score,
        COUNT(*) OVER () AS total_count
      FROM actors a
      JOIN work_actors wa ON wa.actor_id = a.id
      JOIN works w ON w.id = wa.work_id AND w.is_favorite = 1
      LEFT JOIN actor_scores s ON s.actor_id = a.id
      GROUP BY a.id ORDER BY fav_work_count ${d}, avg_score ${d}, work_count ${d} ${lim}
    `).all()
  })

  ipcMain.handle('dashboard:work-tag-dist', () => {
    return db().prepare(`
      SELECT t.id, t.name, COUNT(wt.work_id) AS count
      FROM work_tags_master t
      JOIN work_tags wt ON wt.tag_id = t.id
      GROUP BY t.id ORDER BY count DESC
    `).all()
  })

  ipcMain.handle('dashboard:actor-tag-dist', () => {
    return db().prepare(`
      SELECT t.id, t.name, COUNT(at2.actor_id) AS count
      FROM actor_tags_master t
      JOIN actor_tags at2 ON at2.tag_id = t.id
      GROUP BY t.id ORDER BY count DESC
    `).all()
  })

  ipcMain.handle('dashboard:actor-score-dist', () => {
    return db().prepare(`
      SELECT a.*,
        COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 10.0, 0) AS avg_score,
        (SELECT COUNT(*) FROM work_actors wa WHERE wa.actor_id = a.id) AS work_count
      FROM actors a
      LEFT JOIN actor_scores s ON s.actor_id = a.id
      ORDER BY avg_score DESC, work_count DESC
    `).all()
  })

  ipcMain.handle('dashboard:rating-works', (_e, bucket: number) => {
    const works = db().prepare(`
      SELECT * FROM works
      WHERE ROUND(rating * 2) / 2.0 = ?
      ORDER BY release_date DESC, created_at DESC
    `).all(bucket) as Array<Record<string, unknown>>
    if (works.length === 0) return []
    const ids = works.map(w => w.id as number)
    const ph = ids.map(() => '?').join(',')
    const repRows = db().prepare(`
      SELECT wt.work_id, t.id, t.name FROM work_tags wt
      JOIN work_tags_master t ON t.id = wt.tag_id
      WHERE wt.is_rep = 1 AND wt.work_id IN (${ph})
    `).all(...ids) as Array<{ work_id: number; id: number; name: string }>
    const repMap = new Map<number, Array<{ id: number; name: string }>>()
    for (const r of repRows) {
      if (!repMap.has(r.work_id)) repMap.set(r.work_id, [])
      repMap.get(r.work_id)!.push({ id: r.id, name: r.name })
    }
    const repActorRows4 = db().prepare(`
      SELECT wa.work_id, a.id, a.name FROM work_actors wa
      JOIN actors a ON a.id = wa.actor_id
      WHERE wa.is_rep = 1 AND wa.work_id IN (${ph})
    `).all(...ids) as Array<{ work_id: number; id: number; name: string }>
    const repActorMap4 = new Map<number, Array<{ id: number; name: string }>>()
    for (const r of repActorRows4) {
      if (!repActorMap4.has(r.work_id)) repActorMap4.set(r.work_id, [])
      repActorMap4.get(r.work_id)!.push({ id: r.id, name: r.name })
    }
    return works.map(w => ({ ...w, rep_tags: repMap.get(w.id as number) ?? [], rep_actors: repActorMap4.get(w.id as number) ?? [] }))
  })

  ipcMain.handle('dashboard:studio-dist', () => {
    return db().prepare(`
      SELECT s.id, s.name, s.color, COUNT(w.id) AS work_count
      FROM studios s
      LEFT JOIN works w ON w.studio_id = s.id
      GROUP BY s.id
      ORDER BY work_count DESC, s.name
    `).all()
  })

  ipcMain.handle('dashboard:actor-cup-dist', () => {
    return db().prepare(`
      WITH stats AS (
        SELECT
          MIN(height) AS min_h, MAX(height) AS max_h,
          MIN(bust)   AS min_b, MAX(bust)   AS max_b,
          MIN(waist)  AS min_w, MAX(waist)  AS max_w,
          MIN(hip)    AS min_hip, MAX(hip)  AS max_hip
        FROM actors
        WHERE height IS NOT NULL AND bust IS NOT NULL AND waist IS NOT NULL AND hip IS NOT NULL
      )
      SELECT a.*,
        COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 10.0, 0) AS avg_score,
        (SELECT COUNT(*) FROM work_actors wa WHERE wa.actor_id = a.id) AS work_count,
        CASE WHEN a.height IS NOT NULL AND a.bust IS NOT NULL AND a.waist IS NOT NULL AND a.hip IS NOT NULL
          THEN ROUND((
            (
              COALESCE(CAST(a.height - stats.min_h AS REAL) / NULLIF(stats.max_h - stats.min_h, 0) * 10, 5.0) +
              COALESCE(CAST(a.bust   - stats.min_b AS REAL) / NULLIF(stats.max_b - stats.min_b, 0) * 10, 5.0) +
              COALESCE(CAST(stats.max_w - a.waist  AS REAL) / NULLIF(stats.max_w - stats.min_w, 0) * 10, 5.0) +
              COALESCE(CAST(a.hip - stats.min_hip  AS REAL) / NULLIF(stats.max_hip - stats.min_hip, 0) * 10, 5.0)
            ) / 4.0 * 0.3 +
            (COALESCE(s.bust, 0) + COALESCE(s.hip, 0) + COALESCE(s.physical, 0) + COALESCE(s.skin, 0) + COALESCE(s.proportions, 0)) / 5.0 * 0.7
          ), 2)
          ELSE NULL
        END AS ratio_score
      FROM actors a
      CROSS JOIN stats
      LEFT JOIN actor_scores s ON s.actor_id = a.id
      WHERE a.cup IS NOT NULL AND a.cup != ''
      ORDER BY a.cup, avg_score DESC, work_count DESC
    `).all()
  })

  ipcMain.handle('actors:physical-data', () => {
    return db().prepare(`
      SELECT
        a.id, a.name, a.photo_path,
        a.height, a.bust, a.waist, a.hip, a.cup,
        COALESCE(s.face, 0)        AS face,
        COALESCE(s.bust, 0)        AS score_bust,
        COALESCE(s.hip, 0)         AS score_hip,
        COALESCE(s.physical, 0)    AS physical,
        COALESCE(s.skin, 0)        AS skin,
        COALESCE(s.acting, 0)      AS acting,
        COALESCE(s.sexy, 0)        AS sexy,
        COALESCE(s.charm, 0)       AS charm,
        COALESCE(s.technique, 0)   AS technique,
        COALESCE(s.proportions, 0) AS proportions,
        (SELECT COUNT(*) FROM work_actors wa WHERE wa.actor_id = a.id) AS work_count
      FROM actors a
      LEFT JOIN actor_scores s ON s.actor_id = a.id
    `).all()
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
