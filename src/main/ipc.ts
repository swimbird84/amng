import { ipcMain, dialog, app, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import { getDatabase } from './db'


// ========== 마스터 랭킹 승점 계산 헬퍼 ==========
function calcAndStoreRunPoints(
  database: ReturnType<typeof getDatabase>,
  runId: number,
  type: 'actor' | 'work',
  isMaster: boolean,
  settingsSnapshotJson: string | null
): void {
  // 마스터 대회: 스냅샷 사용 / 일반 대회: 현재 설정 사용
  let settingsJson = settingsSnapshotJson
  if (!settingsJson) {
    const row = database.prepare(`SELECT settings_json FROM ranking_settings WHERE type = ?`).get(type) as { settings_json: string } | undefined
    if (!row) return
    settingsJson = row.settings_json
  }
  const settings = JSON.parse(settingsJson) as {
    basePoints: { win: number; draw: number; loss: number }
    divisionWeights: number[]
    opponentWeights: number[]
    rankBonus: Record<string, Record<string, number>>
  }

  const entries = database.prepare(
    `SELECT item_id, division FROM cup_entries WHERE run_id = ?`
  ).all(runId) as { item_id: number; division: number | null }[]
  if (entries.length === 0) return

  const divMap = new Map(entries.map(e => [e.item_id, e.division ?? 0]))

  // 마스터 대회만 부별/섞인 구분 (일반 대회는 부 없음)
  const divisions = new Set(entries.map(e => e.division ?? 0))
  const isMixed = isMaster && divisions.size > 1

  const run = database.prepare(
    `SELECT r.winner_id, t.format FROM cup_runs r JOIN cup_tournaments t ON t.id = r.tournament_id WHERE r.id = ?`
  ).get(runId) as { format: string; winner_id: number | null }

  const matches = database.prepare(`
    SELECT item1_id, item2_id, winner_id, is_draw, round FROM cup_matches
    WHERE run_id = ? AND is_bye = 0
  `).all(runId) as {
    item1_id: number; item2_id: number | null; winner_id: number | null; is_draw: number; round: number
  }[]

  const getDivWeight = (div: number, weights: number[]) =>
    div >= 1 && div <= weights.length ? weights[div - 1] : 1.0

  // ---- 매치 승점 계산 ----
  // 섞인 대회: 매치마다 상대방 부 가중치 적용 (raw pts)
  // 부별 대회 / 일반 대회: raw 승점만 누적 (가중치는 최종 단계에서 적용)
  const matchPts = new Map<number, number>()
  for (const m of matches) {
    if (m.item2_id === null) continue
    if (isMixed) {
      const div1 = divMap.get(m.item1_id) ?? 0
      const div2 = divMap.get(m.item2_id) ?? 0
      if (m.is_draw) {
        matchPts.set(m.item1_id, (matchPts.get(m.item1_id) ?? 0) + settings.basePoints.draw * getDivWeight(div2, settings.opponentWeights))
        matchPts.set(m.item2_id, (matchPts.get(m.item2_id) ?? 0) + settings.basePoints.draw * getDivWeight(div1, settings.opponentWeights))
      } else if (m.winner_id !== null) {
        const loserId = m.item1_id === m.winner_id ? m.item2_id : m.item1_id
        matchPts.set(m.winner_id, (matchPts.get(m.winner_id) ?? 0) + settings.basePoints.win * getDivWeight(divMap.get(loserId) ?? 0, settings.opponentWeights))
      }
    } else {
      if (m.is_draw) {
        matchPts.set(m.item1_id, (matchPts.get(m.item1_id) ?? 0) + settings.basePoints.draw)
        matchPts.set(m.item2_id, (matchPts.get(m.item2_id) ?? 0) + settings.basePoints.draw)
      } else if (m.winner_id !== null) {
        matchPts.set(m.winner_id, (matchPts.get(m.winner_id) ?? 0) + settings.basePoints.win)
      }
    }
  }

  // ---- 순위 계산 ----
  const rankMap = new Map<number, number>()
  if (run.format === 'tournament' || run.format === 'worldcup') {
    if (run.winner_id !== null) rankMap.set(run.winner_id, 1)
    const roundGroups = new Map<number, number[]>()
    for (const m of matches) {
      if (m.winner_id === null || m.item2_id === null || m.is_draw) continue
      const loserId = m.item1_id === m.winner_id ? m.item2_id : m.item1_id
      const group = roundGroups.get(m.round) ?? []
      group.push(loserId)
      roundGroups.set(m.round, group)
    }
    for (const [round, losers] of roundGroups.entries()) {
      const rankStart = Math.floor(round / 2) + 1
      for (const loserId of losers) rankMap.set(loserId, rankStart)
    }
  } else {
    // 리그전: raw matchPts 기준 순위
    const sorted = [...entries].sort((a, b) => (matchPts.get(b.item_id) ?? 0) - (matchPts.get(a.item_id) ?? 0))
    let rank = 1
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && (matchPts.get(sorted[i].item_id) ?? 0) < (matchPts.get(sorted[i - 1].item_id) ?? 0)) rank = i + 1
      rankMap.set(sorted[i].item_id, rank)
    }
  }

  // ---- 순위 보너스 ----
  const entryCount = entries.length
  const bonusKeys = Object.keys(settings.rankBonus).map(Number).sort((a, b) => a - b)
  const bonusTableKey = String(bonusKeys.find(k => entryCount <= k) ?? bonusKeys[bonusKeys.length - 1] ?? 32)
  const bonusTable: Record<string, number> = settings.rankBonus[bonusTableKey] ?? {}
  const bonusRankKeys = Object.keys(bonusTable).map(Number).sort((a, b) => a - b)
  const getBonus = (rank: number) => {
    const key = bonusRankKeys.find(k => rank <= k)
    return key !== undefined ? (bonusTable[String(key)] ?? 0) : 0
  }

  // 섞인 대회: 순위 보너스에 적용할 부 가중치 평균
  const avgDivWeight = isMixed
    ? entries.reduce((sum, e) => sum + getDivWeight(divMap.get(e.item_id) ?? 0, settings.divisionWeights), 0) / entries.length
    : 1.0

  // ---- 최종 승점 계산 및 저장 ----
  // 부별 대회: (raw_matchPts + bonus) × divWeight  ← RANK.md 수식
  // 섞인 대회: matchPts(per-match weight 적용) + bonus × avgDivWeight
  // 일반 대회: matchPts + bonus (가중치 없음)
  const insert = database.prepare(`
    INSERT INTO master_ranking_history (run_id, type, item_id, points, recorded_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `)
  for (const e of entries) {
    const mp = matchPts.get(e.item_id) ?? 0
    const rank = rankMap.get(e.item_id) ?? entryCount
    const bonus = getBonus(rank)
    let finalPts: number
    if (isMaster && !isMixed) {
      const w = getDivWeight(divMap.get(e.item_id) ?? 0, settings.divisionWeights)
      finalPts = (mp + bonus) * w
    } else if (isMixed) {
      finalPts = mp + bonus * avgDivWeight
    } else {
      finalPts = mp + bonus
    }
    insert.run(runId, type, e.item_id, finalPts)
  }
}

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
    const blocked = db().prepare(`
      SELECT 1 FROM cup_entries e
      JOIN cup_runs r ON r.id = e.run_id
      WHERE r.status = 'in_progress' AND e.item_id = ?
      LIMIT 1
    `).get(id)
    if (blocked) return { blocked: true }
    db().prepare('DELETE FROM works WHERE id = ?').run(id)
    db().prepare(`DELETE FROM master_ranking_history WHERE type = 'work' AND item_id = ?`).run(id)
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
    const blocked = db().prepare(`
      SELECT 1 FROM cup_entries e
      JOIN cup_runs r ON r.id = e.run_id
      WHERE r.status = 'in_progress' AND e.item_id = ?
      LIMIT 1
    `).get(id)
    if (blocked) return { blocked: true }
    db().prepare('DELETE FROM actors WHERE id = ?').run(id)
    db().prepare(`DELETE FROM master_ranking_history WHERE type = 'actor' AND item_id = ?`).run(id)
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

  // ========== 컵 대회 시스템 ==========

  ipcMain.handle('cup:list', (_e, params?: { type?: 'actor' | 'work'; isMaster?: boolean; search?: string; sortBy?: string; sortDir?: string; format?: 'tournament' | 'league' | 'worldcup' }) => {
    const { type, isMaster, search, sortBy = 'created_at', sortDir = 'desc', format } = params ?? {}
    const conditions: string[] = []
    const bindings: unknown[] = []
    if (type) { conditions.push('t.type = ?'); bindings.push(type) }
    if (isMaster !== undefined) { conditions.push('t.is_master = ?'); bindings.push(isMaster ? 1 : 0) }
    if (search) { conditions.push('t.name LIKE ?'); bindings.push(`%${search}%`) }
    if (format) { conditions.push('t.format = ?'); bindings.push(format) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const orderCol = sortBy === 'name' ? 't.name' : 't.created_at'
    const dir = sortDir === 'asc' ? 'ASC' : 'DESC'
    return db().prepare(`
      SELECT t.*,
        lr.id AS latest_run_id,
        lr.status AS latest_run_status,
        lr.round_total,
        lr.winner_id,
        lr.started_at,
        lr.completed_at,
        CASE WHEN t.type = 'actor' THEN a.name ELSE w.title END AS winner_name,
        CASE WHEN t.type = 'actor' THEN a.photo_path ELSE w.cover_path END AS winner_photo
      FROM cup_tournaments t
      LEFT JOIN cup_runs lr ON lr.id = (
        SELECT id FROM cup_runs WHERE tournament_id = t.id ORDER BY id DESC LIMIT 1
      )
      LEFT JOIN actors a ON a.id = lr.winner_id AND t.type = 'actor'
      LEFT JOIN works w ON w.id = lr.winner_id AND t.type = 'work'
      ${where}
      ORDER BY ${orderCol} ${dir}
    `).all(...bindings)
  })

  ipcMain.handle('cup:get', (_e, tournamentId: number) => {
    const tournament = db().prepare(`SELECT * FROM cup_tournaments WHERE id = ?`).get(tournamentId) as Record<string, unknown> | undefined
    if (!tournament) return null
    const run = db().prepare(`SELECT * FROM cup_runs WHERE tournament_id = ? ORDER BY id DESC LIMIT 1`).get(tournamentId) as Record<string, unknown> | undefined
    if (!run) return { tournament, run: null, currentMatch: null, totalMatches: 0, completedMatches: 0 }
    const runId = run.id as number
    const currentMatch = db().prepare(`
      SELECT * FROM cup_matches
      WHERE run_id = ? AND winner_id IS NULL AND is_bye = 0 AND is_draw = 0
      ORDER BY phase DESC, round DESC, match_index ASC
      LIMIT 1
    `).get(runId)
    const { total: totalMatches } = db().prepare(
      `SELECT COUNT(*) as total FROM cup_matches WHERE run_id = ? AND is_bye = 0`
    ).get(runId) as { total: number }
    const { done: completedMatches } = db().prepare(
      `SELECT COUNT(*) as done FROM cup_matches WHERE run_id = ? AND is_bye = 0 AND (winner_id IS NOT NULL OR is_draw = 1)`
    ).get(runId) as { done: number }
    return { tournament, run, currentMatch, totalMatches, completedMatches }
  })

  ipcMain.handle('cup:create', (_e, params: {
    type: 'actor' | 'work'
    name: string
    isMaster: boolean
    format: 'tournament' | 'league' | 'worldcup'
    divisionRange?: number[] | null
    filterJson?: object | null
  }) => {
    const { type, name, isMaster, format, divisionRange, filterJson } = params
    const result = db().prepare(`
      INSERT INTO cup_tournaments (type, name, is_master, format, division_range, filter_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(type, name, isMaster ? 1 : 0, format, divisionRange ? JSON.stringify(divisionRange) : null, filterJson ? JSON.stringify(filterJson) : null)
    return db().prepare(`SELECT * FROM cup_tournaments WHERE id = ?`).get(result.lastInsertRowid)
  })

  ipcMain.handle('cup:update', (_e, params: {
    id: number
    name?: string
    divisionRange?: number[] | null
    filterJson?: object | null
  }) => {
    const t = db().prepare(`SELECT id FROM cup_tournaments WHERE id = ?`).get(params.id) as { id: number } | undefined
    if (!t) throw new Error('대회를 찾을 수 없습니다')
    if (params.name !== undefined) db().prepare(`UPDATE cup_tournaments SET name = ? WHERE id = ?`).run(params.name, params.id)
    if (params.divisionRange !== undefined) db().prepare(`UPDATE cup_tournaments SET division_range = ? WHERE id = ?`).run(params.divisionRange ? JSON.stringify(params.divisionRange) : null, params.id)
    if (params.filterJson !== undefined) db().prepare(`UPDATE cup_tournaments SET filter_json = ? WHERE id = ?`).run(params.filterJson ? JSON.stringify(params.filterJson) : null, params.id)
    return db().prepare(`SELECT * FROM cup_tournaments WHERE id = ?`).get(params.id)
  })

  ipcMain.handle('cup:delete', (_e, id: number) => {
    db().prepare(`DELETE FROM cup_tournaments WHERE id = ?`).run(id)
    return { ok: true }
  })

  ipcMain.handle('cup:standings', (_e, runId: number) => {
    const row = db().prepare(`
      SELECT r.*, t.format, t.type FROM cup_runs r
      JOIN cup_tournaments t ON t.id = r.tournament_id
      WHERE r.id = ?
    `).get(runId) as { format: string; type: string } | undefined
    if (!row) return null
    if (row.format === 'tournament') {
      const matches = db().prepare(
        `SELECT * FROM cup_matches WHERE run_id = ? ORDER BY round DESC, match_index ASC`
      ).all(runId)
      return { type: 'tournament', matches }
    } else if (row.format === 'worldcup') {
      const groups = db().prepare(`SELECT DISTINCT group_id FROM cup_matches WHERE run_id = ? AND phase = 'group' ORDER BY group_id`).all(runId) as { group_id: number }[]
      const groupStandings = groups.map(({ group_id }) => {
        const itemIds = new Set<number>()
        const groupMatches = db().prepare(`SELECT * FROM cup_matches WHERE run_id = ? AND phase = 'group' AND group_id = ?`).all(runId, group_id) as { item1_id: number; item2_id: number | null; winner_id: number | null; is_draw: number }[]
        for (const m of groupMatches) { itemIds.add(m.item1_id); if (m.item2_id) itemIds.add(m.item2_id) }
        const standings = Array.from(itemIds).map(item_id => {
          let pts = 0, w = 0, d = 0, l = 0
          for (const m of groupMatches) {
            const isItem1 = m.item1_id === item_id, isItem2 = m.item2_id === item_id
            if (!isItem1 && !isItem2) continue
            if (m.is_draw) { pts += 1; d++ }
            else if (m.winner_id === item_id) { pts += 3; w++ }
            else if (m.winner_id !== null) { l++ }
          }
          return { item_id, pts, w, d, l }
        }).sort((a, b) => b.pts - a.pts || b.w - a.w)
        return { group_id, standings }
      })
      const mainMatches = db().prepare(`SELECT * FROM cup_matches WHERE run_id = ? AND phase = 'main' ORDER BY round DESC, match_index`).all(runId)
      return { type: 'worldcup', groupStandings, mainMatches }
    } else {
      const entries = db().prepare(`SELECT item_id FROM cup_entries WHERE run_id = ?`).all(runId) as { item_id: number }[]
      const allMatches = db().prepare(`SELECT * FROM cup_matches WHERE run_id = ? ORDER BY match_index`).all(runId) as { item1_id: number; item2_id: number | null; winner_id: number | null; is_draw: number }[]
      const standings = entries.map(({ item_id }) => {
        let pts = 0, w = 0, d = 0, l = 0
        for (const m of allMatches) {
          const isItem1 = m.item1_id === item_id, isItem2 = m.item2_id === item_id
          if (!isItem1 && !isItem2) continue
          if (m.is_draw) { pts += 1; d++ }
          else if (m.winner_id === item_id) { pts += 3; w++ }
          else if (m.winner_id !== null) { l++ }
        }
        return { item_id, pts, w, d, l }
      }).sort((a, b) => b.pts - a.pts || b.w - a.w)
      return { type: 'league', standings, matches: allMatches }
    }
  })

  ipcMain.handle('ranking-settings:get', (_e, type: 'actor' | 'work') => {
    const row = db().prepare(`SELECT settings_json FROM ranking_settings WHERE type = ?`).get(type) as { settings_json: string } | undefined
    return row ? JSON.parse(row.settings_json) : null
  })

  ipcMain.handle('ranking-settings:update', (_e, type: 'actor' | 'work', settings: object) => {
    const inProgress = db().prepare(`SELECT 1 FROM cup_runs WHERE status = 'in_progress' LIMIT 1`).get()
    if (inProgress) throw new Error('진행 중인 대회가 있어 설정을 변경할 수 없습니다')
    db().prepare(`UPDATE ranking_settings SET settings_json = ? WHERE type = ?`).run(JSON.stringify(settings), type)
    return { ok: true }
  })

  ipcMain.handle('master-ranking:list', (_e, params: { type: 'actor' | 'work'; limit?: number; offset?: number; search?: string }) => {
    const { type, limit = 50, offset = 0, search } = params
    const searchWhere = search ? (type === 'actor' ? ' AND a.name LIKE ?' : ' AND (w.title LIKE ? OR w.product_number LIKE ?)') : ''
    const searchBindings: unknown[] = search ? (type === 'work' ? [`%${search}%`, `%${search}%`] : [`%${search}%`]) : []
    if (type === 'actor') {
      const rows = db().prepare(`
        SELECT
          RANK() OVER (ORDER BY COALESCE(pts.total_points, 0) DESC) AS rank,
          a.id, a.name, a.photo_path,
          COALESCE(pts.total_points, 0) AS total_points,
          COALESCE(cs.total_cups, 0) AS total_cups,
          COALESCE(cs.cup_wins, 0) AS cup_wins
        FROM actors a
        LEFT JOIN (
          SELECT mh.item_id, SUM(mh.points) AS total_points
          FROM (
            SELECT mh2.item_id, mh2.points, ROW_NUMBER() OVER (PARTITION BY mh2.item_id ORDER BY mh2.recorded_at DESC) AS rn
            FROM master_ranking_history mh2
            JOIN cup_runs r ON r.id = mh2.run_id
            JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1
            WHERE mh2.type = 'actor'
          ) mh WHERE rn <= 10 GROUP BY mh.item_id
        ) pts ON pts.item_id = a.id
        LEFT JOIN cup_stats cs ON cs.type = 'actor' AND cs.item_id = a.id
        WHERE 1=1${searchWhere}
        ORDER BY total_points DESC, a.name ASC
        LIMIT ? OFFSET ?
      `).all(...searchBindings, limit, offset)
      const total = (db().prepare(`SELECT COUNT(*) AS cnt FROM actors a WHERE 1=1${searchWhere}`).get(...searchBindings) as { cnt: number }).cnt
      return { rows, total }
    } else {
      const rows = db().prepare(`
        SELECT
          RANK() OVER (ORDER BY COALESCE(pts.total_points, 0) DESC) AS rank,
          w.id, w.title, w.product_number, w.cover_path,
          COALESCE(pts.total_points, 0) AS total_points,
          COALESCE(cs.total_cups, 0) AS total_cups,
          COALESCE(cs.cup_wins, 0) AS cup_wins
        FROM works w
        LEFT JOIN (
          SELECT mh.item_id, SUM(mh.points) AS total_points
          FROM (
            SELECT mh2.item_id, mh2.points, ROW_NUMBER() OVER (PARTITION BY mh2.item_id ORDER BY mh2.recorded_at DESC) AS rn
            FROM master_ranking_history mh2
            JOIN cup_runs r ON r.id = mh2.run_id
            JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1
            WHERE mh2.type = 'work'
          ) mh WHERE rn <= 10 GROUP BY mh.item_id
        ) pts ON pts.item_id = w.id
        LEFT JOIN cup_stats cs ON cs.type = 'work' AND cs.item_id = w.id
        WHERE 1=1${searchWhere}
        ORDER BY total_points DESC, w.title ASC
        LIMIT ? OFFSET ?
      `).all(...searchBindings, limit, offset)
      const total = (db().prepare(`SELECT COUNT(*) AS cnt FROM works w WHERE 1=1${searchWhere}`).get(...searchBindings) as { cnt: number }).cnt
      return { rows, total }
    }
  })

  ipcMain.handle('master-ranking:reset', (_e, type: 'actor' | 'work') => {
    const inProgress = db().prepare(`SELECT 1 FROM cup_runs WHERE status = 'in_progress' LIMIT 1`).get()
    if (inProgress) throw new Error('진행 중인 대회가 있어 리셋할 수 없습니다')
    db().prepare(`DELETE FROM master_ranking_history WHERE type = ?`).run(type)
    return { ok: true }
  })

  ipcMain.handle('cup:item-count', (_e, params: { tournamentId: number }) => {
    const t = db().prepare(`SELECT * FROM cup_tournaments WHERE id = ?`).get(params.tournamentId) as { type: string; filter_json?: string | null } | undefined
    if (!t) return 0
    const filter = t.filter_json ? JSON.parse(t.filter_json) as Record<string, unknown> : null
    const extraConditions: string[] = []
    const extraBindings: unknown[] = []
    let extraJoins = ''
    if (filter) {
      const tagIds = filter.tagIds as number[] | undefined
      if (tagIds?.length) {
        const ph = tagIds.map(() => '?').join(',')
        if (t.type === 'actor') {
          extraJoins += ` JOIN actor_tags at2 ON at2.actor_id = a.id`
          extraConditions.push(`at2.tag_id IN (${ph})`)
        } else {
          extraJoins += ` JOIN work_tags wt2 ON wt2.work_id = w.id`
          extraConditions.push(`wt2.tag_id IN (${ph})`)
        }
        extraBindings.push(...tagIds)
      }
      if (filter.favoriteOnly) extraConditions.push(t.type === 'actor' ? 'a.is_favorite = 1' : 'w.is_favorite = 1')
    }
    const filterWhere = extraConditions.length ? ` AND ${extraConditions.join(' AND ')}` : ''
    if (t.type === 'actor') {
      return ((db().prepare(`SELECT COUNT(DISTINCT a.id) as cnt FROM actors a${extraJoins} WHERE 1=1${filterWhere}`).get(...extraBindings) as { cnt: number }).cnt)
    } else {
      return ((db().prepare(`SELECT COUNT(DISTINCT w.id) as cnt FROM works w${extraJoins} WHERE 1=1${filterWhere}`).get(...extraBindings) as { cnt: number }).cnt)
    }
  })

  ipcMain.handle('cup:start', (_e, params: { tournamentId: number; roundTotal: number; force?: boolean }) => {
    const { tournamentId, roundTotal, force = false } = params
    const tournament = db().prepare(`SELECT * FROM cup_tournaments WHERE id = ?`).get(tournamentId) as {
      id: number; type: 'actor' | 'work'; format: string; is_master: number; filter_json: string | null
    } | undefined
    if (!tournament) throw new Error('대회를 찾을 수 없습니다')
    const existingRun = db().prepare(`SELECT id FROM cup_runs WHERE tournament_id = ? AND status = 'in_progress' LIMIT 1`).get(tournamentId) as { id: number } | undefined
    if (existingRun) {
      if (!force) throw new Error('이미 진행 중인 대회가 있습니다')
      // force: 기존 진행중 run 삭제 (CASCADE)
      db().prepare(`DELETE FROM cup_runs WHERE id = ?`).run(existingRun.id)
    }

    const filter = tournament.filter_json ? JSON.parse(tournament.filter_json) as Record<string, unknown> : null
    const poolMode = (filter?.poolMode as string | undefined) ?? 'normal'

    // 후보 항목 조회
    let items: { id: number }[]
    if (tournament.type === 'actor') {
      const extraConditions: string[] = []
      const extraBindings: unknown[] = []
      let extraJoins = ''
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
      items = db().prepare(`SELECT DISTINCT a.id FROM actors a ${extraJoins} WHERE 1=1${filterWhere}`).all(...extraBindings) as { id: number }[]
    } else {
      const extraConditions: string[] = []
      const extraBindings: unknown[] = []
      let extraJoins = ''
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
      items = db().prepare(`SELECT DISTINCT w.id FROM works w ${extraJoins} WHERE 1=1${filterWhere}`).all(...extraBindings) as { id: number }[]
    }

    // cup_stats 조회 (참가 수 보정 및 champion/loser 모드용)
    let statsMap = new Map<number, number>()
    let winRateMap = new Map<number, number>()
    if (items.length > 0) {
      const ph = items.map(() => '?').join(',')
      const statsRows = db().prepare(`
        SELECT item_id, total_cups, cup_wins FROM cup_stats WHERE type = ? AND item_id IN (${ph})
      `).all(tournament.type, ...items.map(i => i.id)) as { item_id: number; total_cups: number; cup_wins: number }[]
      statsMap = new Map(statsRows.map(r => [r.item_id, r.total_cups]))
      winRateMap = new Map(statsRows.map(r => [r.item_id, r.total_cups > 0 ? r.cup_wins / r.total_cups : -1]))
      // 정렬 전 셔플 (stable sort 편향 방지)
      for (let k = items.length - 1; k > 0; k--) {
        const r = Math.floor(Math.random() * (k + 1))
        ;[items[k], items[r]] = [items[r], items[k]]
      }
      if (poolMode === 'champion') {
        items.sort((a, b) => (winRateMap.get(b.id) ?? -1) - (winRateMap.get(a.id) ?? -1))
      } else if (poolMode === 'loser') {
        items.sort((a, b) => {
          const ra = winRateMap.get(a.id) ?? -1
          const rb = winRateMap.get(b.id) ?? -1
          if (ra === -1 && rb === -1) return 0
          if (ra === -1) return 1
          if (rb === -1) return -1
          return ra - rb
        })
      } else {
        items.sort((a, b) => (statsMap.get(a.id) ?? 0) - (statsMap.get(b.id) ?? 0))
      }
    }

    let participants: { id: number }[]
    if (roundTotal === 0) {
      for (let k = items.length - 1; k > 0; k--) {
        const r = Math.floor(Math.random() * (k + 1))
        ;[items[k], items[r]] = [items[r], items[k]]
      }
      participants = items
    } else {
      const multiplier = Math.max(2, Math.sqrt(items.length / roundTotal))
      const poolSize = Math.min(items.length, Math.round(roundTotal * multiplier))
      const pool = items.slice(0, poolSize)
      for (let k = pool.length - 1; k > 0; k--) {
        const r = Math.floor(Math.random() * (k + 1))
        ;[pool[k], pool[r]] = [pool[r], pool[k]]
      }
      // 최솟값 티어 강제 포함 (일반 모드만)
      const minSessions = poolMode === 'normal' && pool.length > 0 ? Math.min(...pool.map(i => statsMap.get(i.id) ?? 0)) : Infinity
      const minTier = pool.filter(i => (statsMap.get(i.id) ?? 0) === minSessions)
      let forcedItems: { id: number }[] = []
      if (minTier.length <= poolSize / 20) {
        forcedItems = [...minTier]
      } else if (minTier.length <= poolSize / 10) {
        const shuffledMin = [...minTier]
        for (let k = shuffledMin.length - 1; k > 0; k--) {
          const r = Math.floor(Math.random() * (k + 1))
          ;[shuffledMin[k], shuffledMin[r]] = [shuffledMin[r], shuffledMin[k]]
        }
        forcedItems = shuffledMin.slice(0, Math.ceil(minTier.length / 2))
      }
      if (forcedItems.length > 0) {
        const forcedSet = new Set(forcedItems.map(i => i.id))
        const rest = pool.filter(i => !forcedSet.has(i.id))
        for (let k = rest.length - 1; k > 0; k--) {
          const r = Math.floor(Math.random() * (k + 1))
          ;[rest[k], rest[r]] = [rest[r], rest[k]]
        }
        const slotsLeft = Math.max(0, roundTotal - forcedItems.length)
        const combined = [...forcedItems, ...rest.slice(0, slotsLeft)]
        for (let k = combined.length - 1; k > 0; k--) {
          const r = Math.floor(Math.random() * (k + 1))
          ;[combined[k], combined[r]] = [combined[r], combined[k]]
        }
        participants = combined
      } else {
        participants = pool.slice(0, roundTotal)
      }
    }

    if (participants.length < 2) throw new Error('참가 항목이 2개 미만입니다')

    // 마스터 대회: 설정 스냅샷 + 부 계산
    let settingsSnapshot: string | null = null
    const divisionMap = new Map<number, number>()
    if (tournament.is_master) {
      const settings = db().prepare(`SELECT settings_json FROM ranking_settings WHERE type = ?`).get(tournament.type) as { settings_json: string } | undefined
      settingsSnapshot = settings?.settings_json ?? null
      const allItems = tournament.type === 'actor'
        ? db().prepare(`SELECT id FROM actors`).all() as { id: number }[]
        : db().prepare(`SELECT id FROM works`).all() as { id: number }[]
      const rankingRows = db().prepare(`
        SELECT item_id, SUM(points) AS total_points
        FROM (SELECT item_id, points, ROW_NUMBER() OVER (PARTITION BY item_id ORDER BY recorded_at DESC) AS rn FROM master_ranking_history WHERE type = ?) WHERE rn <= 10
        GROUP BY item_id
      `).all(tournament.type) as { item_id: number; total_points: number }[]
      const pointsMap = new Map(rankingRows.map(r => [r.item_id, r.total_points]))
      const sorted = [...allItems].sort((a, b) => (pointsMap.get(b.id) ?? 0) - (pointsMap.get(a.id) ?? 0))
      const divBoundaries = [32, 96, 224, 480, 992, 2016]
      sorted.forEach((item, idx) => {
        const rank = idx + 1
        let div = 0
        for (let d = 0; d < divBoundaries.length; d++) {
          if (rank <= divBoundaries[d]) { div = d + 1; break }
        }
        divisionMap.set(item.id, div)
      })
    }

    let runId: number
    db().transaction(() => {
      // cup_run 생성
      const runResult = db().prepare(
        `INSERT INTO cup_runs (tournament_id, status, round_total, settings_snapshot, started_at) VALUES (?, 'in_progress', ?, ?, datetime('now'))`
      ).run(tournamentId, roundTotal, settingsSnapshot)
      runId = runResult.lastInsertRowid as number

      const insertEntry = db().prepare(`INSERT OR IGNORE INTO cup_entries (run_id, item_id, division) VALUES (?, ?, ?)`)
      for (const p of participants) insertEntry.run(runId, p.id, tournament.is_master ? (divisionMap.get(p.id) ?? 0) : null)
      const upsertStat = db().prepare(`INSERT INTO cup_stats (type, item_id, total_cups) VALUES (?, ?, 0) ON CONFLICT(type, item_id) DO NOTHING`)
      for (const p of participants) upsertStat.run(tournament.type, p.id)

      if (tournament.format === 'tournament') {
        const totalCount = participants.length
        const roundSize = roundTotal === 0 ? (totalCount === 3 ? 4 : totalCount) : roundTotal
        const byeCount = roundSize - totalCount
        const shuffled = [...participants]
        const insertMatch = db().prepare(`INSERT INTO cup_matches (run_id, phase, round, match_index, item1_id, item2_id, winner_id, is_bye) VALUES (?, 'main', ?, ?, ?, ?, ?, ?)`)
        let matchIdx = 0
        if (roundTotal === 0) {
          for (let i = 0; i + 1 < totalCount; i += 2) insertMatch.run(runId, roundSize, matchIdx++, shuffled[i].id, shuffled[i + 1].id, null, 0)
          if (totalCount % 2 === 1) insertMatch.run(runId, roundSize, matchIdx++, shuffled[totalCount - 1].id, null, shuffled[totalCount - 1].id, 1)
        } else {
          for (let i = 0; i < byeCount; i++) insertMatch.run(runId, roundSize, matchIdx++, shuffled[i].id, null, shuffled[i].id, 1)
          for (let i = byeCount; i < totalCount; i += 2) insertMatch.run(runId, roundSize, matchIdx++, shuffled[i].id, shuffled[i + 1]?.id ?? null, null, 0)
        }
      } else if (tournament.format === 'league') {
        const insertMatch = db().prepare(`INSERT INTO cup_matches (run_id, phase, round, match_index, item1_id, item2_id) VALUES (?, 'main', 0, ?, ?, ?)`)
        let matchIdx = 0
        for (let i = 0; i < participants.length; i++) {
          for (let j = i + 1; j < participants.length; j++) {
            insertMatch.run(runId, matchIdx++, participants[i].id, participants[j].id)
          }
        }
      } else if (tournament.format === 'worldcup') {
        if (roundTotal === 0) throw new Error('월드컵은 강 수를 선택해야 합니다')
        const groupCount = roundTotal / 2
        if (participants.length < groupCount * 4) throw new Error(`조 구성 인원 부족 (${groupCount}조 × 최소 4명 = ${groupCount * 4}명 필요)`)

        const wcRankRows = db().prepare(`
          SELECT item_id, SUM(points) AS total_points
          FROM (SELECT item_id, points, ROW_NUMBER() OVER (PARTITION BY item_id ORDER BY recorded_at DESC) AS rn
                FROM master_ranking_history WHERE type = ?) WHERE rn <= 10
          GROUP BY item_id
        `).all(tournament.type) as { item_id: number; total_points: number }[]
        const wcPtsMap = new Map(wcRankRows.map(r => [r.item_id, r.total_points]))

        const wcRanked = participants.filter(p => (wcPtsMap.get(p.id) ?? 0) > 0)
          .sort((a, b) => (wcPtsMap.get(b.id) ?? 0) - (wcPtsMap.get(a.id) ?? 0))
        const wcUnranked = participants.filter(p => (wcPtsMap.get(p.id) ?? 0) === 0)
        for (let k = wcUnranked.length - 1; k > 0; k--) {
          const r = Math.floor(Math.random() * (k + 1))
          ;[wcUnranked[k], wcUnranked[r]] = [wcUnranked[r], wcUnranked[k]]
        }
        const wcSorted = [...wcRanked, ...wcUnranked]

        const wcGroups: number[][] = Array.from({ length: groupCount }, () => [])
        wcSorted.forEach((p, i) => wcGroups[i % groupCount].push(p.id))
        for (const group of wcGroups) {
          for (let k = group.length - 1; k > 0; k--) {
            const r = Math.floor(Math.random() * (k + 1))
            ;[group[k], group[r]] = [group[r], group[k]]
          }
        }

        const wcInsert = db().prepare(`INSERT INTO cup_matches (run_id, phase, group_id, round, match_index, item1_id, item2_id) VALUES (?, 'group', ?, 0, ?, ?, ?)`)
        let wcMatchIdx = 0
        for (let gIdx = 0; gIdx < wcGroups.length; gIdx++) {
          const group = wcGroups[gIdx]
          for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
              wcInsert.run(runId, gIdx + 1, wcMatchIdx++, group[i], group[j])
            }
          }
        }
      }
    })()

    const run = db().prepare(`SELECT * FROM cup_runs WHERE id = ?`).get(runId!)
    return { tournament: db().prepare(`SELECT * FROM cup_tournaments WHERE id = ?`).get(tournamentId), run }
  })

  ipcMain.handle('cup:pick', (_e, params: { matchId: number; winnerId: number | null; isDraw?: boolean }) => {
    const { matchId, winnerId, isDraw = false } = params
    const match = db().prepare(`SELECT * FROM cup_matches WHERE id = ?`).get(matchId) as {
      id: number; run_id: number; phase: string; round: number; match_index: number;
      item1_id: number; item2_id: number | null; winner_id: number | null; is_bye: number; is_draw: number
    } | undefined
    if (!match) throw new Error('매치를 찾을 수 없습니다')
    if (match.winner_id !== null || match.is_draw) throw new Error('이미 결과가 있는 매치입니다')

    const runRow = db().prepare(`
      SELECT r.*, t.type, t.format, t.is_master FROM cup_runs r
      JOIN cup_tournaments t ON t.id = r.tournament_id
      WHERE r.id = ?
    `).get(match.run_id) as {
      id: number; tournament_id: number; type: 'actor' | 'work'; format: string; is_master: number;
      round_total: number; settings_snapshot: string | null; status: string
    } | undefined
    if (!runRow) throw new Error('대회를 찾을 수 없습니다')
    const tournament = runRow

    const runId = match.run_id

    db().transaction(() => {
      if (isDraw) {
        db().prepare(`UPDATE cup_matches SET is_draw = 1 WHERE id = ?`).run(matchId)
        for (const itemId of [match.item1_id, match.item2_id]) {
          if (itemId !== null) {
            db().prepare(`INSERT INTO cup_stats (type, item_id, total_matches) VALUES (?, ?, 1) ON CONFLICT(type, item_id) DO UPDATE SET total_matches = total_matches + 1`).run(tournament.type, itemId)
          }
        }
      } else {
        db().prepare(`UPDATE cup_matches SET winner_id = ? WHERE id = ?`).run(winnerId, matchId)
        const loserId = match.item1_id === winnerId ? match.item2_id : match.item1_id
        if (winnerId !== null) {
          db().prepare(`INSERT INTO cup_stats (type, item_id, total_matches, match_wins) VALUES (?, ?, 1, 1) ON CONFLICT(type, item_id) DO UPDATE SET total_matches = total_matches + 1, match_wins = match_wins + 1`).run(tournament.type, winnerId)
        }
        if (loserId !== null) {
          db().prepare(`INSERT INTO cup_stats (type, item_id, total_matches) VALUES (?, ?, 1) ON CONFLICT(type, item_id) DO UPDATE SET total_matches = total_matches + 1`).run(tournament.type, loserId)
        }

        // 토너먼트 / 월드컵 본선: 라운드 완료 체크 → 다음 라운드 생성
        if (tournament.format === 'tournament' || (tournament.format === 'worldcup' && match.phase === 'main')) {
          const roundMatches = db().prepare(`SELECT * FROM cup_matches WHERE run_id = ? AND phase = ? AND round = ?`).all(runId, match.phase, match.round) as { winner_id: number | null; is_bye: number }[]
          const roundDone = roundMatches.every(m => m.winner_id !== null)
          if (roundDone) {
            const winners = roundMatches.map(m => m.winner_id!).filter(Boolean)
            if (winners.length === 1) {
              // run 완료
              db().prepare(`UPDATE cup_runs SET status = 'completed', winner_id = ?, completed_at = datetime('now') WHERE id = ?`).run(winners[0], runId)
              const entries = db().prepare(`SELECT item_id FROM cup_entries WHERE run_id = ?`).all(runId) as { item_id: number }[]
              for (const e of entries) {
                db().prepare(`INSERT INTO cup_stats (type, item_id, total_cups) VALUES (?, ?, 1) ON CONFLICT(type, item_id) DO UPDATE SET total_cups = total_cups + 1`).run(tournament.type, e.item_id)
              }
              db().prepare(`INSERT INTO cup_stats (type, item_id, cup_wins) VALUES (?, ?, 1) ON CONFLICT(type, item_id) DO UPDATE SET cup_wins = cup_wins + 1`).run(tournament.type, winners[0])
              calcAndStoreRunPoints(db(), runId, tournament.type, tournament.is_master === 1, tournament.settings_snapshot)
            } else {
              // 다음 라운드
              const isFullMode = tournament.round_total === 0
              const nextRoundSize = isFullMode && winners.length === 3 ? 4 : winners.length
              for (let k = winners.length - 1; k > 0; k--) {
                const r = Math.floor(Math.random() * (k + 1))
                ;[winners[k], winners[r]] = [winners[r], winners[k]]
              }
              const insertNext = db().prepare(`INSERT INTO cup_matches (run_id, phase, round, match_index, item1_id, item2_id) VALUES (?, 'main', ?, ?, ?, ?)`)
              for (let i = 0; i < winners.length; i += 2) {
                insertNext.run(runId, nextRoundSize, i / 2, winners[i], winners[i + 1] ?? null)
              }
            }
          }
        }
      }

      // 월드컵 조별 예선 완료 체크 → 본선 매치 생성
      if (tournament.format === 'worldcup' && match.phase === 'group') {
        const wcPending = (db().prepare(
          `SELECT COUNT(*) as cnt FROM cup_matches WHERE run_id = ? AND phase = 'group' AND winner_id IS NULL AND is_draw = 0`
        ).get(runId) as { cnt: number }).cnt
        if (wcPending === 0) {
          const wcGroupIds = (db().prepare(
            `SELECT DISTINCT group_id FROM cup_matches WHERE run_id = ? AND phase = 'group' ORDER BY group_id`
          ).all(runId) as { group_id: number }[]).map(r => r.group_id)

          const wcFirsts: { groupId: number; item_id: number }[] = []
          const wcSeconds: { groupId: number; item_id: number }[] = []
          for (const gid of wcGroupIds) {
            const gms = db().prepare(
              `SELECT * FROM cup_matches WHERE run_id = ? AND phase = 'group' AND group_id = ?`
            ).all(runId, gid) as { item1_id: number; item2_id: number | null; winner_id: number | null; is_draw: number }[]
            const itemSet = new Set<number>()
            gms.forEach(m => { itemSet.add(m.item1_id); if (m.item2_id) itemSet.add(m.item2_id) })
            const gs = Array.from(itemSet).map(item_id => {
              let pts = 0, w = 0
              for (const m of gms) {
                if (m.is_draw && (m.item1_id === item_id || m.item2_id === item_id)) pts += 1
                else if (m.winner_id === item_id) { pts += 3; w++ }
              }
              return { item_id, pts, w }
            }).sort((a, b) => b.pts - a.pts || b.w - a.w)
            if (gs[0]) wcFirsts.push({ groupId: gid, item_id: gs[0].item_id })
            if (gs[1]) wcSeconds.push({ groupId: gid, item_id: gs[1].item_id })
          }

          for (let k = wcFirsts.length - 1; k > 0; k--) {
            const r = Math.floor(Math.random() * (k + 1))
            ;[wcFirsts[k], wcFirsts[r]] = [wcFirsts[r], wcFirsts[k]]
          }
          const wcAvail = [...wcSeconds]
          const wcInsertMain = db().prepare(
            `INSERT INTO cup_matches (run_id, phase, round, match_index, item1_id, item2_id) VALUES (?, 'main', ?, ?, ?, ?)`
          )
          for (let i = 0; i < wcFirsts.length; i++) {
            const f = wcFirsts[i]
            const idx = wcAvail.findIndex(s => s.groupId !== f.groupId)
            const s = idx >= 0 ? wcAvail.splice(idx, 1)[0] : wcAvail.splice(0, 1)[0]
            wcInsertMain.run(runId, tournament.round_total, i, f.item_id, s.item_id)
          }
        }
      }
    })()

    return db().prepare(`SELECT * FROM cup_matches WHERE run_id = ? AND winner_id IS NULL AND is_bye = 0 AND is_draw = 0 ORDER BY phase DESC, round DESC, match_index ASC LIMIT 1`).get(runId) ?? { done: true }
  })

  ipcMain.handle('cup:complete', (_e, runId: number) => {
    const runRow = db().prepare(`
      SELECT r.*, t.type, t.format, t.is_master FROM cup_runs r
      JOIN cup_tournaments t ON t.id = r.tournament_id
      WHERE r.id = ?
    `).get(runId) as {
      id: number; type: 'actor' | 'work'; format: string; is_master: number; settings_snapshot: string | null
    } | undefined
    if (!runRow) throw new Error('대회를 찾을 수 없습니다')
    const tournament = runRow
    const pending = db().prepare(`SELECT 1 FROM cup_matches WHERE run_id = ? AND winner_id IS NULL AND is_draw = 0 AND is_bye = 0 LIMIT 1`).get(runId)
    if (pending) throw new Error('완료되지 않은 매치가 있습니다')

    const entries = db().prepare(`SELECT item_id FROM cup_entries WHERE run_id = ?`).all(runId) as { item_id: number }[]
    const allMatches = db().prepare(`SELECT * FROM cup_matches WHERE run_id = ?`).all(runId) as { item1_id: number; item2_id: number | null; winner_id: number | null; is_draw: number }[]
    const standings = entries.map(({ item_id }) => {
      let pts = 0, w = 0
      for (const m of allMatches) {
        if (m.is_draw && (m.item1_id === item_id || m.item2_id === item_id)) { pts += 1 }
        else if (m.winner_id === item_id) { pts += 3; w++ }
      }
      return { item_id, pts, w }
    }).sort((a, b) => b.pts - a.pts || b.w - a.w)
    const winnerId = standings[0]?.item_id ?? null

    db().transaction(() => {
      db().prepare(`UPDATE cup_runs SET status = 'completed', winner_id = ?, completed_at = datetime('now') WHERE id = ?`).run(winnerId, runId)
      for (const e of entries) {
        db().prepare(`INSERT INTO cup_stats (type, item_id, total_cups) VALUES (?, ?, 1) ON CONFLICT(type, item_id) DO UPDATE SET total_cups = total_cups + 1`).run(tournament.type, e.item_id)
      }
      if (winnerId) {
        db().prepare(`INSERT INTO cup_stats (type, item_id, cup_wins) VALUES (?, ?, 1) ON CONFLICT(type, item_id) DO UPDATE SET cup_wins = cup_wins + 1`).run(tournament.type, winnerId)
      }
      calcAndStoreRunPoints(db(), runId, tournament.type, tournament.is_master === 1, tournament.settings_snapshot)
    })()

    return { ok: true, winnerId }
  })

  ipcMain.handle('cup:tournament-rankings', (_e, params: {
    tournamentId: number; limit?: number; offset?: number;
    sortBy?: string; sortDir?: string; search?: string
  }) => {
    const { tournamentId, limit = 50, offset = 0, sortBy = 'win_rate', sortDir = 'desc', search } = params
    const t = db().prepare(`SELECT type FROM cup_tournaments WHERE id = ?`).get(tournamentId) as { type: 'actor' | 'work' } | undefined
    if (!t) return { rows: [], total: 0 }
    const type = t.type
    const dir = sortDir === 'asc' ? 'ASC' : 'DESC'
    const sortColMap: Record<string, string> = { win_rate: 'win_rate', match_win_rate: 'match_win_rate', run_wins: 'run_wins', total_runs: 'total_runs', total_pts: 'total_pts' }
    const sortCol = sortColMap[sortBy] ?? 'win_rate'
    const searchWhere = search
      ? (type === 'actor' ? 'AND a.name LIKE ?' : 'AND (w.title LIKE ? OR w.product_number LIKE ?)')
      : ''
    const searchBindings: unknown[] = search
      ? (type === 'work' ? [`%${search}%`, `%${search}%`] : [`%${search}%`])
      : []
    const baseCte = `
      WITH entry_stats AS (
        SELECT e.item_id,
          COUNT(DISTINCT e.run_id) AS total_runs,
          SUM(CASE WHEN r.winner_id = e.item_id THEN 1 ELSE 0 END) AS run_wins
        FROM cup_entries e
        JOIN cup_runs r ON r.id = e.run_id AND r.tournament_id = ? AND r.status = 'completed'
        GROUP BY e.item_id
      ),
      match_parts AS (
        SELECT m.item1_id AS item_id,
          CASE WHEN m.is_bye = 0 AND (m.winner_id IS NOT NULL OR m.is_draw = 1) THEN 1 ELSE 0 END AS is_played,
          CASE WHEN m.winner_id = m.item1_id THEN 1 ELSE 0 END AS is_win
        FROM cup_matches m
        JOIN cup_runs r ON r.id = m.run_id AND r.tournament_id = ? AND r.status = 'completed'
        UNION ALL
        SELECT m.item2_id AS item_id,
          CASE WHEN m.is_bye = 0 AND (m.winner_id IS NOT NULL OR m.is_draw = 1) THEN 1 ELSE 0 END AS is_played,
          CASE WHEN m.winner_id = m.item2_id THEN 1 ELSE 0 END AS is_win
        FROM cup_matches m
        JOIN cup_runs r ON r.id = m.run_id AND r.tournament_id = ? AND r.status = 'completed'
        WHERE m.item2_id IS NOT NULL
      ),
      match_stats AS (
        SELECT item_id, SUM(is_played) AS total_matches, SUM(is_win) AS match_wins
        FROM match_parts GROUP BY item_id
      ),
      pts_agg AS (
        SELECT mh.item_id, SUM(mh.pts) AS total_pts
        FROM master_ranking_history mh
        JOIN cup_runs r ON r.id = mh.run_id AND r.tournament_id = ?
        GROUP BY mh.item_id
      ),
      combined AS (
        SELECT es.item_id, es.total_runs, es.run_wins,
          COALESCE(ms.total_matches, 0) AS total_matches,
          COALESCE(ms.match_wins, 0) AS match_wins,
          CASE WHEN es.total_runs > 0 THEN CAST(es.run_wins AS REAL) * 100.0 / es.total_runs ELSE 0 END AS win_rate,
          CASE WHEN COALESCE(ms.total_matches, 0) > 0 THEN CAST(COALESCE(ms.match_wins, 0) AS REAL) * 100.0 / ms.total_matches ELSE 0 END AS match_win_rate,
          COALESCE(pa.total_pts, 0) AS total_pts
        FROM entry_stats es LEFT JOIN match_stats ms ON ms.item_id = es.item_id
        LEFT JOIN pts_agg pa ON pa.item_id = es.item_id
      )
    `
    if (type === 'actor') {
      const rows = db().prepare(`${baseCte}
        SELECT c.*, a.name, a.photo_path
        FROM combined c LEFT JOIN actors a ON a.id = c.item_id
        WHERE 1=1 ${searchWhere}
        ORDER BY c.${sortCol} ${dir}, c.item_id ASC
        LIMIT ? OFFSET ?
      `).all(tournamentId, tournamentId, tournamentId, tournamentId, ...searchBindings, limit, offset)
      const total = (db().prepare(`${baseCte}
        SELECT COUNT(*) AS cnt FROM combined c LEFT JOIN actors a ON a.id = c.item_id WHERE 1=1 ${searchWhere}
      `).get(tournamentId, tournamentId, tournamentId, tournamentId, ...searchBindings) as { cnt: number }).cnt
      return { rows, total }
    } else {
      const rows = db().prepare(`${baseCte}
        SELECT c.*, w.title, w.product_number, w.cover_path
        FROM combined c LEFT JOIN works w ON w.id = c.item_id
        WHERE 1=1 ${searchWhere}
        ORDER BY c.${sortCol} ${dir}, c.item_id ASC
        LIMIT ? OFFSET ?
      `).all(tournamentId, tournamentId, tournamentId, tournamentId, ...searchBindings, limit, offset)
      const total = (db().prepare(`${baseCte}
        SELECT COUNT(*) AS cnt FROM combined c LEFT JOIN works w ON w.id = c.item_id WHERE 1=1 ${searchWhere}
      `).get(tournamentId, tournamentId, tournamentId, tournamentId, ...searchBindings) as { cnt: number }).cnt
      return { rows, total }
    }
  })

  ipcMain.handle('cup:last-run-rankings', (_e, params: { tournamentId: number; limit?: number; offset?: number }) => {
    const { tournamentId, limit = 50, offset = 0 } = params
    const t = db().prepare(`SELECT type, format FROM cup_tournaments WHERE id = ?`).get(tournamentId) as { type: 'actor' | 'work'; format: 'tournament' | 'league' | 'worldcup' } | undefined
    if (!t) return { rows: [], total: 0, runId: null }
    const run = db().prepare(`SELECT * FROM cup_runs WHERE tournament_id = ? AND status = 'completed' ORDER BY id DESC LIMIT 1`).get(tournamentId) as { id: number; winner_id: number | null } | undefined
    if (!run) return { rows: [], total: 0, runId: null }
    const runId = run.id
    const type = t.type
    const format = t.format

    let statRows: { item_id: number; elim_round: number | null; pts: number | null }[]
    if (format === 'league') {
      statRows = db().prepare(`
        SELECT e.item_id, NULL AS elim_round,
          COALESCE((
            SELECT SUM(CASE WHEN m.winner_id = e.item_id THEN 3 WHEN m.is_draw = 1 THEN 1 ELSE 0 END)
            FROM cup_matches m WHERE m.run_id = e.run_id
              AND (m.item1_id = e.item_id OR m.item2_id = e.item_id)
              AND m.is_bye = 0 AND (m.winner_id IS NOT NULL OR m.is_draw = 1)
          ), 0) AS pts
        FROM cup_entries e WHERE e.run_id = ?
        ORDER BY pts DESC, e.item_id ASC
      `).all(runId) as typeof statRows
    } else if (format === 'worldcup') {
      statRows = db().prepare(`
        SELECT e.item_id,
          CASE WHEN r.winner_id = e.item_id THEN NULL
            ELSE COALESCE((
              SELECT m.round FROM cup_matches m
              WHERE m.run_id = e.run_id AND m.phase = 'main'
                AND (m.item1_id = e.item_id OR m.item2_id = e.item_id)
                AND m.winner_id IS NOT NULL AND m.winner_id != e.item_id AND m.is_bye = 0
              ORDER BY m.round DESC LIMIT 1
            ), 0)
          END AS elim_round,
          COALESCE((
            SELECT SUM(CASE WHEN m.winner_id = e.item_id THEN 3 WHEN m.is_draw = 1 THEN 1 ELSE 0 END)
            FROM cup_matches m WHERE m.run_id = e.run_id AND m.phase = 'group'
              AND (m.item1_id = e.item_id OR m.item2_id = e.item_id)
              AND m.is_bye = 0 AND (m.winner_id IS NOT NULL OR m.is_draw = 1)
          ), 0) AS pts
        FROM cup_entries e JOIN cup_runs r ON r.id = e.run_id
        WHERE e.run_id = ?
        ORDER BY
          CASE WHEN r.winner_id = e.item_id THEN 1 ELSE 0 END DESC,
          CASE WHEN EXISTS (SELECT 1 FROM cup_matches m WHERE m.run_id = e.run_id AND m.phase = 'main' AND (m.item1_id = e.item_id OR m.item2_id = e.item_id)) THEN 1 ELSE 0 END DESC,
          COALESCE(elim_round, 99999) DESC,
          pts DESC,
          e.item_id ASC
      `).all(runId) as typeof statRows
    } else {
      statRows = db().prepare(`
        SELECT e.item_id,
          CASE WHEN r.winner_id = e.item_id THEN NULL
            ELSE (
              SELECT m.round FROM cup_matches m
              WHERE m.run_id = e.run_id
                AND (m.item1_id = e.item_id OR m.item2_id = e.item_id)
                AND m.winner_id IS NOT NULL AND m.winner_id != e.item_id AND m.is_bye = 0
              ORDER BY m.round DESC LIMIT 1
            )
          END AS elim_round,
          NULL AS pts
        FROM cup_entries e JOIN cup_runs r ON r.id = e.run_id
        WHERE e.run_id = ?
        ORDER BY
          CASE WHEN r.winner_id = e.item_id THEN 99999 ELSE COALESCE(elim_round, 0) END DESC,
          e.item_id ASC
      `).all(runId) as typeof statRows
    }

    const total = statRows.length
    const pageRows = statRows.slice(offset, offset + limit)
    if (pageRows.length === 0) return { rows: [], total, runId }

    const ids = pageRows.map(r => r.item_id)
    const placeholders = ids.map(() => '?').join(',')
    const infoMap = new Map<number, Record<string, unknown>>()
    if (type === 'actor') {
      const actors = db().prepare(`SELECT id, name, photo_path FROM actors WHERE id IN (${placeholders})`).all(...ids) as { id: number }[]
      actors.forEach(a => infoMap.set(a.id, a as Record<string, unknown>))
    } else {
      const works = db().prepare(`SELECT id, title, product_number, cover_path FROM works WHERE id IN (${placeholders})`).all(...ids) as { id: number }[]
      works.forEach(w => infoMap.set(w.id, w as Record<string, unknown>))
    }

    const rows = pageRows.map((r, i) => ({
      rank: offset + i + 1,
      ...r,
      ...(infoMap.get(r.item_id) ?? {}),
    }))
    return { rows, total, runId, format }
  })

}
