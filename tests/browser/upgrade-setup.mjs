// Part 1 of the update test (upgrade.sh): runs against Home Assistant with the
// OLD Haushaltsbuch (0.9.2) and fills it like a real user would, through the
// same WebSocket calls the old panel used.
import assert from "node:assert/strict";

const HA = process.env.HA_URL || "http://127.0.0.1:8123";
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

const { auth_code: code } = await api("/api/onboarding/users", { client_id: CLIENT, name: "Anna", username: "anna", password: "smoke-test-123", language: "de" });
const tokens = await (await fetch(`${HA}/auth/token`, { method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: CLIENT }) })).json();
const token = tokens.access_token;
await api("/api/onboarding/core_config", {}, token);
await api("/api/onboarding/analytics", {}, token);
await api("/api/onboarding/integration", { client_id: CLIENT, redirect_uri: `${HA}/?auth_callback=1` }, token);
const flow = await api("/api/config/config_entries/flow", { handler: "haushaltsbuch" }, token);
const entry = await api(`/api/config/config_entries/flow/${flow.flow_id}`, {}, token);
assert.equal(entry.type, "create_entry", JSON.stringify(entry));

// ------------------------------------------------------------- WebSocket
const ws = new WebSocket(`${HA.replace(/^http/, "ws")}/api/websocket`);
let nextId = 1;
const pending = new Map();
const ready = new Promise((resolve, reject) => {
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "auth_required") ws.send(JSON.stringify({ type: "auth", access_token: token }));
    else if (msg.type === "auth_ok") resolve();
    else if (msg.type === "auth_invalid") reject(new Error("auth_invalid"));
    else if (msg.type === "result" && pending.has(msg.id)) {
      const { ok, fail } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.success ? ok(msg.result) : fail(new Error(`${msg.error?.code}: ${msg.error?.message}`));
    }
  };
  ws.onerror = () => reject(new Error("WebSocket error"));
});
await ready;
const call = (type, data = {}) => new Promise((ok, fail) => {
  const id = nextId++;
  pending.set(id, { ok, fail });
  ws.send(JSON.stringify({ id, type: `haushaltsbuch/${type}`, ...data }));
});

const t = new Date();
const d = (n) => new Date(t.getFullYear(), t.getMonth(), t.getDate() + n).toISOString().slice(0, 10);
const save = async (item) => (await call("item/save", { item })).id;

const salary = await save({ name: "Gehalt", direction: "income", amount: 2700, category: "Gehalt", icon: "mdi:briefcase", start_date: d(-70), schedule: { frequency: "monthly", interval: 1 }, certainty: "sicher" });
const power = await save({ name: "Strom", direction: "expense", amount: 74, category: "Strom", icon: "mdi:flash", start_date: d(-50), schedule: { frequency: "monthly", interval: 1 } });
await save({ name: "GEZ", direction: "expense", amount: 55.08, category: "Rundfunk", icon: "mdi:radio-tower", start_date: d(15), schedule: { frequency: "monthly", interval: 3 }, certainty: "sicher" });
await save({ name: "Friseur", direction: "expense", amount: 28, category: "Körperpflege", icon: "mdi:content-cut", start_date: d(-30), schedule: { frequency: "rolling", interval: 6, unit: "weeks" } });
const food = await save({ name: "Lebensmittel", direction: "expense", amount: 400, category: "Lebensmittel", icon: "mdi:cart", start_date: d(-90), schedule: { frequency: "budget" } });
await call("spending/add", { item_id: food, date: d(0), amount: 23.45, note: "Wochenmarkt" });
await call("confirm", { item_id: power, due_date: d(-50), status: "booked" });
await call("balance", { scope: "me", balance: 1500 });
await call("settings", { settings: { salary_item_id: salary } });
const { id: household } = await call("household/create", { name: "Familie" });
await save({ name: "Internet", direction: "expense", amount: 39.99, category: "Internet", icon: "mdi:wifi", start_date: d(-10), schedule: { frequency: "monthly", interval: 1 }, household_id: household });
ws.close();
console.log("ok   0.9.2 eingerichtet: 6 Posten, Budget-Ausgabe, Bestätigung, Kontostand, Haushalt");
