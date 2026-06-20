import { useState, useRef, useEffect } from 'react'
import { pushEscHandler, popEscHandler } from '../../escManager'

const KO_TO_CUP: Record<string, string> = { ㅁ:'A',ㅠ:'B',ㅊ:'C',ㅇ:'D',ㄷ:'E',ㄹ:'F',ㅎ:'G',ㅗ:'H',ㅑ:'I',ㅓ:'J',ㅏ:'K',ㅣ:'L',ㅡ:'M' }
const STAR_OPTIONS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]

export function renderStars(v: number): string {
  let s = ''
  for (let i = 1; i <= 5; i++) {
    if (v >= i) s += '★'
    else if (v >= i - 0.5) s += '½'
    else s += '☆'
  }
  return s
}

export function subtractDate(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return d.toISOString().slice(0, 10)
}

function normalizeDateRaw(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 8) return `${digits.slice(0,4)}-${digits.slice(4,6)}-${digits.slice(6,8)}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  return raw
}

export function DatePickerInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const dateRef = useRef<HTMLInputElement>(null)
  const displayVal = value ? value.replace(/-/g, '') : ''
  return (
    <div className="flex items-center gap-0.5">
      <input
        type="text"
        value={displayVal}
        onChange={e => onChange(normalizeDateRaw(e.target.value))}
        placeholder="YYYYMMDD"
        maxLength={10}
        className="bg-gray-700 text-white text-xs px-1.5 py-1 rounded w-20"
      />
      <button
        type="button"
        title="달력"
        onClick={() => (dateRef.current as any)?.showPicker?.()}
        className="text-gray-400 hover:text-white text-xs px-1 py-1 rounded hover:bg-gray-700"
      >
        🗓
      </button>
      <input
        type="date"
        ref={dateRef}
        value={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''}
        onChange={e => onChange(e.target.value)}
        className="sr-only"
        tabIndex={-1}
      />
    </div>
  )
}

export function StarDisplay({ value }: { value: number }) {
  return (
    <div className="flex" style={{ gap: 1 }}>
      {[1, 2, 3, 4, 5].map(star => {
        const full = value >= star
        const half = !full && value >= star - 0.5
        return (
          <div key={star} className="relative" style={{ width: 12, height: 12, fontSize: 12, lineHeight: '12px' }}>
            <span className="text-gray-600">★</span>
            {(full || half) && (
              <span className="absolute inset-0 text-yellow-400 overflow-hidden whitespace-nowrap" style={{ width: full ? '100%' : '50%' }}>★</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function StarSelect({ value, onChange }: { value: number | ''; onChange: (v: number | '') => void }) {
  const [open, setOpen] = useState(false)
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node))
        setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = () => setOpen(false)
    pushEscHandler(handler)
    return () => popEscHandler(handler)
  }, [open])

  const handleOpen = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setDropPos({ top: r.bottom + 2, left: r.left })
    }
    setOpen(v => !v)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        className="bg-gray-700 text-white text-xs px-2 py-1 rounded flex items-center gap-1.5 w-24"
      >
        {value === '' ? <span className="text-gray-400">-</span> : <StarDisplay value={value as number} />}
        <span className="text-gray-500 text-xs ml-auto">▼</span>
      </button>
      {open && (
        <div ref={dropRef} className="fixed z-50 bg-gray-900 border border-gray-700 rounded shadow-xl py-0.5" style={{ top: dropPos.top, left: dropPos.left }}>
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false) }}
            className={`w-full px-2 py-1 text-left flex items-center hover:bg-gray-700 ${value === '' ? 'bg-gray-700' : ''}`}
          >
            <span className="text-gray-400 text-xs">-</span>
          </button>
          {STAR_OPTIONS.map(v => (
            <button
              key={v}
              type="button"
              onClick={() => { onChange(v); setOpen(false) }}
              className={`w-full px-2 py-1 flex items-center hover:bg-gray-700 ${value === v ? 'bg-gray-700' : ''}`}
            >
              <StarDisplay value={v} />
            </button>
          ))}
        </div>
      )}
    </>
  )
}

export function NumInput({ value, onChange, className = '' }: { value: number | ''; onChange: (v: number | '') => void; className?: string }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value === '' ? '' : String(value)}
      onChange={e => {
        const v = e.target.value.trim()
        if (v === '') { onChange(''); return }
        const n = Number(v)
        if (!isNaN(n)) onChange(n)
      }}
      className={`bg-gray-700 text-white text-xs px-1.5 py-1 rounded w-12 text-center ${className}`}
    />
  )
}

export function CupInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => {
        const converted = e.target.value.split('').map(c => KO_TO_CUP[c] ?? c).join('')
        onChange(converted.toUpperCase())
      }}
      placeholder="A"
      className="bg-gray-700 text-white text-xs px-1.5 py-1 rounded w-10 text-center"
    />
  )
}
