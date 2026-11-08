// Part 2 of the update test (upgrade.sh): the same Home Assistant, now with
// the CURRENT Haushaltsbuch. Checks that the data from 0.9.2 was upgraded
// without loss, that a backup was made first, and that every tab shows it.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const { chromium } = createRequire(import.meta.url)("playwright");
const HA = process.env.HA_URL || "http://127.0.0.1:8123";
const CONFIG = process.env.HA_CONFIG;
const failed = [];
const check = (ok, what) => { if (ok) console.log(`ok   ${what}`); else failed.push(what); };

// ------------------------------------------------------------------ panel
// Log in again with the user from part 1, like a person after the update.
async function login() {
  const client_id = `${HA}/`;
  const post = (path, body) => fetch(`${HA}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const flow = await (await post("/auth/login_flow", { client_id, handler: ["homeassistant", null], redirect_uri: `${HA}/?auth_callback=1` })).json();
  const done = await (await post(`/auth/login_flow/${flow.flow_id}`, { client_id, username: "anna", password: "smoke-test-123" })).json();
  const res = await fetch(`${HA}/auth/token`, { method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", code: done.result, client_id }) });
  return res.ok ? res.json() : {};
}
let tokens = {};
for (let i = 0; i < 60 && !tokens.access_token; i++) {
  try { tokens = await login(); } catch { tokens = {}; }
  if (!tokens.access_token) await new Promise((r) => setTimeout(r, 2000));
}
assert.ok(tokens.access_token, "login after the update failed");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: "de-DE", timezoneId: "Europe/Berlin" });
const errors = [];
const HA_NOISE = /Transition was skipped|Cannot parse given Error object|favicon|manifest\.json/;
page.on("pageerror", (e) => { if (!HA_NOISE.test(e.message)) errors.push(`JavaScript: ${e.message}`); });
page.on("console", (m) => { if (m.type() === "error" && !HA_NOISE.test(m.text())) errors.push(`Console: ${m.text()}`); });
page.on("response", (r) => { if (r.url().includes("/haushaltsbuch_static/") && r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });

await page.goto(`${HA}/auth/providers`);
await page.evaluate(([t, ha]) => localStorage.setItem("hassTokens", JSON.stringify({ ...t, hassUrl: ha, clientId: `${ha}/`, expires: Date.now() + 1800e3 })), [tokens, HA]);
await page.goto(`${HA}/haushaltsbuch`);
const panel = page.locator("haushaltsbuch-panel");
try {
  await panel.waitFor({ timeout: 60000 });
} catch (err) {
  if (process.env.SCREENSHOTS) await page.screenshot({ path: `${process.env.SCREENSHOTS}/upgrade-no-panel.png` });
  const entries = await (await fetch(`${HA}/api/config/config_entries/entry`, { headers: { Authorization: `Bearer ${tokens.access_token}` } })).json();
  console.error("config entries:", JSON.stringify(entries.filter((e) => e.domain === "haushaltsbuch")));
  console.error(`Panel did not appear at ${page.url()}\n${errors.join("\n")}\n${(await page.locator("body").innerText()).slice(0, 500)}`);
  throw err;
}
await page.waitForTimeout(2000);

const text = () => panel.evaluate((el) => [...el.shadowRoot.children].map((c) => c.innerText || "").join("\n"));
async function step(name, view, expect) {
  try {
    await panel.locator(`button.tab[data-view="${view}"]`).first().click({ timeout: 10000 });
    await page.waitForTimeout(700);
    const shown = await text();
    const missing = expect.filter((e) => !shown.includes(e));
    check(!missing.length, `${name}${missing.length ? `: fehlt ${missing.join(", ")}` : ""}`);
  } catch (err) {
    failed.push(`${name}: ${err.message.split("\n")[0]}`);
  }
}
await step("Zeitleiste", "timeline", ["Strom"]);
await step("Posten", "items", ["Gehalt", "Strom", "GEZ", "Friseur", "Lebensmittel", "Ohne Budgets"]);
await step("Übersicht", "dashboard", ["Lebensmittel"]);
await step("Haushalt", "households", ["Familie", "Sicherungen"]);
await step("Statistik", "stats", []);
await browser.close();

// ------------------------------------------------------------ stored files
const OLD_ITEMS = ["Gehalt", "Strom", "GEZ", "Friseur", "Lebensmittel", "Internet"];
const stored = JSON.parse(readFileSync(`${CONFIG}/.storage/haushaltsbuch.data`, "utf-8"));
check(stored.version === 1 && stored.minor_version === 2, `Datenbuch auf 1.2 gehoben (ist ${stored.version}.${stored.minor_version})`);
const names = Object.values(stored.data.items).map((i) => i.name).sort();
check(JSON.stringify(names) === JSON.stringify([...OLD_ITEMS].sort()), `alle 6 Posten noch da (${names.join(", ")})`);
const food = Object.values(stored.data.items).find((i) => i.name === "Lebensmittel");
check(food?.spendings?.length === 1 && food.spendings[0].amount === 23.45, "Budget-Ausgabe noch da");
check(Object.values(stored.data.households).some((h) => h.name === "Familie"), "Haushalt noch da");
const user = Object.values(stored.data.users)[0] || {};
check(user.balance === 1500 && user.settings?.salary_item_id, "Kontostand und Gehaltsmonat noch da");

const folder = `${CONFIG}/haushaltsbuch_backups`;
const backup = existsSync(folder) && readdirSync(folder).find((f) => f.endsWith("-before_update.json"));
check(backup, "Sicherung vor dem Update angelegt");
if (backup) {
  const doc = JSON.parse(readFileSync(`${folder}/${backup}`, "utf-8"));
  check(Object.keys(doc.book?.items || {}).length === 6, "Sicherung enthält die 6 alten Posten");
}


const problems = [...failed, ...errors];
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("\nUpdate from 0.9.2 passed.");
