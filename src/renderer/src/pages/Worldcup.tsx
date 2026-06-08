import React, { useState, useEffect, useCallback } from 'react'
import { worldcupApi, actorsApi, worksApi, shellApi } from '../api'
import ImagePreview from '../components/ImagePreview'
import CardTooltip, { type TooltipState } from '../components/CardTooltip'

// ── Types ──────────────────────────────────────────────────────────────────
type WcCategory = { id: number; type: 'actor' | 'work'; name: string; sort_order: number }
type WcSession  = { id: number; category_id: number; round_total: number; status: string; winner_id: number | null }
type WcMatch    = { id: number; session_id: number; round: number; match_index: number; item1_id: number; item2_id: number | null; winner_id: number | null; is_bye: number }
type WcRankRow  = {
  rank: number; id: number
  name?: string; photo_path?: string | null
  title?: string | null; product_number?: string | null; cover_path?: string | null
  total_sessions: number; session_wins: number
  total_matches: number; match_wins: number
  win_rate: number; match_win_rate: number
}
type WcLastRankRow = {
  rank: number; id: number; elim_round: number | null
  name?: string; photo_path?: string | null
  title?: string | null; product_number?: string | null; cover_path?: string | null
}

type SubView = 'home' | 'game' | 'result' | 'rankings'

const ROUND_OPTIONS = [
  { value: 16, label: '16강' }, { value: 32, label: '32강' },
  { value: 64, label: '64강' }, { value: 128, label: '128강' },
  { value: 256, label: '256강' }, { value: 512, label: '512강' },
  { value: 0, label: '전체' },
]
const LIMIT_OPTIONS = [10, 20, 50, 100]

// ── Helpers ────────────────────────────────────────────────────────────────
function roundLabel(round: number): string {
  if (round === 2) return '결승'
  if (round === 4) return '준결승'
  return `${round}강`
}

function currentMatch(matches: WcMatch[]): WcMatch | null {
  return matches
    .filter(m => !m.is_bye && m.winner_id === null)
    .sort((a, b) => b.round - a.round || a.match_index - b.match_index)[0] ?? null
}

// ── RankTrendChart (외부 컴포넌트 — 안정적) ────────────────────────────────
function RankTrendChart({ history }: { history: { rank: number }[] }) {
  if (history.length < 2) return <span className="text-gray-600 text-xs">-</span>
  const W = 80, H = 28, P = 3
  const ranks = history.map(h => h.rank)
  const minR = Math.min(...ranks), maxR = Math.max(...ranks)
  const range = maxR - minR || 1
  const pts = history.map((h, i) => {
    const x = P + (i / (history.length - 1)) * (W - P * 2)
    const y = P + ((h.rank - minR) / range) * (H - P * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const last = ranks[ranks.length - 1], prev = ranks[ranks.length - 2]
  const color = last < prev ? '#4ade80' : last > prev ? '#f87171' : '#9ca3af'
  const [lx, ly] = pts[pts.length - 1].split(',')
  return (
    <svg width={W} height={H} className="shrink-0">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="2.5" fill={color} />
    </svg>
  )
}

// ── GameCard (외부 컴포넌트 — 안정적) ─────────────────────────────────────
function GameCard({ itemId, type, onPick, onNavigate, onMouseMove, onMouseLeave, disabled }: {
  itemId: number; type: 'actor' | 'work'
  onPick: () => void
  onNavigate: () => void
  onMouseMove?: (e: React.MouseEvent) => void
  onMouseLeave?: () => void
  disabled?: boolean
}) {
  const [info, setInfo] = useState<{
    name?: string; title?: string | null; product_number?: string | null
    photo_path?: string | null; cover_path?: string | null
    files?: { id: number; file_path: string; type: string }[]
  } | null>(null)

  useEffect(() => {
    if (type === 'actor') actorsApi.get(itemId).then(d => setInfo(d as typeof info))
    else worksApi.get(itemId).then(d => setInfo(d as typeof info))
  }, [itemId, type])

  const imgPath   = type === 'actor' ? info?.photo_path : info?.cover_path
  const firstFile = info?.files?.[0]

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (firstFile) shellApi.openPath(firstFile.file_path)
  }

  return (
    <div className="flex flex-col rounded-xl overflow-hidden border-2 border-gray-700 bg-gray-800 w-full">
      {/* 썸네일 — 클릭 시 승리 선택 */}
      <button
        onClick={onPick}
        disabled={disabled}
        className={`relative overflow-hidden group cursor-pointer disabled:cursor-not-allowed block ${
          type === 'actor' ? 'aspect-square' : 'aspect-[800/540]'
        }`}
      >
        <ImagePreview path={imgPath ?? null} alt="" className="w-full h-full" objectPosition="center 10%" />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-blue-500/20 transition-colors" />
      </button>

      {/* 정보 — hover 시 툴팁, 클릭 시 상세 모달 */}
      <div
        className="p-3 bg-gray-800 border-t border-gray-700 cursor-pointer hover:bg-gray-700 transition-colors"
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onClick={onNavigate}
      >
        {type === 'actor' ? (
          <p className="text-sm font-bold text-white truncate">{info?.name ?? '...'}</p>
        ) : (
          <>
            <p className="text-xs text-gray-400 truncate">{info?.product_number ?? '...'}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-sm font-bold text-white truncate flex-1">{info?.title ?? info?.product_number ?? '...'}</p>
              {firstFile && (
                <button
                  onClick={handlePlay}
                  className="shrink-0 text-green-400 hover:text-green-300 text-base leading-none"
                  title="재생"
                >▶</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────
interface Props {
  onNavigateToActor: (id: number) => void
  onNavigateToWork: (id: number) => void
}

export default function Worldcup({ onNavigateToActor, onNavigateToWork }: Props) {
  const [subView, setSubView]   = useState<SubView>('home')
  const [categories, setCategories] = useState<WcCategory[]>([])
  const [selCatId, setSelCatId] = useState<number | null>(null)
  const [session, setSession]   = useState<WcSession | null>(null)
  const [matches, setMatches]   = useState<WcMatch[]>([])
  const [tooltip, setTooltip]   = useState<TooltipState | null>(null)
  const [picking, setPicking]     = useState<{ winnerId: number; loserId: number | null; fadeOut?: boolean } | null>(null)
  const [cardsVisible, setCardsVisible] = useState(true)

  const [confirmExisting, setConfirmExisting] = useState(false)
  const [pendingRound, setPendingRound]       = useState<number | null>(null)

  const [winnerInfo, setWinnerInfo]     = useState<{ id: number; label: string; imgPath: string | null; comment: string } | null>(null)
  const [commentDraft, setCommentDraft] = useState('')
  const [commentSaved, setCommentSaved] = useState(false)

  const [rankRows, setRankRows]       = useState<WcRankRow[]>([])
  const [rankTotal, setRankTotal]     = useState(0)
  const [rankPage, setRankPage]       = useState(0)
  const [rankLimit, setRankLimit]     = useState(20)
  const [rankHistories, setRankHistories] = useState<Record<number, { rank: number }[]>>({})
  const [rankMode, setRankMode]       = useState<'overall' | 'last'>('overall')
  const [rankImgPreview, setRankImgPreview] = useState<string | null>(null)
  const [lastRankRows, setLastRankRows] = useState<WcLastRankRow[]>([])
  const [lastRankTotal, setLastRankTotal] = useState(0)
  const [lastRankPage, setLastRankPage]   = useState(0)
  const [trendModal, setTrendModal]   = useState<{ id: number; label: string; imgPath: string | null } | null>(null)

  const [catSessions, setCatSessions] = useState<Record<number, { session: WcSession; matches: WcMatch[] } | null>>({})
  const [catWinners, setCatWinners]   = useState<Record<number, { id: number; photo_path?: string | null; cover_path?: string | null; name?: string; title?: string | null; product_number?: string | null } | null>>({})
  const [cardRounds, setCardRounds]   = useState<Record<number, number>>({})
  const [cardExclude, setCardExclude] = useState<Record<number, boolean>>({})

  // 검색/정렬
  const [wcSearch,     setWcSearch]     = useState(() => localStorage.getItem('worldcup:search') ?? '')
  const [wcTypeFilter, setWcTypeFilter] = useState<'all' | 'actor' | 'work'>(() => (localStorage.getItem('worldcup:typeFilter') as 'all' | 'actor' | 'work') ?? 'all')
  const [wcSortBy,     setWcSortBy]     = useState<'name' | 'created_at'>(() => (localStorage.getItem('worldcup:sortBy') as 'name' | 'created_at') ?? 'created_at')
  const [wcSortDir,    setWcSortDir]    = useState<'asc' | 'desc'>(() => (localStorage.getItem('worldcup:sortDir') as 'asc' | 'desc') ?? 'asc')

  // 월드컵 추가 모달
  const [showAddModal,  setShowAddModal]  = useState(false)
  const [addName,       setAddName]       = useState('')
  const [addType,       setAddType]       = useState<'actor' | 'work'>('actor')

  // 월드컵 수정/삭제 모달
  const [editCat,       setEditCat]       = useState<WcCategory | null>(null)
  const [editName,      setEditName]      = useState('')
  const [deleteCat,     setDeleteCat]     = useState<WcCategory | null>(null)

  const selCategory = categories.find(c => c.id === selCatId) ?? null
  const cur         = currentMatch(matches)
  const totalPages  = Math.ceil(rankTotal / rankLimit)

  const filteredCategories = categories
    .filter(c => wcTypeFilter === 'all' || c.type === wcTypeFilter)
    .filter(c => !wcSearch || c.name.toLowerCase().includes(wcSearch.toLowerCase()))
    .sort((a, b) => {
      const dir = wcSortDir === 'asc' ? 1 : -1
      if (wcSortBy === 'name') return a.name.localeCompare(b.name) * dir
      return (a.id - b.id) * dir
    })

  // 현재 라운드 내 경기 번호
  const curRoundNonBye = cur
    ? matches.filter(m => m.round === cur.round && !m.is_bye).sort((a, b) => a.match_index - b.match_index)
    : []
  const matchNumber = cur ? curRoundNonBye.findIndex(m => m.id === cur.id) + 1 : 0

  // ── 데이터 로드 ──────────────────────────────────────────────────────────
  useEffect(() => {
    worldcupApi.categories().then(d => setCategories(d as WcCategory[]))
  }, [])

  const loadCatSessions = useCallback(async (cats: WcCategory[]) => {
    // sessions 먼저 로드 → 칩 즉시 표시
    const sessionEntries = await Promise.all(
      cats.map(async cat => {
        const d = await worldcupApi.getSession(cat.id) as { session: WcSession; matches: WcMatch[] } | null
        return [cat.id, d] as [number, typeof d]
      })
    )
    setCatSessions(Object.fromEntries(sessionEntries))

    // winners는 별도로 로드 (실패해도 sessions에 영향 없음)
    const winnerEntries = await Promise.all(
      cats.map(async cat => {
        try {
          const w = await worldcupApi.lastWinner(cat.id, cat.type) as { id: number; photo_path?: string | null; cover_path?: string | null; name?: string; title?: string | null; product_number?: string | null } | null
          return [cat.id, w] as [number, typeof w]
        } catch {
          return [cat.id, null] as [number, null]
        }
      })
    )
    setCatWinners(Object.fromEntries(winnerEntries))
  }, [])

  useEffect(() => {
    if (subView === 'home' && categories.length > 0) loadCatSessions(categories)
  }, [subView, categories, loadCatSessions])

  const loadRankings = useCallback(async (catId: number, page: number, limit: number) => {
    const res = await worldcupApi.rankings(catId, limit, page * limit) as { rows: WcRankRow[]; total: number }
    setRankRows(res.rows)
    setRankTotal(res.total)
    const histories: Record<number, { rank: number }[]> = {}
    await Promise.all(res.rows.map(async row => {
      histories[row.id] = await worldcupApi.rankHistory(catId, row.id) as { rank: number }[]
    }))
    setRankHistories(histories)
  }, [])

  const loadLastRankings = useCallback(async (catId: number, page: number, limit: number) => {
    const res = await worldcupApi.lastSessionRankings(catId, limit, page * limit) as { rows: WcLastRankRow[]; total: number } | null
    setLastRankRows(res?.rows ?? [])
    setLastRankTotal(res?.total ?? 0)
  }, [])

  useEffect(() => {
    if (subView === 'rankings' && selCatId !== null) {
      if (rankMode === 'overall') loadRankings(selCatId, rankPage, rankLimit)
      else loadLastRankings(selCatId, lastRankPage, rankLimit)
    }
  }, [subView, selCatId, rankPage, lastRankPage, rankLimit, rankMode, loadRankings, loadLastRankings])

  // ── 게임 흐름 ────────────────────────────────────────────────────────────
  const handleStartRequest = async (catId: number, round: number, exclude: boolean) => {
    const existing = await worldcupApi.getSession(catId) as { session: WcSession; matches: WcMatch[] } | null
    if (existing) { setSelCatId(catId); setPendingRound(round); setConfirmExisting(true) }
    else await doStart(catId, round, exclude)
  }

  const doStart = async (catId: number, round: number, exclude: boolean) => {
    const res = await worldcupApi.start(catId, round, exclude) as { session: WcSession; matches: WcMatch[] }
    setSelCatId(catId); setSession(res.session); setMatches(res.matches); setSubView('game')
  }

  const handleContinue = async () => {
    if (selCatId === null) return
    setConfirmExisting(false)
    const existing = await worldcupApi.getSession(selCatId) as { session: WcSession; matches: WcMatch[] } | null
    if (!existing) return
    setSession(existing.session); setMatches(existing.matches); setSubView('game')
  }

  const handleNewStart = async () => {
    setConfirmExisting(false)
    if (selCatId !== null && pendingRound !== null)
      await doStart(selCatId, pendingRound, cardExclude[selCatId] ?? false)
  }

  const handleResume = async (catId: number) => {
    const existing = await worldcupApi.getSession(catId) as { session: WcSession; matches: WcMatch[] } | null
    if (!existing) return
    setSelCatId(catId); setSession(existing.session); setMatches(existing.matches); setSubView('game')
  }

  const handlePick = async (matchId: number, winnerId: number) => {
    const res = await worldcupApi.pick(matchId, winnerId) as { done: boolean; winnerId?: number; matches?: WcMatch[] }
    if (res.done && res.winnerId != null) {
      if (session) await worldcupApi.complete(session.id)
      const wid = res.winnerId
      if (selCategory?.type === 'actor') {
        const a = await actorsApi.get(wid) as { name: string; photo_path: string | null; comment?: string }
        setWinnerInfo({ id: wid, label: a.name, imgPath: a.photo_path, comment: a.comment ?? '' })
        setCommentDraft(a.comment ?? '')
      } else {
        const w = await worksApi.get(wid) as { title: string | null; product_number: string | null; cover_path: string | null; comment?: string }
        setWinnerInfo({ id: wid, label: w.title ?? w.product_number ?? '', imgPath: w.cover_path, comment: w.comment ?? '' })
        setCommentDraft(w.comment ?? '')
      }
      setTooltip(null); setCommentSaved(false); setSubView('result')
    } else if (res.matches) {
      setMatches(res.matches)
    }
  }

  // 애니메이션 후 실제 pick 처리
  const handleCardPick = async (matchId: number, winnerId: number, loserId: number | null) => {
    if (picking) return
    setPicking({ winnerId, loserId })
    await new Promise(r => setTimeout(r, 500))  // 애니메이션 완료
    await new Promise(r => setTimeout(r, 300))  // 가운데 정지
    setPicking({ winnerId, loserId, fadeOut: true })
    await new Promise(r => setTimeout(r, 300))  // 페이드 아웃
    setCardsVisible(false)
    await handlePick(matchId, winnerId)          // picking 유지한 채 새 매치 로드
    await new Promise(r => setTimeout(r, 50))   // 렌더 대기
    setPicking(null)                             // 레이아웃 변화 없이 picking 해제
    setCardsVisible(true)                        // 새 카드 페이드 인
  }

  const handleSaveComment = async () => {
    if (!winnerInfo || !selCategory) return
    if (selCategory.type === 'actor') await actorsApi.update(winnerInfo.id, { comment: commentDraft })
    else await worksApi.update(winnerInfo.id, { comment: commentDraft })
    setCommentSaved(true)
  }

  const handleAddCategory = async () => {
    if (!addName.trim()) return
    const newCat = await worldcupApi.createCategory(addName.trim(), addType) as WcCategory
    setCategories(prev => [...prev, newCat])
    setAddName(''); setShowAddModal(false)
  }

  const handleUpdateCategory = async () => {
    if (!editCat || !editName.trim()) return
    const updated = await worldcupApi.updateCategory(editCat.id, editName.trim()) as WcCategory
    setCategories(prev => prev.map(c => c.id === updated.id ? updated : c))
    setEditCat(null)
  }

  const handleDeleteCategory = async () => {
    if (!deleteCat) return
    await worldcupApi.deleteCategory(deleteCat.id)
    setCategories(prev => prev.filter(c => c.id !== deleteCat.id))
    setDeleteCat(null)
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-gray-900">

      {/* ── 홈 뷰 ── */}
      {subView === 'home' && (
        <div className="h-full flex flex-col">
          {/* 헤더 바 */}
          <div className="p-4 shrink-0">
            <div className="flex items-center gap-2">
              {/* 정렬 */}
              <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5">
                <select
                  value={wcSortBy}
                  onChange={e => { const v = e.target.value as typeof wcSortBy; setWcSortBy(v); localStorage.setItem('worldcup:sortBy', v) }}
                  className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-28"
                >
                  <option value="name">월드컵명</option>
                  <option value="created_at">등록일</option>
                </select>
                <button
                  onClick={() => { const d = wcSortDir === 'asc' ? 'desc' : 'asc'; setWcSortDir(d); localStorage.setItem('worldcup:sortDir', d) }}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-2 py-1.5 rounded"
                >
                  {wcSortDir === 'asc' ? '↑' : '↓'}
                </button>
              </div>

              {/* 검색 + 타입 필터 */}
              <div className="w-[38rem] shrink-0 flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5">
                <input
                  type="text"
                  value={wcSearch}
                  onChange={e => { setWcSearch(e.target.value); localStorage.setItem('worldcup:search', e.target.value) }}
                  placeholder="월드컵명 검색"
                  className="flex-1 bg-gray-700 text-white text-sm px-2 py-1.5 rounded focus:outline-none"
                />
                <div className="flex shrink-0">
                  {(['all', 'actor', 'work'] as const).map((v, i) => (
                    <button
                      key={v}
                      onClick={() => { setWcTypeFilter(v); localStorage.setItem('worldcup:typeFilter', v) }}
                      className={`text-sm px-3 py-1.5 border-gray-600 ${i === 0 ? 'rounded-l border-r' : i === 2 ? 'rounded-r' : 'border-r'} ${wcTypeFilter === v ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                    >
                      {v === 'all' ? '전체' : v === 'actor' ? '배우' : '작품'}
                    </button>
                  ))}
                </div>
                <div className="w-25 shrink-0 bg-gray-700 rounded px-2 py-1.5 text-sm text-gray-300 whitespace-nowrap">
                  결과: {filteredCategories.length}
                </div>
                <button
                  onClick={() => { setWcSearch(''); localStorage.removeItem('worldcup:search') }}
                  className="px-3 py-1.5 rounded text-sm bg-gray-600 hover:bg-gray-500 text-gray-300 shrink-0"
                >초기화</button>
              </div>

              {/* 월드컵 추가 */}
              <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5 ml-2">
                <button
                  onClick={() => { setAddName(''); setAddType('actor'); setShowAddModal(true) }}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-3 py-1.5 rounded"
                >+ 월드컵 추가</button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 pt-0">
          <div className="grid grid-cols-5 gap-3">
            {filteredCategories.map(cat => {
              const existing    = catSessions[cat.id]
              const curRound    = cardRounds[cat.id] ?? 16
              const excl        = cardExclude[cat.id] ?? false
              const exCurMatch  = existing ? currentMatch(existing.matches) : null
              const exNonBye    = exCurMatch ? existing!.matches.filter(m => m.round === exCurMatch.round && !m.is_bye).sort((a, b) => a.match_index - b.match_index) : []
              const exMatchNum  = exCurMatch ? exNonBye.findIndex(m => m.id === exCurMatch.id) + 1 : 0
              const progressLabel = exCurMatch ? `${roundLabel(exCurMatch.round)}-${exMatchNum}경기` : null
              const winner = catWinners[cat.id]
              const winnerImg = cat.type === 'actor' ? winner?.photo_path : winner?.cover_path
              return (
                <div key={cat.id} className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden flex flex-col">
                  {/* 썸네일 */}
                  <div className="relative h-40 bg-gray-700 shrink-0">
                    <ImagePreview
                      path={winnerImg ?? null}
                      alt={cat.name}
                      className="w-full h-full"
                      objectPosition="center 10%"
                    />
                    {existing && progressLabel && (
                      <span className="absolute top-1.5 left-1.5 z-10 bg-blue-600/90 text-white text-xs px-1.5 py-0.5 rounded font-medium">
                        진행중: {progressLabel}
                      </span>
                    )}
                  </div>
                  {/* 내용 */}
                  <div className="p-3 flex flex-col gap-2">
                    <p className="text-white font-bold text-sm truncate">{cat.name}</p>
                    {/* 라운드 + 제외 */}
                    <div className="flex gap-1.5 items-center">
                      <select
                        value={curRound}
                        onChange={e => setCardRounds(prev => ({ ...prev, [cat.id]: Number(e.target.value) }))}
                        className="flex-1 bg-gray-700 text-white text-xs px-2 py-1.5 rounded"
                      >
                        {ROUND_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                      {cat.type === 'actor' && (
                        <label className="flex items-center gap-1 cursor-pointer select-none shrink-0 bg-gray-700 px-2 py-1.5 rounded">
                          <input type="checkbox" checked={excl} onChange={e => setCardExclude(prev => ({ ...prev, [cat.id]: e.target.checked }))} className="accent-blue-500" />
                          <span className="text-xs text-gray-300">제외</span>
                        </label>
                      )}
                    </div>
                    {/* 버튼 행 */}
                    <div className="flex gap-1">
                      <button onClick={() => handleStartRequest(cat.id, curRound, excl)} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-1.5 rounded transition">시작하기</button>
                      <button onClick={() => { setSelCatId(cat.id); setRankPage(0); setSubView('rankings') }} className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs py-1.5 rounded transition">순위보기</button>
                      <button onClick={e => { e.stopPropagation(); setEditCat(cat); setEditName(cat.name) }} className="bg-gray-700 hover:bg-gray-500 text-gray-400 text-xs px-1.5 py-1.5 rounded">M</button>
                      <button onClick={e => { e.stopPropagation(); setDeleteCat(cat) }} className="bg-gray-700 hover:bg-gray-500 text-gray-400 text-xs px-1.5 py-1.5 rounded">X</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          </div>
        </div>
      )}

      {/* ── 게임 뷰 ── */}
      {subView === 'game' && (
        cur ? (
          <div className="flex flex-col h-full">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-gray-700 shrink-0">
              <button onClick={() => setSubView('home')} className="text-gray-400 hover:text-white text-sm">← 홈</button>
              <p className="text-white font-bold">{roundLabel(cur.round)} — {matchNumber}경기</p>
              <div className="w-16" />
            </div>

            {/* 카드 영역 */}
            <div className={`flex-1 flex justify-center items-center gap-4 p-6 min-h-0 transition-opacity duration-500 ${cardsVisible ? 'opacity-100' : 'opacity-0'}`}>
              {/* 카드 1 */}
              <div className={`overflow-hidden shrink-0 ${cardsVisible ? 'transition-all duration-500' : 'transition-none'} ${
                picking?.loserId === cur.item1_id ? 'w-0 opacity-0'
                : picking?.fadeOut && picking?.winnerId === cur.item1_id ? 'w-[40%] opacity-0'
                : 'w-[40%] opacity-100'
              }`}>
                <GameCard
                  itemId={cur.item1_id}
                  type={selCategory?.type ?? 'actor'}
                  onPick={() => handleCardPick(cur.id, cur.item1_id, cur.item2_id)}
                  onNavigate={() => selCategory?.type === 'actor' ? onNavigateToActor(cur.item1_id) : onNavigateToWork(cur.item1_id)}
                  onMouseMove={e => setTooltip({ type: selCategory?.type ?? 'actor', id: cur.item1_id, x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setTooltip(null)}
                  disabled={!!picking}
                />
              </div>

              {/* VS */}
              <div className={`flex items-center justify-center shrink-0 overflow-hidden ${cardsVisible ? 'transition-all duration-500' : 'transition-none'} ${picking ? 'w-0 opacity-0' : 'w-10 opacity-100'}`}>
                <span className="text-gray-500 font-bold text-xl">VS</span>
              </div>

              {/* 카드 2 */}
              {cur.item2_id !== null ? (
                <div className={`overflow-hidden shrink-0 ${cardsVisible ? 'transition-all duration-500' : 'transition-none'} ${
                  picking?.loserId === cur.item2_id ? 'w-0 opacity-0'
                  : picking?.fadeOut && picking?.winnerId === cur.item2_id ? 'w-[40%] opacity-0'
                  : 'w-[40%] opacity-100'
                }`}>
                  <GameCard
                    itemId={cur.item2_id}
                    type={selCategory?.type ?? 'actor'}
                    onPick={() => handleCardPick(cur.id, cur.item2_id!, cur.item1_id)}
                    onNavigate={() => selCategory?.type === 'actor' ? onNavigateToActor(cur.item2_id!) : onNavigateToWork(cur.item2_id!)}
                    onMouseMove={e => setTooltip({ type: selCategory?.type ?? 'actor', id: cur.item2_id!, x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setTooltip(null)}
                    disabled={!!picking}
                  />
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-600">부전승</div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400">매치를 불러오는 중...</p>
          </div>
        )
      )}

      {/* ── 결과 뷰 ── */}
      {subView === 'result' && (
        <div className="flex flex-col items-center justify-center h-full gap-6 px-8">
          <p className="text-yellow-400 font-bold text-xl">🏆 우승!</p>
          {winnerInfo && (
            <>
              <div className="cursor-pointer" onClick={() => selCategory?.type === 'actor' ? onNavigateToActor(winnerInfo.id) : onNavigateToWork(winnerInfo.id)}>
                <ImagePreview path={winnerInfo.imgPath} alt={winnerInfo.label} className="w-48 h-64 rounded-xl border-2 border-yellow-500" objectPosition="center 10%" />
              </div>
              <p className="text-white font-bold text-lg">{winnerInfo.label}</p>
              <div className="w-full max-w-md flex flex-col gap-2">
                <p className="text-gray-400 text-sm">코멘트 편집</p>
                <textarea
                  value={commentDraft}
                  onChange={e => { setCommentDraft(e.target.value); setCommentSaved(false) }}
                  rows={4}
                  className="bg-gray-800 text-white text-sm rounded-lg border border-gray-600 p-3 resize-none focus:outline-none focus:border-blue-500"
                />
                <button onClick={handleSaveComment} className="self-end bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-1.5 rounded">
                  {commentSaved ? '저장됨 ✓' : '저장'}
                </button>
              </div>
            </>
          )}
          <div className="flex gap-3">
            <button onClick={() => setSubView('home')} className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-5 py-2 rounded-lg">홈으로</button>
            <button onClick={() => { setRankMode('last'); setRankPage(0); setSubView('rankings') }} className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-5 py-2 rounded-lg">순위 보기</button>
          </div>
        </div>
      )}

      {/* ── 순위 뷰 ── */}
      {subView === 'rankings' && (
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700 shrink-0">
            <button onClick={() => setSubView('home')} className="text-gray-400 hover:text-white text-sm">← 홈</button>
            <h2 className="text-white font-bold">{selCategory?.name} 순위</h2>
            <span className="text-gray-500 text-xs">
              ({rankMode === 'overall' ? rankTotal : lastRankTotal}{selCategory?.type === 'work' ? '작품' : '명'})
            </span>
            <div className="ml-auto flex items-center gap-2">
              <select
                value={rankLimit}
                onChange={e => { setRankLimit(Number(e.target.value)); setRankPage(0); setLastRankPage(0) }}
                className="bg-gray-700 text-white text-xs px-2 py-1 rounded"
              >
                {LIMIT_OPTIONS.map(l => <option key={l} value={l}>{l}개</option>)}
              </select>
              <div className="flex">
                <button
                  onClick={() => { setRankMode('overall'); setRankPage(0) }}
                  className={`text-sm px-3 py-1.5 rounded-l border-r border-gray-600 ${rankMode === 'overall' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                >전체 순위</button>
                <button
                  onClick={() => { setRankMode('last'); setLastRankPage(0) }}
                  className={`text-sm px-3 py-1.5 rounded-r ${rankMode === 'last' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                >마지막 순위</button>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-2">
            {rankMode === 'overall' ? (
              rankRows.length === 0 ? (
                <p className="text-gray-500 text-sm mt-8 text-center">순위 데이터가 없습니다.<br />게임을 완료하면 순위가 집계됩니다.</p>
              ) : (
                <table className="w-full table-fixed text-sm">
                  <colgroup>
                    <col style={{ width: '5%' }} />
                    <col style={{ width: '8%' }} />
                    {selCategory?.type === 'work' && <col style={{ width: '10%' }} />}
                    <col />
                    <col style={{ width: selCategory?.type === 'work' ? '8%' : '10%' }} />
                    <col style={{ width: selCategory?.type === 'work' ? '8%' : '10%' }} />
                    <col style={{ width: '15%' }} />
                  </colgroup>
                  <thead>
                    <tr className="text-gray-400 text-xs border-b border-gray-700">
                      <th className="py-2 text-left">#</th>
                      <th className="py-2 text-left">썸네일</th>
                      {selCategory?.type === 'work' && <th className="py-2 text-left">품번</th>}
                      <th className="py-2 text-left">{selCategory?.type === 'work' ? '타이틀' : '이름'}</th>
                      <th className="py-2 text-right">우승비율</th>
                      <th className="py-2 text-right">승률</th>
                      <th className="py-2 text-center">순위추이</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankRows.map(row => {
                      const imgPath = selCategory?.type === 'actor' ? row.photo_path : row.cover_path
                      const label   = selCategory?.type === 'actor' ? row.name : (row.title ?? row.product_number)
                      const recentHistory = (rankHistories[row.id] ?? []).slice(-5)
                      return (
                        <tr key={row.id} className="border-b border-gray-800 hover:bg-gray-800 h-16">
                          <td className="px-2 text-gray-400 font-bold">{row.rank}</td>
                          <td className="p-0"
                            onMouseEnter={() => setRankImgPreview(imgPath ?? null)}
                            onMouseLeave={() => setRankImgPreview(null)}
                          >
                            <ImagePreview path={imgPath ?? null} alt={label ?? ''} className="w-full h-16 object-cover" objectPosition="center 10%" />
                          </td>
                          {selCategory?.type === 'work' && (
                            <td className="px-2 overflow-hidden">
                              <div className="truncate text-gray-400 text-xs">{row.product_number}</div>
                            </td>
                          )}
                          <td className="px-2 overflow-hidden">
                            <div className="truncate">
                              <span
                                className="text-white font-medium hover:underline cursor-pointer"
                                onMouseMove={e => setTooltip({ type: selCategory?.type ?? 'actor', id: row.id, x: e.clientX, y: e.clientY })}
                                onMouseLeave={() => setTooltip(null)}
                                onClick={() => selCategory?.type === 'actor' ? onNavigateToActor(row.id) : onNavigateToWork(row.id)}
                              >{label}</span>
                            </div>
                          </td>
                          <td className="px-2 text-right text-yellow-400">{row.win_rate.toFixed(1)}%</td>
                          <td className="px-2 text-right text-blue-400">{row.match_win_rate.toFixed(1)}%</td>
                          <td className="px-2 cursor-pointer" onClick={() => setTrendModal({ id: row.id, label: label ?? '', imgPath: imgPath ?? null })}>
                            <div className="flex justify-center"><RankTrendChart history={recentHistory} /></div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )
            ) : (
              lastRankRows.length === 0 ? (
                <p className="text-gray-500 text-sm mt-8 text-center">마지막 순위 데이터가 없습니다.</p>
              ) : (
                <table className="w-full table-fixed text-sm">
                  <colgroup>
                    <col style={{ width: '5%' }} />
                    <col style={{ width: '8%' }} />
                    {selCategory?.type === 'work' && <col style={{ width: '10%' }} />}
                    <col />
                    <col style={{ width: '15%' }} />
                  </colgroup>
                  <thead>
                    <tr className="text-gray-400 text-xs border-b border-gray-700">
                      <th className="py-2 text-left">#</th>
                      <th className="py-2 text-left">썸네일</th>
                      {selCategory?.type === 'work' && <th className="py-2 text-left">품번</th>}
                      <th className="py-2 text-left">{selCategory?.type === 'work' ? '타이틀' : '이름'}</th>
                      <th className="py-2 text-left">라운드</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lastRankRows.map(row => {
                      const imgPath = selCategory?.type === 'actor' ? row.photo_path : row.cover_path
                      const label   = selCategory?.type === 'actor' ? row.name : (row.title ?? row.product_number)
                      return (
                        <tr key={row.id} className="border-b border-gray-800 hover:bg-gray-800 h-16">
                          <td className="px-2 text-gray-400 font-bold">{row.rank}</td>
                          <td className="p-0"
                            onMouseEnter={() => setRankImgPreview(imgPath ?? null)}
                            onMouseLeave={() => setRankImgPreview(null)}
                          >
                            <ImagePreview path={imgPath ?? null} alt={label ?? ''} className="w-full h-16 object-cover" objectPosition="center 10%" />
                          </td>
                          {selCategory?.type === 'work' && (
                            <td className="px-2 overflow-hidden">
                              <div className="truncate text-gray-400 text-xs">{row.product_number}</div>
                            </td>
                          )}
                          <td className="px-2 overflow-hidden">
                            <div className="truncate">
                              <span
                                className="text-white font-medium hover:underline cursor-pointer"
                                onMouseMove={e => setTooltip({ type: selCategory?.type ?? 'actor', id: row.id, x: e.clientX, y: e.clientY })}
                                onMouseLeave={() => setTooltip(null)}
                                onClick={() => selCategory?.type === 'actor' ? onNavigateToActor(row.id) : onNavigateToWork(row.id)}
                              >{label}</span>
                            </div>
                          </td>
                          <td className="px-2 text-gray-400 text-xs">
                            {row.elim_round === null ? '🏆 우승' : roundLabel(row.elim_round)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )
            )}
          </div>
          {rankMode === 'overall' && totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-3 border-t border-gray-700 shrink-0">
              <button onClick={() => setRankPage(p => Math.max(0, p - 1))} disabled={rankPage === 0} className="px-3 py-1 bg-gray-700 text-white text-sm rounded disabled:opacity-40">‹</button>
              <span className="text-gray-400 text-sm">{rankPage + 1} / {totalPages}</span>
              <button onClick={() => setRankPage(p => Math.min(totalPages - 1, p + 1))} disabled={rankPage >= totalPages - 1} className="px-3 py-1 bg-gray-700 text-white text-sm rounded disabled:opacity-40">›</button>
            </div>
          )}
          {rankMode === 'last' && Math.ceil(lastRankTotal / rankLimit) > 1 && (
            <div className="flex items-center justify-center gap-2 py-3 border-t border-gray-700 shrink-0">
              <button onClick={() => setLastRankPage(p => Math.max(0, p - 1))} disabled={lastRankPage === 0} className="px-3 py-1 bg-gray-700 text-white text-sm rounded disabled:opacity-40">‹</button>
              <span className="text-gray-400 text-sm">{lastRankPage + 1} / {Math.ceil(lastRankTotal / rankLimit)}</span>
              <button onClick={() => setLastRankPage(p => Math.min(Math.ceil(lastRankTotal / rankLimit) - 1, p + 1))} disabled={lastRankPage >= Math.ceil(lastRankTotal / rankLimit) - 1} className="px-3 py-1 bg-gray-700 text-white text-sm rounded disabled:opacity-40">›</button>
            </div>
          )}
        </div>
      )}

      {/* ── 확인 모달 ── */}
      {confirmExisting && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-80 border border-gray-700">
            <p className="text-white font-bold mb-4">진행하던 월드컵이 있습니다 이어 하시겠습니까?</p>
            <div className="flex gap-2">
              <button onClick={handleContinue} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-sm py-2 rounded">예</button>
              <button onClick={handleNewStart} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-sm py-2 rounded">아니오</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 월드컵 수정 모달 ── */}
      {editCat && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-80 border border-gray-700 flex flex-col gap-4">
            <p className="text-white font-bold">월드컵 수정</p>
            <input
              type="text"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleUpdateCategory() }}
              autoFocus
              className="bg-gray-700 text-white text-sm px-3 py-2 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="flex gap-2">
              <button onClick={handleUpdateCategory} disabled={!editName.trim()} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm py-2 rounded">저장</button>
              <button onClick={() => setEditCat(null)} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-sm py-2 rounded">취소</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 월드컵 삭제 확인 모달 ── */}
      {deleteCat && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-80 border border-gray-700 flex flex-col gap-4">
            <p className="text-white font-bold">월드컵 삭제</p>
            <p className="text-gray-400 text-sm">
              <span className="text-white">"{deleteCat.name}"</span>과 모든 기록(세션, 순위 등)이 삭제됩니다.
            </p>
            <div className="flex gap-2">
              <button onClick={handleDeleteCategory} className="flex-1 bg-red-700 hover:bg-red-600 text-white text-sm py-2 rounded">삭제</button>
              <button onClick={() => setDeleteCat(null)} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-sm py-2 rounded">취소</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 월드컵 추가 모달 ── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-80 border border-gray-700 flex flex-col gap-4">
            <p className="text-white font-bold">월드컵 추가</p>
            <input
              type="text"
              value={addName}
              onChange={e => setAddName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddCategory() }}
              placeholder="월드컵 이름"
              autoFocus
              className="bg-gray-700 text-white text-sm px-3 py-2 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="flex gap-2">
              {(['actor', 'work'] as const).map((v, i) => (
                <button
                  key={v}
                  onClick={() => setAddType(v)}
                  className={`flex-1 text-sm py-1.5 rounded ${i === 0 ? 'rounded-l' : 'rounded-r'} ${addType === v ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                >
                  {v === 'actor' ? '배우' : '작품'}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={handleAddCategory} disabled={!addName.trim()} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm py-2 rounded">추가</button>
              <button onClick={() => setShowAddModal(false)} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-sm py-2 rounded">취소</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 순위 썸네일 중앙 프리뷰 ── */}
      {rankImgPreview && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-40">
          <ImagePreview path={rankImgPreview} alt="" className="max-h-[70vh] w-auto rounded-xl shadow-2xl border border-gray-600" objectPosition="center 10%" />
        </div>
      )}

      {/* ── 전체 추이 모달 ── */}
      {trendModal && (() => {
        const history = rankHistories[trendModal.id] ?? []
        const W = 420, H = 180, PX = 36, PY = 16
        const ranks = history.map(h => h.rank)
        const minR = ranks.length ? Math.min(...ranks) : 1
        const maxR = ranks.length ? Math.max(...ranks) : 1
        const range = maxR - minR || 1
        const pts = history.map((h, i) => {
          const x = PX + (history.length > 1 ? (i / (history.length - 1)) : 0.5) * (W - PX * 2)
          const y = PY + ((h.rank - minR) / range) * (H - PY * 2)
          return { x, y, rank: h.rank }
        })
        const polyPts = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
        const last = ranks[ranks.length - 1] ?? 0
        const prev = ranks[ranks.length - 2] ?? last
        const color = last < prev ? '#4ade80' : last > prev ? '#f87171' : '#9ca3af'
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setTrendModal(null)}>
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700" style={{ width: W + 80 }} onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4">
                <ImagePreview path={trendModal.imgPath} alt={trendModal.label} className="w-10 h-10 rounded object-cover shrink-0" objectPosition="center 10%" />
                <p className="text-white font-bold flex-1 truncate">{trendModal.label} 순위 추이</p>
                <button onClick={() => setTrendModal(null)} className="text-gray-400 hover:text-white text-sm ml-auto shrink-0">✕</button>
              </div>
              {history.length < 2 ? (
                <p className="text-gray-500 text-sm text-center py-8">추이 데이터가 부족합니다.</p>
              ) : (
                <svg width={W} height={H} className="overflow-visible">
                  {/* y축 눈금선 */}
                  {Array.from(new Set([minR, maxR])).map(r => {
                    const y = PY + ((r - minR) / range) * (H - PY * 2)
                    return (
                      <g key={r}>
                        <line x1={PX} y1={y} x2={W - PX} y2={y} stroke="#374151" strokeDasharray="3,3" />
                        <text x={PX - 6} y={y + 4} fill="#9ca3af" fontSize="11" textAnchor="end">{r}</text>
                      </g>
                    )
                  })}
                  {/* 라인 */}
                  <polyline points={polyPts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
                  {/* 점 + 라벨 */}
                  {pts.map((p, i) => (
                    <g key={i}>
                      <circle cx={p.x} cy={p.y} r="4" fill={color} />
                      <text x={p.x} y={p.y - 8} fill="#e5e7eb" fontSize="11" textAnchor="middle">{p.rank}</text>
                    </g>
                  ))}
                </svg>
              )}
              <p className="text-gray-500 text-xs mt-2 text-right">총 {history.length}회</p>
            </div>
          </div>
        )
      })()}

      {tooltip && <CardTooltip tooltip={tooltip} />}
    </div>
  )
}
