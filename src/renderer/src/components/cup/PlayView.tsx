import React, { useState, useEffect, useCallback, useRef } from 'react'
import { cupApi, actorsApi, worksApi, masterRankingApi } from '../../api'
import ImagePreview from '../ImagePreview'
import CardTooltip, { type TooltipState } from '../CardTooltip'
import type { CupTournament, CupRun, CupMatch, ItemInfo, StandingsRow } from './cupTypes'
import { FORMAT_LABEL, roundLabel, blockRoundLabel, finalRoundLabel, itemLabel, itemShortLabel, itemPnLabel, itemImagePath, getDivision, DIV_BOUNDARIES, DIV_LABEL, DIV_COLOR, DIV_TEXT_COLOR } from './cupConstants'
import MatchCard from './MatchCard'
import ActorForm from '../ActorForm'
import WorkForm from '../WorkForm'
import { emitDataChanged } from '../../dataEvents'

export default function PlayView({
  tournamentId,
  runId: initialRunId,
  initialTab = 'match',
  onBack,
  onRankings,
  onNavigateToActor,
  onNavigateToWork,
}: {
  tournamentId: number
  runId?: number
  initialTab?: 'match' | 'standings'
  onBack: () => void
  onRankings: (id: number) => void
  onNavigateToActor: (id: number) => void
  onNavigateToWork: (id: number) => void
}) {
  const [tab, setTab] = useState<'match' | 'standings'>(initialTab)
  const [tournament, setTournament] = useState<CupTournament | null>(null)
  const [run, setRun] = useState<CupRun | null>(null)
  const [currentMatch, setCurrentMatch] = useState<CupMatch | null | 'done'>(null)
  const [progress, setProgress] = useState<{ total: number; done: number; groupDone: number | null; groupTotal: number | null; mainRoundDone: number | null; mainRoundTotal: number | null }>({ total: 0, done: 0, groupDone: null, groupTotal: null, mainRoundDone: null, mainRoundTotal: null })
  const [items, setItems] = useState<Map<number, ItemInfo>>(new Map())
  const [divisionMap, setDivisionMap] = useState<Record<number, number>>({})
  const [masterPtsMap, setMasterPtsMap] = useState<Map<number, number>>(new Map())
  const [standings, setStandings] = useState<{
    type: string
    standings?: StandingsRow[]
    matches?: CupMatch[]
    groupStandings?: { group_id: number; standings: StandingsRow[]; matches?: CupMatch[]; tiebreakMatches?: CupMatch[] }[]
    mainMatches?: CupMatch[]
    // worldcup 전용
    groupPhase?: {
      completed: boolean
      blocks: { block_id: number; label: string; groups: { group_id: number; standings: StandingsRow[]; matches: CupMatch[]; tiebreakMatches: CupMatch[] }[] }[]
    }
    blockTournaments?: { block_id: number; label: string; status: 'pending' | 'in_progress' | 'completed'; rounds: { round: number; matches: CupMatch[] }[] }[]
    finalRound?: { status: 'pending' | 'in_progress' | 'completed'; rounds: { round: number; matches: CupMatch[] }[] } | null
    divisionMap?: Record<number, number>
  } | null>(null)
  const [picking, setPicking] = useState<{ winnerId: number | null; loserId: number | null; fadeOut?: boolean } | null>(null)
  const [cardsVisible, setCardsVisible] = useState(true)
  const [hoveredCard, setHoveredCard] = useState<'item1' | 'item2' | 'draw' | null>(null)
  const [commentDraft, setCommentDraft] = useState('')
  const [commentSaved, setCommentSaved] = useState(false)
  const [standingsTooltip, setStandingsTooltip] = useState<TooltipState | null>(null)
  const [editId, setEditId] = useState<number | null>(null)
  const [editData, setEditData] = useState<any>(null)
  const itemFetchQueue = useRef(new Set<number>())

  const refreshItemInfo = useCallback(async (id: number, type: 'actor' | 'work') => {
    const data = type === 'actor'
      ? await actorsApi.get(id) as ItemInfo
      : await worksApi.get(id) as ItemInfo
    if (data) setItems(prev => new Map(prev).set(id, data))
  }, [])

  const handleOpenEdit = useCallback(async (id: number) => {
    const type = tournament?.type
    if (!type) return
    const data = type === 'actor'
      ? await actorsApi.get(id)
      : await worksApi.get(id)
    setEditData(data)
    setEditId(id)
  }, [tournament?.type])

  const handleEditSave = useCallback(async () => {
    if (editId && tournament?.type) {
      await refreshItemInfo(editId, tournament.type)
      emitDataChanged(tournament.type)
    }
    setEditId(null)
    setEditData(null)
  }, [editId, tournament?.type, refreshItemInfo])

  const fetchItemInfo = useCallback(async (id: number, type: 'actor' | 'work') => {
    if (items.has(id) || itemFetchQueue.current.has(id)) return
    itemFetchQueue.current.add(id)
    try {
      const data = type === 'actor'
        ? await actorsApi.get(id) as ItemInfo
        : await worksApi.get(id) as ItemInfo
      if (data) setItems(prev => new Map(prev).set(id, data))
    } catch { /* ignore */ }
  }, [items])

  const load = useCallback(async () => {
    const result = await cupApi.get(tournamentId) as {
      tournament: CupTournament; run: CupRun | null; currentMatch: CupMatch | null
      totalMatches: number; completedMatches: number; divisionMap?: Record<number, number>
    } | null
    if (!result) return
    setTournament(result.tournament)
    setRun(result.run)
    if (result.divisionMap) setDivisionMap(result.divisionMap)
    setProgress({ total: result.totalMatches, done: result.completedMatches, groupDone: (result as any).groupMatchDone ?? null, groupTotal: (result as any).groupMatchTotal ?? null, mainRoundDone: (result as any).mainRoundDone ?? null, mainRoundTotal: (result as any).mainRoundTotal ?? null })
    const cm = result.currentMatch
    const runStatus = result.run?.status
    const isDone = runStatus === 'completed' || cm === null
    setCurrentMatch(isDone ? 'done' : cm)
    if (isDone) setTab('match')
    if (cm) {
      fetchItemInfo(cm.item1_id, result.tournament.type)
      if (cm.item2_id) fetchItemInfo(cm.item2_id, result.tournament.type)
    }
    if (result.run?.winner_id) {
      fetchItemInfo(result.run.winner_id, result.tournament.type)
    }
    if (result.run?.status === 'completed' && result.run?.winner_id) {
      const type = result.tournament.type
      const wid = result.run.winner_id
      if (type === 'actor') {
        actorsApi.get(wid).then((a: any) => { setCommentDraft(a?.comment ?? ''); setCommentSaved(false) })
      } else {
        worksApi.get(wid).then((w: any) => { setCommentDraft(w?.comment ?? ''); setCommentSaved(false) })
      }
    }
  }, [tournamentId, fetchItemInfo])

  const loadStandings = useCallback(async () => {
    const runId = run?.id
    if (!runId) return
    const s = await cupApi.standings(runId) as typeof standings & { divisionMap?: Record<number, number> }
    setStandings(s)
    if (s?.divisionMap) setDivisionMap(prev => ({ ...prev, ...s.divisionMap }))
    if (s && tournament) {
      const ids = new Set<number>()
      s.standings?.forEach(r => ids.add(r.item_id))
      s.matches?.forEach(m => { ids.add(m.item1_id); if (m.item2_id) ids.add(m.item2_id) })
      s.groupStandings?.forEach(g => {
        g.standings.forEach(r => ids.add(r.item_id))
        g.matches?.forEach(m => { ids.add(m.item1_id); if (m.item2_id) ids.add(m.item2_id) })
        g.tiebreakMatches?.forEach(m => { ids.add(m.item1_id); if (m.item2_id) ids.add(m.item2_id) })
      })
      s.mainMatches?.forEach(m => { ids.add(m.item1_id); if (m.item2_id) ids.add(m.item2_id) })
      // worldcup 신규 구조
      s.groupPhase?.blocks.forEach(b => b.groups.forEach(g => {
        g.standings.forEach(r => ids.add(r.item_id))
        g.matches?.forEach(m => { ids.add(m.item1_id); if (m.item2_id) ids.add(m.item2_id) })
        g.tiebreakMatches?.forEach(m => { ids.add(m.item1_id); if (m.item2_id) ids.add(m.item2_id) })
      }))
      s.blockTournaments?.forEach(bt => bt.rounds.forEach(r => r.matches.forEach(m => { ids.add(m.item1_id); if (m.item2_id) ids.add(m.item2_id) })))
      s.finalRound?.rounds.forEach(r => r.matches.forEach(m => { ids.add(m.item1_id); if (m.item2_id) ids.add(m.item2_id) }))
      for (const id of ids) fetchItemInfo(id, tournament.type)
    }
  }, [run?.id, tournament, fetchItemInfo])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (tab === 'standings') loadStandings() }, [tab, loadStandings])
  useEffect(() => {
    if (!tournament) return
    masterRankingApi.list({ type: tournament.type as 'actor' | 'work', limit: 9999, offset: 0 })
      .then(res => setMasterPtsMap(new Map((res.rows as { id: number; total_points: number }[]).map(r => [r.id, r.total_points]))))
      .catch(() => {})
  }, [tournament?.id])

  const divBadge = (itemId: number) => {
    const div = divisionMap[itemId]
    if (div === undefined) return null
    const label = div === 0 ? '미' : `${div}부`
    return <span className={`text-[9px] px-1 py-0.5 rounded border font-bold shrink-0 ${DIV_COLOR[div] ?? DIV_COLOR[0]}`}>{label}</span>
  }
  const ptsLabel = (itemId: number) => {
    const pts = masterPtsMap.get(itemId)
    if (pts == null) return null
    return <span className="text-[9px] text-gray-500 shrink-0">{pts.toFixed(1)}</span>
  }

  const doPickApi = async (matchId: number, winnerId: number | null, isDraw = false) => {
    try {
      const next = await cupApi.pick(matchId, winnerId, isDraw) as CupMatch | { done: boolean }
      setProgress(p => ({ ...p, done: p.done + 1 }))
      if ('done' in next && next.done) {
        setCurrentMatch('done')
        load()
      } else {
        const m = next as CupMatch
        setCurrentMatch(m)
        if (tournament) {
          fetchItemInfo(m.item1_id, tournament.type)
          if (m.item2_id) fetchItemInfo(m.item2_id, tournament.type)
        }
        if (m.phase === 'group' || m.phase === 'tiebreak') {
          if (run) {
            cupApi.runProgress(run.id).then(prog => {
              setProgress(p => ({ ...p, groupDone: prog.groupMatchDone ?? null, groupTotal: prog.groupMatchTotal ?? null, mainRoundDone: null, mainRoundTotal: null }))
            })
          }
        } else if (m.phase === 'main') {
          if (run) {
            cupApi.runProgress(run.id).then(prog => {
              setProgress(p => ({ ...p, groupDone: null, groupTotal: null, mainRoundDone: prog.mainRoundDone ?? null, mainRoundTotal: prog.mainRoundTotal ?? null }))
            })
          }
        } else {
          setProgress(p => ({ ...p, groupDone: null, groupTotal: null, mainRoundDone: null, mainRoundTotal: null }))
        }
      }
    } catch (e) {
      alert((e as Error).message)
    }
  }

  const handlePick = async (winnerId: number | null, loserId: number | null = null, isDraw = false) => {
    if (!currentMatch || currentMatch === 'done' || picking) return
    const match = currentMatch as CupMatch
    setPicking({ winnerId, loserId })
    await new Promise(r => setTimeout(r, 300))         // 패자 축소
    await new Promise(r => setTimeout(r, 150))         // 가운데 정지
    setPicking({ winnerId, loserId, fadeOut: true })
    await new Promise(r => setTimeout(r, 200))         // 승자 페이드아웃
    setCardsVisible(false)
    await doPickApi(match.id, winnerId, isDraw)        // 새 매치 로드
    await new Promise(r => setTimeout(r, 50))          // 렌더 대기
    setPicking(null)
    await new Promise(r => setTimeout(r, 16))          // picking 리셋 렌더 확정 후 트랜지션 시작
    setCardsVisible(true)
  }

  const item1 = currentMatch && currentMatch !== 'done' ? items.get((currentMatch as CupMatch).item1_id) : null
  const item2 = currentMatch && currentMatch !== 'done' ? (items.get((currentMatch as CupMatch).item2_id!) ?? null) : null
  const match = currentMatch !== 'done' && currentMatch ? currentMatch as CupMatch : null

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || tab !== 'match' || picking || !match) return
      if (document.querySelector('.fixed.inset-0')) return
      if (hoveredCard === 'item1') handlePick(match.item1_id, match.item2_id ?? null)
      else if (hoveredCard === 'item2' && match.item2_id != null) handlePick(match.item2_id, match.item1_id)
      else if (hoveredCard === 'draw' && match.phase === 'group') handlePick(null, null, true)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [tab, picking, match, hoveredCard])
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  const winnerItem = run?.winner_id ? items.get(run.winner_id) : null
  const runStatus = run?.status ?? null

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 상단 바 */}
      <div className="shrink-0 border-b border-gray-700/50">
        <div className="p-4 pb-3">
          <div className="flex items-center gap-3">
            {/* 대회명 */}
            {tournament && (
                <div className="flex items-center gap-1.5 shrink-0">
                  {tournament.is_master === 1 && <span className="text-yellow-400 text-xs font-semibold">★</span>}
                  <span className="text-white text-sm font-semibold">{tournament.name}</span>
                </div>
            )}

            {/* 탭 */}
            <div className="ml-auto flex items-center gap-1 bg-gray-800 rounded-lg px-2 py-1 shrink-0">
              {(['match', 'standings'] as const).map(key => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`px-3 py-1 rounded text-xs font-medium transition ${tab === key ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  {key === 'match' ? '매치' : '현황'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'match' && (
          <div className="flex flex-col items-center justify-center min-h-full py-8 px-4">
            {!tournament && <p className="text-gray-500">로딩 중...</p>}

            {tournament && currentMatch === 'done' && (
              <div className="flex flex-col items-center gap-6">
                {runStatus === 'completed' ? (
                  <>
                    <p className="text-yellow-400 font-bold text-xl">🏆 우승!</p>
                    {winnerItem && (
                      <>
                        <div
                          className="cursor-pointer"
                          onClick={() => tournament.type === 'actor' ? onNavigateToActor(winnerItem.id) : onNavigateToWork(winnerItem.id)}
                        >
                          <ImagePreview
                            path={itemImagePath(winnerItem)}
                            alt={itemLabel(winnerItem)}
                            className={`h-64 rounded-xl border-2 border-yellow-500 hover:border-yellow-400 transition ${tournament.type === 'actor' ? 'w-64' : 'w-[379px]'}`}
                            objectPosition="center 10%"
                          />
                        </div>
                        <p className="text-white font-bold text-lg">{itemLabel(winnerItem)}</p>
                        <div className="w-[672px] flex flex-col gap-2">
                          <p className="text-gray-400 text-sm">코멘트 편집</p>
                          <textarea
                            value={commentDraft}
                            onChange={e => { setCommentDraft(e.target.value); setCommentSaved(false) }}
                            rows={4}
                            className="w-full bg-gray-800 text-white text-sm rounded-lg border border-gray-600 p-3 resize-none focus:outline-none focus:border-blue-500"
                          />
                          <button
                            onClick={async () => {
                              if (tournament.type === 'actor') await actorsApi.update(winnerItem.id, { comment: commentDraft })
                              else await worksApi.update(winnerItem.id, { comment: commentDraft })
                              setCommentSaved(true)
                            }}
                            className="self-end bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-1.5 rounded"
                          >
                            {commentSaved ? '저장됨 ✓' : '저장'}
                          </button>
                        </div>
                      </>
                    )}
                    <button
                      onClick={() => onRankings(tournamentId)}
                      className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm"
                    >
                      순위 보기
                    </button>
                  </>
                ) : (
                  <p className="text-gray-400">처리 중...</p>
                )}
              </div>
            )}

            {tournament && match && (
              <div className="w-full">
                {/* 라운드/진행 정보 */}
                <div className="text-center mb-6">
                  {match.item2_id === null && (
                    <p className="text-gray-400 text-sm mb-1">부전승 — 클릭하여 다음 라운드로 진출</p>
                  )}
                  {tournament.format === 'tournament' && (
                    <p className="text-yellow-400 font-bold text-lg">
                      {roundLabel(match.round)} — {match.match_index + 1}/{Math.ceil(match.round / 2)}경기
                    </p>
                  )}
                  {tournament.format === 'league' && (
                    <p className={`font-bold text-lg ${match.phase === 'main' ? 'text-yellow-400' : match.phase === 'tiebreak' ? 'text-orange-400' : 'text-green-400'}`}>
                      {match.phase === 'group'
                        ? `${match.group_id}조 조별리그 — ${(progress.groupDone ?? 0) + 1}/${progress.groupTotal ?? '?'}경기`
                        : match.phase === 'tiebreak'
                          ? `${match.group_id}조 동점처리 — ${(progress.groupDone ?? 0) + 1}/${progress.groupTotal ?? '?'}경기`
                          : `본선 ${roundLabel(match.round)} — ${(progress.mainRoundDone ?? 0) + 1}/${progress.mainRoundTotal ?? Math.ceil(match.round / 2)}경기`
                      }
                    </p>
                  )}
                  {tournament.format === 'worldcup' && (() => {
                    const blkLabel = match.group_id != null ? String.fromCharCode(65 + Math.floor((match.group_id - 1) / 16)) : ''
                    const rt = tournament.round_total ?? 0
                    const unit = tournament.type === 'actor' ? '인' : '작품'
                    return (
                      <p className={`font-bold text-lg ${match.phase === 'group' || match.phase === 'tiebreak' ? 'text-purple-400' : 'text-yellow-400'}`}>
                        {match.phase === 'group'
                          ? `${blkLabel}블록 ${match.group_id}조 예선 — ${(progress.groupDone ?? 0) + 1}/${progress.groupTotal ?? '?'}경기`
                          : match.phase === 'tiebreak'
                            ? `${blkLabel}블록 ${match.group_id}조 동점처리 — ${(progress.groupDone ?? 0) + 1}/${progress.groupTotal ?? '?'}경기`
                            : match.block_id != null
                              ? (() => {
                                  const blk2 = String.fromCharCode(65 + match.block_id)
                                  const roundStr = rt > 0 ? `${rt / (32 / match.round)}강(${match.round}${unit})` : `${match.round}강`
                                  return `${blk2}블록 본선 ${roundStr} — ${match.match_index + 1}/${match.round / 2}경기`
                                })()
                              : `결승 라운드 — ${finalRoundLabel(match.round)} ${match.match_index + 1}/${match.round / 2}경기`
                        }
                      </p>
                    )
                  })()}
                </div>

                {/* 매치 카드 */}
                <div className={`flex gap-6 justify-center items-center transition-opacity duration-300 ${cardsVisible ? 'opacity-100' : 'opacity-0'}`}>
                  {/* 카드 1 */}
                  <div
                    className={`overflow-hidden shrink-0 ${cardsVisible ? 'transition-all duration-300' : 'transition-none'} ${
                      picking?.loserId === match.item1_id ? 'w-0 opacity-0'
                      : picking?.fadeOut && picking?.winnerId === match.item1_id ? 'w-[40%] opacity-0'
                      : 'w-[40%] opacity-100'
                    }`}
                    onMouseEnter={() => setHoveredCard('item1')}
                    onMouseLeave={() => setHoveredCard(null)}
                  >
                    {item1
                      ? <MatchCard item={item1} type={tournament.type} tournamentId={tournament.id} onClick={() => handlePick(match.item1_id, match.item2_id ?? null)} onNavigate={() => tournament.type === 'actor' ? onNavigateToActor(item1.id) : onNavigateToWork(item1.id)} onEdit={() => handleOpenEdit(item1.id)} disabled={!!picking} division={tournament.is_master ? (divisionMap[match.item1_id] ?? 0) : undefined} isMaster={!!tournament.is_master} />
                      : <div className="h-64 bg-gray-800 rounded-xl flex items-center justify-center text-gray-500">로딩 중...</div>
                    }
                  </div>

                  {/* VS / 무승부 (부전승이면 숨김) */}
                  {match.item2_id !== null && (
                    <div className={`flex flex-col items-center gap-2 shrink-0 overflow-hidden ${cardsVisible ? 'transition-all duration-300' : 'transition-none'} ${picking ? 'w-0 opacity-0' : 'w-16 opacity-100'}`}>
                      <span className="text-gray-500 font-bold text-xl">VS</span>
                      {match.phase === 'group' && (
                        <button
                          onClick={() => handlePick(null, null, true)}
                          disabled={!!picking}
                          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-gray-300 rounded-lg text-xs whitespace-nowrap"
                          onMouseEnter={() => setHoveredCard('draw')}
                          onMouseLeave={() => setHoveredCard(null)}
                        >
                          무승부
                        </button>
                      )}
                    </div>
                  )}

                  {/* 카드 2 (부전승이면 표시 안 함) */}
                  {match.item2_id !== null && (
                    <div
                      className={`overflow-hidden shrink-0 ${cardsVisible ? 'transition-all duration-300' : 'transition-none'} ${
                        picking?.loserId === match.item2_id ? 'w-0 opacity-0'
                        : picking?.fadeOut && picking?.winnerId === match.item2_id ? 'w-[40%] opacity-0'
                        : 'w-[40%] opacity-100'
                      }`}
                      onMouseEnter={() => setHoveredCard('item2')}
                      onMouseLeave={() => setHoveredCard(null)}
                    >
                      {item2
                        ? <MatchCard item={item2} type={tournament.type} tournamentId={tournament.id} onClick={() => handlePick(match.item2_id!, match.item1_id)} onNavigate={() => tournament.type === 'actor' ? onNavigateToActor(item2.id) : onNavigateToWork(item2.id)} onEdit={() => handleOpenEdit(item2.id)} disabled={!!picking} division={tournament.is_master ? (divisionMap[match.item2_id!] ?? 0) : undefined} isMaster={!!tournament.is_master} />
                        : <div className="h-64 bg-gray-800 rounded-xl flex items-center justify-center text-gray-500">로딩 중...</div>
                      }
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'standings' && (
          <div
            className="p-4 space-y-4"
            onMouseMove={e => {
              const el = (e.target as HTMLElement).closest('[data-tip-id]') as HTMLElement | null
              if (el) {
                const id = Number(el.dataset.tipId)
                const type = (el.dataset.tipType ?? 'work') as 'actor' | 'work'
                setStandingsTooltip(prev => prev?.id === id ? { ...prev, x: e.clientX, y: e.clientY } : { type, id, x: e.clientX, y: e.clientY, showCover: true })
              } else {
                setStandingsTooltip(null)
              }
            }}
            onMouseLeave={() => setStandingsTooltip(null)}
          >
            {!standings && <p className="text-gray-500 text-center py-8">로딩 중...</p>}

            {/* ── 리그전 현황 ── */}
            {standings?.type === 'league' && (
              <div className="space-y-6">
                {/* 본선 토너먼트 — 조별리그 완료 후 위로 */}
                {standings.mainMatches && standings.mainMatches.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">본선 토너먼트</h3>
                    <div className="space-y-3">
                      {Object.entries(
                        (standings.mainMatches as CupMatch[]).reduce<Record<string, CupMatch[]>>((acc, m) => {
                          const key = String(m.round)
                          if (!acc[key]) acc[key] = []
                          acc[key].push(m)
                          return acc
                        }, {})
                      )
                      .sort(([a], [b]) => Number(a) - Number(b))
                      .map(([round, roundMatches]) => (
                        <div key={round} className="bg-gray-800 rounded-xl overflow-hidden">
                          <div className="px-4 py-2 border-b border-gray-700 bg-gray-700/40">
                            <span className="text-xs font-semibold text-yellow-400">{roundLabel(Number(round))}</span>
                          </div>
                          <div className="divide-y divide-gray-700/50">
                            {(roundMatches as CupMatch[]).map(m => {
                              const i1 = items.get(m.item1_id)
                              const i2 = m.item2_id ? items.get(m.item2_id) : null
                              return (
                                <div key={m.id} className="px-4 py-1.5 flex items-center gap-1.5 text-sm">
                                  <span className={`flex-1 flex items-center justify-end gap-1 ${m.winner_id === m.item1_id ? '' : m.winner_id !== null ? 'opacity-40' : ''}`}>
                                    {ptsLabel(m.item1_id)}
                                    <span className={`truncate ${m.winner_id === m.item1_id ? 'text-white font-semibold' : m.winner_id !== null ? 'text-gray-500 line-through' : 'text-gray-300'}`}>
                                      {i1 ? <span data-tip-id={i1.id} data-tip-type={tournament?.type}>{itemShortLabel(i1)}</span> : `#${m.item1_id}`}
                                    </span>
                                    {divBadge(m.item1_id)}
                                  </span>
                                  <span className="text-gray-600 text-xs w-6 text-center shrink-0">vs</span>
                                  <span className={`flex-1 flex items-center gap-1 ${m.winner_id === m.item2_id ? '' : m.winner_id !== null ? 'opacity-40' : ''}`}>
                                    {divBadge(m.item2_id ?? 0)}
                                    <span className={`truncate ${m.winner_id === m.item2_id ? 'text-white font-semibold' : m.winner_id !== null ? 'text-gray-500 line-through' : 'text-gray-300'}`}>
                                      {i2 ? <span data-tip-id={i2.id} data-tip-type={tournament?.type}>{itemShortLabel(i2)}</span> : m.item2_id ? `#${m.item2_id}` : '-'}
                                    </span>
                                    {ptsLabel(m.item2_id ?? 0)}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 조별 순위표 */}
                {standings.groupStandings && standings.groupStandings.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">조별 리그</h3>
                    <div className="grid grid-cols-4 gap-3">
                      {[...standings.groupStandings].sort((a, b) => {
                        const activeGroupId = (currentMatch !== 'done' && currentMatch != null && (currentMatch.phase === 'group' || currentMatch.phase === 'tiebreak')) ? currentMatch.group_id : null
                        const aActive = activeGroupId !== null && a.group_id === activeGroupId
                        const bActive = activeGroupId !== null && b.group_id === activeGroupId
                        if (aActive && !bActive) return -1
                        if (!aActive && bActive) return 1
                        const gDone = (g: typeof a) => g.matches && g.matches.length > 0 && g.matches.every(m => m.winner_id !== null || m.is_draw) && (!g.tiebreakMatches || g.tiebreakMatches.length === 0 || g.tiebreakMatches.every(m => m.winner_id !== null || m.is_draw))
                        const aDone = gDone(a), bDone = gDone(b)
                        if (aDone && !bDone) return -1
                        if (!aDone && bDone) return 1
                        if (aDone && bDone) return b.group_id - a.group_id
                        return a.group_id - b.group_id
                      }).map(({ group_id, standings: gs, matches: gms, tiebreakMatches: tbms }) => {
                        const groupDone = gms && gms.length > 0 && gms.every(m => m.winner_id !== null || m.is_draw) && (!tbms || tbms.length === 0 || tbms.every(m => m.winner_id !== null || m.is_draw))
                        const groupActive = !groupDone && (currentMatch !== 'done') && currentMatch != null && currentMatch.group_id === group_id && (currentMatch.phase === 'group' || currentMatch.phase === 'tiebreak')
                        return (
                        <div key={group_id} className="bg-gray-800 rounded-xl overflow-hidden">
                          <div className="px-3 py-1.5 border-b border-gray-700 bg-gray-700/40 flex items-center gap-2">
                            <span className="text-xs font-semibold text-white">{group_id}조</span>
                            {groupDone && <span className="text-xs text-red-400">종료됨</span>}
                            {groupActive && <span className="text-xs text-green-400">진행중</span>}
                          </div>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-gray-700/50 text-gray-500">
                                <th className="px-3 py-1 text-left w-6">#</th>
                                {tournament.is_master ? <th className="px-1 py-1 text-center w-8">리그</th> : null}
                                <th className="px-3 py-1 text-left">이름</th>
                                <th className="px-1 py-1 text-center w-5">승</th>
                                <th className="px-1 py-1 text-center w-5">무</th>
                                <th className="px-1 py-1 text-center w-5">패</th>
                                <th className="px-1 py-1 text-center w-5 font-bold">점</th>
                              </tr>
                            </thead>
                            <tbody>
                              {gs.map((row, idx) => {
                                const item = items.get(row.item_id)
                                const div = divisionMap[row.item_id] ?? 0
                                return (
                                  <tr key={row.item_id} className={`border-b border-gray-700/30 ${idx < 2 ? 'bg-green-900/10' : ''}`}>
                                    <td className="px-3 py-1.5 text-gray-500">{idx + 1}</td>
                                    {tournament.is_master ? (
                                      <td className={`px-1 py-1.5 text-center text-xs font-bold ${DIV_TEXT_COLOR[div] ?? DIV_TEXT_COLOR[0]}`}>
                                        {div === 0 ? '미' : `${div}부`}
                                      </td>
                                    ) : null}
                                    <td className="px-3 py-1.5 text-white truncate max-w-[80px]">
                                      {item ? <span data-tip-id={item.id} data-tip-type={tournament?.type}>{itemPnLabel(item)}</span> : `#${row.item_id}`}
                                      {idx < 2 && <span className="ml-1 text-green-400 text-xs">↑</span>}
                                    </td>
                                    <td className="px-1 py-1.5 text-center text-green-400">{row.w}</td>
                                    <td className="px-1 py-1.5 text-center text-gray-400">{row.d}</td>
                                    <td className="px-1 py-1.5 text-center text-red-400">{row.l}</td>
                                    <td className="px-1 py-1.5 text-center text-white font-bold">{row.pts}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                          {/* 조별 매치 */}
                          {gms && gms.length > 0 && (
                            <div className="border-t border-gray-700/50 divide-y divide-gray-700/30 max-h-40 overflow-y-auto">
                              {gms.map(m => {
                                const i1 = items.get(m.item1_id)
                                const i2 = m.item2_id ? items.get(m.item2_id) : null
                                const done = m.winner_id !== null
                                return (
                                  <div key={m.id} className={`px-2 py-1 flex items-center gap-1 text-xs ${done ? '' : 'opacity-40'}`}>
                                    <span className={`flex-1 text-right truncate ${m.winner_id === m.item1_id ? 'text-white font-semibold' : 'text-gray-400'}`}>
                                      {i1 ? <span data-tip-id={i1.id} data-tip-type={tournament?.type}>{itemPnLabel(i1)}</span> : `#${m.item1_id}`}
                                    </span>
                                    <span className="text-gray-600 w-4 text-center shrink-0">
                                      {m.winner_id ? (m.winner_id === m.item1_id ? '>' : '<') : 'vs'}
                                    </span>
                                    <span className={`flex-1 truncate ${m.winner_id === m.item2_id ? 'text-white font-semibold' : 'text-gray-400'}`}>
                                      {i2 ? <span data-tip-id={i2.id} data-tip-type={tournament?.type}>{itemPnLabel(i2)}</span> : m.item2_id ? `#${m.item2_id}` : '-'}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                          {/* 동점처리 매치 */}
                          {tbms && tbms.length > 0 && (
                            <div className="border-t border-orange-800/40">
                              <div className="px-2 py-0.5 bg-orange-900/20">
                                <span className="text-xs text-orange-400 font-semibold">동점처리</span>
                              </div>
                              <div className="divide-y divide-gray-700/30">
                                {tbms.map(m => {
                                  const i1 = items.get(m.item1_id)
                                  const i2 = m.item2_id ? items.get(m.item2_id) : null
                                  const done = m.winner_id !== null
                                  return (
                                    <div key={m.id} className={`px-2 py-1 flex items-center gap-1 text-xs ${done ? '' : 'opacity-40'}`}>
                                      <span className={`flex-1 text-right truncate ${m.winner_id === m.item1_id ? 'text-white font-semibold' : 'text-gray-400'}`}>
                                        {i1 ? <span data-tip-id={i1.id} data-tip-type={tournament?.type}>{itemPnLabel(i1)}</span> : `#${m.item1_id}`}
                                      </span>
                                      <span className="text-gray-600 w-4 text-center shrink-0">
                                        {m.winner_id ? (m.winner_id === m.item1_id ? '>' : '<') : 'vs'}
                                      </span>
                                      <span className={`flex-1 truncate ${m.winner_id === m.item2_id ? 'text-white font-semibold' : 'text-gray-400'}`}>
                                        {i2 ? <span data-tip-id={i2.id} data-tip-type={tournament?.type}>{itemPnLabel(i2)}</span> : m.item2_id ? `#${m.item2_id}` : '-'}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                        )
                      })}
                    </div>
                  </div>
                )}

              </div>
            )}

            {/* ── 토너먼트 대진표 ── */}
            {standings?.type === 'tournament' && standings.matches && (
              <div className="space-y-3">
                {Object.entries(
                  (standings.matches as CupMatch[]).reduce<Record<string, CupMatch[]>>((acc, m) => {
                    const key = String(m.round)
                    if (!acc[key]) acc[key] = []
                    acc[key].push(m)
                    return acc
                  }, {})
                )
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([round, roundMatches]) => (
                  <div key={round} className="bg-gray-800 rounded-xl overflow-hidden">
                    <div className="px-4 py-2 border-b border-gray-700 bg-gray-700/40">
                      <span className="text-xs font-semibold text-yellow-400">{roundLabel(Number(round))}</span>
                    </div>
                    <div className="divide-y divide-gray-700/50">
                      {(roundMatches as CupMatch[]).map(m => {
                        const i1 = items.get(m.item1_id)
                        const i2 = m.item2_id ? items.get(m.item2_id) : null
                        return (
                          <div key={m.id} className="px-4 py-1.5 flex items-center gap-1.5 text-sm">
                            <span className={`flex-1 flex items-center justify-end gap-1 ${m.winner_id === m.item1_id ? '' : m.winner_id !== null ? 'opacity-40' : ''}`}>
                              {ptsLabel(m.item1_id)}
                              <span className={`truncate ${m.winner_id === m.item1_id ? 'text-white font-semibold' : m.winner_id !== null ? 'text-gray-500 line-through' : 'text-gray-300'}`}>
                                {i1 ? <span data-tip-id={i1.id} data-tip-type={tournament?.type}>{itemShortLabel(i1)}</span> : `#${m.item1_id}`}
                              </span>
                              {divBadge(m.item1_id)}
                            </span>
                            <span className="text-gray-600 text-xs w-6 text-center shrink-0">vs</span>
                            <span className={`flex-1 flex items-center gap-1 ${m.winner_id === m.item2_id ? '' : m.winner_id !== null ? 'opacity-40' : ''}`}>
                              {divBadge(m.item2_id ?? 0)}
                              <span className={`truncate ${m.winner_id === m.item2_id ? 'text-white font-semibold' : m.winner_id !== null ? 'text-gray-500 line-through' : 'text-gray-300'}`}>
                                {i2 ? <span data-tip-id={i2.id} data-tip-type={tournament?.type}>{itemShortLabel(i2)}</span> : m.item2_id ? `#${m.item2_id}` : '-'}
                              </span>
                              {ptsLabel(m.item2_id ?? 0)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── 월드컵 현황 ── */}
            {standings?.type === 'worldcup' && (() => {
              const activeGroupId = (currentMatch !== 'done' && currentMatch != null && (currentMatch.phase === 'group' || currentMatch.phase === 'tiebreak')) ? currentMatch.group_id : null
              const activeBlockId = (currentMatch !== 'done' && currentMatch != null && currentMatch.phase === 'main' && currentMatch.block_id != null) ? currentMatch.block_id : null

              // 블록 토너먼트 / 결승 라운드 + 조별 예선 (항상 하단)
              const roundTotal = run?.round_total ?? 0
              const itemType = tournament?.type ?? 'actor'
              const SLOT_H = 28
              const TOTAL_SLOTS = 32

              // item_id → { group_id, rank, division } 맵
              const divisionMap = standings.divisionMap ?? {}
              const itemOriginMap = new Map<number, { group_id: number; rank: number; block_label: string }>()
              standings.groupPhase?.blocks.forEach(b => b.groups.forEach(g => {
                const gqs = (g as any).qualifiers as number[] | null | undefined
                const blkLabel = String.fromCharCode(65 + b.block_id)
                g.standings.forEach((row, idx) => {
                  const qIdx = gqs ? gqs.indexOf(row.item_id) : -1
                  itemOriginMap.set(row.item_id, { group_id: g.group_id, rank: qIdx !== -1 ? qIdx + 1 : idx + 1, block_label: blkLabel })
                })
              }))
              const DIV_TEXT: Record<number, string> = {
                1: 'text-yellow-300', 2: 'text-orange-300', 3: 'text-blue-300',
                4: 'text-green-300', 5: 'text-purple-300', 6: 'text-gray-400', 0: 'text-gray-500'
              }
              const originLabel = (itemId: number, showBlock = false) => {
                const origin = itemOriginMap.get(itemId)
                const div = divisionMap[itemId] ?? 0
                const divText = div === 0 ? '미지정' : `${div}부`
                if (!origin) return null
                const blockText = showBlock && origin.block_label ? `/${origin.block_label}블록` : ''
                return { text: `${divText}/${origin.group_id}조/${origin.rank}위${blockText}`, color: DIV_TEXT[div] ?? 'text-gray-500' }
              }

              const sortedBlocks = [...(standings.blockTournaments ?? [])].sort((a, b) => {
                if (a.status === 'in_progress' && b.status !== 'in_progress') return -1
                if (b.status === 'in_progress' && a.status !== 'in_progress') return 1
                return a.block_id - b.block_id
              })

              const groupPhaseEl = standings.groupPhase ? (
                <div className={standings.groupPhase.completed ? 'border-t border-gray-700/50 pt-4 space-y-6' : 'space-y-6'}>
                  {standings.groupPhase.completed && (
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">조별 예선 결과</h3>
                  )}
                  {[...standings.groupPhase.blocks].sort((a, b) => {
                    if (activeGroupId !== null) {
                      const aHas = a.groups.some(g => g.group_id === activeGroupId)
                      const bHas = b.groups.some(g => g.group_id === activeGroupId)
                      if (aHas && !bHas) return -1
                      if (bHas && !aHas) return 1
                    }
                    return a.block_id - b.block_id
                  }).map(block => (
                    <div key={block.block_id}>
                      <h3 className="text-xs font-semibold text-purple-400 mb-2 uppercase tracking-wide">블록 {block.label}</h3>
                      <div className="grid grid-cols-4 gap-3">
                        {[...block.groups].sort((a, b) => {
                          const aActive = activeGroupId !== null && a.group_id === activeGroupId
                          const bActive = activeGroupId !== null && b.group_id === activeGroupId
                          if (aActive && !bActive) return -1
                          if (!aActive && bActive) return 1
                          const gDone = (g: typeof a) => g.matches && g.matches.length > 0 && g.matches.every(m => m.winner_id !== null || m.is_draw) && (!g.tiebreakMatches || g.tiebreakMatches.length === 0 || g.tiebreakMatches.every(m => m.winner_id !== null || m.is_draw))
                          const aDone = gDone(a), bDone = gDone(b)
                          if (aDone && !bDone) return -1
                          if (!aDone && bDone) return 1
                          if (aDone && bDone) return b.group_id - a.group_id
                          return a.group_id - b.group_id
                        }).map(({ group_id, standings: gs, matches: gms, tiebreakMatches: tbms, qualifiers: gqs }) => {
                          const groupDone = gms && gms.length > 0 && gms.every(m => m.winner_id !== null || m.is_draw) && (!tbms || tbms.length === 0 || tbms.every(m => m.winner_id !== null || m.is_draw))
                          const groupActive = !groupDone && activeGroupId === group_id
                          return (
                            <div key={group_id} className="bg-gray-800 rounded-xl overflow-hidden">
                              <div className="px-3 py-1.5 border-b border-gray-700 bg-gray-700/40 flex items-center gap-2">
                                <span className="text-xs font-semibold text-white">{group_id}조</span>
                                {groupDone && <span className="text-xs text-red-400">종료됨</span>}
                                {groupActive && <span className="text-xs text-green-400 animate-pulse">진행중</span>}
                              </div>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-gray-700/50 text-gray-500">
                                    <th className="px-3 py-1 text-left w-6">#</th>
                                    {tournament.is_master ? <th className="px-1 py-1 text-center w-8">리그</th> : null}
                                    <th className="px-3 py-1 text-left">이름</th>
                                    <th className="px-1 py-1 text-center w-5">승</th>
                                    <th className="px-1 py-1 text-center w-5">무</th>
                                    <th className="px-1 py-1 text-center w-5">패</th>
                                    <th className="px-1 py-1 text-center w-5 font-bold">점</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {gs.map((row, idx) => {
                                    const item = items.get(row.item_id)
                                    const div = divisionMap[row.item_id] ?? 0
                                    return (
                                      <tr key={row.item_id} className={`border-b border-gray-700/30 ${(gqs ? gqs.includes(row.item_id) : idx < 2) ? 'bg-purple-900/10' : ''}`}>
                                        <td className="px-3 py-1.5 text-gray-500">{gs.findIndex(s => s.pts === row.pts && s.w === row.w) + 1}</td>
                                        {tournament.is_master ? (
                                          <td className={`px-1 py-1.5 text-center text-xs font-bold ${DIV_TEXT_COLOR[div] ?? DIV_TEXT_COLOR[0]}`}>
                                            {div === 0 ? '미' : `${div}부`}
                                          </td>
                                        ) : null}
                                        <td className="px-3 py-1.5 text-white truncate max-w-[80px]">
                                          {item ? <span data-tip-id={item.id} data-tip-type={tournament?.type}>{itemPnLabel(item)}</span> : `#${row.item_id}`}
                                          {(gqs ? gqs.includes(row.item_id) : idx < 2) && <span className="ml-1 text-purple-400 text-xs">↑</span>}
                                        </td>
                                        <td className="px-1 py-1.5 text-center text-green-400">{row.w}</td>
                                        <td className="px-1 py-1.5 text-center text-gray-400">{row.d}</td>
                                        <td className="px-1 py-1.5 text-center text-red-400">{row.l}</td>
                                        <td className="px-1 py-1.5 text-center text-white font-bold">{row.pts}</td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                              {gms && gms.length > 0 && (
                                <div className="border-t border-gray-700/50 divide-y divide-gray-700/30 max-h-40 overflow-y-auto">
                                  {gms.map(m => {
                                    const i1 = items.get(m.item1_id)
                                    const i2 = m.item2_id ? items.get(m.item2_id) : null
                                    const done = m.winner_id !== null
                                    return (
                                      <div key={m.id} className={`px-2 py-1 flex items-center gap-1 text-xs ${done ? '' : 'opacity-40'}`}>
                                        <span className={`flex-1 text-right truncate ${m.winner_id === m.item1_id ? 'text-white font-semibold' : 'text-gray-400'}`}>
                                          {i1 ? <span data-tip-id={i1.id} data-tip-type={tournament?.type}>{itemPnLabel(i1)}</span> : `#${m.item1_id}`}
                                        </span>
                                        <span className="text-gray-600 w-4 text-center shrink-0">
                                          {m.winner_id ? (m.winner_id === m.item1_id ? '>' : '<') : 'vs'}
                                        </span>
                                        <span className={`flex-1 truncate ${m.winner_id === m.item2_id ? 'text-white font-semibold' : 'text-gray-400'}`}>
                                          {i2 ? <span data-tip-id={i2.id} data-tip-type={tournament?.type}>{itemPnLabel(i2)}</span> : m.item2_id ? `#${m.item2_id}` : '-'}
                                        </span>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                              {tbms && tbms.length > 0 && (
                                <div className="border-t border-orange-800/40">
                                  <div className="px-2 py-0.5 bg-orange-900/20">
                                    <span className="text-xs text-orange-400 font-semibold">동점처리</span>
                                  </div>
                                  <div className="divide-y divide-gray-700/30">
                                    {tbms.map(m => {
                                      const i1 = items.get(m.item1_id)
                                      const i2 = m.item2_id ? items.get(m.item2_id) : null
                                      const done = m.winner_id !== null
                                      return (
                                        <div key={m.id} className={`px-2 py-1 flex items-center gap-1 text-xs ${done ? '' : 'opacity-40'}`}>
                                          <span className={`flex-1 text-right truncate ${m.winner_id === m.item1_id ? 'text-white font-semibold' : 'text-gray-400'}`}>
                                            {i1 ? <span data-tip-id={i1.id} data-tip-type={tournament?.type}>{itemPnLabel(i1)}</span> : `#${m.item1_id}`}
                                          </span>
                                          <span className="text-gray-600 w-4 text-center shrink-0">
                                            {m.winner_id ? (m.winner_id === m.item1_id ? '>' : '<') : 'vs'}
                                          </span>
                                          <span className={`flex-1 truncate ${m.winner_id === m.item2_id ? 'text-white font-semibold' : 'text-gray-400'}`}>
                                            {i2 ? <span data-tip-id={i2.id} data-tip-type={tournament?.type}>{itemPnLabel(i2)}</span> : m.item2_id ? `#${m.item2_id}` : '-'}
                                          </span>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null

              const finalRoundActive = currentMatch !== 'done' && currentMatch != null && currentMatch.phase === 'main' && (currentMatch as any).block_id == null
              const finalRoundEl = (() => {
                if (!standings.finalRound) return null
                const fr = standings.finalRound
                const isCompleted = fr.status === 'completed'
                const frRoundsSorted = [...fr.rounds].sort((a, b) => b.round - a.round)
                const FINAL_SLOTS = frRoundsSorted.length > 0 ? frRoundsSorted[0].matches.length * 2 : 8
                const CONN_W = 24
                return (
                  <div className={`bg-gray-800 rounded-xl overflow-hidden border ${finalRoundActive ? 'border-yellow-500/60' : 'border-yellow-500/30'}`}>
                    <div className="px-4 py-2 border-b border-gray-700 bg-gray-700/40 flex items-center gap-2">
                      <span className="text-sm font-bold text-yellow-400">결승 라운드</span>
                      {finalRoundActive && <span className="text-xs text-yellow-400 animate-pulse">진행중</span>}
                      {isCompleted && <span className="text-xs text-green-400">완료</span>}
                    </div>
                    <div className="overflow-x-auto p-2">
                      <div className="flex gap-0 min-w-max">
                        {frRoundsSorted.map((rd, rdIdx) => {
                          const matchCount = rd.matches.length
                          const slotsPerMatch = FINAL_SLOTS / matchCount
                          const isLastRound = rdIdx === frRoundsSorted.length - 1
                          return (
                            <React.Fragment key={rd.round}>
                              <div className="flex flex-col" style={{ width: 240 }}>
                                <div className="text-center text-xs text-yellow-500/70 py-1 border-b border-gray-700/40 mb-1">
                                  {finalRoundLabel(rd.round)}
                                </div>
                                <div className="relative" style={{ height: FINAL_SLOTS * SLOT_H }}>
                                  {rd.matches.map((m, matchIdx) => {
                                    const topPx = matchIdx * slotsPerMatch * SLOT_H + (slotsPerMatch / 2 - 1) * SLOT_H
                                    const i1 = items.get(m.item1_id)
                                    const i2 = m.item2_id ? items.get(m.item2_id) : null
                                    const o1 = originLabel(m.item1_id, true)
                                    const o2 = m.item2_id ? originLabel(m.item2_id, true) : null
                                    return (
                                      <div key={m.id} className="absolute left-1 right-1" style={{ top: topPx }}>
                                        <div className={`text-xs px-2 py-0.5 rounded-t border-l-2 ${m.winner_id === m.item1_id ? 'border-yellow-400 bg-yellow-900/20' : m.winner_id !== null ? 'border-gray-700' : 'border-gray-600'}`}>
                                          {o1 ? (
                                            <span className={`flex items-center gap-1 ${m.winner_id !== null && m.winner_id !== m.item1_id ? 'opacity-40 line-through' : ''}`}>
                                              <span className={`w-[105px] shrink-0 font-bold text-[10px] truncate ${o1.color}`}>{o1.text}</span>
                                              <span className={`w-[120px] shrink-0 truncate ${m.winner_id === m.item1_id ? 'text-white font-semibold' : 'text-gray-300'}`}>{i1 ? <span data-tip-id={i1.id} data-tip-type={tournament?.type}>{itemPnLabel(i1)}</span> : `#${m.item1_id}`}</span>
                                            </span>
                                          ) : (
                                            <span className={`truncate block ${m.winner_id === m.item1_id ? 'text-white font-semibold' : m.winner_id !== null ? 'text-gray-600 line-through' : 'text-gray-300'}`}>{i1 ? <span data-tip-id={i1.id} data-tip-type={tournament?.type}>{itemPnLabel(i1)}</span> : `#${m.item1_id}`}</span>
                                          )}
                                        </div>
                                        <div className={`text-xs px-2 py-0.5 rounded-b border-l-2 border-t border-gray-700/30 ${m.winner_id === m.item2_id ? 'border-yellow-400 bg-yellow-900/20' : m.winner_id !== null ? 'border-gray-700' : 'border-gray-600'}`}>
                                          {o2 ? (
                                            <span className={`flex items-center gap-1 ${m.winner_id !== null && m.winner_id !== m.item2_id ? 'opacity-40 line-through' : ''}`}>
                                              <span className={`w-[105px] shrink-0 font-bold text-[10px] truncate ${o2.color}`}>{o2.text}</span>
                                              <span className={`w-[120px] shrink-0 truncate ${m.winner_id === m.item2_id ? 'text-white font-semibold' : 'text-gray-300'}`}>{i2 ? <span data-tip-id={i2.id} data-tip-type={tournament?.type}>{itemPnLabel(i2)}</span> : `#${m.item2_id}`}</span>
                                            </span>
                                          ) : (
                                            <span className={`truncate block ${m.winner_id === m.item2_id ? 'text-white font-semibold' : m.winner_id !== null ? 'text-gray-600 line-through' : 'text-gray-300'}`}>{i2 ? <span data-tip-id={i2.id} data-tip-type={tournament?.type}>{itemPnLabel(i2)}</span> : m.item2_id ? `#${m.item2_id}` : '-'}</span>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                              {!isLastRound && (
                                <div className="flex flex-col shrink-0" style={{ width: CONN_W }}>
                                  <div className="text-xs py-1 border-b border-transparent mb-1" style={{ visibility: 'hidden' }}>x</div>
                                  <svg width={CONN_W} height={FINAL_SLOTS * SLOT_H} style={{ display: 'block' }}>
                                    {Array.from({ length: matchCount / 2 }, (_, i) => {
                                      const topY = (2 * i * slotsPerMatch + slotsPerMatch / 2) * SLOT_H
                                      const botY = ((2 * i + 1) * slotsPerMatch + slotsPerMatch / 2) * SLOT_H
                                      const midY = (topY + botY) / 2
                                      const m0 = rd.matches[2 * i]
                                      const m1 = rd.matches[2 * i + 1]
                                      const m0done = m0?.winner_id != null
                                      const m1done = m1?.winner_id != null
                                      const bothDone = m0done && m1done
                                      const nextRound = frRoundsSorted[rdIdx + 1]
                                      const nextM = nextRound?.matches[i]
                                      const nextDecided = nextM?.winner_id != null
                                      const topActive = m0done && (!nextDecided || nextM?.winner_id === nextM?.item1_id)
                                      const botActive = m1done && (!nextDecided || nextM?.winner_id === nextM?.item2_id)
                                      const C_ACTIVE = '#e5e7eb'
                                      const C_IDLE = '#374151'
                                      return (
                                        <g key={i}>
                                          <line x1={0} y1={topY} x2={CONN_W / 2} y2={topY} stroke={topActive ? C_ACTIVE : C_IDLE} strokeWidth={1} />
                                          <line x1={CONN_W / 2} y1={topY} x2={CONN_W / 2} y2={midY} stroke={topActive ? C_ACTIVE : C_IDLE} strokeWidth={1} />
                                          <line x1={CONN_W / 2} y1={midY} x2={CONN_W / 2} y2={botY} stroke={botActive ? C_ACTIVE : C_IDLE} strokeWidth={1} />
                                          <line x1={0} y1={botY} x2={CONN_W / 2} y2={botY} stroke={botActive ? C_ACTIVE : C_IDLE} strokeWidth={1} />
                                          <line x1={CONN_W / 2} y1={midY} x2={CONN_W} y2={midY} stroke={bothDone ? C_ACTIVE : C_IDLE} strokeWidth={1} />
                                        </g>
                                      )
                                    })}
                                  </svg>
                                </div>
                              )}
                            </React.Fragment>
                          )
                        })}
                        {isCompleted && (() => {
                          const lastRound = frRoundsSorted[frRoundsSorted.length - 1]
                          const champion = lastRound?.matches[0]?.winner_id
                          if (!champion) return null
                          const item = items.get(champion)
                          const o = originLabel(champion, true)
                          const topPx = (FINAL_SLOTS / 2 - 1) * SLOT_H
                          return (
                            <div className="flex flex-col" style={{ width: 240 }}>
                              <div className="text-center text-xs text-yellow-400 py-1 border-b border-gray-700/40 mb-1">🏆 우승</div>
                              <div className="relative" style={{ height: FINAL_SLOTS * SLOT_H }}>
                                <div className="absolute left-1 right-1" style={{ top: topPx }}>
                                  <div className="text-xs px-2 py-0.5 rounded border-l-2 border-yellow-400 bg-yellow-900/30 font-semibold">
                                    {o ? (
                                      <span className="flex items-center gap-1">
                                        <span className={`w-[105px] shrink-0 font-bold text-[10px] truncate ${o.color}`}>{o.text}</span>
                                        <span className="w-[120px] shrink-0 truncate text-yellow-200">{item ? <span data-tip-id={item.id} data-tip-type={tournament?.type}>{itemPnLabel(item)}</span> : `#${champion}`}</span>
                                      </span>
                                    ) : <span className="text-yellow-200">{item ? <span data-tip-id={item.id} data-tip-type={tournament?.type}>{itemPnLabel(item)}</span> : `#${champion}`}</span>}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  </div>
                )
              })()

              return (
                <div className="space-y-4">
                  {/* 결승 라운드: 항상 최상단 */}
                  {finalRoundEl}
                  {/* 조별 예선 진행 중: 상단 표시 */}
                  {!standings.groupPhase?.completed && groupPhaseEl}
                  {sortedBlocks.map(block => {
                    const isActive = activeBlockId === block.block_id
                    const isCompleted = block.status === 'completed'
                    const isPending = block.status === 'pending'
                    const roundsSorted = [...block.rounds].sort((a, b) => b.round - a.round)

                    return (
                      <div key={block.block_id} className={`bg-gray-800 rounded-xl overflow-hidden border ${isActive ? 'border-purple-500/60' : 'border-gray-700/30'}`}>
                        <div className="px-4 py-2 border-b border-gray-700 bg-gray-700/40 flex items-center gap-2">
                          <span className="text-sm font-bold text-white">블록 {block.label}</span>
                          {isActive && <span className="text-xs text-purple-400 animate-pulse">진행중</span>}
                          {isCompleted && <span className="text-xs text-green-400">완료</span>}
                          {isPending && <span className="text-xs text-gray-500">대기 중</span>}
                        </div>
                        {isPending ? (
                          <div className="overflow-x-auto p-2">
                            {(() => {
                              const phaseBlock = standings.groupPhase?.blocks.find(b => b.block_id === block.block_id)
                              const blockGroups = phaseBlock?.groups ?? []
                              if (blockGroups.length === 0) return <div className="py-4 text-center text-gray-600 text-sm">이전 블록 완료 후 시작됩니다</div>

                              const isGDone = (g: typeof blockGroups[0]) =>
                                g.matches.length > 0 &&
                                g.matches.every((m: CupMatch) => m.winner_id !== null || m.is_draw) &&
                                (!g.tiebreakMatches || g.tiebreakMatches.length === 0 || g.tiebreakMatches.every((m: CupMatch) => m.winner_id !== null || m.is_draw))

                              // 크로스 시딩: startBlock과 동일하게 topHalf/bottomHalf 분리
                              // → 같은 조 진출자가 블록 파이널 전까지 만나지 않도록 보장
                              type BSlot = { group_id: number; rank: number; item_id: number | null }
                              const topBracket: [BSlot, BSlot][] = []
                              const bottomBracket: [BSlot, BSlot][] = []
                              for (let i = 0; i < blockGroups.length; i += 2) {
                                const g0 = blockGroups[i]
                                const g1 = blockGroups[i + 1]
                                if (!g0 || !g1) continue
                                const d0 = isGDone(g0), d1 = isGDone(g1)
                                const g0q = (g0 as any).qualifiers as number[] | null | undefined
                                const g1q = (g1 as any).qualifiers as number[] | null | undefined
                                topBracket.push([
                                  { group_id: g0.group_id, rank: 1, item_id: d0 ? (g0q?.[0] ?? g0.standings[0]?.item_id ?? null) : null },
                                  { group_id: g1.group_id, rank: 2, item_id: d1 ? (g1q?.[1] ?? g1.standings[1]?.item_id ?? null) : null },
                                ])
                                bottomBracket.push([
                                  { group_id: g1.group_id, rank: 1, item_id: d1 ? (g1q?.[0] ?? g1.standings[0]?.item_id ?? null) : null },
                                  { group_id: g0.group_id, rank: 2, item_id: d0 ? (g0q?.[1] ?? g0.standings[1]?.item_id ?? null) : null },
                                ])
                              }
                              const bracketMatches = [...topBracket, ...bottomBracket]

                              const confirmedCount = bracketMatches.reduce((n, [s1, s2]) => n + (s1.item_id !== null ? 1 : 0) + (s2.item_id !== null ? 1 : 0), 0)

                              return (
                                <div className="flex gap-0 min-w-max">
                                  <div className="flex flex-col" style={{ width: 208 }}>
                                    <div className="text-center text-xs text-gray-500 py-1 border-b border-gray-700/40 mb-1">
                                      {blockRoundLabel(32, roundTotal, itemType)}
                                      <span className="ml-1 text-gray-600">({confirmedCount}/32)</span>
                                    </div>
                                    <div className="relative" style={{ height: TOTAL_SLOTS * SLOT_H }}>
                                      {bracketMatches.map(([s1, s2], mi) => {
                                        const topPx = mi * 2 * SLOT_H
                                        const it1 = s1.item_id ? items.get(s1.item_id) : null
                                        const it2 = s2.item_id ? items.get(s2.item_id) : null
                                        const o1 = s1.item_id ? originLabel(s1.item_id) : null
                                        const o2 = s2.item_id ? originLabel(s2.item_id) : null
                                        return (
                                          <div key={mi} className="absolute left-1 right-1" style={{ top: topPx }}>
                                            <div className={`text-xs px-2 py-0.5 rounded-t border-l-2 ${s1.item_id !== null ? 'border-purple-400 bg-purple-900/20' : 'border-gray-700/40 text-gray-600'}`}>
                                              {s1.item_id !== null ? (
                                                <span className="flex items-center gap-1">
                                                  {o1 && <span className={`w-[68px] shrink-0 font-bold text-[10px] truncate ${o1.color}`}>{o1.text}</span>}
                                                  <span className="w-[120px] shrink-0 truncate text-purple-200">{it1 ? <span data-tip-id={it1.id} data-tip-type={tournament?.type}>{itemPnLabel(it1)}</span> : `#${s1.item_id}`}</span>
                                                </span>
                                              ) : `${s1.group_id}조 ${s1.rank}위`}
                                            </div>
                                            <div className={`text-xs px-2 py-0.5 rounded-b border-l-2 border-t border-gray-700/30 ${s2.item_id !== null ? 'border-purple-400 bg-purple-900/20' : 'border-gray-700/40 text-gray-600'}`}>
                                              {s2.item_id !== null ? (
                                                <span className="flex items-center gap-1">
                                                  {o2 && <span className={`w-[68px] shrink-0 font-bold text-[10px] truncate ${o2.color}`}>{o2.text}</span>}
                                                  <span className="w-[120px] shrink-0 truncate text-purple-200">{it2 ? <span data-tip-id={it2.id} data-tip-type={tournament?.type}>{itemPnLabel(it2)}</span> : `#${s2.item_id}`}</span>
                                                </span>
                                              ) : `${s2.group_id}조 ${s2.rank}위`}
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                </div>
                              )
                            })()}
                          </div>
                        ) : (
                          <div className="overflow-x-auto p-2">
                            <div className="flex gap-0 min-w-max">
                              {roundsSorted.map((rd, rdIdx) => {
                                const matchCount = rd.matches.length
                                const slotsPerMatch = TOTAL_SLOTS / matchCount
                                const isFirstRound = rd.round === roundsSorted[0].round
                                const isLastRound = rdIdx === roundsSorted.length - 1
                                const CONN_W = 24
                                return (
                                  <React.Fragment key={rd.round}>
                                  <div className="flex flex-col" style={{ width: 200 }}>
                                    <div className="text-center text-xs text-gray-500 py-1 border-b border-gray-700/40 mb-1">
                                      {blockRoundLabel(rd.round, roundTotal, itemType)}
                                    </div>
                                    <div className="relative" style={{ height: TOTAL_SLOTS * SLOT_H }}>
                                      {rd.matches.map((m, matchIdx) => {
                                        const topPx = matchIdx * slotsPerMatch * SLOT_H + (slotsPerMatch / 2 - 1) * SLOT_H
                                        const i1 = items.get(m.item1_id)
                                        const i2 = m.item2_id ? items.get(m.item2_id) : null
                                        const o1 = originLabel(m.item1_id)
                                        const o2 = m.item2_id ? originLabel(m.item2_id) : null
                                        return (
                                          <div key={m.id} className="absolute left-1 right-1" style={{ top: topPx }}>
                                            <div className={`text-xs px-2 py-0.5 rounded-t border-l-2 ${m.winner_id === m.item1_id ? 'border-purple-400 bg-purple-900/20' : m.winner_id !== null ? 'border-gray-700' : 'border-gray-600'}`}>
                                              {o1 ? (
                                                <span className={`flex items-center gap-1 ${m.winner_id !== null && m.winner_id !== m.item1_id ? 'opacity-40 line-through' : ''}`}>
                                                  <span className={`w-[68px] shrink-0 font-bold text-[10px] truncate ${o1.color}`}>{o1.text}</span>
                                                  <span className={`w-[120px] shrink-0 truncate ${m.winner_id === m.item1_id ? 'text-white font-semibold' : 'text-gray-300'}`}>{i1 ? <span data-tip-id={i1.id} data-tip-type={tournament?.type}>{itemPnLabel(i1)}</span> : `#${m.item1_id}`}</span>
                                                </span>
                                              ) : (
                                                <span className={`truncate block ${m.winner_id === m.item1_id ? 'text-white font-semibold' : m.winner_id !== null ? 'text-gray-600 line-through' : 'text-gray-300'}`}>{i1 ? <span data-tip-id={i1.id} data-tip-type={tournament?.type}>{itemPnLabel(i1)}</span> : `#${m.item1_id}`}</span>
                                              )}
                                            </div>
                                            <div className={`text-xs px-2 py-0.5 rounded-b border-l-2 border-t border-gray-700/30 ${m.winner_id === m.item2_id ? 'border-purple-400 bg-purple-900/20' : m.winner_id !== null ? 'border-gray-700' : 'border-gray-600'}`}>
                                              {o2 ? (
                                                <span className={`flex items-center gap-1 ${m.winner_id !== null && m.winner_id !== m.item2_id ? 'opacity-40 line-through' : ''}`}>
                                                  <span className={`w-[68px] shrink-0 font-bold text-[10px] truncate ${o2.color}`}>{o2.text}</span>
                                                  <span className={`w-[120px] shrink-0 truncate ${m.winner_id === m.item2_id ? 'text-white font-semibold' : 'text-gray-300'}`}>{i2 ? <span data-tip-id={i2.id} data-tip-type={tournament?.type}>{itemPnLabel(i2)}</span> : `#${m.item2_id}`}</span>
                                                </span>
                                              ) : (
                                                <span className={`truncate block ${m.winner_id === m.item2_id ? 'text-white font-semibold' : m.winner_id !== null ? 'text-gray-600 line-through' : 'text-gray-300'}`}>{i2 ? <span data-tip-id={i2.id} data-tip-type={tournament?.type}>{itemPnLabel(i2)}</span> : m.item2_id ? `#${m.item2_id}` : '-'}</span>
                                              )}
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                  {!isLastRound && (
                                    <div className="flex flex-col shrink-0" style={{ width: CONN_W }}>
                                      <div className="text-xs py-1 border-b border-transparent mb-1" style={{ visibility: 'hidden' }}>x</div>
                                      <svg width={CONN_W} height={TOTAL_SLOTS * SLOT_H} style={{ display: 'block' }}>
                                        {Array.from({ length: matchCount / 2 }, (_, i) => {
                                          const topY = (2 * i * slotsPerMatch + slotsPerMatch / 2) * SLOT_H
                                          const botY = ((2 * i + 1) * slotsPerMatch + slotsPerMatch / 2) * SLOT_H
                                          const midY = (topY + botY) / 2
                                          const m0 = rd.matches[2 * i]
                                          const m1 = rd.matches[2 * i + 1]
                                          const m0done = m0?.winner_id != null
                                          const m1done = m1?.winner_id != null
                                          const bothDone = m0done && m1done
                                          const nextRound = roundsSorted[rdIdx + 1]
                                          const nextM = nextRound?.matches[i]
                                          const nextDecided = nextM?.winner_id != null
                                          const topActive = m0done && (!nextDecided || nextM?.winner_id === nextM?.item1_id)
                                          const botActive = m1done && (!nextDecided || nextM?.winner_id === nextM?.item2_id)
                                          const C_ACTIVE = '#e5e7eb'
                                          const C_IDLE = '#374151'
                                          return (
                                            <g key={i}>
                                              <line x1={0} y1={topY} x2={CONN_W / 2} y2={topY} stroke={topActive ? C_ACTIVE : C_IDLE} strokeWidth={1} />
                                              <line x1={CONN_W / 2} y1={topY} x2={CONN_W / 2} y2={midY} stroke={topActive ? C_ACTIVE : C_IDLE} strokeWidth={1} />
                                              <line x1={CONN_W / 2} y1={midY} x2={CONN_W / 2} y2={botY} stroke={botActive ? C_ACTIVE : C_IDLE} strokeWidth={1} />
                                              <line x1={0} y1={botY} x2={CONN_W / 2} y2={botY} stroke={botActive ? C_ACTIVE : C_IDLE} strokeWidth={1} />
                                              <line x1={CONN_W / 2} y1={midY} x2={CONN_W} y2={midY} stroke={bothDone ? C_ACTIVE : C_IDLE} strokeWidth={1} />
                                            </g>
                                          )
                                        })}
                                      </svg>
                                    </div>
                                  )}
                                  </React.Fragment>
                                )
                              })}
                              {isCompleted && (() => {
                                const lastRound = roundsSorted[roundsSorted.length - 1]
                                const finalists = (lastRound?.matches ?? []).map(m => m.winner_id).filter((id): id is number => id !== null)
                                const unit = itemType === 'actor' ? '인' : '작품'
                                return (
                                  <div className="flex flex-col" style={{ width: 200 }}>
                                    <div className="text-center text-xs text-gray-500 py-1 border-b border-gray-700/40 mb-1">
                                      {`${roundTotal / 8}강(2${unit})`}
                                    </div>
                                    <div className="relative" style={{ height: TOTAL_SLOTS * SLOT_H }}>
                                      {finalists.map((fid, fi) => {
                                        const item = items.get(fid)
                                        const o = originLabel(fid)
                                        const topPx = (fi === 0 ? TOTAL_SLOTS / 4 - 1 : TOTAL_SLOTS * 3 / 4 - 1) * SLOT_H
                                        return (
                                          <div key={fid} className="absolute left-1 right-1" style={{ top: topPx }}>
                                            <div className="text-xs px-2 py-0.5 rounded border-l-2 border-green-500 bg-green-900/20 text-green-300 font-semibold">
                                              {o ? (
                                                <span className="flex items-center gap-1">
                                                  <span className={`w-[68px] shrink-0 font-bold text-[10px] truncate ${o.color}`}>{o.text}</span>
                                                  <span className="w-[120px] shrink-0 truncate">{item ? <span data-tip-id={item.id} data-tip-type={tournament?.type}>{itemPnLabel(item)}</span> : `#${fid}`}</span>
                                                </span>
                                              ) : (item ? <span data-tip-id={item.id} data-tip-type={tournament?.type}>{itemPnLabel(item)}</span> : `#${fid}`)}
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* 조별 예선 완료 후 하단 표시 */}
                  {standings.groupPhase?.completed && groupPhaseEl}
                </div>
              )
            })()}
            {standingsTooltip && <CardTooltip tooltip={standingsTooltip} />}
          </div>
        )}

      </div>

      {/* 수정 모달 */}
      {editId && editData && tournament && (
        tournament.type === 'actor' ? (
          <ActorForm
            actor={editData}
            onSave={handleEditSave}
            onCancel={() => { setEditId(null); setEditData(null) }}
          />
        ) : (
          <WorkForm
            work={editData}
            onSave={handleEditSave}
            onCancel={() => { setEditId(null); setEditData(null) }}
          />
        )
      )}
    </div>
  )
}
