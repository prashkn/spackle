// Runs in the page's MAIN world (same JS context as the host page) so we can
// read React's `__reactFiber$*` properties and walk the fiber tree. The
// ISOLATED-world content script can't see those properties — that's why we
// need this split.
//
// We send hover hits to the ISOLATED side via a CustomEvent on window. The
// detail object is plain serializable values, so it crosses the world boundary
// cleanly.

import { inspectAt, type Hit } from './fiber'

const HOST_ID = 'spackle-overlay-host'
const HOVER_EVENT = 'spackle:hover'

let lastKey: string | null = null

function broadcast(detail: Hit | null) {
  window.dispatchEvent(new CustomEvent(HOVER_EVENT, { detail }))
}

function clearHover() {
  if (lastKey !== null) {
    lastKey = null
    broadcast(null)
  }
}

window.addEventListener(
  'mousemove',
  (e: MouseEvent) => {
    if (e.shiftKey && e.metaKey) {
      const hit = inspectAt(e.clientX, e.clientY, HOST_ID)
      const key = hit ? `${hit.file}:${hit.line}:${hit.name}` : null
      if (key === null && lastKey === null) return
      lastKey = key
      broadcast(hit)
    } else {
      clearHover()
    }
  },
  true,
)

window.addEventListener(
  'keyup',
  (e: KeyboardEvent) => {
    if (e.key === 'Shift' || e.key === 'Meta' || e.key === 'Control') {
      clearHover()
    }
  },
  true,
)

window.addEventListener('blur', clearHover)

console.log('[spackle/main] active')
