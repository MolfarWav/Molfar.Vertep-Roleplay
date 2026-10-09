
import { useState } from 'react'
import { Translate, CircleNotch } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useApp } from '@/lib/store'
import { j } from '@/lib/engine'
import type { AppSettings } from '@/lib/types'
// the engine plugin's language-code table: a name without a code 400s on the http providers
import { TRANSLATE_LANGUAGES as LANGUAGES } from '@/lib/card-translate'

const PROVIDERS: { id: AppSettings['translation']['provider']; label: string; note: string }[] = [
  { id: 'llm', label: 'LLM (engine model)', note: 'Any model the engine serves. Works offline with a local model. Accepts any language name.' },
  { id: 'google', label: 'Google', note: 'Keyless web endpoint, no account needed.' },
  { id: 'lingva', label: 'Lingva', note: 'Keyless Google front-end (lingva.ml).' },
  { id: 'deepl', label: 'DeepL', note: 'Needs a free or pro API key below (append “:pro” for pro).' },
]
const AUTO_LABELS: Record<AppSettings['translation']['autoMode'], string> = {
  none: 'None (manual only)',
  responses: 'Translate responses',
  inputs: 'Translate inputs',
  both: 'Translate both',
}


export function TranslationTab() {
  const translation = useApp((s) => s.settings.translation)
  const updateSettings = useApp((s) => s.updateSettings)
  const up = (patch: Partial<typeof translation>) => updateSettings({ translation: { ...translation, ...patch } })
  const [testing, setTesting] = useState(false)
  const [testOut, setTestOut] = useState('')
  const [chatBusy, setChatBusy] = useState(false)

  const runTest = async () => {
    setTesting(true)
    setTestOut('')
    try {
      const r = await j<{ text: string }>('/translate', {
        method: 'POST',
        body: JSON.stringify({
          text: 'The rain kept falling, soft as a whisper.',
          target: translation.targetLanguage,
          provider: translation.provider,
          deeplKey: translation.deeplKey,
        }),
      })
      setTestOut(r.text)
    } catch (e) {
      toast.error('Translation failed', { description: (e as Error).message })
    } finally {
      setTesting(false)
    }
  }

  // whole-chat pass over the active chat, exactly like the per-message action
  // (same route, same provider) — sequential so one provider isn't hammered
  const translateChat = async () => {
    const s = useApp.getState()
    const chat = s.chats.find((c) => c.id === s.activeChatId)
    if (!chat) { toast.error('Open a chat first'); return }
    const todo = chat.messages.filter((m) => !m.hidden && !m.translation && (m.swipes[m.activeSwipe]?.content ?? '').trim())
    if (!todo.length) { toast.info('Nothing to translate', { description: 'Every visible message already has a translation.' }); return }
    setChatBusy(true)
    const tid = toast.loading(`Translating ${todo.length} message${todo.length > 1 ? 's' : ''}…`)
    let done = 0
    let failed = 0
    try {
      for (const m of todo) {
        try {
          const r = await j<{ text: string }>('/translate', {
            method: 'POST',
            body: JSON.stringify({
              text: m.swipes[m.activeSwipe]?.content ?? '',
              target: translation.targetLanguage,
              provider: translation.provider,
              deeplKey: translation.deeplKey,
            }),
          })
          useApp.getState().setMessageTranslation(chat.id, m.id, r.text)
          done++
        } catch { failed++ }
      }
    } finally {
      setChatBusy(false)
      toast.dismiss(tid)
      if (failed) toast.warning(`Translated ${done}, ${failed} failed`)
      else toast.success(`Translated ${done} message${done > 1 ? 's' : ''}`)
    }
  }

  const clearChat = async () => {
    const s = useApp.getState()
    const chat = s.chats.find((c) => c.id === s.activeChatId)
    if (!chat) { toast.error('Open a chat first'); return }
    const todo = chat.messages.filter((m) => m.translation)
    if (!todo.length) { toast.info('No translations to clear'); return }
    for (const m of todo) useApp.getState().setMessageTranslation(chat.id, m.id, null)
    toast.success(`Cleared ${todo.length} translation${todo.length > 1 ? 's' : ''}`)
  }

  const active = PROVIDERS.find((p) => p.id === translation.provider)

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Translate className="size-4 shrink-0" aria-hidden="true" />
        Inline chat translation. The engine plugin proxies each provider, exactly like the
        message-menu Translate action and auto-translate below.
      </p>
      <FieldGroup>
        <Field>
          <FieldLabel>Provider</FieldLabel>
          <Select value={translation.provider || 'llm'} onValueChange={(v) => v && up({ provider: v as AppSettings['translation']['provider'] })}>
            <SelectTrigger>
              <SelectValue>{(v) => PROVIDERS.find((p) => p.id === v)?.label ?? String(v)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {PROVIDERS.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
          {active && <p className="text-[11px] leading-relaxed text-muted-foreground">{active.note}</p>}
        </Field>
        {translation.provider === 'deepl' && (
          <Field>
            <FieldLabel>DeepL API key</FieldLabel>
            <Input
              type="password"
              value={translation.deeplKey ?? ''}
              onChange={(e) => up({ deeplKey: e.target.value })}
              placeholder="xxxxxxxx-xxxx-…:fx  (append :pro for a pro key)"
              className="font-mono text-xs"
              aria-label="DeepL API key"
            />
          </Field>
        )}
        <Field>
          <FieldLabel>Target language</FieldLabel>
          <Select value={translation.targetLanguage || 'English'} onValueChange={(v) => v && up({ targetLanguage: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
          <p className="text-[11px] leading-relaxed text-muted-foreground">What responses are translated into (shown under the original).</p>
        </Field>
        <Field>
          <FieldLabel>Model language</FieldLabel>
          <Select value={translation.internalLanguage || 'English'} onValueChange={(v) => v && up({ internalLanguage: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectGroup>
            </SelectContent>
          </Select>
          <p className="text-[11px] leading-relaxed text-muted-foreground">With “Translate inputs”, your turns are translated into this before the model sees them; the bubble keeps what you typed under the sent text.</p>
        </Field>
        <Field>
          <FieldLabel>Auto-translate</FieldLabel>
          <Select value={translation.autoMode} onValueChange={(v) => v && up({ autoMode: v as typeof translation.autoMode })}>
            <SelectTrigger>
              <SelectValue>{(v) => AUTO_LABELS[v as typeof translation.autoMode] ?? String(v)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="none">None (manual only)</SelectItem>
                <SelectItem value="responses">Translate responses</SelectItem>
                <SelectItem value="inputs">Translate inputs</SelectItem>
                <SelectItem value="both">Translate both</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Test</p>
              <p className="text-xs text-muted-foreground">Runs a fixed line through the selected provider.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void runTest()} disabled={testing}>
              {testing ? <CircleNotch className="size-3.5 animate-spin" /> : <Translate className="size-3.5" />}
              Translate
            </Button>
          </div>
          {testOut && <p className="rounded-md bg-muted/50 p-2 text-sm">{testOut}</p>}
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Active chat</p>
              <p className="text-xs text-muted-foreground">Translate every visible message, or clear existing translations.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void translateChat()} disabled={chatBusy}>
                {chatBusy ? <CircleNotch className="size-3.5 animate-spin" /> : <Translate className="size-3.5" />}
                Translate chat
              </Button>
              <Button variant="outline" size="sm" onClick={() => void clearChat()} disabled={chatBusy}>
                Clear
              </Button>
            </div>
          </div>
        </div>
      </FieldGroup>
    </div>
  )
}
