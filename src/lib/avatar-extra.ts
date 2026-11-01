// How far the side portrait of the stage look may grow to the left, into the free margin beside the chat column.
// Pure, so a test can check it; the DOM side is components/chat/use-avatar-extra.ts.

/** the most the portrait grows, in px (68 px grows to 168 px) */
export const AVATAR_EXTRA_MAX = 100
/** the gap kept between the grown portrait and the edge of the log, in px */
export const AVATAR_EDGE_GUTTER = 16

/**
 * `logWidth`: the scrolling log's width (without its scrollbar). `columnWidth`: the centred chat column's width,
 * its own padding included. `columnPadLeft`: that padding on the left, where the portrait's cell starts.
 * The free room left of the portrait is the margin plus that padding, less the gutter; a narrow window gives 0.
 */
export function avatarExtra(logWidth: number, columnWidth: number, columnPadLeft: number): number {
  if (!(logWidth > 0) || !(columnWidth > 0)) return 0
  const margin = Math.max(0, (logWidth - columnWidth) / 2)
  const room = margin + Math.max(0, columnPadLeft) - AVATAR_EDGE_GUTTER
  return Math.round(Math.min(AVATAR_EXTRA_MAX, Math.max(0, room)))
}
