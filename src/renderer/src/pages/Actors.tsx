import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Actor, Tag, Work } from '../types'
import { actorsApi, actorTagsApi, shellApi } from '../api'
import SearchBar, { type ActorSearchParams } from '../components/SearchBar'
import ActorForm from '../components/ActorForm'
import ImagePreview from '../components/ImagePreview'
import Rating from '../components/Rating'
import RadarChart from '../components/RadarChart'
import PhysicalCorrectionModal, { calcPhysicalScore, computeStats, loadSettings, type ActorPhysicalData } from '../components/PhysicalCorrectionModal'

function getAge(birthday: string | null): string {
  if (!birthday) return '-'
  const diff = Date.now() - new Date(birthday).getTime()
  const age = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000))
  return `${age}세`
}

function getDebutAge(birthday: string | null, debutDate: string | null): string {
  if (!birthday || !debutDate) return '-'
  const diff = new Date(debutDate).getTime() - new Date(birthday).getTime()
  const age = Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000))
  return `${age}세`
}

interface ActorsProps {
  onNavigateToWork?: (id: number) => void
}

export default function Actors({ onNavigateToWork }: ActorsProps) {
  const [actors, setActors] = useState<Actor[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [selected, setSelected] = useState<(Actor & { works?: Work[]; tags?: Tag[] }) | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [favoriteOnly, setFavoriteOnly] = useState(false)
  const [editActor, setEditActor] = useState<(Actor & { tags?: Tag[] }) | undefined>(undefined)
  const [search, setSearch] = useState<ActorSearchParams>(() => {
    try {
      const saved = localStorage.getItem('actors:search')
      return saved ? JSON.parse(saved) : { keyword: '', tagIds: [], tagMode: 'and' }
    } catch {
      return { keyword: '', tagIds: [], tagMode: 'and' }
    }
  })
  const [sortBy, setSortBy] = useState<'name' | 'avg_score' | 'birthday' | 'work_count' | 'created_at' | 'debut_date' | 'ratio_score'>(
    (localStorage.getItem('actors:sortBy') as 'name' | 'avg_score' | 'birthday' | 'work_count' | 'created_at' | 'debut_date' | 'ratio_score') || 'avg_score'
  )
  const [showPhysical, setShowPhysical] = useState(false)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(
    (localStorage.getItem('actors:sortDir') as 'asc' | 'desc') || 'desc'
  )
  const [workSort, setWorkSort] = useState<'release_date' | 'rating'>('release_date')
  const [workSortDir, setWorkSortDir] = useState<'desc' | 'asc'>('desc')
  const [hoverCover, setHoverCover] = useState<string | null>(null)
  const [physScoreMap, setPhysScoreMap] = useState<Map<number, number>>(new Map())

  const computePhysScores = useCallback(async () => {
    const data = await actorsApi.physicalData() as ActorPhysicalData[]
    const settings = loadSettings()
    const stats = computeStats(data)
    const map = new Map<number, number>()
    for (const a of data) {
      const score = calcPhysicalScore(a, settings, stats)
      if (score !== null) map.set(a.id, score)
    }
    setPhysScoreMap(map)
  }, [])

  const loadActors = useCallback(async () => {
    const params: Record<string, unknown> = {}
    if (search.keyword) params.keyword = search.keyword
    if (search.tagIds.length) { params.tagIds = search.tagIds; params.tagMode = search.tagMode }
    if (sortBy !== 'ratio_score') {
      params.sortBy = sortBy
      params.sortDir = sortDir
    }
    if (favoriteOnly) params.favoriteOnly = true
    const list = await actorsApi.list(params) as Actor[]
    setActors(list)
  }, [search, sortBy, sortDir, favoriteOnly])

  const displayActors = useMemo(() => {
    if (sortBy !== 'ratio_score') return actors
    return [...actors].sort((a, b) => {
      const sa = physScoreMap.get(a.id) ?? -1
      const sb = physScoreMap.get(b.id) ?? -1
      return sortDir === 'desc' ? sb - sa : sa - sb
    })
  }, [actors, sortBy, sortDir, physScoreMap])

  const loadTags = async () => {
    setTags(await actorTagsApi.list() as Tag[])
  }

  useEffect(() => { loadActors() }, [loadActors])
  useEffect(() => { loadTags() }, [])
  useEffect(() => {
    computePhysScores()
    window.addEventListener('physicalSettingsChange', computePhysScores)
    return () => window.removeEventListener('physicalSettingsChange', computePhysScores)
  }, [computePhysScores])
  useEffect(() => { localStorage.setItem('actors:search', JSON.stringify(search)) }, [search])

  const handleSelect = async (id: number) => {
    const detail = await actorsApi.get(id) as Actor & { works?: Work[]; tags?: Tag[] }
    setSelected(detail)
  }

  const handleEdit = () => {
    if (selected) {
      setEditActor(selected)
      setShowForm(true)
    }
  }

  const handleDelete = async () => {
    if (selected && confirm('정말 삭제하시겠습니까?')) {
      await actorsApi.delete(selected.id)
      setSelected(null)
      loadActors()
    }
  }

  const defaultScores = { face: 0, bust: 0, hip: 0, physical: 0, skin: 0, acting: 0, sexy: 0, charm: 0, technique: 0, proportions: 0 }

  const sortedWorks = useMemo(() => {
    const list = [...(selected?.works ?? [])]
    list.sort((a, b) => {
      let v = 0
      if (workSort === 'rating') {
        v = a.rating - b.rating
      } else {
        const da = a.release_date ?? ''
        const db = b.release_date ?? ''
        v = da < db ? -1 : da > db ? 1 : 0
      }
      return workSortDir === 'desc' ? -v : v
    })
    return list
  }, [selected?.works, workSort, workSortDir])

  const handleToggleRepTag = async (tagId: number) => {
    if (!selected) return
    const currentRepIds = selected.rep_tags?.map((t) => t.id) ?? []
    const newRepIds = currentRepIds.includes(tagId)
      ? currentRepIds.filter((id) => id !== tagId)
      : [...currentRepIds, tagId]
    await actorsApi.update(selected.id, { rep_tag_ids: newRepIds })
    const newRepTags = (selected.tags ?? []).filter((t) => newRepIds.includes(t.id))
    setSelected({ ...selected, rep_tags: newRepTags })
    loadActors()
  }

  const handleToggleFavorite = async (id: number, current: number, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const next = current ? 0 : 1
    await actorsApi.update(id, { is_favorite: next })
    loadActors()
    if (selected?.id === id) {
      setSelected({ ...selected, is_favorite: next })
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* 목록 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4">
          <div className="flex items-center">
            <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5">
              <select
                value={sortBy}
                onChange={(e) => { const v = e.target.value as typeof sortBy; setSortBy(v); localStorage.setItem('actors:sortBy', v) }}
                className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-28"
              >
                <option value="created_at">등록일</option>
                <option value="name">이름</option>
                <option value="avg_score">평점</option>
                <option value="ratio_score">피지컬</option>
                <option value="birthday">생년월일</option>
                <option value="debut_date">데뷔일</option>
                <option value="work_count">작품수</option>
              </select>
              <button
                onClick={() => setSortDir((d) => { const next = d === 'asc' ? 'desc' : 'asc'; localStorage.setItem('actors:sortDir', next); return next })}
                className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-2 py-1.5 rounded"
              >
                {sortDir === 'asc' ? '↑' : '↓'}
              </button>
            </div>
            <div className="w-[30rem] shrink-0 flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5 ml-2">
              <SearchBar type="actors" params={search} onChange={setSearch} tags={tags} />
            </div>
            <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5 ml-2">
              <button
                onClick={() => { setEditActor(undefined); setShowForm(true) }}
                className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-sm"
              >
                + 배우 등록
              </button>
              <button
                onClick={() => setShowPhysical(true)}
                className="bg-fuchsia-700 hover:bg-fuchsia-600 text-white px-3 py-1.5 rounded text-sm"
              >
                피지컬 계산기
              </button>
              <button
                  onClick={() => setFavoriteOnly((v) => !v)}
                  className="bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded text-sm"
              >
                {favoriteOnly ? '♥' : '♡'}
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pt-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {displayActors.map((a) => (
              <div
                key={a.id}
                onClick={() => handleSelect(a.id)}
                className={`cursor-pointer rounded-lg overflow-hidden border ring-2 ${
                  selected?.id === a.id
                    ? 'border-blue-500 ring-blue-500'
                    : 'border-gray-700 ring-transparent hover:border-gray-500'
                }`}
              >
                <div className="relative">
                  <ImagePreview path={a.photo_path} alt={a.name} className="w-full h-40" />
                  <button
                    onClick={(e) => handleToggleFavorite(a.id, a.is_favorite, e)}
                    className="absolute top-1 right-1 text-lg leading-none drop-shadow"
                  >
                    {a.is_favorite ? '♥' : '♡'}
                  </button>
                </div>
                <div className="p-2 bg-gray-800">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-sm font-bold text-white truncate flex-1">{a.name}</p>
                    <p className="text-sm font-bold text-yellow-400 flex-shrink-0">{(a.avg_score ?? 0).toFixed(2)}점</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400">{a.birthday || '-'} ({getAge(a.birthday)})</p>
                    <p className="text-xs text-gray-400">총{a.work_count ?? 0}편</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400">
                      {[
                        a.height ? `${a.height}cm` : '',
                        (a.bust || a.waist || a.hip) ? `B${a.bust ?? '?'}-W${a.waist ?? '?'}-H${a.hip ?? '?'}` : '',
                        a.cup ? `${a.cup}컵` : '',
                      ].filter(Boolean).join(' ') || '-'}
                    </p>
                    {(physScoreMap.get(a.id) != null || a.ratio_score != null) && (
                      <p className="text-xs text-blue-400 shrink-0">{(physScoreMap.get(a.id) ?? a.ratio_score!).toFixed(2)}점</p>
                    )}
                  </div>
                  {a.rep_tags && a.rep_tags.length > 0 && (
                    <div className="flex flex-wrap gap-0.5 mt-0.5">
                      {a.rep_tags.map((t) => (
                        <span key={t.id} className="bg-blue-900/50 text-blue-300 text-xs px-1.5 py-0.5 rounded">
                          {t.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {actors.length === 0 && (
            <p className="text-gray-500 text-center mt-10">등록된 배우가 없습니다</p>
          )}
        </div>
      </div>

      {/* 표지 호버 프리뷰 */}
      {hoverCover && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{ right: 'calc((100vw + 500px) / 2 + 16px)', top: '50%', transform: 'translateY(-50%)', width: 'calc((100vw - 500px) / 2 - 32px)', maxHeight: '80vh' }}
        >
          <ImagePreview path={hoverCover} alt="표지 미리보기" className="w-full h-full object-contain rounded-lg shadow-2xl" style={{ maxHeight: '80vh' }} />
        </div>
      )}

      {/* 상세 모달 */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40" onClick={() => setSelected(null)}>
          <div className="bg-gray-800 rounded-lg w-[500px] h-[95vh] flex flex-col relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setSelected(null)}
              className="absolute top-3 right-3 text-gray-400 hover:text-white text-xl leading-none z-10"
            >
              ✕
            </button>
            <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] p-6 space-y-3">
              <div className="flex gap-4 items-start">
                <ImagePreview path={selected.photo_path} alt={selected.name} className="w-28 h-28 rounded flex-shrink-0" />
                <div className="flex-1 pt-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-white font-bold text-lg">{selected.name}</h3>
                    <button
                      onClick={() => handleToggleFavorite(selected.id, selected.is_favorite)}
                      className={`text-2xl leading-none ${selected.is_favorite ? 'text-red-500' : 'text-gray-500 hover:text-red-400'}`}
                    >
                      {selected.is_favorite ? '♥' : '♡'}
                    </button>
                  </div>
                  <div className="grid gap-x-2 text-sm text-gray-400 mt-1" style={{ gridTemplateColumns: 'auto 1fr' }}>
                    <span>생년월일</span>
                    <span>{selected.birthday || '-'}{selected.birthday ? ` (${getAge(selected.birthday)})` : ''}</span>
                    <span>데뷔일</span>
                    <span>{selected.debut_date || '-'}{selected.debut_date ? ` (${getDebutAge(selected.birthday ?? null, selected.debut_date)})` : ''}</span>
                  </div>
                  <p className="text-yellow-400 text-sm mt-1">
                    평점 {(selected.avg_score ?? (
                      selected.scores
                        ? (Object.values(selected.scores).reduce((a, b) => a + b, 0) / 10)
                        : 0
                    )).toFixed(2)}점
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button onClick={handleEdit} className="bg-gray-600 hover:bg-gray-500 text-white text-sm px-3 py-1.5 rounded flex-1">
                      수정
                    </button>
                    <button onClick={handleDelete} className="bg-red-700 hover:bg-red-600 text-white text-sm px-3 py-1.5 rounded flex-1">
                      삭제
                    </button>
                  </div>
                </div>
              </div>

              {(selected.height || selected.bust || selected.waist || selected.hip || selected.cup) && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">신체</p>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-300">
                      {[
                        selected.height ? `신장 ${selected.height}cm` : '',
                        (selected.bust || selected.waist || selected.hip)
                          ? `B${selected.bust ?? '?'} - W${selected.waist ?? '?'} - H${selected.hip ?? '?'}`
                          : '',
                        selected.cup ? `${selected.cup}컵` : '',
                      ].filter(Boolean).join('  ')}
                    </p>
                    {(physScoreMap.get(selected.id) != null || selected.ratio_score != null) && (
                      <p className="text-sm text-blue-400 shrink-0 ml-2">{(physScoreMap.get(selected.id) ?? selected.ratio_score!).toFixed(2)}점</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-center">
                <RadarChart scores={selected.scores ?? defaultScores} />
              </div>

              {selected.comment && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">코멘트</p>
                  <p className="text-sm text-gray-300 whitespace-pre-wrap">{selected.comment}</p>
                </div>
              )}

              {selected.tags && selected.tags.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">태그</p>
                  <div className="flex flex-wrap gap-1">
                    {[
                      ...(selected.tags.filter((t) => selected.rep_tags?.some((r) => r.id === t.id))),
                      ...(selected.tags.filter((t) => !selected.rep_tags?.some((r) => r.id === t.id))),
                    ].map((t) => {
                      const isRep = selected.rep_tags?.some((r) => r.id === t.id)
                      return (
                        <span
                          key={t.id}
                          onClick={() => handleToggleRepTag(t.id)}
                          title={isRep ? '대표 태그 해제' : '대표 태그로 설정'}
                          className={`text-xs px-2 py-0.5 rounded cursor-pointer ${
                            isRep ? 'bg-green-700 text-green-200 hover:bg-green-600' : 'bg-blue-900/50 text-blue-300 hover:bg-blue-800/60'
                          }`}
                        >
                          {t.name}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}

              {selected.works && selected.works.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-gray-500">출연작 ({selected.works.length})</p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          if (workSort === 'release_date') setWorkSortDir((d) => d === 'desc' ? 'asc' : 'desc')
                          else setWorkSort('release_date')
                        }}
                        className={`text-xs px-1.5 py-0.5 rounded ${workSort === 'release_date' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                      >
                        발매일{workSort === 'release_date' ? (workSortDir === 'desc' ? '↓' : '↑') : ''}
                      </button>
                      <button
                        onClick={() => {
                          if (workSort === 'rating') setWorkSortDir((d) => d === 'desc' ? 'asc' : 'desc')
                          else setWorkSort('rating')
                        }}
                        className={`text-xs px-1.5 py-0.5 rounded ${workSort === 'rating' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                      >
                        평점{workSort === 'rating' ? (workSortDir === 'desc' ? '↓' : '↑') : ''}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {sortedWorks.map((w) => (
                      <div key={w.id} className="flex items-stretch gap-1.5">
                        <div
                          onClick={() => onNavigateToWork?.(w.id)}
                          className="flex-1 flex gap-2 items-center bg-gray-700 rounded p-2 cursor-pointer hover:bg-gray-600"
                        >
                          <ImagePreview
                            path={w.cover_path}
                            alt={w.product_number || '-'}
                            className="w-16 h-12 rounded flex-shrink-0 object-cover"
                            onMouseEnter={() => setHoverCover(w.cover_path ?? null)}
                            onMouseLeave={() => setHoverCover(null)}
                          />
                          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                            <div className="flex items-start justify-between gap-1">
                              <div className="flex flex-wrap gap-0.5 min-w-0">
                                {w.rep_tags?.map((t) => (
                                  <span key={t.id} className="bg-blue-900/50 text-blue-300 text-xs px-1.5 py-0.5 rounded">
                                    {t.name}
                                  </span>
                                ))}
                              </div>
                              <p className="text-sm font-bold text-white flex-shrink-0">{w.product_number || '-'}</p>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="scale-75 origin-left">
                                <Rating value={w.rating} readonly />
                              </div>
                              <p className="text-xs text-gray-400">{w.release_date || '-'}</p>
                            </div>
                          </div>
                        </div>
                        {w.files && w.files.length > 0 && (
                          <button
                            onClick={() => {
                              const f = w.files![0]
                              if (f.type === 'url') shellApi.openExternal(f.file_path)
                              else shellApi.openPath(f.file_path)
                            }}
                            className="w-7 bg-red-600 hover:bg-red-500 rounded flex items-center justify-center flex-shrink-0"
                          >
                            <span className="text-white text-xs">▶</span>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <ActorForm
          actor={editActor}
          onSave={() => { setShowForm(false); loadActors(); computePhysScores(); if (selected) handleSelect(selected.id) }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {showPhysical && (
        <PhysicalCorrectionModal onClose={() => setShowPhysical(false)} />
      )}
    </div>
  )
}
