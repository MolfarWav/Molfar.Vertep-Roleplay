// How a group talks (Molfar.Vertep, group dynamics): two dials and a switch, drawn the same in the group editor's
// Turns tab and in a chat's Turns popover, and a member's voice notes for the editor's Members tab.

import { useEffect, useState } from 'react'
import { Segmented } from '@/components/dashboard/soul-controls'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useT } from '@/hooks/use-t'
import type { GroupDial, GroupVoice } from '@/lib/types'

export const VOICE_MAX_QUIRKS = 2
export const VOICE_MAX_LINES = 5

export interface GroupDynamics {
  banter: GroupDial
  pushback: GroupDial
  spotlight: boolean
}

/** The three group-dynamics controls. `idPrefix` keeps the ids unique when two copies are on screen. */
export function DynamicsFields({ value, onChange, idPrefix }: {
  value: GroupDynamics
  onChange: (patch: Partial<GroupDynamics>) => void
  idPrefix: string
}) {
  const t = useT()
  const dials = [
    { id: 'off', label: t('group.dyn.off') },
    { id: 'can', label: t('group.dyn.can') },
    { id: 'should', label: t('group.dyn.should') },
  ] as const
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">{t('group.dyn.dialHint')}</p>
      <div className="space-y-1.5">
        <Label id={`${idPrefix}-banter`} className="mb-0">{t('group.dyn.banter')}</Label>
        <Segmented<GroupDial> label={t('group.dyn.banter')} value={value.banter} options={dials} onChange={(v) => onChange({ banter: v })} />
        <p className="text-xs text-muted-foreground">{t('group.dyn.banterHint')}</p>
      </div>
      <div className="space-y-1.5">
        <Label id={`${idPrefix}-pushback`} className="mb-0">{t('group.dyn.pushback')}</Label>
        <Segmented<GroupDial> label={t('group.dyn.pushback')} value={value.pushback} options={dials} onChange={(v) => onChange({ pushback: v })} />
        <p className="text-xs text-muted-foreground">{t('group.dyn.pushbackHint')}</p>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <div className="min-w-0">
          <Label htmlFor={`${idPrefix}-spotlight`} className="mb-0">{t('group.dyn.spotlight')}</Label>
          <p className="text-xs text-muted-foreground">{t('group.dyn.spotlightHint')}</p>
        </div>
        <Switch id={`${idPrefix}-spotlight`} checked={value.spotlight} onCheckedChange={(v) => onChange({ spotlight: v })} />
      </div>
    </div>
  )
}

const clean = (s: string, len: number) => s.trim().slice(0, len)

/** The voice as the editor stores it: trimmed, capped, `undefined` when empty (so the key leaves the file). */
export function normalizeVoice(quirks: string[], lines: string[]): GroupVoice | undefined {
  const q = quirks.map((x) => clean(x, 120)).filter(Boolean).slice(0, VOICE_MAX_QUIRKS)
  const l = lines.map((x) => clean(x, 240)).filter(Boolean).slice(0, VOICE_MAX_LINES)
  return q.length || l.length ? { quirks: q, lines: l } : undefined
}

/** A member's voice in this group: up to two speech habits and up to five sample lines. Drafts are kept while
 *  typing and saved when a field loses focus. */
export function VoiceFields({ memberId, voice, onCommit }: {
  memberId: string
  voice: GroupVoice | undefined
  onCommit: (v: GroupVoice | undefined) => void
}) {
  const t = useT()
  const [q1, setQ1] = useState(voice?.quirks?.[0] ?? '')
  const [q2, setQ2] = useState(voice?.quirks?.[1] ?? '')
  const [lines, setLines] = useState((voice?.lines ?? []).join('\n'))
  // follow a change made elsewhere (another tab, a reset)
  const stored = JSON.stringify(voice ?? null)
  useEffect(() => {
    setQ1(voice?.quirks?.[0] ?? '')
    setQ2(voice?.quirks?.[1] ?? '')
    setLines((voice?.lines ?? []).join('\n'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored])

  const commit = () => {
    const next = normalizeVoice([q1, q2], lines.split('\n'))
    if (JSON.stringify(next ?? null) !== stored) onCommit(next)
  }
  const count = lines.split('\n').filter((x) => x.trim()).length

  return (
    <div className="space-y-3" data-testid={`voice-${memberId}`}>
      <p className="text-sm font-medium">{t('group.voice.title')}</p>
      <div className="space-y-1.5">
        <Label htmlFor={`quirk1-${memberId}`}>{t('group.voice.habits')}</Label>
        <Input id={`quirk1-${memberId}`} value={q1} maxLength={120} onChange={(e) => setQ1(e.target.value)} onBlur={commit} placeholder={t('group.voice.habit1Ph')} />
        <Input aria-label={t('group.voice.habits')} value={q2} maxLength={120} onChange={(e) => setQ2(e.target.value)} onBlur={commit} placeholder={t('group.voice.habit2Ph')} />
        <p className="text-xs text-muted-foreground">{t('group.voice.habitsHint')}</p>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`lines-${memberId}`}>{t('group.voice.lines')}</Label>
          <span className={`text-xs tabular-nums ${count > VOICE_MAX_LINES ? 'text-destructive' : 'text-muted-foreground'}`}>{count}/{VOICE_MAX_LINES}</span>
        </div>
        <Textarea id={`lines-${memberId}`} rows={4} value={lines} onChange={(e) => setLines(e.target.value)} onBlur={commit} placeholder={t('group.voice.linesPh')} />
        <p className="text-xs text-muted-foreground">{count > VOICE_MAX_LINES ? t('group.voice.tooMany', { n: VOICE_MAX_LINES }) : t('group.voice.linesHint')}</p>
      </div>
    </div>
  )
}
