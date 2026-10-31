import type * as React from 'react'
import { useLayoutEffect, useRef, useState } from 'react'

/** The tag chips in at most two rows: a hidden copy measures how many fit, the rest is behind "All tags". */
export function TagRow<T>({ chips, counts, render }: {
  chips: { name: string; tag: T }[]
  counts: Map<string, number>
  render: (name: string, tag: T) => React.ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const twin = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(chips.length)
  useLayoutEffect(() => {
    const measure = () => {
      const kids = Array.from(twin.current?.children ?? []) as HTMLElement[]
      if (!kids.length) { setFit(0); return }
      const tops = [...new Set(kids.map((k) => k.offsetTop))].sort((a, b) => a - b)
      const limit = tops[1] ?? Infinity
      setFit(kids.filter((k) => k.offsetTop <= limit).length)
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (box.current) ro.observe(box.current)
    return () => ro.disconnect()
  }, [chips])
  return (
    <div ref={box} className="relative min-w-0 flex-1" data-testid="tag-row">
      <div className="flex flex-wrap items-center gap-1.5 py-0.5">
        {chips.slice(0, fit).map(({ name, tag }) => render(name, tag))}
      </div>
      <div ref={twin} aria-hidden="true" className="pointer-events-none invisible absolute inset-x-0 top-0 flex flex-wrap items-center gap-1.5 py-0.5">
        {chips.map(({ name }) => (
          <span key={name} className="shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px]">{name} <span>{counts.get(name) ?? 0}</span></span>
        ))}
      </div>
    </div>
  )
}
