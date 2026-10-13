import React, { useState, useEffect, useMemo } from 'react'
import { tierApi } from '../../api'
import ImagePreview from '../ImagePreview'
import { DIV_LABEL, DIV_COLOR, DIV_TEXT_COLOR, getDivision, DIV_BOUNDARIES, DIV_BOUNDARIES_ACTOR } from './cupConstants'
import { pushEscHandler, popEscHandler } from '../../escManager'

type CrossItem = {
  id: number; name: string; photo_path: string | null
  cup_rank: number; master_run_count: number
  tier_level_id: number | null; tier_name: string | null; tier_color: string | null; tier_level_order: number | null
}
type TierLevel = { id: number; name: string; color: string; sort_order: number }

export default function LeagueTierModal({
  onClose,
  onNavigateToActor,
  onNavigateToWork,
}: {
  onClose: () => void
  onNavigateToActor: (id: number) => void
  onNavigateToWork: (id: number) => void
}) {
  const [type, setType] = useState<'actor' | 'work'>(() =>
    (localStorage.getItem('leagueTier:type') as 'actor' | 'work') || 'actor'
  )
  const [tab, setTab] = useState<'summary' | 'dist' | 'mismatch'>(() =>
    (localStorage.getItem('leagueTier:tab') as 'summary' | 'dist' | 'mismatch') || 'summary'
  )
  const [items, setItems] = useState<CrossItem[]>([])
  const [tierLevels, setTierLevels] = useState<TierLevel[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    tierApi.leagueTierCross(type).then(data => {
      setItems(data.items)
      setTierLevels(data.tierLevels)
      setLoading(false)
    })
  }, [type])

  useEffect(() => { localStorage.setItem('leagueTier:type', type) }, [type])
  useEffect(() => { localStorage.setItem('leagueTier:tab', tab) }, [tab])

  useEffect(() => {
    const handler = () => onClose()
    pushEscHandler(handler)
    return () => popEscHandler(handler)
  }, [onClose])

  const divBounds = type === 'actor' ? DIV_BOUNDARIES_ACTOR : DIV_BOUNDARIES

  // 리그 있는 아이템만 (master_run_count > 0)
  const rankedItems = useMemo(() => items.filter(i => i.master_run_count > 0), [items])

  // 리그+티어 둘 다 있는 아이템
  const bothItems = useMemo(() => rankedItems.filter(i => i.tier_level_id != null), [rankedItems])

  // ── 요약 탭 데이터 ──
  const tierSummary = useMemo(() => {
    return tierLevels.map(lv => {
      const lvItems = bothItems.filter(i => i.tier_level_id === lv.id)
      if (lvItems.length === 0) return { ...lv, count: 0, avgRank: null, bestRank: null, worstRank: null }
      const ranks = lvItems.map(i => i.cup_rank)
      return {
        ...lv, count: lvItems.length,
        avgRank: Math.round(ranks.reduce((a, b) => a + b, 0) / ranks.length * 10) / 10,
        bestRank: Math.min(...ranks), worstRank: Math.max(...ranks),
      }
    })
  }, [tierLevels, bothItems])

  const leagueSummary = useMemo(() => {
    const divs = [1, 2, 3, 4, 5, 6]
    return divs.map(div => {
      const divItems = bothItems.filter(i => getDivision(i.cup_rank, i.master_run_count, type) === div)
      if (divItems.length === 0) return { div, count: 0, avgTierOrder: null, bestTierOrder: null, worstTierOrder: null }
      const orders = divItems.map(i => i.tier_level_order!).filter(o => o != null)
      if (orders.length === 0) return { div, count: 0, avgTierOrder: null, bestTierOrder: null, worstTierOrder: null }
      return {
        div, count: divItems.length,
        avgTierOrder: Math.round(orders.reduce((a, b) => a + b, 0) / orders.length * 10) / 10,
        bestTierOrder: Math.min(...orders), worstTierOrder: Math.max(...orders),
      }
    }).filter(d => d.count > 0)
  }, [bothItems, type])

  const tierByOrder = (order: number) => tierLevels.find(lv => lv.sort_order === order)

  // ── 분포 탭 데이터 ──
  const leagueTierDist = useMemo(() => {
    const divs = [1, 2, 3, 4, 5, 6]
    return divs.map(div => {
      const divItems = bothItems.filter(i => getDivision(i.cup_rank, i.master_run_count, type) === div)
      const tiers = tierLevels.map(lv => ({ ...lv, count: divItems.filter(i => i.tier_level_id === lv.id).length }))
      return { div, total: divItems.length, tiers }
    }).filter(d => d.total > 0)
  }, [bothItems, tierLevels, type])

  const tierLeagueDist = useMemo(() => {
    return tierLevels.map(lv => {
      const lvItems = bothItems.filter(i => i.tier_level_id === lv.id)
      const divs = [1, 2, 3, 4, 5, 6].map(div => ({
        div, count: lvItems.filter(i => getDivision(i.cup_rank, i.master_run_count, type) === div).length,
      }))
      return { ...lv, total: lvItems.length, divs }
    }).filter(d => d.total > 0)
  }, [bothItems, tierLevels, type])

  // ── 불일치 탭 데이터 ──
  const mismatchItems = useMemo(() => {
    if (tierLevels.length === 0) return []
    const maxTierOrder = Math.max(...tierLevels.map(l => l.sort_order), 0)
    const maxDiv = 6
    return bothItems.map(item => {
      const div = getDivision(item.cup_rank, item.master_run_count, type)
      const tierOrder = item.tier_level_order!
      // 정규화: 0~1 범위로 변환
      const tierNorm = maxTierOrder > 0 ? tierOrder / maxTierOrder : 0
      const divNorm = maxDiv > 1 ? (div - 1) / (maxDiv - 1) : 0
      const gap = divNorm - tierNorm // 양수 = 과소평가(리그 낮은데 티어 높음), 음수 = 과대평가
      return { ...item, div, gap: Math.round(gap * 100) / 100 }
    }).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
  }, [bothItems, tierLevels, type])

  const handleClick = (id: number) => {
    if (type === 'actor') onNavigateToActor(id)
    else onNavigateToWork(id)
  }

  const StackBar = ({ segments, total }: { segments: { label: string; color: string; count: number }[]; total: number }) => (
    <div className="flex h-6 rounded overflow-hidden bg-gray-900">
      {segments.filter(s => s.count > 0).map((s, i) => (
        <div
          key={i}
          className="h-full flex items-center justify-center text-[10px] text-white font-medium overflow-hidden"
          style={{ width: `${s.count / total * 100}%`, backgroundColor: s.color, minWidth: s.count > 0 ? 16 : 0 }}
          title={`${s.label}: ${s.count}`}
        >
          {s.count >= 2 ? s.count : ''}
        </div>
      ))}
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg w-[90vw] max-w-[1100px] h-[90vh] flex flex-col relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl leading-none z-10">✕</button>

        {/* 헤더 */}
        <div className="shrink-0 px-6 pt-5 pb-0 border-b border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-lg font-bold text-white">리그 ⇄ 티어</h2>
            <div className="flex items-center gap-1 bg-gray-900 rounded-lg px-1 py-0.5">
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
            <span className="text-xs text-gray-500">
              리그+티어: {bothItems.length}{type === 'actor' ? '명' : '개'}
            </span>
          </div>
          <div className="flex">
            {([['summary', '요약'], ['dist', '분포'], ['mismatch', '불일치']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-5 py-2.5 text-sm font-medium border-b-2 transition ${tab === key ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">로딩 중...</div>
        ) : bothItems.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">리그와 티어가 모두 배치된 항목이 없습니다.</div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-4">

            {/* ── 요약 탭 ── */}
            {tab === 'summary' && (
              <div className="space-y-6">
                {/* 티어별 요약 */}
                <div>
                  <h3 className="text-sm font-bold text-gray-300 mb-2">티어별 리그 순위 요약</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-700 text-gray-400 text-xs">
                        <th className="px-3 py-2 text-left">티어</th>
                        <th className="px-3 py-2 text-right">인원</th>
                        <th className="px-3 py-2 text-right">평균 순위</th>
                        <th className="px-3 py-2 text-right">최고 순위</th>
                        <th className="px-3 py-2 text-right">최저 순위</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tierSummary.filter(s => s.count > 0).map(s => (
                        <tr key={s.id} className="border-b border-gray-800/50 hover:bg-gray-800/40">
                          <td className="px-3 py-2">
                            <span className="inline-block px-2 py-0.5 rounded border text-xs font-medium" style={{ backgroundColor: `${s.color}30`, color: s.color, borderColor: `${s.color}60` }}>{s.name}</span>
                          </td>
                          <td className="px-3 py-2 text-right text-white font-medium">{s.count}</td>
                          <td className="px-3 py-2 text-right text-gray-300">{s.avgRank}</td>
                          <td className="px-3 py-2 text-right text-yellow-400">{s.bestRank}위</td>
                          <td className="px-3 py-2 text-right text-gray-500">{s.worstRank}위</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 리그별 요약 */}
                <div>
                  <h3 className="text-sm font-bold text-gray-300 mb-2">리그별 티어 요약</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-700 text-gray-400 text-xs">
                        <th className="px-3 py-2 text-left">리그</th>
                        <th className="px-3 py-2 text-right">인원</th>
                        <th className="px-3 py-2 text-right">평균 티어</th>
                        <th className="px-3 py-2 text-right">최고 티어</th>
                        <th className="px-3 py-2 text-right">최저 티어</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leagueSummary.map(s => {
                        const avgTier = s.avgTierOrder != null ? tierByOrder(Math.round(s.avgTierOrder)) : null
                        const bestTier = s.bestTierOrder != null ? tierByOrder(s.bestTierOrder) : null
                        const worstTier = s.worstTierOrder != null ? tierByOrder(s.worstTierOrder) : null
                        return (
                          <tr key={s.div} className="border-b border-gray-800/50 hover:bg-gray-800/40">
                            <td className="px-3 py-2">
                              <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${DIV_COLOR[s.div] ?? ''}`}>{DIV_LABEL[s.div]}</span>
                            </td>
                            <td className="px-3 py-2 text-right text-white font-medium">{s.count}</td>
                            <td className="px-3 py-2 text-right">
                              {avgTier ? <span style={{ color: avgTier.color }}>{avgTier.name}</span> : <span className="text-gray-600">-</span>}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {bestTier ? <span style={{ color: bestTier.color }}>{bestTier.name}</span> : <span className="text-gray-600">-</span>}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {worstTier ? <span style={{ color: worstTier.color }}>{worstTier.name}</span> : <span className="text-gray-600">-</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── 분포 탭 ── */}
            {tab === 'dist' && (
              <div className="flex gap-6">
                {/* 리그별 티어 분포 */}
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-gray-300 mb-3">리그별 티어 분포</h3>
                  <div className="space-y-2">
                    {leagueTierDist.map(d => (
                      <div key={d.div}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-medium w-10 text-right ${DIV_TEXT_COLOR[d.div] ?? 'text-gray-400'}`}>{DIV_LABEL[d.div]}</span>
                          <span className="text-[10px] text-gray-500">{d.total}</span>
                        </div>
                        <StackBar
                          segments={d.tiers.map(t => ({ label: t.name, color: t.color, count: t.count }))}
                          total={d.total}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* 티어별 리그 분포 */}
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-gray-300 mb-3">티어별 리그 분포</h3>
                  <div className="space-y-2">
                    {tierLeagueDist.map(t => {
                      const DIV_BAR_COLORS: Record<number, string> = { 1: '#ca8a04', 2: '#9ca3af', 3: '#d97706', 4: '#22d3ee', 5: '#a855f7', 6: '#6b7280' }
                      return (
                        <div key={t.id}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium w-10 text-right" style={{ color: t.color }}>{t.name}</span>
                            <span className="text-[10px] text-gray-500">{t.total}</span>
                          </div>
                          <StackBar
                            segments={t.divs.map(d => ({ label: DIV_LABEL[d.div] ?? `${d.div}부`, color: DIV_BAR_COLORS[d.div] ?? '#6b7280', count: d.count }))}
                            total={t.total}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ── 불일치 탭 ── */}
            {tab === 'mismatch' && (
              <div className="bg-gray-900/50 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <colgroup>
                    <col style={{ width: '2.5rem' }} />
                    <col style={{ width: '3rem' }} />
                    <col />
                    <col style={{ width: '5rem' }} />
                    <col style={{ width: '5rem' }} />
                    <col style={{ width: '6rem' }} />
                  </colgroup>
                  <thead className="sticky top-0 bg-gray-900 z-10">
                    <tr className="border-b border-gray-700 text-gray-400 text-xs">
                      <th className="px-2 py-2 text-center">#</th>
                      <th className="px-2 py-2 text-center"></th>
                      <th className="px-2 py-2 text-left">이름</th>
                      <th className="px-2 py-2 text-center">티어</th>
                      <th className="px-2 py-2 text-center">리그</th>
                      <th className="px-2 py-2 text-center">판정</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mismatchItems.slice(0, 200).map((item, idx) => {
                      const isOver = item.gap > 0.15
                      const isUnder = item.gap < -0.15
                      return (
                        <tr
                          key={item.id}
                          className="border-b border-gray-800/50 hover:bg-gray-800/40 transition cursor-pointer"
                          onClick={() => handleClick(item.id)}
                        >
                          <td className="px-2 py-1.5 text-center text-gray-600 text-xs">{idx + 1}</td>
                          <td className="p-0 h-9">
                            {item.photo_path
                              ? <ImagePreview path={item.photo_path} alt={item.name} className="w-full h-9 object-cover" objectPosition="center 10%" />
                              : <div className="w-full h-9 bg-gray-700 flex items-center justify-center text-gray-600 text-[10px]">?</div>
                            }
                          </td>
                          <td className="px-2 py-1.5 text-white truncate hover:underline">{item.name}</td>
                          <td className="px-2 py-1.5 text-center">
                            <span className="inline-block px-1.5 py-0.5 rounded border text-xs font-medium" style={{ backgroundColor: `${item.tier_color}30`, color: item.tier_color!, borderColor: `${item.tier_color}60` }}>
                              {item.tier_name}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <span className={`inline-block px-1.5 py-0.5 rounded border text-xs font-medium ${DIV_COLOR[item.div] ?? ''}`}>
                              {DIV_LABEL[item.div]}
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {isOver
                              ? <span className="text-red-400 text-xs font-medium">▼ 과대</span>
                              : isUnder
                                ? <span className="text-green-400 text-xs font-medium">▲ 과소</span>
                                : <span className="text-gray-600 text-xs">=</span>
                            }
                          </td>
                        </tr>
                      )
                    })}
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
