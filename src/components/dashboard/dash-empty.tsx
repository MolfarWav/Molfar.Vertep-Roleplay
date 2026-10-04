import { useT } from '@/hooks/use-t'
import { Button } from '@/components/ui/button'

export function DashEmpty({ hasMessages, onBuild, building, error }: {
  hasMessages: boolean
  onBuild: () => void
  building: boolean
  error: string | null
}) {
  const t = useT()
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-8 text-center min-w-0">
      <h2 className="font-heading text-lg">{t('dash.empty.title')}</h2>
      <p className="text-sm text-muted-foreground max-w-md break-words">{t('dash.empty.body')}</p>
      {hasMessages ? (
        <Button onClick={onBuild} disabled={building}>
          {building ? t('dash.refreshing') : t('dash.empty.build')}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">{t('dash.empty.noMessages')}</p>
      )}
      {error && <p className="text-sm text-destructive break-words">{t('dash.error', { message: error })}</p>}
    </div>
  )
}

