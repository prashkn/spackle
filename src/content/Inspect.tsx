import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import type { Hit } from './fiber'

const HOVER_EVENT = 'spackle:hover'

const HIGHLIGHT = '#F5F186'

export function Inspect() {
  const [hit, setHit] = useState<Hit | null>(null)

  useEffect(() => {
    const onHover = (e: Event) => {
      setHit((e as CustomEvent<Hit | null>).detail)
    }
    window.addEventListener(HOVER_EVENT, onHover)
    return () => window.removeEventListener(HOVER_EVENT, onHover)
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
        className="fixed pointer-events-none border-transparent text-black"
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
