import { useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { deleteNote, getNotes, upsertNote, type Note } from '@/lib/storage'
import {
  CLICK_EVENT,
  HOVER_MODE_EVENT,
  SCAN_REQUEST_EVENT,
  SCAN_RESULTS_EVENT,
} from './events'
import type { Hit } from './fiber'

type Rect = Hit['rect']
type PlacementMap = Map<string, Rect>
type EditState = { noteId: string; draft: string; prevText: string }

// Width bounds for note cards (px). Width scales with the element but is
// clamped so notes don't become uselessly narrow or comically wide.
const NOTE_MIN_WIDTH = 140
const NOTE_MAX_WIDTH = 280

function noteWidth(elementWidth: number): number {
  return Math.min(Math.max(elementWidth * 0.55, NOTE_MIN_WIDTH), NOTE_MAX_WIDTH)
}

// Position the note card adjacent to the element — right side first, then
// left, falling back to an inset overlay when neither side has room.
function notePosition(
  rect: Rect,
  width: number,
): { top: number; left: number } {
  const vw = window.innerWidth
  if (rect.left + rect.width + width + 8 <= vw) {
    return { top: rect.top, left: rect.left + rect.width + 8 }
  }
  if (rect.left - width - 8 >= 0) {
    return { top: rect.top, left: rect.left - width - 8 }
  }
  return { top: rect.top + 4, left: rect.left + 4 }
}

interface NoteCardProps {
  note: Note
  rect: Rect
  editState: EditState | null
  onDraftChange: (text: string) => void
  onSave: () => void
  onCancel: () => void
  onDelete: () => void
}

function NoteCard({
  note,
  rect,
  editState,
  onDraftChange,
  onSave,
  onCancel,
  onDelete,
}: NoteCardProps) {
  const isEditing = editState !== null
  const draft = editState?.draft ?? note.text
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      const len = textareaRef.current.value.length
      textareaRef.current.setSelectionRange(len, len)
    }
  }, [isEditing])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft])

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  const width = noteWidth(rect.width)
  const pos = notePosition(rect, width)

  return (
    <div
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width,
        zIndex: 2147483646,
        borderRadius: 6,
        overflow: 'hidden',
        boxShadow: '0 4px 14px rgba(0,0,0,0.22)',
        pointerEvents: 'auto',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '3px 6px',
          background: '#F5F186',
          fontSize: 11,
          fontFamily: 'Geist Mono, monospace',
          color: '#2A2000',
          gap: 4,
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {note.componentName}
        </span>
        <button
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 2,
            color: '#2A2000',
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
            opacity: 0.7,
          }}
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          title="Delete note"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Add a note… (Enter to save, Shift+Enter for newline)"
          style={{
            display: 'block',
            width: '100%',
            minHeight: 64,
            padding: '6px 8px',
            background: '#FFFDE7',
            color: '#2A2000',
            fontSize: 12,
            fontFamily: 'Geist Sans, sans-serif',
            border: 'none',
            outline: 'none',
            resize: 'none',
            overflowY: 'hidden',
            boxSizing: 'border-box',
          }}
        />
      ) : (
        <div
          style={{
            padding: '6px 8px',
            background: '#FFFDE7',
            color: '#2A2000',
            fontSize: 12,
            fontFamily: 'Geist Sans, sans-serif',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            minHeight: 40,
          }}
        >
          {note.text}
        </div>
      )}
    </div>
  )
}

export function Notes() {
  const [hoverMode, setHoverMode] = useState(false)
  const [notes, setNotes] = useState<Note[]>([])
  const [placements, setPlacements] = useState<PlacementMap>(new Map())
  const [editState, setEditState] = useState<EditState | null>(null)

  const origin = window.location.origin
  const pathname = window.location.pathname

  const notesRef = useRef<Note[]>([])
  notesRef.current = notes
  const editStateRef = useRef<EditState | null>(null)
  editStateRef.current = editState

  function forCurrentPage(all: Note[]): Note[] {
    return all.filter((n) => n.pathname === pathname)
  }

  useEffect(() => {
    getNotes(origin)
      .then(forCurrentPage)
      .then(setNotes)
      .catch(console.error)
  }, [origin])

  // Re-scan whenever hover mode is active and the notes list changes.
  useEffect(() => {
    if (!hoverMode || notes.length === 0) return
    const components = notes.map((n) => ({
      file: n.componentFile,
      name: n.componentName,
    }))
    window.dispatchEvent(
      new CustomEvent(SCAN_REQUEST_EVENT, { detail: { components } }),
    )
  }, [hoverMode, notes])

  useEffect(() => {
    const onHoverMode = (e: Event) => {
      const active = (e as CustomEvent<boolean>).detail
      if (!active) {
        // Auto-save any in-progress edit before hover mode closes.
        const es = editStateRef.current
        const currentNotes = notesRef.current
        if (es) {
          const note = currentNotes.find((n) => n.id === es.noteId)
          if (note) {
            if (!es.draft.trim()) {
              deleteNote(origin, es.noteId)
                .then(forCurrentPage)
                .then(setNotes)
                .catch(console.error)
            } else {
              upsertNote(origin, { ...note, text: es.draft })
                .then(forCurrentPage)
                .then(setNotes)
                .catch(console.error)
            }
          }
          setEditState(null)
        }
        setPlacements(new Map())
      }
      setHoverMode(active)
    }

    const onScanResults = (e: Event) => {
      const hits = (e as CustomEvent<Hit[]>).detail
      const map: PlacementMap = new Map()
      for (const hit of hits) {
        map.set(`${hit.file}:${hit.name}`, hit.rect)
      }
      setPlacements(map)
    }

    const onClick = async (e: Event) => {
      const hit = (e as CustomEvent<Hit | null>).detail
      if (!hit) return
      const key = `${hit.file}:${hit.name}`
      const currentNotes = notesRef.current
      const existing = currentNotes.find(
        (n) => n.componentFile === hit.file && n.componentName === hit.name,
      )
      if (existing) {
        setEditState({
          noteId: existing.id,
          draft: existing.text,
          prevText: existing.text,
        })
      } else {
        try {
          const newNote: Note = {
            id: crypto.randomUUID(),
            pathname,
            componentFile: hit.file,
            componentLine: hit.line,
            componentName: hit.name,
            text: '',
            createdAt: Date.now(),
          }
          const updated = await upsertNote(origin, newNote)
          setNotes(forCurrentPage(updated))
          setEditState({ noteId: newNote.id, draft: '', prevText: '' })
          // Show the card immediately at the clicked rect while scan catches up.
          setPlacements((prev) => new Map(prev).set(key, hit.rect))
        } catch (err) {
          console.error('[spackle] failed to create note', err)
        }
      }
    }

    window.addEventListener(HOVER_MODE_EVENT, onHoverMode)
    window.addEventListener(SCAN_RESULTS_EVENT, onScanResults)
    window.addEventListener(CLICK_EVENT, onClick)
    return () => {
      window.removeEventListener(HOVER_MODE_EVENT, onHoverMode)
      window.removeEventListener(SCAN_RESULTS_EVENT, onScanResults)
      window.removeEventListener(CLICK_EVENT, onClick)
    }
  }, [origin])

  async function handleSave(noteId: string, draft: string) {
    const note = notesRef.current.find((n) => n.id === noteId)
    if (!note) return
    try {
      if (!draft.trim()) {
        setNotes(forCurrentPage(await deleteNote(origin, noteId)))
      } else {
        setNotes(forCurrentPage(await upsertNote(origin, { ...note, text: draft })))
      }
    } catch (err) {
      console.error('[spackle] failed to save note', err)
    }
    setEditState(null)
  }

  async function handleDelete(noteId: string) {
    try {
      setNotes(forCurrentPage(await deleteNote(origin, noteId)))
    } catch (err) {
      console.error('[spackle] failed to delete note', err)
    }
    if (editStateRef.current?.noteId === noteId) setEditState(null)
  }

  function handleCancel(noteId: string, prevText: string) {
    if (!prevText) {
      // New note abandoned — remove it from storage.
      deleteNote(origin, noteId)
        .then(forCurrentPage)
        .then(setNotes)
        .catch(console.error)
    }
    setEditState(null)
  }

  if (!hoverMode) return null

  return (
    <>
      {notes.map((note) => {
        const key = `${note.componentFile}:${note.componentName}`
        const rect = placements.get(key)
        if (!rect) return null
        const isEditing = editState?.noteId === note.id
        return (
          <NoteCard
            key={note.id}
            note={note}
            rect={rect}
            editState={isEditing ? editState : null}
            onDraftChange={(draft) =>
              setEditState((es) => (es ? { ...es, draft } : null))
            }
            onSave={() =>
              handleSave(
                note.id,
                editStateRef.current?.draft ?? note.text,
              )
            }
            onCancel={() =>
              handleCancel(
                note.id,
                isEditing ? editState!.prevText : note.text,
              )
            }
            onDelete={() => handleDelete(note.id)}
          />
        )
      })}
    </>
  )
}
