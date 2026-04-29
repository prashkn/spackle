import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { inspectAt, type Hit } from './fiber'

const HOST_ID = 'spackle-overlay-host'

const HIGHLIGHT = 'oklch(0.55 0.18 250)'

export function Inspect() {
  const [hit, setHit] = useState<Hit | null>(null)
  const lastKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (e.shiftKey && e.metaKey) {
        const next = inspectAt(e.clientX, e.clientY, HOST_ID)
        const key = next ? `${next.file}:${next.line}:${next.name}` : null
        if (key !== lastKeyRef.current) {
          lastKeyRef.current = key
          setHit(next)
        } else if (next) {
          // Same component, but rect may have shifted (scroll, layout).
          setHit(next)
        }
      } else if (lastKeyRef.current !== null) {
        lastKeyRef.current = null
        setHit(null)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift' || e.key === 'Meta' || e.key === 'Control') {
        lastKeyRef.current = null
        setHit(null)
      }
    }
    const onBlur = () => {
      lastKeyRef.current = null
      setHit(null)
    }
    window.addEventListener('mousemove', onMove, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('mousemove', onMove, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  if (!hit) return null

  const { rect, name } = hit

  return (
    <>
      <div
        className="fixed pointer-events-none rounded-sm"
        style={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          boxShadow: `inset 0 0 0 2px ${HIGHLIGHT}`,
        }}
      />
      <Badge
        className="fixed pointer-events-none border-transparent text-white"
        style={{
          top: Math.max(rect.top - 22, 4),
          left: rect.left,
          background: HIGHLIGHT,
        }}
      >
        {name}
      </Badge>
    </>
  )
}
