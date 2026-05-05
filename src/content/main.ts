// Runs in the page's MAIN world (same JS context as the host page) so we can
// read React's `__reactFiber$*` properties and walk the fiber tree. The
// ISOLATED-world content script can't see those properties — that's why we
// need this split.
//
// We send hover hits to the ISOLATED side via a CustomEvent on window. The
// detail object is plain serializable values, so it crosses the world boundary
// cleanly.

import { inspectAt, scanComponents, type Hit } from './fiber'
import {
  CLICK_EVENT,
  HOVER_EVENT,
  HOVER_MODE_EVENT,
  SCAN_REQUEST_EVENT,
  SCAN_RESULTS_EVENT,
} from './events'

const HOST_ID = 'spackle-overlay-host'

let lastKey: string | null = null
let hoverModeActive = false

function broadcast(detail: Hit | null) {
  window.dispatchEvent(new CustomEvent(HOVER_EVENT, { detail }))
}

function setHoverMode(active: boolean) {
  if (hoverModeActive === active) return
  hoverModeActive = active
  window.dispatchEvent(new CustomEvent(HOVER_MODE_EVENT, { detail: active }))
}

function clearHover() {
  setHoverMode(false)
  if (lastKey !== null) {
    lastKey = null
    broadcast(null)
  }
}

window.addEventListener(
  'mousemove',
  (e: MouseEvent) => {
    if (e.shiftKey && e.metaKey) {
      setHoverMode(true)
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
  'click',
  (e: MouseEvent) => {
    if (!e.shiftKey || !e.metaKey) return
    e.preventDefault()
    e.stopPropagation()
    const hit = inspectAt(e.clientX, e.clientY, HOST_ID)
    window.dispatchEvent(new CustomEvent(CLICK_EVENT, { detail: hit }))
  },
  true,
)

window.addEventListener(SCAN_REQUEST_EVENT, (e: Event) => {
  const { components } = (
    e as CustomEvent<{ components: Array<{ file: string; name: string }> }>
  ).detail
  const keys = new Set(components.map((c) => `${c.file}:${c.name}`))
  const results = scanComponents(HOST_ID, keys)
  window.dispatchEvent(new CustomEvent(SCAN_RESULTS_EVENT, { detail: results }))
})

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
