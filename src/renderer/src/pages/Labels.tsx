import { useState, useEffect, useMemo } from 'react'
import type { Work } from '../types'
import { studiosApi, worksApi } from '../api'
import ImagePreview from '../components/ImagePreview'
import StudioManager from '../components/StudioManager'

interface StudioWithCount {
  id: number
  name: string
  color: string | null
  work_count: number
}

function hashColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return `hsl(${Math.abs(hash) % 360}, 65%, 45%)`
}

function studioColor(name: string, color?: string | null): string {
  return color || hashColor(name)
}

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

interface Props {
  onNavigateToWork: (id: number) => void
}

export default function Labels({ onNavigateToWork }: Props) {
  const [studios, setStudios] = useState<StudioWithCount[]>([])
  const [keyword, setKeyword] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'count' | 'id'>(
    (localStorage.getItem('labels:sortBy') as 'name' | 'count' | 'id') || 'count'
  )
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(
    (localStorage.getItem('labels:sortDir') as 'asc' | 'desc') || 'desc'
  )
  const [selectedStudioId, setSelectedStudioId] = useState<number | null>(null)
  const [studioWorks, setStudioWorks] = useState<Work[]>([])
  const [studioYearSortDir, setStudioYearSortDir] = useState<'asc' | 'desc'>(
    (localStorage.getItem('labels:yearSortDir') as 'asc' | 'desc') || 'asc'
  )
  const [showManager, setShowManager] = useState(false)
  const [hoveredId, setHoveredId] = useState<number | null>(null)

  const loadStudios = async () => {
    setStudios(await studiosApi.list(true) as StudioWithCount[])
  }

  useEffect(() => { loadStudios() }, [])

  const filteredStudios = useMemo(() => {
    let list = [...studios]
    if (keyword) list = list.filter((s) => s.name.toLowerCase().includes(keyword.toLowerCase()))
    list.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      if (sortBy === 'name') return a.name.localeCompare(b.name, 'en-US') * dir
      if (sortBy === 'id') return (a.id - b.id) * dir
      return (a.work_count - b.work_count) * dir
    })
    return list
  }, [studios, keyword, sortBy, sortDir])

  const handleSelectStudio = async (id: number) => {
    if (selectedStudioId === id) {
      setSelectedStudioId(null)
      setStudioWorks([])
      return
    }
    setSelectedStudioId(id)
    const works = await worksApi.list({ studioId: id, sortBy: 'release_date', sortDir: 'asc' }) as Work[]
    setStudioWorks(works)
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4">
        <div className="flex items-center">
          <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5">
            <select
              value={sortBy}
              onChange={(e) => { const v = e.target.value as typeof sortBy; setSortBy(v); localStorage.setItem('labels:sortBy', v) }}
              className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-28"
            >
              <option value="name">이름</option>
              <option value="count">작품수</option>
              <option value="id">등록일</option>
            </select>
            <button
              onClick={() => setSortDir((d) => { const next = d === 'asc' ? 'desc' : 'asc'; localStorage.setItem('labels:sortDir', next); return next })}
              className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-2 py-1.5 rounded"
            >
              {sortDir === 'asc' ? '↑' : '↓'}
            </button>
          </div>
          <div className="w-[30rem] shrink-0 flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5 ml-2">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="이름 검색..."
              className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded flex-1"
            />
            <button
              onClick={() => setKeyword('')}
              className="px-3 py-1.5 rounded text-sm bg-gray-600 hover:bg-gray-500 text-gray-300"
            >
              초기화
            </button>
          </div>
          <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5 ml-2">
            <button
              onClick={() => setShowManager(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-sm"
            >
              + 레이블 관리
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-4 pb-4">
        {filteredStudios.length > 0 ? (
          <>
            <div className="grid grid-cols-6 gap-1.5 mb-4">
              {filteredStudios.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleSelectStudio(s.id)}
                  onMouseEnter={() => setHoveredId(s.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  title={s.name}
                  className={`py-1.5 px-2 rounded text-center transition-colors ${selectedStudioId === s.id || hoveredId === s.id ? 'text-white' : 'bg-gray-700 text-gray-300'}`}
                  style={selectedStudioId === s.id || hoveredId === s.id ? { backgroundColor: studioColor(s.name, s.color) } : undefined}
                >
                  <p className="text-xs font-bold truncate">{s.name}</p>
                  <p className="text-xs">{s.work_count}편</p>
                </button>
              ))}
            </div>

            {selectedStudioId !== null && studioWorks.length > 0 && (() => {
              const byYear = new Map<string, Work[]>()
              for (const w of studioWorks) {
                const year = w.release_date?.slice(0, 4) ?? '연도미상'
                if (!byYear.has(year)) byYear.set(year, [])
                byYear.get(year)!.push(w)
              }
              const sortedYears = Array.from(byYear.keys()).sort((a, b) =>
                studioYearSortDir === 'asc' ? a.localeCompare(b) : b.localeCompare(a)
              )
              const selected = studios.find((s) => s.id === selectedStudioId)!
              return (
                <div className="border border-gray-700 rounded-lg p-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <p className="text-base font-bold" style={{ color: studioColor(selected.name, selected.color) }}>{selected.name}</p>
                    <button
                      onClick={() => {
                        const next = studioYearSortDir === 'asc' ? 'desc' : 'asc'
                        setStudioYearSortDir(next)
                        localStorage.setItem('labels:yearSortDir', next)
                      }}
                      className="px-2 py-0.5 rounded text-xs bg-blue-600 hover:bg-blue-500 text-white"
                    >
                      연도순{studioYearSortDir === 'asc' ? ' ↑' : ' ↓'}
                    </button>
                  </div>
                  {sortedYears.map((year) => {
                    const works = byYear.get(year)!
                    return (
                      <div key={year} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-400 flex-shrink-0">{year}년 {works.length}편</span>
                          <div className="flex-1 border-t border-gray-700" />
                        </div>
                        <div className="grid grid-cols-10 gap-2">
                          {works.map((w) => (
                            <WorkMiniCard key={w.id} work={w} onClick={() => onNavigateToWork(w.id)} />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </>
        ) : (
          <p className="text-gray-500 text-sm">레이블이 없습니다</p>
        )}
      </div>

      {showManager && (
        <StudioManager onClose={() => { setShowManager(false); loadStudios() }} />
      )}
    </div>
  )
}
