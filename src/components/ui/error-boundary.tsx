import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Warning } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { copyText } from '@/lib/utils'

/** What a render error says, with the first app frames of its stack: the text
 *  a user pastes to Molfar so it can find the cause. */
function details(error: Error, info?: ErrorInfo): string {
  const frames = (info?.componentStack ?? '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 6)
  return [`${error.name}: ${error.message}`, ...frames].join('\n')
}

/** Catches a render error in one part of the app, so the rest keeps working.
 *  Without it React unmounts the whole page and the frame shows only the
 *  browser's bare error. `resetKey`: a new value (another character, another
 *  section) tries the children again. */
export class ErrorBoundary extends Component<
  { children: ReactNode; resetKey?: unknown; what?: string },
  { error: Error | null; info?: ErrorInfo; key?: unknown }
> {
  state: { error: Error | null; info?: ErrorInfo; key?: unknown } = { error: null, key: this.props.resetKey }

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  static getDerivedStateFromProps(props: { resetKey?: unknown }, state: { error: Error | null; key?: unknown }) {
    return props.resetKey !== state.key ? { error: null, info: undefined, key: props.resetKey } : null
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info })
    console.error(`[roleplay] ${this.props.what ?? 'a page'} failed to render:`, error)
  }

  render() {
    const { error, info } = this.state
    if (!error) return this.props.children
    const text = details(error, info)
    return (
      <div role="alert" className="m-4 flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
        <div className="flex items-start gap-2">
          <Warning className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-medium">{this.props.what ? `${this.props.what} could not be shown.` : 'This page could not be shown.'}</p>
            <p className="text-xs text-muted-foreground">
              Usually a saved file holds a value the page does not expect. The rest of the app still works. Copy the details and send them to Molfar.
            </p>
          </div>
        </div>
        <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 font-mono text-[11px] leading-snug whitespace-pre-wrap select-text">{text}</pre>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void copyText(text).then((ok) => (ok ? toast.success('Details copied.') : toast.error('Could not copy: select the text above instead.')))
            }}
          >
            Copy details
          </Button>
          <Button variant="outline" size="sm" onClick={() => this.setState({ error: null, info: undefined })}>Try again</Button>
        </div>
      </div>
    )
  }
}
