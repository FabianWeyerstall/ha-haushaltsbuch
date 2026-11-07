// Every panel file loads and finds what it imports. A missing export or a
// typo in an import only shows up when the browser opens the panel, so it is
// checked here for all files, including the panel element itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";

const FRONTEND = new URL("../../custom_components/haushaltsbuch/frontend/", import.meta.url);

test("all panel modules load", async () => {
  const defined = [];
  globalThis.HTMLElement = class {};
  globalThis.customElements = { define: (name) => defined.push(name) };
  const files = readdirSync(FRONTEND).filter((f) => f.endsWith(".js"));
  assert.ok(files.includes("haushaltsbuch-panel.js"));
  for (const file of files) await import(new URL(file, FRONTEND));
  assert.deepEqual(defined, ["haushaltsbuch-panel"]);
});
