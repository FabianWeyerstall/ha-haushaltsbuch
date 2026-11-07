// Browser smoke test against a real Home Assistant (started by run.sh):
// sets up the integration, adds a few entries, then opens every tab and the
// main dialogs, imports the Outbank sample and checks the statistics.
// Fails on any JavaScript error, failed panel file or step without content.
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";

const { chromium } = createRequire(import.meta.url)("playwright");
const HA = process.env.HA_URL || "http://127.0.0.1:8123";
const SAMPLE = new URL("../panel/fixtures/outbank-ein-konto.csv", import.meta.url).pathname;
const CLIENT = `${HA}/`;

async function api(path, body, token) {
  const res = await fetch(`${HA}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  assert.ok(res.ok, `${path}: ${res.status} ${await res.clone().text()}`);
  return res.json();
}

// ---------------------------------------------------------------- onboarding
const { auth_code: code } = await api("/api/onboarding/users", { client_id: CLIENT, name: "Anna", username: "anna", password: "smoke-test-123", language: "de" });
const tokenRes = await fetch(`${HA}/auth/token`, { method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: CLIENT }) });
const tokens = await tokenRes.json();
const token = tokens.access_token;
await api("/api/onboarding/core_config", {}, token);
await api("/api/onboarding/analytics", {}, token);
await api("/api/onboarding/integration", { client_id: CLIENT, redirect_uri: `${HA}/?auth_callback=1` }, token);
const flow = await api("/api/config/config_entries/flow", { handler: "haushaltsbuch" }, token);
const entry = await api(`/api/config/config_entries/flow/${flow.flow_id}`, {}, token);
assert.equal(entry.type, "create_entry", JSON.stringify(entry));

// -------------------------------------------------------------------- browser
const browser = await chromium.launch();
const SHOTS = process.env.SCREENSHOTS; // optional folder: one picture per step
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1, locale: "de-DE", timezoneId: "Europe/Berlin" });
const errors = [];
// Noise of the Home Assistant frontend itself (page transitions), not of the panel.
const HA_NOISE = /Transition was skipped|Cannot parse given Error object|favicon|manifest\.json/;
page.on("pageerror", (e) => { if (!HA_NOISE.test(e.message)) errors.push(`JavaScript: ${e.message}`); });
page.on("console", (m) => { if (m.type() === "error" && !HA_NOISE.test(m.text())) errors.push(`Console: ${m.text()}`); });
page.on("response", (r) => { if (r.url().includes("/haushaltsbuch_static/") && r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });

await page.goto(`${HA}/auth/providers`);
await page.evaluate(([t, ha]) => localStorage.setItem("hassTokens", JSON.stringify({ ...t, hassUrl: ha, clientId: `${ha}/`, expires: Date.now() + 1800e3 })), [tokens, HA]);
await page.goto(`${HA}/haushaltsbuch`);
const panel = page.locator("haushaltsbuch-panel");
await panel.waitFor({ timeout: 60000 });

await page.evaluate(async () => {
  const hass = document.querySelector("home-assistant").hass;
  const t = new Date();
  const d = (n) => new Date(t.getFullYear(), t.getMonth(), t.getDate() + n).toISOString().slice(0, 10);
  const save = (item) => hass.callWS({ type: "haushaltsbuch/item/save", item });
  await save({ name: "Gehalt", direction: "income", amount: 2700, category: "Gehalt", icon: "mdi:briefcase", start_date: d(-40), schedule: { frequency: "monthly", interval: 1 }, certainty: "sicher" });
  await save({ name: "Strom", direction: "expense", amount: 74, category: "Strom", icon: "mdi:flash", start_date: d(-20), schedule: { frequency: "monthly", interval: 1 } });
  await save({ name: "GEZ", direction: "expense", amount: 55.08, category: "Rundfunk", icon: "mdi:radio-tower", start_date: d(15), schedule: { frequency: "monthly", interval: 3 }, certainty: "sicher" });
  await save({ name: "Lebensmittel", direction: "expense", amount: 400, category: "Lebensmittel", icon: "mdi:cart", start_date: d(-60), schedule: { frequency: "budget" } });
  await hass.callWS({ type: "haushaltsbuch/balance", scope: "me", balance: 1500 });
});
await page.reload();
await panel.waitFor();
await page.waitForTimeout(2000);

const text = () => panel.evaluate((el) => [...el.shadowRoot.children].map((c) => c.innerText || "").join("\n"));
const failed = [];
async function step(name, action, expect) {
  try {
    await action();
    await page.waitForTimeout(700);
    const shown = await text();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name.replace(/[^\wäöüÄÖÜß-]+/g, "-")}.png` });
    if (expect && !shown.includes(expect)) failed.push(`${name}: "${expect}" not shown`);
    else console.log(`ok   ${name}`);
  } catch (err) {
    failed.push(`${name}: ${err.message.split("\n")[0]}`);
  }
}
const click = (selector) => () => panel.locator(selector).first().click({ timeout: 10000 });
const tab = (view) => click(`button.tab[data-view="${view}"]`);
const close = async () => { const c = panel.locator('[data-action="close"]').first(); if (await c.count()) await c.click(); await page.waitForTimeout(300); };

await step("Zeitleiste", tab("timeline"), "Strom");
await step("Kontostand bearbeiten", click('[data-action="edit-balance"]'), "Kontostand"); await close();
await step("Kalender", tab("calendar"), "GEZ");
await step("Posten", tab("items"), "Gehalt");
await step("Posten anlegen", click('[data-action="new-item"]'), "Betrag"); await close();
await step("Posten bearbeiten", click('[data-action="edit-item"]'), "Betrag"); await close();
await step("Vorlage Haus", async () => {
  await click('[data-action="new-item"]')();
  await panel.locator('button.template', { hasText: "Haus" }).first().click();
}, "Haus"); await close();
await step("Posten duplizieren", async () => {
  await panel.locator('[data-action="edit-item"]', { hasText: "Strom" }).first().click();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/Posten-mit-Duplizieren.png` });
  await click('[data-action="duplicate-item"]')();
}, "Kopie von „Strom“");
await step("Kopie speichern", async () => {
  await panel.locator('input[name="name"]').fill("Strom Garage");
  await panel.locator('form[data-form="item"] button[type="submit"]').click();
  await page.waitForTimeout(1500);
}, "Strom Garage");
await step("Kopie hat alle Einstellungen", async () => {
  const items = await page.evaluate(async () => (await document.querySelector("home-assistant").hass.callWS({ type: "haushaltsbuch/state" })).items);
  const original = items.find((i) => i.name === "Strom");
  const copy = items.find((i) => i.name === "Strom Garage");
  assert.ok(copy && copy.id !== original.id, "copy saved as a new entry");
  for (const key of ["direction", "amount", "category", "icon", "start_date", "schedule", "certainty"]) {
    assert.deepEqual(copy[key], original[key], key);
  }
});
await step("Monate", tab("months"), "Monatsübersicht");
await step("Monat aufklappen", click('[data-action="toggle-month"]'));
await step("Übersicht", tab("dashboard"), "Lebensmittel");
await step("Budget-Ausgabe", click('[data-action="spending-new"]'), "Lebensmittel"); await close();
await step("Haushalt", tab("households"), "Sicherungen");
await step("Haushalt anlegen", click('[data-action="new-household"]')); await close();
await step("Statistik leer", tab("stats"));
await step("CSV-Import öffnen", async () => {
  await tab("items")();
  await panel.locator('input[data-change="import-file"]').setInputFiles(SAMPLE);
  await page.waitForTimeout(2500);
}, "316 Umsätze");
await step("CSV-Import übernehmen", async () => {
  await panel.locator('form button[type="submit"]').last().click();
  await page.waitForTimeout(3000);
});
await close();
await step("Statistik mit Umsätzen", tab("stats"), "Gespeichert sind 316 Umsätze");
await step("Statistik Jahr", click('[data-action="stats-period"] >> nth=1'));
await step("Statistik Auswertungen", click('[data-action="stats-tab"] >> nth=-1'));
await step("Zeitleiste danach", tab("timeline"), "Strom");

await browser.close();
// The CSV import makes a backup first; it must be there.
const backups = `${process.env.HA_CONFIG}/haushaltsbuch_backups`;
if (process.env.HA_CONFIG && !(existsSync(backups) && readdirSync(backups).some((f) => f.endsWith("-csv_import.json")))) failed.push("no backup before the CSV import");

const problems = [...failed, ...errors];
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("\nBrowser smoke test passed.");
