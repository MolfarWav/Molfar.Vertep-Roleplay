import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useT } from '@/hooks/use-t'
import type { Lorebook } from '@/lib/types'

type Settings = Lorebook['settings']
type NumKey = 'scanDepth' | 'maxRecursion' | 'minActivations' | 'minActivationsDepthMax' | 'contextPercent' | 'budgetCap'
type BoolKey = 'includeNames' | 'caseSensitive' | 'wholeWords' | 'recursiveScan' | 'overflowAlert' | 'groupScoring'

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 @[34rem]:grid-cols-2">{children}</div>
    </section>
  )
}

function NumberRow({ id, label, hint, value, onChange }: { id: string; label: string; hint: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-xs">{label}</Label>
        <Input
          id={id}
          type="number"
          min={0}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          className="h-7 w-20 text-xs"
        />
      </div>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  )
}

function SwitchRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center justify-between gap-2 text-xs font-medium">
        {label}
        <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
      </label>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  )
}

/** The book's scan, budget, order and group settings, grouped, each with a
 *  one-line hint under the control. */
export function BookSettings({ book, onUpdate }: { book: Lorebook; onUpdate: (p: Partial<Lorebook>) => void }) {
  const t = useT()
  const s = book.settings
  const set = (patch: Partial<Settings>) => onUpdate({ settings: { ...s, ...patch } })
  const num = (key: NumKey, label: string, hint: string) => (
    <NumberRow key={key} id={`bs-${book.id}-${key}`} label={label} hint={hint} value={s[key] ?? 0} onChange={(v) => set({ [key]: v })} />
  )
  const sw = (key: BoolKey, label: string, hint: string) => (
    <SwitchRow key={key} label={label} hint={hint} checked={s[key]} onChange={(v) => set({ [key]: v })} />
  )
  return (
    <div className="flex flex-col gap-5 border-b border-border px-4 py-4" data-testid="book-settings">
      <Group title={t('lore.set.scanning')}>
        {num('scanDepth', t('lore.set.scanDepth'), t('lore.set.scanDepthHint'))}
        {sw('includeNames', t('lore.set.includeNames'), t('lore.set.includeNamesHint'))}
        {sw('caseSensitive', t('lore.set.caseSensitive'), t('lore.set.caseSensitiveHint'))}
        {sw('wholeWords', t('lore.set.wholeWords'), t('lore.set.wholeWordsHint'))}
        <SwitchRow
          label={t('lore.set.wordForms')}
          hint={t('lore.set.wordFormsHint')}
          checked={s.wordForms !== false}
          onChange={(v) => set({ wordForms: v })}
        />
        {sw('recursiveScan', t('lore.set.recursive'), t('lore.set.recursiveHint'))}
        {num('maxRecursion', t('lore.set.maxRecursion'), t('lore.set.maxRecursionHint'))}
        {num('minActivations', t('lore.set.minActivations'), t('lore.set.minActivationsHint'))}
        {(s.minActivations ?? 0) > 0 && num('minActivationsDepthMax', t('lore.set.minActivationsDepth'), t('lore.set.minActivationsDepthHint'))}
      </Group>

      <Group title={t('lore.set.budget')}>
        {num('contextPercent', t('lore.set.contextPercent'), t('lore.set.contextPercentHint'))}
        {num('budgetCap', t('lore.set.budgetCap'), t('lore.set.budgetCapHint'))}
        {sw('overflowAlert', t('lore.set.overflowAlert'), t('lore.set.overflowAlertHint'))}
      </Group>

      <Group title={t('lore.set.order')}>
        <div className="flex flex-col gap-1.5 @[34rem]:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs">{t('lore.set.strategy')}</Label>
            <Select value={s.insertionStrategy} onValueChange={(v) => v && set({ insertionStrategy: v as Settings['insertionStrategy'] })}>
              <SelectTrigger className="h-7 w-44 text-xs" aria-label={t('lore.set.strategy')}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="character_first">{t('lore.set.strategyChar')}</SelectItem>
                <SelectItem value="global_first">{t('lore.set.strategyGlobal')}</SelectItem>
                <SelectItem value="evenly">{t('lore.set.strategyEvenly')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ul className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">
            <li><span className="font-medium text-foreground">{t('lore.set.strategyChar')}</span>: {t('lore.set.strategyCharHint')}</li>
            <li><span className="font-medium text-foreground">{t('lore.set.strategyGlobal')}</span>: {t('lore.set.strategyGlobalHint')}</li>
            <li><span className="font-medium text-foreground">{t('lore.set.strategyEvenly')}</span>: {t('lore.set.strategyEvenlyHint')}</li>
          </ul>
        </div>
      </Group>

      <Group title={t('lore.set.groups')}>
        {sw('groupScoring', t('lore.set.groupScoring'), t('lore.set.groupScoringHint'))}
      </Group>

      {/* World-info format template, per book: the wrapper every activated
          entry is injected inside. {{original}} stands for the entry text;
          a blank template injects the entries verbatim. */}
      <section className="flex flex-col gap-1.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('lore.set.format')}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id={`wi-format-${book.id}`}
            value={book.formatTemplate}
            onChange={(e) => onUpdate({ formatTemplate: e.target.value })}
            placeholder="Blank (inject entries as-is)"
            aria-label={t('lore.set.format')}
            className="h-7 min-w-0 flex-1 font-mono text-[11px]"
          />
          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => onUpdate({ formatTemplate: '[Relevant lore: {{original}}]' })}>
            Use default
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Wraps every activated entry from this book. Use <code className="font-mono">{'{{original}}'}</code> for the entry text.
          {!book.formatTemplate.includes('{{original}}') && book.formatTemplate.trim() !== '' && (
            <span className="text-destructive"> Template has no {'{{original}}'}: entry text would be dropped.</span>
          )}
        </p>
        <code className="truncate rounded bg-muted/60 px-2 py-1 font-mono text-[11px] text-muted-foreground">
          {(book.formatTemplate || '{{original}}').replace('{{original}}', book.entries[0]?.content.slice(0, 60) || 'entry text')}
        </code>
      </section>
    </div>
  )
}
