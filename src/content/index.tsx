import { createRoot } from 'react-dom/client'
import { ContentApp } from './App'
import { detectReactDev } from './fiber'
import overlayCss from '@/styles/globals.css?inline'

const HOST_ID = 'spackle-overlay-host'

function mount() {
  console.log('[spackle] bootstrap')
  if (document.getElementById(HOST_ID)) {
    console.log('[spackle] already mounted')
    return
  }
  if (!detectReactDev()) {
    console.log(
      '[spackle] skipped: no React fibers with resolvable debug location',
    )
    return
  }

  const host = document.createElement('div')
  host.id = HOST_ID
  host.style.cssText = 'all:initial;'
  document.documentElement.appendChild(host)

  const shadow = host.attachShadow({ mode: 'open' })

  const style = document.createElement('style')
  style.textContent = overlayCss
  shadow.appendChild(style)

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
