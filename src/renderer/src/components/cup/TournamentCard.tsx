import React, { useState, useEffect, useCallback, useRef } from 'react'
import { cupApi } from '../../api'
import ImagePreview from '../ImagePreview'
import WorldcupFilterModal, { type WcFilter, countActiveFilters } from '../WorldcupFilterModal'
import MasterFilterModal, { type MasterFilter, countActiveMasterFilters } from '../MasterFilterModal'
import type { CupTournament } from './cupTypes'
import { FORMAT_LABEL, FORMAT_COLOR, STATUS_LABEL, STATUS_COLOR, ROUND_OPTIONS, calcPoolSize, RunDistChart, roundLabel } from './cupConstants'

export default function TournamentCard({
  t,
  onPlay,
  onRankings,
  onStats,
  onDelete,
  onUpdate,
}: {
  t: CupTournament
  onPlay: (runId?: number, tab?: 'match' | 'standings') => void
  onRankings: (id: number) => void
  onStats: (id: number) => void
  onDelete: () => void
  onUpdate: () => void
}) {
  const [showEditName, setShowEditName] = useState(false)
  const [editName, setEditName] = useState(t.name)
  const [showConfirmDel, setShowConfirmDel] = useState(false)
  const [delConfirmInput, setDelConfirmInput] = useState('')
  const [showInProgress, setShowInProgress] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('')
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [clearConfirmInput, setClearConfirmInput] = useState('')
  const [showFilterModal, setShowFilterModal] = useState(false)
  const [cardFilter, setCardFilter] = useState<WcFilter | MasterFilter | null>(t.filter_json ? JSON.parse(t.filter_json) : null)
  const [itemCount, setItemCount] = useState(0)
  const [roundValue, setRoundValue] = useState(0)
  const [starting, setStarting] = useState(false)
  const [runProgress, setRunProgress] = useState<{ match: { round: number; match_index: number; phase: string; group_id: number | null; block_id: number | null } | null; total: number; done: number; groupMatchDone: number | null; groupMatchTotal: number | null } | null>(null)

  useEffect(() => {
    cupApi.itemCount(t.id).then(count => {
      setItemCount(count as number)
      const allValid = ROUND_OPTIONS.filter(o => {
        if (o.value === 0) return t.format === 'tournament'
        if (t.format === 'worldcup') return (count as number) >= o.value * 2
        if (t.format === 'league') return (count as number) >= o.value * 2
        return o.value <= (count as number)
      })
      const validOptions = t.format === 'worldcup'
        ? (() => { const nonZero = allValid.filter(o => o.value !== 0); return nonZero.length > 0 ? [nonZero[nonZero.length - 1]] : allValid })()
        : allValid
      if (t.latest_run_status === 'in_progress' && t.round_total !== undefined && t.round_total !== null) {
        setRoundValue(t.round_total)
      } else {
        const saved = Number(localStorage.getItem(`cup:roundValue:${t.id}`) ?? '')
        const savedValid = validOptions.some(o => o.value === saved)
        if (savedValid) {
          setRoundValue(saved)
        } else {
          const best = validOptions.find(o => o.value !== 0 && o.value >= (count as number))
            ?? validOptions.find(o => o.value !== 0)
            ?? validOptions[0]
          if (best) setRoundValue(best.value)
        }
      }
    })
  }, [t.id, t.latest_run_status, t.round_total, t.filter_json])

  useEffect(() => {
    if (t.latest_run_status === 'in_progress' && t.latest_run_id) {
      cupApi.runProgress(t.latest_run_id).then(setRunProgress)
    } else {
      setRunProgress(null)
    }
  }, [t.latest_run_id, t.latest_run_status])

  const validOptions = (() => {
    const allValid = ROUND_OPTIONS.filter(o => {
      if (o.value === 0) return t.format === 'tournament'
      if (t.format === 'worldcup') return itemCount >= o.value * 2
      if (t.format === 'league') return itemCount >= o.value * 2
      return o.value <= itemCount
    })
    if (t.format === 'worldcup') {
      const nonZero = allValid.filter(o => o.value !== 0)
      return nonZero.length > 0 ? [nonZero[nonZero.length - 1]] : allValid
    }
    return allValid
  })()

  const doStart = async (force = false) => {
    setStarting(true)
    try {
      const result = await cupApi.start(t.id, roundValue, force) as { run: CupRun }
      onPlay(result.run.id, 'match')
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setStarting(false)
    }
  }

  const handleClearRun = async () => {
    await cupApi.clearRun(t.id)
    onUpdate()
  }

  const handleStartClick = () => {
    if (t.latest_run_status === 'in_progress') {
      setShowInProgress(true)
    } else {
      doStart()
    }
  }

  const handleSaveName = async () => {
    if (!editName.trim()) return
    await cupApi.update({ id: t.id, name: editName.trim() })
    onUpdate()
    setShowEditName(false)
  }

  const runStatus = t.latest_run_status
  const hasRun = t.latest_run_id !== null

  return (
    <>
      <div className="relative cursor-pointer rounded-lg border border-gray-700 ring-2 ring-transparent hover:border-gray-500 flex flex-col">
        {/* 썸네일 */}
        <div className="relative rounded-t-lg overflow-hidden">
          <ImagePreview path={t.winner_photo ?? null} alt={t.name} className="w-full h-40" objectPosition="center 10%" />
          {/* 진행 상황 칩 */}
          {runStatus === 'in_progress' && (() => {
            const m = runProgress?.match
            let label = '진행중'
            if (m) {
              if (t.format === 'tournament') {
                label = `${roundLabel(m.round)} ${m.match_index + 1}/${Math.ceil(m.round / 2)}경기`
              } else if (t.format === 'league') {
                const gDone = runProgress?.groupMatchDone ?? 0
                const gTotal = runProgress?.groupMatchTotal ?? '?'
                const mDone = runProgress?.mainRoundDone ?? 0
                const mTotal = runProgress?.mainRoundTotal ?? Math.ceil(m.round / 2)
                if (m.phase === 'group') label = `${m.group_id}조 조별리그 — ${gDone + 1}/${gTotal}경기`
                else if (m.phase === 'tiebreak') label = `${m.group_id}조 동점처리 — ${gDone + 1}/${gTotal}경기`
                else label = `본선 ${roundLabel(m.round)} — ${mDone + 1}/${mTotal}경기`
              } else if (t.format === 'worldcup') {
                const gDone = runProgress?.groupMatchDone ?? 0
                const gTotal = runProgress?.groupMatchTotal ?? '?'
                const blkLabel = m.group_id != null ? String.fromCharCode(65 + Math.floor((m.group_id - 1) / 16)) : ''
                if (m.phase === 'group') label = `${blkLabel}블록 ${m.group_id}조 예선 — ${gDone + 1}/${gTotal}경기`
                else if (m.phase === 'tiebreak') label = `${blkLabel}블록 ${m.group_id}조 동점처리 — ${gDone + 1}/${gTotal}경기`
                else if (m.phase === 'main' && m.block_id != null) {
                  const rt = t.round_total ?? 0
                  const unit = t.type === 'actor' ? '인' : '작품'
                  const blk2 = String.fromCharCode(65 + m.block_id)
                  const roundStr = rt > 0 ? `${rt / (32 / m.round)}강(${m.round}${unit})` : `${m.round}강`
                  label = `${blk2}블록 본선 ${roundStr} — ${m.match_index + 1}/${m.round / 2}경기`
                } else label = `결승 라운드 ${m.match_index + 1}/${m.round / 2}경기`
              }
            }
            return (
              <span className="absolute top-1 left-1 px-1.5 py-0.5 text-xs rounded font-semibold text-green-300 bg-gray-900/80">
                {label}
              </span>
            )
          })()}
          {/* M / F / C / X 버튼 */}
          <div className="absolute bottom-1 right-1 flex gap-1">
            <button
              onClick={e => { e.stopPropagation(); setEditName(t.name); setShowEditName(true) }}
              className="w-6 h-6 rounded bg-gray-900/70 hover:bg-gray-700 text-white text-xs font-bold flex items-center justify-center"
            >M</button>
            {t.format !== 'worldcup' && (
              <button
                onClick={e => { e.stopPropagation(); setShowFilterModal(true) }}
                className={`w-6 h-6 rounded text-xs font-bold flex items-center justify-center ${
                  (t.is_master === 1 ? countActiveMasterFilters(cardFilter as MasterFilter) : countActiveFilters(cardFilter as WcFilter)) > 0
                    ? 'bg-blue-600 hover:bg-blue-500 text-white'
                    : 'bg-gray-900/70 hover:bg-gray-700 text-white'
                }`}
              >F</button>
            )}
            {t.latest_run_status === 'in_progress' && (
              <button
                onClick={e => { e.stopPropagation(); setClearConfirmInput(''); setShowClearConfirm(true) }}
                className="w-6 h-6 rounded bg-gray-900/70 hover:bg-blue-700 text-blue-400 hover:text-white text-xs font-bold flex items-center justify-center"
              >C</button>
            )}
            <button
              onClick={e => { e.stopPropagation(); setDelConfirmInput(''); setShowConfirmDel(true) }}
              className="w-6 h-6 rounded bg-gray-900/70 hover:bg-red-700 text-red-400 hover:text-white text-xs font-bold flex items-center justify-center"
            >X</button>
          </div>
        </div>

        {/* 정보 */}
        <div className="p-2 bg-gray-800 flex-1 flex flex-col gap-1">
          <p className="text-sm font-bold text-white truncate">{t.name}</p>

          <div className="flex items-center gap-1 flex-wrap">
            {t.is_master === 1 && (
              <span className="px-1.5 py-0.5 bg-yellow-900/60 text-yellow-300 text-xs rounded font-semibold">★</span>
            )}
            <span className={`px-1.5 py-0.5 text-xs rounded ${FORMAT_COLOR[t.format] ?? 'bg-gray-700 text-gray-300'}`}>
              {FORMAT_LABEL[t.format] ?? t.format}
            </span>
            <span className="px-1.5 py-0.5 text-xs rounded bg-gray-700 text-gray-300">
              {t.type === 'actor' ? '배우' : '작품'}
            </span>
          </div>


          <div className="flex flex-col gap-1 mt-auto pt-1">
            {/* 강수 selectbox: 진행중일 때만 disabled */}
            <select
              value={roundValue}
              onChange={e => { const v = Number(e.target.value); setRoundValue(v); localStorage.setItem(`cup:roundValue:${t.id}`, String(v)) }}
              className="w-full bg-gray-700 text-white text-xs px-2 py-1.5 rounded"
            >
              {validOptions.map(o => (
                <option key={o.value} value={o.value}>
                  {o.value === 0
                    ? `전체 (${itemCount}${t.type === 'actor' ? '명' : '작품'})`
                    : t.format === 'worldcup'
                      ? `${o.label} (${o.value / 2}조)`
                      : t.format === 'league'
                        ? `${o.label} (풀${calcPoolSize(itemCount, o.value * 2)}${t.type === 'actor' ? '명' : '작품'})`
                        : `${o.label} (풀${calcPoolSize(itemCount, o.value)}${t.type === 'actor' ? '명' : '작품'})`
                  }
                </option>
              ))}
            </select>
            {/* 대회시작 / 순위보기 / 통계보기 */}
            <div className="flex gap-1">
              <button
                onClick={handleStartClick}
                disabled={starting}
                className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs rounded font-semibold"
              >
                {starting ? '시작 중...' : '대회시작'}
              </button>
              <button
                onClick={() => onRankings(t.id)}
                disabled={!hasRun}
                className="flex-1 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-xs rounded"
              >
                순위보기
              </button>
              <button
                onClick={() => onStats(t.id)}
                disabled={!hasRun}
                className="flex-1 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-xs rounded"
              >
                통계보기
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 진행중 대회 모달 */}
      {showInProgress && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-[380px] shadow-2xl">
            <h2 className="text-base font-bold text-white mb-2">이미 진행 중인 대회가 있습니다</h2>
            <p className="text-sm text-gray-400 mb-6">이어하시겠습니까?</p>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowInProgress(false); onPlay(t.latest_run_id!, 'match') }}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-semibold"
              >예</button>
              <button
                onClick={() => { setShowInProgress(false); setDeleteConfirmInput(''); setShowDeleteConfirm(true) }}
                className="flex-1 py-2 bg-red-700 hover:bg-red-600 text-white rounded text-sm font-semibold"
              >아니오</button>
              <button
                onClick={() => setShowInProgress(false)}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
              >취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 새 런 시작 삭제 확인 모달 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-[380px] shadow-2xl">
            <h2 className="text-base font-bold text-white mb-2">진행하던 대회가 삭제됩니다</h2>
            <p className="text-sm text-gray-400 mb-3">정말 새로 시작하시겠습니까?</p>
            <p className="text-xs text-red-400 mb-2">확인하려면 아래에 <span className="font-bold">지금 삭제</span>를 입력하세요.</p>
            <input
              autoFocus
              className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500 mb-4"
              placeholder="지금 삭제"
              value={deleteConfirmInput}
              onChange={e => setDeleteConfirmInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && deleteConfirmInput === '지금 삭제') { setShowDeleteConfirm(false); doStart(true) } }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowDeleteConfirm(false); doStart(true) }}
                disabled={deleteConfirmInput !== '지금 삭제'}
                className="flex-1 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded text-sm font-semibold"
              >확인</button>
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmInput('') }}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
              >취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 대회명 수정 모달 */}
      {showEditName && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowEditName(false)}>
          <div className="bg-gray-800 rounded-xl p-6 w-[360px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold text-white mb-4">대회명 수정</h2>
            <input
              autoFocus
              className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 mb-4"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveName()}
            />
            <div className="flex gap-2">
              <button onClick={handleSaveName} disabled={!editName.trim()} className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded text-sm font-semibold">저장</button>
              <button onClick={() => setShowEditName(false)} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 confirm 모달 */}
      {showConfirmDel && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowConfirmDel(false)}>
          <div className="bg-gray-800 rounded-xl p-6 w-[380px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold text-white mb-2">대회 삭제</h2>
            <p className="text-sm text-gray-400 mb-3">「{t.name}」을 삭제하시겠습니까?<br />이 작업은 되돌릴 수 없습니다.</p>
            <p className="text-xs text-red-400 mb-2">확인하려면 아래에 <span className="font-bold">지금 삭제</span>를 입력하세요.</p>
            <input
              autoFocus
              className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500 mb-4"
              placeholder="지금 삭제"
              value={delConfirmInput}
              onChange={e => setDelConfirmInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && delConfirmInput === '지금 삭제') { setShowConfirmDel(false); onDelete() } }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowConfirmDel(false); onDelete() }}
                disabled={delConfirmInput !== '지금 삭제'}
                className="flex-1 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded text-sm font-semibold"
              >삭제</button>
              <button onClick={() => { setShowConfirmDel(false); setDelConfirmInput('') }} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">취소</button>
            </div>
          </div>
        </div>
      )}

      {/* C 버튼: 진행중 런 클리어 모달 */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowClearConfirm(false)}>
          <div className="bg-gray-800 rounded-xl p-6 w-[380px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold text-white mb-2">진행중 대회 데이터 삭제</h2>
            <p className="text-sm text-gray-400 mb-3">「{t.name}」의 진행중인 대회 데이터를 삭제합니다.<br />이 작업은 되돌릴 수 없습니다.</p>
            <p className="text-xs text-red-400 mb-2">확인하려면 아래에 <span className="font-bold">지금 삭제</span>를 입력하세요.</p>
            <input
              autoFocus
              className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500 mb-4"
              placeholder="지금 삭제"
              value={clearConfirmInput}
              onChange={e => setClearConfirmInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && clearConfirmInput === '지금 삭제') { setShowClearConfirm(false); handleClearRun() } }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowClearConfirm(false); handleClearRun() }}
                disabled={clearConfirmInput !== '지금 삭제'}
                className="flex-1 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded text-sm font-semibold"
              >확인</button>
              <button onClick={() => { setShowClearConfirm(false); setClearConfirmInput('') }} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 필터 모달 */}
      {showFilterModal && (t.is_master === 1 ? (
        <MasterFilterModal
          type={t.type}
          filter={cardFilter as MasterFilter}
          onSave={async f => {
            await cupApi.update({ id: t.id, filterJson: f })
            setCardFilter(f)
            setShowFilterModal(false)
            onUpdate()
          }}
          onClose={() => setShowFilterModal(false)}
        />
      ) : (
        <WorldcupFilterModal
          type={t.type}
          filter={cardFilter as WcFilter}
          onSave={async f => {
            await cupApi.update({ id: t.id, filterJson: f })
            setCardFilter(f)
            setShowFilterModal(false)
            onUpdate()
          }}
          onClose={() => setShowFilterModal(false)}
        />
      ))}
    </>
  )
}
