import { useState } from 'react'
import { useEscHandler } from '../escManager'
import ImagePreview from './ImagePreview'

interface Props {
  path: string | null
  className?: string
  iconSize?: number
}

export default function ImagePreviewButton({ path, className = 'bg-black/60 hover:bg-black/80 text-white px-1 py-0.5 rounded', iconSize = 12 }: Props) {
  const [open, setOpen] = useState(false)

  useEscHandler(() => { if (open) setOpen(false) }, [open])

  if (!path) return null

  return (
    <>
      <button
        onClick={e => { e.stopPropagation(); setOpen(true) }}
        onDoubleClick={e => e.stopPropagation()}
        className={`${className} cursor-pointer`}
      >
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center cursor-pointer"
          onClick={() => setOpen(false)}
        >
          <ImagePreview path={path} alt="미리보기" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" />
        </div>
      )}
    </>
  )
}
