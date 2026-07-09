import React, { useState, useEffect, useRef } from 'react'
import { cupApi, shellApi, masterRankingApi } from '../../api'
import ImagePreview from '../ImagePreview'
import CardTooltip, { type TooltipState } from '../CardTooltip'
import Rating from '../Rating'
import type { ItemInfo } from './cupTypes'
import { itemLabel, itemImagePath, DIV_COLOR } from './cupConstants'

export default function MatchCard({
  item, type, tournamentId, onClick, onNavigate, onEdit, disabled, division, isMaster,
}: {
  item: ItemInfo
  type: 'actor' | 'work'
  tournamentId: number
  onClick: () => void
  onNavigate: () => void
  onEdit: () => void
  disabled: boolean
  division?: number
  isMaster?: boolean
}) {
  const imgPath = itemImagePath(item)
  const [stats, setStats] = useState<{ total_cups?: number; run_wins?: number; total_runs?: number; total_matches: number; match_wins: number; win_rate: number; match_win_rate: number; rank: number; total_points?: number } | null>(null)
  const [fileExists, setFileExists] = useState(false)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [workRating, setWorkRating] = useState<number>(item.rating ?? 0)
  const [isFavorite, setIsFavorite] = useState(!!(item.is_favorite))
  const [isDeletePending, setIsDeletePending] = useState(!!(item.delete_pending))

  useEffect(() => {
    setWorkRating(item.rating ?? 0)
    setIsFavorite(!!(item.is_favorite))
    setIsDeletePending(!!(item.delete_pending))
  }, [item.id, item.rating, item.is_favorite, item.delete_pending])

  useEffect(() => {
    if (isMaster) {
      masterRankingApi.itemStats(type, item.id).then(s => setStats({ ...s, total_cups: s.total_cups, run_wins: s.cup_wins }))
    } else {
      cupApi.itemTournamentStats(tournamentId, item.id).then(s => setStats({ ...s, total_cups: s.total_runs, run_wins: s.run_wins }))
    }
  }, [tournamentId, item.id, isMaster, type])

  useEffect(() => {
    const first = item.files?.[0]
    if (!first) { setFileExists(false); return }
    if (first.type === 'url') { setFileExists(true); return }
    shellApi.fileExists(first.file_path).then(setFileExists)
  }, [item.files])

  const firstFile = item.files?.[0]

  const handlePlay = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!firstFile) return
    if (firstFile.type === 'url') shellApi.openExternal(firstFile.file_path)
    else shellApi.openPath(firstFile.file_path)
  }

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onEdit()
  }

  return (
    <div className="flex flex-col rounded-xl overflow-hidden border-[5px] border-gray-700 hover:border-blue-500 bg-gray-800 w-full transition-colors">
      {/* 썸네일 — 클릭 시 승리 선택 */}
      <button
        onClick={onClick}
        disabled={disabled}
        className={`relative overflow-hidden cursor-pointer disabled:cursor-not-allowed block w-full ${
          type === 'actor' ? 'aspect-square' : 'aspect-[800/540]'
        }`}
      >
        {imgPath
          ? <ImagePreview path={imgPath} alt="" className="w-full h-full object-cover" objectPosition="center 10%" />
          : <div className="w-full h-full bg-gray-700 flex items-center justify-center"><span className="text-gray-500 text-4xl">?</span></div>
        }
      </button>

      {/* 정보 섹션 */}
      <div
        className={`p-3 bg-gray-800 border-t border-gray-700 cursor-default overflow-hidden${type === 'work' ? ' h-[236px]' : ''}`}
        onMouseMove={e => setTooltip({ type, id: item.id, x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* 통계 행 */}
        {stats && (stats.total_cups ?? stats.total_runs ?? 0) > 0 ? (
          <p className="text-[0.85rem] text-gray-400 mb-1.5 text-center whitespace-nowrap flex items-center justify-center gap-1.5 flex-wrap">
            {division !== undefined && (
              <span className={`text-xs px-1.5 py-0.5 rounded border font-bold shrink-0 ${DIV_COLOR[division] ?? DIV_COLOR[0]}`}>
                {division === 0 ? '미분류' : `${division}부`}
              </span>
            )}
            {isMaster && stats.total_points !== undefined && (
              <span className="text-yellow-400 font-semibold">{Number(stats.total_points).toFixed(1)}pt</span>
            )}
            <span>
              {stats.rank}위&nbsp;&nbsp;
              우승률: {stats.win_rate}%({stats.run_wins ?? 0}/{stats.total_cups ?? stats.total_runs ?? 0})&nbsp;&nbsp;
              승률: {stats.match_win_rate}%({stats.match_wins}/{stats.total_matches})
            </span>
          </p>
        ) : (
          <p className="text-[0.85rem] text-gray-600 mb-1.5 text-center flex items-center justify-center gap-1.5">
            {division !== undefined && (
              <span className={`text-xs px-1.5 py-0.5 rounded border font-bold shrink-0 ${DIV_COLOR[division] ?? DIV_COLOR[0]}`}>
                {division === 0 ? '미분류' : `${division}부`}
              </span>
            )}
            <span>-</span>
          </p>
        )}
        {/* 이름 / 작품 정보 */}
        {type === 'actor' ? (
          <div className="flex items-center gap-1">
            {isFavorite && <span className="shrink-0 text-pink-500 text-sm">♥</span>}
            {isDeletePending && <span className="shrink-0 text-red-500 text-xs font-bold">X</span>}
            <p
              className="flex-1 text-[1.47rem] font-bold text-white text-center truncate cursor-pointer hover:underline"
              onClick={onNavigate}
            >{item.name ?? '...'}</p>
            <button
              onClick={handleEditClick}
              className="shrink-0 w-7 h-7 rounded flex items-center justify-center cursor-pointer hover:border hover:border-gray-500 transition"
              title="수정"
            >
              💬
            </button>
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-sm text-gray-400 truncate">
                <span className="truncate">{item.product_number ?? ''}</span>
                {item.release_date && <span className="shrink-0">{item.release_date}</span>}
                {workRating > 0 && <span className="shrink-0"><Rating value={workRating} readonly small /></span>}
                {isFavorite && <span className="shrink-0 text-pink-500 text-xs">♥</span>}
                {isDeletePending && <span className="shrink-0 text-red-500 text-xs font-bold">X</span>}
              </div>
              {(item.actors?.length ?? 0) > 0 && (() => {
                const repIds = new Set(item.rep_actors?.map(a => a.id) ?? [])
                const reps = item.actors!.filter(a => repIds.has(a.id))
                const others = item.actors!.filter(a => !repIds.has(a.id))
                const sorted = [...reps, ...others]
                return (
                  <p className="text-sm text-white truncate">
                    {sorted.map((a, i) => (
                      <span key={a.id} className={repIds.has(a.id) ? 'text-white' : 'text-gray-400'}>
                        {i > 0 && ', '}
                        {a.name}
                      </span>
                    ))}
                  </p>
                )
              })()}
              <p
                className="text-base font-bold text-white mt-0.5 line-clamp-8 cursor-pointer hover:underline"
                onClick={onNavigate}
              >{item.title ?? item.product_number ?? '...'}</p>
              {item.comment && <p className="text-sm text-gray-400 line-clamp-2">{item.comment}</p>}
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              {firstFile && (
                <button
                  onClick={handlePlay}
                  disabled={!fileExists}
                  className={`w-8 h-8 rounded flex items-center justify-center transition ${fileExists ? 'bg-red-600 hover:bg-red-500' : 'bg-gray-600 opacity-50 cursor-not-allowed'}`}
                  title="재생"
                >
                  <span className="text-white text-sm">▶</span>
                </button>
              )}
              <button
                onClick={handleEditClick}
                className="w-8 h-8 rounded flex items-center justify-center cursor-pointer hover:border hover:border-gray-500 transition"
                title="수정"
              >
                💬
              </button>
            </div>
          </div>
        )}
      </div>
      {tooltip && <CardTooltip tooltip={tooltip} />}
    </div>
  )
}
