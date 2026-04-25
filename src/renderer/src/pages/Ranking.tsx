import { useState, useEffect } from 'react'
import type { Actor } from '../types'
import { dashboardApi } from '../api'
import ImagePreview from '../components/ImagePreview'

interface Props {
  onNavigateToActor: (id: number) => void
}

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

export default function Ranking({ onNavigateToActor }: Props) {
  const [scoreRanking, setScoreRanking] = useState<Actor[]>([])
  const [workCountRanking, setWorkCountRanking] = useState<Actor[]>([])
  const [bustRanking, setBustRanking] = useState<Actor[]>([])
  const [hipRanking, setHipRanking] = useState<Actor[]>([])
  const [waistRanking, setWaistRanking] = useState<Actor[]>([])
  const [heightRanking, setHeightRanking] = useState<Actor[]>([])
  const [ratioRanking, setRatioRanking] = useState<Actor[]>([])
  const [favoriteRanking, setFavoriteRanking] = useState<Actor[]>([])

  const [reversedRankings, setReversedRankings] = useState<Set<string>>(new Set())
  const [reversedData, setReversedData] = useState<Record<string, Actor[]>>({})

  const [rankModal, setRankModal] = useState<{ title: string; actors: Actor[]; subtitle: (a: Actor) => string; reversed: boolean } | null>(null)

  useEffect(() => {
    dashboardApi.actorScoreRanking(10).then((d) => setScoreRanking(d as Actor[]))
    dashboardApi.actorWorkCountRanking(10).then((d) => setWorkCountRanking(d as Actor[]))
    dashboardApi.actorBustRanking(10).then((d) => setBustRanking(d as Actor[]))
    dashboardApi.actorHipRanking(10).then((d) => setHipRanking(d as Actor[]))
    dashboardApi.actorWaistRanking(10).then((d) => setWaistRanking(d as Actor[]))
    dashboardApi.actorHeightRanking(10).then((d) => setHeightRanking(d as Actor[]))
    dashboardApi.actorRatioRanking(10).then((d) => setRatioRanking(d as Actor[]))
    dashboardApi.actorFavoriteRanking(10).then((d) => setFavoriteRanking(d as Actor[]))
  }, [])

  const toggleReverse = async (
    title: string,
    fetcher: (reverse: boolean, limit?: number) => Promise<unknown>
  ) => {
    const next = new Set(reversedRankings)
    const isNowReversed = !next.has(title)
    if (isNowReversed) {
      next.add(title)
      if (!reversedData[title]) {
        const data = await fetcher(true, 10) as Actor[]
        setReversedData((prev) => ({ ...prev, [title]: data }))
      }
    } else {
      next.delete(title)
    }
    setReversedRankings(next)
  }

  const handleShowRankAll = async (
    title: string,
    fetcher: (reverse?: boolean, limit?: number) => Promise<unknown>,
    subtitle: (a: Actor) => string,
    reversed: boolean
  ) => {
    const actors = await fetcher(reversed) as Actor[]
    setRankModal({ title, actors, subtitle, reversed })
  }

  return (
    <>
    <div className="h-full overflow-y-auto">
      <div className="p-6 space-y-8">

        {[
          { title: '출연작 랭킹 TOP 10', data: workCountRanking, subtitle: (a: Actor & { work_count?: number }) => `${a.work_count ?? 0}편`, fetcher: (r?: boolean, l?: number) => dashboardApi.actorWorkCountRanking(l, r) },
          { title: '찜 랭킹 TOP 10', data: favoriteRanking, subtitle: (a: Actor & { fav_work_count?: number }) => `♥ ${a.fav_work_count ?? 0}편`, fetcher: (r?: boolean, l?: number) => dashboardApi.actorFavoriteRanking(l, r) },
          { title: '평점 랭킹 TOP 10', data: scoreRanking, subtitle: (a: Actor & { avg_score?: number }) => `${(a.avg_score ?? 0).toFixed(2)}점`, fetcher: (r?: boolean, l?: number) => dashboardApi.actorScoreRanking(l, r) },
          { title: '피지컬 랭킹 TOP 10', data: ratioRanking, subtitle: (a: Actor & { ratio_score?: number }) => `${(a.ratio_score ?? 0).toFixed(2)}점`, fetcher: (r?: boolean, l?: number) => dashboardApi.actorRatioRanking(l, r) },
          { title: '바스트 랭킹 TOP 10', data: bustRanking, subtitle: (a: Actor) => `${a.bust ?? '-'}cm`, fetcher: (r?: boolean, l?: number) => dashboardApi.actorBustRanking(l, r) },
          { title: '힙 랭킹 TOP 10', data: hipRanking, subtitle: (a: Actor) => `${a.hip ?? '-'}cm`, fetcher: (r?: boolean, l?: number) => dashboardApi.actorHipRanking(l, r) },
          { title: '웨이스트 랭킹 TOP 10', data: waistRanking, subtitle: (a: Actor) => `${a.waist ?? '-'}cm`, fetcher: (r?: boolean, l?: number) => dashboardApi.actorWaistRanking(l, r) },
          { title: '키 랭킹 TOP 10', data: heightRanking, subtitle: (a: Actor) => `${a.height ?? '-'}cm`, fetcher: (r?: boolean, l?: number) => dashboardApi.actorHeightRanking(l, r) },
        ].map(({ title, data, subtitle, fetcher }) => {
          const isReversed = reversedRankings.has(title)
          const displayData = isReversed ? (reversedData[title] ?? []) : data
          return (
          <div key={title}>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-white font-bold text-base">{title}</h2>
              {data.length > 0 && (
                <>
                  <button
                    onClick={() => toggleReverse(title, fetcher)}
                    className={`text-xs px-2 py-0.5 rounded ${isReversed ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                  >
                    {isReversed ? '역순 ↑' : '정순 ↓'}
                  </button>
                  <button
                    onClick={() => handleShowRankAll(title, fetcher, subtitle as (a: Actor) => string, isReversed)}
                    className="text-xs text-gray-400 hover:text-gray-200 bg-gray-700 hover:bg-gray-600 px-2 py-0.5 rounded"
                  >
                    전체보기
                  </button>
                </>
              )}
            </div>
            {displayData.length > 0 ? (
              <div className="grid grid-cols-10 gap-2">
                {displayData.map((a, i) => {
                  const rank = isReversed
                    ? ((a as any).total_count ?? displayData.length) - i
                    : i + 1
                  return (
                    <ActorRankCard
                      key={a.id}
                      actor={a}
                      rank={rank}
                      subtitle={subtitle(a as any)}
                      onClick={() => onNavigateToActor(a.id)}
                    />
                  )
                })}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">데이터가 없습니다</p>
            )}
          </div>
          )
        })}

      </div>
    </div>

    {/* 랭킹 전체보기 모달 */}
    {rankModal && (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setRankModal(null)}>
        <div className="bg-gray-800 rounded-lg w-[95vw] h-[95vh] flex flex-col relative" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setRankModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl leading-none z-10">✕</button>
          <div className="flex-shrink-0 px-6 pt-6 pb-3 border-b border-gray-700">
            <h2 className="text-lg font-bold text-white">{rankModal.title.replace('TOP 10', '전체')}</h2>
            <p className="text-sm text-gray-400 mt-0.5">{rankModal.actors.length}명</p>
          </div>
          <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-6 py-4">
            <div className="grid grid-cols-10 gap-2">
              {rankModal.actors.map((a, i) => {
                const rank = rankModal.reversed
                  ? ((a as any).total_count ?? rankModal.actors.length) - i
                  : i + 1
                return (
                  <ActorRankCard
                    key={a.id}
                    actor={a}
                    rank={rank}
                    subtitle={rankModal.subtitle(a)}
                    onClick={() => onNavigateToActor(a.id)}
                  />
                )
              })}
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
