import React, { useState, useEffect, useCallback, useRef } from 'react'
import { cupApi, masterRankingApi, dashboardApi, actorsApi } from '../../api'
import ImagePreview from '../ImagePreview'
import CardTooltip, { type TooltipState } from '../CardTooltip'
import type { MasterRankRow, FormatStat, H2HRow, RateTooltip } from './cupTypes'
import { MASTER_PAGE_SIZES, DIV_BOUNDARIES, DIV_LABEL, DIV_STD_SIZES, DIV_COLOR, DIV_TEXT_COLOR, FORMAT_LABEL, FORMAT_COLOR, Pagination, getDivision } from './cupConstants'
import RankingSettingsModal from './RankingSettingsModal'
import WorkActorDistModal from './WorkActorDistModal'
import ActorForm from '../ActorForm'
import { pushEscHandler, popEscHandler } from '../../escManager'
import { useDataChanged } from '../../dataEvents'

export default function MasterRankingView({
  onBack,
  onNavigateToActor,
  onNavigateToWork,
}: {
  onBack: () => void
  onNavigateToActor: (id: number) => void
  onNavigateToWork: (id: number) => void
}) {
  const [type, setType] = useState<'actor' | 'work'>(() =>
    (localStorage.getItem('masterRank:type') as 'actor' | 'work') || 'actor'
  )
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [divFilter, setDivFilter] = useState<number | null>(null)
  const [sortBy, setSortBy] = useState<string>(() => localStorage.getItem('masterRank:sortBy') || 'total_points')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => (localStorage.getItem('masterRank:sortDir') as 'asc' | 'desc') || 'desc')
  const [rows, setRows] = useState<MasterRankRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [pageSize, setPageSize] = useState<number>(() => {
    const saved = parseInt(localStorage.getItem('masterRank:pageSize') ?? '', 10)
    return MASTER_PAGE_SIZES.includes(saved) ? saved : MASTER_PAGE_SIZES[0]
  })
  const [divisionCounts, setDivisionCounts] = useState<{ division: number; count: number }[]>([])
  const [rankTrends, setRankTrends] = useState<Map<number, number | null>>(new Map())
  const [rateTooltip, setRateTooltip] = useState<RateTooltip | null>(null)
  const formatStatsCache = useRef<Map<number, FormatStat[]>>(new Map())
  const [imgOverlay, setImgOverlay] = useState<{ path: string } | null>(null)
  const [nameTooltip, setNameTooltip] = useState<TooltipState | null>(null)
  // 추이 모달
  const [detailModal, setDetailModal] = useState<{ itemId: number; lbl: string; img: string | null } | null>(null)
  const [trendHistory, setTrendHistory] = useState<{ rank: number; recorded_at: string; tournament_name: string }[] | null>(null)
  const [trendLimit, setTrendLimit] = useState<number>(() => Number(localStorage.getItem('cup:trendLimit')) || 10)
  const trendLimitApi = trendLimit >= 9999 ? 0 : trendLimit
  const rankHistCache = useRef<Map<string, { rank: number; recorded_at: string; tournament_name: string }[]>>(new Map())
  const [h2hData, setH2hData] = useState<H2HRow[] | null>(null)
  const [h2hLoading, setH2hLoading] = useState(false)
  const [h2hSort, setH2hSort] = useState<{ col: 'name' | 'total' | 'wins' | 'draws' | 'losses' | 'rate' | 'div'; dir: 'asc' | 'desc' }>({ col: 'total', dir: 'desc' })
  const [h2hDivFilter, setH2hDivFilter] = useState<number | null>(null)
  const [h2hDivDropdown, setH2hDivDropdown] = useState(false)

  // 상대전적 전용 모달
  const [h2hModal, setH2hModal] = useState<{ itemId: number; lbl: string; img: string | null } | null>(null)

  // 평점 편집
  const [editActorId, setEditActorId] = useState<number | null>(null)
  const [editActorData, setEditActorData] = useState<any>(null)

  // 랭킹 차트
  const [showActorDist, setShowActorDist] = useState(false)
  const [rankChartModal, setRankChartModal] = useState(false)
  const [rankChartDiv, setRankChartDiv] = useState(0)
  const [rankChartLimit, setRankChartLimit] = useState(() => Number(localStorage.getItem('cup:rankChartLimit')) || 10)
  const [rankChartData, setRankChartData] = useState<{
    runs: { runId: number; label: string; completedAt: string }[]
    series: { id: number; name: string; photo_path: string | null; currentRank: number; ranks: (number | null)[]; globalRanks: (number | null)[]; displayRanks: (number | null)[] }[]
  } | null>(null)
  const [rankChartHover, setRankChartHover] = useState<number | null>(null)
  const [rankChartTooltip, setRankChartTooltip] = useState<TooltipState | null>(null)

  const load = useCallback(async (t: 'actor' | 'work', s: string, p: number, div: number | null, ps: number, sb: string, sd: 'asc' | 'desc') => {
    setLoading(true)
    try {
      const data = await masterRankingApi.list({
        type: t, limit: ps, offset: p * ps,
        search: s || undefined,
        ...(div !== null ? { division: div } : {}),
        sortBy: sb, sortDir: sd,
      })
      setRows(data.rows as MasterRankRow[])
      setTotal(data.total)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadTrends = useCallback(async (t: 'actor' | 'work') => {
    const trends = await masterRankingApi.rankTrends(t)
    setRankTrends(new Map(trends.map(r => [r.item_id, r.prev_rank])))
  }, [])

  useEffect(() => { setPage(0); setDivFilter(null) }, [type])
  useEffect(() => { setPage(0) }, [search, divFilter, pageSize, sortBy, sortDir])
  useEffect(() => { load(type, search, page, divFilter, pageSize, sortBy, sortDir) }, [type, search, page, divFilter, pageSize, sortBy, sortDir, load])

  useDataChanged(() => load(type, search, page, divFilter, pageSize, sortBy, sortDir))
  useEffect(() => { loadTrends(type) }, [type, loadTrends])
  useEffect(() => { localStorage.setItem('masterRank:type', type) }, [type])
  useEffect(() => { localStorage.setItem('masterRank:pageSize', String(pageSize)) }, [pageSize])
  useEffect(() => { localStorage.setItem('masterRank:sortBy', sortBy) }, [sortBy])
  useEffect(() => { localStorage.setItem('masterRank:sortDir', sortDir) }, [sortDir])
  useEffect(() => {
    cupApi.divisionCounts(type).then(setDivisionCounts).catch(() => setDivisionCounts([]))
  }, [type])

  useEffect(() => {
    if (!editActorId) { setEditActorData(null); return }
    actorsApi.get(editActorId).then(setEditActorData)
  }, [editActorId])

  useEffect(() => {
    if (!rankChartModal) return
    const handler = () => setRankChartModal(false)
    pushEscHandler(handler)
    return () => popEscHandler(handler)
  }, [rankChartModal])

  const CHART_RANGE_CONFIG = [
    { key: 0, label: '1부 전체', rankFrom: 1, rankTo: 32 },
    { key: 1, label: '2부 상위', rankFrom: 33, rankTo: 64 },
    { key: 2, label: '2부 하위', rankFrom: 65, rankTo: 96 },
    { key: 3, label: '3부 상위', rankFrom: 97, rankTo: 128 },
  ]

  useEffect(() => {
    if (!rankChartModal) return
    setRankChartData(null)
    const cfg = CHART_RANGE_CONFIG[rankChartDiv] ?? CHART_RANGE_CONFIG[0]
    dashboardApi.rankChangeChart(type, rankChartLimit, cfg.rankFrom, cfg.rankTo).then(setRankChartData)
  }, [rankChartModal, type, rankChartLimit, rankChartDiv])

  // 추이 모달 데이터 로드
  useEffect(() => {
    if (!detailModal) return
    const cacheKey = `${detailModal.itemId}_${trendLimitApi}`
    if (rankHistCache.current.has(cacheKey)) {
      setTrendHistory(rankHistCache.current.get(cacheKey)!)
    } else {
      setTrendHistory(null)
      masterRankingApi.rankHistory(type, detailModal.itemId, trendLimitApi).then(data => {
        rankHistCache.current.set(cacheKey, data)
        setTrendHistory(data)
      })
    }
  }, [detailModal, trendLimit, type])

  const imgPath = (row: MasterRankRow) => row.photo_path ?? row.cover_path ?? null
  const label = (row: MasterRankRow) => row.name ?? row.title ?? row.product_number ?? `#${row.id}`

  const handleRateHover = async (e: React.MouseEvent, row: MasterRankRow, statType: 'win' | 'match') => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setRateTooltip({ itemId: row.id, statType, top: rect.bottom + 4, left: rect.left + rect.width / 2 })
    if (!formatStatsCache.current.has(row.id)) {
      const data = await masterRankingApi.itemFormatStats(type, row.id)
      formatStatsCache.current.set(row.id, data)
      setRateTooltip(prev => prev?.itemId === row.id ? { ...prev } : prev)
    }
  }

  const handleSort = (col: string) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(col); setSortDir(col === 'score_rank' ? 'asc' : 'desc') }
  }

  const SortTh = ({ col, label, subLabel, subLabelClass, className }: { col: string; label: string; subLabel?: React.ReactNode; subLabelClass?: string; className?: string }) => {
    const active = sortBy === col
    return (
      <th
        className={`px-3 py-2.5 cursor-pointer select-none hover:text-white transition ${active ? 'text-white' : 'text-gray-400'} ${className ?? ''}`}
        onClick={() => handleSort(col)}
      >
        <div className="flex items-center justify-end gap-1">
          <span>{label}{subLabel && <><br/><span className={subLabelClass ?? 'text-gray-600 font-normal'}>{subLabel}</span></>}</span>
          <span className="text-[10px]">{active ? ((sortDir === 'desc') !== (col === 'score_rank') ? '▼' : '▲') : <span className="text-gray-700">▼</span>}</span>
        </div>
      </th>
    )
  }

  const openDetailModal = (itemId: number, lbl: string, img: string | null) => {
    setDetailModal({ itemId, lbl, img })
    setTrendHistory(null)
    setDivHistData(null)
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 상단 */}
      <div className="p-4 border-b border-gray-700/50 shrink-0">
        <div className="flex items-center gap-2">
          {/* 뒤로 + 타이틀 */}
          <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5">
            <button onClick={onBack} className="text-gray-400 hover:text-white text-sm transition">← 목록</button>
            <span className="text-gray-600 text-xs">|</span>
            <span className="text-yellow-400 font-semibold text-sm">★ 마스터 랭킹</span>
          </div>

          {/* 유형 토글 */}
          <div className="flex items-center gap-1 bg-gray-800 rounded-lg px-2 py-1">
            {(['actor', 'work'] as const).map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`px-3 py-1 rounded text-xs font-medium transition ${type === t ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              >
                {t === 'actor' ? '배우' : '작품'}
              </button>
            ))}
          </div>

          {/* 검색 */}
          <div className="flex-1 flex items-center bg-gray-800 rounded-lg px-3 py-1.5">
            <input
              className="flex-1 bg-transparent text-white text-sm outline-none placeholder-gray-500"
              placeholder={type === 'actor' ? '배우명 검색' : '작품명 / 품번 검색'}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-gray-500 hover:text-gray-300 text-xs ml-2">✕</button>
            )}
          </div>

          {/* 페이지 크기 */}
          <select
            value={pageSize}
            onChange={e => setPageSize(Number(e.target.value))}
            className="bg-gray-800 text-gray-300 text-xs rounded-lg px-2 py-1.5 border-none outline-none cursor-pointer hover:text-white"
          >
            {MASTER_PAGE_SIZES.map(s => (
              <option key={s} value={s}>{s}개</option>
            ))}
          </select>

          {/* 설정 */}
          <button
            onClick={() => setShowSettings(true)}
            className="bg-gray-800 rounded-lg px-3 py-1.5 text-gray-400 hover:text-gray-200 text-sm transition"
          >
            ⚙ 설정
          </button>
          {/* 리셋 */}
          <button
            onClick={() => setShowResetConfirm(true)}
            className="bg-gray-800 rounded-lg px-3 py-1.5 text-gray-600 hover:text-gray-400 text-xs transition"
          >
            리셋
          </button>
        </div>

        {/* 부별 필터 */}
        {divisionCounts.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
            <button
              onClick={() => setDivFilter(null)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition ${divFilter === null ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}
            >
              전체
            </button>
            {divisionCounts.map(({ division, count }) => (
              <button
                key={division}
                onClick={() => setDivFilter(divFilter === division ? null : division)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition border ${
                  divFilter === division
                    ? 'bg-blue-600 text-white border-blue-500'
                    : `${DIV_COLOR[division] ?? 'bg-gray-800 text-gray-400 border-gray-700'} hover:opacity-80`
                }`}
              >
                {DIV_LABEL[division] ?? `${division}부`} <span className="opacity-70">{DIV_STD_SIZES[division] != null ? `${DIV_STD_SIZES[division]}(${count})` : count}</span>
              </button>
            ))}
            <div className="flex-1" />
            {type === 'work' && (
              <button
                onClick={() => setShowActorDist(true)}
                className="px-2.5 py-1 rounded text-xs font-medium transition bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-700 hover:opacity-80"
              >
                배우 분포
              </button>
            )}
            <button
              onClick={() => setRankChartModal(true)}
              className="px-2.5 py-1 rounded text-xs font-medium transition bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-700 hover:opacity-80"
            >
              랭킹차트
            </button>
          </div>
        )}
      </div>

      {showActorDist && (
        <WorkActorDistModal
          onClose={() => setShowActorDist(false)}
          onNavigateToActor={(id) => { setShowActorDist(false); onNavigateToActor(id) }}
        />
      )}

      {showSettings && <RankingSettingsModal onClose={() => {
        setShowSettings(false)
        load(type, search, page, divFilter, pageSize, sortBy, sortDir)
        loadTrends(type)
        cupApi.divisionCounts(type).then(setDivisionCounts).catch(() => setDivisionCounts([]))
      }} />}

      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowResetConfirm(false)}>
          <div className="bg-gray-800 rounded-xl p-6 w-[360px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold text-white mb-2">마스터 랭킹 리셋</h2>
            <p className="text-sm text-gray-400 mb-6">
              {type === 'actor' ? '배우' : '작품'} 마스터 랭킹 이력을 전부 삭제합니다.<br />
              이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  await masterRankingApi.reset(type)
                  setShowResetConfirm(false)
                  load(type, search, page, divFilter, pageSize, sortBy, sortDir)
                  loadTrends(type)
                  cupApi.divisionCounts(type).then(setDivisionCounts).catch(() => setDivisionCounts([]))
                }}
                className="flex-1 py-2 bg-red-700 hover:bg-red-600 text-white rounded text-sm font-semibold"
              >삭제</button>
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
              >취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 랭킹 테이블 */}
      <div className="flex-1 overflow-y-auto" onMouseLeave={() => { setImgOverlay(null); setNameTooltip(null) }}>
        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-500">로딩 중...</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500">
            <p>아직 마스터 랭킹 데이터가 없습니다.</p>
            <p className="text-sm mt-1">마스터 대회를 완료하면 자동으로 집계됩니다.</p>
          </div>
        ) : (
          <>
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col style={{ width: '2.5rem' }} />
                <col style={{ width: '3rem' }} />
                <col style={{ width: '3.5rem' }} />
                <col style={{ width: '4rem' }} />
                <col />
                {type === 'actor' && <col style={{ width: '3rem' }} />}
                <col style={{ width: '5.5rem' }} />
                <col style={{ width: '5.5rem' }} />
                {type === 'actor' && <col style={{ width: '5rem' }} />}
                <col style={{ width: '5.5rem' }} />
                <col style={{ width: '5.5rem' }} />
                <col style={{ width: '5rem' }} />
              </colgroup>
              <thead className="sticky top-0 bg-gray-900 z-10">
                <tr className="border-b border-gray-700 text-gray-400 text-xs">
                  <th className="px-2 py-2.5 text-center text-gray-400">#</th>
                  <th className="px-2 py-2.5 text-center text-gray-400">순위</th>
                  <th className="px-2 py-2.5 text-center text-gray-400">리그</th>
                  <th className="px-2 py-2.5 text-left text-gray-400">썸네일</th>
                  <th className="px-3 py-2.5 text-left text-gray-400">이름</th>
                  {type === 'actor' && <th className="px-2 py-2.5 text-center text-gray-400 text-xs"><div className="leading-tight">상대<br />전적</div></th>}
                  <SortTh col="total_points" label="마스터" subLabel="포인트" subLabelClass="font-normal" />
                  {type === 'actor' && <SortTh col="score_rank" label="평점" />}
                  <SortTh col="win_rate" label="우승률" subLabel="(우승/런)" subLabelClass="text-[9px] text-gray-600 font-normal" />
                  <SortTh col="match_win_rate" label="승률" subLabel="(승리/매치)" subLabelClass="text-[9px] text-gray-600 font-normal" />
                  <th className="px-3 py-2.5 text-right text-gray-400 text-xs">
                    <div className="leading-tight">갭<br /><span className="text-[9px] text-gray-600 font-normal">(승-우승)</span></div>
                  </th>
                  <th className="px-3 py-2.5 text-center text-gray-400">추이</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const img = imgPath(row)
                  const lbl = label(row)
                  const division = getDivision(row.rank, (row as any).master_run_count ?? 0)
                  const prevRank = rankTrends.get(row.id)
                  const winRate = row.total_cups > 0 ? row.cup_wins / row.total_cups * 100 : null
                  const matchWinRate = row.total_matches > 0 ? row.match_wins / row.total_matches * 100 : null
                  let trendBadge: React.ReactNode = <span className="text-gray-700 text-xs">—</span>
                  if (prevRank !== undefined && prevRank !== null) {
                    const delta = prevRank - row.rank
                    if (delta > 0) trendBadge = <span className="text-green-400 text-xs font-medium">▲{delta}</span>
                    else if (delta < 0) trendBadge = <span className="text-red-400 text-xs font-medium">▼{Math.abs(delta)}</span>
                    else trendBadge = <span className="text-gray-500 text-xs">=</span>
                  } else if (prevRank === null && row.total_points > 0) {
                    trendBadge = <span className="text-blue-400 text-xs">NEW</span>
                  }
                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-gray-800 hover:bg-gray-800/40 transition ${row.rank <= 3 ? 'bg-yellow-950/10' : ''}`}
                    >
                      {/* # */}
                      <td className="px-2 py-2 text-center text-gray-600 text-xs">{page * pageSize + idx + 1}</td>
                      {/* 순위 */}
                      <td className="px-2 py-2 text-center">
                        <span className={`text-xs font-medium ${row.rank <= 3 ? 'text-yellow-400' : 'text-gray-300'}`}>{row.rank}</span>
                      </td>
                      {/* 리그 */}
                      <td className="px-2 py-2 text-center">
                        <span className={`inline-block px-1.5 py-0.5 rounded border text-xs font-medium ${DIV_COLOR[division] ?? ''}`}>
                          {DIV_LABEL[division] ?? `${division}부`}
                        </span>
                      </td>
                      {/* 썸네일 */}
                      <td className="p-0 h-14" onMouseEnter={() => img && setImgOverlay({ path: img })} onMouseLeave={() => setImgOverlay(null)}>
                        {img
                          ? <ImagePreview path={img} alt={lbl} className="w-full h-14 object-cover" objectPosition="center 10%" />
                          : <div className="w-full h-14 bg-gray-700 flex items-center justify-center text-gray-600 text-xs">?</div>
                        }
                      </td>
                      {/* 이름 */}
                      <td className="px-3 py-2 max-w-[160px]">
                        <div className="flex items-start gap-1">
                          <div
                            className="cursor-pointer flex-1 min-w-0"
                            onMouseEnter={e => setNameTooltip({ type: type === 'actor' ? 'actor' : 'work', id: row.id, x: e.clientX, y: e.clientY })}
                            onMouseMove={e => setNameTooltip({ type: type === 'actor' ? 'actor' : 'work', id: row.id, x: e.clientX, y: e.clientY })}
                            onMouseLeave={() => setNameTooltip(null)}
                            onClick={() => type === 'actor' ? onNavigateToActor(row.id) : onNavigateToWork(row.id)}
                          >
                            <p className="text-white font-medium leading-tight truncate hover:underline">{lbl}</p>
                            {row.product_number && row.title && (
                              <p className="text-gray-500 text-xs truncate">{row.product_number}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      {/* 상대전적 (배우만) */}
                      {type === 'actor' && (
                        <td className="px-2 py-2 text-center">
                          <button
                            className="text-gray-500 hover:text-white transition text-sm"
                            onClick={e => {
                              e.stopPropagation()
                              setH2hModal({ itemId: row.id, lbl, img: imgPath(row) })
                              setH2hData(null)
                              setH2hLoading(true)
                              cupApi.headToHead(type, row.id).then(setH2hData).catch(() => setH2hData([])).finally(() => setH2hLoading(false))
                            }}
                            title="상대 전적"
                          >📄</button>
                        </td>
                      )}
                      {/* 마스터 점수 */}
                      <td className="px-3 py-2 text-right">
                        <span className={`font-bold ${row.total_points > 0 ? 'text-green-400' : 'text-gray-600'}`}>
                          {row.total_points.toFixed(1)}
                        </span>
                        {row.last_run_points != null && (
                          <div className="text-[10px] text-gray-500">{row.last_run_points >= 0 ? '+' : ''}{row.last_run_points.toFixed(1)}</div>
                        )}
                      </td>
                      {/* 평점 (배우만) */}
                      {type === 'actor' && (() => {
                        const scoreRank = (row as any).score_rank as number | undefined
                        const avgScore = (row as any).avg_score as number | undefined
                        const gap = scoreRank != null ? row.rank - scoreRank : null
                        return (
                          <td
                            className="px-2 py-2 text-center cursor-pointer"
                            onMouseEnter={e => setNameTooltip({ type: 'actor', id: row.id, x: e.clientX, y: e.clientY })}
                            onMouseMove={e => setNameTooltip({ type: 'actor', id: row.id, x: e.clientX, y: e.clientY })}
                            onMouseLeave={() => setNameTooltip(null)}
                            onClick={() => setEditActorId(row.id)}
                          >
                            {scoreRank != null && (
                              <div className="text-xs text-gray-300">
                                {scoreRank}위
                                {gap != null && gap !== 0 && (
                                  <span className={`ml-0.5 text-[10px] ${gap > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    ({gap > 0 ? `↑${gap}` : `↓${Math.abs(gap)}`})
                                  </span>
                                )}
                              </div>
                            )}
                            {avgScore != null && (
                              <div className="text-[10px] text-gray-500">{avgScore.toFixed(2)}</div>
                            )}
                          </td>
                        )
                      })()}
                      {/* 우승률 */}
                      <td
                        className="px-3 py-2 text-right cursor-default"
                        onMouseEnter={e => handleRateHover(e, row, 'win')}
                        onMouseLeave={() => setRateTooltip(null)}
                      >
                        {winRate !== null
                          ? <>
                              <div className="text-yellow-400">{winRate.toFixed(1)}%</div>
                              <div className="text-[11px] text-gray-500">({row.cup_wins}/{row.total_cups})</div>
                            </>
                          : <span className="text-gray-600">—</span>
                        }
                      </td>
                      {/* 승률 */}
                      <td
                        className="px-3 py-2 text-right cursor-default"
                        onMouseEnter={e => handleRateHover(e, row, 'match')}
                        onMouseLeave={() => setRateTooltip(null)}
                      >
                        {matchWinRate !== null
                          ? <>
                              <div className="text-blue-400">{matchWinRate.toFixed(1)}%</div>
                              <div className="text-[11px] text-gray-500">({row.match_wins}/{row.total_matches})</div>
                            </>
                          : <span className="text-gray-600">—</span>
                        }
                      </td>
                      {/* 갭 */}
                      <td className="px-3 py-2 text-right">
                        {winRate !== null && matchWinRate !== null
                          ? (() => {
                              const gap = matchWinRate - winRate
                              return <span className={`font-medium text-xs ${gap >= 10 ? 'text-green-400' : gap <= -10 ? 'text-red-400' : 'text-gray-400'}`}>{gap >= 0 ? '+' : ''}{gap.toFixed(1)}%</span>
                            })()
                          : <span className="text-gray-600">—</span>
                        }
                      </td>
                      {/* 추이 */}
                      <td
                        className="px-3 py-2 text-center cursor-pointer hover:bg-gray-700/50 transition"
                        onClick={e => { e.stopPropagation(); openDetailModal(row.id, lbl, imgPath(row)) }}
                      >
                        {trendBadge}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* 페이지네이션 */}
            {Math.ceil(total / pageSize) > 1 && (
              <Pagination page={page} totalPages={Math.ceil(total / pageSize)} onPageChange={setPage} />
            )}
          </>
        )}
      </div>

      {/* 썸네일 확대 오버레이 */}
      {imgOverlay && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          {type === 'actor' ? (
            <div className="w-[400px] h-[400px] rounded-lg overflow-hidden shadow-2xl border border-gray-600">
              <ImagePreview path={imgOverlay.path} alt="" className="w-full h-full object-cover" objectPosition="center 10%" />
            </div>
          ) : (
            <div className="rounded-lg overflow-hidden shadow-2xl border border-gray-600" style={{ width: 650 }}>
              <ImagePreview path={imgOverlay.path} alt="" className="w-full object-contain" />
            </div>
          )}
        </div>
      )}

      {/* 이름 CardTooltip */}
      {nameTooltip && <CardTooltip tooltip={nameTooltip} />}

      {/* 포맷별 통계 툴팁 */}
      {rateTooltip && formatStatsCache.current.has(rateTooltip.itemId) && (() => {
        const stats = formatStatsCache.current.get(rateTooltip.itemId)!
        const FORMAT_LABEL: Record<string, string> = { worldcup: '월드컵', tournament: '토너먼트', league: '리그전' }
        const formats = (['worldcup', 'tournament', 'league'] as const).filter(f => stats.some(s => s.format === f))
        if (formats.length === 0) return null
        return (
          <div
            className="fixed z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-xl pointer-events-none"
            style={{ top: rateTooltip.top, left: rateTooltip.left, transform: 'translateX(-50%)' }}
          >
            <div className="grid gap-px bg-gray-600 rounded-lg overflow-hidden" style={{ gridTemplateColumns: `repeat(${formats.length}, minmax(80px, 1fr))` }}>
              {formats.map((fmt) => {
                const s = stats.find(x => x.format === fmt)!
                const rate = rateTooltip.statType === 'win'
                  ? (s.total_cups > 0 ? s.cup_wins / s.total_cups * 100 : null)
                  : (s.total_matches > 0 ? s.match_wins / s.total_matches * 100 : null)
                const wins = rateTooltip.statType === 'win' ? s.cup_wins : s.match_wins
                const tot = rateTooltip.statType === 'win' ? s.total_cups : s.total_matches
                return (
                  <div key={fmt} className="bg-gray-800 px-3 py-2 text-center">
                    <div className="text-gray-400 text-xs mb-1">{FORMAT_LABEL[fmt]}</div>
                    <div className={`text-sm font-semibold ${rateTooltip.statType === 'win' ? 'text-yellow-400' : 'text-blue-400'}`}>
                      {rate !== null ? `${rate.toFixed(1)}%` : '—'}
                    </div>
                    <div className="text-gray-500 text-xs">({wins}/{tot})</div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* 순위 추이 모달 */}
      {detailModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]" onClick={() => setDetailModal(null)}>
          <div className="bg-gray-800 rounded-lg w-[95vw] h-[95vh] flex flex-col relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setDetailModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl leading-none z-10">✕</button>
            {/* 헤더 + 탭 */}
            <div className="shrink-0 px-6 pt-5 pb-0 border-b border-gray-700">
              <div className="flex items-center gap-3 mb-3">
                {detailModal.img && (
                  <div className="w-10 h-10 rounded overflow-hidden shrink-0">
                    <ImagePreview path={detailModal.img} alt={detailModal.lbl} className="w-full h-full object-cover" objectPosition="center 10%" />
                  </div>
                )}
                <p className="text-white font-bold text-lg">{detailModal.lbl}</p>
              </div>
              <div className="flex items-center">
                <div className="flex">
                  <span className="px-5 py-2.5 text-sm font-medium border-b-2 border-blue-500 text-white">추이</span>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-gray-500">최근</span>
                    <select
                      value={trendLimit}
                      onChange={e => { const v = Number(e.target.value); setTrendLimit(v); localStorage.setItem('cup:trendLimit', String(v)) }}
                      className="bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600"
                    >
                      <option value={5}>5회</option>
                      <option value={10}>10회</option>
                      <option value={20}>20회</option>
                      <option value={9999}>전체</option>
                    </select>
                  </div>
              </div>
            </div>
            {/* 탭 내용 */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {(() => {
                if (trendHistory === null) return <p className="text-gray-500 text-sm text-center py-16">로딩 중...</p>
                const history = trendHistory
                if (history.length < 2) return <p className="text-gray-500 text-sm text-center py-16">추이 데이터가 부족합니다.</p>
                const VW = 1000, VH = 700
                const PADDING = { top: 45, right: 40, bottom: 60, left: 50 }
                const ranks = history.map(h => h.rank)
                const minR = Math.min(...ranks)
                const maxR = Math.max(...ranks)
                const range = maxR - minR || 1
                const mainBottom = VH - PADDING.bottom
                const getX = (i: number) => PADDING.left + i / Math.max(history.length - 1, 1) * (VW - PADDING.left - PADDING.right)
                const getY = (rank: number) => PADDING.top + ((rank - minR) / range) * (mainBottom - PADDING.top)
                // Y축 눈금
                const yTicks: number[] = [minR]
                if (range > 0) {
                  const step = Math.max(1, Math.ceil(range / 8))
                  for (let r = minR + step; r < maxR; r += step) yTicks.push(r)
                  if (yTicks[yTicks.length - 1] !== maxR) yTicks.push(maxR)
                }
                const pts = history.map((h, i) => {
                  const div = getDivision(h.rank, 1)
                  const prevDiv = i > 0 ? getDivision(history[i - 1].rank, 1) : div
                  return { x: getX(i), y: getY(h.rank), rank: h.rank, div, prevDiv, name: h.tournament_name }
                })
                const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
                const DIV_DOT_COLOR: Record<number, string> = {
                  1: '#facc15', 2: '#d1d5db', 3: '#fbbf24',
                  4: '#67e8f9', 5: '#c084fc', 6: '#9ca3af', 0: '#6b7280',
                }
                return (
                  <div className="w-full h-full">
                    <svg
                      className="w-full h-full"
                      viewBox={`0 0 ${VW} ${VH}`}
                      preserveAspectRatio="xMidYMid meet"
                    >
                      {/* Y축 눈금 */}
                      {yTicks.map(r => {
                        const y = getY(r)
                        return (
                          <g key={r}>
                            <line x1={PADDING.left} y1={y} x2={VW - PADDING.right} y2={y} stroke="#374151" strokeDasharray="3,3" />
                            <text x={PADDING.left - 8} y={y + 4} fill="#9ca3af" fontSize="11" textAnchor="end">{r}위</text>
                          </g>
                        )
                      })}
                      {/* X축 라벨 + 그리드 */}
                      {pts.map((p, i) => {
                        const lbl = p.name.length > 10 ? p.name.slice(0, 10) + '...' : p.name
                        return (
                          <g key={`x-${i}`}>
                            <line x1={p.x} y1={PADDING.top} x2={p.x} y2={mainBottom} stroke="#374151" strokeWidth={0.5} />
                            <text x={p.x} y={VH - 2} textAnchor="middle" fill="#9CA3AF" fontSize={9}>{lbl}</text>
                          </g>
                        )
                      })}
                      {/* 라인 */}
                      <path d={pathD} fill="none" stroke="#4b5563" strokeWidth="2" strokeLinejoin="round" />
                      {/* 도트 + 라벨 */}
                      {pts.map((p, i) => {
                        const dotColor = DIV_DOT_COLOR[p.div] ?? '#9ca3af'
                        const promoted = i > 0 && p.div < p.prevDiv
                        const relegated = i > 0 && p.div > p.prevDiv
                        return (
                          <g key={i}>
                            <circle cx={p.x} cy={p.y} r={5} fill={dotColor} stroke="#1f2937" strokeWidth="1.5" />
                            {/* 순위 */}
                            <text x={p.x} y={p.y - 12} fill="#e5e7eb" fontSize="11" textAnchor="middle" fontWeight="bold">{p.rank}</text>
                            {/* 리그 이동 라벨 */}
                            {promoted && (
                              <text x={p.x} y={p.y - 24} fill="#4ade80" fontSize="10" textAnchor="middle" fontWeight="bold">{p.div}부승격</text>
                            )}
                            {relegated && (
                              <text x={p.x} y={p.y - 24} fill="#f87171" fontSize="10" textAnchor="middle" fontWeight="bold">{p.div}부강등</text>
                            )}
                          </g>
                        )
                      })}
                    </svg>
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* 상대전적 모달 */}
      {h2hModal && (() => {
        const getWinRateColor = (rate: number, total: number) => {
          if (total < 5) return 'text-gray-500'
          if (rate >= 80) return 'text-emerald-400'
          if (rate >= 60) return 'text-blue-400'
          if (rate >= 40) return 'text-gray-200'
          if (rate >= 20) return 'text-orange-400'
          return 'text-red-400'
        }
        const getWinRateLabel = (rate: number, total: number) => {
          if (total < 5) return null
          if (rate >= 80) return '초강세'
          if (rate >= 60) return '강세'
          if (rate >= 40) return '비등'
          if (rate >= 20) return '약세'
          return '초약세'
        }
        const handleH2hSort = (col: typeof h2hSort.col) => {
          setH2hSort(prev => prev.col === col ? { col, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { col, dir: col === 'name' || col === 'div' ? 'asc' : 'desc' })
        }
        const existingDivs = h2hData ? [...new Set(h2hData.map(r => r.opp_rank != null ? getDivision(r.opp_rank, 1) : 0))].sort((a, b) => a - b) : []
        const filtered = h2hDivFilter !== null && h2hData
          ? h2hData.filter(r => getDivision(r.opp_rank ?? 9999, r.opp_rank != null ? 1 : 0) === h2hDivFilter)
          : h2hData ?? []
        const sorted = [...filtered].sort((a, b) => {
          const dir = h2hSort.dir === 'asc' ? 1 : -1
          if (h2hSort.col === 'name') return ((a.name ?? a.title ?? a.product_number ?? '').localeCompare(b.name ?? b.title ?? b.product_number ?? '')) * dir
          if (h2hSort.col === 'div') return ((getDivision(a.opp_rank ?? 9999, a.opp_rank != null ? 1 : 0)) - (getDivision(b.opp_rank ?? 9999, b.opp_rank != null ? 1 : 0))) * dir
          if (h2hSort.col === 'total') return (a.total - b.total) * dir
          if (h2hSort.col === 'wins') return (a.wins - b.wins) * dir
          if (h2hSort.col === 'draws') return (a.draws - b.draws) * dir
          if (h2hSort.col === 'losses') return (a.losses - b.losses) * dir
          if (h2hSort.col === 'rate') return ((a.total > 0 ? a.wins / a.total : -1) - (b.total > 0 ? b.wins / b.total : -1)) * dir
          return 0
        })
        const SortIcon = ({ col }: { col: typeof h2hSort.col }) =>
          h2hSort.col === col ? <span className="text-[9px]">{h2hSort.dir === 'desc' ? '▼' : '▲'}</span> : <span className="text-[9px] text-gray-700">▼</span>

        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]" onClick={() => { setH2hModal(null); setH2hDivDropdown(false) }}>
            <div className="bg-gray-800 rounded-lg w-[600px] max-h-[95vh] flex flex-col relative" onClick={e => e.stopPropagation()}>
              <button onClick={() => setH2hModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl leading-none z-10">✕</button>
              <div className="shrink-0 px-6 pt-5 pb-3 border-b border-gray-700">
                <div className="flex items-center gap-3">
                  {h2hModal.img && (
                    <div className="w-10 h-10 rounded overflow-hidden shrink-0">
                      <ImagePreview path={h2hModal.img} alt={h2hModal.lbl} className="w-full h-full object-cover" objectPosition="center 10%" />
                    </div>
                  )}
                  <p className="text-white font-bold text-lg">{h2hModal.lbl} 상대 전적</p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-6 pb-4">
                {h2hLoading ? <p className="text-gray-500 text-sm text-center py-8">로딩 중...</p>
                : !h2hData || h2hData.length === 0 ? <p className="text-gray-500 text-sm text-center py-8">상대 전적 데이터가 없습니다.</p>
                : (
                  <table className="w-full table-fixed text-xs">
                    <colgroup>
                      <col style={{ width: '2.5rem' }} />
                      <col style={{ width: '3.5rem' }} />
                      <col />
                      <col style={{ width: '2.8rem' }} />
                      <col style={{ width: '2.8rem' }} />
                      <col style={{ width: '2.2rem' }} />
                      <col style={{ width: '2.8rem' }} />
                      <col style={{ width: '4.5rem' }} />
                    </colgroup>
                    <thead className="sticky top-0 bg-gray-800 z-10">
                      <tr className="border-b border-gray-700 text-gray-400">
                        <th className="px-1 py-2 text-center"></th>
                        <th className="px-1 py-2 text-center relative">
                          <div className="flex items-center justify-center gap-1">
                            <button className={`hover:text-white transition text-xs ${h2hDivFilter !== null ? 'text-blue-400' : ''}`} onClick={() => setH2hDivDropdown(v => !v)}>
                              리그{h2hDivFilter !== null ? `(${h2hDivFilter}부)` : ''}
                            </button>
                            <button className="hover:text-white transition" onClick={() => handleH2hSort('div')}><SortIcon col="div" /></button>
                          </div>
                          {h2hDivDropdown && (
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-gray-900 border border-gray-600 rounded-lg shadow-xl z-20 py-1 min-w-20" onClick={e => e.stopPropagation()}>
                              <button className={`w-full px-3 py-1.5 text-left text-xs hover:bg-gray-700 transition ${h2hDivFilter === null ? 'text-blue-400' : 'text-gray-300'}`} onClick={() => { setH2hDivFilter(null); setH2hDivDropdown(false) }}>전체</button>
                              {existingDivs.map(d => (
                                <button key={d} className={`w-full px-3 py-1.5 text-left text-xs hover:bg-gray-700 transition ${h2hDivFilter === d ? 'text-blue-400' : 'text-gray-300'}`} onClick={() => { setH2hDivFilter(d); setH2hDivDropdown(false) }}>{DIV_LABEL[d] ?? `${d}부`}</button>
                              ))}
                            </div>
                          )}
                        </th>
                        <th className="px-2 py-2 text-left cursor-pointer hover:text-white select-none" onClick={() => handleH2hSort('name')}><span className="flex items-center gap-0.5">이름 <SortIcon col="name" /></span></th>
                        <th className="px-1 py-2 text-right cursor-pointer hover:text-white select-none" onClick={() => handleH2hSort('total')}><span className="flex items-center justify-end gap-0.5">전 <SortIcon col="total" /></span></th>
                        <th className="px-1 py-2 text-right cursor-pointer hover:text-white select-none" onClick={() => handleH2hSort('wins')}><span className="flex items-center justify-end gap-0.5">승 <SortIcon col="wins" /></span></th>
                        <th className="px-1 py-2 text-right cursor-pointer hover:text-white select-none" onClick={() => handleH2hSort('draws')}><span className="flex items-center justify-end gap-0.5">무 <SortIcon col="draws" /></span></th>
                        <th className="px-1 py-2 text-right cursor-pointer hover:text-white select-none" onClick={() => handleH2hSort('losses')}><span className="flex items-center justify-end gap-0.5">패 <SortIcon col="losses" /></span></th>
                        <th className="px-2 py-2 text-right cursor-pointer hover:text-white select-none" onClick={() => handleH2hSort('rate')}><span className="flex items-center justify-end gap-0.5">승률 <SortIcon col="rate" /></span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map(row => {
                        const oppName = row.name ?? row.title ?? row.product_number ?? `#${row.opp_id}`
                        const oppImg = row.photo_path ?? row.cover_path ?? null
                        const winRate = row.total > 0 ? row.wins / row.total * 100 : 0
                        const division = row.opp_rank != null ? getDivision(row.opp_rank, 1) : 0
                        return (
                          <tr key={row.opp_id} className="border-b border-gray-700/50 hover:bg-gray-700/30 transition">
                            <td className="p-0 h-10">
                              {oppImg ? <ImagePreview path={oppImg} alt={oppName} className="w-full h-10 object-cover" objectPosition="center 10%" /> : <div className="w-full h-10 bg-gray-700 flex items-center justify-center text-gray-600">?</div>}
                            </td>
                            <td className="px-1 py-1 text-center"><span className={`inline-block px-1 py-0.5 rounded border text-[10px] font-medium ${DIV_COLOR[division] ?? ''}`}>{DIV_LABEL[division] ?? '—'}</span></td>
                            <td className="px-2 py-1 text-white truncate max-w-0">{oppName}</td>
                            <td className="px-1 py-1 text-right text-gray-300">{row.total}</td>
                            <td className="px-1 py-1 text-right text-green-400">{row.wins}</td>
                            <td className="px-1 py-1 text-right text-yellow-400">{row.draws}</td>
                            <td className="px-1 py-1 text-right text-red-400">{row.losses}</td>
                            <td className="px-2 py-1 text-right">
                              <div className="flex flex-col items-end">
                                <span className={`font-medium ${getWinRateColor(winRate, row.total)}`}>{winRate.toFixed(1)}%</span>
                                {getWinRateLabel(winRate, row.total) && <span className={`text-[9px] leading-tight ${getWinRateColor(winRate, row.total)}`}>{getWinRateLabel(winRate, row.total)}</span>}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* 1부리그 랭킹차트 모달 */}
      {rankChartModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setRankChartModal(false)}>
          <div className="bg-gray-800 rounded-lg w-[95vw] h-[95vh] flex flex-col relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setRankChartModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl leading-none z-10">✕</button>
            <div className="shrink-0 px-6 pt-6 pb-3 border-b border-gray-700 flex items-center gap-4">
              <h2 className="text-lg font-bold text-white">{type === 'actor' ? '배우' : '작품'} 랭킹차트</h2>
              <div className="flex">
                {CHART_RANGE_CONFIG.map(cfg => (
                  <button
                    key={cfg.key}
                    onClick={() => setRankChartDiv(cfg.key)}
                    className={`text-xs px-2.5 py-1 border-r last:border-r-0 border-gray-600 first:rounded-l last:rounded-r ${
                      rankChartDiv === cfg.key ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {cfg.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-400">최근</span>
                <select
                  value={rankChartLimit}
                  onChange={(e) => { const v = Number(e.target.value); setRankChartLimit(v); localStorage.setItem('cup:rankChartLimit', String(v)) }}
                  className="bg-gray-700 text-white text-xs px-2 py-1 rounded"
                >
                  <option value={5}>5회</option>
                  <option value={10}>10회</option>
                  <option value={20}>20회</option>
                  <option value={9999}>전체</option>
                </select>
              </div>
              {rankChartData && (
                <span className="text-xs text-gray-500">{rankChartData.series.length}명 · {rankChartData.runs.length}회</span>
              )}
            </div>
            <div className="flex-1 overflow-hidden p-6">
              {rankChartData && rankChartData.runs.length > 0 && rankChartData.series.length > 0 ? (() => {
                const { runs, series } = rankChartData
                const rcfg = CHART_RANGE_CONFIG[rankChartDiv] ?? CHART_RANGE_CONFIG[0]
                const rankFrom = rcfg.rankFrom
                const rankTo = rcfg.rankTo
                const maxRank = rankTo - rankFrom + 1
                const PADDING = { top: 45, right: 80, bottom: 60, left: 50 }
                const chartH = 700
                const mainBottom = chartH - PADDING.bottom
                const outerBelowTop = mainBottom + 8
                const outerBelowBottom = chartH - 8
                const outerAboveTop = 4
                const outerAboveBottom = PADDING.top - 8
                const divBounds = [32, 96, 224, 480, 992, 2016]
                const getDiv = (gRank: number) => { for (let d = 0; d < divBounds.length; d++) { if (gRank <= divBounds[d]) return d + 1 } return 6 }
                const getX = (i: number) => PADDING.left + i / Math.max(runs.length - 1, 1) * (1000 - PADDING.left - PADDING.right)
                const getY = (globalRank: number) => PADDING.top + (globalRank - rankFrom) / Math.max(maxRank - 1, 1) * (mainBottom - PADDING.top)
                return (
                  <svg
                    className="w-full h-full"
                    viewBox="0 0 1000 700"
                    preserveAspectRatio="xMidYMid meet"
                    onMouseLeave={() => setRankChartHover(null)}
                  >
                    {/* Y축 그리드 */}
                    {Array.from({ length: maxRank }, (_, i) => {
                      const gRank = rankFrom + i
                      const y = getY(gRank)
                      return (
                        <g key={`y-${gRank}`}>
                          <line x1={PADDING.left} y1={y} x2={1000 - PADDING.right} y2={y} stroke="#374151" strokeWidth={0.5} />
                          {(i === 0 || (gRank % 5 === 0) || i === maxRank - 1) && (
                            <text x={PADDING.left - 8} y={y + 4} textAnchor="end" fill="#9CA3AF" fontSize={11}>{gRank}</text>
                          )}
                        </g>
                      )
                    })}
                    {/* 부 경계선 */}
                    <line x1={PADDING.left} y1={PADDING.top - 4} x2={1000 - PADDING.right} y2={PADDING.top - 4} stroke="#4B5563" strokeWidth={1} strokeDasharray="4,4" />
                    <line x1={PADDING.left} y1={mainBottom + 2} x2={1000 - PADDING.right} y2={mainBottom + 2} stroke="#4B5563" strokeWidth={1} strokeDasharray="4,4" />
                    {/* X축 라벨 */}
                    {runs.map((run, i) => {
                      const x = getX(i)
                      const lbl = run.label.length > 10 ? run.label.slice(0, 10) + '...' : run.label
                      return (
                        <g key={`x-${i}`}>
                          <line x1={x} y1={PADDING.top} x2={x} y2={mainBottom} stroke="#374151" strokeWidth={0.5} />
                          <text x={x} y={chartH - 2} textAnchor="middle" fill="#9CA3AF" fontSize={9}>{lbl}</text>
                        </g>
                      )
                    })}
                    {/* 라인 */}
                    {series.map((s, si) => {
                      const hue = (si * 360) / Math.max(series.length, 1)
                      const color = `hsl(${hue}, 70%, 55%)`
                      const isHovered = rankChartHover === s.id
                      const isOtherHovered = rankChartHover !== null && rankChartHover !== s.id
                      const opacity = isOtherHovered ? 0.08 : isHovered ? 1 : 0.6
                      const strokeW = isHovered ? 3 : s.currentRank <= 5 ? 2 : 1.2

                      type Pt = { x: number; y: number; rank: number; displayRank: number; outside: boolean; globalRank: number | null; divLabel: string; transLabel: string }
                      const allPts: Pt[] = []
                      for (let i = 0; i < runs.length; i++) {
                        const rank = s.ranks[i]
                        const gRank = s.globalRanks[i]
                        const dRank = s.displayRanks?.[i] ?? gRank
                        if (rank == null && gRank == null) continue
                        const x = getX(i)
                        const gRankVal = gRank ?? rank
                        const inside = gRankVal != null && gRankVal >= rankFrom && gRankVal <= rankTo
                        const outsideAbove = gRankVal != null && gRankVal < rankFrom
                        const y = inside ? getY(gRankVal!)
                          : outsideAbove ? (outerAboveTop + (outerAboveBottom - outerAboveTop) / 2)
                          : (outerBelowTop + (outerBelowBottom - outerBelowTop) / 2)
                        const div = gRank != null ? getDiv(gRank) : 0
                        const divLabel = !inside && gRank != null ? `${DIV_LABEL[div] ?? `${div}부`} ${gRank}위` : ''
                        // 승격/강등 판정
                        let transLabel = ''
                        if (!inside) {
                          const prevGR = i > 0 ? s.globalRanks[i - 1] : null
                          const nextGR = i < runs.length - 1 ? s.globalRanks[i + 1] : null
                          const prevInside = prevGR != null && prevGR >= rankFrom && prevGR <= rankTo
                          const nextInside = nextGR != null && nextGR >= rankFrom && nextGR <= rankTo
                          if (prevInside) transLabel = outsideAbove ? ' - 승격' : ' - 강등'
                          else if (nextInside) transLabel = outsideAbove ? ' - 강등' : ' - 승격'
                        }
                        allPts.push({ x, y, rank: gRankVal ?? 0, displayRank: dRank ?? gRankVal ?? 0, outside: !inside, globalRank: gRank, divLabel, transLabel })
                      }
                      if (allPts.length === 0) return null
                      // 현재(마지막) 시점에 부 범위 안에 없으면 제외
                      if (allPts[allPts.length - 1].outside) return null
                      const pathD = allPts.map((p, pi) => `${pi === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
                      const lastPt = allPts[allPts.length - 1]
                      return (
                        <g
                          key={s.id}
                          opacity={opacity}
                          onMouseEnter={() => setRankChartHover(s.id)}
                          onClick={() => openDetailModal(s.id, s.name, s.photo_path)}
                          className="cursor-pointer"
                        >
                          <path d={pathD} fill="none" stroke={color} strokeWidth={strokeW} strokeLinejoin="round" />
                          {allPts.map((p, pi) => (
                            <circle key={pi} cx={p.x} cy={p.y} r={isHovered ? 4 : 2.5} fill={p.outside ? 'none' : color} stroke={p.outside ? color : 'none'} strokeWidth={p.outside ? 1.5 : 0} />
                          ))}
                          <text
                            x={lastPt.x + 8} y={lastPt.y + 4} fill={color} fontSize={isHovered ? 11 : 9} fontWeight={isHovered ? 'bold' : 'normal'}
                            onMouseMove={e => setRankChartTooltip({ type, id: s.id, x: e.clientX, y: e.clientY, showCover: true })}
                            onMouseLeave={() => setRankChartTooltip(null)}
                          >{s.name}</text>
                          {isHovered && allPts.map((p, pi) => (
                            <text key={`t-${pi}`} x={p.x} y={p.y - 8} textAnchor="middle" fill="white" fontSize={10} fontWeight="bold">
                              {p.outside ? `${p.divLabel}${p.transLabel}` : p.displayRank}
                            </text>
                          ))}
                        </g>
                      )
                    })}
                  </svg>
                )
              })() : (
                <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                  {rankChartData ? '마스터 대회 기록이 없습니다' : '로딩 중...'}
                </div>
              )}
            </div>
            {rankChartTooltip && <CardTooltip tooltip={rankChartTooltip} />}
          </div>
        </div>
      )}

      {/* 평점 편집 모달 */}
      {editActorId && editActorData && (
        <ActorForm
          actor={editActorData}
          onSave={() => {
            setEditActorId(null)
            setEditActorData(null)
            load(type, search, page, divFilter, pageSize, sortBy, sortDir)
          }}
          onCancel={() => { setEditActorId(null); setEditActorData(null) }}
        />
      )}
    </div>
  )
}
