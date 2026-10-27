import { useState, useEffect } from 'react'
import { searchUrlApi, imageApi, dialogApi } from '../api'

import { pushEscHandler, popEscHandler } from '../escManager'

interface Props {
  onClose: () => void
  onSelect?: (url: string) => void
}

export default function SearchUrlModal({ onClose, onSelect }: Props) {
  const [url, setUrl] = useState('')
  const [bookmarks, setBookmarks] = useState<{ id: number; url: string; favicon_path: string | null }[]>([])
  const [faviconCache, setFaviconCache] = useState<Map<number, string>>(new Map())

  const loadBookmarks = async () => {
    const list = await searchUrlApi.list()
    setBookmarks(list.map(r => ({ id: r.id, url: r.url, favicon_path: r.favicon_path })))
    // 파비콘 로드
    for (const r of list) {
      if (r.favicon_path) {
        const b64 = await imageApi.read(r.favicon_path) as string | null
        if (b64) setFaviconCache(prev => new Map(prev).set(r.id, b64))
      }
    }
  }

  useEffect(() => {
    loadBookmarks()
    // 파비콘 없는 URL 자동 다운로드 시도
    searchUrlApi.fetchMissingFavicons().then(() => loadBookmarks())
    const handler = () => onClose()
    pushEscHandler(handler)
    return () => popEscHandler(handler)
  }, [])

  const handleAdd = async () => {
    if (!url.trim()) return
    await searchUrlApi.add(url.trim())
    setUrl('')
    loadBookmarks()
  }

  const handleSelect = async (bm: { id: number; url: string }) => {
    await searchUrlApi.setActive(bm.id)
    onSelect?.(bm.url)
    onClose()
  }

  const handleDelete = async (id: number) => {
    await searchUrlApi.delete(id)
    setFaviconCache(prev => { const m = new Map(prev); m.delete(id); return m })
    loadBookmarks()
  }

  const handleSetFavicon = async (id: number) => {
    const filePath = await dialogApi.openImage() as string | null
    if (!filePath) return
    await searchUrlApi.setFavicon(id, filePath)
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
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') onClose() }}
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
                  <span className="w-5 h-5 shrink-0 flex items-center justify-center cursor-pointer" onClick={() => handleSetFavicon(bm.id)} title="파비콘 변경">
                    {faviconCache.has(bm.id)
                      ? <img src={faviconCache.get(bm.id)} className="w-4 h-4 rounded" />
                      : <span className="text-gray-500 text-xs">🌐</span>}
                  </span>
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
