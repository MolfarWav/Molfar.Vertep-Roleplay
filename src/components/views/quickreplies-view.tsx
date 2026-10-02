import { useState } from 'react'

import { Plus, Trash, Lightning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Pager, clampPage } from '@/components/ui/pager'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useApp } from '@/lib/store'
import { SectionPage, PaneTitle } from '@/components/shell/section-page'
import { uid } from '@/lib/tokens'
import { useConfirm } from '@/components/ui/confirm'

export function QuickRepliesView() {
  const qrSets = useApp((s) => s.qrSets)
  const [confirm, confirmDialog] = useConfirm()
  const updateQRSet = useApp((s) => s.updateQRSet)
  const addQRSet = useApp((s) => s.addQRSet)
  const deleteQRSet = useApp((s) => s.deleteQRSet)

  // shortcut sets accumulate; page the editor list (each set is a big card)
  const QR_PAGE = 10
  const [qrPage, setQrPage] = useState(0)
  const pagedSets = qrSets.slice(clampPage(qrPage, qrSets.length, QR_PAGE) * QR_PAGE, (clampPage(qrPage, qrSets.length, QR_PAGE) + 1) * QR_PAGE)

  return (
    <SectionPage section="quickreplies" count={qrSets.length}>
    <div className="flex h-full min-h-0 flex-col">
      {/* header scrolls WITH the sets (mobile keyboard room) */}
      <ScrollArea className="min-h-0 flex-1">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <PaneTitle section="quickreplies" count={`${qrSets.length} sets`} icon={<Lightning className="size-4 text-primary" aria-hidden="true" />} />
        <Button size="sm" className="ml-auto" onClick={() => { addQRSet(); toast.success('New shortcut set created') }}>
          <Plus className="size-4" aria-hidden="true" />New set
        </Button>
      </header>
        <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
          {pagedSets.map((set) => (
            <section key={set.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <Input value={set.name} onChange={(e) => updateQRSet(set.id, { name: e.target.value })} className="h-8 w-48 text-sm font-medium" aria-label="Set name" />
                <Badge variant="outline" className="text-[10px]">{set.scope}</Badge>
                <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch checked={set.enabled} onCheckedChange={(v) => updateQRSet(set.id, { enabled: v })} aria-label={`Enable ${set.name}`} />
                  Show in composer
                </label>
                <Button
                  variant="ghost" size="sm" className="size-7 p-0"
                  onClick={() => void confirm({
                    title: `Delete ${set.name}?`,
                    description: 'Every quick reply in the set goes with it.',
                  }).then((yes) => {
                    if (!yes) return
                    deleteQRSet(set.id); toast.success(`Deleted "${set.name}"`)
                  })}
                  aria-label={`Delete set ${set.name}`}
                >
                  <Trash className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
              <ul className="flex flex-col gap-1.5">
                {set.replies.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border px-2 py-1.5">
                    <input
                      type="color"
                      value={r.color}
                      onChange={(e) => updateQRSet(set.id, { replies: set.replies.map((x) => x.id === r.id ? { ...x, color: e.target.value } : x) })}
                      aria-label="Button color"
                      className="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
                    />
                    <Input
                      value={r.label}
                      onChange={(e) => updateQRSet(set.id, { replies: set.replies.map((x) => x.id === r.id ? { ...x, label: e.target.value } : x) })}
                      className="h-7 w-32 text-xs"
                      aria-label="Reply label"
                    />
                    <Input
                      value={r.message}
                      onChange={(e) => updateQRSet(set.id, { replies: set.replies.map((x) => x.id === r.id ? { ...x, message: e.target.value } : x) })}
                      className="h-7 min-w-40 flex-1 text-xs"
                      aria-label="Reply message"
                    />
                    <Select value={r.mode} onValueChange={(v) => updateQRSet(set.id, { replies: set.replies.map((x) => x.id === r.id ? { ...x, mode: v as never } : x) })}>
                      <SelectTrigger className="h-7 w-24 text-xs" aria-label="Mode"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="send">Send</SelectItem>
                        <SelectItem value="insert">Insert</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost" size="sm" className="size-7 p-0"
                      onClick={() => updateQRSet(set.id, { replies: set.replies.filter((x) => x.id !== r.id) })}
                      aria-label={`Delete ${r.label}`}
                    >
                      <Trash className="size-3.5" aria-hidden="true" />
                    </Button>
                    <div className="flex w-full flex-wrap items-center gap-3 pl-8 text-[11px] text-muted-foreground">
                      <span>Auto-execute:</span>
                      {(['onStartup', 'onUser', 'onAi', 'onChatChange'] as const).map((k) => (
                        <label key={k} className="flex items-center gap-1">
                          <Checkbox
                            checked={r.autoExecute[k]}
                            onCheckedChange={(v) => updateQRSet(set.id, { replies: set.replies.map((x) => x.id === r.id ? { ...x, autoExecute: { ...x.autoExecute, [k]: !!v } } : x) })}
                            aria-label={`${r.label} ${k}`}
                          />
                          {k.replace('on', 'on ')}
                        </label>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
              <Button
                variant="outline" size="sm" className="w-fit text-xs"
                onClick={() => updateQRSet(set.id, { replies: [...set.replies, { id: uid('qr'), label: 'New reply', message: '', color: '#7fb8d9', mode: 'send', autoExecute: { onStartup: false, onUser: false, onAi: false, onChatChange: false } }] })}
              >
                <Plus className="size-3.5" aria-hidden="true" />Add reply
              </Button>
            </section>
          ))}
          <Pager total={qrSets.length} page={clampPage(qrPage, qrSets.length, QR_PAGE)} pageSize={QR_PAGE} onPage={setQrPage} />
          <div className="flex flex-col gap-1 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
            <Label className="text-xs font-medium text-foreground">Automation hooks</Label>
            <p>Replies with auto-execute run when the matching event fires: on app startup, after you send a message, after an AI reply commits, and when a chat opens. Slash forms (/continue, /impersonate, /regenerate, /swipe) run the real actions; plain text is sent as your message.</p>
          </div>
        </div>
      </ScrollArea>
    {confirmDialog}
    </div>
    </SectionPage>
  )
}
