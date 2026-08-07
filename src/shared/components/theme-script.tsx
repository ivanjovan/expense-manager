/**
 * Sets `.dark`/`.light` on <html> before hydration so there's no
 * flash-of-wrong-theme. Runs as a plain blocking script in <head> —
 * see app/[locale]/layout.tsx.
 */
const THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var root = document.documentElement;
    if (stored === "dark" || stored === "light") {
      root.classList.add(stored);
    }
  } catch (e) {}
})();
`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}
