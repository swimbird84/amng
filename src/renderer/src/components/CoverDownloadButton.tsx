import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import { coverApi, imageApi } from '../api'

interface Props {
  onSelect: (source: 'sukebei' | 'javbus') => void
  className?: string
  iconSize?: number
}

export default function CoverDownloadButton({ onSelect, className = 'text-gray-400 hover:text-white', iconSize = 12 }: Props) {
  const [sources, setSources] = useState<{ key: string; domain: string; faviconPath: string | null }[]>([])
  const [faviconCache, setFaviconCache] = useState<Map<string, string>>(new Map())
  const [popup, setPopup] = useState<{ x: number; y: number; btnH: number } | null>(null)
  const [adjustedStyle, setAdjustedStyle] = useState<React.CSSProperties>({})
  const popupRef = useRef<HTMLDivElement>(null)
  const getLastSource = () => localStorage.getItem('cover:lastSource') as 'sukebei' | 'javbus' | null
  const [lastSelected, setLastSelected] = useState<string | null>(getLastSource)

  const load = useCallback(async () => {
    const list = await coverApi.getSources()
    setSources(list)
    for (const src of list) {
      if (src.faviconPath) {
        const b64 = await imageApi.read(src.faviconPath) as string | null
        if (b64) setFaviconCache(prev => new Map(prev).set(src.key, b64))
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
    let y = popup.y - 4
    let translateX = '-50%'
    let translateY = '-100%'

    if (y - rect.height < pad) {
      y = popup.y + popup.btnH + 4
      translateY = '0%'
    }
    if (x - rect.width / 2 < pad) {
      x = pad + rect.width / 2
    }
    if (x + rect.width / 2 > window.innerWidth - pad) {
      x = window.innerWidth - pad - rect.width / 2
    }

    setAdjustedStyle({ left: x, top: y, transform: `translate(${translateX}, ${translateY})` })
  }, [popup])

  if (sources.length === 0) return null

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (popup) {
      // Already open — use last selected source
      const last = getLastSource()
      if (last) {
        onSelect(last)
        setPopup(null)
      }
    } else {
      setLastSelected(getLastSource())
      const rect = e.currentTarget.getBoundingClientRect()
      setPopup({ x: rect.left + rect.width / 2, y: rect.top, btnH: rect.height })
    }
  }

  return (
    <>
      <button onClick={handleClick} onDoubleClick={e => e.stopPropagation()} className={`${className} ${popup ? 'relative z-[101]' : ''}`}>
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </button>
      {popup && (
        <div className="fixed inset-0 z-[100]" onClick={() => { setPopup(null); setAdjustedStyle({}) }}>
          <div
            ref={popupRef}
            className="absolute flex gap-1 bg-gray-800 border border-gray-600 rounded-lg p-1.5 shadow-xl"
            style={adjustedStyle.left ? adjustedStyle : { left: popup.x, top: popup.y, transform: 'translate(-50%, -100%) translateY(-4px)', visibility: 'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            {sources.map(src => (
              <button
                key={src.key}
                onClick={() => {
                  setLastSelected(src.key)
                  localStorage.setItem('cover:lastSource', src.key)
                  onSelect(src.key as 'sukebei' | 'javbus')
                  setPopup(null)
                }}
                className={`w-8 h-8 rounded-md hover:bg-gray-600 flex items-center justify-center transition ${lastSelected === src.key ? 'ring-2 ring-blue-500 bg-gray-700' : ''}`}
                title={src.domain}
              >
                {faviconCache.has(src.key)
                  ? <img src={faviconCache.get(src.key)} className="w-5 h-5 rounded" />
                  : <span className="text-xs text-gray-400 font-bold">{src.key.charAt(0).toUpperCase()}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
