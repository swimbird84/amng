import React, { useState, useEffect } from 'react'
import { masterRankingApi } from '../../api'
import { DIV_LABEL, DIV_COLOR, DIV_TEXT_COLOR } from './cupConstants'
import { pushEscHandler, popEscHandler } from '../../escManager'

type LabelRow = {
  id: number; name: string; color: string | null
  maker_name: string | null; maker_color: string | null
  work_count: number; avg_rank: number; best_rank: number; worst_rank: number
}
type MakerRow = {
  id: number; name: string; color: string | null
  work_count: number; label_count: number; avg_rank: number; best_rank: number; worst_rank: number
}
type LabelDivData = { division: number; labels: LabelRow[] }
type MakerDivData = { division: number; makers: MakerRow[] }

export default function WorkLabelDistModal({
  onClose,
}: {
  onClose: () => void
}) {
  const [mode, setMode] = useState<'label' | 'maker'>(() =>
    (localStorage.getItem('labelDist:mode') as 'label' | 'maker') || 'label'
  )
  const [labelData, setLabelData] = useState<{ divisions: LabelDivData[]; allLabels: LabelRow[] } | null>(null)
  const [makerData, setMakerData] = useState<{ divisions: MakerDivData[]; allMakers: MakerRow[] } | null>(null)
  const [tab, setTab] = useState<'division' | 'all'>(() =>
    (localStorage.getItem('labelDist:tab') as 'division' | 'all') || 'division'
  )
  const [topN, setTopN] = useState(() => {
    const saved = parseInt(localStorage.getItem('labelDist:topN') ?? '', 10)
    return [0, 5, 10, 20].includes(saved) ? saved : 10
  })
  const [tableSortCol, setTableSortCol] = useState<'work_count' | 'avg_rank' | 'best_rank' | 'label_count'>('work_count')
  const [tableSortDir, setTableSortDir] = useState<'asc' | 'desc'>('desc')
  const [tableSearch, setTableSearch] = useState('')

  useEffect(() => {
    masterRankingApi.workLabelDistribution().then(setLabelData)
    masterRankingApi.workMakerDistribution().then(setMakerData)
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

  const data = mode === 'label' ? labelData : makerData
  const isLoading = data === null
  const isEmpty = data !== null && (mode === 'label' ? (data as any).allLabels.length === 0 : (data as any).allMakers.length === 0)

  const allItems: LabelRow[] | MakerRow[] = mode === 'label'
    ? (labelData?.allLabels ?? [])
    : (makerData?.allMakers ?? [])

  const divItems = mode === 'label'
    ? (labelData?.divisions ?? [])
    : (makerData?.divisions ?? [])

  const sortedAll = [...allItems]
    .filter((item: any) => {
      if (!tableSearch) return true
      if (item.name.includes(tableSearch)) return true
      if ('maker_name' in item && item.maker_name?.includes(tableSearch)) return true
      return false
    })
    .sort((a: any, b: any) => {
      const col = tableSortCol === 'label_count' && mode === 'label' ? 'work_count' : tableSortCol
      const dir = tableSortDir === 'asc' ? 1 : -1
      return ((a[col] ?? 0) - (b[col] ?? 0)) * dir || a.name.localeCompare(b.name)
    })

  const ColorBadge = ({ name, color }: { name: string; color: string | null }) => (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-xs font-medium border"
      style={color ? { borderColor: color, color, backgroundColor: `${color}15` } : undefined}
    >
      {name}
    </span>
  )

  const modeLabel = mode === 'label' ? '레이블' : '제작사'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg w-[90vw] max-w-[1100px] h-[90vh] flex flex-col relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl leading-none z-10">✕</button>

        {/* 헤더 + 토글 + 탭 */}
        <div className="shrink-0 px-6 pt-5 pb-0 border-b border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-lg font-bold text-white">작품 랭킹 {modeLabel} 분포</h2>
            <div className="flex items-center gap-1 bg-gray-900 rounded-lg px-1 py-0.5">
              {(['label', 'maker'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => { setMode(m); localStorage.setItem('labelDist:mode', m); setTableSearch('') }}
                  className={`px-3 py-1 rounded text-xs font-medium transition ${mode === m ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                >
                  {m === 'label' ? '레이블' : '제작사'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center">
            <div className="flex">
              {([['division', `부별 주요 ${modeLabel}`], ['all', `전체 ${modeLabel} 통계`]] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => { setTab(key as 'division' | 'all'); localStorage.setItem('labelDist:tab', key) }}
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
                  <span className="text-xs text-gray-500">{sortedAll.length}개</span>
                  <input
                    className="bg-gray-700 text-white text-xs rounded px-2.5 py-1 border border-gray-600 outline-none placeholder-gray-500 w-40"
                    placeholder={`${modeLabel} 검색`}
                    value={tableSearch}
                    onChange={e => setTableSearch(e.target.value)}
                  />
                </>
              )}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">로딩 중...</div>
        ) : isEmpty ? (
          <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">{modeLabel} 분포 데이터가 없습니다.</div>
        ) : (
          <div className={`flex-1 overflow-y-auto px-6 py-4 ${tab === 'all' ? 'flex flex-col' : ''}`}>
            {/* 부별 주요 탭 */}
            {tab === 'division' && (
              <div className="space-y-3">
                {divItems.map((divData: any) => {
                  const division = divData.division
                  const items: any[] = divData.labels ?? divData.makers
                  const shown = topN > 0 ? items.slice(0, topN) : items
                  return (
                    <div key={division} className="bg-gray-900/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${DIV_COLOR[division] ?? ''}`}>
                          {DIV_LABEL[division] ?? `${division}부`}
                        </span>
                        <span className="text-xs text-gray-500">{items.length}개 {modeLabel} 출현</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {shown.map((item: any, idx: number) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-1.5 bg-gray-800 rounded-lg px-2.5 py-1.5"
                            title={`작품 ${item.work_count}개 / 평균 ${item.avg_rank}위 / 최고 ${item.best_rank}위${item.label_count ? ` / ${item.label_count}개 레이블` : ''}`}
                          >
                            <span className="text-[10px] text-gray-500 font-medium">{idx + 1}</span>
                            <ColorBadge name={item.name} color={item.color} />
                            <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                              <span className={DIV_TEXT_COLOR[division] ?? 'text-gray-400'}>{item.work_count}작</span>
                              <span>avg {item.avg_rank}</span>
                              {mode === 'maker' && item.label_count > 0 && (
                                <span className="text-gray-600">{item.label_count}레이블</span>
                              )}
                            </div>
                            {mode === 'label' && item.maker_name && (
                              <span
                                className="text-[10px] opacity-60"
                                style={item.maker_color ? { color: item.maker_color } : undefined}
                              >
                                {item.maker_name}
                              </span>
                            )}
                          </div>
                        ))}
                        {topN > 0 && items.length > topN && (
                          <span className="flex items-center text-xs text-gray-600 px-2">+{items.length - topN}개</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* 전체 통계 탭 */}
            {tab === 'all' && (
              <div className="bg-gray-900/50 rounded-lg flex-1 overflow-y-auto min-h-0">
                <table className="w-full table-fixed text-xs">
                  <colgroup>
                    <col style={{ width: '2.5rem' }} />
                    <col />
                    {mode === 'label' && <col style={{ width: '9rem' }} />}
                    {mode === 'maker' && <col style={{ width: '5rem' }} />}
                    <col style={{ width: '5rem' }} />
                    <col style={{ width: '5rem' }} />
                    <col style={{ width: '5rem' }} />
                    <col style={{ width: '7rem' }} />
                  </colgroup>
                  <thead className="sticky top-0 bg-gray-900 z-10">
                    <tr className="border-b border-gray-700 text-gray-400">
                      <th className="px-2 py-2 text-center">#</th>
                      <th className="px-2 py-2 text-left">{modeLabel}</th>
                      {mode === 'label' && <th className="px-2 py-2 text-left">제작사</th>}
                      {mode === 'maker' && (
                        <th className="px-2 py-2 text-right cursor-pointer hover:text-white select-none" onClick={() => handleTableSort('label_count')}>
                          <span className="flex items-center justify-end gap-0.5">레이블 <SortIcon col="label_count" /></span>
                        </th>
                      )}
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
                    {sortedAll.map((item: any, idx: number) => (
                      <tr
                        key={item.id}
                        className="border-b border-gray-800/50 hover:bg-gray-800/40 transition"
                      >
                        <td className="px-2 py-1.5 text-center text-gray-600">{idx + 1}</td>
                        <td className="px-2 py-1.5">
                          <ColorBadge name={item.name} color={item.color} />
                        </td>
                        {mode === 'label' && (
                          <td className="px-2 py-1.5 truncate">
                            {item.maker_name ? (
                              <span className="text-xs" style={item.maker_color ? { color: item.maker_color } : undefined}>
                                {item.maker_name}
                              </span>
                            ) : (
                              <span className="text-gray-600 text-xs">-</span>
                            )}
                          </td>
                        )}
                        {mode === 'maker' && (
                          <td className="px-2 py-1.5 text-right text-gray-400">{item.label_count}</td>
                        )}
                        <td className="px-2 py-1.5 text-right">
                          <span className="text-blue-400 font-medium">{item.work_count}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right text-gray-300">{item.avg_rank}</td>
                        <td className="px-2 py-1.5 text-right">
                          <span className="text-yellow-400">{item.best_rank}위</span>
                        </td>
                        <td className="px-2 py-1.5 text-center text-gray-500 text-[11px]">
                          {item.best_rank === item.worst_rank
                            ? `${item.best_rank}위`
                            : `${item.best_rank} ~ ${item.worst_rank}위`
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
