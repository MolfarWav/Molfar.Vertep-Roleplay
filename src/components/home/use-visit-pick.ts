import { useState } from 'react'
import { pickAt } from '@/lib/home-pick'

/** A random index into a list, drawn once when Home mounts (one visit). `another` moves to the next one. */
export function useVisitPick(len: number): { index: number; another: () => void } {
  const [seed] = useState(() => Math.random())
  const [step, setStep] = useState(0)
  return { index: pickAt(seed, len, step), another: () => setStep((s) => s + 1) }
}
