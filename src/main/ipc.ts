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
    sortBy?: 'product_number' | 'rating' | 'release_date' | 'created_at' | 'title'
    sortDir?: 'asc' | 'desc'
    favoriteOnly?: boolean
    titleSearch?: string
    titleNull?: boolean
    commentSearch?: string
    commentNull?: boolean
    releaseDateNull?: boolean
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
    sortBy?: 'name' | 'avg_score' | 'birthday' | 'work_count' | 'created_at' | 'debut_date' | 'ratio_score' | 'work_release_date' | 'work_created_at'
    sortDir?: 'asc' | 'desc'
    favoriteOnly?: boolean
    debutDateFrom?: string
    debutDateTo?: string
    workCountFrom?: number
    workCountTo?: number
    faceFrom?: number; faceTo?: number
    bustScoreFrom?: number; bustScoreTo?: number
    hipScoreFrom?: number; hipScoreTo?: number
    physicalScoreFrom?: number; physicalScoreTo?: number
    skinFrom?: number; skinTo?: number
    actingFrom?: number; actingTo?: number
    sexyFrom?: number; sexyTo?: number
    charmFrom?: number; charmTo?: number
    techniqueFrom?: number; techniqueTo?: number
    proportionsFrom?: number; proportionsTo?: number
    ratioScoreFrom?: number; ratioScoreTo?: number
    heightFrom?: number; heightTo?: number
    bustFrom?: number; bustTo?: number
    waistFrom?: number; waistTo?: number
    hipFrom?: number; hipTo?: number
    cupFrom?: string; cupTo?: string
    ageNull?: boolean
    debutDateNull?: boolean
    workCountNull?: boolean
    heightNull?: boolean
    bustNull?: boolean
    waistNull?: boolean
    hipNull?: boolean
    cupNull?: boolean
    scoreExcluded?: boolean
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
        COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 13.0, 0) AS avg_score,
        CASE WHEN a.height IS NOT NULL AND a.bust IS NOT NULL AND a.waist IS NOT NULL AND a.hip IS NOT NULL
          THEN ROUND((
            (
              COALESCE(CAST(a.height - stats.min_h AS REAL) / NULLIF(stats.max_h - stats.min_h, 0) * 10, 5.0) +
              COALESCE(CAST(a.bust   - stats.min_b AS REAL) / NULLIF(stats.max_b - stats.min_b, 0) * 10, 5.0) +
              COALESCE(CAST(stats.max_w - a.waist  AS REAL) / NULLIF(stats.max_w - stats.min_w, 0) * 10, 5.0) +
              COALESCE(CAST(a.hip - stats.min_hip  AS REAL) / NULLIF(stats.max_hip - stats.min_hip, 0) * 10, 5.0)
            ) / 4.0 * 0.3 +
            (COALESCE(s.bust, 0) + COALESCE(s.hip, 0) + COALESCE(s.physical, 0) + COALESCE(s.skin, 0) + COALESCE(s.proportions, 0)) / 6.5 * 0.7
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
      if (params.tagIds[0] === -1) {
        conditions.push('NOT EXISTS (SELECT 1 FROM actor_tags WHERE actor_id = a.id)')
      } else {
        const placeholders = params.tagIds.map(() => '?').join(',')
        sql += ` JOIN actor_tags at2 ON at2.actor_id = a.id`
        conditions.push(`at2.tag_id IN (${placeholders})`)
        bindings.push(...params.tagIds)
        if (params.tagMode === 'and') {
          conditions.push(`(SELECT COUNT(DISTINCT at3.tag_id) FROM actor_tags at3 WHERE at3.actor_id = a.id AND at3.tag_id IN (${placeholders})) = ?`)
          bindings.push(...params.tagIds, params.tagIds.length)
        }
      }
    }

    if (params?.keyword) {
      conditions.push('a.name LIKE ?')
      bindings.push(`%${params.keyword}%`)
    }
    if (params?.ageFrom !== undefined) {
      conditions.push("(julianday('now') - julianday(a.birthday)) / 365.25 >= ?")
      bindings.push(params.ageFrom)
    }
    if (params?.ageTo !== undefined) {
      conditions.push("(julianday('now') - julianday(a.birthday)) / 365.25 <= ?")
      bindings.push(params.ageTo)
    }
    if (params?.ratingFrom !== undefined) {
      conditions.push('COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 13.0, 0) >= ?')
      bindings.push(params.ratingFrom)
    }
    if (params?.ratingTo !== undefined) {
      conditions.push('COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 13.0, 0) <= ?')
      bindings.push(params.ratingTo)
    }
    if (params?.favoriteOnly) {
      conditions.push('a.is_favorite = 1')
    }
    if (params?.debutDateFrom) { conditions.push('a.debut_date >= ?'); bindings.push(params.debutDateFrom) }
    if (params?.debutDateTo) { conditions.push('a.debut_date <= ?'); bindings.push(params.debutDateTo) }
    if (params?.workCountFrom !== undefined) {
      conditions.push('(SELECT COUNT(*) FROM work_actors wa2 WHERE wa2.actor_id = a.id) >= ?'); bindings.push(params.workCountFrom)
    }
    if (params?.workCountTo !== undefined) {
      conditions.push('(SELECT COUNT(*) FROM work_actors wa2 WHERE wa2.actor_id = a.id) <= ?'); bindings.push(params.workCountTo)
    }
    const scoreFields: [keyof typeof params, string][] = [
      ['faceFrom', 'face'], ['faceTo', 'face'],
      ['bustScoreFrom', 'bust'], ['bustScoreTo', 'bust'],
      ['hipScoreFrom', 'hip'], ['hipScoreTo', 'hip'],
      ['physicalScoreFrom', 'physical'], ['physicalScoreTo', 'physical'],
      ['skinFrom', 'skin'], ['skinTo', 'skin'],
      ['actingFrom', 'acting'], ['actingTo', 'acting'],
      ['sexyFrom', 'sexy'], ['sexyTo', 'sexy'],
      ['charmFrom', 'charm'], ['charmTo', 'charm'],
      ['techniqueFrom', 'technique'], ['techniqueTo', 'technique'],
      ['proportionsFrom', 'proportions'], ['proportionsTo', 'proportions'],
    ]
    for (const [key, col] of scoreFields) {
      const val = params?.[key] as number | undefined
      if (val !== undefined) {
        const op = (key as string).endsWith('From') ? '>=' : '<='
        conditions.push(`COALESCE(s.${col}, 0) ${op} ?`); bindings.push(val)
      }
    }
    // ratio_score 필터는 클라이언트 사이드에서 처리
    if (params?.heightFrom !== undefined) { conditions.push('a.height >= ?'); bindings.push(params.heightFrom) }
    if (params?.heightTo !== undefined) { conditions.push('a.height <= ?'); bindings.push(params.heightTo) }
    if (params?.bustFrom !== undefined) { conditions.push('a.bust >= ?'); bindings.push(params.bustFrom) }
    if (params?.bustTo !== undefined) { conditions.push('a.bust <= ?'); bindings.push(params.bustTo) }
    if (params?.waistFrom !== undefined) { conditions.push('a.waist >= ?'); bindings.push(params.waistFrom) }
    if (params?.waistTo !== undefined) { conditions.push('a.waist <= ?'); bindings.push(params.waistTo) }
    if (params?.hipFrom !== undefined) { conditions.push('a.hip >= ?'); bindings.push(params.hipFrom) }
    if (params?.hipTo !== undefined) { conditions.push('a.hip <= ?'); bindings.push(params.hipTo) }
    if (params?.cupFrom) { conditions.push('a.cup >= ?'); bindings.push(params.cupFrom) }
    if (params?.cupTo) { conditions.push('a.cup <= ?'); bindings.push(params.cupTo) }
    if (params?.ageNull) { conditions.push("(a.birthday IS NULL OR TRIM(a.birthday) = '')") }
    if (params?.debutDateNull) { conditions.push("(a.debut_date IS NULL OR TRIM(a.debut_date) = '')") }
    if (params?.workCountNull) { conditions.push('(SELECT COUNT(*) FROM work_actors wa2 WHERE wa2.actor_id = a.id) = 0') }
    if (params?.heightNull) { conditions.push('a.height IS NULL') }
    if (params?.bustNull) { conditions.push('a.bust IS NULL') }
    if (params?.waistNull) { conditions.push('a.waist IS NULL') }
    if (params?.hipNull) { conditions.push('a.hip IS NULL') }
    if (params?.cupNull) { conditions.push("(a.cup IS NULL OR TRIM(a.cup) = '')") }
    if (params?.scoreExcluded) { conditions.push('COALESCE(a.score_excluded, 0) = 0') }

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
    } else if (params?.sortBy === 'work_release_date') {
      sql += ` ORDER BY (SELECT MAX(w.release_date) FROM works w JOIN work_actors wa ON wa.work_id = w.id WHERE wa.actor_id = a.id) IS NULL ASC, (SELECT MAX(w.release_date) FROM works w JOIN work_actors wa ON wa.work_id = w.id WHERE wa.actor_id = a.id) ${sortDir}`
    } else if (params?.sortBy === 'work_created_at') {
      sql += ` ORDER BY (SELECT MAX(w.created_at) FROM works w JOIN work_actors wa ON wa.work_id = w.id WHERE wa.actor_id = a.id) IS NULL ASC, (SELECT MAX(w.created_at) FROM works w JOIN work_actors wa ON wa.work_id = w.id WHERE wa.actor_id = a.id) ${sortDir}`
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
        (SELECT COUNT(*) FROM work_actors wa WHERE wa.actor_id = a.id) AS work_count,
        COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 13.0, 0) AS avg_score,
        CASE WHEN a.height IS NOT NULL AND a.bust IS NOT NULL AND a.waist IS NOT NULL AND a.hip IS NOT NULL
          THEN ROUND((
            (
              COALESCE(CAST(a.height - stats.min_h AS REAL) / NULLIF(stats.max_h - stats.min_h, 0) * 10, 5.0) +
              COALESCE(CAST(a.bust   - stats.min_b AS REAL) / NULLIF(stats.max_b - stats.min_b, 0) * 10, 5.0) +
              COALESCE(CAST(stats.max_w - a.waist  AS REAL) / NULLIF(stats.max_w - stats.min_w, 0) * 10, 5.0) +
              COALESCE(CAST(a.hip - stats.min_hip  AS REAL) / NULLIF(stats.max_hip - stats.min_hip, 0) * 10, 5.0)
            ) / 4.0 * 0.3 +
            (COALESCE(s.bust, 0) + COALESCE(s.hip, 0) + COALESCE(s.physical, 0) + COALESCE(s.skin, 0) + COALESCE(s.proportions, 0)) / 6.5 * 0.7
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
    phys_arbitrary?: string | null
    comment?: string | null
    score_excluded?: number
    scores?: { face: number; bust: number; hip: number; physical: number; skin: number; acting: number; sexy: number; charm: number; technique: number; proportions: number }
    tag_ids?: number[]
    rep_tag_ids?: number[]
  }) => {
    const result = db().prepare(`
      INSERT INTO actors (name, photo_path, birthday, debut_date, height, bust, waist, hip, cup, phys_arbitrary, comment, score_excluded)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(data.name, data.photo_path || null, data.birthday || null, data.debut_date || null,
      data.height ?? null, data.bust ?? null, data.waist ?? null, data.hip ?? null, data.cup || null, data.phys_arbitrary || null, data.comment || null, data.score_excluded ?? 0)
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

  ipcMain.handle('actors:findOrCreate', (_e, name: string, birthday?: string) => {
    const existing = db().prepare('SELECT id FROM actors WHERE name = ?').get(name) as { id: number } | undefined
    if (existing) return existing.id
    const result = db().prepare('INSERT INTO actors (name, birthday) VALUES (?, ?)').run(name, birthday || null)
    const actorId = result.lastInsertRowid
    db().prepare(`
      INSERT OR REPLACE INTO actor_scores (actor_id, face, bust, hip, physical, skin, acting, sexy, charm, technique, proportions)
      VALUES (?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
    `).run(actorId)
    return actorId
  })

  ipcMain.handle('actors:update', (_e, id: number, data: {
    name?: string
    photo_path?: string
    birthday?: string
    debut_date?: string | null
    is_favorite?: number
    score_excluded?: number
    height?: number | null
    bust?: number | null
    waist?: number | null
    hip?: number | null
    cup?: string | null
    phys_arbitrary?: string | null
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
    if (data.score_excluded !== undefined) { fields.push('score_excluded = ?'); values.push(data.score_excluded) }
    if (data.height !== undefined) { fields.push('height = ?'); values.push(data.height) }
    if (data.bust !== undefined) { fields.push('bust = ?'); values.push(data.bust) }
    if (data.waist !== undefined) { fields.push('waist = ?'); values.push(data.waist) }
    if (data.hip !== undefined) { fields.push('hip = ?'); values.push(data.hip) }
    if (data.cup !== undefined) { fields.push('cup = ?'); values.push(data.cup) }
    if (data.phys_arbitrary !== undefined) { fields.push('phys_arbitrary = ?'); values.push(data.phys_arbitrary) }
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

  ipcMain.handle('actors:workTags', (_e, actorId: number) => {
    return db().prepare(`
      SELECT
        c.id   AS category_id,
        c.name AS category_name,
        c.sort_order AS category_sort_order,
        m.id   AS tag_id,
        m.name AS tag_name,
        COUNT(*) AS count
      FROM work_actors wa
      JOIN work_tags wt ON wt.work_id = wa.work_id
      JOIN work_tags_master m ON m.id = wt.tag_id
      LEFT JOIN work_tag_categories c ON c.id = m.category_id
      WHERE wa.actor_id = ?
      GROUP BY m.id
      ORDER BY COALESCE(c.sort_order, 999999) ASC, count DESC
    `).all(actorId)
  })

  ipcMain.handle('actors:scoreGradeCounts', (_e, excludeId?: number) => {
    const rows = db().prepare(`
      SELECT a.name, s.face, s.bust, s.hip, s.physical, s.skin, s.acting, s.sexy, s.charm, s.technique, s.proportions
      FROM actor_scores s
      JOIN actors a ON a.id = s.actor_id
      WHERE (s.face >= 11 OR s.bust >= 11 OR s.hip >= 11 OR s.physical >= 11 OR s.skin >= 11
             OR s.acting >= 11 OR s.sexy >= 11 OR s.charm >= 11 OR s.technique >= 11 OR s.proportions >= 11)
        AND (${excludeId != null ? 's.actor_id != ?' : '1=1'})
    `).all(...(excludeId != null ? [excludeId] : [])) as Array<Record<string, number | string>>

    const SCORE_KEYS = ['face', 'bust', 'hip', 'physical', 'skin', 'acting', 'sexy', 'charm', 'technique', 'proportions']
    const result: Record<string, Record<number, { count: number; names: string }>> = {}
    for (const key of SCORE_KEYS) {
      result[key] = { 11: { count: 0, names: '' }, 12: { count: 0, names: '' }, 13: { count: 0, names: '' } }
    }
    for (const row of rows) {
      for (const key of SCORE_KEYS) {
        const score = row[key] as number
        if (score >= 11 && score <= 13) {
          result[key][score].count++
          result[key][score].names = result[key][score].names ? `${result[key][score].names}, ${row.name}` : row.name as string
        }
      }
    }
    return result
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

  // ========== 제작사 CRUD ==========

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
      SELECT w.*, s.name AS studio_name, s.color AS studio_color, m.name AS studio_maker_name, m.color AS studio_maker_color
      FROM works w
      LEFT JOIN studios s ON s.id = w.studio_id
      LEFT JOIN makers m ON m.id = s.maker_id
      WHERE w.release_date IS NOT NULL AND w.release_date != ''
      AND strftime('%Y', w.release_date) = ?
      AND CAST(strftime('%m', w.release_date) AS INTEGER) = ?
      ORDER BY w.release_date DESC, w.rating DESC
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
        COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 13.0, 0) AS avg_score,
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
        COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 13.0, 0) AS avg_score
      FROM actors a LEFT JOIN actor_scores s ON s.actor_id = a.id
      WHERE a.birthday IS NOT NULL AND a.birthday != ''
      ORDER BY a.birthday DESC, a.debut_date DESC
    `).all()
  })

  ipcMain.handle('dashboard:debut-age-dist', () => {
    return db().prepare(`
      SELECT a.*,
        CAST((julianday(a.debut_date) - julianday(a.birthday)) / 365.25 AS INTEGER) AS debut_age,
        COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 13.0, 0) AS avg_score
      FROM actors a LEFT JOIN actor_scores s ON s.actor_id = a.id
      WHERE a.birthday IS NOT NULL AND a.birthday != ''
        AND a.debut_date IS NOT NULL AND a.debut_date != ''
      ORDER BY debut_age ASC
    `).all()
  })

  ipcMain.handle('dashboard:debut-years', () => {
    return db().prepare(`
      SELECT strftime('%Y', debut_date) AS year, COUNT(*) AS count
      FROM actors WHERE debut_date IS NOT NULL AND debut_date != ''
      GROUP BY year ORDER BY year DESC
    `).all()
  })

  ipcMain.handle('dashboard:debut-months', (_e, year: string) => {
    const rows = db().prepare(`
      SELECT CAST(strftime('%m', debut_date) AS INTEGER) AS month, COUNT(*) AS count
      FROM actors WHERE debut_date IS NOT NULL AND debut_date != ''
      AND strftime('%Y', debut_date) = ?
      GROUP BY month ORDER BY month
    `).all(year) as Array<{ month: number; count: number }>
    return Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      count: rows.find(r => r.month === i + 1)?.count ?? 0
    }))
  })

  ipcMain.handle('dashboard:debut-month-actors', (_e, year: string, month: number) => {
    const rawActors = db().prepare(`
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
        (SELECT COUNT(*) FROM work_actors wa WHERE wa.actor_id = a.id) AS work_count,
        COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 13.0, 0) AS avg_score,
        CASE WHEN a.height IS NOT NULL AND a.bust IS NOT NULL AND a.waist IS NOT NULL AND a.hip IS NOT NULL
          THEN ROUND((
            (
              COALESCE(CAST(a.height - stats.min_h AS REAL) / NULLIF(stats.max_h - stats.min_h, 0) * 10, 5.0) +
              COALESCE(CAST(a.bust   - stats.min_b AS REAL) / NULLIF(stats.max_b - stats.min_b, 0) * 10, 5.0) +
              COALESCE(CAST(stats.max_w - a.waist  AS REAL) / NULLIF(stats.max_w - stats.min_w, 0) * 10, 5.0) +
              COALESCE(CAST(a.hip - stats.min_hip  AS REAL) / NULLIF(stats.max_hip - stats.min_hip, 0) * 10, 5.0)
            ) / 4.0 * 0.3 +
            (COALESCE(s.bust, 0) + COALESCE(s.hip, 0) + COALESCE(s.physical, 0) + COALESCE(s.skin, 0) + COALESCE(s.proportions, 0)) / 6.5 * 0.7
          ), 2)
          ELSE NULL
        END AS ratio_score
      FROM actors a
      CROSS JOIN stats
      LEFT JOIN actor_scores s ON s.actor_id = a.id
      WHERE a.debut_date IS NOT NULL AND a.debut_date != ''
        AND strftime('%Y', a.debut_date) = ?
        AND CAST(strftime('%m', a.debut_date) AS INTEGER) = ?
      ORDER BY a.debut_date ASC, avg_score DESC
    `).all(year, month) as Array<Record<string, unknown>>
    if (rawActors.length === 0) return []
    const actorIds = rawActors.map(a => a.id as number)
    const aph = actorIds.map(() => '?').join(',')
    const aRepRows = db().prepare(`
      SELECT at2.actor_id, t.id, t.name
      FROM actor_tags at2
      JOIN actor_tags_master t ON t.id = at2.tag_id
      LEFT JOIN actor_tag_categories c ON c.id = t.category_id
      WHERE at2.is_rep = 1 AND at2.actor_id IN (${aph})
      ORDER BY COALESCE(c.sort_order, 999999), t.name
    `).all(...actorIds) as Array<{ actor_id: number; id: number; name: string }>
    const aRepTagMap = new Map<number, Array<{ id: number; name: string }>>()
    for (const row of aRepRows) {
      if (!aRepTagMap.has(row.actor_id)) aRepTagMap.set(row.actor_id, [])
      aRepTagMap.get(row.actor_id)!.push({ id: row.id, name: row.name })
    }
    return rawActors.map(a => ({ ...a, rep_tags: aRepTagMap.get(a.id as number) ?? [] }))
  })

  ipcMain.handle('dashboard:actor-score-ranking', (_e, limit?: number, reverse?: boolean) => {
    const lim = limit ? `LIMIT ${limit}` : ''
    const d = reverse ? 'ASC' : 'DESC'
    return db().prepare(`
      SELECT a.*, COUNT(wa.work_id) AS work_count,
        COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 13.0, 0) AS avg_score,
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
        COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 13.0, 0) AS avg_score,
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
        COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 13.0, 0) AS avg_score,
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
        COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 13.0, 0) AS avg_score,
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
        COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 13.0, 0) AS avg_score,
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
        COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 13.0, 0) AS avg_score,
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
        COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 13.0, 0) AS avg_score,
        ROUND((
          (
            COALESCE(CAST(a.height - stats.min_h AS REAL) / NULLIF(stats.max_h - stats.min_h, 0) * 10, 5.0) +
            COALESCE(CAST(a.bust   - stats.min_b AS REAL) / NULLIF(stats.max_b - stats.min_b, 0) * 10, 5.0) +
            COALESCE(CAST(stats.max_w - a.waist  AS REAL) / NULLIF(stats.max_w - stats.min_w, 0) * 10, 5.0) +
            COALESCE(CAST(a.hip - stats.min_hip  AS REAL) / NULLIF(stats.max_hip - stats.min_hip, 0) * 10, 5.0)
          ) / 4.0 * 0.3 +
          (COALESCE(s.bust, 0) + COALESCE(s.hip, 0) + COALESCE(s.physical, 0) + COALESCE(s.skin, 0) + COALESCE(s.proportions, 0)) / 6.5 * 0.7
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
        COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 13.0, 0) AS avg_score,
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
    const where = ''
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
        COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 13.0, 0) AS avg_score,
        (SELECT COUNT(*) FROM work_actors wa WHERE wa.actor_id = a.id) AS work_count,
        CASE WHEN a.height IS NOT NULL AND a.bust IS NOT NULL AND a.waist IS NOT NULL AND a.hip IS NOT NULL
          THEN ROUND((
            (
              COALESCE(CAST(a.height - stats.min_h AS REAL) / NULLIF(stats.max_h - stats.min_h, 0) * 10, 5.0) +
              COALESCE(CAST(a.bust   - stats.min_b AS REAL) / NULLIF(stats.max_b - stats.min_b, 0) * 10, 5.0) +
              COALESCE(CAST(stats.max_w - a.waist  AS REAL) / NULLIF(stats.max_w - stats.min_w, 0) * 10, 5.0) +
              COALESCE(CAST(a.hip - stats.min_hip  AS REAL) / NULLIF(stats.max_hip - stats.min_hip, 0) * 10, 5.0)
            ) / 4.0 * 0.3 +
            (COALESCE(s.bust, 0) + COALESCE(s.hip, 0) + COALESCE(s.physical, 0) + COALESCE(s.skin, 0) + COALESCE(s.proportions, 0)) / 6.5 * 0.7
          ), 2)
          ELSE NULL
        END AS ratio_score
      FROM actors a
      LEFT OUTER JOIN stats ON 1=1
      LEFT JOIN actor_scores s ON s.actor_id = a.id
      ${where}
      ORDER BY avg_score ASC, ratio_score ASC
    `).all()
  })

  ipcMain.handle('dashboard:actor-physical-dist', () => {
    return db().prepare(`
      SELECT
        a.id, a.name, a.photo_path, a.score_excluded,
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
        COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 13.0, 0) AS avg_score,
        (SELECT COUNT(*) FROM work_actors wa WHERE wa.actor_id = a.id) AS work_count
      FROM actors a
      LEFT JOIN actor_scores s ON s.actor_id = a.id
      WHERE a.height IS NOT NULL AND a.bust IS NOT NULL AND a.waist IS NOT NULL AND a.hip IS NOT NULL
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
        COALESCE((s.face + s.bust + s.hip + s.physical + s.skin + s.acting + s.sexy + s.charm + s.technique + s.proportions) / 13.0, 0) AS avg_score,
        (SELECT COUNT(*) FROM work_actors wa WHERE wa.actor_id = a.id) AS work_count,
        CASE WHEN a.height IS NOT NULL AND a.bust IS NOT NULL AND a.waist IS NOT NULL AND a.hip IS NOT NULL
          THEN ROUND((
            (
              COALESCE(CAST(a.height - stats.min_h AS REAL) / NULLIF(stats.max_h - stats.min_h, 0) * 10, 5.0) +
              COALESCE(CAST(a.bust   - stats.min_b AS REAL) / NULLIF(stats.max_b - stats.min_b, 0) * 10, 5.0) +
              COALESCE(CAST(stats.max_w - a.waist  AS REAL) / NULLIF(stats.max_w - stats.min_w, 0) * 10, 5.0) +
              COALESCE(CAST(a.hip - stats.min_hip  AS REAL) / NULLIF(stats.max_hip - stats.min_hip, 0) * 10, 5.0)
            ) / 4.0 * 0.3 +
            (COALESCE(s.bust, 0) + COALESCE(s.hip, 0) + COALESCE(s.physical, 0) + COALESCE(s.skin, 0) + COALESCE(s.proportions, 0)) / 6.5 * 0.7
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
        a.height, a.bust, a.waist, a.hip, a.cup, a.phys_arbitrary, a.score_excluded,
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
        (SELECT COUNT(*) FROM work_actors wa WHERE wa.actor_id = a.id) AS work_count,
        (SELECT COUNT(*) FROM work_actors wa2 JOIN works w2 ON w2.id = wa2.work_id AND w2.is_favorite = 1 WHERE wa2.actor_id = a.id) AS fav_work_count
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

  // ========== 월드컵 ==========

  ipcMain.handle('worldcup:categories', () => {
    return db().prepare(`SELECT * FROM worldcup_categories ORDER BY sort_order, id`).all()
  })

  ipcMain.handle('worldcup:get-session', (_e, categoryId: number) => {
    const session = db().prepare(`
      SELECT * FROM worldcup_sessions WHERE category_id = ? AND status = 'in_progress' ORDER BY id DESC LIMIT 1
    `).get(categoryId) as { id: number; category_id: number; round_total: number; status: string; winner_id: number | null } | undefined
    if (!session) return null
    const matches = db().prepare(`SELECT * FROM worldcup_matches WHERE session_id = ? ORDER BY round DESC, match_index`).all(session.id)
    return { session, matches }
  })

  ipcMain.handle('worldcup:start', (_e, params: { categoryId: number; roundTotal: number; exclude?: boolean }) => {
    const { categoryId, roundTotal, exclude } = params
    const category = db().prepare(`SELECT * FROM worldcup_categories WHERE id = ?`).get(categoryId) as { type: string; filter_json?: string | null } | undefined
    if (!category) throw new Error('카테고리를 찾을 수 없습니다')

    // 기존 in_progress 세션 삭제
    const existing = db().prepare(`SELECT id FROM worldcup_sessions WHERE category_id = ? AND status = 'in_progress'`).get(categoryId) as { id: number } | undefined
    if (existing) {
      db().prepare(`DELETE FROM worldcup_sessions WHERE id = ?`).run(existing.id)
    }

    // 후보 항목 조회 (appearance_count 낮은 순 우선)
    let items: { id: number; appearance_count: number }[]
    if (category.type === 'actor') {
      const excludeWhere = exclude ? `AND (a.score_excluded IS NULL OR a.score_excluded = 0)` : ''
      const filter = category.filter_json ? JSON.parse(category.filter_json) as Record<string, unknown> : null
      let extraJoins = ''
      const extraConditions: string[] = []
      const extraBindings: unknown[] = []
      if (filter) {
        const tagIds = filter.tagIds as number[] | undefined
        if (tagIds?.length) {
          const ph = tagIds.map(() => '?').join(',')
          extraJoins += ` JOIN actor_tags at2 ON at2.actor_id = a.id`
          extraConditions.push(`at2.tag_id IN (${ph})`)
          extraBindings.push(...tagIds)
          if (filter.tagMode === 'and') {
            extraConditions.push(`(SELECT COUNT(DISTINCT at3.tag_id) FROM actor_tags at3 WHERE at3.actor_id = a.id AND at3.tag_id IN (${ph})) = ?`)
            extraBindings.push(...tagIds, tagIds.length)
          }
        }
        const actorIds = filter.actorIds as number[] | undefined
        if (actorIds?.length) {
          const ph = actorIds.map(() => '?').join(',')
          extraConditions.push(`a.id IN (${ph})`)
          extraBindings.push(...actorIds)
        }
        if (filter.favoriteOnly) extraConditions.push('a.is_favorite = 1')
        if (filter.ratingFrom !== undefined || filter.ratingTo !== undefined) {
          extraJoins += ` LEFT JOIN actor_scores asc_f ON asc_f.actor_id = a.id`
          if (filter.ratingFrom !== undefined) { extraConditions.push(`COALESCE((asc_f.face + asc_f.bust + asc_f.hip + asc_f.physical + asc_f.skin + asc_f.acting + asc_f.sexy + asc_f.charm + asc_f.technique + asc_f.proportions) / 13.0, 0) >= ?`); extraBindings.push(filter.ratingFrom) }
          if (filter.ratingTo !== undefined) { extraConditions.push(`COALESCE((asc_f.face + asc_f.bust + asc_f.hip + asc_f.physical + asc_f.skin + asc_f.acting + asc_f.sexy + asc_f.charm + asc_f.technique + asc_f.proportions) / 13.0, 0) <= ?`); extraBindings.push(filter.ratingTo) }
        }
        if (filter.workCountFrom !== undefined) { extraConditions.push('(SELECT COUNT(*) FROM work_actors wa2 WHERE wa2.actor_id = a.id) >= ?'); extraBindings.push(filter.workCountFrom) }
        if (filter.workCountTo !== undefined) { extraConditions.push('(SELECT COUNT(*) FROM work_actors wa2 WHERE wa2.actor_id = a.id) <= ?'); extraBindings.push(filter.workCountTo) }
        if (filter.heightFrom !== undefined) { extraConditions.push('a.height >= ?'); extraBindings.push(filter.heightFrom) }
        if (filter.heightTo !== undefined) { extraConditions.push('a.height <= ?'); extraBindings.push(filter.heightTo) }
        if (filter.bustFrom !== undefined) { extraConditions.push('a.bust >= ?'); extraBindings.push(filter.bustFrom) }
        if (filter.bustTo !== undefined) { extraConditions.push('a.bust <= ?'); extraBindings.push(filter.bustTo) }
        if (filter.waistFrom !== undefined) { extraConditions.push('a.waist >= ?'); extraBindings.push(filter.waistFrom) }
        if (filter.waistTo !== undefined) { extraConditions.push('a.waist <= ?'); extraBindings.push(filter.waistTo) }
        if (filter.hipFrom !== undefined) { extraConditions.push('a.hip >= ?'); extraBindings.push(filter.hipFrom) }
        if (filter.hipTo !== undefined) { extraConditions.push('a.hip <= ?'); extraBindings.push(filter.hipTo) }
        if (filter.cupFrom) { extraConditions.push('a.cup >= ?'); extraBindings.push(filter.cupFrom) }
        if (filter.cupTo) { extraConditions.push('a.cup <= ?'); extraBindings.push(filter.cupTo) }
      }
      const filterWhere = extraConditions.length ? ` AND ${extraConditions.join(' AND ')}` : ''
      items = db().prepare(`
        SELECT DISTINCT a.id, COALESCE(ws.appearance_count, 0) AS appearance_count
        FROM actors a
        LEFT JOIN worldcup_stats ws ON ws.item_id = a.id AND ws.category_id = ?
        ${extraJoins}
        WHERE 1=1 ${excludeWhere}${filterWhere}
        ORDER BY appearance_count ASC
      `).all(categoryId, ...extraBindings) as { id: number; appearance_count: number }[]
    } else {
      const filter = category.filter_json ? JSON.parse(category.filter_json) as Record<string, unknown> : null
      let extraJoins = ''
      const extraConditions: string[] = []
      const extraBindings: unknown[] = []
      if (filter) {
        const tagIds = filter.tagIds as number[] | undefined
        if (tagIds?.length) {
          const ph = tagIds.map(() => '?').join(',')
          extraJoins += ` JOIN work_tags wt ON wt.work_id = w.id`
          extraConditions.push(`wt.tag_id IN (${ph})`)
          extraBindings.push(...tagIds)
          if (filter.tagMode === 'and') {
            extraConditions.push(`(SELECT COUNT(DISTINCT wt2.tag_id) FROM work_tags wt2 WHERE wt2.work_id = w.id AND wt2.tag_id IN (${ph})) = ?`)
            extraBindings.push(...tagIds, tagIds.length)
          }
        }
        const workActorIds = filter.actorIds as number[] | undefined
        if (workActorIds?.length) {
          const ph = workActorIds.map(() => '?').join(',')
          extraConditions.push(`EXISTS (SELECT 1 FROM work_actors wa_f WHERE wa_f.work_id = w.id AND wa_f.actor_id IN (${ph}))`)
          extraBindings.push(...workActorIds)
        }
        if (filter.favoriteOnly) extraConditions.push('w.is_favorite = 1')
        if (filter.ratingFrom !== undefined) { extraConditions.push('w.rating >= ?'); extraBindings.push(filter.ratingFrom) }
        if (filter.ratingTo !== undefined) { extraConditions.push('w.rating <= ?'); extraBindings.push(filter.ratingTo) }
        const studioIds = filter.studioIds as number[] | undefined
        if (studioIds?.length) {
          const ph = studioIds.map(() => '?').join(',')
          extraConditions.push(`w.studio_id IN (${ph})`)
          extraBindings.push(...studioIds)
        }
        if (filter.releaseDateFrom) { extraConditions.push('w.release_date >= ?'); extraBindings.push(filter.releaseDateFrom) }
        if (filter.releaseDateTo) { extraConditions.push('w.release_date <= ?'); extraBindings.push(filter.releaseDateTo) }
        if (filter.actorCountFrom !== undefined) { extraConditions.push('(SELECT COUNT(*) FROM work_actors wa2 WHERE wa2.work_id = w.id) >= ?'); extraBindings.push(filter.actorCountFrom) }
        if (filter.actorCountTo !== undefined) { extraConditions.push('(SELECT COUNT(*) FROM work_actors wa2 WHERE wa2.work_id = w.id) <= ?'); extraBindings.push(filter.actorCountTo) }
      }
      const filterWhere = extraConditions.length ? ` AND ${extraConditions.join(' AND ')}` : ''
      items = db().prepare(`
        SELECT DISTINCT w.id, COALESCE(ws.appearance_count, 0) AS appearance_count
        FROM works w
        LEFT JOIN worldcup_stats ws ON ws.item_id = w.id AND ws.category_id = ?
        ${extraJoins}
        WHERE 1=1${filterWhere}
        ORDER BY appearance_count ASC
      `).all(categoryId, ...extraBindings) as { id: number; appearance_count: number }[]
    }

    // appearance_count 그룹 내 Fisher-Yates 셔플
    const groupShuffled: { id: number; appearance_count: number }[] = []
    let gi = 0
    while (gi < items.length) {
      let gj = gi
      while (gj < items.length && items[gj].appearance_count === items[gi].appearance_count) gj++
      const group = items.slice(gi, gj)
      for (let k = group.length - 1; k > 0; k--) {
        const r = Math.floor(Math.random() * (k + 1))
        ;[group[k], group[r]] = [group[r], group[k]]
      }
      groupShuffled.push(...group)
      gi = gj
    }
    items = groupShuffled

    // 라운드 크기 결정
    let participants: { id: number }[]
    if (roundTotal === 0) {
      // 전체
      participants = items
    } else {
      participants = items.slice(0, roundTotal)
    }

    if (participants.length < 2) throw new Error('참가 항목이 2개 미만입니다')

    // 첫 라운드: 2의 거듭제곱으로 맞춤 (부전승 처리)
    const totalCount = participants.length
    const naturalRoundSize = Math.pow(2, Math.ceil(Math.log2(totalCount)))
    let roundSize = roundTotal === 0 ? naturalRoundSize : Math.min(roundTotal, naturalRoundSize)

    // 세션 생성
    const sessionResult = db().prepare(`
      INSERT INTO worldcup_sessions (category_id, round_total, status) VALUES (?, ?, 'in_progress')
    `).run(categoryId, roundTotal)
    const sessionId = sessionResult.lastInsertRowid as number

    // 첫 라운드 매치 생성
    const byeCount = roundSize - totalCount
    const shuffled = [...participants]
    // 부전승 항목은 앞쪽에 배치
    const insertMatch = db().prepare(`
      INSERT INTO worldcup_matches (session_id, round, match_index, item1_id, item2_id, winner_id, is_bye)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    const insertMatchMany = db().transaction((matches: { round: number; idx: number; item1: number; item2: number | null; winner: number | null; isBye: number }[]) => {
      for (const m of matches) {
        insertMatch.run(sessionId, m.round, m.idx, m.item1, m.item2, m.winner, m.isBye)
      }
    })

    const firstRoundMatches: { round: number; idx: number; item1: number; item2: number | null; winner: number | null; isBye: number }[] = []
    let matchIdx = 0
    // 부전승 처리: byeCount개 항목은 단독 진출
    for (let i = 0; i < byeCount; i++) {
      firstRoundMatches.push({ round: roundSize, idx: matchIdx++, item1: shuffled[i].id, item2: null, winner: shuffled[i].id, isBye: 1 })
    }
    // 나머지 항목들은 1:1 매치
    for (let i = byeCount; i < totalCount; i += 2) {
      firstRoundMatches.push({ round: roundSize, idx: matchIdx++, item1: shuffled[i].id, item2: shuffled[i + 1]?.id ?? null, winner: null, isBye: 0 })
    }
    insertMatchMany(firstRoundMatches)

    // appearance_count 증가
    const upsertStat = db().prepare(`
      INSERT INTO worldcup_stats (category_id, item_id, appearance_count)
      VALUES (?, ?, 1)
      ON CONFLICT(category_id, item_id) DO UPDATE SET appearance_count = appearance_count + 1
    `)
    const upsertStats = db().transaction(() => {
      for (const p of participants) upsertStat.run(categoryId, p.id)
    })
    upsertStats()

    const session = db().prepare(`SELECT * FROM worldcup_sessions WHERE id = ?`).get(sessionId)
    const matches = db().prepare(`SELECT * FROM worldcup_matches WHERE session_id = ? ORDER BY round DESC, match_index`).all(sessionId)
    return { session, matches }
  })

  ipcMain.handle('worldcup:pick', (_e, params: { matchId: number; winnerId: number }) => {
    const { matchId, winnerId } = params
    const match = db().prepare(`SELECT * FROM worldcup_matches WHERE id = ?`).get(matchId) as {
      id: number; session_id: number; round: number; match_index: number; item1_id: number; item2_id: number | null; winner_id: number | null; is_bye: number
    } | undefined
    if (!match) throw new Error('매치를 찾을 수 없습니다')
    if (match.winner_id !== null) throw new Error('이미 결과가 있는 매치입니다')

    const loserId = match.item1_id === winnerId ? match.item2_id : match.item1_id

    // 매치 결과 저장
    db().prepare(`UPDATE worldcup_matches SET winner_id = ? WHERE id = ?`).run(winnerId, matchId)

    // stats 업데이트 (승/패)
    const session = db().prepare(`SELECT * FROM worldcup_sessions WHERE id = ?`).get(match.session_id) as { category_id: number } | undefined
    if (session && loserId !== null) {
      db().prepare(`
        INSERT INTO worldcup_stats (category_id, item_id, total_matches, match_wins)
        VALUES (?, ?, 1, 1)
        ON CONFLICT(category_id, item_id) DO UPDATE SET total_matches = total_matches + 1, match_wins = match_wins + 1
      `).run(session.category_id, winnerId)
      db().prepare(`
        INSERT INTO worldcup_stats (category_id, item_id, total_matches)
        VALUES (?, ?, 1)
        ON CONFLICT(category_id, item_id) DO UPDATE SET total_matches = total_matches + 1
      `).run(session.category_id, loserId)
    }

    // 현재 라운드의 모든 매치가 완료됐는지 확인
    const sessionMatches = db().prepare(`SELECT * FROM worldcup_matches WHERE session_id = ?`).all(match.session_id) as {
      round: number; match_index: number; winner_id: number | null; is_bye: number; item1_id: number
    }[]
    const currentRoundMatches = sessionMatches.filter(m => m.round === match.round)
    const allDone = currentRoundMatches.every(m => m.winner_id !== null)

    if (allDone) {
      const winners = currentRoundMatches.map(m => m.winner_id!)
      if (winners.length === 1) {
        // 결승 완료 → 세션 종료
        db().prepare(`UPDATE worldcup_sessions SET status = 'completed', winner_id = ?, updated_at = datetime('now') WHERE id = ?`).run(winners[0], match.session_id)
        return { done: true, winnerId: winners[0] }
      }
      // 다음 라운드 생성
      const nextRound = Math.floor(match.round / 2) === 0 ? match.round / 2 : Math.floor(match.round / 2)
      // 실제로는 winners.length 기준
      const nextRoundSize = winners.length
      const insertNext = db().prepare(`
        INSERT INTO worldcup_matches (session_id, round, match_index, item1_id, item2_id, winner_id, is_bye)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      const insertNextMany = db().transaction(() => {
        for (let i = 0; i < winners.length; i += 2) {
          if (i + 1 < winners.length) {
            insertNext.run(match.session_id, nextRoundSize, i / 2, winners[i], winners[i + 1], null, 0)
          } else {
            // 홀수면 부전승
            insertNext.run(match.session_id, nextRoundSize, i / 2, winners[i], null, winners[i], 1)
          }
        }
      })
      insertNextMany()
    }

    const updatedMatches = db().prepare(`SELECT * FROM worldcup_matches WHERE session_id = ? ORDER BY round DESC, match_index`).all(match.session_id)
    return { done: false, matches: updatedMatches }
  })

  ipcMain.handle('worldcup:complete', (_e, params: { sessionId: number }) => {
    const { sessionId } = params
    const session = db().prepare(`SELECT * FROM worldcup_sessions WHERE id = ?`).get(sessionId) as {
      category_id: number; winner_id: number | null; status: string
    } | undefined
    if (!session || session.status !== 'completed') throw new Error('완료된 세션이 아닙니다')

    // session_wins / total_sessions 업데이트
    const categoryId = session.category_id
    const winnerId = session.winner_id

    // 이 세션에 참가한 모든 항목의 total_sessions 증가
    const participants = db().prepare(`
      SELECT DISTINCT item1_id AS item_id FROM worldcup_matches WHERE session_id = ?
      UNION SELECT DISTINCT item2_id FROM worldcup_matches WHERE session_id = ? AND item2_id IS NOT NULL
    `).all(sessionId, sessionId) as { item_id: number }[]

    const updateTotalSessions = db().transaction(() => {
      for (const p of participants) {
        db().prepare(`
          INSERT INTO worldcup_stats (category_id, item_id, total_sessions)
          VALUES (?, ?, 1)
          ON CONFLICT(category_id, item_id) DO UPDATE SET total_sessions = total_sessions + 1
        `).run(categoryId, p.item_id)
      }
      if (winnerId !== null) {
        db().prepare(`
          INSERT INTO worldcup_stats (category_id, item_id, session_wins)
          VALUES (?, ?, 1)
          ON CONFLICT(category_id, item_id) DO UPDATE SET session_wins = session_wins + 1
        `).run(categoryId, winnerId)
      }
    })
    updateTotalSessions()

    // 순위 계산 및 rank_history 기록
    const stats = db().prepare(`
      SELECT item_id,
        CASE WHEN total_sessions > 0 THEN ROUND(CAST(session_wins AS REAL) / total_sessions * 100, 2) ELSE 0 END AS win_rate,
        CASE WHEN total_matches > 0 THEN ROUND(CAST(match_wins AS REAL) / total_matches * 100, 2) ELSE 0 END AS match_win_rate
      FROM worldcup_stats WHERE category_id = ?
      ORDER BY win_rate DESC, match_win_rate DESC
    `).all(categoryId) as { item_id: number; win_rate: number; match_win_rate: number }[]

    const insertHistory = db().prepare(`INSERT INTO worldcup_rank_history (category_id, item_id, rank) VALUES (?, ?, ?)`)
    const insertHistoryMany = db().transaction(() => {
      let currentRank = 1
      stats.forEach((s, i) => {
        if (i > 0 && (s.win_rate !== stats[i - 1].win_rate || s.match_win_rate !== stats[i - 1].match_win_rate)) {
          currentRank++
        }
        insertHistory.run(categoryId, s.item_id, currentRank)
      })
    })
    insertHistoryMany()

    // 현재 세션 외 완료된 이전 세션의 matches 정리
    db().prepare(`
      DELETE FROM worldcup_matches
      WHERE session_id IN (
        SELECT id FROM worldcup_sessions
        WHERE category_id = ? AND status = 'completed' AND id != ?
      )
    `).run(categoryId, sessionId)

    return { ok: true }
  })

  ipcMain.handle('worldcup:rankings', (_e, params: { categoryId: number; limit: number; offset: number }) => {
    const { categoryId, limit, offset } = params
    const category = db().prepare(`SELECT type FROM worldcup_categories WHERE id = ?`).get(categoryId) as { type: string } | undefined
    if (!category) return { rows: [], total: 0 }

    const total = (db().prepare(`SELECT COUNT(*) AS cnt FROM worldcup_stats WHERE category_id = ?`).get(categoryId) as { cnt: number }).cnt

    let rows: unknown[]
    if (category.type === 'actor') {
      rows = db().prepare(`
        SELECT
          DENSE_RANK() OVER (ORDER BY
            CASE WHEN ws.total_sessions > 0 THEN CAST(ws.session_wins AS REAL) / ws.total_sessions ELSE 0 END DESC,
            CASE WHEN ws.total_matches > 0 THEN CAST(ws.match_wins AS REAL) / ws.total_matches ELSE 0 END DESC
          ) AS rank,
          a.id, a.name, a.photo_path,
          ws.total_sessions, ws.session_wins, ws.total_matches, ws.match_wins, ws.appearance_count,
          CASE WHEN ws.total_sessions > 0 THEN ROUND(CAST(ws.session_wins AS REAL) / ws.total_sessions * 100, 2) ELSE 0 END AS win_rate,
          CASE WHEN ws.total_matches > 0 THEN ROUND(CAST(ws.match_wins AS REAL) / ws.total_matches * 100, 2) ELSE 0 END AS match_win_rate
        FROM worldcup_stats ws
        JOIN actors a ON a.id = ws.item_id
        WHERE ws.category_id = ?
        ORDER BY win_rate DESC, match_win_rate DESC
        LIMIT ? OFFSET ?
      `).all(categoryId, limit, offset)
    } else {
      rows = db().prepare(`
        SELECT
          DENSE_RANK() OVER (ORDER BY
            CASE WHEN ws.total_sessions > 0 THEN CAST(ws.session_wins AS REAL) / ws.total_sessions ELSE 0 END DESC,
            CASE WHEN ws.total_matches > 0 THEN CAST(ws.match_wins AS REAL) / ws.total_matches ELSE 0 END DESC
          ) AS rank,
          w.id, w.title, w.product_number, w.cover_path,
          ws.total_sessions, ws.session_wins, ws.total_matches, ws.match_wins, ws.appearance_count,
          CASE WHEN ws.total_sessions > 0 THEN ROUND(CAST(ws.session_wins AS REAL) / ws.total_sessions * 100, 2) ELSE 0 END AS win_rate,
          CASE WHEN ws.total_matches > 0 THEN ROUND(CAST(ws.match_wins AS REAL) / ws.total_matches * 100, 2) ELSE 0 END AS match_win_rate
        FROM worldcup_stats ws
        JOIN works w ON w.id = ws.item_id
        WHERE ws.category_id = ?
        ORDER BY win_rate DESC, match_win_rate DESC
        LIMIT ? OFFSET ?
      `).all(categoryId, limit, offset)
    }
    return { rows, total }
  })

  ipcMain.handle('worldcup:rank-history', (_e, params: { categoryId: number; itemId: number }) => {
    return db().prepare(`
      SELECT rank, recorded_at FROM worldcup_rank_history
      WHERE category_id = ? AND item_id = ?
      ORDER BY recorded_at ASC
    `).all(params.categoryId, params.itemId)
  })

  ipcMain.handle('worldcup:delete-session', (_e, sessionId: number) => {
    db().prepare(`DELETE FROM worldcup_sessions WHERE id = ?`).run(sessionId)
    return { ok: true }
  })

  ipcMain.handle('worldcup:last-session-rankings', (_e, params: { categoryId: number; limit?: number; offset?: number }) => {
    const { categoryId, limit = 20, offset = 0 } = params
    const category = db().prepare(`SELECT type FROM worldcup_categories WHERE id = ?`).get(categoryId) as { type: string } | undefined
    if (!category) return null

    const session = db().prepare(`
      SELECT id, winner_id, round_total, created_at FROM worldcup_sessions
      WHERE category_id = ? AND status = 'completed'
      ORDER BY updated_at DESC LIMIT 1
    `).get(categoryId) as { id: number; winner_id: number; round_total: number; created_at: string } | undefined
    if (!session) return null

    const matches = db().prepare(`
      SELECT item1_id, item2_id, winner_id, round, is_bye
      FROM worldcup_matches WHERE session_id = ?
    `).all(session.id) as { item1_id: number; item2_id: number | null; winner_id: number; round: number; is_bye: number }[]

    // 탈락 라운드 맵 구성
    const elimRound: Record<number, number> = {}
    const participantIds = new Set<number>()
    for (const m of matches) {
      participantIds.add(m.item1_id)
      if (m.item2_id !== null) participantIds.add(m.item2_id)
      if (!m.is_bye && m.item2_id !== null && m.winner_id !== null) {
        const loserId = m.winner_id === m.item1_id ? m.item2_id : m.item1_id
        elimRound[loserId] = m.round
      }
    }

    // 탈락 라운드로 정렬 (우승자 먼저, 나머지는 elim 오름차순: 낮은 라운드=오래 생존)
    const sorted = [...participantIds]
      .map(id => ({ id, elim: id === session.winner_id ? Infinity : (elimRound[id] ?? 0) }))
      .sort((a, b) => {
        if (a.elim === Infinity) return -1
        if (b.elim === Infinity) return 1
        return a.elim - b.elim
      })

    // Dense rank 부여 (같은 탈락 라운드 = 같은 순위, 다음 그룹은 +1)
    const ranked: { id: number; rank: number; elim_round: number | null }[] = []
    let currentRank = 1
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i].elim !== sorted[i - 1].elim) currentRank++
      ranked.push({ id: sorted[i].id, rank: currentRank, elim_round: sorted[i].elim === Infinity ? null : sorted[i].elim })
    }

    const total = ranked.length
    const paged = ranked.slice(offset, offset + limit)

    // 항목 정보 JOIN
    let rows: unknown[]
    if (category.type === 'actor') {
      rows = paged.map(r => {
        const a = db().prepare(`SELECT id, name, photo_path FROM actors WHERE id = ?`).get(r.id) as { id: number; name: string; photo_path: string | null } | undefined
        return { ...r, ...a }
      })
    } else {
      rows = paged.map(r => {
        const w = db().prepare(`SELECT id, title, product_number, cover_path FROM works WHERE id = ?`).get(r.id) as { id: number; title: string | null; product_number: string | null; cover_path: string | null } | undefined
        return { ...r, ...w }
      })
    }
    return { rows, total, session }
  })

  ipcMain.handle('worldcup:last-winner', (_e, params: { categoryId: number; type: 'actor' | 'work' }) => {
    const session = db().prepare(`
      SELECT winner_id FROM worldcup_sessions
      WHERE category_id = ? AND status = 'completed'
      ORDER BY updated_at DESC LIMIT 1
    `).get(params.categoryId) as { winner_id: number } | undefined
    if (!session) return null
    if (params.type === 'actor') {
      return db().prepare(`SELECT id, name, photo_path FROM actors WHERE id = ?`).get(session.winner_id)
    } else {
      return db().prepare(`SELECT id, title, product_number, cover_path FROM works WHERE id = ?`).get(session.winner_id)
    }
  })

  ipcMain.handle('worldcup:create-category', (_e, params: { name: string; type: 'actor' | 'work'; filter?: object | null }) => {
    const { name, type, filter } = params
    const maxOrder = (db().prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM worldcup_categories`).get() as { m: number }).m
    const result = db().prepare(`INSERT INTO worldcup_categories (type, name, sort_order, filter_json) VALUES (?, ?, ?, ?)`).run(type, name, maxOrder + 1, filter ? JSON.stringify(filter) : null)
    return db().prepare(`SELECT * FROM worldcup_categories WHERE id = ?`).get(result.lastInsertRowid)
  })

  ipcMain.handle('worldcup:update-category', (_e, params: { id: number; name: string; filter?: object | null }) => {
    if (params.filter !== undefined) {
      db().prepare(`UPDATE worldcup_categories SET name = ?, filter_json = ? WHERE id = ?`).run(params.name, params.filter ? JSON.stringify(params.filter) : null, params.id)
    } else {
      db().prepare(`UPDATE worldcup_categories SET name = ? WHERE id = ?`).run(params.name, params.id)
    }
    return db().prepare(`SELECT * FROM worldcup_categories WHERE id = ?`).get(params.id)
  })

  ipcMain.handle('worldcup:delete-category', (_e, id: number) => {
    db().prepare(`DELETE FROM worldcup_categories WHERE id = ?`).run(id)
    return { ok: true }
  })

}
