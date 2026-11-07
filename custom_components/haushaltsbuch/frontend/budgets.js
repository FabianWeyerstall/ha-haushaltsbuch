/* Haushaltsbuch panel – Budgets: monthly budgets with real spendings, budget card and bars, spending form.
 * Methods of the panel element, added to it in haushaltsbuch-panel.js. Plain ES module.
 */
import { tr, shortDay, esc, iso, today } from "./format.js";

export class Budgets {
  // Budget money taken off the balance between two listed days, keyed by the
  // listed day, so every change of the balance is visible as a row.
  _budgetGaps(allDays, shown, balanceDate) {
    const listed = new Set(shown.map((d) => d.date));
    const gaps = {};
    let sum = 0, n = 0, from = null;
    for (const d of allDays) {
      if (d.budget && d.balance_likely !== null && (!balanceDate || d.date > balanceDate)) {
        sum += d.budget;
        n += 1;
        from ??= d.date;
      }
      if (listed.has(d.date)) {
        if (Math.abs(sum) >= 0.005) gaps[d.date] = { sum, n, from, to: d.date };
        sum = 0; n = 0; from = null;
      }
    }
    return gaps;
  }

  _renderBudgetRow(g) {
    if (!g) return "";
    const budgets = this._scopeItems().filter((i) => i.schedule?.frequency === "budget" && i.start_date <= g.to && (!i.end_date || i.end_date >= g.from));
    const names = budgets.map((i) => i.name).join(", ");
    const span = g.n === 1 ? tr("1 Tag", "1 day") : tr(`${g.n} Tage, ${shortDay(g.from)}–${shortDay(g.to)}`, `${g.n} days, ${shortDay(g.from)}–${shortDay(g.to)}`);
    const one = budgets.length === 1 ? budgets[0] : null;
    return `<div class="entry budget-row" ${one ? `data-action="edit-item" data-item="${esc(one.id)}"` : ""}>
      <div class="entry-icon">${this._icon(one?.icon || "mdi:wallet-outline")}</div>
      <div class="entry-main">
        <div class="entry-name">${tr("Budget", "Budget")}${names ? `: ${esc(names)}` : ""}</div>
        <div class="entry-meta">${span} <span class="chip budget">Budget</span>${this._help(tr("Budgets wie Lebensmittel haben keine festen Termine. Die App zieht jeden Tag ein Stück vom erwarteten Kontostand ab: Was vom Budget noch übrig ist, verteilt auf die restlichen Tage des Monats. Trägst du Ausgaben ein, zählen für vergangene Tage die echten Beträge. Hier steht, wie viel seit dem letzten Tag in der Liste abgezogen wurde.", "Budgets such as groceries have no fixed dates. The app takes a little off the expected balance every day: what is left of the budget, spread over the remaining days of the month. Once you enter spendings, past days count the real amounts. This row shows how much was taken off since the previous day in the list."))}</div>
      </div>
      <div class="entry-amount ${g.sum < 0 ? "neg" : "pos"}">${this._money(g.sum, true)}</div>
    </div>`;
  }

  /** Budgets of the current scope that are running this month. */
  _budgets() {
    const t = iso(today());
    const active = (i) => i.start_date <= t && (!i.end_date || i.end_date >= t);
    return this._scopeItems()
      .filter((i) => i.schedule?.frequency === "budget" && i.direction === "expense" && i.budget_status && (active(i) || i.budget_status.spent > 0))
      .sort((a, b) => b.budget_status.budget - a.budget_status.budget);
  }

  _renderBudgetCard() {
    const budgets = this._budgets();
    if (!budgets.length) return "";
    const s0 = budgets[0].budget_status;
    const period = this._salaryItem() ? ` <small class="period">${shortDay(s0.start)}–${shortDay(s0.end)}</small>` : "";
    return `<div class="card budgets">
      <div class="row-between">
        <h3>${tr("Budgets diesen Monat", "Budgets this month")}${period}${this._help(tr("Trag hier ein, was du wirklich ausgibst. Der Balken zeigt, wie viel vom Budget weg ist, der Strich, wie viel bis heute gleichmäßig verteilt dran wäre. Orange heißt: schneller ausgegeben als geplant. Rot heißt: Budget überzogen. Was am Monatsende übrig ist, verfällt, der neue Monat startet wieder mit dem vollen Budget. Ein Budget mit 0 € ist ein Sammeltopf, z.B. für Ungeplantes: Dort zählt nur, was du einträgst.", "Enter what you really spend. The bar shows how much of the budget is gone, the line how much would be due by today if spread evenly. Orange means faster than planned, red means over budget. Whatever is left at the end of the month expires; the next month starts with the full budget again. A budget of 0 is a pot, e.g. for unplanned purchases: only what you enter counts."))}</h3>
        <button class="small" data-action="spending-new">+ ${tr("Ausgabe", "Spending")}</button>
      </div>
      ${budgets.map((i) => this._renderBudgetBar(i)).join("")}
    </div>`;
  }

  _renderBudgetBar(i, { list = true } = {}) {
    const s = i.budget_status;
    // A budget of 0 is a pot for unplanned spending: only entries count.
    const pot = s.budget < 0.005;
    const over = !pot && s.rest < -0.005;
    const ahead = !over && s.spent > s.planned_by_today + 0.005;
    const pct = s.budget > 0 ? Math.min(100, (s.spent / s.budget) * 100) : 100;
    const mark = s.budget > 0 ? Math.min(100, (s.planned_by_today / s.budget) * 100) : 0;
    const open = list && this._budgetOpen === i.id;
    const sub = pot
      ? tr("ohne festen Betrag, es zählt nur, was du einträgst", "no fixed amount, only what you enter counts")
      : over
      ? tr(`${this._money(-s.rest)} drüber`, `${this._money(-s.rest)} over`)
      : s.days_left > 1
        ? tr(`noch ${this._money(s.rest)} für ${s.days_left} Tage, etwa ${this._money(s.rest / s.days_left)} am Tag`, `${this._money(s.rest)} left for ${s.days_left} days, about ${this._money(s.rest / s.days_left)} a day`)
        : tr(`noch ${this._money(s.rest)}`, `${this._money(s.rest)} left`);
    const users = Object.fromEntries((this._state.users || []).map((u) => [u.id, u.name]));
    const rows = s.spendings.length
      ? s.spendings
          .map(
            (x) => `<div class="spending" data-action="spending-edit" data-item="${esc(i.id)}" data-id="${esc(x.id)}">
              <span class="spending-date">${shortDay(x.date)}</span>
              <span class="spending-note">${esc(x.note || tr("Ausgabe", "Spending"))}${this._isHousehold() && users[x.by] ? ` <span class="owner">${esc(users[x.by])}</span>` : ""}</span>
              <span class="spending-amount neg">${this._money(-x.amount)}</span>
              <button class="icon-button small-x" data-action="spending-delete" data-item="${esc(i.id)}" data-id="${esc(x.id)}" aria-label="${tr("Ausgabe löschen", "Delete spending")}">✕</button>
            </div>`
          )
          .join("")
      : `<p class="hint">${tr("Noch nichts eingetragen. Bis dahin rechnet die App mit dem vollen Budget, gleichmäßig verteilt.", "Nothing entered yet. Until then the app counts the full budget, spread evenly.")}</p>`;
    return `<div class="budget-block">
      <div class="budget-line" ${list ? `data-action="budget-toggle" data-item="${esc(i.id)}" aria-expanded="${open}"` : ""}>
        <div class="entry-icon">${this._icon(i.icon || "mdi:wallet-outline")}</div>
        <div class="budget-main">
          <div class="budget-head"><span class="entry-name">${esc(i.name)}</span><span class="budget-figures">${pot ? `${this._money(s.spent)} ${tr("ausgegeben", "spent")}` : `${this._money(s.spent)} ${tr("von", "of")} ${this._money(s.budget)}`}</span></div>
          ${pot ? "" : `<div class="budget-bar ${over ? "over" : ahead ? "ahead" : ""}"><span style="width:${pct}%"></span><i style="left:${mark}%"></i></div>`}
          <div class="budget-sub ${over ? "neg" : ""}">${sub}${list ? ` · ${s.spendings.length === 1 ? tr("1 Eintrag", "1 entry") : tr(`${s.spendings.length} Einträge`, `${s.spendings.length} entries`)} <span class="chev">${open ? "▴" : "▾"}</span>` : ""}</div>
        </div>
      </div>
      ${open ? `<div class="spendings">${s.spendings.length ? `<p class="hint">${tr("Antippen zum Ändern.", "Tap to edit.")}</p>` : ""}${rows}<button class="secondary small" data-action="spending-new" data-item="${esc(i.id)}">+ ${tr(`Ausgabe für ${esc(i.name)}`, `Spending for ${esc(i.name)}`)}</button></div>` : ""}
    </div>`;
  }

  _renderSpendingForm(d) {
    const budgets = this._budgets();
    const chosen = budgets.find((i) => i.id === d.item_id) || budgets[0];
    const x = d.spending || {};
    return `<form data-form="spending">
      <h2>${x.id ? tr("Ausgabe bearbeiten", "Edit spending") : tr("Ausgabe erfassen", "Add spending")}</h2>
      <div class="grid">
        ${budgets.length > 1
          ? `<label class="full">${tr("Budget", "Budget")}<select name="item_id">${budgets.map((i) => `<option value="${esc(i.id)}" ${i.id === chosen.id ? "selected" : ""}>${esc(i.name)}</option>`).join("")}</select></label>`
          : `<input type="hidden" name="item_id" value="${esc(chosen?.id || "")}"><p class="hint full">${tr("Budget", "Budget")}: <b>${esc(chosen?.name || "")}</b></p>`}
        <label>${tr("Betrag", "Amount")} (${esc(this._state.currency)})<input name="amount" ${this._amountAttrs()} required ${x.id ? `value="${this._amountValue(x.amount)}"` : "autofocus"}></label>
        <label>${tr("Datum", "Date")}<input name="date" type="date" required value="${esc(x.date || iso(today()))}"></label>
        <label class="full">${tr("Notiz", "Note")}<input name="note" maxlength="200" placeholder="${tr("z.B. Wocheneinkauf", "e.g. weekly shop")}" value="${esc(x.note || "")}"></label>
      </div>
      <p class="hint">${tr("Vergessen einzutragen? Stell einfach das Datum zurück. Die Ausgabe zählt in dem Monat, in dem das Datum liegt.", "Forgot to enter something? Just set the date back. The spending counts in the month its date falls in.")}</p>
      ${this._error ? `<div class="error">${esc(this._error)}</div>` : ""}
      <div class="dialog-actions">${x.id ? `<button type="button" class="danger" data-action="spending-delete" data-item="${esc(d.item_id)}" data-id="${esc(x.id)}">${tr("Löschen", "Delete")}</button>` : "<span></span>"}<div>
        <button type="button" class="secondary" data-action="close">${tr("Abbrechen", "Cancel")}</button>
        <button type="submit">${tr("Speichern", "Save")}</button>
      </div></div>
    </form>`;
  }
}
