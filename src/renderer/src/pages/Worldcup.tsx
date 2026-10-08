import React, { useState, useEffect, useCallback } from 'react'
import { cupApi } from '../api'
import type { CupTournament } from '../components/cup/cupTypes'
import { RunDistChart } from '../components/cup/cupConstants'
import CreateModal from '../components/cup/CreateModal'
import TournamentCard from '../components/cup/TournamentCard'
import PlayView from '../components/cup/PlayView'
import TournamentRankingsView from '../components/cup/TournamentRankingsView'
import MasterRankingView from '../components/cup/MasterRankingView'

// ── Main Component ─────────────────────────────────────────────────────────
export default function Worldcup({
  onNavigateToActor,
  onNavigateToWork,
}: {
  onNavigateToActor: (id: number) => void
  onNavigateToWork: (id: number) => void
}) {
  const [view, setView] = useState<'list' | 'play' | 'ranking' | 'tournament-rankings'>('list')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedRunId, setSelectedRunId] = useState<number | undefined>(undefined)
  const [selectedTab, setSelectedTab] = useState<'match' | 'standings'>('match')
  const [selectedRankId, setSelectedRankId] = useState<number | null>(null)
  const [tournaments, setTournaments] = useState<CupTournament[]>([])
  const [typeToggles, setTypeToggles] = useState<{ actor: boolean; work: boolean }>(() => {
    try { return JSON.parse(localStorage.getItem('cup:typeToggles') || '{"actor":true,"work":true}') } catch { return { actor: true, work: true } }
  })
  const [formatToggles, setFormatToggles] = useState<{ tournament: boolean; league: boolean; worldcup: boolean }>(() => {
    try { return JSON.parse(localStorage.getItem('cup:formatToggles') || '{"tournament":true,"league":true,"worldcup":true}') } catch { return { tournament: true, league: true, worldcup: true } }
  })
  const [masterToggles, setMasterToggles] = useState<{ master: boolean; normal: boolean }>(() => {
    try { return JSON.parse(localStorage.getItem('cup:masterToggles') || '{"master":true,"normal":true}') } catch { return { master: true, normal: true } }
  })
  const [sortBy, setSortBy] = useState<'created_at' | 'name' | 'last_played'>(() => (localStorage.getItem('cup:sortBy') as 'created_at' | 'name' | 'last_played') || 'created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => (localStorage.getItem('cup:sortDir') as 'asc' | 'desc') || 'desc')
  const [showCreate, setShowCreate] = useState(false)
  const [statsModalId, setStatsModalId] = useState<number | null>(null)
  const [statsData, setStatsData] = useState<{ total_runs: number; completed_runs: number; last_run_at: string | null; participated_items: number; run_dist: { run_count: number; count: number }[] } | null>(null)
  const [statsName, setStatsName] = useState('')

  // Derive filter values from toggles (all on or all off = no filter)
  const typeFilter = (typeToggles.actor === typeToggles.work) ? 'all' : typeToggles.actor ? 'actor' : 'work'
  const formatFilter = (formatToggles.tournament && formatToggles.league && formatToggles.worldcup) || (!formatToggles.tournament && !formatToggles.league && !formatToggles.worldcup) ? 'all' : null
  const masterFilter = (masterToggles.master === masterToggles.normal) ? 'all' : masterToggles.master ? 'master' : 'normal'

  const loadList = useCallback(async () => {
    const params: Record<string, unknown> = { sortBy, sortDir }
    if (typeFilter !== 'all') params.type = typeFilter
    if (formatFilter !== null && formatFilter !== 'all') {
      // Single format selected
      const active = Object.entries(formatToggles).filter(([, v]) => v).map(([k]) => k)
      if (active.length === 1) params.format = active[0]
    }
    if (masterFilter === 'master') params.isMaster = true
    if (masterFilter === 'normal') params.isMaster = false
    const list = await cupApi.list(params) as CupTournament[]
    // Client-side filter for multiple format toggles
    const filteredList = formatFilter === null ? list : formatFilter === 'all' ? list : list
    const formatFiltered = (formatToggles.tournament && formatToggles.league && formatToggles.worldcup) || (!formatToggles.tournament && !formatToggles.league && !formatToggles.worldcup)
      ? filteredList
      : filteredList.filter(t => formatToggles[t.format as keyof typeof formatToggles])
    setTournaments(formatFiltered)
  }, [typeToggles, formatToggles, masterToggles, sortBy, sortDir])

  useEffect(() => { loadList() }, [loadList])

  useEffect(() => { localStorage.setItem('cup:typeToggles', JSON.stringify(typeToggles)) }, [typeToggles])
  useEffect(() => { localStorage.setItem('cup:formatToggles', JSON.stringify(formatToggles)) }, [formatToggles])
  useEffect(() => { localStorage.setItem('cup:masterToggles', JSON.stringify(masterToggles)) }, [masterToggles])
  useEffect(() => { localStorage.setItem('cup:sortBy', sortBy) }, [sortBy])
  useEffect(() => { localStorage.setItem('cup:sortDir', sortDir) }, [sortDir])

  const handleDelete = async (id: number) => {
    await cupApi.delete(id)
    loadList()
  }

  const handlePlay = (id: number, runId?: number, tab: 'match' | 'standings' = 'match') => {
    setSelectedId(id)
    setSelectedRunId(runId)
    setSelectedTab(tab)
    setView('play')
  }

  const handleRankings = (id: number) => {
    setSelectedRankId(id)
    setView('tournament-rankings')
  }

  const handleStats = (id: number) => {
    const t = tournaments.find(x => x.id === id)
    setStatsName(t?.name ?? '')
    setStatsModalId(id)
    setStatsData(null)
    cupApi.tournamentStats(id).then(data => setStatsData(data))
  }

  if (view === 'play' && selectedId !== null) {
    return (
      <PlayView
        tournamentId={selectedId}
        runId={selectedRunId}
        initialTab={selectedTab}
        onBack={() => { setView('list'); loadList() }}
        onRankings={(id) => { setSelectedRankId(id); setView('tournament-rankings') }}
        onNavigateToActor={onNavigateToActor}
        onNavigateToWork={onNavigateToWork}
      />
    )
  }

  if (view === 'ranking') {
    return (
      <MasterRankingView
        onBack={() => setView('list')}
        onNavigateToActor={onNavigateToActor}
        onNavigateToWork={onNavigateToWork}
      />
    )
  }

  if (view === 'tournament-rankings' && selectedRankId !== null) {
    return (
      <TournamentRankingsView
        tournamentId={selectedRankId}
        onBack={() => { setView('list'); loadList() }}
        onPlay={(runId, tab) => { setSelectedId(selectedRankId); setSelectedRunId(runId); setSelectedTab(tab); setView('play') }}
        onNavigateToActor={onNavigateToActor}
        onNavigateToWork={onNavigateToWork}
      />
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 상단 바 */}
      <div className="p-4 shrink-0">
        <div className="flex items-center">
          {/* 정렬박스 */}
          <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5">
            <select
              value={sortBy}
              onChange={e => { const v = e.target.value as typeof sortBy; setSortBy(v); localStorage.setItem('cup:sortBy', v) }}
              className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-28"
            >
              <option value="created_at">등록순</option>
              <option value="name">대회명</option>
              <option value="last_played">진행순</option>
            </select>
            <button
              onClick={() => { const next = sortDir === 'asc' ? 'desc' : 'asc'; setSortDir(next); localStorage.setItem('cup:sortDir', next) }}
              className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-2 py-1.5 rounded"
            >
              {sortDir === 'asc' ? '↑' : '↓'}
            </button>
          </div>

          {/* 필터 토글 */}
          <div className="flex items-center gap-3 ml-2">
            <div className="flex">
              {([['actor', '배우'], ['work', '작품']] as const).map(([key, label], i) => (
                <button key={key}
                  onClick={() => setTypeToggles(prev => ({ ...prev, [key]: !prev[key] }))}
                  className={`text-sm px-3 py-1.5 ${i === 0 ? 'rounded-l' : 'rounded-r'} ${typeToggles[key] ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                >{label}</button>
              ))}
            </div>
            <div className="flex">
              {([['tournament', '토너먼트'], ['league', '리그전'], ['worldcup', '월드컵']] as const).map(([key, label], i, arr) => (
                <button key={key}
                  onClick={() => setFormatToggles(prev => ({ ...prev, [key]: !prev[key] }))}
                  className={`text-sm px-3 py-1.5 ${i === 0 ? 'rounded-l' : i === arr.length - 1 ? 'rounded-r' : ''} ${formatToggles[key] ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                >{label}</button>
              ))}
            </div>
            <div className="flex">
              {([['master', '마스터'], ['normal', '일반']] as const).map(([key, label], i) => (
                <button key={key}
                  onClick={() => setMasterToggles(prev => ({ ...prev, [key]: !prev[key] }))}
                  className={`text-sm px-3 py-1.5 ${i === 0 ? 'rounded-l' : 'rounded-r'} ${masterToggles[key] ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                >{label}</button>
              ))}
            </div>
            <button
              onClick={() => { setTypeToggles({ actor: true, work: true }); setFormatToggles({ tournament: true, league: true, worldcup: true }); setMasterToggles({ master: true, normal: true }) }}
              className="px-3 py-1.5 rounded text-sm bg-gray-600 hover:bg-gray-500 text-gray-300 shrink-0"
            >
              전체
            </button>
          </div>

          {/* 액션 그룹 */}
          <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5 ml-2">
            <button
              onClick={() => setShowCreate(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-sm"
            >
              + 대회 등록
            </button>
            <button
              onClick={() => setView('ranking')}
              className="bg-yellow-600 hover:bg-yellow-500 text-white px-3 py-1.5 rounded text-sm"
            >
              ★ 마스터 랭킹
            </button>
          </div>
        </div>
      </div>

      {/* 대회 목록 */}
      <div className="flex-1 overflow-y-auto p-4 pt-0">
        {tournaments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-500">
            <p className="text-lg mb-1">대회가 없습니다</p>
            <p className="text-sm">새 대회를 만들어 시작하세요</p>
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-3">
            {tournaments.map(t => (
              <TournamentCard
                key={t.id}
                t={t}
                onPlay={(runId, tab) => handlePlay(t.id, runId, tab)}
                onRankings={handleRankings}
                onStats={handleStats}
                onDelete={() => handleDelete(t.id)}
                onUpdate={loadList}
              />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={t => {
            setShowCreate(false)
            loadList()
          }}
        />
      )}

      {statsModalId !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setStatsModalId(null)}>
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 w-[640px] max-w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-bold text-base">{statsName} 통계</h3>
              <button onClick={() => setStatsModalId(null)} className="text-gray-400 hover:text-white text-lg leading-none">✕</button>
            </div>

            {statsData === null ? (
              <div className="flex items-center justify-center h-32 text-gray-500 text-sm">로딩 중...</div>
            ) : (
              <>
                {/* 런 통계 */}
                <div className="mb-4">
                  <p className="text-gray-400 text-xs mb-2 font-semibold uppercase tracking-wide">대회 현황</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-gray-700 rounded-lg p-3 text-center">
                      <p className="text-gray-400 text-xs mb-1">전체 런</p>
                      <p className="text-white text-xl font-bold">{statsData.total_runs}</p>
                    </div>
                    <div className="bg-gray-700 rounded-lg p-3 text-center">
                      <p className="text-gray-400 text-xs mb-1">완료</p>
                      <p className="text-white text-xl font-bold">{statsData.completed_runs}</p>
                    </div>
                    <div className="bg-gray-700 rounded-lg p-3 text-center">
                      <p className="text-gray-400 text-xs mb-1">마지막 런</p>
                      <p className="text-white text-sm font-bold">{statsData.last_run_at ? statsData.last_run_at.slice(0, 10) : '-'}</p>
                    </div>
                  </div>
                </div>

                {/* 참가자 통계 */}
                <div className="mb-5">
                  <p className="text-gray-400 text-xs mb-2 font-semibold uppercase tracking-wide">참가자 통계</p>
                  <div className="grid grid-cols-1 gap-3">
                    <div className="bg-gray-700 rounded-lg p-3 text-center">
                      <p className="text-gray-400 text-xs mb-1">참가 고유 항목</p>
                      <p className="text-white text-xl font-bold">{statsData.participated_items}</p>
                    </div>
                  </div>
                </div>

                {/* 참가 횟수 분포 차트 */}
                <div>
                  <p className="text-gray-400 text-xs mb-2 font-semibold uppercase tracking-wide">
                    참가 횟수 분포 <span className="text-gray-600 normal-case">(X: 참가 횟수, Y: 항목 수)</span>
                  </p>
                  <div className="bg-gray-700 rounded-lg p-3">
                    <RunDistChart data={statsData.run_dist} />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
