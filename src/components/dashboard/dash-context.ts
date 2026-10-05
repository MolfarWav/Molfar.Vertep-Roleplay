// The open chat's dashboard as a React context. Kept apart from dash-mount so the notebook
// and thread lists can read it without importing the mount (which imports them).

import { createContext, useContext } from 'react'
import type { UseDashboard } from './use-dashboard'

export const DashCtx = createContext<UseDashboard | null>(null)

/** The open chat's dashboard, or null outside a provider (the live line also renders in chats without one). */
export function useDashMaybe(): UseDashboard | null {
  return useContext(DashCtx)
}

/** A change to the user's notes or threads (POST /dashboard/notes); false when it failed (the toast says why). */
export type NotesAct = (body: { op: string } & Record<string, unknown>) => Promise<boolean>

const none: NotesAct = async () => false

export function useNotesAct(): NotesAct {
  return useContext(DashCtx)?.act ?? none
}
