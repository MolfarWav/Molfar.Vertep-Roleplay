// Loads and starts matching by meaning for a chat (#184). Kept apart from vectors.ts, which is pure.
import { j } from '@/lib/engine'
import { setupOf, type EmbedSetup, type VectorsView } from '@/lib/vectors'

export const loadVectors = (chatId: string): Promise<VectorsView> => j<VectorsView>(`/litopys/vectors?chatId=${encodeURIComponent(chatId)}`)

/** Ask for the missing vectors of a chat; the engine fills them in batches, the view shows the progress. */
export const startEmbed = (chatId: string): Promise<VectorsView> => j<VectorsView>('/litopys/vectors', { method: 'POST', body: JSON.stringify({ chatId }) })

/** Core engine route (not an app route), like embedConfig. */
export async function loadEmbedSetup(): Promise<EmbedSetup> {
  try {
    const res = await fetch('/v1/embeddings/config')
    return res.ok ? setupOf(await res.json()) : 'unknown'
  } catch {
    return 'unknown'
  }
}
