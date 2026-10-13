import { useState, useEffect, useCallback } from 'react'
import { tierApi } from '../api'
import ImagePreview from '../components/ImagePreview'
import TierEditor from '../components/TierEditor'
import MasterRankingView from '../components/cup/MasterRankingView'

interface TierSet {
  id: number
  name: string
  type: 'actor' | 'work'
  is_master: number
  created_at: string
  item_count: number
  level_count: number
  total_items: number
  thumb_path: string | null
}

interface Props {
  onNavigateToActor: (id: number) => void
  onNavigateToWork: (id: number) => void
}

export default function Tier({ onNavigateToActor, onNavigateToWork }: Props) {
  const [view, setView] = useState<'list' | 'edit' | 'ranking'>('list')
  const [selectedSetId, setSelectedSetId] = useState<number | null>(null)
  const [sets, setSets] = useState<TierSet[]>([])
  const [sortBy, setSortBy] = useState<'created_at' | 'name'>(() => (localStorage.getItem('tier:sortBy') as 'created_at' | 'name') || 'created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => (localStorage.getItem('tier:sortDir') as 'asc' | 'desc') || 'desc')
  const [typeToggles, setTypeToggles] = useState<{ actor: boolean; work: boolean }>(() => {
    try { return JSON.parse(localStorage.getItem('tier:typeToggles') || '{"actor":true,"work":true}') } catch { return { actor: true, work: true } }
  })
  const [masterToggles, setMasterToggles] = useState<{ master: boolean; normal: boolean }>(() => {
    try { return JSON.parse(localStorage.getItem('tier:masterToggles') || '{"master":true,"normal":true}') } catch { return { master: true, normal: true } }
  })
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createType, setCreateType] = useState<'actor' | 'work'>('actor')

  const loadSets = useCallback(async () => {
    const params: Record<string, unknown> = { sortBy, sortDir }
    const data = await tierApi.listSets(params) as TierSet[]
    // Client-side filter
    const typeAll = typeToggles.actor === typeToggles.work
    const masterAll = masterToggles.master === masterToggles.normal
    const filtered = data.filter(s => {
      if (!typeAll && !typeToggles[s.type]) return false
      if (!masterAll) {
        if (s.is_master && !masterToggles.master) return false
        if (!s.is_master && !masterToggles.normal) return false
      }
      return true
    })
    setSets(filtered)
  }, [sortBy, sortDir, typeToggles, masterToggles])

  useEffect(() => { loadSets() }, [loadSets])
  useEffect(() => { localStorage.setItem('tier:sortBy', sortBy) }, [sortBy])
  useEffect(() => { localStorage.setItem('tier:sortDir', sortDir) }, [sortDir])
  useEffect(() => { localStorage.setItem('tier:typeToggles', JSON.stringify(typeToggles)) }, [typeToggles])
  useEffect(() => { localStorage.setItem('tier:masterToggles', JSON.stringify(masterToggles)) }, [masterToggles])

  const handleCreate = async () => {
    if (!createName.trim()) return
    await tierApi.createSet({ name: createName.trim(), type: createType })
    setShowCreate(false)
    setCreateName('')
    loadSets()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('이 티어를 삭제하시겠습니까?')) return
    const res = await tierApi.deleteSet(id)
    if (!res.ok) { alert(res.error); return }
    loadSets()
  }

  const handleEdit = (id: number) => {
    setSelectedSetId(id)
    setView('edit')
  }

  if (view === 'ranking') {
    return (
      <MasterRankingView
        onBack={() => setView('list')}
        onNavigateToActor={onNavigateToActor}
        onNavigateToWork={onNavigateToWork}
        initialSource="tier"
      />
    )
  }

  if (view === 'edit' && selectedSetId !== null) {
    const selectedSet = sets.find(s => s.id === selectedSetId)
    return (
      <TierEditor
        setId={selectedSetId}
        setName={selectedSet?.name ?? ''}
        setType={(selectedSet?.type ?? 'actor') as 'actor' | 'work'}
        onBack={() => { setView('list'); loadSets() }}
        onNavigateToActor={onNavigateToActor}
        onNavigateToWork={onNavigateToWork}
      />
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 상단 바 */}
      <div className="p-4 shrink-0">
        <div className="flex items-center">
          {/* 정렬 */}
          <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-28"
            >
              <option value="created_at">등록순</option>
              <option value="name">이름순</option>
            </select>
            <button
              onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
              className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-2 py-1.5 rounded"
            >{sortDir === 'asc' ? '↑' : '↓'}</button>
          </div>

          {/* 필터 토글 */}
          <div className="flex items-center gap-1.5 bg-gray-800 rounded-lg px-3 py-1.5 ml-2">
            <div className="flex">
              {([['actor', '배우'], ['work', '작품']] as const).map(([key, label], i) => (
                <button key={key}
                  onClick={() => setTypeToggles(prev => ({ ...prev, [key]: !prev[key] }))}
                  className={`text-sm px-3 py-1.5 ${i === 0 ? 'rounded-l' : 'rounded-r'} ${typeToggles[key] ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                >{label}</button>
              ))}
            </div>
            <div className="flex">
              {([['master', '마스터'], ['normal', '일반']] as const).map(([key, label], i) => (
                <button key={key}
                  onClick={() => setMasterToggles(prev => ({ ...prev, [key]: !prev[key] }))}
                  className={`text-sm px-3 py-1.5 ${i === 0 ? 'rounded-l' : 'rounded-r'} ${masterToggles[key] ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                >{label}</button>
              ))}
            </div>
            <button
              onClick={() => { setTypeToggles({ actor: true, work: true }); setMasterToggles({ master: true, normal: true }) }}
              className="px-3 py-1.5 rounded text-sm bg-gray-600 hover:bg-gray-500 text-gray-300 shrink-0"
            >전체</button>
          </div>

          {/* 액션 */}
          <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5 ml-2">
            <button
              onClick={() => setShowCreate(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-sm"
            >+ 티어 등록</button>
            <button
              onClick={() => setView('ranking')}
              className="bg-yellow-600 hover:bg-yellow-500 text-white px-3 py-1.5 rounded text-sm"
            >★ 마스터 랭킹</button>
          </div>
        </div>
      </div>

      {/* 카드 그리드 */}
      <div className="flex-1 overflow-y-auto p-4 pt-0">
        {sets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-500">
            <p className="text-lg mb-1">티어가 없습니다</p>
            <p className="text-sm">새 티어를 만들어 시작하세요</p>
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-3">
            {sets.map(s => (
              <div
                key={s.id}
                className="cursor-pointer rounded-lg overflow-hidden border border-gray-700 hover:border-gray-500 transition"
                onClick={() => handleEdit(s.id)}
              >
                <div className="relative">
                  <ImagePreview path={s.thumb_path} alt={s.name} className="w-full h-40" />
                  <div className="absolute top-1 left-1 flex gap-1">
                    {s.is_master ? (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-600 text-white">★ 마스터</span>
                    ) : (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-600 text-gray-300">일반</span>
                    )}
                    <span className={`text-xs px-1.5 py-0.5 rounded ${s.type === 'actor' ? 'bg-purple-600 text-white' : 'bg-green-600 text-white'}`}>
                      {s.type === 'actor' ? '배우' : '작품'}
                    </span>
                  </div>
                </div>
                <div className="p-2 bg-gray-800">
                  <p className="text-sm font-bold text-white truncate">{s.name}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-gray-400">{s.item_count}/{s.total_items} 배치</span>
                    <span className="text-xs text-gray-500">{s.created_at?.slice(0, 10)}</span>
                  </div>
                </div>
                {!s.is_master && (
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(s.id) }}
                    className="w-full text-xs text-gray-500 hover:text-red-400 py-1 bg-gray-800 border-t border-gray-700"
                  >삭제</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 생성 모달 */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-gray-800 rounded-lg p-5 w-80" onClick={e => e.stopPropagation()}>
            <p className="text-white text-sm font-bold mb-4">새 티어 등록</p>
            <input
              autoFocus
              value={createName}
              onChange={e => setCreateName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
              placeholder="티어 이름"
              className="w-full bg-gray-700 text-white text-sm px-3 py-2 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 mb-3"
            />
            <div className="flex gap-2 mb-4">
              {(['actor', 'work'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setCreateType(t)}
                  className={`flex-1 text-sm px-3 py-1.5 rounded ${createType === t ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                >{t === 'actor' ? '배우' : '작품'}</button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="text-sm text-gray-300 bg-gray-600 hover:bg-gray-500 px-3 py-1.5 rounded">취소</button>
              <button onClick={handleCreate} className="text-sm text-white bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded">등록</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
