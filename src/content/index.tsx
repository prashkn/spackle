import { createRoot } from 'react-dom/client'
import { ContentApp } from './App'
import overlayCss from '@/styles/globals.css?inline'

const HOST_ID = 'spackle-overlay-host'

const FONT_SPECS: Array<{ family: string; weight: number; file: string }> = [
  ...[300, 400, 500, 600, 700].map((w) => ({
    family: 'Geist Sans',
    weight: w,
    file: `geist-sans-latin-${w}-normal.woff2`,
  })),
  ...[400, 500, 600].map((w) => ({
    family: 'Geist Mono',
    weight: w,
    file: `geist-mono-latin-${w}-normal.woff2`,
  })),
]

async function buildFontFaceCss(): Promise<string> {
  const rules = await Promise.all(
    FONT_SPECS.map(async ({ family, weight, file }) => {
      const res = await fetch(chrome.runtime.getURL(`fonts/${file}`))
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url('${url}') format('woff2');}`
    }),
  )
  return rules.join('')
}

async function mount() {
  console.log('[spackle] bootstrap')
  if (document.getElementById(HOST_ID)) {
    console.log('[spackle] already mounted')
    return
  }

  const fontCss = await buildFontFaceCss().catch((err) => {
    console.warn('[spackle] font load failed', err)
    return ''
  })

  const host = document.createElement('div')
  host.id = HOST_ID
  host.style.cssText = 'all:initial;'
  document.documentElement.appendChild(host)

  const shadow = host.attachShadow({ mode: 'open' })

  const style = document.createElement('style')
  style.textContent = fontCss + overlayCss
  shadow.appendChild(style)

  if (fontCss) {
    const docStyle = document.createElement('style')
    docStyle.id = 'spackle-font-faces'
    docStyle.textContent = fontCss
    document.head.appendChild(docStyle)
  }

  const appHost = document.createElement('div')
  shadow.appendChild(appHost)

  createRoot(appHost).render(<ContentApp />)
  console.log('[spackle] mounted')
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true })
} else {
  mount()
}
