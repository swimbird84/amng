import React, { useState, useEffect, useRef } from 'react'
import { useEscHandler } from '../escManager'
import type { Actor, Tag, Work } from '../types'
import { actorsApi, actorTagsApi, tierApi } from '../api'
import ActorForm from './ActorForm'
import ImagePreview from './ImagePreview'
import RadarChart from './RadarChart'
import CardTooltip, { type TooltipState } from './CardTooltip'
import { calcPhysicalScore, computeStats, loadSettings, type ActorPhysicalData } from './PhysicalCorrectionModal'
import { getAge, getDebutAge } from '../utils/dateHelpers'
import { emitDataChanged } from '../dataEvents'
import MasterRecordModal from './cup/MasterRecordModal'
import ActorWorksModal from './ActorWorksModal'
import TierEditor from './TierEditor'
import WorkDetailModal from './WorkDetailModal'

interface Props {
  actorId: number
  onClose: () => void
  onViewWork: (id: number) => void
  zIndex?: number
  hideTierButton?: boolean
}

const defaultScores = { face: 0, bust: 0, hip: 0, physical: 0, skin: 0, acting: 0, sexy: 0, charm: 0, technique: 0, proportions: 0 }

export default function ActorDetailModal({ actorId, onClose, onViewWork, zIndex = 60, hideTierButton }: Props) {
  const [actor, setActor] = useState<(Actor & { works?: Work[]; tags?: Tag[] }) | null>(null)
  const [physScore, setPhysScore] = useState<number | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [tagCloud, setTagCloud] = useState<{ category_id: number | null; category_name: string | null; category_sort_order: number | null; tag_id: number; tag_name: string; count: number }[] | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editActor, setEditActor] = useState<(Actor & { tags?: Tag[] }) | undefined>(undefined)
  const [refreshKey, setRefreshKey] = useState(0)
  const [showMasterRecord, setShowMasterRecord] = useState(false)
  const [showWorksModal, setShowWorksModal] = useState(false)
  const [masterTier, setMasterTier] = useState<{ tier_name: string; tier_color: string; tier_rank: number } | null>(null)
  const [showTierEditor, setShowTierEditor] = useState(false)
  const [masterTierSetId, setMasterTierSetId] = useState<number | null>(null)
  const [tierWorkDetailId, setTierWorkDetailId] = useState<number | null>(null)
  const [tierActorDetailId, setTierActorDetailId] = useState<number | null>(null)

  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEscHandler(() => {
    if (tagCloud) setTagCloud(null)
    else if (!showForm) onCloseRef.current()
  }, [tagCloud, showForm])

  const loadActor = async () => {
    const detail = await actorsApi.get(actorId) as Actor & { works?: Work[]; tags?: Tag[] }
    if (!detail) return
    setActor(detail)
    // phys score
    try {
      const physData = await actorsApi.physicalData() as ActorPhysicalData[]
      const stats = computeStats(physData)
      const settings = loadSettings()
      const me = physData.find(a => a.id === actorId)
      if (me && stats) setPhysScore(calcPhysicalScore(me, settings, stats) ?? null)
    } catch { /* ignore */ }
    tierApi.getMasterTier('actor', actorId).then(t => setMasterTier(t))
    tierApi.listSets({ type: 'actor', isMaster: true }).then((sets: any) => { if (sets.length > 0) setMasterTierSetId(sets[0].id) })
  }

  useEffect(() => { loadActor() }, [actorId])

  const handleEdit = () => {
    if (actor) {
      setEditActor(actor)
      setShowForm(true)
    }
  }

  const handleDelete = async () => {
    if (actor && confirm('정말 삭제하시겠습니까?')) {
      const res = await actorsApi.delete(actor.id) as { blocked: boolean }
      if (res?.blocked) { alert('진행 중인 월드컵에 참가 중인 배우는 삭제할 수 없습니다.'); return }
      emitDataChanged('actor')
      onClose()
    }
  }

  const handleToggleFavorite = async () => {
    if (!actor) return
    const next = actor.is_favorite ? 0 : 1
    await actorsApi.update(actor.id, { is_favorite: next })
    setActor({ ...actor, is_favorite: next })
  }

  const handleToggleRepTag = async (tagId: number) => {
    if (!actor) return
    const currentRepIds = actor.rep_tags?.map((t) => t.id) ?? []
    const newRepIds = currentRepIds.includes(tagId)
      ? currentRepIds.filter((id) => id !== tagId)
      : [...currentRepIds, tagId]
    await actorsApi.update(actor.id, { rep_tag_ids: newRepIds })
    const newRepTags = (actor.tags ?? []).filter((t) => newRepIds.includes(t.id))
    setActor({ ...actor, rep_tags: newRepTags })
  }

  if (!actor) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center" style={{ zIndex }} onClick={onClose}>
        <div className="bg-gray-800 rounded-lg w-[1000px] h-[95vh] flex flex-row relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-gray-400 hover:text-white text-xl leading-none z-10"
          >
            ✕
          </button>

          {/* 좌측 */}
          <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] p-6 space-y-3 min-w-0">
            <div className="flex gap-4 items-start">
              <ImagePreview path={actor.photo_path} alt={actor.name} className="w-28 h-28 rounded flex-shrink-0" version={refreshKey} />
              <div className="flex-1 pt-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-white font-bold text-lg">{actor.name}</h3>
                  <button onClick={() => !hideTierButton && masterTierSetId && setShowTierEditor(true)} className={`text-xs px-1.5 py-0.5 rounded text-white ${hideTierButton ? 'cursor-default opacity-60' : 'cursor-pointer hover:opacity-80'}`} style={{ backgroundColor: masterTier?.tier_color ?? '#4b5563' }} title={hideTierButton ? '티어 편집 중' : undefined}>{masterTier ? `${masterTier.tier_name} #${masterTier.tier_rank}` : '미 #-'}</button>
                  {!!actor.is_excluded && <span className="text-xs px-1.5 py-0.5 rounded bg-orange-900/60 text-orange-400">제외됨</span>}
                  {!!actor.delete_pending && <span className="text-xs px-1.5 py-0.5 rounded bg-red-900/60 text-red-400">삭제예정</span>}
                  <button
                    onClick={() => setShowWorksModal(true)}
                    className="text-lg leading-none text-gray-400 hover:text-white"
                    title="전체 출연작"
                  >
                    📁
                  </button>
                  <button
                    onClick={handleToggleFavorite}
                    className={`text-2xl leading-none ${actor.is_favorite ? 'text-red-500' : 'text-gray-500 hover:text-red-400'}`}
                  >
                    {actor.is_favorite ? '♥' : '♡'}
                  </button>
                  <div className="flex-1" />
                  <button onClick={() => setShowMasterRecord(true)} className="text-xs px-1.5 py-0.5 rounded bg-yellow-900/60 text-yellow-400 hover:bg-yellow-800/60 transition">☆전적</button>
                </div>
                <div className="grid gap-x-2 text-sm text-gray-400 mt-1" style={{ gridTemplateColumns: 'auto 1fr' }}>
                  <span>생년월일</span>
                  <span>{actor.birthday || '-'}{actor.birthday ? ` (${getAge(actor.birthday)})` : ''}</span>
                  <span>데뷔일</span>
                  <span>{actor.debut_date || '-'}{actor.debut_date ? ` (${getDebutAge(actor.birthday ?? null, actor.debut_date)})` : ''}</span>
                </div>
                <p className="text-yellow-400 text-sm mt-1">
                  평점 {(actor.avg_score ?? (
                    actor.scores
                      ? (Object.values(actor.scores).reduce((a, b) => a + b, 0) / 13)
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

            {/* 신체 정보 */}
            {(actor.height || actor.bust || actor.waist || actor.hip || actor.cup) && (
              <div className="mb-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-300">
                    {(() => {
                      const ar = new Set((actor.phys_arbitrary ?? '').split('|').filter(Boolean))
                      return <>
                        {actor.height && <span>신장 {actor.height}cm{ar.has('height') && <span className="text-xs text-gray-500">(ar)</span>}{'  '}</span>}
                        {(actor.bust || actor.waist || actor.hip) && <span>
                          B{actor.bust ?? '?'}{ar.has('bust') && <span className="text-xs text-gray-500">(ar)</span>}
                          {' - '}W{actor.waist ?? '?'}{ar.has('waist') && <span className="text-xs text-gray-500">(ar)</span>}
                          {' - '}H{actor.hip ?? '?'}{ar.has('hip') && <span className="text-xs text-gray-500">(ar)</span>}
                          {'  '}
                        </span>}
                        {actor.cup && <span>{actor.cup}컵{ar.has('cup') && <span className="text-xs text-gray-500">(ar)</span>}</span>}
                      </>
                    })()}
                  </p>
                  {(physScore != null || actor.ratio_score != null) && (
                    <p className="text-sm text-blue-400 shrink-0 ml-2">{(physScore ?? actor.ratio_score!).toFixed(2)}점</p>
                  )}
                </div>
              </div>
            )}

            {/* 레이더 차트 */}
            <div className="flex justify-center">
              <RadarChart scores={actor.scores ?? defaultScores} size={264} />
            </div>

            {/* 코멘트 */}
            {actor.comment && (
              <div className="mt-2">
                <p className="text-xs text-gray-500 mb-1">코멘트</p>
                <p className="text-sm text-gray-300 whitespace-pre-wrap text-left">{actor.comment}</p>
              </div>
            )}

          </div>

          {/* 우측 - 본명/다른이름/태그 */}
          <div className="w-[500px] border-l border-gray-700 flex flex-col">
            <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] p-6 space-y-3">

              {actor.real_name && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">본명</p>
                  <div className="flex flex-wrap gap-1">
                    {actor.real_name.split(',').map((a) => a.trim()).filter(Boolean).map((rn) => (
                      <span key={rn} className="text-xs px-2 py-0.5 rounded bg-blue-800 text-blue-200">{rn}</span>
                    ))}
                  </div>
                </div>
              )}

              {actor.aliases && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">다른이름</p>
                  <div className="flex flex-wrap gap-1">
                    {actor.aliases.split(',').map((a) => a.trim()).filter(Boolean).map((alias) => (
                      <span key={alias} className="text-xs px-2 py-0.5 rounded bg-fuchsia-700 text-fuchsia-200">{alias}</span>
                    ))}
                  </div>
                </div>
              )}

              {actor.tags && actor.tags.length > 0 && (() => {
                type Group = { catId: number | null; catName: string | null; sortOrder: number; tags: typeof actor.tags }
                const catMap = new Map<number | null, Group>()
                const groups: Group[] = []
                const sorted = [...actor.tags!].sort((a, b) => {
                  const ao = a.category_sort_order ?? 999999
                  const bo = b.category_sort_order ?? 999999
                  if (ao !== bo) return ao - bo
                  const ar = actor.rep_tags?.some((r) => r.id === a.id) ? 0 : 1
                  const br = actor.rep_tags?.some((r) => r.id === b.id) ? 0 : 1
                  if (ar !== br) return ar - br
                  return a.name.localeCompare(b.name)
                })
                for (const tag of sorted) {
                  const key = tag.category_id ?? null
                  if (!catMap.has(key)) {
                    const g: Group = { catId: key, catName: tag.category_name ?? null, sortOrder: tag.category_sort_order ?? 999999, tags: [] }
                    catMap.set(key, g)
                    groups.push(g)
                  }
                  catMap.get(key)!.tags.push(tag)
                }
                return (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">태그</p>
                    <div className="grid grid-cols-[auto_1fr] gap-y-1 gap-x-2 items-start">
                      {groups.map((g) => (
                        <React.Fragment key={g.catId ?? 'none'}>
                          <span className="text-xs text-gray-600 leading-5 text-right">{g.catName ?? '미분류'}</span>
                          <div className="flex flex-wrap gap-1">
                            {g.tags.map((t) => {
                              const isRep = actor.rep_tags?.some((r) => r.id === t.id)
                              return (
                                <span
                                  key={t.id}
                                  onClick={() => handleToggleRepTag(t.id)}
                                  title={isRep ? '대표 태그 해제' : '대표 태그로 설정'}
                                  className={`text-xs px-2 py-0.5 rounded cursor-pointer ${
                                    isRep ? 'bg-green-600 text-white hover:bg-green-500' : 'bg-blue-600 text-white hover:bg-blue-500'
                                  }`}
                                >
                                  {t.name}
                                </span>
                              )
                            })}
                          </div>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* 참가 작품 */}
              {(() => {
                const recentWorks = [...(actor.works ?? [])].filter(w => !w.is_excluded)
                  .sort((a, b) => (b.release_date ?? '').localeCompare(a.release_date ?? ''))
                  .slice(0, 16)
                if (recentWorks.length === 0) return null
                return (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">참가 작품 ({(actor.works ?? []).filter(w => !w.is_excluded).length})</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {recentWorks.map(w => (
                        <div
                          key={w.id}
                          className="cursor-pointer"
                          onClick={() => onViewWork(w.id)}
                          onMouseMove={e => setTooltip({ type: 'work', id: w.id, x: e.clientX, y: e.clientY })}
                          onMouseLeave={() => setTooltip(null)}
                        >
                          <ImagePreview path={w.cover_path} alt={w.product_number || '-'} className="w-full aspect-[800/540] rounded object-cover" />
                          <p className="text-[10px] text-gray-400 text-center truncate mt-0.5">{w.product_number || w.title || '-'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

            </div>
          </div>
        </div>
      </div>

      {tooltip && <CardTooltip tooltip={tooltip} />}

      {/* 태그 클라우드 */}
      {tagCloud && (() => {
        const sizeClass = (count: number, catMax: number) => {
          const tier = catMax < 5 ? count : Math.ceil((count / catMax) * 5)
          if (tier >= 5) return 'text-base font-bold text-white'
          if (tier >= 4) return 'text-sm font-semibold text-gray-200'
          if (tier >= 3) return 'text-sm text-gray-200'
          if (tier >= 2) return 'text-xs text-gray-300'
          return 'text-xs text-gray-400'
        }
        type Group = { catId: number | null; catName: string | null; sortOrder: number; tags: typeof tagCloud }
        const catMap = new Map<number | null, Group>()
        const groups: Group[] = []
        for (const t of tagCloud) {
          const key = t.category_id ?? null
          if (!catMap.has(key)) {
            const g: Group = { catId: key, catName: t.category_name ?? null, sortOrder: t.category_sort_order ?? 999999, tags: [] }
            catMap.set(key, g); groups.push(g)
          }
          catMap.get(key)!.tags.push(t)
        }
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center" style={{ zIndex: (zIndex ?? 60) + 5 }} onClick={() => setTagCloud(null)}>
            <div className="bg-gray-800 rounded-lg p-6 max-w-[600px] max-h-[80vh] overflow-y-auto space-y-3" onClick={e => e.stopPropagation()}>
              <h3 className="text-white font-bold text-sm">출연작 태그 클라우드</h3>
              {groups.sort((a, b) => a.sortOrder - b.sortOrder).map(g => {
                const catMax = Math.max(...g.tags.map(t => t.count))
                return (
                  <div key={g.catId ?? 'none'}>
                    <p className="text-xs text-gray-500 mb-1">{g.catName ?? '미분류'}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {g.tags.sort((a, b) => b.count - a.count).map(t => (
                        <span key={t.tag_id} className={sizeClass(t.count, catMax)}>
                          {t.tag_name}({t.count})
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* 수정 모달 */}
      {showForm && (
        <ActorForm
          actor={editActor}
          onSave={() => { setShowForm(false); setRefreshKey(k => k + 1); loadActor(); emitDataChanged('actor') }}
          onCancel={() => setShowForm(false)}
        />
      )}
      {showMasterRecord && actor && (
        <MasterRecordModal
          type="actor"
          itemId={actor.id}
          itemName={actor.name}
          itemImage={actor.photo_path ?? null}
          onClose={() => setShowMasterRecord(false)}
        />
      )}
      {showWorksModal && actor && (
        <div style={{ position: 'fixed', inset: 0, zIndex: (zIndex ?? 60) + 10 }}>
          <ActorWorksModal
            actorId={actor.id}
            actorName={actor.name}
            onClose={() => setShowWorksModal(false)}
          />
        </div>
      )}
      {showTierEditor && masterTierSetId && actor && (
        <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center">
          <div className="bg-gray-900 rounded-xl w-full h-[calc(100vh-40px)] overflow-hidden">
            <TierEditor
              setId={masterTierSetId}
              setName="마스터 배우 티어"
              setType="actor"
              onBack={() => { setShowTierEditor(false); loadActor() }}
              onNavigateToActor={(id) => setTierActorDetailId(id)}
              onNavigateToWork={(id) => setTierWorkDetailId(id)}
              focusItemId={actor.id}
            />
          </div>
        </div>
      )}
      {tierWorkDetailId && (
        <WorkDetailModal
          workId={tierWorkDetailId}
          onClose={() => setTierWorkDetailId(null)}
          onViewActor={(id) => { setTierWorkDetailId(null); setTierActorDetailId(id) }}
          zIndex={80}
          hideTierButton
        />
      )}
      {tierActorDetailId && (
        <ActorDetailModal
          actorId={tierActorDetailId}
          onClose={() => setTierActorDetailId(null)}
          onViewWork={(id) => { setTierActorDetailId(null); setTierWorkDetailId(id) }}
          zIndex={80}
          hideTierButton
        />
      )}
    </>
  )
}
