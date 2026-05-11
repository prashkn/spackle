export type Note = {
  id: string
  pathname: string
  componentFile: string
  componentLine: number
  componentName: string
  text: string
  createdAt: number
}

const KEY_PREFIX = 'spackle:notes:'

export function keyFor(origin: string): string {
  return KEY_PREFIX + origin
}

export async function getNotes(origin: string): Promise<Note[]> {
  const key = keyFor(origin)
  const result = await chrome.storage.local.get(key)
  return (result[key] as Note[] | undefined) ?? []
}

export async function setNotes(
  origin: string,
  notes: Note[],
): Promise<void> {
  await chrome.storage.local.set({ [keyFor(origin)]: notes })
}

export async function upsertNote(
  origin: string,
  next: Note,
): Promise<Note[]> {
  const notes = await getNotes(origin)
  const idx = notes.findIndex(
    (n) =>
      n.pathname === next.pathname &&
      n.componentFile === next.componentFile &&
      n.componentLine === next.componentLine &&
      n.componentName === next.componentName,
  )
  if (idx >= 0) notes[idx] = next
  else notes.push(next)
  await setNotes(origin, notes)
  return notes
}

export async function deleteNote(
  origin: string,
  id: string,
): Promise<Note[]> {
  const notes = (await getNotes(origin)).filter((n) => n.id !== id)
  await setNotes(origin, notes)
  return notes
}

export async function clearNotes(origin: string): Promise<void> {
  await chrome.storage.local.remove(keyFor(origin))
}

export async function findNoteForComponent(
  origin: string,
  pathname: string,
  componentFile: string,
  componentLine: number,
  componentName: string,
): Promise<Note | undefined> {
  const notes = await getNotes(origin)
  return notes.find(
    (n) =>
      n.pathname === pathname &&
      n.componentFile === componentFile &&
      n.componentLine === componentLine &&
      n.componentName === componentName,
  )
}
