import { Checkbox } from '@/components/ui/checkbox'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'

/** The chats to choose from, newest first, each a labelled checkbox row (at least 40 px high on a phone). `skip` leaves one out. */
export function ChatPickerList({ picked, onChange, skip, className }: { picked: string[]; onChange: (ids: string[]) => void; skip?: string; className?: string }) {
  const chats = useApp((s) => s.chats)
  const list = [...chats].filter((c) => c.id !== skip).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  const toggle = (id: string, on: boolean) => onChange(on ? [...picked, id] : picked.filter((x) => x !== id))
  return (
    <ul className={cn('max-h-52 divide-y divide-border overflow-y-auto rounded-lg border border-border', className)} data-testid="chat-picker-list">
      {list.map((c) => (
        <li key={c.id}>
          <label className="flex min-h-10 cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-accent/50">
            <Checkbox checked={picked.includes(c.id)} onCheckedChange={(v) => toggle(c.id, v === true)} />
            <span className="min-w-0 flex-1 truncate">{c.title}</span>
          </label>
        </li>
      ))}
    </ul>
  )
}
