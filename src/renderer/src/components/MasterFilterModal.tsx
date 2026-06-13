import { useState, useEffect } from 'react'
import { cupApi } from '../api'

export type MasterFilter = {
  selectedDivisions?: number[]
}

export function countActiveMasterFilters(filter: MasterFilter | null): number {
  if (!filter) return 0
  return (filter.selectedDivisions?.length ?? 0) > 0 ? 1 : 0
}

const DIV_LABEL: Record<number, string> = { 1: '1부', 2: '2부', 3: '3부', 4: '4부', 5: '5부', 6: '6부', 0: '미분류' }

interface Props {
  type: 'actor' | 'work'
  filter: MasterFilter | null
  onSave: (filter: MasterFilter | null) => void
  onClose: () => void
}

export default function MasterFilterModal({ type, filter, onSave, onClose }: Props) {
  const [divisionCounts, setDivisionCounts] = useState<{ division: number; count: number }[]>([])
  const [selected, setSelected] = useState<number[]>(filter?.selectedDivisions ?? [])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    cupApi.divisionCounts(type).then(d => {
      setDivisionCounts(d)
      setLoading(false)
    })
  }, [type])

  const toggle = (div: number) => {
    setSelected(prev => prev.includes(div) ? prev.filter(d => d !== div) : [...prev, div])
  }

  const handleSave = () => {
    onSave(selected.length > 0 ? { selectedDivisions: selected } : null)
  }

  const unit = type === 'actor' ? '명' : '작품'

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-lg p-6 w-[480px] border border-gray-700 flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-white font-bold">마스터 대회 필터</p>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">✕</button>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-gray-400 text-xs">참가 부 선택 <span className="text-gray-600">(미선택 시 전체)</span></label>
          {loading ? (
            <p className="text-gray-500 text-sm py-2">로딩 중...</p>
          ) : divisionCounts.length === 0 ? (
            <p className="text-gray-500 text-sm py-2">마스터 랭킹 기록이 없습니다. 대회를 진행하면 부가 생성됩니다.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {divisionCounts.map(({ division, count }) => {
                const isSelected = selected.includes(division)
                return (
                  <button
                    key={division}
                    onClick={() => toggle(division)}
                    className={`px-3 py-2 rounded text-sm font-medium transition flex flex-col items-center min-w-[72px] ${
                      isSelected
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <span>{DIV_LABEL[division] ?? `${division}부`}</span>
                    <span className={`text-xs mt-0.5 ${isSelected ? 'text-blue-200' : 'text-gray-500'}`}>
                      {count}{unit}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
          {selected.length > 0 && (
            <p className="text-xs text-blue-400">
              선택됨: {selected
                .slice()
                .sort((a, b) => { if (a === 0) return 1; if (b === 0) return -1; return a - b })
                .map(d => DIV_LABEL[d] ?? `${d}부`)
                .join(', ')}
            </p>
          )}
        </div>

        <div className="flex gap-2 pt-2 border-t border-gray-700">
          <button
            onClick={() => { setSelected([]); onSave(null) }}
            className="text-sm px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded"
          >
            필터 초기화
          </button>
          <div className="flex-1" />
          <button onClick={onClose} className="text-sm px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded">취소</button>
          <button onClick={handleSave} className="text-sm px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded">저장</button>
        </div>
      </div>
    </div>
  )
}
