
import { useEffect } from 'react'
import { useApp } from '@/lib/store'
import { hexLuminance } from '@/lib/utils'
import type { AppSettings } from '@/lib/types'

/** Blend two hex colors; t=0 → a, t=1 → b. Used to derive readable
 *  foreground counterparts from the active palette. */
function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (shift: number) => {
    const va = (pa >> shift) & 0xff
    const vb = (pb >> shift) & 0xff
    return Math.round(va + (vb - va) * t)
  }
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`
}

/**
 * Applies the active theme preset, UI scale, and custom CSS to the DOM.
 * The preset is the single source of truth — its palette overrides the base
 * design tokens as inline CSS vars on <html>, and its brightness drives the
 * light/dark class (there is no separate mode control in the UI).
 */
/** Built-in prose fonts. */
export const PROSE_FONTS: { id: AppSettings['proseFont']; label: string; stack: string }[] = [
  { id: 'noto-serif', label: 'Noto Serif', stack: '"Noto Serif", Georgia, serif' },
  { id: 'noto', label: 'Noto Sans', stack: '"Noto Sans Variable", "Noto Sans", sans-serif' },
  { id: 'system', label: 'System', stack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { id: 'inter', label: 'Inter', stack: '"Inter Variable", Inter, sans-serif' },
  { id: 'georgia', label: 'Georgia (serif)', stack: 'Georgia, "Times New Roman", serif' },
  { id: 'times', label: 'Times New Roman', stack: '"Times New Roman", Times, serif' },
  { id: 'verdana', label: 'Verdana', stack: 'Verdana, Geneva, sans-serif' },
  { id: 'jetbrains', label: 'JetBrains Mono', stack: '"JetBrains Mono Variable", "JetBrains Mono", monospace' },
]

export function ThemeApplier() {
  const themeMode = useApp((s) => s.settings.themeMode)
  const activeThemeId = useApp((s) => s.settings.activeThemeId)
  const customCss = useApp((s) => s.settings.customCss)
  const uiScale = useApp((s) => s.settings.uiScale)
  const avatarScale = useApp((s) => s.settings.avatarScale)
  const reducedMotion = useApp((s) => s.settings.reducedMotion)
  const quoteStyle = useApp((s) => s.settings.quoteStyle)
  const proseFont = useApp((s) => s.settings.proseFont)
  const fontScale = useApp((s) => s.settings.fontScale)
  const lineSpacing = useApp((s) => s.settings.lineSpacing)
  const paragraphSpacing = useApp((s) => s.settings.paragraphSpacing)
  /** Per-user override; empty string falls back to the active theme's quote color. */
  const quoteColor = useApp((s) => s.settings.quoteColor)
  const italicsColor = useApp((s) => s.settings.italicsColor)
  const themes = useApp((s) => s.themes)
  const updateSettings = useApp((s) => s.updateSettings)

  // Quote emphasis (plain / bold / glow / underline) is a class on <html> so
  // the rule lives in CSS and stays overridable from the Custom CSS editor.
  useEffect(() => {
    const root = document.documentElement
    const all = ['quotes-default', 'quotes-bold', 'quotes-glow', 'quotes-underline']
    root.classList.remove(...all)
    root.classList.add(`quotes-${quoteStyle}`)
    return () => root.classList.remove(...all)
  }, [quoteStyle])

  // dark/light mode class
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', themeMode === 'dark')
    root.classList.toggle('light', themeMode === 'light')
  }, [themeMode])

  // theme preset -> CSS variable overrides
  useEffect(() => {
    const root = document.documentElement
    const theme = themes.find((t) => t.id === activeThemeId)
    const keys = [
      '--background', '--foreground', '--card', '--card-foreground', '--popover', '--popover-foreground',
      '--primary', '--primary-foreground', '--cta', '--cta-foreground', '--ring', '--secondary', '--secondary-foreground',
      '--muted', '--muted-foreground', '--accent', '--accent-foreground', '--border', '--input',
      '--tap-italics', '--tap-quotes', '--tap-main-text',
      '--tap-h1', '--tap-h2', '--tap-h3',
    ]
    if (!theme) {
      keys.forEach((k) => root.style.removeProperty(k))
      return
    }
    const c = theme.colors
    root.style.setProperty('--background', c.chatBg)
    root.style.setProperty('--foreground', c.mainText)
    root.style.setProperty('--card', c.uiBg)
    root.style.setProperty('--card-foreground', c.mainText)
    root.style.setProperty('--popover', c.uiBg)
    root.style.setProperty('--popover-foreground', c.mainText)
    root.style.setProperty('--primary', c.accent)
    root.style.setProperty('--ring', c.accent)
    root.style.setProperty('--secondary', c.userTint)
    root.style.setProperty('--muted', c.charTint)
    root.style.setProperty('--border', c.borders)
    root.style.setProperty('--input', c.borders)
    // Foreground COUNTERPARTS are derived from the palette itself, never left
    // at the base-theme value: the base pair is only correct for its own mode,
    // and a dark palette applied over the light base produced dark-on-dark
    // hovers (menu items) and unreadable muted text. Deriving keeps every
    // pair consistent for ANY preset, including user-authored ones.
    root.style.setProperty('--primary-foreground', c.chatBg)
    // second accent: absent on a preset = the accent, so older themes look as before
    root.style.setProperty('--cta', c.cta || c.accent)
    root.style.setProperty('--cta-foreground', c.chatBg)
    root.style.setProperty('--secondary-foreground', c.mainText)
    root.style.setProperty('--muted-foreground', mix(c.mainText, c.chatBg, 0.35))
    // accent needs to be visible against the card it hovers on (userTint is
    // often nearly identical to uiBg) — nudge it toward the text color
    root.style.setProperty('--accent', mix(c.userTint, c.mainText, 0.1))
    root.style.setProperty('--accent-foreground', c.mainText)
    // Roleplay prose colors: *actions* and "spoken dialogue".
    root.style.setProperty('--tap-italics', italicsColor || c.italics)
    root.style.setProperty('--tap-quotes', quoteColor || c.quotes)
    root.style.setProperty('--tap-main-text', c.mainText)
    // Optional per-level heading colors — presets without them keep
    // inherited heading colors, so existing themes render unchanged.
    if (c.heading1) root.style.setProperty('--tap-h1', c.heading1)
    else root.style.removeProperty('--tap-h1')
    if (c.heading2) root.style.setProperty('--tap-h2', c.heading2)
    else root.style.removeProperty('--tap-h2')
    if (c.heading3) root.style.setProperty('--tap-h3', c.heading3)
    else root.style.removeProperty('--tap-h3')
    return () => keys.forEach((k) => root.style.removeProperty(k))
  }, [activeThemeId, themes, themeMode, quoteColor, italicsColor])

  // ui scale + reduced motion
  useEffect(() => {
    const root = document.documentElement
    root.style.fontSize = uiScale === 100 ? '' : `${uiScale}%`
    root.style.setProperty('--avatar-scale', String(avatarScale / 100))
    root.style.setProperty('scroll-behavior', reducedMotion ? 'auto' : '')
  }, [uiScale, reducedMotion])

  // The preset IS the mode: a light palette (Daylight) implies light mode,
  // a dark one implies dark. settings.themeMode is kept in sync as a derived
  // value for consumers (toaster theme, palette action) — there is no
  // separate mode control anywhere in the UI.
  useEffect(() => {
    const theme = themes.find((t) => t.id === activeThemeId)
    const dark = theme ? hexLuminance(theme.colors.chatBg) < 0.5 : themeMode === 'dark'
    const derived = dark ? 'dark' : 'light'
    if (derived !== themeMode) updateSettings({ themeMode: derived })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThemeId, themes])

  // prose font (chat text) + scale — CSS vars consumed by .mes_text
  useEffect(() => {
    const root = document.documentElement
    const stack = PROSE_FONTS.find((f) => f.id === proseFont)?.stack
    // unknown id: clear the override so .mes_text falls back to inherit —
    // an empty-string var would also fall back, but only by accident
    if (stack) root.style.setProperty('--prose-font', stack)
    else root.style.removeProperty('--prose-font')
    root.style.setProperty('--prose-scale', String(fontScale / 100))
    root.style.setProperty('--prose-line-height', String(lineSpacing / 100))
    root.style.setProperty('--prose-para-gap', `${paragraphSpacing}px`)
  }, [proseFont, fontScale, lineSpacing, paragraphSpacing])

  // custom css injection
  useEffect(() => {
    let el = document.getElementById('tapestry-custom-css') as HTMLStyleElement | null
    if (!customCss.trim()) {
      el?.remove()
      return
    }
    if (!el) {
      el = document.createElement('style')
      el.id = 'tapestry-custom-css'
      document.head.appendChild(el)
    }
    el.textContent = customCss
    return () => el?.remove()
  }, [customCss])

  return null
}
