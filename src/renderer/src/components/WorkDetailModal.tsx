import { useState, useEffect, useRef } from 'react'
import { useEscHandler } from '../escManager'
import type { Work, Tag, Actor } from '../types'
import { worksApi, shellApi } from '../api'
import WorkForm from './WorkForm'
import ImagePreview from './ImagePreview'
import Rating from './Rating'
import CardTooltip, { type TooltipState } from './CardTooltip'
import { hashColor, studioColor } from '../utils/colorHelpers'
import { emitDataChanged } from '../dataEvents'
import MasterRecordModal from './cup/MasterRecordModal'

interface Props {
  workId: number
  onClose: () => void
  onViewActor: (id: number) => void
  zIndex?: number
}

export default function WorkDetailModal({ workId, onClose, onViewActor, zIndex = 60 }: Props) {
  const [work, setWork] = useState<(Work & { actors?: Actor[]; tags?: Tag[] }) | null>(null)
  const [fileStatuses, setFileStatuses] = useState<Record<number, boolean>>({})
  const [showForm, setShowForm] = useState(false)
  const [editWork, setEditWork] = useState<(Work & { actors?: Actor[]; tags?: Tag[] }) | undefined>(undefined)
  const [refreshKey, setRefreshKey] = useState(0)
  const [actorTooltip, setActorTooltip] = useState<TooltipState | null>(null)
  const [showMasterRecord, setShowMasterRecord] = useState(false)

  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEscHandler(() => {
    if (!showForm) onCloseRef.current()
  }, [showForm])

  const loadWork = async () => {
    const detail = await worksApi.get(workId) as Work & { actors?: Actor[]; tags?: Tag[] }
    if (!detail) return
    setWork(detail)
    const files = detail.files ?? []
    const results = await Promise.all(files.map((f) => f.type === 'url' ? Promise.resolve(true) : shellApi.fileExists(f.file_path)))
    setFileStatuses(Object.fromEntries(files.map((f, i) => [f.id, results[i]])))
  }

  useEffect(() => { loadWork() }, [workId])

  const handleEdit = () => {
    if (work) {
      setEditWork(work)
      setShowForm(true)
    }
  }

  const handleDelete = async () => {
    if (work && confirm('정말 삭제하시겠습니까?')) {
      const res = await worksApi.delete(work.id) as { blocked: boolean }
      if (res?.blocked) { alert('진행 중인 월드컵에 참가 중인 작품은 삭제할 수 없습니다.'); return }
      emitDataChanged('work')
      onClose()
    }
  }

  const handleToggleFavorite = async () => {
    if (!work) return
    const next = work.is_favorite ? 0 : 1
    await worksApi.update(work.id, { is_favorite: next })
    setWork({ ...work, is_favorite: next })
  }

  const handleRating = async (rating: number) => {
    if (!work) return
    await worksApi.update(work.id, { rating })
    setWork({ ...work, rating })
  }

  const handleToggleRepTag = async (tagId: number) => {
    if (!work) return
    const currentRepIds = work.rep_tags?.map((t) => t.id) ?? []
    const newRepIds = currentRepIds.includes(tagId)
      ? currentRepIds.filter((id) => id !== tagId)
      : [...currentRepIds, tagId]
    await worksApi.update(work.id, { rep_tag_ids: newRepIds })
    const newRepTags = (work.tags ?? []).filter((t) => newRepIds.includes(t.id))
    setWork({ ...work, rep_tags: newRepTags })
  }

  if (!work) return null

  const firstAvailable = work.files?.find((f) => fileStatuses[f.id])

  return (
    <>
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center" style={{ zIndex }} onClick={onClose}>
        <div className="bg-gray-800 rounded-lg w-[840px] h-[95vh] flex flex-row relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-white text-xl leading-none z-10">✕</button>

          {/* 좌측 */}
          <div className="flex flex-col flex-1 min-w-0">
            <div className="relative rounded-tl-lg overflow-hidden flex-shrink-0" style={{ aspectRatio: '800 / 540' }}>
              <ImagePreview path={work.cover_path} alt="표지" className="w-full h-full" version={refreshKey} />
              <button
                onClick={async () => {
                  if (!firstAvailable) return
                  if (firstAvailable.type === 'url') shellApi.openExternal(firstAvailable.file_path)
                  else await shellApi.openPath(firstAvailable.file_path)
                }}
                className={`absolute inset-0 m-auto w-14 h-14 rounded-full flex items-center justify-center ${
                  firstAvailable ? 'bg-red-600 hover:bg-red-500 cursor-pointer' : 'bg-gray-600 cursor-not-allowed opacity-50'
                }`}
              >
                <svg viewBox="0 0 24 24" className="w-7 h-7 ml-0.5" fill="white">
                  <polygon points="8,5 20,12 8,19" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] p-5 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-white font-bold text-lg">{work.product_number || '-'}</h3>
                {!!work.delete_pending && <span className="text-xs px-1.5 py-0.5 rounded bg-red-900/60 text-red-400">삭제예정</span>}
                <button
                  onClick={handleToggleFavorite}
                  className={`text-2xl leading-none ${work.is_favorite ? 'text-red-500' : 'text-gray-500 hover:text-red-400'}`}
                >
                  {work.is_favorite ? '♥' : '♡'}
                </button>
                <div className="flex-1" />
                <button onClick={() => setShowMasterRecord(true)} className="text-xs px-1.5 py-0.5 rounded bg-yellow-900/60 text-yellow-400 hover:bg-yellow-800/60 transition">☆전적</button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div>
                  {work.studio_name && (
                    <span
                      className="inline-block text-white text-sm px-2 py-0.5 rounded"
                      style={{ backgroundColor: studioColor(work.studio_name, work.studio_color) }}
                    >
                      {work.studio_maker_name && work.studio_maker_name !== work.studio_name ? `${work.studio_maker_name} ${work.studio_name}` : work.studio_name}
                    </span>
                  )}
                </div>
                <Rating value={work.rating} onChange={handleRating} />
              </div>
              <p className="text-sm text-gray-400">발매일 : {work.release_date || '-'}  등록일 : {work.created_at?.slice(0, 10) || '-'}</p>

              {work.actors && work.actors.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">배우</p>
                  <div className="flex flex-wrap gap-1">
                    {[
                      ...(work.actors.filter((a) => work.rep_actors?.some((r) => r.id === a.id))),
                      ...(work.actors.filter((a) => !work.rep_actors?.some((r) => r.id === a.id))),
                    ].map((a) => {
                      const isRep = work.rep_actors?.some((r) => r.id === a.id)
                      return (
                        <span
                          key={a.id}
                          onClick={() => onViewActor(a.id)}
                          onMouseMove={e => setActorTooltip({ type: 'actor', id: a.id, x: e.clientX, y: e.clientY, showCover: true })}
                          onMouseLeave={() => setActorTooltip(null)}
                          className={`text-xs px-2 py-0.5 rounded cursor-pointer ${
                            isRep
                              ? 'bg-fuchsia-700 text-fuchsia-200 hover:bg-fuchsia-600'
                              : 'bg-purple-900/50 text-purple-300 hover:bg-purple-800/50'
                          }`}
                        >
                          {a.name}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}

              {work.comment && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">코멘트</p>
                  <p className="text-sm text-gray-300 whitespace-pre-wrap">{work.comment}</p>
                </div>
              )}

              <div>
                <p className="text-xs text-gray-500 mb-1">재생 경로</p>
                <div className="space-y-1">
                  {(work.files ?? []).map((f) => (
                    <div key={f.id} className="flex items-center gap-2 bg-gray-700/50 rounded px-2 py-1.5">
                      <button
                        onClick={async () => {
                          if (!fileStatuses[f.id]) return
                          if (f.type === 'url') shellApi.openExternal(f.file_path)
                          else await shellApi.openPath(f.file_path)
                        }}
                        className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                          fileStatuses[f.id] ? 'bg-red-600 hover:bg-red-500' : 'bg-gray-600 opacity-50 cursor-not-allowed'
                        }`}
                      >
                        <svg viewBox="0 0 24 24" className="w-2.5 h-2.5 ml-0.5" fill="white">
                          <polygon points="8,5 20,12 8,19" />
                        </svg>
                      </button>
                      {f.type === 'url' ? (
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 flex-shrink-0 text-blue-400" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                      )}
                      <button
                        type="button"
                        title={f.file_path}
                        onClick={() => {
                          if (f.type === 'url') shellApi.openExternal(f.file_path)
                          else if (fileStatuses[f.id]) shellApi.showItemInFolder(f.file_path)
                        }}
                        className={`text-xs flex-1 truncate text-left hover:underline ${
                          fileStatuses[f.id] ? 'text-gray-300 cursor-pointer' : 'text-gray-500 cursor-default'
                        }`}
                      >
                        {f.type === 'url' ? f.file_path : f.file_path.replace(/\\/g, '/').split('/').slice(3).join('/')}
                      </button>
                      {f.type === 'local' && (
                        <span className={`text-xs flex-shrink-0 ${fileStatuses[f.id] ? 'text-green-400' : 'text-red-400'}`}>
                          {fileStatuses[f.id] ? '●' : '✗'}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={handleEdit} className="bg-gray-600 hover:bg-gray-500 text-white text-sm px-3 py-1.5 rounded flex-1">
                  수정
                </button>
                <button onClick={handleDelete} className="bg-red-700 hover:bg-red-600 text-white text-sm px-3 py-1.5 rounded flex-1">
                  삭제
                </button>
              </div>
              <button
                onClick={async () => {
                  if (!confirm('파일이 있는 폴더를 휴지통으로 보내시겠습니까?')) return
                  const filePaths = (work.files ?? []).filter((f) => f.type === 'local').map((f) => f.file_path)
                  const deleted = await shellApi.trashFolders(filePaths)
                  alert(`${deleted}개 폴더를 휴지통으로 이동했습니다`)
                  loadWork()
                }}
                className="w-full bg-orange-700 hover:bg-orange-600 text-white text-sm px-3 py-1.5 rounded"
              >
                폴더 삭제
              </button>
            </div>
          </div>

          {/* 우측 - 타이틀 + 태그 */}
          <div className="w-[330px] border-l border-gray-700 overflow-y-auto [scrollbar-gutter:stable] p-4 space-y-3">
            {work.title && (
              <div>
                <p className="text-xs text-gray-500 mb-1">타이틀</p>
                <p className="text-sm text-gray-300 whitespace-pre-wrap">{work.title}</p>
              </div>
            )}

            {work.tags && work.tags.length > 0 && (() => {
              type Group = { catId: number | null; catName: string | null; sortOrder: number; tags: typeof work.tags }
              const catMap = new Map<number | null, Group>()
              const groups: Group[] = []
              const sorted = [...work.tags!].sort((a, b) => {
                const ao = a.category_sort_order ?? 999999
                const bo = b.category_sort_order ?? 999999
                if (ao !== bo) return ao - bo
                const ar = work.rep_tags?.some((r) => r.id === a.id) ? 0 : 1
                const br = work.rep_tags?.some((r) => r.id === b.id) ? 0 : 1
                if (ar !== br) return ar - br
                return a.name.localeCompare(b.name)
              })
              for (const tag of sorted) {
                const key = tag.category_id ?? null
                if (!catMap.has(key)) {
                  const g: Group = { catId: key, catName: tag.category_name ?? null, sortOrder: tag.category_sort_order ?? 999999, tags: [] }
                  catMap.set(key, g)
                  groups.push(g)
                }
                catMap.get(key)!.tags.push(tag)
              }
              return (
                <div>
                  <p className="text-xs text-gray-500 mb-1">태그</p>
                  <div className="space-y-1">
                    {groups.map((g) => (
                      <div key={g.catId ?? 'none'}>
                        <p className="text-xs text-gray-600 mb-0.5">{g.catName ?? '미분류'}</p>
                        <div className="flex flex-wrap gap-1">
                          {g.tags.map((t) => {
                            const isRep = work.rep_tags?.some((r) => r.id === t.id)
                            return (
                              <span
                                key={t.id}
                                onClick={() => handleToggleRepTag(t.id)}
                                title={isRep ? '대표 태그 해제' : '대표 태그로 설정'}
                                className={`text-xs px-2 py-0.5 rounded cursor-pointer ${
                                  isRep ? 'bg-green-600 text-white hover:bg-green-500' : 'bg-blue-600 text-white hover:bg-blue-500'
                                }`}
                              >
                                {t.name}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      </div>

      {actorTooltip && <CardTooltip tooltip={actorTooltip} />}

      {/* 수정 모달 */}
      {showForm && (
        <WorkForm
          work={editWork}
          onSave={() => { setShowForm(false); setRefreshKey(k => k + 1); loadWork(); emitDataChanged('work') }}
          onCancel={() => setShowForm(false)}
        />
      )}
      {showMasterRecord && work && (
        <MasterRecordModal
          type="work"
          itemId={work.id}
          itemName={work.product_number ?? work.title ?? `#${work.id}`}
          itemImage={work.cover_path ?? null}
          onClose={() => setShowMasterRecord(false)}
        />
      )}
    </>
  )
}
