import { useState, useRef, useEffect } from 'react'
import { pushEscHandler, popEscHandler } from '../escManager'
import type { ActorScores } from '../types'
import ImagePreview from './ImagePreview'

export const SCORE_GRADE_LIMITS: Record<number, number> = { 11: 5, 12: 3, 13: 1 }

export const SCORE_FIELD_LABELS: Record<keyof ActorScores, string> = {
  face: '얼굴', bust: '가슴', hip: '엉덩이', physical: '몸매', skin: '피부',
  acting: '연기력', sexy: '섹기', charm: '매력', technique: '테크닉', proportions: '비율',
}

// Minimal snapshot of actor score data (structurally compatible with ActorPhysicalData)
export interface ActorScoreSnapshot {
  id: number
  name: string
  photo_path: string | null
  face: number
  score_bust: number
  score_hip: number
  physical: number
  skin: number
  acting: number
  sexy: number
  charm: number
  technique: number
  proportions: number
}

function getScore(a: ActorScoreSnapshot, field: keyof ActorScores): number {
  if (field === 'bust') return a.score_bust
  if (field === 'hip') return a.score_hip
  return a[field as keyof Omit<ActorScoreSnapshot, 'id' | 'name' | 'photo_path' | 'score_bust' | 'score_hip'>] as number
}

export interface PendingDemotion {
  actorId: number
  field: keyof ActorScores
  newScore: number
}

export interface DemoteStep {
  incoming: { id: number | null; name: string; photo_path: string | null }
  targetScore: number
  candidates: { id: number; name: string; photo_path: string | null }[]
}

export function useScoreDemote() {
  const [step, setStep] = useState<DemoteStep | null>(null)
  const [field, setField] = useState<keyof ActorScores | null>(null)
  const fieldRef = useRef<keyof ActorScores | null>(null)
  const allActorsRef = useRef<ActorScoreSnapshot[]>([])
  const pendingRef = useRef<PendingDemotion[]>([])
  const onCompleteRef = useRef<((changes: PendingDemotion[]) => Promise<void>) | null>(null)

  const start = (
    f: keyof ActorScores,
    targetScore: number,
    incoming: { id: number | null; name: string; photo_path: string | null },
    allActors: ActorScoreSnapshot[],
    onComplete: (changes: PendingDemotion[]) => Promise<void>
  ) => {
    fieldRef.current = f
    setField(f)
    allActorsRef.current = allActors
    pendingRef.current = []
    onCompleteRef.current = onComplete
    const candidates = allActors
      .filter(a => a.id !== incoming.id && getScore(a, f) === targetScore)
      .map(a => ({ id: a.id, name: a.name, photo_path: a.photo_path }))
    setStep({ incoming, targetScore, candidates })
  }

  const handleSelect = async (candidateId: number) => {
    if (!step || !fieldRef.current) return
    const f = fieldRef.current
    const { targetScore } = step
    const newScore = targetScore - 1
    const candidate = allActorsRef.current.find(a => a.id === candidateId)!
    const newChanges: PendingDemotion[] = [...pendingRef.current, { actorId: candidateId, field: f, newScore }]
    pendingRef.current = newChanges

    if (newScore >= 11) {
      const actorsAtNewScore = allActorsRef.current.filter(
        a => a.id !== candidateId && getScore(a, f) === newScore
      )
      if (actorsAtNewScore.length >= SCORE_GRADE_LIMITS[newScore]) {
        setStep({
          incoming: { id: candidate.id, name: candidate.name, photo_path: candidate.photo_path },
          targetScore: newScore,
          candidates: actorsAtNewScore.map(a => ({ id: a.id, name: a.name, photo_path: a.photo_path })),
        })
        return
      }
    }

    await onCompleteRef.current?.(newChanges)
    setStep(null)
    pendingRef.current = []
  }

  const cancel = () => {
    setStep(null)
    pendingRef.current = []
  }

  return { step, field, start, handleSelect, cancel }
}

export function ScoreDemoteModal({ step, field, onSelect, onCancel }: {
  step: DemoteStep
  field: keyof ActorScores
  onSelect: (id: number) => void
  onCancel: () => void
}) {
  useEffect(() => {
    pushEscHandler(onCancel)
    return () => popEscHandler(onCancel)
  }, [onCancel])

  const fieldLabel = SCORE_FIELD_LABELS[field]

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200]" onClick={onCancel}>
      <div className="bg-gray-800 rounded-lg w-80 max-h-[80vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-gray-700">
          <p className="text-white font-bold text-sm">[{fieldLabel}] {step.targetScore}점 정원 초과</p>
          <p className="text-xs text-gray-400 mt-0.5">한도: {SCORE_GRADE_LIMITS[step.targetScore]}명</p>
        </div>
        <div className="px-4 py-3 border-b border-gray-700">
          <p className="text-xs text-gray-400 mb-2">등록 예정</p>
          <div className="flex items-center gap-2 bg-gray-700 rounded px-2 py-1.5">
            <ImagePreview path={step.incoming.photo_path} alt={step.incoming.name} className="w-8 h-8 rounded shrink-0" objectPosition="center 10%" />
            <span className="text-white text-sm font-bold truncate">{step.incoming.name}</span>
            <span className="ml-auto text-blue-400 text-xs shrink-0 font-bold">→ {step.targetScore}점</span>
          </div>
        </div>
        <div className="px-4 py-2 border-b border-gray-700">
          <p className="text-xs text-gray-300">
            어떤 배우를 <span className="text-yellow-400 font-bold">{step.targetScore}점</span>에서{' '}
            <span className="text-orange-400 font-bold">{step.targetScore - 1}점</span>으로 내려보내겠습니까?
          </p>
        </div>
        <div className="overflow-y-auto flex-1">
          {step.candidates.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className="w-full flex items-center gap-2 px-4 py-2 hover:bg-gray-700 text-left"
            >
              <ImagePreview path={c.photo_path} alt={c.name} className="w-8 h-8 rounded shrink-0" objectPosition="center 10%" />
              <span className="text-gray-200 text-sm truncate">{c.name}</span>
            </button>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-gray-700">
          <button
            type="button"
            onClick={onCancel}
            className="w-full text-xs text-gray-400 hover:text-white py-1.5 rounded bg-gray-700 hover:bg-gray-600"
          >
            취소 (점수 변경 안 함)
          </button>
        </div>
      </div>
    </div>
  )
}
