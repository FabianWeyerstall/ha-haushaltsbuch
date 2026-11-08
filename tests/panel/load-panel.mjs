// Loads the import functions of the panel in Node, so the CSV import and the
// matching can be tested without a browser or Home Assistant. The panel files
// are plain ES modules and are imported exactly as the browser loads them.
const FRONTEND = new URL("../../custom_components/haushaltsbuch/frontend/", import.meta.url);

export async function loadPanel() {
  const bank = await import(new URL("bank-import.js", FRONTEND));
  const format = await import(new URL("format.js", FRONTEND));
  return { ...bank, setLanguage: format.setLanguage };
}
