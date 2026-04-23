import { useEffect, useState } from 'react'
import type React from 'react'
import { imageApi } from '../api'

interface Props {
  path: string | null
  alt: string
  className?: string
  style?: React.CSSProperties
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

export default function ImagePreview({ path, alt, className = '', style, onMouseEnter, onMouseLeave }: Props) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    if (path) {
      imageApi.read(path).then((data) => setSrc(data as string | null))
    } else {
      setSrc(null)
    }
  }, [path])

  if (!src) {
    return (
      <div className={`bg-gray-700 flex items-center justify-center text-gray-500 ${className}`} style={style} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
        No Image
      </div>
    )
  }

  return <img src={src} alt={alt} className={`object-cover ${className}`} style={style} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} />
}
