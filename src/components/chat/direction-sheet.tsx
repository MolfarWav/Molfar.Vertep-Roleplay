import { useId, useState } from 'react'
import { toast } from 'sonner'
import { Lightning } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Fold } from '@/components/ui/fold'
import { NumTile, Segmented, SettingRow } from '@/components/ui/setting-row'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DirectionLog } from '@/components/chat/direction-log'
import { NextCallout } from '@/components/chat/direction-next'
import { PlanTab } from '@/components/chat/direction-plan'
import { useT } from '@/hooks/use-t'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { DIRECTION_FROMS, fireDirectionRule, setDirectionRules, skipDirectionNext, RULE_LIMITS, type DirectionFrom, type DirectionRule, type DirectionRules, type DirectionState, type RuleNumber } from '@/lib/direction'
import { barMode, fireBlockedKey, needText, ruleEdited, ruleFrom, ruleRestorePatch, ruleSentenceKey, ruleStatusLine, worldPeople } from '@/lib/direction-ui'

export type DirectionTab = 'rules' | 'plan' | 'log'

type RulePatch = { on?: boolean; from?: DirectionFrom; need?: number; cooldown?: number; k?: number; m?: number }

const NO_RULES: DirectionRules = { set: '', on: false, sets: [], items: [] }
const fail = (e: unknown): void => { toast.error(String((e as Error)?.message ?? e)) }

/**
 * The Direction sheet: a right-hand sheet on a desktop, a full-height bottom sheet on a phone, with the genre rules, the beat plan and the log
 * as tabs. The actions go to the plugin's routes; a refused one (Fire now with nobody away) shows the plugin's own message.
 */
export function DirectionSheet({ chatId, state, open, onOpenChange, tab, onTab }: {
  chatId: string
  state: DirectionState
  open: boolean
  onOpenChange: (open: boolean) => void
  tab: DirectionTab
  onTab: (tab: DirectionTab) => void
}) {
  const t = useT()
  const mobile = useIsMobile()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={mobile ? 'bottom' : 'right'}
        data-testid="direction-sheet"
        className={cn('gap-0 p-0', mobile ? 'h-[calc(100dvh-1rem)] rounded-t-xl data-[side=bottom]:max-h-[calc(100dvh-1rem)]' : 'w-full sm:max-w-[620px]')}
      >
        <SheetHeader className="pr-14 pb-2">
          <SheetTitle>{t('dir.title')}</SheetTitle>
          <SheetDescription className="sr-only">{t('dir.rules.aria')}</SheetDescription>
        </SheetHeader>
        <Tabs value={tab} onValueChange={(v) => onTab(v === 'log' ? 'log' : v === 'plan' ? 'plan' : 'rules')} className="min-h-0 flex-1 gap-3">
          <TabsList className="mx-4 h-10 w-[calc(100%-2rem)] group-data-horizontal/tabs:h-10 max-md:h-12 max-md:group-data-horizontal/tabs:h-12">
            <TabsTrigger value="rules" className="text-body" data-testid="director-rules-tab">{t('dir.rules')}</TabsTrigger>
            {state.plan && <TabsTrigger value="plan" className="text-body" data-testid="director-plan-tab">{t('dir.plan')}</TabsTrigger>}
            <TabsTrigger value="log" className="text-body" data-testid="director-log">{t('dir.log')}</TabsTrigger>
          </TabsList>
          <TabsContent value="rules" className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
            <RulesTab chatId={chatId} state={state} />
          </TabsContent>
          {state.plan && (
            <TabsContent value="plan" className="min-h-0 flex-1 overflow-y-auto px-4 pb-6" data-testid="director-plan-panel">
              <PlanTab chatId={chatId} state={state} />
            </TabsContent>
          )}
          <TabsContent value="log" className="min-h-0 flex-1 overflow-y-auto px-4 pb-6" data-testid="director-log-panel">
            <DirectionLog state={state} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}

/** The Rules tab with its actions wired to the plugin. */
export function RulesTab({ chatId, state }: { chatId: string; state: DirectionState }) {
  return (
    <RulesTabView
      state={state}
      onSet={(set) => { void setDirectionRules(chatId, { set }).catch(fail) }}
      onOn={(on) => { void setDirectionRules(chatId, { on }).catch(fail) }}
      onRule={(id, patch) => { void setDirectionRules(chatId, { rule: { id, ...patch } }).catch(fail) }}
      onFire={(id) => fireDirectionRule(chatId, id).then(() => undefined).catch(fail)}
      onSkip={() => skipDirectionNext(chatId).catch(fail)}
    />
  )
}

/** The Rules tab itself: what it shows depends only on the state and the callbacks, so it is checked without a browser. */
export function RulesTabView({ state, onSet, onOn, onRule, onFire, onSkip, foldsOpen }: {
  state: DirectionState
  onSet: (set: string) => void
  onOn: (on: boolean) => void
  onRule: (id: string, patch: RulePatch) => void
  onFire: (id: string) => Promise<void> | void
  onSkip: () => Promise<void> | void
  /** open every "Numbers" fold at first (tests) */
  foldsOpen?: boolean
}) {
  const t = useT()
  const rules = state.rules ?? NO_RULES
  const mode = barMode(state)
  // the genre and the numbers are shown but not changed while the director is off or has no model
  const locked = mode === 'no-model' || mode === 'off'
  const reason = mode === 'no-model' ? t('dir.rules.needModel') : mode === 'off' ? t('dir.rules.needDirection') : !rules.set ? t('dir.rules.needGenre') : ''
  const blockedKey = fireBlockedKey(state)
  const [pending, setPending] = useState(false)
  const run = (fn: () => Promise<void> | void) => {
    setPending(true)
    void Promise.resolve(fn()).finally(() => setPending(false))
  }

  return (
    <div className="flex flex-col gap-3" data-testid="rules-tab">
      <Card variant="rows">
        <SettingRow label={t('dir.rules.genre')} status={t('dir.rules.genreHint')} off={locked}>
          <Segmented
            label={t('dir.rules.genre')}
            value={rules.set || 'none'}
            disabled={locked}
            onChange={(v) => onSet(v === 'none' ? '' : v)}
            options={[{ id: 'none', label: t('dir.rules.genreNone') }, ...rules.sets.map((s) => ({ id: s.id, label: s.name }))]}
          />
        </SettingRow>
        <SettingRow label={t('dir.rules.use')} status={<span data-testid="rules-reason">{reason || t(rules.on ? 'dir.rules.status.on' : 'dir.rules.status.off')}</span>} off={locked || !rules.set}>
          <Switch checked={rules.on} disabled={locked || !rules.set} onCheckedChange={onOn} aria-label={t('dir.rules.on')} data-testid="rules-switch" />
        </SettingRow>
      </Card>

      <NextCallout state={state} testId="rules" onSkip={onSkip} />

      {rules.items.map((r) => (
        <RuleCard
          key={r.id}
          rule={r}
          locked={locked}
          noPeople={worldPeople(state).length === 0}
          blocked={blockedKey ? t(blockedKey) : ''}
          pending={pending}
          foldOpen={foldsOpen}
          onRule={(patch) => onRule(r.id, patch)}
          onFire={() => run(() => onFire(r.id))}
        />
      ))}
    </div>
  )
}

function RuleCard({ rule, locked, noPeople, blocked, pending, foldOpen, onRule, onFire }: {
  rule: DirectionRule
  locked: boolean
  /** the chat's World has no person a rule could bring */
  noPeople: boolean
  /** why "Fire now" cannot be used, or "" */
  blocked: string
  pending: boolean
  foldOpen?: boolean
  onRule: (patch: RulePatch) => void
  onFire: () => void
}) {
  const t = useT()
  const reasonId = useId()
  const dot = rule.status === 'ready' ? 'bg-cta' : rule.status === 'payoff' ? 'bg-primary' : rule.status === 'cooldown' ? 'bg-muted-foreground' : 'bg-border'
  return (
    <Card variant="rows" data-testid={`rule-${rule.id}`} data-status={rule.status}>
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className={cn('text-body font-medium', !rule.on && 'text-muted-foreground')}>{rule.name}</p>
          <p className="mt-0.5 text-caption text-muted-foreground">{t(ruleSentenceKey(rule))}</p>
        </div>
        <Switch className="mt-0.5" checked={rule.on} disabled={locked} onCheckedChange={(on) => onRule({ on })} aria-label={t('dir.rules.switchAria', { name: rule.name })} data-testid={`rule-switch-${rule.id}`} />
      </div>
      <div className="flex flex-col gap-1 px-4 py-2">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="flex min-w-0 items-center gap-2 text-caption text-muted-foreground" data-testid={`rule-status-${rule.id}`}>
            <span className={cn('size-2 shrink-0 rounded-full', dot)} aria-hidden="true" />
            <span>{ruleStatusLine(t, rule)}</span>
          </p>
          <Button variant="ghost" size="sm" className="gap-1.5 max-md:h-10" disabled={!!blocked || pending} aria-describedby={blocked ? reasonId : undefined} onClick={onFire} data-testid={`rule-fire-${rule.id}`}>
            <Lightning className="size-3.5" aria-hidden="true" />{t('dir.rules.fire')}
          </Button>
        </div>
        {blocked && <p id={reasonId} className="text-caption text-muted-foreground" data-testid={`rule-blocked-${rule.id}`}>{blocked}</p>}
      </div>
      {rule.from && <RuleFrom rule={rule} locked={locked} noPeople={noPeople} onRule={onRule} />}
      <Fold flat id={`dir-rule-${rule.id}`} title={t('dir.rules.numbers')} summary={t('dir.rules.numbersSummary', { need: rule.need, cooldown: rule.cooldown })} defaultOpen={foldOpen}>
        <RuleNumbers rule={rule} locked={locked} onRule={onRule} />
      </Fold>
    </Card>
  )
}

/** "Who comes": members, people of the World or either. The World options wait until the World has someone (the row says so). */
export function RuleFrom({ rule, locked, noPeople, onRule }: { rule: DirectionRule; locked: boolean; noPeople: boolean; onRule: (patch: RulePatch) => void }) {
  const t = useT()
  const value = ruleFrom(rule)
  return (
    <SettingRow
      label={t('dir.rule.from')}
      off={locked}
      status={
        <span data-testid={`rule-from-hint-${rule.id}`}>
          {t('dir.rule.from.hint')}
          {noPeople && <span className="block" data-testid={`rule-from-none-${rule.id}`}>{t('dir.rule.from.none')}</span>}
        </span>
      }
    >
      <Segmented
        label={t('dir.rule.from')}
        value={value}
        disabled={locked}
        className="max-md:w-full max-md:[&>button]:flex-1"
        onChange={(from) => onRule({ from })}
        options={DIRECTION_FROMS.map((id) => ({ id, label: t(`dir.rule.from.${id}` as const), disabled: noPeople && id !== 'members' }))}
      />
    </SettingRow>
  )
}

/** A rule's four numbers, each with a hint line, and "Restore defaults" once they differ from the built-in ones. */
export function RuleNumbers({ rule, locked, onRule }: { rule: DirectionRule; locked: boolean; onRule: (patch: RulePatch) => void }) {
  const t = useT()
  const tile = (field: RuleNumber, label: string, hint: string) => (
    <NumTile label={label} hint={hint} value={rule[field]} min={RULE_LIMITS[field][0]} max={RULE_LIMITS[field][1]} disabled={locked} onCommit={(n) => onRule({ [field]: n })} />
  )
  const restore = ruleRestorePatch(rule)
  return (
    <div className="flex flex-col gap-3 p-4" data-testid={`rule-numbers-${rule.id}`}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {tile('need', t('dir.rules.chance'), needText(t, rule.need))}
        {tile('cooldown', t('dir.rules.cooldown'), t('dir.rules.cooldownHint'))}
        {tile('k', t('dir.rules.payoffEvery'), t('dir.rules.payoffEveryHint'))}
        {tile('m', t('dir.rules.payoffQuiet'), t('dir.rules.payoffQuietHint'))}
      </div>
      {ruleEdited(rule) && restore && (
        <div>
          <Button variant="outline" size="sm" className="max-md:h-10" disabled={locked} onClick={() => onRule(restore)} data-testid={`rule-restore-${rule.id}`}>
            {t('dir.rules.restore')}
          </Button>
        </div>
      )}
    </div>
  )
}
