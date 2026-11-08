/* Haushaltsbuch panel – Tabs „Posten“ and „Monate“: list of entries, month overview, special items, category totals.
 * Methods of the panel element, added to it in haushaltsbuch-panel.js. Plain ES module.
 */
import { tr, fmtDate, monthName, shortDay, shortDate, esc, iso, today } from "./format.js";
import { SPECIAL_OPTIONS, scheduleLabel, monthlyEquivalent } from "./schedule.js";

export class ItemsView {
  _renderItems() {
    const items = this._scopeItems();
    const groups = {};
    for (const item of items) (groups[item.category] ||= []).push(item);
    const monthlyIn = items.filter((i) => i.direction === "income").reduce((a, i) => a + monthlyEquivalent(i), 0);
    const monthlyOut = items.filter((i) => i.direction === "expense").reduce((a, i) => a + monthlyEquivalent(i), 0);
    // Budgets (groceries, fuel …) are where saving is possible; everything else is fixed.
    const monthlyBudgets = items.filter((i) => i.direction === "expense" && i.schedule?.frequency === "budget").reduce((a, i) => a + monthlyEquivalent(i), 0);
    const monthlyFixed = monthlyOut - monthlyBudgets;
    const households = Object.fromEntries(this._state.households.map((h) => [h.id, h.name]));
    return `<div class="card">
      <div class="row-between">
        <h3>${this._isHousehold() ? tr("Posten im Haushalt", "Household entries") : tr("Meine Posten", "My entries")}</h3>
        <button data-action="new-item">+ ${tr("Neuer Posten", "New entry")}</button>
      </div>
      <div class="totals four">
        <div><div class="label">${tr("Einnahmen pro Monat", "Income per month")}</div><div class="big pos">${this._money(monthlyIn)}</div></div>
        <div><div class="label">${tr("Ausgaben pro Monat", "Expenses per month")}</div><div class="big neg">${this._money(monthlyOut)}</div>${monthlyBudgets ? `<div class="sub">${tr(`davon Budgets ${this._money(monthlyBudgets)}`, `of which budgets ${this._money(monthlyBudgets)}`)}</div>` : ""}</div>
        <div><div class="label">${tr("Ohne Budgets", "Without budgets")}</div><div class="big neg">${this._money(monthlyFixed)}</div><div class="sub">${tr("feste Kosten, kaum beeinflussbar", "fixed costs, hard to change")}</div></div>
        <div><div class="label">${tr("Ausgaben pro Jahr", "Expenses per year")}</div><div class="big">${this._money(monthlyOut * 12)}</div></div>
      </div>
      <p class="hint">${tr("Wiederkehrende Posten auf einen Monat umgerechnet, einmalige Posten zählen hier nicht mit. „Ohne Budgets“ sind die festen Kosten; bei den Budgets (z. B. Lebensmittel, Tanken) kannst du am ehesten sparen.", "Recurring entries converted to one month; one-off entries are not included here. “Without budgets” are the fixed costs; budgets (e.g. groceries, fuel) are where saving is easiest.")}</p>
      ${this._isHousehold() ? "" : `<p class="hint">${tr("Importieren nimmt eine Export-Datei des Haushaltsbuchs oder eine CSV mit Umsätzen aus deiner Banking-App. Aus der CSV schlägt das Haushaltsbuch wiederkehrende Abbuchungen vor.", "Import takes a Household Budget export file or a CSV of transactions from your banking app. From a CSV, recurring payments are suggested.")}</p>`}
      ${this._isHousehold() ? "" : `<div class="row-actions">
        <button class="secondary small" data-action="export">${tr("Exportieren", "Export")}</button>
        <button class="secondary small" data-action="import">${tr("Importieren", "Import")}</button>
        <input type="file" accept=".json,.csv,.txt,.xml,.zip,application/json,text/csv,application/xml,text/xml,application/zip" data-change="import-file" multiple hidden>
      </div>`}
      ${items.length > 5 ? `<input class="search" type="search" name="item-search" placeholder="${tr("Posten suchen …", "Search entries …")}" aria-label="${tr("Posten suchen", "Search entries")}" value="${esc(this._search || "")}">` : ""}
    </div>
    ${items.length ? Object.keys(groups)
      .sort()
      .map(
        (cat) => `<div class="card item-group"><h3>${esc(cat)}</h3>${groups[cat]
          .map(
            (i) => `<div class="entry" data-action="edit-item" data-item="${esc(i.id)}" data-search="${esc(`${i.name} ${i.category} ${i.note || ""}`.toLowerCase())}">
              <div class="entry-icon">${this._icon(i.icon)}</div>
              <div class="entry-main">
                <div class="entry-name">${esc(i.name)}</div>
                <div class="entry-meta">${esc(scheduleLabel(i))} · ${tr("ab", "from")} ${fmtDate(i.start_date)}${i.end_date ? ` ${tr("bis", "until")} ${fmtDate(i.end_date)}` : ""}
                  ${i.household_id && !this._isHousehold() ? `<span class="chip shared">${esc(households[i.household_id] || tr("Haushalt", "Household"))}</span>` : ""}
                  ${!i.editable ? `<span class="owner">${esc(i.owner_name)}</span>` : ""}
                  ${i.contract_info && !i.contract_info.ended ? `<span class="chip contract ${i.contract_info.days_left <= 30 ? "urgent" : ""}">${tr("kündbar bis", "cancel by")} ${shortDate(i.contract_info.cancel_by)}</span>` : ""}
                  ${i.contract_info?.ended ? `<span class="chip skipped">${tr("Vertrag beendet", "contract ended")}</span>` : ""}</div>
              </div>
              <div class="entry-amount ${i.direction === "expense" ? "neg" : "pos"}">${this._money(i.direction === "expense" ? -(i.current_amount ?? i.amount) : i.current_amount ?? i.amount, true)}${(i.price_changes || []).some((c) => c.from > iso(today())) ? `<small class="price-note">${tr("ab", "from")} ${shortDate(i.price_changes.find((c) => c.from > iso(today())).from)}: ${this._money(i.price_changes.find((c) => c.from > iso(today())).amount)}</small>` : ""}</div>
            </div>`
          )
          .join("")}</div>`
      )
      .join("") : `<div class="card empty">${tr("Noch keine Posten. Tippe auf „Neuer Posten“ und wähle eine Vorlage wie GEZ, Gehalt oder Räderwechsel.", "No entries yet. Tap “New entry” and pick a template such as salary, rent or tyre change.")}</div>`}`;
  }

  _renderMonths() {
    const rows = this._summary || [];
    const salary = this._salaryItem();
    const itemsById = Object.fromEntries(this._state.items.map((i) => [i.id, i]));
    const max = Math.max(1, ...rows.map((r) => Math.max(r.income + r.uncertain_income, r.expense + r.uncertain_expense)));
    const barLine = (sure, unsure, cls) => {
      const label = [sure ? this._money(sure) : "", unsure ? `+ ${this._money(unsure)} ${tr("unsicher", "uncertain")}` : ""].filter(Boolean).join(" ");
      return `<div class="bar-line"><span class="bar ${cls}" style="width:${(sure / max) * 100}%"></span><span class="bar ${cls} light" style="width:${(unsure / max) * 100}%"></span>${label ? `<span class="bar-value">${label}</span>` : ""}</div>`;
    };
    return `<div class="card">
      <h3>${tr("Monatsübersicht", "Monthly overview")}</h3>
      <p class="hint">${tr("Der Plan pro Monat: alle Posten und Budgets, auch was noch kommt. Echte Umsätze aus der Bank zeigt die Statistik. Sichere und wahrscheinliche Posten als volle Balken, unsichere als heller Zusatz. Tippe auf einen Monat für die einzelnen Buchungen.", "The plan per month: all entries and budgets, including what is still to come. Real bank transactions are in Statistics. Certain and likely entries as solid bars, uncertain ones as a lighter extra. Tap a month to see its bookings.")}</p>
      ${salary ? `<p class="hint">${tr(`Deine Monate laufen von Gehalt zu Gehalt (<b>${esc(salary.name)}</b>). Ein Gehalt Ende Oktober zählt also zum November. Ändern kannst du das im Posten selbst.`, `Your months run from payday to payday (<b>${esc(salary.name)}</b>), so a salary at the end of October counts for November. You can change this in the entry itself.`)}</p>` : `<p class="hint">${tr("Tipp: Kommt dein Gehalt am Monatsende? Öffne den Gehalts-Posten und setze „Mein Monat beginnt mit dieser Einnahme“. Dann laufen die Monate von Gehalt zu Gehalt.", "Tip: Is your salary paid at the end of the month? Open the salary entry and tick “My month starts with this income”. Months then run from payday to payday.")}</p>`}
      ${this._renderSpecialSettings()}
      <div class="months">
        ${rows
          .map((r) => {
            const [y, m] = r.month.split("-").map(Number);
            const open = this._openMonth === r.month;
            const entries = r.entries || [];
            const special = entries.filter((e) => this._isSpecial(itemsById[e.item_id], e.amount));
            const regular = entries.filter((e) => !this._isSpecial(itemsById[e.item_id], e.amount));
            const specialSum = special.reduce((a, e) => a + e.amount, 0);
            const entryRow = (e) => `<div class="pending-date">${this._dateLabel(e.date)}</div>${this._renderEntry({ owner_name: "", ...e }, { special: this._isSpecial(itemsById[e.item_id], e.amount) && itemsById[e.item_id] })}`;
            return `<div class="month-block">
              <button class="month-row ${open ? "open" : ""}" data-action="toggle-month" data-month="${r.month}" aria-expanded="${open}">
                <div class="month-name">${monthName(m - 1).slice(0, 3)} ${String(y).slice(2)}${salary && r.start ? `<small title="${shortDay(r.start)}–${shortDay(r.end)}">${tr("ab", "from")} ${shortDay(r.start)}</small>` : ""}</div>
                <div class="bars">
                  ${barLine(r.income, r.uncertain_income, "pos-bg")}
                  ${barLine(r.expense, r.uncertain_expense, "neg-bg")}
                </div>
                <div class="month-net ${r.net < 0 ? "neg" : "pos"}">${this._money(r.net, true)}</div>
                ${special.length ? `<div class="month-specials">${special
                  .map((e) => `<span class="special-pill ${e.amount < 0 ? "" : "income"}">${this._icon(e.icon, 14)}<span>${esc(e.name)}</span><b>${this._money(e.amount, true)}</b></span>`)
                  .join("")}</div>` : ""}
              </button>
              ${open ? `<div class="month-entries">${entries.length ? `
                ${special.length ? `<div class="month-section special">★ ${tr("Sonderposten diesen Monat", "Special entries this month")} <b>${this._money(specialSum, true)}</b></div>${special.map(entryRow).join("")}` : ""}
                ${regular.length ? `<div class="month-section">${tr("Laufende Posten (jeden Monat)", "Regular entries (every month)")}</div>${regular.map(entryRow).join("")}` : ""}` : `<div class="empty">${tr("Keine Buchungen in diesem Monat.", "No bookings this month.")}</div>`}</div>` : ""}
            </div>`;
          })
          .join("")}
      </div>
    </div>
    ${this._renderCategoryTotals(rows)}`;
  }

  _renderSpecialSettings() {
    const st = this._state.user.settings || {};
    const minMonths = st.special_min_months ?? 2;
    return `<div class="special-settings">
      <span class="special-pill inline">★ ${tr("Sonderposten", "Special entries")}</span>
      <select data-change="special-months" aria-label="${tr("Sonderposten ab Turnus", "Special entries from interval")}">
        ${SPECIAL_OPTIONS.map(([v, de, en]) => `<option value="${v}" ${v === minMonths ? "selected" : ""}>${tr(de, en)}</option>`).join("")}
      </select>
      <label class="inline-amount">${tr("ab", "from")}<input type="number" min="0" step="1" inputmode="decimal" data-change="special-amount" value="${st.special_min_amount || 0}" aria-label="${tr("Sonderposten ab Betrag", "Special entries from amount")}"> ${esc(this._state.currency === "EUR" ? "€" : this._state.currency)}</label>
    </div>`;
  }

  _saveSpecialSettings(patch) {
    const st = { special_min_months: 2, special_min_amount: 0, ...(this._state.user.settings || {}), ...patch };
    this._state.user.settings = st;
    this._render();
    this._ws("settings", { settings: st }).catch((err) => {
      this._error = this._errorText(err);
      this._render();
    });
  }

  _renderCategoryTotals(rows) {
    const totals = {};
    for (const r of rows) {
      for (const e of r.entries || []) {
        if (e.amount >= 0 || e.certainty === "unsicher") continue;
        const t = (totals[e.category || tr("Sonstiges", "Other")] ||= { sum: 0, items: new Set() });
        t.sum += -e.amount;
        t.items.add(e.name);
      }
    }
    const list = Object.entries(totals).sort((a, b) => b[1].sum - a[1].sum);
    if (!list.length) return "";
    const total = list.reduce((a, [, t]) => a + t.sum, 0);
    const max = list[0][1].sum;
    return `<div class="card">
      <h3>${tr("Ausgaben nach Kategorie", "Expenses by category")}</h3>
      <p class="hint">${tr(
        `Durchschnitt pro Monat über die nächsten ${rows.length} Monate (sichere und wahrscheinliche Ausgaben, inklusive Budgets): <b>${this._money(total / rows.length)}</b> pro Monat, zusammen ${this._money(total)}. Klein darunter steht die Summe der ${rows.length} Monate.`,
        `Average per month over the next ${rows.length} months (certain and likely expenses, budgets included): <b>${this._money(total / rows.length)}</b> per month, ${this._money(total)} in total. The small figure is the sum over all ${rows.length} months.`
      )}</p>
      ${list
        .map(
          ([cat, t]) => `<div class="cat-row">
            <div class="cat-name">${esc(cat)}<small>${esc([...t.items].slice(0, 4).join(", "))}${t.items.size > 4 ? " …" : ""}</small></div>
            <div class="cat-bar"><span style="width:${(t.sum / max) * 100}%"></span></div>
            <div class="cat-sum">${this._money(t.sum / rows.length)}<small>${this._money(t.sum)} · ${Math.round((t.sum / total) * 100)} %</small></div>
          </div>`
        )
        .join("")}
    </div>`;
  }
}
