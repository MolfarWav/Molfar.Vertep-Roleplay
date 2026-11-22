import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useT } from '@/hooks/use-t'
import { resolveLanguage } from '@/lib/i18n'
import { useApp } from '@/lib/store'
import type { DirectionState } from '@/lib/direction'
import { nextAct, nextSource } from '@/lib/direction-ui'

/**
 * The note queued for the next reply, as a callout with Skip: a rule's ("Next reply: Yuzu walks in on Kaito. (Interrupted moment)")
 * or a beat's ("Next reply: the beat «…». (Plan)"). Shown by the Rules tab and the Plan tab; `testId` names the pair of test ids.
 */
export function NextCallout({ state, testId, onSkip }: { state: DirectionState; testId: 'rules' | 'plan'; onSkip: () => Promise<void> | void }) {
  const t = useT()
  const lang = resolveLanguage(useApp((s) => s.settings.language))
  const [pending, setPending] = useState(false)
  const next = state.next?.due ? state.next : null
  if (!next) return null
  return (
    <div role="status" data-testid={`${testId}-next`} data-kind={next.kind} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-cta/40 bg-cta/10 px-4 py-3">
      <p className="min-w-0 flex-[1_1_14rem] text-body">
        {t(next.forced ? 'dir.rules.nextHand' : 'dir.rules.next', { act: nextAct(t, state, next, lang), rule: nextSource(t, state, next) })}
      </p>
      <Button
        variant="outline"
        size="sm"
        className="max-md:h-10"
        disabled={pending}
        onClick={() => {
          setPending(true)
          void Promise.resolve(onSkip()).finally(() => setPending(false))
        }}
        data-testid={`${testId}-skip`}
      >
        {t('dir.rules.skip')}
      </Button>
    </div>
  )
}
