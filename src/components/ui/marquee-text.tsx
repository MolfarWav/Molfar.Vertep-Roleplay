import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * One line of text that never wraps. When it does not fit, it drifts slowly
 * to its end and back so the whole of it can be read; with reduced motion it
 * just stops at the edge. For short labels such as a name in a header.
 */
export function MarqueeText({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  const outer = useRef<HTMLSpanElement>(null)
  const inner = useRef<HTMLSpanElement>(null)
  const [shift, setShift] = useState(0)

  useLayoutEffect(() => {
    const o = outer.current
    const i = inner.current
    if (!o || !i) return
    const measure = () => setShift(Math.max(0, Math.ceil(i.scrollWidth - o.clientWidth)))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(o)
    return () => ro.disconnect()
  }, [children])

  const moving = shift > 4
  return (
    <span
      ref={outer}
      className={cn('block overflow-hidden whitespace-nowrap', className)}
      style={style}
      title={typeof children === 'string' ? children : undefined}
    >
      <span
        ref={inner}
        className={cn('inline-block', moving && 'marquee-x')}
        style={moving ? ({ '--marquee-shift': `-${shift}px`, '--marquee-time': `${Math.max(3, shift / 25)}s` } as CSSProperties) : undefined}
      >
        {children}
      </span>
    </span>
  )
}
