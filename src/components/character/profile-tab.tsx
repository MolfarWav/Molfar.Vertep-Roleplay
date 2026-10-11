import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { estimateTokens, formatTokens } from '@/lib/tokens'
import { Plus, Trash, Warning } from '@phosphor-icons/react'
import type { Character } from '@/lib/types'
import { useState, type ReactNode } from 'react'
import {
  APPEARANCE,
  LISTS,
  BEHAVIORS,
  GOALS,
  BACKGROUND,
  type Profile,
  profileOf,
  compileProfile,
  profileOutOfDate,
  applyProfile,
  startProfile,
  adoptHandEdits,
} from '@/lib/profile'
import { StructureButton, StructureDraftPanel, useStructureDraft } from '@/components/character/structure-draft'

// Field helpers live at module level: defined inside the tab they would be new
// component types on every render, and each keystroke would remount the input.
function tok(text: string) {
  return formatTokens(estimateTokens(text)) + ' tok'
}

function csv(v: string): string[] {
  return v.split(',').map((s) => s.trim()).filter(Boolean)
}
const str = (a?: string[]) => (a ?? []).join(', ')

function TextField({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">{label}</Label>
      <Input aria-label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function AreaField({ label, value, onChange, rows = 2 }: { label: string; value?: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">{label}</Label>
      <Textarea aria-label={label} rows={rows} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className="text-sm" />
    </div>
  )
}

function CsvField({ label, value, onChange }: { label: string; value?: string[]; onChange: (v: string[]) => void }) {
  const joined = str(value)
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">{label}</Label>
      <Input key={joined} aria-label={label} defaultValue={joined} onBlur={(e) => onChange(csv(e.target.value))} />
    </div>
  )
}

function Section({ title, token, hint, children }: { title: string; token: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
        {title}
        <Badge variant="outline">{token}</Badge>
      </h2>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </section>
  )
}

export function ProfileTab({ c, up }: { c: Character; up: (patch: Partial<Character>) => void }) {
  const p = profileOf(c)
  const [adoptMsg, setAdoptMsg] = useState<string | null>(null)
  const structure = useStructureDraft(c, up)
  const draftPanel = structure.draft && (
    <StructureDraftPanel c={c} draft={structure.draft} onAccept={structure.accept} onDiscard={structure.drop} />
  )

  if (!p) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          A profile splits the card into fields (identity, looks, personality, background). It writes Description and Personality for you; the text they hold now is kept as notes.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="w-fit" onClick={() => up(applyProfile(c, startProfile(c)))}>Start a profile</Button>
          <StructureButton busy={structure.busy} onClick={() => void structure.run()} />
        </div>
        <p className="text-xs text-muted-foreground">Structure it asks the model to sort the text into the fields; you see the result before anything changes.</p>
        {draftPanel}
      </div>
    )
  }

  const save = (next: Profile) => up(applyProfile(c, next))
  const relationships = p.relationships ?? []


  const notesCompiled = compileProfile({ notes: p.notes })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
        <label className="flex items-center gap-2 text-xs">
          <Switch checked={!!p.free} onCheckedChange={(v) => save({ ...p, free: v })} aria-label="Free write" />
          Free write: edit Description and Personality by hand; the profile stops writing them
        </label>
        {p.free && <p className="text-xs text-muted-foreground">Free write is on: the fields are saved but do not change the card's text.</p>}
        <StructureButton busy={structure.busy} onClick={() => void structure.run()} />
      </div>
      {draftPanel}

      {!p.free && profileOutOfDate(c) && (
        <div className="flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <div className="flex items-start gap-2">
            <Warning className="size-4 shrink-0 text-amber-500" aria-hidden="true" />
            <p className="text-sm">Description or Personality were edited by hand after the profile wrote them.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const a = adoptHandEdits(p, c)
                if (a) {
                  save(a)
                  setAdoptMsg(null)
                } else {
                  setAdoptMsg("Your edit changed the profile's own lines; use Free write or rewrite from the profile.")
                }
              }}
            >
              Keep my additions
            </Button>
            <Button variant="outline" size="sm" onClick={() => save(p)}>Rewrite from profile</Button>
            <Button variant="outline" size="sm" onClick={() => save({ ...p, free: true })}>Free write</Button>
          </div>
          {adoptMsg && <p className="text-xs text-amber-700 dark:text-amber-300">{adoptMsg}</p>}
        </div>
      )}

      <Section title="Identity" token={tok(compileProfile({ identity: p.identity }).description)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Title" value={p.identity?.title} onChange={(title) => save({ ...p, identity: { ...p.identity, title } })} />
          <TextField label="First name" value={p.identity?.first} onChange={(first) => save({ ...p, identity: { ...p.identity, first } })} />
          <TextField label="Family name" value={p.identity?.family} onChange={(family) => save({ ...p, identity: { ...p.identity, family } })} />
          <TextField label="Occupation" value={p.identity?.occupation} onChange={(occupation) => save({ ...p, identity: { ...p.identity, occupation } })} />
          <TextField label="Age" value={p.identity?.age} onChange={(age) => save({ ...p, identity: { ...p.identity, age } })} />
          <TextField label="Gender" value={p.identity?.gender} onChange={(gender) => save({ ...p, identity: { ...p.identity, gender } })} />
          <TextField label="Pronouns" value={p.identity?.pronouns} onChange={(pronouns) => save({ ...p, identity: { ...p.identity, pronouns } })} />
          <div className="sm:col-span-2">
            <CsvField label="Nicknames" value={p.identity?.nicknames} onChange={(nicknames) => save({ ...p, identity: { ...p.identity, nicknames } })} />
          </div>
          <div className="sm:col-span-2">
            <AreaField label="Private comment (never sent to the model)" value={p.identity?.comment} onChange={(comment) => save({ ...p, identity: { ...p.identity, comment } })} />
          </div>
        </div>
      </Section>

      <Section title="Appearance" token={tok(compileProfile({ appearance: p.appearance }).description)}>
        <div className="grid gap-3 sm:grid-cols-2">
          {APPEARANCE.map(([id, label]) => (
            <AreaField key={id} label={label} value={p.appearance?.[id]} onChange={(v) => save({ ...p, appearance: { ...p.appearance, [id]: v } })} />
          ))}
        </div>
      </Section>

      <Section title="Traits" token={tok(compileProfile({ lists: p.lists }).personality)} hint="Comma separated">
        <div className="grid gap-3 sm:grid-cols-2">
          {LISTS.map(([id, label]) => (
            <CsvField key={id} label={label} value={p.lists?.[id]} onChange={(v) => save({ ...p, lists: { ...p.lists, [id]: v } })} />
          ))}
        </div>
      </Section>

      <Section title="Behaviors" token={tok(compileProfile({ behaviors: p.behaviors }).personality)}>
        <div className="flex flex-col gap-3">
          {BEHAVIORS.map(([id, label]) => (
            <AreaField key={id} label={label} value={p.behaviors?.[id]} onChange={(v) => save({ ...p, behaviors: { ...p.behaviors, [id]: v } })} />
          ))}
        </div>
      </Section>

      <Section title="Goals" token={tok(compileProfile({ goals: p.goals }).personality)}>
        <div className="flex flex-col gap-3">
          {GOALS.map(([id, label]) => (
            <AreaField key={id} label={label} value={p.goals?.[id]} onChange={(v) => save({ ...p, goals: { ...p.goals, [id]: v } })} />
          ))}
        </div>
      </Section>

      <Section title="Background" token={tok(compileProfile({ background: p.background }).description)}>
        <div className="grid gap-3 sm:grid-cols-2">
          {BACKGROUND.map(([id, label]) => (
            <TextField
              key={id}
              label={label}
              value={(p.background as Record<string, string> | undefined)?.[id]}
              onChange={(v) => save({ ...p, background: { ...p.background, [id]: v } })}
            />
          ))}
          <div className="sm:col-span-2">
            <CsvField label="Affiliations" value={p.background?.affiliations} onChange={(v) => save({ ...p, background: { ...p.background, affiliations: v } })} />
          </div>
          <div className="sm:col-span-2">
            <AreaField label="Backstory" rows={5} value={p.background?.summary} onChange={(v) => save({ ...p, background: { ...p.background, summary: v } })} />
          </div>
        </div>
      </Section>

      <Section title="Relationships" token={tok(compileProfile({ relationships: p.relationships }).description)}>
        <div className="flex flex-col gap-2">
          {relationships.map((rel, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_2fr_auto]">
              <Input
                aria-label="Name"
                value={rel.name}
                onChange={(e) => {
                  const next = [...relationships]
                  next[i] = { ...rel, name: e.target.value }
                  save({ ...p, relationships: next })
                }}
              />
              <Input
                aria-label="Relation"
                value={rel.relation}
                onChange={(e) => {
                  const next = [...relationships]
                  next[i] = { ...rel, relation: e.target.value }
                  save({ ...p, relationships: next })
                }}
              />
              <Textarea
                aria-label="Notes"
                rows={1}
                value={rel.notes}
                onChange={(e) => {
                  const next = [...relationships]
                  next[i] = { ...rel, notes: e.target.value }
                  save({ ...p, relationships: next })
                }}
                className="text-sm"
              />
              <Button
                variant="ghost"
                size="sm"
                aria-label="Remove relationship"
                onClick={() => {
                  const next = [...relationships]
                  next.splice(i, 1)
                  save({ ...p, relationships: next })
                }}
              >
                <Trash className="size-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="w-fit" onClick={() => save({ ...p, relationships: [...relationships, { name: '', relation: '', notes: '' }] })}>
            <Plus className="size-4" aria-hidden="true" /> Add relationship
          </Button>
        </div>
      </Section>

      <Section title="Sexuality" token={tok(compileProfile({ sexuality: p.sexuality }).personality)}>
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-xs">
            <Switch
              checked={!!p.sexuality?.enabled}
              onCheckedChange={(enabled) => save({ ...p, sexuality: { ...p.sexuality, enabled } })}
              aria-label="Adult details (only for adult characters)"
            />
            Adult details (only for adult characters)
          </label>
          {p.sexuality?.enabled && (
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Orientation" value={p.sexuality?.orientation} onChange={(v) => save({ ...p, sexuality: { ...p.sexuality, orientation: v } })} />
              <TextField label="Experience" value={p.sexuality?.experience} onChange={(v) => save({ ...p, sexuality: { ...p.sexuality, experience: v } })} />
              <CsvField label="Turn-ons" value={p.sexuality?.turnOns} onChange={(v) => save({ ...p, sexuality: { ...p.sexuality, turnOns: v } })} />
              <CsvField label="Turn-offs" value={p.sexuality?.turnOffs} onChange={(v) => save({ ...p, sexuality: { ...p.sexuality, turnOffs: v } })} />
              <CsvField label="Kinks" value={p.sexuality?.kinks} onChange={(v) => save({ ...p, sexuality: { ...p.sexuality, kinks: v } })} />
              <div className="sm:col-span-2">
                <AreaField label="Boundaries" value={p.sexuality?.boundaries} onChange={(v) => save({ ...p, sexuality: { ...p.sexuality, boundaries: v } })} />
              </div>
            </div>
          )}
        </div>
      </Section>

      <Section title="Notes" token={tok(notesCompiled.description + notesCompiled.personality)} hint="Text that fits no field; it follows the fields in the card.">
        <div className="flex flex-col gap-3">
          <AreaField label="Other description text" rows={4} value={p.notes?.description} onChange={(v) => save({ ...p, notes: { ...p.notes, description: v } })} />
          <AreaField label="Other personality text" rows={4} value={p.notes?.personality} onChange={(v) => save({ ...p, notes: { ...p.notes, personality: v } })} />
        </div>
      </Section>
    </div>
  )
}
