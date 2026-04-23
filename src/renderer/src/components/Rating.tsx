import { useState } from 'react'

interface Props {
  value: number
  onChange?: (value: number) => void
  readonly?: boolean
  small?: boolean
}

export default function Rating({ value, onChange, readonly, small }: Props) {
  const [hover, setHover] = useState(0)

  const display = hover || value

  const handleClick = (v: number) => {
    if (readonly) return
    onChange?.(v === value ? 0 : v)
  }

  const sizeClass = small ? 'w-2.5 h-2.5' : 'w-5 h-5'
  const fontSize = small ? '10px' : undefined

  return (
    <div className="flex gap-0.5" onMouseLeave={() => !readonly && setHover(0)}>
      {[1, 2, 3, 4, 5].map((star) => {
        const full = display >= star
        const half = !full && display >= star - 0.5

        return (
          <div
            key={star}
            className={`relative ${sizeClass} leading-none select-none`}
            style={fontSize ? { fontSize, lineHeight: fontSize } : undefined}
          >
            <span className="text-gray-600">★</span>
            {(full || half) && (
              <span
                className="absolute inset-0 text-yellow-400 overflow-hidden whitespace-nowrap"
                style={{ width: full ? '100%' : '50%' }}
              >
                ★
              </span>
            )}
            {!readonly && (
              <>
                <span
                  className="absolute inset-y-0 left-0 w-1/2 cursor-pointer"
                  onMouseEnter={() => setHover(star - 0.5)}
                  onClick={() => handleClick(star - 0.5)}
                />
                <span
                  className="absolute inset-y-0 right-0 w-1/2 cursor-pointer"
                  onMouseEnter={() => setHover(star)}
                  onClick={() => handleClick(star)}
                />
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
