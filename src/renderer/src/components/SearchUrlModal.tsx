import { useState, useEffect } from 'react'
import { searchUrlApi } from '../api'
import { pushEscHandler, popEscHandler } from '../escManager'

interface Props {
  onClose: () => void
  onSelect?: (url: string) => void
}

export default function SearchUrlModal({ onClose, onSelect }: Props) {
  const [url, setUrl] = useState('')
  const [bookmarks, setBookmarks] = useState<{ id: number; url: string }[]>([])

  const loadBookmarks = () => {
    searchUrlApi.list().then(list => setBookmarks(list.map(r => ({ id: r.id, url: r.url }))))
  }

  useEffect(() => {
    loadBookmarks()
    const handler = () => onClose()
    pushEscHandler(handler)
    return () => popEscHandler(handler)
  }, [])

  const handleAdd = async () => {
    if (!url.trim()) return
    await searchUrlApi.add(url.trim())
    loadBookmarks()
  }

  const handleSelect = async (bm: { id: number; url: string }) => {
    await searchUrlApi.setActive(bm.id)
    onSelect?.(bm.url)
    onClose()
  }

  const handleDelete = async (id: number) => {
    await searchUrlApi.delete(id)
    loadBookmarks()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 rounded-lg p-5 w-96" onClick={e => e.stopPropagation()}>
        <p className="text-white text-sm font-bold mb-3">검색 URL 설정</p>
        <div className="flex items-center gap-2 mb-3">
          <input
            autoFocus
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://xxx.com/"
            onKeyDown={e => { if (e.key === 'Escape') onClose() }}
            className="flex-1 bg-gray-700 text-white text-sm px-3 py-2 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={handleAdd}
            className="text-sm text-white bg-blue-600 hover:bg-blue-500 px-3 py-2 rounded shrink-0"
          >저장</button>
        </div>
        {bookmarks.length > 0 && (
          <div className="mb-3">
            <p className="text-gray-400 text-xs mb-2">즐겨찾기</p>
            <div className="space-y-1">
              {bookmarks.map(bm => (
                <div key={bm.id} className="flex items-center gap-2">
                  <span
                    className="text-sm text-gray-300 hover:text-white cursor-pointer truncate flex-1"
                    onClick={() => handleSelect(bm)}
                  >{bm.url}</span>
                  <button
                    onClick={() => handleDelete(bm.id)}
                    className="text-red-400 hover:text-red-300 text-sm shrink-0"
                  >✕</button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex justify-end">
          <button onClick={onClose} className="text-sm text-gray-300 bg-gray-600 hover:bg-gray-500 px-3 py-1.5 rounded">닫기</button>
        </div>
      </div>
    </div>
  )
}
