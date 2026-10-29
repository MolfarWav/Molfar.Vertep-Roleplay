/**
 * Named Chat links boards. A board is only a picture (which chats sit on it, and where); the links
 * themselves are the real ones in `litopys/links.json`, so switching or starting a board never touches them.
 *
 * The board on screen is `settings.canvasBoard` (as before, with an id and a name added); the others
 * wait in `settings.canvasBoards`. Edits always go to the board on screen, so nothing needs saving.
 */
export type Pos = { x: number; y: number }
export interface BoardSave {
  id: string
  name: string
  placed: string[]
  positions: Record<string, Pos>
  /** creation order, for a menu that does not reshuffle when the board on screen changes */
  seq: number
}
export interface BoardsState {
  active: BoardSave
  others: BoardSave[]
}

export const MAIN_BOARD_ID = 'main'
export const MAX_BOARDS = 20
export const BOARD_NAME_MAX = 40

/** One line, no stray spaces, at most BOARD_NAME_MAX characters; `fallback` when nothing is left. */
export const cleanBoardName = (raw: string, fallback: string): string => {
  const one = raw.replace(/\s+/g, ' ').trim().slice(0, BOARD_NAME_MAX).trim()
  return one || fallback
}

const asSave = (b: Partial<BoardSave> | undefined, id: string, name: string, seq: number): BoardSave => ({
  id: typeof b?.id === 'string' && b.id ? b.id : id,
  name: typeof b?.name === 'string' && b.name.trim() ? b.name : name,
  placed: Array.isArray(b?.placed) ? b.placed.filter((x): x is string => typeof x === 'string') : [],
  positions: b?.positions && typeof b.positions === 'object' ? b.positions : {},
  seq: typeof b?.seq === 'number' && Number.isFinite(b.seq) ? b.seq : seq,
})

/** The settings' two keys as one state; an install from before named boards has just its one board. */
export const boardsOf = (
  canvasBoard: Partial<BoardSave> | undefined,
  canvasBoards: Partial<BoardSave>[] | undefined,
  mainName: string,
): BoardsState => {
  const active = asSave(canvasBoard, MAIN_BOARD_ID, mainName, 0)
  const seen = new Set([active.id])
  const others: BoardSave[] = []
  for (const [i, o] of (Array.isArray(canvasBoards) ? canvasBoards : []).entries()) {
    const b = asSave(o, `board-${i + 1}`, `Board ${i + 2}`, i + 1)
    if (seen.has(b.id)) continue
    seen.add(b.id)
    others.push(b)
  }
  return { active, others }
}

export const toSettings = (s: BoardsState): { canvasBoard: BoardSave; canvasBoards: BoardSave[] } => ({
  canvasBoard: s.active,
  canvasBoards: s.others,
})

/** Every board in the order they were made, for the menu. */
export const allBoards = (s: BoardsState): Array<BoardSave & { isActive: boolean }> =>
  [{ ...s.active, isActive: true }, ...s.others.map((b) => ({ ...b, isActive: false }))].sort((a, b) => a.seq - b.seq)

/** An id no board has yet. */
const freshId = (s: BoardsState, makeId: () => string): string => {
  const taken = new Set([s.active.id, ...s.others.map((b) => b.id)])
  let id = makeId()
  while (taken.has(id)) id = makeId()
  return id
}

/** An empty board becomes the one on screen; the one that was there is kept as it was. */
export const startBoard = (s: BoardsState, name: string, makeId: () => string): BoardsState => {
  if (s.others.length + 1 >= MAX_BOARDS) return s
  const id = freshId(s, makeId)
  const seq = Math.max(s.active.seq, ...s.others.map((b) => b.seq)) + 1
  return {
    active: { id, name: cleanBoardName(name, `Board ${seq + 1}`), placed: [], positions: {}, seq },
    others: [s.active, ...s.others],
  }
}

export const switchBoard = (s: BoardsState, id: string): BoardsState => {
  const to = s.others.find((b) => b.id === id)
  if (!to) return s
  return { active: to, others: s.others.map((b) => (b.id === id ? s.active : b)) }
}

export const renameBoard = (s: BoardsState, id: string, name: string): BoardsState => {
  const rename = (b: BoardSave): BoardSave => (b.id === id ? { ...b, name: cleanBoardName(name, b.name) } : b)
  return { active: rename(s.active), others: s.others.map(rename) }
}

/** A board other than the one on screen goes; to remove the one on screen, switch away first. */
export const deleteBoard = (s: BoardsState, id: string): BoardsState => {
  if (id === s.active.id) return s
  return { active: s.active, others: s.others.filter((b) => b.id !== id) }
}
