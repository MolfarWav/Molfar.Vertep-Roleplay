/**
 * Join chats back into the shape older Roleplay versions read (Molfar.Vertep#537): one `chats/<id>.jsonl` per chat with
 * every message whole (`swipes` again with the chosen text in it), no `chats/<id>.parts/` and no `transcript` in the meta.
 * Run it on the app's data folder before going back to a version older than the one that brought parts, with the app
 * closed.
 *
 *   bun scripts/chat-join.ts <app data dir> [chatId ...]   every chat, or only these
 *
 * A chat whose whole file would pass the engine's 4 MB write cap is still joined (this runs outside the engine), and
 * listed: an older version cannot save it, as before parts.
 */
import fs from 'node:fs'
import path from 'node:path'
import { chatMessages, chatMetaPath, chatPartsDir, chatTailPath } from '../src/lib/chat-store.js'

const [dir, ...only] = process.argv.slice(2)
if (!dir || !fs.existsSync(path.join(dir, 'chats'))) {
  console.error('usage: bun scripts/chat-join.ts <app data dir> [chatId ...]   (the folder that holds chats/)')
  process.exit(1)
}
const abs = (rel: string) => path.join(dir, rel)
const fsx = {
  read: (rel: string) => fs.readFileSync(abs(rel), 'utf8'),
  list: (rel: string) => fs.readdirSync(abs(rel)).sort(),
}
const ids = only.length ? only : fs.readdirSync(abs('chats')).filter((f) => f.endsWith('.meta.json')).map((f) => f.slice(0, -'.meta.json'.length))
let joined = 0
const big: string[] = []
for (const id of ids) {
  let meta: Record<string, unknown>
  try { meta = JSON.parse(fsx.read(chatMetaPath(id))) } catch { console.error(`${id}: no meta, left as it is`); continue }
  const msgs = chatMessages(fsx, id, meta)
  const text = msgs.map((m: unknown) => JSON.stringify(m)).join('\n') + (msgs.length ? '\n' : '')
  if (Buffer.byteLength(text) >= 4 * 1024 * 1024) big.push(id)
  fs.writeFileSync(abs(chatTailPath(id)), text)
  delete meta.transcript
  fs.writeFileSync(abs(chatMetaPath(id)), JSON.stringify(meta, null, 2) + '\n')
  fs.rmSync(abs(chatPartsDir(id)), { recursive: true, force: true })
  joined++
}
console.log(`joined ${joined} chat(s)`)
if (big.length) console.log(`over 4 MB as one file (an older version cannot save them): ${big.join(', ')}`)
