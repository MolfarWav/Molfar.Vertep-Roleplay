// The tab row of the World section: the tabs spread evenly over the width (two rows of three on a phone), each in
// its own colour like the Dashboard's tabs: a square before the label and an underline when it is the open one.
// Overview sky, Places teal, World book emerald, Start violet, Backgrounds pink, Runs grey (the Dashboard's tones).

import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TONE_TAB, type Tone } from '@/components/dashboard/dash-common'
import { cn } from '@/lib/utils'

export type WorldTabTone = Tone | 'grey'

const LOOK: Record<WorldTabTone, { square: string; line: string }> = {
  ...TONE_TAB,
  grey: { square: 'bg-slate-500', line: 'after:bg-slate-500' },
}

export interface WorldTabItem { value: string; label: string; tone: WorldTabTone; testid?: string }

/** Goes inside a `Tabs` root. `perRow` is how many fit in one row from the md width up. */
export function WorldTabsList({ tabs, perRow = tabs.length }: { tabs: WorldTabItem[]; perRow?: number }) {
  return (
    <TabsList
      variant="line"
      className={cn(
        'grid h-auto w-full gap-0 rounded-none border-b border-border p-0 group-data-horizontal/tabs:h-auto',
        'grid-cols-3',
        perRow === 3 ? 'md:grid-cols-3' : 'md:grid-cols-6',
      )}
    >
      {tabs.map((tab) => {
        const look = LOOK[tab.tone]
        return (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            data-testid={tab.testid}
            className={cn('h-11 min-w-0 gap-1.5 rounded-none px-1 text-[13px] font-semibold group-data-horizontal/tabs:after:bottom-0', look.line)}
          >
            <span className={cn('size-2 shrink-0', look.square)} aria-hidden="true" />
            <span className="truncate">{tab.label}</span>
          </TabsTrigger>
        )
      })}
    </TabsList>
  )
}
