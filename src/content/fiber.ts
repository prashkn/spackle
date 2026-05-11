// React fiber introspection for Spackle.
//
// React 19 dropped `_debugSource` and instead captures a stack trace at every
// JSX call site (`_debugStack` — an Error/string with .stack). We parse that
// stack to recover the file/line of the call site, which is what we need:
// "where the user wrote <Button />", not "where Button is defined".

export type Fiber = {
  type: unknown
  return: Fiber | null
  child: Fiber | null
  sibling: Fiber | null
  stateNode: unknown
  _debugStack?: unknown
  alternate?: Fiber | null
}

export type Hit = {
  name: string
  file: string
  line: number
  rect: { top: number; left: number; width: number; height: number }
}

/** Stable key identifying an attachable target (component or host element)
 *  across fiber, storage, and UI. Line is included so multiple host elements
 *  with the same tag inside the same file (e.g. two `<a>`s) are distinct. */
export function componentKey(
  file: string,
  line: number,
  name: string,
): string {
  return `${file}:${line}:${name}`
}

const FIBER_KEY_PREFIX = '__reactFiber$'

const REACT_INTERNAL_PATTERNS = [
  'react-jsx-dev-runtime',
  'react-jsx-runtime',
  'react-dom',
  'react-refresh',
  '/node_modules/react',
  '/@vite/',
  '/@react-refresh',
  '/.vite/',
  'chrome-extension://',
]

function getFiberKey(node: object): string | undefined {
  for (const key of Object.keys(node)) {
    if (key.startsWith(FIBER_KEY_PREFIX)) return key
  }
  return undefined
}

export function getFiberFromNode(node: Element): Fiber | null {
  const key = getFiberKey(node)
  if (!key) return null
  return (node as unknown as Record<string, Fiber>)[key] ?? null
}

function getStackString(s: unknown): string | null {
  if (!s) return null
  if (typeof s === 'string') return s
  if (typeof s === 'object' && 'stack' in (s as object)) {
    const stack = (s as Record<string, unknown>).stack
    return typeof stack === 'string' ? stack : null
  }
  return null
}

function urlToProjectPath(url: string): string {
  try {
    const u = new URL(url)
    return u.pathname.replace(/^\//, '')
  } catch {
    // Not a full URL (Chrome may emit source-mapped bare paths like "Home.tsx").
    return url.split('?')[0]
  }
}

function parseDebugStack(
  stack: string,
): { file: string; line: number } | null {
  const lines = stack.split('\n')
  for (const raw of lines) {
    if (!raw.includes('at ')) continue
    // Chrome formats:
    //   "    at FnName (url-or-path:LINE:COL)"
    //   "    at url-or-path:LINE:COL"
    const m =
      raw.match(/\(([^()]+):(\d+):\d+\)/) ||
      raw.match(/at\s+(\S+):(\d+):\d+/)
    if (!m) continue
    const path = m[1]
    if (REACT_INTERNAL_PATTERNS.some((p) => path.includes(p))) continue
    return { file: urlToProjectPath(path), line: parseInt(m[2], 10) }
  }
  return null
}

function getDebugLocation(
  fiber: Fiber,
): { file: string; line: number } | null {
  const stack = getStackString(
    fiber._debugStack ?? fiber.alternate?._debugStack,
  )
  if (!stack) return null
  return parseDebugStack(stack)
}

function getComponentName(type: unknown): string | null {
  if (!type || typeof type === 'string') return null
  if (typeof type === 'function') {
    const fn = type as { displayName?: string; name?: string }
    return fn.displayName || fn.name || null
  }
  if (typeof type === 'object') {
    const obj = type as {
      displayName?: string
      render?: unknown
      type?: unknown
    }
    return (
      obj.displayName ||
      getComponentName(obj.render) ||
      getComponentName(obj.type) ||
      null
    )
  }
  return null
}

function getFiberName(type: unknown): string | null {
  if (typeof type === 'string') return type
  return getComponentName(type)
}

/** Walk up the fiber tree to the nearest fiber with a parseable debug
 *  location. Includes host fibers (`<a>`, `<h3>`, …) so notes can attach to
 *  individual JSX call sites, not just user-defined components. */
function findNearestTarget(fiber: Fiber | null): {
  fiber: Fiber
  name: string
  file: string
  line: number
} | null {
  let f = fiber
  while (f) {
    if (f.type) {
      const loc = getDebugLocation(f)
      const name = getFiberName(f.type)
      if (loc && name) {
        return { fiber: f, name, file: loc.file, line: loc.line }
      }
    }
    f = f.return
  }
  return null
}

function findHostNode(fiber: Fiber): Element | null {
  if (fiber.stateNode instanceof Element) return fiber.stateNode
  let f = fiber.child
  while (f) {
    const found = findHostNode(f)
    if (found) return found
    f = f.sibling
  }
  return null
}

// Walks every light-DOM element looking for attachable targets whose key is in
// targetKeys. querySelectorAll does not pierce shadow roots, so the spackle
// overlay host is never matched — no guard needed.
// Cost: one fiber-tree walk per React DOM node regardless of targetKeys size.
export function scanComponents(targetKeys: Set<string>): Hit[] {
  const seen = new Set<string>()
  const results: Hit[] = []
  for (const el of document.querySelectorAll<Element>('*')) {
    const fiber = getFiberFromNode(el)
    if (!fiber) continue
    const target = findNearestTarget(fiber)
    if (!target) continue
    const key = componentKey(target.file, target.line, target.name)
    if (!targetKeys.has(key)) continue
    if (seen.has(key)) continue
    seen.add(key)
    const node = findHostNode(target.fiber)
    if (!node) continue
    const r = node.getBoundingClientRect()
    results.push({
      name: target.name,
      file: target.file,
      line: target.line,
      rect: { top: r.top, left: r.left, width: r.width, height: r.height },
    })
  }
  return results
}

export function inspectAt(
  x: number,
  y: number,
  hostId: string,
): Hit | null {
  const el = document.elementFromPoint(x, y)
  if (!el) return null
  if (el.closest(`#${hostId}`)) return null

  const fiber = getFiberFromNode(el)
  if (!fiber) return null

  const target = findNearestTarget(fiber)
  if (!target) return null

  const node = findHostNode(target.fiber)
  if (!node) return null

  const r = node.getBoundingClientRect()
  return {
    name: target.name,
    file: target.file,
    line: target.line,
    rect: { top: r.top, left: r.left, width: r.width, height: r.height },
  }
}

