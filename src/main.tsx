// The roleplay studio frontend. Client state lives in the zustand store;
// generation and persistence go through the engine's app routes
// (/v1/apps/roleplay/*) and the WS bus.
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/noto-sans";
import "@fontsource/kurale";
import "@fontsource/noto-serif/400.css";
import "@fontsource/noto-serif/700.css";
import "@fontsource/noto-serif/400-italic.css";
// Fonts a reply may name with font-family (see REPLY_FONTS in lib/reply-fonts.ts):
// Latin and Cyrillic only, so a Ukrainian reply gets the same face as an English one.
// The browser fetches a file only when a page actually uses the family.
import "@fontsource/caveat/latin-400.css";
import "@fontsource/caveat/cyrillic-400.css";
import "@fontsource/caveat/latin-700.css";
import "@fontsource/caveat/cyrillic-700.css";
import "@fontsource/marck-script/latin-400.css";
import "@fontsource/marck-script/cyrillic-400.css";
import "@fontsource/lobster/latin-400.css";
import "@fontsource/lobster/cyrillic-400.css";
import "@fontsource/playfair-display/latin-400.css";
import "@fontsource/playfair-display/cyrillic-400.css";
import "@fontsource/playfair-display/latin-700.css";
import "@fontsource/playfair-display/cyrillic-700.css";
import "@fontsource/playfair-display/latin-400-italic.css";
import "@fontsource/playfair-display/cyrillic-400-italic.css";
import "@fontsource/cormorant-garamond/latin-400.css";
import "@fontsource/cormorant-garamond/cyrillic-400.css";
import "@fontsource/cormorant-garamond/latin-700.css";
import "@fontsource/cormorant-garamond/cyrillic-700.css";
import "@fontsource/cormorant-garamond/latin-400-italic.css";
import "@fontsource/cormorant-garamond/cyrillic-400-italic.css";
import "@fontsource/oswald/latin-400.css";
import "@fontsource/oswald/cyrillic-400.css";
import "@fontsource/oswald/latin-700.css";
import "@fontsource/oswald/cyrillic-700.css";
import "@fontsource/pt-mono/latin-400.css";
import "@fontsource/pt-mono/cyrillic-400.css";
import "@fontsource/ruslan-display/latin-400.css";
import "@fontsource/ruslan-display/cyrillic-400.css";
import "./globals.css";
import { AppShell } from "@/components/shell/app-shell";
import { noteReload } from "@/lib/engine";

// Live editing reloads the page for changes it cannot patch in (a dependency
// it had to pre-bundle, a module with no accepting parent). Those reloads look
// exactly like the app deciding to reload itself, so they leave the same note
// — an unexplained reload is then definitely the browser's, not ours. Stripped
// from the build: `import.meta.hot` only exists while a dev server serves the page.
if (import.meta.hot) {
  import.meta.hot.on("chrysalis:beforeFullReload", () => noteReload("Reloaded: live editing could not patch a change in place"));
}

createRoot(document.getElementById("app")!).render(<AppShell />);
