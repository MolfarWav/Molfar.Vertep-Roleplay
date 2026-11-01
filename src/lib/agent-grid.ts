// The `grid` widget of an agent panel: a board of cols x rows tiles, each coloured by the state a list entry gives it.
// Pure, so a test can hold it. The checker has vetted the widget at install; this is a second look, because the entries
// come from a model: a number outside the board, a state the legend does not name, two entries for one tile.

import { GRID_LIMITS, GRID_TONES } from '@/canvas-kit/boards/agent-check'

export interface GridLegend { value: string; label: string; tone: string; mark?: string }
export interface GridSpec { cols?: number; rows?: number; x?: string; y?: string; cell?: string; legend?: GridLegend[] }
export interface GridTile { col: number; row: number; value: string; label: string; tone: string; mark: string }
export interface GridModel {
  cols: number
  rows: number
  /** one entry per tile that has a state, row by row */
  tiles: GridTile[]
  /** the legend as drawn: label, tone and the mark that goes on the tile (the first letter of the label when the author gave none) */
  legend: (GridLegend & { mark: string })[]
  /** entries that name no tile of this board (a number outside it, or not a number) */
  outside: number
}

const clamp = (n: unknown, fallback: number): number => (Number.isInteger(n) ? Math.min(GRID_LIMITS.size, Math.max(1, n as number)) : fallback)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null)
const entries = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v : []).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x))

/** The first letter of a label, as a mark when the author gave none. */
const markOf = (l: { mark?: string; label: string }): string => (l.mark ? [...l.mark].slice(0, 2).join('') : ([...l.label.trim()][0] ?? '·').toUpperCase())

/**
 * The board from the widget and the list it shows. Columns and rows count from 1. When two entries name one tile the
 * later one wins, so the model can change a tile by saying it again. A state the legend does not name still draws, as a
 * muted tile with a question mark, so a model's typo is visible instead of silent.
 */
export function gridModel(spec: GridSpec, list: unknown): GridModel {
  const cols = clamp(spec.cols, 1)
  const rows = clamp(spec.rows, 1)
  const legend = (Array.isArray(spec.legend) ? spec.legend : [])
    .filter((l) => l && typeof l.value === 'string' && typeof l.label === 'string')
    .slice(0, GRID_LIMITS.legend)
    .map((l) => ({ ...l, tone: GRID_TONES.includes(l.tone) ? l.tone : 'muted', mark: markOf(l) }))
  const byValue = new Map(legend.map((l) => [l.value, l]))
  const at = new Map<number, GridTile>()
  let outside = 0
  for (const e of entries(list)) {
    const col = num(e[spec.x ?? ''])
    const row = num(e[spec.y ?? ''])
    if (col === null || row === null || col < 1 || col > cols || row < 1 || row > rows) { outside++; continue }
    const value = typeof e[spec.cell ?? ''] === 'string' ? (e[spec.cell ?? ''] as string) : ''
    const known = byValue.get(value)
    at.set((row - 1) * cols + (col - 1), known
      ? { col, row, value, label: known.label, tone: known.tone, mark: known.mark }
      : { col, row, value, label: value || '?', tone: 'muted', mark: '?' })
  }
  return { cols, rows, tiles: [...at.entries()].sort((a, b) => a[0] - b[0]).map(([, t]) => t), legend, outside }
}

/** The tone classes of a tile: a soft fill and a border in one hue, readable in both themes. */
export const TONE_CLASS: Record<string, string> = {
  ok: 'border-emerald-500/60 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  info: 'border-sky-500/60 bg-sky-500/20 text-sky-700 dark:text-sky-300',
  warn: 'border-amber-500/60 bg-amber-500/20 text-amber-700 dark:text-amber-300',
  bad: 'border-red-500/60 bg-red-500/20 text-red-700 dark:text-red-300',
  accent: 'border-violet-500/60 bg-violet-500/20 text-violet-700 dark:text-violet-300',
  muted: 'border-border bg-muted text-muted-foreground',
}

/** Entries to show a board with in the editor: each state of the legend a few times, spread over the board; none for the empty preview. */
export function sampleGridEntries(spec: GridSpec, full: boolean): Record<string, unknown>[] {
  const cols = clamp(spec.cols, 1)
  const rows = clamp(spec.rows, 1)
  const legend = Array.isArray(spec.legend) ? spec.legend.filter((l) => l && typeof l.value === 'string') : []
  if (!full || !legend.length || !spec.x || !spec.y || !spec.cell) return []
  const out: Record<string, unknown>[] = []
  const n = Math.min(cols * rows, Math.max(3, legend.length * 3))
  for (let k = 0; k < n; k++) out.push({ [spec.x]: (k * 3) % cols + 1, [spec.y]: (k * 2 + Math.floor((k * 3) / cols)) % rows + 1, [spec.cell]: legend[k % legend.length]!.value })
  return out
}
