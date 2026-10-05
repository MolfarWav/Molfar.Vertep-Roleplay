import { useDashMaybe } from '@/components/dashboard/dash-context'
import { useTx } from '@/components/dashboard/dash-common'
import { useT } from '@/hooks/use-t'

/** The story time of a scene in the dashboard's own clock wording: "19:30 evening, day 2",
 *  or just the band word ("evening, day 2"), or the day alone. Null when nothing is known. */
export function useSceneSub(): (s: { day: number | null; time: string | null; band: string | null }) => string | null {
  const t = useT()
  const tx = useTx()
  return (s) => {
    const when = [s.time, s.band ? tx('dash.band', s.band) : null].filter(Boolean).join(' ')
    const day = s.day != null ? t('dash.day', { n: s.day }).toLowerCase() : null
    return [when, day].filter(Boolean).join(', ') || null
  }
}

/** A scene change between two messages: the place, the story time under it, a stitched band on each side. */
export function SceneHeading({ place, sub }: { place: string; sub: string | null }) {
  return (
    <div className="ls-scene" role="heading" aria-level={3}>
      <div className="ls-band is-left" aria-hidden="true" />
      <div className="ls-scene-text">
        <b>{place}</b>
        {sub && <small>{sub}</small>}
      </div>
      <div className="ls-band is-right" aria-hidden="true" />
    </div>
  )
}

/** The heading for the message under `messageKey` ("<id>#<activeSwipe>"), when the dashboard saw the story change place there. */
export function SceneBefore({ messageKey }: { messageKey: string }) {
  const dash = useDashMaybe()
  const sub = useSceneSub()
  if (dash?.status !== 'ready') return null
  const scene = dash.view?.scenes?.find((s) => s.key === messageKey)
  if (!scene) return null
  return <SceneHeading place={scene.place} sub={sub(scene)} />
}
