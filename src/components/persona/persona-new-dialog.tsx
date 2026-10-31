import { useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { CaretRight, ChatsCircle, FileText, PencilSimple, UploadSimple } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PersonaQuestionnaire } from '@/components/persona/persona-questionnaire'
import { PersonaNewInterview } from '@/components/persona/persona-new-interview'
import { useT } from '@/hooks/use-t'
import { MAX_FILE_BYTES, MAX_TEXT_CHARS, parsePersonaFile, type ParsedFile } from '@/lib/persona-new'
import { applyAnswers, type PersonaAnswers } from '@/lib/profile'
import { useApp } from '@/lib/store'
import type { Persona } from '@/lib/types'
import { cn } from '@/lib/utils'

type Mode = 'choose' | 'interview' | 'file'

/** A persona that does not exist yet, for the questionnaire to read answers from (it is only made when saved). */
const BLANK: Persona = {
  id: 'new', name: '', avatar: '', title: '', description: '', pronouns: '', lorebookIds: [], isDefault: false, folderId: null,
  binding: 'default', boundCharacterIds: [], autoLock: false, createdAt: 0,
}

/** Phones get a sheet pinned to the bottom edge; desktop keeps the centred dialog. */
const SHEET = 'max-md:top-auto max-md:bottom-0 max-md:left-0 max-md:max-h-[92dvh] max-md:w-full max-md:max-w-full max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none'

function Choice({ icon, title, hint, onClick, testId }: { icon: ReactNode; title: string; hint: string; onClick: () => void; testId: string }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/60 hover:bg-accent/40" data-testid={testId}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <CaretRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  )
}

/** "New persona": three ways in. Write it yourself (a blank page), a short interview (a model proposes three
 *  drafts), or a file (its text becomes the description and a model structures it). */
export function PersonaNewDialog({ open, onOpenChange, startTag, onBlank, onCreated, onImportRecords }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** the folder the user is in, a tag a new persona starts with */
  startTag: string | null
  /** way 1: exactly what "New persona" did before */
  onBlank: () => void
  /** a persona was made: open its page */
  onCreated: (id: string) => void
  /** persona records from a file, through the existing import; returns how many were added */
  onImportRecords: (records: Record<string, unknown>[]) => number
}) {
  const t = useT()
  const addPersona = useApp((s) => s.addPersona)
  const [mode, setMode] = useState<Mode>('choose')
  const [askOpen, setAskOpen] = useState(false)
  const [parsed, setParsed] = useState<ParsedFile | null>(null)
  const [fileName, setFileName] = useState('')
  const [name, setName] = useState('')
  const [problem, setProblem] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const reset = () => { setMode('choose'); setParsed(null); setProblem(''); setName(''); setFileName('') }
  const close = () => { onOpenChange(false); reset() }
  const created = (id: string) => { close(); onCreated(id) }

  const readFile = async (file: File | undefined) => {
    if (!file) return
    setProblem(''); setParsed(null)
    if (file.size > MAX_FILE_BYTES) { setProblem(t('personas.new.fileTooBig')); return }
    let text: string
    try { text = await file.text() } catch { setProblem(t('personas.new.fileRead')); return }
    // a binary file is not a text: NUL bytes give it away
    if (text.includes('\u0000')) { setProblem(t('personas.new.fileBinary')); return }
    const p = parsePersonaFile(file.name, text)
    setFileName(file.name); setParsed(p); setName(p.name)
  }

  const fromFile = () => {
    if (!parsed) return
    if (parsed.kind === 'personas' && parsed.personas) {
      const n = onImportRecords(parsed.personas)
      toast.success(t('personas.new.imported', { n }))
      close()
      return
    }
    const id = addPersona({ name: name.trim() || parsed.name, description: parsed.text, ...(startTag ? { tags: [startTag] } : {}) })
    // the page opens on Profile and starts Structure it by itself
    useApp.setState({ pendingStructure: id })
    if (parsed.cut) toast.info(t('personas.new.cutNote', { n: MAX_TEXT_CHARS }))
    created(id)
  }

  const fromQuestionnaire = (a: PersonaAnswers) => {
    const patch = applyAnswers(BLANK, a)
    const id = addPersona({ ...patch, name: patch.name?.trim() || 'New Persona', ...(startTag ? { tags: [startTag] } : {}) })
    setAskOpen(false)
    toast.success('Persona written')
    created(id)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) close(); else onOpenChange(true) }}>
        <DialogContent className={cn(SHEET, mode === 'interview' ? 'sm:max-w-2xl' : 'sm:max-w-md', 'flex flex-col')} data-testid="persona-new-dialog">
          {mode === 'choose' && (
            <>
              <DialogHeader>
                <DialogTitle>{t('personas.new.title')}</DialogTitle>
                <DialogDescription>{t('personas.new.hint')}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Choice testId="persona-new-blank" icon={<PencilSimple className="size-5" aria-hidden="true" />} title={t('personas.new.writeMyself')} hint={t('personas.new.writeMyselfHint')} onClick={() => { close(); onBlank() }} />
                <Choice testId="persona-new-interview" icon={<ChatsCircle className="size-5" aria-hidden="true" />} title={t('personas.new.interview')} hint={t('personas.new.interviewHint')} onClick={() => setMode('interview')} />
                <Choice testId="persona-new-file" icon={<FileText className="size-5" aria-hidden="true" />} title={t('personas.new.fromFile')} hint={t('personas.new.fromFileHint')} onClick={() => setMode('file')} />
              </div>
              <div className="flex justify-end"><Button variant="ghost" className="h-11 md:h-8" onClick={close}>{t('personas.cancel')}</Button></div>
            </>
          )}

          {mode === 'interview' && (
            <PersonaNewInterview onBack={reset} onBlank={() => { close(); onBlank() }} onClose={close} onCreated={created} onQuestionnaire={() => setAskOpen(true)} startTag={startTag} />
          )}

          {mode === 'file' && (
            <>
              <DialogHeader>
                <DialogTitle>{t('personas.new.fromFile')}</DialogTitle>
                <DialogDescription>{t('personas.new.fileHint')}</DialogDescription>
              </DialogHeader>
              <input ref={fileInput} type="file" accept=".json,.txt,.md,.markdown,text/*,application/json" className="hidden" onChange={(e) => { void readFile(e.target.files?.[0]); e.target.value = '' }} data-testid="persona-new-file-input" />
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); void readFile(e.dataTransfer.files?.[0]) }}
                className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <UploadSimple className="size-5" aria-hidden="true" />
                {fileName || t('personas.new.fileDrop')}
              </button>
              {problem && <p role="alert" className="text-sm text-destructive" data-testid="persona-new-file-problem">{problem}</p>}
              {parsed && (
                <div className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm" data-testid="persona-new-file-summary">
                  {parsed.kind === 'personas' ? (
                    <p>{t('personas.new.foundPersonas', { n: parsed.personas?.length ?? 0 })}</p>
                  ) : (
                    <>
                      <Label htmlFor="persona-new-name" className="text-xs">{t('personas.new.fileName')}</Label>
                      <Input id="persona-new-name" value={name} onChange={(e) => setName(e.target.value)} className="h-10 md:h-8" />
                      <p className="text-xs text-muted-foreground">{t(parsed.kind === 'json' ? 'personas.new.asJson' : 'personas.new.asText', { n: parsed.text.length })}</p>
                      {parsed.cut && <p className="text-xs text-amber-700 dark:text-amber-400" data-testid="persona-new-cut">{t('personas.new.cutNote', { n: MAX_TEXT_CHARS })}</p>}
                    </>
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground">{t('personas.new.fileNote')}</p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" className="h-11 md:h-8" onClick={reset}>{t('personas.new.back')}</Button>
                <Button className="h-11 md:h-8" disabled={!parsed} onClick={fromFile} data-testid="persona-new-file-create">
                  {parsed?.kind === 'personas' ? t('personas.import') : t('personas.new.create')}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <PersonaQuestionnaire persona={BLANK} open={open && askOpen} onOpenChange={(o) => { if (!o) setAskOpen(false) }} onSave={fromQuestionnaire} />
    </>
  )
}
