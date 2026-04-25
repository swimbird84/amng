import { useState, useEffect, useMemo } from 'react'
import type { Actor } from '../types'
import { actorsApi, shellApi } from '../api'
import ImagePreview from './ImagePreview'
import Rating from './Rating'
import RadarChart from './RadarChart'

interface Props {
  actorId: number
  onClose: () => void
  onViewWork: (id: number) => void
  zIndex?: number
}

function getAge(birthday: string | null): string {
  if (!birthday) return '-'
  return `${Math.floor((Date.now() - new Date(birthday).getTime()) / (365.25 * 24 * 60 * 60 * 1000))}세`
}

function getDebutAge(birthday: string | null, debutDate: string | null): string {
  if (!birthday || !debutDate) return '-'
  return `${Math.floor((new Date(debutDate).getTime() - new Date(birthday).getTime()) / (365.25 * 24 * 60 * 60 * 1000))}세`
}

const defaultScores = { face: 0, bust: 0, hip: 0, physical: 0, skin: 0, acting: 0, sexy: 0, charm: 0, technique: 0, proportions: 0 }

export default function ActorViewModal({ actorId, onClose, onViewWork, zIndex = 60 }: Props) {
  const [actor, setActor] = useState<Actor | null>(null)
  const [fileStatuses, setFileStatuses] = useState<Record<number, boolean>>({})
  const [workSort, setWorkSort] = useState<'release_date' | 'rating'>('release_date')
  const [workSortDir, setWorkSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    actorsApi.get(actorId).then(async (a) => {
      const actor = a as Actor
      setActor(actor)
      const statuses: Record<number, boolean> = {}
      for (const w of actor.works ?? []) {
        for (const f of w.files ?? []) {
          statuses[f.id] = f.type === 'url' ? true : await shellApi.fileExists(f.file_path)
        }
      }
      setFileStatuses(statuses)
    })
  }, [actorId])

  const sortedWorks = useMemo(() => {
    const list = [...(actor?.works ?? [])]
    list.sort((a, b) => {
      let v = 0
      if (workSort === 'rating') v = a.rating - b.rating
      else { const da = a.release_date ?? '', db = b.release_date ?? ''; v = da < db ? -1 : da > db ? 1 : 0 }
      return workSortDir === 'desc' ? -v : v
    })
    return list
  }, [actor?.works, workSort, workSortDir])

  if (!actor) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex }}>
      <div className="bg-gray-800 rounded-lg w-[500px] h-[95vh] flex flex-col relative pointer-events-auto">
        <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-white text-xl leading-none z-10">✕</button>
        <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] p-6 space-y-3">

          {/* 기본 정보 */}
          <div className="flex gap-4 items-start">
            <ImagePreview path={actor.photo_path} alt={actor.name} className="w-28 h-28 rounded flex-shrink-0" />
            <div className="flex-1 pt-1">
              <div className="flex items-center gap-2">
                <h3 className="text-white font-bold text-lg">{actor.name}</h3>
                <span className={`text-2xl leading-none ${actor.is_favorite ? 'text-red-500' : 'text-gray-500'}`}>
                  {actor.is_favorite ? '♥' : '♡'}
                </span>
              </div>
              <div className="grid gap-x-2 text-sm text-gray-400 mt-1" style={{ gridTemplateColumns: 'auto 1fr' }}>
                <span>생년월일</span>
                <span>{actor.birthday || '-'}{actor.birthday ? ` (${getAge(actor.birthday)})` : ''}</span>
                <span>데뷔일</span>
                <span>{actor.debut_date || '-'}{actor.debut_date ? ` (${getDebutAge(actor.birthday ?? null, actor.debut_date)})` : ''}</span>
              </div>
              <p className="text-yellow-400 text-sm mt-1">
                평점 {(actor.avg_score ?? (actor.scores ? Object.values(actor.scores).reduce((a, b) => a + b, 0) / 10 : 0)).toFixed(2)}점
              </p>
            </div>
          </div>

          {/* 신체 */}
          {(actor.height || actor.bust || actor.waist || actor.hip || actor.cup) && (
            <div>
              <p className="text-xs text-gray-500 mb-1">신체</p>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-300">
                  {[
                    actor.height ? `신장 ${actor.height}cm` : '',
                    (actor.bust || actor.waist || actor.hip) ? `B${actor.bust ?? '?'} - W${actor.waist ?? '?'} - H${actor.hip ?? '?'}` : '',
                    actor.cup ? `${actor.cup}컵` : '',
                  ].filter(Boolean).join('  ')}
                </p>
                {actor.ratio_score != null && (
                  <p className="text-sm text-blue-400 shrink-0 ml-2">{actor.ratio_score.toFixed(2)}점</p>
                )}
              </div>
            </div>
          )}

          {/* 레이더 차트 */}
          <div className="flex justify-center">
            <RadarChart scores={actor.scores ?? defaultScores} />
          </div>

          {/* 코멘트 */}
          {actor.comment && (
            <div>
              <p className="text-xs text-gray-500 mb-1">코멘트</p>
              <p className="text-sm text-gray-300 whitespace-pre-wrap">{actor.comment}</p>
            </div>
          )}

          {/* 태그 */}
          {actor.tags && actor.tags.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">태그</p>
              <div className="flex flex-wrap gap-1">
                {[
                  ...(actor.tags.filter((t) => actor.rep_tags?.some((r) => r.id === t.id))),
                  ...(actor.tags.filter((t) => !actor.rep_tags?.some((r) => r.id === t.id))),
                ].map((t) => {
                  const isRep = actor.rep_tags?.some((r) => r.id === t.id)
                  return (
                    <span key={t.id} className={`text-xs px-2 py-0.5 rounded ${isRep ? 'bg-green-700 text-green-200' : 'bg-blue-900/50 text-blue-300'}`}>
                      {t.name}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {/* 출연작 */}
          {sortedWorks.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-gray-500">출연작 ({sortedWorks.length})</p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { if (workSort === 'release_date') setWorkSortDir((d) => d === 'desc' ? 'asc' : 'desc'); else setWorkSort('release_date') }}
                    className={`text-xs px-1.5 py-0.5 rounded ${workSort === 'release_date' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                  >
                    발매일{workSort === 'release_date' ? (workSortDir === 'desc' ? '↓' : '↑') : ''}
                  </button>
                  <button
                    onClick={() => { if (workSort === 'rating') setWorkSortDir((d) => d === 'desc' ? 'asc' : 'desc'); else setWorkSort('rating') }}
                    className={`text-xs px-1.5 py-0.5 rounded ${workSort === 'rating' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                  >
                    평점{workSort === 'rating' ? (workSortDir === 'desc' ? '↓' : '↑') : ''}
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                {sortedWorks.map((w) => {
                  const firstAvailable = w.files?.find((f) => fileStatuses[f.id])
                  return (
                    <div key={w.id} className="flex items-stretch gap-1.5">
                      <div
                        onClick={() => onViewWork(w.id)}
                        className="flex-1 flex gap-2 items-center bg-gray-700 rounded p-2 cursor-pointer hover:bg-gray-600"
                      >
                        <ImagePreview path={w.cover_path} alt={w.product_number || '-'} className="w-16 h-12 rounded flex-shrink-0 object-cover" />
                        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                          <div className="flex items-start justify-between gap-1">
                            <div className="flex flex-wrap gap-0.5 min-w-0">
                              {w.rep_tags?.map((t) => (
                                <span key={t.id} className="bg-blue-900/50 text-blue-300 text-xs px-1.5 py-0.5 rounded">{t.name}</span>
                              ))}
                            </div>
                            <p className="text-sm font-bold text-white flex-shrink-0">{w.product_number || '-'}</p>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="scale-75 origin-left"><Rating value={w.rating} readonly /></div>
                            <p className="text-xs text-gray-400">{w.release_date || '-'}</p>
                          </div>
                        </div>
                      </div>
                      {(w.files?.length ?? 0) > 0 && (
                        <button
                          onClick={() => {
                            if (!firstAvailable) return
                            if (firstAvailable.type === 'url') shellApi.openExternal(firstAvailable.file_path)
                            else shellApi.openPath(firstAvailable.file_path)
                          }}
                          disabled={!firstAvailable}
                          className={`w-7 rounded flex items-center justify-center flex-shrink-0 ${firstAvailable ? 'bg-red-600 hover:bg-red-500' : 'bg-gray-600 opacity-50 cursor-not-allowed'}`}
                        >
                          <span className="text-white text-xs">▶</span>
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
