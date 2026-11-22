import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useT } from '@/hooks/use-t'
import { cn } from '@/lib/utils'
import { genreOptions, genreValue, setFromGenreValue } from '@/lib/direction-ui'

/**
 * The genre picker (Direction phase 4: nine genres do not fit a segmented row): None first, then the plugin's sets by name.
 * One component for the Rules tab and the group editor's Direction tab, so both list the same genres the same way.
 */
export function GenreSelect({ value, sets, disabled, label, onChange, className, testId }: {
  /** the set's id, "" = none */
  value: string
  sets: { id: string; name: string }[]
  disabled?: boolean
  /** the accessible name */
  label: string
  /** the new set's id, "" = none */
  onChange: (set: string) => void
  className?: string
  testId?: string
}) {
  const t = useT()
  const options = genreOptions(t, sets)
  return (
    <Select value={genreValue(value, sets)} disabled={disabled} onValueChange={(v) => { if (v) onChange(setFromGenreValue(String(v))) }}>
      <SelectTrigger aria-label={label} className={cn('w-full sm:w-56 max-md:data-[size=default]:h-10', className)} data-testid={testId}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.id} value={o.id} className="max-md:min-h-10">{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}
