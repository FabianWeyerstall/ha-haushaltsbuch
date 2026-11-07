// Safety net for the Outbank CSV import (see tests/panel/README.md).
// Every Outbank file in fixtures/ is read exactly like the panel does it
// (bytes → text → reader → own transfers removed → matching), and the result
// must equal the saved file in expected/. Any change to how Outbank files are
// read shows up here as a failing test.
//
// Run: node --test tests/panel/*.test.mjs
// After an intended change: UPDATE_EXPECTED=1 node --test tests/panel/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { loadPanel } from "./load-panel.mjs";

const here = (path) => new URL(path, import.meta.url);
const UPDATE = process.env.UPDATE_EXPECTED === "1";
const clone = (value) => JSON.parse(JSON.stringify(value));

function compare(name, actual) {
  const file = here(`expected/${name}.json`);
  const json = `${JSON.stringify(actual, null, 1)}\n`;
  if (UPDATE) {
    writeFileSync(file, json);
    return;
  }
  assert.deepStrictEqual(clone(actual), JSON.parse(readFileSync(file, "utf8")), `${name} differs from expected/${name}.json`);
}

/** The import steps of the panel up to the suggestion dialog. */
function importLikePanel(panel, fixture, items = [], history = {}, entries = []) {
  const text = panel.decodeBankBytes(readFileSync(here(`fixtures/${fixture}`)));
  const parsed = panel.parseBankSource({ name: fixture, text }, {});
  const read = clone(parsed.bookings);
  const { bookings, transfers } = panel.dropOwnTransfers(parsed.bookings);
  const kept = clone(bookings);
  const analysis = panel.analyzeBank(bookings, items, history, entries);
  return { kind: parsed.kind, isOutbank: panel.isOutbankCsv(text), read, transfers, kept, analysis };
}

const panel = await loadPanel();
panel.setLanguage("de");

for (const fixture of ["outbank-ein-konto.csv", "outbank-drei-konten-utf8-bom.csv"]) {
  test(`Outbank: ${fixture}`, () => {
    const result = importLikePanel(panel, fixture);
    assert.equal(result.kind, "outbank", "file must be recognised as Outbank");
    assert.equal(result.isOutbank, true);
    compare(fixture.replace(/\.csv$/, ""), result);
  });
}

test("Outbank: Windows-1252 file reads the same as UTF-8", () => {
  const utf8 = importLikePanel(panel, "outbank-drei-konten-utf8-bom.csv");
  const ansi = importLikePanel(panel, "outbank-drei-konten-windows1252.csv");
  assert.deepStrictEqual(clone(ansi), clone(utf8));
});

test("Outbank: three accounts drop own transfers and card settlement", () => {
  const result = importLikePanel(panel, "outbank-drei-konten-utf8-bom.csv");
  // 17 lines, of which the zero amount and the line without date are skipped.
  assert.equal(result.read.length, 15);
  // Giro→Tagesgeld (IBAN), Rücklage (same amount, 2 days), card settlement (6 days).
  assert.equal(result.transfers, 6);
  assert.ok(result.read.some((b) => b.purpose === "Kauf; Filiale 12\nKabel und Lampe"), "quoted field with ; and line break");
  assert.ok(result.read.some((b) => b.name === "Kontoführungsentgelt Oktober 2026 laut P" && b.amount === -4.95), "no name: start of the purpose");
  assert.ok(result.read.some((b) => b.amount === 2700 && b.name === "Muster Arbeitgeber GmbH"), "thousands separator");
});

test("Outbank: matching with existing entries and remembered bank keys", () => {
  const items = [
    { id: "strom", owner: "u1", name: "Strom", direction: "expense", amount: 74, category: "Strom", start_date: "2025-09-04", schedule: { frequency: "monthly", interval: 1 } },
    { id: "miete", owner: "u1", name: "Wohnung", direction: "expense", amount: 850, category: "Wohnen", start_date: "2025-09-02", schedule: { frequency: "monthly", interval: 1 } },
    { id: "essen", owner: "u1", name: "Lebensmittel", direction: "expense", amount: 400, category: "Lebensmittel", start_date: "2025-09-01", schedule: { frequency: "budget" } },
  ];
  const history = { miete: { bank_keys: ["n:hausverwaltung sonnenhof|expense"], confirmed: [] } };
  const entries = [
    { item_id: "strom", due_date: "2026-11-04", date: "2026-11-04", amount: -74, status: null },
    { item_id: "strom", due_date: "2026-10-04", date: "2026-10-05", amount: -74, status: null },
  ];
  const result = importLikePanel(panel, "outbank-ein-konto.csv", items, history, entries);
  compare("outbank-ein-konto-mit-posten", result.analysis);
});
