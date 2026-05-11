import { useEffect, useRef } from 'react'
import { Trash2 } from 'lucide-react'
import type { Note } from '@/lib/storage'
import { componentKey, type Hit } from './fiber'
import { useNotes } from './useNotes'

type Rect = Hit['rect']

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
  /** null = display mode; string = the current draft being edited */
  draft: string | null
  onDraftChange: (text: string) => void
  onSave: () => void
  onCancel: () => void
  onDelete: () => void
}

function NoteCard({
  note,
  rect,
  draft,
  onDraftChange,
  onSave,
  onCancel,
  onDelete,
}: NoteCardProps) {
  const isEditing = draft !== null
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Focus and move cursor to end when entering edit mode.
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      const len = textareaRef.current.value.length
      textareaRef.current.setSelectionRange(len, len)
    }
  }, [isEditing])

  // Auto-resize textarea to fit content.
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

      {draft !== null ? (
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
  const {
    notes,
    placements,
    editState,
    handleSave,
    handleDelete,
    handleCancel,
    handleDraftChange,
  } = useNotes()

  return (
    <>
      {notes.map((note) => {
        const rect = placements.get(
          componentKey(
            note.componentFile,
            note.componentLine,
            note.componentName,
          ),
        )
        if (!rect) return null
        const draft = editState?.noteId === note.id ? editState.draft : null
        return (
          <NoteCard
            key={note.id}
            note={note}
            rect={rect}
            draft={draft}
            onDraftChange={handleDraftChange}
            onSave={handleSave}
            onCancel={handleCancel}
            onDelete={() => handleDelete(note.id)}
          />
        )
      })}
    </>
  )
}
