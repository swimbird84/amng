import React, { useState, useEffect } from 'react'
import { cupApi } from '../../api'
import WorldcupFilterModal, { type WcFilter, countActiveFilters } from '../WorldcupFilterModal'
import MasterFilterModal, { type MasterFilter, countActiveMasterFilters } from '../MasterFilterModal'
import type { CupTournament } from './cupTypes'
import { ROUND_OPTIONS, FORMAT_LABEL, calcPoolSize } from './cupConstants'

export default function CreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (t: CupTournament) => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<'actor' | 'work'>('actor')
  const [format, setFormat] = useState<'tournament' | 'league' | 'worldcup'>('tournament')
  const [isMaster, setIsMaster] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filterJson, setFilterJson] = useState<WcFilter | null>(null)
  const [masterFilter, setMasterFilter] = useState<MasterFilter | null>(null)
  const [showFilterModal, setShowFilterModal] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      const effectiveFilter = isMaster ? (masterFilter ?? null) : (filterJson ?? null)
      const t = await cupApi.create({ type, name: name.trim(), isMaster, format, filterJson: effectiveFilter }) as CupTournament
      onCreated(t)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl p-6 w-[420px] shadow-2xl">
        <h2 className="text-lg font-bold text-white mb-4">대회 등록</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">대회명</label>
            <input
              autoFocus
              className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="대회 이름 입력"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
          </div>

          <label className={`flex items-center gap-3 select-none ${format === 'worldcup' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
            <div
              onClick={() => format !== 'worldcup' && setIsMaster(v => !v)}
              className={`w-10 h-5 rounded-full transition-colors ${isMaster ? 'bg-yellow-500' : 'bg-gray-600'} relative`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isMaster ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm text-gray-200">마스터 대회 <span className="text-yellow-400 text-xs">(랭킹 반영)</span>{format === 'worldcup' && <span className="text-gray-500 text-xs ml-1">(월드컵 고정)</span>}</span>
          </label>

          <div className="flex gap-2">
            {(['actor', 'work'] as const).map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`flex-1 py-2 rounded text-sm font-medium transition ${type === t ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              >
                {t === 'actor' ? '배우' : '작품'}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            {(['tournament', 'league', 'worldcup'] as const).map(f => (
              <button
                key={f}
                onClick={() => { setFormat(f); if (f === 'worldcup') setIsMaster(true) }}
                className={`flex-1 py-2 rounded text-sm font-medium transition ${format === f ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              >
                {FORMAT_LABEL[f]}
              </button>
            ))}
          </div>

          {format !== 'worldcup' && (
            <button
              className={`w-full py-2 rounded text-sm ${
                (isMaster ? countActiveMasterFilters(masterFilter) : countActiveFilters(filterJson)) > 0
                  ? 'bg-blue-700 hover:bg-blue-600 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
              onClick={() => setShowFilterModal(true)}
            >
              필터 설정
            </button>
          )}
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={handleCreate}
            disabled={!name.trim() || saving}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded text-sm font-semibold"
          >
            등록
          </button>
          <button onClick={onClose} className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">취소</button>
        </div>
      </div>
    </div>
    {showFilterModal && (isMaster ? (
      <MasterFilterModal
        type={type}
        filter={masterFilter}
        onSave={f => { setMasterFilter(f); setShowFilterModal(false) }}
        onClose={() => setShowFilterModal(false)}
      />
    ) : (
      <WorldcupFilterModal
        type={type}
        filter={filterJson}
        onSave={f => { setFilterJson(f); setShowFilterModal(false) }}
        onClose={() => setShowFilterModal(false)}
      />
    ))}
    </>
  )
}
