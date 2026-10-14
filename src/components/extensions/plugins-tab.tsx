
import { useCallback, useEffect, useState } from 'react'
import { SquaresFour, CircleNotch, ArrowsClockwise, ShieldCheck, ShieldWarning, Globe } from '@phosphor-icons/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { fetchEnginePlugins, type EnginePluginInfo } from '@/lib/engine'

/**
 * Read-only view of the plugins running behind this app — this app's bundled
 * plugins plus any user-scope ones. Installing (git import) and capability
 * grants are engine-side concerns; nothing here can change either.
 */
export function PluginsTab() {
  const [plugins, setPlugins] = useState<EnginePluginInfo[] | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    try { setPlugins(await fetchEnginePlugins()) } finally { setBusy(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          Plugins run inside the engine. Import from git, enable or disable
          them with the Plugins button on this app's tab in Molfar
          Vertep.
        </p>
        <Button variant="ghost" size="icon-sm" aria-label="Refresh plugins" onClick={() => void load()} disabled={busy}>
          {busy ? <CircleNotch className="size-4 animate-spin" aria-hidden="true" /> : <ArrowsClockwise className="size-4" aria-hidden="true" />}
        </Button>
      </div>

      {plugins !== null && plugins.length === 0 && (
        <p className="text-sm text-muted-foreground">No plugins installed.</p>
      )}

      {plugins?.map((p) => {
        const own = p.source.startsWith('app:')
        // grants only gate git-imported plugins (origin "imported") — bundled
        // ones are trusted as-is, so their manifest permissions ARE the caps
        const imported = p.needsApproval
        const caps = imported ? p.grantedCapabilities : (p.manifest.permissions ?? [])
        const name = p.manifest.name ?? p.id
        return (
          <Card key={`${p.source}/${p.id}`}>
            <CardContent className="flex flex-col gap-2.5 p-4">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <SquaresFour className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 truncate text-sm font-medium">{name}</span>
                {p.manifest.version && <Badge variant="outline" className="text-[10px]">v{p.manifest.version}</Badge>}
                    <Badge variant="secondary" className="text-[10px]">{own ? 'this app' : 'user · all apps'}</Badge>
                    {imported && <Badge variant="outline" className="text-[10px]">imported</Badge>}
                    {p.disabled && <Badge variant="outline" className="text-[10px]">off</Badge>}
                <span className="font-mono text-[10px] text-muted-foreground">{p.id}</span>
              </div>

              {p.manifest.description && (
                <p className="text-xs leading-relaxed text-muted-foreground">{p.manifest.description}</p>
              )}

              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <ShieldCheck className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  {caps.length === 0 && p.pendingCapabilities.length === 0 && (
                    <span className="text-[11px] text-muted-foreground">no capabilities</span>
                  )}
                  {caps.map((c) => (
                    <Badge key={c} className="text-[10px]">{c}</Badge>
                  ))}
                  {imported && p.pendingCapabilities.map((c) => (
                    <Badge key={c} variant="outline" className="text-[10px] text-amber-500 border-amber-500/50">
                      <ShieldWarning className="mr-0.5 size-3" aria-hidden="true" />{c}: needs approval
                    </Badge>
                  ))}
                </div>
                {(p.manifest.networkHosts?.length ?? 0) > 0 && (
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5" aria-label="Allowed network hosts">
                    <Globe className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    {p.manifest.networkHosts!.slice(0, 4).map((h) => (
                      <span key={h} className="truncate font-mono text-[10px] text-muted-foreground">{h}</span>
                    ))}
                    {p.manifest.networkHosts!.length > 4 && (
                      <span className="text-[10px] text-muted-foreground">+{p.manifest.networkHosts!.length - 4} more</span>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </section>
  )
}
