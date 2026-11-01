// The look of a tinted icon button in the chat header (docs/UI-CATALOG.md section 6): the tone's soft fill and border,
// the icon in the tone's ink, 36 px. The icon says what it is, so the colour is never the only cue.
import { TONES, type ToneName } from '@/components/ui/tone'

export function headerTint(tone: ToneName): string {
  const k = TONES[tone]
  return `size-9 rounded-[10px] border ${k.fill} ${k.ink} hover:brightness-110`
}
