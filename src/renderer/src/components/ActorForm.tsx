import { useState, useEffect, useRef } from 'react'
import type { Actor, Tag, ActorScores } from '../types'
import { actorsApi, actorTagsApi, dialogApi, imageApi } from '../api'
import TagSelector from './TagSelector'
import ImagePreview from './ImagePreview'
import DateInput from './DateInput'

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

const SCORE_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

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
  const [comment, setComment] = useState(actor?.comment || '')
  const [scores, setScores] = useState<ActorScores>(
    actor?.scores ? { ...actor.scores, charm: actor.scores.charm ?? 5, technique: actor.scores.technique ?? 5, proportions: actor.scores.proportions ?? 5 } : { face: 5, bust: 5, hip: 5, physical: 5, skin: 5, acting: 5, sexy: 5, charm: 5, technique: 5, proportions: 5 }
  )
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>(actor?.tags?.map((t) => t.id) || [])
  const [repTagIds, setRepTagIds] = useState<number[]>(actor?.rep_tags?.map((t) => t.id) || [])
  const [allTags, setAllTags] = useState<Tag[]>([])

  useEffect(() => {
    actorTagsApi.list().then((t) => setAllTags(t as Tag[]))
  }, [])

  const handleSelectPhoto = async () => {
    const path = await dialogApi.openImage() as string | null
    if (path) setPhotoPath(path)
  }

  const handleScoreChange = (key: keyof ActorScores, value: number) => {
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

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg w-[500px] h-[95vh] flex flex-col relative" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl leading-none"
        >
          ✕
        </button>
        <div className="flex-shrink-0 px-6 pt-6 pb-3 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">
            {actor ? '배우 수정' : '배우 등록'}
          </h2>
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
            <div className="flex items-center gap-2">
              {/* 신장 */}
              <div className="flex items-center gap-1 flex-1">
                <span className="text-xs text-gray-400 flex-shrink-0">신장</span>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  placeholder="cm"
                  className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              {/* B-W-H (붙임) */}
              <div className="flex items-center flex-[2.5]">
                <div className="flex items-center gap-1 flex-1">
                  <span className="text-xs text-gray-400 flex-shrink-0">B</span>
                  <input
                    type="number"
                    value={bust}
                    onChange={(e) => setBust(e.target.value)}
                    placeholder="cm"
                    className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <span className="text-gray-500">-</span>
                <div className="flex items-center gap-1 flex-1">
                  <span className="text-xs text-gray-400 flex-shrink-0">W</span>
                  <input
                    type="number"
                    value={waist}
                    onChange={(e) => setWaist(e.target.value)}
                    placeholder="cm"
                    className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <span className="text-gray-500">-</span>
                <div className="flex items-center gap-1 flex-1">
                  <span className="text-xs text-gray-400 flex-shrink-0">H</span>
                  <input
                    type="number"
                    value={hip}
                    onChange={(e) => setHip(e.target.value)}
                    placeholder="cm"
                    className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-full [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>
              {/* 컵 */}
              <div className="flex items-center gap-1 flex-[0.8]">
                <input
                  type="text"
                  value={cup}
                  onChange={(e) => setCup(e.target.value)}
                  placeholder="A"
                  className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-full"
                />
                <span className="text-xs text-gray-400 flex-shrink-0">컵</span>
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-400 block mb-1">코멘트</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              className="bg-gray-700 text-white text-sm px-2 py-1.5 rounded w-full resize-none"
            />
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

          <div>
            <TagSelector
              allTags={allTags}
              selectedIds={selectedTagIds}
              onChange={setSelectedTagIds}
              onCreateTag={handleCreateTag}
              repTagIds={repTagIds}
              onChangeRep={setRepTagIds}
            />
          </div>

          <div className="flex justify-end pt-2 pb-2">
            <button onClick={handleSave} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded">
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
