// TTS — two real paths:
//  · "System (Web Speech)" — browser voices, instant, offline.
//  · "Engine" — POST /v1/audio/speech: the engine resolves an OpenAI-
//    compatible speech endpoint from its own connections (keys never leave).
import { useSyncExternalStore } from 'react'
import { engineSpeech } from '@/lib/engine'
import { cleanedText } from './tts-clean'
import type { AppSettings } from './types'

export const TTS_PROVIDERS = ['None', 'System (Web Speech)', 'Engine'] as const

/** OpenAI-compatible voice names understood by most speech endpoints. */
export const ENGINE_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer']


let engineAudio: HTMLAudioElement | null = null
// the blob URL behind engineAudio — revoked on end AND on stop, since a
// stopped clip never fires its ended handler
let engineAudioUrl: string | null = null

// ── speaking state ── while a message talks, its speaker control becomes
// stop button while it talks; the speaking row needs to know it's the one
// playing. Key is `${chatId}:${messageId}` from the chat, arbitrary elsewhere.
let speakingKey: string | null = null
let speakToken = 0
const speakingSubs = new Set<() => void>()
const setSpeaking = (key: string | null) => {
  speakingKey = key
  for (const fn of speakingSubs) fn()
}

/** Key of whatever is currently speaking (null = silence). */
export function useSpeakingKey(): string | null {
  return useSyncExternalStore(
    (cb) => { speakingSubs.add(cb); return () => speakingSubs.delete(cb) },
    () => speakingKey,
  )
}

/** Speak text honoring the TTS settings. Returns false when nothing plays
 *  (provider off / nothing to say); rejects if the engine provider fails. */
export async function speakText(text: string, tts: AppSettings['tts'], key = 'tts'): Promise<boolean> {
  if (tts.provider === 'None') return false
  const out = cleanedText(text, tts)
  if (!out) return false
  stopSpeaking()
  // mark speaking BEFORE the engine clip loads so Stop works during the fetch
  const token = ++speakToken
  setSpeaking(key)
  if (tts.provider === 'Engine') {
    // an edge ShortName (en-US-AriaNeural) selects the keyless edge source;
    // a known endpoint voice name (alloy…) selects the endpoint — regardless
    // of the global source setting, so per-character voices can mix both
    const voice = tts.narratorVoice || ''
    const isEdgeVoice = /^[a-z]{2}-[A-Z]{2}-/.test(voice)
    const isEdge = isEdgeVoice || (!ENGINE_VOICES.includes(voice) && (tts.engineProvider ?? 'edge') === 'edge')
    const request = (format?: 'webm') => engineSpeech({
      text: out.slice(0, 4000),
      provider: isEdge ? 'edge' : 'endpoint',
      ...(isEdge ? {} : { endpointId: tts.engineProvider, model: tts.model || 'tts-1' }),
      voice: isEdge ? (isEdgeVoice ? voice : 'en-US-AriaNeural') : (voice || 'alloy'),
      speed: tts.speed,
      ...(format ? { format } : {}),
    })
    // the clip arrives as a Blob: media data: URLs fail to load in some
    // webviews even when the bytes are a valid MP3, blob URLs don't
    const playBlob = async (blob: Blob) => {
      const url = URL.createObjectURL(blob)
      if (token !== speakToken) { URL.revokeObjectURL(url); return }
      const audio = new Audio(url)
      engineAudio = audio
      engineAudioUrl = url
      const done = () => {
        if (token === speakToken) { engineAudio = null; engineAudioUrl = null; setSpeaking(null) }
        URL.revokeObjectURL(url)
      }
      audio.onended = done
      audio.onerror = done
      try {
        await audio.play()
      } catch (e) {
        done()
        throw e
      }
    }
    let blob = await request()
    if (token !== speakToken) return true // stopped while the clip was loading
    try {
      await playBlob(blob)
    } catch (e) {
      // some webview builds ship without the proprietary mp3 decoder; opus
      // in webm is native to every chromium — one retry in that format
      if ((e as DOMException)?.name !== 'NotSupportedError' || !isEdge) throw e
      blob = await request('webm')
      if (token !== speakToken) return true
      await playBlob(blob)
    }
    return true
  }
  if (typeof speechSynthesis === 'undefined') return false
  const u = new SpeechSynthesisUtterance(out)
  u.rate = tts.speed
  const voice = speechSynthesis.getVoices().find((v) => v.name.toLowerCase().includes(tts.narratorVoice.toLowerCase()))
  if (voice) u.voice = voice
  const done = () => { if (token === speakToken) setSpeaking(null) }
  u.onend = done
  u.onerror = done
  speechSynthesis.cancel()
  speechSynthesis.speak(u)
  return true
}

/** The TTS settings that apply to ONE speaker: a card's own voice overrides
 *  the narrator voice, so a character sounds the same wherever it is spoken
 *  (a tapped speaker control and auto-play alike). */
export function voiceFor(
  tts: AppSettings['tts'],
  speaker: { voiceProvider?: string; voiceId?: string } | null | undefined,
): AppSettings['tts'] {
  const provider = speaker?.voiceProvider
  if (!provider || provider === 'none') return tts
  return { ...tts, provider, ...(speaker.voiceId ? { narratorVoice: speaker.voiceId } : {}) }
}

export function stopSpeaking() {
  speakToken++ // invalidate the stopped clip's outstanding load/end events
  setSpeaking(null)
  if (engineAudio) { engineAudio.pause(); engineAudio = null }
  if (engineAudioUrl) { URL.revokeObjectURL(engineAudioUrl); engineAudioUrl = null }
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
}

const EDGE_LANG_NAMES: Record<string, string> = {
  'en-US': 'English (US)', 'en-GB': 'English (UK)', 'en-AU': 'English (Australia)',
  'en-IE': 'English (Ireland)', 'en-IN': 'English (India)', 'en-CA': 'English (Canada)',
  'es-ES': 'Spanish (Spain)', 'es-MX': 'Spanish (Mexico)', 'fr-FR': 'French (France)',
  'fr-CA': 'French (Canada)', 'de-DE': 'German', 'it-IT': 'Italian', 'pt-BR': 'Portuguese (Brazil)',
  'pt-PT': 'Portuguese (Portugal)', 'nl-NL': 'Dutch', 'pl-PL': 'Polish', 'ru-RU': 'Russian',
  'tr-TR': 'Turkish', 'ja-JP': 'Japanese', 'ko-KR': 'Korean', 'zh-CN': 'Chinese (Mandarin)',
  'zh-TW': 'Chinese (Taiwan)', 'ar-EG': 'Arabic (Egypt)', 'ar-SA': 'Arabic (Saudi)',
  'hi-IN': 'Hindi', 'id-ID': 'Indonesian', 'vi-VN': 'Vietnamese', 'th-TH': 'Thai', 'uk-UA': 'Ukrainian',
}

/** "en-US-AriaNeural" → "Aria · English (US)". The ShortName stays the wire
 *  value (the service requires it verbatim); only the menu shows a label. */
export function edgeVoiceLabel(v: string): string {
  const m = /^([a-z]{2}-[A-Z]{2})-(.+?)Neural$/.exec(v)
  const lang = m?.[1]
  return m && lang ? `${m[2]} · ${EDGE_LANG_NAMES[lang] ?? lang}` : v
}
