import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'

/** A number of tokens that is saved when the field is left (or Enter); the server's clamped value wins after every save. */
export function TokenField({ id, label, unit, value, min, max, step = 50, onCommit }: { id: string; label: string; unit: string; value: number; min: number; max: number; step?: number; onCommit: (v: number) => Promise<unknown> }) {
  const [text, setText] = useState(String(value))
  useEffect(() => { setText(String(value)) }, [value])
  const commit = async () => {
    const n = Math.round(Number(text))
    const v = Number.isFinite(n) && text.trim() !== '' ? Math.min(max, Math.max(min, n)) : value
    setText(String(v))
    if (v !== value) await onCommit(v)
  }
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium">{label}</label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={step}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          className="w-28 max-md:h-10"
        />
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
    </div>
  )
}
