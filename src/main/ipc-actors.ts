import { ipcMain } from 'electron'
import { getDatabase } from './db'

export function registerActorsHandlers(): void {
  const db = () => getDatabase()

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
    commentSearch?: string
    commentNull?: boolean
    deletePending?: boolean
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
    if (params?.commentSearch) { conditions.push('a.comment LIKE ?'); bindings.push(`%${params.commentSearch}%`) }
    if (params?.commentNull) { conditions.push("(a.comment IS NULL OR TRIM(a.comment) = '')") }
    if (params?.deletePending) { conditions.push('COALESCE(a.delete_pending, 0) = 1') }

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

    const photos = db().prepare('SELECT * FROM actor_photos WHERE actor_id = ? ORDER BY sort_order, id').all(id)

    return { ...actor as object, works, tags, rep_tags, scores, photos }
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
    delete_pending?: number
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
    if (data.delete_pending !== undefined) { fields.push('delete_pending = ?'); values.push(data.delete_pending) }
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
    const blocked = db().prepare(`
      SELECT 1 FROM cup_entries e
      JOIN cup_runs r ON r.id = e.run_id
      WHERE r.status = 'in_progress' AND e.item_id = ?
      LIMIT 1
    `).get(id)
    if (blocked) return { blocked: true }
    db().prepare('DELETE FROM actors WHERE id = ?').run(id)
    db().prepare(`DELETE FROM master_ranking_history WHERE type = 'actor' AND item_id = ?`).run(id)
    db().prepare(`DELETE FROM cup_entries WHERE item_id = ?`).run(id)
    db().prepare(`DELETE FROM cup_stats WHERE type = 'actor' AND item_id = ?`).run(id)
    db().prepare(`DELETE FROM cup_match_points WHERE item_id = ?`).run(id)
    db().prepare(`DELETE FROM cup_rank_snapshots WHERE item_id = ?`).run(id)
    return { blocked: false }
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

  // ========== 배우 추가 사진 ==========

  ipcMain.handle('actor-photos:list', (_e, actorId: number) => {
    return db().prepare('SELECT * FROM actor_photos WHERE actor_id = ? ORDER BY sort_order, id').all(actorId)
  })

  ipcMain.handle('actor-photos:add', (_e, actorId: number, photoPath: string) => {
    const count = (db().prepare('SELECT COUNT(*) AS cnt FROM actor_photos WHERE actor_id = ?').get(actorId) as { cnt: number }).cnt
    if (count >= 3) throw new Error('추가 사진은 최대 3장까지 가능합니다')
    const result = db().prepare('INSERT INTO actor_photos (actor_id, photo_path, sort_order) VALUES (?, ?, ?)').run(actorId, photoPath, count)
    return result.lastInsertRowid
  })

  ipcMain.handle('actor-photos:delete', (_e, photoId: number) => {
    db().prepare('DELETE FROM actor_photos WHERE id = ?').run(photoId)
    return true
  })
}
