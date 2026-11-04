import type { Chat } from './types'

/**
 * Whether a server snapshot of a chat may replace the copy on screen.
 *
 * The engine writes a transcript with a plain file write (truncate, then write), and the
 * sidecars that run after a reply (Dashboard, Litopys, World DM, agents) write the chat's
 * files while the app re-reads them on every `look_changed`. A read that lands mid-write
 * fails to parse and comes back as a chat with NO messages. Applied, that emptied the log
 * for a moment: the browser clamped the reader's scroll to the top, and the next refresh
 * brought the messages back with the reader stranded there (or thrown to the bottom).
 *
 * A chat that has messages on screen never loses all of them in the background: clearing a
 * chat happens here first (optimistically), and deleting it removes it from the list
 * instead. So an empty snapshot over a loaded copy is a torn read, and the loaded copy
 * stays until the next refresh brings the real transcript.
 */
export function keepShownTranscript(shown: Chat | null | undefined, snapshotMessages: number): boolean {
  return !!shown && shown.messages.length > 0 && snapshotMessages === 0
}
