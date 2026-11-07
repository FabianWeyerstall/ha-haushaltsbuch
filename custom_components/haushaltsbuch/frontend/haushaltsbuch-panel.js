/* Haushaltsbuch sidebar panel for Home Assistant.
 * Plain web component without build step. Talks to the integration through
 * the WebSocket commands "haushaltsbuch/*" as the logged-in user.
 *
 * Files (plain ES modules, loaded by the browser as they are):
 *   haushaltsbuch-panel.js  the panel element: state, loading, tabs, shared helpers
 *   view-timeline.js        tabs Zeitleiste and Kalender
 *   view-items.js           tabs Posten and Monate
 *   view-dashboard.js       tab Übersicht
 *   view-stats.js           tab Statistik
 *   view-households.js      tab Haushalt (households, balances, backups)
 *   budgets.js              budgets with spendings
 *   dialog-item.js          entry form and related dialogs
 *   dialog-import.js        export/import and bank file dialogs
 *   events.js               click, change and submit handlers
 *   format.js               language, numbers, dates
 *   bank-import.js          bank files and matching (Outbank reader unchanged, see tests/panel)
 *   schedule.js             schedule presets and regular vs. special items
 *   icons.js                icon search
 *   styles.js               CSS
 *
 * The view, dialog and event files hold classes whose methods are added to the
 * panel element at the end of this file; inside them `this` is the panel.
 */

import { LANG, tr, setLanguage, monthName, weekdayName, SUGGEST_FIELDS, INCOGNITO_KEY, CERTAINTY, esc, parseAmount, iso, parseIso, addDays, today, setDateLocale } from "./format.js";
import { isRegular, intervalMonths } from "./schedule.js";
import { STYLES } from "./styles.js";
import { StatsView } from "./view-stats.js";
import { TimelineView } from "./view-timeline.js";
import { Budgets } from "./budgets.js";
import { ItemsView } from "./view-items.js";
import { DashboardView } from "./view-dashboard.js";
import { HouseholdsView } from "./view-households.js";
import { ItemDialog } from "./dialog-item.js";
import { ImportDialog } from "./dialog-import.js";
import { Events } from "./events.js";

class HaushaltsbuchPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._state = null;
    this._scope = "me";
    this._view = "timeline";
    this._range = 30;
    this._month = today();
    this._month.setDate(1);
    this._selectedDay = null;
    this._forecast = null;
    this._calendar = null;
    this._summary = null;
    this._pending = [];
    this._dialog = null;
    this._error = null;
    this._loaded = false;
    try {
      this._incognito = localStorage.getItem(INCOGNITO_KEY) === "1";
    } catch (err) {
      this._incognito = false;
    }
    this.shadowRoot.addEventListener("click", (ev) => this._onClick(ev));
    this.shadowRoot.addEventListener("mouseover", (ev) => {
      const help = ev.target.closest?.(".help");
      if (help && help !== this._helpFor) {
        this._showHelp(help);
        this._helpByHover = true;
      }
    });
    this.shadowRoot.addEventListener("mouseout", (ev) => {
      // Only a text opened by hovering closes when the mouse leaves; a tapped one stays.
      if (this._helpByHover && ev.target.closest?.(".help") && !ev.relatedTarget?.closest?.(".help")) this._hideHelp();
    });
    window.addEventListener("scroll", () => this._hideHelp(), { passive: true, capture: true });
    window.addEventListener("resize", () => {
      if (this._view !== "dashboard" || !this.isConnected) return;
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => this._render(), 200);
    });
    this.shadowRoot.addEventListener("change", (ev) => this._onChange(ev));
    this.shadowRoot.addEventListener("submit", (ev) => this._onSubmit(ev));
    this.shadowRoot.addEventListener("input", (ev) => {
      if (ev.target.name === "item-search") {
        this._search = ev.target.value;
        this._applySearch();
        return;
      }
      if (!SUGGEST_FIELDS.has(ev.target.name)) return;
      if (ev.target.name === "icon") {
        const preview = ev.target.closest("label")?.querySelector(".icon-preview");
        if (preview) preview.innerHTML = this._icon(ev.target.value.trim(), 20);
      }
      this._suggest(ev.target);
    });
    this.shadowRoot.addEventListener("focusin", (ev) => {
      if (SUGGEST_FIELDS.has(ev.target.name)) this._suggest(ev.target);
    });
    this.shadowRoot.addEventListener("focusout", (ev) => {
      if (!SUGGEST_FIELDS.has(ev.target.name)) return;
      const box = ev.target.closest(".suggest-field")?.querySelector(".suggest");
      if (box && !box.contains(ev.relatedTarget)) setTimeout(() => (box.hidden = true), 250);
    });
    this.shadowRoot.addEventListener("keydown", (ev) => {
      if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches?.('[role="button"][data-action]')) {
        ev.preventDefault();
        ev.target.click();
        return;
      }
      if (!SUGGEST_FIELDS.has(ev.target.name)) return;
      const box = ev.target.closest(".suggest-field")?.querySelector(".suggest");
      if (!box || box.hidden) return;
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        box.hidden = true;
      } else if (ev.key === "Enter" && ev.target.name === "icon") {
        // Icons: Enter takes the best match. Categories: Enter keeps the typed text.
        const first = box.querySelector("[data-value]");
        if (first) {
          ev.preventDefault();
          this._pickSuggestion(ev.target, first.dataset.value);
        }
      } else if (ev.key === "Enter") {
        box.hidden = true;
      }
    });
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    const language = hass?.locale?.language || hass?.language || "de";
    setLanguage(language);
    setDateLocale(LANG === "de" ? "de-DE" : language);
    if (first) this._reload();
    else this._updateMenuButton();
  }

  get hass() {
    return this._hass;
  }

  set narrow(value) {
    this._narrow = value;
    this._updateMenuButton();
  }

  set panel(value) {
    this._panel = value;
  }

  // ------------------------------------------------------------------ data

  _ws(type, payload = {}) {
    return this._hass.callWS({ type: `haushaltsbuch/${type}`, ...payload });
  }

  async _reload() {
    try {
      this._state = await this._ws("state");
      if (this._scope !== "me" && !this._state.households.some((h) => h.id === this._scope)) this._scope = "me";
      await this._loadView();
      this._error = null;
    } catch (err) {
      this._error = this._errorText(err);
    }
    this._loaded = true;
    this._render();
  }

  async _loadView() {
    const scope = this._scope;
    const t = today();
    if (this._view === "timeline") {
      const [ahead, past] = await Promise.all([
        this._ws("forecast", { scope, start: iso(t), end: iso(addDays(t, this._range)) }),
        this._ws("forecast", { scope, start: iso(addDays(t, -21)), end: iso(addDays(t, -1)) }),
      ]);
      this._forecast = ahead;
      this._pending = past.days.flatMap((d) => d.entries).filter((e) => e.status === null);
    } else if (this._view === "calendar") {
      const first = new Date(this._month.getFullYear(), this._month.getMonth(), 1);
      const last = new Date(this._month.getFullYear(), this._month.getMonth() + 1, 0);
      this._calendar = await this._ws("forecast", { scope, start: iso(first), end: iso(last) });
    } else if (this._view === "months") {
      this._summary = await this._ws("summary", { scope, months: 12 });
    } else if (this._view === "households" && this._state.user.is_admin) {
      this._backups = await this._ws("backup/list");
    } else if (this._view === "stats") {
      const [ledger, history] = await Promise.all([this._ws("ledger/rows"), this._ws("bank/history")]);
      this._ledger = ledger;
      this._bankHistory = history;
    } else if (this._view === "dashboard") {
      const [trend, summary] = await Promise.all([
        this._ws("forecast", { scope, start: iso(t), end: iso(addDays(t, 90)) }),
        this._ws("summary", { scope, months: 12 }),
      ]);
      this._trend = trend;
      this._summary = summary;
    }
  }

  async _run(action) {
    try {
      await action();
      this._dialog = null;
      await this._reload();
    } catch (err) {
      this._error = this._errorText(err);
      this._render();
    }
  }

  /** Readable error text in the panel language. */
  _errorText(err) {
    const detail = err?.message || String(err);
    if (err?.code === "unauthorized") return tr(`Kein Zugriff: ${detail}`, `Access denied: ${detail}`);
    if (err?.code === "invalid_format") return tr(`Ungültiger Wert: ${detail}`, `Invalid value: ${detail}`);
    if (err?.code === "not_loaded") return tr("Haushaltsbuch ist nicht geladen.", "Household Budget is not loaded.");
    return detail;
  }

  // -------------------------------------------------------------- formatting

  /** Locale for numbers, following the number format in the user's HA profile. */
  _numberLocale() {
    const loc = this._hass?.locale || {};
    switch (loc.number_format) {
      case "comma_decimal":
      case "none":
        return "en-US";
      case "decimal_comma":
        return "de-DE";
      case "space_comma":
        return "fr-FR";
      case "system":
        return navigator.language || "de-DE";
      default:
        return loc.language || this._hass?.language || navigator.language || "de-DE";
    }
  }

  _decimalSeparator() {
    try {
      return new Intl.NumberFormat(this._numberLocale()).formatToParts(1.5).find((p) => p.type === "decimal")?.value || ",";
    } catch (err) {
      return ",";
    }
  }

  /** Value for an amount input field, written with the user's decimal separator. */
  _amountValue(value) {
    if (value === null || value === undefined || value === "") return "";
    const n = parseAmount(value, ".");
    if (!Number.isFinite(n)) return esc(value);
    const rounded = Math.round(n * 100) / 100;
    return (Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)).replace(".", this._decimalSeparator());
  }

  /** Number from an amount field; empty or invalid input gives `empty`. */
  _parsedAmount(value, empty = "") {
    const n = parseAmount(value, this._decimalSeparator());
    return Number.isFinite(n) ? n : empty;
  }

  /** Attributes for a text field that takes an amount. */
  _amountAttrs(allowNegative = false) {
    const example = `12${this._decimalSeparator()}99`;
    return `type="text" inputmode="decimal" autocomplete="off" data-amount pattern="${allowNegative ? "-?" : ""}[0-9][0-9., ]*" title="${tr("Betrag, z.B.", "Amount, e.g.")} ${example}" placeholder="0${this._decimalSeparator()}00"`;
  }

  _moneyPlain(value) {
    const currency = this._state?.currency || "EUR";
    return `<span class="money">${new Intl.NumberFormat(this._numberLocale(), { style: "currency", currency }).format(value)}</span>`;
  }

  _money(value, signed = false) {
    const currency = this._state?.currency || "EUR";
    const text = new Intl.NumberFormat(this._numberLocale(), { style: "currency", currency }).format(Math.abs(value));
    const sign = value < 0 ? "−" : signed ? "+" : "";
    return `<span class="money">${sign}${text}</span>`;
  }

  _dateLabel(isoDate) {
    const d = parseIso(isoDate);
    const diff = Math.round((d - today()) / 86400000);
    const wd = weekdayName((d.getDay() + 6) % 7);
    const base = LANG === "de" ? `${wd}, ${d.getDate()}. ${monthName(d.getMonth())}` : `${wd}, ${monthName(d.getMonth())} ${d.getDate()}`;
    if (diff === 0) return `${tr("Heute", "Today")} · ${base}`;
    if (diff === 1) return `${tr("Morgen", "Tomorrow")} · ${base}`;
    return base;
  }

  _icon(icon, size = 24) {
    if (!icon) return `<span class="icon-fallback" style="--size:${size}px"></span>`;
    if (icon.startsWith("mdi:") || icon.includes(":")) return `<ha-icon icon="${esc(icon)}" style="--mdc-icon-size:${size}px"></ha-icon>`;
    return `<span class="emoji" style="font-size:${size - 4}px">${esc(icon)}</span>`;
  }

  _chip(certainty) {
    const c = CERTAINTY[certainty] || CERTAINTY.unsicher;
    return `<span class="chip" style="--chip:${c.color}">${c[LANG]}</span>`;
  }

  _templates() {
    return (LANG === "de" ? this._state.templates : this._state.templates_en) || this._state.templates || [];
  }

  _isHousehold() {
    return this._scope !== "me";
  }

  _applySearch() {
    const q = (this._search || "").trim().toLowerCase();
    for (const group of this.shadowRoot.querySelectorAll(".item-group")) {
      let visible = 0;
      for (const row of group.querySelectorAll(".entry")) {
        const hit = !q || row.dataset.search.includes(q);
        row.hidden = !hit;
        if (hit) visible++;
      }
      group.hidden = visible === 0;
    }
  }

  // Item object when the booking belongs to a special (not monthly) item, else null.
  _specialOf(e) {
    const item = this._state.items.find((i) => i.id === e.item_id);
    return this._isSpecial(item, e.amount) ? item : null;
  }

  // Whether a booking counts as special under the user's settings.
  _isSpecial(item, amount) {
    if (!item || isRegular(item)) return false;
    const st = this._state.user.settings || {};
    const minMonths = st.special_min_months ?? 2;
    const minAmount = st.special_min_amount ?? 0;
    const months = intervalMonths(item);
    if (minMonths >= 999 ? months !== Infinity : months < minMonths) return false;
    return Math.abs(amount ?? item.current_amount ?? item.amount) >= minAmount;
  }

  // The income the user's months start with (payday to payday), if it is in view.
  _salaryItem() {
    const id = this._state.user.settings?.salary_item_id;
    return id ? this._scopeItems().find((i) => i.id === id) || null : null;
  }

  _scopeItems() {
    return this._state.items.filter((i) => (this._isHousehold() ? i.household_id === this._scope : i.owner === this._state.user.id));
  }

  _scopeBalance() {
    if (!this._state) return {};
    if (this._scope === "me") return this._state.user;
    return this._state.households.find((h) => h.id === this._scope) || {};
  }

  // ---------------------------------------------------------------- render

  _render() {
    const s = this._state;
    this._helpTip = null;
    this._helpFor = null;
    this.classList.toggle("incognito", !!this._incognito);
    this.classList.toggle("dark", !!this._hass?.themes?.darkMode);
    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      <div class="toolbar">
        <ha-menu-button></ha-menu-button>
        <div class="title">${tr("Haushaltsbuch", `<span class="title-long">Household Budget</span><span class="title-short">Budget</span>`)}</div>
        ${s ? `<button class="incognito-toggle ${this._incognito ? "on" : ""}" data-action="incognito" title="${this._incognito ? tr("Beträge wieder zeigen", "Show amounts again") : tr("Inkognito: Beträge verbergen", "Incognito: hide amounts")}" aria-pressed="${this._incognito}">${this._icon(this._incognito ? "mdi:eye-off" : "mdi:eye", 22)}</button>` : ""}
        ${s ? this._renderScopeSelect() : ""}
      </div>
      ${s ? this._renderTabs() : ""}
      <div class="content">
        ${this._error ? `<div class="error">${esc(this._error)}</div>` : ""}
        ${!this._loaded ? `<div class="empty">${tr("Lade …", "Loading …")}</div>` : s ? this._renderView() : ""}
      </div>
      ${this._dialog ? this._renderDialog() : ""}
    `;
    this._updateMenuButton();
    if (this._search && this._view === "items") this._applySearch();
  }

  _updateMenuButton() {
    const button = this.shadowRoot.querySelector("ha-menu-button");
    if (button) {
      button.hass = this._hass;
      button.narrow = this._narrow;
    }
  }

  _renderScopeSelect() {
    const options = [{ id: "me", name: tr("Meine Posten", "My entries") }, ...this._state.households.map((h) => ({ id: h.id, name: `${tr("Haushalt", "Household")}: ${h.name}` }))];
    return `<select class="scope" data-change="scope" aria-label="${tr("Ansicht", "View")}">
      ${options.map((o) => `<option value="${esc(o.id)}" ${o.id === this._scope ? "selected" : ""}>${esc(o.name)}</option>`).join("")}
    </select>`;
  }

  _renderTabs() {
    const tabs = [
      ["timeline", tr("Zeitleiste", "Timeline"), "mdi:timeline-clock-outline"],
      ["calendar", tr("Kalender", "Calendar"), "mdi:calendar-month"],
      ["items", tr("Posten", "Entries"), "mdi:format-list-bulleted"],
      ["months", tr("Monate", "Months"), "mdi:chart-bar"],
      ["dashboard", tr("Übersicht", "Overview"), "mdi:view-dashboard-outline"],
      ["stats", tr("Statistik", "Statistics"), "mdi:chart-box-outline"],
      ["households", tr("Haushalt", "Household"), "mdi:home-account"],
    ];
    return `<nav class="tabs">${tabs
      .map(([key, label, icon]) => `<button class="tab ${this._view === key ? "active" : ""}" data-action="view" data-view="${key}">${this._icon(icon, 20)}<span>${label}</span></button>`)
      .join("")}</nav>`;
  }

  _renderView() {
    switch (this._view) {
      case "calendar":
        return this._renderBalanceCard() + this._renderCalendar();
      case "items":
        return this._renderItems();
      case "months":
        return this._renderMonths();
      case "dashboard":
        return this._renderDashboard();
      case "stats":
        return this._renderStats();
      case "households":
        return this._renderHouseholds();
      default:
        return this._renderBalanceCard() + this._renderTimeline();
    }
  }

// ------------------------------------------------------------ statistics

  // ---------------------------------------------------------------- dialogs

  _renderDialog() {
    const d = this._dialog;
    let body = "";
    if (d.type === "item") body = this._renderItemForm(d);
    if (d.type === "balance") body = this._renderBalanceForm();
    if (d.type === "confirm") body = this._renderConfirmForm(d);
    if (d.type === "household") body = this._renderHouseholdForm(d);
    if (d.type === "import") body = this._renderImportForm(d);
    if (d.type === "csv") body = this._renderCsvForm(d);
    if (d.type === "notice") body = this._renderNotice(d);
    if (d.type === "spending") body = this._renderSpendingForm(d);
    if (d.type === "assign") body = this._renderAssignForm(d);
    if (d.type === "csv-map") body = this._renderColumnForm(d);
    return `<div class="overlay" data-action="close-overlay"><div class="dialog" role="dialog" aria-modal="true">${body}</div></div>`;
  }

  _toggleIncognito() {
    this._incognito = !this._incognito;
    try {
      localStorage.setItem(INCOGNITO_KEY, this._incognito ? "1" : "0");
    } catch (err) {
      // Storage blocked: the mode still works until the page is reloaded.
    }
    this._render();
  }
}

// The views, dialogs and event handlers live in their own files as classes; their
// methods become methods of the panel. A name used twice is an error, not an override.
for (const part of [StatsView, TimelineView, Budgets, ItemsView, DashboardView, HouseholdsView, ItemDialog, ImportDialog, Events]) {
  for (const name of Object.getOwnPropertyNames(part.prototype)) {
    if (name === "constructor") continue;
    if (Object.prototype.hasOwnProperty.call(HaushaltsbuchPanel.prototype, name)) throw new Error(`Haushaltsbuch: ${name} is defined twice`);
    Object.defineProperty(HaushaltsbuchPanel.prototype, name, Object.getOwnPropertyDescriptor(part.prototype, name));
  }
}

customElements.define("haushaltsbuch-panel", HaushaltsbuchPanel);
