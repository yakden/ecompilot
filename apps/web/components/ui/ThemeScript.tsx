/**
 * ThemeScript — renders an inline <script> tag that reads localStorage and
 * applies the correct `dark` / `light` class to <html> BEFORE React hydrates.
 * This prevents a flash of the wrong theme (FOUC).
 *
 * The script content is a static string literal — no user input is interpolated.
 */

// All parts are compile-time string literals — safe to inline.
const SCRIPT =
  "(function(){try{var s=localStorage.getItem('ecompilot-theme');" +
  "var t=(s==='light'||s==='dark'||s==='system')?s:'system';" +
  "var r=t==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;" +
  "document.documentElement.classList.remove('light','dark');" +
  "document.documentElement.classList.add(r);}catch(e){}})();";

// eslint-disable-next-line @typescript-eslint/naming-convention
export function ThemeScript() {
  // Static constant only — equivalent to writing the script inline in HTML.
  // biome-ignore lint/security/noDangerouslySetInnerHtml: static constant
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
