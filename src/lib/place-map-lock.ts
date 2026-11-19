// The places map's lock (Molfar.Vertep#454): while it is on, a drag that starts on a place moves the map, not the place, so a
// finger panning a phone's map cannot shove an icon. Kept per chat in this browser (a phone can be locked while the desktop is not).

const key = (chatId: string) => `rp.map.lock.${chatId}`

export function loadLock(chatId: string, st: Pick<Storage, 'getItem'> | null): boolean {
  try { return st?.getItem(key(chatId)) === '1' } catch { return false }
}

export function saveLock(chatId: string, on: boolean, st: Pick<Storage, 'setItem' | 'removeItem'> | null): void {
  try {
    if (on) st?.setItem(key(chatId), '1')
    else st?.removeItem(key(chatId))
  } catch { /* private mode: the lock lasts until the page closes */ }
}
