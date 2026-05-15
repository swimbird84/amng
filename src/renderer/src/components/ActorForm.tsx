import { useState, useEffect, useRef } from 'react'
import type { Actor, Tag, ActorScores } from '../types'
import { actorsApi, actorTagsApi, actorTagCategoriesApi, dialogApi, imageApi, actorTagLinksApi } from '../api'
import TagSelector from './TagSelector'
import ImagePreview from './ImagePreview'
import DateInput from './DateInput'

const SCORE_GRADE_LIMITS: Record<number, number> = { 11: 5, 12: 3, 13: 1 }
interface Props {
  actor?: Actor & { tags?: Tag[] }
  onSave: () => void
  onCancel: () => void
}

const SCORE_FIELDS: { key: keyof ActorScores; label: string }[] = [
  { key: 'face', label: '얼굴' },
  { key: 'bust', label: '가슴' },
  { key: 'hip', label: '엉덩이' },
  { key: 'physical', label: '몸매' },
  { key: 'skin', label: '피부' },
  { key: 'acting', label: '연기력' },
  { key: 'sexy', label: '섹기' },
  { key: 'charm', label: '매력' },
  { key: 'technique', label: '테크닉' },
  { key: 'proportions', label: '비율' },
]

const SCORE_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]

export default function ActorForm({ actor, onSave, onCancel }: Props) {
  const [name, setName] = useState(actor?.name || '')
  const [photoPath, setPhotoPath] = useState(actor?.photo_path || '')
  const [birthday, setBirthday] = useState(actor?.birthday || '')
  const [debutDate, setDebutDate] = useState(actor?.debut_date || '')
  const [height, setHeight] = useState(actor?.height?.toString() || '')
  const [bust, setBust] = useState(actor?.bust?.toString() || '')
  const [waist, setWaist] = useState(actor?.waist?.toString() || '')
  const [hip, setHip] = useState(actor?.hip?.toString() || '')
  const [cup, setCup] = useState(actor?.cup || '')
  const [physArbitrary, setPhysArbitrary] = useState<Set<string>>(
    new Set((actor?.phys_arbitrary ?? '').split('|').filter(Boolean))
  )
  const toggleArbitrary = (field: string) => setPhysArbitrary(prev => {
    const next = new Set(prev); next.has(field) ? next.delete(field) : next.add(field); return next
  })
  const [comment, setComment] = useState(actor?.comment || '')
  const [scores, setScores] = useState<ActorScores>(
    actor?.scores ? { ...actor.scores, charm: actor.scores.charm ?? 0, technique: actor.scores.technique ?? 0, proportions: actor.scores.proportions ?? 0 } : { face: 0, bust: 0, hip: 0, physical: 0, skin: 0, acting: 0, sexy: 0, charm: 0, technique: 0, proportions: 0 }
  )
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>(actor?.tags?.map((t) => t.id) || [])
  const [repTagIds, setRepTagIds] = useState<number[]>(actor?.rep_tags?.map((t) => t.id) || [])
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [tagLinks, setTagLinks] = useState<{ parent_tag_id: number; child_tag_id: number }[]>([])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirm('작성 중인 내용이 사라집니다. 계속하시겠습니까?')) onCancel()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onCancel])

  useEffect(() => {
    actorTagsApi.list().then((t) => setAllTags(t as Tag[]))
    actorTagLinksApi.list().then(l => setTagLinks(l))
  }, [])

  const handleSelectPhoto = async () => {
    const path = await dialogApi.openImage() as string | null
    if (path) setPhotoPath(path)
  }

  const handleScoreChange = async (key: keyof ActorScores, value: number) => {
    if (value >= 11) {
      const counts = await actorsApi.scoreGradeCounts(actor?.id)
      const itemCounts = counts[key]
      const limit = SCORE_GRADE_LIMITS[value]
      if ((itemCounts?.[value]?.count ?? 0) >= limit) {
        const label = SCORE_FIELDS.find(f => f.key === key)?.label ?? key
        alert(`[${label}] ${value}점 정원이 가득 찼습니다 (한도: ${limit}명)\n현재 ${value}점 배우: ${itemCounts?.[value]?.names || '-'}`)
        return
      }
    }
    setScores((prev) => ({ ...prev, [key]: value }))
  }

  const handleSaveRef = useRef(handleSave)
  handleSaveRef.current = handleSave

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSaveRef.current()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  async function handleSave() {
    if (!name.trim()) return alert('이름을 입력하세요')

    const data = {
      name: name.trim(),
      photo_path: photoPath || undefined,
      birthday: birthday || undefined,
      debut_date: debutDate || null,
      height: height ? Number(height) : null,
      bust: bust ? Number(bust) : null,
      waist: waist ? Number(waist) : null,
      hip: hip ? Number(hip) : null,
      cup: cup.trim() || null,
      phys_arbitrary: physArbitrary.size > 0 ? [...physArbitrary].join('|') : null,
      comment: comment.trim() || null,
      scores,
      tag_ids: selectedTagIds,
      rep_tag_ids: repTagIds,
    }

    if (actor) {
      await actorsApi.update(actor.id, data)
      if (photoPath && photoPath !== actor.photo_path) {
        const newPath = await imageApi.copy(photoPath, 'actors', actor.id) as string
        await actorsApi.update(actor.id, { photo_path: newPath })
      }
    } else {
      const id = await actorsApi.create(data) as number
      if (photoPath) {
        const newPath = await imageApi.copy(photoPath, 'actors', id) as string
        await actorsApi.update(id, { photo_path: newPath })
      }
    }

    onSave()
  }

  const handleCreateTag = async (name: string): Promise<number> => {
    const id = await actorTagsApi.create(name) as number
    const tags = await actorTagsApi.list() as Tag[]
    setAllTags(tags)
    return id
  }

  const handleCreateTagInCategory = async (name: string, categoryId: number | null): Promise<number> => {
    const id = await actorTagsApi.create(name) as number
    if (categoryId !== null) await actorTagCategoriesApi.setTagCategory(id, categoryId)
    const tags = await actorTagsApi.list() as Tag[]
    setAllTags(tags)
    return id
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg w-[840px] h-[95vh] flex flex-row relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => { if (confirm('작성 중인 내용이 사라집니다. 계속하시겠습니까?')) onCancel() }}
          className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl leading-none z-10"
        >
          ✕
        </button>

        {/* 좌측 */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex-shrink-0 px-6 pt-6 pb-3 border-b border-gray-700 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">
              {actor ? '배우 수정' : '배우 등록'}
            </h2>
            <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm">
              저장
            </button>
          </div>

          <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] px-6 py-4 space-y-3">
            <div>
              <label className="text-sm text-gray-400 block mb-1">사진</label>
              <div className="flex gap-3 items-start">
                <ImagePreview path={photoPath} alt="배우 사진" className="w-24 h-24 rounded" />
                <button onClick={handleSelectPhoto} className="bg-gray-600 hover:bg-gray-500 text-white text-sm px-3 py-1.5 rounded">
                  이미지 선택
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-400 block mb-1">이름</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-full"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-gray-400 block mb-1">생년월일</label>
                <DateInput
                  value={birthday}
                  onChange={setBirthday}
                  className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-full"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 block mb-1">데뷔일</label>
                <DateInput
                  value={debutDate}
                  onChange={setDebutDate}
                  className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-full"
                />
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-400 block mb-1">신체</label>
              <div className="flex items-stretch gap-2">
                {/* 신장 */}
                <div className="flex items-stretch gap-1 flex-1">
                  <div className="flex flex-col items-center justify-between flex-shrink-0">
                    <span className="text-xs text-gray-400">신장</span>
                    <input type="checkbox" checked={physArbitrary.has('height')} onChange={() => toggleArbitrary('height')} className="w-3 h-3 cursor-pointer" />
                  </div>
                  <input
                    type="number"
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                    placeholder="cm"
                    className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                {/* B */}
                <div className="flex items-stretch gap-1 flex-1">
                  <div className="flex flex-col items-center justify-between flex-shrink-0">
                    <span className="text-xs text-gray-400">B</span>
                    <input type="checkbox" checked={physArbitrary.has('bust')} onChange={() => toggleArbitrary('bust')} className="w-3 h-3 cursor-pointer" />
                  </div>
                  <input
                    type="number"
                    value={bust}
                    onChange={(e) => setBust(e.target.value)}
                    placeholder="cm"
                    className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                {/* W */}
                <div className="flex items-stretch gap-1 flex-1">
                  <div className="flex flex-col items-center justify-between flex-shrink-0">
                    <span className="text-xs text-gray-400">W</span>
                    <input type="checkbox" checked={physArbitrary.has('waist')} onChange={() => toggleArbitrary('waist')} className="w-3 h-3 cursor-pointer" />
                  </div>
                  <input
                    type="number"
                    value={waist}
                    onChange={(e) => setWaist(e.target.value)}
                    placeholder="cm"
                    className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                {/* H */}
                <div className="flex items-stretch gap-1 flex-1">
                  <div className="flex flex-col items-center justify-between flex-shrink-0">
                    <span className="text-xs text-gray-400">H</span>
                    <input type="checkbox" checked={physArbitrary.has('hip')} onChange={() => toggleArbitrary('hip')} className="w-3 h-3 cursor-pointer" />
                  </div>
                  <input
                    type="number"
                    value={hip}
                    onChange={(e) => setHip(e.target.value)}
                    placeholder="cm"
                    className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                {/* 컵 */}
                <div className="flex items-stretch gap-1 flex-[0.8]">
                  <input
                    type="text"
                    value={cup}
                    onChange={(e) => {
                      const KO_TO_CUP: Record<string, string> = { ㅁ:'A',ㅠ:'B',ㅊ:'C',ㅇ:'D',ㄷ:'E',ㄹ:'F',ㅎ:'G',ㅗ:'H',ㅑ:'I',ㅓ:'J',ㅏ:'K',ㅣ:'L',ㅡ:'M' }
                      const converted = e.target.value.split('').map(c => KO_TO_CUP[c] ?? c).join('')
                      setCup(converted.toUpperCase())
                    }}
                    placeholder="A"
                    className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-full"
                  />
                  <div className="flex flex-col items-center justify-between flex-shrink-0">
                    <span className="text-xs text-gray-400">컵</span>
                    <input type="checkbox" checked={physArbitrary.has('cup')} onChange={() => toggleArbitrary('cup')} className="w-3 h-3 cursor-pointer" />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-400 block mb-1">평점</label>
              <div className="flex gap-1">
                {SCORE_FIELDS.map(({ key, label }) => (
                  <div key={key} className="flex flex-col gap-0.5 flex-1 min-w-0">
                    <span className="text-xs text-gray-400 text-center truncate">{label}</span>
                    <select
                      value={scores[key]}
                      onChange={(e) => handleScoreChange(key, Number(e.target.value))}
                      className="bg-gray-700 text-white text-xs px-0 py-1 rounded text-center w-full"
                    >
                      {SCORE_OPTIONS.map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* 우측 - 코멘트 + 태그 */}
        <div className="w-[330px] border-l border-gray-700 overflow-y-auto [scrollbar-gutter:stable] p-4 space-y-4">
          <div>
            <label className="text-sm text-gray-400 block mb-1">코멘트</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-full resize-none"
            />
          </div>

          <div>
            <TagSelector
              allTags={allTags}
              selectedIds={selectedTagIds}
              onChange={setSelectedTagIds}
              onCreateTag={handleCreateTag}
              onCreateTagInCategory={handleCreateTagInCategory}
              repTagIds={repTagIds}
              onChangeRep={setRepTagIds}
              defaultOpen={true}
              tagLinks={tagLinks}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
