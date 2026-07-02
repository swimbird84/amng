import React, { useState, useEffect } from 'react'
import { masterRankingApi } from '../../api'
import ImagePreview from '../ImagePreview'
import { DIV_LABEL, DIV_COLOR, DIV_TEXT_COLOR } from './cupConstants'
import { pushEscHandler, popEscHandler } from '../../escManager'

type ActorRow = {
  id: number; name: string; photo_path: string | null
  work_count: number; avg_rank: number; best_rank: number; worst_rank: number; actor_rank: number | null
}
type DivData = { division: number; actors: ActorRow[] }

export default function WorkActorDistModal({
  onClose,
  onNavigateToActor,
}: {
  onClose: () => void
  onNavigateToActor: (id: number) => void
}) {
  const [data, setData] = useState<{ divisions: DivData[]; allActors: ActorRow[] } | null>(null)
  const [tab, setTab] = useState<'division' | 'all'>(() =>
    (localStorage.getItem('actorDist:tab') as 'division' | 'all') || 'division'
  )
  const [topN, setTopN] = useState(() => {
    const saved = parseInt(localStorage.getItem('actorDist:topN') ?? '', 10)
    return [0, 5, 10, 20].includes(saved) ? saved : 10
  })
  const [tableSortCol, setTableSortCol] = useState<'work_count' | 'avg_rank' | 'best_rank' | 'actor_rank'>('work_count')
  const [tableSortDir, setTableSortDir] = useState<'asc' | 'desc'>('desc')
  const [tableSearch, setTableSearch] = useState('')

  useEffect(() => {
    masterRankingApi.workActorDistribution().then(setData)
  }, [])

  useEffect(() => {
    const handler = () => onClose()
    pushEscHandler(handler)
    return () => popEscHandler(handler)
  }, [onClose])

  const handleTableSort = (col: typeof tableSortCol) => {
    if (tableSortCol === col) setTableSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setTableSortCol(col); setTableSortDir(col === 'avg_rank' || col === 'best_rank' || col === 'actor_rank' ? 'asc' : 'desc') }
  }

  const SortIcon = ({ col }: { col: typeof tableSortCol }) =>
    tableSortCol === col ? <span className="text-[9px]">{tableSortDir === 'desc' ? '▼' : '▲'}</span> : <span className="text-[9px] text-gray-700">▼</span>

  const sortedAllActors = data ? [...data.allActors]
    .filter(a => !tableSearch || a.name.includes(tableSearch))
    .sort((a, b) => {
      const dir = tableSortDir === 'asc' ? 1 : -1
      const av = a[tableSortCol] ?? 99999
      const bv = b[tableSortCol] ?? 99999
      return (av - bv) * dir || a.name.localeCompare(b.name)
    }) : []

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg w-[90vw] max-w-[1100px] h-[90vh] flex flex-col relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl leading-none z-10">✕</button>

        {/* 헤더 + 탭 */}
        <div className="shrink-0 px-6 pt-5 pb-0 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white mb-3">작품 랭킹 배우 분포</h2>
          <div className="flex items-center">
            <div className="flex">
              {([['division', '부별 주요 배우'], ['all', '전체 배우 통계']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => { setTab(key); localStorage.setItem('actorDist:tab', key) }}
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
                  onChange={e => { const v = Number(e.target.value); setTopN(v); localStorage.setItem('actorDist:topN', String(v)) }}
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
                  <span className="text-xs text-gray-500">{sortedAllActors.length}명</span>
                  <input
                    className="bg-gray-700 text-white text-xs rounded px-2.5 py-1 border border-gray-600 outline-none placeholder-gray-500 w-40"
                    placeholder="배우명 검색"
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
        ) : data.allActors.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">배우 분포 데이터가 없습니다.</div>
        ) : (
          <div className={`flex-1 overflow-y-auto px-6 py-4 ${tab === 'all' ? 'flex flex-col' : ''}`}>
            {/* 부별 주요 배우 탭 */}
            {tab === 'division' && (
              <div className="space-y-3">
                {data.divisions.map(({ division, actors }) => {
                  const shown = topN > 0 ? actors.slice(0, topN) : actors
                  return (
                    <div key={division} className="bg-gray-900/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${DIV_COLOR[division] ?? ''}`}>
                          {DIV_LABEL[division] ?? `${division}부`}
                        </span>
                        <span className="text-xs text-gray-500">{actors.length}명의 배우 출현</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {shown.map((actor, idx) => (
                          <button
                            key={actor.id}
                            onClick={() => onNavigateToActor(actor.id)}
                            className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg pl-1 pr-2.5 py-1 transition group"
                            title={`작품 ${actor.work_count}개 / 평균 ${actor.avg_rank}위 / 최고 ${actor.best_rank}위`}
                          >
                            <div className="w-7 h-7 rounded overflow-hidden shrink-0 bg-gray-700">
                              {actor.photo_path ? (
                                <ImagePreview path={actor.photo_path} alt={actor.name} className="w-full h-full object-cover" objectPosition="center 10%" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-600 text-[10px]">?</div>
                              )}
                            </div>
                            <div className="text-left min-w-0">
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-gray-500 font-medium">{idx + 1}</span>
                                <span className="text-xs text-white group-hover:underline truncate">{actor.name}</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                                <span className={DIV_TEXT_COLOR[division] ?? 'text-gray-400'}>{actor.work_count}작</span>
                                <span>avg {actor.avg_rank}</span>
                              </div>
                            </div>
                          </button>
                        ))}
                        {topN > 0 && actors.length > topN && (
                          <span className="flex items-center text-xs text-gray-600 px-2">+{actors.length - topN}명</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* 전체 배우 통계 탭 */}
            {tab === 'all' && (
              <div className="bg-gray-900/50 rounded-lg flex-1 overflow-y-auto min-h-0">
                <table className="w-full table-fixed text-xs">
                  <colgroup>
                    <col style={{ width: '2.5rem' }} />
                    <col style={{ width: '3rem' }} />
                    <col />
                    <col style={{ width: '5rem' }} />
                    <col style={{ width: '5rem' }} />
                    <col style={{ width: '5rem' }} />
                    <col style={{ width: '5rem' }} />
                    <col style={{ width: '7rem' }} />
                  </colgroup>
                  <thead className="sticky top-0 bg-gray-900 z-10">
                    <tr className="border-b border-gray-700 text-gray-400">
                      <th className="px-2 py-2 text-center">#</th>
                      <th className="px-2 py-2 text-center"></th>
                      <th className="px-2 py-2 text-left">배우</th>
                      <th className="px-2 py-2 text-right cursor-pointer hover:text-white select-none" onClick={() => handleTableSort('work_count')}>
                        <span className="flex items-center justify-end gap-0.5">작품수 <SortIcon col="work_count" /></span>
                      </th>
                      <th className="px-2 py-2 text-right cursor-pointer hover:text-white select-none" onClick={() => handleTableSort('avg_rank')}>
                        <span className="flex items-center justify-end gap-0.5">평균순위 <SortIcon col="avg_rank" /></span>
                      </th>
                      <th className="px-2 py-2 text-right cursor-pointer hover:text-white select-none" onClick={() => handleTableSort('best_rank')}>
                        <span className="flex items-center justify-end gap-0.5">최고순위 <SortIcon col="best_rank" /></span>
                      </th>
                      <th className="px-2 py-2 text-right cursor-pointer hover:text-white select-none" onClick={() => handleTableSort('actor_rank')}>
                        <span className="flex items-center justify-end gap-0.5">배우랭킹 <SortIcon col="actor_rank" /></span>
                      </th>
                      <th className="px-2 py-2 text-center">순위 범위</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAllActors.map((actor, idx) => (
                      <tr
                        key={actor.id}
                        className="border-b border-gray-800/50 hover:bg-gray-800/40 transition cursor-pointer"
                        onClick={() => onNavigateToActor(actor.id)}
                      >
                        <td className="px-2 py-1.5 text-center text-gray-600">{idx + 1}</td>
                        <td className="p-0 h-9">
                          {actor.photo_path ? (
                            <ImagePreview path={actor.photo_path} alt={actor.name} className="w-full h-9 object-cover" objectPosition="center 10%" />
                          ) : (
                            <div className="w-full h-9 bg-gray-700 flex items-center justify-center text-gray-600">?</div>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-white truncate hover:underline">{actor.name}</td>
                        <td className="px-2 py-1.5 text-right">
                          <span className="text-blue-400 font-medium">{actor.work_count}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right text-gray-300">{actor.avg_rank}</td>
                        <td className="px-2 py-1.5 text-right">
                          <span className="text-yellow-400">{actor.best_rank}위</span>
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {actor.actor_rank != null ? (
                            <span className="text-gray-300">{actor.actor_rank}위</span>
                          ) : (
                            <span className="text-gray-600">-</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-center text-gray-500 text-[11px]">
                          {actor.best_rank === actor.worst_rank
                            ? `${actor.best_rank}위`
                            : `${actor.best_rank} ~ ${actor.worst_rank}위`
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
