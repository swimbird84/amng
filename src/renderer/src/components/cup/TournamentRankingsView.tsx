import React, { useState, useEffect, useCallback } from 'react'
import { cupApi } from '../../api'
import ImagePreview from '../ImagePreview'
import type { CupTournament, TournamentRankRow, LastRunRankRow } from './cupTypes'
import { RANK_PAGE_SIZE, RANK_LIMIT_OPTIONS, FORMAT_LABEL, Pagination, RankTrendChart, roundLabel } from './cupConstants'

export default function TournamentRankingsView({
  tournamentId,
  onBack,
  onPlay,
  onNavigateToActor,
  onNavigateToWork,
}: {
  tournamentId: number
  onBack: () => void
  onPlay: (runId: number, tab: 'standings') => void
  onNavigateToActor: (id: number) => void
  onNavigateToWork: (id: number) => void
}) {
  const [tournament, setTournament] = useState<CupTournament | null>(null)
  const [rankMode, setRankMode] = useState<'overall' | 'last'>('overall')
  const [lastRunId, setLastRunId] = useState<number | null>(null)
  const [rows, setRows] = useState<TournamentRankRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [limit, setLimit] = useState(() => Number(localStorage.getItem('tournamentRank:limit') || '100'))
  const [sortBy, setSortBy] = useState('win_rate')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [search, setSearch] = useState('')
  const [lastRows, setLastRows] = useState<LastRunRankRow[]>([])
  const [lastTotal, setLastTotal] = useState(0)
  const [lastPage, setLastPage] = useState(0)
  const [lastFormat, setLastFormat] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [rankHistories, setRankHistories] = useState<Record<number, { rank: number }[]>>({})
  const [trendModal, setTrendModal] = useState<{ item_id: number; label: string; img: string | null } | null>(null)
  const [imgOverlay, setImgOverlay] = useState<{ path: string } | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  useEffect(() => {
    cupApi.list({ sortBy: 'created_at' }).then(list => {
      const found = (list as CupTournament[]).find(t => t.id === tournamentId)
      if (found) setTournament(found)
    })
  }, [tournamentId])

  const loadOverall = useCallback(async (p: number, lb: number, sb: string, sd: string, s: string) => {
    setLoading(true)
    try {
      const res = await cupApi.tournamentRankings(tournamentId, { limit: lb, offset: p * lb, sortBy: sb, sortDir: sd, search: s || undefined })
      const rankRows = res.rows as TournamentRankRow[]
      setRows(rankRows)
      setTotal(res.total)
      const histories: Record<number, { rank: number }[]> = {}
      await Promise.all(rankRows.map(async row => {
        histories[row.item_id] = await cupApi.rankHistory(tournamentId, row.item_id)
      }))
      setRankHistories(prev => ({ ...prev, ...histories }))
    } finally {
      setLoading(false)
    }
  }, [tournamentId])

  const loadLast = useCallback(async (p: number, lb: number) => {
    setLoading(true)
    try {
      const res = await cupApi.lastRunRankings(tournamentId, { limit: lb, offset: p * lb })
      setLastRows(res.rows as LastRunRankRow[])
      setLastTotal(res.total)
      if (res.format) setLastFormat(res.format)
      if (res.runId) setLastRunId(res.runId)
    } finally {
      setLoading(false)
    }
  }, [tournamentId])

  useEffect(() => { setPage(0) }, [sortBy, sortDir, search, limit])
  useEffect(() => { if (rankMode === 'overall') loadOverall(page, limit, sortBy, sortDir, search) }, [rankMode, page, limit, sortBy, sortDir, search, loadOverall])
  useEffect(() => { if (rankMode === 'last') loadLast(lastPage, limit) }, [rankMode, lastPage, limit, loadLast])

  const totalPages = Math.ceil(total / limit)
  const lastTotalPages = Math.ceil(lastTotal / limit)
  const type = tournament?.type ?? 'actor'

  const imgPath = (row: TournamentRankRow | LastRunRankRow) =>
    (row as TournamentRankRow).photo_path ?? (row as TournamentRankRow).cover_path ?? null
  const label = (row: TournamentRankRow | LastRunRankRow) =>
    (row as any).name ?? (row as any).title ?? (row as any).product_number ?? `#${(row as any).item_id}`

  const sortTh = (col: string, colLabel: string, sub?: string) => {
    const active = sortBy === col
    const nextDir: 'asc' | 'desc' = active ? (sortDir === 'desc' ? 'asc' : 'desc') : 'desc'
    return (
      <th
        className={`px-2 text-right cursor-pointer select-none hover:text-white whitespace-nowrap ${active ? 'text-white' : 'text-gray-400'}`}
        onClick={() => { setSortBy(col); setSortDir(nextDir) }}
      >
        <div className="text-xs">{colLabel}{active ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}</div>
        {sub && <div className="text-[10px] text-gray-500 font-normal">{sub}</div>}
      </th>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 상단 바 */}
      <div className="shrink-0 px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={onBack} className="text-gray-400 hover:text-white text-sm transition">← 목록</button>
          <h2 className="text-white font-bold truncate">{tournament?.name ?? '...'} 순위</h2>
          <span className="text-gray-500 text-xs">
            ({rankMode === 'overall' ? total : lastTotal}{type === 'work' ? '작품' : '명'})
          </span>

          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {rankMode === 'overall' && (
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0) }}
                placeholder={type === 'actor' ? '이름 검색' : '제목/품번 검색'}
                className="bg-gray-700 text-white text-xs px-2 py-1 rounded w-36 placeholder-gray-500 outline-none"
              />
            )}
            {rankMode === 'last' && lastRunId && (
              <button
                onClick={() => onPlay(lastRunId, 'standings')}
                className="text-xs px-2 py-1 bg-gray-700 text-gray-300 hover:bg-gray-600 rounded"
              >매치결과</button>
            )}
            <select
              value={limit}
              onChange={e => { const v = Number(e.target.value); setLimit(v); localStorage.setItem('tournamentRank:limit', String(v)); setPage(0); setLastPage(0) }}
              className="bg-gray-700 text-white text-xs px-2 py-1 rounded"
            >
              {RANK_LIMIT_OPTIONS.map(l => <option key={l} value={l}>{l}개</option>)}
            </select>
            <div className="flex">
              <button
                onClick={() => { setRankMode('overall'); setPage(0) }}
                className={`text-sm px-3 py-1.5 rounded-l border-r border-gray-600 ${rankMode === 'overall' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              >전체 순위</button>
              <button
                onClick={() => { setRankMode('last'); setLastPage(0) }}
                className={`text-sm px-3 py-1.5 rounded-r ${rankMode === 'last' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              >마지막 순위</button>
            </div>
          </div>
        </div>
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto">
        {loading && rows.length === 0 && lastRows.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-500">로딩 중...</div>
        ) : rankMode === 'overall' ? (
          rows.length === 0 ? (
            <p className="text-gray-500 text-sm mt-8 text-center">순위 데이터가 없습니다.<br />대회를 완료하면 순위가 집계됩니다.</p>
          ) : (
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col style={{ width: '3rem' }} />
                <col style={{ width: '4rem' }} />
                {type === 'work' && <col style={{ width: '7rem' }} />}
                <col />
                <col style={{ width: '5.5rem' }} />
                <col style={{ width: '5.5rem' }} />
                <col style={{ width: '6rem' }} />
                <col style={{ width: '11rem' }} />
              </colgroup>
              <thead className="sticky top-0 bg-gray-900 z-10">
                <tr className="text-gray-400 text-xs border-b border-gray-700 h-12">
                  <th className="px-2 text-left">#</th>
                  <th className="px-2 text-left">썸네일</th>
                  {type === 'work' && <th className="px-2 text-left text-xs">품번</th>}
                  <th className="px-2 text-left">{type === 'work' ? '제목' : '이름'}</th>
                  {sortTh('win_rate', '우승률', '(우승/참가)')}
                  {sortTh('match_win_rate', '매치승률', '(승/경기)')}
                  {sortTh('total_pts', '누적승점')}
                  <th className="px-2 text-center text-xs text-gray-400">순위추이</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const img = imgPath(row)
                  const lbl = label(row)
                  const recentHistory = (rankHistories[row.item_id] ?? []).slice(-10)
                  return (
                    <tr key={row.item_id} className="border-b border-gray-800 hover:bg-gray-800 h-14">
                      <td className="px-2 text-gray-400 text-xs text-center">{page * limit + idx + 1}</td>
                      <td className="p-0 h-14" onMouseEnter={() => img && setImgOverlay({ path: img })} onMouseLeave={() => setImgOverlay(null)}>
                        <ImagePreview path={img} alt={lbl} className="w-full h-14 object-cover" objectPosition="center 10%" />
                      </td>
                      {type === 'work' && (
                        <td className="px-2 overflow-hidden">
                          <div className="truncate text-gray-400 text-xs">{row.product_number}</div>
                        </td>
                      )}
                      <td className="px-2 overflow-hidden">
                        <span
                          className="text-white font-medium hover:underline cursor-pointer truncate block"
                          onClick={() => type === 'actor' ? onNavigateToActor(row.item_id) : onNavigateToWork(row.item_id)}
                          onMouseMove={e => setTooltip({ type, id: row.item_id, x: e.clientX, y: e.clientY })}
                          onMouseLeave={() => setTooltip(null)}
                        >{lbl}</span>
                      </td>
                      <td className="px-2 text-right text-yellow-400">
                        <div>{row.win_rate.toFixed(1)}%</div>
                        <div className="text-[11px] text-gray-500">({row.run_wins}/{row.total_runs})</div>
                      </td>
                      <td className="px-2 text-right text-blue-400">
                        <div>{row.match_win_rate.toFixed(1)}%</div>
                        <div className="text-[11px] text-gray-500">({row.match_wins}/{row.total_matches})</div>
                      </td>
                      <td className="px-2 text-right text-green-400">{row.total_pts > 0 ? row.total_pts.toFixed(1) : '—'}</td>
                      <td
                        className="px-2 cursor-pointer"
                        onClick={() => setTrendModal({ item_id: row.item_id, label: lbl, img })}
                      >
                        <div className="flex justify-center">
                          <RankTrendChart history={recentHistory} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )
        ) : (
          lastRows.length === 0 ? (
            <p className="text-gray-500 text-sm mt-8 text-center">마지막 순위 데이터가 없습니다.</p>
          ) : (
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col style={{ width: '3rem' }} />
                <col style={{ width: '4rem' }} />
                {type === 'work' && <col style={{ width: '7rem' }} />}
                <col />
                <col style={{ width: '7rem' }} />
                <col style={{ width: '6rem' }} />
              </colgroup>
              <thead className="sticky top-0 bg-gray-900 z-10">
                <tr className="text-gray-400 text-xs border-b border-gray-700 h-12">
                  <th className="px-2 text-left">#</th>
                  <th className="px-2 text-left">썸네일</th>
                  {type === 'work' && <th className="px-2 text-left text-xs">품번</th>}
                  <th className="px-2 text-left">{type === 'work' ? '제목' : '이름'}</th>
                  <th className="px-2 text-left text-xs">
                    {lastFormat === 'league' ? '최종점수' : '탈락라운드'}
                  </th>
                  <th className="px-2 text-right text-xs">획득 승점</th>
                </tr>
              </thead>
              <tbody>
                {lastRows.map(row => {
                  const img = imgPath(row)
                  const lbl = label(row)
                  return (
                    <tr key={row.item_id} className="border-b border-gray-800 hover:bg-gray-800 h-14">
                      <td className="px-2 text-gray-400 font-bold text-center">{row.rank}</td>
                      <td className="p-0 h-14" onMouseEnter={() => img && setImgOverlay({ path: img })} onMouseLeave={() => setImgOverlay(null)}>
                        <ImagePreview path={img} alt={lbl} className="w-full h-14 object-cover" objectPosition="center 10%" />
                      </td>
                      {type === 'work' && (
                        <td className="px-2 overflow-hidden">
                          <div className="truncate text-gray-400 text-xs">{row.product_number}</div>
                        </td>
                      )}
                      <td className="px-2 overflow-hidden">
                        <span
                          className="text-white font-medium hover:underline cursor-pointer truncate block"
                          onClick={() => type === 'actor' ? onNavigateToActor(row.item_id) : onNavigateToWork(row.item_id)}
                          onMouseMove={e => setTooltip({ type, id: row.item_id, x: e.clientX, y: e.clientY })}
                          onMouseLeave={() => setTooltip(null)}
                        >{lbl}</span>
                      </td>
                      <td className="px-2 text-gray-300 text-xs">
                        {lastFormat === 'league'
                          ? <span className="text-blue-400 font-semibold">{row.pts}pt</span>
                          : row.elim_round === null
                            ? <span className="text-yellow-400 font-semibold">🏆 우승</span>
                            : roundLabel(row.elim_round)
                        }
                      </td>
                      <td className="px-2 text-right text-green-400 text-xs">
                        {row.run_pts != null ? row.run_pts.toFixed(1) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )
        )}
      </div>

      {/* 페이지네이션 */}
      {rankMode === 'overall' && totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      )}
      {rankMode === 'last' && lastTotalPages > 1 && (
        <Pagination page={lastPage} totalPages={lastTotalPages} onPageChange={setLastPage} />
      )}

      {/* 순위 추이 모달 */}
      {trendModal && (() => {
        const history = rankHistories[trendModal.item_id] ?? []
        const W = 420, H = 180, PX = 36, PY = 16
        const ranks = history.map(h => h.rank)
        const minR = ranks.length ? Math.min(...ranks) : 1
        const maxR = ranks.length ? Math.max(...ranks) : 1
        const range = maxR - minR || 1
        const pts = history.map((h, i) => {
          const x = PX + (history.length > 1 ? i / (history.length - 1) : 0.5) * (W - PX * 2)
          const y = PY + ((h.rank - minR) / range) * (H - PY * 2)
          return { x, y, rank: h.rank }
        })
        const polyPts = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
        const last = ranks[ranks.length - 1] ?? 0
        const prev = ranks[ranks.length - 2] ?? last
        const color = last < prev ? '#4ade80' : last > prev ? '#f87171' : '#9ca3af'
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setTrendModal(null)}>
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700" style={{ width: W + 80 }} onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4">
                <ImagePreview path={trendModal.img} alt={trendModal.label} className="w-10 h-10 rounded object-cover shrink-0" objectPosition="center 10%" />
                <p className="text-white font-bold flex-1 truncate">{trendModal.label} 순위 추이</p>
                <button onClick={() => setTrendModal(null)} className="text-gray-400 hover:text-white text-sm ml-2 shrink-0">✕</button>
              </div>
              {history.length < 2 ? (
                <p className="text-gray-500 text-sm text-center py-8">추이 데이터가 부족합니다.</p>
              ) : (
                <svg width={W} height={H} className="overflow-visible">
                  {Array.from(new Set([minR, maxR])).map(r => {
                    const y = PY + ((r - minR) / range) * (H - PY * 2)
                    return (
                      <g key={r}>
                        <line x1={PX} y1={y} x2={W - PX} y2={y} stroke="#374151" strokeDasharray="3,3" />
                        <text x={PX - 6} y={y + 4} fill="#9ca3af" fontSize="11" textAnchor="end">{r}위</text>
                      </g>
                    )
                  })}
                  <polyline points={polyPts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
                  {pts.map((p, i) => (
                    <g key={i}>
                      <circle cx={p.x} cy={p.y} r="4" fill={color} />
                      <text x={p.x} y={p.y - 8} fill="#e5e7eb" fontSize="11" textAnchor="middle">{p.rank}위</text>
                    </g>
                  ))}
                </svg>
              )}
              <p className="text-gray-500 text-xs mt-3 text-right">최근 {history.length}회 기록</p>
            </div>
          </div>
        )
      })()}

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

      {tooltip && <CardTooltip tooltip={tooltip} />}
    </div>
  )
}
