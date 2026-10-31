import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { CaretLeft, CircleNotch, Image as ImageIcon, MagicWand, X } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useT } from '@/hooks/use-t'
import { useApp } from '@/lib/store'
import { DETAIL_LEVELS, composeBrief, fieldsFor, type DetailLevel, type IdeaDraft, type IdeaQuestion } from '@/lib/persona-new'
import { fetchIdeas, fillPersona, structurePersona, waitForPersona, type Picture } from '@/lib/persona-new-api'
import { cn } from '@/lib/utils'

const IDEA_MAX = 1500
const WISH_MAX = 300
const PICTURE_MAX = 10 * 1024 * 1024
const PICTURE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const EXAMPLES = ['personas.new.example1', 'personas.new.example2', 'personas.new.example3', 'personas.new.example4'] as const

const detailKey = (d: DetailLevel) => `personas.new.detail.${d}` as Parameters<ReturnType<typeof useT>>[0]

/** "Short interview": the idea (step 1), then three drafts to pick from, two quick questions and how detailed (step 2).
 *  Create makes the persona from the brief, then asks the model to structure it (and, for more detail, to fill the
 *  empty looks, personality and goals) as ONE proposal that waits on the persona's page for the user to accept. */
export function PersonaNewInterview({ onBack, onBlank, onClose, onCreated, onQuestionnaire, startTag }: {
  onBack: () => void
  /** "Write it myself", offered when the model cannot be used */
  onBlank: () => void
  onClose: () => void
  /** the persona exists; open its page */
  onCreated: (id: string) => void
  /** "or answer five plain questions": the questionnaire path */
  onQuestionnaire: () => void
  /** the folder the user is in: a new persona starts in it */
  startTag: string | null
}) {
  const t = useT()
  const addPersona = useApp((s) => s.addPersona)
  const addTag = useApp((s) => s.addTag)
  const [step, setStep] = useState<1 | 2>(1)
  const [idea, setIdea] = useState('')
  const [picture, setPicture] = useState<(Picture & { url: string }) | null>(null)
  const [drafts, setDrafts] = useState<IdeaDraft[]>([])
  const [questions, setQuestions] = useState<IdeaQuestion[]>([])
  const [at, setAt] = useState(0)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [wish, setWish] = useState('')
  const [detail, setDetail] = useState<DetailLevel>('full')
  const [loading, setLoading] = useState(false)
  const [problem, setProblem] = useState<{ text: string; noModel: boolean } | null>(null)
  const [writing, setWriting] = useState<1 | 2 | null>(null)
  const abort = useRef<AbortController | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const pickPicture = (file: File | undefined) => {
    if (!file) return
    if (!PICTURE_TYPES.includes(file.type)) { toast.error(t('personas.new.pictureType')); return }
    if (file.size > PICTURE_MAX) { toast.error(t('personas.new.pictureSize')); return }
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result ?? '')
      setPicture({ url, data: url.slice(url.indexOf(',') + 1), mimeType: file.type })
    }
    reader.onerror = () => toast.error(t('personas.new.pictureRead'))
    reader.readAsDataURL(file)
  }

  const showDrafts = async () => {
    setProblem(null)
    setLoading(true)
    const ac = new AbortController()
    abort.current = ac
    try {
      const r = await fetchIdeas({ ...(idea.trim() ? { idea: idea.trim() } : {}), ...(picture ? { image: { data: picture.data, mimeType: picture.mimeType } } : {}), ...(wish.trim() ? { wish: wish.trim() } : {}) }, ac.signal)
      if (!r.ok) { setProblem({ text: r.error, noModel: r.code === 'no-model' }); return }
      setDrafts(r.drafts); setQuestions(r.questions); setAt(0); setAnswers({}); setStep(2)
    } catch { /* cancelled */ } finally {
      setLoading(false)
    }
  }

  const create = async () => {
    const d = drafts[at]
    if (!d) return
    const brief = composeBrief(d, questions.flatMap((q, i) => { const a = answers[i]; return a ? [{ q: q.q, a }] : [] }), wish)
    // the angle becomes the persona's tag (one persona-scope tag; new ones join the registry)
    const tags = [d.angle, ...(startTag && startTag !== d.angle ? [startTag] : [])]
    for (const name of tags) if (!useApp.getState().tags.some((x) => x.scope === 'persona' && x.name === name)) addTag(name, 'persona')
    const id = addPersona({ name: d.name, ...(d.pronouns ? { pronouns: d.pronouns } : {}), tags, description: brief })
    const ac = new AbortController()
    abort.current = ac
    setWriting(1)
    try {
      await waitForPersona(id)
      const s = await structurePersona(id, ac.signal)
      if (!s.ok) { toast.error(t('personas.new.failed', { error: s.error })); return }
      const fields = fieldsFor(detail, s.draft.profile)
      if (Object.keys(fields).length) {
        setWriting(2)
        const f = await fillPersona(id, fields, ac.signal)
        if (!f.ok) toast.error(t('personas.new.fillFailed', { error: f.error }))
      }
      toast.success(t('personas.new.ready'))
    } catch { /* cancelled: the persona stays */ } finally {
      setWriting(null)
      onCreated(id)
    }
  }

  const draft = drafts[at]
  return (
    <>
      <DialogHeader>
        <DialogTitle>{step === 1 ? t('personas.new.step1Title') : t('personas.new.step2Title')}</DialogTitle>
        <DialogDescription>{step === 1 ? t('personas.new.step1Hint') : t('personas.new.step2Hint')}</DialogDescription>
      </DialogHeader>

      {step === 1 ? (
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <Textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value.slice(0, IDEA_MAX))}
            rows={5}
            placeholder={t('personas.new.ideaPlaceholder')}
            aria-label={t('personas.new.ideaLabel')}
            className="text-base md:text-sm"
            data-testid="persona-new-idea"
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium">{t('personas.new.pictureTitle')}</span>
            <input ref={fileInput} type="file" accept={PICTURE_TYPES.join(',')} className="hidden" onChange={(e) => { pickPicture(e.target.files?.[0]); e.target.value = '' }} />
            {picture ? (
              <div className="flex items-center gap-3 rounded-lg border border-border p-2">
                <img src={picture.url} alt="" className="size-14 shrink-0 rounded-md object-cover" />
                <span className="min-w-0 flex-1 text-xs text-muted-foreground">{t('personas.new.pictureOn')}</span>
                <Button variant="ghost" className="size-11 p-0 md:size-8" onClick={() => setPicture(null)} aria-label={t('personas.new.pictureRemove')}><X className="size-4" aria-hidden="true" /></Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); pickPicture(e.dataTransfer.files?.[0]) }}
                className="flex min-h-14 items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
                data-testid="persona-new-picture"
              >
                <ImageIcon className="size-4" aria-hidden="true" />{t('personas.new.pictureDrop')}
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium">{t('personas.new.examplesTitle')}</span>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((k) => (
                <button key={k} type="button" onClick={() => setIdea(t(k))} className="min-h-9 rounded-full border border-border px-3 py-1 text-left text-xs text-muted-foreground transition-colors hover:text-foreground max-md:min-h-11">{t(k)}</button>
              ))}
            </div>
          </div>
          <button type="button" onClick={onQuestionnaire} className="w-fit text-left text-sm text-sky-700 underline max-md:min-h-11 dark:text-sky-300" data-testid="persona-new-questions">{t('personas.new.questionsLink')}</button>
          {problem && (
            <div role="alert" className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm" data-testid="persona-new-problem">
              <p>{problem.noModel ? t('personas.new.noModel') : t('personas.new.failed', { error: problem.text })}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="h-11 md:h-8" onClick={onQuestionnaire}>{t('personas.new.questionsShort')}</Button>
                <Button variant="outline" className="h-11 md:h-8" onClick={onBlank} data-testid="persona-new-problem-blank">{t('personas.new.writeMyself')}</Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-2">
              <div role="tablist" aria-label={t('personas.new.draftsAria')} className="flex gap-1.5 overflow-x-auto">
                {drafts.map((d, i) => (
                  <button
                    key={`${d.angle}|${d.name}`}
                    type="button"
                    role="tab"
                    aria-selected={i === at}
                    onClick={() => setAt(i)}
                    className={cn('flex min-h-11 min-w-0 flex-1 flex-col items-start rounded-lg border px-2.5 py-1 text-left', i === at ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground hover:text-foreground')}
                    data-testid="persona-new-draft-tab"
                  >
                    <span className="max-w-full truncate text-[10px] uppercase tracking-wider">{d.angle}</span>
                    <span className="max-w-full truncate text-sm font-semibold text-foreground">{d.name}</span>
                  </button>
                ))}
              </div>
              {draft && (
                <div role="tabpanel" className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3" data-testid="persona-new-draft">
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{draft.angle}</span>
                  <h3 className="text-lg font-bold">{draft.name}{draft.pronouns && <span className="ml-2 text-xs font-normal text-muted-foreground">{draft.pronouns}</span>}</h3>
                  <p className="text-sm">{draft.summary}</p>
                  {draft.traits.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">{draft.traits.map((tr) => <span key={tr} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{tr}</span>)}</div>
                  )}
                  {draft.detail && <p className="text-xs text-muted-foreground">{draft.detail}</p>}
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-3">
              {questions.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h4 className="text-sm font-semibold">{t('personas.new.questionsTitle')}</h4>
                  {questions.map((q, qi) => (
                    <div key={q.q} role="radiogroup" aria-label={q.q} className="flex flex-col gap-1.5">
                      <span className="text-xs">{q.q}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {q.options.map((o) => (
                          <button
                            key={o}
                            type="button"
                            role="radio"
                            aria-checked={answers[qi] === o}
                            onClick={() => setAnswers((a) => ({ ...a, [qi]: a[qi] === o ? '' : o }))}
                            className={cn('min-h-9 rounded-full border px-3 py-1 text-xs max-md:min-h-11', answers[qi] === o ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}
                          >{o}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <h4 className="text-sm font-semibold">{t('personas.new.wishTitle')}</h4>
                <Textarea value={wish} onChange={(e) => setWish(e.target.value.slice(0, WISH_MAX))} rows={2} placeholder={t('personas.new.wishPlaceholder')} aria-label={t('personas.new.wishTitle')} className="text-base md:text-sm" />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <h4 className="text-sm font-semibold">{t('personas.new.detailTitle')}</h4>
            <div role="radiogroup" aria-label={t('personas.new.detailTitle')} className="grid grid-cols-3 gap-1.5">
              {DETAIL_LEVELS.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={detail === d}
                  onClick={() => setDetail(d)}
                  className={cn('flex min-h-14 flex-col items-start justify-center rounded-lg border px-2.5 py-1.5 text-left', detail === d ? 'border-primary bg-primary/10' : 'border-border text-muted-foreground hover:text-foreground')}
                  data-testid={`persona-new-detail-${d}`}
                >
                  <span className="text-sm font-semibold text-foreground">{t(detailKey(d))}</span>
                  <span className="text-[11px]">{t(`${detailKey(d)}Hint` as Parameters<typeof t>[0])}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {writing && (
        <p role="status" className="flex items-center gap-2 text-sm" data-testid="persona-new-writing">
          <CircleNotch className="size-4 animate-spin" aria-hidden="true" />{t('personas.new.writing', { step: writing })}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {step === 1 && <span className="mr-auto text-xs text-muted-foreground max-md:basis-full">{t('personas.new.step1Foot')}</span>}
        {step === 2 && <span className="mr-auto text-xs text-muted-foreground max-md:basis-full">{t('personas.new.step2Foot')}</span>}
        <Button variant="ghost" className="h-11 md:h-8" onClick={() => { abort.current?.abort(); if (step === 2) setStep(1); else onBack() }} disabled={!!writing}>
          <CaretLeft className="size-4" aria-hidden="true" />{t('personas.new.back')}
        </Button>
        {writing ? (
          <Button variant="outline" className="h-11 md:h-8" onClick={() => abort.current?.abort()} data-testid="persona-new-stop">{t('personas.new.stopWaiting')}</Button>
        ) : (
          <>
            <Button variant="ghost" className="h-11 md:h-8" onClick={() => { abort.current?.abort(); onClose() }}>{t('personas.cancel')}</Button>
            {step === 1 ? (
              <Button className="h-11 md:h-8" disabled={loading || (!idea.trim() && !picture)} onClick={() => void showDrafts()} data-testid="persona-new-show-drafts">
                {loading ? <CircleNotch className="size-4 animate-spin" aria-hidden="true" /> : <MagicWand className="size-4" aria-hidden="true" />}
                {loading ? t('personas.new.thinking') : t('personas.new.showDrafts')}
              </Button>
            ) : (
              <Button className="h-11 md:h-8" disabled={!draft} onClick={() => void create()} data-testid="persona-new-create">{t('personas.new.create')}</Button>
            )}
          </>
        )}
      </div>
    </>
  )
}
