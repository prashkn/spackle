export type Message =
  | { type: 'PING_SUPPORTED' }
  | { type: 'COPY_PROMPT' }
  | { type: 'CLEAR_ALL' }

export type SupportedResponse = {
  supported: boolean
  origin?: string
  noteCount?: number
}

export type CopyPromptResponse = {
  ok: boolean
  prompt?: string
  noteCount?: number
}
