import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { answersOf, type PersonaAnswers } from '@/lib/profile'
import type { Persona } from '@/lib/types'

type Key = keyof PersonaAnswers

/** Five questions (and one private note) that write the persona's description.
 *  Every answer is optional; nothing is sent to a model. */
const QUESTIONS: { title: string; hint?: string; fields: { key: Key; label: string; area?: boolean; placeholder?: string }[] }[] = [
  { title: '1. What is your name, and what do people call you?', fields: [
    { key: 'first', label: 'First name' }, { key: 'family', label: 'Family name' },
    { key: 'nicknames', label: 'Nicknames', placeholder: 'comma separated' },
  ] },
  { title: '2. Age, gender, pronouns', fields: [
    { key: 'age', label: 'Age' }, { key: 'gender', label: 'Gender' }, { key: 'pronouns', label: 'Pronouns', placeholder: 'she, he, they…' },
  ] },
  { title: '3. What do you look like?', hint: 'A few words each is enough.', fields: [
    { key: 'hair', label: 'Hair' }, { key: 'eyes', label: 'Eyes' }, { key: 'body', label: 'Build and height' }, { key: 'attire', label: 'Usual clothes' },
  ] },
  { title: '4. Your character in three words, and one flaw', fields: [
    { key: 'traits', label: 'Three words', placeholder: 'curious, stubborn, kind' }, { key: 'flaws', label: 'A flaw', placeholder: 'impatient' },
  ] },
  { title: '5. Who are you in this world?', fields: [
    { key: 'occupation', label: 'Occupation' },
    { key: 'summary', label: 'Your story in a few sentences', area: true },
  ] },
  { title: 'What do you want from your stories? (private)', hint: 'A note for yourself: it never goes into the prompt.', fields: [
    { key: 'wants', label: 'Private note', area: true },
  ] },
]

export function PersonaQuestionnaire({ persona, open, onOpenChange, onSave }: {
  persona: Persona
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (answers: PersonaAnswers) => void
}) {
  const [a, setA] = useState<PersonaAnswers>(() => answersOf(persona))
  // a fresh copy of the persona's answers each time the dialog opens
  useEffect(() => { if (open) setA(answersOf(persona)) }, [open, persona.id])
  const set = (key: Key, v: string) => setA((prev) => ({ ...prev, [key]: v }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Your persona in five questions</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">The answers write the persona's description as short labeled lines. Skip anything you like; text you wrote before stays below them.</p>
        <div className="flex flex-col gap-4">
          {QUESTIONS.map((q) => (
            <fieldset key={q.title} className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <legend className="px-1 text-sm font-medium">{q.title}</legend>
              {q.hint && <p className="text-xs text-muted-foreground">{q.hint}</p>}
              <div className="grid gap-2 sm:grid-cols-2">
                {q.fields.map((f) => (
                  <div key={f.key} className={f.area ? 'flex flex-col gap-1 sm:col-span-2' : 'flex flex-col gap-1'}>
                    <Label className="text-xs">{f.label}</Label>
                    {f.area
                      ? <Textarea rows={3} value={a[f.key]} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} aria-label={f.label} className="text-sm" />
                      : <Input value={a[f.key]} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} aria-label={f.label} />}
                  </div>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={() => onSave(a)}>Write my persona</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
