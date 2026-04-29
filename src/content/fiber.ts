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
  rect: DOMRect
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

function findUserComponent(fiber: Fiber | null): {
  fiber: Fiber
  name: string
  file: string
  line: number
} | null {
  let f = fiber
  while (f) {
    if (typeof f.type !== 'string' && f.type) {
      const loc = getDebugLocation(f)
      const name = getComponentName(f.type)
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

  const user = findUserComponent(fiber)
  if (!user) return null

  const node = findHostNode(user.fiber)
  if (!node) return null

  return {
    name: user.name,
    file: user.file,
    line: user.line,
    rect: node.getBoundingClientRect(),
  }
}

// Detect whether the page is a React app in dev mode (i.e. fibers carry
// resolvable debug locations). Bounded scan so we don't walk huge pages.
export function detectReactDev(): boolean {
  const all = document.body.querySelectorAll('*')
  const limit = Math.min(all.length, 200)
  let firstFiber: Fiber | null = null
  for (let i = 0; i < limit; i++) {
    const node = all[i]
    const fiber = getFiberFromNode(node)
    if (!fiber) continue
    if (!firstFiber) firstFiber = fiber
    let f: Fiber | null = fiber
    while (f) {
      if (getDebugLocation(f)) return true
      f = f.return
    }
  }
  if (firstFiber) {
    const s =
      firstFiber._debugStack ?? firstFiber.alternate?._debugStack
    const str =
      typeof s === 'string'
        ? s
        : (s as { stack?: unknown } | undefined)?.stack
    console.log('[spackle][debug] first fiber type:', firstFiber.type)
    console.log('[spackle][debug] _debugStack:', s)
    console.log('[spackle][debug] stack string:', str)
    console.log(
      '[spackle][debug] parsed:',
      typeof str === 'string' ? parseDebugStack(str) : null,
    )
  } else {
    console.log('[spackle][debug] no fiber found on any of first 200 elements')
  }
  return false
}
