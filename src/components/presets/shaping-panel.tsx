
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useApp } from '@/lib/store'
import { useT } from '@/hooks/use-t'
import type { Preset } from '@/lib/types'
import { PromptFormatSection } from './prompt-format-section'

/**
 * Prompt-shaping settings that sit between the prompt manager and the samplers:
 * how names are attached to turns and an optional structural pass over the
 * final message list. Every control here is wired engine-side.
 */
export function ShapingPanel({ preset }: { preset: Preset }) {
  const updatePreset = useApp((s) => s.updatePreset)
  const ro = preset.readOnly
  const t = useT()
  const up = (patch: Partial<Preset>) => updatePreset(preset.id, patch)
  const upPP = (patch: Partial<Preset['promptPostProcessing']>) =>
    updatePreset(preset.id, { promptPostProcessing: { ...preset.promptPostProcessing, ...patch } })
  const upCH = (patch: Partial<Preset['compactHistory']>) =>
    updatePreset(preset.id, { compactHistory: { ...preset.compactHistory, ...patch } })

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      {/* ── Character names behavior ── */}
      <section className="flex flex-col gap-1.5">
        <Label className="text-xs">Character names behavior</Label>
        <Select
          value={preset.namesBehavior}
          onValueChange={(v) => v && up({ namesBehavior: v as Preset['namesBehavior'] })}
          disabled={ro}
        >
          <SelectTrigger className="h-8 text-xs" aria-label="Character names behavior">
            <SelectValue>{(v) => NAMES_LABELS[v as Preset['namesBehavior']] ?? String(v)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(NAMES_LABELS) as Preset['namesBehavior'][]).map((k) => (
              <SelectItem key={k} value={k}>{NAMES_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {NAMES_HELP[preset.namesBehavior]}
        </p>
        <NamesPreview behavior={preset.namesBehavior} />
      </section>

      {/* ── Verbosity ── */}
      <section className="flex flex-col gap-1.5 border-t border-border pt-4">
        <Label className="text-xs">Verbosity</Label>
        <Select
          value={preset.verbosity}
          onValueChange={(v) => v && up({ verbosity: v as Preset['verbosity'] })}
          disabled={ro}
        >
          <SelectTrigger className="h-8 text-xs" aria-label="Verbosity">
            <SelectValue>{(v) => VERBOSITY_LABELS[v as Preset['verbosity']] ?? String(v)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(VERBOSITY_LABELS) as Preset['verbosity'][]).map((k) => (
              <SelectItem key={k} value={k}>{VERBOSITY_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Rides the request body. Models with a verbosity control act on it; others ignore it. Auto sends nothing.
        </p>
      </section>

      {/* ── Continue prefill ── */}
      <section className="flex flex-col gap-1.5 border-t border-border pt-4">
        <label className="flex items-start justify-between gap-3">
          <span className="text-sm">
            Continue prefill
            <span className="mt-0.5 block text-[11px] font-normal leading-relaxed text-muted-foreground">
              On: a continue sends the partial reply as the trailing assistant turn and nothing else, so the model resumes mid-sentence. Off: the continue nudge is appended as a new turn instead.
            </span>
          </span>
          <Switch
            checked={preset.continuePrefill}
            onCheckedChange={(v) => up({ continuePrefill: v })}
            disabled={ro}
            aria-label="Continue prefill"
          />
        </label>
      </section>

      {/* ── Compact system messages ── */}
      <section className="flex flex-col gap-1.5 border-t border-border pt-4">
        <label className="flex items-start justify-between gap-3">
          <span className="text-sm">
            Compact system messages
            <span className="mt-0.5 block text-[11px] font-normal leading-relaxed text-muted-foreground">
              Merge consecutive messages with the same role into one block. Denser prompts, less per-message overhead.
            </span>
          </span>
          <Switch
            checked={preset.squashSystemMessages}
            onCheckedChange={(v) => up({ squashSystemMessages: v })}
            disabled={ro}
            aria-label="Compact system messages"
          />
        </label>
      </section>

      {/* ── Stage directions: the role of the [[...]] instruction (Molfar.Vertep#368) ── */}
      <section className="flex flex-col gap-1.5 border-t border-border pt-4">
        <Label className="text-xs">{t('sd.role')}</Label>
        <Select
          value={preset.stageDirectionsRole}
          onValueChange={(v) => v && up({ stageDirectionsRole: v as Preset['stageDirectionsRole'] })}
          disabled={ro}
        >
          <SelectTrigger className="h-8 text-xs" aria-label={t('sd.role')}>
            <SelectValue>{(v) => (v === 'user' ? t('sd.roleUser') : t('sd.roleSystem'))}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="system">{t('sd.roleSystem')}</SelectItem>
            <SelectItem value="user">{t('sd.roleUser')}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs leading-relaxed text-muted-foreground">{t('sd.roleHint')}</p>
      </section>

      {/* ── Compact chat history ── */}
      <section className="flex flex-col gap-2 border-t border-border pt-4">
        <label className="flex items-start justify-between gap-3">
          <span className="text-sm">
            Compact chat history
            <span className="mt-0.5 block text-[11px] font-normal leading-relaxed text-muted-foreground">
              Send the whole chat as one message instead of alternating turns. Turns are labeled by the prefixes below.
            </span>
          </span>
          <Switch
            checked={preset.compactHistory.enabled}
            onCheckedChange={(enabled) => upCH({ enabled })}
            disabled={ro}
            aria-label="Compact chat history"
          />
        </label>

        {preset.compactHistory.enabled && (
          <div className="flex flex-col gap-3 rounded-md border border-border p-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Send as</Label>
              <Select
                value={preset.compactHistory.role}
                onValueChange={(v) => v && upCH({ role: v as Preset['compactHistory']['role'] })}
                disabled={ro}
              >
                <SelectTrigger className="h-8 text-xs" aria-label="Compact history role">
                  <SelectValue>{(v) => COMPACT_ROLE_LABELS[v as Preset['compactHistory']['role']] ?? String(v)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(COMPACT_ROLE_LABELS) as Preset['compactHistory']['role'][]).map((k) => (
                    <SelectItem key={k} value={k}>{COMPACT_ROLE_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {COMPACT_ROLE_HELP[preset.compactHistory.role]}
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs">Turn separator</Label>
              <Select
                value={preset.compactHistory.separator}
                onValueChange={(v) => v && upCH({ separator: v as Preset['compactHistory']['separator'] })}
                disabled={ro}
              >
                <SelectTrigger className="h-8 text-xs" aria-label="Turn separator">
                  <SelectValue>{(v) => COMPACT_SEP_LABELS[v as Preset['compactHistory']['separator']] ?? String(v)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(COMPACT_SEP_LABELS) as Preset['compactHistory']['separator'][]).map((k) => (
                    <SelectItem key={k} value={k}>{COMPACT_SEP_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {([
              ['userPrefix', 'User prefix'], ['userSuffix', 'User suffix'],
              ['charPrefix', 'Character prefix'], ['charSuffix', 'Character suffix'],
            ] as const).map(([key, label]) => (
              <div key={key} className="flex flex-col gap-1">
                <Label className="text-xs">{label}</Label>
                <Input
                  value={preset.compactHistory[key]}
                  onChange={(e) => upCH({ [key]: e.target.value })}
                  disabled={ro}
                  className="h-8 font-mono text-xs"
                  aria-label={label}
                />
              </div>
            ))}
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {'{{user}} and {{char}} expand. \\n is a newline.'}
            </p>

            <div className="flex flex-col gap-1">
              <Label className="text-xs">Stop string</Label>
              <Input
                value={preset.compactHistory.stopString}
                onChange={(e) => upCH({ stopString: e.target.value })}
                disabled={ro}
                className="h-8 font-mono text-xs"
                aria-label="Compact history stop string"
              />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Halts the model the moment it writes this. The default is the user prefix, so it stops instead of playing your turn.
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ── Prompt post-processing ── */}
      <section className="flex flex-col gap-2 border-t border-border pt-4">
        <label className="flex items-start justify-between gap-3">
          <span className="text-sm">
            Prompt post-processing
            <span className="mt-0.5 block text-[11px] font-normal leading-relaxed text-muted-foreground">
              Restructure the assembled message list right before it is sent, for endpoints that mishandle repeated roles.
            </span>
          </span>
          <Switch
            checked={preset.promptPostProcessing.enabled}
            onCheckedChange={(enabled) => upPP({ enabled })}
            disabled={ro}
            aria-label="Enable prompt post-processing"
          />
        </label>

        {preset.promptPostProcessing.enabled && (
          <div className="flex flex-col gap-3 rounded-md border border-border p-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Structure</Label>
              <Select
                value={preset.promptPostProcessing.mode}
                onValueChange={(v) => v && upPP({ mode: v as Preset['promptPostProcessing']['mode'] })}
                disabled={ro}
              >
                <SelectTrigger className="h-8 text-xs" aria-label="Post-processing structure">
                  <SelectValue>
                    {(v) => POST_MODE_LABELS[v as Preset['promptPostProcessing']['mode']] ?? String(v)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(Object.keys(POST_MODE_LABELS) as Preset['promptPostProcessing']['mode'][]).map((k) => (
                      <SelectItem key={k} value={k}>{POST_MODE_LABELS[k]}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {POST_MODE_HELP[preset.promptPostProcessing.mode]}
              </p>
            </div>

          </div>
        )}
      </section>

      <PromptFormatSection preset={preset} />
    </div>
  )
}

const COMPACT_ROLE_LABELS: Record<Preset['compactHistory']['role'], string> = {
  assistant: 'Assistant (the model continues the chat)',
  user: 'User',
  system: 'System',
}
const COMPACT_ROLE_HELP: Record<Preset['compactHistory']['role'], string> = {
  assistant: 'The chat reads as the model\'s own writing, so it picks up mid-story. Works best with the stop string on.',
  user: 'The chat reads as material the model is handed. Neutral, fits most endpoints.',
  system: 'The chat rides as instructions. Some endpoints only allow one system turn, mind the placement.',
}
const COMPACT_SEP_LABELS: Record<Preset['compactHistory']['separator'], string> = {
  double: 'Blank line',
  newline: 'Newline',
  space: 'Space',
}

const POST_MODE_HELP: Record<Preset['promptPostProcessing']['mode'], string> = {
  none: 'The message list is sent exactly as the prompt manager assembled it.',
  merge: 'Adjacent messages sharing a role merge into one. Fixes providers that reject repeated roles.',
  semi: 'Merge, and system entries after the first become user entries.',
  strict: 'Merge, mid-prompt system entries become user, and a user turn follows the system block.',
  single: 'Everything is flattened into one user message. The bluntest fallback for the strictest endpoints.',
}
const POST_MODE_LABELS: Record<string, string> = {
  none: 'None',
  merge: 'Merge all messages',
  semi: 'Semi (system + user pairs)',
  strict: 'Strict (roles preserved)',
  single: 'Single prompt',
}

/** Option labels. Key order here is the order the options are listed in. */
const NAMES_LABELS: Record<Preset['namesBehavior'], string> = {
  none: 'Never (send no names)',
  default: 'Groups and past personas',
  content: 'Always (prefix message content)',
  completion: 'Completion object (API name field)',
}

const NAMES_HELP: Record<Preset['namesBehavior'], string> = {
  none: 'No names are attached anywhere. Best for single-character chats where the model already knows who is speaking.',
  default: 'Names are prepended only where needed: group chats and messages sent as a different persona.',
  content: 'Every message body is prefixed with "Name: ". Most reliable across models, but costs tokens on every turn.',
  completion: 'Names ride in the API\'s dedicated name field instead of the text. Cleanest, but only some providers honour it.',
}


/**
 * Shows the wire format under each naming mode. Solo and group are shown
 * side by side because "default" is the one mode where they differ — that
 * difference is the entire point of the setting.
 */
const VERBOSITY_LABELS: Record<Preset['verbosity'], string> = {
  auto: 'Auto (send nothing)',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

function NamesPreview({ behavior }: { behavior: Preset['namesBehavior'] }) {
  const body = 'The door was already open when I arrived.'
  // Only "content" prefixes unconditionally; "default" prefixes in groups only.
  const prefixed = (isGroup: boolean) =>
    behavior === 'content' || (behavior === 'default' && isGroup)
      ? `Marcus: ${body}`
      : body
  const roleTag = behavior === 'completion' ? 'assistant · name: "Marcus"' : 'assistant'

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/40 p-2">
      {([['Solo chat', false], ['Group chat', true]] as const).map(([label, isGroup]) => (
        <div key={label} className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-[10px] text-muted-foreground">{label}</span>
          <Badge variant="outline" className="shrink-0 text-[10px]">{roleTag}</Badge>
          <code className="truncate font-mono text-[11px] text-muted-foreground">
            {prefixed(isGroup)}
          </code>
        </div>
      ))}
    </div>
  )
}
