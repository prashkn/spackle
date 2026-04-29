import type { Note } from './storage'

export function buildPrompt(origin: string, notes: Note[]): string {
  if (notes.length === 0) return ''

  const byPath = new Map<string, Map<string, Note[]>>()
  for (const note of notes) {
    let byFile = byPath.get(note.pathname)
    if (!byFile) {
      byFile = new Map()
      byPath.set(note.pathname, byFile)
    }
    const list = byFile.get(note.componentFile) ?? []
    list.push(note)
    byFile.set(note.componentFile, list)
  }

  const out: string[] = [`# Spackle feedback — ${origin}`, '']

  for (const [pathname, byFile] of byPath) {
    out.push(`## ${pathname}`, '')
    for (const [file, fileNotes] of byFile) {
      const name = fileNotes[0].componentName
      const line = fileNotes[0].componentLine
      out.push(`### ${file} (${name}, ~line ${line})`)
      for (const note of fileNotes) {
        out.push(`- ${note.text}`)
      }
      out.push('')
    }
  }

  return out.join('\n').trimEnd() + '\n'
}
