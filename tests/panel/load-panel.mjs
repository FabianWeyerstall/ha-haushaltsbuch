// Loads the panel script in a sandbox, so its plain functions (CSV import,
// matching) can be tested in Node without a browser or Home Assistant.
// The panel file itself is not changed: the source is read as it is and a
// line that hands out the functions is appended inside the sandbox only.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const PANEL = fileURLToPath(new URL("../../custom_components/haushaltsbuch/frontend/haushaltsbuch-panel.js", import.meta.url));

const EXPORTS = [
  "decodeBankBytes", "parseBankSource", "isOutbankCsv", "parseBankCsv", "splitCsv",
  "dropOwnTransfers", "analyzeBank", "bankKeyOf", "setLanguage",
];

export function loadPanel() {
  const source = readFileSync(PANEL, "utf8")
    .replaceAll("import.meta.url", JSON.stringify("http://localhost/haushaltsbuch/haushaltsbuch-panel.js"));
  const sandbox = {
    console, TextDecoder, URL, Blob, Response, DecompressionStream,
    HTMLElement: class {},
    customElements: { define() {} },
    fetch: async () => ({ ok: false, json: async () => [] }),
    Intl, Date, Math, JSON,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox, { timezone: "Europe/Berlin" });
  vm.runInContext(`${source}\n;globalThis.__panel = { ${EXPORTS.join(", ")} };`, sandbox, { filename: "haushaltsbuch-panel.js" });
  return sandbox.__panel;
}
