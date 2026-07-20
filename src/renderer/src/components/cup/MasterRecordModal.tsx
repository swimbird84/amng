import { useState, useEffect, useCallback } from 'react'
import { masterRankingApi, cupApi } from '../../api'
import { getDivision, DIV_LABEL, FORMAT_LABEL } from './cupConstants'
import type { FormatStat, H2HRow } from './cupTypes'
import ImagePreview from '../ImagePreview'
import CardTooltip, { type TooltipState } from '../CardTooltip'
import { pushEscHandler, popEscHandler } from '../../escManager'

interface Props {
  type: 'actor' | 'work'
  itemId: number
  itemName: string
  itemImage: string | null
  onClose: () => void
}

export default function MasterRecordModal({ type, itemId, itemName, itemImage, onClose }: Props) {
  const [seasons, setSeasons] = useState<{ id: number; name: string }[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(() => {
    const saved = localStorage.getItem('cup:recordSeasonId')
    return saved ? Number(saved) : null
  })

  const [stats, setStats] = useState<{
    rank: number; total_points: number; total_cups: number; cup_wins: number
    total_matches: number; match_wins: number; win_rate: number; match_win_rate: number
  } | null>(null)
  const [rankHistory, setRankHistory] = useState<{ rank: number; recorded_at: string; tournament_name: string }[]>([])
  const [formatStats, setFormatStats] = useState<FormatStat[]>([])
  const [h2hData, setH2hData] = useState<H2HRow[]>([])
  const [h2hSort, setH2hSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'total', dir: 'desc' })
  const [h2hMin, setH2hMin] = useState<number>(() => Number(localStorage.getItem('cup:h2hMin')) || 1)
  const [h2hTooltip, setH2hTooltip] = useState<TooltipState | null>(null)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async (sid: number | null) => {
    setLoading(true)
    try {
      const [s, rh, fs, h2h] = await Promise.all([
        masterRankingApi.itemStats(type, itemId, sid ?? undefined),
        masterRankingApi.rankHistory(type, itemId, 0, sid ?? undefined),
        masterRankingApi.itemFormatStats(type, itemId, sid ?? undefined),
        cupApi.headToHead(type, itemId, sid ?? undefined, h2hMin),
      ])
      setStats(s)
      setRankHistory(rh)
      setFormatStats(fs)
      setH2hData(h2h as H2HRow[])
    } finally {
      setLoading(false)
    }
  }, [type, itemId, h2hMin])

  useEffect(() => {
    masterRankingApi.seasons(type).then(s => setSeasons(s.map(r => ({ id: r.id, name: r.name }))))
  }, [type])

  useEffect(() => { loadData(selectedSeasonId) }, [selectedSeasonId, loadData])

  useEffect(() => {
    const handler = () => onClose()
    pushEscHandler(handler)
    return () => popEscHandler(handler)
  }, [onClose])

  const bestRank = rankHistory.length > 0 ? Math.min(...rankHistory.map(r => r.rank)) : null
  const division = stats ? getDivision(stats.rank, stats.total_cups, type) : 0

  const sortedH2h = [...h2hData].sort((a, b) => {
    const { col, dir } = h2hSort
    const m = dir === 'asc' ? 1 : -1
    switch (col) {
      case 'name': return m * ((a.name ?? a.title ?? '').localeCompare(b.name ?? b.title ?? ''))
      case 'total': return m * (a.total - b.total)
      case 'wins': return m * (a.wins - b.wins)
      case 'draws': return m * (a.draws - b.draws)
      case 'losses': return m * (a.losses - b.losses)
      case 'rate':
      case 'eval': {
        const ra = a.total > 0 ? a.wins / a.total : -1
        const rb = b.total > 0 ? b.wins / b.total : -1
        return m * (ra - rb)
      }
      default: return 0
    }
  })

  const handleH2hSort = (col: string) => {
    if (h2hSort.col === col) setH2hSort({ col, dir: h2hSort.dir === 'desc' ? 'asc' : 'desc' })
    else setH2hSort({ col, dir: 'desc' })
  }

  const getWinRateColor = (rate: number, total: number) => {
    if (total < 3) return 'text-gray-500'
    if (rate >= 80) return 'text-emerald-400'
    if (rate >= 60) return 'text-blue-400'
    if (rate >= 40) return 'text-gray-200'
    if (rate >= 20) return 'text-orange-400'
    return 'text-red-400'
  }
  const getWinRateLabel = (rate: number, total: number) => {
    if (total < 3) return null
    if (rate >= 80) return '초강세'
    if (rate >= 60) return '강세'
    if (rate >= 40) return '비등'
    if (rate >= 20) return '약세'
    return '초약세'
  }

  // 추이 차트 렌더링 (간단한 SVG 꺾은선)
  const renderTrendChart = () => {
    if (rankHistory.length < 2) return <p className="text-gray-500 text-sm text-center py-4">데이터가 부족합니다</p>
    const w = 900, h = 160, px = 40, py = 20
    const maxRank = Math.max(...rankHistory.map(r => r.rank), 10)
    const minRank = 1
    const xStep = (w - px * 2) / (rankHistory.length - 1)
    const yScale = (rank: number) => py + ((rank - minRank) / (maxRank - minRank)) * (h - py * 2)
    const points = rankHistory.map((r, i) => `${px + i * xStep},${yScale(r.rank)}`).join(' ')

    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ minHeight: 140 }}>
        <polyline fill="none" stroke="#3b82f6" strokeWidth="2" points={points} />
        {rankHistory.map((r, i) => (
          <g key={i}>
            <circle cx={px + i * xStep} cy={yScale(r.rank)} r="3" fill="#3b82f6" />
            <title>{r.tournament_name}: {r.rank}위</title>
          </g>
        ))}
        {/* Y축 라벨 */}
        <text x="4" y={py + 4} fill="#9ca3af" fontSize="10">{minRank}</text>
        <text x="4" y={h - py + 4} fill="#9ca3af" fontSize="10">{maxRank}</text>
        {/* X축: 첫/끝만 */}
        <text x={px} y={h - 2} fill="#9ca3af" fontSize="9" textAnchor="middle">{rankHistory[0].tournament_name.slice(0, 8)}</text>
        <text x={w - px} y={h - 2} fill="#9ca3af" fontSize="9" textAnchor="middle">{rankHistory[rankHistory.length - 1].tournament_name.slice(0, 8)}</text>
      </svg>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70]" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg w-[1000px] h-[95vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-700 shrink-0">
          <ImagePreview path={itemImage} alt={itemName} className="w-10 h-10 rounded shrink-0" />
          <h2 className="text-white font-bold text-base flex-1">{itemName}</h2>
          <span className="text-yellow-400 text-sm font-semibold">마스터 전적</span>
          <select
            value={selectedSeasonId === null ? '' : String(selectedSeasonId)}
            onChange={e => { const v = e.target.value === '' ? null : Number(e.target.value); setSelectedSeasonId(v); localStorage.setItem('cup:recordSeasonId', v === null ? '' : String(v)) }}
            className="bg-gray-700 text-gray-300 text-xs rounded px-2 py-1 border-none outline-none cursor-pointer"
          >
            <option value="">{seasons.length + 1}시즌(현재)</option>
            {seasons.map(s => (
              <option key={s.id} value={s.id}>{s.name}시즌</option>
            ))}
            <option value="-1">전체</option>
          </select>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none ml-2">✕</button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading ? (
            <p className="text-gray-500 text-center py-8">로딩 중...</p>
          ) : !stats ? (
            <p className="text-gray-500 text-center py-8">데이터가 없습니다</p>
          ) : (
            <>
              {/* 요약 카드 6개 */}
              <div className="grid grid-cols-6 gap-3">
                {[
                  { label: '포인트', value: stats.total_cups > 0 ? stats.total_points.toFixed(1) : '-', sub: null },
                  { label: '순위', value: stats.total_cups > 0 ? `${stats.rank}위` : '-', sub: null },
                  { label: '최고순위', value: bestRank ? `${bestRank}위` : '-', sub: null },
                  { label: '리그', value: division > 0 ? (DIV_LABEL[division] ?? `${division}부`) : '-', sub: null },
                  { label: '우승률', value: stats.total_cups > 0 ? `${stats.win_rate}%` : '-', sub: stats.total_cups > 0 ? `${stats.cup_wins}/${stats.total_cups}` : null },
                  { label: '승률', value: stats.total_matches > 0 ? `${stats.match_win_rate}%` : '-', sub: stats.total_matches > 0 ? `${stats.match_wins}/${stats.total_matches}` : null },
                ].map((card, i) => (
                  <div key={i} className="bg-gray-700/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-400 mb-1">{card.label}</p>
                    <p className="text-white font-bold text-lg">{card.value}</p>
                    {card.sub && <p className="text-xs text-gray-500 mt-0.5">{card.sub}</p>}
                  </div>
                ))}
              </div>

              {/* 포맷별 전적 */}
              {formatStats.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-300 mb-2">포맷별 전적</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-500 text-xs border-b border-gray-700">
                        <th className="text-left py-1.5 px-2">포맷</th>
                        <th className="text-center py-1.5 px-2">참가</th>
                        <th className="text-center py-1.5 px-2">우승</th>
                        <th className="text-center py-1.5 px-2">우승률</th>
                        <th className="text-center py-1.5 px-2">매치</th>
                        <th className="text-center py-1.5 px-2">매치승</th>
                        <th className="text-center py-1.5 px-2">승률</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formatStats.map(fs => (
                        <tr key={fs.format} className="border-b border-gray-700/50 text-gray-300">
                          <td className="py-1.5 px-2">{FORMAT_LABEL[fs.format] ?? fs.format}</td>
                          <td className="text-center py-1.5 px-2">{fs.total_cups}</td>
                          <td className="text-center py-1.5 px-2">{fs.cup_wins}</td>
                          <td className="text-center py-1.5 px-2">{fs.total_cups > 0 ? Math.round(fs.cup_wins / fs.total_cups * 100) : 0}%</td>
                          <td className="text-center py-1.5 px-2">{fs.total_matches}</td>
                          <td className="text-center py-1.5 px-2">{fs.match_wins}</td>
                          <td className="text-center py-1.5 px-2">{fs.total_matches > 0 ? Math.round(fs.match_wins / fs.total_matches * 100) : 0}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 성적 추이 */}
              <div>
                <h3 className="text-sm font-semibold text-gray-300 mb-2">성적 추이</h3>
                <div className="bg-gray-700/30 rounded-lg p-2">
                  {renderTrendChart()}
                </div>
              </div>

              {/* 상대전적 */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-gray-300">상대전적</h3>
                  <select
                    value={h2hMin}
                    onChange={e => { const v = Number(e.target.value); setH2hMin(v); localStorage.setItem('cup:h2hMin', String(v)) }}
                    className="bg-gray-700 text-white text-xs px-1.5 py-0.5 rounded"
                  >
                    {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}전 이상</option>)}
                  </select>
                </div>
                {h2hData.length > 0 ? (
                  <div className="max-h-[480px] overflow-y-auto relative">
                    <table className="w-full text-sm table-fixed">
                      <colgroup>
                        <col />
                        <col style={{ width: '50px' }} />
                        <col style={{ width: '42px' }} />
                        <col style={{ width: '42px' }} />
                        <col style={{ width: '42px' }} />
                        <col style={{ width: '50px' }} />
                        <col style={{ width: '56px' }} />
                      </colgroup>
                      <thead className="sticky top-0 bg-gray-800">
                        <tr className="text-gray-500 text-xs border-b border-gray-700">
                          {[
                            { col: 'name', label: '상대', w: 'text-left' },
                            { col: 'total', label: '전적', w: 'text-center' },
                            { col: 'wins', label: '승', w: 'text-center' },
                            { col: 'draws', label: '무', w: 'text-center' },
                            { col: 'losses', label: '패', w: 'text-center' },
                            { col: 'rate', label: '승률', w: 'text-center' },
                            { col: 'eval', label: '평가', w: 'text-center' },
                          ].map(({ col, label, w }) => (
                            <th
                              key={col}
                              className={`py-1.5 px-2 cursor-pointer hover:text-gray-300 transition ${w}`}
                              onClick={() => handleH2hSort(col)}
                            >
                              {label}{h2hSort.col === col && (h2hSort.dir === 'desc' ? ' ▼' : ' ▲')}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedH2h.map(row => (
                          <tr key={row.opp_id} className="border-b border-gray-700/50 text-gray-300 hover:bg-gray-700/30">
                            <td
                              className="py-1.5 px-2 truncate max-w-0"
                              onMouseMove={e => setH2hTooltip({ type, id: row.opp_id, x: e.clientX, y: e.clientY, showCover: true })}
                              onMouseLeave={() => setH2hTooltip(null)}
                            >
                              <span className="truncate">{row.name ?? row.title ?? row.product_number ?? ''}</span>
                            </td>
                            <td className="text-center py-1.5 px-2">{row.total}</td>
                            <td className="text-center py-1.5 px-2 text-blue-400">{row.wins}</td>
                            <td className="text-center py-1.5 px-2 text-gray-400">{row.draws}</td>
                            <td className="text-center py-1.5 px-2 text-red-400">{row.losses}</td>
                            {(() => {
                              const winRate = row.total > 0 ? row.wins / row.total * 100 : 0
                              const label = getWinRateLabel(winRate, row.total)
                              const color = getWinRateColor(winRate, row.total)
                              return (
                                <>
                                  <td className={`text-center py-1.5 px-2 ${color}`}>{Math.round(winRate)}%</td>
                                  <td className={`text-center py-1.5 px-2 text-xs ${color}`}>{label ?? '-'}</td>
                                </>
                              )
                            })()}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm text-center py-4">상대전적 데이터가 없습니다.</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {h2hTooltip && <CardTooltip tooltip={h2hTooltip} />}
    </div>
  )
}
