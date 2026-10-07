import type { CSSProperties, ReactNode } from 'react'

// the ornament images as CSS masks; a root url(/...) in the stylesheet breaks under a base path
const STITCH_VARS = {
  '--stitch-a-url': `url("${import.meta.env.BASE_URL}ornament-stitch-a.svg")`,
  '--stitch-b-url': `url("${import.meta.env.BASE_URL}ornament-stitch-b.svg")`,
} as CSSProperties

/** A Library heading with the chat's cross-stitch band running beside it. */
export function StitchHeading({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5" style={STITCH_VARS}>
      <h3 className="shrink-0 font-heading text-base">{children}</h3>
      <span aria-hidden="true" className="lib-band" />
    </div>
  )
}
