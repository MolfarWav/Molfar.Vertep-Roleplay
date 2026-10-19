
import { Toaster as Sonner, toast, type ToasterProps } from "sonner"
import { CheckCircle, Info, Warning, WarningOctagon, CircleNotch } from '@phosphor-icons/react'
import { useApp } from "@/lib/store"

// An error stays long enough to read (8 s); a caller that passes its own duration keeps it.
const ERROR_MS = 8000
const plainError = toast.error
toast.error = (message, data) => plainError(message, { duration: ERROR_MS, ...data })

// A toast is tinted by its type so an error cannot be mistaken for a note: red, amber, green, blue,
// neutral for a plain one. Opaque in both themes (it floats over chat text), borders carry the hue.
const TYPE_CLASSES = {
  error: "!border-red-400 !bg-red-50 !text-red-900 dark:!border-red-700 dark:!bg-red-950 dark:!text-red-100",
  warning: "!border-amber-400 !bg-amber-50 !text-amber-950 dark:!border-amber-700 dark:!bg-amber-950 dark:!text-amber-100",
  success: "!border-emerald-400 !bg-emerald-50 !text-emerald-950 dark:!border-emerald-700 dark:!bg-emerald-950 dark:!text-emerald-100",
  info: "!border-sky-400 !bg-sky-50 !text-sky-950 dark:!border-sky-700 dark:!bg-sky-950 dark:!text-sky-100",
}

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useApp((s) => s.settings.themeMode)

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CheckCircle className="size-4" />
        ),
        info: (
          <Info className="size-4" />
        ),
        warning: (
          <Warning className="size-4" />
        ),
        error: (
          <WarningOctagon className="size-4" />
        ),
        loading: (
          <CircleNotch className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
          ...TYPE_CLASSES,
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
