/**
 * Embeds the texts of the recall bench with a REAL local model, so `test/rp-recall-mrr-bench.test.ts` can score it next to the mock
 * embedders and the search words (issue #216, research). Nothing here ships: it is a measuring tool.
 *
 *   1. RECALL_DUMP=/tmp/texts.json bun test test/rp-recall-mrr-bench.test.ts     (writes the texts the bench will ask for)
 *   2. bun scripts/recall-embed.ts <preset> /tmp/texts.json [--lib <path to @huggingface/transformers>] [--dtype q8] [--tag <name>]
 *   3. bun test test/rp-recall-mrr-bench.test.ts                                  (prints one more row per vector file)
 *
 * The model runs through transformers.js (ONNX runtime on the CPU). The library is not a dependency of the app, so install it somewhere
 * else (`bun add @huggingface/transformers` in a scratch folder) and point `--lib` at its folder. Models download from Hugging Face on
 * first use into ~/.hfcache. Output: test/fixtures/recall-vec/<tag>.json (gitignored: some MB per model), plus <tag>.meta.txt with
 * the timing and the memory the run took.
 *
 * A document (fact, chapter) and a query (the scan window of a reply) are embedded with the model's own recommended prefix or prompt;
 * `--raw` drops them, which is what Litopys does today (`host.llm.embed` sends the text as it is).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type Preset = { model: string; dtype?: string; pooling: "mean" | "cls" | "last_token"; docPre?: string; queryPre?: string; pooled?: boolean };
// pooled: the ONNX file pools by itself and answers `sentence_embedding` (no `last_hidden_state`), so the pipeline cannot be used: model + tokenizer directly

const PRESETS: Record<string, Preset> = {
  "e5-small": { model: "Xenova/multilingual-e5-small", pooling: "mean", docPre: "passage: ", queryPre: "query: " },
  "e5-base": { model: "Xenova/multilingual-e5-base", pooling: "mean", docPre: "passage: ", queryPre: "query: " },
  "minilm-multi": { model: "Xenova/paraphrase-multilingual-MiniLM-L12-v2", pooling: "mean" },
  "bge-m3": { model: "Xenova/bge-m3", pooling: "cls" },
  "arctic-m-v2": { model: "Snowflake/snowflake-arctic-embed-m-v2.0", pooling: "cls", queryPre: "query: " },
  embeddinggemma: { model: "onnx-community/embeddinggemma-300m-ONNX", pooling: "mean", docPre: "title: none | text: ", queryPre: "task: search result | query: " },
  "embeddinggemma-2": { model: "onnx-community/embeddinggemma-2-ONNX", pooling: "mean", docPre: "title: none | text: ", queryPre: "task: search result | query: " },
  "harrier-270m": { model: "onnx-community/harrier-oss-v1-270m-ONNX", pooling: "last_token", pooled: true, queryPre: "Instruct: Given a question about a story, retrieve the passage that answers it\nQuery: " },
  "harrier-0.6b": { model: "onnx-community/harrier-oss-v1-0.6b-ONNX", pooling: "last_token", pooled: true, queryPre: "Instruct: Given a question about a story, retrieve the passage that answers it\nQuery: " },
  "granite-97m": { model: "onnx-community/granite-embedding-97m-multilingual-r2-ONNX", pooling: "cls" },
  "granite-311m": { model: "onnx-community/granite-embedding-311m-multilingual-r2-ONNX", pooling: "cls" },
  "horizon-small": { model: "Horizon-Labs/multilingual-embedding-small", pooling: "mean", pooled: true },
  "qwen3-0.6b": { model: "onnx-community/Qwen3-Embedding-0.6B-ONNX", pooling: "last_token", queryPre: "Instruct: Given a question about a story, retrieve the passage that answers it\nQuery: " },
};

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf("--" + name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const raw = args.includes("--raw");
if (raw) args.splice(args.indexOf("--raw"), 1);
const lib = flag("lib") ?? "@huggingface/transformers";
const dtypeArg = flag("dtype");
const tagArg = flag("tag");
const [presetName, textsFile] = args;
const preset = presetName ? PRESETS[presetName] : undefined;
if (!preset || !textsFile) {
  console.error(`usage: bun scripts/recall-embed.ts <${Object.keys(PRESETS).join("|")}> <texts.json> [--lib dir] [--dtype q8|q4|fp16|fp32] [--tag name] [--raw]`);
  process.exit(1);
}
const dtype = dtypeArg ?? preset.dtype ?? "q8";
const tag = tagArg ?? presetName + (raw ? "-raw" : "") + (dtypeArg ? "-" + dtypeArg : "");
const { doc, query } = JSON.parse(fs.readFileSync(textsFile, "utf8")) as { doc: string[]; query: string[] };

const tf = await import(lib);
tf.env.cacheDir = path.join(os.homedir(), ".hfcache");
const t0 = Date.now();
let extractor: (texts: string[], opts: { pooling: string; normalize: boolean }) => Promise<{ tolist(): number[][] }>;
if (preset.pooled) {
  const tok = await tf.AutoTokenizer.from_pretrained(preset.model);
  const model = await tf.AutoModel.from_pretrained(preset.model, { dtype, device: "cpu" });
  extractor = async (texts) => {
    const out = await model(tok(texts, { padding: true, truncation: true }));
    const rows = (out.sentence_embedding.tolist() as number[][]).map((v) => {
      const n = Math.sqrt(v.reduce((t, x) => t + x * x, 0)) || 1;
      return v.map((x) => x / n);
    });
    return { tolist: () => rows };
  };
} else extractor = await tf.pipeline("feature-extraction", preset.model, { dtype, device: "cpu" });
const loadMs = Date.now() - t0;

const BATCH = 16;
async function run(texts: string[], pre: string) {
  const out: Record<string, number[]> = {};
  for (let i = 0; i < texts.length; i += BATCH) {
    const part = texts.slice(i, i + BATCH);
    const res = await extractor(part.map((t) => pre + t), { pooling: preset!.pooling, normalize: true });
    const rows = res.tolist() as number[][];
    part.forEach((t, j) => (out[t] = rows[j]!.map((x) => Math.round(x * 1e4) / 1e4)));
    if (((i / BATCH) | 0) % 20 === 0) process.stderr.write(`\r${tag}: ${Math.min(i + BATCH, texts.length)}/${texts.length}   `);
  }
  return out;
}
const t1 = Date.now();
const docVec = await run(doc, raw ? "" : preset.docPre ?? "");
const docMs = Date.now() - t1;
const t2 = Date.now();
const queryVec = await run(query, raw ? "" : preset.queryPre ?? "");
const queryMs = Date.now() - t2;
process.stderr.write("\n");

const dir = path.join(import.meta.dir, "..", "test", "fixtures", "recall-vec");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, tag + ".json"), JSON.stringify({ doc: docVec, query: queryVec }));
const dim = Object.values(docVec)[0]!.length;
const meta = `${tag}: ${preset.model} dtype ${dtype}${raw ? " (no prefixes)" : ""}, dim ${dim}, load ${loadMs} ms, ${doc.length} docs in ${docMs} ms (${((docMs / doc.length) | 0)} ms each, batches of ${BATCH}), ${query.length} queries in ${queryMs} ms (${((queryMs / query.length) | 0)} ms each), peak RSS ${Math.round(process.resourceUsage().maxRSS / 1024)} MB, ${os.cpus().length} cores`;
fs.writeFileSync(path.join(dir, tag + ".meta.txt"), meta + "\n");
console.log(meta);
