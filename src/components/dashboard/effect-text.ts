// Plain-words text for the items POST /dashboard/soul/effects returns.

import type { Lang, MsgKey, Vars } from '@/lib/i18n'
import { SPECTRA } from '@/lib/soul'

export type Translate = (key: MsgKey, vars?: Vars) => string

/** One item of `effects`. Shapes follow docs/SOUL.md; every field is read defensively. */
export interface Effect {
  kind: string
  trait?: string
  value?: number
  stats?: string[] | string
  cap?: number
  stat?: string
  spectrum?: string
  inverted?: boolean
  x?: number
  normal?: number
  traitValue?: number
  cue?: string
  event?: string
  known?: boolean
}

export const mk = (key: string): MsgKey => key as MsgKey

/** A number in the locale's decimal sign (uk: comma). */
export function fmtNum(n: unknown, lang: Lang): string {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : Number(n)
  if (!Number.isFinite(v)) return String(n ?? '')
  const s = String(Math.round(v * 100) / 100)
  return lang === 'uk' ? s.replace('.', ',') : s
}

export const statLabel = (t: Translate, id: string): string => {
  const key = mk(`soul.stat.${id}`)
  const s = t(key)
  return s || id
}

export const traitLabel = (t: Translate, id: string): string => {
  const key = mk(`soul.trait.${id}`)
  const s = t(key)
  return s || id
}

/** "Left ↔ Right" in the current language. */
export function spectrumLabel(t: Translate, id: string): string {
  const row = SPECTRA.find((s) => s[0] === id)
  if (!row) return id
  return `${t(mk(`soul.spec.${row[1]}`))} ↔ ${t(mk(`soul.spec.${row[2]}`))}`
}

/** [short tag, sentence] for one effect. */
export function effectText(e: Effect, t: Translate, lang: Lang): { tag: string; text: string } {
  const n = (v: unknown) => fmtNum(v, lang)
  switch (e.kind) {
    case 'hostile':
      return { tag: t('soul.tag.hostile'), text: t('soul.eff.hostile') }
    case 'brake': {
      const stats = (Array.isArray(e.stats) ? e.stats : e.stats ? [e.stats] : []).map((s) => statLabel(t, s)).join(', ')
      return {
        tag: t('soul.tag.brake'),
        text: t('soul.eff.brake', { trait: traitLabel(t, e.trait ?? ''), value: n(e.value), stats, cap: n(e.cap) }),
      }
    }
    case 'gain': {
      const faster = typeof e.x === 'number' ? e.x > 1 : true
      return {
        tag: `×${n(e.x)}`,
        text: t(faster ? 'soul.eff.gainFaster' : 'soul.eff.gainSlower', {
          spectrum: spectrumLabel(t, e.spectrum ?? ''), value: n(e.value), stat: statLabel(t, e.stat ?? ''), x: n(e.x),
        }),
      }
    }
    case 'harm':
      return {
        tag: `×${n(e.x)}`,
        text: t('soul.eff.harm', { spectrum: spectrumLabel(t, e.spectrum ?? ''), value: n(e.value), x: n(e.x) }),
      }
    case 'base': {
      const stat = statLabel(t, e.stat ?? '')
      return {
        tag: t('soul.tag.base'),
        text: e.trait
          ? t('soul.eff.base', { trait: traitLabel(t, e.trait), traitValue: n(e.traitValue), stat, value: n(e.value), normal: n(e.normal) })
          : t('soul.eff.baseNoTrait', { stat, value: n(e.value), normal: n(e.normal) }),
      }
    }
    case 'trigger':
    case 'value': {
      const base = t('soul.eff.rule', { cue: e.cue ?? '', event: e.event ?? '', stat: statLabel(t, e.stat ?? ''), x: n(e.x) })
      return {
        tag: `×${n(e.x)}`,
        text: e.known === false ? `${base} (${t('soul.eventUnknown')})` : base,
      }
    }
    default:
      return { tag: '', text: JSON.stringify(e) }
  }
}
