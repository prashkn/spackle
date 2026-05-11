import { useEffect, useState } from 'react'
import { buildPrompt } from '@/lib/prompt'
import { clearNotes, getNotes } from '@/lib/storage'
import type { Message } from '@/lib/messages'

type TabInfo = { tabId: number; origin: string }
type Status = 'idle' | 'working' | 'done'

async function resolveActiveTab(): Promise<TabInfo | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !tab.url) return null
  try {
    const url = new URL(tab.url)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return { tabId: tab.id, origin: url.origin }
  } catch {
    return null
  }
}

export function App() {
  const [tab, setTab] = useState<TabInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [noteCount, setNoteCount] = useState(0)
  const [status, setStatus] = useState<Status>('idle')
  const [clearedCount, setClearedCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    resolveActiveTab()
      .then(async (info) => {
        if (cancelled) return
        setTab(info)
        if (info) {
          const notes = await getNotes(info.origin)
          if (!cancelled) setNoteCount(notes.length)
        }
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function onGenerate() {
    if (!tab || noteCount === 0 || status !== 'idle') return
    setStatus('working')
    try {
      const notes = await getNotes(tab.origin)
      if (notes.length === 0) {
        setStatus('idle')
        setNoteCount(0)
        return
      }
      const prompt = buildPrompt(tab.origin, notes)
      await navigator.clipboard.writeText(prompt)
      await clearNotes(tab.origin)
      const msg: Message = { type: 'CLEAR_ALL' }
      chrome.tabs.sendMessage(tab.tabId, msg).catch(() => {})
      setClearedCount(notes.length)
      setNoteCount(0)
      setStatus('done')
      setTimeout(() => window.close(), 1200)
    } catch (err) {
      console.error('[spackle] generate prompt failed', err)
      setStatus('idle')
    }
  }

  const disabled = !tab || noteCount === 0 || status !== 'idle' || loading

  let buttonLabel = 'Generate prompt'
  if (status === 'working') buttonLabel = 'Working…'
  else if (status === 'done')
    buttonLabel = `Copied — ${clearedCount} note${clearedCount === 1 ? '' : 's'} cleared`

  return (
    <div>
      <h1>Spackle</h1>
      <p className={tab && noteCount > 0 ? undefined : 'empty'}>
        {loading
          ? 'Loading…'
          : !tab
            ? 'Open a webpage to drop notes.'
            : noteCount === 0
              ? 'No notes yet on this site.'
              : `${noteCount} note${noteCount === 1 ? '' : 's'} on ${tab.origin}`}
      </p>
      <div className="actions">
        <button
          className="primary"
          disabled={disabled}
          onClick={onGenerate}
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  )
}
