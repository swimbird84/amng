import type { Work } from '../types'
import ImagePreview from './ImagePreview'
import Rating from './Rating'
import { studioColor } from '../utils/colorHelpers'
import { getDivision, DIV_LABEL, DIV_COLOR } from './cup/cupConstants'

interface WorkCardProps {
  work: Work
  refreshKey: number
  selected?: boolean
  deleteMode?: boolean
  deleteSelected?: boolean
  filePlayable?: boolean
  masterPoints?: { rank: number; total_points: number; master_run_count: number }
  onClick?: () => void
  onMouseDown?: (e: React.MouseEvent) => void
  onMouseEnter?: () => void
  onTooltipMove?: (e: React.MouseEvent) => void
  onTooltipLeave?: () => void
  onToggleFavorite?: (e: React.MouseEvent) => void
  onPlay?: (e: React.MouseEvent) => void
}

export default function WorkCard({
  work: w, refreshKey, selected, deleteMode, deleteSelected,
  filePlayable, masterPoints: mp,
  onClick, onMouseDown, onMouseEnter,
  onTooltipMove, onTooltipLeave, onToggleFavorite, onPlay,
}: WorkCardProps) {
  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={`relative cursor-pointer rounded-lg border ring-2 flex flex-col ${
        deleteMode
          ? deleteSelected
            ? 'border-red-500 ring-red-500'
            : 'border-gray-700 ring-transparent hover:border-red-400'
          : selected
            ? 'border-blue-500 ring-blue-500'
            : 'border-gray-700 ring-transparent hover:border-gray-500'
      }`}
    >
      <div
        className="relative rounded-t-lg overflow-hidden"
        onMouseMove={onTooltipMove}
        onMouseLeave={onTooltipLeave}
      >
        <ImagePreview path={w.cover_path} alt={w.title || ''} className="w-full h-40" version={refreshKey} />
        {deleteMode && deleteSelected && (
          <div className="absolute inset-0 bg-red-500/30 flex items-center justify-center pointer-events-none">
            <span className="text-white text-4xl font-bold drop-shadow"></span>
          </div>
        )}
        {w.studio_name && (
          <div className="absolute top-1 left-1 max-w-[70%]" style={{ lineHeight: 0 }}>
            <span
              className="text-white text-xs px-1.5 rounded"
              style={{ backgroundColor: studioColor(w.studio_name, w.studio_color), display: 'inline', WebkitBoxDecorationBreak: 'clone', boxDecorationBreak: 'clone', lineHeight: '1.5', verticalAlign: 'top' } as any}
            >
              {w.studio_maker_name && w.studio_maker_name !== w.studio_name
                ? <><span style={{ whiteSpace: 'nowrap' }}>{w.studio_maker_name}</span>{' '}<span style={{ whiteSpace: 'nowrap' }}>{w.studio_name}</span></>
                : w.studio_name}
            </span>
          </div>
        )}
        <button
          onClick={onToggleFavorite}
          className="absolute top-1 right-1 text-lg leading-none drop-shadow"
        >
          {w.is_favorite ? '\u2665' : '\u2661'}
        </button>
        {/* Play button */}
        {filePlayable !== undefined && (
          <button
            onClick={(e) => { e.stopPropagation(); if (filePlayable && onPlay) onPlay(e) }}
            className={`absolute inset-0 m-auto w-10 h-10 rounded-full flex items-center justify-center transition-opacity ${
              filePlayable ? 'bg-red-600 hover:bg-red-500 cursor-pointer opacity-70 hover:opacity-100' : 'bg-gray-600 cursor-default opacity-50'
            }`}
          >
            <span className="text-white text-lg ml-0.5">{'\u25B6'}</span>
          </button>
        )}
      </div>
      <div className="p-2 bg-gray-800 flex-1">
        <div className="flex items-center justify-between gap-1">
          <p className="text-sm font-bold text-white truncate flex-1">{w.product_number || '-'}</p>
          <div className="flex-shrink-0">
            <Rating value={w.rating} readonly small />
          </div>
        </div>
        {mp && (() => {
          const div = getDivision(mp.rank, mp.master_run_count, 'work')
          const isUnranked = mp.master_run_count === 0
          return (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <span className={`text-[10px] px-1 py-0.5 rounded ${DIV_COLOR[div]}`}>{DIV_LABEL[div]}</span>
                <span className={`text-xs ${isUnranked ? 'text-gray-500' : 'text-green-400'}`}>#{isUnranked ? '-' : `${mp.rank}\uC704`}</span>
              </div>
              <span className={`text-xs ${isUnranked ? 'text-gray-500' : 'text-green-400'}`}>{isUnranked ? '-' : mp.total_points.toFixed(1)}pt</span>
            </div>
          )
        })()}
        <p className="text-xs text-gray-500">\uBC1C\uB9E4\uC77C:{w.release_date || '-'} \uB4F1\uB85D\uC77C:{w.created_at?.slice(0, 10) || '-'}</p>
        {w.rep_actors && w.rep_actors.length > 0 && (
          <div className="flex flex-wrap gap-0.5 mt-0.5">
            {w.rep_actors.map((a) => (
              <span key={a.id} className="bg-purple-900/50 text-purple-300 text-xs px-1.5 py-0.5 rounded">
                {a.name}
              </span>
            ))}
          </div>
        )}
        {w.rep_tags && w.rep_tags.length > 0 && (
          <div className="flex flex-wrap gap-0.5 mt-0.5">
            {w.rep_tags.map((t) => (
              <span key={t.id} className="bg-blue-900/50 text-blue-300 text-xs px-1.5 py-0.5 rounded">
                {t.name}
              </span>
            ))}
          </div>
        )}
        {w.title && <p className="text-xs text-gray-400 truncate">{w.title}</p>}
      </div>
    </div>
  )
}
