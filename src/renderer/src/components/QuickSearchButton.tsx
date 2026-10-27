import { useState, useEffect, useCallback } from 'react'
import { searchUrlApi, imageApi, shellApi } from '../api'

interface Props {
  productNumber: string
  className?: string
  iconSize?: number
}

export default function QuickSearchButton({ productNumber, className = 'text-gray-400 hover:text-white', iconSize = 12 }: Props) {
  const [searchUrls, setSearchUrls] = useState<{ id: number; url: string; favicon_path: string | null }[]>([])
  const [faviconCache, setFaviconCache] = useState<Map<number, string>>(new Map())
  const [popup, setPopup] = useState<{ x: number; y: number } | null>(null)

  const load = useCallback(async () => {
    const list = await searchUrlApi.list()
    setSearchUrls(list.map(r => ({ id: r.id, url: r.url, favicon_path: r.favicon_path })))
    for (const r of list) {
      if (r.favicon_path) {
        const b64 = await imageApi.read(r.favicon_path) as string | null
        if (b64) setFaviconCache(prev => new Map(prev).set(r.id, b64))
      }
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (searchUrls.length === 0 || !productNumber) return null

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (searchUrls.length === 1) {
      shellApi.openExternal(searchUrls[0].url + productNumber)
    } else {
      const rect = e.currentTarget.getBoundingClientRect()
      setPopup({ x: rect.left + rect.width / 2, y: rect.top })
    }
  }

  return (
    <>
      <button onClick={handleClick} className={className}>
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
      </button>
      {popup && (
        <div className="fixed inset-0 z-50" onClick={() => setPopup(null)}>
          <div
            className="absolute flex gap-1 bg-gray-800 border border-gray-600 rounded-lg p-1.5 shadow-xl"
            style={{ left: popup.x, top: popup.y, transform: 'translate(-50%, -100%) translateY(-4px)' }}
            onClick={e => e.stopPropagation()}
          >
            {searchUrls.map(su => (
              <button
                key={su.id}
                onClick={() => { shellApi.openExternal(su.url + productNumber); setPopup(null) }}
                className="w-8 h-8 rounded-md hover:bg-gray-600 flex items-center justify-center transition"
                title={su.url}
              >
                {faviconCache.has(su.id)
                  ? <img src={faviconCache.get(su.id)} className="w-5 h-5 rounded" />
                  : <span className="text-xs text-gray-400">{(() => { try { return new URL(su.url).hostname.split('.').slice(-2, -1)[0]?.charAt(0).toUpperCase() || '?' } catch { return '?' } })()}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
