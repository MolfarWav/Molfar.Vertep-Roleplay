import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { UploadSimple } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { useT } from '@/hooks/use-t'
import { j, setChatPromptBoard, getChatPromptBoard } from '@/lib/engine'
import { beginImport } from '@/lib/import-progress'
import { fetchLitConfig } from '@/components/library/litopys-api'
import { LOG_MAX_CHARS, parseChatLog, sceneCalls, toChatLines } from '@/lib/chat-log-text'
import { useApp } from '@/lib/store'

/**
 * Import a chat kept as plain text (Molfar.Vertep#291): paste it or pick a file, see what was found (how many messages, who
 * speaks), say which speaker is you, and see what the memory costs before anything starts. The log becomes an ordinary chat of the
 * character (the importer the JSONL files use); Litopys then writes its chapters by itself, one model call per scene, unless the
 * box is cleared (the chat's Litopys switch is then off until it is turned on in the Prompt board).
 */
export function ChatLogImportDialog({
  open,
  onOpenChange,
  characterName,
  initial,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  characterName: string
  /** a text and its file name, when a file was chosen elsewhere (the "Import chat" button saw a log, not JSONL) */
  initial?: { text: string; name: string } | null
}) {
  const t = useT()
  const hydrate = useApp((s) => s.hydrate)
  const persona = useApp((s) => s.personas.find((p) => p.isDefault))
  const fileRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [me, setMe] = useState('')
  const [memory, setMemory] = useState(true)
  const [maxScene, setMaxScene] = useState(40)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setText(initial?.text ?? '')
    setTitle(initial?.name ? initial.name.replace(/\.[^.]+$/, '') : '')
    setMemory(true)
    setBusy(false)
  }, [open, initial])
  // the size of a scene comes from the Litopys settings; the default if the plugin does not answer
  useEffect(() => {
    if (!open) return
    fetchLitConfig().then((c) => setMaxScene(c.scene?.maxMessages ?? 40)).catch(() => undefined)
  }, [open])

  const parsed = useMemo(() => parseChatLog(text), [text])
  const tooBig = text.length > LOG_MAX_CHARS
  // who is you: the persona's name when the log has it, else the first speaker
  useEffect(() => {
    if (!parsed.speakers.length) return setMe('')
    if (parsed.speakers.some((s) => s.name === me)) return
    const byPersona = persona ? parsed.speakers.find((s) => s.name.toLowerCase() === persona.name.toLowerCase()) : undefined
    setMe((byPersona ?? parsed.speakers[0]!).name)
  }, [parsed, persona, me])

  const calls = sceneCalls(parsed.messages.length, maxScene)
  const ready = parsed.messages.length > 0 && !!me && !tooBig

  const pickFile = async (files: FileList | null) => {
    const f = files?.[0]
    if (!f) return
    setText(await f.text())
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''))
  }

  const go = async () => {
    if (!ready || busy) return
    setBusy(true)
    const run = beginImport(t('chatlog.job'), 1)
    run.start(title || t('chatlog.untitled'))
    try {
      run.step(t('imp.step.saving'), 0.4)
      const lines = toChatLines(parsed.messages, me)
      const r = await j<{ chats: string[] }>('/import/batch', {
        method: 'POST',
        body: JSON.stringify({ chats: [{ character: characterName, file: title.trim() || 'chat log', lines }] }),
      })
      const id = r.chats?.[0]
      // the box cleared: the worker stays away from this chat until its Litopys switch is turned on
      if (id && !memory) {
        const board = (await getChatPromptBoard(id).catch(() => null)) ?? { v: 1 as const }
        await setChatPromptBoard(id, { ...board, off: [...new Set([...(board.off ?? []), 'plugin:litopys'])] })
      }
      await hydrate()
      run.finish(true)
      toast.success(memory && calls > 0 ? t('chatlog.doneMemory', { n: parsed.messages.length, calls }) : t('chatlog.done', { n: parsed.messages.length }))
      onOpenChange(false)
    } catch (e) {
      run.finish(false, String((e as Error)?.message ?? e))
      toast.error(String((e as Error)?.message ?? e))
      setBusy(false)
    } finally {
      run.end()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-3 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">{t('chatlog.title')}</DialogTitle>
          <DialogDescription>{t('chatlog.intro', { name: characterName })}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="chatlog-text" className="text-sm font-medium">{t('chatlog.paste')}</label>
            <input ref={fileRef} type="file" accept=".txt,.md,.log,text/plain" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { void pickFile(e.target.files); e.target.value = '' }} />
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()}>
              <UploadSimple className="size-4" /> {t('chatlog.pickFile')}
            </Button>
          </div>
          <Textarea id="chatlog-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('chatlog.placeholder')} className="max-h-56 min-h-32 font-mono text-xs" spellCheck={false} />
          {!text.trim() && <p className="text-xs text-muted-foreground">{t('chatlog.shape')}</p>}
          {tooBig && <p className="text-xs text-destructive">{t('chatlog.tooBig')}</p>}
          {text.trim() && !tooBig && !parsed.messages.length && <p className="text-xs text-destructive" role="alert">{t('chatlog.noShape')}</p>}
        </div>

        {parsed.messages.length > 0 && (
          <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
            <p className="text-sm" aria-live="polite">
              {t('chatlog.found', { n: parsed.messages.length, speakers: parsed.speakers.length })}
              <span className="text-muted-foreground"> {parsed.speakers.slice(0, 6).map((s) => `${s.name} (${s.count})`).join(', ')}{parsed.speakers.length > 6 ? '…' : ''}</span>
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="chatlog-me" className="text-sm font-medium">{t('chatlog.me')}</label>
                <select id="chatlog-me" value={me} onChange={(e) => setMe(e.target.value)} className="min-h-10 rounded-md border border-border bg-background px-2 py-1.5 text-sm md:min-h-8">
                  {parsed.speakers.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="chatlog-title" className="text-sm font-medium">{t('chatlog.chatTitle')}</label>
                <Input id="chatlog-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('chatlog.untitled')} />
              </div>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={memory} onCheckedChange={(v) => setMemory(v === true)} className="mt-0.5" aria-describedby="chatlog-cost" />
              <span>
                {t('chatlog.memory')}
                <span id="chatlog-cost" className="block text-xs text-muted-foreground">
                  {memory
                    ? calls > 0 ? t('chatlog.cost', { calls, size: maxScene }) : t('chatlog.costNone')
                    : t('chatlog.costOff')}
                </span>
              </span>
            </label>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t('chatlog.cancel')}</Button>
          <Button type="button" disabled={!ready || busy} onClick={() => void go()}>{t('chatlog.import')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
