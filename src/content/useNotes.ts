import { useEffect, useReducer, useRef } from 'react'
import { deleteNote, getNotes, upsertNote, type Note } from '@/lib/storage'
import type { Message } from '@/lib/messages'
import {
  CLICK_EVENT,
  HOVER_MODE_EVENT,
  SCAN_REQUEST_EVENT,
  SCAN_RESULTS_EVENT,
} from './events'
import { componentKey, type Hit } from './fiber'

const HOST_ID = 'spackle-overlay-host'

type Rect = Hit['rect']
export type PlacementMap = Map<string, Rect>
export type EditState = { noteId: string; draft: string; prevText: string }

type State = {
  hoverMode: boolean
  notes: Note[]
  placements: PlacementMap
  editState: EditState | null
}

type Action =
  | { type: 'HOVER_ON' }
  | { type: 'HOVER_OFF' }
  | { type: 'NOTES_LOADED'; notes: Note[] }
  | { type: 'SCAN_RESULTS'; hits: Hit[] }
  | { type: 'EDIT_OPEN'; note: Note }
  | { type: 'NOTE_CREATED'; note: Note; notes: Note[]; rect: Rect }
  | { type: 'DRAFT_CHANGED'; draft: string }
  | { type: 'SAVE_DONE'; noteId: string; notes: Note[] }
  | { type: 'SAVE_FAILED' }
  | { type: 'CANCEL_EDIT' }
  | { type: 'DELETE_DONE'; noteId: string; notes: Note[] }
  | { type: 'DELETE_FAILED' }

const initial: State = {
  hoverMode: false,
  notes: [],
  placements: new Map(),
  editState: null,
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'HOVER_ON':
      return { ...state, hoverMode: true }

    case 'HOVER_OFF':
      return { ...state, hoverMode: false }

    case 'NOTES_LOADED':
      return { ...state, notes: action.notes }

    case 'SCAN_RESULTS': {
      const placements: PlacementMap = new Map()
      for (const hit of action.hits) {
        placements.set(componentKey(hit.file, hit.line, hit.name), hit.rect)
      }
      return { ...state, placements }
    }

    case 'EDIT_OPEN':
      return {
        ...state,
        editState: {
          noteId: action.note.id,
          draft: action.note.text,
          prevText: action.note.text,
        },
      }

    case 'NOTE_CREATED': {
      const placements = new Map(state.placements)
      placements.set(
        componentKey(
          action.note.componentFile,
          action.note.componentLine,
          action.note.componentName,
        ),
        action.rect,
      )
      return {
        ...state,
        notes: action.notes,
        placements,
        editState: { noteId: action.note.id, draft: '', prevText: '' },
      }
    }

    case 'DRAFT_CHANGED':
      if (!state.editState) return state
      return { ...state, editState: { ...state.editState, draft: action.draft } }

    case 'SAVE_DONE': {
      // Only close the edit if it's still the same note. If the user opened
      // edit on another note while this save was in flight, leave it alone.
      const editState =
        state.editState?.noteId === action.noteId ? null : state.editState
      return { ...state, notes: action.notes, editState }
    }

    case 'SAVE_FAILED':
      // Keep edit state open so the user can retry.
      return state

    case 'CANCEL_EDIT': {
      if (!state.editState) return state
      const { prevText, noteId } = state.editState
      if (!prevText) {
        // New note abandoned — remove from local state immediately.
        // Storage cleanup is fired from handleCancel.
        return {
          ...state,
          notes: state.notes.filter((n) => n.id !== noteId),
          editState: null,
        }
      }
      return { ...state, editState: null }
    }

    case 'DELETE_DONE': {
      const editState =
        state.editState?.noteId === action.noteId ? null : state.editState
      return { ...state, notes: action.notes, editState }
    }

    case 'DELETE_FAILED':
      return state
  }
}

export function useNotes() {
  const [state, dispatch] = useReducer(reducer, initial)

  // Synced every render so async callbacks always read current state without
  // needing to close over it (avoids stale-closure bugs in the event handlers
  // registered once in the [origin] effect below).
  const stateRef = useRef(state)
  stateRef.current = state

  const origin = window.location.origin

  // Always reads window.location.pathname at call time — no stale-closure risk.
  function forCurrentPage(all: Note[]): Note[] {
    return all.filter((n) => n.pathname === window.location.pathname)
  }

  // Load notes for the current page on mount.
  useEffect(() => {
    getNotes(origin)
      .then(forCurrentPage)
      .then((notes) => dispatch({ type: 'NOTES_LOADED', notes }))
      .catch(console.error)
  }, [origin])

  // Re-trigger DOM scan whenever the notes list changes (initial load, create,
  // delete). spackle:scan-request → main world → spackle:scan-results is
  // synchronous, so SCAN_RESULTS will be dispatched within the same task.
  useEffect(() => {
    if (state.notes.length === 0) return
    window.dispatchEvent(
      new CustomEvent(SCAN_REQUEST_EVENT, {
        detail: {
          components: state.notes.map((n) => ({
            file: n.componentFile,
            line: n.componentLine,
            name: n.componentName,
          })),
        },
      }),
    )
  }, [state.notes])

  // Keep placements fresh as the page moves. Scroll uses rAF to coalesce; resize
  // is debounced. Both early-return when there are no notes to avoid a tree walk.
  useEffect(() => {
    if (state.notes.length === 0) return

    const components = state.notes.map((n) => ({
      file: n.componentFile,
      line: n.componentLine,
      name: n.componentName,
    }))
    const requestScan = () => {
      window.dispatchEvent(
        new CustomEvent(SCAN_REQUEST_EVENT, { detail: { components } }),
      )
    }

    let rafId: number | null = null
    const onScroll = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        requestScan()
      })
    }

    let resizeTimer: number | null = null
    const onResize = () => {
      if (resizeTimer !== null) window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(requestScan, 100)
    }

    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true })
      window.removeEventListener('resize', onResize)
      if (rafId !== null) cancelAnimationFrame(rafId)
      if (resizeTimer !== null) window.clearTimeout(resizeTimer)
    }
  }, [state.notes])

  // Persist the current draft and dispatch SAVE_DONE. Empty drafts delete the
  // note. Used by Enter-to-save and by outside-click-to-save below.
  async function persistEdit(es: EditState) {
    const note = stateRef.current.notes.find((n) => n.id === es.noteId)
    if (!note) return
    try {
      const op = es.draft.trim()
        ? upsertNote(origin, { ...note, text: es.draft })
        : deleteNote(origin, es.noteId)
      dispatch({
        type: 'SAVE_DONE',
        noteId: es.noteId,
        notes: forCurrentPage(await op),
      })
    } catch (err) {
      console.error('[spackle] failed to save note', err)
      dispatch({ type: 'SAVE_FAILED' }) // edit state preserved; user can retry
    }
  }

  // Window-event wiring (registered once; uses stateRef for current state).
  useEffect(() => {
    const onHoverMode = (e: Event) => {
      const active = (e as CustomEvent<boolean>).detail
      dispatch({ type: active ? 'HOVER_ON' : 'HOVER_OFF' })
    }

    const onScanResults = (e: Event) => {
      dispatch({
        type: 'SCAN_RESULTS',
        hits: (e as CustomEvent<Hit[]>).detail,
      })
    }

    const onClick = async (e: Event) => {
      const hit = (e as CustomEvent<Hit | null>).detail
      if (!hit) return

      const { notes } = stateRef.current
      const existing = notes.find(
        (n) =>
          n.componentFile === hit.file &&
          n.componentLine === hit.line &&
          n.componentName === hit.name,
      )

      if (existing) {
        dispatch({ type: 'EDIT_OPEN', note: existing })
        return
      }

      try {
        const newNote: Note = {
          id: crypto.randomUUID(),
          pathname: window.location.pathname,
          componentFile: hit.file,
          componentLine: hit.line,
          componentName: hit.name,
          text: '',
          createdAt: Date.now(),
        }
        const updated = await upsertNote(origin, newNote)
        dispatch({
          type: 'NOTE_CREATED',
          note: newNote,
          notes: forCurrentPage(updated),
          rect: hit.rect,
        })
      } catch (err) {
        console.error('[spackle] failed to create note', err)
      }
    }

    // Save the in-progress edit when the user clicks anywhere outside the
    // shadow overlay. mousedown (not click) so the card's onClick stopPropagation
    // doesn't matter, and capture phase so we run before any host-page handler.
    const onOutsideMouseDown = (e: MouseEvent) => {
      const es = stateRef.current.editState
      if (!es) return
      for (const node of e.composedPath()) {
        if ((node as Element).id === HOST_ID) return
      }
      void persistEdit(es)
    }

    const onRuntimeMessage = (msg: Message) => {
      if (msg?.type === 'CLEAR_ALL') {
        dispatch({ type: 'NOTES_LOADED', notes: [] })
      }
    }

    window.addEventListener(HOVER_MODE_EVENT, onHoverMode)
    window.addEventListener(SCAN_RESULTS_EVENT, onScanResults)
    window.addEventListener(CLICK_EVENT, onClick)
    window.addEventListener('mousedown', onOutsideMouseDown, true)
    chrome.runtime.onMessage.addListener(onRuntimeMessage)
    return () => {
      window.removeEventListener(HOVER_MODE_EVENT, onHoverMode)
      window.removeEventListener(SCAN_RESULTS_EVENT, onScanResults)
      window.removeEventListener(CLICK_EVENT, onClick)
      window.removeEventListener('mousedown', onOutsideMouseDown, true)
      chrome.runtime.onMessage.removeListener(onRuntimeMessage)
    }
  }, [origin])

  async function handleSave() {
    const { editState } = stateRef.current
    if (!editState) return
    await persistEdit(editState)
  }

  async function handleDelete(noteId: string) {
    try {
      const updated = await deleteNote(origin, noteId)
      dispatch({ type: 'DELETE_DONE', noteId, notes: forCurrentPage(updated) })
    } catch (err) {
      console.error('[spackle] failed to delete note', err)
      dispatch({ type: 'DELETE_FAILED' })
    }
  }

  function handleCancel() {
    const es = stateRef.current.editState
    if (es && !es.prevText) {
      // New note abandoned — clean up storage. CANCEL_EDIT removes it from
      // local state immediately; this confirms it's gone from storage too.
      deleteNote(origin, es.noteId)
        .then(forCurrentPage)
        .then((notes) => dispatch({ type: 'NOTES_LOADED', notes }))
        .catch(console.error)
    }
    dispatch({ type: 'CANCEL_EDIT' })
  }

  function handleDraftChange(draft: string) {
    dispatch({ type: 'DRAFT_CHANGED', draft })
  }

  return {
    notes: state.notes,
    placements: state.placements,
    editState: state.editState,
    handleSave,
    handleDelete,
    handleCancel,
    handleDraftChange,
  }
}
