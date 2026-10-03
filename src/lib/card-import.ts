import { toast } from 'sonner'
import { j, extractCardFromPng, fileToDataUrl } from '@/lib/engine'

/** Ask the dashboard plugin to rate each imported card, one after another and
 *  without waiting: the plugin decides whether to (its setting, an existing soul),
 *  and a missing plugin or a failed rating must never disturb the import. */
function rateImported(ids: unknown): void {
  const list = (Array.isArray(ids) ? ids : []).filter((id): id is string => typeof id === 'string' && id !== '')
  if (!list.length) return
  void (async () => {
    for (const id of list) {
      try {
        await j('/dashboard/soul/rate', { method: 'POST', body: JSON.stringify({ characterId: id, auto: true }) })
      } catch { /* swallowed on purpose */ }
    }
  })()
}

/** Real import: PNG cards (tEXt 'chara') and JSON cards, single or bulk,
 *  through the studio-import plugin route. Shared by the Characters page and
 *  Home. `hydrate` refreshes the store once the cards are in. */
export async function importCardFiles(files: FileList | null, hydrate: () => Promise<void>): Promise<void> {
  if (!files?.length) return
  const cards: unknown[] = []
  const errors: string[] = []
  for (const f of Array.from(files)) {
    try {
      if (f.name.toLowerCase().endsWith('.png')) {
        const card = await extractCardFromPng(f)
        if (!card) { errors.push(`${f.name}: no embedded card data`); continue }
        let avatar: string | undefined
        try { avatar = await fileToDataUrl(f, 512) } catch { /* keep card without avatar */ }
        cards.push({ card, ...(avatar ? { avatar } : {}) })
      } else {
        cards.push(JSON.parse(await f.text()))
      }
    } catch { errors.push(`${f.name}: could not parse`) }
  }
  if (cards.length) {
    try {
      const r = await j<{ characters: string[]; errors?: string[] }>('/import/batch', {
        method: 'POST', body: JSON.stringify({ cards }),
      })
      toast.success(`Imported ${r.characters.length} character${r.characters.length === 1 ? '' : 's'}`)
      await hydrate()
      rateImported(r.characters)
    } catch (e) {
      toast.error(String((e as Error).message ?? e))
    }
  }
  for (const e of errors) toast.error(e)
}
