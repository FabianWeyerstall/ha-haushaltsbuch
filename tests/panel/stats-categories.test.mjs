// Which category a saved transaction counts under in the statistics:
// a category picked by hand, then the entry or budget it is assigned to,
// then the bank's own category.
import { test } from "node:test";
import assert from "node:assert/strict";

const FRONTEND = new URL("../../custom_components/haushaltsbuch/frontend/", import.meta.url);
const { StatsView } = await import(new URL("view-stats.js", FRONTEND));
const { setLanguage } = await import(new URL("format.js", FRONTEND));
setLanguage("de");

function panel(rows, settings = {}) {
  const p = Object.create(StatsView.prototype);
  p._state = {
    items: [
      { id: "miete", name: "Miete", category: "Wohnen", direction: "expense" },
      { id: "essen", name: "Lebensmittel", category: "Lebensmittel", direction: "expense", schedule: { frequency: "budget" } },
    ],
    user: { settings },
  };
  p._ledger = { rows };
  p._bankHistory = {
    miete: { booked: [["2026-10-01", 950]], bank_keys: ["n:vermieter|expense"] },
    essen: { spendings: [["2026-10-05", 42.1]], bank_keys: [] },
  };
  return p;
}

test("assigned entries and budgets win over the bank category", () => {
  const rows = [
    ["2026-10-01", -950, "Vermieter", "", "", "DE1", ""],
    ["2026-11-01", -950, "Vermieter", "Sonstiges", "", "DE1", ""],
    ["2026-10-05", -42.1, "Supermarkt", "Einkaufen", "Supermarkt", "DE1", ""],
    ["2026-10-07", -9.99, "Kiosk", "Freizeit", "Zeitschriften", "DE1", ""],
    ["2026-10-08", -5, "Unbekannt", "", "", "DE1", ""],
  ];
  const of = panel(rows)._statsCategories();
  assert.equal(of(rows[0]).main, "Wohnen");
  assert.equal(of(rows[0]).sub, "Miete");
  assert.equal(of(rows[0]).item.id, "miete");
  assert.equal(of(rows[1]).main, "Wohnen", "remembered payee");
  assert.equal(of(rows[2]).main, "Lebensmittel");
  assert.equal(of(rows[2]).sub, "Lebensmittel");
  assert.equal(of(rows[3]).main, "Freizeit");
  assert.equal(of(rows[3]).sub, "Zeitschriften");
  assert.equal(of(rows[4]).main, "Ohne Kategorie");
});

test("a category picked by hand wins, for one transaction or a whole payee", () => {
  const rows = [
    ["2026-10-14", -23.9, "Baumarkt Müller", "", "", "DE1", ""],
    ["2026-10-20", -12, "Baumarkt Müller", "", "", "DE1", ""],
    ["2026-10-08", -5, "Unbekannt", "", "", "DE1", ""],
    ["2026-10-01", -950, "Vermieter", "", "", "DE1", ""],
  ];
  const p = panel(rows);
  p._state.user.settings = {
    stats_categories: { "n:baumarkt müller|expense": "Haus", [p._statsRowKey(rows[2])]: "Geschenke" },
  };
  const of = p._statsCategories();
  assert.equal(of(rows[0]).main, "Haus");
  assert.equal(of(rows[1]).main, "Haus");
  assert.equal(of(rows[2]).main, "Geschenke");
  assert.equal(of(rows[3]).main, "Wohnen");
});
