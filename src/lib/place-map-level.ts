// The map on view in the places map (Molfar.Vertep#473): which of a chat's maps (levels) the window shows. A view, not data: kept per
// chat in this browser, so a phone can look at the city while the desktop looks at the country.

const key = (chatId: string) => `rp.map.level.${chatId}`

/** The level id kept for this chat (`main` when none, or when storage is unavailable). */
export function loadLevel(chatId: string, st: Pick<Storage, 'getItem'> | null): string {
  try {
    const v = st?.getItem(key(chatId))
    return v && /^(main|l[1-9][0-9]{0,2})$/.test(v) ? v : 'main'
  } catch { return 'main' }
}

export function saveLevel(chatId: string, id: string, st: Pick<Storage, 'setItem' | 'removeItem'> | null): void {
  try {
    if (id === 'main') st?.removeItem(key(chatId))
    else st?.setItem(key(chatId), id)
  } catch { /* private mode: the view lasts until the page closes */ }
}
