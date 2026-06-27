import { useEffect, useRef } from 'react'

type DataType = 'actor' | 'work'

const EVENT_NAME = 'dataChanged'

export function emitDataChanged(type: DataType) {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: type }))
}

export function useDataChanged(callback: (type: DataType) => void) {
  const cbRef = useRef(callback)
  cbRef.current = callback

  useEffect(() => {
    const handler = (e: Event) => cbRef.current((e as CustomEvent).detail as DataType)
    window.addEventListener(EVENT_NAME, handler)
    return () => window.removeEventListener(EVENT_NAME, handler)
  }, [])
}
