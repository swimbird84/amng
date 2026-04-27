import { useState, useEffect } from 'react'
import type { Work } from '../types'
import { worksApi, shellApi } from '../api'
import ImagePreview from './ImagePreview'
import Rating from './Rating'

interface Props {
  workId: number
  onClose: () => void
  onViewActor: (id: number) => void
  zIndex?: number
}

function hashColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return `hsl(${Math.abs(hash) % 360}, 65%, 45%)`
}

function studioColor(name: string, color?: string | null): string {
  return color || hashColor(name)
}

export default function WorkViewModal({ workId, onClose, onViewActor, zIndex = 60 }: Props) {
  const [work, setWork] = useState<Work | null>(null)
  const [fileStatuses, setFileStatuses] = useState<Record<number, boolean>>({})

  useEffect(() => {
    worksApi.get(workId).then(async (w) => {
      const work = w as Work
      setWork(work)
      const statuses: Record<number, boolean> = {}
      for (const f of work.files ?? []) {
        statuses[f.id] = f.type === 'url' ? true : await shellApi.fileExists(f.file_path)
      }
      setFileStatuses(statuses)
    })
  }, [workId])

  if (!work) return null

  const firstAvailable = work.files?.find((f) => fileStatuses[f.id])

  return (
    <div className="fixed inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex }}>
      <div className="bg-gray-800 rounded-lg w-[560px] h-[95vh] flex flex-col relative pointer-events-auto">
        <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-white text-xl leading-none z-10">✕</button>

        {/* 커버 + 재생 버튼 */}
        <div className="relative rounded-t-lg overflow-hidden flex-shrink-0" style={{ aspectRatio: '800 / 540' }}>
          <ImagePreview path={work.cover_path} alt="표지" className="w-full h-full" />
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

          {/* 품번 + 찜 */}
          <div className="flex items-start justify-between">
            <h3 className="text-white font-bold text-lg">{work.product_number || '-'}</h3>
            <span className={`text-2xl leading-none ml-2 ${work.is_favorite ? 'text-red-500' : 'text-gray-500'}`}>
              {work.is_favorite ? '♥' : '♡'}
            </span>
          </div>

          {/* 레이블 */}
          {work.studio_name && (
            <span
              className="inline-block text-white text-sm px-2 py-0.5 rounded"
              style={{ backgroundColor: studioColor(work.studio_name, work.studio_color) }}
            >
              {work.studio_name}
            </span>
          )}

          {/* 발매일 */}
          <p className="text-sm text-gray-400">{work.release_date || '-'}</p>

          {/* 별점 (읽기 전용) */}
          <Rating value={work.rating} readonly />

          {/* 코멘트 */}
          {work.comment && (
            <div>
              <p className="text-xs text-gray-500 mb-1">코멘트</p>
              <p className="text-sm text-gray-300 whitespace-pre-wrap">{work.comment}</p>
            </div>
          )}

          {/* 배우 */}
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

          {/* 태그 */}
          {work.tags && work.tags.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">태그</p>
              <div className="flex flex-wrap gap-1">
                {[
                  ...(work.tags.filter((t) => work.rep_tags?.some((r) => r.id === t.id))),
                  ...(work.tags.filter((t) => !work.rep_tags?.some((r) => r.id === t.id))),
                ].map((t) => {
                  const isRep = work.rep_tags?.some((r) => r.id === t.id)
                  return (
                    <span key={t.id} className={`text-xs px-2 py-0.5 rounded ${isRep ? 'bg-green-700 text-green-200' : 'bg-blue-900/50 text-blue-300'}`}>
                      {t.name}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {/* 재생 경로 */}
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
                    {f.type === 'url' ? f.file_path : f.file_path.replace(/^[A-Za-z]:[/\\]/, '')}
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

        </div>
      </div>
    </div>
  )
}
