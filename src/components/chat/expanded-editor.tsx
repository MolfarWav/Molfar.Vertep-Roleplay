import { useEffect, useRef, useState } from "react"
import { TextB, TextItalic, Code, Quotes, ArrowsIn, PaperPlaneRight, ArrowsOutLineVertical, ArrowsInLineVertical } from '@phosphor-icons/react'
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { estimateTokens } from "@/lib/tokens"


const SIZE_KEY = "rp.composer.expandSize"

/**
 * Full-height writing surface for long-form replies — the Shift+Tab
 * "expand input" behaviour. The composer keeps ownership of the text; this is a
 * controlled view over the same value so closing it never loses a draft.
 */
export function ExpandedEditor({
  open,
  onOpenChange,
  value,
  onChange,
  onSend,
  canSend,
  placeholder,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  value: string
  onChange: (v: string) => void
  onSend: () => void
  canSend: boolean
  placeholder?: string
}) {
  // full height or half: half keeps the chat above in view (remembered on this device)
  const [half, setHalf] = useState(() => {
    try { return localStorage.getItem(SIZE_KEY) === "half" } catch { return false }
  })
  const toggleHalf = () => {
    const next = !half
    setHalf(next)
    try { localStorage.setItem(SIZE_KEY, next ? "half" : "full") } catch { /* storage unavailable */ }
  }
  const ref = useRef<HTMLTextAreaElement>(null)

  // Land the caret at the end of the existing draft when the surface opens.
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    })
    return () => cancelAnimationFrame(id)
  }, [open])

  /** Wraps the selection in markdown delimiters, or inserts an empty pair. */
  const wrap = (before: string, after = before) => {
    const el = ref.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e } = el
    const selected = value.slice(s, e)
    const next = value.slice(0, s) + before + selected + after + value.slice(e)
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(s + before.length, s + before.length + selected.length)
    })
  }

  const prefixLine = (token: string) => {
    const el = ref.current
    if (!el) return
    const s = el.selectionStart
    const lineStart = value.lastIndexOf("\n", s - 1) + 1
    const next = value.slice(0, lineStart) + token + value.slice(lineStart)
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(s + token.length, s + token.length)
    })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    // Shift+Tab collapses back to the inline composer, mirroring the expand hotkey.
    if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault()
      onOpenChange(false)
      return
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (canSend) onSend()
      return
    }
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); wrap("**") }
    if (mod && e.key.toLowerCase() === "i") { e.preventDefault(); wrap("*") }
  }

  const words = value.trim() ? value.trim().split(/\s+/).length : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={`flex ${half ? "h-[55dvh]" : "h-[92dvh]"} max-h-none w-[calc(100vw-1rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100vw-4rem)]`}
      >
        <DialogHeader className="flex-row items-center gap-1 space-y-0 border-b border-border px-2 py-1.5">
          <DialogTitle className="mr-1 pl-1 text-xs font-medium text-muted-foreground">Compose</DialogTitle>
          <MdBtn label="Bold (Ctrl+B)" onClick={() => wrap("**")}><TextB aria-hidden="true" /></MdBtn>
          <MdBtn label="Italic (Ctrl+I)" onClick={() => wrap("*")}><TextItalic aria-hidden="true" /></MdBtn>
          <MdBtn label="Inline code" onClick={() => wrap("`")}><Code aria-hidden="true" /></MdBtn>
          <MdBtn label="Blockquote" onClick={() => prefixLine("> ")}><Quotes aria-hidden="true" /></MdBtn>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 gap-1 px-2 text-xs"
            onClick={toggleHalf}
            aria-label={half ? "Use the whole screen" : "Use half the screen"}
            title={half ? "Use the whole screen" : "Use half the screen"}
          >
            {half ? <ArrowsOutLineVertical aria-hidden="true" /> : <ArrowsInLineVertical aria-hidden="true" />}
            {half ? "Full" : "Half"}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onOpenChange(false)}
            aria-label="Collapse editor (Shift+Tab)"
          >
            <ArrowsIn aria-hidden="true" />
          </Button>
        </DialogHeader>

        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label="Expanded message editor"
          autoCorrect="off"
          autoCapitalize="sentences"
          spellCheck={false}
          className="min-h-0 flex-1 resize-none bg-transparent px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
        />

        <div className="flex shrink-0 items-center gap-3 border-t border-border px-3 py-2">
          <p className="text-[11px] tabular-nums text-muted-foreground" aria-live="polite">
            {words} {words === 1 ? "word" : "words"} · {estimateTokens(value)} tokens
          </p>
          <p className="ml-auto hidden text-[11px] text-muted-foreground sm:block">
            Shift+Tab to collapse · Ctrl+Enter to send
          </p>
          <Button size="sm" className="gap-1.5" onClick={onSend} disabled={!canSend}>
            <PaperPlaneRight className="size-3.5" aria-hidden="true" />
            Send
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function MdBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant="ghost" size="icon-sm" onClick={onClick} aria-label={label}>
            {children}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
