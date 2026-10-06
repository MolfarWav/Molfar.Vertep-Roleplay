import { useRelativeTime, useT } from '@/hooks/use-t'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { LitChapter, LitChat } from './litopys-api'

export function ChapterList({
  chapters,
  scene,
  sceneFromNo,
}: {
  chapters: LitChapter[]
  scene: LitChat['scene']
  sceneFromNo: number
}) {
  const t = useT()
  const rel = useRelativeTime()

  return (
    <div className="flex flex-col gap-2">
      {chapters.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('lit.noChapters')}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {chapters.map((chapter) => (
            <li key={chapter.id}>
              <div className="min-w-0 rounded-md border border-border bg-card p-3">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  {chapter.label ? (
                    <span className="min-w-0 break-words text-sm font-medium">
                      {chapter.label}
                    </span>
                  ) : (
                    <span className="min-w-0 break-words text-sm font-medium text-muted-foreground">
                      {chapter.id}
                    </span>
                  )}
                  <Badge variant="outline" className="text-[10px]">
                    {chapter.fromNo > 0
                      ? t('lit.range', {
                          from: chapter.fromNo,
                          to: chapter.toNo,
                          n: chapter.count,
                        })
                      : t('lit.rangeGone', { n: chapter.count })}
                  </Badge>
                  {chapter.stale && (
                    <Badge
                      variant="destructive"
                      className="text-[10px]"
                      title={t('lit.staleHint')}
                    >
                      {t('lit.stale')}
                    </Badge>
                  )}
                  {chapter.edited && (
                    <Badge variant="secondary" className="text-[10px]">
                      {t('lit.edited')}
                    </Badge>
                  )}
                  {chapter.kind === 'part' && (
                    <Badge variant="secondary" className="text-[10px]">
                      {t('lit.kind.part')}
                    </Badge>
                  )}
                  {chapter.kind === 'merged' && (
                    <Badge variant="secondary" className="text-[10px]">
                      {t('lit.kind.merged')}
                    </Badge>
                  )}
                  {chapter.place && (
                    <span className="text-[11px] text-muted-foreground">
                      {chapter.place}
                    </span>
                  )}
                </div>
                <p
                  className={cn(
                    'mt-1.5 text-sm leading-relaxed whitespace-pre-wrap break-words',
                    chapter.stale && 'opacity-70'
                  )}
                >
                  {chapter.text}
                </p>
                {chapter.at > 0 && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {rel(chapter.at)}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      {scene.openFrom && (
        <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
          {t('lit.scene', {
            label: scene.label || t('lit.sceneNoLabel'),
            n: sceneFromNo > 0 ? sceneFromNo : '?',
          })}
        </div>
      )}
    </div>
  )
}
