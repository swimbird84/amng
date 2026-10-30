import { useState, useEffect } from 'react'
import { useEscHandler } from '../escManager'
import { worksApi } from '../api'

interface Props {
  workId: number
  comment: string | null
  className?: string
  iconSize?: number
  onSave?: () => void
}

export default function CommentButton({ workId, comment: initialComment, className = 'bg-black/60 hover:bg-black/80 text-white px-1 py-0.5 rounded', iconSize = 12, onSave }: Props) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')

  useEffect(() => {
    if (open) setText(initialComment ?? '')
  }, [open, initialComment])

  useEscHandler(() => { if (open) setOpen(false) }, [open])

  const handleSave = async () => {
    await worksApi.update(workId, { comment: text })
    setOpen(false)
    onSave?.()
  }

  return (
    <>
      <button
        onClick={e => { e.stopPropagation(); setOpen(true) }}
        onDoubleClick={e => e.stopPropagation()}
        className={`${className} cursor-pointer`}
        title="코멘트"
      >
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill={initialComment ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center"
          onClick={() => setOpen(false)}
        >
          <div className="bg-gray-800 rounded-lg p-4 w-[400px]" onClick={e => e.stopPropagation()}>
            <p className="text-white text-sm font-bold mb-2">코멘트</p>
            <textarea
              autoFocus
              value={text}
              onChange={e => setText(e.target.value)}
              rows={5}
              className="bg-gray-700 text-white text-sm px-3 py-2 rounded w-full resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setOpen(false)} className="text-sm text-gray-300 bg-gray-600 hover:bg-gray-500 px-3 py-1.5 rounded">취소</button>
              <button onClick={handleSave} className="text-sm text-white bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded">저장</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
