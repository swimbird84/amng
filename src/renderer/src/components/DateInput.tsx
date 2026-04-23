import { useState, useEffect } from 'react'

interface Props {
  value: string // YYYY-MM-DD or ''
  onChange: (value: string) => void
  className?: string
}

// 숫자만 추출 후 YYYY-MM-DD로 포맷
function toFormatted(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 8)
  if (d.length <= 4) return d
  if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`
}

function isValidDate(str: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false
  const d = new Date(str)
  return !isNaN(d.getTime())
}

export default function DateInput({ value, onChange, className }: Props) {
  const [raw, setRaw] = useState(value || '')

  useEffect(() => {
    setRaw(value || '')
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value

    // 지우는 중: 그대로 허용
    if (input.length < raw.length) {
      setRaw(input)
      if (input === '' || isValidDate(input)) onChange(input)
      return
    }

    const formatted = toFormatted(input)
    setRaw(formatted)
    if (formatted === '' || isValidDate(formatted)) onChange(formatted)
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text')
    const formatted = toFormatted(pasted)
    setRaw(formatted)
    if (formatted === '' || isValidDate(formatted)) onChange(formatted)
  }

  const isInvalid = raw.length > 0 && !isValidDate(raw)

  return (
    <input
      type="text"
      value={raw}
      onChange={handleChange}
      onPaste={handlePaste}
      placeholder="YYYY-MM-DD"
      maxLength={10}
      className={`${className ?? ''} ${isInvalid ? 'ring-1 ring-red-500' : ''}`}
    />
  )
}
