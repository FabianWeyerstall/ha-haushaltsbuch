// Screenshots for the README (docs/images): CSV import and statistics.
// Runs against a fresh Home Assistant started by run.sh:
//   SCRIPT=doc-shots.mjs SHOTS=docs/images DOC_LANG=de tests/browser/run.sh
//   SCRIPT=doc-shots.mjs SHOTS=docs/images/en DOC_LANG=en tests/browser/run.sh
// All data is made up (tests/panel/fixtures).
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const { chromium } = createRequire(import.meta.url)("playwright");
const HA = process.env.HA_URL || "http://127.0.0.1:8123";
const LANG = process.env.DOC_LANG || "de";
const SHOTS = process.env.SHOTS || ".";
const SAMPLE = new URL("../panel/fixtures/outbank-ein-konto.csv", import.meta.url).pathname;
const CLIENT = `${HA}/`;
const de = LANG === "de";
const NAMES = de
  ? { csv: "16-csv-import.png", stats: "17-statistik.png", insights: "18-auswertungen.png" }
  : { csv: "16-csv-import.png", stats: "17-statistics.png", insights: "18-insights.png" };

async function api(path, body, token) {
  const res = await fetch(`${HA}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  assert.ok(res.ok, `${path}: ${res.status} ${await res.clone().text()}`);
  return res.json();
}

const { auth_code: code } = await api("/api/onboarding/users", { client_id: CLIENT, name: "Anna", username: "anna", password: "doc-shots-123", language: LANG });
const tokens = await (await fetch(`${HA}/auth/token`, { method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: CLIENT }) })).json();
await api("/api/onboarding/core_config", {}, tokens.access_token);
await api("/api/onboarding/analytics", {}, tokens.access_token);
await api("/api/onboarding/integration", { client_id: CLIENT, redirect_uri: `${HA}/?auth_callback=1` }, tokens.access_token);
const flow = await api("/api/config/config_entries/flow", { handler: "haushaltsbuch" }, tokens.access_token);
await api(`/api/config/config_entries/flow/${flow.flow_id}`, {}, tokens.access_token);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, locale: de ? "de-DE" : "en-GB", timezoneId: "Europe/Berlin" });
await page.goto(`${HA}/auth/providers`);
await page.evaluate(([t, ha, lang]) => {
  localStorage.setItem("hassTokens", JSON.stringify({ ...t, hassUrl: ha, clientId: `${ha}/`, expires: Date.now() + 1800e3 }));
  localStorage.setItem("selectedLanguage", JSON.stringify(lang));
}, [tokens, HA, LANG]);
await page.goto(`${HA}/haushaltsbuch`);
const panel = page.locator("haushaltsbuch-panel");
await panel.waitFor({ timeout: 60000 });
await page.evaluate(async (de) => {
  const hass = document.querySelector("home-assistant").hass;
  const t = new Date();
  const d = (n) => new Date(t.getFullYear(), t.getMonth(), t.getDate() + n).toISOString().slice(0, 10);
  const save = (item) => hass.callWS({ type: "haushaltsbuch/item/save", item });
  await save({ name: de ? "Gehalt" : "Salary", direction: "income", amount: 2700, category: de ? "Gehalt" : "Salary", icon: "mdi:briefcase", start_date: d(-40), schedule: { frequency: "monthly", interval: 1 }, certainty: "sicher" });
  await save({ name: de ? "Strom" : "Electricity", direction: "expense", amount: 74, category: de ? "Strom" : "Electricity", icon: "mdi:flash", start_date: d(-20), schedule: { frequency: "monthly", interval: 1 } });
  await save({ name: de ? "Miete" : "Rent", direction: "expense", amount: 850, category: de ? "Wohnen" : "Housing", icon: "mdi:home", start_date: d(-30), schedule: { frequency: "monthly", interval: 1 }, certainty: "sicher" });
  await save({ name: "GEZ", direction: "expense", amount: 55.08, category: de ? "Rundfunk" : "Broadcasting", icon: "mdi:radio-tower", start_date: d(15), schedule: { frequency: "monthly", interval: 3 }, certainty: "sicher" });
  await save({ name: de ? "Lebensmittel" : "Groceries", direction: "expense", amount: 400, category: de ? "Lebensmittel" : "Groceries", icon: "mdi:cart", start_date: d(-60), schedule: { frequency: "budget" } });
  await hass.callWS({ type: "haushaltsbuch/balance", scope: "me", balance: 1500 });
}, de);
await page.reload();
await panel.waitFor();
await page.waitForTimeout(2000);

const click = (selector) => panel.locator(selector).first().click({ timeout: 10000 });
const tab = (view) => click(`button.tab[data-view="${view}"]`);
const shot = async (name) => { await page.waitForTimeout(800); await page.screenshot({ path: `${SHOTS}/${name}` }); console.log(`ok   ${SHOTS}/${name}`); };

await tab("items");
await panel.locator('input[data-change="import-file"]').setInputFiles(SAMPLE);
await page.waitForTimeout(2500);
await shot(NAMES.csv);
await panel.locator('form button[type="submit"]').last().click();
await page.waitForTimeout(3000);
const closeBtn = panel.locator('[data-action="close"]').first();
if (await closeBtn.count()) await closeBtn.click();
const toTop = () => panel.locator("button.tab").first().evaluate((el) => el.scrollIntoView({ block: "start" }));
await tab("stats");
// The last full month, compared with the month before.
await click('[data-action="stats-period"][data-period="month"]');
await click('[data-action="stats-step"]');
await toTop();
await shot(NAMES.stats);
await click('[data-action="stats-tab"][data-tab="insights"]');
await toTop();
await shot(NAMES.insights);
await browser.close();
