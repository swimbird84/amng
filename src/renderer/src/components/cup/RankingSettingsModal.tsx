import React, { useState, useEffect } from 'react'
import { rankingSettingsApi } from '../../api'
import type { RankingSettings } from './cupTypes'
import { POOL_SIZES, RANK_THRESHOLDS, DIV_LABELS } from './cupConstants'

function NumInput({ value, onChange, min = 0, step = 1, className = '' }: {
  value: number; onChange: (v: number) => void; min?: number; step?: number; className?: string
}) {
  return (
    <input
      type="number"
      min={min}
      step={step}
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      className={`bg-gray-700 text-white text-center rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-500 w-16 ${className}`}
    />
  )
}

export default function RankingSettingsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'actor' | 'work'>('actor')
  const [settings, setSettings] = useState<Record<'actor' | 'work', RankingSettings | null>>({ actor: null, work: null })
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const load = async (t: 'actor' | 'work') => {
      const s = await rankingSettingsApi.get(t) as RankingSettings | null
      if (s) setSettings(prev => ({ ...prev, [t]: s }))
    }
    load('actor')
    load('work')
  }, [])

  const cur = settings[tab]

  const update = (fn: (s: RankingSettings) => RankingSettings) => {
    setSettings(prev => {
      const s = prev[tab]
      if (!s) return prev
      return { ...prev, [tab]: fn(s) }
    })
  }

  const setWeight = (key: 'divisionWeights' | 'opponentWeights', idx: number, val: number) => {
    update(s => {
      const arr = [...s[key]]
      arr[idx] = val
      return { ...s, [key]: arr }
    })
  }

  const setBonus = (pool: string, rank: string, val: number) => {
    update(s => ({
      ...s,
      rankBonus: {
        ...s.rankBonus,
        [pool]: { ...s.rankBonus[pool], [rank]: val }
      }
    }))
  }

  const handleSave = async () => {
    const s = settings[tab]
    if (!s) return
    setSaving(true)
    setErrorMsg('')
    try {
      await rankingSettingsApi.update(tab, s)
      onClose()
    } catch (e) {
      setErrorMsg((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const tabBtn = (t: 'actor' | 'work') => (
    <button
      onClick={() => setTab(t)}
      className={`px-4 py-1.5 rounded text-sm font-medium transition ${tab === t ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
    >
      {t === 'actor' ? '배우' : '작품'}
    </button>
  )

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0">
          <h2 className="text-white font-bold text-base">랭킹 설정</h2>
          <div className="flex gap-2">
            {tabBtn('actor')}
            {tabBtn('work')}
          </div>
        </div>

        {!cur ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">로딩 중...</div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

            {/* 기본 승점 */}
            <section>
              <h3 className="text-gray-300 font-semibold text-sm mb-3">기본 승점</h3>
              <div className="flex gap-6">
                {(['win', 'draw', 'loss'] as const).map(k => (
                  <div key={k} className="flex flex-col items-center gap-1">
                    <label className="text-xs text-gray-400">{k === 'win' ? '승' : k === 'draw' ? '무' : '패'}</label>
                    <NumInput
                      value={cur.basePoints[k]}
                      onChange={v => update(s => ({ ...s, basePoints: { ...s.basePoints, [k]: v } }))}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* 포인트 집계 범위 */}
            <section>
              <h3 className="text-gray-300 font-semibold text-sm mb-1">포인트 집계 범위 <span className="text-gray-500 font-normal text-xs">(0 = 전체 누적)</span></h3>
              <div className="flex items-center gap-3 mt-2">
                <label className="text-xs text-gray-400">최근</label>
                <NumInput
                  value={cur.recentRunLimit ?? 0}
                  onChange={v => update(s => ({ ...s, recentRunLimit: Math.max(0, Math.round(v)) }))}
                  min={0}
                  step={1}
                />
                <span className="text-xs text-gray-400">회</span>
                <span className="text-xs text-gray-500">{(cur.recentRunLimit ?? 0) === 0 ? '(모든 대회 포인트 합산)' : `(최근 ${cur.recentRunLimit}회 포인트만 합산)`}</span>
              </div>
            </section>

            {/* 상대전적 최소 대전 수 */}
            <section>
              <h3 className="text-gray-300 font-semibold text-sm mb-1">상대전적 최소 대전 수</h3>
              <div className="flex items-center gap-3 mt-2">
                <NumInput
                  value={cur.h2hMinMatches ?? 3}
                  onChange={v => update(s => ({ ...s, h2hMinMatches: Math.max(1, Math.round(v)) }))}
                  min={1}
                  step={1}
                />
                <span className="text-xs text-gray-400">전 이상</span>
              </div>
            </section>

            {/* 부별 가중치 */}
            <section>
              <h3 className="text-gray-300 font-semibold text-sm mb-1">부별 가중치 <span className="text-gray-500 font-normal text-xs">(부별 대회: 자기 부 기준)</span></h3>
              <div className="flex gap-3 flex-wrap mt-2">
                {DIV_LABELS.map((label, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <label className="text-xs text-gray-400">{label}</label>
                    <NumInput
                      value={cur.divisionWeights[i] ?? 0}
                      onChange={v => setWeight('divisionWeights', i, v)}
                      step={0.5}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* 섞인 대회 가중치 */}
            <section>
              <h3 className="text-gray-300 font-semibold text-sm mb-1">섞인 대회 가중치 <span className="text-gray-500 font-normal text-xs">(복수 부: 상대방 부 기준)</span></h3>
              <div className="flex gap-3 flex-wrap mt-2">
                {DIV_LABELS.map((label, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <label className="text-xs text-gray-400">{label}</label>
                    <NumInput
                      value={cur.opponentWeights[i] ?? 0}
                      onChange={v => setWeight('opponentWeights', i, v)}
                      step={0.5}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* 월드컵 전용 */}
            <section>
              <h3 className="text-gray-300 font-semibold text-sm mb-1">월드컵 전용 <span className="text-gray-500 font-normal text-xs">(블록/결승 매치 승점 배율)</span></h3>
              <div className="flex items-center gap-3 mt-2">
                <label className="text-xs text-gray-400">블록/결승 배율</label>
                <NumInput
                  value={cur.worldcupMainMultiplier ?? 2.0}
                  onChange={v => update(s => ({ ...s, worldcupMainMultiplier: v }))}
                  step={0.5}
                  min={1}
                />
                <span className="text-xs text-gray-500">× (기본 승 {cur.basePoints.win}점 → {(cur.basePoints.win * (cur.worldcupMainMultiplier ?? 2.0)).toFixed(1)}점)</span>
              </div>
              <p className="text-xs text-gray-600 mt-1">순위 보너스는 본인 부 가중치(divisionWeights)가 곱해집니다.</p>
            </section>

            {/* 순위 보너스 */}
            <section>
              <h3 className="text-gray-300 font-semibold text-sm mb-3">순위 보너스</h3>
              <div className="overflow-x-auto">
                <table className="text-sm">
                  <thead>
                    <tr>
                      <th className="text-gray-400 text-xs text-left pr-4 pb-2 font-normal">순위 \ 참가수</th>
                      {POOL_SIZES.map(p => (
                        <th key={p} className="text-gray-400 text-xs text-center px-2 pb-2 font-normal">{p}강</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {RANK_THRESHOLDS.map(rank => (
                      <tr key={rank}>
                        <td className="text-gray-400 text-xs pr-4 py-1">{rank}위 이내</td>
                        {POOL_SIZES.map(pool => {
                          const poolNum = parseInt(pool)
                          const rankNum = parseInt(rank)
                          const disabled = rankNum >= poolNum
                          return (
                            <td key={pool} className="px-2 py-1 text-center">
                              {disabled ? (
                                <span className="text-gray-700 text-xs">-</span>
                              ) : (
                                <NumInput
                                  value={cur.rankBonus[pool]?.[rank] ?? 0}
                                  onChange={v => setBonus(pool, rank, v)}
                                  className="w-14"
                                />
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* 푸터 */}
        <div className="px-5 py-4 border-t border-gray-700 shrink-0">
          {errorMsg && <p className="text-red-400 text-xs mb-2">{errorMsg}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">취소</button>
            <button
              onClick={handleSave}
              disabled={saving || !cur}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded text-sm font-semibold"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
