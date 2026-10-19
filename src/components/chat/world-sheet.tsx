// The World DM sheet (plugins/world, #52): one chat's DM, from the chat menu or the header
// globe. It shows what the DM is set to and how it went, never the world itself: that stays
// the DM's (the prompt Inspector shows what reaches the model). The controls are shared with
// the World section's Overview tab.

import { GlobeHemisphereWest } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { WorldControls } from '@/components/world/world-controls'
import { useT } from '@/hooks/use-t'
import { useApp } from '@/lib/store'

export function WorldSheet({ chatId, open, onOpenChange }: { chatId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 pr-8">
            <GlobeHemisphereWest className="size-4 shrink-0" aria-hidden="true" />
            {t('world.title')}
          </SheetTitle>
          <SheetDescription>{t('world.lead')}</SheetDescription>
          <Button
            variant="outline"
            size="sm"
            className="mt-1 self-start max-md:h-10"
            onClick={() => {
              onOpenChange(false)
              useApp.getState().focusWorldChat(chatId)
            }}
          >
            {t('world.openInWorld')}
          </Button>
        </SheetHeader>
        {open && (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4">
            <WorldControls chatId={chatId} where="sheet" onNavigate={() => onOpenChange(false)} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
