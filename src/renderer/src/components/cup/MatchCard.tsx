import React, { useState, useEffect, useCallback, useRef } from 'react'
import { cupApi, actorsApi, worksApi, shellApi, masterRankingApi } from '../../api'
import ImagePreview from '../ImagePreview'
import CardTooltip, { type TooltipState } from '../CardTooltip'
import Rating from '../Rating'
import type { ActorScores } from '../../types'
import { useScoreDemote, ScoreDemoteModal, SCORE_GRADE_LIMITS, type ActorScoreSnapshot, type PendingDemotion } from '../ScoreDemoteModal'
import type { ItemInfo, CupMatch, CupRun } from './cupTypes'
import { SCORE_FIELDS, SCORE_OPTIONS, itemLabel, itemImagePath, DIV_COLOR } from './cupConstants'

export default function MatchCard({
  item, type, tournamentId, onClick, onNavigate, disabled, division, isMaster,
}: {
  item: ItemInfo
  type: 'actor' | 'work'
  tournamentId: number
  onClick: () => void
  onNavigate: () => void
  disabled: boolean
  division?: number
  isMaster?: boolean
}) {
  const imgPath = itemImagePath(item)
  const [stats, setStats] = useState<{ total_cups?: number; run_wins?: number; total_runs?: number; total_matches: number; match_wins: number; win_rate: number; match_win_rate: number; rank: number; total_points?: number } | null>(null)
  const [fileExists, setFileExists] = useState(false)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [showMemo, setShowMemo] = useState(false)
  const [memoText, setMemoText] = useState(item.comment ?? '')
  const [localComment, setLocalComment] = useState(item.comment ?? '')
  const [saving, setSaving] = useState(false)
  const [scores, setScores] = useState<ActorScores>({ face: 0, bust: 0, hip: 0, physical: 0, skin: 0, acting: 0, sexy: 0, charm: 0, technique: 0, proportions: 0 })
  const [scoreExcluded, setScoreExcluded] = useState(false)
  const [workRating, setWorkRating] = useState<number>(item.rating ?? 0)
  const [deletePending, setDeletePending] = useState(false)
  const [isFavorite, setIsFavorite] = useState(false)
  const demote = useScoreDemote()

  const handleScoreChange = async (key: keyof ActorScores, value: number) => {
    if (value >= 11) {
      const physData = await actorsApi.physicalData() as ActorScoreSnapshot[]
      const actorsAtTier = physData.filter(a => a.id !== item.id && (
        key === 'bust' ? a.score_bust : key === 'hip' ? a.score_hip : a[key as keyof ActorScoreSnapshot]
      ) === value)
      if ((actorsAtTier.length as number) >= SCORE_GRADE_LIMITS[value]) {
        demote.start(
          key,
          value,
          { id: item.id, name: item.name ?? `#${item.id}`, photo_path: item.photo_path ?? null },
          physData,
          async (changes: PendingDemotion[]) => {
            for (const change of changes) {
              const a = physData.find(x => x.id === change.actorId)!
              const updatedScores: ActorScores = {
                face: a.face, bust: a.score_bust, hip: a.score_hip,
                physical: a.physical, skin: a.skin, acting: a.acting,
                sexy: a.sexy, charm: a.charm, technique: a.technique, proportions: a.proportions,
                [change.field]: change.newScore,
              }
              await actorsApi.update(change.actorId, { scores: updatedScores })
            }
            setScores(prev => ({ ...prev, [key]: value }))
          }
        )
        return
      }
    }
    setScores(prev => ({ ...prev, [key]: value }))
  }

  useEffect(() => {
    setLocalComment(item.comment ?? '')
    setMemoText(item.comment ?? '')
    setWorkRating(item.rating ?? 0)
    setIsFavorite(!!(item.is_favorite))
  }, [item.id])

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

  const handleOpenMemo = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (type === 'actor') {
      const actor = await actorsApi.get(item.id) as { comment?: string | null; scores?: ActorScores; score_excluded?: number; delete_pending?: number; is_favorite?: number }
      setMemoText(actor.comment ?? '')
      setScores(actor.scores ?? { face: 0, bust: 0, hip: 0, physical: 0, skin: 0, acting: 0, sexy: 0, charm: 0, technique: 0, proportions: 0 })
      setScoreExcluded(!!(actor.score_excluded))
      setDeletePending(!!(actor.delete_pending))
      setIsFavorite(!!(actor.is_favorite))
    } else {
      const work = await worksApi.get(item.id) as { comment?: string | null; rating?: number; delete_pending?: number; is_favorite?: number }
      setMemoText(work.comment ?? '')
      setWorkRating(work.rating ?? item.rating ?? 0)
      setDeletePending(!!(work.delete_pending))
      setIsFavorite(!!(work.is_favorite))
    }
    setShowMemo(true)
  }

  const handleSaveMemo = async (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation()
    setSaving(true)
    try {
      if (type === 'actor') {
        await actorsApi.update(item.id, { comment: memoText, scores, score_excluded: scoreExcluded ? 1 : 0, delete_pending: deletePending ? 1 : 0, is_favorite: isFavorite ? 1 : 0 })
      } else {
        await worksApi.update(item.id, { comment: memoText, rating: workRating, delete_pending: deletePending ? 1 : 0, is_favorite: isFavorite ? 1 : 0 })
      }
      setLocalComment(memoText)
      setShowMemo(false)
    } finally {
      setSaving(false)
    }
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
        className={`p-3 bg-gray-800 border-t border-gray-700 cursor-default overflow-hidden${type === 'work' ? ' h-[216px]' : ''}`}
        onMouseMove={e => setTooltip({ type, id: item.id, x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* 통계 행 */}
        {stats && (stats.total_cups ?? stats.total_runs ?? 0) > 0 ? (
          <p className="text-[0.85rem] text-gray-400 mb-1.5 text-center whitespace-nowrap flex items-center justify-center gap-1.5 flex-wrap">
            {division !== undefined && (
              <span className={`text-xs px-1.5 py-0.5 rounded border font-bold shrink-0 ${DIV_COLOR[division] ?? DIV_COLOR[0]}`}>
                {division === 0 ? '미지정' : `${division}부`}
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
                {division === 0 ? '미지정' : `${division}부`}
              </span>
            )}
            <span>-</span>
          </p>
        )}
        {/* 이름 / 작품 정보 */}
        {type === 'actor' ? (
          <div className="flex items-center gap-1">
            <p
              className="flex-1 text-[1.47rem] font-bold text-white text-center truncate cursor-pointer hover:underline"
              onClick={onNavigate}
            >{item.name ?? '...'}</p>
            <button
              onClick={handleOpenMemo}
              className="shrink-0 w-7 h-7 rounded flex items-center justify-center cursor-pointer hover:border hover:border-gray-500 transition"
              title="코멘트 편집"
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
                className="text-base font-bold text-white mt-0.5 line-clamp-6 cursor-pointer hover:underline"
                onClick={onNavigate}
              >{item.title ?? item.product_number ?? '...'}</p>
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
                onClick={handleOpenMemo}
                className="w-8 h-8 rounded flex items-center justify-center cursor-pointer hover:border hover:border-gray-500 transition"
                title="코멘트 편집"
              >
                💬
              </button>
            </div>
          </div>
        )}
      </div>
      {tooltip && <CardTooltip tooltip={tooltip} />}

      {/* 코멘트 편집 모달 */}
      {showMemo && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-gray-800 rounded-xl p-5 w-[480px] shadow-2xl">
            <h2 className="text-sm font-bold text-white mb-3 truncate">
              {type === 'actor' ? item.name : (item.title ?? item.product_number ?? `#${item.id}`)}
            </h2>

            {/* 배우: 평점 세부항목 + 제외 체크박스 */}
            {type === 'actor' && (
              <>
                <div className="grid grid-cols-5 gap-1 mb-2">
                  {SCORE_FIELDS.map(({ key, label }) => (
                    <div key={key} className="flex flex-col gap-0.5">
                      <span className="text-xs text-gray-400 text-center truncate">{label}</span>
                      <select
                        value={scores[key]}
                        onChange={e => handleScoreChange(key, Number(e.target.value))}
                        className="bg-gray-700 text-white text-xs py-1 rounded text-center w-full"
                      >
                        {SCORE_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <label className="flex items-center gap-2 mb-3 cursor-pointer select-none w-fit">
                  <input
                    type="checkbox"
                    checked={scoreExcluded}
                    onChange={e => setScoreExcluded(e.target.checked)}
                    className="w-3.5 h-3.5 cursor-pointer"
                  />
                  <span className="text-xs text-gray-400">평점 제외</span>
                </label>
              </>
            )}

            {/* 작품: 별점 */}
            {type === 'work' && (
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs text-gray-400">별점</span>
                <Rating value={workRating} onChange={setWorkRating} />
                <span className="text-xs text-gray-400">{workRating}</span>
              </div>
            )}

            <textarea
              className="w-full bg-gray-900 text-white text-sm rounded p-2 resize-none border border-gray-600 focus:outline-none focus:border-blue-500"
              rows={4}
              value={memoText}
              onChange={e => setMemoText(e.target.value)}
              onKeyDown={e => { if (e.ctrlKey && e.key === 's') { e.preventDefault(); handleSaveMemo(e) } }}
              placeholder="코멘트를 입력하세요..."
              autoFocus
            />
            <div className="flex items-center gap-4 mt-2">
              <label className="flex items-center gap-1.5 cursor-pointer select-none w-fit" onClick={() => setIsFavorite(!isFavorite)}>
                <span className={`text-sm ${isFavorite ? 'text-pink-500' : 'text-gray-600'}`}>♥</span>
                <span className="text-xs text-gray-400">즐겨찾기</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none w-fit">
                <input
                  type="checkbox"
                  checked={deletePending}
                  onChange={e => setDeletePending(e.target.checked)}
                  className="accent-red-500"
                />
                <span className="text-xs text-red-400">삭제예정</span>
              </label>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleSaveMemo}
                disabled={saving}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-sm font-semibold transition"
              >저장</button>
              <button
                onClick={() => setShowMemo(false)}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition"
              >취소</button>
            </div>
          </div>
        </div>
      )}
      {demote.step && demote.field && (
        <ScoreDemoteModal
          step={demote.step}
          field={demote.field}
          onSelect={demote.handleSelect}
          onCancel={demote.cancel}
        />
      )}
    </div>
  )
}
