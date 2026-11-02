// The Journal box of the open Dashboard (dash-wide.tsx): for the focused character, what it thinks right now, what it
// thinks of each person (the sensor's lines and the user's), and what it recollects of closed Litopys chapters.
// Read-only in this version. Off: one line says so.

import { useEffect, useState } from 'react'
import { BookOpenText } from '@phosphor-icons/react'
import { fetchLitChat, type LitChapter } from '@/components/library/litopys-api'
import { useT } from '@/hooks/use-t'
import type { DashChar, JournalLine, JournalSettings } from '@/lib/dashboard'
import { cn } from '@/lib/utils'
import { Box, Label, MARK } from './dash-common'

/** One recollection of the focused character: the view it has in a closed chapter. */
export interface JournalEntry { id: string; label: string; text: string; toNo: number; at: number }

/** The character's recollections (chapter views by this name), newest chapter first; no views, no entries. */
export function journalEntries(chapters: LitChapter[] | null | undefined, name: string): JournalEntry[] {
  const out: JournalEntry[] = []
  for (const c of chapters ?? []) {
    const view = c.views?.find((v) => v.who === name)
    const text = view?.text?.trim()
    if (text) out.push({ id: c.id, label: c.label, text, toNo: c.toNo ?? 0, at: c.at ?? 0 })
  }
  return out.sort((a, b) => b.toNo - a.toNo || b.at - a.at)
}

/** The journal box as the Dashboard shows it: loads the chapter entries from Litopys; a failure shows no entries. */
export function JournalBox({ chatId, name, char, turn, journal }: { chatId: string; name: string; char: DashChar; turn: number; journal: JournalSettings }) {
  const [entries, setEntries] = useState<JournalEntry[] | null>(null)
  const on = journal.on
  useEffect(() => {
    if (!on) return
    let alive = true
    fetchLitChat(chatId)
      .then((r) => { if (alive) setEntries(journalEntries(r?.chapters, name)) })
      .catch(() => { if (alive) setEntries(null) })
    return () => { alive = false }
  }, [chatId, name, turn, on])
  return <JournalView name={name} char={char} turn={turn} journal={journal} entries={entries} />
}

/** The box's content, from data only (no fetch): what the tests render. */
export function JournalView({ name, char, turn, journal, entries }: { name: string; char: DashChar; turn: number; journal: JournalSettings; entries: JournalEntry[] | null }) {
  const t = useT()
  return (
    <Box title={t('dash.journal', { name })} tone="memory" icon={BookOpenText} className="max-h-[480px] overflow-y-auto">
      {!journal.on ? (
        <p data-testid="dash-journal-off" className="text-sm text-muted-foreground">{t('dash.journal.off')}</p>
      ) : (
        <div className="flex flex-col gap-3" data-testid="dash-journal">
          <section className="flex min-w-0 flex-col gap-1">
            <Label>{t('dash.journal.now')}</Label>
            <Thought char={char} turn={turn} />
          </section>

          <section className="flex min-w-0 flex-col gap-1">
            <Label>{t('dash.journal.people')}</Label>
            {(char.journal ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('dash.journal.noPeople')}</p>
            ) : (
              <ul className="flex flex-col">
                {(char.journal ?? []).map((line) => <PersonLine key={line.id} line={line} />)}
              </ul>
            )}
          </section>

          {entries !== null && (
            <section className="flex min-w-0 flex-col gap-1">
              <Label>{t('dash.journal.entries')}</Label>
              {entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('dash.journal.noEntries')}</p>
              ) : (
                <ul className="flex flex-col">
                  {entries.map((e, i) => (
                    <li key={e.id} data-testid="dash-journal-entry" data-next={i === 0 ? 'true' : undefined} className="flex min-w-0 flex-col gap-0.5 border-b border-dashed border-border py-1.5 first:pt-0 last:border-b-0 last:pb-0">
                      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                        <span className="min-w-0 truncate font-heading text-[13px]">{e.label}</span>
                        {i === 0 && <span className="text-caption text-muted-foreground">{t('dash.journal.next')}</span>}
                      </div>
                      <p className="text-sm leading-snug break-words">{e.text}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
    </Box>
  )
}

/** The thought for the next reply. Past its turns it is greyed and marked faded: it no longer goes into the prompt. */
function Thought({ char, turn }: { char: DashChar; turn: number }) {
  const t = useT()
  const thought = char.thought?.trim() || null
  if (!thought) return <p className="text-sm text-muted-foreground">{t('dash.journal.noThought')}</p>
  const fresh = char.thoughtFresh !== false
  const ago = char.thoughtTurn == null ? null : Math.max(0, turn - char.thoughtTurn)
  const when = ago === null ? null : ago === 0 ? t('dash.journal.age0') : ago === 1 ? t('dash.journal.age1') : t('dash.journal.age', { n: ago })
  return (
    <div data-testid="dash-journal-thought" data-fresh={fresh ? 'true' : 'false'} className={cn('flex min-w-0 flex-col gap-1 border border-border bg-background/40 p-2', !fresh && 'opacity-60')}>
      <p className="text-sm leading-snug break-words italic">“{thought}”</p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-caption text-muted-foreground">
        {when && <span>{when}</span>}
        {!fresh && <span className="border border-border px-1 py-px font-sans uppercase tracking-wide">{t('dash.journal.faded')}</span>}
      </div>
    </div>
  )
}

/** One line about a person: the name as a chip, the line, and a mark for who wrote it. */
function PersonLine({ line }: { line: JournalLine }) {
  const t = useT()
  const mine = line.by === 'user'
  return (
    <li data-testid="dash-journal-line" data-by={line.by} className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-dashed border-border py-1.5 first:pt-0 last:border-b-0 last:pb-0">
      <span className="max-w-full min-w-0 truncate border border-border bg-background/60 px-1.5 py-px font-heading text-caption">{line.about}</span>
      <span className="min-w-0 flex-1 text-sm leading-snug break-words">{line.text}</span>
      <span className={cn('border px-1 py-px font-sans text-caption uppercase tracking-wide', mine ? MARK.good : MARK.neutral)}>
        {mine ? t('dash.journal.byUser') : t('dash.journal.bySensor')}
      </span>
    </li>
  )
}
