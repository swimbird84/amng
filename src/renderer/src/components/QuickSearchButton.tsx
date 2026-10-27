import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import { searchUrlApi, imageApi, shellApi } from '../api'

interface Props {
  productNumber: string
  className?: string
  iconSize?: number
}

export default function QuickSearchButton({ productNumber, className = 'text-gray-400 hover:text-white', iconSize = 12 }: Props) {
  const [searchUrls, setSearchUrls] = useState<{ id: number; url: string; favicon_path: string | null }[]>([])
  const [faviconCache, setFaviconCache] = useState<Map<number, string>>(new Map())
  const [popup, setPopup] = useState<{ x: number; y: number; btnH: number } | null>(null)
  const [adjustedStyle, setAdjustedStyle] = useState<React.CSSProperties>({})
  const popupRef = useRef<HTMLDivElement>(null)

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

  useLayoutEffect(() => {
    if (!popup || !popupRef.current) return
    const el = popupRef.current
    const rect = el.getBoundingClientRect()
    const pad = 4
    let x = popup.x
    let y = popup.y - 4 // default: above button
    let translateX = '-50%'
    let translateY = '-100%'

    // 상단에 공간 부족 → 아래로
    if (y - rect.height < pad) {
      // button 아래에 위치시키기 위해 y를 버튼 하단으로 조정
      y = popup.y + popup.btnH + 4
      translateY = '0%'
    }
    // 좌측 초과
    if (x - rect.width / 2 < pad) {
      x = pad + rect.width / 2
    }
    // 우측 초과
    if (x + rect.width / 2 > window.innerWidth - pad) {
      x = window.innerWidth - pad - rect.width / 2
    }

    setAdjustedStyle({ left: x, top: y, transform: `translate(${translateX}, ${translateY})` })
  }, [popup])

  if (searchUrls.length === 0 || !productNumber) return null

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (searchUrls.length === 1) {
      shellApi.openExternal(searchUrls[0].url + productNumber)
    } else {
      const rect = e.currentTarget.getBoundingClientRect()
      setPopup({ x: rect.left + rect.width / 2, y: rect.top, btnH: rect.height })
    }
  }

  return (
    <>
      <button onClick={handleClick} className={className}>
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
      </button>
      {popup && (
        <div className="fixed inset-0 z-50" onClick={() => { setPopup(null); setAdjustedStyle({}) }}>
          <div
            ref={popupRef}
            className="absolute flex gap-1 bg-gray-800 border border-gray-600 rounded-lg p-1.5 shadow-xl"
            style={adjustedStyle.left ? adjustedStyle : { left: popup.x, top: popup.y, transform: 'translate(-50%, -100%) translateY(-4px)', visibility: 'hidden' }}
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
