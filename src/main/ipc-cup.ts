import { ipcMain } from 'electron'
import { getDatabase } from './db'

type DB = ReturnType<typeof getDatabase>

function getRecentRunLimit(database: DB, type: 'actor' | 'work'): number {
  const row = database.prepare(`SELECT settings_json FROM ranking_settings WHERE type = ?`).get(type) as { settings_json: string } | undefined
  if (!row) return 0
  const s = JSON.parse(row.settings_json)
  return s.recentRunLimit ?? 0
}

// recentRunLimit에 따른 포인트 집계 SQL 조각 생성
// limit=0: 전체 누적, limit>0: 최근 N회만 합산
function buildPointsCte(type: 'actor' | 'work', limit: number, alias = 'pts', masterOnly = true): string {
  const masterJoin = masterOnly
    ? `JOIN cup_runs r ON r.id = mh2.run_id JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1`
    : ''
  if (limit <= 0) {
    return `(SELECT mh2.item_id, SUM(mh2.points) AS total_points
      FROM master_ranking_history mh2 ${masterJoin}
      WHERE mh2.type = '${type}'
      GROUP BY mh2.item_id) ${alias}`
  }
  return `(SELECT mh.item_id, SUM(mh.points) AS total_points
    FROM (
      SELECT mh2.item_id, mh2.points, ROW_NUMBER() OVER (PARTITION BY mh2.item_id ORDER BY mh2.recorded_at DESC) AS rn
      FROM master_ranking_history mh2 ${masterJoin}
      WHERE mh2.type = '${type}'
    ) mh WHERE rn <= ${limit} GROUP BY mh.item_id) ${alias}`
}

// 특정 시점까지의 포인트 집계 SQL (rank-history, division-history용)
function buildPointsAtTimeSql(type: 'actor' | 'work', limit: number): string {
  if (limit <= 0) {
    return `SELECT mh.item_id, SUM(mh.points) AS total
      FROM master_ranking_history mh
      JOIN cup_runs r ON r.id = mh.run_id
      JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1
      WHERE mh.type = ? AND r.completed_at <= ?
      GROUP BY mh.item_id`
  }
  return `SELECT item_id, SUM(pts) AS total FROM (
    SELECT mh.item_id, mh.points AS pts,
      ROW_NUMBER() OVER (PARTITION BY mh.item_id ORDER BY mh.recorded_at DESC) AS rn
    FROM master_ranking_history mh
    JOIN cup_runs r ON r.id = mh.run_id
    JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1
    WHERE mh.type = ? AND r.completed_at <= ?
  ) WHERE rn <= ${limit} GROUP BY item_id`
}

function shuffleArr<T>(arr: T[]): T[] {
  for (let k = arr.length - 1; k > 0; k--) {
    const r = Math.floor(Math.random() * (k + 1))
    ;[arr[k], arr[r]] = [arr[r], arr[k]]
  }
  return arr
}

const DEFAULT_BASE_POINTS = { win: 3, draw: 1, loss: 0 }

function getBasePoints(database: DB, type: string): { win: number; draw: number; loss: number } {
  const row = database.prepare(`SELECT settings_json FROM ranking_settings WHERE type = ?`).get(type) as { settings_json: string } | undefined
  if (!row) return DEFAULT_BASE_POINTS
  try {
    const s = JSON.parse(row.settings_json)
    return s.basePoints ?? DEFAULT_BASE_POINTS
  } catch { return DEFAULT_BASE_POINTS }
}

function computeGroupStandings(
  matches: { item1_id: number; item2_id: number | null; winner_id: number | null; is_draw: number }[],
  pointValues: { win: number; draw: number }
): { item_id: number; pts: number; w: number; d: number; l: number }[] {
  const itemSet = new Set<number>()
  for (const m of matches) { itemSet.add(m.item1_id); if (m.item2_id != null) itemSet.add(m.item2_id) }
  return Array.from(itemSet).map(item_id => {
    let pts = 0, w = 0, d = 0, l = 0
    for (const m of matches) {
      const is1 = m.item1_id === item_id, is2 = m.item2_id === item_id
      if (!is1 && !is2) continue
      if (m.is_draw) { pts += pointValues.draw; d++ }
      else if (m.winner_id === item_id) { pts += pointValues.win; w++ }
      else if (m.winner_id != null) { l++ }
    }
    return { item_id, pts, w, d, l }
  }).sort((a, b) => b.pts - a.pts || b.w - a.w)
}

function getTiebreakInfo(standings: { item_id: number; pts: number; w: number }[]) {
  if (standings.length < 3)
    return { clearQualifiers: standings.slice(0, 2).map(s => s.item_id), tiedPlayers: [] as number[], qualifiersNeeded: 0 }
  if (standings[1].pts > standings[2].pts || (standings[1].pts === standings[2].pts && standings[1].w > standings[2].w))
    return { clearQualifiers: [standings[0].item_id, standings[1].item_id], tiedPlayers: [] as number[], qualifiersNeeded: 0 }
  const tiedPts = standings[1].pts, tiedW = standings[1].w
  const clearQualifiers = standings.filter(s => s.pts > tiedPts || (s.pts === tiedPts && s.w > tiedW)).map(s => s.item_id)
  const tiedPlayers = standings.filter(s => s.pts === tiedPts && s.w === tiedW).map(s => s.item_id)
  const qualifiersNeeded = 2 - clearQualifiers.length
  if (tiedPlayers.length <= qualifiersNeeded)
    return { clearQualifiers: [...clearQualifiers, ...tiedPlayers], tiedPlayers: [] as number[], qualifiersNeeded: 0 }
  return { clearQualifiers, tiedPlayers, qualifiersNeeded }
}

function getGroupQualifiers(database: DB, runId: number, groupId: number, format: string, type: string): number[] | null {
  const bp = getBasePoints(database, type)
  const groupMatches = database.prepare(
    `SELECT * FROM cup_matches WHERE run_id = ? AND group_id = ? AND phase = 'group'`
  ).all(runId, groupId) as { item1_id: number; item2_id: number | null; winner_id: number | null; is_draw: number }[]
  if (groupMatches.some(m => m.winner_id == null && !m.is_draw)) return null
  const standings = computeGroupStandings(groupMatches, bp)
  const info = getTiebreakInfo(standings)
  if (info.tiedPlayers.length === 0) return info.clearQualifiers.slice(0, 2)
  const tiebreakMatches = database.prepare(
    `SELECT * FROM cup_matches WHERE run_id = ? AND group_id = ? AND phase = 'tiebreak' ORDER BY round ASC, id ASC`
  ).all(runId, groupId) as { id: number; round: number; item1_id: number; item2_id: number | null; winner_id: number | null }[]
  if (tiebreakMatches.length === 0 || tiebreakMatches.some(m => m.winner_id == null)) return null
  const N = info.tiedPlayers.length
  // 가운틀렛 1: 처음 N-1개 경기 → Q1 = 마지막 승자
  const g1 = tiebreakMatches.slice(0, N - 1)
  if (g1.length < N - 1) return null
  const q1 = g1[g1.length - 1].winner_id!
  if (info.qualifiersNeeded === 1) {
    return [...info.clearQualifiers, q1].slice(0, 2)
  }
  // 가운틀렛 2: 이후 N-2개 경기 → Q2 = 마지막 승자
  const g2Players = info.tiedPlayers.filter(p => p !== q1)
  const g2 = tiebreakMatches.slice(N - 1)
  if (g2.length < g2Players.length - 1) return null
  const q2 = g2[g2.length - 1].winner_id!
  return [...info.clearQualifiers, q1, q2].slice(0, 2)
}

// 그룹 픽 처리: 필요 시 타이브레이크 매치 생성 (N파전, 가운틀렛 방식)
function processGroupPick(database: DB, runId: number, groupId: number, format: string, type: string): void {
  const bp = getBasePoints(database, type)
  const groupMatches = database.prepare(
    `SELECT * FROM cup_matches WHERE run_id = ? AND group_id = ? AND phase = 'group'`
  ).all(runId, groupId) as { item1_id: number; item2_id: number | null; winner_id: number | null; is_draw: number }[]
  if (groupMatches.some(m => m.winner_id == null && !m.is_draw)) return
  const standings = computeGroupStandings(groupMatches, bp)
  const info = getTiebreakInfo(standings)
  if (info.tiedPlayers.length === 0) return
  const tiebreakMatches = database.prepare(
    `SELECT * FROM cup_matches WHERE run_id = ? AND group_id = ? AND phase = 'tiebreak' ORDER BY round ASC, id ASC`
  ).all(runId, groupId) as { id: number; round: number; item1_id: number; item2_id: number | null; winner_id: number | null }[]

  const insertMatch = (round: number, item1: number, item2: number) => {
    const { mx } = database.prepare(`SELECT MAX(match_index) as mx FROM cup_matches WHERE run_id = ?`).get(runId) as { mx: number | null }
    database.prepare(
      `INSERT INTO cup_matches (run_id, phase, group_id, round, match_index, item1_id, item2_id) VALUES (?, 'tiebreak', ?, ?, ?, ?, ?)`
    ).run(runId, groupId, round, (mx ?? -1) + 1, item1, item2)
  }

  // 진행 중인 경기가 있으면 대기
  if (tiebreakMatches.some(m => m.winner_id == null)) return

  const N = info.tiedPlayers.length

  // ── 가운틀렛 1 (처음 N-1개 경기): 승자가 계속 싸워 Q1 결정 ──
  const g1 = tiebreakMatches.slice(0, N - 1)

  if (g1.length === 0) {
    // 가운틀렛 1 첫 경기 생성
    const players = shuffleArr([...info.tiedPlayers])
    insertMatch(1, players[0], players[1])
    return
  }

  if (g1.length < N - 1) {
    // 가운틀렛 1 진행 중: 승자가 다음 도전자와 대결
    const participated1 = new Set<number>()
    for (const m of g1) { participated1.add(m.item1_id); if (m.item2_id != null) participated1.add(m.item2_id) }
    const nextPlayer = info.tiedPlayers.find(p => !participated1.has(p))
    if (nextPlayer == null) return
    insertMatch(g1.length + 1, g1[g1.length - 1].winner_id!, nextPlayer)
    return
  }

  // 가운틀렛 1 완료 → Q1 확정
  if (info.qualifiersNeeded === 1) return

  // ── 가운틀렛 2 (이후 N-2개 경기): Q1 제외 나머지로 Q2 결정 ──
  const q1 = g1[g1.length - 1].winner_id!
  const g2Players = info.tiedPlayers.filter(p => p !== q1)
  const g2 = tiebreakMatches.slice(N - 1)

  if (g2.length === 0) {
    // 가운틀렛 2 첫 경기 생성
    const players = shuffleArr([...g2Players])
    insertMatch(N, players[0], players[1])
    return
  }

  if (g2.length < g2Players.length - 1) {
    // 가운틀렛 2 진행 중: 승자가 다음 도전자와 대결
    const participated2 = new Set<number>()
    for (const m of g2) { participated2.add(m.item1_id); if (m.item2_id != null) participated2.add(m.item2_id) }
    const nextPlayer = g2Players.find(p => !participated2.has(p))
    if (nextPlayer == null) return
    insertMatch(N + g2.length, g2[g2.length - 1].winner_id!, nextPlayer)
  }
}

// 리그전 전용: 모든 그룹 완료 시 토너먼트 1라운드 생성
function checkLeagueGroupsAdvance(database: DB, runId: number, type: string): void {
  const groupIds = (database.prepare(
    `SELECT DISTINCT group_id FROM cup_matches WHERE run_id = ? AND phase = 'group' ORDER BY group_id`
  ).all(runId) as { group_id: number }[]).map(r => r.group_id)
  const allQualifiers: number[] = []
  for (const gid of groupIds) {
    const q = getGroupQualifiers(database, runId, gid, 'league', type)
    if (q == null) return
    allQualifiers.push(...q)
  }
  shuffleArr(allQualifiers)
  const roundSize = allQualifiers.length
  const insertMain = database.prepare(
    `INSERT INTO cup_matches (run_id, phase, round, match_index, item1_id, item2_id, winner_id, is_bye) VALUES (?, 'main', ?, ?, ?, ?, ?, ?)`
  )
  let matchIdx = 0
  for (let i = 0; i < allQualifiers.length; i += 2) {
    if (i + 1 < allQualifiers.length) {
      insertMain.run(runId, roundSize, matchIdx++, allQualifiers[i], allQualifiers[i + 1], null, 0)
    } else {
      // 홀수 진출자: 마지막 1명 부전승
      insertMain.run(runId, roundSize, matchIdx++, allQualifiers[i], null, null, 1)
    }
  }
}

// 월드컵 전용: 블록 토너먼트 시작 (block_id 기준 16개 조 진출자 32명 → 고정 크로스 시딩)
function startBlock(database: DB, runId: number, blockId: number, type: string): void {
  const startGroupId = blockId * 16 + 1
  const endGroupId = blockId * 16 + 16
  const groupIds = (database.prepare(
    `SELECT DISTINCT group_id FROM cup_matches WHERE run_id = ? AND phase = 'group' AND group_id >= ? AND group_id <= ? ORDER BY group_id`
  ).all(runId, startGroupId, endGroupId) as { group_id: number }[]).map(r => r.group_id)
  const qualifiers: number[] = []
  for (const gid of groupIds) {
    const q = getGroupQualifiers(database, runId, gid, 'worldcup', type)
    if (q == null || q.length < 2) return
    qualifiers.push(q[0], q[1])
  }

  // 크로스 시딩: 상위 절반(1위/인접조2위)과 하위 절반(2위/인접조1위)으로 분리
  // → 같은 조 진출자가 블록 파이널 전까지 만나지 않도록 보장
  const topHalf: number[] = []
  const bottomHalf: number[] = []
  for (let i = 0; i < qualifiers.length; i += 4) {
    topHalf.push(qualifiers[i], qualifiers[i + 3])     // g(2j+1)-1위 vs g(2j+2)-2위
    bottomHalf.push(qualifiers[i + 2], qualifiers[i + 1]) // g(2j+2)-1위 vs g(2j+1)-2위
  }
  const seeded = [...topHalf, ...bottomHalf]
  const insertMain = database.prepare(
    `INSERT INTO cup_matches (run_id, phase, round, match_index, item1_id, item2_id, block_id) VALUES (?, 'main', ?, ?, ?, ?, ?)`
  )
  for (let i = 0; i < seeded.length; i += 2)
    insertMain.run(runId, seeded.length, i / 2, seeded[i], seeded[i + 1] ?? null, blockId)
}

// 월드컵 전용: 결승 라운드 시작 (각 블록 마지막 라운드 생존자 2인씩 → 인접 블록 쌍 크로스 시딩)
function startFinalRound(database: DB, runId: number, blockCount: number): void {
  const finalists: number[] = []
  for (let b = 0; b < blockCount; b++) {
    const survivors = database.prepare(
      `SELECT winner_id FROM cup_matches WHERE run_id = ? AND phase = 'main' AND block_id = ? AND round = 4 ORDER BY match_index ASC`
    ).all(runId, b) as { winner_id: number }[]
    finalists.push(...survivors.map(r => r.winner_id))
  }
  // 크로스 시딩: 상위 절반(A1 vs B2, C1 vs D2, ...)과 하위 절반(B1 vs A2, D1 vs C2, ...) 분리
  // → 같은 블록 생존자가 결승 라운드 파이널 전까지 만나지 않도록 보장
  const topHalf: number[] = []
  const bottomHalf: number[] = []
  for (let i = 0; i < finalists.length; i += 4) {
    topHalf.push(finalists[i], finalists[i + 3])     // A1 vs B2
    bottomHalf.push(finalists[i + 2], finalists[i + 1]) // B1 vs A2
  }
  const seeded = [...topHalf, ...bottomHalf]
  const insertFinal = database.prepare(
    `INSERT INTO cup_matches (run_id, phase, round, match_index, item1_id, item2_id, block_id) VALUES (?, 'main', ?, ?, ?, ?, NULL)`
  )
  for (let i = 0; i < seeded.length; i += 2)
    insertFinal.run(runId, seeded.length, i / 2, seeded[i], seeded[i + 1] ?? null)
}

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
    SELECT item1_id, item2_id, winner_id, is_draw, round, phase FROM cup_matches
    WHERE run_id = ? AND is_bye = 0 AND phase != 'tiebreak'
  `).all(runId) as {
    item1_id: number; item2_id: number | null; winner_id: number | null; is_draw: number; round: number; phase: string
  }[]

  const getDivWeight = (div: number, weights: number[]) =>
    div >= 1 && div <= weights.length ? weights[div - 1] : 1.0

  // ---- 매치 승점 계산 ----
  // 월드컵 main 페이즈: basePoints × worldcupMainMultiplier (D안)
  // 섞인 대회 (월드컵 group 포함): 매치마다 상대방 부 가중치 적용
  // 부별 대회 / 일반 대회: raw 승점만 누적 (가중치는 최종 단계에서 적용)
  const isWorldcup = run.format === 'worldcup'
  const wcMultiplier = ((settings as Record<string, unknown>).worldcupMainMultiplier as number) ?? 2.0
  const matchPts = new Map<number, number>()
  for (const m of matches) {
    if (m.item2_id === null) continue
    if (isWorldcup && m.phase === 'main') {
      // D안: 블록/결승 매치는 배율 적용 (상대 가중치 없음)
      if (m.is_draw) {
        matchPts.set(m.item1_id, (matchPts.get(m.item1_id) ?? 0) + settings.basePoints.draw * wcMultiplier)
        matchPts.set(m.item2_id, (matchPts.get(m.item2_id) ?? 0) + settings.basePoints.draw * wcMultiplier)
      } else if (m.winner_id !== null) {
        matchPts.set(m.winner_id, (matchPts.get(m.winner_id) ?? 0) + settings.basePoints.win * wcMultiplier)
      }
    } else if (isMixed) {
      const div1 = divMap.get(m.item1_id) ?? 0
      const div2 = divMap.get(m.item2_id) ?? 0
      if (m.is_draw) {
        matchPts.set(m.item1_id, (matchPts.get(m.item1_id) ?? 0) + settings.basePoints.draw * getDivWeight(div2, settings.opponentWeights))
        matchPts.set(m.item2_id, (matchPts.get(m.item2_id) ?? 0) + settings.basePoints.draw * getDivWeight(div1, settings.opponentWeights))
      } else if (m.winner_id !== null) {
        const loserId = m.item1_id === m.winner_id ? m.item2_id : m.item1_id
        matchPts.set(m.winner_id, (matchPts.get(m.winner_id) ?? 0) + settings.basePoints.win * getDivWeight(divMap.get(loserId) ?? 0, settings.opponentWeights))
      }
    } else if (isMaster && !isMixed) {
      // 부별 마스터: 본인 부 가중치 적용
      const div1 = divMap.get(m.item1_id) ?? 0
      const div2 = divMap.get(m.item2_id) ?? 0
      if (m.is_draw) {
        matchPts.set(m.item1_id, (matchPts.get(m.item1_id) ?? 0) + settings.basePoints.draw * getDivWeight(div1, settings.opponentWeights))
        matchPts.set(m.item2_id, (matchPts.get(m.item2_id) ?? 0) + settings.basePoints.draw * getDivWeight(div2, settings.opponentWeights))
      } else if (m.winner_id !== null) {
        const winnerDiv = divMap.get(m.winner_id) ?? 0
        matchPts.set(m.winner_id, (matchPts.get(m.winner_id) ?? 0) + settings.basePoints.win * getDivWeight(winnerDiv, settings.opponentWeights))
      }
    } else {
      // 일반(비마스터): 가중치 없음
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
    // 리그전: 본선 진출자 = 브래킷 순위, 조별 탈락자 = 본선 뒤에 matchPts 순
    const mainMatches = matches.filter(m => m.phase === 'main')
    const mainParticipants = new Set<number>()
    for (const m of mainMatches) {
      mainParticipants.add(m.item1_id)
      if (m.item2_id != null) mainParticipants.add(m.item2_id)
    }
    // 본선 진출자: 브래킷 순위
    if (run.winner_id !== null) rankMap.set(run.winner_id, 1)
    const roundGroups = new Map<number, number[]>()
    for (const m of mainMatches) {
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
    // 조별 탈락자: 본선 진출자 뒤에 matchPts 순 배치
    const maxMainRank = mainParticipants.size > 0 ? Math.max(...Array.from(mainParticipants).map(id => rankMap.get(id) ?? 0)) : 0
    const groupOnly = entries.filter(e => !mainParticipants.has(e.item_id))
    const sortedGroupOnly = [...groupOnly].sort((a, b) => (matchPts.get(b.item_id) ?? 0) - (matchPts.get(a.item_id) ?? 0))
    let goRank = maxMainRank + 1
    for (let i = 0; i < sortedGroupOnly.length; i++) {
      if (i > 0 && (matchPts.get(sortedGroupOnly[i].item_id) ?? 0) < (matchPts.get(sortedGroupOnly[i - 1].item_id) ?? 0)) goRank = maxMainRank + 1 + i
      rankMap.set(sortedGroupOnly[i].item_id, goRank)
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

  // ---- 최종 승점 계산 및 저장 ----
  // 매치승점(가중치 반영) + 순위보너스(고정값)
  // 월드컵만 보너스에 wcMultiplier 적용
  const insert = database.prepare(`
    INSERT INTO master_ranking_history (run_id, type, item_id, points, recorded_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `)
  for (const e of entries) {
    const mp = matchPts.get(e.item_id) ?? 0
    const rank = rankMap.get(e.item_id) ?? entryCount
    const bonus = getBonus(rank)
    const finalPts = isWorldcup ? mp + bonus * wcMultiplier : mp + bonus
    insert.run(runId, type, e.item_id, Math.round(finalPts * 10) / 10)
  }
}

// ========== 순위 스냅샷 저장 헬퍼 ==========
function saveRankSnapshot(
  database: ReturnType<typeof getDatabase>,
  runId: number
): void {
  const runRow = database.prepare(`SELECT tournament_id FROM cup_runs WHERE id = ?`).get(runId) as { tournament_id: number } | undefined
  if (!runRow) return
  const { tournament_id: tournamentId } = runRow
  const rankRows = database.prepare(`
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
    ranked AS (
      SELECT es.item_id,
        RANK() OVER (ORDER BY
          CASE WHEN es.total_runs > 0 THEN CAST(es.run_wins AS REAL) / es.total_runs ELSE 0 END DESC,
          CASE WHEN COALESCE(ms.total_matches, 0) > 0 THEN CAST(COALESCE(ms.match_wins, 0) AS REAL) / COALESCE(ms.total_matches, 0) ELSE 0 END DESC
        ) AS rank
      FROM entry_stats es
      LEFT JOIN match_stats ms ON ms.item_id = es.item_id
    )
    SELECT item_id, rank FROM ranked
  `).all(tournamentId, tournamentId, tournamentId) as { item_id: number; rank: number }[]
  const insertSnap = database.prepare(`INSERT INTO cup_rank_snapshots (tournament_id, item_id, rank) VALUES (?, ?, ?)`)
  const trimSnap = database.prepare(`
    DELETE FROM cup_rank_snapshots
    WHERE tournament_id = ? AND item_id = ?
      AND id NOT IN (
        SELECT id FROM cup_rank_snapshots
        WHERE tournament_id = ? AND item_id = ?
        ORDER BY id DESC LIMIT 20
      )
  `)
  for (const row of rankRows) {
    insertSnap.run(tournamentId, row.item_id, row.rank)
    trimSnap.run(tournamentId, row.item_id, tournamentId, row.item_id)
  }
}

// 대회의 전체 대상 아이템 ID 목록 (cup:item-count / cup:tournament-stats 공용)
function getEligibleItemIds(database: DB, tournamentId: number): number[] {
  const t = database.prepare(`SELECT * FROM cup_tournaments WHERE id = ?`).get(tournamentId) as { type: string; is_master: number; filter_json?: string | null } | undefined
  if (!t) return []
  const filter = t.filter_json ? JSON.parse(t.filter_json) as Record<string, unknown> : null

  if (t.is_master) {
    const itemCol = t.type === 'actor' ? 'a.id' : 'w.id'
    const fromClause = t.type === 'actor' ? 'actors a' : 'works w'
    const rl = getRecentRunLimit(database, t.type as 'actor' | 'work')
    const ranked = database.prepare(`
      WITH pts AS (
        SELECT item_id, total_points FROM ${buildPointsCte(t.type as 'actor' | 'work', rl, 'rpt', true)}
      ),
      mrc AS (
        SELECT e.item_id, COUNT(DISTINCT r.id) AS master_run_count
        FROM cup_entries e
        JOIN cup_runs r ON r.id = e.run_id AND r.status = 'completed'
        JOIN cup_tournaments t2 ON t2.id = r.tournament_id AND t2.is_master = 1 AND t2.type = '${t.type}'
        GROUP BY e.item_id
      )
      SELECT RANK() OVER (ORDER BY COALESCE(pts.total_points, 0) DESC) AS rank, ${itemCol} AS id,
        COALESCE(mrc.master_run_count, 0) AS master_run_count
      FROM ${fromClause}
      LEFT JOIN pts ON pts.item_id = ${itemCol}
      LEFT JOIN mrc ON mrc.item_id = ${itemCol}
    `).all() as { rank: number; id: number; master_run_count: number }[]
    const divBoundaries = [32, 96, 224, 480, 992, 2016]
    const divisionMap = new Map<number, number>()
    for (const row of ranked) {
      let div = 0
      if (row.master_run_count > 0) {
        for (let d = 0; d < divBoundaries.length; d++) {
          if (row.rank <= divBoundaries[d]) { div = d + 1; break }
        }
      }
      divisionMap.set(row.id, div)
    }
    const selectedDivisions = filter?.selectedDivisions as number[] | undefined
    if (selectedDivisions?.length) {
      const divSet = new Set(selectedDivisions)
      return ranked.filter(row => divSet.has(divisionMap.get(row.id) ?? 0)).map(row => row.id)
    }
    return ranked.map(row => row.id)
  }

  const extraConditions: string[] = []
  const extraBindings: unknown[] = []
  let extraJoins = ''
  if (filter) {
    const tagIds = filter.tagIds as number[] | undefined
    if (tagIds?.length) {
      const ph = tagIds.map(() => '?').join(',')
      if (t.type === 'actor') {
        if (filter.tagInclude === 'exclude') {
          extraConditions.push(`NOT EXISTS (SELECT 1 FROM actor_tags at2 WHERE at2.actor_id = a.id AND at2.tag_id IN (${ph}))`)
          extraBindings.push(...tagIds)
        } else {
          extraJoins += ` JOIN actor_tags at2 ON at2.actor_id = a.id`
          extraConditions.push(`at2.tag_id IN (${ph})`)
          extraBindings.push(...tagIds)
          if (filter.tagMode === 'and') {
            extraConditions.push(`(SELECT COUNT(DISTINCT at3.tag_id) FROM actor_tags at3 WHERE at3.actor_id = a.id AND at3.tag_id IN (${ph})) = ?`)
            extraBindings.push(...tagIds, tagIds.length)
          }
        }
      } else {
        if (filter.tagInclude === 'exclude') {
          extraConditions.push(`NOT EXISTS (SELECT 1 FROM work_tags wt WHERE wt.work_id = w.id AND wt.tag_id IN (${ph}))`)
          extraBindings.push(...tagIds)
        } else {
          extraJoins += ` JOIN work_tags wt ON wt.work_id = w.id`
          extraConditions.push(`wt.tag_id IN (${ph})`)
          extraBindings.push(...tagIds)
          if (filter.tagMode === 'and') {
            extraConditions.push(`(SELECT COUNT(DISTINCT wt2.tag_id) FROM work_tags wt2 WHERE wt2.work_id = w.id AND wt2.tag_id IN (${ph})) = ?`)
            extraBindings.push(...tagIds, tagIds.length)
          }
        }
      }
    }
    if (t.type === 'actor') {
      const actorIds = filter.actorIds as number[] | undefined
      if (actorIds?.length) {
        const ph = actorIds.map(() => '?').join(',')
        extraConditions.push(filter.actorMode === 'exclude' ? `a.id NOT IN (${ph})` : `a.id IN (${ph})`)
        extraBindings.push(...actorIds)
      }
      if (filter.ratingFrom !== undefined || filter.ratingTo !== undefined) {
        extraJoins += ` LEFT JOIN actor_scores asc_f ON asc_f.actor_id = a.id`
        if (filter.ratingFrom !== undefined) { extraConditions.push(`COALESCE((asc_f.face + asc_f.bust + asc_f.hip + asc_f.physical + asc_f.skin + asc_f.acting + asc_f.sexy + asc_f.charm + asc_f.technique + asc_f.proportions) / 13.0, 0) >= ?`); extraBindings.push(filter.ratingFrom) }
        if (filter.ratingTo !== undefined) { extraConditions.push(`COALESCE((asc_f.face + asc_f.bust + asc_f.hip + asc_f.physical + asc_f.skin + asc_f.acting + asc_f.sexy + asc_f.charm + asc_f.technique + asc_f.proportions) / 13.0, 0) <= ?`); extraBindings.push(filter.ratingTo) }
      }
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
      if (filter.scoreExcluded) { extraConditions.push('COALESCE(a.score_excluded, 0) = 0') }
      if (filter.favoriteOnly) extraConditions.push('a.is_favorite = 1')
    } else {
      const workActorIds = filter.actorIds as number[] | undefined
      if (workActorIds?.length) {
        const ph = workActorIds.map(() => '?').join(',')
        extraConditions.push(filter.actorMode === 'exclude'
          ? `NOT EXISTS (SELECT 1 FROM work_actors wa_f WHERE wa_f.work_id = w.id AND wa_f.actor_id IN (${ph}))`
          : `EXISTS (SELECT 1 FROM work_actors wa_f WHERE wa_f.work_id = w.id AND wa_f.actor_id IN (${ph}))`)
        extraBindings.push(...workActorIds)
      }
      if (filter.ratingFrom !== undefined) { extraConditions.push('w.rating >= ?'); extraBindings.push(filter.ratingFrom) }
      if (filter.ratingTo !== undefined) { extraConditions.push('w.rating <= ?'); extraBindings.push(filter.ratingTo) }
      const studioIds = filter.studioIds as number[] | undefined
      if (studioIds?.length) {
        const ph = studioIds.map(() => '?').join(',')
        extraConditions.push(`w.studio_id IN (${ph})`)
        extraBindings.push(...studioIds)
      }
      if (filter.favoriteOnly) extraConditions.push('w.is_favorite = 1')
    }
  }
  const filterWhere = extraConditions.length ? ` AND ${extraConditions.join(' AND ')}` : ''
  if (t.type === 'actor') {
    return (database.prepare(`SELECT DISTINCT a.id FROM actors a${extraJoins} WHERE 1=1${filterWhere}`).all(...extraBindings) as { id: number }[]).map(r => r.id)
  } else {
    return (database.prepare(`SELECT DISTINCT w.id FROM works w${extraJoins} WHERE 1=1${filterWhere}`).all(...extraBindings) as { id: number }[]).map(r => r.id)
  }
}

function countEligibleItems(database: DB, tournamentId: number): number {
  return getEligibleItemIds(database, tournamentId).length
}

export function registerCupHandlers(): void {
  const db = () => getDatabase()

  ipcMain.handle('cup:list', (_e, params?: { type?: 'actor' | 'work'; isMaster?: boolean; search?: string; sortBy?: string; sortDir?: string; format?: 'tournament' | 'league' | 'worldcup' }) => {
    const { type, isMaster, search, sortBy = 'created_at', sortDir = 'desc', format } = params ?? {}
    const conditions: string[] = []
    const bindings: unknown[] = []
    if (type) { conditions.push('t.type = ?'); bindings.push(type) }
    if (isMaster !== undefined) { conditions.push('t.is_master = ?'); bindings.push(isMaster ? 1 : 0) }
    if (search) { conditions.push('t.name LIKE ?'); bindings.push(`%${search}%`) }
    if (format) { conditions.push('t.format = ?'); bindings.push(format) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const isLastPlayed = sortBy === 'last_played'
    const orderCol = sortBy === 'name' ? 't.name' : isLastPlayed ? 'lr.last_played_at' : 't.created_at'
    const dir = sortDir === 'asc' ? 'ASC' : 'DESC'
    return db().prepare(`
      SELECT t.*,
        lr.id AS latest_run_id,
        lr.status AS latest_run_status,
        lr.round_total,
        lc.winner_id,
        lr.started_at,
        lr.completed_at,
        CASE WHEN t.type = 'actor' THEN a.name ELSE w.title END AS winner_name,
        CASE WHEN t.type = 'actor' THEN a.photo_path ELSE w.cover_path END AS winner_photo
      FROM cup_tournaments t
      LEFT JOIN cup_runs lr ON lr.id = (
        SELECT id FROM cup_runs WHERE tournament_id = t.id ORDER BY id DESC LIMIT 1
      )
      LEFT JOIN cup_runs lc ON lc.id = (
        SELECT id FROM cup_runs WHERE tournament_id = t.id AND status = 'completed' ORDER BY id DESC LIMIT 1
      )
      LEFT JOIN actors a ON a.id = lc.winner_id AND t.type = 'actor'
      LEFT JOIN works w ON w.id = lc.winner_id AND t.type = 'work'
      ${where}
      ORDER BY ${isLastPlayed ? `${orderCol} ${dir}, lr.completed_at ${dir}, lr.started_at ${dir}` : `${orderCol} ${dir}`}
    `).all(...bindings)
  })

  ipcMain.handle('cup:get', (_e, tournamentId: number) => {
    const tournament = db().prepare(`SELECT * FROM cup_tournaments WHERE id = ?`).get(tournamentId) as Record<string, unknown> | undefined
    if (!tournament) return null
    const run = db().prepare(`SELECT * FROM cup_runs WHERE tournament_id = ? ORDER BY id DESC LIMIT 1`).get(tournamentId) as Record<string, unknown> | undefined
    if (!run) return { tournament, run: null, currentMatch: null, totalMatches: 0, completedMatches: 0 }
    const runId = run.id as number
    if (run.status === 'in_progress') {
      db().prepare(`UPDATE cup_runs SET last_played_at = datetime('now') WHERE id = ?`).run(runId)
    }
    const currentMatch = db().prepare(`
      SELECT * FROM cup_matches
      WHERE run_id = ? AND winner_id IS NULL AND is_draw = 0
      ORDER BY phase DESC, round DESC, match_index ASC
      LIMIT 1
    `).get(runId)
    const { total: totalMatches } = db().prepare(
      `SELECT COUNT(*) as total FROM cup_matches WHERE run_id = ?`
    ).get(runId) as { total: number }
    const { done: completedMatches } = db().prepare(
      `SELECT COUNT(*) as done FROM cup_matches WHERE run_id = ? AND (winner_id IS NOT NULL OR is_draw = 1)`
    ).get(runId) as { done: number }
    const cm = currentMatch as { phase: string; group_id: number | null; round: number } | null | undefined
    let groupMatchDone: number | null = null
    let groupMatchTotal: number | null = null
    let groupsDone: number | null = null
    let groupsTotal: number | null = null
    if (cm?.phase === 'group' || cm?.phase === 'tiebreak') {
      const { cnt: gt } = db().prepare(`SELECT COUNT(*) AS cnt FROM cup_matches WHERE run_id = ? AND phase = ? AND group_id = ?`).get(runId, cm.phase, cm.group_id) as { cnt: number }
      const { cnt: gd } = db().prepare(`SELECT COUNT(*) AS cnt FROM cup_matches WHERE run_id = ? AND phase = ? AND group_id = ? AND (winner_id IS NOT NULL OR is_draw = 1)`).get(runId, cm.phase, cm.group_id) as { cnt: number }
      groupMatchDone = gd
      groupMatchTotal = gt
      const { cnt: gsTotal } = db().prepare(`SELECT COUNT(DISTINCT group_id) AS cnt FROM cup_matches WHERE run_id = ? AND phase = 'group'`).get(runId) as { cnt: number }
      const doneGroups = db().prepare(`
        SELECT group_id FROM cup_matches WHERE run_id = ? AND phase IN ('group', 'tiebreak')
        GROUP BY group_id
        HAVING COUNT(*) = SUM(CASE WHEN winner_id IS NOT NULL OR is_draw = 1 THEN 1 ELSE 0 END)
      `).all(runId) as { group_id: number }[]
      groupsDone = doneGroups.length
      groupsTotal = gsTotal
    }
    let mainRoundDone: number | null = null
    let mainRoundTotal: number | null = null
    if (cm?.phase === 'main') {
      const cmBlockId = (cm as { block_id?: number | null }).block_id ?? null
      const { cnt: mt } = db().prepare(`SELECT COUNT(*) AS cnt FROM cup_matches WHERE run_id = ? AND phase = 'main' AND round = ? AND block_id IS ?`).get(runId, cm.round, cmBlockId) as { cnt: number }
      const { cnt: md } = db().prepare(`SELECT COUNT(*) AS cnt FROM cup_matches WHERE run_id = ? AND phase = 'main' AND round = ? AND block_id IS ? AND (winner_id IS NOT NULL OR is_draw = 1)`).get(runId, cm.round, cmBlockId) as { cnt: number }
      mainRoundDone = md
      mainRoundTotal = mt
    }
    let divisionMap: Record<number, number> = {}
    if (tournament && (tournament as { is_master: number }).is_master && runId) {
      const entries = db().prepare(`SELECT item_id, division FROM cup_entries WHERE run_id = ?`).all(runId) as { item_id: number; division: number | null }[]
      for (const e of entries) divisionMap[e.item_id] = e.division ?? 0
    }
    return { tournament, run, currentMatch, totalMatches, completedMatches, groupMatchDone, groupMatchTotal, groupsDone, groupsTotal, mainRoundDone, mainRoundTotal, divisionMap }
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
      SELECT r.*, t.format, t.type, t.is_master FROM cup_runs r
      JOIN cup_tournaments t ON t.id = r.tournament_id
      WHERE r.id = ?
    `).get(runId) as { format: string; type: string; is_master: number } | undefined
    if (!row) return null
    const getDivisionMap = (): Record<number, number> => {
      if (!row.is_master) return {}
      const entries = db().prepare(`SELECT item_id, division FROM cup_entries WHERE run_id = ?`).all(runId) as { item_id: number; division: number | null }[]
      const m: Record<number, number> = {}
      for (const e of entries) m[e.item_id] = e.division ?? 0
      return m
    }
    if (row.format === 'tournament') {
      const matches = db().prepare(
        `SELECT * FROM cup_matches WHERE run_id = ? ORDER BY round DESC, match_index ASC`
      ).all(runId)
      return { type: 'tournament', matches, divisionMap: getDivisionMap() }
    } else if (row.format === 'worldcup') {
      // 조별 예선 데이터 수집
      const allGroupIds = (db().prepare(`SELECT DISTINCT group_id FROM cup_matches WHERE run_id = ? AND phase = 'group' ORDER BY group_id`).all(runId) as { group_id: number }[]).map(r => r.group_id)
      type GroupEntry = { group_id: number; standings: ReturnType<typeof computeGroupStandings>; matches: unknown[]; tiebreakMatches: unknown[] }
      const blockMap = new Map<number, { block_id: number; label: string; groups: GroupEntry[] }>()
      for (const gid of allGroupIds) {
        const blockId = Math.floor((gid - 1) / 16)
        if (!blockMap.has(blockId)) blockMap.set(blockId, { block_id: blockId, label: String.fromCharCode(65 + blockId), groups: [] })
        const gms = db().prepare(`SELECT * FROM cup_matches WHERE run_id = ? AND phase = 'group' AND group_id = ? ORDER BY match_index`).all(runId, gid) as { item1_id: number; item2_id: number | null; winner_id: number | null; is_draw: number }[]
        const tbms = db().prepare(`SELECT * FROM cup_matches WHERE run_id = ? AND phase = 'tiebreak' AND group_id = ? ORDER BY round, match_index`).all(runId, gid)
        const standings = computeGroupStandings(gms, getBasePoints(db(), row.type))
        const qualifiers = getGroupQualifiers(db(), runId, gid, 'worldcup', row.type)
        blockMap.get(blockId)!.groups.push({ group_id: gid, standings, matches: gms, tiebreakMatches: tbms, qualifiers })
      }
      const blocks = [...blockMap.values()].sort((a, b) => a.block_id - b.block_id)
      const allGroupAndTbDone = allGroupIds.length > 0 && allGroupIds.every(gid => {
        const pending = (db().prepare(`SELECT COUNT(*) AS cnt FROM cup_matches WHERE run_id = ? AND group_id = ? AND phase IN ('group','tiebreak') AND winner_id IS NULL AND is_draw = 0`).get(runId, gid) as { cnt: number }).cnt
        return pending === 0
      })
      const groupPhase = { completed: allGroupAndTbDone, blocks }

      // divisionMap: item_id → division
      const entryRows = db().prepare(`SELECT item_id, division FROM cup_entries WHERE run_id = ?`).all(runId) as { item_id: number; division: number | null }[]
      const divisionMap: Record<number, number> = {}
      for (const e of entryRows) divisionMap[e.item_id] = e.division ?? 0

      // 블록 토너먼트
      const totalBlockCount = blocks.length
      const allMainMatches = db().prepare(`SELECT * FROM cup_matches WHERE run_id = ? AND phase = 'main' ORDER BY block_id, round, match_index`).all(runId) as { id: number; block_id: number | null; round: number; match_index: number; item1_id: number; item2_id: number | null; winner_id: number | null; is_draw: number }[]
      const blockMainMatches = allMainMatches.filter(m => m.block_id !== null)
      const finalMatches = allMainMatches.filter(m => m.block_id === null)
      const blockTournaments = Array.from({ length: totalBlockCount }, (_, bid) => {
        const bm = blockMainMatches.filter(m => m.block_id === bid)
        let status: 'pending' | 'in_progress' | 'completed' = 'pending'
        if (bm.length > 0) status = bm.every(m => m.winner_id !== null || m.is_draw) ? 'completed' : 'in_progress'
        const roundNums = [...new Set(bm.map(m => m.round))].sort((a, b) => a - b)
        const rounds = roundNums.map(rn => ({ round: rn, matches: bm.filter(m => m.round === rn) }))
        return { block_id: bid, label: String.fromCharCode(65 + bid), status, rounds }
      })

      // 결승 라운드
      let finalRound: { status: 'pending' | 'in_progress' | 'completed'; rounds: { round: number; matches: unknown[] }[] } | null = null
      if (allGroupAndTbDone) {
        const allBlocksDone = blockTournaments.every(b => b.status === 'completed')
        if (finalMatches.length > 0) {
          const status: 'pending' | 'in_progress' | 'completed' = finalMatches.every(m => m.winner_id !== null || m.is_draw) ? 'completed' : 'in_progress'
          const roundNums = [...new Set(finalMatches.map(m => m.round))].sort((a, b) => a - b)
          const rounds = roundNums.map(rn => ({ round: rn, matches: finalMatches.filter(m => m.round === rn) }))
          finalRound = { status, rounds }
        } else if (allBlocksDone) {
          finalRound = { status: 'pending', rounds: [] }
        }
      }

      return { type: 'worldcup', groupPhase, blockTournaments, finalRound, divisionMap }
    } else {
      const groupIds = db().prepare(`SELECT DISTINCT group_id FROM cup_matches WHERE run_id = ? AND phase = 'group' ORDER BY group_id`).all(runId) as { group_id: number }[]
      const groupStandings = groupIds.map(({ group_id }) => {
        const gms = db().prepare(`SELECT * FROM cup_matches WHERE run_id = ? AND phase = 'group' AND group_id = ? ORDER BY match_index`).all(runId, group_id) as { item1_id: number; item2_id: number | null; winner_id: number | null; is_draw: number }[]
        const tbms = db().prepare(`SELECT * FROM cup_matches WHERE run_id = ? AND phase = 'tiebreak' AND group_id = ? ORDER BY round, match_index`).all(runId, group_id) as { item1_id: number; item2_id: number | null; winner_id: number | null; is_draw: number }[]
        const standings = computeGroupStandings(gms, getBasePoints(db(), row.type))
        return { group_id, standings, matches: gms, tiebreakMatches: tbms }
      })
      const mainMatches = db().prepare(`SELECT * FROM cup_matches WHERE run_id = ? AND phase = 'main' ORDER BY round DESC, match_index`).all(runId)
      return { type: 'league', groupStandings, mainMatches, divisionMap: getDivisionMap() }
    }
  })

  ipcMain.handle('ranking-settings:get', (_e, type: 'actor' | 'work') => {
    const row = db().prepare(`SELECT settings_json FROM ranking_settings WHERE type = ?`).get(type) as { settings_json: string } | undefined
    return row ? JSON.parse(row.settings_json) : null
  })

  ipcMain.handle('ranking-settings:update', (_e, type: 'actor' | 'work', settings: object) => {
    db().prepare(`UPDATE ranking_settings SET settings_json = ? WHERE type = ?`).run(JSON.stringify(settings), type)
    return { ok: true }
  })

  ipcMain.handle('master-ranking:list', (_e, params: { type: 'actor' | 'work'; limit?: number; offset?: number; search?: string; division?: number; sortBy?: string; sortDir?: 'asc' | 'desc' }) => {
    const { type, limit = 50, offset = 0, search, division, sortBy = 'total_points', sortDir = 'desc' } = params
    const dir = sortDir === 'asc' ? 'ASC' : 'DESC'
    const nameSortCol = type === 'actor' ? 'name' : 'title'
    const orderBy = (() => {
      switch (sortBy) {
        case 'win_rate':
          return `CASE WHEN total_cups > 0 THEN CAST(cup_wins AS REAL) / total_cups ELSE -1 END ${dir}, CASE WHEN total_matches > 0 THEN CAST(match_wins AS REAL) / total_matches ELSE -1 END ${dir}, ${nameSortCol} ASC`
        case 'match_win_rate':
          return `CASE WHEN total_matches > 0 THEN CAST(match_wins AS REAL) / total_matches ELSE -1 END ${dir}, CASE WHEN total_cups > 0 THEN CAST(cup_wins AS REAL) / total_cups ELSE -1 END ${dir}, ${nameSortCol} ASC`
        case 'score_rank':
          return `score_rank ${dir}, ${nameSortCol} ASC`
        default:
          return `total_points ${dir}, ${nameSortCol} ASC`
      }
    })()
    // Division range filter (rank computed over all items, then filtered)
    const divBoundaries = [32, 96, 224, 480, 992, 2016]
    let divWhere = ''
    if (division !== undefined && division !== null) {
      if (division === 0) {
        divWhere = ' AND master_run_count = 0'
      } else {
        const lo = division === 1 ? 1 : (divBoundaries[division - 2] + 1)
        const hi = divBoundaries[division - 1]
        divWhere = division === 6
          ? ` AND master_run_count > 0 AND rank >= ${lo}`
          : ` AND master_run_count > 0 AND rank BETWEEN ${lo} AND ${hi}`
      }
    }
    const searchWhere = search ? (type === 'actor' ? ` AND name LIKE ?` : ` AND (title LIKE ? OR product_number LIKE ?)`) : ''
    const searchBindings: unknown[] = search ? (type === 'work' ? [`%${search}%`, `%${search}%`] : [`%${search}%`]) : []
    const rl = getRecentRunLimit(db(), type)
    const ptsCte = buildPointsCte(type, rl)
    if (type === 'actor') {
      const cte = `
        WITH ranked AS (
          SELECT
            RANK() OVER (ORDER BY COALESCE(pts.total_points, 0) DESC) AS rank,
            a.id, a.name, a.photo_path,
            COALESCE(pts.total_points, 0) AS total_points,
            COALESCE(mrc.master_run_count, 0) AS master_run_count,
            COALESCE((sc.face + sc.bust + sc.hip + sc.physical + sc.skin + sc.acting + sc.sexy + sc.charm + sc.technique + sc.proportions) / 13.0, 0) AS avg_score,
            RANK() OVER (ORDER BY COALESCE((sc.face + sc.bust + sc.hip + sc.physical + sc.skin + sc.acting + sc.sexy + sc.charm + sc.technique + sc.proportions) / 13.0, 0) DESC) AS score_rank
          FROM actors a
          LEFT JOIN ${ptsCte} ON pts.item_id = a.id
          LEFT JOIN (
            SELECT e.item_id, COUNT(DISTINCT r.id) AS master_run_count
            FROM cup_entries e
            JOIN cup_runs r ON r.id = e.run_id AND r.status = 'completed'
            JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1 AND t.type = 'actor'
            GROUP BY e.item_id
          ) mrc ON mrc.item_id = a.id
          LEFT JOIN actor_scores sc ON sc.actor_id = a.id
        )
        SELECT ranked.rank, ranked.id, ranked.name, ranked.photo_path, ranked.total_points, ranked.master_run_count,
          ranked.avg_score, ranked.score_rank,
          COALESCE(cs_cup.total_cups, 0) AS total_cups,
          COALESCE(cs_cup.cup_wins, 0) AS cup_wins,
          COALESCE(cs_match.total_matches, 0) AS total_matches,
          COALESCE(cs_match.match_wins, 0) AS match_wins,
          (SELECT mh.points FROM master_ranking_history mh
           JOIN cup_runs r ON r.id = mh.run_id JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1
           WHERE mh.type = 'actor' AND mh.item_id = ranked.id
           ORDER BY mh.recorded_at DESC LIMIT 1) AS last_run_points
        FROM ranked
        LEFT JOIN (
          SELECT e.item_id,
            COUNT(DISTINCT e.run_id) AS total_cups,
            SUM(CASE WHEN r.winner_id = e.item_id THEN 1 ELSE 0 END) AS cup_wins
          FROM cup_entries e
          JOIN cup_runs r ON r.id = e.run_id AND r.status = 'completed'
          JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1 AND t.type = 'actor'
          GROUP BY e.item_id
        ) cs_cup ON cs_cup.item_id = ranked.id
        LEFT JOIN (
          SELECT sub.item_id, SUM(sub.is_played) AS total_matches, SUM(sub.is_win) AS match_wins
          FROM (
            SELECT CASE WHEN m.item1_id = e2.item_id THEN e2.item_id ELSE e2.item_id END AS item_id,
              CASE WHEN m.is_bye = 0 AND (m.winner_id IS NOT NULL OR m.is_draw = 1) THEN 1 ELSE 0 END AS is_played,
              CASE WHEN m.winner_id = e2.item_id THEN 1 ELSE 0 END AS is_win
            FROM cup_entries e2
            JOIN cup_runs r ON r.id = e2.run_id AND r.status = 'completed'
            JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1 AND t.type = 'actor'
            JOIN cup_matches m ON m.run_id = r.id AND (m.item1_id = e2.item_id OR m.item2_id = e2.item_id)
          ) sub GROUP BY sub.item_id
        ) cs_match ON cs_match.item_id = ranked.id
        WHERE 1=1${divWhere}${searchWhere}
      `
      const rows = db().prepare(cte + ` ORDER BY ${orderBy} LIMIT ? OFFSET ?`).all(...searchBindings, limit, offset)
      const total = (db().prepare(`SELECT COUNT(*) AS cnt FROM (${cte})`).get(...searchBindings) as { cnt: number }).cnt
      return { rows, total }
    } else {
      const cte = `
        WITH ranked AS (
          SELECT
            RANK() OVER (ORDER BY COALESCE(pts.total_points, 0) DESC) AS rank,
            w.id, w.title, w.product_number, w.cover_path, w.studio_id,
            COALESCE(pts.total_points, 0) AS total_points,
            COALESCE(mrc.master_run_count, 0) AS master_run_count
          FROM works w
          LEFT JOIN ${ptsCte} ON pts.item_id = w.id
          LEFT JOIN (
            SELECT e.item_id, COUNT(DISTINCT r.id) AS master_run_count
            FROM cup_entries e
            JOIN cup_runs r ON r.id = e.run_id AND r.status = 'completed'
            JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1 AND t.type = 'work'
            GROUP BY e.item_id
          ) mrc ON mrc.item_id = w.id
        )
        SELECT ranked.rank, ranked.id, ranked.title, ranked.product_number, ranked.cover_path, ranked.studio_id, ranked.total_points, ranked.master_run_count,
          s.name AS studio_name, s.color AS studio_color, mk.name AS maker_name, mk.color AS maker_color,
          COALESCE(cs_cup.total_cups, 0) AS total_cups,
          COALESCE(cs_cup.cup_wins, 0) AS cup_wins,
          COALESCE(cs_match.total_matches, 0) AS total_matches,
          COALESCE(cs_match.match_wins, 0) AS match_wins,
          (SELECT mh.points FROM master_ranking_history mh
           JOIN cup_runs r ON r.id = mh.run_id JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1
           WHERE mh.type = 'work' AND mh.item_id = ranked.id
           ORDER BY mh.recorded_at DESC LIMIT 1) AS last_run_points
        FROM ranked
        LEFT JOIN studios s ON s.id = ranked.studio_id
        LEFT JOIN makers mk ON mk.id = s.maker_id
        LEFT JOIN (
          SELECT e.item_id,
            COUNT(DISTINCT e.run_id) AS total_cups,
            SUM(CASE WHEN r.winner_id = e.item_id THEN 1 ELSE 0 END) AS cup_wins
          FROM cup_entries e
          JOIN cup_runs r ON r.id = e.run_id AND r.status = 'completed'
          JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1 AND t.type = 'work'
          GROUP BY e.item_id
        ) cs_cup ON cs_cup.item_id = ranked.id
        LEFT JOIN (
          SELECT sub.item_id, SUM(sub.is_played) AS total_matches, SUM(sub.is_win) AS match_wins
          FROM (
            SELECT CASE WHEN m.item1_id = e2.item_id THEN e2.item_id ELSE e2.item_id END AS item_id,
              CASE WHEN m.is_bye = 0 AND (m.winner_id IS NOT NULL OR m.is_draw = 1) THEN 1 ELSE 0 END AS is_played,
              CASE WHEN m.winner_id = e2.item_id THEN 1 ELSE 0 END AS is_win
            FROM cup_entries e2
            JOIN cup_runs r ON r.id = e2.run_id AND r.status = 'completed'
            JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1 AND t.type = 'work'
            JOIN cup_matches m ON m.run_id = r.id AND (m.item1_id = e2.item_id OR m.item2_id = e2.item_id)
          ) sub GROUP BY sub.item_id
        ) cs_match ON cs_match.item_id = ranked.id
        WHERE 1=1${divWhere}${searchWhere}
      `
      const rows = db().prepare(cte + ` ORDER BY ${orderBy} LIMIT ? OFFSET ?`).all(...searchBindings, limit, offset)
      const total = (db().prepare(`SELECT COUNT(*) AS cnt FROM (${cte})`).get(...searchBindings) as { cnt: number }).cnt
      return { rows, total }
    }
  })

  ipcMain.handle('master-ranking:item-stats', (_e, params: { type: 'actor' | 'work'; itemId: number }) => {
    const { type, itemId } = params
    const rl = getRecentRunLimit(db(), type)
    const ptsCte = buildPointsCte(type, rl, 'pts', true)
    const ptsRow = db().prepare(`SELECT total_points FROM ${ptsCte} WHERE pts.item_id = ?`).get(itemId) as { total_points: number } | undefined
    const totalPoints = ptsRow?.total_points ?? 0
    const rankRow = db().prepare(`
      SELECT COUNT(*) + 1 AS rank FROM ${ptsCte} WHERE pts.total_points > ?
    `).get(totalPoints) as { rank: number }
    const masterCupsRow = db().prepare(`
      SELECT COUNT(DISTINCT r.id) AS master_run_count,
        SUM(CASE WHEN r.winner_id = ? THEN 1 ELSE 0 END) AS master_cup_wins
      FROM cup_entries e
      JOIN cup_runs r ON r.id = e.run_id AND r.status = 'completed'
      JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1 AND t.type = ?
      WHERE e.item_id = ?
    `).get(itemId, type, itemId) as { master_run_count: number; master_cup_wins: number } | undefined
    const masterMatchesRow = db().prepare(`
      SELECT SUM(CASE WHEN m.is_bye = 0 AND (m.winner_id IS NOT NULL OR m.is_draw = 1) THEN 1 ELSE 0 END) AS total_matches,
        SUM(CASE WHEN m.winner_id = ? THEN 1 ELSE 0 END) AS match_wins
      FROM cup_matches m
      JOIN cup_runs r ON r.id = m.run_id AND r.status = 'completed'
      JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1 AND t.type = ?
      WHERE (m.item1_id = ? OR m.item2_id = ?) AND m.is_bye = 0 AND (m.winner_id IS NOT NULL OR m.is_draw = 1)
    `).get(itemId, type, itemId, itemId) as { total_matches: number; match_wins: number } | undefined
    const totalCups = masterCupsRow?.master_run_count ?? 0
    const cupWins = masterCupsRow?.master_cup_wins ?? 0
    const totalMatches = masterMatchesRow?.total_matches ?? 0
    const matchWins = masterMatchesRow?.match_wins ?? 0
    return {
      rank: rankRow?.rank ?? 1,
      total_points: totalPoints,
      total_cups: totalCups,
      cup_wins: cupWins,
      total_matches: totalMatches,
      match_wins: matchWins,
      win_rate: totalCups > 0 ? Math.round(cupWins / totalCups * 100) : 0,
      match_win_rate: totalMatches > 0 ? Math.round(matchWins / totalMatches * 100) : 0,
    }
  })

  ipcMain.handle('master-ranking:rank-trends', (_e, type: 'actor' | 'work') => {
    // Get most recent completed master run
    const latestRun = db().prepare(`
      SELECT r.completed_at FROM cup_runs r
      JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1
      WHERE r.status = 'completed'
      ORDER BY r.completed_at DESC LIMIT 1
    `).get() as { completed_at: string } | undefined
    if (!latestRun) return []

    const rl = getRecentRunLimit(db(), type)
    // Current points per item
    const currentRows = db().prepare(`SELECT item_id, total_points AS pts FROM ${buildPointsCte(type, rl)}`).all() as { item_id: number; pts: number }[]

    // Previous points (excluding most recent run)
    const prevPtsSql = rl <= 0
      ? `SELECT mh.item_id, SUM(mh.points) AS total
        FROM master_ranking_history mh
        JOIN cup_runs r ON r.id = mh.run_id
        JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1
        WHERE mh.type = ? AND r.completed_at < ?
        GROUP BY mh.item_id`
      : `SELECT item_id, SUM(pts) AS total FROM (
        SELECT mh.item_id, mh.points AS pts,
          ROW_NUMBER() OVER (PARTITION BY mh.item_id ORDER BY mh.recorded_at DESC) AS rn
        FROM master_ranking_history mh
        JOIN cup_runs r ON r.id = mh.run_id
        JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1
        WHERE mh.type = ? AND r.completed_at < ?
      ) WHERE rn <= ${rl} GROUP BY item_id`
    const prevRows = db().prepare(prevPtsSql).all(type, latestRun.completed_at) as { item_id: number; total: number }[]
    const prevMapped = prevRows.map(r => ({ item_id: r.item_id, pts: r.total }))

    // Assign previous ranks (sorted desc by pts)
    const sortedPrev = [...prevMapped].sort((a, b) => b.pts - a.pts)
    const prevRankMap = new Map<number, number>()
    sortedPrev.forEach((r, i) => prevRankMap.set(r.item_id, i + 1))

    return currentRows.map(r => ({
      item_id: r.item_id,
      prev_rank: prevRankMap.get(r.item_id) ?? null,
    }))
  })

  ipcMain.handle('master-ranking:rank-history', (_e, params: { type: 'actor' | 'work'; itemId: number; limit?: number }) => {
    const { type, itemId, limit = 0 } = params
    const limitClause = limit > 0 ? `LIMIT ${limit}` : ''
    const runs = db().prepare(`
      SELECT r.id, r.completed_at, t.name AS tournament_name FROM cup_runs r
      JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1
      WHERE r.status = 'completed' AND t.type = ?
      ORDER BY r.completed_at DESC ${limitClause}
    `).all(type) as { id: number; completed_at: string; tournament_name: string }[]
    if (runs.length === 0) return []
    runs.reverse()
    const rl = getRecentRunLimit(db(), type)
    const atTimeSql = buildPointsAtTimeSql(type, rl)
    const result: { rank: number; recorded_at: string; tournament_name: string }[] = []
    for (const run of runs) {
      const allPts = db().prepare(atTimeSql).all(type, run.completed_at) as { item_id: number; total: number }[]
      const itemPts = allPts.find(r => r.item_id === itemId)?.total ?? 0
      const rank = allPts.filter(r => r.total > itemPts).length + 1
      result.push({ rank, recorded_at: run.completed_at, tournament_name: run.tournament_name })
    }
    return result
  })

  ipcMain.handle('master-ranking:item-format-stats', (_e, params: { type: 'actor' | 'work'; itemId: number }) => {
    const { type, itemId } = params
    const rows = db().prepare(`
      WITH entry_stats AS (
        SELECT t.format,
          COUNT(DISTINCT e.run_id) AS total_cups,
          SUM(CASE WHEN r.winner_id = ? THEN 1 ELSE 0 END) AS cup_wins
        FROM cup_entries e
        JOIN cup_runs r ON r.id = e.run_id AND r.status = 'completed'
        JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1 AND t.type = ?
        WHERE e.item_id = ?
        GROUP BY t.format
      ),
      match_parts AS (
        SELECT t.format,
          CASE WHEN m.is_bye = 0 AND (m.winner_id IS NOT NULL OR m.is_draw = 1) THEN 1 ELSE 0 END AS is_played,
          CASE WHEN m.winner_id = ? THEN 1 ELSE 0 END AS is_win
        FROM cup_matches m
        JOIN cup_runs r ON r.id = m.run_id AND r.status = 'completed'
        JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1 AND t.type = ?
        WHERE m.item1_id = ? OR (m.item2_id IS NOT NULL AND m.item2_id = ?)
      ),
      match_stats AS (
        SELECT format, SUM(is_played) AS total_matches, SUM(is_win) AS match_wins
        FROM match_parts GROUP BY format
      )
      SELECT es.format, es.total_cups, es.cup_wins,
        COALESCE(ms.total_matches, 0) AS total_matches,
        COALESCE(ms.match_wins, 0) AS match_wins
      FROM entry_stats es
      LEFT JOIN match_stats ms ON ms.format = es.format
    `).all(itemId, type, itemId, itemId, type, itemId, itemId) as {
      format: 'worldcup' | 'tournament' | 'league'
      total_cups: number; cup_wins: number
      total_matches: number; match_wins: number
    }[]
    return rows
  })

  ipcMain.handle('master-ranking:reset', (_e, type: 'actor' | 'work') => {
    const inProgress = db().prepare(`SELECT 1 FROM cup_runs WHERE status = 'in_progress' LIMIT 1`).get()
    if (inProgress) throw new Error('진행 중인 대회가 있어 리셋할 수 없습니다')
    db().prepare(`DELETE FROM master_ranking_history WHERE type = ?`).run(type)
    return { ok: true }
  })

  ipcMain.handle('cup:head-to-head', (_e, params: { type: 'actor' | 'work'; itemId: number }) => {
    const { type, itemId } = params
    const h2hRow = db().prepare(`SELECT settings_json FROM ranking_settings WHERE type = ?`).get(type) as { settings_json: string } | undefined
    const h2hMin = h2hRow ? (JSON.parse(h2hRow.settings_json).h2hMinMatches ?? 3) : 3
    const rows = db().prepare(`
      WITH h2h AS (
        SELECT item2_id AS opp_id, m.winner_id, m.is_draw
        FROM cup_matches m
        JOIN cup_runs r ON r.id = m.run_id
        JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1 AND t.type = $type
        WHERE m.item1_id = $itemId AND m.is_bye = 0 AND (m.winner_id IS NOT NULL OR m.is_draw = 1)
        UNION ALL
        SELECT item1_id AS opp_id, m.winner_id, m.is_draw
        FROM cup_matches m
        JOIN cup_runs r ON r.id = m.run_id
        JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1 AND t.type = $type
        WHERE m.item2_id = $itemId AND m.is_bye = 0 AND (m.winner_id IS NOT NULL OR m.is_draw = 1)
      ),
      pts AS (
        SELECT item_id, total_points FROM ${buildPointsCte(type, getRecentRunLimit(db(), type), 'rpt', false)}
      ),
      ranked AS (
        SELECT item_id, RANK() OVER (ORDER BY total_points DESC) AS opp_rank
        FROM pts
      )
      SELECT h.opp_id,
        COUNT(*) AS total,
        SUM(CASE WHEN h.winner_id = $itemId THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN h.is_draw = 1 THEN 1 ELSE 0 END) AS draws,
        rk.opp_rank
      FROM h2h h
      LEFT JOIN ranked rk ON rk.item_id = h.opp_id
      GROUP BY h.opp_id HAVING COUNT(*) >= ${h2hMin} ORDER BY total DESC, wins DESC
    `).all({ itemId, type }) as { opp_id: number; total: number; wins: number; draws: number; opp_rank: number | null }[]
    if (rows.length === 0) return []
    const ids = rows.map(r => r.opp_id)
    const placeholders = ids.map(() => '?').join(',')
    const infoRows: { id: number; [key: string]: unknown }[] = type === 'actor'
      ? db().prepare(`SELECT id, name, photo_path FROM actors WHERE id IN (${placeholders})`).all(...ids) as any
      : db().prepare(`SELECT id, title, product_number, cover_path FROM works WHERE id IN (${placeholders})`).all(...ids) as any
    const infoMap = new Map(infoRows.map(r => [r.id, r]))
    return rows.filter(r => r.opp_id != null && infoMap.has(r.opp_id)).map(r => ({ ...r, losses: r.total - r.wins - r.draws, ...infoMap.get(r.opp_id)! }))
  })

  ipcMain.handle('master-ranking:division-history', (_e, params: { type: 'actor' | 'work'; itemId: number }) => {
    const { type, itemId } = params
    const itemHistory = db().prepare(`
      SELECT mh.run_id, mh.points, r.completed_at
      FROM master_ranking_history mh
      JOIN cup_runs r ON r.id = mh.run_id
      JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1 AND t.type = ?
      WHERE mh.item_id = ?
      ORDER BY r.completed_at ASC
    `).all(type, itemId) as { run_id: number; points: number; completed_at: string }[]
    const rl = getRecentRunLimit(db(), type)
    const atTimeSql = buildPointsAtTimeSql(type, rl)
    const result: { recorded_at: string; rank: number; total_points: number }[] = []
    for (const run of itemHistory) {
      const allPts = db().prepare(atTimeSql).all(type, run.completed_at) as { item_id: number; total: number }[]
      const itemPts = allPts.find(r => r.item_id === itemId)?.total ?? 0
      const rank = allPts.filter(r => r.total > itemPts).length + 1
      result.push({ recorded_at: run.completed_at, rank, total_points: itemPts })
    }
    return result
  })

  ipcMain.handle('cup:division-counts', (_e, params: { type: 'actor' | 'work' }) => {
    const { type } = params
    const divBoundaries = [32, 96, 224, 480, 992, 2016]
    const itemCol = type === 'actor' ? 'a.id' : 'w.id'
    const fromClause = type === 'actor' ? 'actors a' : 'works w'
    const rl = getRecentRunLimit(db(), type)
    const ranked = db().prepare(`
      WITH pts AS (
        SELECT item_id, total_points FROM ${buildPointsCte(type, rl, 'rpt')}
      ),
      mrc AS (
        SELECT e.item_id, COUNT(DISTINCT r.id) AS master_run_count
        FROM cup_entries e
        JOIN cup_runs r ON r.id = e.run_id AND r.status = 'completed'
        JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1 AND t.type = ?
        GROUP BY e.item_id
      )
      SELECT
        RANK() OVER (ORDER BY COALESCE(pts.total_points, 0) DESC) AS rank,
        ${itemCol} AS id,
        COALESCE(mrc.master_run_count, 0) AS master_run_count
      FROM ${fromClause}
      LEFT JOIN pts ON pts.item_id = ${itemCol}
      LEFT JOIN mrc ON mrc.item_id = ${itemCol}
    `).all(type) as { rank: number; id: number; master_run_count: number }[]

    const countMap = new Map<number, number>()
    for (const row of ranked) {
      let div = 0
      if (row.master_run_count > 0) {
        for (let d = 0; d < divBoundaries.length; d++) {
          if (row.rank <= divBoundaries[d]) { div = d + 1; break }
        }
        if (div === 0) div = 6
      }
      countMap.set(div, (countMap.get(div) ?? 0) + 1)
    }
    return Array.from(countMap.entries())
      .map(([division, count]) => ({ division, count }))
      .sort((a, b) => {
        if (a.division === 0) return 1
        if (b.division === 0) return -1
        return a.division - b.division
      })
  })

  ipcMain.handle('cup:item-count', (_e, params: { tournamentId: number }) => {
    return countEligibleItems(db(), params.tournamentId)
  })

  ipcMain.handle('cup:start', (_e, params: { tournamentId: number; roundTotal: number; force?: boolean }) => {
    const { tournamentId, roundTotal, force = false } = params
    const tournament = db().prepare(`SELECT * FROM cup_tournaments WHERE id = ?`).get(tournamentId) as {
      id: number; type: 'actor' | 'work'; format: string; is_master: number; filter_json: string | null
    } | undefined
    if (!tournament) throw new Error('대회를 찾을 수 없습니다')
    if (tournament.is_master) {
      const otherActive = db().prepare(`
        SELECT t.name FROM cup_runs r
        JOIN cup_tournaments t ON t.id = r.tournament_id
        WHERE r.status = 'in_progress' AND t.is_master = 1 AND t.type = ? AND t.id != ?
        LIMIT 1
      `).get(tournament.type, tournamentId) as { name: string } | undefined
      if (otherActive) return { blocked: true, reason: `다른 ${tournament.type === 'actor' ? '배우' : '작품'} 마스터 대회 "${otherActive.name}"이(가) 진행 중입니다. 완료 후 시작해주세요.` }
    }
    const existingRun = db().prepare(`SELECT id FROM cup_runs WHERE tournament_id = ? AND status = 'in_progress' LIMIT 1`).get(tournamentId) as { id: number } | undefined
    if (existingRun) {
      if (!force) throw new Error('이미 진행 중인 대회가 있습니다')
      // force: cup_stats 역산 후 run 삭제 (CASCADE)
      const playedMatches = db().prepare(
        `SELECT item1_id, item2_id, winner_id, is_draw FROM cup_matches WHERE run_id = ? AND (winner_id IS NOT NULL OR is_draw = 1)`
      ).all(existingRun.id) as { item1_id: number; item2_id: number | null; winner_id: number | null; is_draw: number }[]
      for (const m of playedMatches) {
        if (m.is_draw) {
          if (m.item1_id) db().prepare(`UPDATE cup_stats SET total_matches = MAX(0, total_matches - 1) WHERE type = ? AND item_id = ?`).run(tournament.type, m.item1_id)
          if (m.item2_id) db().prepare(`UPDATE cup_stats SET total_matches = MAX(0, total_matches - 1) WHERE type = ? AND item_id = ?`).run(tournament.type, m.item2_id)
        } else {
          const loserId = m.item1_id === m.winner_id ? m.item2_id : m.item1_id
          if (m.winner_id) db().prepare(`UPDATE cup_stats SET total_matches = MAX(0, total_matches - 1), match_wins = MAX(0, match_wins - 1) WHERE type = ? AND item_id = ?`).run(tournament.type, m.winner_id)
          if (loserId) db().prepare(`UPDATE cup_stats SET total_matches = MAX(0, total_matches - 1) WHERE type = ? AND item_id = ?`).run(tournament.type, loserId)
        }
      }
      db().prepare(`DELETE FROM cup_runs WHERE id = ?`).run(existingRun.id)
    }

    const filter = tournament.filter_json ? JSON.parse(tournament.filter_json) as Record<string, unknown> : null

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
          if (filter.tagInclude === 'exclude') {
            extraConditions.push(`NOT EXISTS (SELECT 1 FROM actor_tags at2 WHERE at2.actor_id = a.id AND at2.tag_id IN (${ph}))`)
            extraBindings.push(...tagIds)
          } else {
            extraJoins += ` JOIN actor_tags at2 ON at2.actor_id = a.id`
            extraConditions.push(`at2.tag_id IN (${ph})`)
            extraBindings.push(...tagIds)
            if (filter.tagMode === 'and') {
              extraConditions.push(`(SELECT COUNT(DISTINCT at3.tag_id) FROM actor_tags at3 WHERE at3.actor_id = a.id AND at3.tag_id IN (${ph})) = ?`)
              extraBindings.push(...tagIds, tagIds.length)
            }
          }
        }
        const actorIds = filter.actorIds as number[] | undefined
        if (actorIds?.length) {
          const ph = actorIds.map(() => '?').join(',')
          if (filter.actorMode === 'exclude') {
            extraConditions.push(`a.id NOT IN (${ph})`)
          } else {
            extraConditions.push(`a.id IN (${ph})`)
          }
          extraBindings.push(...actorIds)
        }
        if (filter.ratingFrom !== undefined || filter.ratingTo !== undefined) {
          extraJoins += ` LEFT JOIN actor_scores asc_f ON asc_f.actor_id = a.id`
          if (filter.ratingFrom !== undefined) { extraConditions.push(`COALESCE((asc_f.face + asc_f.bust + asc_f.hip + asc_f.physical + asc_f.skin + asc_f.acting + asc_f.sexy + asc_f.charm + asc_f.technique + asc_f.proportions) / 13.0, 0) >= ?`); extraBindings.push(filter.ratingFrom) }
          if (filter.ratingTo !== undefined) { extraConditions.push(`COALESCE((asc_f.face + asc_f.bust + asc_f.hip + asc_f.physical + asc_f.skin + asc_f.acting + asc_f.sexy + asc_f.charm + asc_f.technique + asc_f.proportions) / 13.0, 0) <= ?`); extraBindings.push(filter.ratingTo) }
        }
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
        if (filter.scoreExcluded) { extraConditions.push('COALESCE(a.score_excluded, 0) = 0') }
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
          if (filter.tagInclude === 'exclude') {
            extraConditions.push(`NOT EXISTS (SELECT 1 FROM work_tags wt WHERE wt.work_id = w.id AND wt.tag_id IN (${ph}))`)
            extraBindings.push(...tagIds)
          } else {
            extraJoins += ` JOIN work_tags wt ON wt.work_id = w.id`
            extraConditions.push(`wt.tag_id IN (${ph})`)
            extraBindings.push(...tagIds)
            if (filter.tagMode === 'and') {
              extraConditions.push(`(SELECT COUNT(DISTINCT wt2.tag_id) FROM work_tags wt2 WHERE wt2.work_id = w.id AND wt2.tag_id IN (${ph})) = ?`)
              extraBindings.push(...tagIds, tagIds.length)
            }
          }
        }
        const workActorIds = filter.actorIds as number[] | undefined
        if (workActorIds?.length) {
          const ph = workActorIds.map(() => '?').join(',')
          if (filter.actorMode === 'exclude') {
            extraConditions.push(`NOT EXISTS (SELECT 1 FROM work_actors wa_f WHERE wa_f.work_id = w.id AND wa_f.actor_id IN (${ph}))`)
          } else {
            extraConditions.push(`EXISTS (SELECT 1 FROM work_actors wa_f WHERE wa_f.work_id = w.id AND wa_f.actor_id IN (${ph}))`)
          }
          extraBindings.push(...workActorIds)
        }
        if (filter.ratingFrom !== undefined) { extraConditions.push('w.rating >= ?'); extraBindings.push(filter.ratingFrom) }
        if (filter.ratingTo !== undefined) { extraConditions.push('w.rating <= ?'); extraBindings.push(filter.ratingTo) }
        const studioIds = filter.studioIds as number[] | undefined
        if (studioIds?.length) {
          const ph = studioIds.map(() => '?').join(',')
          extraConditions.push(`w.studio_id IN (${ph})`)
          extraBindings.push(...studioIds)
        }
      }
      const filterWhere = extraConditions.length ? ` AND ${extraConditions.join(' AND ')}` : ''
      items = db().prepare(`SELECT DISTINCT w.id FROM works w ${extraJoins} WHERE 1=1${filterWhere}`).all(...extraBindings) as { id: number }[]
    }

    // 마스터 대회: RANK() 기반 부 계산 + 비-worldcup 포맷 division 사전 필터 (items 단계)
    let settingsSnapshot: string | null = null
    const divisionMap = new Map<number, number>()
    if (tournament.is_master) {
      const settings = db().prepare(`SELECT settings_json FROM ranking_settings WHERE type = ?`).get(tournament.type) as { settings_json: string } | undefined
      settingsSnapshot = settings?.settings_json ?? null
      const itemCol = tournament.type === 'actor' ? 'a.id' : 'w.id'
      const fromClause = tournament.type === 'actor' ? 'actors a' : 'works w'
      const rlStart = getRecentRunLimit(db(), tournament.type as 'actor' | 'work')
      const ranked = db().prepare(`
        WITH pts AS (
          SELECT item_id, total_points FROM ${buildPointsCte(tournament.type as 'actor' | 'work', rlStart, 'rpt', true)}
        ),
        mrc AS (
          SELECT e.item_id, COUNT(DISTINCT r.id) AS master_run_count
          FROM cup_entries e
          JOIN cup_runs r ON r.id = e.run_id AND r.status = 'completed'
          JOIN cup_tournaments t2 ON t2.id = r.tournament_id AND t2.is_master = 1 AND t2.type = '${tournament.type}'
          GROUP BY e.item_id
        )
        SELECT RANK() OVER (ORDER BY COALESCE(pts.total_points, 0) DESC) AS rank, ${itemCol} AS id,
          COALESCE(mrc.master_run_count, 0) AS master_run_count
        FROM ${fromClause}
        LEFT JOIN pts ON pts.item_id = ${itemCol}
        LEFT JOIN mrc ON mrc.item_id = ${itemCol}
      `).all() as { rank: number; id: number; master_run_count: number }[]
      const divBoundaries = [32, 96, 224, 480, 992, 2016]
      for (const row of ranked) {
        let div = 0
        if (row.master_run_count > 0) {
          for (let d = 0; d < divBoundaries.length; d++) {
            if (row.rank <= divBoundaries[d]) { div = d + 1; break }
          }
        }
        divisionMap.set(row.id, div)
      }
      // 토너먼트/리그 포맷: items 단계에서 division 사전 필터 (선발 풀을 division 기준으로 좁힘)
      if (tournament.format !== 'worldcup') {
        const selectedDivisions = filter?.selectedDivisions as number[] | undefined
        if (selectedDivisions?.length) {
          const divSet = new Set(selectedDivisions)
          items = items.filter(i => divSet.has(divisionMap.get(i.id) ?? 0))
        }
      }
    }

    // 참가 횟수 조회 (마스터: 마스터 대회 전체, 일반: 해당 대회 기준)
    let statsMap = new Map<number, number>()
    if (items.length > 0) {
      const ph = items.map(() => '?').join(',')
      const statsRows = tournament.is_master
        ? db().prepare(`
            SELECT e.item_id, COUNT(DISTINCT e.run_id) AS run_count
            FROM cup_entries e
            JOIN cup_runs r ON r.id = e.run_id
            JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1 AND t.type = ?
            WHERE e.item_id IN (${ph})
            GROUP BY e.item_id
          `).all(tournament.type, ...items.map(i => i.id)) as { item_id: number; run_count: number }[]
        : db().prepare(`
            SELECT e.item_id, COUNT(DISTINCT e.run_id) AS run_count
            FROM cup_entries e
            JOIN cup_runs r ON r.id = e.run_id AND r.tournament_id = ?
            WHERE e.item_id IN (${ph})
            GROUP BY e.item_id
          `).all(tournamentId, ...items.map(i => i.id)) as { item_id: number; run_count: number }[]
      statsMap = new Map(statsRows.map(r => [r.item_id, r.run_count]))
      // 정렬 전 셔플 (stable sort 편향 방지)
      for (let k = items.length - 1; k > 0; k--) {
        const r = Math.floor(Math.random() * (k + 1))
        ;[items[k], items[r]] = [items[r], items[k]]
      }
      items.sort((a, b) => (statsMap.get(a.id) ?? 0) - (statsMap.get(b.id) ?? 0))
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
      // 최솟값 티어 강제 포함
      const minSessions = pool.length > 0 ? Math.min(...pool.map(i => statsMap.get(i.id) ?? 0)) : Infinity
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

    // 월드컵: 마스터 강제 + 전체 항목 사용 후 division 필터 적용
    if (tournament.format === 'worldcup') {
      if (!tournament.is_master) throw new Error('월드컵은 마스터 대회만 가능합니다')
      participants = tournament.type === 'actor'
        ? db().prepare(`SELECT id FROM actors`).all() as { id: number }[]
        : db().prepare(`SELECT id FROM works`).all() as { id: number }[]
      const selectedDivisions = filter?.selectedDivisions as number[] | undefined
      if (selectedDivisions?.length) {
        const divSet = new Set(selectedDivisions)
        participants = participants.filter(p => divSet.has(divisionMap.get(p.id) ?? 0))
      }
    }

    // 리그전: calcPoolSize 기준 풀에서 roundTotal × 2명 선발 (전체 모드 제외)
    if (tournament.format === 'league' && roundTotal > 0) {
      const needed = roundTotal * 2
      if (items.length < needed) throw new Error(`참가 항목 부족 (${needed}명 필요, 현재 ${items.length}명)`)
      const multiplier = Math.max(2, Math.sqrt(items.length / needed))
      const poolSize = Math.min(items.length, Math.round(needed * multiplier))
      const leaguePool = items.slice(0, poolSize)
      shuffleArr(leaguePool)
      // 최솟값 티어 강제 포함
      const lgMinSessions = leaguePool.length > 0 ? Math.min(...leaguePool.map(i => statsMap.get(i.id) ?? 0)) : Infinity
      const lgMinTier = leaguePool.filter(i => (statsMap.get(i.id) ?? 0) === lgMinSessions)
      let lgForced: { id: number }[] = []
      if (lgMinTier.length <= poolSize / 20) {
        lgForced = [...lgMinTier]
      } else if (lgMinTier.length <= poolSize / 10) {
        shuffleArr(lgMinTier)
        lgForced = lgMinTier.slice(0, Math.ceil(lgMinTier.length / 2))
      }
      if (lgForced.length > 0) {
        const forcedSet = new Set(lgForced.map(i => i.id))
        const rest = leaguePool.filter(i => !forcedSet.has(i.id))
        shuffleArr(rest)
        const slotsLeft = Math.max(0, needed - lgForced.length)
        const combined = [...lgForced, ...rest.slice(0, slotsLeft)]
        shuffleArr(combined)
        participants = combined
      } else {
        participants = leaguePool.slice(0, needed)
      }
    }

    if (participants.length < 2) throw new Error('참가 항목이 2개 미만입니다')

    let runId: number
    db().transaction(() => {
      // cup_run 생성
      const runResult = db().prepare(
        `INSERT INTO cup_runs (tournament_id, status, round_total, settings_snapshot, started_at, last_played_at) VALUES (?, 'in_progress', ?, ?, datetime('now'), datetime('now'))`
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
          if (totalCount % 2 === 1) insertMatch.run(runId, roundSize, matchIdx++, shuffled[totalCount - 1].id, null, null, 1)
        } else {
          for (let i = 0; i < byeCount; i++) insertMatch.run(runId, roundSize, matchIdx++, shuffled[i].id, null, null, 1)
          for (let i = byeCount; i < totalCount; i += 2) insertMatch.run(runId, roundSize, matchIdx++, shuffled[i].id, shuffled[i + 1]?.id ?? null, null, 0)
        }
      } else if (tournament.format === 'league') {
        let groupCount: number
        let pool: { id: number }[]
        if (roundTotal === 0) {
          // 전체 참가 모드: 4인 1조 기본, 나머지 1~3명은 앞 조에 편입 (5인조)
          if (participants.length < 4) throw new Error('리그전은 최소 4명이 필요합니다')
          groupCount = Math.floor(participants.length / 4)
          pool = participants
        } else {
          if (roundTotal % 2 !== 0) throw new Error('리그전은 강 수(짝수)를 선택해야 합니다')
          groupCount = roundTotal / 2
          const poolNeeded = groupCount * 4
          if (participants.length < poolNeeded) throw new Error(`조 구성 인원 부족 (${groupCount}조 × 4명 = ${poolNeeded}명 필요, 현재 ${participants.length}명)`)
          pool = participants.slice(0, poolNeeded)
        }
        shuffleArr(pool)
        const groups: number[][] = Array.from({ length: groupCount }, () => [])
        pool.forEach((p, i) => groups[i % groupCount].push(p.id))
        const insertMatch = db().prepare(`INSERT INTO cup_matches (run_id, phase, group_id, round, match_index, item1_id, item2_id) VALUES (?, 'group', ?, 0, ?, ?, ?)`)
        let matchIdx = 0
        for (let gIdx = 0; gIdx < groups.length; gIdx++) {
          const group = groups[gIdx]
          const pairs: [number, number][] = []
          for (let i = 0; i < group.length; i++)
            for (let j = i + 1; j < group.length; j++)
              pairs.push([group[i], group[j]])
          shuffleArr(pairs)
          pairs.forEach(([a, b]) => insertMatch.run(runId, gIdx + 1, matchIdx++, a, b))
        }
      } else if (tournament.format === 'worldcup') {
        if (roundTotal === 0) throw new Error('월드컵은 강 수를 선택해야 합니다')
        const groupCount = roundTotal / 2
        if (participants.length < groupCount * 4) throw new Error(`조 구성 인원 부족 (${groupCount}조 × 최소 4명 = ${groupCount * 4}명 필요)`)

        // 승점 조회 (부 내 정렬용)
        const rlWc = getRecentRunLimit(db(), tournament.type as 'actor' | 'work')
        const wcRankRows = db().prepare(`SELECT item_id, total_points FROM ${buildPointsCte(tournament.type as 'actor' | 'work', rlWc, 'rpt', false)}`).all() as { item_id: number; total_points: number }[]
        const wcPtsMap = new Map(wcRankRows.map(r => [r.item_id, r.total_points]))

        // 포트(부) 기반 정렬: 부 오름차순(미분류=맨 뒤), 부 내에서 승점 내림차순
        const wcSorted = [...participants].sort((a, b) => {
          const divA = divisionMap.get(a.id) === 0 ? 999 : (divisionMap.get(a.id) ?? 999)
          const divB = divisionMap.get(b.id) === 0 ? 999 : (divisionMap.get(b.id) ?? 999)
          if (divA !== divB) return divA - divB
          return (wcPtsMap.get(b.id) ?? 0) - (wcPtsMap.get(a.id) ?? 0)
        })

        // 포트 라운드: groupCount씩 묶어 셔플 후 각 조에 1명씩 배정
        const wcGroups: number[][] = Array.from({ length: groupCount }, () => [])
        let portStart = 0
        while (portStart < wcSorted.length) {
          const port = wcSorted.slice(portStart, portStart + groupCount)
          for (let k = port.length - 1; k > 0; k--) {
            const r = Math.floor(Math.random() * (k + 1))
            ;[port[k], port[r]] = [port[r], port[k]]
          }
          port.forEach((p, j) => wcGroups[j % groupCount].push(p.id))
          portStart += groupCount
        }

        // 조별 매치 생성: 조 순서 유지, 조 내부 매치만 셔플
        const wcInsert = db().prepare(`INSERT INTO cup_matches (run_id, phase, group_id, round, match_index, item1_id, item2_id) VALUES (?, 'group', ?, 0, ?, ?, ?)`)
        let wcMatchIdx = 0
        for (let gIdx = 0; gIdx < wcGroups.length; gIdx++) {
          const group = wcGroups[gIdx]
          const groupPairs: [number, number][] = []
          for (let i = 0; i < group.length; i++) {
            for (let j = i + 1; j < group.length; j++) {
              groupPairs.push([group[i], group[j]])
            }
          }
          for (let k = groupPairs.length - 1; k > 0; k--) {
            const r = Math.floor(Math.random() * (k + 1))
            ;[groupPairs[k], groupPairs[r]] = [groupPairs[r], groupPairs[k]]
          }
          groupPairs.forEach(([a, b]) => wcInsert.run(runId, gIdx + 1, wcMatchIdx++, a, b))
        }
      }
    })()

    const run = db().prepare(`SELECT * FROM cup_runs WHERE id = ?`).get(runId!)
    return { tournament: db().prepare(`SELECT * FROM cup_tournaments WHERE id = ?`).get(tournamentId), run }
  })

  ipcMain.handle('cup:clear-run', (_e, tournamentId: number) => {
    const tournament = db().prepare(`SELECT * FROM cup_tournaments WHERE id = ?`).get(tournamentId) as {
      id: number; type: 'actor' | 'work'
    } | undefined
    if (!tournament) throw new Error('대회를 찾을 수 없습니다')
    const existingRun = db().prepare(`SELECT id FROM cup_runs WHERE tournament_id = ? AND status = 'in_progress' LIMIT 1`).get(tournamentId) as { id: number } | undefined
    if (!existingRun) return { cleared: false }
    const playedMatches = db().prepare(
      `SELECT item1_id, item2_id, winner_id, is_draw FROM cup_matches WHERE run_id = ? AND (winner_id IS NOT NULL OR is_draw = 1)`
    ).all(existingRun.id) as { item1_id: number; item2_id: number | null; winner_id: number | null; is_draw: number }[]
    for (const m of playedMatches) {
      if (m.is_draw) {
        if (m.item1_id) db().prepare(`UPDATE cup_stats SET total_matches = MAX(0, total_matches - 1) WHERE type = ? AND item_id = ?`).run(tournament.type, m.item1_id)
        if (m.item2_id) db().prepare(`UPDATE cup_stats SET total_matches = MAX(0, total_matches - 1) WHERE type = ? AND item_id = ?`).run(tournament.type, m.item2_id)
      } else {
        const loserId = m.item1_id === m.winner_id ? m.item2_id : m.item1_id
        if (m.winner_id) db().prepare(`UPDATE cup_stats SET total_matches = MAX(0, total_matches - 1), match_wins = MAX(0, match_wins - 1) WHERE type = ? AND item_id = ?`).run(tournament.type, m.winner_id)
        if (loserId) db().prepare(`UPDATE cup_stats SET total_matches = MAX(0, total_matches - 1) WHERE type = ? AND item_id = ?`).run(tournament.type, loserId)
      }
    }
    db().prepare(`DELETE FROM cup_runs WHERE id = ?`).run(existingRun.id)
    return { cleared: true }
  })

  ipcMain.handle('cup:pick', (_e, params: { matchId: number; winnerId: number | null; isDraw?: boolean }) => {
    const { matchId, winnerId, isDraw = false } = params
    const match = db().prepare(`SELECT * FROM cup_matches WHERE id = ?`).get(matchId) as {
      id: number; run_id: number; phase: string; round: number; match_index: number;
      item1_id: number; item2_id: number | null; winner_id: number | null; is_bye: number; is_draw: number;
      block_id: number | null; group_id: number | null
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
      db().prepare(`UPDATE cup_runs SET last_played_at = datetime('now') WHERE id = ?`).run(runId)
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

        // 토너먼트 / 리그전 본선: 라운드 완료 체크 → 다음 라운드 생성
        if (tournament.format === 'tournament' || (tournament.format === 'league' && match.phase === 'main')) {
          const roundMatches = db().prepare(`SELECT * FROM cup_matches WHERE run_id = ? AND phase = ? AND round = ?`).all(runId, match.phase, match.round) as { winner_id: number | null; is_bye: number }[]
          const roundDone = roundMatches.every(m => m.winner_id !== null)
          if (roundDone) {
            const winners = roundMatches.map(m => m.winner_id!).filter(Boolean)
            if (winners.length === 1) {
              db().prepare(`UPDATE cup_runs SET status = 'completed', winner_id = ?, completed_at = datetime('now') WHERE id = ?`).run(winners[0], runId)
              const entries = db().prepare(`SELECT item_id FROM cup_entries WHERE run_id = ?`).all(runId) as { item_id: number }[]
              for (const e of entries) {
                db().prepare(`INSERT INTO cup_stats (type, item_id, total_cups) VALUES (?, ?, 1) ON CONFLICT(type, item_id) DO UPDATE SET total_cups = total_cups + 1`).run(tournament.type, e.item_id)
              }
              db().prepare(`INSERT INTO cup_stats (type, item_id, cup_wins) VALUES (?, ?, 1) ON CONFLICT(type, item_id) DO UPDATE SET cup_wins = cup_wins + 1`).run(tournament.type, winners[0])
              calcAndStoreRunPoints(db(), runId, tournament.type, tournament.is_master === 1, tournament.settings_snapshot)
              saveRankSnapshot(db(), runId)
            } else {
              const isFullMode = tournament.round_total === 0
              const nextRoundSize = isFullMode && winners.length === 3 ? 4 : winners.length
              for (let k = winners.length - 1; k > 0; k--) {
                const r = Math.floor(Math.random() * (k + 1))
                ;[winners[k], winners[r]] = [winners[r], winners[k]]
              }
              const insertNext = db().prepare(`INSERT INTO cup_matches (run_id, phase, round, match_index, item1_id, item2_id) VALUES (?, 'main', ?, ?, ?, ?)`)
              for (let i = 0; i < winners.length; i += 2)
                insertNext.run(runId, nextRoundSize, i / 2, winners[i], winners[i + 1] ?? null)
            }
          }
        }

        // 월드컵 본선: 블록 토너먼트 or 결승 라운드
        if (tournament.format === 'worldcup' && match.phase === 'main') {
          const blockCount = Math.floor(tournament.round_total / 32)
          if (match.block_id !== null) {
            // 블록 토너먼트 라운드 완료 체크
            const blockRoundMatches = db().prepare(
              `SELECT winner_id FROM cup_matches WHERE run_id = ? AND phase = 'main' AND round = ? AND block_id = ? ORDER BY match_index ASC`
            ).all(runId, match.round, match.block_id) as { winner_id: number | null }[]
            const blockRoundDone = blockRoundMatches.every(m => m.winner_id !== null)
            if (blockRoundDone) {
              const winners = blockRoundMatches.map(m => m.winner_id!).filter(Boolean)
              if (winners.length === 2) {
                // 블록 완료: 다음 블록 or 결승 라운드
                const nextBlockId = match.block_id + 1
                if (nextBlockId < blockCount) {
                  startBlock(db(), runId, nextBlockId, tournament.type)
                } else {
                  startFinalRound(db(), runId, blockCount)
                }
              } else {
                // 다음 블록 라운드 (match_index 순 고정 브래킷)
                const insertNext = db().prepare(
                  `INSERT INTO cup_matches (run_id, phase, round, match_index, item1_id, item2_id, block_id) VALUES (?, 'main', ?, ?, ?, ?, ?)`
                )
                for (let i = 0; i < winners.length; i += 2)
                  insertNext.run(runId, winners.length, i / 2, winners[i], winners[i + 1] ?? null, match.block_id)
              }
            }
          } else {
            // 결승 라운드 (block_id IS NULL)
            const finalRoundMatches = db().prepare(
              `SELECT winner_id FROM cup_matches WHERE run_id = ? AND phase = 'main' AND round = ? AND block_id IS NULL ORDER BY match_index ASC`
            ).all(runId, match.round) as { winner_id: number | null }[]
            const finalRoundDone = finalRoundMatches.every(m => m.winner_id !== null)
            if (finalRoundDone) {
              const winners = finalRoundMatches.map(m => m.winner_id!).filter(Boolean)
              if (winners.length === 1) {
                db().prepare(`UPDATE cup_runs SET status = 'completed', winner_id = ?, completed_at = datetime('now') WHERE id = ?`).run(winners[0], runId)
                const entries = db().prepare(`SELECT item_id FROM cup_entries WHERE run_id = ?`).all(runId) as { item_id: number }[]
                for (const e of entries) {
                  db().prepare(`INSERT INTO cup_stats (type, item_id, total_cups) VALUES (?, ?, 1) ON CONFLICT(type, item_id) DO UPDATE SET total_cups = total_cups + 1`).run(tournament.type, e.item_id)
                }
                db().prepare(`INSERT INTO cup_stats (type, item_id, cup_wins) VALUES (?, ?, 1) ON CONFLICT(type, item_id) DO UPDATE SET cup_wins = cup_wins + 1`).run(tournament.type, winners[0])
                calcAndStoreRunPoints(db(), runId, tournament.type, tournament.is_master === 1, tournament.settings_snapshot)
                saveRankSnapshot(db(), runId)
              } else {
                // 결승 다음 라운드 (match_index 순 고정 브래킷)
                const insertNext = db().prepare(
                  `INSERT INTO cup_matches (run_id, phase, round, match_index, item1_id, item2_id, block_id) VALUES (?, 'main', ?, ?, ?, ?, NULL)`
                )
                for (let i = 0; i < winners.length; i += 2)
                  insertNext.run(runId, winners.length, i / 2, winners[i], winners[i + 1] ?? null)
              }
            }
          }
        }
      }

      // 리그전 조별/동점처리: 타이브레이크 생성 + 전체 그룹 완료 체크
      if (tournament.format === 'league' && (match.phase === 'group' || match.phase === 'tiebreak')) {
        if (match.group_id != null) processGroupPick(db(), runId, match.group_id, 'league', tournament.type)
        const pending = (db().prepare(
          `SELECT COUNT(*) as cnt FROM cup_matches WHERE run_id = ? AND phase IN ('group', 'tiebreak') AND winner_id IS NULL AND is_draw = 0`
        ).get(runId) as { cnt: number }).cnt
        if (pending === 0) checkLeagueGroupsAdvance(db(), runId, tournament.type)
      }

      // 월드컵 조별/동점처리: 타이브레이크 생성 + 전체 그룹 완료 체크 → 블록 A 본선 시작
      if (tournament.format === 'worldcup' && (match.phase === 'group' || match.phase === 'tiebreak')) {
        if (match.group_id != null) processGroupPick(db(), runId, match.group_id, 'worldcup', tournament.type)
        const wcPending = (db().prepare(
          `SELECT COUNT(*) as cnt FROM cup_matches WHERE run_id = ? AND phase IN ('group', 'tiebreak') AND winner_id IS NULL AND is_draw = 0`
        ).get(runId) as { cnt: number }).cnt
        if (wcPending === 0) startBlock(db(), runId, 0, tournament.type)
      }
    })()

    return db().prepare(`SELECT * FROM cup_matches WHERE run_id = ? AND winner_id IS NULL AND is_bye = 0 AND is_draw = 0 ORDER BY phase DESC, round DESC, match_index ASC LIMIT 1`).get(runId) ?? { done: true }
  })

  ipcMain.handle('cup:rank-history', (_e, params: { tournamentId: number; itemId: number }) => {
    const { tournamentId, itemId } = params
    return db().prepare(`
      SELECT rank, recorded_at FROM (
        SELECT id, rank, recorded_at FROM cup_rank_snapshots
        WHERE tournament_id = ? AND item_id = ?
        ORDER BY id DESC LIMIT 20
      ) ORDER BY id ASC
    `).all(tournamentId, itemId) as { rank: number; recorded_at: string }[]
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
        SELECT mh.item_id, SUM(mh.points) AS total_pts
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
          CASE WHEN r.winner_id = e.item_id THEN 0 ELSE COALESCE(elim_round, 99999) END ASC,
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

    const ptsIds = pageRows.map(r => r.item_id)
    const ptsPh = ptsIds.map(() => '?').join(',')
    const ptsMap = new Map<number, number>()
    ;(db().prepare(`SELECT item_id, points FROM master_ranking_history WHERE run_id = ? AND item_id IN (${ptsPh})`).all(runId, ...ptsIds) as { item_id: number; points: number }[])
      .forEach(p => ptsMap.set(p.item_id, p.points))

    const rows = pageRows.map((r, i) => ({
      rank: offset + i + 1,
      ...r,
      ...(infoMap.get(r.item_id) ?? {}),
      run_pts: ptsMap.get(r.item_id) ?? null,
    }))
    return { rows, total, runId, format }
  })


  ipcMain.handle('cup:run-progress', (_e, runId: number) => {
    const match = db().prepare(`
      SELECT round, match_index, phase, group_id, block_id FROM cup_matches
      WHERE run_id = ? AND winner_id IS NULL AND is_draw = 0
      ORDER BY phase DESC, round DESC, match_index ASC LIMIT 1
    `).get(runId) as { round: number; match_index: number; phase: string; group_id: number | null; block_id: number | null } | undefined
    const { cnt: total } = db().prepare(`SELECT COUNT(*) AS cnt FROM cup_matches WHERE run_id = ?`).get(runId) as { cnt: number }
    const { cnt: done } = db().prepare(`SELECT COUNT(*) AS cnt FROM cup_matches WHERE run_id = ? AND (winner_id IS NOT NULL OR is_draw = 1)`).get(runId) as { cnt: number }
    let groupMatchDone: number | null = null
    let groupMatchTotal: number | null = null
    let groupsDone: number | null = null
    let groupsTotal: number | null = null
    if (match?.phase === 'group' || match?.phase === 'tiebreak') {
      const { cnt: gt } = db().prepare(`SELECT COUNT(*) AS cnt FROM cup_matches WHERE run_id = ? AND phase = ? AND group_id = ?`).get(runId, match.phase, match.group_id) as { cnt: number }
      const { cnt: gd } = db().prepare(`SELECT COUNT(*) AS cnt FROM cup_matches WHERE run_id = ? AND phase = ? AND group_id = ? AND (winner_id IS NOT NULL OR is_draw = 1)`).get(runId, match.phase, match.group_id) as { cnt: number }
      groupMatchDone = gd
      groupMatchTotal = gt
      const { cnt: gsTotal } = db().prepare(`SELECT COUNT(DISTINCT group_id) AS cnt FROM cup_matches WHERE run_id = ? AND phase = 'group'`).get(runId) as { cnt: number }
      const doneGroups = db().prepare(`
        SELECT group_id FROM cup_matches WHERE run_id = ? AND phase IN ('group', 'tiebreak')
        GROUP BY group_id
        HAVING COUNT(*) = SUM(CASE WHEN winner_id IS NOT NULL OR is_draw = 1 THEN 1 ELSE 0 END)
      `).all(runId) as { group_id: number }[]
      groupsDone = doneGroups.length
      groupsTotal = gsTotal
    }
    let mainRoundDone: number | null = null
    let mainRoundTotal: number | null = null
    if (match?.phase === 'main') {
      const { cnt: mt } = db().prepare(`SELECT COUNT(*) AS cnt FROM cup_matches WHERE run_id = ? AND phase = 'main' AND round = ? AND block_id IS ?`).get(runId, match.round, match.block_id) as { cnt: number }
      const { cnt: md } = db().prepare(`SELECT COUNT(*) AS cnt FROM cup_matches WHERE run_id = ? AND phase = 'main' AND round = ? AND block_id IS ? AND (winner_id IS NOT NULL OR is_draw = 1)`).get(runId, match.round, match.block_id) as { cnt: number }
      mainRoundDone = md
      mainRoundTotal = mt
    }
    return { match: match ?? null, total, done, groupMatchDone, groupMatchTotal, groupsDone, groupsTotal, mainRoundDone, mainRoundTotal }
  })

  ipcMain.handle('cup:tournament-stats', (_e, tournamentId: number) => {
    const tInfo = db().prepare(`SELECT type, is_master, filter_json FROM cup_tournaments WHERE id = ?`).get(tournamentId) as { type: string; is_master: number; filter_json: string | null } | undefined
    if (!tInfo) return null

    const runStats = db().prepare(`
      SELECT COUNT(*) AS total_runs,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_runs,
        MAX(started_at) AS last_run_at
      FROM cup_runs WHERE tournament_id = ?
    `).get(tournamentId) as { total_runs: number; completed_runs: number; last_run_at: string | null } | undefined
    if (!runStats) return null

    // 대회 필터 기반 대상 아이템 목록
    const eligibleIds = getEligibleItemIds(db(), tournamentId)
    const eligibleSet = new Set(eligibleIds)

    // participated/runDist: 대상 아이템 범위 내에서만 집계
    const existsJoin = tInfo.type === 'actor' ? 'JOIN actors a ON a.id = e.item_id' : 'JOIN works w ON w.id = e.item_id'
    let participated: number
    let runDist: { run_count: number; count: number }[]

    if (tInfo.is_master) {
      const allEntries = db().prepare(`
        SELECT e.item_id, COUNT(DISTINCT e.run_id) AS run_count
        FROM cup_entries e
        JOIN cup_runs r ON r.id = e.run_id
        JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1 AND t.type = ?
        ${existsJoin}
        GROUP BY e.item_id
      `).all(tInfo.type) as { item_id: number; run_count: number }[]
      const filtered = allEntries.filter(e => eligibleSet.has(e.item_id))
      participated = filtered.length
      const distMap = new Map<number, number>()
      for (const e of filtered) distMap.set(e.run_count, (distMap.get(e.run_count) ?? 0) + 1)
      runDist = Array.from(distMap.entries()).map(([run_count, count]) => ({ run_count, count })).sort((a, b) => a.run_count - b.run_count)
    } else {
      const allEntries = db().prepare(`
        SELECT e.item_id, COUNT(DISTINCT e.run_id) AS run_count
        FROM cup_entries e
        JOIN cup_runs r ON r.id = e.run_id AND r.tournament_id = ?
        ${existsJoin}
        GROUP BY e.item_id
      `).all(tournamentId) as { item_id: number; run_count: number }[]
      const filtered = allEntries.filter(e => eligibleSet.has(e.item_id))
      participated = filtered.length
      const distMap = new Map<number, number>()
      for (const e of filtered) distMap.set(e.run_count, (distMap.get(e.run_count) ?? 0) + 1)
      runDist = Array.from(distMap.entries()).map(([run_count, count]) => ({ run_count, count })).sort((a, b) => a.run_count - b.run_count)
    }

    const zeroCount = eligibleIds.length - participated
    if (zeroCount > 0) runDist.unshift({ run_count: 0, count: zeroCount })

    return { ...runStats, participated_items: participated, run_dist: runDist }
  })

  ipcMain.handle('cup:item-tournament-stats', (_e, params: { tournamentId: number; itemId: number }) => {
    const { tournamentId, itemId } = params

    const runStats = db().prepare(`
      SELECT COUNT(DISTINCT e.run_id) AS total_runs,
        SUM(CASE WHEN r.winner_id = ? THEN 1 ELSE 0 END) AS run_wins
      FROM cup_entries e
      JOIN cup_runs r ON r.id = e.run_id AND r.tournament_id = ? AND r.status = 'completed'
      WHERE e.item_id = ?
    `).get(itemId, tournamentId, itemId) as { total_runs: number; run_wins: number }

    const matchStats = db().prepare(`
      SELECT COUNT(*) AS total_matches,
        SUM(CASE WHEN m.winner_id = ? THEN 1 ELSE 0 END) AS match_wins
      FROM cup_matches m
      JOIN cup_runs r ON r.id = m.run_id AND r.tournament_id = ? AND r.status = 'completed'
      WHERE (m.item1_id = ? OR m.item2_id = ?) AND m.is_bye = 0
        AND (m.winner_id IS NOT NULL OR m.is_draw = 1)
    `).get(itemId, tournamentId, itemId, itemId) as { total_matches: number; match_wins: number }

    if (runStats.total_runs === 0) return { total_runs: 0, run_wins: 0, total_matches: 0, match_wins: 0, win_rate: 0, match_win_rate: 0, rank: 0 }

    const win_rate = Math.round(runStats.run_wins * 1000.0 / runStats.total_runs) / 10
    const match_win_rate = matchStats.total_matches > 0
      ? Math.round(matchStats.match_wins * 1000.0 / matchStats.total_matches) / 10
      : 0

    const rankRows = db().prepare(`
      SELECT item_id, RANK() OVER (ORDER BY win_rate DESC, match_win_rate DESC) AS rank
      FROM (
        SELECT e.item_id,
          CAST(SUM(CASE WHEN r.winner_id = e.item_id THEN 1 ELSE 0 END) AS REAL) * 100.0 / COUNT(DISTINCT e.run_id) AS win_rate,
          CAST(SUM(CASE WHEN m.winner_id = e.item_id THEN 1 ELSE 0 END) AS REAL) * 100.0 / MAX(1, SUM(CASE WHEN (m.item1_id = e.item_id OR m.item2_id = e.item_id) AND m.is_bye = 0 AND (m.winner_id IS NOT NULL OR m.is_draw = 1) THEN 1 ELSE 0 END)) AS match_win_rate
        FROM cup_entries e
        JOIN cup_runs r ON r.id = e.run_id AND r.tournament_id = ? AND r.status = 'completed'
        LEFT JOIN cup_matches m ON m.run_id = r.id AND (m.item1_id = e.item_id OR m.item2_id = e.item_id)
        GROUP BY e.item_id
      )
    `).all(tournamentId) as { item_id: number; rank: number }[]

    const rank = rankRows.find(r => r.item_id === itemId)?.rank ?? 0

    return { total_runs: runStats.total_runs, run_wins: runStats.run_wins, total_matches: matchStats.total_matches, match_wins: matchStats.match_wins, win_rate, match_win_rate, rank }
  })

  // 작품 마스터랭킹 배우 분포
  ipcMain.handle('master-ranking:work-actor-distribution', (_e) => {
    const type = 'work' as const
    const rl = getRecentRunLimit(db(), type)
    const ptsCte = buildPointsCte(type, rl)
    // 작품별 랭크 계산
    const rankedWorks = db().prepare(`
      WITH ranked AS (
        SELECT
          RANK() OVER (ORDER BY COALESCE(pts.total_points, 0) DESC) AS rank,
          w.id,
          COALESCE(pts.total_points, 0) AS total_points,
          COALESCE(mrc.master_run_count, 0) AS master_run_count
        FROM works w
        LEFT JOIN ${ptsCte} ON pts.item_id = w.id
        LEFT JOIN (
          SELECT e.item_id, COUNT(DISTINCT r.id) AS master_run_count
          FROM cup_entries e
          JOIN cup_runs r ON r.id = e.run_id
          JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1 AND t.type = 'work'
          GROUP BY e.item_id
        ) mrc ON mrc.item_id = w.id
      )
      SELECT rank, id, total_points, master_run_count FROM ranked
      WHERE master_run_count > 0
    `).all() as { rank: number; id: number; total_points: number; master_run_count: number }[]

    if (rankedWorks.length === 0) return { divisions: [], allActors: [] }

    // work_id -> rank 매핑
    const workRankMap = new Map<number, number>()
    for (const w of rankedWorks) workRankMap.set(w.id, w.rank)
    const workIds = rankedWorks.map(w => w.id)

    // 작품-배우 연결 (랭킹에 있는 작품만)
    const waRows = db().prepare(`
      SELECT wa.work_id, wa.actor_id, a.name, a.photo_path
      FROM work_actors wa
      JOIN actors a ON a.id = wa.actor_id
      WHERE wa.work_id IN (${workIds.map(() => '?').join(',')})
    `).all(...workIds) as { work_id: number; actor_id: number; name: string; photo_path: string | null }[]

    // 배우별 마스터랭킹 순위 (있으면)
    const actorRl = getRecentRunLimit(db(), 'actor')
    const actorPtsCte = buildPointsCte('actor', actorRl)
    const actorRanks = db().prepare(`
      SELECT a.id,
        RANK() OVER (ORDER BY COALESCE(pts.total_points, 0) DESC) AS actor_rank
      FROM actors a
      LEFT JOIN ${actorPtsCte} ON pts.item_id = a.id
    `).all() as { id: number; actor_rank: number }[]
    const actorRankMap = new Map<number, number>()
    for (const ar of actorRanks) actorRankMap.set(ar.id, ar.actor_rank)

    // 부 경계
    const divBoundaries = [32, 96, 224, 480, 992, 2016]
    const getDiv = (rank: number) => {
      for (let d = 0; d < divBoundaries.length; d++) {
        if (rank <= divBoundaries[d]) return d + 1
      }
      return 6
    }

    // 부별 + 전체 배우 집계
    type ActorAgg = { id: number; name: string; photo_path: string | null; work_count: number; ranks: number[]; actor_rank: number | null }
    const divMap = new Map<number, Map<number, ActorAgg>>()
    const allMap = new Map<number, ActorAgg>()

    for (const wa of waRows) {
      const rank = workRankMap.get(wa.work_id)
      if (rank === undefined) continue
      const div = getDiv(rank)

      // 부별
      if (!divMap.has(div)) divMap.set(div, new Map())
      const dMap = divMap.get(div)!
      if (!dMap.has(wa.actor_id)) {
        dMap.set(wa.actor_id, { id: wa.actor_id, name: wa.name, photo_path: wa.photo_path, work_count: 0, ranks: [], actor_rank: actorRankMap.get(wa.actor_id) ?? null })
      }
      const dAgg = dMap.get(wa.actor_id)!
      dAgg.work_count++
      dAgg.ranks.push(rank)

      // 전체
      if (!allMap.has(wa.actor_id)) {
        allMap.set(wa.actor_id, { id: wa.actor_id, name: wa.name, photo_path: wa.photo_path, work_count: 0, ranks: [], actor_rank: actorRankMap.get(wa.actor_id) ?? null })
      }
      const aAgg = allMap.get(wa.actor_id)!
      aAgg.work_count++
      aAgg.ranks.push(rank)
    }

    const toResult = (agg: ActorAgg) => ({
      id: agg.id,
      name: agg.name,
      photo_path: agg.photo_path,
      work_count: agg.work_count,
      avg_rank: Math.round(agg.ranks.reduce((a, b) => a + b, 0) / agg.ranks.length * 10) / 10,
      best_rank: Math.min(...agg.ranks),
      worst_rank: Math.max(...agg.ranks),
      actor_rank: agg.actor_rank,
    })

    const divisions = [...divMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([division, actors]) => ({
        division,
        actors: [...actors.values()].map(toResult).sort((a, b) => b.work_count - a.work_count || a.avg_rank - b.avg_rank),
      }))

    const allActors = [...allMap.values()].map(toResult).sort((a, b) => b.work_count - a.work_count || a.avg_rank - b.avg_rank)

    return { divisions, allActors }
  })

  // 작품 마스터랭킹 레이블 분포
  ipcMain.handle('master-ranking:work-label-distribution', (_e) => {
    const type = 'work' as const
    const rl = getRecentRunLimit(db(), type)
    const ptsCte = buildPointsCte(type, rl)
    const rankedWorks = db().prepare(`
      WITH ranked AS (
        SELECT
          RANK() OVER (ORDER BY COALESCE(pts.total_points, 0) DESC) AS rank,
          w.id, w.studio_id,
          COALESCE(pts.total_points, 0) AS total_points,
          COALESCE(mrc.master_run_count, 0) AS master_run_count
        FROM works w
        LEFT JOIN ${ptsCte} ON pts.item_id = w.id
        LEFT JOIN (
          SELECT e.item_id, COUNT(DISTINCT r.id) AS master_run_count
          FROM cup_entries e
          JOIN cup_runs r ON r.id = e.run_id
          JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1 AND t.type = 'work'
          GROUP BY e.item_id
        ) mrc ON mrc.item_id = w.id
      )
      SELECT rank, id, studio_id, total_points, master_run_count FROM ranked
      WHERE master_run_count > 0 AND studio_id IS NOT NULL
    `).all() as { rank: number; id: number; studio_id: number; total_points: number; master_run_count: number }[]

    if (rankedWorks.length === 0) return { divisions: [], allLabels: [] }

    // studio 정보 로드
    const studioRows = db().prepare(`
      SELECT s.id, s.name, s.color, s.maker_id, m.name AS maker_name, m.color AS maker_color
      FROM studios s
      LEFT JOIN makers m ON m.id = s.maker_id
    `).all() as { id: number; name: string; color: string | null; maker_id: number | null; maker_name: string | null; maker_color: string | null }[]
    const studioMap = new Map(studioRows.map(s => [s.id, s]))

    // 부 경계
    const divBoundaries = [32, 96, 224, 480, 992, 2016]
    const getDiv = (rank: number) => {
      for (let d = 0; d < divBoundaries.length; d++) {
        if (rank <= divBoundaries[d]) return d + 1
      }
      return 6
    }

    type LabelAgg = { id: number; name: string; color: string | null; maker_name: string | null; maker_color: string | null; work_count: number; ranks: number[] }
    const divMap = new Map<number, Map<number, LabelAgg>>()
    const allMap = new Map<number, LabelAgg>()

    for (const w of rankedWorks) {
      const studio = studioMap.get(w.studio_id)
      if (!studio) continue
      const div = getDiv(w.rank)

      const makeLabelAgg = (): LabelAgg => ({
        id: studio.id, name: studio.name, color: studio.color,
        maker_name: studio.maker_name, maker_color: studio.maker_color,
        work_count: 0, ranks: [],
      })

      // 부별
      if (!divMap.has(div)) divMap.set(div, new Map())
      const dMap = divMap.get(div)!
      if (!dMap.has(studio.id)) dMap.set(studio.id, makeLabelAgg())
      const dAgg = dMap.get(studio.id)!
      dAgg.work_count++
      dAgg.ranks.push(w.rank)

      // 전체
      if (!allMap.has(studio.id)) allMap.set(studio.id, makeLabelAgg())
      const aAgg = allMap.get(studio.id)!
      aAgg.work_count++
      aAgg.ranks.push(w.rank)
    }

    const toResult = (agg: LabelAgg) => ({
      id: agg.id, name: agg.name, color: agg.color,
      maker_name: agg.maker_name, maker_color: agg.maker_color,
      work_count: agg.work_count,
      avg_rank: Math.round(agg.ranks.reduce((a, b) => a + b, 0) / agg.ranks.length * 10) / 10,
      best_rank: Math.min(...agg.ranks),
      worst_rank: Math.max(...agg.ranks),
    })

    const divisions = [...divMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([division, labels]) => ({
        division,
        labels: [...labels.values()].map(toResult).sort((a, b) => b.work_count - a.work_count || a.avg_rank - b.avg_rank),
      }))

    const allLabels = [...allMap.values()].map(toResult).sort((a, b) => b.work_count - a.work_count || a.avg_rank - b.avg_rank)

    return { divisions, allLabels }
  })

  // 작품 마스터랭킹 제작사 분포
  ipcMain.handle('master-ranking:work-maker-distribution', (_e) => {
    const type = 'work' as const
    const rl = getRecentRunLimit(db(), type)
    const ptsCte = buildPointsCte(type, rl)
    const rankedWorks = db().prepare(`
      WITH ranked AS (
        SELECT
          RANK() OVER (ORDER BY COALESCE(pts.total_points, 0) DESC) AS rank,
          w.id, w.studio_id,
          COALESCE(pts.total_points, 0) AS total_points,
          COALESCE(mrc.master_run_count, 0) AS master_run_count
        FROM works w
        LEFT JOIN ${ptsCte} ON pts.item_id = w.id
        LEFT JOIN (
          SELECT e.item_id, COUNT(DISTINCT r.id) AS master_run_count
          FROM cup_entries e
          JOIN cup_runs r ON r.id = e.run_id
          JOIN cup_tournaments t ON t.id = r.tournament_id AND t.is_master = 1 AND t.type = 'work'
          GROUP BY e.item_id
        ) mrc ON mrc.item_id = w.id
      )
      SELECT ranked.rank, ranked.id, ranked.studio_id, ranked.total_points, ranked.master_run_count FROM ranked
      WHERE master_run_count > 0 AND studio_id IS NOT NULL
    `).all() as { rank: number; id: number; studio_id: number; total_points: number; master_run_count: number }[]

    if (rankedWorks.length === 0) return { divisions: [], allMakers: [] }

    // studio → maker 매핑
    const studioRows = db().prepare(`
      SELECT s.id AS studio_id, s.maker_id, m.id AS maker_id2, m.name, m.color
      FROM studios s
      LEFT JOIN makers m ON m.id = s.maker_id
    `).all() as { studio_id: number; maker_id: number | null; maker_id2: number | null; name: string | null; color: string | null }[]
    const studioToMaker = new Map(studioRows.map(s => [s.studio_id, s.maker_id ? { id: s.maker_id, name: s.name!, color: s.color } : null]))

    const divBoundaries = [32, 96, 224, 480, 992, 2016]
    const getDiv = (rank: number) => {
      for (let d = 0; d < divBoundaries.length; d++) {
        if (rank <= divBoundaries[d]) return d + 1
      }
      return 6
    }

    type MakerAgg = { id: number; name: string; color: string | null; work_count: number; ranks: number[]; label_count: Set<number> }
    const divMap = new Map<number, Map<number, MakerAgg>>()
    const allMap = new Map<number, MakerAgg>()

    for (const w of rankedWorks) {
      const maker = studioToMaker.get(w.studio_id)
      if (!maker) continue
      const div = getDiv(w.rank)

      const makeMakerAgg = (): MakerAgg => ({
        id: maker.id, name: maker.name, color: maker.color,
        work_count: 0, ranks: [], label_count: new Set(),
      })

      if (!divMap.has(div)) divMap.set(div, new Map())
      const dMap = divMap.get(div)!
      if (!dMap.has(maker.id)) dMap.set(maker.id, makeMakerAgg())
      const dAgg = dMap.get(maker.id)!
      dAgg.work_count++
      dAgg.ranks.push(w.rank)
      dAgg.label_count.add(w.studio_id)

      if (!allMap.has(maker.id)) allMap.set(maker.id, makeMakerAgg())
      const aAgg = allMap.get(maker.id)!
      aAgg.work_count++
      aAgg.ranks.push(w.rank)
      aAgg.label_count.add(w.studio_id)
    }

    const toResult = (agg: MakerAgg) => ({
      id: agg.id, name: agg.name, color: agg.color,
      work_count: agg.work_count,
      label_count: agg.label_count.size,
      avg_rank: Math.round(agg.ranks.reduce((a, b) => a + b, 0) / agg.ranks.length * 10) / 10,
      best_rank: Math.min(...agg.ranks),
      worst_rank: Math.max(...agg.ranks),
    })

    const divisions = [...divMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([division, makers]) => ({
        division,
        makers: [...makers.values()].map(toResult).sort((a, b) => b.work_count - a.work_count || a.avg_rank - b.avg_rank),
      }))

    const allMakers = [...allMap.values()].map(toResult).sort((a, b) => b.work_count - a.work_count || a.avg_rank - b.avg_rank)

    return { divisions, allMakers }
  })

}
