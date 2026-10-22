// Export options the user keeps between exports. Local to this browser, like the other view choices.

const MARK_KEY = 'rp.export.markSections'

/** "Mark the profile sections" (GitHub #105): on unless the user switched it off. */
export function markProfileSections(): boolean {
  try { return localStorage.getItem(MARK_KEY) !== 'off' } catch { return true }
}

export function setMarkProfileSections(on: boolean): void {
  try { if (on) localStorage.removeItem(MARK_KEY); else localStorage.setItem(MARK_KEY, 'off') } catch { /* storage blocked: the choice lasts until reload */ }
}
