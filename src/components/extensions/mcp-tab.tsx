import { useCallback, useEffect, useState } from 'react'
import { Plugs } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { fetchAppMcp, setAppMcpUse, type McpServerInfo } from '@/lib/engine'
import { cn } from '@/lib/utils'

const errText = (e: unknown) => String((e as Error)?.message ?? e)

/**
 * MCP tools this app's generations may call. The servers live in the engine:
 * add and share them in Chrysalis settings, then switch one on here to let
 * this app use its tools.
 */
export function McpTab() {
  const [servers, setServers] = useState<McpServerInfo[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const load = useCallback(() => {
    void fetchAppMcp().then(setServers).catch((e) => { setServers([]); toast.error(errText(e)) })
  }, [])
  useEffect(load, [load])

  const toggle = async (id: string, use: boolean) => {
    setBusy(id)
    try { await setAppMcpUse(id, use) } catch (e) { toast.error(errText(e)) } finally { setBusy(null); load() }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3">
        <Plugs className="size-4 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">MCP servers</p>
          <p className="text-xs text-muted-foreground">Servers the engine shares with apps. Switch one on to let the model call its tools here; add or share servers in the Molfar Vertep settings.</p>
        </div>
      </div>

      {servers === null ? (
        <p className="text-xs text-muted-foreground">Connecting to servers…</p>
      ) : servers.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">No servers are shared with apps yet. Add one in the Molfar Vertep settings.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {servers.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
              <span className={cn('size-2 shrink-0 rounded-full', s.connected ? 'bg-emerald-500' : s.error ? 'bg-destructive' : 'bg-muted-foreground/40')} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.id}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.type} · {s.connected ? `${s.tools ?? 0} tools` : s.error ? s.error : 'not connected'}
                </p>
              </div>
              <Switch checked={s.use} disabled={busy === s.id} onCheckedChange={(v) => void toggle(s.id, v)} aria-label={`Use ${s.id} here`} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
