import { useEffect, useState } from 'react'

export const MOBILE_BREAKPOINT = 768
/** From this width the nav rail grows labels (below it: icons only). */
export const WIDE_RAIL_BREAKPOINT = 1280

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => setIsMobile(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isMobile
}

/** True on the same breakpoint from the other side — the desktop shell (nav
 *  rail) lives at >=768px, the mobile one (tab bar) below it. */
export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${MOBILE_BREAKPOINT}px)`)
    const onChange = () => setIsDesktop(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isDesktop
}

/** True from 1280px: the rail shows labels and groups, not just icons. */
export function useIsWideRail() {
  const [wide, setWide] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${WIDE_RAIL_BREAKPOINT}px)`)
    const onChange = () => setWide(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return wide
}
