import { cn } from '@/lib/utils'
import type { MsgKey } from '@/lib/i18n'

export type WeatherKind = 'storm' | 'snow' | 'rain' | 'fog' | 'wind' | 'partly' | 'cloud' | 'clear'

/** Words that name each kind, in English, Ukrainian and Russian: the sensor writes the weather as free text. */
const WORDS: Record<WeatherKind, readonly string[]> = {
  storm: ['thunder', 'storm', 'lightning', 'гроза', 'гроз', 'грім', 'блискавк', 'шторм', 'буря', 'бурі', 'ураган', 'шквал'],
  snow: ['snow', 'blizzard', 'sleet', 'flurr', 'сніг', 'завірюх', 'хуртовин', 'мокрий сніг', 'снег', 'метел'],
  rain: ['rain', 'drizzle', 'shower', 'downpour', 'дощ', 'злив', 'мряк', 'дожд', 'ливен', 'морос'],
  fog: ['fog', 'mist', 'haze', 'smog', 'туман', 'серпанок', 'мла'],
  wind: ['wind', 'breez', 'gust', 'gale', 'вітер', 'вітр', 'вітерц', 'ветер', 'ветр'],
  partly: ['partly', 'scattered cloud', 'broken cloud', 'частково хмар', 'мінлива хмар', 'місцями хмар', 'переменн', 'малохмар'],
  cloud: ['cloud', 'overcast', 'grey sky', 'gray sky', 'хмар', 'похмур', 'пасмурн', 'облачн', 'захмар'],
  clear: ['clear', 'sunny', 'sunshine', 'fair', 'cloudless', 'ясн', 'сонячн', 'сонце', 'безхмарн', 'солнечн', 'солнце'],
}
const ORDER: readonly WeatherKind[] = ['storm', 'snow', 'rain', 'fog', 'wind', 'partly', 'cloud', 'clear']

const STRONG: ReadonlySet<WeatherKind> = new Set(['storm', 'snow', 'rain', 'fog'])

/**
 * What the weather text is about. Storm, snow, rain and fog outrank the rest ("overcast, light rain" is rain);
 * inside a tier the kind named first wins, and on a tie the one listed first above. null when the text names
 * none: no icon then.
 */
export function weatherKind(text: string | null | undefined): WeatherKind | null {
  const s = (text ?? '').toLowerCase()
  if (!s.trim()) return null
  let best: { kind: WeatherKind; at: number; strong: boolean } | null = null
  for (const kind of ORDER) {
    const strong = STRONG.has(kind)
    for (const w of WORDS[kind]) {
      const at = s.indexOf(w)
      if (at < 0) continue
      if (best === null || (strong && !best.strong) || (strong === best.strong && at < best.at)) best = { kind, at, strong }
    }
  }
  return best ? best.kind : null
}

/** A hue for each kind, the 700/300 steps like the Dashboard's tones, so the icon reads at a glance. */
const LOOK: Record<WeatherKind, string> = {
  storm: 'text-violet-700 dark:text-violet-300',
  snow: 'text-cyan-700 dark:text-cyan-200',
  rain: 'text-sky-700 dark:text-sky-300',
  fog: 'text-slate-600 dark:text-slate-300',
  wind: 'text-teal-700 dark:text-teal-300',
  partly: 'text-amber-700 dark:text-amber-300',
  cloud: 'text-slate-600 dark:text-slate-300',
  clear: 'text-amber-700 dark:text-amber-300',
}

/** The colour classes of a kind's icon and name: clear at night is indigo, the rest by kind. */
export const weatherTextClass = (kind: WeatherKind, night?: boolean): string =>
  night && kind === 'clear' ? 'text-indigo-700 dark:text-indigo-300' : LOOK[kind]

/** The dictionary key of a kind's name ("Clear", "Partly cloudy", ...); clear at night is "Clear night". */
export const weatherNameKey = (kind: WeatherKind, night?: boolean): MsgKey =>
  night && kind === 'clear' ? 'dash.wx.clearNight' : (`dash.wx.${kind}` as MsgKey)

const CLOUD ='M6.5 17.5a4 4 0 0 1-.4-7.98 5.5 5.5 0 0 1 10.5-1.02A4.5 4.5 0 0 1 17 17.5H6.5z'

/**
 * A small line icon for the weather that moves a little: rays turn, clouds drift, rain and snow fall, fog slides,
 * lightning flashes. The motion is CSS in globals.css (.wx-*) and stops with reduced motion; the icon is
 * decoration, the text beside it says the weather.
 */
export function WeatherIcon({ kind, night, className, size = 22 }: { kind: WeatherKind; night?: boolean; className?: string; size?: number }) {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315]
  const drop = (x: number, i: number) => <line key={x} className="wx-drop" style={{ animationDelay: `${i * 0.35}s` }} x1={x} y1="17" x2={x - 0.6} y2="19.5" />
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn('shrink-0 overflow-visible', weatherTextClass(kind, night), className)}
      data-weather={kind}
    >
      {kind === 'clear' && night && <path className="wx-glow" d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />}
      {kind === 'clear' && !night && (
        <>
          <circle cx="12" cy="12" r="4" className="wx-glow" />
          <g className="wx-spin">{rays.map((a) => <line key={a} x1="12" y1="3" x2="12" y2="5" transform={`rotate(${a} 12 12)`} />)}</g>
        </>
      )}
      {kind === 'partly' && (
        <>
          <circle cx="8.5" cy="8.5" r="3" className="wx-glow" />
          <g className="wx-spin" style={{ transformOrigin: '8.5px 8.5px' }}>{rays.map((a) => <line key={a} x1="8.5" y1="2" x2="8.5" y2="3" transform={`rotate(${a} 8.5 8.5)`} />)}</g>
          <path className="wx-drift" d={CLOUD} transform="translate(2 2)" />
        </>
      )}
      {kind === 'cloud' && <path className="wx-drift" d={CLOUD} />}
      {kind === 'rain' && (
        <>
          <path className="wx-drift" d={CLOUD} transform="translate(0 -3)" />
          {[8.5, 12, 15.5].map(drop)}
        </>
      )}
      {kind === 'snow' && (
        <>
          <path className="wx-drift" d={CLOUD} transform="translate(0 -3)" />
          {[8.5, 12, 15.5].map((x, i) => <circle key={x} className="wx-flake" style={{ animationDelay: `${i * 0.5}s` }} cx={x} cy="18" r="1.1" fill="currentColor" />)}
        </>
      )}
      {kind === 'storm' && (
        <>
          <path className="wx-drift" d={CLOUD} transform="translate(0 -3)" />
          <path className="wx-flash text-amber-600 dark:text-amber-300" strokeWidth="2" d="M12.8 13.5 9.8 18.2h3l-1.4 4" />
        </>
      )}
      {kind === 'fog' && (
        <>
          <line className="wx-slide" x1="5" y1="9" x2="19" y2="9" />
          <line className="wx-slide wx-slide-b" x1="3" y1="13" x2="17" y2="13" />
          <line className="wx-slide" x1="6" y1="17" x2="20" y2="17" />
        </>
      )}
      {kind === 'wind' && (
        <>
          <path className="wx-slide" d="M3 9h10a2.5 2.5 0 1 0-2.5-2.5" />
          <path className="wx-slide wx-slide-b" d="M3 14h14a2.5 2.5 0 1 1-2.5 2.5" />
        </>
      )}
    </svg>
  )
}
