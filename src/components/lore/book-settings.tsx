import type { ReactNode } from 'react'
import { Gauge, ListNumbers, MagnifyingGlass, TextAa } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Fold } from '@/components/ui/fold'
import { Section } from '@/components/ui/section'
import { NumControl, Segmented, SettingRow } from '@/components/ui/setting-row'
import { useT } from '@/hooks/use-t'
import type { Lorebook } from '@/lib/types'

type Settings = Lorebook['settings']

/** The wrapper a new book starts with ("Use default"). {{original}} stands for the entry text. */
const DEFAULT_FORMAT = '[Relevant lore: {{original}}]'

/**
 * The book's Rules tab: every scan, budget, order and wrapper setting of the book, in four task cards. Each control
 * saves at once through `onUpdate` (the whole `settings` object is written back with the one field changed).
 */
export function BookSettings({ book, onUpdate }: { book: Lorebook; onUpdate: (p: Partial<Lorebook>) => void }) {
  const t = useT()
  const s = book.settings
  const set = (patch: Partial<Settings>) => onUpdate({ settings: { ...s, ...patch } })
  const recursionOff = !s.recursiveScan
  const minOff = (s.minActivations ?? 0) <= 0
  const strategies: { id: Settings['insertionStrategy']; label: string }[] = [
    { id: 'character_first', label: t('lore.set.strategyChar') },
    { id: 'global_first', label: t('lore.set.strategyGlobal') },
    { id: 'evenly', label: t('lore.set.strategyEvenly') },
  ]
  const format = book.formatTemplate
  const missingOriginal = format.trim() !== '' && !format.includes('{{original}}')
  const preview = (format || '{{original}}').replace('{{original}}', book.entries[0]?.content.slice(0, 60) || t('lore.set.previewFallback'))

  const numRow = (label: string, info: string, value: number, max: number, onCommit: (n: number) => void, dim?: { off: boolean; status?: string }): ReactNode => (
    <SettingRow label={label} info={info} off={dim?.off} status={dim?.status}>
      <NumControl label={label} value={value} min={0} max={max} disabled={dim?.off} onCommit={onCommit} />
    </SettingRow>
  )
  const swRow = (label: string, info: string, checked: boolean, onChange: (v: boolean) => void): ReactNode => (
    <SettingRow label={label} info={info}>
      <Switch tone="cta" checked={checked} onCheckedChange={onChange} aria-label={label} />
    </SettingRow>
  )

  return (
    <div className="flex flex-col gap-4 px-4 py-3" data-testid="book-settings">
      <Section variant="tinted" tone="sky" icon={MagnifyingGlass} title={t('lore.rules.reads')} chips={[t('lore.rules.chip.scan', { n: s.scanDepth ?? 0 })]}>
        {numRow(t('lore.set.scanDepth'), t('lore.set.scanDepthHint'), s.scanDepth ?? 0, 1000, (n) => set({ scanDepth: n }))}
        {swRow(t('lore.set.includeNames'), t('lore.set.includeNamesHint'), s.includeNames, (v) => set({ includeNames: v }))}
        {swRow(t('lore.set.wholeWords'), t('lore.set.wholeWordsHint'), s.wholeWords, (v) => set({ wholeWords: v }))}
        {swRow(t('lore.set.wordForms'), t('lore.set.wordFormsHint'), s.wordForms !== false, (v) => set({ wordForms: v }))}
        {swRow(t('lore.set.caseSensitive'), t('lore.set.caseSensitiveHint'), s.caseSensitive, (v) => set({ caseSensitive: v }))}
        <Fold flat id="lore-few-entries" title={t('lore.set.fewEntries')} summary={minOff ? t('lore.set.off') : t('lore.set.fewEntriesOn', { n: s.minActivations ?? 0 })} defaultOpen={!minOff}>
          {numRow(t('lore.set.minActivations'), t('lore.set.minActivationsHint'), s.minActivations ?? 0, 1000, (n) => set({ minActivations: n }))}
          {numRow(t('lore.set.minActivationsDepth'), t('lore.set.minActivationsDepthHint'), s.minActivationsDepthMax ?? 0, 100000, (n) => set({ minActivationsDepthMax: n }), { off: minOff, status: minOff ? t('lore.set.minDepthNeedsMin') : undefined })}
        </Fold>
      </Section>

      <Section variant="tinted" tone="emerald" icon={Gauge} title={t('lore.rules.fits')} chips={[
        t('lore.rules.chip.context', { n: s.contextPercent ?? 0 }),
        s.budgetCap > 0 ? t('lore.rules.chip.cap', { n: s.budgetCap }) : t('lore.rules.chip.noCap'),
      ]}>
        {numRow(t('lore.set.contextPercent'), t('lore.set.contextPercentHint'), s.contextPercent ?? 0, 100, (n) => set({ contextPercent: n }))}
        {numRow(t('lore.set.budgetCap'), t('lore.set.budgetCapHint'), s.budgetCap ?? 0, 10_000_000, (n) => set({ budgetCap: n }))}
        {swRow(t('lore.set.overflowAlert'), t('lore.set.overflowAlertHint'), s.overflowAlert, (v) => set({ overflowAlert: v }))}
      </Section>

      <Section variant="tinted" tone="violet" icon={ListNumbers} title={t('lore.rules.order')} chips={[
        strategies.find((x) => x.id === s.insertionStrategy)?.label ?? '',
        s.recursiveScan ? t('lore.rules.chip.recOn') : t('lore.rules.chip.recOff'),
      ]}>
        <SettingRow
          label={t('lore.set.strategy')}
          info={
            <ul className="flex flex-col gap-1.5">
              <li><span className="font-medium">{t('lore.set.strategyChar')}</span>: {t('lore.set.strategyCharHint')}</li>
              <li><span className="font-medium">{t('lore.set.strategyGlobal')}</span>: {t('lore.set.strategyGlobalHint')}</li>
              <li><span className="font-medium">{t('lore.set.strategyEvenly')}</span>: {t('lore.set.strategyEvenlyHint')}</li>
            </ul>
          }
        >
          <Segmented label={t('lore.set.strategy')} value={s.insertionStrategy} options={strategies} onChange={(v) => set({ insertionStrategy: v })} />
        </SettingRow>
        {swRow(t('lore.set.groupScoring'), t('lore.set.groupScoringHint'), s.groupScoring, (v) => set({ groupScoring: v }))}
        {swRow(t('lore.set.recursive'), t('lore.set.recursiveHint'), s.recursiveScan, (v) => set({ recursiveScan: v }))}
        {numRow(t('lore.set.maxRecursion'), t('lore.set.maxRecursionHint'), s.maxRecursion ?? 0, 1000, (n) => set({ maxRecursion: n }), { off: recursionOff, status: recursionOff ? t('lore.set.recursionOff') : undefined })}
      </Section>

      {/* World-info format template, per book: the wrapper every activated entry is injected inside. A blank template
          injects the entries verbatim. */}
      <Section variant="tinted" tone="slate" icon={TextAa} title={t('lore.rules.wrapper')} chips={[format.trim() ? t('lore.rules.chip.wrapCustom') : t('lore.rules.chip.wrapBlank')]}>
        <div className="flex flex-col gap-2 px-4 py-3">
          <label htmlFor={`wi-format-${book.id}`} className="text-body font-medium">{t('lore.set.format')}</label>
          <div className="flex items-center gap-2">
            <Input
              id={`wi-format-${book.id}`}
              value={format}
              onChange={(e) => onUpdate({ formatTemplate: e.target.value })}
              placeholder={t('lore.set.formatPlaceholder')}
              className="h-8 min-w-0 flex-1 font-mono text-caption max-md:h-10"
            />
            <Button variant="outline" size="default" className="max-md:h-10" onClick={() => onUpdate({ formatTemplate: DEFAULT_FORMAT })}>
              {t('lore.set.useDefault')}
            </Button>
          </div>
          <p className="text-caption text-muted-foreground">
            {t('lore.set.formatHint')}<code className="font-mono">{'{{original}}'}</code>{t('lore.set.formatHintTail')}
          </p>
          {missingOriginal && (
            <p className="text-caption text-destructive">
              {t('lore.set.formatMissing')}<code className="font-mono">{'{{original}}'}</code>{t('lore.set.formatMissingTail')}
            </p>
          )}
          <code className="truncate rounded-md bg-muted px-2 py-1 font-mono text-caption text-muted-foreground">{preview}</code>
        </div>
      </Section>
    </div>
  )
}
