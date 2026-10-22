import { useState } from 'react'
import { useEscHandler } from '../escManager'
import { workFilesApi } from '../api'

interface Props {
  onClose: () => void
}

export default function UrlReplaceModal({ onClose }: Props) {
  const [oldStr, setOldStr] = useState('')
  const [newStr, setNewStr] = useState('')
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [result, setResult] = useState<number | null>(null)

  useEscHandler(onClose, [onClose])

  const handlePreview = async () => {
    if (!oldStr.trim()) return
    const { count } = await workFilesApi.replaceUrl(oldStr.trim(), newStr.trim())
    setPreviewCount(count)
  }

  const handleExecute = async () => {
    if (!oldStr.trim() || previewCount === null || previewCount === 0) return
    if (!confirm(`${previewCount}개 URL을 교체하시겠습니까?`)) return
    const { updated } = await workFilesApi.replaceUrlExec(oldStr.trim(), newStr.trim())
    setResult(updated)
    setPreviewCount(null)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
      <div className="bg-gray-800 rounded-xl p-6 w-[480px] space-y-4">
        <h3 className="text-white font-bold text-lg">URL 일괄 교체</h3>
        <div className="space-y-2">
          <div>
            <label className="text-sm text-gray-400 block mb-1">찾을 문자열</label>
            <input
              value={oldStr}
              onChange={e => { setOldStr(e.target.value); setPreviewCount(null); setResult(null) }}
              placeholder="예: old-domain.com"
              className="bg-gray-700 text-white text-sm px-3 py-2 rounded w-full"
            />
          </div>
          <div>
            <label className="text-sm text-gray-400 block mb-1">바꿀 문자열</label>
            <input
              value={newStr}
              onChange={e => { setNewStr(e.target.value); setPreviewCount(null); setResult(null) }}
              placeholder="예: new-domain.com"
              className="bg-gray-700 text-white text-sm px-3 py-2 rounded w-full"
            />
          </div>
        </div>

        {previewCount !== null && (
          <p className="text-sm text-yellow-400">영향 받는 URL: {previewCount}건</p>
        )}
        {result !== null && (
          <p className="text-sm text-green-400">{result}건 교체 완료</p>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded text-sm">닫기</button>
          <button onClick={handlePreview} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm">미리보기</button>
          {previewCount !== null && previewCount > 0 && (
            <button onClick={handleExecute} className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded text-sm">교체 실행</button>
          )}
        </div>
      </div>
    </div>
  )
}
