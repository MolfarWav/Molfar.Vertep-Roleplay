import fs from "node:fs";
const edit = (file, a, b) => { let s = fs.readFileSync(file, "utf8"); if (!s.includes(a)) throw new Error(file + " missing"); fs.writeFileSync(file, s.replace(a, () => b)); };
edit("docs/DATA-FORMATS.md",
  "`url` is a data URL inside card.json; imports downscale them so the file stays under the 4 MB a plugin may write), and the one shown by default. |",
  "`url` is `/v1/assets/<id>` (the engine's asset store: sprites added or imported since Roleplay 4.74.0, up to 1024 px, WebP with transparency) or a data URL (older sprites, at most 256-768 px; they move to the asset store the next time the card's sprites are edited, and an import into an engine without the store still falls back to data URLs of a shrunk size)), and the one shown by default. |");
const skill = (f) => edit(f, "- `/studio/expressions` holds the emotion images (base64): never print it.",
  "- `/studio/expressions` holds the emotion images (a `/v1/assets/<id>` URL, or base64 in older cards): never print a base64 value. Do not write sprite images into the card by hand; the editor's Sprites tab stores them.");
skill(".skills/edit-large-card/SKILL.md");
skill("/e/Claude/Chrysalis-Engine/.fork/app-skills/roleplay/edit-large-card/SKILL.md");
edit("CHANGELOG.md", "## Unreleased\n", "## Unreleased\n\n- Expression sprites keep their quality and the limit on how many a card holds is gone (#167). A sprite added in the editor, or one that comes with an imported card (charx, RisuAI PNG), is stored in the engine's asset store as a WebP with its transparency, up to 1024 px on the long side (was 256 px in the editor and 192-768 px in an import, shrunk until the whole pack fitted 2.8 MB), and the card keeps only its URL. Older sprites kept as data URLs move to the store the next time the card's sprites are edited. An engine without the asset store falls back to the old shrunk data URLs. Card format: a sprite `url` may be `/v1/assets/<id>` (`docs/DATA-FORMATS.md`).");
