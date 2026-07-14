import { useEffect, useState, useRef } from 'react'
import type React from 'react'
import { imageApi } from '../api'

interface Props {
  path: string | null
  alt: string
  className?: string
  style?: React.CSSProperties
  objectPosition?: string
  version?: number
  reobserve?: number
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

export default function ImagePreview({ path, alt, className = '', style, objectPosition, version, reobserve, onMouseEnter, onMouseLeave }: Props) {
  const [src, setSrc] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (visible) return
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } },
      { rootMargin: '100px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [visible, reobserve])

  useEffect(() => {
    if (!visible) return
    if (path) {
      imageApi.read(path).then((data) => setSrc(data as string | null))
    } else {
      setSrc(null)
    }
  }, [path, version, visible])

  return (
    <div ref={ref} className={`${src ? '' : 'bg-gray-700 flex items-center justify-center text-gray-500 '}${className}`} style={style} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      {src && <img src={src} alt={alt} className={`object-cover w-full h-full`} style={{ objectPosition }} />}
    </div>
  )
}
