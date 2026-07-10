import { useState, useEffect, useCallback } from 'react'
import { masterRankingApi } from '../../api'
import { FORMAT_LABEL } from './cupConstants'
import ImagePreview from '../ImagePreview'
import { pushEscHandler, popEscHandler } from '../../escManager'

interface Props {
  type: 'actor' | 'work'
  onClose: () => void
}

type StatsData = Awaited<ReturnType<typeof masterRankingApi.tournamentStats>>

export default function TournamentStatsModal({ type, onClose }: Props) {
  const [seasons, setSeasons] = useState<{ id: number; name: string }[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null)
  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async (sid: number | null) => {
    setLoading(true)
    try {
      const result = await masterRankingApi.tournamentStats(type, sid ?? undefined)
      setData(result)
    } finally {
      setLoading(false)
    }
  }, [type])

  useEffect(() => {
    masterRankingApi.seasons(type).then(s => setSeasons(s.map(r => ({ id: r.id, name: r.name }))))
  }, [type])

  useEffect(() => { loadData(selectedSeasonId) }, [selectedSeasonId, loadData])

  useEffect(() => {
    const handler = () => onClose()
    pushEscHandler(handler)
    return () => popEscHandler(handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70]" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg w-[1000px] h-[95vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-700 shrink-0">
          <h2 className="text-white font-bold text-base flex-1">{type === 'actor' ? '배우' : '작품'} 마스터 대회통계</h2>
          <select
            value={selectedSeasonId === null ? '' : String(selectedSeasonId)}
            onChange={e => setSelectedSeasonId(e.target.value === '' ? null : Number(e.target.value))}
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
          ) : !data ? (
            <p className="text-gray-500 text-center py-8">데이터가 없습니다</p>
          ) : (
            <>
              {/* 요약 카드 */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: '총 대회', value: data.summary.total_runs },
                  { label: '총 참가연인원', value: data.summary.total_entries },
                  { label: '평균 참가자', value: data.summary.avg_entries },
                  { label: '총 매치', value: data.summary.total_matches },
                ].map((card, i) => (
                  <div key={i} className="bg-gray-700/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-400 mb-1">{card.label}</p>
                    <p className="text-white font-bold text-lg">{card.value.toLocaleString()}</p>
                  </div>
                ))}
              </div>

              {/* 포맷별 대회 현황 */}
              {data.formatStats.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-300 mb-2">포맷별 대회 현황</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-500 text-xs border-b border-gray-700">
                        <th className="text-left py-1.5 px-2">포맷</th>
                        <th className="text-center py-1.5 px-2 w-[80px]">대회수</th>
                        <th className="text-center py-1.5 px-2 w-[100px]">평균 참가자</th>
                        <th className="text-center py-1.5 px-2 w-[80px]">총 매치</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.formatStats.map(fs => (
                        <tr key={fs.format} className="border-b border-gray-700/50 text-gray-300">
                          <td className="py-1.5 px-2">{FORMAT_LABEL[fs.format as keyof typeof FORMAT_LABEL] ?? fs.format}</td>
                          <td className="text-center py-1.5 px-2">{fs.run_count}</td>
                          <td className="text-center py-1.5 px-2">{Math.round(fs.avg_entries)}</td>
                          <td className="text-center py-1.5 px-2">{fs.total_matches}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 우승 랭킹 Top 10 */}
              {data.winRanking.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-300 mb-2">우승 랭킹 Top 10</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-500 text-xs border-b border-gray-700">
                        <th className="text-center py-1.5 px-2 w-[40px]">#</th>
                        <th className="text-left py-1.5 px-2">이름</th>
                        <th className="text-center py-1.5 px-2 w-[80px]">우승</th>
                        <th className="text-center py-1.5 px-2 w-[80px]">참가</th>
                        <th className="text-center py-1.5 px-2 w-[80px]">우승률</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.winRanking.map((row, i) => (
                        <tr key={row.id} className="border-b border-gray-700/50 text-gray-300 hover:bg-gray-700/30">
                          <td className="text-center py-1.5 px-2 text-gray-500">{i + 1}</td>
                          <td className="py-1.5 px-2">
                            <div className="flex items-center gap-2">
                              <ImagePreview path={row.img} alt={row.name} className="w-6 h-6 rounded shrink-0" />
                              <span className="truncate">{row.name}</span>
                            </div>
                          </td>
                          <td className="text-center py-1.5 px-2 text-yellow-400 font-medium">{row.win_count}</td>
                          <td className="text-center py-1.5 px-2">{row.entry_count}</td>
                          <td className="text-center py-1.5 px-2">{row.entry_count > 0 ? Math.round(row.win_count / row.entry_count * 100) : 0}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 대회 히스토리 */}
              {data.history.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-300 mb-2">대회 히스토리</h3>
                  <div className="max-h-[400px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-gray-800">
                        <tr className="text-gray-500 text-xs border-b border-gray-700">
                          <th className="text-left py-1.5 px-2 w-[100px]">날짜</th>
                          <th className="text-left py-1.5 px-2">대회명</th>
                          <th className="text-center py-1.5 px-2 w-[80px]">포맷</th>
                          <th className="text-center py-1.5 px-2 w-[70px]">참가자</th>
                          <th className="text-left py-1.5 px-2">우승자</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.history.map(row => (
                          <tr key={row.run_id} className="border-b border-gray-700/50 text-gray-300 hover:bg-gray-700/30">
                            <td className="py-1.5 px-2 text-gray-500 text-xs">{row.completed_at?.slice(0, 10)}</td>
                            <td className="py-1.5 px-2 truncate">{row.tournament_name}</td>
                            <td className="text-center py-1.5 px-2 text-xs">{FORMAT_LABEL[row.format as keyof typeof FORMAT_LABEL] ?? row.format}</td>
                            <td className="text-center py-1.5 px-2">{row.entry_count}</td>
                            <td className="py-1.5 px-2">
                              {row.winner_name ? (
                                <div className="flex items-center gap-2">
                                  <ImagePreview path={row.winner_img ?? null} alt={row.winner_name} className="w-5 h-5 rounded shrink-0" />
                                  <span className="truncate">{row.winner_name}</span>
                                </div>
                              ) : <span className="text-gray-600">-</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {data.summary.total_runs === 0 && (
                <p className="text-gray-500 text-center py-8">해당 시즌에 완료된 대회가 없습니다</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
