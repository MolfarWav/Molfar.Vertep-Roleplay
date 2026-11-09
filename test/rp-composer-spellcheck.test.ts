import { describe, it, expect } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { DICTIONARIES, type MsgKey } from "../src/lib/i18n"

const read = (p: string) => fs.readFileSync(path.join(import.meta.dir, "..", p), "utf8")

// The message box is plain text by default (invented names, *actions* and macros), but spell check and autocorrect are the
// user's call: two switches in Settings > Chat Behavior, read by the composer and by the expanded editor.
describe("spell check and autocorrect in the message box", () => {
  it("both inputs follow the two settings and are off unless a setting is true", () => {
    for (const file of ["src/components/chat/composer.tsx", "src/components/chat/expanded-editor.tsx"]) {
      const src = read(file)
      expect(src, file).toContain("s.settings.spellCheck === true")
      expect(src, file).toContain("s.settings.autoCorrect === true")
      expect(src, file).toContain("spellCheck={spellCheck}")
      expect(src, file).toContain('autoCorrect={autoCorrect ? "on" : "off"}')
      expect(src, file).not.toContain("spellCheck={false}")
      expect(src, file).not.toContain('autoCorrect="off"')
    }
  })

  it("the switches are in Chat Behavior and carry both languages", () => {
    const view = read("src/components/views/settings-view.tsx")
    for (const key of ["spellCheck", "autoCorrect"]) expect(view).toContain(`key: "${key}"`)
    for (const k of ["composer.spellcheck", "composer.spellcheckHint", "composer.autocorrect", "composer.autocorrectHint"] as MsgKey[]) {
      expect(DICTIONARIES.en[k], k).toBeTruthy()
      expect(DICTIONARIES.uk[k], k).toBeTruthy()
    }
  })

  it("the defaults leave both off: neither key is seeded as on", () => {
    const seed = read("src/lib/seed.ts")
    expect(seed).not.toMatch(/spellCheck:\s*true|autoCorrect:\s*true/)
  })
})
