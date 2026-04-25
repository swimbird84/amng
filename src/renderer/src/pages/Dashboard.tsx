import { useState, useEffect, useMemo } from 'react'

import type { Work, Actor } from '../types'
import { dashboardApi } from '../api'
import ImagePreview from '../components/ImagePreview'
import Rating from '../components/Rating'

interface Props {
  onNavigateToWork: (id: number) => void
  onNavigateToActor: (id: number) => void
}

// 작품 카드 (발매일 분포용, 기존 Works.tsx 카드와 동일한 디자인)
function WorkCard({ work, onClick }: { work: Work & { rep_tags?: { id: number; name: string }[] }; onClick: () => void }) {
  return (
    <div onClick={onClick} className="cursor-pointer rounded-lg overflow-hidden border border-gray-700 hover:border-gray-500">
      <ImagePreview path={work.cover_path} alt={work.title || '표지'} className="w-full h-40" />
      <div className="p-2 bg-gray-800">
        <div className="flex items-center justify-between gap-1">
          <p className="text-sm font-bold text-white truncate flex-1">{work.product_number || '-'}</p>
          <div className="flex-shrink-0"><Rating value={work.rating} readonly small /></div>
        </div>
        <p className="text-xs text-gray-500">{work.release_date || '-'}</p>
        {work.rep_tags && work.rep_tags.length > 0 && (
          <div className="flex flex-wrap gap-0.5 mt-0.5">
            {work.rep_tags.map((t) => (
              <span key={t.id} className="bg-blue-900/50 text-blue-300 text-xs px-1.5 py-0.5 rounded">{t.name}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// 작품 미니 카드 (신작용, 절반 크기)
function WorkMiniCard({ work, onClick }: { work: Work; onClick: () => void }) {
  return (
    <div onClick={onClick} className="cursor-pointer rounded-lg overflow-hidden border border-gray-700 hover:border-gray-500">
      <ImagePreview path={work.cover_path} alt={work.title || '표지'} className="w-full h-20" />
      <div className="p-1 bg-gray-800">
        <p className="text-xs font-bold text-white truncate">{work.product_number || '-'}</p>
        <p className="text-xs text-gray-500 truncate">{work.release_date || '-'}</p>
      </div>
    </div>
  )
}

// 배우 미니 카드 (랭킹용, 절반 크기)
function ActorRankCard({ actor, rank, subtitle, showRank = true, onClick }: {
  actor: Actor & { avg_score?: number; work_count?: number }
  rank: number
  subtitle: string
  showRank?: boolean
  onClick: () => void
}) {
  return (
    <div onClick={onClick} className="cursor-pointer rounded-lg overflow-hidden border border-gray-700 hover:border-gray-500">
      <div className="relative">
        {showRank && <span className="absolute top-0.5 left-0.5 bg-black/70 text-white text-sm px-1.5 py-0.5 rounded z-10 leading-tight font-bold">{rank}</span>}
        <ImagePreview path={actor.photo_path} alt={actor.name} className="w-full h-20" />
      </div>
      <div className="p-1 bg-gray-800">
        <p className="text-xs font-bold text-white truncate">{actor.name}</p>
        <p className="text-xs text-yellow-400 truncate">{subtitle}</p>
      </div>
    </div>
  )
}

// 배우 컵 분포 카드
function ActorCupCard({ actor, onClick }: {
  actor: Actor & { avg_score?: number; ratio_score?: number }
  onClick: () => void
}) {
  const parts = [actor.bust ? `B${actor.bust}` : null, actor.waist ? `W${actor.waist}` : null].filter(Boolean)
  const bw = parts.join('-')
  return (
    <div onClick={onClick} className="cursor-pointer rounded-lg overflow-hidden border border-gray-700 hover:border-gray-500">
      <ImagePreview path={actor.photo_path} alt={actor.name} className="w-full h-20" />
      <div className="p-1 bg-gray-800">
        <p className="text-xs font-bold text-white truncate">{actor.name}</p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-white">{bw || '-'}</span>
          {actor.ratio_score != null && <span className="text-xs text-blue-400">{actor.ratio_score.toFixed(2)}</span>}
        </div>
      </div>
    </div>
  )
}

// 나이대별 배우 아이템 (작은 썸네일 + 이름 + 평점)
function ActorAgeItem({ actor, onClick }: { actor: Actor & { avg_score?: number }; onClick: () => void }) {
  return (
    <div onClick={onClick} className="cursor-pointer flex flex-col items-center gap-0.5 w-14 flex-shrink-0">
      <ImagePreview path={actor.photo_path} alt={actor.name} className="w-12 h-12 rounded object-cover" />
      <p className="text-xs text-white truncate w-full text-center">{actor.name}</p>
      <p className="text-xs text-yellow-400">{(actor.avg_score ?? 0).toFixed(2)}</p>
    </div>
  )
}

// 섹션 타이틀
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-white font-bold text-base mb-3">{children}</h2>
}

// ===== 메인 대시보드 =====
export default function Dashboard({ onNavigateToWork, onNavigateToActor }: Props) {
  const [newWorks, setNewWorks] = useState<Work[]>([])
  const [expandedWorks, setExpandedWorks] = useState(false)

  const [newActors, setNewActors] = useState<Actor[]>([])
  const [expandedActors, setExpandedActors] = useState(false)

  const [years, setYears] = useState<{ year: string; count: number }[]>([])
  const [selectedYear, setSelectedYear] = useState<string | null>(null)
  const [monthCounts, setMonthCounts] = useState<{ month: number; count: number }[]>([])
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
  const [monthWorks, setMonthWorks] = useState<Work[]>([])

  const [ageDist, setAgeDist] = useState<(Actor & { age: number; avg_score: number })[]>([])
  const [selectedGroup, setSelectedGroup] = useState<{ decade: number; phase: 'early' | 'mid' | 'late' } | null>(null)

  const [scoreDist, setScoreDist] = useState<(Actor & { avg_score: number; work_count: number })[]>([])
  const [cupDist, setCupDist] = useState<(Actor & { avg_score: number; work_count: number; ratio_score?: number })[]>([])
  const [selectedCup, setSelectedCup] = useState<string | null>(null)
  const [selectedScoreBucket, setSelectedScoreBucket] = useState<{ base: number; half: 'early' | 'late' } | null>(null)

  const [ratingDist, setRatingDist] = useState<{ bucket: number; count: number }[]>([])
  const [ratingModal, setRatingModal] = useState<{ bucket: number; works: Work[] } | null>(null)

  useEffect(() => {
    dashboardApi.newWorks().then((d) => setNewWorks(d as Work[]))
    dashboardApi.newActors().then((d) => setNewActors(d as Actor[]))
    dashboardApi.releaseYears().then((d) => setYears(d as { year: string; count: number }[]))
    dashboardApi.ageDist().then((d) => setAgeDist(d as (Actor & { age: number; avg_score: number })[]))
    dashboardApi.actorScoreDist().then((d) => setScoreDist(d as (Actor & { avg_score: number; work_count: number })[]))
    dashboardApi.actorCupDist().then((d) => setCupDist(d as (Actor & { avg_score: number; work_count: number })[]))
    dashboardApi.ratingDist().then((d) => setRatingDist(d as { bucket: number; count: number }[]))
  }, [])


  const handleSelectYear = async (year: string) => {
    if (selectedYear === year) {
      setSelectedYear(null)
      setSelectedMonth(null)
      setMonthWorks([])
      setMonthCounts([])
      return
    }
    setSelectedYear(year)
    setSelectedMonth(null)
    setMonthWorks([])
    const months = await dashboardApi.releaseMonths(year) as { month: number; count: number }[]
    setMonthCounts(months)
  }

  const handleSelectMonth = async (month: number) => {
    if (!selectedYear) return
    if (selectedMonth === month) {
      setSelectedMonth(null)
      setMonthWorks([])
      return
    }
    setSelectedMonth(month)
    const works = await dashboardApi.releaseWorks(selectedYear, month) as Work[]
    setMonthWorks(works)
  }

  const PHASE_RANGES = {
    early: [0, 3],
    mid: [4, 6],
    late: [7, 9],
  } as const

  const phaseLabel = (phase: 'early' | 'mid' | 'late') =>
    phase === 'early' ? '초' : phase === 'mid' ? '중' : '후'

  const getPhaseActors = (decade: number, phase: 'early' | 'mid' | 'late') => {
    const [lo, hi] = PHASE_RANGES[phase]
    return ageDist.filter((a) => a.age >= decade + lo && a.age <= decade + hi)
  }

  const ageGroups = useMemo(() => {
    const decades = new Set<number>()
    for (const actor of ageDist) decades.add(Math.floor(actor.age / 10) * 10)
    return Array.from(decades).sort((a, b) => a - b)
  }, [ageDist])

  const selectedGroupByAge = useMemo(() => {
    if (!selectedGroup) return null
    const { decade, phase } = selectedGroup
    const [lo, hi] = PHASE_RANGES[phase]
    const byAge = new Map<number, (Actor & { age: number; avg_score: number })[]>()
    for (let age = decade + lo; age <= decade + hi; age++) byAge.set(age, [])
    for (const actor of ageDist) {
      if (actor.age >= decade + lo && actor.age <= decade + hi) byAge.get(actor.age)?.push(actor)
    }
    return Array.from(byAge.entries()).sort(([a], [b]) => a - b)
  }, [ageDist, selectedGroup])

  const ratingBuckets = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0]
  const ratingCountMap = new Map(ratingDist.map((r) => [r.bucket, r.count]))
  const today = new Date().toISOString().slice(0, 10)

  return (
    <>
    <div className="h-full overflow-y-auto">
      <div className="p-6 space-y-8">

        {/* 신작 */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-white font-bold text-base">신작</h2>
            <span className="text-xs text-gray-500">({today} 기준 2개월)</span>
            <button
              onClick={() => setExpandedWorks((v) => !v)}
              className="w-6 h-6 flex items-center justify-center rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-bold leading-none"
            >
              {expandedWorks ? '−' : '+'}
            </button>
          </div>
          {newWorks.length > 0 ? (
            <div className="grid grid-cols-10 gap-2">
              {newWorks.slice(0, expandedWorks ? 20 : 10).map((w) => (
                <WorkMiniCard key={w.id} work={w} onClick={() => onNavigateToWork(w.id)} />
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">발매일이 등록된 작품이 없습니다</p>
          )}
        </div>

        {/* 신인 */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-white font-bold text-base">신인</h2>
            <span className="text-xs text-gray-500">({today} 기준 3년)</span>
            <button
              onClick={() => setExpandedActors((v) => !v)}
              className="w-6 h-6 flex items-center justify-center rounded bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-bold leading-none"
            >
              {expandedActors ? '−' : '+'}
            </button>
          </div>
          {newActors.length > 0 ? (
            <div className="grid grid-cols-10 gap-2">
              {newActors.slice(0, expandedActors ? 20 : 10).map((a, i) => (
                <ActorRankCard
                  key={a.id}
                  actor={a}
                  rank={i + 1}
                  subtitle={a.debut_date || '-'}
                  showRank={false}
                  onClick={() => onNavigateToActor(a.id)}
                />
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">데뷔일이 등록된 배우가 없습니다</p>
          )}
        </div>

        {/* 발매일 분포 */}
        <div>
          <SectionTitle>발매일 분포</SectionTitle>
          <div className="flex flex-wrap gap-2 mb-4">
            {years.map(({ year, count }) => (
              <button
                key={year}
                onClick={() => handleSelectYear(year)}
                className={`px-3 py-1 rounded text-sm ${
                  selectedYear === year ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {year} <span className="text-xs opacity-70">({count})</span>
              </button>
            ))}
            {years.length === 0 && <p className="text-gray-500 text-sm">발매일 데이터가 없습니다</p>}
          </div>
          {selectedYear && monthCounts.length > 0 && (
            <>
              <div className="grid grid-cols-12 gap-1.5 mb-4">
                {monthCounts.map(({ month, count }) => (
                  <button
                    key={month}
                    onClick={() => count > 0 && handleSelectMonth(month)}
                    className={`py-2 rounded text-xs text-center ${
                      selectedMonth === month
                        ? 'bg-blue-600 text-white'
                        : count > 0
                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        : 'bg-gray-800 text-gray-600 cursor-not-allowed'
                    }`}
                  >
                    <div>{month}월</div>
                    <div className="opacity-70">{count}</div>
                  </button>
                ))}
              </div>
              {selectedMonth !== null && (
                <div>
                  <p className="text-sm text-gray-400 mb-2">{selectedYear}년 {selectedMonth}월 발매작 ({monthWorks.length})</p>
                  {monthWorks.length > 0 ? (
                    <div className="grid grid-cols-5 gap-3">
                      {monthWorks.map((w) => (
                        <WorkCard key={w.id} work={w} onClick={() => onNavigateToWork(w.id)} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">발매작이 없습니다</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* 별점 분포 */}
        <div>
          <SectionTitle>별점 분포</SectionTitle>
          <div className="grid grid-cols-10 gap-1.5">
            {ratingBuckets.map((bucket) => {
              const count = ratingCountMap.get(bucket) ?? 0
              const active = count > 0
              return (
                  <button
                      key={bucket}
                      disabled={!active}
                      onClick={async () => {
                        if (!active) return
                        const works = await dashboardApi.ratingWorks(bucket) as Work[]
                        setRatingModal({ bucket, works })
                      }}
                      className={`py-1.5 rounded text-center ${active ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-800 text-gray-600 cursor-not-allowed'}`}
                  >
                    <div className="flex justify-center gap-px mb-0.5">
                      {[1, 2, 3, 4, 5].map((star) => {
                        const full = bucket >= star
                        const half = !full && bucket >= star - 0.5
                        return (
                            <span key={star} className="relative text-xs leading-none w-2.5 inline-block">
                          <span className="text-gray-600">★</span>
                              {(full || half) && (
                                  <span
                                      className="absolute inset-0 text-yellow-400 overflow-hidden whitespace-nowrap"
                                      style={{ width: full ? '100%' : '50%' }}
                                  >★</span>
                              )}
                        </span>
                        )
                      })}
                    </div>
                    <p className="text-xs">{active ? `${count}편` : '-'}</p>
                  </button>
              )
            })}
          </div>
        </div>

        {/* 나이대별 분포 */}
        <div>
          <SectionTitle>나이대별 분포</SectionTitle>
          {ageGroups.length > 0 ? (
            <>
              <div className="grid grid-cols-10 gap-1.5 mb-4">
                {ageGroups.map((decade) =>
                  (['early', 'mid', 'late'] as const).map((phase) => {
                    const actors = getPhaseActors(decade, phase)
                    if (actors.length === 0) return null
                    const isSelected = selectedGroup?.decade === decade && selectedGroup?.phase === phase
                    return (
                      <button
                        key={`${decade}-${phase}`}
                        onClick={() => setSelectedGroup(isSelected ? null : { decade, phase })}
                        className={`py-1.5 rounded text-center ${
                          isSelected ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        <p className="text-xs font-bold">{decade}대 {phaseLabel(phase)}반</p>
                        <p className="text-xs">{actors.length}명</p>
                      </button>
                    )
                  })
                )}
              </div>
              {selectedGroup && selectedGroupByAge && (
                <div className="space-y-4 border border-gray-700 rounded-lg p-4">
                  {selectedGroupByAge.map(([age, actors]) => (
                    <div key={age} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-400 flex-shrink-0">{age}세</span>
                        <div className="flex-1 border-t border-gray-700" />
                      </div>
                      {actors.length > 0 ? (
                        <div className="grid grid-cols-10 gap-2">
                          {actors.map((a, i) => (
                            <ActorRankCard key={a.id} actor={a} rank={i + 1} subtitle={`${(a.avg_score ?? 0).toFixed(2)}점`} showRank={false} onClick={() => onNavigateToActor(a.id)} />
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-600 text-sm">-</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-gray-500 text-sm">생년월일이 등록된 배우가 없습니다</p>
          )}
        </div>

        {/* 배우 평점 분포 */}
        <div>
          <SectionTitle>배우 평점 분포</SectionTitle>
          {scoreDist.length > 0 ? (
            <>
              <div className="grid grid-cols-10 gap-1.5 mb-4">
                {Array.from({ length: 10 }, (_, i) => i).flatMap((base) =>
                  (['early', 'late'] as const).map((half) => {
                    const actors = scoreDist.filter((a) =>
                      half === 'early'
                        ? a.avg_score >= base && a.avg_score < base + 0.5
                        : base === 9
                          ? a.avg_score >= base + 0.5 && a.avg_score <= 10
                          : a.avg_score >= base + 0.5 && a.avg_score < base + 1
                    )
                    if (actors.length === 0) return null
                    const isSelected = selectedScoreBucket?.base === base && selectedScoreBucket?.half === half
                    return (
                      <button
                        key={`${base}-${half}`}
                        onClick={() => setSelectedScoreBucket(isSelected ? null : { base, half })}
                        className={`py-1.5 rounded text-center ${isSelected ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                      >
                        <p className="text-xs font-bold">{base}점대 {half === 'early' ? '초반' : '후반'}</p>
                        <p className="text-xs">{actors.length}명</p>
                      </button>
                    )
                  })
                )}
              </div>
              {selectedScoreBucket !== null && (() => {
                const { base, half } = selectedScoreBucket
                const lo = half === 'early' ? base : base + 0.5
                const isNineLate = base === 9 && half === 'late'
                const steps = isNineLate
                  ? [9.5, 9.6, 9.7, 9.8, 9.9, 10.0]
                  : Array.from({ length: 5 }, (_, i) => Math.round((lo + i * 0.1) * 10) / 10)
                return (
                  <div className="space-y-4 border border-gray-700 rounded-lg p-4">
                    {steps.map((step) => {
                      const actors = scoreDist.filter((a) => {
                        const s = Math.round(a.avg_score * 10) / 10
                        return s === step
                      })
                      return (
                        <div key={step} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-400 flex-shrink-0">{step.toFixed(1)}점</span>
                            <div className="flex-1 border-t border-gray-700" />
                          </div>
                          {actors.length > 0 ? (
                            <div className="grid grid-cols-10 gap-2">
                              {actors.map((a, i) => (
                                <ActorRankCard key={a.id} actor={a} rank={i + 1} subtitle={`${(a.avg_score ?? 0).toFixed(2)}점`} showRank={false} onClick={() => onNavigateToActor(a.id)} />
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-600 text-sm">-</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </>
          ) : (
            <p className="text-gray-500 text-sm">데이터가 없습니다</p>
          )}
        </div>

        {/* 배우 컵 분포 */}
        {cupDist.length > 0 && (() => {
          const cups = Array.from(new Set(cupDist.map((a) => a.cup as string))).sort()
          return (
            <div>
              <SectionTitle>배우 컵 분포</SectionTitle>
              <div className="grid grid-cols-10 gap-1.5 mb-4">
                {cups.map((cup) => {
                  const actors = cupDist.filter((a) => a.cup === cup)
                  const isSelected = selectedCup === cup
                  return (
                    <button
                      key={cup}
                      onClick={() => setSelectedCup(isSelected ? null : cup)}
                      className={`py-1.5 px-3 rounded text-center ${isSelected ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                    >
                      <p className="text-xs font-bold">{cup}컵</p>
                      <p className="text-xs">{actors.length}명</p>
                    </button>
                  )
                })}
              </div>
              {selectedCup !== null && (
                <div className="border border-gray-700 rounded-lg p-4">
                  <div className="grid grid-cols-10 gap-2">
                    {cupDist.filter((a) => a.cup === selectedCup).map((a) => (
                      <ActorCupCard key={a.id} actor={a} onClick={() => onNavigateToActor(a.id)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })()}




      </div>
    </div>

    {/* 별점 작품 목록 모달 */}
    {ratingModal && (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setRatingModal(null)}>
        <div className="bg-gray-800 rounded-lg w-[95vw] h-[95vh] flex flex-col relative" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setRatingModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl leading-none z-10">✕</button>
          <div className="flex-shrink-0 px-6 pt-6 pb-3 border-b border-gray-700">
            <h2 className="text-lg font-bold text-white">별점 {ratingModal.bucket}점</h2>
            <p className="text-sm text-gray-400 mt-0.5">{ratingModal.works.length}편</p>
          </div>
          <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-6 py-4">
            {ratingModal.works.length > 0 ? (
              <div className="grid grid-cols-10 gap-2">
                {ratingModal.works.map((w) => (
                  <WorkMiniCard key={w.id} work={w} onClick={() => { setRatingModal(null); onNavigateToWork(w.id) }} />
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">작품이 없습니다</p>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  )
}
