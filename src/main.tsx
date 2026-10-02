// The roleplay studio frontend. Client state lives in the zustand store;
// generation and persistence go through the engine's app routes
// (/v1/apps/roleplay/*) and the WS bus.
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/noto-sans";
import "@fontsource/kurale";
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
