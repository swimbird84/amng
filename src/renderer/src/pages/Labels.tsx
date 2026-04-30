import { useState, useEffect, useMemo } from 'react'
import type React from 'react'
import type { Work } from '../types'
import { studiosApi, makersApi, worksApi } from '../api'
import ImagePreview from '../components/ImagePreview'
import StudioManager from '../components/StudioManager'
import MakerManager from '../components/MakerManager'

interface StudioWithCount {
  id: number
  name: string
  color: string | null
  work_count: number
  maker_id: number | null
  maker_name: string | null
  maker_color: string | null
}

interface MakerWithCount {
  id: number
  name: string
  color: string | null
  studio_count: number
}

function hashColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return `hsl(${Math.abs(hash) % 360}, 65%, 45%)`
}

function resolvedColor(name: string, color?: string | null): string {
  return color || hashColor(name)
}

function ColorButton({ color, isSelected, onClick, title, children }: {
  color: string
  isSelected: boolean
  onClick: () => void
  title?: string
  children: React.ReactNode
}) {
  const [hovered, setHovered] = useState(false)
  const active = isSelected || hovered
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`py-1.5 px-2 rounded text-center transition-colors ${active ? 'text-white' : 'bg-gray-700 text-gray-300'}`}
      style={active ? { backgroundColor: color } : undefined}
    >
      {children}
    </button>
  )
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
  const [makers, setMakers] = useState<MakerWithCount[]>([])
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
  const [showMakerManager, setShowMakerManager] = useState(false)
  const [expandedMakerId, setExpandedMakerId] = useState<string | null>(null)

  const loadAll = async () => {
    const [s, m] = await Promise.all([
      studiosApi.list(true) as Promise<StudioWithCount[]>,
      makersApi.list(true) as Promise<MakerWithCount[]>,
    ])
    setStudios(s)
    setMakers(m)
  }

  useEffect(() => { loadAll() }, [])

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

  const toggleMaker = (key: string) => {
    setExpandedMakerId(prev => {
      if (prev === key) return null
      setSelectedStudioId(null)
      setStudioWorks([])
      return key
    })
  }

  // 필터링 + 정렬된 스튜디오
  const filteredStudios = useMemo(() => {
    let list = keyword ? studios.filter(s => s.name.toLowerCase().includes(keyword.toLowerCase())) : [...studios]
    const dir = sortDir === 'asc' ? 1 : -1
    if (sortBy === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'en-US') * dir)
    else if (sortBy === 'id') list.sort((a, b) => (a.id - b.id) * dir)
    else list.sort((a, b) => (a.work_count - b.work_count) * dir)
    return list
  }, [studios, keyword, sortBy, sortDir])

  // 제작사별 그룹
  const makerGroups = useMemo(() => {
    type Group = { makerId: string; makerName: string; makerColor: string | null; studios: StudioWithCount[] }
    const groups: Group[] = []
    const groupMap = new Map<string, Group>()

    // 등록된 제작사 순서 기준 (makers 배열 순)
    for (const maker of makers) {
      const key = String(maker.id)
      const g: Group = { makerId: key, makerName: maker.name, makerColor: maker.color, studios: [] }
      groupMap.set(key, g)
      groups.push(g)
    }
    // 미분류 그룹
    const noneGroup: Group = { makerId: '__none__', makerName: 'UNDEFINED', makerColor: null, studios: [] }
    groupMap.set('__none__', noneGroup)
    groups.push(noneGroup)

    for (const s of filteredStudios) {
      const key = s.maker_id != null ? String(s.maker_id) : '__none__'
      groupMap.get(key)?.studios.push(s)
    }

    return groups
  }, [makers, filteredStudios])

  const selectedStudio = studios.find(s => s.id === selectedStudioId)

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
              placeholder="레이블 검색"
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
            <button
                onClick={() => setShowMakerManager(true)}
                className="bg-purple-700 hover:bg-purple-600 text-white px-3 py-1.5 rounded text-sm"
            >
              + 제작사 관리
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-4 pb-4 space-y-4">
        {/* 제작사 버튼 전체 */}
        {makerGroups.some(g => g.studios.length > 0) ? (
          <div className="grid grid-cols-6 gap-1.5">
            {makerGroups.filter(g => g.studios.length > 0).map((group) => {
              const isExpanded = expandedMakerId === group.makerId
              const isNone = group.makerId === '__none__'
              const makerColor = resolvedColor(group.makerName, group.makerColor)
              const totalWorks = group.studios.reduce((sum, s) => sum + s.work_count, 0)
              return (
                <ColorButton
                  key={group.makerId}
                  color={isNone ? '#374151' : makerColor}
                  isSelected={isExpanded}
                  onClick={() => toggleMaker(group.makerId)}
                  title={group.makerName}
                >
                  <p className="text-xs font-bold truncate">{group.makerName}</p>
                  <p className="text-xs">레이블:{group.studios.length}개 작품:{totalWorks}편</p>
                </ColorButton>
              )
            })}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">레이블이 없습니다</p>
        )}

        {/* 선택된 제작사의 레이블 버튼 */}
        {expandedMakerId && (() => {
          const group = makerGroups.find(g => g.makerId === expandedMakerId)
          if (!group) return null
          return (
            <div className="grid grid-cols-6 gap-1.5">
              {group.studios.map((s) => (
                <ColorButton
                  key={s.id}
                  color={resolvedColor(s.name, s.color)}
                  isSelected={selectedStudioId === s.id}
                  onClick={() => handleSelectStudio(s.id)}
                  title={s.name}
                >
                  <p className="text-xs font-bold truncate">{s.name}</p>
                  <p className="text-xs">{s.work_count}편</p>
                </ColorButton>
              ))}
            </div>
          )
        })()}

        {/* 선택된 레이블의 작품 목록 */}
        {selectedStudioId !== null && selectedStudio && studioWorks.length > 0 && (() => {
          const byYear = new Map<string, Work[]>()
          for (const w of studioWorks) {
            const year = w.release_date?.slice(0, 4) ?? '연도미상'
            if (!byYear.has(year)) byYear.set(year, [])
            byYear.get(year)!.push(w)
          }
          const sortedYears = Array.from(byYear.keys()).sort((a, b) =>
            studioYearSortDir === 'asc' ? a.localeCompare(b) : b.localeCompare(a)
          )
          return (
            <div className="border border-gray-700 rounded-lg p-4 space-y-4">
              <div className="flex items-center gap-2">
                <p className="text-base font-bold" style={{ color: resolvedColor(selectedStudio.name, selectedStudio.color) }}>{selectedStudio.name}</p>
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
      </div>

      {showManager && (
        <StudioManager onClose={() => { setShowManager(false); loadAll() }} />
      )}
      {showMakerManager && (
        <MakerManager onClose={() => { setShowMakerManager(false); loadAll() }} />
      )}
    </div>
  )
}
