// Backgrounds as WebP: which images stay as they are.
import { describe, expect, it } from 'bun:test'
import { isAnimated, pickSmaller } from '../src/lib/webp'

const bytes = (...parts: (string | number[])[]) => new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)))
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const le32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]
const pngChunk = (type: string, len: number) => [...be32(len), ...[...type].map((c) => c.charCodeAt(0)), ...new Array(len + 4).fill(0)]
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

describe('webp: animated images stay', () => {
  it('every GIF counts as animated', () => {
    expect(isAnimated(bytes('GIF89a', [0, 0, 0, 0]))).toBe(true)
  })
  it('an APNG (acTL before IDAT) is animated, a plain PNG is not', () => {
    expect(isAnimated(bytes(PNG_SIG, pngChunk('IHDR', 13), pngChunk('acTL', 8), pngChunk('IDAT', 4)))).toBe(true)
    expect(isAnimated(bytes(PNG_SIG, pngChunk('IHDR', 13), pngChunk('IDAT', 4), pngChunk('acTL', 8)))).toBe(false)
  })
  it('an animated WebP (ANIM chunk) is animated, a still one is not', () => {
    const riff = (chunks: number[]) => bytes('RIFF', le32(chunks.length + 4), 'WEBP', chunks)
    const vp8x = [...'VP8X'].map((c) => c.charCodeAt(0)).concat(le32(10), new Array(10).fill(0))
    const anim = [...'ANIM'].map((c) => c.charCodeAt(0)).concat(le32(6), new Array(6).fill(0))
    const vp8 = [...'VP8 '].map((c) => c.charCodeAt(0)).concat(le32(4), new Array(4).fill(0))
    expect(isAnimated(riff([...vp8x, ...anim]))).toBe(true)
    expect(isAnimated(riff([...vp8]))).toBe(false)
    expect(isAnimated(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe(false)
  })
})

describe('webp: the smaller file wins', () => {
  const orig = new Blob([new Uint8Array(1000)], { type: 'image/png' })
  it('keeps the original when the WebP is bigger or not a WebP', () => {
    expect(pickSmaller(orig, new Blob([new Uint8Array(1200)], { type: 'image/webp' }))).toMatchObject({ converted: false, reason: 'bigger' })
    expect(pickSmaller(orig, new Blob([new Uint8Array(10)], { type: 'image/png' }))).toMatchObject({ converted: false, reason: 'no-webp' })
    expect(pickSmaller(orig, null)).toMatchObject({ converted: false, reason: 'no-webp' })
  })
  it('takes the WebP when it is smaller', () => {
    expect(pickSmaller(orig, new Blob([new Uint8Array(400)], { type: 'image/webp' }))).toMatchObject({ converted: true, before: 1000 })
  })
})
