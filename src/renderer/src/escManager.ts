import { useEffect } from 'react'

type EscHandler = () => void
const stack: EscHandler[] = []

export function pushEscHandler(fn: EscHandler): void {
  stack.push(fn)
}

export function popEscHandler(fn: EscHandler): void {
  const i = stack.lastIndexOf(fn)
  if (i !== -1) stack.splice(i, 1)
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || stack.length === 0) return
  e.stopImmediatePropagation()
  stack[stack.length - 1]()
}, true)

export function useEscHandler(handler: EscHandler | null | undefined, deps: unknown[] = []): void {
  useEffect(() => {
    if (!handler) return
    pushEscHandler(handler)
    return () => popEscHandler(handler)
  }, deps)
}
