import React, { useState, useEffect } from 'react'
import { masterRankingApi } from '../../api'
import { DIV_LABEL, DIV_COLOR, DIV_TEXT_COLOR } from './cupConstants'
import { pushEscHandler, popEscHandler } from '../../escManager'

type LabelRow = {
  id: number; name: string; color: string | null
  maker_name: string | null; maker_color: string | null
  work_count: number; avg_rank: number; best_rank: number; worst_rank: number
}
type DivData = { division: number; labels: LabelRow[] }

export default function WorkLabelDistModal({
  onClose,
}: {
  onClose: () => void
}) {
  const [data, setData] = useState<{ divisions: DivData[]; allLabels: LabelRow[] } | null>(null)
  const [tab, setTab] = useState<'division' | 'all'>(() =>
    (localStorage.getItem('labelDist:tab') as 'division' | 'all') || 'division'
  )
  const [topN, setTopN] = useState(() => {
    const saved = parseInt(localStorage.getItem('labelDist:topN') ?? '', 10)
    return [0, 5, 10, 20].includes(saved) ? saved : 10
  })
  const [tableSortCol, setTableSortCol] = useState<'work_count' | 'avg_rank' | 'best_rank'>('work_count')
  const [tableSortDir, setTableSortDir] = useState<'asc' | 'desc'>('desc')
  const [tableSearch, setTableSearch] = useState('')

  useEffect(() => {
    masterRankingApi.workLabelDistribution().then(setData)
  }, [])

  useEffect(() => {
    const handler = () => onClose()
    pushEscHandler(handler)
    return () => popEscHandler(handler)
  }, [onClose])

  const handleTableSort = (col: typeof tableSortCol) => {
    if (tableSortCol === col) setTableSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setTableSortCol(col); setTableSortDir(col === 'avg_rank' || col === 'best_rank' ? 'asc' : 'desc') }
  }

  const SortIcon = ({ col }: { col: typeof tableSortCol }) =>
    tableSortCol === col ? <span className="text-[9px]">{tableSortDir === 'desc' ? '▼' : '▲'}</span> : <span className="text-[9px] text-gray-700">▼</span>

  const sortedAllLabels = data ? [...data.allLabels]
    .filter(l => !tableSearch || l.name.includes(tableSearch) || (l.maker_name && l.maker_name.includes(tableSearch)))
    .sort((a, b) => {
      const dir = tableSortDir === 'asc' ? 1 : -1
      return (a[tableSortCol] - b[tableSortCol]) * dir || a.name.localeCompare(b.name)
    }) : []

  const LabelBadge = ({ label, showColor = true }: { label: LabelRow; showColor?: boolean }) => (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-xs font-medium border"
      style={showColor && label.color ? { borderColor: label.color, color: label.color, backgroundColor: `${label.color}15` } : undefined}
    >
      {label.name}
    </span>
  )

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg w-[90vw] max-w-[1100px] h-[90vh] flex flex-col relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl leading-none z-10">✕</button>

        {/* 헤더 + 탭 */}
        <div className="shrink-0 px-6 pt-5 pb-0 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white mb-3">작품 랭킹 레이블 분포</h2>
          <div className="flex items-center">
            <div className="flex">
              {([['division', '부별 주요 레이블'], ['all', '전체 레이블 통계']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => { setTab(key); localStorage.setItem('labelDist:tab', key) }}
                  className={`px-5 py-2.5 text-sm font-medium border-b-2 transition ${tab === key ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {tab === 'division' && (
                <select
                  value={topN}
                  onChange={e => { const v = Number(e.target.value); setTopN(v); localStorage.setItem('labelDist:topN', String(v)) }}
                  className="bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600"
                >
                  <option value={5}>TOP 5</option>
                  <option value={10}>TOP 10</option>
                  <option value={20}>TOP 20</option>
                  <option value={0}>전체</option>
                </select>
              )}
              {tab === 'all' && (
                <>
                  <span className="text-xs text-gray-500">{sortedAllLabels.length}개</span>
                  <input
                    className="bg-gray-700 text-white text-xs rounded px-2.5 py-1 border border-gray-600 outline-none placeholder-gray-500 w-40"
                    placeholder="레이블/제작사 검색"
                    value={tableSearch}
                    onChange={e => setTableSearch(e.target.value)}
                  />
                </>
              )}
            </div>
          </div>
        </div>

        {!data ? (
          <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">로딩 중...</div>
        ) : data.allLabels.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">레이블 분포 데이터가 없습니다.</div>
        ) : (
          <div className={`flex-1 overflow-y-auto px-6 py-4 ${tab === 'all' ? 'flex flex-col' : ''}`}>
            {/* 부별 주요 레이블 탭 */}
            {tab === 'division' && (
              <div className="space-y-3">
                {data.divisions.map(({ division, labels }) => {
                  const shown = topN > 0 ? labels.slice(0, topN) : labels
                  return (
                    <div key={division} className="bg-gray-900/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${DIV_COLOR[division] ?? ''}`}>
                          {DIV_LABEL[division] ?? `${division}부`}
                        </span>
                        <span className="text-xs text-gray-500">{labels.length}개 레이블 출현</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {shown.map((label, idx) => (
                          <div
                            key={label.id}
                            className="flex items-center gap-1.5 bg-gray-800 rounded-lg px-2.5 py-1.5"
                            title={`작품 ${label.work_count}개 / 평균 ${label.avg_rank}위 / 최고 ${label.best_rank}위`}
                          >
                            <span className="text-[10px] text-gray-500 font-medium">{idx + 1}</span>
                            <LabelBadge label={label} />
                            <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                              <span className={DIV_TEXT_COLOR[division] ?? 'text-gray-400'}>{label.work_count}작</span>
                              <span>avg {label.avg_rank}</span>
                            </div>
                            {label.maker_name && (
                              <span
                                className="text-[10px] opacity-60"
                                style={label.maker_color ? { color: label.maker_color } : undefined}
                              >
                                {label.maker_name}
                              </span>
                            )}
                          </div>
                        ))}
                        {topN > 0 && labels.length > topN && (
                          <span className="flex items-center text-xs text-gray-600 px-2">+{labels.length - topN}개</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* 전체 레이블 통계 탭 */}
            {tab === 'all' && (
              <div className="bg-gray-900/50 rounded-lg flex-1 overflow-y-auto min-h-0">
                <table className="w-full table-fixed text-xs">
                  <colgroup>
                    <col style={{ width: '2.5rem' }} />
                    <col />
                    <col style={{ width: '7rem' }} />
                    <col style={{ width: '5rem' }} />
                    <col style={{ width: '5rem' }} />
                    <col style={{ width: '5rem' }} />
                    <col style={{ width: '7rem' }} />
                  </colgroup>
                  <thead className="sticky top-0 bg-gray-900 z-10">
                    <tr className="border-b border-gray-700 text-gray-400">
                      <th className="px-2 py-2 text-center">#</th>
                      <th className="px-2 py-2 text-left">레이블</th>
                      <th className="px-2 py-2 text-left">제작사</th>
                      <th className="px-2 py-2 text-right cursor-pointer hover:text-white select-none" onClick={() => handleTableSort('work_count')}>
                        <span className="flex items-center justify-end gap-0.5">작품수 <SortIcon col="work_count" /></span>
                      </th>
                      <th className="px-2 py-2 text-right cursor-pointer hover:text-white select-none" onClick={() => handleTableSort('avg_rank')}>
                        <span className="flex items-center justify-end gap-0.5">평균순위 <SortIcon col="avg_rank" /></span>
                      </th>
                      <th className="px-2 py-2 text-right cursor-pointer hover:text-white select-none" onClick={() => handleTableSort('best_rank')}>
                        <span className="flex items-center justify-end gap-0.5">최고순위 <SortIcon col="best_rank" /></span>
                      </th>
                      <th className="px-2 py-2 text-center">순위 범위</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAllLabels.map((label, idx) => (
                      <tr
                        key={label.id}
                        className="border-b border-gray-800/50 hover:bg-gray-800/40 transition"
                      >
                        <td className="px-2 py-1.5 text-center text-gray-600">{idx + 1}</td>
                        <td className="px-2 py-1.5">
                          <LabelBadge label={label} />
                        </td>
                        <td className="px-2 py-1.5 truncate">
                          {label.maker_name ? (
                            <span className="text-xs" style={label.maker_color ? { color: label.maker_color } : undefined}>
                              {label.maker_name}
                            </span>
                          ) : (
                            <span className="text-gray-600 text-xs">-</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <span className="text-blue-400 font-medium">{label.work_count}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right text-gray-300">{label.avg_rank}</td>
                        <td className="px-2 py-1.5 text-right">
                          <span className="text-yellow-400">{label.best_rank}위</span>
                        </td>
                        <td className="px-2 py-1.5 text-center text-gray-500 text-[11px]">
                          {label.best_rank === label.worst_rank
                            ? `${label.best_rank}위`
                            : `${label.best_rank} ~ ${label.worst_rank}위`
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
