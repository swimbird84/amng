import { ipcMain } from 'electron'
import { getDatabase } from './db'

export function registerDashboardHandlers(): void {
  const db = () => getDatabase()

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

  ipcMain.handle('dashboard:rank-change-chart', (_e, params: { type: 'actor' | 'work'; limit?: number; rankFrom?: number; rankTo?: number; seasonId?: number }) => {
    const { type, limit = 10, rankFrom = 1, rankTo = 32, seasonId = null } = params
    // seasonFilterBare: 단독 테이블 쿼리용 (alias 없음)
    const seasonFilterBare = seasonId === -1 ? '' : (seasonId == null ? 'AND season_id IS NULL' : `AND season_id = ${seasonId}`)
    // seasonFilterMh: mh alias JOIN 쿼리용
    const seasonFilterMh = seasonId === -1 ? '' : (seasonId == null ? 'AND mh.season_id IS NULL' : `AND mh.season_id = ${seasonId}`)
    const seasonRunFilter = seasonId === -1 ? '' : (seasonId == null ? 'AND r.season_id IS NULL' : `AND r.season_id = ${seasonId}`)

    // recentRunLimit 설정 읽기
    const rlRow = db().prepare(`SELECT settings_json FROM ranking_settings WHERE type = ?`).get(type) as { settings_json: string } | undefined
    const recentRunLimit = rlRow ? (JSON.parse(rlRow.settings_json).recentRunLimit ?? 0) : 0

    // 1) 해당 부의 아이템 추출
    const nameCol = type === 'actor' ? 'a.name' : 'COALESCE(w.product_number, w.title)'
    const photoCol = type === 'actor' ? 'a.photo_path' : 'w.cover_path'
    const fromClause = type === 'actor' ? 'actors a' : 'works w'
    const idCol = type === 'actor' ? 'a.id' : 'w.id'

    // 포인트 CTE (recentRunLimit 반영)
    let ptsCte: string
    if (recentRunLimit <= 0) {
      ptsCte = `SELECT item_id, SUM(points) AS total_points FROM master_ranking_history WHERE type = '${type}' ${seasonFilterBare} GROUP BY item_id`
    } else {
      ptsCte = `SELECT item_id, SUM(points) AS total_points FROM (
        SELECT item_id, points, ROW_NUMBER() OVER (PARTITION BY item_id ORDER BY recorded_at DESC) AS rn
        FROM master_ranking_history WHERE type = '${type}' ${seasonFilterBare}
      ) WHERE rn <= ${recentRunLimit} GROUP BY item_id`
    }

    const nameSort = type === 'actor' ? `${nameCol} ASC` : `COALESCE(${nameCol}, '') ASC`
    const topItems = db().prepare(`
      WITH pts AS (${ptsCte}),
      mrc AS (
        SELECT item_id, COUNT(DISTINCT run_id) AS run_count
        FROM master_ranking_history WHERE type = '${type}' ${seasonFilterBare} GROUP BY item_id
      ),
      ranked AS (
        SELECT ${idCol} AS id, ${nameCol} AS name, ${photoCol} AS photo_path,
          COALESCE(pts.total_points, 0) AS total_points,
          COALESCE(mrc.run_count, 0) AS run_count,
          ROW_NUMBER() OVER (ORDER BY COALESCE(pts.total_points, 0) DESC, ${nameSort}) AS row_num,
          RANK() OVER (ORDER BY COALESCE(pts.total_points, 0) DESC) AS rank
        FROM ${fromClause}
        LEFT JOIN pts ON pts.item_id = ${idCol}
        LEFT JOIN mrc ON mrc.item_id = ${idCol}
        WHERE COALESCE(mrc.run_count, 0) > 0
      )
      SELECT * FROM ranked WHERE row_num >= ? AND row_num <= ?
    `).all(rankFrom, rankTo) as { id: number; name: string; photo_path: string | null; total_points: number; rank: number; row_num: number }[]

    if (topItems.length === 0) return { runs: [], series: [] }
    const itemIds = topItems.map(i => i.id)
    const itemMap = new Map(topItems.map(i => [i.id, i]))

    // 2) 완료된 마스터 대회 run 목록 (최근 limit개, 해당 시즌만)
    const runs = db().prepare(`
      SELECT r.id AS run_id, t.name AS tournament_name, r.completed_at
      FROM cup_runs r
      JOIN cup_tournaments t ON t.id = r.tournament_id
      WHERE r.status = 'completed' AND t.type = ? AND t.is_master = 1 ${seasonRunFilter}
      ORDER BY r.completed_at DESC
      LIMIT ?
    `).all(type, limit) as { run_id: number; tournament_name: string; completed_at: string }[]
    runs.reverse()

    if (runs.length === 0) return { runs: [], series: [] }

    // 3) 각 run 시점의 순위 계산 (recentRunLimit 반영)
    // 각 run의 completed_at 시점까지의 포인트로 순위 계산
    const runRanks = new Map<number, Map<number, number>>()
    const runDisplayRanks = new Map<number, Map<number, number>>()
    for (const run of runs) {
      let atTimeSql: string
      if (recentRunLimit <= 0) {
        atTimeSql = `SELECT item_id, SUM(points) AS total
          FROM master_ranking_history mh
          JOIN cup_runs r ON r.id = mh.run_id
          JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1
          WHERE mh.type = ? AND r.completed_at <= ? ${seasonFilterMh}
          GROUP BY item_id`
      } else {
        atTimeSql = `SELECT item_id, SUM(pts) AS total FROM (
          SELECT mh.item_id, mh.points AS pts,
            ROW_NUMBER() OVER (PARTITION BY mh.item_id ORDER BY mh.recorded_at DESC) AS rn
          FROM master_ranking_history mh
          JOIN cup_runs r ON r.id = mh.run_id
          JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1
          WHERE mh.type = ? AND r.completed_at <= ? ${seasonFilterMh}
        ) WHERE rn <= ${recentRunLimit} GROUP BY item_id`
      }
      const allPts = db().prepare(atTimeSql).all(type, run.completed_at) as { item_id: number; total: number }[]
      allPts.sort((a, b) => b.total - a.total)
      // rowNum: 위치용 (ROW_NUMBER 방식), displayRank: 표시용 (RANK 방식 - 동점 동순위)
      const rowNumMap = new Map<number, number>()
      const displayRankMap = new Map<number, number>()
      for (let i = 0; i < allPts.length; i++) {
        rowNumMap.set(allPts[i].item_id, i + 1)
        if (i === 0 || allPts[i].total < allPts[i - 1].total) {
          displayRankMap.set(allPts[i].item_id, i + 1)
        } else {
          displayRankMap.set(allPts[i].item_id, displayRankMap.get(allPts[i - 1].item_id)!)
        }
      }
      runRanks.set(run.run_id, rowNumMap)
      runDisplayRanks.set(run.run_id, displayRankMap)
    }

    // 4) 시계열 데이터 구성 (글로벌 순위 기준)
    const series = itemIds.map(id => {
      const info = itemMap.get(id)!
      const globalRanks = runs.map(r => {
        const rowMap = runRanks.get(r.run_id)
        return rowMap?.get(id) ?? null
      })
      const displayRanks = runs.map(r => {
        const drMap = runDisplayRanks.get(r.run_id)
        return drMap?.get(id) ?? null
      })
      return { id, name: info.name, photo_path: info.photo_path, currentRank: info.rank, ranks: globalRanks, globalRanks, displayRanks }
    })

    return {
      runs: runs.map(r => ({ runId: r.run_id, label: r.tournament_name, completedAt: r.completed_at })),
      series
    }
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

}
