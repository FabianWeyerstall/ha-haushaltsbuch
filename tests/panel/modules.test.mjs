// Every panel file loads and finds what it imports, and every method the
// panel calls on itself exists. Such mistakes would otherwise only show up
// when someone opens the panel (or a rarely used dialog) in the browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const FRONTEND = new URL("../../custom_components/haushaltsbuch/frontend/", import.meta.url);
const files = readdirSync(FRONTEND).filter((f) => f.endsWith(".js"));

const defined = [];
globalThis.HTMLElement = class {};
globalThis.customElements = { define: (name, cls) => defined.push([name, cls]) };
for (const file of files) await import(new URL(file, FRONTEND));

test("all panel modules load and define the panel once", () => {
  assert.ok(files.includes("haushaltsbuch-panel.js"));
  assert.deepEqual(defined.map(([name]) => name), ["haushaltsbuch-panel"]);
});

test("every this._method() the panel calls exists", () => {
  const proto = defined[0][1].prototype;
  const missing = new Set();
  for (const file of files) {
    const source = readFileSync(new URL(file, FRONTEND), "utf8");
    for (const [, name] of source.matchAll(/this\.(_[A-Za-z]\w*)\(/g)) {
      if (typeof proto[name] !== "function") missing.add(`${file}: ${name}`);
    }
  }
  assert.deepEqual([...missing], []);
});

test("views, dialogs and events are methods of the panel", () => {
  const proto = defined[0][1].prototype;
  for (const name of ["_renderTimeline", "_renderStats", "_renderCsvForm", "_onClick", "_onSubmit", "_onChange", "_renderBudgetCard"]) {
    assert.equal(typeof proto[name], "function", name);
  }
});
