// ── Import/export interop: browser downloads, plus re-exports of the pure
// portable-shape converters (card PNG reading included) ──
export { presetExport, presetImport, presetImportFull, regexImport, regexExport, extractCharaFromPng } from './import-shapes.js'
import { saveFile } from './export'

// ─── Download helper ───
export function downloadJson(data: unknown, filename: string) {
  saveFile(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), filename.endsWith('.json') ? filename : `${filename}.json`)
}
