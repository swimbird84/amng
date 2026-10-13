import { ipcMain } from 'electron'
import { getDatabase } from './db'
import { getRecentRunLimit, buildPointsCte, getDivBoundaries } from './ipc-cup'

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
    const txn = db().transaction(() => {
      // Remove existing placement if any
      db().prepare('DELETE FROM tier_items WHERE set_id = ? AND item_id = ?').run(setId, itemId)
      // Re-number existing items in target level to remove gaps
      const existing = db().prepare(
        'SELECT id FROM tier_items WHERE set_id = ? AND level_id = ? ORDER BY sort_order'
      ).all(setId, levelId) as { id: number }[]
      existing.forEach((row, i) => {
        db().prepare('UPDATE tier_items SET sort_order = ? WHERE id = ?').run(i, row.id)
      })
      // Shift items at and after sortOrder
      db().prepare('UPDATE tier_items SET sort_order = sort_order + 1 WHERE set_id = ? AND level_id = ? AND sort_order >= ?').run(setId, levelId, sortOrder)
      // Insert
      db().prepare('INSERT INTO tier_items (set_id, level_id, item_id, sort_order) VALUES (?, ?, ?, ?)').run(setId, levelId, itemId, sortOrder)
    })
    txn()
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

  ipcMain.handle('tier:masterLevelCounts', (_e, type: 'actor' | 'work') => {
    const set = db().prepare('SELECT id FROM tier_sets WHERE type = ? AND is_master = 1').get(type) as { id: number } | undefined
    if (!set) return { levels: [], unplacedCount: 0 }
    const levels = db().prepare(`
      SELECT tl.id, tl.name, tl.color, tl.sort_order, COUNT(ti.id) AS count
      FROM tier_levels tl
      LEFT JOIN tier_items ti ON ti.level_id = tl.id AND ti.set_id = ?
      WHERE tl.set_id = ?
      GROUP BY tl.id
      ORDER BY tl.sort_order
    `).all(set.id, set.id)
    const placedCount = (db().prepare('SELECT COUNT(*) AS cnt FROM tier_items WHERE set_id = ?').get(set.id) as { cnt: number }).cnt
    const totalItems = type === 'actor'
      ? (db().prepare('SELECT COUNT(*) AS cnt FROM actors WHERE is_deleted = 0 AND is_excluded = 0').get() as { cnt: number }).cnt
      : (db().prepare('SELECT COUNT(*) AS cnt FROM works').get() as { cnt: number }).cnt
    return { levels, unplacedCount: totalItems - placedCount }
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

  // ========== 리그⇄티어 비교 ==========

  ipcMain.handle('tier:league-tier-cross', (_e, type: 'actor' | 'work') => {
    const rl = getRecentRunLimit(db(), type)
    const ptsCte = buildPointsCte(type, rl, 'pts', true, null)
    const srf = 'AND r.season_id IS NULL'

    // 마스터 티어 레벨 정보
    const set = db().prepare('SELECT id FROM tier_sets WHERE type = ? AND is_master = 1').get(type) as { id: number } | undefined
    const tierLevels = set
      ? db().prepare('SELECT id, name, color, sort_order FROM tier_levels WHERE set_id = ? ORDER BY sort_order').all(set.id) as { id: number; name: string; color: string; sort_order: number }[]
      : []

    if (type === 'actor') {
      const items = db().prepare(`
        SELECT a.id, a.name, a.photo_path,
          RANK() OVER (ORDER BY COALESCE(pts.total_points, 0) DESC) AS cup_rank,
          COALESCE(mrc.cnt, 0) AS master_run_count,
          td.tier_level_id, td.tier_name, td.tier_color, td.tier_level_order
        FROM actors a
        LEFT JOIN ${ptsCte} ON pts.item_id = a.id
        LEFT JOIN (
          SELECT e.item_id, COUNT(DISTINCT r.id) AS cnt
          FROM cup_entries e
          JOIN cup_runs r ON r.id = e.run_id AND r.status = 'completed' ${srf}
          JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1 AND t.type = 'actor'
          GROUP BY e.item_id
        ) mrc ON mrc.item_id = a.id
        LEFT JOIN (
          SELECT ti.item_id, tl.id AS tier_level_id, tl.name AS tier_name, tl.color AS tier_color, tl.sort_order AS tier_level_order
          FROM tier_items ti
          JOIN tier_levels tl ON tl.id = ti.level_id
          ${set ? `JOIN tier_sets ts ON ts.id = ti.set_id AND ts.type = 'actor' AND ts.is_master = 1` : 'WHERE 0'}
        ) td ON td.item_id = a.id
        WHERE a.is_deleted = 0 AND is_excluded = 0
      `).all()
      return { items, tierLevels }
    } else {
      const items = db().prepare(`
        SELECT w.id, COALESCE(w.product_number, w.title) AS name, w.cover_path AS photo_path,
          RANK() OVER (ORDER BY COALESCE(pts.total_points, 0) DESC) AS cup_rank,
          COALESCE(mrc.cnt, 0) AS master_run_count,
          td.tier_level_id, td.tier_name, td.tier_color, td.tier_level_order
        FROM works w
        LEFT JOIN ${ptsCte} ON pts.item_id = w.id
        LEFT JOIN (
          SELECT e.item_id, COUNT(DISTINCT r.id) AS cnt
          FROM cup_entries e
          JOIN cup_runs r ON r.id = e.run_id AND r.status = 'completed' ${srf}
          JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1 AND t.type = 'work'
          GROUP BY e.item_id
        ) mrc ON mrc.item_id = w.id
        LEFT JOIN (
          SELECT ti.item_id, tl.id AS tier_level_id, tl.name AS tier_name, tl.color AS tier_color, tl.sort_order AS tier_level_order
          FROM tier_items ti
          JOIN tier_levels tl ON tl.id = ti.level_id
          ${set ? `JOIN tier_sets ts ON ts.id = ti.set_id AND ts.type = 'work' AND ts.is_master = 1` : 'WHERE 0'}
        ) td ON td.item_id = w.id
      `).all()
      return { items, tierLevels }
    }
  })

  // ========== 티어 기준 분포 ==========

  // 작품 마스터티어 배우 분포
  ipcMain.handle('tier:work-actor-distribution', (_e) => {
    const set = db().prepare('SELECT id FROM tier_sets WHERE type = ? AND is_master = 1').get('work') as { id: number } | undefined
    if (!set) return { levels: [], allActors: [] }

    // 티어에 배치된 작품 + 레벨 정보
    const placedWorks = db().prepare(`
      SELECT ti.item_id AS work_id, tl.id AS level_id, tl.name AS level_name, tl.color AS level_color, tl.sort_order
      FROM tier_items ti
      JOIN tier_levels tl ON tl.id = ti.level_id
      WHERE ti.set_id = ?
    `).all(set.id) as { work_id: number; level_id: number; level_name: string; level_color: string; sort_order: number }[]

    if (placedWorks.length === 0) return { levels: [], allActors: [] }

    const workLevelMap = new Map<number, typeof placedWorks[0]>()
    for (const w of placedWorks) workLevelMap.set(w.work_id, w)
    const workIds = placedWorks.map(w => w.work_id)

    // 작품 cup 순위 (참조용)
    const rl = getRecentRunLimit(db(), 'work')
    const ptsCte = buildPointsCte('work', rl, 'pts', true, null)
    const cupRanks = db().prepare(`
      SELECT w.id, RANK() OVER (ORDER BY COALESCE(pts.total_points, 0) DESC) AS rank
      FROM works w LEFT JOIN ${ptsCte} ON pts.item_id = w.id
    `).all() as { id: number; rank: number }[]
    const cupRankMap = new Map<number, number>()
    for (const r of cupRanks) cupRankMap.set(r.id, r.rank)

    // 작품-배우 연결
    const waRows = db().prepare(`
      SELECT wa.work_id, wa.actor_id, a.name, a.photo_path
      FROM work_actors wa
      JOIN actors a ON a.id = wa.actor_id AND a.is_deleted = 0 AND is_excluded = 0
      WHERE wa.work_id IN (${workIds.map(() => '?').join(',')})
    `).all(...workIds) as { work_id: number; actor_id: number; name: string; photo_path: string | null }[]

    // 배우 cup 순위
    const actorRl = getRecentRunLimit(db(), 'actor')
    const actorPtsCte = buildPointsCte('actor', actorRl)
    const actorRanks = db().prepare(`
      SELECT a.id, RANK() OVER (ORDER BY COALESCE(pts.total_points, 0) DESC) AS actor_rank
      FROM actors a LEFT JOIN ${actorPtsCte} ON pts.item_id = a.id
      WHERE a.is_deleted = 0 AND is_excluded = 0
    `).all() as { id: number; actor_rank: number }[]
    const actorRankMap = new Map<number, number>()
    for (const ar of actorRanks) actorRankMap.set(ar.id, ar.actor_rank)

    type ActorAgg = { id: number; name: string; photo_path: string | null; work_count: number; ranks: number[]; actor_rank: number | null }
    const levelMap = new Map<number, { level_name: string; level_color: string; sort_order: number; actors: Map<number, ActorAgg> }>()
    const allMap = new Map<number, ActorAgg>()

    for (const wa of waRows) {
      const lv = workLevelMap.get(wa.work_id)
      if (!lv) continue
      const cupRank = cupRankMap.get(wa.work_id) ?? 9999

      if (!levelMap.has(lv.level_id)) levelMap.set(lv.level_id, { level_name: lv.level_name, level_color: lv.level_color, sort_order: lv.sort_order, actors: new Map() })
      const lvData = levelMap.get(lv.level_id)!
      if (!lvData.actors.has(wa.actor_id)) lvData.actors.set(wa.actor_id, { id: wa.actor_id, name: wa.name, photo_path: wa.photo_path, work_count: 0, ranks: [], actor_rank: actorRankMap.get(wa.actor_id) ?? null })
      const lvAgg = lvData.actors.get(wa.actor_id)!
      lvAgg.work_count++
      lvAgg.ranks.push(cupRank)

      if (!allMap.has(wa.actor_id)) allMap.set(wa.actor_id, { id: wa.actor_id, name: wa.name, photo_path: wa.photo_path, work_count: 0, ranks: [], actor_rank: actorRankMap.get(wa.actor_id) ?? null })
      const aAgg = allMap.get(wa.actor_id)!
      aAgg.work_count++
      aAgg.ranks.push(cupRank)
    }

    const toResult = (agg: ActorAgg) => ({
      id: agg.id, name: agg.name, photo_path: agg.photo_path, work_count: agg.work_count,
      avg_rank: Math.round(agg.ranks.reduce((a, b) => a + b, 0) / agg.ranks.length * 10) / 10,
      best_rank: Math.min(...agg.ranks), worst_rank: Math.max(...agg.ranks), actor_rank: agg.actor_rank,
    })

    const levels = [...levelMap.entries()]
      .sort((a, b) => a[1].sort_order - b[1].sort_order)
      .map(([levelId, data]) => ({
        level_id: levelId, level_name: data.level_name, level_color: data.level_color,
        actors: [...data.actors.values()].map(toResult).sort((a, b) => b.work_count - a.work_count || a.avg_rank - b.avg_rank),
      }))

    const allActors = [...allMap.values()].map(toResult).sort((a, b) => b.work_count - a.work_count || a.avg_rank - b.avg_rank)
    return { levels, allActors }
  })

  // 작품 마스터티어 레이블 분포
  ipcMain.handle('tier:work-label-distribution', (_e) => {
    const set = db().prepare('SELECT id FROM tier_sets WHERE type = ? AND is_master = 1').get('work') as { id: number } | undefined
    if (!set) return { levels: [], allLabels: [] }

    const placedWorks = db().prepare(`
      SELECT ti.item_id AS work_id, tl.id AS level_id, tl.name AS level_name, tl.color AS level_color, tl.sort_order, w.studio_id
      FROM tier_items ti
      JOIN tier_levels tl ON tl.id = ti.level_id
      JOIN works w ON w.id = ti.item_id
      WHERE ti.set_id = ?
    `).all(set.id) as { work_id: number; level_id: number; level_name: string; level_color: string; sort_order: number; studio_id: number | null }[]

    if (placedWorks.length === 0) return { levels: [], allLabels: [] }

    const studios = db().prepare(`
      SELECT s.id, s.name, s.color, mk.name AS maker_name, mk.color AS maker_color
      FROM studios s LEFT JOIN makers mk ON mk.id = s.maker_id
    `).all() as { id: number; name: string; color: string | null; maker_name: string | null; maker_color: string | null }[]
    const studioMap = new Map(studios.map(s => [s.id, s]))

    // cup 순위 참조
    const rl = getRecentRunLimit(db(), 'work')
    const ptsCte = buildPointsCte('work', rl, 'pts', true, null)
    const cupRanks = db().prepare(`
      SELECT w.id, RANK() OVER (ORDER BY COALESCE(pts.total_points, 0) DESC) AS rank
      FROM works w LEFT JOIN ${ptsCte} ON pts.item_id = w.id
    `).all() as { id: number; rank: number }[]
    const cupRankMap = new Map<number, number>()
    for (const r of cupRanks) cupRankMap.set(r.id, r.rank)

    type LabelAgg = { id: number; name: string; color: string | null; maker_name: string | null; maker_color: string | null; work_count: number; ranks: number[] }
    const levelMap = new Map<number, { level_name: string; level_color: string; sort_order: number; labels: Map<number, LabelAgg> }>()
    const allMap = new Map<number, LabelAgg>()

    for (const pw of placedWorks) {
      if (!pw.studio_id) continue
      const studio = studioMap.get(pw.studio_id)
      if (!studio) continue
      const cupRank = cupRankMap.get(pw.work_id) ?? 9999

      if (!levelMap.has(pw.level_id)) levelMap.set(pw.level_id, { level_name: pw.level_name, level_color: pw.level_color, sort_order: pw.sort_order, labels: new Map() })
      const lvData = levelMap.get(pw.level_id)!
      if (!lvData.labels.has(studio.id)) lvData.labels.set(studio.id, { id: studio.id, name: studio.name, color: studio.color, maker_name: studio.maker_name, maker_color: studio.maker_color, work_count: 0, ranks: [] })
      const lvAgg = lvData.labels.get(studio.id)!
      lvAgg.work_count++
      lvAgg.ranks.push(cupRank)

      if (!allMap.has(studio.id)) allMap.set(studio.id, { id: studio.id, name: studio.name, color: studio.color, maker_name: studio.maker_name, maker_color: studio.maker_color, work_count: 0, ranks: [] })
      const aAgg = allMap.get(studio.id)!
      aAgg.work_count++
      aAgg.ranks.push(cupRank)
    }

    const toResult = (agg: LabelAgg) => ({
      id: agg.id, name: agg.name, color: agg.color, maker_name: agg.maker_name, maker_color: agg.maker_color, work_count: agg.work_count,
      avg_rank: Math.round(agg.ranks.reduce((a, b) => a + b, 0) / agg.ranks.length * 10) / 10,
      best_rank: Math.min(...agg.ranks), worst_rank: Math.max(...agg.ranks),
    })

    const levels = [...levelMap.entries()]
      .sort((a, b) => a[1].sort_order - b[1].sort_order)
      .map(([levelId, data]) => ({
        level_id: levelId, level_name: data.level_name, level_color: data.level_color,
        labels: [...data.labels.values()].map(toResult).sort((a, b) => b.work_count - a.work_count || a.avg_rank - b.avg_rank),
      }))

    const allLabels = [...allMap.values()].map(toResult).sort((a, b) => b.work_count - a.work_count || a.avg_rank - b.avg_rank)
    return { levels, allLabels }
  })

  // 작품 마스터티어 제작사 분포
  ipcMain.handle('tier:work-maker-distribution', (_e) => {
    const set = db().prepare('SELECT id FROM tier_sets WHERE type = ? AND is_master = 1').get('work') as { id: number } | undefined
    if (!set) return { levels: [], allMakers: [] }

    const placedWorks = db().prepare(`
      SELECT ti.item_id AS work_id, tl.id AS level_id, tl.name AS level_name, tl.color AS level_color, tl.sort_order, w.studio_id
      FROM tier_items ti
      JOIN tier_levels tl ON tl.id = ti.level_id
      JOIN works w ON w.id = ti.item_id
      WHERE ti.set_id = ?
    `).all(set.id) as { work_id: number; level_id: number; level_name: string; level_color: string; sort_order: number; studio_id: number | null }[]

    if (placedWorks.length === 0) return { levels: [], allMakers: [] }

    const studios = db().prepare(`
      SELECT s.id, s.name, s.color, s.maker_id, mk.name AS maker_name, mk.color AS maker_color
      FROM studios s LEFT JOIN makers mk ON mk.id = s.maker_id
    `).all() as { id: number; name: string; color: string | null; maker_id: number | null; maker_name: string | null; maker_color: string | null }[]
    const studioMap = new Map(studios.map(s => [s.id, s]))

    const rl = getRecentRunLimit(db(), 'work')
    const ptsCte = buildPointsCte('work', rl, 'pts', true, null)
    const cupRanks = db().prepare(`
      SELECT w.id, RANK() OVER (ORDER BY COALESCE(pts.total_points, 0) DESC) AS rank
      FROM works w LEFT JOIN ${ptsCte} ON pts.item_id = w.id
    `).all() as { id: number; rank: number }[]
    const cupRankMap = new Map<number, number>()
    for (const r of cupRanks) cupRankMap.set(r.id, r.rank)

    type MakerAgg = { id: number; name: string; color: string | null; work_count: number; label_count: number; ranks: number[]; labelIds: Set<number> }
    const levelMap = new Map<number, { level_name: string; level_color: string; sort_order: number; makers: Map<number, MakerAgg> }>()
    const allMap = new Map<number, MakerAgg>()

    for (const pw of placedWorks) {
      if (!pw.studio_id) continue
      const studio = studioMap.get(pw.studio_id)
      if (!studio || !studio.maker_id) continue
      const cupRank = cupRankMap.get(pw.work_id) ?? 9999

      if (!levelMap.has(pw.level_id)) levelMap.set(pw.level_id, { level_name: pw.level_name, level_color: pw.level_color, sort_order: pw.sort_order, makers: new Map() })
      const lvData = levelMap.get(pw.level_id)!
      if (!lvData.makers.has(studio.maker_id)) lvData.makers.set(studio.maker_id, { id: studio.maker_id, name: studio.maker_name!, color: studio.maker_color, work_count: 0, label_count: 0, ranks: [], labelIds: new Set() })
      const lvAgg = lvData.makers.get(studio.maker_id)!
      lvAgg.work_count++
      lvAgg.ranks.push(cupRank)
      lvAgg.labelIds.add(studio.id)

      if (!allMap.has(studio.maker_id)) allMap.set(studio.maker_id, { id: studio.maker_id, name: studio.maker_name!, color: studio.maker_color, work_count: 0, label_count: 0, ranks: [], labelIds: new Set() })
      const aAgg = allMap.get(studio.maker_id)!
      aAgg.work_count++
      aAgg.ranks.push(cupRank)
      aAgg.labelIds.add(studio.id)
    }

    const toResult = (agg: MakerAgg) => ({
      id: agg.id, name: agg.name, color: agg.color, work_count: agg.work_count, label_count: agg.labelIds.size,
      avg_rank: Math.round(agg.ranks.reduce((a, b) => a + b, 0) / agg.ranks.length * 10) / 10,
      best_rank: Math.min(...agg.ranks), worst_rank: Math.max(...agg.ranks),
    })

    const levels = [...levelMap.entries()]
      .sort((a, b) => a[1].sort_order - b[1].sort_order)
      .map(([levelId, data]) => ({
        level_id: levelId, level_name: data.level_name, level_color: data.level_color,
        makers: [...data.makers.values()].map(toResult).sort((a, b) => b.work_count - a.work_count || a.avg_rank - b.avg_rank),
      }))

    const allMakers = [...allMap.values()].map(toResult).sort((a, b) => b.work_count - a.work_count || a.avg_rank - b.avg_rank)
    return { levels, allMakers }
  })
}
