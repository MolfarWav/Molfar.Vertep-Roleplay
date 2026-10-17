import { useAttention, totalOf } from '@/lib/attention'
import type { ViewKey } from '@/lib/store'
import { cn } from '@/lib/utils'

/** How many items wait on the player behind a section (#55); 0 for sections with none. */
export function useSectionAttention(key: ViewKey | string): number {
  return useAttention((s) => (key === 'litopys' ? totalOf(s.litopys) : 0))
}

/** How many Litopys proposals wait in one chat. */
export function useChatAttention(chatId: string): number {
  return useAttention((s) => s.litopys[chatId] ?? 0)
}

/** A small count pill; `dot` sits on the corner of an icon, otherwise it flows inline. */
export function NeedsYouBadge({ count, dot, className }: { count: number; dot?: boolean; className?: string }) {
  if (count <= 0) return null
  return (
    <span
      aria-hidden="true"
      data-testid="needs-you-badge"
      className={cn(
        'inline-flex min-w-[18px] items-center justify-center rounded-full bg-cta px-1 text-[11px] font-semibold leading-[18px] text-cta-foreground',
        dot && 'pointer-events-none absolute -top-1.5 -right-2 ring-2 ring-card',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}
